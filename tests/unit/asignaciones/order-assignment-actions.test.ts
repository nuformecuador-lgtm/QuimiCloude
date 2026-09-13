// QC-87 T12 — Las TRES Server Actions de las asignaciones y la consulta tipada
// (`lib/modules/asignaciones/adapters/driving/order-assignment-actions.ts`, `design.md > 7`).
//
// Cubre:
//   - **R41**: la FORMA DE ENTRADA. `FormData` en las TRES mutaciones —con su `prevState` delante,
//     que es la firma que `useActionState` exige— y un argumento YA TIPADO en la consulta. Se
//     afirma la aridad declarada y, campo a campo, lo que llega al caso de uso: los valores viajan
//     CRUDOS del `FormData` al esquema del dominio, sin `String(...)` que convierta un campo
//     ausente en cadena vacia y sin defectos que rellenen una lista que no vino.
//   - **R43**: el actor sale de las DOS CARAS de la sesion via `@/lib/composition`
//     —`getSessionUser()` el identificador y el conjunto de permisos, `getSessionContext()` la
//     EMPRESA— y si falta CUALQUIERA de las dos el actor es `null`; el error se traduce por su
//     `CODE` y nunca por su texto; y esta capa NO comprueba ningun permiso por su cuenta. Los dos
//     cortes de sesion se prueban POR SEPARADO, para las CUATRO operaciones, y contra los casos de
//     uso REALES cableados sobre puertos que revientan si alguien los llama: asi «no llega al
//     puerto» es una afirmacion y no una ausencia de asercion.
//   - **R44**: los campos que la action lee del `FormData` son los de INGLES del esquema
//     —`orderId`, `userIds`, `workGroupIds`, `userId`, `workGroupId`— y ningun alias en castellano.
//
// La fachada `@/lib/composition` se dobla con `vi.mock`, igual que
// `tests/unit/identity/grupos/work-group-actions.test.ts`: la action se prueba contra dobles, nunca
// contra la sesion real. Que la autorizacion rechace de verdad lo prueban los tests de dominio
// (`authorization.test.ts`); aqui lo que se demuestra es que la action NO DECIDE NADA: resuelve el
// actor, traduce la forma de entrada y traduce el error.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderAssignmentNotFoundError,
  OrderDeliveredFrozenError,
  ValidationError,
  createAssignResponsibles,
  createListOrderResponsibles,
  createListResponsiblesForOrders,
  createRemoveWorkGroupFromOrder,
  createUnassignResponsible,
} from '@/lib/modules/asignaciones';
import {
  assignResponsiblesAction,
  listOrderResponsiblesAction,
  listResponsiblesForOrdersAction,
  removeWorkGroupFromOrderAction,
  unassignResponsibleAction,
} from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';

import type { Actor } from '@/lib/modules/asignaciones';
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository';
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity';
import type { OrderCatalog } from '@/lib/modules/pedidos';

const {
  getSessionUserMock,
  getSessionContextMock,
  assignResponsiblesMock,
  removeWorkGroupFromOrderMock,
  unassignResponsibleMock,
  listOrderResponsiblesMock,
  listResponsiblesForOrdersMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  assignResponsiblesMock: vi.fn(),
  removeWorkGroupFromOrderMock: vi.fn(),
  unassignResponsibleMock: vi.fn(),
  listOrderResponsiblesMock: vi.fn(),
  listResponsiblesForOrdersMock: vi.fn(),
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
  },
  asignaciones: {
    assignResponsibles: assignResponsiblesMock,
    removeWorkGroupFromOrder: removeWorkGroupFromOrderMock,
    unassignResponsible: unassignResponsibleMock,
    listOrderResponsibles: listOrderResponsiblesMock,
    listResponsiblesForOrders: listResponsiblesForOrdersMock,
  },
}));

const ORDER_ID = '3f1c9b2e-8d47-4a10-9c65-2b7e4f0a1d38';
const USER_ID = '5b7e1a92-3c64-4d18-8f02-9c1d7e4a6b35';
const OTRO_USER_ID = '9a4d3c21-6e78-4b90-8f13-0c5a2d8e7b46';
const WORK_GROUP_ID = '1f9c2d31-5a48-4c0e-9a77-8b3e2f6d1c04';

