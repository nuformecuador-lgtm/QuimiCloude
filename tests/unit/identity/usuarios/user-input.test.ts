// QC-66 T8 — El BORDE de la administracion de usuarios: los tres esquemas de entrada y los dos
// tipos de salida (`design.md > 6.1`, `> 6.2`, `> 6.3`).
//
// Cubre R14, R18, R20, R31, R32.
//
// Lo que se vigila aqui no es solo lo que los esquemas ACEPTAN, sino lo que RECHAZAN: la mitad de
// los requisitos de esta ficha son campos que NO pueden entrar -la empresa (R14), cualquier
// contrasena (R15, R16), el estado de cuenta en el alta (R13), la marca de cambio de credencial y
// los tres contadores de QC-19 (R45)-. Por eso los esquemas son `strictObject`: con `object`, una
// clave desconocida se DESCARTA en silencio y el test quedaria verde mientras el llamante cree que
// mando una empresa. Aqui cada uno de esos campos hace FALLAR el `parse`.
//
// De los dos tipos de salida se afirman las claves EXACTAS, no solo que falten algunas (R31, R32):
// el `Record<keyof ...>` lo hace ademas un error de compilacion, asi que anadir `passwordHash` al
// tipo no puede pasar por aqui sin que algo se ponga rojo.
//
// Se importa por la ruta profunda de `domain/` y no por el contrato del modulo: quien reexporta
// desde `lib/modules/identity/index.ts` es T15, y este test no debe adelantarlo.

import { describe, expect, it } from 'vitest';

import { USER_ACCOUNT_STATUSES } from '@/lib/modules/identity/domain/account-status';
import { DOCUMENT_TYPE_CODES } from '@/lib/modules/identity/domain/document-type';
import {
  USER_DOCUMENT_NUMBER_MAX_LENGTH,
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_PHONE_MAX_LENGTH,
  USER_USERNAME_MAX_LENGTH,
  createUserSchema,
  setAccountStatusSchema,
  updateUserSchema,
} from '@/lib/modules/identity/domain/user-input';
import type { UserDetail, UserRow } from '@/lib/modules/identity/domain/user-view';

/** Entrada valida minima; cada caso cambia solo lo que quiere probar. */
const VALIDO = {
  firstNames: 'Ana Maria',
  lastNames: 'Restrepo Gomez',
  birthDate: '1990-04-17',
  email: 'ana.restrepo@quimicloude.test',
  phone: '3001112233',
  documentTypeCode: 'CC',
  documentNumber: '1020304050',
  username: 'arestrepo',
  roleId: '11111111-1111-4111-8111-111111111111',
};

/**
 * Los dos esquemas del usuario se prueban a la vez: la edicion es REEMPLAZO COMPLETO de los NUEVE
 * campos y no admite ni un campo mas que el alta (R19, R20). Si alguien los separa y afloja uno,
 * el bucle lo dice.
 */
const ESQUEMAS = [
  ['createUserSchema', createUserSchema],
  ['updateUserSchema', updateUserSchema],
] as const;

