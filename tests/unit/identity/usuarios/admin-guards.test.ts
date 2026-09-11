// QC-66 T11 — Las DOS guardas del administrador (`design.md > 9`, decision cerrada 9) y de donde
// sale el nombre del rol (R24).
//
//   (a) R21: nadie se mueve su PROPIO estado de cuenta, se edita a si mismo -lo que incluye su
//       propio rol- ni se borra. Las tres se rechazan ANTES del puerto, asi que el doble del
//       repositorio LANZA si lo llaman: «y NO DEBE modificar ninguna fila» no se demuestra
//       mirando que la operacion lanza, se demuestra contando invocaciones.
//   (b) R22: cuando el puerto dice `'last_administrator'` -lo decidio DENTRO de su transaccion
//       con bloqueo de fila, y por tanto no escribio nada-, el caso de uso lo traduce al error de
//       dominio en las TRES operaciones guardadas.
//
// Lo que este nivel NO puede demostrar y por eso no se intenta: que la invariante aguante la
// CONCURRENCIA (R23). Eso necesita dos conexiones de verdad contra Postgres y vive en
// `tests/integration/identity/last-administrator.int.test.ts` (`design.md > 9.3`).
//
// Se afirma SIEMPRE sobre el `code` del error y NUNCA sobre el texto del mensaje (R41).
//
// Cubre R21, R22, R24.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { createDeleteUser } from '@/lib/modules/identity/domain/delete-user';
import { IdentityError } from '@/lib/modules/identity/domain/errors';
import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity/domain/roles';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';
import { createUpdateUser } from '@/lib/modules/identity/domain/update-user';

import type { Actor } from '@/lib/modules/identity/domain/actor';
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
 * Los archivos NUEVOS de dominio y puertos de esta feature. Misma lista que
 * `authorization.test.ts` -se repite a proposito: un helper compartido entre dos archivos de test
 * se convierte en un sitio donde relajar las dos guardias a la vez-. `domain/roles.ts` NO esta:
 * es quien DECLARA `ROLE_ADMINISTRADOR` y es de otra ficha.
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

