// QC-66 T11 — Autorizacion POR PERMISO de los SEIS casos de uso de administracion de usuarios
// (R1, R2, R3, R4, R5).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como
// dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS no filtran NINGUNA
// consulta de esta app (R7). La frontera real es el caso de uso, y una comprobacion que se
// saltara UNO de los seis -o que estuviera puesta DESPUES de consultar- seria justo el agujero
// que este archivo existe para encontrar.
//
// Por eso los TRES puertos -repositorio de administracion, fabrica de credencial inicial y log
// de campos omitidos- son dobles que FALLAN SI LOS LLAMAN: no basta con que la operacion lance,
// tiene que lanzar sin haber tocado nada. Y ademas se afirma `not.toHaveBeenCalled()` sobre
// CADA metodo de CADA puerto en los SEIS casos (`tasks.md > T11 > Hecho cuando`).
//
// Estilo y estructura: `tests/unit/proveedores/authorization.test.ts`, con una sola diferencia
// de forma -aqui el ACTOR VA PRIMERO en la firma (`design.md > 8.1`)-.
//
// Cubre R1, R2, R3, R4, R5.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createCreateUser } from '@/lib/modules/identity/domain/create-user';
import { createDeleteUser } from '@/lib/modules/identity/domain/delete-user';
import { IdentityError, UnauthorizedError } from '@/lib/modules/identity/domain/errors';
import { createGetUser } from '@/lib/modules/identity/domain/get-user';
import { createListUsers } from '@/lib/modules/identity/domain/list-users';
import { PERMISSIONS } from '@/lib/modules/identity/domain/permissions';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';
import { createUpdateUser } from '@/lib/modules/identity/domain/update-user';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { PermissionCode } from '@/lib/modules/identity/domain/permissions';
import type { CredentialPolicyResult } from '@/lib/modules/identity/domain/credential-policy';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '@/lib/modules/identity/ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';

const moduloDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'identity',
);

/**
 * Los archivos NUEVOS de la feature dentro de `lib/modules/identity/**` que son del dominio y de
 * los puertos, escritos UNO A UNO y no por barrido del directorio: `identity` es un modulo viejo
 * y lleno de archivos ajenos (sesion, login, seed), asi que un barrido probaria cosas de otras
 * fichas y no probaria que ESTOS existen. La lista se afirma contra el disco antes de usarse, de
 * modo que un archivo que se renombre ponga el test rojo en vez de dejarlo verde por vacuidad.
 *
 * `roles.ts` NO esta: es el archivo que DECLARA `ROLE_ADMINISTRADOR` (R24) y es de otra ficha.
 * Los adaptadores (`adapters/driven/**`, `adapters/driving/**`) tampoco: son de T12, T13 y T14 y
 * su alcance lo cierran sus propios tests.
 */
const ARCHIVOS_NUEVOS: readonly string[] = [
  'domain/actor.ts',
  'domain/errors.ts',
  'domain/list-query.ts',
  'domain/page.ts',
  'domain/user-input.ts',
  'domain/user-queryable.ts',
  'domain/user-view.ts',
  'domain/create-user.ts',
  'domain/get-user.ts',
  'domain/list-users.ts',
  'domain/update-user.ts',
  'domain/delete-user.ts',
  'domain/set-user-account-status.ts',
  'ports/user-admin-repository.ts',
  'ports/initial-credential-factory.ts',
  'ports/list-query-log.ts',
];

/** Los seis archivos de caso de uso, que son los que R4 y R5 vigilan mas de cerca. */
const ARCHIVOS_DE_CASO_DE_USO: readonly string[] = [
  'domain/create-user.ts',
  'domain/get-user.ts',
  'domain/list-users.ts',
  'domain/update-user.ts',
  'domain/delete-user.ts',
  'domain/set-user-account-status.ts',
];

