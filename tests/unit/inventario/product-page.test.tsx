import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import InventarioPage from '@/app/(private)/inventario/page';
import {
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

// Timeout propio del archivo, no el de 5 s por defecto. Son 27 casos de `user-event` sobre jsdom
// -que teclea caracter a caracter, con su espera entre pulsaciones- y el archivo entero tarda
// ~25 s. Medido en aislamiento el 2026-09-04, los mas pesados van de 3,5 s a 4,4 s (el rechazo
// por nombre largo teclea 121 caracteres; el alta de una presentacion en linea abre un segundo
// formulario dentro del panel): a 5 s no les sobra nada, y con la suite completa saturando la
// maquina se pasan del limite. El fallo que provocaban no era de logica -en aislamiento pasaban
// enteros-, y ademas contaminaba al caso siguiente: al cortarse a mitad del tecleo, las pulsadas
// que quedaban pendientes caian en el input del test posterior (`xxxxxÁxcxixdxox...`).
//
// Subirlo no afloja ningun assert: un `waitFor` que nunca se cumpla sigue fallando, solo que a los
// 20 s en vez de a los 5. Va aqui, a nivel de archivo, y no en el proyecto `ui` de
// `vitest.config.mts`, para no regalarle margen al resto de la UI: la lentitud es de este archivo.
vi.setConfig({ testTimeout: 20_000 });

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

/**
 * Id de unidad del fixture, **tambien inconfundible y tambien invisible**. Desde el merge de
 * QC-32 (`modelo-unidades`) el producto no guarda el texto de la unidad sino `unitId`, una clave
 * foranea al catalogo, y esta pantalla no tiene forma de resolverla a un nombre: el contrato
 * publico de `lib/modules/unidades` no expone ninguna operacion de listado (llega con QC-38).
 * Por decision humana del 2026-09-03 la unidad sale de la pantalla; este centinela vigila que no
 * vuelva por la puerta de atras pintando el UUID crudo, que seria peor que no mostrar nada.
 */
const UNIDAD_QUE_NO_DEBE_VERSE = 'UNIDAD-ID-NO-VISIBLE';

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: crypto.randomUUID(),
    name: 'Hidróxido de sodio',
    presentationId: PRESENTACION_A.id,
    presentationName: PRESENTACION_A.name,
    stock: 42,
    qtyAlert: 5,
    unitId: UNIDAD_QUE_NO_DEBE_VERSE,
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
    // R6 — se itera la DECLARACION de columnas en vez de listar los literales uno a uno: quitar
    // una columna deja este test sin encabezado que encontrar.
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
    expect(PRODUCT_COLUMNS.map((columna) => columna.key)).toEqual([
      'name',
      'presentationName',
      'stock',
      'qtyAlert',
    ]);
  });

  it('la tabla no muestra createdBy, updatedBy ni el id de la unidad', async () => {
    // R7 — test **en negativo**: los ids de autoria estan en los datos y no pueden llegar a la
    // pantalla. Anadir una columna que los pinte pone esto rojo.
    //
    // `unitId` se vigila igual desde el 2026-09-03: no lo pide R7, lo pide la decision de sacar
    // la unidad de la pantalla tras el merge de QC-32. Mientras nadie sepa resolver ese id a un
    // nombre, la unica forma de "mostrar la unidad" seria pintar el UUID, y eso no se hace.
    await renderPantalla();

    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(EDITOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(UNIDAD_QUE_NO_DEBE_VERSE);

    for (const prohibida of ['createdBy', 'updatedBy', 'id', 'presentationId', 'unitId']) {
      expect(
        PRODUCT_COLUMNS.some((columna) => String(columna.key) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`product-cell-${prohibida}`)).toBeNull();
    }
  });

  it('el costo, la compra minima y el tiempo de entrega no aparecen en la lista por ninguna via', async () => {
    // QC-52 R6 (deroga QC-14 R8 en este punto). Antes este caso miraba el campo OCULTO con el
    // que la edicion conservaba el costo; ese campo se fue con la columna, asi que lo que se
    // afirma ahora es la ausencia completa: ni columna, ni celda, ni campo oculto, ni ningun
    // valor derivado de los tres.
    const user = userEvent.setup();
    listProductsActionMock.mockResolvedValue(paginaDeProductos([producto()]));

    await renderPantalla();

    for (const campo of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(screen.queryByTestId(`product-column-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`product-cell-${campo}`), campo).toBeNull();
    }

    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    for (const campo of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`product-hidden-${campo}`), campo).toBeNull();
    }
  });

  it('la existencia se pinta en rojo cuando la alerta de cantidad la supera', async () => {
    // Decision del humano, 2026-09-03. Es PRESENTACION y solo presentacion: no hay columna
    // derivada en la base ni campo calculado en `ProductView` -R11 y la decision cerrada 10 de
    // QC-14 lo prohiben-. La comparacion se hace al pintar, con dos valores que ya venian.
    listProductsActionMock.mockResolvedValue(
      paginaDeProductos([
        producto({ id: crypto.randomUUID(), stock: 2, qtyAlert: 5 }),
        producto({ id: crypto.randomUUID(), stock: 5, qtyAlert: 5 }),
        producto({ id: crypto.randomUUID(), stock: 9, qtyAlert: 5 }),
        producto({ id: crypto.randomUUID(), stock: null, qtyAlert: 5 }),
      ]),
    );

    await renderPantalla();

    const celdas = screen.getAllByTestId('product-cell-stock');
    // Por debajo de la alerta: en rojo.
    expect(celdas[0]).toHaveAttribute('data-alert', 'true');
    // Justo en la alerta y por encima: no. La alarma salta cuando la SUPERA, no al igualarla.
    expect(celdas[1]).not.toHaveAttribute('data-alert');
    expect(celdas[2]).not.toHaveAttribute('data-alert');
    // Sin existencia no se sabe si hay alarma: pintar de rojo una incognita seria inventarsela.
    expect(celdas[3]).not.toHaveAttribute('data-alert');

    // La alerta nunca se tine a si misma: la que esta en alarma es la existencia.
    for (const celda of screen.getAllByTestId('product-cell-qtyAlert')) {
      expect(celda).not.toHaveAttribute('data-alert');
    }
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
    const elProducto = producto({ name: 'Sosa cáustica' });
    listProductsActionMock.mockResolvedValue(paginaDeProductos([elProducto]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    const precargado: Record<string, string> = {
      name: elProducto.name,
      stock: String(elProducto.stock),
      qtyAlert: String(elProducto.qtyAlert),
    };

    // QC-52 R5: los tres que el formulario enviaba ocultos ya no existen en el producto. La
    // edicion no puede enviarlos POR NINGUNA VIA -ni campo visible, ni oculto, ni precargado-.
    const FUERA_DEL_PRODUCTO = ['cost', 'minPurchase', 'deliveryTime'] as const;

    for (const [campo, valor] of Object.entries(precargado)) {
      expect(screen.getByTestId(`product-field-${campo}`), campo).toHaveValue(
        campo === 'name' ? valor : Number(valor),
      );
    }

    // Ninguno de los tres tiene control, ni visible ni oculto.
    for (const campo of FUERA_DEL_PRODUCTO) {
      expect(screen.queryByTestId(`product-field-${campo}`), campo).toBeNull();
      expect(screen.queryByTestId(`product-hidden-${campo}`), campo).toBeNull();
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
    // Y los tres que el producto perdio no viajan (R5).
    for (const campo of FUERA_DEL_PRODUCTO) {
      expect(enviado.get(campo), `${campo} no debe viajar en el reemplazo`).toBeNull();
    }
  });

  it('un guardado rechazado por un campo muestra el error en linea y no cierra el panel', async () => {
    // R20 (primera mitad) — el error identifica campo, asi que va junto al campo. Y no se llega
    // siquiera a llamar a la operacion: la validacion previa usa el mismo esquema del servidor.
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    // ACOTADO EL 2026-09-03: el rechazo se provocaba con un costo no numerico. Ese campo ya no se
    // pinta, asi que el caso se muda al nombre, que sigue en pantalla y tiene su propia regla en
    // el MISMO esquema del servidor: 120 caracteres como maximo. Lo que R20 vigila -el error va
    // junto a SU campo, la operacion ni se llama y el panel sigue abierto- no cambia.
    const nombreLargo = 'x'.repeat(121);
    await crearPresentacionEnLinea(user);
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
    expect(screen.getByTestId('product-field-stock')).toHaveValue(Number(ALTA_VALIDA.stock));
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
    expect(screen.getByTestId('product-field-stock')).toHaveValue(Number(ALTA_VALIDA.stock));
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

  it('los campos con ayuda la ofrecen en la etiqueta y la muestran al pasar por encima', async () => {
    // El formulario perdio tres campos el 2026-09-03 y gano una ayuda por campo en su lugar.
    // Se vigilan las tres cosas que pueden romperse en silencio:
    //   1. que el disparador sea `type="button"` -desde que el panel entero es un `<form>`, un
    //      boton sin tipo dentro de el lo ENVIA, y pedir ayuda guardaria el producto-;
    //   2. que tenga nombre accesible propio, porque su contenido es un icono;
    //   3. que el texto de la ayuda no este en el documento hasta que se pide.
    const user = userEvent.setup();

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
    expect(texto).toHaveTextContent('Se guarda tal cual');

    // Pedir ayuda no envia el formulario.
    expect(createProductActionMock).not.toHaveBeenCalled();
  });

  it('el formulario no captura la unidad, y el alta viaja sin ella', async () => {
    // **R23 quedo sin objeto** el 2026-09-03, y este test es su relevo, no su borrado.
    //
    // R23 pedia la unidad como TEXTO LIBRE porque eso era lo que la columna guardaba. El merge de
    // QC-32 (`modelo-unidades`) tumbo esa premisa con la feature en vuelo: el producto ya no
    // guarda `unit: string | null` sino `unitId`, una clave foranea al catalogo de unidades. Un
    // campo de texto pasaria a escribir un valor que la base ya no acepta, y un selector no se
    // puede construir hoy porque `lib/modules/unidades` no expone como listar el catalogo (eso
    // llega con QC-38). Decision humana: el campo sale de la pantalla y el producto se da de alta
    // sin unidad, que el esquema admite por ser `unitId` nulable.
    //
    // Lo que se vigila aqui es que la ausencia siga siendo intencionada: ni un campo de texto que
    // reviva la premisa caida, ni un hueco donde alguien teclee un UUID a mano.
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    const formulario = screen.getByTestId(testId.formulario);
    expect(screen.queryByTestId('product-field-unit')).toBeNull();
    expect(screen.queryByTestId('product-field-unitId')).toBeNull();
    expect(formulario.textContent).not.toContain('Unidad');

    // El unico control de conjunto cerrado del formulario sigue siendo la presentacion (R24).
    const combos = within(formulario).getAllByRole('combobox');
    expect(combos).toHaveLength(1);
    expect(combos[0]).toBe(screen.getByTestId(testId.selectorPresentacion));

    await crearPresentacionEnLinea(user);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createProductActionMock).toHaveBeenCalledTimes(1));

    // Y el alta llega a la Server Action SIN unidad, ni con el nombre viejo ni con el nuevo.
    const enviado = createProductActionMock.mock.calls[0][1];
    expect(enviado.get('unit')).toBeNull();
    expect(enviado.get('unitId')).toBeNull();
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
