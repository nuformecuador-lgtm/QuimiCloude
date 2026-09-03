import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import InventarioPage from '@/app/(private)/inventario/page';
import {
  EMPTY_CELL,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  PRODUCT_COLUMNS,
  parseProductListParams,
} from '@/app/(private)/inventario/components';
import type { SessionUser } from '@/lib/modules/identity';
import type { ProductView } from '@/lib/modules/inventario';
import type {
  CreateProductFormState,
  ProductListResult,
  ProductMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import type {
  CreatePresentationFormState,
  PresentationListResult,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Pantalla de productos, render dentro del armazon privado: R1, R5, R6-R17, R19-R21, R23, R24,
 * R26 y R31 (`specs/QC-22-pantalla-de-productos/tasks.md > T12`).
 *
 * La pantalla se monta **dentro del layout privado** —igual que en produccion— reutilizando el
 * patron de mocks de `tests/unit/private-layout.test.tsx` (`next/headers`, `next/navigation`,
 * `@/lib/composition`) y el helper `tests/helpers/viewport.ts`: jsdom no implementa `matchMedia`
 * y el layout lo usa.
 *
 * **Las seis Server Actions estan mockeadas.** No es un atajo: son el borde del modulo
 * `inventario` (QC-20, `done`), que esta ficha no abre, y sustituirlas es lo unico que permite
 * ejercitar los tres estados de la lista y un guardado rechazado sin base de datos.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre
 * literales de copy (decision del 2026-09-03). Donde aparece texto es **dato del fixture** —el
 * nombre de un producto, el mensaje que devuelve una action—, no copy de la pantalla.
 *
 * **R7 y R13 son tests en negativo a proposito**: mostrar el autor, o colar un buscador que solo
 * filtraria la pagina visible, son justo las cosas que una feature posterior puede anadir sin que
 * nada se ponga rojo.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
};

const {
  usePathnameMock,
  redirectMock,
  routerMock,
  logoutActionMock,
  cookiesMock,
  getSessionUserMock,
  listProductsActionMock,
  createProductActionMock,
  updateProductActionMock,
  deleteProductActionMock,
  listPresentationsActionMock,
  createPresentationActionMock,
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
  listProductsActionMock: vi.fn<(query: unknown) => Promise<ProductListResult>>(),
  createProductActionMock:
    vi.fn<(prev: CreateProductFormState, data: FormData) => Promise<CreateProductFormState>>(),
  updateProductActionMock:
    vi.fn<
      (
        id: string,
        prev: ProductMutationFormState,
        data: FormData,
      ) => Promise<ProductMutationFormState>
    >(),
  deleteProductActionMock:
    vi.fn<(prev: ProductMutationFormState, data: FormData) => Promise<ProductMutationFormState>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
  createPresentationActionMock:
    vi.fn<
      (prev: CreatePresentationFormState, data: FormData) => Promise<CreatePresentationFormState>
    >(),
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

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
  createProductAction: createProductActionMock,
  updateProductAction: updateProductActionMock,
  deleteProductAction: deleteProductActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: createPresentationActionMock,
}));

const testId = {
  content: 'private-content',
  titulo: 'inventario-title',
  lista: 'product-list',
  tabla: 'product-table',
  fila: 'product-row',
  esqueleto: 'product-table-skeleton',
  filaEsqueleto: 'product-row-skeleton',
  vacio: 'product-list-empty',
  primeraPagina: 'product-list-first-page',
  error: 'product-list-error',
  errorMensaje: 'product-list-error-message',
  errorCodigo: 'product-list-error-code',
  reintentar: 'product-list-retry',
  tamanoPagina: 'product-page-size',
  paginaAnterior: 'product-page-previous',
  paginaSiguiente: 'product-page-next',
  estadoPagina: 'product-page-status',
  abrirAlta: 'product-create-open',
  abrirEdicion: 'product-edit-open',
  panel: 'product-sheet',
  formulario: 'product-form',
  enviar: 'product-form-submit',
  errorFormulario: 'product-form-error',
  abrirBorrado: 'product-delete-open',
  dialogoBorrado: 'delete-product-dialog',
  mensajeBorrado: 'delete-product-message',
  cancelarBorrado: 'delete-product-cancel',
  confirmarBorrado: 'delete-product-confirm',
  selectorPresentacion: 'presentation-select',
  cargarMasPresentaciones: 'presentation-load-more',
  abrirAltaPresentacion: 'presentation-create-open',
  nombrePresentacion: 'presentation-create-name',
  guardarPresentacion: 'presentation-create-submit',
} as const;