describe('esquemas de entrada de la administracion de usuarios (QC-66 T8)', () => {
  it('acepta la entrada valida con los nueve campos y recorta los extremos', () => {
    // R18, R19. El recorte se afirma sobre el resultado: `trim()` va ANTES de `min(1)`, asi que
    // lo que cruza el borde ya viene recortado.
    for (const [nombre, schema] of ESQUEMAS) {
      const parsed = schema.parse({
        ...VALIDO,
        firstNames: '  Ana Maria  ',
        lastNames: '  Restrepo Gomez  ',
        email: '  ana.restrepo@quimicloude.test  ',
        phone: '  3001112233  ',
        documentNumber: '  1020304050  ',
        username: '  arestrepo  ',
      });

      expect({ nombre, ...parsed }).toEqual({ nombre, ...VALIDO });
    }
  });

  it('rechaza la empresa, cualquier campo de contrasena, el estado de cuenta y los tres contadores', () => {
    // EL NUCLEO DE R14 y R20. Cada una de estas claves es un requisito:
    //   companyId               -> R14: la empresa sale DEL ACTOR y de ningun otro sitio.
    //   password/passwordHash   -> R15, R16: la credencial la genera el sistema; no entra ni sale.
    //   accountStatus           -> R13: la cuenta nace `pending`; moverlo es otra operacion.
    //   mustChangeCredential    -> R13: nace en verdadero, no lo elige el llamante.
    //   failedLoginAttempts     -> R45: los contadores de QC-19 no se tocan en esta ficha.
    //   lockLevel / lockedUntil -> R45: idem.
    //   accountStatusChangedBy  -> R25: el autor es el actor, no un dato de la entrada.
    //   deletedAt               -> R37, R39: el borrado es su propia operacion, no un campo.
    const PROHIBIDOS: Readonly<Record<string, unknown>> = {
      companyId: '22222222-2222-4222-8222-222222222222',
      password: 'Secreta-123',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      newPassword: 'Secreta-123',
      accountStatus: 'active',
      mustChangeCredential: false,
      failedLoginAttempts: 0,
      lockLevel: 0,
      lockedUntil: null,
      accountStatusChangedBy: '33333333-3333-4333-8333-333333333333',
      deletedAt: null,
      id: '44444444-4444-4444-8444-444444444444',
    };

    for (const [nombre, schema] of ESQUEMAS) {
      for (const [campo, valor] of Object.entries(PROHIBIDOS)) {
        expect(
          schema.safeParse({ ...VALIDO, [campo]: valor }).success,
          `${nombre} debe RECHAZAR ${campo}: con object en vez de strictObject se descartaria en silencio`,
        ).toBe(false);
      }
    }
  });

  it('no admite edicion parcial: falta un solo campo y cae', () => {
    // R19: reemplazo COMPLETO, no `PATCH` campo a campo. Cada campo ausente, uno a uno.
    for (const [nombre, schema] of ESQUEMAS) {
      for (const campo of Object.keys(VALIDO)) {
        const parcial: Record<string, unknown> = { ...VALIDO };
        delete parcial[campo];

        expect(schema.safeParse(parcial).success, `${nombre} sin ${campo} debe caer`).toBe(false);
      }
    }
  });

  it('rechaza los textos vacios y los de solo espacios', () => {
    // R18: `trim()` antes de `min(1)`, asi que una cadena de espacios no pasa por tener longitud.
    const CAMPOS_DE_TEXTO = [
      'firstNames',
      'lastNames',
      'email',
      'phone',
      'documentNumber',
      'username',
    ] as const;

    for (const [nombre, schema] of ESQUEMAS) {
      for (const campo of CAMPOS_DE_TEXTO) {
        for (const valor of ['', '   ', '\t\n ']) {
          expect(
            schema.safeParse({ ...VALIDO, [campo]: valor }).success,
            `${nombre}: ${campo} = ${JSON.stringify(valor)} debe caer`,
          ).toBe(false);
        }
      }
    }
  });

  it('rechaza cada texto en su frontera exacta de largo maximo', () => {
    // R18 y R43: los largos son de la validacion de APLICACION -la base los tiene como `TEXT` y no
    // se le anade ninguna restriccion-. Se prueba la frontera: el maximo pasa y el maximo + 1 cae.
    // Un test con «1000 caracteres» seguiria verde si alguien cambiara 80 por 999.
    const CASOS = [
      ['firstNames', USER_NAME_MAX_LENGTH],
      ['lastNames', USER_NAME_MAX_LENGTH],
      ['email', USER_EMAIL_MAX_LENGTH],
      ['phone', USER_PHONE_MAX_LENGTH],
      ['documentNumber', USER_DOCUMENT_NUMBER_MAX_LENGTH],
      ['username', USER_USERNAME_MAX_LENGTH],
    ] as const;

    expect([
      USER_NAME_MAX_LENGTH,
      USER_EMAIL_MAX_LENGTH,
      USER_PHONE_MAX_LENGTH,
      USER_DOCUMENT_NUMBER_MAX_LENGTH,
      USER_USERNAME_MAX_LENGTH,
    ]).toEqual([80, 160, 40, 40, 60]);

    for (const [nombre, schema] of ESQUEMAS) {
      for (const [campo, maximo] of CASOS) {
        expect(
          schema.safeParse({ ...VALIDO, [campo]: 'a'.repeat(maximo) }).success,
          `${nombre}: ${campo} de largo ${maximo} debe pasar`,
        ).toBe(true);
        expect(
          schema.safeParse({ ...VALIDO, [campo]: 'a'.repeat(maximo + 1) }).success,
          `${nombre}: ${campo} de largo ${maximo + 1} debe caer`,
        ).toBe(false);
      }
    }
  });

  it('exige la fecha de nacimiento en YYYY-MM-DD, sin hora y sin fechas imposibles', () => {
    // R18. La columna es `@db.Date`: un instante con hora no es lo que se guarda.
    for (const [nombre, schema] of ESQUEMAS) {
      expect(schema.safeParse({ ...VALIDO, birthDate: '1990-04-17' }).success).toBe(true);

      for (const valor of [
        '17/04/1990',
        '1990-4-17',
        '1990-13-01',
        '1990-02-30',
        '1990-04-17T00:00:00Z',
        '',
        'ayer',
      ]) {
        expect(
          schema.safeParse({ ...VALIDO, birthDate: valor }).success,
          `${nombre}: birthDate = ${JSON.stringify(valor)} debe caer`,
        ).toBe(false);
      }
    }
  });

  it('exige un tipo de documento del conjunto cerrado y un rol con forma de uuid', () => {
    // R18. El conjunto sale de `DOCUMENT_TYPE_CODES` (QC-4), importado: el literal no se copia.
    for (const [nombre, schema] of ESQUEMAS) {
      for (const codigo of DOCUMENT_TYPE_CODES) {
        expect(schema.safeParse({ ...VALIDO, documentTypeCode: codigo }).success).toBe(true);
      }

      for (const codigo of ['cc', 'TI', 'PASAPORTE', '']) {
        expect(
          schema.safeParse({ ...VALIDO, documentTypeCode: codigo }).success,
          `${nombre}: documentTypeCode = ${JSON.stringify(codigo)} debe caer`,
        ).toBe(false);
      }

      for (const roleId of ['', 'no-es-un-uuid', '1111-1111']) {
        expect(
          schema.safeParse({ ...VALIDO, roleId }).success,
          `${nombre}: roleId = ${JSON.stringify(roleId)} debe caer`,
        ).toBe(false);
      }
    }
  });
});