/** La sesion conserva `roleName` porque es DISPLAY (lo pinta `nav-user`), pero la action no lo
 *  mira: lo que viaja al caso de uso es el CONJUNTO DE PERMISOS. */
const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['asignaciones.modificar', 'pedidos.consultar'],
};

/** La OTRA cara de la sesion: de aqui sale la EMPRESA (R5). */
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
  permissions: ['asignaciones.modificar', 'pedidos.consultar'],
};

/** Varias casillas con el MISMO nombre es lo que un `<form>` produce para una lista: se construye
 *  con `append`, igual que el navegador, y la action la lee con `getAll`. */
function formDataCon(campos: readonly (readonly [string, string])[]): FormData {
  const formData = new FormData();
  for (const [clave, valor] of campos) formData.append(clave, valor);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue(SESSION_USER);
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);
});

// ---------------------------------------------------------------------------------------------
// R41 / R44 — LAS TRES MUTACIONES: `FormData`, y lo que llega al caso de uso campo a campo
// ---------------------------------------------------------------------------------------------

describe('R41 — las tres mutaciones reciben FormData', () => {
  it('assignResponsiblesAction: personas y grupos viajan CRUDOS como listas, y el reloj lo pone la action', async () => {
    assignResponsiblesMock.mockResolvedValue({ added: 3 });

    const resultado = await assignResponsiblesAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userIds', USER_ID],
        ['userIds', OTRO_USER_ID],
        ['workGroupIds', WORK_GROUP_ID],
      ]),
    );

    expect(resultado).toEqual({ status: 'success', added: 3 });
    expect(assignResponsiblesMock).toHaveBeenCalledWith(
      ACTOR_ESPERADO,
      {
        orderId: ORDER_ID,
        userIds: [USER_ID, OTRO_USER_ID],
        workGroupIds: [WORK_GROUP_ID],
      },
      // R21: el `now` entra por parametro desde esta capa; el dominio no tiene reloj propio.
      expect.any(Date),
    );
  });

  it('assignResponsiblesAction: una lista NO marcada llega como [] y no se rellena con nada', async () => {
    assignResponsiblesMock.mockResolvedValue({ added: 1 });

    await assignResponsiblesAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userIds', USER_ID],
      ]),
    );

    expect(assignResponsiblesMock.mock.calls[0]?.[1]).toEqual({
      orderId: ORDER_ID,
      userIds: [USER_ID],
      workGroupIds: [],
    });
  });

  it('removeWorkGroupFromOrderAction: el pedido y UN grupo, y devuelve cuantas filas se fueron', async () => {
    removeWorkGroupFromOrderMock.mockResolvedValue({ removed: 4 });

    const resultado = await removeWorkGroupFromOrderAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['workGroupId', WORK_GROUP_ID],
      ]),
    );

    expect(resultado).toEqual({ status: 'success', removed: 4 });
    expect(removeWorkGroupFromOrderMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      orderId: ORDER_ID,
      workGroupId: WORK_GROUP_ID,
    });
  });

  it('unassignResponsibleAction: el pedido y UNA persona (nunca una lista)', async () => {
    unassignResponsibleMock.mockResolvedValue(undefined);

    const resultado = await unassignResponsibleAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userId', USER_ID],
      ]),
    );

    expect(resultado).toEqual({ status: 'success' });
    expect(unassignResponsibleMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      orderId: ORDER_ID,
      userId: USER_ID,
    });
  });

  it('su firma es (prevState, formData): aridad DOS, la que useActionState exige', () => {
    expect(assignResponsiblesAction).toHaveLength(2);
    expect(removeWorkGroupFromOrderAction).toHaveLength(2);
    expect(unassignResponsibleAction).toHaveLength(2);
  });

  it('un campo AUSENTE viaja como null, no como cadena vacia: lo rechaza el esquema, no la action', async () => {
    // La action no rellena defectos ni convierte a `String(...)`: si lo hiciera, un `<form>` sin el
    // campo mandaria `''` y el `uuid()` del esquema rechazaria una cadena vacia que nadie escribio.
    unassignResponsibleMock.mockResolvedValue(undefined);

    await unassignResponsibleAction({ status: 'idle' }, formDataCon([]));

    expect(unassignResponsibleMock).toHaveBeenCalledWith(ACTOR_ESPERADO, {
      orderId: null,
      userId: null,
    });
  });
});