/** El fuente SIN comentarios: lo que se vigila es el codigo, no lo que el comentario explica. */
function codigoSinComentarios(relativo: string): string {
  return readFileSync(join(moduloDir, relativo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

const CONSULTAR: PermissionCode = 'usuarios.consultar';
const MODIFICAR: PermissionCode = 'usuarios.modificar';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
/** El objetivo NUNCA es el actor: R21 y R35 son otros requisitos y no deben tapar este. */
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';

/** Entrada VALIDA del alta y de la edicion (el esquema es el mismo, R19). */
const ENTRADA_USUARIO = {
  firstNames: 'Ana Maria',
  lastNames: 'Perez Loor',
  birthDate: '1990-05-04',
  email: 'ana.perez@empresa.test',
  phone: '+593 99 000 0000',
  documentTypeCode: 'CC',
  documentNumber: '1712345678',
  username: 'aperez',
  roleId: ROLE_ID,
};
const ENTRADA_ESTADO = { accountStatus: 'inactive' };
const ENTRADA_LISTA = { page: 1, pageSize: 10 };
/** Entrada que zod RECHAZA en los cuatro casos que validan: demuestra que el permiso va ANTES. */
const BASURA = { firstNames: 42, accountStatus: 'ninguno', page: 'primera' };

/**
 * Los tres puertos. Cada metodo explota si alguien lo llama: si un caso de uso comprobara el
 * permiso DESPUES de tocar el puerto, el test caeria por la excepcion del doble aunque el
 * `toBeInstanceOf(UnauthorizedError)` pudiera enganarse. Un doble permisivo dejaria pasar
 * exactamente ese defecto.
 */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`);
    });

  const users = {
    create: explota('users.create'),
    findAliveInCompany: explota('users.findAliveInCompany'),
    listAliveInCompany: explota('users.listAliveInCompany'),
    updateAliveInCompany: explota('users.updateAliveInCompany'),
    applyGuardedChange: explota('users.applyGuardedChange'),
  };
  // R16, y **QC-79 R6 lo extiende a los tres puertos nuevos**: «SI el actor no trae ese codigo
  // exacto, el sistema NO DEBE crear ningun usuario, NO DEBE emitir ningun enlace, NO DEBE enviar
  // ningun correo y NO DEBE realizar ninguna lectura ni escritura por ningun puerto». La credencial
  // ya no se genera al azar (R4), asi que la fabrica de QC-66 sale de aqui y entran las cuatro
  // dependencias del alta enmendada: hashear, evaluar la politica, fabricar el secreto, emitir el
  // enlace y mandar el correo. Gastar un bcrypt por una peticion no autorizada seria, ademas, un
  // canal de medida de tiempo; mandar un correo seria usar el ERP como reenviador.
  const credential = {
    'passwordHasher.hash': explota('passwordHasher.hash'),
    'passwordHasher.verify': explota('passwordHasher.verify'),
    checkCredentialPolicy: explota('checkCredentialPolicy'),
    'secrets.create': explota('secrets.create'),
    'links.issueForPendingUser': explota('links.issueForPendingUser'),
    'links.applyCredentialAndActivate': explota('links.applyCredentialAndActivate'),
    'mailer.sendCredentialSetupLink': explota('mailer.sendCredentialSetupLink'),
  };

  /** Las cinco dependencias de credencial del alta, ya con la forma que pide `createCreateUser`. */
  const credentialDeps = {
    passwordHasher: {
      hash: credential['passwordHasher.hash'],
      verify: credential['passwordHasher.verify'],
    } as unknown as PasswordHasher,
    checkCredentialPolicy: credential.checkCredentialPolicy as unknown as (
      candidate: string,
    ) => Promise<CredentialPolicyResult>,
    secrets: { create: credential['secrets.create'] } as unknown as CredentialSetupSecretFactory,
    links: {
      issueForPendingUser: credential['links.issueForPendingUser'],
      applyCredentialAndActivate: credential['links.applyCredentialAndActivate'],
    } as unknown as CredentialSetupLinkRepository,
    mailer: {
      sendCredentialSetupLink: credential['mailer.sendCredentialSetupLink'],
    } as unknown as CredentialSetupMailer,
  };
  // QC-57 R6: el log del campo omitido tampoco puede sonar sin autorizacion. `requirePermission`
  // es la primera linea del listado, antes de zod y antes de sanear, asi que un actor rechazado
  // no llega ni a saber que su consulta traia campos raros.
  const log = { ignoredFields: explota('log.ignoredFields') };

  return {
    users: users as unknown as UserAdminRepository,
    credentialDeps,
    log: log as unknown as ListQueryLog,
    espias: [...Object.values(users), ...Object.values(credential), ...Object.values(log)],
  };
}

type Deps = ReturnType<typeof dobles>;

type Caso = {
  readonly nombre: string;
  readonly archivo: string;
  /** El codigo EXACTO que exige este caso de uso (R1), ni uno mas. */
  readonly permiso: PermissionCode;
  /** Invocacion con entrada VALIDA: lo unico que puede fallar es la autorizacion. */
  readonly ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>;
  /** Invocacion con entrada que zod rechaza; solo la tienen los cuatro que validan con zod. */
  readonly ejecutarConBasura?: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown>;
};

/**
 * Los SEIS casos de uso con el permiso de su fila (R1). El actor va PRIMERO en todas las firmas
 * (`design.md > 8.1`), y el identificador objetivo NUNCA es el del actor.
 */
const CASOS_DE_USO: readonly Caso[] = [
  {
    nombre: 'createUser',
    archivo: 'create-user.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createCreateUser({ users: d.users, ...d.credentialDeps })(actor, ENTRADA_USUARIO),
    ejecutarConBasura: (d, actor) =>
      createCreateUser({ users: d.users, ...d.credentialDeps })(actor, BASURA),
  },
  {
    nombre: 'getUser',
    archivo: 'get-user.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) => createGetUser({ users: d.users })(actor, TARGET_ID),
  },
  {
    nombre: 'listUsers',
    archivo: 'list-users.ts',
    permiso: CONSULTAR,
    ejecutar: (d, actor) => createListUsers({ users: d.users, log: d.log })(actor, ENTRADA_LISTA),
    ejecutarConBasura: (d, actor) =>
      createListUsers({ users: d.users, log: d.log })(actor, BASURA),
  },
  {
    nombre: 'updateUser',
    archivo: 'update-user.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createUpdateUser({ users: d.users })(actor, TARGET_ID, ENTRADA_USUARIO),
    ejecutarConBasura: (d, actor) =>
      createUpdateUser({ users: d.users })(actor, TARGET_ID, BASURA),
  },
  {
    nombre: 'deleteUser',
    archivo: 'delete-user.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) => createDeleteUser({ users: d.users })(actor, TARGET_ID),
  },
  {
    nombre: 'setUserAccountStatus',
    archivo: 'set-user-account-status.ts',
    permiso: MODIFICAR,
    ejecutar: (d, actor) =>
      createSetUserAccountStatus({ users: d.users })(actor, TARGET_ID, ENTRADA_ESTADO),
    ejecutarConBasura: (d, actor) =>
      createSetUserAccountStatus({ users: d.users })(actor, TARGET_ID, BASURA),
  },
];

/**
 * Actor con EXACTAMENTE los permisos que se le den. Sin ningun campo de rol: el tipo `Actor` es
 * `{ id, companyId, permissions }` y nada mas (R4).
 */
function actorCon(...permissions: readonly string[]): Actor {
  return { id: ACTOR_ID, companyId: COMPANY_ID, permissions };
}

/** Todos los codigos del catalogo REAL menos uno: el conjunto que NO debe abrir el caso. */
function todosMenos(permiso: PermissionCode): readonly string[] {
  return PERMISSIONS.map((p) => p.code).filter((code) => code !== permiso);
}

/** Ejecuta un caso de uso con un actor no autorizado y exige rechazo SIN tocar ningun puerto. */
async function esperarRechazoSinTocarNada(
  caso: Caso,
  actor: Actor | null | undefined,
  etiqueta: string,
  ejecutar: (deps: Deps, actor: Actor | null | undefined) => Promise<unknown> = caso.ejecutar,
): Promise<void> {
  const d = dobles();
  const fallo = await ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  );

  // R41: se afirma sobre la CLASE y sobre el `code` estable, nunca sobre el texto del mensaje.
  expect(fallo, `${caso.nombre} con ${etiqueta} no rechazo`).toBeInstanceOf(UnauthorizedError);
  expect(fallo, `${caso.nombre} con ${etiqueta} no lanzo un error del modulo`).toBeInstanceOf(
    IdentityError,
  );
  expect((fallo as UnauthorizedError).code).toBe('unauthorized');

  // R2: sin efectos, y se afirma CONTANDO invocaciones de CADA metodo de CADA puerto.
  for (const espia of d.espias) {
    expect(espia, `${caso.nombre} con ${etiqueta} toco un puerto`).not.toHaveBeenCalled();
  }
}

/**
 * Ejecuta un caso de uso con un actor AUTORIZADO y exige que AVANCE hasta el puerto: se ve porque
 * el doble explota con SU mensaje, no con `unauthorized`. Esto es lo que impide que la concesion
 * pase por un `throw new UnauthorizedError()` incondicional o por un caso de uso que no llame a
 * nadie -los dos dejarian todos los rechazos en verde-.
 */
async function esperarQueLlegueAlPuerto(caso: Caso, actor: Actor): Promise<void> {
  const d = dobles();
  const resultado = await caso.ejecutar(d, actor).then(
    () => null,
    (error: unknown) => error,
  );

  expect(resultado, `${caso.nombre} no llego al puerto con ${caso.permiso}`).not.toBeNull();
  expect(resultado, `${caso.nombre} rechazo teniendo ${caso.permiso}`).not.toBeInstanceOf(
    UnauthorizedError,
  );
  expect((resultado as Error).message).toMatch(/no debe llamarse sin autorizacion/);
}

describe('autorizacion por permiso de los seis casos de uso de usuarios (QC-66 T11)', () => {
  it('los seis casos de uso del dominio estan cubiertos por esta tabla', () => {
    // Guardia de la propia guardia: si manana nace un septimo caso de uso y nadie lo mete en
    // `CASOS_DE_USO`, este test cae. Sin esto, la cobertura «de los seis» seria una promesa del
    // comentario de cabecera y no una afirmacion ejecutable.
    expect(CASOS_DE_USO).toHaveLength(6);
    expect([...CASOS_DE_USO].map((c) => c.archivo).sort()).toEqual(
      [...ARCHIVOS_DE_CASO_DE_USO].map((ruta) => ruta.replace('domain/', '')).sort(),
    );

    // R1: el reparto EXACTO de la tabla -dos lecturas con `usuarios.consultar`, cuatro
    // escrituras con `usuarios.modificar`-.
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual(['getUser', 'listUsers']);
    expect(
      CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR)
        .map((c) => c.nombre)
        .sort(),
    ).toEqual(['createUser', 'deleteUser', 'setUserAccountStatus', 'updateUser']);

    // Y los dos codigos existen en el catalogo REAL de `identity`, no en una copia a mano.
    const codigos: readonly string[] = PERMISSIONS.map((p) => p.code);
    expect(codigos).toContain(CONSULTAR);
    expect(codigos).toContain(MODIFICAR);
  });

  it('R1 — cada caso de uso avanza con EXACTAMENTE el codigo de su fila y con ningun otro', async () => {
    for (const caso of CASOS_DE_USO) {
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso));

      // La otra mitad: con los OTROS DOCE codigos del catalogo real y sin el suyo, rechaza. Es
      // lo que impide que alguien exija un codigo de otro modulo -o dos a la vez- y siga verde.
      await esperarRechazoSinTocarNada(
        caso,
        actorCon(...todosMenos(caso.permiso)),
        `todo el catalogo menos ${caso.permiso}`,
      );
    }
  });

  it('R2 — falla cerrado: actor ausente, sin conjunto, con el conjunto vacio y con un conjunto que no es una lista', async () => {
    const NO_AUTORIZADOS: readonly {
      readonly etiqueta: string;
      readonly actor: Actor | null | undefined;
    }[] = [
      { etiqueta: 'actor ausente (null)', actor: null },
      { etiqueta: 'actor ausente (undefined)', actor: undefined },
      { etiqueta: 'conjunto de permisos vacio', actor: actorCon() },
      {
        // Lo que llegaria de un adaptador que se olvidara del campo: falla cerrado igual, no
        // revienta con un `TypeError` ni concede por descuido.
        etiqueta: 'sin conjunto de permisos',
        actor: { id: ACTOR_ID, companyId: COMPANY_ID } as unknown as Actor,
      },
      {
        // El `cast` es el punto: un `permissions` que no es lista llega en ejecucion aunque el
        // tipo lo prohiba, y lo que importa es que se rechace -no que se caiga de otra forma-.
        // Un `String.prototype.includes` concederia aqui por coincidencia PARCIAL.
        etiqueta: 'conjunto que es una cadena',
        actor: {
          id: ACTOR_ID,
          companyId: COMPANY_ID,
          permissions: 'usuarios.consultar,usuarios.modificar',
        } as unknown as Actor,
      },
      {
        etiqueta: 'conjunto que es un objeto',
        actor: {
          id: ACTOR_ID,
          companyId: COMPANY_ID,
          permissions: { 'usuarios.modificar': true },
        } as unknown as Actor,
      },
    ];

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, actor } of NO_AUTORIZADOS) {
        await esperarRechazoSinTocarNada(caso, actor, etiqueta);
      }
    }
  });

  it('R2 — la pertenencia es EXACTA: ni el prefijo, ni otra caja, ni un codigo parecido conceden nada', async () => {
    // Sin normalizacion y sin coincidencia parcial: cada conjunto de abajo CONTIENE algo que se
    // parece a los dos codigos exigidos y ninguno lo es.
    const PARECIDOS: readonly {
      readonly etiqueta: string;
      readonly permisos: readonly string[];
    }[] = [
      { etiqueta: 'solo el nombre del modulo', permisos: ['usuarios'] },
      { etiqueta: 'el prefijo con el punto', permisos: ['usuarios.'] },
      {
        etiqueta: 'un codigo mas largo',
        permisos: ['usuarios.consultarlo', 'usuarios.modificarlo'],
      },
      {
        etiqueta: 'los dos codigos en otra caja',
        permisos: [CONSULTAR.toUpperCase(), MODIFICAR.toUpperCase()],
      },
      {
        etiqueta: 'los dos codigos con espacios alrededor',
        permisos: [`${CONSULTAR} `, ` ${MODIFICAR}`],
      },
    ];

    for (const caso of CASOS_DE_USO) {
      for (const { etiqueta, permisos } of PARECIDOS) {
        await esperarRechazoSinTocarNada(caso, actorCon(...permisos), etiqueta);
      }
    }
  });

  it('R3 — solo `usuarios.modificar` no abre la ficha ni el listado, igual que no traer ninguno', async () => {
    // El sentido que la intuicion se salta: quien puede escribir NO puede leer por ello.
    for (const caso of CASOS_DE_USO.filter((c) => c.permiso === CONSULTAR)) {
      await esperarRechazoSinTocarNada(caso, actorCon(MODIFICAR), 'solo usuarios.modificar');
      await esperarRechazoSinTocarNada(caso, actorCon(), 'ningun permiso');
    }
  });

  it('R3 — solo `usuarios.consultar` no abre ninguna de las cuatro escrituras', async () => {
    for (const caso of CASOS_DE_USO.filter((c) => c.permiso === MODIFICAR)) {
      await esperarRechazoSinTocarNada(caso, actorCon(CONSULTAR), 'solo usuarios.consultar');
      await esperarRechazoSinTocarNada(caso, actorCon(), 'ningun permiso');
    }
  });

  it('R1 — el permiso se comprueba ANTES de zod: con entrada invalida el rechazo sigue siendo `unauthorized`', async () => {
    // Si validara primero, un actor no autorizado con una entrada rota recibiria
    // `invalid_input` y sabria algo del sistema sin tener derecho a preguntarlo: esa es la
    // diferencia entre autorizar de verdad y un `if` decorativo. Mutacion que lo pone rojo:
    // mover `requirePermission` debajo del `safeParse` en cualquiera de los cuatro.
    //
    // `getUser` y `deleteUser` no estan porque NO TIENEN esquema: su unica entrada es un
    // identificador, asi que no hay ninguna validacion que pueda adelantarse al permiso.
    const conZod = CASOS_DE_USO.filter((c) => c.ejecutarConBasura !== undefined);
    expect(conZod.map((c) => c.nombre).sort()).toEqual([
      'createUser',
      'listUsers',
      'setUserAccountStatus',
      'updateUser',
    ]);

    for (const caso of conZod) {
      await esperarRechazoSinTocarNada(
        caso,
        actorCon(),
        'entrada invalida y sin permiso',
        caso.ejecutarConBasura,
      );

      // Y con el permiso correcto esa MISMA entrada si llega a zod: `invalid_input`, no
      // `unauthorized`. Sin esta mitad, un `throw new UnauthorizedError()` incondicional
      // dejaria el caso anterior en verde.
      const d = dobles();
      const ejecutarConBasura = caso.ejecutarConBasura;
      if (ejecutarConBasura === undefined) throw new Error('caso sin entrada invalida');
      const fallo = await ejecutarConBasura(d, actorCon(caso.permiso)).then(
        () => null,
        (error: unknown) => error,
      );
      expect((fallo as IdentityError).code, `${caso.nombre} con permiso y basura`).toBe(
        'invalid_input',
      );
    }
  });

  it('R4 — el rol del actor no participa: un Actor sin ningun campo de rol autoriza igual', async () => {
    // El tipo, primero: `Actor` es `{ id, companyId, permissions }` y nada mas. Mutacion que lo
    // pone rojo: anadir `roleName` «por si acaso» y compararlo en algun caso de uso.
    const actorTs = codigoSinComentarios('domain/actor.ts');
    expect(actorTs).toMatch(
      /export type Actor = \{\s*readonly id: string;\s*readonly companyId: string;\s*readonly permissions: readonly string\[\];\s*\}/,
    );

    // Y el comportamiento: el objeto que se pasa tiene EXACTAMENTE tres claves y los seis casos
    // de uso avanzan hasta el puerto con el codigo de su fila.
    for (const caso of CASOS_DE_USO) {
      const actor = actorCon(caso.permiso);
      expect(Object.keys(actor).sort()).toEqual(['companyId', 'id', 'permissions']);
      await esperarQueLlegueAlPuerto(caso, actor);
    }
  });

  it('R4 — ningun archivo nuevo de la feature incrusta el literal del rol administrador', () => {
    // La constante `ROLE_ADMINISTRADOR` IMPORTADA si vale (R24, y es lo que hacen `delete-user`
    // y `set-user-account-status`); el literal escrito a mano, no -seria el septimo sitio
    // haciendolo, justo despues de que QC-54 gastara una ficha entera en unificarlos-.
    // `domain/roles.ts` queda EXCLUIDO de esta comprobacion por ser quien lo DECLARA.
    expect(ARCHIVOS_NUEVOS).not.toContain('domain/roles.ts');

    for (const relativo of ARCHIVOS_NUEVOS) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente.length, `${relativo} no existe o esta vacio`).toBeGreaterThan(0);
      expect(fuente, `${relativo} incrusta el literal del rol`).not.toMatch(/['"`]Administrador/);
      // Ni ninguna autorizacion por rol de la epoca anterior a QC-74.
      expect(fuente, `${relativo} autoriza por rol`).not.toMatch(
        /requireAdmin|assertAdminRole|\broleName\b\s*===/,
      );
    }
  });

  it('R5 — el actor entra por parametro y el dominio no lee sesion, cookie ni cabecera', async () => {
    // Mitad de TEXTO: ninguno de los seis casos de uso nombra la sesion, la cookie, la cabecera
    // ni el lector de sesion de `identity`. Quien resuelve el actor es el adaptador driving con
    // `identity.getSessionUser()` via `@/lib/composition`, y esa es la unica puerta (R6).
    for (const relativo of ARCHIVOS_DE_CASO_DE_USO) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente, `${relativo} lee la sesion`).not.toMatch(
        /getSessionUser|next\/headers|\bcookies?\b|\bheaders\(\)|@\/lib\/composition/i,
      );
    }

    // Mitad de COMPORTAMIENTO: el mismo caso de uso, en el mismo entorno, acepta o rechaza
    // segun lo que se le PASE. Nada ambiental decide.
    for (const caso of CASOS_DE_USO) {
      await esperarRechazoSinTocarNada(caso, actorCon('inventario.consultar'), 'otro modulo');
      await esperarQueLlegueAlPuerto(caso, actorCon(caso.permiso));
    }
  });
});
