// QC-66 T11 — Los seis casos de uso de administracion de usuarios con el PUERTO MOCKEADO
// (`design.md > 14`). Aqui los dobles REGISTRAN sus argumentos: lo que se vigila es QUE se le
// pide al puerto y CON QUE, no solo que la operacion no lance.
//
// Cubre R13, R14, R15, R16, R17, R18, R19, R20, R25, R26, R27, R28, R29, R30, R31, R33, R34,
// R35, R37, R39, R49 (la parte de cada uno que es del DOMINIO; el SQL, el orden real, el tope de
// pagina y la traduccion del 23505 son de `tests/integration/identity/user-crud.int.test.ts`, que
// es el unico nivel donde eso se puede demostrar).
//
// La autorizacion NO se prueba aqui: es `authorization.test.ts`, con dobles que lanzan si los
// llaman. Las dos guardas del administrador tampoco: son `admin-guards.test.ts`.
//
// Se afirma SIEMPRE sobre el `code` del error y NUNCA sobre el texto del mensaje (R41).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { USER_ACCOUNT_STATUSES } from '@/lib/modules/identity/domain/account-status';
import { createCreateUser } from '@/lib/modules/identity/domain/create-user';
import { createDeleteUser } from '@/lib/modules/identity/domain/delete-user';
import { IdentityError } from '@/lib/modules/identity/domain/errors';
import { createGetUser } from '@/lib/modules/identity/domain/get-user';
import { createListUsers } from '@/lib/modules/identity/domain/list-users';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';
import { createUpdateUser } from '@/lib/modules/identity/domain/update-user';
import { USER_QUERYABLE } from '@/lib/modules/identity/domain/user-queryable';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { ListQuery } from '@/lib/modules/identity/domain/list-query';
import type { Page } from '@/lib/modules/identity/domain/page';
import type { UserDetail, UserRow } from '@/lib/modules/identity/domain/user-view';
import type { InitialCredentialFactory } from '@/lib/modules/identity/ports/initial-credential-factory';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';

const puertoTs = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    'lib',
    'modules',
    'identity',
    'ports',
    'user-admin-repository.ts',
  ),
  'utf8',
)
  // Sin comentarios: el puerto EXPLICA en prosa lo que no hace («ninguna operacion de
  // recuperacion», «ni `mustChangeCredential`»), y buscar esas palabras en el texto completo
  // daria un falso rojo. Lo que se vigila es el codigo.
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/.*$/gm, ' ');

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '99999999-9999-4999-8999-999999999999';
const OTRA_COMPANY_ID = '88888888-8888-4888-8888-888888888888';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const NEW_ID = '44444444-4444-4444-8444-444444444444';
/** Marca reconocible: si el hash que llega al puerto no es ESTE, no vino de la fabrica (R15). */
const HASH = '$2b$12$marca-de-la-fabrica-de-credencial-inicial';
const AHORA = new Date('2026-09-10T15:00:00.000Z');

