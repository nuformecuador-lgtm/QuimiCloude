// QC-66 T14 — Las SEIS Server Actions de la administracion de usuarios
// (`lib/modules/identity/adapters/driving/user-actions.ts`, `design.md > 10`).
//
// Cubre:
//   - **R6**: el actor sale de las DOS CARAS de la sesion del servidor via `@/lib/composition`
//     —`getSessionUser()` el id y los permisos, `getSessionContext()` la EMPRESA— y si falta
//     CUALQUIERA de las dos el actor es `null` y el caso de uso rechaza SIN tocar el puerto. Los
//     dos casos se prueban POR SEPARADO, y contra el caso de uso REAL con un repositorio que
//     revienta si alguien lo llama: asi «sin tocar el puerto» es una afirmacion y no una ausencia
//     de asercion.
//   - **R40**: `FormData` de verdad en las CUATRO mutaciones y argumentos ya tipados en las DOS
//     consultas.
//   - **R41**: cada error de dominio de `design.md > 6.4` —y los que anadieron QC-79 y el fix
//     directo— se traduce a
//     `{ status: 'error', code, message }` por su `code` ESTABLE, **nunca** por el texto del
//     mensaje; y un error que no es de dominio no se descarta.
//
// QC-70, aplicado a `identity` el 2026-09-10: la traduccion la hace el traductor UNICO
// (`createErrorStateTranslator`), `not_found` pasa a ser `user_not_found` (enmienda a QC-70 R25) y
// un error AJENO al dominio ya NO se relanza —el caso que fijaba `rejects.toThrow(...)` se
// reescribe—: se devuelve como `unexpected` con mensaje neutro y el texto original va al registro
// del servidor, que es el unico sitio donde aparece (R12, R13, R14).
//   - **R16**: el ESTADO SERIALIZADO del alta no contiene ninguna credencial ni ningun hash, y se
//     afirma sobre el objeto COMPLETO (sus claves exactas y su serializacion entera), no sobre una
//     clave suelta.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/unidades/unit-actions.test.ts` y `tests/unit/proveedores/supplier-actions.test.ts`:
// la action se testea contra dobles, nunca contra la sesion real. Que la autorizacion rechace de
// verdad lo prueban los casos de uso en `authorization.test.ts` contra el dominio real; aqui lo que
// se demuestra es que la action NO DECIDE NADA y traduce.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { errorMessage, type ErrorCode } from '@/lib/modules/errores';
import {
  ActionNotAllowedError,
  CredentialPolicyRejectedError,
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdministratorError,
  UserNotFoundError,
  RoleNotFoundError,
  SelfOperationError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/identity';
import {
  createUserAction,
  deleteUserAction,
  getUserAction,
  listUsersAction,
  setUserAccountStatusAction,
  updateUserAction,
} from '@/lib/modules/identity/adapters/driving/user-actions';
import { createCreateUser } from '@/lib/modules/identity/domain/create-user';
import { createDeleteUser } from '@/lib/modules/identity/domain/delete-user';
import { createGetUser } from '@/lib/modules/identity/domain/get-user';
import { createListUsers } from '@/lib/modules/identity/domain/list-users';
import { createSetUserAccountStatus } from '@/lib/modules/identity/domain/set-user-account-status';
import { createUpdateUser } from '@/lib/modules/identity/domain/update-user';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { CredentialPolicyResult } from '@/lib/modules/identity/domain/credential-policy';
import type { CredentialSetupLinkRepository } from '@/lib/modules/identity/ports/credential-setup-link-repository';
import type { CredentialSetupMailer } from '@/lib/modules/identity/ports/credential-setup-mailer';
import type { CredentialSetupSecretFactory } from '@/lib/modules/identity/ports/credential-setup-secret-factory';
import type { PasswordHasher } from '@/lib/modules/identity/ports/password-hasher';
import type { ListQueryLog } from '@/lib/modules/identity/ports/list-query-log';
import type { UserAdminRepository } from '@/lib/modules/identity/ports/user-admin-repository';

const {
  getSessionUserMock,
  getSessionContextMock,
  createUserMock,
  getUserMock,
  listUsersMock,
  updateUserMock,
  deleteUserMock,
  setUserAccountStatusMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  createUserMock: vi.fn(),
  getUserMock: vi.fn(),
  listUsersMock: vi.fn(),
  updateUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  setUserAccountStatusMock: vi.fn(),
}));