/** Ids de presentacion: `createProductSchema` exige UUID, asi que se generan de verdad. */
const PRESENTACION_A = { id: crypto.randomUUID(), name: 'Bidón 20 L' };
const PRESENTACION_B = { id: crypto.randomUUID(), name: 'Saco 25 kg' };
const PRESENTACION_NUEVA = { id: crypto.randomUUID(), name: 'Garrafa 5 L' };

/**
 * Ids de autoria del fixture. Son cadenas **inconfundibles** a proposito: el test en negativo de
 * R7 busca su ausencia en todo el documento, y con un id realista no distinguiria entre «no se
 * muestra» y «se muestra pero parece otra cosa».
 */
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Hidróxido de sodio',
    presentationId: PRESENTACION_A.id,
    presentationName: PRESENTACION_A.name,
    stock: 42,
    cost: '1234.5000',
    minPurchase: 3,
    deliveryTime: 7,
    qtyAlert: 5,
    unit: 'kg',
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

function paginaDeProductos(
  items: readonly ProductView[],
  extra: { page?: number; pageSize?: number; total?: number; totalPages?: number } = {},
): ProductListResult {
  const pageSize = extra.pageSize ?? DEFAULT_PAGE_SIZE;
  const total = extra.total ?? items.length;

  return {
    status: 'success',
    data: {
      items,
      total,
      page: extra.page ?? 1,
      pageSize,
      totalPages: extra.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function paginaDePresentaciones(
  items: readonly { id: string; name: string }[],
  extra: { page?: number; totalPages?: number } = {},
): PresentationListResult {
  return {
    status: 'success',
    data: {
      items: items.map((item) => ({
        ...item,
        nameNormalized: item.name.toLowerCase(),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
      total: items.length,
      page: extra.page ?? 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: extra.totalPages ?? 1,
    },
  };
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar
 * un componente `async` —se queda suspendido para siempre—, asi que sin esto la lista no llegaria
 * a pintarse nunca. Lo que se conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key`
 * y su `fallback` siguen siendo los que declara la pagina.
 *
 * El test de R15 se apoya justamente en lo contrario: renderizar el arbol SIN resolver deja la
 * seccion suspendida y obliga a `<Suspense>` a pintar su `fallback`, que es lo que se afirma.
 */
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

  // Los hijos se pasan SUELTOS y no como un array: un array como tercer argumento de
  // `cloneElement` es «una lista» para React y exige `key` en cada elemento, aunque en el JSX
  // original fueran hijos estaticos. Sin esto, resolver el arbol inventaria un aviso de `key`
  // que la pagina no produce en produccion.
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo async. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return InventarioPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla dentro del layout privado, con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await resolverServerComponents(await arbolDeLaPantalla(searchParams));
  return render(await PrivateLayout({ children: arbol }));
}

/** Monta la pantalla con la lista aun en vuelo: `<Suspense>` pinta su `fallback` (R15). */
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await PrivateLayout({ children: await arbolDeLaPantalla(searchParams) }));
}

/** Datos validos del formulario de producto. Valores del test, nunca los del fixture de lista. */
const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido cítrico',
  stock: '12',
  unit: 'sacos de 25 kg',
  cost: '99.5000',
  minPurchase: '2',
  deliveryTime: '4',
  qtyAlert: '1',
};

/** Rellena el formulario abierto. Deja fuera la presentacion: la aporta su propio selector. */
async function rellenarFormulario(
  user: ReturnType<typeof userEvent.setup>,
  valores: Readonly<Record<string, string>> = {},
) {
  const datos = { ...ALTA_VALIDA, ...valores };
  for (const [campo, valor] of Object.entries(datos)) {
    const control = screen.getByTestId(`product-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
}

/** Crea una presentacion desde el propio panel y la deja seleccionada (R24). */
async function crearPresentacionEnLinea(
  user: ReturnType<typeof userEvent.setup>,
  nombre = PRESENTACION_NUEVA.name,
) {
  await user.click(screen.getByTestId(testId.abrirAltaPresentacion));
  await user.type(screen.getByTestId(testId.nombrePresentacion), nombre);
  await user.click(screen.getByTestId(testId.guardarPresentacion));
  await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalled());
}

/** Valor que el formulario enviara como presentacion: el campo oculto que monta el primitivo. */
function presentacionSeleccionada(): string | null {
  const oculto = document.querySelector<HTMLInputElement>('input[name="presentationId"]');
  return oculto === null ? null : oculto.value;
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(INVENTORY_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));
  listPresentationsActionMock.mockResolvedValue(
    paginaDePresentaciones([PRESENTACION_A, PRESENTACION_B]),
  );
  createProductActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateProductActionMock.mockResolvedValue({ status: 'success' });
  deleteProductActionMock.mockResolvedValue({ status: 'success' });
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: PRESENTACION_NUEVA.id });
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

describe('pantalla de productos — lista', () => {
  it('la pantalla de productos se renderiza dentro del armazon privado y no declara main propio', async () => {
    // R1
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));
    expect(armazon).toContainElement(screen.getByTestId(testId.tabla));
  });

  it('la tabla presenta todas las columnas de negocio declaradas', async () => {
    // R6 — se itera la DECLARACION de columnas en vez de listar diez literales: quitar una
    // columna deja este test sin encabezado que encontrar.
    const elProducto = producto();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();

    for (const columna of PRODUCT_COLUMNS) {
      expect(
        screen.getByTestId(columna.testId),
        `falta el encabezado de «${columna.key}»`,
      ).toBeInTheDocument();
      expect(screen.getByTestId(`product-cell-${columna.key}`)).toHaveTextContent(
        columna.value(elProducto),
      );
    }

    // Las diez columnas de negocio que exige R6, por su clave: si alguna desaparece de la
    // declaracion, esto se pone rojo aunque la tabla siga pintando.
    expect(PRODUCT_COLUMNS.map((columna) => columna.key)).toEqual([
      'name',
      'presentationName',
      'stock',
      'unit',
      'cost',
      'minPurchase',
      'deliveryTime',
      'qtyAlert',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('la tabla no muestra createdBy ni updatedBy', async () => {
    // R7 — test **en negativo**: los ids de autoria estan en los datos y no pueden llegar a la
    // pantalla. Anadir una columna que los pinte pone esto rojo.
    await renderPantalla();

    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(EDITOR_QUE_NO_DEBE_VERSE);

    for (const prohibida of ['createdBy', 'updatedBy', 'id', 'presentationId']) {
      expect(
        PRODUCT_COLUMNS.some((columna) => String(columna.key) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`product-cell-${prohibida}`)).toBeNull();
    }
  });

  it('el costo se presenta tal cual lo entrega la operacion', async () => {
    // R8 — cadena decimal, con sus ceros: convertirla a numero la mutaria a «1234.5».
    const conCentavos = producto({ cost: '1234.5000' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([conCentavos]));

    await renderPantalla();
    expect(screen.getByTestId('product-cell-cost').textContent).toBe(conCentavos.cost);

    cleanup();

    // Y un costo ausente no se convierte en «0» ni en «null»: se marca como vacio.
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto({ cost: null })]));
    await renderPantalla();
    expect(screen.getByTestId('product-cell-cost').textContent).toBe(EMPTY_CELL);
  });

  it('el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro', async () => {
    // R9 — el scroll horizontal es de la tabla, nunca del documento.
    await renderPantalla();

    const tabla = screen.getByTestId(testId.tabla);
    const envoltorio = tabla.closest('[data-slot="table-container"]');

    expect(envoltorio).not.toBeNull();
    expect((envoltorio as HTMLElement).className).toContain('overflow-x-auto');
    expect(envoltorio).toContainElement(tabla);

    for (
      let ancestro = (envoltorio as HTMLElement).parentElement;
      ancestro !== null;
      ancestro = ancestro.parentElement
    ) {
      const clases = String(ancestro.className);
      expect(clases, `${ancestro.tagName} no debe declarar scroll horizontal`).not.toContain(
        'overflow-x',
      );
      expect(clases, `${ancestro.tagName} no debe usar 100vh`).not.toContain('100vh');
    }

    // Las acciones de fila siguen siendo alcanzables dentro de la propia tabla.
    const fila = screen.getByTestId(testId.fila);
    expect(within(fila).getByTestId(testId.abrirEdicion)).toBeVisible();
    expect(within(fila).getByTestId(testId.abrirBorrado)).toBeVisible();
  });

  it('el selector de tamano de pagina ofrece 10 y 25 y usa 10 por defecto', async () => {
    // R10 — el defecto se observa en lo que se le PIDE al backend, que es quien decide la
    // consulta; las dos opciones, en el selector.
    const user = userEvent.setup();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()], { total: 40 }));

    await renderPantalla();

    expect(listProductsActionMock).toHaveBeenCalledWith({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`product-page-size-${tamano}`)).toBeInTheDocument();
    }

    // Elegir el otro tamano NAVEGA: no hay estado local que mienta sobre la URL.
    await user.click(screen.getByTestId(`product-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    // R11
    const user = userEvent.setup();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto()], { page: 2, total: 30, totalPages: 3 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2' });

    const estado = screen.getByTestId(testId.estadoPagina);
    expect(estado).toHaveTextContent('2');
    expect(estado).toHaveTextContent('3');

    await user.click(screen.getByTestId(testId.paginaSiguiente));
    expect(
      new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]).get(PAGE_PARAM),
    ).toBe('3');

    await user.click(screen.getByTestId(testId.paginaAnterior));
    expect(
      new URLSearchParams(String(routerMock.push.mock.calls[1][0]).split('?')[1]).get(PAGE_PARAM),
    ).toBe('1');
  });

  it('en los extremos no ofrece avanzar ni retroceder mas alla', async () => {
    // R11 — el indicador no puede prometer una pagina que no existe.
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
  });

  it('la pantalla no ofrece busqueda ni control de orden', async () => {
    // R13 — test **en negativo**: filtrar en cliente solo buscaria dentro de la pagina visible,
    // y el backend no soporta ni busqueda ni orden configurable.
    await renderPantalla();

    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);

    // El unico control de seleccion de la lista es el tamano de pagina.
    const combos = screen.queryAllByRole('combobox');
    expect(combos).toHaveLength(1);
    expect(combos[0]).toBe(screen.getByTestId(testId.tamanoPagina));

    // Y ningun encabezado de columna es un control: nada de ordenar pulsando el titulo.
    for (const encabezado of screen.getAllByRole('columnheader')) {
      expect(within(encabezado).queryAllByRole('button')).toHaveLength(0);
      expect(within(encabezado).queryAllByRole('link')).toHaveLength(0);
    }
  });

  it('sin productos presenta el estado vacio con la accion de crear', async () => {
    // R14 — una tabla con cero filas dice lo mismo que una consulta que fallo: no sirve.
    listProductsActionMock.mockResolvedValue(paginaDeProductos([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(within(vacio).getByTestId(testId.abrirAlta)).toBeInTheDocument();
    // Catalogo realmente vacio: no se ofrece «volver a la primera pagina», que ya es esta.
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('una pagina que se quedo atras ofrece volver a la primera', async () => {
    // R12 + R14 — caso «la pagina se vacio tras un borrado»: no es un error, es un vacio con
    // salida, y el destino se deriva de la constante de ruta.
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([], { page: 4, total: 12, totalPages: 2 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '4' });

    const destino = screen.getByTestId(testId.primeraPagina).closest('a')?.getAttribute('href');

    expect(destino?.startsWith(INVENTORY_ROUTE)).toBe(true);
    expect(
      parseProductListParams(
        Object.fromEntries(new URLSearchParams(String(destino).split('?')[1])),
      ),
    ).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('mientras carga presenta el esqueleto en lugar de la tabla', async () => {
    // R15 — la seccion es un Server Component async: sin resolver queda suspendida y el
    // `<Suspense>` de la pagina pinta su `fallback`, que es exactamente lo que se afirma.
    await renderPantallaCargando({ [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();

    // Tantas filas como el tamano de pagina pedido: el esqueleto dice la verdad sobre cuanto se
    // esta pidiendo.
    expect(within(esqueleto).getAllByTestId(testId.filaEsqueleto)).toHaveLength(MAX_PAGE_SIZE);
  });

  it('un error de la consulta presenta el estado de error con reintento y no una tabla vacia', async () => {
    // R16
    const user = userEvent.setup();
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es valida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es valida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('un error unauthorized se presenta como error y no se muestran datos del catalogo', async () => {
    // R5 — la pantalla no decide autorizacion: presenta lo que la operacion responde y no ensena
    // ni un dato.
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
  });

  it('presenta lista y acciones en viewport angosto y en ancho', async () => {
    // R31 — el layout privado cambia de mecanismo en 768px; la pantalla debe seguir siendo
    // utilizable a los dos lados del breakpoint, con sus acciones a la vista (nada de `hover`).
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.abrirAlta), `alta a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.abrirEdicion), `edicion a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.abrirBorrado), `borrado a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();

      cleanup();
    }
  });
});

