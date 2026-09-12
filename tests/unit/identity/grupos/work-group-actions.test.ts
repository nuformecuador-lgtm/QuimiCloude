// QC-84 T9 — Las SIETE Server Actions de los grupos de trabajo
// (`lib/modules/identity/adapters/driving/work-group-actions.ts`, `design.md > 8`).
//
// Cubre:
//   - **R42**: la FORMA DE ENTRADA. `FormData` en las CINCO mutaciones —con su `prevState`
//     delante, que es la firma que `useActionState` exige— y argumentos YA TIPADOS en las DOS
//     consultas. Se afirma la aridad declarada y, campo a campo, lo que llega al caso de uso: los
//     valores viajan CRUDOS del `FormData` al esquema del dominio, sin `String(...)` que convierta
//     un campo ausente en cadena vacia.
//   - **R6**: el actor sale de las DOS CARAS de la sesion via `@/lib/composition`
//     —`getSessionUser()` el identificador y el conjunto de permisos, `getSessionContext()` la
//     EMPRESA— y si falta CUALQUIERA de las dos el actor es `null`. Los dos casos se prueban POR
//     SEPARADO, para las SIETE acciones, y contra los casos de uso REALES cableados sobre un
//     puerto que revienta si alguien lo llama: asi «no llega al puerto» es una afirmacion y no una
//     ausencia de asercion.
//   - **R43**: el error se traduce por su `CODE` y nunca por el texto —se demuestra mutando el
//     mensaje de la excepcion y viendo que el resultado no cambia—, y un error ajeno al dominio
//     sale como `unexpected` sin filtrar su texto.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/identity/roles/role-actions.test.ts`: la action se prueba contra dobles, nunca
// contra la sesion real. Que la autorizacion rechace de verdad lo prueba el test de dominio
// (T11); aqui lo que se demuestra es que la action NO DECIDE NADA, resuelve el actor y traduce.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WorkGroupDuplicateNameError,
  WorkGroupMemberExistsBlockedError,
  createAddWorkGroupMember,
  createCreateWorkGroup,
  createDeleteWorkGroup,
  createListWorkGroupMembers,
  createListWorkGroups,
  createRemoveWorkGroupMember,
  createRenameWorkGroup,
} from '@/lib/modules/identity';
import {
  addWorkGroupMemberAction,
  createWorkGroupAction,
  deleteWorkGroupAction,
  listWorkGroupMembersAction,
  listWorkGroupsAction,
  removeWorkGroupMemberAction,
  renameWorkGroupAction,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type { Actor } from '@/lib/modules/identity/domain/actor';
import type { WorkGroupRepository } from '@/lib/modules/identity/ports/work-group-repository';

const {
  getSessionUserMock,
  getSessionContextMock,
  createWorkGroupMock,
  renameWorkGroupMock,
  deleteWorkGroupMock,
  addWorkGroupMemberMock,
  removeWorkGroupMemberMock,
  listWorkGroupsMock,
  listWorkGroupMembersMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  createWorkGroupMock: vi.fn(),
  renameWorkGroupMock: vi.fn(),
  deleteWorkGroupMock: vi.fn(),
  addWorkGroupMemberMock: vi.fn(),
  removeWorkGroupMemberMock: vi.fn(),
  listWorkGroupsMock: vi.fn(),
  listWorkGroupMembersMock: vi.fn(),
}));

// QC-71 (R7, R13): el adaptador driving pide a la composicion la LECTURA de la cabecera del
// identificador de peticion y se la pasa al traductor unico de errores. Sin ella en el doble, el
// modulo ni siquiera carga.
const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: {
    getSessionUser: getSessionUserMock,
    getSessionContext: getSessionContextMock,
    createWorkGroup: createWorkGroupMock,
    renameWorkGroup: renameWorkGroupMock,
    deleteWorkGroup: deleteWorkGroupMock,
    addWorkGroupMember: addWorkGroupMemberMock,
    removeWorkGroupMember: removeWorkGroupMemberMock,
    listWorkGroups: listWorkGroupsMock,
    listWorkGroupMembers: listWorkGroupMembersMock,
  },
}));

const WORK_GROUP_ID = '1f9c2d31-5a48-4c0e-9a77-8b3e2f6d1c04';
const USER_ID = '5b7e1a92-3c64-4d18-8f02-9c1d7e4a6b35';

/** La sesion conserva `roleName` porque es DISPLAY (lo pinta `nav-user`), pero la action no lo
 *  mira: lo que viaja al caso de uso es el CONJUNTO DE PERMISOS. */
const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

/** La OTRA cara de la sesion: de aqui sale la EMPRESA. */
const SESSION_CONTEXT = {
  userId: 'user-admin-1',
  companyId: 'company-1',
  roleName: 'Administrador',
};