// QC-71 (T7, R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera
// del identificador y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga; con ella, el estado del error inesperado vuelve con ESE id.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    createUser: createUserMock,
    getUser: getUserMock,
    listUsers: listUsersMock,
    updateUser: updateUserMock,
    deleteUser: deleteUserMock,
    setUserAccountStatus: setUserAccountStatusMock,
  },
}));

/** La sesion conserva `roleName` porque es DISPLAY (lo pinta `nav-user`), pero la action no lo
 *  mira: lo que viaja al caso de uso es el CONJUNTO DE PERMISOS (R4). */
const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** La OTRA cara de la sesion: de aqui sale la EMPRESA, nunca de la entrada del llamante (R14). */
const SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-1',
  roleName: 'Administrador',
};

/** Igualdad ESTRICTA contra esto es lo que pone en rojo un `roleName` o un `companyId` que
 *  llegaran de otro sitio. */
const ACTOR_ESPERADO: Actor = {
  id: 'user-admin-1',
  companyId: 'company-1',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** Los nueve campos del formulario de alta/edicion (`design.md > 6.1`), como los manda un
 *  `<form>`: cadenas, con la fecha en `YYYY-MM-DD` de un `<input type="date">`. */
const CAMPOS_DEL_FORMULARIO = {
  firstNames: 'Luis Carlos',
  lastNames: 'Gomez Rua',
  birthDate: '1990-04-17',
  email: 'luis@quimicloude.test',
  phone: '3001234567',
  documentTypeCode: 'CC',
  documentNumber: '1020304050',
  username: 'luis.gomez',
  roleId: '11111111-1111-4111-8111-111111111111',
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const FICHA = {
  id: 'user-2',
  firstNames: 'Luis Carlos',
  lastNames: 'Gomez Rua',
  birthDate: new Date('1990-04-17T00:00:00.000Z'),
  email: 'luis@quimicloude.test',
  phone: '3001234567',
  documentTypeCode: 'CC',
  documentNumber: '1020304050',
  username: 'luis.gomez',
  roleId: '11111111-1111-4111-8111-111111111111',
  roleName: 'Operador',
  accountStatus: 'pending' as const,
  accountStatusChangedAt: new Date('2026-09-10T12:00:00.000Z'),
  createdAt: new Date('2026-09-10T12:00:00.000Z'),
  updatedAt: new Date('2026-09-10T12:00:00.000Z'),
};

const PAGINA = {
  items: [
    {
      id: 'user-2',
      displayName: 'Gomez Rua Luis Carlos',
      username: 'luis.gomez',
      email: 'luis@quimicloude.test',
      roleName: 'Operador',
      accountStatus: 'pending' as const,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R40 — los SEIS caminos: `FormData` en las mutaciones, argumentos tipados en las consultas.
// ---------------------------------------------------------------------------------------------

describe('las seis Server Actions con sesion completa (R6, R40)', () => {
  it('createUserAction lee los nueve campos del FormData y devuelve el id creado', async () => {
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'not_needed' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    // Los campos viajan TAL CUAL: la action no recorta, no convierte y no rellena nada. Y el
    // candidato NO lleva `companyId`, ni `accountStatus`, ni ningun hash (R14, R16, R13): que el
    // aserto sea de igualdad ESTRICTA es lo que pondria en rojo un campo de mas.
    //
    // ENMENDADO por QC-79 R1: al candidato se le suma el DECIMO campo, `credential`, que es
    // OPCIONAL. El formulario de este caso no lo manda, asi que llega como la cadena vacia -que
    // R1 obliga a tratar IGUAL que la ausencia- y quien la interpreta es el DOMINIO, no la
    // action. La expectativa no se debilita: sigue siendo igualdad estricta del objeto entero.
    expect(createUserMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      ...CAMPOS_DEL_FORMULARIO,
      credential: '',
    });
    // ENMENDADO por QC-79 R30: el exito del alta dice ademas COMO ACABO EL CORREO. Sin
    // contrasena escrita no hubo enlace que enviar, y eso es `'not_needed'` (R3).
    expect(resultado).toEqual({ status: 'success', id: 'user-nuevo', mail: 'not_needed' });
  });

  it('updateUserAction recibe el id por parametro y los nueve campos por FormData', async () => {
    updateUserMock.mockResolvedValue(undefined);

    const resultado = await updateUserAction(
      'user-2',
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    expect(updateUserMock).toHaveBeenCalledWith(
      ACTOR_ESPERADO,
      'user-2',
      CAMPOS_DEL_FORMULARIO,
    );
    expect(resultado).toEqual({ status: 'success' });
  });

  it('deleteUserAction lee el id del campo oculto del FormData', async () => {
    deleteUserMock.mockResolvedValue(undefined);

    const resultado = await deleteUserAction({ status: 'idle' }, formData({ id: 'user-2' }));

    expect(deleteUserMock).toHaveBeenCalledWith(ACTOR_ESPERADO, 'user-2');
    expect(resultado).toEqual({ status: 'success' });
  });

  it('setUserAccountStatusAction lee el id y el estado destino del FormData, sin autor ni instante', async () => {
    setUserAccountStatusMock.mockResolvedValue(undefined);

    const resultado = await setUserAccountStatusAction(
      { status: 'idle' },
      formData({ id: 'user-2', accountStatus: 'blocked' }),
    );

    // El autor y el instante del cambio los escribe el caso de uso (R25): la action NO los
    // construye, y la igualdad estricta del tercer argumento es lo que lo demuestra.
    expect(setUserAccountStatusMock).toHaveBeenCalledWith(ACTOR_ESPERADO, 'user-2', {
      accountStatus: 'blocked',
    });
    expect(resultado).toEqual({ status: 'success' });
  });

  it('getUserAction recibe el id como argumento TIPADO, no por FormData', async () => {
    getUserMock.mockResolvedValue(FICHA);

    const resultado = await getUserAction('user-2');

    expect(getUserMock).toHaveBeenCalledWith(ACTOR_ESPERADO, 'user-2');
    expect(resultado).toEqual({ status: 'success', data: FICHA });
  });

  it('listUsersAction recibe la consulta como argumento TIPADO y la deja pasar sin interpretarla', async () => {
    listUsersMock.mockResolvedValue(PAGINA);

    const consulta = { page: 2, pageSize: 25, search: 'gomez' };
    const resultado = await listUsersAction(consulta);

    // La action no aplica el defecto de 10 ni el tope de 25 (R27) ni poda la consulta: eso vive
    // en `list-users.ts`. Aqui se verifica que llega IDENTICA.
    expect(listUsersMock).toHaveBeenCalledWith(ACTOR_ESPERADO, consulta);
    expect(resultado).toEqual({ status: 'success', data: PAGINA });
  });

  it('las dos caras de la sesion se consultan una vez por invocacion y la empresa sale del contexto', async () => {
    getUserMock.mockResolvedValue(FICHA);

    await getUserAction('user-2');

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// R6 — LAS DOS CARAS DE LA SESION, cada una por separado. Sin una de ellas el actor es `null`, el
// caso de uso REAL rechaza con `unauthorized` y el repositorio NO SE TOCA.
// ---------------------------------------------------------------------------------------------

/** Repositorio doble que REVIENTA si alguien lo llama: es lo que convierte «no llega al puerto»
 *  en una afirmacion y no en una ausencia de asercion. */
function repositorioQueNoDebeLlamarse(): UserAdminRepository {
  const revienta = (metodo: string) => async (): Promise<never> => {
    throw new Error(`${metodo} no debia invocarse: la sesion estaba incompleta`);
  };
  return {
    create: vi.fn(revienta('create')),
    findAliveInCompany: vi.fn(revienta('findAliveInCompany')),
    listAliveInCompany: vi.fn(revienta('listAliveInCompany')),
    updateAliveInCompany: vi.fn(revienta('updateAliveInCompany')),
    applyGuardedChange: vi.fn(revienta('applyGuardedChange')),
  } as unknown as UserAdminRepository;
}

/**
 * Las dependencias de credencial del alta tampoco deben llegar a usarse: sin sesion completa no se
 * gasta un bcrypt, no se evalua la politica, no se fabrica ningun secreto, no se emite ningun enlace
 * y **no se manda ningun correo** (QC-66 R16; QC-79 R6, R7).
 *
 * ENMENDADO por QC-79: donde habia UNA fabrica de credencial inicial -que generaba la contrasena al
 * azar, QC-66 R15- ahora hay cinco dependencias, porque R4 quita esa generacion y el acceso lo da el
 * enlace. La expectativa no se debilita: antes reventaba un doble, ahora revientan cinco.
 */
function credencialQueNoDebeLlamarse() {
  const revientaCon = (nombre: string) =>
    vi.fn(async () => {
      throw new Error(`${nombre} no debia invocarse: la sesion estaba incompleta`);
    });

  return {
    passwordHasher: {
      hash: revientaCon('passwordHasher.hash'),
      verify: revientaCon('passwordHasher.verify'),
    } as unknown as PasswordHasher,
    checkCredentialPolicy: revientaCon('checkCredentialPolicy') as unknown as (
      candidate: string,
    ) => Promise<CredentialPolicyResult>,
    secrets: {
      create: vi.fn(() => {
        throw new Error('secrets.create no debia invocarse: la sesion estaba incompleta');
      }),
    } as unknown as CredentialSetupSecretFactory,
    links: {
      issueForPendingUser: revientaCon('links.issueForPendingUser'),
      applyCredentialAndActivate: revientaCon('links.applyCredentialAndActivate'),
    } as unknown as CredentialSetupLinkRepository,
    mailer: {
      sendCredentialSetupLink: revientaCon('mailer.sendCredentialSetupLink'),
    } as unknown as CredentialSetupMailer,
  };
}

const LOG_MUDO: ListQueryLog = { ignoredFields: vi.fn() };

/** Cablea los SEIS casos de uso REALES sobre el repositorio que revienta y los enchufa a la
 *  fachada doblada, para que la action invoque dominio de verdad. */
function cablearCasosDeUsoReales(): UserAdminRepository {
  const users = repositorioQueNoDebeLlamarse();

  const createUserReal = createCreateUser({ users, ...credencialQueNoDebeLlamarse() });
  const getUserReal = createGetUser({ users });
  const listUsersReal = createListUsers({ users, log: LOG_MUDO });
  const updateUserReal = createUpdateUser({ users });
  const deleteUserReal = createDeleteUser({ users });
  const setStatusReal = createSetUserAccountStatus({ users });

  createUserMock.mockImplementation((actor: Actor | null, input: unknown) =>
    createUserReal(actor, input),
  );
  getUserMock.mockImplementation((actor: Actor | null, id: string) => getUserReal(actor, id));
  listUsersMock.mockImplementation((actor: Actor | null, input: unknown) =>
    listUsersReal(actor, input),
  );
  updateUserMock.mockImplementation((actor: Actor | null, id: string, input: unknown) =>
    updateUserReal(actor, id, input),
  );
  deleteUserMock.mockImplementation((actor: Actor | null, id: string) =>
    deleteUserReal(actor, id),
  );
  setUserAccountStatusMock.mockImplementation(
    (actor: Actor | null, id: string, input: unknown) => setStatusReal(actor, id, input),
  );

  return users;
}

const INVOCACIONES: ReadonlyArray<{
  readonly nombre: string;
  readonly ejecutar: () => Promise<{ status: string; code?: string }>;
  readonly doble: ReturnType<typeof vi.fn>;
}> = [
  {
    nombre: 'createUserAction',
    ejecutar: () => createUserAction({ status: 'idle' }, formData(CAMPOS_DEL_FORMULARIO)),
    doble: createUserMock,
  },
  {
    nombre: 'updateUserAction',
    ejecutar: () =>
      updateUserAction('user-2', { status: 'idle' }, formData(CAMPOS_DEL_FORMULARIO)),
    doble: updateUserMock,
  },
  {
    nombre: 'deleteUserAction',
    ejecutar: () => deleteUserAction({ status: 'idle' }, formData({ id: 'user-2' })),
    doble: deleteUserMock,
  },
  {
    nombre: 'setUserAccountStatusAction',
    ejecutar: () =>
      setUserAccountStatusAction(
        { status: 'idle' },
        formData({ id: 'user-2', accountStatus: 'active' }),
      ),
    doble: setUserAccountStatusMock,
  },
  {
    nombre: 'getUserAction',
    ejecutar: () => getUserAction('user-2'),
    doble: getUserMock,
  },
  {
    nombre: 'listUsersAction',
    ejecutar: () => listUsersAction({ page: 1 }),
    doble: listUsersMock,
  },
];

describe('R6 — falta la PRIMERA cara: no hay getSessionUser', () => {
  for (const caso of INVOCACIONES) {
    it(`${caso.nombre}: responde unauthorized con actor null y sin tocar el repositorio`, async () => {
      const users = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

      const resultado = await caso.ejecutar();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      // El actor que llega al caso de uso es `null`: la action no adivina la empresa ni rellena
      // el conjunto de permisos cuando falta una cara de la sesion.
      expect(caso.doble.mock.calls[0]?.[0]).toBeNull();
      expect(users.create).not.toHaveBeenCalled();
      expect(users.findAliveInCompany).not.toHaveBeenCalled();
      expect(users.listAliveInCompany).not.toHaveBeenCalled();
      expect(users.updateAliveInCompany).not.toHaveBeenCalled();
      expect(users.applyGuardedChange).not.toHaveBeenCalled();
    });
  }
});

describe('R6 — falta la SEGUNDA cara: hay getSessionUser pero no getSessionContext', () => {
  for (const caso of INVOCACIONES) {
    it(`${caso.nombre}: responde unauthorized con actor null y sin tocar el repositorio`, async () => {
      const users = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(SESSION_USER);
      getSessionContextMock.mockResolvedValue(null);

      const resultado = await caso.ejecutar();

      // La EMPRESA solo sale del contexto de sesion (R14): sin contexto no hay actor, aunque la
      // sesion traiga un usuario con los dos permisos. Si alguien «arreglase» esto inventando
      // una empresa, este caso se pondria rojo.
      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      expect(caso.doble.mock.calls[0]?.[0]).toBeNull();
      expect(users.create).not.toHaveBeenCalled();
      expect(users.findAliveInCompany).not.toHaveBeenCalled();
      expect(users.listAliveInCompany).not.toHaveBeenCalled();
      expect(users.updateAliveInCompany).not.toHaveBeenCalled();
      expect(users.applyGuardedChange).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------------------------
// R41 — la traduccion de los `code` de `design.md > 6.4`, por CODIGO y nunca por el texto.
// NUEVE de origen, DIEZ desde el fix directo (2026-09-22) que anadio `action_not_allowed`.
// ---------------------------------------------------------------------------------------------

describe('R41 — traduccion de errores de dominio por su code estable', () => {
  const LOS_DIEZ: ReadonlyArray<{ readonly error: Error; readonly code: ErrorCode }> = [
    { error: new UnauthorizedError(), code: 'unauthorized' },
    { error: new UserNotFoundError(), code: 'user_not_found' },
    { error: new DuplicateEmailError(), code: 'duplicate_email' },
    { error: new DuplicateUsernameError(), code: 'duplicate_username' },
    { error: new DuplicateDocumentError(), code: 'duplicate_document' },
    { error: new RoleNotFoundError(), code: 'role_not_found' },
    { error: new SelfOperationError(), code: 'self_operation' },
    { error: new LastAdministratorError(), code: 'last_administrator' },
    { error: new ValidationError(), code: 'invalid_input' },
    // Fix directo (2026-09-22): la regla de negocio que rechaza la ACCION, no el permiso.
    { error: new ActionNotAllowedError(), code: 'action_not_allowed' },
  ];

  for (const caso of LOS_DIEZ) {
    it(`createUserAction traduce ${caso.error.constructor.name} a code '${caso.code}'`, async () => {
      createUserMock.mockRejectedValue(caso.error);

      const resultado = await createUserAction(
        { status: 'idle' },
        formData(CAMPOS_DEL_FORMULARIO),
      );

      // Se afirma sobre `code`, NO sobre `message`: el texto puede cambiar de redaccion o de
      // idioma sin que QC-67 se entere, y un test que mirase el mensaje lo impediria.
      expect(resultado).toMatchObject({ status: 'error', code: caso.code });
    });
  }

  // Los cinco caminos restantes tambien traducen, y con la misma funcion: un `code` distinto por
  // accion seria un contrato distinto para el mismo fallo.
  const CAMINOS: ReadonlyArray<{
    readonly nombre: string;
    readonly doble: ReturnType<typeof vi.fn>;
    readonly ejecutar: () => Promise<{ status: string }>;
  }> = [
    {
      nombre: 'updateUserAction',
      doble: updateUserMock,
      ejecutar: () =>
        updateUserAction('user-2', { status: 'idle' }, formData(CAMPOS_DEL_FORMULARIO)),
    },
    {
      nombre: 'deleteUserAction',
      doble: deleteUserMock,
      ejecutar: () => deleteUserAction({ status: 'idle' }, formData({ id: 'user-2' })),
    },
    {
      nombre: 'setUserAccountStatusAction',
      doble: setUserAccountStatusMock,
      ejecutar: () =>
        setUserAccountStatusAction(
          { status: 'idle' },
          formData({ id: 'user-2', accountStatus: 'inactive' }),
        ),
    },
    { nombre: 'getUserAction', doble: getUserMock, ejecutar: () => getUserAction('user-2') },
    {
      nombre: 'listUsersAction',
      doble: listUsersMock,
      ejecutar: () => listUsersAction({ page: 1 }),
    },
  ];

  for (const camino of CAMINOS) {
    for (const caso of LOS_DIEZ) {
      it(`${camino.nombre} traduce ${caso.error.constructor.name} a code '${caso.code}'`, async () => {
        camino.doble.mockRejectedValue(caso.error);

        const resultado = await camino.ejecutar();

        expect(resultado).toMatchObject({ status: 'error', code: caso.code });
      });
    }
  }

  // QC-70 (R7, R11): el mensaje ya NO viaja «tal cual lo trae el error» —nadie puede pasarle uno—
  // sino que sale del CATALOGO por el codigo, y el estado serializado son EXACTAMENTE esos tres
  // campos. El `diagnostic` que el dominio puede llevar NO cruza (R29, R30): se pasa uno
  // reconocible y se comprueba que no aparece en ninguna parte del estado.
  it('el mensaje sale del catalogo por el code, y el diagnostico NO cruza al navegador', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserMock.mockRejectedValue(new UserNotFoundError('user-id=user-2 empresa=otra'));

    const resultado = await getUserAction('user-2');

    expect(resultado).toEqual({
      status: 'error',
      code: 'user_not_found',
      message: errorMessage('user_not_found'),
    });
    expect(JSON.stringify(resultado)).not.toContain('user-id=user-2');
    // El diagnostico va al REGISTRO DEL SERVIDOR, que es el unico sitio donde aparece (R28).
    expect(log).toHaveBeenCalledWith({
      code: 'user_not_found',
      diagnostic: 'user-id=user-2 empresa=otra',
    });
    log.mockRestore();
  });

  it('un error que NO es de dominio se traduce a `unexpected` y no filtra su texto', async () => {
    // QC-70 (R12, R13, R14): antes esto era `rejects.toThrow('fallo de infraestructura')`. Ahora la
    // action devuelve estado, el navegador ve el mensaje neutro y el error original va al registro
    // del servidor. Sigue sin descartarse: lo que cambia es por donde sale.
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ajeno = new Error('fallo de infraestructura');
    createUserMock.mockRejectedValue(ajeno);

    const resultado = await createUserAction({ status: 'idle' }, formData(CAMPOS_DEL_FORMULARIO));

    expect(resultado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 (R13): el estado del error INESPERADO vuelve con el identificador de la peticion
      // —el mismo que se escribio en la linea del registro—, y su ausencia ya no compila (R16).
      // El catalogado sigue sin el (R15).
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('fallo de infraestructura');
    // QC-71 (R10, R12): la linea del registro deja de ser el objeto de QC-70 y pasa a ser UNA
    // linea de texto con el identificador, el origen, el codigo y el detalle del error. Lo que
    // este caso fijaba NO se relaja: el texto original sigue llegando entero al registro, y solo ahi.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `[error] requestId=${REQUEST_ID_DE_PRUEBA} origen=borde code=unexpected error=${ajeno.name}: ${ajeno.message}`,
      ),
    );
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------
// R16 — la credencial no sale por aqui tampoco. Se afirma sobre el objeto SERIALIZADO COMPLETO.
// ---------------------------------------------------------------------------------------------

describe('R16 — el estado serializado del alta no lleva credencial ni hash', () => {
  it('el estado de exito tiene EXACTAMENTE las claves status, id y mail, y nada mas', async () => {
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'sent' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    // Las claves EXACTAS, no «faltan algunas»: un `password` o un `credentialHash` que alguien
    // añadiera al estado pondria esta linea en rojo aunque el resto del test siguiera verde.
    //
    // ENMENDADO por QC-79 R30: la tercera clave es `mail`, y es un valor CERRADO
    // (`'sent' | 'failed' | 'not_needed'`), no un texto libre: `design.md > 4.7` punto 2 pide que
    // el tipo no tenga ningun hueco donde colar el secreto ni la contrasena, y este aserto es esa
    // frase escrita como test. La expectativa no se debilita: se afirma sobre las claves EXACTAS
    // y sobre el objeto ENTERO, igual que antes.
    expect(Object.keys(resultado).sort()).toEqual(['id', 'mail', 'status']);
    expect(resultado).toEqual({ status: 'success', id: 'user-nuevo', mail: 'sent' });
  });

  it('la serializacion ENTERA del estado no contiene ninguna palabra de credencial', async () => {
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'failed' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    // Se inspecciona el JSON completo —claves Y valores—, que es lo que de verdad cruza hacia el
    // cliente, no una clave concreta que hubiera que acertar de antemano.
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toMatch(/password|contrase|credential|hash|\$2[aby]\$/i);
  });

  it('el estado de ERROR del alta tampoco lleva credencial: solo status, code y message', async () => {
    // Si el caso de uso fallase DESPUES de generar la credencial, el estado de error sigue
    // siendo los tres campos de R41 y nada mas: la contrasena no se filtra por un mensaje.
    createUserMock.mockRejectedValue(new DuplicateEmailError());

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    expect(Object.keys(resultado).sort()).toEqual(['code', 'message', 'status']);
    expect(JSON.stringify(resultado)).not.toMatch(/password|contrase|credential|hash|\$2[aby]\$/i);
  });

  it('el candidato que la action manda al caso de uso no incluye ningun campo de hash', async () => {
    // El otro extremo del mismo requisito: ni entra ni sale. Aunque el formulario mandase un
    // `password` o un `passwordHash`, la action no los lee -los campos estan ENUMERADOS- y
    // `strictObject` los rechazaria si llegasen.
    //
    // ENMENDADO por QC-79 R1: el candidato lleva ahora DIEZ claves, porque `credential` es un
    // campo legitimo del alta desde esta ficha. Lo que este caso sigue prohibiendo -y es lo que
    // le daba valor- es que se cuele CUALQUIER OTRA: un `password`, un `passwordHash`, un
    // `companyId` o un `accountStatus`. La lista esperada se escribe explicita para que un campo
    // de mas se vea, y las dos claves de hash se comprueban ausentes una por una.
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'not_needed' });

    await createUserAction(
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, password: 'Secreta-123', passwordHash: 'x' }),
    );

    const candidato = createUserMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(candidato).sort()).toEqual(
      [...Object.keys(CAMPOS_DEL_FORMULARIO), 'credential'].sort(),
    );
    expect(candidato.password).toBeUndefined();
    expect(candidato.passwordHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// QC-79 T18 (R2, R30) — bloque NUEVO al final, aditivo: no reescribe, no reordena y no reformatea
// ningun caso de arriba salvo los tres que la enmienda obliga (marcados con «ENMENDADO por
// QC-79»).
//
// `CreateUserFormState` pasa de TRES variantes a CINCO (`design.md > 5.3`). Aqui se recorren las
// cinco, porque un estado que el tipo admite y que nadie ejerce es un estado que la pantalla de
// QC-67 descubrira en produccion.
// ---------------------------------------------------------------------------------------------

describe('QC-79 R30 — las CINCO variantes de CreateUserFormState', () => {
  it('1/5 `idle` es el estado de partida y la action lo recibe sin mirarlo', async () => {
    // El estado previo es un parametro que la action IGNORA por completo: quien decide es el
    // caso de uso. Se le pasa `idle` y el resultado no depende de el.
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'not_needed' });

    const desdeIdle = await createUserAction({ status: 'idle' }, formData(CAMPOS_DEL_FORMULARIO));
    const desdeError = await createUserAction(
      { status: 'error', code: 'unauthorized', message: 'lo que sea' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    expect(desdeIdle).toEqual(desdeError);
  });

  const LOS_TRES_CORREOS = ['sent', 'failed', 'not_needed'] as const;

  for (const mail of LOS_TRES_CORREOS) {
    it(`2/5 \`success\` propaga mail='${mail}' TAL CUAL lo devuelve el caso de uso`, async () => {
      // R30: distinguir `'sent'` de `'failed'` ES el requisito -con `'failed'` el usuario quedo
      // creado igual, en `pending`, con su enlace vivo, y QC-67 ofrece el reenvio de R14-, y
      // `'not_needed'` es la rama en la que el administrador escribio la contrasena (R3). La
      // action NO traduce ninguno de los tres ni decide nada con ellos: los pasa.
      createUserMock.mockResolvedValue({ id: 'user-nuevo', mail });

      const resultado = await createUserAction(
        { status: 'idle' },
        formData(CAMPOS_DEL_FORMULARIO),
      );

      expect(resultado).toEqual({ status: 'success', id: 'user-nuevo', mail });
    });
  }

  it('2/5 un fallo de correo NO es un fallo del alta: el estado sigue siendo `success`', async () => {
    // R30 literal: «el sistema NO DEBE deshacer la creacion ni devolver un fallo del alta por esta
    // causa». Si alguien convirtiera `'failed'` en un `ErrorState`, esta linea se pondria roja.
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'failed' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    expect(resultado).toMatchObject({ status: 'success' });
    expect(resultado).not.toMatchObject({ status: 'error' });
  });

  it('3/5 `invalid_credential` devuelve las REGLAS INCUMPLIDAS, no un ErrorState', async () => {
    // R2 y `design.md > 11.3`: las reglas son datos que la persona necesita para corregir, y el
    // unico hueco de `ErrorState` para datos variables es el `diagnostic`, que QC-70 R29 manda al
    // registro del servidor y prohibe serializar al navegador. Por eso es variante propia.
    createUserMock.mockRejectedValue(new CredentialPolicyRejectedError(['min_length', 'no_digit']));

    const resultado = await createUserAction(
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, credential: 'corta' }),
    );

    expect(resultado).toEqual({ status: 'invalid_credential', unmet: ['min_length', 'no_digit'] });
    // No tiene `code` ni `message`: no paso por el catalogo, y no debia.
    expect(Object.keys(resultado).sort()).toEqual(['status', 'unmet']);
  });

  it('3/5 `unmet` son CODIGOS de regla: la candidata no viaja en el estado (R5)', async () => {
    createUserMock.mockRejectedValue(new CredentialPolicyRejectedError(['breached']));

    const resultado = await createUserAction(
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, credential: 'Secreta-Reconocible-123' }),
    );

    expect(JSON.stringify(resultado)).not.toContain('Secreta-Reconocible-123');
  });

  it('4/5 y 5/5 `error`: el catalogado sin reference, el inesperado con el suyo (R34)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    createUserMock.mockRejectedValue(new DuplicateEmailError());
    const catalogado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );
    expect(catalogado).toEqual({
      status: 'error',
      code: 'duplicate_email',
      message: errorMessage('duplicate_email'),
    });

    createUserMock.mockRejectedValue(new Error('el proveedor de correo no responde'));
    const inesperado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );
    expect(inesperado).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      // QC-71 R13: el inesperado conserva su identificador de peticion; el catalogado sigue sin el.
      reference: REQUEST_ID_DE_PRUEBA,
    });
    log.mockRestore();
  });

  it('la contrasena que escribe el administrador viaja TAL CUAL, sin normalizar (QC-19 R10)', async () => {
    // Un espacio al final es PARTE de la contrasena: si la action hiciera `trim`, se guardaria una
    // distinta de la que se escribio. Y la cadena vacia se pasa SIN convertirla: quien trata `''`
    // como «no la escribio» es el dominio (R1), en UN solo sitio.
    createUserMock.mockResolvedValue({ id: 'user-nuevo', mail: 'not_needed' });

    await createUserAction(
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, credential: 'Con-Espacio-9 ' }),
    );

    const candidato = createUserMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(candidato.credential).toBe('Con-Espacio-9 ');
  });

  it('la EDICION no gana ningun campo de credencial: `updateUserSchema` lo omite', async () => {
    // El helper del candidato lo comparten el alta y la edicion. `credential` se monta SOLO en el
    // alta: anadirlo al helper haria fallar toda edicion con `invalid_input`.
    updateUserMock.mockResolvedValue(undefined);

    await updateUserAction(
      'user-2',
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, credential: 'Una-Contrasena-9' }),
    );

    expect(updateUserMock).toHaveBeenCalledWith(ACTOR_ESPERADO, 'user-2', CAMPOS_DEL_FORMULARIO);
  });
});