describe('R44 — los campos del FormData son los de INGLES del esquema', () => {
  it('un FormData con los nombres en castellano no aporta NINGUN valor', async () => {
    // Si alguien renombrara los campos de la action, esta igualdad caeria: lo que llega al caso de
    // uso con las claves castellanas es exactamente lo mismo que con el formulario vacio.
    assignResponsiblesMock.mockResolvedValue({ added: 0 });

    await assignResponsiblesAction(
      { status: 'idle' },
      formDataCon([
        ['pedidoId', ORDER_ID],
        ['usuarios', USER_ID],
        ['grupos', WORK_GROUP_ID],
      ]),
    );

    expect(assignResponsiblesMock.mock.calls[0]?.[1]).toEqual({
      orderId: null,
      userIds: [],
      workGroupIds: [],
    });
  });

  it('las claves que la action entrega son las TRES del esquema y ninguna mas', async () => {
    // `strictObject` haria fallar una clave de mas; esta asercion la caza antes, en el borde.
    removeWorkGroupFromOrderMock.mockResolvedValue({ removed: 0 });

    await removeWorkGroupFromOrderAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['workGroupId', WORK_GROUP_ID],
        ['companyId', 'company-9'],
      ]),
    );

    // R5: la empresa sale DEL ACTOR. Un `companyId` colado en el formulario no llega al dominio.
    expect(Object.keys(removeWorkGroupFromOrderMock.mock.calls[0]?.[1] as object)).toEqual([
      'orderId',
      'workGroupId',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R41 — LA CONSULTA: argumento ya tipado, ningun `FormData`
// ---------------------------------------------------------------------------------------------

describe('R41 — la consulta recibe el identificador ya tipado', () => {
  it('listOrderResponsiblesAction devuelve la lista tal cual, con aridad UNO', async () => {
    const responsables = [
      { userId: USER_ID, displayName: 'Ana Perez', origin: { kind: 'direct' } },
    ];
    listOrderResponsiblesMock.mockResolvedValue(responsables);

    const resultado = await listOrderResponsiblesAction(ORDER_ID);

    expect(resultado).toEqual({ status: 'success', data: responsables });
    expect(listOrderResponsiblesAction).toHaveLength(1);
    expect(listOrderResponsiblesMock).toHaveBeenCalledWith(ACTOR_ESPERADO, ORDER_ID);
  });

  it('no acepta un FormData por firma: lo que viaja es el identificador, y solo el', async () => {
    listOrderResponsiblesMock.mockResolvedValue([]);

    await listOrderResponsiblesAction(ORDER_ID);

    expect(listOrderResponsiblesMock.mock.calls[0]?.[1]).toBe(ORDER_ID);
    expect(listOrderResponsiblesMock.mock.calls[0]).toHaveLength(2);
  });

  it('la lista VACIA es un exito, no un error (R40)', async () => {
    listOrderResponsiblesMock.mockResolvedValue([]);

    expect(await listOrderResponsiblesAction(ORDER_ID)).toEqual({ status: 'success', data: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// R43 — la traduccion es POR EL CODIGO, nunca por el texto
// ---------------------------------------------------------------------------------------------

describe('R43 — el error se traduce por su code', () => {
  it('el pedido ENTREGADO sale con su code aunque se mute el texto del error', async () => {
    const error = new OrderDeliveredFrozenError();
    Object.defineProperty(error, 'message', { value: 'un texto que nadie debe mirar' });
    assignResponsiblesMock.mockRejectedValue(error);

    const resultado = await assignResponsiblesAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userIds', USER_ID],
      ]),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'order_delivered_frozen' });
    expect(resultado).not.toMatchObject({ message: 'un texto que nadie debe mirar' });
  });

  it('desasignar a quien no es responsable llega con su propio code', async () => {
    unassignResponsibleMock.mockRejectedValue(new OrderAssignmentNotFoundError());

    const resultado = await unassignResponsibleAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userId', USER_ID],
      ]),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'order_assignment_not_found' });
  });

  it('un error ajeno al dominio sale como unexpected, con referencia y sin filtrar su texto', async () => {
    listOrderResponsiblesMock.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const resultado = await listOrderResponsiblesAction(ORDER_ID);

    expect(resultado).toMatchObject({
      status: 'error',
      code: 'unexpected',
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('connection terminated');
  });
});

// ---------------------------------------------------------------------------------------------
// R43 — los casos de uso REALES: la entrada invalida y las dos caras de la sesion
// ---------------------------------------------------------------------------------------------

type PuertosQueRevientan = {
  readonly deps: {
    readonly assignments: OrderAssignmentRepository;
    readonly orders: OrderCatalog;
    readonly people: PeopleDirectory;
    readonly groups: WorkGroupDirectory;
  };
  readonly metodos: readonly ReturnType<typeof vi.fn>[];
};

/** Los CUATRO puertos doblados de forma que CUALQUIER metodo REVIENTE si alguien lo llama: es lo
 *  que convierte «no llega al puerto» en una afirmacion y no en una ausencia de asercion. */
function puertosQueNoDebenLlamarse(): PuertosQueRevientan {
  const explota = (nombre: string): ReturnType<typeof vi.fn> =>
    vi.fn(async (): Promise<never> => {
      throw new Error(`${nombre} no debia invocarse`);
    });

  const assignments = {
    insertMissing: explota('insertMissing'),
    listByOrderInCompany: explota('listByOrderInCompany'),
    listByOrdersInCompany: explota('listByOrdersInCompany'),
    deleteOne: explota('deleteOne'),
    deleteByWorkGroup: explota('deleteByWorkGroup'),
  };
  const orders = { findAliveById: explota('findAliveById') };
  const people = {
    findAliveRefsInCompany: explota('findAliveRefsInCompany'),
    findRefsIncludingDeletedInCompany: explota('findRefsIncludingDeletedInCompany'),
  };
  const groups = { findSnapshotAliveInCompany: explota('findSnapshotAliveInCompany') };

  return {
    deps: {
      assignments: assignments as unknown as OrderAssignmentRepository,
      orders: orders as unknown as OrderCatalog,
      people: people as unknown as PeopleDirectory,
      groups: groups as unknown as WorkGroupDirectory,
    },
    metodos: [
      ...Object.values(assignments),
      ...Object.values(orders),
      ...Object.values(people),
      ...Object.values(groups),
    ],
  };
}

/** Cablea los CUATRO casos de uso REALES sobre los puertos que revientan y los enchufa a la
 *  fachada doblada, para que las acciones invoquen dominio de verdad en vez de otro doble. */
function cablearCasosDeUsoReales(): PuertosQueRevientan {
  const puertos = puertosQueNoDebenLlamarse();
  const { assignments, orders, people, groups } = puertos.deps;

  const assign = createAssignResponsibles({ assignments, orders, people, groups });
  const removeGroup = createRemoveWorkGroupFromOrder({ orders, assignments });
  const unassign = createUnassignResponsible({ orders, assignments });
  const list = createListOrderResponsibles({ orders, assignments, people });
  const listForOrders = createListResponsiblesForOrders({ assignments, people });

  assignResponsiblesMock.mockImplementation((actor: Actor | null, input: unknown, now: Date) =>
    assign(actor, input, now),
  );
  removeWorkGroupFromOrderMock.mockImplementation((actor: Actor | null, input: unknown) =>
    removeGroup(actor, input),
  );
  unassignResponsibleMock.mockImplementation((actor: Actor | null, input: unknown) =>
    unassign(actor, input),
  );
  listOrderResponsiblesMock.mockImplementation((actor: Actor | null, orderId: string) =>
    list(actor, orderId),
  );
  listResponsiblesForOrdersMock.mockImplementation((actor: Actor | null, orderIds: unknown) =>
    listForOrders(actor, orderIds),
  );

  return puertos;
}

describe('R43 — un FormData sin orderId acaba en invalid_input, no en una excepcion sin traducir', () => {
  it('assignResponsiblesAction: lo rechaza el ESQUEMA del dominio y no toca ningun puerto', async () => {
    const puertos = cablearCasosDeUsoReales();

    // Sin `orderId`: el campo llega `null`, el esquema falla y el caso de uso lanza
    // `ValidationError`. Si la action escribiera `String(formData.get('orderId'))`, lo que llegaria
    // seria la cadena `'null'` —tambien invalida, pero por otro motivo— y si no atrapara el error,
    // la excepcion subiria sin traducir hasta el cliente.
    const resultado = await assignResponsiblesAction(
      { status: 'idle' },
      formDataCon([['userIds', USER_ID]]),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });

  it('removeWorkGroupFromOrderAction: mismo corte, mismo code', async () => {
    const puertos = cablearCasosDeUsoReales();

    const resultado = await removeWorkGroupFromOrderAction(
      { status: 'idle' },
      formDataCon([['workGroupId', WORK_GROUP_ID]]),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });

  it('unassignResponsibleAction: mismo corte, mismo code', async () => {
    const puertos = cablearCasosDeUsoReales();

    const resultado = await unassignResponsibleAction(
      { status: 'idle' },
      formDataCon([['userId', USER_ID]]),
    );

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });
});

/** Las CUATRO invocaciones, cada una con su forma de entrada propia y BIEN formada: lo unico que
 *  las hace fallar en los dos bloques de abajo es la sesion incompleta. */
const LAS_CUATRO_ACCIONES = [
  [
    'assignResponsiblesAction',
    () =>
      assignResponsiblesAction(
        { status: 'idle' },
        formDataCon([
          ['orderId', ORDER_ID],
          ['userIds', USER_ID],
        ]),
      ),
  ],
  [
    'removeWorkGroupFromOrderAction',
    () =>
      removeWorkGroupFromOrderAction(
        { status: 'idle' },
        formDataCon([
          ['orderId', ORDER_ID],
          ['workGroupId', WORK_GROUP_ID],
        ]),
      ),
  ],
  [
    'unassignResponsibleAction',
    () =>
      unassignResponsibleAction(
        { status: 'idle' },
        formDataCon([
          ['orderId', ORDER_ID],
          ['userId', USER_ID],
        ]),
      ),
  ],
  ['listOrderResponsiblesAction', () => listOrderResponsiblesAction(ORDER_ID)],
  // QC-102 T6: la QUINTA accion recorre los MISMOS cortes de sesion que las otras cuatro.
  ['listResponsiblesForOrdersAction', () => listResponsiblesForOrdersAction([ORDER_ID])],
] as const satisfies readonly (readonly [string, () => Promise<unknown>])[];

describe('R43 — falta la PRIMERA cara: no hay getSessionUser', () => {
  it.each(LAS_CUATRO_ACCIONES)(
    '%s responde unauthorized con actor null y sin tocar ningun puerto',
    async (_nombre, invocar) => {
      const puertos = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(null);
      getSessionContextMock.mockResolvedValue(SESSION_CONTEXT);

      const resultado = await invocar();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
    },
  );
});

describe('R43 — falta la SEGUNDA cara: no hay getSessionContext (la EMPRESA)', () => {
  it.each(LAS_CUATRO_ACCIONES)(
    '%s responde unauthorized con actor null y sin tocar ningun puerto',
    async (_nombre, invocar) => {
      const puertos = cablearCasosDeUsoReales();
      getSessionUserMock.mockResolvedValue(SESSION_USER);
      getSessionContextMock.mockResolvedValue(null);

      const resultado = await invocar();

      expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
      for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
    },
  );
});

describe('R43 — con las DOS caras el actor lleva id, empresa y permisos, y nada mas', () => {
  it('ni el username ni el roleName de la sesion viajan al caso de uso', async () => {
    // Igualdad ESTRICTA: si la action colara `roleName`, autorizar por rol volveria por el borde.
    unassignResponsibleMock.mockResolvedValue(undefined);

    await unassignResponsibleAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userId', USER_ID],
      ]),
    );

    expect(unassignResponsibleMock.mock.calls[0]?.[0]).toEqual(ACTOR_ESPERADO);
  });

  it('las dos caras se consultan una vez por invocacion', async () => {
    listOrderResponsiblesMock.mockResolvedValue([]);

    await listOrderResponsiblesAction(ORDER_ID);

    expect(getSessionUserMock).toHaveBeenCalledTimes(1);
    expect(getSessionContextMock).toHaveBeenCalledTimes(1);
  });

  it('la action NO comprueba ningun permiso: un actor SIN permisos llega igual al caso de uso', async () => {
    // R43: la frontera es el caso de uso. Esta capa entrega el actor tal cual y quien rechaza es
    // `requirePermission`, no un `if` duplicado aqui.
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });
    const puertos = cablearCasosDeUsoReales();

    const resultado = await unassignResponsibleAction(
      { status: 'idle' },
      formDataCon([
        ['orderId', ORDER_ID],
        ['userId', USER_ID],
      ]),
    );

    expect(unassignResponsibleMock.mock.calls[0]?.[0]).toEqual({
      ...ACTOR_ESPERADO,
      permissions: [],
    });
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// QC-102 T6 (R13) - la consulta EN LOTE: argumentos ya tipados, array de salida y error por `code`
// ---------------------------------------------------------------------------------------------

describe('QC-102 R13 - listResponsiblesForOrdersAction', () => {
  it('recibe la lista YA TIPADA -aridad UNO- y la entrega CRUDA al caso de uso', async () => {
    listResponsiblesForOrdersMock.mockResolvedValue([]);

    await listResponsiblesForOrdersAction([ORDER_ID, OTRO_USER_ID]);

    // Ningun `FormData` por firma, y ninguna validacion adelantada: quien decide que son uuid y
    // cuantos caben es el esquema del DOMINIO (R9).
    expect(listResponsiblesForOrdersAction).toHaveLength(1);
    expect(listResponsiblesForOrdersMock).toHaveBeenCalledWith(ACTOR_ESPERADO, [
      ORDER_ID,
      OTRO_USER_ID,
    ]);
  });

  it('devuelve un ARRAY de entradas, no un Map: plano y serializable', async () => {
    const entradas = [
      {
        orderId: ORDER_ID,
        responsibles: [{ userId: USER_ID, displayName: 'Ana Perez', origin: { kind: 'direct' } }],
      },
      { orderId: OTRO_USER_ID, responsibles: [] },
    ];
    listResponsiblesForOrdersMock.mockResolvedValue(entradas);

    const resultado = await listResponsiblesForOrdersAction([ORDER_ID, OTRO_USER_ID]);

    expect(resultado).toEqual({ status: 'success', data: entradas });
    expect(Array.isArray((resultado as { data: unknown }).data)).toBe(true);
    // Serializable sin perder nada: un `Map` habria viajado como `{}`.
    expect(JSON.parse(JSON.stringify(resultado))).toEqual({ status: 'success', data: entradas });
  });

  it('la lista vacia es un EXITO, no un error', async () => {
    listResponsiblesForOrdersMock.mockResolvedValue([]);

    expect(await listResponsiblesForOrdersAction([])).toEqual({ status: 'success', data: [] });
  });

  it('traduce el error por su CODE aunque se mute el texto del mensaje', async () => {
    const error = new ValidationError();
    Object.defineProperty(error, 'message', { value: 'un texto que nadie debe mirar' });
    listResponsiblesForOrdersMock.mockRejectedValue(error);

    const resultado = await listResponsiblesForOrdersAction(['no-soy-un-uuid']);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    expect(JSON.stringify(resultado)).not.toContain('un texto que nadie debe mirar');
  });

  it('una entrada invalida la rechaza el ESQUEMA del dominio, sin tocar ningun puerto', async () => {
    const puertos = cablearCasosDeUsoReales();

    const resultado = await listResponsiblesForOrdersAction(['no-soy-un-uuid']);

    expect(resultado).toMatchObject({ status: 'error', code: 'invalid_input' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });

  it('un error ajeno al dominio sale como unexpected, con referencia y sin filtrar su texto', async () => {
    listResponsiblesForOrdersMock.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const resultado = await listResponsiblesForOrdersAction([ORDER_ID]);

    expect(resultado).toMatchObject({
      status: 'error',
      code: 'unexpected',
      reference: REQUEST_ID_DE_PRUEBA,
    });
    expect(JSON.stringify(resultado)).not.toContain('connection terminated');
  });

  it('NO comprueba ningun permiso: el actor sin permisos llega igual y lo rechaza el caso de uso', async () => {
    getSessionUserMock.mockResolvedValue({ ...SESSION_USER, permissions: [] });
    const puertos = cablearCasosDeUsoReales();

    const resultado = await listResponsiblesForOrdersAction([ORDER_ID]);

    expect(listResponsiblesForOrdersMock.mock.calls[0]?.[0]).toEqual({
      ...ACTOR_ESPERADO,
      permissions: [],
    });
    expect(resultado).toMatchObject({ status: 'error', code: 'unauthorized' });
    for (const metodo of puertos.metodos) expect(metodo).not.toHaveBeenCalled();
  });
});
