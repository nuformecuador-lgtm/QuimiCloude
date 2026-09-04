import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import {
  CATALOG_COLUMNS,
  CATALOG_LIST_EMPTY_TESTID,
  CATALOG_PAGE_PARAM,
  CATALOG_PAGE_SIZE_OPTIONS,
  CATALOG_PAGE_SIZE_PARAM,
  EMPTY_CELL,
} from '@/app/(private)/proveedores/[id]/components';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { CatalogLineView, SupplierView } from '@/lib/modules/proveedores';
import type {
  CatalogLineListResult,
  CatalogLineMutationFormState,
  CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { SupplierQueryResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Pagina de detalle del proveedor y su catalogo: R7, R8, R9, R11, R12, R19, R20, R21, R22, R23,
 * R24, R25, R30, R41, R46 y R48 (`specs/QC-44-pantalla-de-proveedores/tasks.md > T10, T12, T13`).
 *
 * **Las cuatro operaciones de lectura estan mockeadas.** No es un atajo: son el borde de
 * `proveedores` (QC-43/QC-52), `unidades` (QC-32) e `inventario` (QC-20), modulos que esta ficha
 * no abre (R49), y sustituirlas es lo unico que permite ejercitar los tres estados y la resolucion
 * de nombres sin base de datos.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre
 * literales de copy. Donde aparece texto es **dato del fixture** -el nombre de un proveedor, el
 * mensaje que devuelve una action-, no copy de la pantalla.
 *
 * **R11, R12, R22 y R30 son tests en negativo a proposito**: colar un buscador que solo filtraria
 * la pagina visible, pintar el autor, ensenar un uuid cuando el nombre no se resuelve o sacar la
 * imagen de la linea son justo las cosas que una feature posterior puede anadir sin que ningun
 * assert positivo se ponga rojo.
 */

const {
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
  listCatalogLinesActionMock,
  createCatalogLineActionMock,
  updateCatalogLineActionMock,
  deleteCatalogLineActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSupplierActionMock: vi.fn<(id: string) => Promise<SupplierQueryResult>>(),
  listCatalogLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<CatalogLineListResult>>(),
  createCatalogLineActionMock:
    vi.fn<
      (prev: CreateCatalogLineFormState, data: FormData) => Promise<CreateCatalogLineFormState>
    >(),
  updateCatalogLineActionMock:
    vi.fn<
      (
        id: string,
        prev: CatalogLineMutationFormState,
        data: FormData,
      ) => Promise<CatalogLineMutationFormState>
    >(),
  deleteCatalogLineActionMock:
    vi.fn<
      (prev: CatalogLineMutationFormState, data: FormData) => Promise<CatalogLineMutationFormState>
    >(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
}));

// Las cuatro operaciones del catalogo: la de lectura y las tres de escritura que el panel
// lateral y el dialogo de baja invocan (T15, T16). Se declaran todas aunque este archivo solo
// ejercite la lectura: un mock parcial rompe el import de las que falten.
vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  listCatalogLinesAction: listCatalogLinesActionMock,
  createCatalogLineAction: createCatalogLineActionMock,
  updateCatalogLineAction: updateCatalogLineActionMock,
  deleteCatalogLineAction: deleteCatalogLineActionMock,
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
}));

const testId = {
  detalle: 'supplier-detail',
  nombre: 'supplier-detail-name',
  telefono: 'supplier-detail-phone',
  correo: 'supplier-detail-email',
  noEncontrado: 'supplier-not-found',
  enlaceLista: 'supplier-not-found-link',
  lista: 'catalog-list',
  tabla: 'catalog-table',
  fila: 'catalog-row',
  esqueleto: 'catalog-table-skeleton',
  filaEsqueleto: 'catalog-row-skeleton',
  vacio: CATALOG_LIST_EMPTY_TESTID,
  primeraPagina: 'catalog-list-first-page',
  error: 'catalog-list-error',
  errorMensaje: 'catalog-list-error-message',
  errorCodigo: 'catalog-list-error-code',
  reintentar: 'catalog-list-retry',
  tamanoPagina: 'catalog-page-size',
  paginaAnterior: 'catalog-page-previous',
  paginaSiguiente: 'catalog-page-next',
  estadoPagina: 'catalog-page-status',
} as const;

/**
 * Datos del fixture que **no deben verse nunca**. Cadenas inconfundibles a proposito: los tests en
 * negativo buscan su ausencia en todo el documento, y con valores realistas no distinguirian entre
 * «no se muestra» y «se muestra pero parece otra cosa».
 */