describe('esquema de mover el estado de cuenta (QC-66 T8)', () => {
  it('admite los CUATRO valores del conjunto cerrado de QC-65 y ninguno mas', () => {
    // R26: no hay transiciones prohibidas en esta feature, cualquiera de los cuatro vale como
    // destino. El conjunto se IMPORTA de QC-65 -el enum no se reescribe-, asi que si alguien le
    // quita un valor, la igualdad de abajo lo caza.
    expect(USER_ACCOUNT_STATUSES).toEqual(['active', 'pending', 'inactive', 'blocked']);

    for (const accountStatus of USER_ACCOUNT_STATUSES) {
      expect(setAccountStatusSchema.parse({ accountStatus })).toEqual({ accountStatus });
    }

    for (const valor of ['ACTIVE', 'activo', 'deleted', '']) {
      expect(
        setAccountStatusSchema.safeParse({ accountStatus: valor }).success,
        `accountStatus = ${JSON.stringify(valor)} debe caer`,
      ).toBe(false);
    }
  });

  it('no admite el autor ni el instante del cambio, ni ningun otro campo', () => {
    // R25: el autor es el ACTOR y el instante es el reloj del caso de uso. Si viajaran en la
    // entrada, quien llama elegiria a quien se le atribuye el cambio.
    for (const campo of ['accountStatusChangedBy', 'accountStatusChangedAt', 'id', 'companyId']) {
      expect(
        setAccountStatusSchema.safeParse({ accountStatus: 'active', [campo]: 'x' }).success,
        `setAccountStatusSchema debe RECHAZAR ${campo}`,
      ).toBe(false);
    }
  });
});

describe('tipos de salida de las dos consultas (QC-66 T8)', () => {
  // El `Record<keyof ...>` es la mitad que vigila el COMPILADOR: si al tipo le falta una clave o
  // le sobra otra, esto no compila. El `expect` de abajo es la mitad que vigila el CONTENIDO: fija
  // la lista exacta y su orden, para que anadir una clave al tipo y al `Record` a la vez tampoco
  // pase inadvertido (R31, R32).
  const CLAVES_DE_FILA: Record<keyof UserRow, true> = {
    id: true,
    displayName: true,
    username: true,
    email: true,
    roleName: true,
    accountStatus: true,
  };

  const CLAVES_DE_FICHA: Record<keyof UserDetail, true> = {
    id: true,
    firstNames: true,
    lastNames: true,
    birthDate: true,
    email: true,
    phone: true,
    documentTypeCode: true,
    documentNumber: true,
    username: true,
    roleId: true,
    roleName: true,
    accountStatus: true,
    accountStatusChangedAt: true,
    createdAt: true,
    updatedAt: true,
  };

  /** Ninguno de estos puede estar en ninguna de las dos proyecciones (R31, R32, R45). */
  const NUNCA: readonly string[] = [
    'passwordHash',
    'password',
    'mustChangeCredential',
    'failedLoginAttempts',
    'lockLevel',
    'lockedUntil',
    'companyId',
    'deletedAt',
    'accountStatusChangedBy',
  ];

  it('UserRow tiene EXACTAMENTE las seis claves de la fila del listado (R31)', () => {
    expect(Object.keys(CLAVES_DE_FILA)).toEqual([
      'id',
      'displayName',
      'username',
      'email',
      'roleName',
      'accountStatus',
    ]);
  });

  it('UserDetail tiene EXACTAMENTE las quince claves de la ficha (R32)', () => {
    expect(Object.keys(CLAVES_DE_FICHA)).toEqual([
      'id',
      'firstNames',
      'lastNames',
      'birthDate',
      'email',
      'phone',
      'documentTypeCode',
      'documentNumber',
      'username',
      'roleId',
      'roleName',
      'accountStatus',
      'accountStatusChangedAt',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('ninguna de las dos lleva credencial, contadores, empresa, borrado ni autor del estado', () => {
    // R31, R32, R45. Y el ancla contra el verde por vacuidad: la lista de prohibidos no esta vacia.
    expect(NUNCA.length).toBeGreaterThan(0);

    const hallazgos = NUNCA.flatMap((clave) => [
      ...(clave in CLAVES_DE_FILA ? [`UserRow: ${clave}`] : []),
      ...(clave in CLAVES_DE_FICHA ? [`UserDetail: ${clave}`] : []),
    ]);

    expect(hallazgos).toEqual([]);
  });
});