const ACTOR: Actor = {
  id: ACTOR_ID,
  companyId: COMPANY_ID,
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** Los NUEVE campos editables de R19, tal y como llegan del borde (la fecha es civil). */
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

/** Los mismos nueve, ya como los espera el puerto: la fecha convertida a `Date` en UTC. */
const DATOS_EN_EL_PUERTO = {
  ...ENTRADA_USUARIO,
  birthDate: new Date('1990-05-04T00:00:00.000Z'),
};

const FICHA: UserDetail = {
  id: TARGET_ID,
  firstNames: 'Ana Maria',
  lastNames: 'Perez Loor',
  birthDate: new Date('1990-05-04T00:00:00.000Z'),
  email: 'ana.perez@empresa.test',
  phone: '+593 99 000 0000',
  documentTypeCode: 'CC',
  documentNumber: '1712345678',
  username: 'aperez',
  roleId: ROLE_ID,
  roleName: 'Operador',
  accountStatus: 'pending',
  accountStatusChangedAt: AHORA,
  createdAt: AHORA,
  updatedAt: AHORA,
};

function paginaVacia(): Page<UserRow> {
  return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
}

type Resultados = {
  readonly create?: Awaited<ReturnType<UserAdminRepository['create']>>;
  readonly find?: UserDetail | null;
  readonly list?: Page<UserRow>;
  readonly update?: Awaited<ReturnType<UserAdminRepository['updateAliveInCompany']>>;
  readonly guarded?: Awaited<ReturnType<UserAdminRepository['applyGuardedChange']>>;
};

/**
 * Dobles que REGISTRAN. `satisfies UserAdminRepository` no es decoracion: hace que este objeto
 * tenga que implementar el puerto ENTERO y nada mas que el puerto, asi que `Object.keys(users)`
 * es la superficie real del contrato y se puede afirmar sobre ella (R17, R37, R39).
 */
function montar(resultados: Resultados = {}) {
  /** El orden REAL en el que sonaron las dependencias; R27-R31 exige que sea uno concreto. */
  const orden: string[] = [];

  const users = {
    create: vi.fn<UserAdminRepository['create']>(async () => {
      orden.push('users.create');
      return resultados.create ?? { id: NEW_ID };
    }),
    findAliveInCompany: vi.fn<UserAdminRepository['findAliveInCompany']>(async () => {
      orden.push('users.findAliveInCompany');
      return resultados.find === undefined ? FICHA : resultados.find;
    }),
    listAliveInCompany: vi.fn<UserAdminRepository['listAliveInCompany']>(async () => {
      orden.push('users.listAliveInCompany');
      return resultados.list ?? paginaVacia();
    }),
    updateAliveInCompany: vi.fn<UserAdminRepository['updateAliveInCompany']>(async () => {
      orden.push('users.updateAliveInCompany');
      return resultados.update ?? 'ok';
    }),
    applyGuardedChange: vi.fn<UserAdminRepository['applyGuardedChange']>(async () => {
      orden.push('users.applyGuardedChange');
      return resultados.guarded ?? 'ok';
    }),
  } satisfies UserAdminRepository;

  const credentials = {
    createCredentialHash: vi.fn<InitialCredentialFactory['createCredentialHash']>(async () => {
      orden.push('credentials.createCredentialHash');
      return HASH;
    }),
  } satisfies InitialCredentialFactory;

  const log = {
    ignoredFields: vi.fn<ListQueryLog['ignoredFields']>(() => {
      orden.push('log.ignoredFields');
    }),
  } satisfies ListQueryLog;

  const now = () => AHORA;

  return {
    users,
    credentials,
    log,
    orden,
    createUser: createCreateUser({ users, credentials, now }),
    getUser: createGetUser({ users }),
    listUsers: createListUsers({ users, log }),
    updateUser: createUpdateUser({ users, now }),
    deleteUser: createDeleteUser({ users, now }),
    setUserAccountStatus: createSetUserAccountStatus({ users, now }),
  };
}

/** El `code` del error que lanzo la operacion (R41: nunca el texto del mensaje). */
async function codeDeFallo(operacion: Promise<unknown>): Promise<string> {
  const fallo = await operacion.then(
    () => null,
    (error: unknown) => error,
  );
  expect(fallo, 'la operacion no fallo').toBeInstanceOf(IdentityError);
  return (fallo as IdentityError).code;
}

/** Busca un valor en todo el arbol de argumentos: asi se demuestra que algo NO viajo (R49). */
function contieneValor(nodo: unknown, objetivo: string): boolean {
  if (nodo === objetivo) return true;
  if (nodo instanceof Date || nodo === null || typeof nodo !== 'object') return false;
  return Object.values(nodo as Record<string, unknown>).some((hijo) =>
    contieneValor(hijo, objetivo),
  );
}

/** Todas las escrituras del puerto: lo que NO se debe haber llamado cuando algo se rechaza. */
function escrituras(d: ReturnType<typeof montar>) {
  return [d.users.create, d.users.updateAliveInCompany, d.users.applyGuardedChange];
}

describe('alta de usuario (R13, R14, R15, R16, R17, R18, R49)', () => {
  it('R13 — persiste con el rol indicado, el estado `pending` y el instante, y devuelve el identificador', async () => {
    const d = montar();

    const resultado = await d.createUser(ACTOR, ENTRADA_USUARIO);

    expect(d.users.create).toHaveBeenCalledTimes(1);
    const [companyId, datos, hash, estado, instante] = d.users.create.mock.calls[0];
    expect(companyId).toBe(COMPANY_ID);
    expect(datos).toEqual(DATOS_EN_EL_PUERTO);
    expect(datos.roleId).toBe(ROLE_ID);
    expect(hash).toBe(HASH);
    // El estado con el que NACE la cuenta: `pending`, escrito como lo recibe el puerto.
    expect(estado).toBe('pending');
    expect(instante).toEqual(AHORA);
    expect(resultado).toEqual({ id: NEW_ID });
  });

  it('R13 — la marca de cambio de credencial es INVARIANTE del puerto, no un argumento que el dominio elija', async () => {
    // `create` no recibe `mustChangeCredential` por ningun lado: que la fila nazca con la marca
    // en VERDADERO es invariante del metodo, y quien lo demuestra es la integracion
    // (`tests/integration/identity/user-crud.int.test.ts`) leyendo la fila. Lo que se afirma
    // aqui es justo lo que este nivel puede afirmar: que el dominio no la pasa ni la decide, asi
    // que no hay ninguna llamada que pueda crear un usuario SIN ella.
    const d = montar();
    await d.createUser(ACTOR, ENTRADA_USUARIO);

    for (const argumento of d.users.create.mock.calls[0]) {
      expect(contieneValor(argumento, 'mustChangeCredential')).toBe(false);
    }
    expect(JSON.stringify(d.users.create.mock.calls[0])).not.toMatch(/mustChangeCredential/);
    // Y el tipo del puerto tampoco lo lleva: `create` no tiene ese parametro.
    expect(firmaDeCreate()).not.toMatch(/mustChangeCredential/);
  });

  it('R14 — la empresa sale del actor: el esquema RECHAZA un `companyId` en la entrada', async () => {
    // `strictObject`: mandar la empresa FALLA en vez de ignorarse en silencio, que es la
    // diferencia entre «no se puede» y «esperemos que nadie lo intente».
    const d = montar();

    const code = await codeDeFallo(
      d.createUser(ACTOR, { ...ENTRADA_USUARIO, companyId: OTRA_COMPANY_ID }),
    );

    expect(code).toBe('invalid_input');
    for (const escritura of escrituras(d)) expect(escritura).not.toHaveBeenCalled();
    expect(d.credentials.createCredentialHash).not.toHaveBeenCalled();
  });

  it('R14 — la empresa que llega al puerto es la del actor y de ningun otro sitio', async () => {
    // La MISMA entrada, dos actores de empresas distintas: lo que cambia en el puerto es la
    // empresa del ACTOR. No hay ninguna forma de crear un usuario en otra empresa.
    for (const companyId of [COMPANY_ID, OTRA_COMPANY_ID]) {
      const d = montar();
      await d.createUser({ ...ACTOR, companyId }, ENTRADA_USUARIO);
      expect(d.users.create.mock.calls[0][0]).toBe(companyId);
    }
  });

  it('R49 — el alta NO pasa ningun autor del cambio de estado: cinco argumentos y ninguno es el actor', async () => {
    // El `pending` inicial no se atribuye a nadie -es el `NULL` de QC-65 R10- y el identificador
    // del administrador que da el alta NO se escribe ahi. Se afirma de las tres formas que este
    // nivel permite, porque cada una tapa un descuido distinto:
    const d = montar();
    await d.createUser(ACTOR, ENTRADA_USUARIO);

    const argumentos = d.users.create.mock.calls[0];
    // 1. EXACTAMENTE cinco argumentos: un sexto «por si acaso» cae aqui.
    expect(argumentos).toHaveLength(5);
    // 2. El identificador del actor no viaja en NINGUNO de ellos, a ninguna profundidad.
    for (const [indice, argumento] of argumentos.entries()) {
      expect(contieneValor(argumento, ACTOR_ID), `el argumento ${indice} lleva el actor`).toBe(
        false,
      );
    }
    // 3. El TIPO del puerto no tiene campo de autor en `create`: rellenarlo no es expresable.
    expect(firmaDeCreate()).not.toMatch(/changedBy|ChangedBy|author|Author/);
  });

  it('R15, R16 — el hash es el que devolvio la fabrica, y el resultado no trae NADA mas que el identificador', async () => {
    const d = montar();

    const resultado = await d.createUser(ACTOR, ENTRADA_USUARIO);

    expect(d.credentials.createCredentialHash).toHaveBeenCalledTimes(1);
    expect(d.users.create.mock.calls[0][2]).toBe(HASH);
    // Las claves EXACTAS: ni la credencial, ni el hash, ni «la contraseña una sola vez».
    expect(Object.keys(resultado)).toEqual(['id']);
    expect(contieneValor(resultado, HASH)).toBe(false);
  });

  it('R17 — los tres duplicados del puerto se traducen a su error y no se crea ninguna fila', async () => {
    const ESPERADO = {
      email: 'duplicate_email',
      username: 'duplicate_username',
      document: 'duplicate_document',
    } as const;

    for (const [clave, code] of Object.entries(ESPERADO)) {
      const d = montar({ create: clave as keyof typeof ESPERADO });

      expect(await codeDeFallo(d.createUser(ACTOR, ENTRADA_USUARIO))).toBe(code);
      // Una sola llamada y ningun reintento: el duplicado lo detecto el INDICE de la base, no
      // una consulta previa de existencia, que seria una carrera.
      expect(d.users.create).toHaveBeenCalledTimes(1);
      expect(d.users.updateAliveInCompany).not.toHaveBeenCalled();
      expect(d.users.applyGuardedChange).not.toHaveBeenCalled();
    }
  });

  it('R17 — el puerto no expone NINGUNA busqueda previa por correo, usuario o documento', async () => {
    // Lo que no se puede expresar no se puede hacer por descuido: la unicidad la garantiza el
    // indice unico, y una comprobacion previa -que es una carrera- no cabe en este contrato.
    const d = montar();
    expect(Object.keys(d.users).sort()).toEqual([
      'applyGuardedChange',
      'create',
      'findAliveInCompany',
      'listAliveInCompany',
      'updateAliveInCompany',
    ]);
    expect(puertoTs).not.toMatch(/findBy(Email|Username|Document)|existsBy|countBy/i);
  });

  it('R18 — una entrada invalida se rechaza con `invalid_input` sin tocar el puerto', async () => {
    const INVALIDAS: readonly { readonly etiqueta: string; readonly entrada: unknown }[] = [
      { etiqueta: 'entrada que no es un objeto', entrada: 'Ana' },
      { etiqueta: 'falta el nombre', entrada: { ...ENTRADA_USUARIO, firstNames: '' } },
      { etiqueta: 'fecha que no es una fecha civil', entrada: { ...ENTRADA_USUARIO, birthDate: 'ayer' } },
      { etiqueta: 'tipo de documento inexistente', entrada: { ...ENTRADA_USUARIO, documentTypeCode: 'XX' } },
      { etiqueta: 'rol que no es un uuid', entrada: { ...ENTRADA_USUARIO, roleId: 'el-de-siempre' } },
    ];

    for (const { etiqueta, entrada } of INVALIDAS) {
      const d = montar();
      expect(await codeDeFallo(d.createUser(ACTOR, entrada)), etiqueta).toBe('invalid_input');
      expect(d.users.create, etiqueta).not.toHaveBeenCalled();
      // Ni se gasta un bcrypt por una entrada rota.
      expect(d.credentials.createCredentialHash, etiqueta).not.toHaveBeenCalled();
    }
  });

  it('R18 — un rol inexistente se rechaza con `role_not_found` sin escribir ninguna fila', async () => {
    for (const d of [montar({ create: 'role_not_found' })]) {
      expect(await codeDeFallo(d.createUser(ACTOR, ENTRADA_USUARIO))).toBe('role_not_found');
    }
    const d = montar({ update: 'role_not_found' });
    expect(await codeDeFallo(d.updateUser(ACTOR, TARGET_ID, ENTRADA_USUARIO))).toBe(
      'role_not_found',
    );
  });
});

describe('edicion de usuario (R19, R20)', () => {
  it('R19 — la edicion manda los NUEVE campos al puerto: reemplazo completo', async () => {
    const d = montar();

    await d.updateUser(ACTOR, TARGET_ID, ENTRADA_USUARIO);

    expect(d.users.updateAliveInCompany).toHaveBeenCalledTimes(1);
    const [companyId, id, datos, instante] = d.users.updateAliveInCompany.mock.calls[0];
    expect(companyId).toBe(COMPANY_ID);
    expect(id).toBe(TARGET_ID);
    // Los nueve, ni uno menos: `toEqual` sobre el objeto entero y las claves afirmadas aparte.
    expect(datos).toEqual(DATOS_EN_EL_PUERTO);
    expect(Object.keys(datos).sort()).toEqual([
      'birthDate',
      'documentNumber',
      'documentTypeCode',
      'email',
      'firstNames',
      'lastNames',
      'phone',
      'roleId',
      'username',
    ]);
    expect(instante).toEqual(AHORA);
  });

  it('R19 — una entrada PARCIAL no vale: no existe edicion campo a campo', async () => {
    const d = montar();

    const code = await codeDeFallo(d.updateUser(ACTOR, TARGET_ID, { phone: '+593 99 111 1111' }));

    expect(code).toBe('invalid_input');
    expect(d.users.updateAliveInCompany).not.toHaveBeenCalled();
  });

  it('R20 — el esquema de edicion no admite empresa, estado, hash, marca de credencial ni contadores', async () => {
    const PROHIBIDOS: readonly Record<string, unknown>[] = [
      { companyId: OTRA_COMPANY_ID },
      { accountStatus: 'active' },
      { accountStatusChangedBy: ACTOR_ID },
      { passwordHash: HASH },
      { mustChangeCredential: false },
      { failedLoginAttempts: 0 },
      { lockLevel: 0 },
      { lockedUntil: null },
      { deletedAt: null },
    ];

    for (const extra of PROHIBIDOS) {
      const d = montar();
      const etiqueta = Object.keys(extra)[0];
      expect(await codeDeFallo(d.updateUser(ACTOR, TARGET_ID, { ...ENTRADA_USUARIO, ...extra })), etiqueta).toBe(
        'invalid_input',
      );
      // Y lo importante: una entrada que los traiga no escribe NADA, no «escribe los otros».
      for (const escritura of escrituras(d)) expect(escritura, etiqueta).not.toHaveBeenCalled();
    }
  });
});

describe('estado de cuenta (R25, R26)', () => {
  it('R25, R26 — mover el estado escribe el nuevo valor, el instante y el actor como autor, para los CUATRO valores', async () => {
    // Los cuatro del conjunto cerrado de QC-65, `blocked` incluido: no hay transiciones
    // prohibidas en esta feature (R26), asi que se recorren todos y ninguno es un caso especial.
    expect(USER_ACCOUNT_STATUSES).toHaveLength(4);

    for (const accountStatus of USER_ACCOUNT_STATUSES) {
      const d = montar();

      await d.setUserAccountStatus(ACTOR, TARGET_ID, { accountStatus });

      expect(d.users.applyGuardedChange).toHaveBeenCalledTimes(1);
      const cambio = d.users.applyGuardedChange.mock.calls[0][0];
      expect(cambio.kind, accountStatus).toBe('account_status');
      if (cambio.kind !== 'account_status') throw new Error('el cambio no es de estado');
      expect(cambio.accountStatus).toBe(accountStatus);
      expect(cambio.now).toEqual(AHORA);
      // R25: el autor NUNCA queda vacio aqui -el `NULL` significa «lo cambio el sistema» y este
      // cambio lo hace siempre una persona-.
      expect(cambio.changedBy).toBe(ACTOR_ID);
      expect(cambio.changedBy).not.toBe('');
    }
  });

  it('R26 — un estado fuera del conjunto cerrado se rechaza con `invalid_input` sin tocar el puerto', async () => {
    const d = montar();

    expect(await codeDeFallo(d.setUserAccountStatus(ACTOR, TARGET_ID, { accountStatus: 'archivado' }))).toBe(
      'invalid_input',
    );
    expect(d.users.applyGuardedChange).not.toHaveBeenCalled();
  });
});

describe('ambito de empresa, borrados y el propio actor (R33, R34, R35, R37, R39)', () => {
  it('R33 — la empresa del actor viaja a las CINCO operaciones del puerto que la reciben', async () => {
    const d = montar();

    await d.createUser(ACTOR, ENTRADA_USUARIO);
    await d.getUser(ACTOR, TARGET_ID);
    await d.listUsers(ACTOR, { page: 1 });
    await d.updateUser(ACTOR, TARGET_ID, ENTRADA_USUARIO);
    await d.deleteUser(ACTOR, TARGET_ID);
    await d.setUserAccountStatus(ACTOR, TARGET_ID, { accountStatus: 'inactive' });

    expect(d.users.create.mock.calls[0][0]).toBe(COMPANY_ID);
    expect(d.users.findAliveInCompany.mock.calls[0][0]).toBe(COMPANY_ID);
    expect(d.users.listAliveInCompany.mock.calls[0][0]).toBe(COMPANY_ID);
    expect(d.users.updateAliveInCompany.mock.calls[0][0]).toBe(COMPANY_ID);
    // Las dos operaciones guardadas comparten el mismo metodo, y las dos la llevan.
    expect(d.users.applyGuardedChange.mock.calls.map(([cambio]) => cambio.companyId)).toEqual([
      COMPANY_ID,
      COMPANY_ID,
    ]);
  });

  it('R33, R34 — el usuario de otra empresa o ya borrado responde `user_not_found` en las cuatro operaciones por identificador', async () => {
    // El puerto dice `null` / `'not_found'` -sus metodos son `…AliveInCompany`, asi que el
    // `deleted_at IS NULL` y el `company_id = ?` son SUYOS y ningun caso de uso puede
    // olvidarlos- y el dominio lo traduce al mismo error en los cuatro: distinguirlos
    // convertiria la ficha en un oraculo de existencia sobre datos ajenos.
    const ficha = montar({ find: null });
    expect(await codeDeFallo(ficha.getUser(ACTOR, TARGET_ID))).toBe('user_not_found');

    const edicion = montar({ update: 'not_found' });
    expect(await codeDeFallo(edicion.updateUser(ACTOR, TARGET_ID, ENTRADA_USUARIO))).toBe(
      'user_not_found',
    );

    const borrado = montar({ guarded: 'not_found' });
    expect(await codeDeFallo(borrado.deleteUser(ACTOR, TARGET_ID))).toBe('user_not_found');

    const estado = montar({ guarded: 'not_found' });
    expect(
      await codeDeFallo(estado.setUserAccountStatus(ACTOR, TARGET_ID, { accountStatus: 'active' })),
    ).toBe('user_not_found');

    // R34: «sin modificar ninguna fila». Cada caso pidio UNA operacion, la que el puerto
    // rechazo, y ninguna otra escritura sono detras del no-encontrado.
    expect(ficha.users.create).not.toHaveBeenCalled();
    expect(ficha.users.updateAliveInCompany).not.toHaveBeenCalled();
    expect(ficha.users.applyGuardedChange).not.toHaveBeenCalled();
    expect(edicion.users.updateAliveInCompany).toHaveBeenCalledTimes(1);
    expect(edicion.users.applyGuardedChange).not.toHaveBeenCalled();
    expect(borrado.users.applyGuardedChange).toHaveBeenCalledTimes(1);
    expect(borrado.users.updateAliveInCompany).not.toHaveBeenCalled();
    expect(estado.users.applyGuardedChange).toHaveBeenCalledTimes(1);
    expect(estado.users.updateAliveInCompany).not.toHaveBeenCalled();
  });

  it('R35 — el listado excluye al propio actor y la ficha de su propio identificador no llega al puerto', async () => {
    const d = montar();

    await d.listUsers(ACTOR, { page: 1 });
    // `excludeUserId` es un argumento OBLIGATORIO del puerto: como opcional, un llamante nuevo
    // se olvidaria y el actor reapareceria en su propio listado.
    expect(d.users.listAliveInCompany.mock.calls[0][1]).toBe(ACTOR_ID);

    expect(await codeDeFallo(d.getUser(ACTOR, ACTOR_ID))).toBe('user_not_found');
    // Y no se consulta lo que no se va a devolver: la comprobacion va ANTES del puerto.
    expect(d.users.findAliveInCompany).not.toHaveBeenCalled();
  });

  it('R37 — borrar pide un cambio guardado de tipo `delete`, y el puerto no tiene ningun borrado fisico', async () => {
    const d = montar();

    await d.deleteUser(ACTOR, TARGET_ID);

    expect(d.users.applyGuardedChange).toHaveBeenCalledTimes(1);
    const cambio = d.users.applyGuardedChange.mock.calls[0][0];
    expect(cambio.kind).toBe('delete');
    expect(cambio.id).toBe(TARGET_ID);
    expect(cambio.now).toEqual(AHORA);

    // Ningun metodo del contrato borra fisicamente: la fila se conserva entera y lo que se marca
    // es el instante del borrado. Lo que no existe en el puerto no se puede llamar por descuido.
    expect(Object.keys(d.users).filter((clave) => /delete|remove|destroy|purge/i.test(clave))).toEqual(
      [],
    );
    expect(puertoTs).not.toMatch(/hardDelete|deleteMany|\bdestroy\b|purge/i);
  });

  it('R39 — no hay recuperacion ni listado de borrados, ni por el puerto ni por la puerta del filtro', async () => {
    const d = montar();
    expect(puertoTs).not.toMatch(/restore|undelete|unDelete|recover|listDeleted|withDeleted/i);
    expect(Object.keys(d.users).filter((clave) => /restore|recover|deleted/i.test(clave))).toEqual(
      [],
    );

    // Y `deletedAt` no es consultable: no esta en el orden ni en los filtros declarados, asi que
    // nadie puede pedir ver los borrados pidiendo ordenar o filtrar por esa columna.
    expect(USER_QUERYABLE.sortable).not.toContain('deletedAt');
    expect(Object.keys(USER_QUERYABLE.filterable)).not.toContain('deletedAt');
  });
});

describe('listado: los cinco pasos, en orden (R27, R28, R29, R30, R31)', () => {
  it('R27 — devuelve la pagina del puerto tal cual: el defecto de 10 y el tope de 25 son del adaptador', async () => {
    // Lo que ESTE nivel puede demostrar es que el caso de uso no inventa ni recorta la pagina.
    // El defecto de 10, el tope de 25 y el orden real son del adaptador driven, que es el unico
    // que puede importar `lib/shared/pagination` y traducir a SQL: su prueba esta en
    // `tests/integration/identity/user-crud.int.test.ts`.
    const pagina: Page<UserRow> = {
      items: [
        {
          id: TARGET_ID,
          displayName: 'Perez Loor Ana Maria',
          username: 'aperez',
          email: 'ana.perez@empresa.test',
          roleName: 'Operador',
          accountStatus: 'pending',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    };
    const d = montar({ list: pagina });

    expect(await d.listUsers(ACTOR, { page: 1, pageSize: 10 })).toEqual(pagina);
    // R31: la fila trae las SEIS claves de la proyeccion y ninguna de credencial.
    expect(Object.keys(pagina.items[0]).sort()).toEqual([
      'accountStatus',
      'displayName',
      'email',
      'id',
      'roleName',
      'username',
    ]);
  });

  it('R28, R29 — la busqueda y el filtro por estado declarados llegan al puerto sin tocarse', async () => {
    const d = montar();

    await d.listUsers(ACTOR, {
      page: 2,
      pageSize: 25,
      search: 'perez',
      filters: { accountStatus: { kind: 'select', values: ['active', 'blocked'] } },
      sort: { columnId: 'lastNames', direction: 'asc' },
    });

    const consulta: ListQuery = d.users.listAliveInCompany.mock.calls[0][2];
    expect(consulta.search).toBe('perez');
    expect(consulta.filters).toEqual({
      accountStatus: { kind: 'select', values: ['active', 'blocked'] },
    });
    expect(consulta.sort).toEqual({ columnId: 'lastNames', direction: 'asc' });
    expect(consulta.page).toBe(2);
    expect(consulta.pageSize).toBe(25);
    // Nada que omitir: el log se llama SIEMPRE, con la lista vacia.
    expect(d.log.ignoredFields).toHaveBeenCalledWith('users', []);
  });

  it('R27, R30 — un campo no declarado se OMITE y se registra, en vez de romper la consulta', async () => {
    // El test que no puede faltar: pedir orden por `deletedAt` y un filtro que nadie declaro, y
    // comprobar LAS TRES COSAS A LA VEZ -que la consulta no falla, que el orden se cae al de por
    // defecto (`sort: null`, que el adaptador resuelve a `last_names, first_names, id`) y que el
    // log recibio los dos campos-. Comprobar solo la primera pasa en verde con un `catch` vacio.
    const d = montar();

    await d.listUsers(ACTOR, {
      page: 1,
      sort: { columnId: 'deletedAt', direction: 'desc' },
      filters: {
        accountStatus: { kind: 'select', values: ['active'] },
        inventado: { kind: 'text', value: 'x' },
      },
    });

    const consulta: ListQuery = d.users.listAliveInCompany.mock.calls[0][2];
    expect(consulta.sort).toBeNull();
    expect(consulta.filters).toEqual({ accountStatus: { kind: 'select', values: ['active'] } });
    expect(d.log.ignoredFields).toHaveBeenCalledTimes(1);
    const [lista, omitidos] = d.log.ignoredFields.mock.calls[0];
    expect(lista).toBe('users');
    expect([...omitidos].sort()).toEqual(['deletedAt', 'inventado']);
  });

  it('R27 — los pasos suenan en orden: primero el log de lo omitido, despues el puerto con la consulta saneada', async () => {
    // El orden es el requisito: el puerto recibe la consulta YA SANEADA, nunca la cruda. Si el
    // saneado ocurriera despues de consultar, el `deletedAt` llegaria al `ORDER BY`.
    const d = montar();

    await d.listUsers(ACTOR, { page: 1, sort: { columnId: 'deletedAt', direction: 'asc' } });

    expect(d.orden).toEqual(['log.ignoredFields', 'users.listAliveInCompany']);
  });

  it('R27 — una consulta con la forma rota se rechaza con `invalid_input` sin tocar el puerto ni el log', async () => {
    const d = montar();

    expect(await codeDeFallo(d.listUsers(ACTOR, { page: 'primera' }))).toBe('invalid_input');
    expect(d.users.listAliveInCompany).not.toHaveBeenCalled();
    expect(d.log.ignoredFields).not.toHaveBeenCalled();
  });
});

/** La firma de `create` en el fuente del puerto, sin comentarios: R13 y R49 afirman sobre ella. */
function firmaDeCreate(): string {
  const firma = /create\(([\s\S]*?)\):/.exec(puertoTs);
  expect(firma, 'no se encontro la firma de `create` en el puerto').not.toBeNull();
  return firma === null ? '' : firma[1];
}