/** Igualdad ESTRICTA contra esto es lo que pone en rojo un `roleName`, un `username` o un
 *  `companyId` que llegaran de otro sitio. */
const ACTOR_ESPERADO: Actor = {
  id: 'user-admin-1',
  companyId: 'company-1',
  permissions: ['usuarios.consultar', 'usuarios.modificar'],
};

function formDataCon(campos: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formData.append(clave, valor);
  return formData;
}

const PAGINA_VACIA = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 };
const CONSULTA = { page: 1, sort: null, filters: {}, search: '' };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R42 — LAS CINCO MUTACIONES: `FormData`, y lo que llega al caso de uso campo a campo
// ---------------------------------------------------------------------------------------------

describe('R42 — las cinco mutaciones reciben FormData', () => {
  it('createWorkGroupAction: el nombre viaja crudo y devuelve el identificador creado', async () => {
    createWorkGroupMock.mockResolvedValue({ id: WORK_GROUP_ID });

    const resultado = await createWorkGroupAction(
      { status: 'idle' },
      formDataCon({ name: 'Turno noche' }),
    );

    expect(resultado).toEqual({ status: 'success', id: WORK_GROUP_ID });
    expect(createWorkGroupMock).toHaveBeenCalledWith(ACTOR_ESPERADO, { name: 'Turno noche' });
  });

  it('renameWorkGroupAction: el grupo y su nombre nuevo, y nada mas', async () => {
    renameWorkGroupMock.mockResolvedValue(undefined);

    const resultado = await renameWorkGroupAction(
      { status: 'idle' },
      formDataCon({ workGroupId: WORK_GROUP_ID, name: 'Turno tarde' }),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(renameWorkGroupMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      workGroupId: WORK_GROUP_ID,
      name: 'Turno tarde',
    });
  });

  it('deleteWorkGroupAction: solo el identificador del grupo', async () => {
    deleteWorkGroupMock.mockResolvedValue(undefined);

    const resultado = await deleteWorkGroupAction(
      { status: 'idle' },
      formDataCon({ workGroupId: WORK_GROUP_ID }),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(deleteWorkGroupMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      workGroupId: WORK_GROUP_ID,
    });
  });

  it('addWorkGroupMemberAction: el grupo y UNA persona (nunca una lista)', async () => {
    addWorkGroupMemberMock.mockResolvedValue(undefined);

    const resultado = await addWorkGroupMemberAction(
      { status: 'idle' },
      formDataCon({ workGroupId: WORK_GROUP_ID, userId: USER_ID }),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(addWorkGroupMemberMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      workGroupId: WORK_GROUP_ID,
      userId: USER_ID,
    });
  });

  it('removeWorkGroupMemberAction: el grupo y UNA persona', async () => {
    removeWorkGroupMemberMock.mockResolvedValue(undefined);

    const resultado = await removeWorkGroupMemberAction(
      { status: 'idle' },
      formDataCon({ workGroupId: WORK_GROUP_ID, userId: USER_ID }),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(removeWorkGroupMemberMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      workGroupId: WORK_GROUP_ID,
      userId: USER_ID,
    });
  });

  it('su firma es (prevState, formData): aridad DOS, la que useActionState exige', () => {
    expect(createWorkGroupAction).toHaveLength(2);
    expect(renameWorkGroupAction).toHaveLength(2);
    expect(deleteWorkGroupAction).toHaveLength(2);
    expect(addWorkGroupMemberAction).toHaveLength(2);
    expect(removeWorkGroupMemberAction).toHaveLength(2);
  });

  it('un campo AUSENTE viaja como null, no como cadena vacia: lo rechaza el esquema, no la action', async () => {
    // La action no rellena defectos ni convierte a `String(...)`: si lo hiciera, un `<form>` sin
    // el campo mandaria `''` y el `min(1)` del esquema no tendria nada que rechazar.
    createWorkGroupMock.mockResolvedValue({ id: WORK_GROUP_ID });

    await createWorkGroupAction({ status: 'idle' }, formDataCon({}));

    expect(createWorkGroupMock).toHaveBeenCalledWith(ACTOR_ESPERADO, { name: null });
  });
});

// ---------------------------------------------------------------------------------------------
// R42 — LAS DOS CONSULTAS: argumentos ya tipados, ningun `FormData`
// ---------------------------------------------------------------------------------------------