function codigoSinComentarios(relativo: string): string {
  return readFileSync(join(moduloDir, relativo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const OTRO_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-10T15:00:00.000Z');

const ACTOR: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** Entrada VALIDA de la edicion: si fuera invalida, `invalid_input` taparia la guarda. */
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

/** Dobles que EXPLOTAN: para R21, llegar al puerto ya es el fallo. */
function doblesQueExplotan() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no deberia haberse llamado`);
    });

  const metodos = {
    create: explota('users.create'),
    findAliveInCompany: explota('users.findAliveInCompany'),
    listAliveInCompany: explota('users.listAliveInCompany'),
    updateAliveInCompany: explota('users.updateAliveInCompany'),
    applyGuardedChange: explota('users.applyGuardedChange'),
  };

  return {
    users: metodos as unknown as UserAdminRepository,
    espias: Object.values(metodos),
  };
}

/** Dobles que RESPONDEN lo que el adaptador responderia tras abortar su transaccion (R22). */
function doblesQueRechazan() {
  const users = {
    create: vi.fn<UserAdminRepository['create']>(),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(
      async () => 'last_administrator',
    ),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(
      async () => 'last_administrator',
    ),
  } satisfies UserAdminRepository;
  return users;
}

/** Dobles que aceptan: sirven para leer QUE se le pidio al puerto (R24). */
function doblesQueAceptan() {
  return {
    create: vi.fn<UserAdminRepository['create']>(),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(async () => 'ok'),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(async () => 'ok'),
  } satisfies UserAdminRepository;
}

async function codeDeFallo(operacion: Promise<unknown>): Promise<string> {
  const fallo = await operacion.then(
    () => null,
    (error: unknown) => error,
  );
  expect(fallo, 'la operacion no fallo').toBeInstanceOf(IdentityError);
  return (fallo as IdentityError).code;
}

const now = () => AHORA;

describe('primera guarda: las tres operaciones sobre uno mismo (R21)', () => {
  // Las tres que la decision cerrada 9(a) nombra, con el objetivo = el propio actor. Cada una con
  // dobles que LANZAN si los llaman: asi «no modifica ninguna fila» es una afirmacion y no una
  // confianza.
  //
  // El caso de la EDICION se titula por R21 a proposito: la edicion es REEMPLAZO COMPLETO de los
  // nueve campos (R19) y el rol es uno de ellos, asi que editarse ES escribirse el propio rol, que
  // es exactamente lo que R21 prohibe. Lo que este archivo NO dice -ni a favor ni en contra- es si
  // el actor podria editarse los otros ocho campos: eso es P3 y sigue abierta
  // (`requirements.md > P3`).
  const OPERACIONES: readonly {
    readonly nombre: string;
    readonly ejecutar: (users: UserAdminRepository) => Promise<unknown>;
  }[] = [
    {
      nombre: 'mover su propio estado de cuenta',
      ejecutar: (users) =>
        createSetUserAccountStatus({ users, now })(ACTOR, ACTOR_ID, { accountStatus: 'inactive' }),
    },
    {
      nombre: 'editarse a si mismo, lo que incluye escribirse el propio rol',
      ejecutar: (users) => createUpdateUser({ users, now })(ACTOR, ACTOR_ID, ENTRADA_USUARIO),
    },
    {
      nombre: 'borrarse a si mismo',
      ejecutar: (users) => createDeleteUser({ users, now })(ACTOR, ACTOR_ID),
    },
  ];

  for (const { nombre, ejecutar } of OPERACIONES) {
    it(`R21 — rechaza ${nombre} con \`self_operation\` y no modifica ninguna fila`, async () => {
      const d = doblesQueExplotan();

      // `self_operation` es DISTINTO de `not_found` a proposito: la pantalla de QC-67 tiene que
      // poder decir «no puedes hacerlo sobre tu cuenta» sin mentir, y aqui no hay ningun oraculo
      // que proteger -el actor no descubre nada que no sepa ya de su propia fila-.
      expect(await codeDeFallo(ejecutar(d.users))).toBe('self_operation');

      for (const espia of d.espias) {
        expect(espia, `${nombre} toco un puerto`).not.toHaveBeenCalled();
      }
    });
  }

  it('R21 — la misma operacion sobre OTRO identificador si llega al puerto', async () => {
    // La contraparte, sin la cual los tres casos de arriba saldrian verdes con un
    // `throw new SelfOperationError()` incondicional.
    const users = doblesQueAceptan();

    await createSetUserAccountStatus({ users, now })(ACTOR, OTRO_ID, { accountStatus: 'inactive' });
    await createUpdateUser({ users, now })(ACTOR, OTRO_ID, ENTRADA_USUARIO);
    await createDeleteUser({ users, now })(ACTOR, OTRO_ID);

    expect(users.applyGuardedChange).toHaveBeenCalledTimes(2);
    expect(users.updateAliveInCompany).toHaveBeenCalledTimes(1);
  });
});

