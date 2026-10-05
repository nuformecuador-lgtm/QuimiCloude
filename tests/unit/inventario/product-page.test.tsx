import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import InventarioPage from '@/app/(private)/inventario/page';
import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import { formatDateLocalISO } from '@/components/shared/data-table/data-table-filter-date';
import {
  PRESENTATION_UNIT_ERROR_TESTID,
  PRESENTATION_UNIT_FIELD,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_SELECT_TESTID,
} from '@/components/shared/presentation-unit-select';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, errorMessage } from '@/lib/modules/errores';
import {
  EMPTY_CELL,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  PRODUCT_SKELETON_COLUMN_COUNT,
  buildProductColumns,
  parseProductListParams,
} from '@/app/(private)/inventario/components';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { PRODUCT_TYPES, type FinishedStockRow, type ProductView } from '@/lib/modules/inventario';
import type {
  CreateProductFormState,
  FinishedStockListResult,
  ProductListResult,
  ProductFormUnitsResult,
  ProductMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import type {
  CreatePresentationFormState,
  PresentationListResult,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { INVENTORY_ROUTE } from '@/lib/shared/routes';

import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Pantalla de productos, render dentro del armazon privado: R1, R5, R6-R17, R19-R21, R24,
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
  listProductsActionMock,
  listFinishedStockActionMock,
  createProductActionMock,
  updateProductActionMock,
  deleteProductActionMock,
  listPresentationsActionMock,
  createPresentationActionMock,
  listUnitsActionMock,
  listProductFormUnitsActionMock,
  listProductBatchesActionMock,
  listOrderBatchesActionMock,
  listBatchMovementsActionMock,
  adjustBatchStockActionMock,
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
  listFinishedStockActionMock: vi.fn<(query: unknown) => Promise<FinishedStockListResult>>(),
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
  // QC-80: la pagina pide el catalogo de unidades UNA vez, para el alta rapida de presentacion
  // que el selector lleva dentro (R11). Sin este doble la pagina intentaria abrir base de datos.
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listProductFormUnitsActionMock: vi.fn<() => Promise<ProductFormUnitsResult>>(),
  // La fila abre un panel con los lotes del producto: sin este doble, montar la tabla
  // carga el modulo real y este intenta resolver la sesion.
  listProductBatchesActionMock: vi.fn(),
  listOrderBatchesActionMock: vi.fn(),
  listBatchMovementsActionMock: vi.fn(),
  adjustBatchStockActionMock: vi.fn(),
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
  listFinishedStockAction: listFinishedStockActionMock,
  createProductAction: createProductActionMock,
  updateProductAction: updateProductActionMock,
  deleteProductAction: deleteProductActionMock,
  listProductFormUnitsAction: listProductFormUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: createPresentationActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  listProductBatchesAction: listProductBatchesActionMock,
  listOrderBatchesAction: listOrderBatchesActionMock,
  listBatchMovementsAction: listBatchMovementsActionMock,
  adjustBatchStockAction: adjustBatchStockActionMock,
}));

const testId = {
  content: 'private-content',
  titulo: 'inventario-title',
  lista: 'product-list',
  // La tabla es la compartida desde el 2026-09-07: su raiz es `data-table`.
  tabla: 'data-table',
  // `data-table-row-<id del producto>`: la tabla compartida nombra la fila por su id.
  fila: /^data-table-row-/,
  esqueleto: 'product-table-skeleton',
  filaEsqueleto: 'product-row-skeleton',
  vacio: 'product-list-empty',
  primeraPagina: 'product-list-first-page',
  error: 'product-list-error',
  errorMensaje: 'product-list-error-message',
  errorCodigo: 'product-list-error-code',
  reintentar: 'product-list-retry',
  // Desde el 2026-09-07 la tabla, su paginacion y su selector de tamano los pone
  // `components/shared/data-table`, asi que los `data-testid` son los suyos. La barra propia de
  // la ruta (`product-list-toolbar.tsx`) desaparecio.
  tamanoPagina: 'data-table-page-size',
  paginaAnterior: 'data-table-previous',
  paginaSiguiente: 'data-table-next',
  estadoPagina: 'data-table-page-indicator',
  busqueda: 'data-table-search',
  abrirAlta: 'product-create-open',
  abrirEdicion: 'product-edit-open',
  panel: 'product-sheet',
  formulario: 'product-form',
  enviar: 'product-form-submit',
  cancelarFormulario: 'product-form-cancel',
  errorFormulario: 'product-form-error',
  abrirBorrado: 'product-delete-open',
  dialogoBorrado: 'delete-product-dialog',
  mensajeBorrado: 'delete-product-message',
  cancelarBorrado: 'delete-product-cancel',
  confirmarBorrado: 'delete-product-confirm',
  selectorPresentacion: 'presentation-select',
  abrirAltaPresentacion: 'presentation-create-open',
  nombrePresentacion: 'presentation-create-name',
  guardarPresentacion: 'presentation-create-submit',
  errorAltaPresentacion: 'presentation-create-error',
} as const;

/** Ids de presentacion del fixture: las presentaciones siguen existiendo como catalogo (QC-45),
 * aunque el producto ya no las declare (se mudaron a `product_batches` el 2026-09-09). */
const PRESENTACION_A = { id: crypto.randomUUID(), name: 'Bidón 20 L' };
const PRESENTACION_B = { id: crypto.randomUUID(), name: 'Saco 25 kg' };
const PRESENTACION_NUEVA = { id: crypto.randomUUID(), name: 'Garrafa 5 L' };

/**
 * Id de unidad inconfundible que nunca deberia pintarse crudo: `ProductView.unitId` es una clave
 * foranea al catalogo, y esta pantalla solo la resuelve a un nombre a traves de `units`. El caso
 * dedicado compone un producto con esta unidad y comprueba que el UUID no aparece en el documento.
 */
const UNIDAD_QUE_NO_DEBE_VERSE = 'UNIDAD-ID-NO-VISIBLE';

/**
 * Unidad del CATALOGO, que es otra cosa que la de arriba: esta no se pinta en la pantalla, se
 * ofrece en el alta rapida de presentacion del selector (QC-80 R11). El id es un uuid de verdad
 * porque el esquema del alta de presentacion lo exige.
 */
const UNIDAD = {
  id: crypto.randomUUID(),
  name: 'Litro',
  symbol: 'L',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Hidróxido de sodio',
    imagePath: null,
    stock: '0',
    unitId: null,
    qtyAlert: '5',
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
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

/** La pestana «Producto terminado» lista pedidos: un pedido con un unico producto terminado. */
function paginaDeProductoTerminado(productoTerminado: ProductView): FinishedStockListResult {
  const fila: FinishedStockRow = {
    kind: 'order',
    key: 'order-1',
    orderId: 'order-1',
    orderNumber: { year: 2026, sequence: 1 },
    numberText: '2026-0001',
    recipeName: 'Desengrasante industrial',
    packagedStock: null,
    products: [{ product: productoTerminado, stock: productoTerminado.stock, packagedStock: null }],
  };
  return {
    status: 'success',
    data: { items: [fila], total: 1, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

/** Despliega el pedido de la pestana «Producto terminado» para ver sus productos. */
async function desplegarPedido(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('finished-stock-toggle'));
}

/** Unidad de las presentaciones de los dobles (QC-80 R1: `PresentationView.unitId` es
 *  obligatorio). No se afirma nada sobre ella en este archivo. */
const UNIDAD_DE_LA_PRESENTACION = '55555555-5555-4555-8555-555555555555';

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
        // QC-80 (R1): la presentacion declara unidad OBLIGATORIA. Aqui es solo relleno del
        // contrato -esta pantalla no la pinta-, con un uuid fijo para que el doble sea estable.
        unitId: UNIDAD_DE_LA_PRESENTACION,
        content: null,
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

/** Datos validos del formulario de producto. Valores del test, nunca los del fixture de lista.
 *
 *  ACOTADO EL 2026-09-03: costo, compra minima y tiempo de entrega salieron del formulario por
 *  decision del humano. QC-52 (R1, R5) los saca ademas del producto entero, asi que ya no hay
 *  nada que enviar oculto: `OCULTOS_EN_EDICION` desaparecio y en su lugar el caso de R19 afirma
 *  que los tres NO viajan en el reemplazo. */
const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido cítrico',
  stock: '12',
  qtyAlert: '1',
};

/**
 * Campos del PRIMER LOTE que el alta pide desde el 2026-09-10. Solo el costo esta aqui: es el
 * unico obligatorio de los cinco -y basta con el unitario O el total-. La presentacion se elige
 * en su selector, no se teclea, y el lote y la caducidad son opcionales.
 */
const LOTE_VALIDO: Readonly<Record<string, string>> = {
  // Dos decimales, no cuatro: el campo no deja teclear mas. Escribir `'12.5000'` seguiria
  // «pasando» -quedaria en `'12.50'`- pero el helper mentiria sobre lo que hay en pantalla.
  unitCost: '12.50',
};

/** Elige la primera presentacion del catalogo en el selector del alta. */
async function elegirPresentacion(user: ReturnType<typeof setupUser>, nombre = PRESENTACION_A.name) {
  await user.click(screen.getByTestId('presentation-select'));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: nombre })));
  // El desplegable se cierra al elegir: hasta que no se va, su capa se come los clicks de lo
  // que hay debajo -incluido el boton de guardar-.
  await waitFor(() => expect(screen.queryByTestId('presentation-popup')).toBeNull());
}

