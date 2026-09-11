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
//   - **R41**: cada uno de los NUEVE errores de `design.md > 6.4` se traduce a
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
  DuplicateDocumentError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdministratorError,
  NotFoundError,
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
import type { InitialCredentialFactory } from '@/lib/modules/identity/ports/initial-credential-factory';
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

vi.mock('@/lib/composition', () => ({
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
    createUserMock.mockResolvedValue({ id: 'user-nuevo' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    // Los campos viajan TAL CUAL: la action no recorta, no convierte y no rellena nada. Y el
    // candidato NO lleva `companyId`, ni contrasena, ni `accountStatus` (R14, R15, R16, R13):
    // que el aserto sea de igualdad ESTRICTA es lo que pondria en rojo un campo de mas.
    expect(createUserMock).toHaveBeenCalledWith(ACTOR_ESPERADO, CAMPOS_DEL_FORMULARIO);
    expect(resultado).toEqual({ status: 'success', id: 'user-nuevo' });
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

/** La fabrica de credencial tampoco debe llegar a usarse: sin permiso no se gasta un bcrypt, y
 *  sobre todo no se genera ninguna contrasena (R15, R16). */
function credencialQueNoDebeLlamarse(): InitialCredentialFactory {
  return {
    createCredentialHash: vi.fn(async () => {
      throw new Error('createCredentialHash no debia invocarse: la sesion estaba incompleta');
    }),
  } as unknown as InitialCredentialFactory;
}

const LOG_MUDO: ListQueryLog = { ignoredFields: vi.fn() };

/** Cablea los SEIS casos de uso REALES sobre el repositorio que revienta y los enchufa a la
 *  fachada doblada, para que la action invoque dominio de verdad. */
function cablearCasosDeUsoReales(): UserAdminRepository {
  const users = repositorioQueNoDebeLlamarse();
  const credentials = credencialQueNoDebeLlamarse();

  const createUserReal = createCreateUser({ users, credentials });
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
// R41 — la traduccion de los NUEVE `code` de `design.md > 6.4`, por CODIGO y nunca por el texto.
// ---------------------------------------------------------------------------------------------

describe('R41 — traduccion de errores de dominio por su code estable', () => {
  const LOS_NUEVE: ReadonlyArray<{ readonly error: Error; readonly code: ErrorCode }> = [
    { error: new UnauthorizedError(), code: 'unauthorized' },
    { error: new NotFoundError(), code: 'user_not_found' },
    { error: new DuplicateEmailError(), code: 'duplicate_email' },
    { error: new DuplicateUsernameError(), code: 'duplicate_username' },
    { error: new DuplicateDocumentError(), code: 'duplicate_document' },
    { error: new RoleNotFoundError(), code: 'role_not_found' },
    { error: new SelfOperationError(), code: 'self_operation' },
    { error: new LastAdministratorError(), code: 'last_administrator' },
    { error: new ValidationError(), code: 'invalid_input' },
  ];

  for (const caso of LOS_NUEVE) {
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
    for (const caso of LOS_NUEVE) {
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
    getUserMock.mockRejectedValue(new NotFoundError('user-id=user-2 empresa=otra'));

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
    });
    expect(JSON.stringify(resultado)).not.toContain('fallo de infraestructura');
    expect(log).toHaveBeenCalledWith({ code: 'unexpected', cause: ajeno });
    log.mockRestore();
  });
});

// ---------------------------------------------------------------------------------------------
// R16 — la credencial no sale por aqui tampoco. Se afirma sobre el objeto SERIALIZADO COMPLETO.
// ---------------------------------------------------------------------------------------------

describe('R16 — el estado serializado del alta no lleva credencial ni hash', () => {
  it('el estado de exito tiene EXACTAMENTE las claves status e id, y nada mas', async () => {
    createUserMock.mockResolvedValue({ id: 'user-nuevo' });

    const resultado = await createUserAction(
      { status: 'idle' },
      formData(CAMPOS_DEL_FORMULARIO),
    );

    // Las claves EXACTAS, no «faltan algunas»: un `password` o un `credentialHash` que alguien
    // añadiera al estado pondria esta linea en rojo aunque el resto del test siguiera verde.
    expect(Object.keys(resultado).sort()).toEqual(['id', 'status']);
    expect(resultado).toEqual({ status: 'success', id: 'user-nuevo' });
  });

  it('la serializacion ENTERA del estado no contiene ninguna palabra de credencial', async () => {
    createUserMock.mockResolvedValue({ id: 'user-nuevo' });

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

  it('el candidato que la action manda al caso de uso no incluye ningun campo de credencial', async () => {
    // El otro extremo del mismo requisito: ni entra ni sale. Aunque el formulario mandase un
    // `password`, la action no lo lee (los nueve campos estan enumerados) y `strictObject` lo
    // rechazaria si llegase.
    createUserMock.mockResolvedValue({ id: 'user-nuevo' });

    await createUserAction(
      { status: 'idle' },
      formData({ ...CAMPOS_DEL_FORMULARIO, password: 'Secreta-123', passwordHash: 'x' }),
    );

    const candidato = createUserMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(candidato).sort()).toEqual(
      Object.keys(CAMPOS_DEL_FORMULARIO).sort(),
    );
  });
});
