import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import {
  CATALOG_LIST_EMPTY_TESTID,
  CATALOG_PAGE_PARAM,
  CATALOG_PAGE_SIZE_OPTIONS,
  CATALOG_PAGE_SIZE_PARAM,
  CATALOG_SEARCH_PARAM,
  CATALOG_SKELETON_COLUMN_COUNT,
  CATALOG_SORT_PARAM,
  CATALOG_SORT_SEPARATOR,
  EMPTY_CATALOG_DIRECTORIES,
  EMPTY_CELL,
  UNRESOLVED_CELL,
  buildCatalogColumns,
} from '@/app/(private)/proveedores/[id]/components';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { CatalogLineView, SupplierView } from '@/lib/modules/proveedores';
import type {
  CatalogLineListResult,
  CatalogLineMutationFormState,
  CreateCatalogLineFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type {
  CreateSupplierFormState,
  SupplierMutationFormState,
  SupplierQueryResult,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';
import { PERMISSIONS } from '@/lib/modules/identity';

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
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
  createSupplierActionMock,
  updateSupplierActionMock,
  deleteSupplierActionMock,
  listCatalogLinesActionMock,
  createCatalogLineActionMock,
  updateCatalogLineActionMock,
  deleteCatalogLineActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
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
  createSupplierActionMock:
    vi.fn<(prev: CreateSupplierFormState, data: FormData) => Promise<CreateSupplierFormState>>(),
  updateSupplierActionMock:
    vi.fn<
      (
        id: string,
        prev: SupplierMutationFormState,
        data: FormData,
      ) => Promise<SupplierMutationFormState>
    >(),
  deleteSupplierActionMock:
    vi.fn<(prev: SupplierMutationFormState, data: FormData) => Promise<SupplierMutationFormState>>(),
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

// QC-75 (T6): la pagina exige su permiso con `requirePagePermission`, que resuelve la sesion por
// `@/lib/composition`. Sin este mock la pantalla responderia 404 y este archivo no mediria nada.
// El usuario lleva el CATALOGO ENTERO, derivado de `PERMISSIONS` y nunca escrito a mano: aqui no
// se prueba autorizacion -eso es `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`-, se
// prueba lo que se ve cuando SI se puede ver.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
  createSupplierAction: createSupplierActionMock,
  updateSupplierAction: updateSupplierActionMock,
  deleteSupplierAction: deleteSupplierActionMock,
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

// La pagina de detalle monta la pieza de subida, que importa sus Server Actions por ruta exacta;
// esas acciones resuelven sus puertos por `@/lib/composition`, doblado aqui solo con `identity`.
// Sin estos dos dobles el archivo ni siquiera llega a montar la pantalla.
vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: vi.fn(),
}));