/** Elige la unidad del insumo en el selector «Unidad» del alta. */
async function elegirUnidad(user: ReturnType<typeof setupUser>, etiqueta = UNIDAD.symbol) {
  const selector = screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID);
  await user.click(selector);
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: etiqueta })));
  await waitFor(() => expect(selector).not.toHaveAttribute('aria-expanded', 'true'));
}

/**
 * Elige un tipo en el selector compartido del formulario. El `data-testid` vive en el root de
 * Base UI Select, no en el nodo `role=combobox`, asi que el trigger se localiza por su Label.
 */
async function elegirTipo(user: ReturnType<typeof setupUser>, nombre: string) {
  await user.click(screen.getByLabelText('Tipo'));
  await user.click(await esperarInteractiva(await screen.findByRole('option', { name: nombre })));
}

/**
 * Rellena el formulario abierto. En el ALTA cubre ademas lo minimo: la unidad del insumo (o la
 * presentacion del envase) y el costo del primer lote; en la EDICION esos campos no existen y el
 * helper no los toca.
 */
async function rellenarFormulario(
  user: ReturnType<typeof setupUser>,
  valores: Readonly<Record<string, string>> = {},
) {
  const datos = { ...ALTA_VALIDA, ...valores };
  for (const [campo, valor] of Object.entries(datos)) {
    const control = screen.getByTestId(`product-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }

  if (screen.queryByTestId(PRESENTATION_UNIT_SELECT_TESTID) !== null) {
    await elegirUnidad(user);
  } else if (screen.queryByTestId('presentation-select') !== null) {
    await elegirPresentacion(user);
  } else {
    return;
  }
  for (const campo of Object.keys(LOTE_VALIDO)) {
    const valor = valores[campo] ?? LOTE_VALIDO[campo] ?? '';
    const control = screen.getByTestId(`product-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
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
  createProductActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID(), lot: '1' });
  updateProductActionMock.mockResolvedValue({ status: 'success' });
  deleteProductActionMock.mockResolvedValue({ status: 'success' });
  createPresentationActionMock.mockResolvedValue({ status: 'success', id: PRESENTACION_NUEVA.id });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
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
    // R6 — se itera la DECLARACION de columnas en vez de listar los literales uno a uno: quitar
    // una columna deja este test sin encabezado que encontrar.
    //
    // MIGRADO 2026-09-07: la declaracion es una FACTORIA y los `data-testid` de cabecera y celda
    // los pone la tabla compartida (`data-table-head-<id>` / `data-table-cell-<id>`).
    const elProducto = producto();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();

    const columnas = buildProductColumns({ rowActions: () => null });
    for (const columna of columnas) {
      expect(
        screen.getByTestId(`data-table-head-${columna.id}`),
        `falta el encabezado de «${columna.id}»`,
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`data-table-cell-${columna.id}`),
        `falta la celda de «${columna.id}»`,
      ).toBeInTheDocument();
    }

    // El esqueleto pinta tantas celdas como columnas hay: su constante no puede quedarse atras.
    expect(PRODUCT_SKELETON_COLUMN_COUNT).toBe(columnas.length);

    // Las columnas de la tabla, por su clave: si alguna desaparece de la declaracion, esto se
    // pone rojo aunque la tabla siga pintando.
    //
    // ACOTADO DOS VECES, las dos por decision del humano y las dos el 2026-09-03:
    //   1. la unidad salio de la pantalla tras el merge de QC-32 (ver el test «el formulario no
    //      captura la unidad»), asi que de las diez de R6 quedaron nueve;
    //   2. salen ademas costo, compra minima, tiempo de entrega, creado y actualizado. R6 queda
    //      modificado en esos cinco puntos y esta lista es la que dice la verdad. QC-52 (R1)
    //      va mas lejos con los tres primeros: ya no estan en `ProductView` ni en la base -son
    //      del catalogo del proveedor-, asi que aqui no pueden volver ni como columna oculta.
    //
    // La imagen y las acciones se suman a las cuatro de datos: son columnas de MARCADO, la
    // primera y la ultima.
    expect(columnas.map((columna) => columna.id)).toEqual([
      'image',
      'name',
      'stock',
      'qtyAlert',
      'reserved',
      'available',
      'actions',
    ]);
  });

  it('la unidad no es su propia columna: se lee junto al nombre y junto a la existencia', async () => {
    // Test **en negativo**: el id de unidad esta en los datos y no puede llegar a la pantalla
    // crudo, ni como columna propia. La unidad se pinta resuelta a nombre o simbolo (R18), nunca
    // como el UUID de `ProductView.unitId`.
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ unitId: UNIDAD_QUE_NO_DEBE_VERSE })]),
    );

    await renderPantalla();

    expect(document.body.textContent).not.toContain(UNIDAD_QUE_NO_DEBE_VERSE);

    const columnas = buildProductColumns({ rowActions: () => null });
    // `imagePath` esta en la lista de prohibidos: la imagen SE VE, pero su columna se llama
    // `image` y pinta una miniatura. La RUTA no es una columna.
    for (const prohibida of ['id', 'unitId', 'imagePath']) {
      expect(
        columnas.some((columna) => String(columna.id) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`data-table-cell-${prohibida}`)).toBeNull();
    }
  });

  it('la primera columna es la imagen del producto, y la RUTA no se pinta como texto', async () => {
    // Decision humana del 2026-09-07. La imagen es marcado, asi que se afirma sobre la miniatura
    // y sobre el orden de las cabeceras, no sobre `PRODUCT_COLUMNS`.
    const RUTA = 'productos/hidroxido.png';
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto({ imagePath: RUTA })]));

    await renderPantalla();

    const tabla = within(screen.getByTestId(testId.tabla));
    const miniatura = tabla.getAllByTestId('product-image')[0] as HTMLImageElement;

    expect(miniatura).toHaveAttribute('src', RUTA);
    // La ruta es de la imagen, nunca texto de una celda.
    expect(document.body.textContent, RUTA).not.toContain(RUTA);

    const cabeceras = tabla.getAllByRole('columnheader');
    expect(cabeceras[0]).toHaveAttribute('data-testid', 'data-table-head-image');
  });

  it('sin ruta de imagen, la miniatura cae al marcador de `public/`', async () => {
    // El caso NORMAL hoy: `products.image_path` esta vacia en todas las filas, asi que lo que se
    // ve es el marcador. No es un hueco: es el estado normal mientras nadie suba imagenes.
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto({ imagePath: null })]));

    await renderPantalla();

    const miniatura = within(screen.getByTestId(testId.tabla)).getAllByTestId(
      'product-image',
    )[0] as HTMLImageElement;

    expect(miniatura).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(miniatura).toHaveAttribute('data-missing', 'true');
    // El texto alternativo identifica la fila: la miniatura no es decorativa.
    expect(miniatura).toHaveAttribute('alt', 'Hidróxido de sodio');
  });

  it('el costo, la compra minima y el tiempo de entrega no aparecen en la lista por ninguna via', async () => {
    // QC-52 R6 (deroga QC-14 R8 en este punto). Antes este caso miraba el campo OCULTO con el
    // que la edicion conservaba el costo; ese campo se fue con la columna, asi que lo que se
    // afirma ahora es la ausencia completa: ni columna, ni celda, ni campo oculto, ni ningun
    // valor derivado de los tres.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));

    await renderPantalla();

    for (const campo of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(screen.queryByTestId(`data-table-head-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`data-table-cell-${campo}`), campo).toBeNull();
    }

    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    for (const campo of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`product-hidden-${campo}`), campo).toBeNull();
    }
  });

  it('R17 — la existencia se pinta en rojo cuando la alerta de cantidad supera la existencia guardada', async () => {
    const UNIDAD_A = crypto.randomUUID();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([
        producto({ id: crypto.randomUUID(), stock: '2', unitId: UNIDAD_A, qtyAlert: '5' }),
        producto({ id: crypto.randomUUID(), stock: '5', unitId: UNIDAD_A, qtyAlert: '5' }),
        producto({ id: crypto.randomUUID(), stock: '9', unitId: UNIDAD_A, qtyAlert: '5' }),
      ]),
    );

    await renderPantalla();

    const celdas = screen.getAllByTestId('product-stock');
    // Por debajo de la alerta: en rojo.
    expect(celdas[0]).toHaveAttribute('data-alert', 'true');
    // Justo en la alerta y por encima: no. La alarma salta cuando la SUPERA, no al igualarla.
    expect(celdas[1]).not.toHaveAttribute('data-alert');
    expect(celdas[2]).not.toHaveAttribute('data-alert');

    // La alerta nunca se tine a si misma: la que esta en alarma es la existencia.
    for (const celda of screen.getAllByTestId('data-table-cell-qtyAlert')) {
      expect(celda).not.toHaveAttribute('data-alert');
      expect(within(celda).queryByTestId('product-stock')).toBeNull();
    }
  });

  it('R17 — un producto sin lotes y con alerta de cantidad configurada se marca en alerta', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ id: crypto.randomUUID(), stock: '0', unitId: null, qtyAlert: '5' })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('product-stock')).toHaveAttribute('data-alert', 'true');
  });

  it('R17 — sin cantidad de alerta configurada, la existencia no se marca, tenga o no lotes', async () => {
    const UNIDAD_A = crypto.randomUUID();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([
        producto({ id: crypto.randomUUID(), stock: '0', unitId: UNIDAD_A, qtyAlert: null }),
        producto({ id: crypto.randomUUID(), stock: '0', unitId: null, qtyAlert: null }),
      ]),
    );

    await renderPantalla();

    for (const celda of screen.getAllByTestId('product-stock')) {
      expect(celda).not.toHaveAttribute('data-alert');
    }
  });

  it('R18 — el nombre del producto se pinta junto a la unidad guardada', async () => {
    const UNIDAD_KG = { ...UNIDAD, id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
    listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD_KG] });
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ name: 'Hipoclorito', unitId: UNIDAD_KG.id })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('data-table-cell-name')).toHaveTextContent('Hipoclorito · kg');
  });

  it('R18 — sin unidad guardada o sin catalogo de unidades, el nombre se pinta solo', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ name: 'Hipoclorito', unitId: null })]),
    );
    await renderPantalla();
    expect(screen.getByTestId('data-table-cell-name')).toHaveTextContent('Hipoclorito');
    cleanup();

    listUnitsActionMock.mockResolvedValue(errorInesperado());
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ name: 'Hipoclorito', unitId: crypto.randomUUID() })]),
    );
    await renderPantalla();
    expect(screen.getByTestId('data-table-cell-name')).toHaveTextContent('Hipoclorito');
  });

  it('R16 — la celda muestra la existencia guardada junto a la unidad del producto', async () => {
    const UNIDAD_KG = { ...UNIDAD, id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
    listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD_KG] });
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ stock: '15', unitId: UNIDAD_KG.id })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('product-stock')).toHaveTextContent('15 kg');
  });

  it('R16 — un producto sin unidad muestra su existencia como 0', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ stock: '0', unitId: null })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('product-stock')).toHaveTextContent('0');
  });

  it('sin catalogo de unidades, la celda pinta la cantidad sin etiqueta', async () => {
    listUnitsActionMock.mockResolvedValue(errorInesperado());
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ stock: '10', unitId: crypto.randomUUID() })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('product-stock')).toHaveTextContent('10');
  });

  it('R6 — la existencia se pinta a dos decimales, con la cifra exacta en el title y el aria-label', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([
        producto({ id: crypto.randomUUID(), stock: '0.0001', unitId: null }),
        producto({ id: crypto.randomUUID(), stock: '1.5', unitId: null }),
        producto({ id: crypto.randomUUID(), stock: '12345.6789', unitId: null }),
      ]),
    );

    await renderPantalla();

    const [celda1, celda2, celda3] = screen.getAllByTestId('product-stock');

    expect(celda1).toHaveTextContent('0');
    expect(celda1).toHaveAttribute('title', '0.0001');
    expect(celda1).toHaveAttribute('aria-label', '0.0001');

    expect(celda2).toHaveTextContent('1.5');
    expect(celda2).not.toHaveAttribute('title');
    expect(celda2).toHaveAttribute('aria-label', '1.5');

    expect(celda3).toHaveTextContent('12345.68');
    expect(celda3).toHaveAttribute('title', '12345.6789');
    expect(celda3).toHaveAttribute('aria-label', '12345.6789');
  });

  it('R6 — la alerta de cantidad se pinta a dos decimales, con la cifra exacta en el title y el aria-label', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ id: crypto.randomUUID(), qtyAlert: '12345.6789' })]),
    );

    await renderPantalla();

    const celda = screen.getByTestId('product-qty-alert');
    expect(celda).toHaveTextContent('12345.68');
    expect(celda).toHaveAttribute('title', '12345.6789');
    expect(celda).toHaveAttribute('aria-label', '12345.6789');
  });

  it('R36 — muestra lo reservado y lo disponible del producto junto a su unidad, con la cifra exacta', async () => {
    const UNIDAD_KG = { ...UNIDAD, id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
    listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD_KG] });
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([
        producto({
          stock: '15',
          unitId: UNIDAD_KG.id,
          reserved: '3.5001',
          available: '11.4999',
        }),
      ]),
    );

    await renderPantalla();

    const reservado = screen.getByTestId('product-reserved');
    expect(reservado).toHaveTextContent('3.5 kg');
    expect(reservado).toHaveAttribute('title', '3.5001');
    expect(reservado).toHaveAttribute('aria-label', '3.5001 kg');

    const disponible = screen.getByTestId('product-available');
    expect(disponible).toHaveTextContent('11.5 kg');
    expect(disponible).toHaveAttribute('title', '11.4999');
    expect(disponible).toHaveAttribute('aria-label', '11.4999 kg');
  });

  it('R36 — sin lo reservado ni lo disponible (fuera del listado paginado), pinta el marcador neutro', async () => {
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ reserved: undefined, available: undefined })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('data-table-cell-reserved')).toHaveTextContent(EMPTY_CELL);
    expect(screen.getByTestId('data-table-cell-available')).toHaveTextContent(EMPTY_CELL);
    expect(screen.queryByTestId('product-reserved')).toBeNull();
    expect(screen.queryByTestId('product-available')).toBeNull();
  });

  it('el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro', async () => {
    // R9 — el scroll horizontal es de la tabla, nunca del documento.
    await renderPantalla();

    // La raiz de la tabla compartida (`data-table`) envuelve al primitivo; el contenedor con
    // scroll es el del propio `<table>`, que es quien absorbe el desbordamiento.
    const tabla = within(screen.getByTestId(testId.tabla)).getByRole('table');
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

    // Las acciones de fila siguen siendo alcanzables dentro de la propia tabla. La tabla
    // compartida nombra cada fila con el id del producto (`data-table-row-<id>`), asi que se
    // localiza por patron y no por un `data-testid` fijo.
    const fila = screen.getAllByTestId(testId.fila)[0] as HTMLElement;
    expect(within(fila).getByTestId(testId.abrirEdicion)).toBeVisible();
    expect(within(fila).getByTestId(testId.abrirBorrado)).toBeVisible();
  });

  it('el selector de tamano de pagina ofrece 10 y 25 y usa 10 por defecto', async () => {
    // R10 — el defecto se observa en lo que se le PIDE al backend, que es quien decide la
    // consulta; las dos opciones, en el selector.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()], { total: 40 }));

    await renderPantalla();

    // La consulta viaja ENTERA: desde el 2026-09-07 la pantalla emite el contrato de lista
    // completo -orden, filtros y busqueda incluidos, vacios cuando no hay-.
    expect(listProductsActionMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`data-table-page-size-${tamano}`)).toBeInTheDocument();
    }

    // Elegir el otro tamano NAVEGA: no hay estado local que mienta sobre la URL.
    await user.click(screen.getByTestId(`data-table-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    // R11
    const user = setupUser();
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

  it('la pantalla SI ofrece busqueda y orden, y ninguno de los dos se resuelve en el cliente', async () => {
    // ENMIENDA A R13 (2026-09-07, decision humana). R13 decia «ni busqueda ni orden
    // configurable» y su test lo afirmaba en negativo. Las dos cosas existen ahora, y la razon es
    // que el BACKEND las soporta: `PRODUCT_QUERYABLE` declara `searchable: true` y una lista de
    // campos ordenables, y `listProducts` los resuelve contra la columna normalizada con su
    // indice de trigramas (QC-57).
    //
    // Lo que R13 protegia de verdad -que no se filtre ni se ordene DENTRO de la pagina ya
    // descargada- sigue afirmado, y por la via mas dura: cada gesto NAVEGA, y la lista se vuelve
    // a pedir al servidor con la consulta nueva.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()], { total: 40 }));

    await renderPantalla();

    // 1. Hay caja de busqueda, y escribir en ella acaba navegando con el termino en la URL.
    const busqueda = screen.getByTestId(testId.busqueda);
    await user.type(busqueda, 'acido');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const destino = new URLSearchParams(
      String(routerMock.push.mock.calls.at(-1)?.[0]).split('?')[1],
    );
    expect(destino.get(SEARCH_PARAM)).toBe('acido');
    // Y vuelve a la primera pagina: buscar sobre la pagina 3 no puede dejar al usuario en un
    // hueco del resultado nuevo.
    expect(destino.get(PAGE_PARAM)).toBe('1');

    // 2. El orden se pide desde el menu de la cabecera, y tambien navega.
    routerMock.push.mockClear();
    await user.click(screen.getByTestId('data-table-header-menu-name'));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-sort-asc-name')));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const conOrden = new URLSearchParams(
      String(routerMock.push.mock.calls.at(-1)?.[0]).split('?')[1],
    );
    expect(conOrden.get(SORT_PARAM)).toBe(`name${SORT_SEPARATOR}asc`);

    // 3. Y la pantalla NO reordena ni recorta lo que ya tiene: la unica fila sigue siendo la que
    // devolvio la consulta, con el orden en el que la devolvio.
    expect(screen.getAllByTestId(/^data-table-row-/)).toHaveLength(1);
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
    ).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '' });
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
    const user = setupUser();
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

  it('R5 — ofrece una pestaña «Producto terminado» que filtra el listado por ese tipo', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()], { total: 40 }));

    await renderPantalla();

    const pestana = screen.getByRole('tab', { name: 'Producto terminado' });
    await user.click(pestana);

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const destino = new URLSearchParams(
      String(routerMock.push.mock.calls.at(-1)?.[0]).split('?')[1],
    );
    expect(destino.get('type')).toBe(PRODUCT_TYPES.FINISHED_PRODUCT);
    // Filtrar vuelve a la primera pagina, igual que la busqueda y el orden.
    expect(destino.get(PAGE_PARAM)).toBe('1');
  });

  it('R5 — con el filtro de tipo en la URL, la pestaña llega marcada y la consulta lo lleva', async () => {
    listFinishedStockActionMock.mockResolvedValue(
      paginaDeProductoTerminado(producto({ type: PRODUCT_TYPES.FINISHED_PRODUCT })),
    );

    await renderPantalla({ type: PRODUCT_TYPES.FINISHED_PRODUCT });

    expect(screen.getByRole('tab', { name: 'Producto terminado', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Producto terminado', { selector: 'strong' })).toBeInTheDocument();

    // La pantalla no filtra en el cliente: la pestana pide al backend su propia lista, la
    // agrupada por pedido, que no ordena ni filtra.
    expect(listFinishedStockActionMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      search: '',
      sort: null,
      filters: {},
    });
    expect(listProductsActionMock).not.toHaveBeenCalled();
  });
});

