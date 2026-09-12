// QC-66 T8 — El BORDE de la administracion de usuarios: los tres esquemas de entrada y los dos
// tipos de salida (`design.md > 6.1`, `> 6.2`, `> 6.3`).
//
// Cubre R14, R18, R20, R31, R32.
//
// Lo que se vigila aqui no es solo lo que los esquemas ACEPTAN, sino lo que RECHAZAN: la mitad de
// los requisitos de esta ficha son campos que NO pueden entrar -la empresa (R14), el estado de
// cuenta en el alta (R13), la marca de cambio de credencial y los tres contadores de QC-19 (R45)-.
//
// **QC-79 ENMIENDA una de esas prohibiciones y solo una**: donde QC-66 R15/R16 decian «cualquier
// campo de contrasena», ahora el ALTA admite un campo opcional llamado `credential` (QC-79 R1), y la
// EDICION sigue sin admitir ninguno (QC-66 R20). Ninguna otra clave se abre: `password`,
// `passwordHash` y `newPassword` siguen cayendo en los dos esquemas. Por eso los esquemas son `strictObject`: con `object`, una
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
    //   password/passwordHash   -> R15 ENMENDADO por QC-79 R1/R4: el alta SI admite una contrasena
    //                              opcional, pero **con un solo nombre y ese es `credential`** (ver
    //                              el bloque de QC-79 mas abajo). `password`, `passwordHash` y
    //                              `newPassword` siguen siendo claves desconocidas y siguen
    //                              RECHAZANDOSE en los DOS esquemas: la enmienda abre un campo, no
    //                              abre el objeto. Y el HASH nunca entra por el borde (R16, R5).
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

  it('QC-79 R1 — el alta admite `credential` OPCIONAL, y es el UNICO campo nuevo', () => {
    // R1: «el esquema del alta DEBE admitir un campo de contrasena opcional y NINGUN OTRO campo
    // nuevo». Las tres mitades del requisito, una por aserción:
    //   1. sin el campo, pasa (es opcional) y el resultado no gana ninguna clave;
    //   2. con el campo, pasa y el valor cruza TAL CUAL;
    //   3. cualquier otra clave desconocida sigue haciendo fallar la validacion.
    expect(createUserSchema.parse(VALIDO)).toEqual(VALIDO);
    expect(Object.keys(createUserSchema.parse(VALIDO))).not.toContain('credential');

    expect(createUserSchema.parse({ ...VALIDO, credential: 'Contrasena-1!' })).toEqual({
      ...VALIDO,
      credential: 'Contrasena-1!',
    });

    for (const desconocida of ['credentials', 'credencial', 'setupCredential', 'secret']) {
      expect(
        createUserSchema.safeParse({ ...VALIDO, [desconocida]: 'x' }).success,
        `${desconocida} no es el campo nuevo y debe seguir cayendo`,
      ).toBe(false);
    }
  });

  it('QC-79 R1 — `credential` NO se recorta y NO tiene maximo propio: el maximo lo pone la politica', () => {
    // `design.md > 5.2`: sin `trim` -QC-19 R10 prohibe recortar o normalizar la candidata, y un
    // espacio al final es parte de la contrasena- y sin `max` -el maximo es `max_length` de QC-19
    // R11, y un segundo numero escrito aqui podria divergir de el-.
    const conEspacios = '  Contrasena-1!  ';
    expect(createUserSchema.parse({ ...VALIDO, credential: conEspacios }).credential).toBe(
      conEspacios,
    );

    // Muy por encima de `CREDENTIAL_MAX_LENGTH`: el esquema la deja pasar y quien la rechaza es la
    // politica, en el caso de uso. Si alguien anadiera un `max()` aqui, esto se pone rojo.
    const larguisima = `${'a'.repeat(500)}A1!`;
    expect(createUserSchema.safeParse({ ...VALIDO, credential: larguisima }).success).toBe(true);

    // Lo unico que el esquema si exige: que no sea una cadena vacia ni otro tipo. La equivalencia
    // entre la cadena vacia y la AUSENCIA (R1) la resuelve `create-user.ts`, en un solo sitio.
    for (const valor of ['', 0, null, true, ['x']]) {
      expect(
        createUserSchema.safeParse({ ...VALIDO, credential: valor }).success,
        `credential = ${JSON.stringify(valor)} debe caer en el esquema`,
      ).toBe(false);
    }
  });

  it('QC-66 R20 — la EDICION no admite `credential`: el campo nuevo es solo del alta', () => {
    // El punto donde `design.md > 5.2` no se sostiene literalmente. Decia que el campo entra «dentro
    // del `strictObject` existente», y hasta hoy `updateUserSchema` ERA ese mismo objeto: meterlo sin
    // mas habria hecho que **la edicion admitiera una contrasena**, y QC-66 R20 lo prohibe
    // expresamente. Por eso la edicion lo quita con un `omit` explicito. Cambiar la propia es QC-36;
    // restablecer la de otro, QC-89; ninguna de las dos es esta ficha.
    expect(updateUserSchema.safeParse({ ...VALIDO, credential: 'Contrasena-1!' }).success).toBe(
      false,
    );
    // Y el resto del esquema de edicion sigue siendo el del alta, campo por campo: quitar uno no
    // vale como forma de «arreglar» esto.
    expect(updateUserSchema.parse(VALIDO)).toEqual(VALIDO);
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