const testId = {
  detalle: 'supplier-detail',
  nombre: 'supplier-detail-name',
  telefono: 'supplier-detail-phone',
  correo: 'supplier-detail-email',
  abrirEdicion: 'supplier-edit-open',
  panel: 'supplier-sheet',
  formulario: 'supplier-form',
  enviar: 'supplier-form-submit',
  abrirBaja: 'supplier-delete-open',
  dialogoBaja: 'delete-supplier-dialog',
  mensajeBaja: 'delete-supplier-message',
  arrastreBaja: 'delete-supplier-cascade',
  cancelarBaja: 'delete-supplier-cancel',
  confirmarBaja: 'delete-supplier-confirm',
  errorBaja: 'delete-supplier-error',
  noEncontrado: 'supplier-not-found',
  enlaceLista: 'supplier-not-found-link',
  lista: 'catalog-list',
  // Desde el 2026-09-07 la tabla, su paginacion y su selector de tamano los pone
  // `components/shared/data-table`. La barra propia de la ruta (`catalog-list-toolbar.tsx`)
  // desaparecio.
  tabla: 'data-table',
  fila: /^data-table-row-/,
  esqueleto: 'catalog-table-skeleton',
  filaEsqueleto: 'catalog-row-skeleton',
  vacio: CATALOG_LIST_EMPTY_TESTID,
  primeraPagina: 'catalog-list-first-page',
  error: 'catalog-list-error',
  errorMensaje: 'catalog-list-error-message',
  errorCodigo: 'catalog-list-error-code',
  reintentar: 'catalog-list-retry',
  tamanoPagina: 'data-table-page-size',
  paginaAnterior: 'data-table-previous',
  paginaSiguiente: 'data-table-next',
  estadoPagina: 'data-table-page-indicator',
  busqueda: 'data-table-search',
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
// QC-39 (T1): el listado devuelve `UnitView`; el fixture se completa con sus tres campos
// nuevos y ningun aserto de este archivo cambia de exigencia.
const UNIDAD = {
  id: 'UNIDAD-ID-NO-VISIBLE',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

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
          // QC-80 (R15): `PresentationView` declara su unidad. Un uuid cualquiera: esta
          // pantalla no la pinta -la unidad de la LINEA de catalogo es propia (R26)-.
          unitId: '11111111-1111-4111-8111-111111111111',
          content: null,
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

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  toastExito = vi.spyOn(toast, 'success');
  getSessionUserMock.mockResolvedValue({
    id: 'u-test-42',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
  usePathnameMock.mockReturnValue(supplierDetailRoute(PROVEEDOR_ID));
  getSupplierActionMock.mockResolvedValue({ status: 'success', data: proveedor() });
  createSupplierActionMock.mockResolvedValue({ status: 'success', id: 'proveedor-creado' });
  updateSupplierActionMock.mockResolvedValue({ status: 'success' });
  deleteSupplierActionMock.mockResolvedValue({ status: 'success' });
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
  toast.dismiss();
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
      sort: null,
      filters: {},
      search: '',
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
    // R46 — ningun componente de cliente pide el catalogo de unidades por su cuenta, y el
    // diccionario de la tabla reutiliza las mismas unidades en vez de volver a pedirlas.
    await renderPantalla();

    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
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
      code: 'supplier_not_found',
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
    const user = setupUser();
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
  it('presenta las ocho columnas de negocio de la linea, mas imagen y acciones', async () => {
    // R21. MIGRADO 2026-09-07: la declaracion es una FACTORIA y los `data-testid` de cabecera y
    // celda los pone la tabla compartida (`data-table-head-<id>` / `data-table-cell-<id>`). Las
    // ocho de negocio siguen siendo las ocho; la imagen y las acciones son columnas de MARCADO.
    await renderPantalla();

    const columnas = buildCatalogColumns({
      directories: EMPTY_CATALOG_DIRECTORIES,
      rowActions: () => null,
    });

    expect(columnas.map((columna) => columna.id)).toEqual([
      'image',
      'name',
      'presentationId',
      'unitId',
      'cost',
      'minPurchase',
      'deliveryTime',
      'createdAt',
      'updatedAt',
      'actions',
    ]);

    for (const columna of columnas) {
      expect(
        screen.getByTestId(`data-table-head-${columna.id}`),
        `falta el encabezado de «${columna.id}»`,
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('data-table-cell-name')).toHaveTextContent(linea().name);

    // El esqueleto pinta tantas celdas como columnas hay: su constante no puede quedarse atras.
    expect(CATALOG_SKELETON_COLUMN_COUNT).toBe(columnas.length);
  });

  it('presenta la presentacion y la unidad por su NOMBRE, no por su identificador', async () => {
    // R22 (primera mitad).
    await renderPantalla();

    expect(screen.getByTestId('data-table-cell-presentationId')).toHaveTextContent(PRESENTACION.name);
    expect(screen.getByTestId('data-table-cell-unitId')).toHaveTextContent(UNIDAD.symbol);
    for (const identificador of [PRESENTACION.id, UNIDAD.id]) {
      expect(document.body.textContent, identificador).not.toContain(identificador);
    }
  });

  it('cuando el nombre no se resuelve pinta el marcador y NUNCA el identificador', async () => {
    // R22 (segunda mitad) — presentacion fuera de la cota del diccionario y unidad que el
    // diccionario no conoce: en los dos casos hay un id que resolver y no se pudo.
    const PRESENTACION_FUERA = 'PRESENTACION-FUERA-DEL-DICCIONARIO';
    const UNIDAD_FUERA = 'UNIDAD-FUERA-DEL-DICCIONARIO';
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ presentationId: PRESENTACION_FUERA, unitId: UNIDAD_FUERA })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('catalog-unresolved-presentationId')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-unresolved-unitId')).toBeInTheDocument();
    for (const identificador of [PRESENTACION_FUERA, UNIDAD_FUERA]) {
      expect(document.body.textContent, identificador).not.toContain(identificador);
    }
  });

  it('una linea SIN unidad se lee distinto de una unidad que no se pudo resolver', async () => {
    // R22 + R40 — la unidad es opcional (QC-52), asi que su ausencia es una eleccion valida del
    // usuario y NO un dato perdido. Las dos celdas se distinguen por testid (R47) y ademas por su
    // glifo, para que la diferencia tambien exista en pantalla.
    expect(UNRESOLVED_CELL).not.toBe(EMPTY_CELL);

    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea({ unitId: null })]));

    await renderPantalla();

    const celda = screen.getByTestId('data-table-cell-unitId');
    expect(celda.textContent).toBe(EMPTY_CELL);
    // Sin unidad NO es «no se pudo resolver»: el marcador de R22 no aparece.
    expect(screen.queryByTestId('catalog-unresolved-unitId')).toBeNull();
  });

  it('los diccionarios se construyen UNA vez por render, nunca por fila', async () => {
    // R22, `design.md > 6.2` — pedir el nombre por fila serian hasta 25 consultas por pagina.
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ id: 'linea-1' }), linea({ id: 'linea-2' }), linea({ id: 'linea-3' })]),
    );

    await renderPantalla();

    expect(screen.getAllByTestId(testId.fila)).toHaveLength(3);
    // Una sola llamada: la de la pagina. El diccionario de unidades de la seccion se construye
    // con esas mismas unidades, sin consulta propia, y no depende del numero de filas.
    expect(listUnitsActionMock).toHaveBeenCalledTimes(1);
    expect(listPresentationsActionMock).toHaveBeenCalledTimes(1);
  });

  it('el costo y el minimo de compra se pintan REDONDEADOS A DOS DECIMALES', async () => {
    // Enmienda del 2026-09-17 a R41 (decision humana): la cadena llega con la escala de la
    // columna y cuatro decimales de relleno no informan de nada. Lo que R41 protege de fondo
    // sigue en pie -sin `Intl.NumberFormat`, sin `toFixed`, sin `parseFloat` y sin coma
    // flotante-: el redondeo es aritmetica exacta de enteros sobre el texto.
    const laLinea = linea({ cost: '1234.5678', minPurchase: '0.1005' });
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([laLinea]));

    await renderPantalla();

    expect(screen.getByTestId('data-table-cell-cost').textContent).toBe('1234.57');
    expect(screen.getByTestId('data-table-cell-minPurchase').textContent).toBe('0.1');
    // 2026-09-18: el minimo de compra se pinta redondeado y ningun otro caso afirmaba su valor
    // exacto, asi que este queda con el patron completo: texto exacto + `title` exacto, igual
    // que el caso vecino de abajo.
    expect(
      screen.getByTestId('data-table-cell-cost').querySelector('span'),
    ).toHaveAttribute('title', '1234.5678');
    expect(
      screen.getByTestId('data-table-cell-minPurchase').querySelector('span'),
    ).toHaveAttribute('title', '0.1005');
  });

  it('el redondeo de la celda no esconde la cifra: el valor exacto viaja en el `title`', async () => {
    // El redondeo es del PIXEL, no del dato. Cuando cambia lo que se ve, la celda lleva el valor
    // exacto a un hover de distancia; cuando no lo cambia, no ensucia el DOM con un `title` que
    // repite lo que ya se lee.
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ cost: '1234.5678', minPurchase: '25.0000' })]),
    );

    await renderPantalla();

    expect(
      screen.getByTestId('data-table-cell-cost').querySelector('span'),
    ).toHaveAttribute('title', '1234.5678');
    // «25.0000» se pinta «25» y eso es el mismo numero: no hay nada que guardar en un `title`.
    expect(screen.getByTestId('data-table-cell-minPurchase').textContent).toBe('25');
    expect(
      screen.getByTestId('data-table-cell-minPurchase').querySelector('span'),
    ).not.toHaveAttribute('title');
  });

  it('un minimo y un tiempo de entrega ausentes pintan la marca de «sin dato»', async () => {
    // R21 — los dos son opcionales en el contrato (QC-52).
    listCatalogLinesActionMock.mockResolvedValue(
      paginaDeLineas([linea({ minPurchase: null, deliveryTime: null })]),
    );

    await renderPantalla();

    expect(screen.getByTestId('data-table-cell-minPurchase').textContent).toBe(EMPTY_CELL);
    expect(screen.getByTestId('data-table-cell-deliveryTime').textContent).toBe(EMPTY_CELL);
  });

  it('la tabla no muestra identificadores ni autoria de la linea', async () => {
    // R12 — en negativo: son campos que la vista trae y que la decision humana deja fuera.
    //
    // ENMIENDA A R30 (2026-09-07): la imagen SI se muestra, en la primera columna, asi que
    // `imagePath` sale de esta lista de prohibidos y tiene su propio caso justo debajo. Lo que
    // R30 sigue prohibiendo -que el formulario pida o suba imagen- no lo toca este caso.
    await renderPantalla();

    const columnas = buildCatalogColumns({
      directories: EMPTY_CATALOG_DIRECTORIES,
      rowActions: () => null,
    });
    // `imagePath` entra en la lista: la imagen SE VE, pero su columna se llama `image` y pinta una
    // miniatura. La RUTA no es una columna.
    for (const clave of ['createdBy', 'updatedBy', 'id', 'supplierId', 'imagePath']) {
      expect(
        columnas.some((columna) => String(columna.id) === clave),
        `«${clave}» no puede ser una columna`,
      ).toBe(false);
    }

    for (const prohibido of [
      LINEA_ID_QUE_NO_DEBE_VERSE,
      AUTOR_QUE_NO_DEBE_VERSE,
      EDITOR_QUE_NO_DEBE_VERSE,
    ]) {
      expect(document.body.textContent, prohibido).not.toContain(prohibido);
    }
  });

  it('la primera columna es la imagen de la linea, y la RUTA no se pinta como texto', async () => {
    // Enmienda a R30 del 2026-09-07. Se afirma sobre la miniatura -no sobre la lista de
    // columnas- porque la imagen es marcado y por eso la declara la tabla, no `CATALOG_COLUMNS`.
    await renderPantalla();

    const tabla = within(screen.getByTestId(testId.tabla));
    const miniatura = tabla.getAllByTestId('catalog-image')[0] as HTMLImageElement;

    // La ruta de la fixture NO resuelve, asi que arranca en marcador; lo que nunca puede pasar
    // es que la ruta se lea como texto en la celda.
    expect(miniatura).toBeInTheDocument();
    expect(miniatura).toHaveAttribute('src', IMAGEN_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent, IMAGEN_QUE_NO_DEBE_VERSE).not.toContain(
      IMAGEN_QUE_NO_DEBE_VERSE,
    );

    // Y la columna de imagen es la PRIMERA de la cabecera.
    const cabeceras = tabla.getAllByRole('columnheader');
    expect(cabeceras[0]).toHaveAttribute('data-testid', 'data-table-head-image');
  });

  it('sin ruta de imagen, la miniatura cae al marcador de `public/`', async () => {
    // El caso NORMAL hoy: nadie llena `image_path`, asi que todas las filas ensennan el marcador.
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea({ imagePath: null })]));

    await renderPantalla();

    const miniatura = within(screen.getByTestId(testId.tabla)).getAllByTestId(
      'catalog-image',
    )[0] as HTMLImageElement;

    expect(miniatura).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(miniatura).toHaveAttribute('data-missing', 'true');
  });
});