describe('pantalla de productos — alta, edicion y borrado', () => {
  it('crear abre un panel lateral sobre la lista, sin navegar ni perder la pagina', async () => {
    // R17 — panel lateral, no pagina completa ni dialogo centrado. Abrirlo y cerrarlo no cambia
    // la URL, asi que la lista de detras conserva pagina y tamano.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto()], { page: 2, pageSize: MAX_PAGE_SIZE, total: 60 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2', [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    expect(listProductsActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE, sort: null, filters: {}, search: '' });

    await user.click(screen.getByTestId(testId.abrirAlta));

    const panel = await screen.findByTestId(testId.panel);
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(within(panel).getByTestId(testId.formulario)).toBeInTheDocument();
    // La lista sigue detras: el panel se superpone, no sustituye la pantalla.
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();

    // El panel NO se cierra ni con Escape ni con un click fuera: lleva un formulario dentro y un
    // gesto involuntario no puede tirar lo que el usuario llevaba escrito. Solo «Cancelar» y la X.
    await user.keyboard('{Escape}');
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    const velo = document.querySelector('[data-slot="sheet-overlay"]');
    if (velo === null) throw new Error('el panel lateral no monta velo');
    await user.click(velo);
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    await user.click(screen.getByTestId(testId.cancelarFormulario));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    // Ni al abrir ni al cerrar se navego a ninguna parte.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(listProductsActionMock).toHaveBeenCalledTimes(1);
  });

  it('la edicion precarga los valores actuales y envia el reemplazo completo, sin la existencia (R9)', async () => {
    const user = setupUser();
    const elProducto = producto({ name: 'Sosa cáustica' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    const precargado: Record<string, string> = {
      name: elProducto.name,
      qtyAlert: String(elProducto.qtyAlert),
    };

    // QC-52 R5: los tres que el formulario enviaba ocultos ya no existen en el producto. La
    // edicion no puede enviarlos POR NINGUNA VIA -ni campo visible, ni oculto, ni precargado-.
    // La existencia se les suma: es del lote, no del producto que se edita.
    const FUERA_DEL_PRODUCTO = ['cost', 'minPurchase', 'deliveryTime', 'stock'] as const;

    for (const [campo, valor] of Object.entries(precargado)) {
      expect(screen.getByTestId(`product-field-${campo}`), campo).toHaveValue(valor);
    }

    // Ninguno de los cuatro tiene control, ni visible ni oculto.
    for (const campo of FUERA_DEL_PRODUCTO) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`product-hidden-${campo}`), campo).toBeNull();
    }

    // Se cambia un solo campo y se envia: el reemplazo viaja COMPLETO, con los demas incluidos.
    await user.clear(screen.getByTestId('product-field-name'));
    await user.type(screen.getByTestId('product-field-name'), 'Sosa cáustica perlas');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateProductActionMock).toHaveBeenCalledTimes(1));

    const [id, , enviado] = updateProductActionMock.mock.calls[0];
    expect(id).toBe(elProducto.id);
    expect(enviado.get('name')).toBe('Sosa cáustica perlas');
    for (const [campo, valor] of Object.entries(precargado)) {
      if (campo === 'name') continue;
      expect(enviado.get(campo), `${campo} debe viajar en el reemplazo`).toBe(valor);
    }
    // Y los cuatro que el producto no lleva no viajan (R5, R9).
    for (const campo of FUERA_DEL_PRODUCTO) {
      expect(enviado.get(campo), `${campo} no debe viajar en el reemplazo`).toBeNull();
    }
  });

  it('un guardado rechazado por un campo muestra el error en linea y no cierra el panel', async () => {
    // R20 (primera mitad) — el error identifica campo, asi que va junto al campo. Y no se llega
    // siquiera a llamar a la operacion: la validacion previa usa el mismo esquema del servidor.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // ACOTADO EL 2026-09-03: el rechazo se provocaba con un costo no numerico. Ese campo ya no se
    // pinta, asi que el caso se muda al nombre, que sigue en pantalla y tiene su propia regla en
    // el MISMO esquema del servidor: 200 caracteres como maximo. Lo que R20 vigila -el
    // error va junto a SU campo, la operacion ni se llama y el panel sigue abierto- no cambia.
    const nombreLargo = 'x'.repeat(201);
    await rellenarFormulario(user, { name: nombreLargo });
    await user.click(screen.getByTestId(testId.enviar));

    const errorDeCampo = await screen.findByTestId('product-error-name');
    expect(errorDeCampo).toBeInTheDocument();
    expect(screen.getByTestId('product-field-name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('product-field-name')).toHaveAttribute(
      'aria-describedby',
      errorDeCampo.id,
    );

    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    // Y no se pierde lo escrito: ni lo que provoco el rechazo ni el resto.
    expect(screen.getByTestId('product-field-name')).toHaveValue(nombreLargo);
    expect(screen.getByTestId('product-field-stock')).toHaveValue(ALTA_VALIDA.stock);
  });

  it('un guardado rechazado por la operacion muestra el error del formulario y conserva lo escrito', async () => {
    // R20 (segunda mitad) — `unauthorized` no identifica campo: va a la region de error del
    // formulario, el panel sigue abierto y lo escrito sigue ahi.
    const user = setupUser();
    createProductActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

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
    expect(screen.getByTestId('product-field-stock')).toHaveValue(ALTA_VALIDA.stock);
  });

  it('un guardado con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R21 — y R18: el alta sale por la Server Action del catalogo, con los campos de negocio.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const enviado = createProductActionMock.mock.calls[0][1];
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(enviado.get(campo), campo).toBe(valor);
    }

    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('tras un alta con éxito, ProductForm llama a onSaved con el lote devuelto por el servidor (R12)', async () => {
    // T8 — `ProductForm.save()` guarda `result.lot` y se lo pasa a `onSaved`. El unico
    // consumidor de `onSaved` es `ProductSheet.handleSaved`, asi que el efecto observable de que
    // `onSaved` recibio el lote es que el aviso de exito lo nombra.
    const user = setupUser();
    const LOTE_DEVUELTO = 'LOTE-DEVUELTO-42';
    createProductActionMock.mockResolvedValue({
      status: 'success',
      id: crypto.randomUUID(),
      lot: LOTE_DEVUELTO,
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    expect(String(toastExito.mock.calls[0][0])).toContain(LOTE_DEVUELTO);
  });

  it('el aviso de alta nombra el lote asignado por el sistema (R14)', async () => {
    // T9 — el lote vacio (correlativo generado por el servidor): el aviso lo nombra.
    const user = setupUser();
    const LOTE_ASIGNADO = '2026-00042';
    createProductActionMock.mockResolvedValue({
      status: 'success',
      id: crypto.randomUUID(),
      lot: LOTE_ASIGNADO,
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    const mensaje = String(toastExito.mock.calls[0][0]);
    expect(mensaje).toContain('Lote');
    expect(mensaje).toContain(LOTE_ASIGNADO);
  });

  it('el aviso de alta nombra el lote tecleado a mano sin decir que lo asignó el sistema (R15)', async () => {
    // T9 — `resolveBatchLot()` devuelve el MISMO string que se tecleo, asi que el doble de la
    // action simula esa devolucion con el valor que la persona escribio. El texto es neutro: no
    // dice «asigno» ni «asignado» cuando el lote vino tecleado a mano.
    const user = setupUser();
    const LOTE_TECLEADO = 'PROV-7788';
    createProductActionMock.mockResolvedValue({
      status: 'success',
      id: crypto.randomUUID(),
      lot: LOTE_TECLEADO,
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user, { lot: LOTE_TECLEADO });
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    const mensaje = String(toastExito.mock.calls[0][0]);
    expect(mensaje).toContain(LOTE_TECLEADO);
    expect(mensaje.toLowerCase()).not.toContain('asigno');
    expect(mensaje.toLowerCase()).not.toContain('asignó');
    expect(mensaje.toLowerCase()).not.toContain('asignado');
  });

  it('el aviso de edición no cambia y no nombra ningún lote (R9)', async () => {
    // T9 — la edicion no conoce el lote: el texto del aviso es el mismo de siempre, sin nombrar
    // ningun valor de lote.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateProductActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    expect(toastExito).toHaveBeenCalledWith('Producto actualizado.');
    expect(String(toastExito.mock.calls[0][0])).not.toContain('Lote');
  });

  it('elegir un producto existente autocompleta la alerta de cantidad, no la existencia', async () => {
    // Decision humana del 2026-09-09: en el alta el nombre es un autocomplete que busca productos
    // existentes; al elegir uno se autocompleta la alerta de cantidad. La existencia NO se copia:
    // es el inventario actual del producto nuevo, que escribe el usuario. (La presentacion ya no
    // es del producto: se mudo a `product_batches`.)
    const user = setupUser();
    const existente = producto({ name: 'Sosa cáustica perlas', qtyAlert: '7' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([existente]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId('product-field-name'));
    await user.click(
      await esperarInteractiva(await screen.findByRole('option', { name: existente.name })),
    );

    // El nombre queda fijado al del producto elegido.
    expect(screen.getByTestId('product-field-name')).toHaveValue(existente.name);
    // La alerta de cantidad se autocompleta.
    expect(screen.getByTestId('product-field-qtyAlert')).toHaveValue(existente.qtyAlert);
    // La existencia NO se autocompleta: sigue vacia para que la escriba el usuario.
    expect((screen.getByTestId('product-field-stock') as HTMLInputElement).value).toBe('');
  });

  it('el alta pide el primer lote: unidad obligatoria y uno de los dos costos', async () => {
    // El alta de insumo exige la unidad y el costo unitario O total (basta con uno); lote y
    // caducidad son opcionales.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      await user.type(screen.getByTestId(`product-field-${campo}`), valor);
    }

    // Sin unidad no se guarda: el rechazo se pinta en el campo «Unidad».
    await user.click(screen.getByTestId(testId.enviar));
    expect(await screen.findByTestId(PRESENTATION_UNIT_ERROR_TESTID)).toBeInTheDocument();
    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();

    // Con unidad pero sin ningun costo: se rechaza sin llamar a la operacion, y la falta se dice
    // en LOS DOS campos, porque cualquiera de ellos la resuelve.
    await elegirUnidad(user);
    await user.click(screen.getByTestId(testId.enviar));

    expect(await screen.findByTestId('product-error-unitCost')).toHaveTextContent('basta con uno');
    expect(screen.getByTestId('product-error-totalCost')).toHaveTextContent('basta con uno');
    expect(createProductActionMock).not.toHaveBeenCalled();

    // Lote y caducidad son opcionales: estan en pantalla y el alta pasa con los dos vacios.
    expect((screen.getByTestId('product-field-lot') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('product-field-expiryDate')).toHaveAttribute('type', 'date');

    // Con SOLO el costo total -sin el unitario- ya no hay ningun error de campo.
    await user.type(screen.getByTestId('product-field-totalCost'), '150.00');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    // El alta salio adelante: ni un error de campo queda, y el panel se cierra.
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());
    expect(screen.queryByTestId('product-error-unitCost')).toBeNull();
    expect(screen.queryByTestId('product-error-totalCost')).toBeNull();
  });

  it('la edicion no pide nada del lote: ni presentacion, ni costos, ni caducidad', async () => {
    // El lote es del ALTA. Al editar un producto no hay lote que cambiar, asi que ninguno de los
    // cinco campos se pinta -y por tanto no hay obligacion de costo que bloquee el guardado-.
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    expect(screen.queryByTestId('presentation-select')).toBeNull();
    for (const campo of ['unitCost', 'totalCost', 'lot', 'expiryDate']) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
    }
  });

  it('el alta rechaza un costo de 0 en SU campo y no llama a la operacion', async () => {
    // QC-90 R27 y R5 — `product_batches.unit_cost` lleva `CHECK (unit_cost > 0)` desde el
    // 2026-09-09 y este panel aceptaba el `0`: era deuda declarada en `requirements.md`. Ahora el
    // panel rechaza con el MISMO criterio que el servidor, porque valida con el MISMO esquema
    // (`createProductWithFirstBatchSchema`), y el cero se descarta sobre la CADENA -sin pasar por
    // coma flotante-, asi que sus tres escrituras valen igual.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);

    for (const cero of ['0', '0.0', '0.0000']) {
      const campo = screen.getByTestId('product-field-unitCost');
      await user.clear(campo);
      await user.type(campo, cero);
      await user.click(screen.getByTestId(testId.enviar));

      await waitFor(() =>
        expect(screen.getByTestId('product-error-unitCost'), cero).toBeInTheDocument(),
      );
      // El rechazo es del importe, no del par de costos ni de la existencia: nadie mas se marca.
      expect(screen.queryByTestId('product-error-totalCost'), cero).toBeNull();
      expect(screen.queryByTestId('product-error-stock'), cero).toBeNull();
      expect(screen.getByTestId('product-field-unitCost'), cero).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    }

    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
  });

  it('los dos importes no dejan escribir texto, ni un tercer decimal, ni una coma suelta', async () => {
    // Lo que antes se rechazaba AL GUARDAR -mas de 4 decimales, o coma- ahora ni llega a entrar,
    // asi que lo que se mide es lo que queda escrito. El esquema no se toco: sigue admitiendo
    // hasta 4 decimales para el resto de llamantes.
    //
    // La coma se convierte en punto en vez de descartarse: tirarla dejaria `150,00` en `15000`.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);

    const unitario = screen.getByTestId('product-field-unitCost') as HTMLInputElement;
    const total = screen.getByTestId('product-field-totalCost') as HTMLInputElement;

    await user.clear(unitario);
    await user.type(unitario, '12.34567');
    expect(unitario.value, 'el tercer decimal y los siguientes no entran').toBe('12.34');

    await user.clear(unitario);
    await user.type(unitario, 'abc12x.5y0z');
    expect(unitario.value, 'las letras no entran').toBe('12.50');

    await user.clear(total);
    await user.type(total, '150,00');
    expect(total.value, 'la coma entra como punto decimal').toBe('150.00');

    // Y con importes que el campo si admite, el alta sale adelante: el filtro no bloquea nada
    // legitimo.
    await user.click(screen.getByTestId(testId.enviar));
    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
  });

  it('escribir el costo unitario rellena el total, y escribir el total rellena el unitario', async () => {
    // total = unitario x existencia, unitario = total / existencia redondeado a 2 decimales mitad
    // arriba. La aritmetica va con `BigInt` sobre la cadena, nunca con coma flotante.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const existencia = screen.getByTestId('product-field-stock');
    const unitario = screen.getByTestId('product-field-unitCost') as HTMLInputElement;
    const total = screen.getByTestId('product-field-totalCost') as HTMLInputElement;

    await user.clear(existencia);
    await user.type(existencia, '7');

    await user.type(unitario, '3.50');
    // El derivado se escribe sin ceros de relleno: «24.50» se rellena «24.5». Lo tecleado no se
    // toca -el unitario sigue leyendose «3.50», tal cual se escribio-, porque reescribir el campo
    // bajo el cursor moveria el punto de insercion.
    expect(total.value, '3.50 x 7').toBe('24.5');
    expect(unitario.value, 'lo tecleado no se reescribe').toBe('3.50');

    // Y al reves. La division no cae redonda a proposito: 150 / 7 es 21.428571..., que a dos
    // decimales y mitad arriba es 21.43.
    await user.clear(total);
    await user.type(total, '150');
    expect(unitario.value, '150 / 7 redondeado a 2 decimales').toBe('21.43');

    // Vaciar un importe NO borra el otro: es el camino de «escribi el unitario» a «escribo solo
    // el total», y borrarlo ahi haria perder lo ya escrito.
    await user.clear(unitario);
    expect(total.value, 'el total sobrevive a vaciar el unitario').toBe('150');
  });

  it('sin existencia utilizable el importe derivado se queda vacio, no obsoleto', async () => {
    // El derivado se vacia cuando no se puede calcular -existencia en blanco, o 0-. Un total
    // obsoleto engana mas que uno en blanco, y ademas el esquema entiende «vacio» como campo
    // omitido, que es exactamente lo que ese estado significa.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const existencia = screen.getByTestId('product-field-stock');
    const unitario = screen.getByTestId('product-field-unitCost') as HTMLInputElement;
    const total = screen.getByTestId('product-field-totalCost') as HTMLInputElement;

    await user.clear(existencia);
    await user.type(unitario, '9.99');
    expect(total.value, 'sin existencia no hay total que escribir').toBe('');

    await user.type(existencia, '0');
    await user.clear(total);
    await user.type(total, '150.00');
    expect(unitario.value, 'con existencia 0 no hay unitario que escribir').toBe('');
  });

  it('con solo costo total y existencia 0 el rechazo se pinta en el campo de la EXISTENCIA', async () => {
    // QC-90 R8 — el caso que justifica que el esquema sea COMPARTIDO. No hay costo unitario
    // posible (`total / 0`) y la columna es NOT NULL, asi que lo que hay que corregir es la
    // EXISTENCIA, no el costo: el `superRefine` cuelga el issue de `['stock']` y el formulario,
    // que ya reparte por `issue.path[0]`, lo pinta ahi sin una sola linea de reparto nueva.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user, { stock: '0', unitCost: '', totalCost: '150.00' });
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(screen.getByTestId('product-error-stock')).toBeInTheDocument());
    expect(screen.getByTestId('product-field-stock')).toHaveAttribute('aria-invalid', 'true');
    // Y NO en los costos: el total escrito esta bien, y marcarlo mandaria a corregir lo que no es.
    expect(screen.queryByTestId('product-error-totalCost')).toBeNull();
    expect(screen.queryByTestId('product-error-unitCost')).toBeNull();
    expect(createProductActionMock).not.toHaveBeenCalled();

    // Corregir la existencia -lo que el mensaje pide- basta para que el mismo alta salga adelante.
    await user.clear(screen.getByTestId('product-field-stock'));
    await user.type(screen.getByTestId('product-field-stock'), '3');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
  });

  it('el alta hace viajar los CINCO campos del primer lote en el FormData', async () => {
    // QC-90 R25 — hasta hoy los cinco se pintaban y se validaban, pero la operacion no los veia.
    // Van en el `FormData` porque estan en el DOM del `<form>`; lo que se vigila aqui es que
    // ninguno se quede fuera y que los importes lleguen COMO CADENA, sin normalizar ni convertir.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user, { lot: 'LT-4471' });
    await user.type(screen.getByTestId('product-field-expiryDate'), '2027-03-15');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const enviado = createProductActionMock.mock.calls[0][1];
    for (const campo of ['unitId', 'unitCost', 'totalCost', 'lot', 'expiryDate']) {
      expect(enviado.has(campo), `${campo} debe viajar en el alta`).toBe(true);
    }
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
    expect(enviado.get('presentationId')).toBeNull();
    expect(enviado.get('unitCost')).toBe(LOTE_VALIDO.unitCost);
    expect(enviado.get('lot')).toBe('LT-4471');
    expect(enviado.get('expiryDate')).toBe('2027-03-15');
    // El costo total NO se escribio, y aun asi viaja escrito: el panel lo rellena al teclear el
    // unitario (`12.50 x 12`). Antes viajaba vacio -"campo omitido"-, y esa premisa cayo: hoy solo
    // viaja vacio si se dejan los dos importes en blanco, que es un rechazo.
    //
    // Viaja SIN ceros de relleno («150», no «150.00»): es el mismo importe y el esquema lo acepta
    // igual -sus decimales son opcionales-, porque el campo manda lo que el panel rellena.
    expect(enviado.get('totalCost')).toBe('150');
  });

  it('la edicion no envia ningun campo del lote', async () => {
    // QC-90 R26 — la edicion no crea ni cambia lotes, asi que no pinta los cinco campos y
    // tampoco los envia: valida con `createProductSchema`, que ni los conoce.
    const user = setupUser();
    const elProducto = producto({ name: 'Sosa cáustica' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateProductActionMock).toHaveBeenCalledTimes(1));

    const [, , enviado] = updateProductActionMock.mock.calls[0];
    for (const campo of ['presentationId', 'unitCost', 'totalCost', 'lot', 'expiryDate']) {
      expect(enviado.get(campo), `${campo} no debe viajar en la edicion`).toBeNull();
    }
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('un rechazo del servidor deja el panel abierto y conserva los cinco campos del lote', async () => {
    // QC-90 R28 — el rechazo llega de la operacion (no de la validacion previa), asi que va a la
    // region de error del formulario; lo que no puede pasar es que se lleve por delante lo
    // escrito en el lote, que es donde mas hay que teclear de todo el panel.
    const user = setupUser();
    createProductActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'Entrada no valida.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // Da igual el valor que se escriba: el helper teclea el unitario DESPUES y eso recalcula el
    // total. Se escribe el mismo numero al que se llega para que el caso siga hablando de lo que
    // mide -que un rechazo no borra lo escrito- y no del recalculo. El
    // recalculado se escribe sin relleno («150»), que es lo que queda en el campo.
    await rellenarFormulario(user, { totalCost: '150.00', lot: 'LT-4471' });
    await user.type(screen.getByTestId('product-field-expiryDate'), '2027-03-15');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId(testId.errorFormulario);

    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toHaveTextContent(UNIDAD.symbol);
    expect(screen.getByTestId('product-field-unitCost')).toHaveValue(LOTE_VALIDO.unitCost);
    expect(screen.getByTestId('product-field-totalCost')).toHaveValue('150');
    expect(screen.getByTestId('product-field-lot')).toHaveValue('LT-4471');
    expect(screen.getByTestId('product-field-expiryDate')).toHaveValue('2027-03-15');
  });

  it('el panel de alta nunca permite enviar sin fecha de compra escrita (R3)', async () => {
    // El panel nunca permite un envio sin fecha de compra: el campo no admite quedar vacio. Si la
    // fecha no llega a la Server Action, el servidor la sustituye por hoy, lo cual no es un
    // rechazo.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // Nada mas abrir el panel, sin tocar el calendario, el espejo oculto ya lleva una fecha civil
    // completa (R2): no hay un estado "en blanco" intermedio que el usuario pueda enviar.
    expect(screen.getByTestId('product-batch-date-value')).toHaveValue(
      formatDateLocalISO(new Date()),
    );

    // El disparador es un BOTON que abre un calendario, no un campo de texto: no existe ningun
    // control -ni "borrar", ni "limpiar"- capaz de dejarlo vacio. Abrir y cerrar el popover SIN
    // elegir nada no cambia lo que hay listo para enviarse.
    await user.click(screen.getByTestId('product-field-purchaseDate'));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('product-batch-date-value')).toHaveValue(
      formatDateLocalISO(new Date()),
    );

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    const enviado = createProductActionMock.mock.calls[0][1];
    // Lo que de verdad se envio nunca fue una cadena vacia.
    expect(enviado.get('purchaseDate')).not.toBe('');
  });

  it('el alta de producto envía la fecha de compra elegida como YYYY-MM-DD (R4)', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);

    // R2: el disparador ya muestra "hoy" -es lo elegido- antes de tocar el calendario.
    const elegida = screen.getByTestId('product-field-purchaseDate').textContent?.trim() ?? '';
    expect(elegida).toBe(formatDateLocalISO(new Date()));

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const enviado = createProductActionMock.mock.calls[0][1];
    expect(enviado.get('purchaseDate')).toBe(elegida);
  });

  it('la edición no muestra el campo de fecha de compra (R9)', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    expect(screen.queryByTestId('product-field-purchaseDate')).toBeNull();
    expect(screen.queryByTestId('product-batch-date-value')).toBeNull();
  });

  it('al elegir Instrumento se muestra solo existencia y fecha de compra del lote', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await elegirTipo(user, 'Instrumento');

    // MACHINE (Instrumento): solo stock y purchaseDate entre los campos del lote (2026-09-23).
    expect(screen.getByTestId('product-field-purchaseDate')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-stock')).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId('product-field-lot')).toBeNull();
    expect(screen.queryByTestId('product-field-qtyAlert')).toBeNull();
    expect(screen.queryByTestId('product-field-expiryDate')).toBeNull();
    // Los costos van juntos en ProductCostFields: sin testid propio, se comprueba por su label.
    expect(screen.queryByLabelText('Costo unitario')).toBeNull();
    expect(screen.queryByLabelText('Costo total')).toBeNull();
    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Instrumento');
  });

  it('al elegir Envase se oculta la fecha de expiracion y se mantiene el resto del lote', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    expect(screen.getByTestId('product-field-expiryDate')).toBeInTheDocument();

    await elegirTipo(user, 'Envase');

    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Envase');
    expect(screen.queryByTestId('product-field-expiryDate')).toBeNull();
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-stock')).toBeInTheDocument();
    expect(screen.getByTestId('presentation-select')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-lot')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-purchaseDate')).toBeInTheDocument();
  });

  it('cambiar de tipo en el alta alterna los campos sin cerrar el panel', async () => {
    // Producto -> Instrumento -> Envase -> Producto: cada salto tiene que reevaluar
    // shouldShowField con el tipo recien elegido, no con el del montaje.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // PRODUCT: alerta, unidad, costos, lote y expiracion a la vista; presentacion no.
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.getByTestId('product-field-expiryDate')).toBeInTheDocument();

    await elegirTipo(user, 'Instrumento');
    expect(screen.queryByTestId('product-field-qtyAlert')).toBeNull();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId('product-field-expiryDate')).toBeNull();
    expect(screen.getByTestId('product-field-stock')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-purchaseDate')).toBeInTheDocument();

    await elegirTipo(user, 'Envase');
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    expect(screen.getByTestId('presentation-select')).toBeInTheDocument();
    expect(screen.queryByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeNull();
    expect(screen.queryByTestId('product-field-expiryDate')).toBeNull();

    await elegirTipo(user, 'Producto');
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.getByTestId('product-field-expiryDate')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Producto');
    expect(screen.getByTestId(testId.formulario)).toBeInTheDocument();
  });

  it('cerrar y reabrir el panel vuelve a Producto: el selector no recuerda el ultimo tipo', async () => {
    // El bug: `ProductForm` se quedaba montado como hijo del Sheet mientras `SharedSelect`
    // -dentro del portal- se desmontaba y volvia al default PRODUCT. El estado `productType`
    // sobrevivia, el selector mostraba Producto y los campos del formulario seguian siendo
    // los de Instrumento. Remontar el form al abrir (`open ? <ProductForm/> : null`) es el fix.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await elegirTipo(user, 'Instrumento');
    expect(screen.getByTestId('product-field-purchaseDate')).toBeInTheDocument();
    expect(screen.queryByTestId('product-field-qtyAlert')).toBeNull();

    await user.click(screen.getByTestId(testId.cancelarFormulario));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // Selector y campos coinciden otra vez en PRODUCT.
    expect(screen.getByLabelText('Tipo')).toHaveTextContent('Producto');
    expect(screen.getByTestId('product-field-stock')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-purchaseDate')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-lot')).toBeInTheDocument();
    expect(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID)).toBeInTheDocument();
  });

  it('R3 — el select de tipo del alta no ofrece «Producto terminado»', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByLabelText('Tipo'));
    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'Producto terminado' })).toBeNull();
  });

  it('R3 — el select de tipo de la edicion tampoco ofrece «Producto terminado»', async () => {
    const user = setupUser();
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([producto({ type: PRODUCT_TYPES.PRODUCT })]),
    );

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByLabelText('Tipo'));
    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(3);
    expect(screen.queryByRole('option', { name: 'Producto terminado' })).toBeNull();
  });

  it('R3 — editar un producto terminado muestra su tipo de solo lectura y sin select', async () => {
    const user = setupUser();
    const productoTerminado = producto({
      name: 'Desengrasante industrial · Botella 1L',
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
    });
    listFinishedStockActionMock.mockResolvedValue(paginaDeProductoTerminado(productoTerminado));

    await renderPantalla({ type: PRODUCT_TYPES.FINISHED_PRODUCT });
    await desplegarPedido(user);
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    expect(screen.getByTestId('product-field-type-readonly')).toHaveTextContent(
      'Producto terminado',
    );
    expect(screen.queryByTestId('shared-select-type')).toBeNull();
    expect(screen.queryByLabelText('Tipo')).toBeNull();

    // El resto del formulario sigue siendo el de la edicion: solo nombre y alerta ademas del
    // tipo, sin ningun campo del lote.
    expect(screen.getByTestId('product-field-name')).toBeInTheDocument();
    expect(screen.getByTestId('product-field-qtyAlert')).toBeInTheDocument();
    for (const campo of ['presentationId', 'stock', 'unitCost', 'totalCost', 'lot', 'expiryDate', 'purchaseDate']) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
    }
    expect(screen.queryByTestId('presentation-select')).toBeNull();
  });

  it('R3 — editar un producto terminado reenvía su tipo aunque no haya select', async () => {
    const user = setupUser();
    const productoTerminado = producto({
      name: 'Desengrasante industrial · Botella 1L',
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      qtyAlert: '2',
    });
    listFinishedStockActionMock.mockResolvedValue(paginaDeProductoTerminado(productoTerminado));

    await renderPantalla({ type: PRODUCT_TYPES.FINISHED_PRODUCT });
    await desplegarPedido(user);
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateProductActionMock).toHaveBeenCalledTimes(1));
    const [, , enviado] = updateProductActionMock.mock.calls[0];
    expect(enviado.get('type')).toBe(PRODUCT_TYPES.FINISHED_PRODUCT);
    expect(enviado.get('name')).toBe(productoTerminado.name);
    expect(enviado.get('qtyAlert')).toBe('2');
  });

  it('los campos con ayuda la ofrecen en la etiqueta y la muestran al pasar por encima', async () => {
    // El formulario perdio tres campos el 2026-09-03 y gano una ayuda por campo en su lugar.
    // Se vigilan las tres cosas que pueden romperse en silencio:
    //   1. que el disparador sea `type="button"` -desde que el panel entero es un `<form>`, un
    //      boton sin tipo dentro de el lo ENVIA, y pedir ayuda guardaria el producto-;
    //   2. que tenga nombre accesible propio, porque su contenido es un icono;
    //   3. que el texto de la ayuda no este en el documento hasta que se pide.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // El nombre no lleva ayuda: se explica solo.
    expect(screen.queryByTestId('product-helper-name')).toBeNull();

    const ayuda = screen.getByTestId('product-helper-stock');
    expect(ayuda).toHaveAttribute('type', 'button');
    expect(ayuda).toHaveAccessibleName('Qué es Existencia');
    expect(screen.queryByTestId('product-helper-text-stock')).toBeNull();

    await user.hover(ayuda);
    const texto = await screen.findByTestId('product-helper-text-stock', {}, { timeout: 3_000 });
    expect(texto).toHaveTextContent('este lote');

    // Pedir ayuda no envia el formulario.
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('el campo lote explica que un valor vacío lo asigna el sistema (R6)', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const ayuda = screen.getByTestId('product-helper-lot');
    await user.hover(ayuda);

    const texto = await screen.findByTestId('product-helper-text-lot', {}, { timeout: 3_000 });
    expect(texto).toHaveTextContent('Déjalo vacío para que el sistema lo asigne.');
  });

  it('el campo lote sigue siendo un input de texto opcional (R7)', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const campo = screen.getByTestId('product-field-lot');
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).not.toHaveAttribute('required');
    expect(campo).toHaveValue('');
  });

  it('el alta de insumo pide la unidad del catalogo, sin texto libre, y viaja con ella en vez de la presentacion', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const formulario = screen.getByTestId(testId.formulario);
    expect(screen.queryByTestId('product-field-unit')).toBeNull();
    expect(screen.queryByTestId('product-field-unitId')).toBeNull();

    // Tres comboboxes: el nombre, el tipo y la unidad. Ninguno es la presentacion.
    const combos = within(formulario).getAllByRole('combobox');
    expect(combos).toHaveLength(3);
    expect(combos).toContain(screen.getByTestId('product-field-name'));
    expect(combos).toContain(screen.getByLabelText('Tipo'));
    expect(combos).toContain(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    expect(screen.queryByTestId('presentation-select')).toBeNull();

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const enviado = createProductActionMock.mock.calls[0][1];
    expect(enviado.get('unit')).toBeNull();
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
    expect(enviado.get('presentationId')).toBeNull();
  });

  it('R20 la pagina pasa al formulario las unidades de la accion de inventario y no las de listUnitsAction', async () => {
    const DEL_CATALOGO = { ...UNIDAD, id: crypto.randomUUID(), name: 'Galón', symbol: 'gal' };
    const DEL_ALTA = { ...UNIDAD, id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
    listUnitsActionMock.mockResolvedValue({ status: 'success', data: [DEL_CATALOGO] });
    listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: [DEL_ALTA] });
    const user = setupUser();

    await renderPantalla();
    expect(listProductFormUnitsActionMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.getAttribute('data-value'))).toEqual([DEL_ALTA.id]);
  });

  it('R20 si la lectura de unidades del alta falla, el selector sale vacio y la pantalla sigue en pie', async () => {
    listProductFormUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    expect(screen.queryAllByTestId(PRESENTATION_UNIT_OPTION_TESTID)).toHaveLength(0);
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
  });

  it('R20 el alta del estado vacio ofrece las unidades del formulario y no las de listUnitsAction', async () => {
    // El estado vacio monta su propio panel de alta, aparte del de la cabecera.
    const DEL_CATALOGO = { ...UNIDAD, id: crypto.randomUUID(), name: 'Galón', symbol: 'gal' };
    const DEL_ALTA = { ...UNIDAD, id: crypto.randomUUID(), name: 'Kilogramo', symbol: 'kg' };
    listUnitsActionMock.mockResolvedValue({ status: 'success', data: [DEL_CATALOGO] });
    listProductFormUnitsActionMock.mockResolvedValue({ status: 'success', data: [DEL_ALTA] });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([], { total: 0 }));
    const user = setupUser();

    await renderPantalla();
    const vacio = screen.getByTestId(testId.vacio);
    await user.click(within(vacio).getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    const opciones = await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID);
    expect(opciones.map((opcion) => opcion.getAttribute('data-value'))).toEqual([DEL_ALTA.id]);
  });

  // QC-70 R32 — AQUI vivia el caso «un nombre de presentacion repetido pinta el mensaje DEL BACK,
  // no un texto propio», junto a los dos de R24 sobre el selector de presentaciones. Los tres se
  // van con `dev` (2026-09-09): la presentacion se mudo de `products` a `product_batches` y este
  // formulario ya no tiene selector de presentacion ni alta en linea, asi que no queda gesto que
  // ejercitar. NO se pierde cobertura de R32: el componente que la ficha corrigio
  // -`components/shared/presentation-select.tsx`- sigue vivo y en uso desde
  // `proveedores/[id]/components/catalog-line-form.tsx`, y su caso equivalente esta en
  // `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` > «linea de catalogo — errores por
  // codigo estable (R32, R45)».

  it('el borrado pide confirmacion nombrando el producto y sin confirmar no invoca la operacion', async () => {
    // R26
    const user = setupUser();
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
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('pantalla de productos — alta rapida de presentacion (QC-80 R11, R17, R19)', () => {
  it('el alta rapida manda la unidad y sin elegirla no llega a la operacion', async () => {
    // R10, R11 y R17 — este panel es UNO de los dos caminos que crean presentaciones, y R11 dice
    // que NINGUNO puede crear una sin unidad. Se afirma sobre el `FormData` que recibe la Server
    // Action, no sobre estado de React.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await elegirTipo(user, 'Envase');

    await user.click(screen.getByTestId(testId.abrirAltaPresentacion));
    await user.type(screen.getByTestId(testId.nombrePresentacion), PRESENTACION_NUEVA.name);

    // Sin unidad la validacion previa -el MISMO esquema que valida el servidor- corta el envio y
    // el fallo se pinta JUNTO al campo de unidad.
    await user.click(screen.getByTestId(testId.guardarPresentacion));
    expect(await screen.findByTestId(PRESENTATION_UNIT_ERROR_TESTID)).toBeInTheDocument();
    expect(createPresentationActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(PRESENTATION_UNIT_SELECT_TESTID));
    await user.click(
      await esperarInteractiva((await screen.findAllByTestId(PRESENTATION_UNIT_OPTION_TESTID))[0]),
    );
    await user.click(screen.getByTestId(testId.guardarPresentacion));

    await waitFor(() => expect(createPresentationActionMock).toHaveBeenCalledTimes(1));
    const enviado = createPresentationActionMock.mock.calls[0][1];
    expect(enviado.get('name')).toBe(PRESENTACION_NUEVA.name);
    expect(enviado.get(PRESENTATION_UNIT_FIELD)).toBe(UNIDAD.id);

    // Y la presentacion recien creada queda elegida en el formulario del producto.
    await waitFor(() =>
      expect(screen.getByTestId('presentation-value')).toHaveValue(PRESENTACION_NUEVA.id),
    );
  });

  it('sin catalogo de unidades no se ofrece el alta rapida, pero elegir una presentacion existente sigue funcionando', async () => {
    // Mismo criterio que R19 resolvio en la pantalla de presentaciones: un formulario con un campo
    // obligatorio imposible de rellenar es peor que no ofrecerlo. Lo que NO se degrada es el resto
    // del alta de producto.
    const user = setupUser();
    // QC-71 volvio `reference` OBLIGATORIA en el estado de error inesperado, asi que el estado se
    // construye con el helper del repo en vez de a mano: si manana cambia de forma otra vez, esto
    // se entera sin tocarlo.
    listUnitsActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await elegirTipo(user, 'Envase');

    expect(screen.getByTestId(testId.selectorPresentacion)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.abrirAltaPresentacion)).toBeNull();

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));
    expect(createProductActionMock.mock.calls[0][1].get('presentationId')).toBe(PRESENTACION_A.id);
    expect(createPresentationActionMock).not.toHaveBeenCalled();
  });
});