describe('segunda guarda: el ultimo administrador en `active` (R22)', () => {
  it('R22 — mover el estado del ultimo administrador activo se traduce a `last_administrator`', async () => {
    const users = doblesQueRechazan();

    // Los tres destinos que lo dejarian de ser: los cuatro valores valen como destino (R26), pero
    // solo salir de `active` puede violar la invariante.
    for (const accountStatus of ['pending', 'inactive', 'blocked'] as const) {
      const code = await codeDeFallo(
        createSetUserAccountStatus({ users, now })(ACTOR, OTRO_ID, { accountStatus }),
      );
      expect(code, accountStatus).toBe('last_administrator');
    }

    // El adaptador aborto DENTRO de su transaccion, asi que no se escribio nada: la unica
    // llamada es la que pidio el cambio, y no hay ninguna escritura de vuelta ni ningun
    // reintento detras del rechazo.
    expect(users.applyGuardedChange).toHaveBeenCalledTimes(3);
    expect(users.updateAliveInCompany).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('R22 — cambiarle el rol al ultimo administrador activo se traduce a `last_administrator`', async () => {
    // El cambio de rol viaja DENTRO de `updateAliveInCompany` y no como una operacion aparte: la
    // edicion es reemplazo completo (R19) y el rol no se puede separar de los otros ocho campos,
    // asi que el adaptador aplica el mismo bloqueo de fila en ese metodo.
    const users = doblesQueRechazan();

    const code = await codeDeFallo(
      createUpdateUser({ users, now })(ACTOR, OTRO_ID, ENTRADA_USUARIO),
    );

    expect(code).toBe('last_administrator');
    expect(users.updateAliveInCompany).toHaveBeenCalledTimes(1);
    expect(users.applyGuardedChange).not.toHaveBeenCalled();
  });

  it('R22 — borrar al ultimo administrador activo se traduce a `last_administrator`', async () => {
    const users = doblesQueRechazan();

    expect(await codeDeFallo(createDeleteUser({ users, now })(ACTOR, OTRO_ID))).toBe(
      'last_administrator',
    );
    expect(users.applyGuardedChange).toHaveBeenCalledTimes(1);
    expect(users.updateAliveInCompany).not.toHaveBeenCalled();
  });
});

describe('de donde sale el nombre del rol administrador (R24)', () => {
  it('R24 — el nombre que viaja al puerto es EXACTAMENTE la constante importada de `domain/roles`', async () => {
    const users = doblesQueAceptan();

    await createSetUserAccountStatus({ users, now })(ACTOR, OTRO_ID, { accountStatus: 'inactive' });
    await createDeleteUser({ users, now })(ACTOR, OTRO_ID);

    // Se compara contra la constante IMPORTADA, no contra un literal escrito aqui: si alguien
    // renombrara el rol, este test seguiria siendo verdadero y el que caeria seria el del seed,
    // que es donde corresponde.
    for (const [cambio] of users.applyGuardedChange.mock.calls) {
      expect(cambio.adminRoleName).toBe(ROLE_ADMINISTRADOR);
    }
    expect(users.applyGuardedChange).toHaveBeenCalledTimes(2);

    // Y los dos casos de uso lo IMPORTAN de `./roles`, en vez de declarar una constante nueva
    // -seria la septima del nombre del rol, justo despues de que QC-54 gastara una ficha en
    // unificarlas-.
    for (const relativo of ['domain/delete-user.ts', 'domain/set-user-account-status.ts']) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente, relativo).toMatch(/import \{ ROLE_ADMINISTRADOR \} from '\.\/roles';/);
      expect(fuente, `${relativo} declara una constante nueva del rol`).not.toMatch(
        /const\s+[A-Z_]*ADMIN[A-Z_]*\s*=/,
      );
    }
  });

  it('R24 — ningun archivo nuevo de la feature escribe el literal del rol a mano', () => {
    // `roles.ts` queda EXCLUIDO por ser quien lo declara; todo lo demas tiene que pasar por la
    // constante. Mutacion que lo pone rojo: sustituir `ROLE_ADMINISTRADOR` por `'Administrador'`
    // en cualquiera de los dos casos de uso guardados.
    expect(ARCHIVOS_NUEVOS).not.toContain('domain/roles.ts');
    expect(codigoSinComentarios('domain/roles.ts')).toMatch(/['"]Administrador['"]/);

    for (const relativo of ARCHIVOS_NUEVOS) {
      const fuente = codigoSinComentarios(relativo);
      expect(fuente.length, `${relativo} no existe o esta vacio`).toBeGreaterThan(0);
      expect(fuente, `${relativo} incrusta el literal del rol`).not.toMatch(/['"`]Administrador/);
    }
  });
});