describe('catalogo — paginacion, orden y viewport (R8, R9, R11, R13, R48)', () => {
  it('ofrece exactamente dos tamanos de pagina y cambiarlos navega a la primera', async () => {
    // R8 — el defecto se observa en lo que se le PIDE al backend; las dos opciones, en el selector.
    const user = setupUser();
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea()], { total: 40 }));

    await renderPantalla();

    expect(listCatalogLinesActionMock).toHaveBeenCalledWith(PROVEEDOR_ID, {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(CATALOG_PAGE_SIZE_OPTIONS.length);

    await user.click(screen.getByTestId(`data-table-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(CATALOG_PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(CATALOG_PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    // R9
    const user = setupUser();
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

  it('el catalogo SI ofrece busqueda y orden, y ninguno se resuelve en el cliente', async () => {
    // ENMIENDA A R11 (2026-09-07, decision humana). R11 decia «ni busqueda ni orden» y su test lo
    // afirmaba en negativo. Las dos cosas existen ahora, y la razon es que el BACKEND las
    // soporta: `SUPPLIER_CATALOG_LINE_QUERYABLE` declara `searchable: true` y cinco campos
    // ordenables, y `listCatalogLines` los resuelve desde QC-57.
    //
    // Lo que R11 protegia de verdad -que no se busque ni se ordene DENTRO de la pagina ya
    // descargada- sigue afirmado, y por la via mas dura: cada gesto NAVEGA y la lista se vuelve a
    // pedir al servidor.
    const user = setupUser();
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([linea()], { total: 40 }));

    await renderPantalla();

    // 1. Buscar: el termino viaja en la URL y la pagina vuelve a la primera.
    await user.type(screen.getByTestId(testId.busqueda), 'tambor');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const conBusqueda = new URLSearchParams(
      String(routerMock.push.mock.calls.at(-1)?.[0]).split('?')[1],
    );
    expect(conBusqueda.get(CATALOG_SEARCH_PARAM)).toBe('tambor');
    expect(conBusqueda.get(CATALOG_PAGE_PARAM)).toBe('1');

    // 2. Ordenar por una columna que la lista blanca declara: tambien navega.
    routerMock.push.mockClear();
    await user.click(screen.getByTestId('data-table-header-menu-cost'));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-sort-desc-cost')));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const conOrden = new URLSearchParams(
      String(routerMock.push.mock.calls.at(-1)?.[0]).split('?')[1],
    );
    expect(conOrden.get(CATALOG_SORT_PARAM)).toBe(`cost${CATALOG_SORT_SEPARATOR}desc`);

    // 3. Y la pantalla NO reordena ni recorta lo que ya tiene: sigue habiendo una sola fila, la
    //    que devolvio la consulta.
    expect(screen.getAllByTestId(testId.fila)).toHaveLength(1);
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

/** QC-71 T9 — R17 y R18 en el estado de error del catalogo del proveedor. */
describe('catalogo del proveedor — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listCatalogLinesActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const region = await screen.findByTestId(testId.error);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listCatalogLinesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeNull();
    expect(screen.queryByText(REFERENCIA_DEL_CASO)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
  });
});

describe('pagina de detalle — editar y dar de baja en la cabecera (R38)', () => {
  it('la cabecera monta los controles de editar y de dar de baja', async () => {
    await renderPantalla();

    expect(screen.getByTestId(testId.abrirEdicion)).toBeInTheDocument();
    expect(screen.getByTestId(testId.abrirBaja)).toBeInTheDocument();
  });

  it('el nombre del proveedor puede encoger y partirse: no fuerza el ancho de su fila (R38)', async () => {
    // Un nombre sin espacios es una unica palabra larga. Dentro de un contenedor flex, un hijo
    // NO encoge por debajo de su ancho intrinseco salvo que declare como hacerlo: sin eso, el
    // nombre desborda la fila horizontalmente y arrastra consigo el ancho de toda la pagina, lo
    // que en un navegador movil hace que el panel lateral -fijo, calculado sobre ese ancho
    // inflado- termine mas alto que la pantalla y su boton de guardar quede fuera de ella.
    //
    // Anti-placebo: sin `min-w-0` (o equivalente) este assert falla porque la clase que permite
    // encoger no esta, y con solo `break-words` sin `min-w-0` seguiria sin encoger por debajo del
    // ancho intrinseco de la palabra sin romper.
    getSupplierActionMock.mockResolvedValue({
      status: 'success',
      data: proveedor({ name: 'unnombredeproveedorsinespaciosdeliberadamentemuylargoparaforzareldesborde' }),
    });

    await renderPantalla();

    const nombre = screen.getByTestId(testId.nombre);
    expect(nombre.className).toContain('min-w-0');
    expect(nombre.className).toMatch(/break-words|break-all|truncate/);
  });

  it('editar con exito cierra el panel, avisa por toast y refresca el detalle con los datos nuevos', async () => {
    const user = setupUser();
    const original = proveedor({ name: 'Químicos del Norte' });
    const actualizado = proveedor({ name: 'Químicos del Norte Renovado' });
    getSupplierActionMock.mockResolvedValue({ status: 'success', data: original });

    const pantalla = await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    await user.clear(screen.getByTestId('supplier-field-name'));
    await user.type(screen.getByTestId('supplier-field-name'), actualizado.name);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateSupplierActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);

    // `router.refresh()` vuelve a ejecutar la pagina en el servidor: se simula pintando de nuevo
    // el arbol con lo que la ficha devuelve ahora.
    getSupplierActionMock.mockResolvedValue({ status: 'success', data: actualizado });
    pantalla.rerender(await resolverServerComponents(await arbolDeLaPantalla()));

    expect(screen.getByTestId(testId.nombre)).toHaveTextContent(actualizado.name);
  });

  it('la baja con exito cierra el dialogo, avisa por toast y navega a la vista de proveedores', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    await waitFor(() => expect(deleteSupplierActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBaja)).toBeNull());

    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith(SUPPLIERS_ROUTE);
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('el catalogo sigue igual: la baja no lo pide de nuevo ni cambia su estado', async () => {
    const user = setupUser();

    await renderPantalla();
    await waitFor(() => expect(listCatalogLinesActionMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    await waitFor(() => expect(deleteSupplierActionMock).toHaveBeenCalledTimes(1));

    expect(listCatalogLinesActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
  });
});

describe('DeleteSupplierDialog — baja con aviso de arrastre (R35, R47)', () => {
  it('sin confirmar no invoca la operacion de baja, y el dialogo nombra al proveedor y avisa del arrastre', async () => {
    // El doble FALLA si se le llama: no basta con no haberlo visto llamado, se comprueba que
    // ninguna via lo dispara.
    const user = setupUser();
    const elProveedor = proveedor({ name: 'Reactivos del Golfo' });
    getSupplierActionMock.mockResolvedValue({ status: 'success', data: elProveedor });
    deleteSupplierActionMock.mockImplementation(() => {
      throw new Error('la baja no puede invocarse sin confirmacion');
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));

    const dialogo = await screen.findByTestId(testId.dialogoBaja);
    expect(within(dialogo).getByTestId(testId.mensajeBaja)).toHaveTextContent(elProveedor.name);
    expect(within(dialogo).getByTestId(testId.arrastreBaja)).toBeInTheDocument();
    expect(deleteSupplierActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(testId.cancelarBaja));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBaja)).toBeNull());
    expect(deleteSupplierActionMock).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('una baja rechazada mantiene el dialogo abierto con el mensaje a la vista', async () => {
    const user = setupUser();
    deleteSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    await waitFor(() => expect(deleteSupplierActionMock).toHaveBeenCalledTimes(1));

    const error = await screen.findByTestId(testId.errorBaja);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.getByTestId(testId.dialogoBaja)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('el dialogo de baja ensena el identificador del error inesperado', async () => {
    const user = setupUser();
    deleteSupplierActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    const region = await screen.findByTestId(testId.errorBaja);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('el dialogo de baja con un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    const region = await screen.findByTestId(testId.errorBaja);
    expect(region).toHaveTextContent('No autorizado.');
    esperarSinIdentificador();
  });
});
