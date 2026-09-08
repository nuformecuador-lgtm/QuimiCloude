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
  ORDER_CREATE_OPEN_TESTID,
  ORDER_FORM_CANCEL_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_SHEET_TESTID,
  OrderRowSheetActions,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  RECIPE_PICKER_TESTID,
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
import type { RecipeListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
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
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

const CANTIDAD = '12.5000';

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
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
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
  // La pantalla de pedidos ya no pide unidades (2026-09-07). El doble sigue montado -y devuelve
  // una lista vacia- para que una llamada que reapareciera no se apoyara en datos de verdad.
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [] });
  createOrderActionMock.mockResolvedValue({
    status: 'success',
    id: crypto.randomUUID(),
    numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  });
  updateOrderActionMock.mockResolvedValue({ status: 'success' });
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

    // Tampoco al abrir el panel, que es donde una segunda region se colaria sin que nadie mirase.
    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('la accion de editar de la fila abre el panel con el pedido precargado', async () => {
    // R25, R28 — `onEdit` de `OrderRowActions` (T8) cableado al panel lateral. Con el pedido en
    // estado final `OrderRowActions` no llega a emitir nada (R24) y el panel no se abre.
    const user = setupUser();
    const elPedido = pedido();
    render(<OrderRowSheetActions order={elPedido} recipes={RECETAS} />);

    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();

    await user.click(screen.getByTestId('order-action-edit'));

    await screen.findByTestId(ORDER_FORM_TESTID);
    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(elPedido.recipeId);
    // Cadena del DOM y no `toHaveValue`: sobre el control numerico ese matcher compara
    // `valueAsNumber`, y `12.5000` y `12.5` son el mismo numero pero no la misma cadena (R39).
    expect((screen.getByTestId('order-field-quantity') as HTMLInputElement).value).toBe(
      elPedido.quantity,
    );
  });

  it('con el pedido en estado final la accion de editar no abre ningun panel', async () => {
    // R24 — la pantalla anticipa la regla en vez de dejar intentarlo contra el servidor.
    const user = setupUser();
    render(
      <OrderRowSheetActions order={pedido({ status: 'ENTREGADO' })} recipes={RECETAS} />,
    );

    await user.click(screen.getByTestId('order-action-edit'));

    expect(screen.queryByTestId(ORDER_FORM_TESTID)).toBeNull();
    expect(updateOrderActionMock).not.toHaveBeenCalled();
  });
});
