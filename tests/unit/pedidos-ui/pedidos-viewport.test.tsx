// QC-35 T14 — Multiplataforma y desbordamiento: R22 y R45.
//
// **La pantalla REAL, dentro del layout privado, en los DOS viewports.** Se reutiliza el arnes de
// `order-sheet.test.tsx` (mocks de `next/headers`, `next/navigation`, `@/lib/composition` y las
// Server Actions) porque lo que R22 y R45 preguntan —quien se desplaza, que es alcanzable, que
// mide cada control— solo tiene respuesta con el arbol completo montado: el contenedor de scroll
// lo aporta el primitivo `Table` y la cabecera de la pantalla vive en `page.tsx`.
//
// **Cada caso corre a 375 px y a 1280 px**, sin excepcion de escritorio (`requirements.md >
// Decisiones cerradas > Multiplataforma`). No es un `for` dentro de un caso: es `describe.each`,
// para que el informe diga en cual de los dos anchos fallo.
//
// **Lo que jsdom NO puede decir, y como se sustituye.** jsdom no hace layout: `offsetWidth` es 0 y
// `getComputedStyle` no resuelve clases de Tailwind, que ademas no estan compiladas aqui. Asi que
// «44x44 px» y «16 px» se afirman sobre los tokens de clase (`min-h-11`/`min-w-11` = 2.75rem = 44
// px; `text-base` = 1rem = 16 px, mas `md:text-base` para que no vuelva a 14 px en el breakpoint),
// que es el mismo criterio que ya usan QC-11 y QC-44 y el unico honesto en este entorno. La
// medida real en un dispositivo la cubre la comprobacion en Safari de iOS que QC-56 tiene
// marcada como bloqueante (decision humana del 2026-09-04), no esta ficha.
//
// **Ningun assert sobre copy** (R44): todo se localiza por `data-testid`, por rol accesible o por
// constantes exportadas.
//
// ---
//
// ## Comprobacion formal de la deuda P2 de QC-55 (ancho de columna)
//
// `requirements.md > P2` y `design.md > 6.4` la dejan abierta: `DataTableColumn` no expone ancho,
// asi que «toda columna cae en los 150 px por defecto de la libreria». La pantalla tiene tres
// columnas angostas (correlativo, estado, prioridad) y dos anchas (receta, motivo), y `tasks.md >
// T14` obliga a **comprobarlo y anotar el resultado**, parando si resultara inservible.
//
// **Resultado: CERRADA por decision humana.** La pantalla declara ancho fijo donde lo necesita
// y contenido en el resto, y los hechos que lo sostienen se afirman en el ultimo `describe`
// de este archivo, en los dos viewports:
//
//   1. Solo `recipeName` declara ancho: `width: 500` del contrato (fijo + minimo en linea, para
//      que el salto de linea no la encoja) con `hideText: false` (el texto parte dentro de esos
//      500 px). Es el texto largo de la fila y sin tope empuja al resto fuera de la vista.
//   2. Ninguna columna declara las claves de dimensionado de la LIBRERIA (`size`, `minSize`,
//      `maxSize`, ...): por esa via la libreria no impone nada al DOM, y sus 150 px por defecto
//      solo alimentan los offsets sticky.
//   3. El resto de celdas y cabeceras no lleva ningun estilo de ancho en linea: `data-table.tsx`
//      solo escribe `width`/`minWidth` donde la columna lo declara, y `position`/`left`/`right`
//      para el fijado.
//   4. La tabla usa **layout automatico**: `components/ui/table.tsx` no declara `table-fixed`, asi
//      que el navegador dimensiona por contenido lo no declarado, y las celdas sin `hideText`
//      llevan `whitespace-nowrap`, asi que el contenido no se parte en columnas angostas.
//   5. La unica columna fijada es la del correlativo (R19), y es la **primera**, cuyo offset
//      sticky es `0`. Un offset de 0 no depende del ancho supuesto de nada.
//
// Es decir: el ancho declarado llega al DOM solo donde la pantalla lo pide, y el ancho por
// defecto de la libreria sigue sin llegar a ninguna parte en esta pantalla.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PrivateLayout from '@/app/(private)/layout';
import PedidosPage from '@/app/(private)/pedidos/page';
import {
  ACTIONS_COLUMN_ID,
  ORDER_CREATE_OPEN_TESTID,
  ORDER_FORM_CANCEL_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_NUMBER_COLUMN_ID,
  ORDER_PRIORITY_SELECT_TESTID,
  QUANTITY_COLUMN_ID,
  RECIPE_NAME_COLUMN_ID,
  RECIPE_PICKER_TESTID,
  buildOrderColumns,
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
import type { UnitView } from '@/lib/modules/unidades';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

/** Area tactil minima de R45: `min-h-11`/`min-w-11` = 2.75rem = 44 px. */
const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

/** Tamano de fuente minimo de R45: `text-base` = 1rem = 16 px, y que no baje en el breakpoint. */
const FUENTE_DE_CAMPO = ['text-base', 'md:text-base'] as const;

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

// Dobles de las seis operaciones. Las tres de escritura FALLAN si se les llama: este archivo
// mide la pantalla, no la ejercita contra el backend.
vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  listOrdersAction: listOrdersActionMock,
  createOrderAction: createOrderActionMock,
  updateOrderAction: updateOrderActionMock,
  cancelOrderAction: vi.fn(() => {
    throw new Error('cancelOrderAction no debe invocarse desde este archivo');
  }),
  deleteOrderAction: vi.fn(() => {
    throw new Error('deleteOrderAction no debe invocarse desde este archivo');
  }),
  getOrderAction: vi.fn(() => {
    throw new Error('getOrderAction no debe invocarse: la fila ya trae el pedido entero');
  }),
  // Mismo criterio que `listResponsiblesForOrdersAction` justo arriba -la seccion de lista SI la
  // invoca, una vez por pagina- con el lote vacio: este archivo mide viewport, no afirma sobre
  // cobertura.
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

const RECETA = {
  id: crypto.randomUUID(),
  name: 'Esmalte azul de temporada',
  imageUrl: null,
};

/** Presentacion del catalogo, ofrecida por `listPresentationsAction` en el selector del panel. */
const PRESENTACION = { id: crypto.randomUUID(), name: 'Bidón 20L' };
// QC-39 (T1): el listado devuelve `UnitView` -equivalencia y `isSystem` incluidos-. Lo que
// cambia es la forma del fixture; ningun aserto de este archivo cambia de exigencia.
const UNIDAD: UnitView = {
  id: crypto.randomUUID(),
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

/**
 * El pedido del caso: **PENDIENTE**, para que las tres acciones de fila esten habilitadas (R24),
 * y con un motivo largo en otra fila para que la tabla tenga de verdad columnas anchas y
 * angostas conviviendo, que es el escenario de la deuda P2.
 */
const PEDIDO_ID = crypto.randomUUID();

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: PEDIDO_ID,
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    quantity: '12.5000',
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

const PEDIDO_CANCELADO = pedido({
  id: crypto.randomUUID(),
  number: { year: 2026, sequence: 43 },
  numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  status: 'CANCELADO',
  cancellationReason:
    'El cliente anulo el encargo despues de confirmar la formula, y la unidad de produccion ya no puede reprogramarlo esta semana.',
});

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

/** Monta la pantalla REAL dentro del layout privado, con la lista ya resuelta. */
async function renderPantalla() {
  const arbol = await resolverServerComponents(
    await PedidosPage({ searchParams: Promise.resolve({}) }),
  );
  return render(await PrivateLayout({ children: arbol }));
}

/** Todas las clases de un elemento, ya troceadas: `className` de un SVG no es una cadena. */
function clases(elemento: Element): string[] {
  return Array.from(elemento.classList);
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(ORDERS_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listOrdersActionMock.mockResolvedValue(paginaDePedidos([pedido(), PEDIDO_CANCELADO]));
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
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
  // El panel de edicion pide el detalle de la receta para los ingredientes: por defecto una
  // receta sin lineas, que es lo unico que este archivo necesita.
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
  clearSidebarStateCookie();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
  clearSidebarStateCookie();
});

const VIEWPORTS = [
  ['angosto', NARROW_VIEWPORT],
  ['ancho', WIDE_VIEWPORT],
] as const;

describe.each(VIEWPORTS)('pantalla de pedidos en viewport %s (%i px)', (_nombre, ancho) => {
  beforeEach(() => {
    setViewportWidth(ancho);
  });

  it('el desbordamiento se resuelve DENTRO de la tabla, no en el documento (R22)', async () => {
    await renderPantalla();

    // El scroll horizontal lo aporta el contenedor del primitivo `Table`, que envuelve a la tabla.
    const tabla = screen.getByRole('table');
    const contenedor = tabla.parentElement;
    expect(contenedor, 'la tabla debe ir envuelta en su contenedor de scroll').not.toBeNull();
    expect(contenedor?.getAttribute('data-slot')).toBe('table-container');
    expect(clases(contenedor as Element)).toContain('overflow-x-auto');

    // Y es el UNICO desplazador horizontal de la pantalla: si otro ancestro tambien desplazara,
    // el desbordamiento se escaparia de la tabla y acabaria moviendo el documento.
    const desplazadores = Array.from(
      document.querySelectorAll('.overflow-x-auto, .overflow-x-scroll'),
    );
    expect(desplazadores).toEqual([contenedor]);

    // Nadie fuerza el ancho del documento: ni `w-screen`, ni un minimo en pixeles, ni un
    // `overflow` en linea sobre `html`/`body`.
    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      expect(clases(elemento), `${elemento.tagName} fuerza el ancho del documento`).not.toContain(
        'w-screen',
      );
    }
    expect(document.documentElement.style.overflowX).toBe('');
    expect(document.body.style.overflowX).toBe('');
  });

  it('las acciones de fila siguen siendo alcanzables dentro de la tabla (R22)', async () => {
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${PEDIDO_ID}`);
    const celda = within(fila).getByTestId(`data-table-cell-${ACTIONS_COLUMN_ID}`);

    // Las tres, en el DOM y visibles, sin ninguna interaccion previa.
    for (const accion of ['order-action-edit', 'order-action-cancel', 'order-action-delete']) {
      const control = within(celda).getByTestId(accion);
      expect(control, `${accion} a ${ancho}px`).toBeVisible();
      expect(control, `${accion} a ${ancho}px`).toBeEnabled();
    }

    // Y viajan DENTRO del contenedor que se desplaza: el scroll de la tabla las alcanza sin que
    // el documento se mueva.
    expect(screen.getByRole('table').parentElement?.contains(celda)).toBe(true);
  });

  it('ningun control se descubre ni se activa solo con :hover (R45)', async () => {
    await renderPantalla();

    // 1) En el DOM: los tres controles de fila y el disparador del alta estan visibles ya, sin
    //    pasar el puntero por encima. En tactil no hay puntero que pasar.
    const fila = screen.getByTestId(`data-table-row-${PEDIDO_ID}`);
    for (const accion of ['order-action-edit', 'order-action-cancel', 'order-action-delete']) {
      expect(within(fila).getByTestId(accion)).toBeVisible();
    }
    expect(screen.getByTestId(ORDER_CREATE_OPEN_TESTID)).toBeVisible();

    // 2) En las clases: ningun elemento de la pantalla usa el puntero para REVELAR nada. Un
    //    `hover:bg-muted` es decoracion y no molesta a nadie; lo que R45 prohibe es que la
    //    existencia o la visibilidad de un control dependa del puntero.
    const revelaConElPuntero = /^(group-)?hover:(flex|block|inline|inline-flex|visible|opacity-100)$/;
    const ocultoDeSalida = new Set(['invisible', 'opacity-0']);

    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(clase, `${elemento.tagName} revela con el puntero a ${ancho}px`).not.toMatch(
          revelaConElPuntero,
        );
        expect(
          ocultoDeSalida.has(clase),
          `${elemento.tagName} arranca oculto y solo el puntero lo trae a ${ancho}px`,
        ).toBe(false);
      }
    }
  });

  it('los controles tactiles de la lista miden al menos 44x44 px (R45)', async () => {
    await renderPantalla();

    const fila = screen.getByTestId(`data-table-row-${PEDIDO_ID}`);
    const controles = [
      ...['order-action-edit', 'order-action-cancel', 'order-action-delete'].map((accion) =>
        within(fila).getByTestId(accion),
      ),
      screen.getByTestId(ORDER_CREATE_OPEN_TESTID),
    ];

    for (const control of controles) {
      for (const token of AREA_TACTIL) {
        expect(
          control.className,
          `${control.getAttribute('data-testid')} a ${ancho}px`,
        ).toContain(token);
      }
    }
  });

  it('los campos y las acciones del formulario cumplen 44x44 px y 16 px de fuente (R45)', async () => {
    // 16 px es el umbral por debajo del cual Safari en iOS hace zoom al enfocar el campo, y ese
    // zoom deja la pantalla desplazada a mano. Se comprueba en los DOS anchos: `md:text-base`
    // esta justamente para que el campo no vuelva a 14 px en el breakpoint de escritorio.
    const user = setupUser();
    await renderPantalla();

    await user.click(screen.getByTestId(ORDER_CREATE_OPEN_TESTID));
    await screen.findByTestId(ORDER_FORM_TESTID);

    // Eran cinco campos hasta el 2026-09-07: el precio unitario y el selector de unidad salieron
    // del formulario con la decision humana. Los que quedan se siguen midiendo uno a uno.
    const campos = [
      screen.getByTestId(`order-field-${QUANTITY_COLUMN_ID}`),
      screen.getByTestId(RECIPE_PICKER_TESTID),
      screen.getByTestId('presentation-select'),
      screen.getByTestId(ORDER_PRIORITY_SELECT_TESTID),
    ];

    for (const campo of campos) {
      const nombre = campo.getAttribute('data-testid');
      for (const token of FUENTE_DE_CAMPO) {
        expect(campo.className, `${nombre} a ${ancho}px`).toContain(token);
      }
      // Los campos tambien son objetivos tactiles: al menos el alto.
      expect(campo.className, `${nombre} a ${ancho}px`).toContain('min-h-11');
    }

    for (const accion of [ORDER_FORM_SUBMIT_TESTID, ORDER_FORM_CANCEL_TESTID]) {
      const control = screen.getByTestId(accion);
      for (const token of AREA_TACTIL) {
        expect(control.className, `${accion} a ${ancho}px`).toContain(token);
      }
    }

    // El panel no se pega al borde inferior del movil: respeta el area segura.
    expect(screen.getByTestId('order-sheet').className).toContain('env(safe-area-inset-bottom)');
  });

  it('la pantalla no usa 100vh como alto (R45)', async () => {
    // `100vh` en un navegador movil mide la ventana SIN la barra del navegador, asi que el ultimo
    // trozo de la pantalla queda debajo de ella y no se alcanza. Se comprueba sobre el DOM
    // montado —clases y estilo en linea— y no solo sobre la fuente de la ruta: el alto podria
    // colarse por cualquier pieza que la pantalla componga.
    await renderPantalla();

    const prohibidas = new Set(['h-screen', 'min-h-screen', 'max-h-screen']);

    for (const elemento of Array.from(document.body.querySelectorAll('*'))) {
      for (const clase of clases(elemento)) {
        expect(prohibidas.has(clase), `${elemento.tagName} usa ${clase} a ${ancho}px`).toBe(false);
        expect(clase, `${elemento.tagName} usa 100vh a ${ancho}px`).not.toContain('100vh');
      }
      const estilo = elemento.getAttribute('style') ?? '';
      expect(estilo, `${elemento.tagName} usa 100vh en linea a ${ancho}px`).not.toContain('100vh');
    }
  });

  // ------------------------------------------------------------------------------------------
  // P2 de QC-55 (ancho de columna): comprobacion formal. Ver la cabecera de este archivo.
  // ------------------------------------------------------------------------------------------

  it('P2 — solo receta declara ancho fijo y el resto no recibe ninguno en linea', async () => {
    // Primera mitad: la CONFIGURACION. Solo `recipeName` declara el `width` del contrato
    // (decision humana: es el texto largo de la fila); ninguna declara las claves de
    // dimensionado de la libreria, asi que por esa via no impone nada.
    const columnas = buildOrderColumns({ recipes: RECETAS, units: [] });
    expect(columnas).toHaveLength(11);

    for (const columna of columnas) {
      for (const clave of ['size', 'minSize', 'maxSize', 'minWidth', 'maxWidth']) {
        expect(
          Object.prototype.hasOwnProperty.call(columna, clave),
          `la columna ${columna.id} declara ${clave}`,
        ).toBe(false);
      }
    }

    const receta = columnas.find((columna) => columna.id === RECIPE_NAME_COLUMN_ID);
    expect(receta?.width).toBe(500);
    expect(receta?.hideText).toBe(false);
    for (const columna of columnas.filter((otra) => otra.id !== RECIPE_NAME_COLUMN_ID)) {
      expect(
        Object.prototype.hasOwnProperty.call(columna, 'width'),
        `la columna ${columna.id} declara width`,
      ).toBe(false);
    }

    // Segunda mitad: el DOM. Solo las celdas de receta llevan ancho en linea (fijo + minimo,
    // para que el salto de linea no la encoja); el resto, ninguno.
    await renderPantalla();

    const celdas = [
      ...Array.from(document.querySelectorAll('th')),
      ...Array.from(document.querySelectorAll('td')),
    ];
    expect(celdas.length, 'la tabla deberia tener celdas').toBeGreaterThan(0);

    for (const celda of celdas) {
      const esReceta =
        celda.getAttribute('data-testid') === `data-table-cell-${RECIPE_NAME_COLUMN_ID}` ||
        celda.getAttribute('data-testid') === `data-table-head-${RECIPE_NAME_COLUMN_ID}`;
      const estilo = celda as HTMLElement;
      expect(estilo.style.width, `ancho en linea a ${ancho}px`).toBe(esReceta ? '500px' : '');
      expect(estilo.style.minWidth, `ancho minimo en linea a ${ancho}px`).toBe(
        esReceta ? '500px' : '',
      );
      expect(estilo.style.maxWidth, `ancho maximo en linea a ${ancho}px`).toBe('');
      expect(celda.getAttribute('width'), `atributo width a ${ancho}px`).toBeNull();
    }
  });

  it('P2 — la tabla dimensiona por contenido y el unico fijado tiene offset 0', async () => {
    await renderPantalla();

    const tabla = screen.getByRole('table');
    // Layout AUTOMATICO: sin `table-fixed`, el navegador reparte por contenido. Y con
    // `whitespace-nowrap` en las celdas, una columna angosta no parte su texto.
    expect(clases(tabla)).not.toContain('table-fixed');
    expect(tabla.style.tableLayout).toBe('');

    const fila = screen.getByTestId(`data-table-row-${PEDIDO_ID}`);
    const celdaCorrelativo = within(fila).getByTestId(`data-table-cell-${ORDER_NUMBER_COLUMN_ID}`);
    expect(clases(celdaCorrelativo)).toContain('whitespace-nowrap');

    // La unica columna fijada es la del correlativo (R19), y es la PRIMERA: su offset sticky es
    // 0, asi que no depende del ancho por defecto que la libreria supone para nadie.
    await waitFor(() => expect(celdaCorrelativo.getAttribute('data-pinned')).toBe('left'));
    expect(celdaCorrelativo.style.position).toBe('sticky');
    expect(celdaCorrelativo.style.left).toBe('0px');

    const fijadas = Array.from(fila.querySelectorAll('[data-pinned]'));
    expect(fijadas, `mas de una columna fijada a ${ancho}px`).toEqual([celdaCorrelativo]);
  });
});