describe('pantalla de productos — alta, edicion y borrado', () => {
  it('crear abre un panel lateral sobre la lista, sin navegar ni perder la pagina', async () => {
    // R17 — panel lateral, no pagina completa ni dialogo centrado. Abrirlo y cerrarlo no cambia
    // la URL, asi que la lista de detras conserva pagina y tamano.
    const user = userEvent.setup();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto()], { page: 2, pageSize: MAX_PAGE_SIZE, total: 60 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2', [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    expect(listProductsActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE });

    await user.click(screen.getByTestId(testId.abrirAlta));

    const panel = await screen.findByTestId(testId.panel);
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(within(panel).getByTestId(testId.formulario)).toBeInTheDocument();
    // La lista sigue detras: el panel se superpone, no sustituye la pantalla.
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    // Ni al abrir ni al cerrar se navego a ninguna parte.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(listProductsActionMock).toHaveBeenCalledTimes(1);
  });

  it('la edicion precarga los valores actuales y envia el reemplazo completo', async () => {
    // R19
    const user = userEvent.setup();
    const elProducto = producto({ name: 'Sosa cáustica', unit: 'kg', cost: '10.2500' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    const precargado: Record<string, string> = {
      name: elProducto.name,
      unit: String(elProducto.unit),
      cost: String(elProducto.cost),
      stock: String(elProducto.stock),
      minPurchase: String(elProducto.minPurchase),
      deliveryTime: String(elProducto.deliveryTime),
      qtyAlert: String(elProducto.qtyAlert),
    };

    for (const [campo, valor] of Object.entries(precargado)) {
      expect(screen.getByTestId(`product-field-${campo}`), campo).toHaveValue(
        campo === 'name' || campo === 'unit' || campo === 'cost' ? valor : Number(valor),
      );
    }
    expect(presentacionSeleccionada()).toBe(elProducto.presentationId);

    // Se cambia un solo campo y se envia: el reemplazo viaja COMPLETO, con los demas incluidos.
    await user.clear(screen.getByTestId('product-field-name'));
    await user.type(screen.getByTestId('product-field-name'), 'Sosa cáustica perlas');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateProductActionMock).toHaveBeenCalledTimes(1));

    const [id, , enviado] = updateProductActionMock.mock.calls[0];
    expect(id).toBe(elProducto.id);
    expect(enviado.get('name')).toBe('Sosa cáustica perlas');
    expect(enviado.get('presentationId')).toBe(elProducto.presentationId);
    for (const [campo, valor] of Object.entries(precargado)) {
      if (campo === 'name') continue;
      expect(enviado.get(campo), `${campo} debe viajar en el reemplazo`).toBe(valor);
    }
  });

  it('un guardado rechazado por un campo muestra el error en linea y no cierra el panel', async () => {
    // R20 (primera mitad) — el error identifica campo, asi que va junto al campo. Y no se llega
    // siquiera a llamar a la operacion: la validacion previa usa el mismo esquema del servidor.
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await crearPresentacionEnLinea(user);
    await rellenarFormulario(user, { cost: 'mil pesos' });
    await user.click(screen.getByTestId(testId.enviar));

    const errorDeCampo = await screen.findByTestId('product-error-cost');
    expect(errorDeCampo).toBeInTheDocument();
    expect(screen.getByTestId('product-field-cost')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('product-field-cost')).toHaveAttribute(
      'aria-describedby',
      errorDeCampo.id,
    );

    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    // Y no se pierde lo escrito.
    expect(screen.getByTestId('product-field-name')).toHaveValue(ALTA_VALIDA.name);
  });

  it('un guardado rechazado por la operacion muestra el error del formulario y conserva lo escrito', async () => {
    // R20 (segunda mitad) — `unauthorized` no identifica campo: va a la region de error del
    // formulario, el panel sigue abierto y lo escrito sigue ahi.
    const user = userEvent.setup();
    createProductActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await crearPresentacionEnLinea(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(region).toHaveAttribute('role', 'alert');
    expect(within(region).getByTestId('product-form-error-message')).toHaveTextContent(
      'No autorizado.',
    );
    expect(within(region).getByTestId('product-form-error-code')).toHaveTextContent('unauthorized');

    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-field-name')).toHaveValue(ALTA_VALIDA.name);
    expect(screen.getByTestId('product-field-unit')).toHaveValue(ALTA_VALIDA.unit);
  });

  it('un guardado con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R21 — y R18: el alta sale por la Server Action del catalogo, con los campos de negocio.
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await crearPresentacionEnLinea(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const enviado = createProductActionMock.mock.calls[0][1];
    expect(enviado.get('presentationId')).toBe(PRESENTACION_NUEVA.id);
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(enviado.get(campo), campo).toBe(valor);
    }

    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('la unidad se captura como texto libre', async () => {
    // R23 — texto libre, no un conjunto cerrado: hoy es un campo de texto y QC-32 lo convertira
    // en selector. Si alguien lo cerrara antes de tiempo, esto se pone rojo.
    const user = userEvent.setup();
    const libre = 'medio saco (a granel)';

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const unidad = screen.getByTestId('product-field-unit');
    expect(unidad.tagName).toBe('INPUT');
    expect(unidad).toHaveAttribute('type', 'text');
    expect(unidad).not.toHaveAttribute('list');

    // El unico control de conjunto cerrado del formulario es la presentacion, que SI lo es por
    // contrato (R24). La unidad no puede convertirse en otro sin que esto se ponga rojo.
    const combos = within(screen.getByTestId(testId.formulario)).getAllByRole('combobox');
    expect(combos).toHaveLength(1);
    expect(combos[0]).toBe(screen.getByTestId(testId.selectorPresentacion));

    await crearPresentacionEnLinea(user);
    await rellenarFormulario(user, { unit: libre });
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    expect(createProductActionMock.mock.calls[0][1].get('unit')).toBe(libre);
  });

  it('el selector alcanza presentaciones mas alla de la primera pagina', async () => {
    // R24 (primera mitad) — el backend no ofrece busqueda y su tope es 25 por pagina, asi que
    // sin «Cargar más» habria presentaciones inalcanzables.
    const user = userEvent.setup();
    listPresentationsActionMock.mockResolvedValueOnce(
      paginaDePresentaciones([PRESENTACION_A], { page: 1, totalPages: 2 }),
    );
    listPresentationsActionMock.mockResolvedValueOnce(
      paginaDePresentaciones([PRESENTACION_B], { page: 2, totalPages: 2 }),
    );

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await waitFor(() =>
      expect(listPresentationsActionMock).toHaveBeenCalledWith({ page: 1, pageSize: MAX_PAGE_SIZE }),
    );

    await user.click(await screen.findByTestId(testId.cargarMasPresentaciones));

    await waitFor(() =>
      expect(listPresentationsActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE }),
    );

    // Alcanzada la ultima pagina, ya no queda nada que cargar.
    await waitFor(() => expect(screen.queryByTestId(testId.cargarMasPresentaciones)).toBeNull());

    // Y las dos presentaciones —la de la primera pagina y la de la segunda— estan disponibles.
    await user.click(screen.getByTestId(testId.selectorPresentacion));
    const opciones = await screen.findAllByTestId('presentation-option');
    expect(opciones.map((opcion) => opcion.textContent)).toEqual([
      PRESENTACION_A.name,
      PRESENTACION_B.name,
    ]);
  });

  it('permite crear una presentacion desde el formulario y la deja seleccionada sin perder lo escrito', async () => {
    // R24 (segunda mitad) — un producto no puede existir sin presentacion, y esta pantalla ya no
    // trae el catalogo de presentaciones: sin esto, una base sin presentaciones deja el alta
    // muerta.
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // Se escribe ANTES de crear la presentacion: lo escrito no puede perderse por el camino.
    await rellenarFormulario(user);
    await crearPresentacionEnLinea(user);

    expect(createPresentationActionMock.mock.calls[0][1].get('name')).toBe(PRESENTACION_NUEVA.name);
    await waitFor(() => expect(presentacionSeleccionada()).toBe(PRESENTACION_NUEVA.id));

    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      const control = screen.getByTestId(`product-field-${campo}`);
      expect(control, `${campo} no puede perder lo escrito`).toHaveValue(
        control.getAttribute('type') === 'number' ? Number(valor) : valor,
      );
    }
  });

  it('el borrado pide confirmacion nombrando el producto y sin confirmar no invoca la operacion', async () => {
    // R26
    const user = userEvent.setup();
    const elProducto = producto({ name: 'Peróxido de hidrógeno' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));

    const dialogo = await screen.findByTestId(testId.dialogoBorrado);
    // El dialogo NOMBRA el producto: el nombre es dato del fixture, no copy de la pantalla.
    expect(within(dialogo).getByTestId(testId.mensajeBorrado)).toHaveTextContent(elProducto.name);
    expect(deleteProductActionMock).not.toHaveBeenCalled();

    // Cancelar no borra nada.
    await user.click(screen.getByTestId(testId.cancelarBorrado));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(deleteProductActionMock).not.toHaveBeenCalled();

    // Solo al confirmar se invoca la operacion, con el id del producto.
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(deleteProductActionMock).toHaveBeenCalledTimes(1));
    expect(deleteProductActionMock.mock.calls[0][1].get('id')).toBe(elProducto.id);
  });

  it('un borrado con exito cierra el dialogo, avisa por toast y refresca la lista', async () => {
    // R21 aplicado al borrado (R26 remata en R21).
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});