/**
 * QC-71 T9 — R17 y R18 en la pantalla de inventario.
 *
 * Las tres superficies que pintan un error de una Server Action se prueban con la misma pareja de
 * casos: con el error INESPERADO se ve el identificador **como texto**, y con un error DEL
 * CATALOGO no se ve ninguno. El uuid del caso es inconfundible, y la asercion negativa es sobre el
 * uuid, sobre la etiqueta y sobre el `data-testid` del aviso: si el identificador se colara por
 * cualquiera de las tres vias, el caso se pone rojo.
 *
 * Nada se identifica por copy tecleado a mano: los `data-testid` y la etiqueta se IMPORTAN del
 * componente compartido, y el mensaje sale de `errorMessage(...)`, o sea del catalogo.
 */
describe('pantalla de productos — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('la lista con el error inesperado ensena el identificador como texto y con su etiqueta', async () => {
    listProductsActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const aviso = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID);
    expect(within(aviso).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
    // El mensaje sigue siendo el neutro del catalogo: el identificador no lo sustituye.
    expect(aviso).toHaveTextContent(errorMessage(UNEXPECTED_ERROR_CODE));
  });

  it('la lista con un error del catalogo no ensena identificador ninguno', async () => {
    listProductsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });

  it('el formulario conserva el identificador que devolvio la operacion', async () => {
    // Es el caso que caza la copia campo a campo: el formulario guarda el estado de error ENTERO.
    const user = setupUser();
    createProductActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(region).toHaveAttribute('role', 'alert');
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('el formulario con un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    createProductActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByTestId('product-form-error-code')).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });

  it('el dialogo de borrado ensena el identificador del error inesperado', async () => {
    const user = setupUser();
    deleteProductActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    const region = await screen.findByTestId('delete-product-error');
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('el dialogo de borrado con un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteProductActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    const region = await screen.findByTestId('delete-product-error');
    expect(region).toHaveTextContent('No autorizado.');
    esperarSinIdentificador();
  });
});
