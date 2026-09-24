// QC-35 T10 — El panel lateral de alta y edicion: R25, R35 y R36.
//
// **La pantalla se monta DENTRO del layout privado**, igual que en produccion, reutilizando el
// patron de mocks de `tests/unit/private-layout.test.tsx` (`next/headers`, `next/navigation`,
// `@/lib/composition`): es la unica forma de afirmar sobre la region de avisos que el layout ya
// monta (R36) y de comprobar que el panel se abre SOBRE la lista sin navegar (R25).
//
// **Las Server Actions estan mockeadas.** No es un atajo: son el borde de modulos que esta ficha
// no abre (R46), y sustituirlas es lo unico que permite ejercitar el panel sin base de datos.
//
// **Ningun assert sobre copy** (R44).

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PrivateLayout from '@/app/(private)/layout';
import PedidosPage from '@/app/(private)/pedidos/page';
import {
  ORDER_COST_QUOTE_TESTID,
  ORDER_CREATE_OPEN_TESTID,
  ORDER_FORM_CANCEL_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_FORM_TITLE_TESTID,
  ORDER_SHEET_TESTID,
  OrderRowSheetActions,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  RECIPE_PICKER_TESTID,
  SEARCH_PARAM,
  SORT_PARAM,
  STATUS_PARAM,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type {
  CreateOrderFormState,
  OrderListResult,
  OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { RecipeListResult, RecipeQueryResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import { WIDE_VIEWPORT, clearSidebarStateCookie, resetViewport, setViewportWidth } from '../../helpers/viewport';

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-35',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  // QC-75 (T6): las pantallas privadas exigen `<modulo>.consultar` con `requirePagePermission`
  // antes de pintar nada, asi que un usuario sin permisos aqui daria 404 en vez de la pantalla
  // que este archivo mide. Se le da el CATALOGO ENTERO, derivado de `PERMISSIONS` y nunca escrito
  // a mano: este archivo no prueba autorizacion -eso es
  // `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`-, prueba lo que se ve cuando SI se
  // puede ver, y con el catalogo entero el menu filtrado tampoco pierde ningun item.
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const {
  usePathnameMock,
  redirectMock,
  routerMock,
  logoutActionMock,
  cookiesMock,
  getSessionUserMock,
  listOrdersActionMock,
  createOrderActionMock,
  updateOrderActionMock,
  listRecipesActionMock,
  listUnitsActionMock,
  getRecipeActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  logoutActionMock: vi.fn<() => Promise<void>>(),
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
  getSessionUserMock: vi.fn(),
  listOrdersActionMock: vi.fn<(query: unknown) => Promise<OrderListResult>>(),
  createOrderActionMock:
    vi.fn<(prev: CreateOrderFormState, data: FormData) => Promise<CreateOrderFormState>>(),
  updateOrderActionMock:
    vi.fn<
      (id: string, prev: OrderMutationFormState, data: FormData) => Promise<OrderMutationFormState>
    >(),
  listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

// QC-102 T10 — El BARREL de la ruta exporta ahora la seccion de responsables, que importa las
// Server Actions de QC-87 **por su ruta exacta**. Se mockean por la MISMA razon, y con el mismo
// criterio, que las de `pedidos` justo aqui arriba: son el borde de un modulo que este archivo no
// ejercita, y sin el doble la importacion del barrel arrastraria `@/lib/composition` entero.
// **El guion de este archivo no cambia**: solo se anade el doble que faltaba.
// QC-102 T11 — El barrel arrastra ahora `order-list-section.tsx`, que compone el LOTE de
// responsables y resuelve `canWrite` leyendo la sesion. Con el llega otro borde mas de
// `identity` —`work-group-actions.ts`—, que lee `observabilidad` de `@/lib/composition` **al
// cargarse**, y el doble de composicion de este archivo declara solo `identity`.
//
// **No es un cambio de guion**: no toca ni un `it(...)`, ni un selector, ni una asercion. Es el
// mismo aislamiento de bordes que este archivo ya hace con `pedidos`, `recetas` y `asignaciones`,
// y con dobles que FALLAN, que TENSAN lo afirmado en vez de relajarlo: esta suite no consulta
// usuarios ni grupos.
// La pagina vacia se construye DENTRO de cada factoria: `vi.mock` se iza por encima de los
// `const` del modulo, y una constante compartida aqui arriba seria una trampa de zona muerta.
vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  listWorkGroupsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 },
  })),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde este archivo`);
  };
  return {
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
    // QC-102 T11: la consulta EN LOTE **SI** se invoca —la seccion de lista la pide una vez por
    // pagina—, asi que su doble RESUELVE en vez de lanzar. Devuelve el lote vacio: estos archivos
    // no afirman nada sobre responsables, y con el lote vacio la columna pinta su marcador de
    // ausencia sin cambiar una sola asercion de aqui.
    listResponsiblesForOrdersAction: vi.fn(async () => ({ status: 'success', data: [] })),
    // El catalogo de personas del panel sale de esta accion.
    listResponsibleCandidatesAction: vi.fn(async () => ({ status: 'success', data: [] })),
  };
});

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  listOrdersAction: listOrdersActionMock,
  createOrderAction: createOrderActionMock,
  updateOrderAction: updateOrderActionMock,
  cancelOrderAction: vi.fn(() => {
    throw new Error('cancelOrderAction no debe invocarse desde el panel lateral');
  }),
  deleteOrderAction: vi.fn(() => {
    throw new Error('deleteOrderAction no debe invocarse desde el panel lateral');
  }),
  getOrderAction: vi.fn(() => {
    throw new Error('getOrderAction no debe invocarse: la fila ya trae el pedido entero');
  }),
  // Mismo criterio que `listResponsiblesForOrdersAction` justo arriba -la seccion de lista SI la
  // invoca, una vez por pagina- con el lote vacio: este archivo no afirma nada sobre cobertura y
  // con el lote vacio la columna pinta su marcador de ausencia.
  listOrderCoverageAction: vi.fn(async () => ({ status: 'success', data: [] })),
  quoteOrderCostAction: vi.fn(() =>
    Promise.resolve({ status: 'success', data: { ingredientsCost: null } }),
  ),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

const UNIDADES: readonly UnitView[] = [
  { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

const CANTIDAD = '12.5000';

/** Presentacion del catalogo, ofrecida por `listPresentationsAction` en el selector del panel. */
const PRESENTACION = { id: crypto.randomUUID(), name: 'Bidón 20L' };

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: crypto.randomUUID(),
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    quantity: CANTIDAD,
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationId: PRESENTACION.id,
    presentationName: PRESENTACION.name,
    ...overrides,
  };
}

function paginaDePedidos(items: readonly OrderSummary[]): OrderListResult {
  return {
    status: 'success',
    data: {
      items: [...items],
      total: items.length,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

/** Resuelve los Server Components `async` del arbol: jsdom no sabe ejecutar un componente async. */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

/** Monta la pantalla REAL dentro del layout privado, con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await resolverServerComponents(
    await PedidosPage({ searchParams: Promise.resolve(searchParams) }),
  );
  return render(await PrivateLayout({ children: arbol }));
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(ORDERS_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listOrdersActionMock.mockResolvedValue(paginaDePedidos([pedido()]));
  listRecipesActionMock.mockResolvedValue({
    status: 'success',
    data: {
      items: [
        {
          ...RECETA,
          description: null,
          imageUrl: null,
          stepCount: 0,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdBy: null,
          updatedBy: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: 1,
    },
  });
  // La pantalla de pedidos pide unidades de nuevo desde el 2026-09-09: el panel muestra los
  // ingredientes de la receta y resuelve con ellas la unidad de cada linea. El doble devuelve
  // una lista vacia: ningun caso de este archivo afirma sobre la unidad de un ingrediente.
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  getRecipeActionMock.mockResolvedValue({
    status: 'success',
    data: {
      id: RECETA.id,
      name: RECETA.name,
      description: null,
      imageUrl: null,
      stepCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
      steps: [],
      lines: [],
    },
  });
  createOrderActionMock.mockResolvedValue({
    status: 'success',
    id: crypto.randomUUID(),
    numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  });
  updateOrderActionMock.mockResolvedValue({ status: 'success' });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
  toastExito = vi.spyOn(toast, 'success');
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
  resetViewport();
  clearSidebarStateCookie();
});

async function rellenarAlta(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)));
  await user.click(screen.getByTestId('presentation-select'));
  await user.click(await esperarInteractiva(await screen.findByTestId('presentation-option')));
  await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);
}

describe('panel lateral de pedidos (R25, R35, R36)', () => {
  it('el alta se abre en un panel lateral SOBRE la lista, sin navegar a otra URL', async () => {
    // R25 — ni dialogo modal centrado ni pagina aparte, y ninguna navegacion.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));

    expect(await screen.findByTestId(ORDER_SHEET_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(ORDER_FORM_TESTID)).toBeInTheDocument();
    // La lista sigue detras: el panel se monta SOBRE ella.
    expect(screen.getByTestId('order-list')).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('al cerrar el panel la URL conserva pagina, tamano, orden y filtros', async () => {
    // R25 (segunda mitad) — el estado de lista vive en la cadena de consulta y el panel no navega,
    // asi que abrir y cerrar no puede perderlo. Se comprueba en negativo sobre el router: ninguna
    // navegacion ocurre, ni al abrir ni al cerrar.
    const user = setupUser();
    const consulta: Consulta = {
      [PAGE_PARAM]: '2',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: 'orderNumber:desc',
      [STATUS_PARAM]: 'PENDIENTE',
    };
    listOrdersActionMock.mockResolvedValue({
      status: 'success',
      data: {
        items: [pedido()],
        total: 30,
        page: 2,
        pageSize: MAX_PAGE_SIZE,
        totalPages: 2,
      },
    });

    await renderPantalla(consulta);

    // La consulta con la que se pidio la lista es la que la URL declara: ese es el estado que hay
    // que conservar.
    const consultaUsada = listOrdersActionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(consultaUsada).toMatchObject({ page: 2, pageSize: MAX_PAGE_SIZE });

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);
    await user.click(screen.getByTestId(ORDER_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('un alta con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R35 — cerrar + aviso emergente + lista al dia sin recargar la pantalla.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);
    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull());

    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    // Y no se navego: la lista vuelve con los mismos parametros (R25).
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('un guardado rechazado NO cierra el panel', async () => {
    // R34 — el panel sigue abierto y no se avisa de un exito que no ocurrio.
    const user = setupUser();
    createOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    await renderPantalla();

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);
    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId('order-form-error');

    expect(screen.getByTestId(ORDER_FORM_TESTID)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('la zona privada sigue teniendo EXACTAMENTE una region de avisos', async () => {
    // R36 — en negativo: ningun `<Toaster />` propio de esta pantalla ni de su panel, solo el que
    // el layout privado ya monta. `sonner` solo pinta el `<ol data-sonner-toaster>` cuando hay un
    // toast en cola; lo que si esta siempre montado es su `<section aria-live>` con
    // `role="region"` (mismo criterio que `tests/unit/private-layout.test.tsx`).
    const user = setupUser();
    await renderPantalla();

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);

    // Al abrir el panel aparece el bloque de coste del propio formulario (`role="status"`, siempre
    // montado): se cuenta aparte, y fuera de el sigue habiendo exactamente el mismo aviso de antes
    // -asi que ningun `<Toaster />` propio de esta pantalla se ha sumado.
    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);

    const bloqueDeCoste = document.querySelector(`[data-testid="${ORDER_COST_QUOTE_TESTID}"]`);
    const avisosFueraDelBloqueDeCoste = Array.from(document.querySelectorAll('[aria-live]')).filter(
      (nodo) => !bloqueDeCoste?.contains(nodo),
    );

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(avisosFueraDelBloqueDeCoste).toHaveLength(1);
    expect(bloqueDeCoste?.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('la accion de editar de la fila abre el panel con el pedido precargado', async () => {
    // R25, R28 — `onEdit` de `OrderRowActions` (T8) cableado al panel lateral. Con el pedido en
    // estado final `OrderRowActions` no llega a emitir nada (R24) y el panel no se abre.
    const user = setupUser();
    const elPedido = pedido();
    render(<OrderRowSheetActions order={elPedido} recipes={RECETAS} units={UNIDADES} />);

    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();

    await user.click(screen.getByTestId('order-action-edit'));

    await screen.findByTestId(ORDER_FORM_TESTID);
    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(elPedido.recipeId);
    // Cadena del DOM y no `toHaveValue`: sobre el control numerico ese matcher compara
    // `valueAsNumber`, y «12.5000» y «12.5» son el mismo numero pero no la misma cadena (R39).
    // Esa distincion es justo la que se afirma aqui: desde el 2026-09-17 el panel precarga la
    // cantidad SIN los ceros de relleno («12.5000» -> «12.5»). Recortarlos no cambia el numero
    // -y por eso es seguro sobre un campo que se vuelve a guardar-, pero si cambia la cadena.
    expect((screen.getByTestId('order-field-quantity') as HTMLInputElement).value).toBe('12.5');
    expect(elPedido.quantity, 'el dato del pedido NO se toca, solo lo que el campo muestra').toBe(
      CANTIDAD,
    );
  });

it('con el pedido en estado final la accion de editar no abre ningun panel', async () => {
    // R24 — la pantalla anticipa la regla en vez de dejar intentarlo contra el servidor.
    const user = setupUser();
    render(
      <OrderRowSheetActions order={pedido({ status: 'ENTREGADO' })} recipes={RECETAS} units={[]} />,
    );

    await user.click(screen.getByTestId('order-action-edit'));

    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
    expect(updateOrderActionMock).not.toHaveBeenCalled();
  });

  it('reabrir el alta arranca VACIO: el label del pedido anterior no hereda', async () => {
    // Decision humana del 2026-09-09: cada apertura es una instancia nueva de formulario. Aunque
    // cerrar y volver a abrir ocurra dentro de la ventana de desmontaje del portal -o el portal se
    // quedase montado-, el alta siguiente no puede mostrar la receta ni la cantidad del anterior.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);
    await rellenarAlta(user);
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();

    await user.click(screen.getByTestId(ORDER_FORM_CANCEL_TESTID));
    await waitFor(() => expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull());

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);

    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue('');
    // El control numerico: se lee la CADENA del DOM, no `toHaveValue` (que compara `valueAsNumber`).
    expect((screen.getByTestId('order-field-quantity') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled();
    expect(screen.getByTestId(ORDER_FORM_TITLE_TESTID).textContent).not.toContain(RECETA.name);
  });
});

describe('el termino de busqueda sobrevive al panel lateral (R4, R9)', () => {
  it('con "q" en la URL, la consulta recibe el termino y la caja lo muestra (R4)', async () => {
    const termino = 'esmalte';
    await renderPantalla({ [SEARCH_PARAM]: termino });

    const consultaUsada = listOrdersActionMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(consultaUsada).toMatchObject({ search: termino });
    expect(screen.getByTestId('data-table-search')).toHaveValue(termino);
  });

  it('abrir y cerrar el panel lateral de una fila no navega y conserva el termino en la caja (R9)', async () => {
    const user = setupUser();
    const termino = 'esmalte';
    await renderPantalla({ [SEARCH_PARAM]: termino });

    expect(screen.getByTestId('data-table-search')).toHaveValue(termino);

    await user.click(screen.getByTestId('order-action-edit'));
    await screen.findByTestId(ORDER_FORM_TESTID);

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('data-table-search')).toHaveValue(termino);

    await user.click(screen.getByTestId(ORDER_FORM_CANCEL_TESTID));
    await waitFor(() => expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull());

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('data-table-search')).toHaveValue(termino);
  });
});