describe('R42 — las dos consultas reciben argumentos ya tipados', () => {
  it('listWorkGroupsAction recibe la consulta y devuelve la pagina tal cual', async () => {
    listWorkGroupsMock.mockResolvedValue(PAGINA_VACIA);

    const resultado = await listWorkGroupsAction(CONSULTA);

    expect(resultado).toEqual({ status: 'success', data: PAGINA_VACIA });
    expect(listWorkGroupsAction).toHaveLength(1);
    expect(listWorkGroupsMock).toHaveBeenCalledWith(ACTOR_ESPERADO, CONSULTA);
  });

  it('listWorkGroupMembersAction recibe el grupo y la consulta, y pone el reloj', async () => {
    // R21: el `now` entra por parametro desde esta capa. Es lo que hace que una cuenta bloqueada
    // vuelva sola a la lista al vencer su plazo, SIN ninguna escritura.
    listWorkGroupMembersMock.mockResolvedValue(PAGINA_VACIA);

    const resultado = await listWorkGroupMembersAction(WORK_GROUP_ID, CONSULTA);

    expect(resultado).toEqual({ status: 'success', data: PAGINA_VACIA });
    expect(listWorkGroupMembersAction).toHaveLength(2);
    expect(listWorkGroupMembersMock).toHaveBeenCalledWith(
      ACTOR_ESPERADO,
      WORK_GROUP_ID,
      CONSULTA,
      expect.any(Date),
    );
  });

  it('ninguna de las dos acepta un FormData por firma: no hay campos que leer', async () => {
    // La forma de entrada es el argumento; si alguien cambiara la consulta por un `FormData`, lo
    // que llegaria al caso de uso seria ese objeto y esta igualdad estricta caeria.
    listWorkGroupsMock.mockResolvedValue(PAGINA_VACIA);

    await listWorkGroupsAction(CONSULTA);

    expect(listWorkGroupsMock.mock.calls[0]?.[1]).toBe(CONSULTA);
    expect(listWorkGroupsMock.mock.calls[0]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// R43 — la traduccion es POR EL CODIGO, nunca por el texto
// ---------------------------------------------------------------------------------------------

describe('R43 — el error se traduce por su code', () => {
  it('el duplicado de nombre sale con su code aunque se mute el texto del error', async () => {
    const error = new WorkGroupDuplicateNameError();
    Object.defineProperty(error, 'message', { value: 'un texto que nadie debe mirar' });
    createWorkGroupMock.mockRejectedValue(error);

    const resultado = await createWorkGroupAction(
      { status: 'idle' },
      formDataCon({ name: 'Turno noche' }),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'work_group_duplicate_name' });
    expect(resultado).not.toMatchObject({ message: 'un texto que nadie debe mirar' });
  });

  it('el duplicado OCULTO llega con su propio code, distinto del visible', async () => {
    // R31: «ya pertenece pero no se ve porque esta bloqueada» es un codigo propio, no el de R30.
    addWorkGroupMemberMock.mockRejectedValue(new WorkGroupMemberExistsBlockedError());

    const resultado = await addWorkGroupMemberAction(
      { status: 'idle' },
      formDataCon({ workGroupId: WORK_GROUP_ID, userId: USER_ID }),
    );

    expect(resultado).toMatchObject({
      status: 'error',
      code: 'work_group_member_exists_blocked',
    });
  });

  it('un error ajeno al dominio sale como unexpected, con referencia y sin filtrar su texto', async () => {
    listWorkGroupsMock.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const resultado = await listWorkGroupsAction(CONSULTA);

    expect(resultado).toMatchObject({
      status: 'error',
      code: 'unexpected',
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('connection terminated');
  });
});

// ---------------------------------------------------------------------------------------------
// R6 — LAS DOS CARAS DE LA SESION, cada una por separado y para las SIETE acciones
// ---------------------------------------------------------------------------------------------

/** Puerto doble cuyos SIETE metodos REVIENTAN si alguien los llama: es lo que convierte «no llega
 *  al puerto» en una afirmacion y no en una ausencia de asercion. */
function puertoQueNoDebeLlamarse(): {
  readonly workGroups: WorkGroupRepository;
  readonly metodos: readonly ReturnType<typeof vi.fn>[];
} {
  const explota = (nombre: string): ReturnType<typeof vi.fn> =>
    vi.fn(async (): Promise<never> => {
      throw new Error(`${nombre} no debia invocarse: la sesion estaba incompleta`);
    });

  const metodos = {
    createInCompany: explota('createInCompany'),
    renameAliveInCompany: explota('renameAliveInCompany'),
    softDeleteAliveInCompany: explota('softDeleteAliveInCompany'),
    listAliveInCompany: explota('listAliveInCompany'),
    listMembersAliveInCompany: explota('listMembersAliveInCompany'),
    addMemberAliveInCompany: explota('addMemberAliveInCompany'),
    removeMemberAliveInCompany: explota('removeMemberAliveInCompany'),
  };

  return {
    workGroups: metodos as unknown as WorkGroupRepository,
    metodos: Object.values(metodos),
  };
}

/** Cablea los SIETE casos de uso REALES sobre el puerto que revienta y los enchufa a la fachada
 *  doblada, para que las acciones invoquen dominio de verdad en vez de otro doble. */
function cablearCasosDeUsoReales(): ReturnType<typeof puertoQueNoDebeLlamarse> {
  const puerto = puertoQueNoDebeLlamarse();
  const deps = { workGroups: puerto.workGroups };
  const log = { ignoredFields: vi.fn() };

  const create = createCreateWorkGroup(deps);
  const rename = createRenameWorkGroup(deps);
  const remove = createDeleteWorkGroup(deps);
  const addMember = createAddWorkGroupMember(deps);
  const removeMember = createRemoveWorkGroupMember(deps);
  const list = createListWorkGroups({ ...deps, log });
  const listMembers = createListWorkGroupMembers({
    ...deps,
    pagination: { toOffsetLimit, buildPage },
    log,
  });

  createWorkGroupMock.mockImplementation((actor: Actor | null, input: unknown) =>
    create(actor, input),
  );
  renameWorkGroupMock.mockImplementation((actor: Actor | null, input: unknown) =>
    rename(actor, input),
  );
  deleteWorkGroupMock.mockImplementation((actor: Actor | null, input: unknown) =>
    remove(actor, input),
  );
  addWorkGroupMemberMock.mockImplementation((actor: Actor | null, input: unknown) =>
    addMember(actor, input),
  );
  removeWorkGroupMemberMock.mockImplementation((actor: Actor | null, input: unknown) =>
    removeMember(actor, input),
  );
  listWorkGroupsMock.mockImplementation((actor: Actor | null, input: unknown) =>
    list(actor, input),
  );
  listWorkGroupMembersMock.mockImplementation(
    (actor: Actor | null, id: string, input: unknown, now: Date) =>
      listMembers(actor, id, input, now),
  );

  return puerto;
}

/** Las siete invocaciones, cada una con su forma de entrada propia. */
const LAS_SIETE_ACCIONES = [
  ['createWorkGroupAction', () => createWorkGroupAction({ status: 'idle' }, formDataCon({ name: 'X' }))],
  [
    'renameWorkGroupAction',
    () =>
      renameWorkGroupAction(
        { status: 'idle' },
        formDataCon({ workGroupId: WORK_GROUP_ID, name: 'X' }),
      ),
  ],
  [
    'deleteWorkGroupAction',
    () => deleteWorkGroupAction({ status: 'idle' }, formDataCon({ workGroupId: WORK_GROUP_ID })),
  ],
  [
    'addWorkGroupMemberAction',
    () =>
      addWorkGroupMemberAction(
        { status: 'idle' },
        formDataCon({ workGroupId: WORK_GROUP_ID, userId: USER_ID }),
      ),
  ],
  [
    'removeWorkGroupMemberAction',
    () =>
      removeWorkGroupMemberAction(
        { status: 'idle' },
        formDataCon({ workGroupId: WORK_GROUP_ID, userId: USER_ID }),
      ),
  ],
  ['listWorkGroupsAction', () => listWorkGroupsAction(CONSULTA)],
  ['listWorkGroupMembersAction', () => listWorkGroupMembersAction(WORK_GROUP_ID, CONSULTA)],
] as const satisfies readonly (readonly [string, () => Promise<unknown>])[];

describe('R6 — falta la PRIMERA cara: no hay getSessionUser', () => {
  it.each(LAS_SIETE_ACCIONES)(
    '%s responde unauthorized con actor null y sin tocar el puerto',
    async (_nombre, invocar) => {
      const puerto = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

      const resultado = await invocar();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    },
  );
});

describe('R6 — falta la SEGUNDA cara: no hay getSessionContext (la EMPRESA)', () => {
  it.each(LAS_SIETE_ACCIONES)(
    '%s responde unauthorized con actor null y sin tocar el puerto',
    async (_nombre, invocar) => {
      const puerto = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(SESSION_USER);
      getSessionContextMock.mockResolvedValue(null);

      const resultado = await invocar();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puerto.metodos) expect(metodo).not.toHaveBeenCalled();
    },
  );
});

describe('R6 — con las DOS caras el actor lleva id, empresa y permisos, y nada mas', () => {
  it('ni el username ni el roleName de la sesion viajan al caso de uso', async () => {
    // Igualdad ESTRICTA: si la action colara `roleName`, autorizar por rol volveria por el borde.
    createWorkGroupMock.mockResolvedValue({ id: WORK_GROUP_ID });

    await createWorkGroupAction({ status: 'idle' }, formDataCon({ name: 'Turno noche' }));

    expect(createWorkGroupMock.mock.calls[0]?.[0]).toEqual(ACTOR_ESPERADO);
  });

  it('las dos caras se consultan una vez por invocacion', async () => {
    listWorkGroupsMock.mockResolvedValue(PAGINA_VACIA);

    await listWorkGroupsAction(CONSULTA);

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });
});