const PROVEEDOR_ID = 'PROVEEDOR-ID-NO-VISIBLE';
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';
const LINEA_ID_QUE_NO_DEBE_VERSE = 'LINEA-ID-NO-VISIBLE';
const IMAGEN_QUE_NO_DEBE_VERSE = 'IMAGEN-DE-LA-LINEA-NO-VISIBLE';

const PRESENTACION = { id: 'PRESENTACION-ID-NO-VISIBLE', name: 'Tambor 200 L' };
const UNIDAD = { id: 'UNIDAD-ID-NO-VISIBLE', name: 'Kilogramo', symbol: 'kg' };

function proveedor(overrides: Partial<SupplierView> = {}): SupplierView {
  return {
    id: PROVEEDOR_ID,
    name: 'Químicos del Norte',
    nameNormalized: 'quimicos del norte',
    phone: '+52 81 1234 5678',
    email: 'ventas@quimicosdelnorte.example',
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

function linea(overrides: Partial<CatalogLineView> = {}): CatalogLineView {
  return {
    id: LINEA_ID_QUE_NO_DEBE_VERSE,
    supplierId: PROVEEDOR_ID,
    name: 'Sosa cáustica escamas',
    presentationId: PRESENTACION.id,
    unitId: UNIDAD.id,
    imagePath: IMAGEN_QUE_NO_DEBE_VERSE,
    cost: '1234.5678',
    minPurchase: '0.1005',
    deliveryTime: 5,
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    updatedAt: new Date('2026-03-05T10:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

function paginaDeLineas(
  items: readonly CatalogLineView[],
  extra: { page?: number; pageSize?: number; total?: number; totalPages?: number } = {},
): CatalogLineListResult {
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

function paginaDePresentaciones(): PresentationListResult {
  return {
    status: 'success',
    data: {
      items: [
        {
          ...PRESENTACION,
          nameNormalized: 'tambor 200 l',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: 1,
    },
  };
}

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar un
 * componente `async`, asi que sin esto el catalogo no llegaria a pintarse nunca. Lo que se
 * conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key` y su `fallback` siguen siendo
 * los que declara la pagina.
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

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

/** Arbol que devuelve la pagina real, sin resolver: la seccion del catalogo sigue siendo async. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return ProveedorDetallePage({
    params: Promise.resolve({ id: PROVEEDOR_ID }),
    searchParams: Promise.resolve(searchParams),
  });
}

/** Monta la pagina de detalle con el catalogo ya resuelto. */
async function renderPantalla(searchParams: Consulta = {}) {
  return render(await resolverServerComponents(await arbolDeLaPantalla(searchParams)));
}

/** Monta la pagina con el catalogo aun en vuelo: `<Suspense>` pinta su `fallback` (R24). */
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await arbolDeLaPantalla(searchParams));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(supplierDetailRoute(PROVEEDOR_ID));
  getSupplierActionMock.mockResolvedValue({ status: 'success', data: proveedor() });
  listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea()]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  createCatalogLineActionMock.mockResolvedValue({ status: 'success', id: 'linea-creada' });
  updateCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  deleteCatalogLineActionMock.mockResolvedValue({ status: 'success' });
  listPresentationsActionMock.mockResolvedValue(paginaDePresentaciones());
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetViewport();
});

describe('pagina de detalle — datos del proveedor (R19, R46)', () => {
  it('presenta nombre, telefono y correo del proveedor y, debajo, su catalogo', async () => {
    // R19
    const elProveedor = proveedor();
    getSupplierActionMock.mockResolvedValue({ status: 'success', data: elProveedor });

    await renderPantalla();

    expect(getSupplierActionMock).toHaveBeenCalledWith(PROVEEDOR_ID);
    expect(screen.getByTestId(testId.nombre)).toHaveTextContent(elProveedor.name);
    expect(screen.getByTestId(testId.telefono)).toHaveTextContent(elProveedor.phone as string);
    expect(screen.getByTestId(testId.correo)).toHaveTextContent(elProveedor.email as string);

    // El catalogo es del proveedor de la URL y se pide UNA sola vez, con los parametros acotados.
    expect(listCatalogLinesActionMock).toHaveBeenCalledTimes(1);
    expect(listCatalogLinesActionMock).toHaveBeenCalledWith(PROVEEDOR_ID, {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
  });

  it('un proveedor sin telefono ni correo pinta la marca de «sin dato», nunca un hueco', async () => {
    // R19 — los dos son opcionales en el contrato (QC-43).
    getSupplierActionMock.mockResolvedValue({
      status: 'success',
      data: proveedor({ phone: null, email: null }),
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.telefono)).toHaveTextContent(EMPTY_CELL);
    expect(screen.getByTestId(testId.correo)).toHaveTextContent(EMPTY_CELL);
  });

  it('las unidades se piden UNA sola vez en el servidor y bajan por props', async () => {
    // R46 — ningun componente de cliente pide el catalogo de unidades por su cuenta.
    await renderPantalla();

    expect(listUnitsActionMock).toHaveBeenCalledTimes(2);
  });

  it('la pagina no muestra el identificador ni la autoria del proveedor', async () => {
    // R12 — en negativo: el `SupplierView` los trae y resolverlos exigiria abrir `identity`.
    await renderPantalla();

    for (const prohibido of [AUTOR_QUE_NO_DEBE_VERSE, EDITOR_QUE_NO_DEBE_VERSE]) {
      expect(document.body.textContent, prohibido).not.toContain(prohibido);
    }
  });
});

describe('pagina de detalle — proveedor inexistente y no autorizado (R20, R7)', () => {
  it('«no encontrado» presenta el estado propio con vuelta a la lista y SIN catalogo', async () => {
    // R20
    getSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_found',
      message: 'El proveedor no existe.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.noEncontrado)).toBeInTheDocument();
    // El destino sale de la constante compartida, no de un literal escrito en la pantalla (R2).
    expect(screen.getByTestId(testId.enlaceLista)).toHaveAttribute('href', SUPPLIERS_ROUTE);

    // Y el catalogo NI SE PIDE: un proveedor que no existe no tiene lineas que listar.
    expect(listCatalogLinesActionMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.detalle)).toBeNull();
  });

  it('«no autorizado» presenta el error y no muestra ni un dato del proveedor', async () => {
    // R7 — la pantalla no decide permisos; presenta lo que la operacion respondio.
    const elProveedor = proveedor();
    getSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso para consultar proveedores.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent(
      'No tienes permiso para consultar proveedores.',
    );
    expect(screen.queryByTestId(testId.detalle)).toBeNull();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
    expect(document.body.textContent).not.toContain(elProveedor.name);
    expect(listCatalogLinesActionMock).not.toHaveBeenCalled();
  });

  it('si el catalogo de unidades falla, se presenta el error y ningun dato', async () => {
    // R7 — mismo trato que da la pagina de edicion de receta al mismo fallo.
    listUnitsActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(testId.detalle)).toBeNull();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
  });
});

describe('catalogo — los tres estados (R23, R24, R25)', () => {
  it('sin lineas presenta un estado vacio PROPIO del catalogo, distinto del de proveedores', async () => {
    // R23 — los dos vacios significan cosas distintas y ofrecen acciones distintas.
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([], { total: 0 }));

    await renderPantalla();

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    // El identificador del vacio del catalogo NO es el de la lista de proveedores. El literal de
    // la otra ruta se escribe aqui a proposito: importarlo ataria las dos rutas por sus tripas,
    // que es justo lo que este test vigila que no ocurra.
    expect(CATALOG_LIST_EMPTY_TESTID).not.toBe('supplier-list-empty');
    expect(screen.queryByTestId('supplier-list-empty')).toBeNull();
  });

  it('una pagina que se quedo atras ofrece volver a la primera, no un vacio mudo', async () => {
    // R23 — tras una baja, la pagina 3 puede quedarse sin lineas sin que el catalogo este vacio.
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([], { page: 3, total: 12 }));

    await renderPantalla({ [CATALOG_PAGE_PARAM]: '3' });

    const enlace = screen.getByTestId(testId.primeraPagina);
    const destino = String(enlace.getAttribute('href'));
    // El destino se construye con el helper de ruta (R3), no con un literal.
    expect(destino.startsWith(`${supplierDetailRoute(PROVEEDOR_ID)}?`)).toBe(true);
    expect(new URLSearchParams(destino.split('?')[1]).get(CATALOG_PAGE_PARAM)).toBe('1');
  });

  it('mientras el catalogo esta en vuelo se presenta el esqueleto, no la tabla', async () => {
    // R24 — con tantas filas como el tamano de pagina pedido.
    await renderPantallaCargando({ [CATALOG_PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    expect(screen.getByTestId(testId.esqueleto)).toBeInTheDocument();
    expect(screen.getAllByTestId(testId.filaEsqueleto)).toHaveLength(MAX_PAGE_SIZE);
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    // El detalle del proveedor SI se ve: solo el catalogo esta cargando.
    expect(screen.getByTestId(testId.detalle)).toBeInTheDocument();
  });

  it('si el catalogo falla se presenta el error con reintento, no una tabla vacia', async () => {
    // R25 — confundir «fallo» con «no hay nada» es justo lo que R25 prohibe.
    const user = userEvent.setup();
    listCatalogLinesActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toBeInTheDocument();
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es válida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    // El detalle del proveedor se conserva: lo que fallo fue el catalogo.
    expect(screen.getByTestId(testId.detalle)).toBeInTheDocument();

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('catalogo — columnas y celdas (R21, R22, R12, R30, R41)', () => {
  it('presenta las ocho columnas de negocio de la linea', async () => {
    // R21
    await renderPantalla();

    expect(CATALOG_COLUMNS.map((columna) => columna.key)).toEqual([
      'name',
      'presentationId',
      'unitId',
      'cost',
      'minPurchase',
      'deliveryTime',
      'createdAt',
      'updatedAt',
    ]);

    for (const columna of CATALOG_COLUMNS) {
      expect(
        screen.getByTestId(columna.testId),
        `falta el encabezado de «${columna.key}»`,
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('catalog-cell-name')).toHaveTextContent(linea().name);
  });

  it('presenta la presentacion y la unidad por su NOMBRE, no por su identificador', async () => {
    // R22 (primera mitad).
    await renderPantalla();

    expect(screen.getByTestId('catalog-cell-presentationId')).toHaveTextContent(PRESENTACION.name);
    expect(screen.getByTestId('catalog-cell-unitId')).toHaveTextContent(UNIDAD.symbol);
    for (const identificador of [PRESENTACION.id, UNIDAD.id]) {
      expect(document.body.textContent, identificador).not.toContain(identificador);
    }
  });

  it('cuando el nombre no se resuelve pinta el marcador y NUNCA el identificador', async () => {
    // R22 (segunda mitad) — presentacion fuera de la cota del diccionario y linea sin unidad.
    const PRESENTACION_FUERA = 'PRESENTACION-FUERA-DEL-DICCIONARIO';
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ presentationId: PRESENTACION_FUERA, unitId: null })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('catalog-unresolved-presentationId')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-unresolved-unitId')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PRESENTACION_FUERA);
  });

  it('los diccionarios se construyen UNA vez por render, nunca por fila', async () => {
    // R22, `design.md > 6.2` — pedir el nombre por fila serian hasta 25 consultas por pagina.
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ id: 'linea-1' }), linea({ id: 'linea-2' }), linea({ id: 'linea-3' })]),
    );

    await renderPantalla();

    expect(screen.getAllByTestId(testId.fila)).toHaveLength(3);
    // Una llamada de la pagina (las unidades que bajan por props) y otra del diccionario de la
    // seccion: dos en total, independientemente del numero de filas.
    expect(listUnitsActionMock).toHaveBeenCalledTimes(2);
    expect(listPresentationsActionMock).toHaveBeenCalledTimes(1);
  });

  it('el costo y el minimo de compra se pintan TAL CUAL la cadena de la consulta', async () => {
    // R41 — sin `Intl.NumberFormat`, sin `toFixed`, sin coma flotante y sin aritmetica.
    const laLinea = linea({ cost: '1234.5678', minPurchase: '0.1005' });
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([laLinea]));

    await renderPantalla();

    // La celda contiene EXACTAMENTE la cadena, ni redondeada ni reformateada.
    expect(screen.getByTestId('catalog-cell-cost').textContent).toBe(laLinea.cost);
    expect(screen.getByTestId('catalog-cell-minPurchase').textContent).toBe(laLinea.minPurchase);
  });

  it('un minimo y un tiempo de entrega ausentes pintan la marca de «sin dato»', async () => {
    // R21 — los dos son opcionales en el contrato (QC-52).
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ minPurchase: null, deliveryTime: null })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('catalog-cell-minPurchase').textContent).toBe(EMPTY_CELL);
    expect(screen.getByTestId('catalog-cell-deliveryTime').textContent).toBe(EMPTY_CELL);
  });

  it('la tabla no muestra imagen, ni identificadores, ni autoria de la linea', async () => {
    // R30 y R12 — en negativo: son campos que la vista trae y que la decision humana deja fuera.
    await renderPantalla();

    for (const clave of ['imagePath', 'createdBy', 'updatedBy', 'id', 'supplierId']) {
      expect(
        CATALOG_COLUMNS.some((columna) => String(columna.key) === clave),
        `«${clave}» no puede ser una columna`,
      ).toBe(false);
    }

    for (const prohibido of [
      IMAGEN_QUE_NO_DEBE_VERSE,
      LINEA_ID_QUE_NO_DEBE_VERSE,
      AUTOR_QUE_NO_DEBE_VERSE,
      EDITOR_QUE_NO_DEBE_VERSE,
    ]) {
      expect(document.body.textContent, prohibido).not.toContain(prohibido);
    }
    // Y ninguna imagen se pinta en la tabla.
    expect(within(screen.getByTestId(testId.tabla)).queryAllByRole('img')).toHaveLength(0);
  });
});

describe('catalogo — paginacion, orden y viewport (R8, R9, R11, R13, R48)', () => {
  it('ofrece exactamente dos tamanos de pagina y cambiarlos navega a la primera', async () => {
    // R8 — el defecto se observa en lo que se le PIDE al backend; las dos opciones, en el selector.
    const user = userEvent.setup();
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea()], { total: 40 }));

    await renderPantalla();

    expect(listCatalogLinesActionMock).toHaveBeenCalledWith(PROVEEDOR_ID, {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(CATALOG_PAGE_SIZE_OPTIONS.length);

    await user.click(screen.getByTestId(`catalog-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(CATALOG_PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(CATALOG_PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    // R9
    const user = userEvent.setup();
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea()], { page: 2, total: 30, totalPages: 3 }),
    );

    await renderPantalla({ [CATALOG_PAGE_PARAM]: '2' });

    const estado = screen.getByTestId(testId.estadoPagina);
    expect(estado).toHaveTextContent('2');
    expect(estado).toHaveTextContent('3');

    await user.click(screen.getByTestId(testId.paginaSiguiente));
    expect(
      new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]).get(
        CATALOG_PAGE_PARAM,
      ),
    ).toBe('3');

    await user.click(screen.getByTestId(testId.paginaAnterior));
    expect(
      new URLSearchParams(String(routerMock.push.mock.calls[1][0]).split('?')[1]).get(
        CATALOG_PAGE_PARAM,
      ),
    ).toBe('1');
  });

  it('en los extremos no ofrece avanzar ni retroceder mas alla', async () => {
    // R9 — el indicador no puede prometer una pagina que no existe.
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
  });

  it('el catalogo no ofrece busqueda ni control de orden', async () => {
    // R11 — en negativo: filtrar en cliente solo buscaria dentro de la pagina visible.
    await renderPantalla();

    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);

    const combos = screen.queryAllByRole('combobox');
    expect(combos).toHaveLength(1);
    expect(combos[0]).toBe(screen.getByTestId(testId.tamanoPagina));

    for (const encabezado of screen.getAllByRole('columnheader')) {
      expect(within(encabezado).queryAllByRole('button')).toHaveLength(0);
      expect(within(encabezado).queryAllByRole('link')).toHaveLength(0);
    }
  });

  it('el desbordamiento lo absorbe la tabla, no el documento, en angosto y en ancho', async () => {
    // R13 y R48 — el scroll horizontal vive en el envoltorio del primitivo, y los controles siguen
    // siendo alcanzables a los dos lados del breakpoint (nada detras de `:hover`).
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      const contenedor = document.querySelector('[data-slot="table-container"]');
      expect(contenedor, `envoltorio de la tabla a ${ancho}px`).not.toBeNull();
      expect(contenedor?.className).toContain('overflow-x-auto');

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.paginaSiguiente), `siguiente a ${ancho}px`).toBeVisible();

      // Ningun otro contenedor de la pantalla declara scroll horizontal propio ni alto de pantalla.
      for (const nodo of Array.from(document.querySelectorAll('div'))) {
        if (nodo.getAttribute('data-slot') === 'table-container') continue;
        expect(nodo.className, `a ${ancho}px`).not.toContain('overflow-x');
        expect(nodo.className, `a ${ancho}px`).not.toContain('h-screen');
        expect(nodo.className, `a ${ancho}px`).not.toContain('100vh');
      }

      cleanup();
    }
  });
});
