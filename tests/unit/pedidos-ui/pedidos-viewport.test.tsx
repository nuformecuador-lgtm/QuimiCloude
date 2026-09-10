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
// **Resultado: NO bloquea.** Los cuatro hechos que lo sostienen se afirman en el ultimo `describe`
// de este archivo, en los dos viewports:
//
//   1. Ninguna de las diez columnas declara ancho: `buildOrderColumns` no emite `size`, `width`,
//      `minSize` ni `maxSize`. No hay nada que la libreria pueda imponer al DOM por esa via.
//   2. Ninguna celda ni cabecera recibe un estilo de ancho en linea. `data-table.tsx` solo escribe
//      estilo en linea para el fijado (`position`, `left`/`right`, `zIndex`), nunca `width`.
//   3. La tabla usa **layout automatico**: `components/ui/table.tsx` no declara `table-fixed`, asi
//      que el navegador dimensiona cada columna **por su contenido**, y las celdas llevan
//      `whitespace-nowrap`, asi que el contenido no se parte en columnas angostas.
//   4. Los 150 px por defecto de la libreria solo alimentan los **offsets sticky**
//      (`column.getStart()`), y la unica columna fijada es la **primera**, cuyo offset es `0`. Un
//      offset de 0 no depende del ancho supuesto de nada.
//
// Es decir: el ancho por defecto de la libreria no llega al DOM en esta pantalla. Por eso **no se
// propone una tercera prop de ancho en el componente compartido** —seria alcance inventado, y la
// decision es del humano—, y P2 se **arrastra** tal como esta escrita, sin cambiar de estado.

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
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

const RECETA = {
  id: crypto.randomUUID(),
  name: 'Esmalte azul de temporada',
  imageUrl: null,
};
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
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
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

  it('P2 — ninguna columna declara ancho y ninguna celda recibe uno en linea', async () => {
    // Primera mitad: la CONFIGURACION. Si una columna declarase `size`, la libreria si tendria un
    // ancho que imponer, y los 150 px por defecto dejarian de ser inertes.
    const columnas = buildOrderColumns({ recipes: RECETAS, units: [] });
    expect(columnas).toHaveLength(8);

    for (const columna of columnas) {
      for (const clave of ['size', 'width', 'minSize', 'maxSize', 'minWidth', 'maxWidth']) {
        expect(
          Object.prototype.hasOwnProperty.call(columna, clave),
          `la columna ${columna.id} declara ${clave}`,
        ).toBe(false);
      }
    }

    // Segunda mitad: el DOM. Ni cabeceras ni celdas llevan ancho en linea.
    await renderPantalla();

    const celdas = [
      ...Array.from(document.querySelectorAll('th')),
      ...Array.from(document.querySelectorAll('td')),
    ];
    expect(celdas.length, 'la tabla deberia tener celdas').toBeGreaterThan(0);

    for (const celda of celdas) {
      expect((celda as HTMLElement).style.width, `ancho en linea a ${ancho}px`).toBe('');
      expect((celda as HTMLElement).style.minWidth, `ancho minimo en linea a ${ancho}px`).toBe('');
      expect((celda as HTMLElement).style.maxWidth, `ancho maximo en linea a ${ancho}px`).toBe('');
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
