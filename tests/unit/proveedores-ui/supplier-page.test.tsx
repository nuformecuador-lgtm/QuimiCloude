import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  Suspense,
  cloneElement,
  isValidElement,
  use,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import ProveedoresPage from '@/app/(private)/proveedores/page';
import {
  ACTIONS_COLUMN_ID,
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  SUPPLIER_DEFAULT_PINNED_COLUMNS,
  SUPPLIER_SKELETON_COLUMN_COUNT,
  buildSupplierColumns,
  parseSupplierListParams,
} from '@/app/(private)/proveedores/components';
import { SEARCH_DEBOUNCE_MS, type SortDirection } from '@/components/shared/data-table';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import {
  SUPPLIER_QUERYABLE,
  createSupplierSchema,
  type SupplierView,
} from '@/lib/modules/proveedores';
import type {
  CreateSupplierFormState,
  SupplierListResult,
  SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { SUPPLIERS_ROUTE, supplierDetailRoute } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * Pantalla de la lista de proveedores, montada dentro del armazon privado con el arbol real de
 * `page.tsx`.
 *
 * `listSuppliersAction` esta mockeada: es el borde del modulo, y sustituirla es lo unico que
 * permite ejercitar los estados de la lista sin base de datos.
 *
 * Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas. El texto que aparece es
 * dato del fixture, no copy de la pantalla.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-44',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  // Catalogo entero de permisos: este archivo mide lo que se ve cuando SI se puede ver.
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const {
  usePathnameMock,
  redirectMock,
  routerMock,
  logoutActionMock,
  cookiesMock,
  getSessionUserMock,
  listSuppliersActionMock,
  createSupplierActionMock,
  updateSupplierActionMock,
  deleteSupplierActionMock,
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
  listSuppliersActionMock: vi.fn<(query: unknown) => Promise<SupplierListResult>>(),
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

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  listSuppliersAction: listSuppliersActionMock,
  createSupplierAction: createSupplierActionMock,
  updateSupplierAction: updateSupplierActionMock,
  deleteSupplierAction: deleteSupplierActionMock,
}));

const PREFIJO_FILA = 'data-table-row-';

const testId = {
  content: 'private-content',
  titulo: 'proveedores-title',
  lista: 'supplier-list',
  tabla: 'supplier-table',
  tablaCompartida: 'data-table',
  fila: new RegExp(`^${PREFIJO_FILA}`),
  enlaceDetalle: 'supplier-detail-link',
  esqueleto: 'supplier-table-skeleton',
  filaEsqueleto: 'supplier-row-skeleton',
  vacio: 'supplier-list-empty',
  primeraPagina: 'supplier-list-first-page',
  sinResultados: 'supplier-list-no-results',
  limpiarBusqueda: 'supplier-list-clear-search',
  sinResultadosPrimeraPagina: 'supplier-list-no-results-first-page',
  vacioDeLaTabla: 'data-table-empty',
  error: 'supplier-list-error',
  errorMensaje: 'supplier-list-error-message',
  errorCodigo: 'supplier-list-error-code',
  reintentar: 'supplier-list-retry',
  busqueda: 'data-table-search',
  filtroFecha: `data-table-filter-date-${CREATED_AT_COLUMN_ID}`,
  limpiarFiltroFecha: `data-table-filter-clear-${CREATED_AT_COLUMN_ID}`,
  atajoUltimaSemana: 'data-table-date-last-week',
  paginacion: 'data-table-pagination',
  tamanoPagina: 'data-table-page-size',
  paginaAnterior: 'data-table-previous',
  paginaSiguiente: 'data-table-next',
  estadoPagina: 'data-table-page-indicator',
  abrirAlta: 'supplier-create-open',
  abrirEdicion: 'supplier-edit-open',
  panel: 'supplier-sheet',
  formulario: 'supplier-form',
  enviar: 'supplier-form-submit',
  cancelarFormulario: 'supplier-form-cancel',
  errorFormulario: 'supplier-form-error',
  abrirBaja: 'supplier-delete-open',
  dialogoBaja: 'delete-supplier-dialog',
  mensajeBaja: 'delete-supplier-message',
  arrastreBaja: 'delete-supplier-cascade',
  cancelarBaja: 'delete-supplier-cancel',
  confirmarBaja: 'delete-supplier-confirm',
} as const;

const COLUMNAS = buildSupplierColumns({ rowActions: () => null });

const COLUMNAS_SIN_ORDEN = ['phone', 'email', ACTIONS_COLUMN_ID] as const;

// Valores distintos de los del fixture de lista, para que un assert sobre lo enviado no pase por
// casualidad. Lleva telefono y correo porque el esquema exige al menos uno de los dos.
const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido Cítrico del Bajío',
  phone: '+52 33 9876 5432',
  email: 'compras@acidocitrico.example',
};

/** Rellena el formulario abierto. Vacia primero: el panel puede venir precargado (edicion). */
async function rellenarFormulario(
  user: ReturnType<typeof setupUser>,
  valores: Readonly<Record<string, string>> = {},
) {
  const datos = { ...ALTA_VALIDA, ...valores };
  for (const [campo, valor] of Object.entries(datos)) {
    const control = screen.getByTestId(`supplier-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
}

// Cadenas inconfundibles: con un valor realista, «no se muestra» y «se muestra pero parece otra
// cosa» serian indistinguibles al buscar su ausencia en el documento.
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';
const NORMALIZADO_QUE_NO_DEBE_VERSE = 'NOMBRE-NORMALIZADO-NO-VISIBLE';

function proveedor(overrides: Partial<SupplierView> = {}): SupplierView {
  const name = overrides.name ?? 'Químicos del Norte';
  return {
    id: crypto.randomUUID(),
    name,
    nameNormalized: name.toLowerCase(),
    phone: '+52 55 1234 5678',
    email: 'ventas@quimicosdelnorte.example',
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

function paginaDeProveedores(
  items: readonly SupplierView[],
  extra: { page?: number; pageSize?: number; total?: number; totalPages?: number } = {},
): SupplierListResult {
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

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente:
 * `react-dom` en jsdom no ejecuta un componente `async` y se queda suspendido para siempre. La
 * `<Suspense>` y su `fallback` siguen siendo los que declara la pagina.
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

  // Hijos sueltos y no un array: un array como tercer argumento de `cloneElement` exige `key` en
  // cada elemento aunque en el JSX original fueran hijos estaticos.
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo async. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return ProveedoresPage({ searchParams: Promise.resolve(searchParams) });
}

/** La pantalla dentro del layout privado, con la lista ya resuelta. */
async function pantallaMontada(searchParams: Consulta = {}) {
  const arbol = await resolverServerComponents(await arbolDeLaPantalla(searchParams));
  return PrivateLayout({ children: arbol });
}

async function renderPantalla(searchParams: Consulta = {}) {
  return render(await pantallaMontada(searchParams));
}

/** Monta la pantalla con la lista aun en vuelo: `<Suspense>` pinta su `fallback`. */
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await PrivateLayout({ children: await arbolDeLaPantalla(searchParams) }));
}

// El `router.push` simulado termina al instante y la transicion no llegaria a verse en vuelo.
// Suspender una actualizacion dentro de esa misma transicion la retiene, como una navegacion que
// aun no ha recibido la pagina nueva.
const NAVEGACION_QUE_NO_TERMINA = new Promise<never>(() => {});
let retenerNavegacion: (() => void) | null = null;

function NavegacionEnVuelo() {
  const [enVuelo, setEnVuelo] = useState(false);

  useEffect(() => {
    retenerNavegacion = () => setEnVuelo(true);
    return () => {
      retenerNavegacion = null;
    };
  }, []);

  if (enVuelo) use(NAVEGACION_QUE_NO_TERMINA);
  return null;
}

function orden(columnId: string, direction: SortDirection): string {
  return `${columnId}${SORT_SEPARATOR}${direction}`;
}

function consultaDe(href: string | null | undefined): URLSearchParams {
  return new URLSearchParams(String(href).split('?')[1]);
}

function paramsDe(href: string | null | undefined) {
  return parseSupplierListParams(Object.fromEntries(consultaDe(href)));
}

function ultimoDestino(): URLSearchParams {
  const llamada = routerMock.push.mock.calls.at(-1);
  if (llamada === undefined) throw new Error('la pantalla no navego');
  return consultaDe(llamada[0]);
}

const FORMATO_DE_DIA = /^\d{4}-\d{2}-\d{2}$/;

// Sin rango vigente el calendario abre en el mes en curso.
function diaDelMesEnCurso(dia: number): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${String(dia).padStart(2, '0')}`;
}

// Por el `data-day` ISO de la celda: la etiqueta del boton depende del idioma.
async function botonDelDia(iso: string): Promise<HTMLElement> {
  const celda = (await screen.findAllByRole('gridcell')).find(
    (candidata) => candidata.getAttribute('data-day') === iso,
  );
  if (celda === undefined) throw new Error(`el calendario no muestra el dia ${iso}`);
  return esperarInteractiva(within(celda).getByRole('button'));
}

function filaDe(id: string): string {
  return `${PREFIJO_FILA}${id}`;
}

function idsDeLasFilas(): string[] {
  return screen
    .queryAllByTestId(testId.fila)
    .map((fila) => String(fila.getAttribute('data-testid')).slice(PREFIJO_FILA.length));
}

function cabecera(columnId: string): HTMLElement {
  return screen.getByTestId(`data-table-head-${columnId}`);
}

/** Botones de la cabecera que no son el disparador de su menu: el de orden, si existe. */
function botonesDeOrden(columnId: string): HTMLElement[] {
  return within(cabecera(columnId))
    .queryAllByRole('button')
    .filter((boton) => boton.getAttribute('data-testid') !== `data-table-header-menu-${columnId}`);
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(SUPPLIERS_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([proveedor()]));
  createSupplierActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateSupplierActionMock.mockResolvedValue({ status: 'success' });
  deleteSupplierActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
  resetViewport();
  clearSidebarStateCookie();
});

describe('pantalla de proveedores — lista sobre la tabla compartida', () => {
  it('R1: se renderiza dentro del armazon privado con la tabla compartida, sin tabla ni paginacion propias', async () => {
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));

    const compartida = within(screen.getByTestId(testId.lista)).getByTestId(testId.tablaCompartida);
    expect(armazon).toContainElement(compartida);

    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(compartida).toContainElement(screen.getByRole('table'));
    expect(screen.getAllByTestId(testId.paginacion)).toHaveLength(1);
    expect(compartida).toContainElement(screen.getByTestId(testId.paginacion));
  });

  it('R2, R18: presenta exactamente nombre, telefono, correo, creado, actualizado y acciones, y el esqueleto cuenta las mismas', async () => {
    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();

    const ids = COLUMNAS.map((columna) => columna.id);
    expect(ids).toEqual(['name', 'phone', 'email', 'createdAt', 'updatedAt', ACTIONS_COLUMN_ID]);

    const fila = within(screen.getByTestId(filaDe(elProveedor.id)));
    for (const id of ids) {
      expect(cabecera(id), `falta el encabezado de «${id}»`).toBeInTheDocument();
      expect(fila.getByTestId(`data-table-cell-${id}`), `falta la celda de «${id}»`).toBeInTheDocument();
    }
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(ids.length);

    expect(fila.getByTestId('data-table-cell-name')).toHaveTextContent(elProveedor.name);
    expect(fila.getByTestId('data-table-cell-phone')).toHaveTextContent(String(elProveedor.phone));
    expect(fila.getByTestId('data-table-cell-email')).toHaveTextContent(String(elProveedor.email));

    expect(SUPPLIER_SKELETON_COLUMN_COUNT).toBe(COLUMNAS.length);
  });

  it('R3: no muestra el id tecnico, el nombre normalizado ni los ids de autoria', async () => {
    const elProveedor = proveedor({ nameNormalized: NORMALIZADO_QUE_NO_DEBE_VERSE });
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();

    const texto = document.body.textContent;
    for (const oculto of [
      elProveedor.id,
      NORMALIZADO_QUE_NO_DEBE_VERSE,
      AUTOR_QUE_NO_DEBE_VERSE,
      EDITOR_QUE_NO_DEBE_VERSE,
    ]) {
      expect(texto, `«${oculto}» no debe llegar al documento`).not.toContain(oculto);
    }

    for (const prohibida of ['id', 'nameNormalized', 'createdBy', 'updatedBy']) {
      expect(
        COLUMNAS.some((columna) => String(columna.id) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`data-table-head-${prohibida}`)).toBeNull();
      expect(screen.queryByTestId(`data-table-cell-${prohibida}`)).toBeNull();
    }
  });

  it('R4: cada fila enlaza al detalle de su proveedor con la ruta del helper', async () => {
    const proveedores = [proveedor({ name: 'Químicos del Sur' }), proveedor({ name: 'Solventes Pacífico' })];
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores(proveedores));

    await renderPantalla();

    for (const elProveedor of proveedores) {
      const enlace = within(screen.getByTestId(filaDe(elProveedor.id))).getByTestId(
        testId.enlaceDetalle,
      );
      expect(enlace.tagName).toBe('A');
      expect(enlace).toHaveAttribute('href', supplierDetailRoute(elProveedor.id));
    }
  });

  it('R6, R7, R10: ofrece busqueda y orden por cabecera en nombre y fechas, y pinta las filas del simulador en su orden', async () => {
    const user = setupUser();
    const filas = [
      proveedor({ name: 'Zeta Química' }),
      proveedor({ name: 'Alfa Reactivos' }),
      proveedor({ name: 'Mu Solventes' }),
    ];
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores(filas));

    await renderPantalla();

    const busquedas = screen.getAllByRole('searchbox');
    expect(busquedas).toHaveLength(1);
    expect(busquedas[0]).toBe(screen.getByTestId(testId.busqueda));

    for (const id of SUPPLIER_QUERYABLE.sortable) {
      expect(cabecera(id), id).toHaveAttribute('aria-sort', 'none');
      expect(botonesDeOrden(id), id).toHaveLength(1);
    }
    for (const id of COLUMNAS_SIN_ORDEN) {
      expect(cabecera(id), id).not.toHaveAttribute('aria-sort');
      expect(botonesDeOrden(id), id).toHaveLength(0);
    }

    for (const id of SUPPLIER_QUERYABLE.sortable) {
      await user.click(botonesDeOrden(id)[0]);
      expect(ultimoDestino().get(SORT_PARAM), id).toBe(orden(id, 'asc'));
    }
    expect(routerMock.push).toHaveBeenCalledTimes(SUPPLIER_QUERYABLE.sortable.length);

    expect(idsDeLasFilas()).toEqual(filas.map((fila) => fila.id));
    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);
  });

  it('R6: el orden de la URL llega a la accion y a aria-sort, y el menu de la cabecera navega con el orden elegido', async () => {
    const user = setupUser();

    await renderPantalla({ [SORT_PARAM]: orden('createdAt', 'desc') });

    expect(listSuppliersActionMock).toHaveBeenCalledWith({
      page: FIRST_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: { columnId: 'createdAt', direction: 'desc' },
      filters: {},
      search: '',
    });
    expect(cabecera('createdAt')).toHaveAttribute('aria-sort', 'descending');
    expect(cabecera('name')).toHaveAttribute('aria-sort', 'none');
    expect(cabecera('updatedAt')).toHaveAttribute('aria-sort', 'none');

    await user.click(botonesDeOrden('createdAt')[0]);
    expect(ultimoDestino().get(SORT_PARAM)).toBe(orden('createdAt', 'asc'));

    await user.click(screen.getByTestId('data-table-header-menu-name'));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-sort-desc-name')));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(2));
    expect(ultimoDestino().get(SORT_PARAM)).toBe(orden('name', 'desc'));
  });

  it('R7: telefono, correo y acciones no ofrecen orden ni en la cabecera ni en su menu', async () => {
    const user = setupUser();
    expect(
      COLUMNAS.filter((columna) => columna.sortable === true).map((columna) => columna.id),
    ).toEqual([...SUPPLIER_QUERYABLE.sortable]);

    await renderPantalla();

    for (const id of ['phone', 'email']) {
      await user.click(screen.getByTestId(`data-table-header-menu-${id}`));
      const menu = await screen.findByTestId(`data-table-header-menu-content-${id}`);

      // El fijado si esta: prueba que el menu se abrio y que la ausencia del orden es real.
      expect(await esperarInteractiva(within(menu).getByTestId(`data-table-pin-${id}`))).toBeVisible();
      expect(within(menu).queryByTestId(`data-table-sort-asc-${id}`)).toBeNull();
      expect(within(menu).queryByTestId(`data-table-sort-desc-${id}`)).toBeNull();

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByTestId(`data-table-header-menu-content-${id}`)).toBeNull(),
      );
    }

    expect(screen.queryByTestId(`data-table-header-menu-${ACTIONS_COLUMN_ID}`)).toBeNull();
    expect(within(cabecera(ACTIONS_COLUMN_ID)).queryAllByRole('button')).toHaveLength(0);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('R7, R11: cada columna ordena y filtra exactamente lo que declara la lista blanca, y nada de la lista blanca queda sin columna', () => {
    const columnas = buildSupplierColumns({ rowActions: () => null });
    const ids: readonly string[] = columnas.map((columna) => columna.id);

    for (const columna of columnas) {
      expect(Boolean(columna.sortable), `orden de «${columna.id}»`).toBe(
        SUPPLIER_QUERYABLE.sortable.includes(columna.id),
      );

      const declarado = Object.hasOwn(SUPPLIER_QUERYABLE.filterable, columna.id)
        ? SUPPLIER_QUERYABLE.filterable[columna.id]
        : undefined;
      expect(columna.filter?.kind, `filtro de «${columna.id}»`).toBe(declarado);
    }

    for (const campo of SUPPLIER_QUERYABLE.sortable) {
      expect(ids, `«${campo}» ordena en el servidor y no tiene columna`).toContain(campo);
    }
    for (const campo of Object.keys(SUPPLIER_QUERYABLE.filterable)) {
      expect(ids, `«${campo}» filtra en el servidor y no tiene columna`).toContain(campo);
    }
  });

  it('R8:la busqueda navega con el termino al cumplirse SEARCH_DEBOUNCE_MS, y vaciarla navega sin termino', async () => {
    await renderPantalla();
    vi.useFakeTimers();

    const busqueda = screen.getByTestId(testId.busqueda);
    fireEvent.change(busqueda, { target: { value: 'norte' } });

    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    expect(routerMock.push).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(ultimoDestino().get(SEARCH_PARAM)).toBe('norte');

    fireEvent.change(busqueda, { target: { value: '' } });
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    expect(routerMock.push).toHaveBeenCalledTimes(2);
    expect(ultimoDestino().has(SEARCH_PARAM)).toBe(false);
    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);
  });

  it('R9: el atajo de fecha navega con el rango de creacion, limpiarlo navega sin rango, y ninguna otra columna filtra', async () => {
    const user = setupUser();
    expect(
      COLUMNAS.filter((columna) => columna.filter !== undefined).map((columna) => columna.id),
    ).toEqual([CREATED_AT_COLUMN_ID]);

    await renderPantalla({ [CREATED_FROM_PARAM]: '2026-01-01', [CREATED_TO_PARAM]: '2026-01-31' });

    expect(listSuppliersActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' } },
      }),
    );
    expect(screen.getAllByTestId(/^data-table-filter-date-/)).toEqual([
      screen.getByTestId(testId.filtroFecha),
    ]);
    expect(screen.getAllByTestId(/^data-table-filter-clear-/)).toEqual([
      screen.getByTestId(testId.limpiarFiltroFecha),
    ]);

    await user.click(screen.getByTestId(testId.filtroFecha));
    await user.click(await esperarInteractiva(await screen.findByTestId(testId.atajoUltimaSemana)));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const conRango = ultimoDestino();
    const desde = conRango.get(CREATED_FROM_PARAM);
    const hasta = conRango.get(CREATED_TO_PARAM);
    expect(parseSupplierListParams(Object.fromEntries(conRango)).filters).toEqual({
      [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: desde, to: hasta },
    });
    expect(String(desde) < String(hasta)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId(testId.atajoUltimaSemana)).toBeNull());

    await user.click(screen.getByTestId(testId.limpiarFiltroFecha));
    expect(routerMock.push).toHaveBeenCalledTimes(2);
    expect(ultimoDestino().has(CREATED_FROM_PARAM)).toBe(false);
    expect(ultimoDestino().has(CREATED_TO_PARAM)).toBe(false);
  });

  it('R9: elegir a mano en el calendario un dia de inicio y otro de fin navega con ese rango en YYYY-MM-DD', async () => {
    const user = setupUser();
    const inicio = diaDelMesEnCurso(10);
    const fin = diaDelMesEnCurso(20);

    const { rerender } = render(await pantallaMontada());

    await user.click(screen.getByTestId(testId.filtroFecha));
    await user.click(await botonDelDia(inicio));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().get(CREATED_FROM_PARAM)).toBe(inicio);

    // El calendario es controlado por la URL: sin volver a pintar con ella no recordaria el inicio.
    rerender(await pantallaMontada(Object.fromEntries(ultimoDestino())));

    await user.click(await botonDelDia(fin));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(2));

    const destino = ultimoDestino();
    expect(destino.get(CREATED_FROM_PARAM)).toMatch(FORMATO_DE_DIA);
    expect(destino.get(CREATED_TO_PARAM)).toMatch(FORMATO_DE_DIA);
    expect(parseSupplierListParams(Object.fromEntries(destino)).filters).toEqual({
      [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: inicio, to: fin },
    });
  });

  it('R10: pinta las filas tal cual llegan aunque la URL pida otro orden y un termino que no coincide', async () => {
    const user = setupUser();
    const filas = [
      proveedor({ name: 'Mu Solventes' }),
      proveedor({ name: 'Zeta Química' }),
      proveedor({ name: 'Alfa Reactivos' }),
    ];
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores(filas));

    await renderPantalla({ [SORT_PARAM]: orden('name', 'asc'), [SEARCH_PARAM]: 'sin-coincidencias' });

    expect(idsDeLasFilas()).toEqual(filas.map((fila) => fila.id));

    await user.click(botonesDeOrden('name')[0]);
    expect(ultimoDestino().get(SORT_PARAM)).toBe(orden('name', 'desc'));
    expect(idsDeLasFilas()).toEqual(filas.map((fila) => fila.id));
  });

  it('R14: con la navegacion en vuelo la tabla se marca aria-busy y la busqueda conserva el foco y el texto', async () => {
    const user = setupUser();
    render(
      <>
        {await pantallaMontada()}
        <Suspense fallback={null}>
          <NavegacionEnVuelo />
        </Suspense>
      </>,
    );
    routerMock.push.mockImplementationOnce(() => retenerNavegacion?.());

    expect(screen.getByTestId(testId.tabla)).toHaveAttribute('aria-busy', 'false');

    const busqueda = screen.getByTestId(testId.busqueda);
    await user.type(busqueda, 'norte');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId(testId.tabla)).toHaveAttribute('aria-busy', 'true'));

    expect(screen.getByTestId(testId.busqueda)).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('norte');
  });

  it('R21: la columna de acciones no se puede fijar y sus controles se ven sin puntero, con area tactil de 44x44', async () => {
    expect(COLUMNAS.find((columna) => columna.id === ACTIONS_COLUMN_ID)?.pinnable).toBe(false);
    for (const columna of COLUMNAS.filter((c) => c.id !== ACTIONS_COLUMN_ID)) {
      expect(columna.pinnable, columna.id).not.toBe(false);
    }

    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));
    await renderPantalla();

    expect(screen.queryByTestId(`data-table-header-menu-${ACTIONS_COLUMN_ID}`)).toBeNull();
    expect(screen.queryByTestId(`data-table-pin-${ACTIONS_COLUMN_ID}`)).toBeNull();

    const celda = within(screen.getByTestId(filaDe(elProveedor.id))).getByTestId(
      `data-table-cell-${ACTIONS_COLUMN_ID}`,
    );
    for (const accion of [testId.abrirEdicion, testId.abrirBaja]) {
      const control = within(celda).getByTestId(accion);
      expect(control, accion).toBeVisible();
      expect(control.className, accion).toContain('min-h-11');
      expect(control.className, accion).toContain('min-w-11');
      expect(control.className, accion).not.toContain('hidden');
    }
  });

  it('R24: la columna fijada por defecto es el nombre', async () => {
    expect(SUPPLIER_DEFAULT_PINNED_COLUMNS).toEqual(['name']);

    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));
    await renderPantalla();

    await waitFor(() => expect(cabecera('name')).toHaveAttribute('data-pinned', 'left'));
    const fila = within(screen.getByTestId(filaDe(elProveedor.id)));
    expect(fila.getByTestId('data-table-cell-name')).toHaveAttribute('data-pinned', 'left');
    for (const id of COLUMNAS.map((columna) => columna.id).filter((id) => id !== 'name')) {
      expect(cabecera(id), id).not.toHaveAttribute('data-pinned');
    }
  });

  it('R24: el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro', async () => {
    await renderPantalla();

    const tabla = within(screen.getByTestId(testId.tabla)).getByRole('table');
    const envoltorio = tabla.closest('[data-slot="table-container"]');

    expect(envoltorio).not.toBeNull();
    expect((envoltorio as HTMLElement).className).toContain('overflow-x-auto');

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
  });

  it('R21, R24: orden, busqueda, filtro, paginacion y acciones se ven y se alcanzan en viewport angosto y en ancho', async () => {
    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.filtroFecha), `filtro a ${ancho}px`).toBeVisible();

      const busqueda = screen.getByTestId(testId.busqueda);
      expect(busqueda, `busqueda a ${ancho}px`).toBeVisible();
      // Por debajo de 16 px Safari en iOS hace zoom al enfocar.
      expect(busqueda.className, `busqueda a ${ancho}px`).toContain('text-base');

      for (const id of SUPPLIER_QUERYABLE.sortable) {
        const [boton] = botonesDeOrden(id);
        expect(boton, `orden de ${id} a ${ancho}px`).toBeVisible();
        expect(boton.className, `orden de ${id} a ${ancho}px`).toContain('min-h-11');
      }

      const fila = within(screen.getByTestId(filaDe(elProveedor.id)));
      for (const control of [
        fila.getByTestId(testId.enlaceDetalle),
        fila.getByTestId(testId.abrirEdicion),
        fila.getByTestId(testId.abrirBaja),
      ]) {
        const nombre = String(control.getAttribute('data-testid'));
        expect(control, `${nombre} a ${ancho}px`).toBeVisible();
        expect(control.className, `${nombre} a ${ancho}px`).toContain('min-h-11');
        expect(control.className, `${nombre} a ${ancho}px`).toContain('min-w-11');
        expect(control.className, `${nombre} a ${ancho}px`).not.toContain('hidden');
      }

      cleanup();
    }
  });

  it('R15, R22: pide la lista una sola vez con 10 por defecto, ofrece 10 y 25, y cambiar el tamano navega a la primera pagina', async () => {
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([proveedor()], { total: 40 }));

    await renderPantalla();

    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);
    expect(listSuppliersActionMock).toHaveBeenCalledWith({
      page: FIRST_PAGE,
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

    await user.click(
      await esperarInteractiva(screen.getByTestId(`data-table-page-size-${MAX_PAGE_SIZE}`)),
    );
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = ultimoDestino();
    expect(destino.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(PAGE_PARAM)).toBe(String(FIRST_PAGE));
  });

  it('R23: permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 2, total: 30, totalPages: 3 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2' });

    const estado = screen.getByTestId(testId.estadoPagina);
    expect(estado).toHaveTextContent('2');
    expect(estado).toHaveTextContent('3');

    await user.click(screen.getByTestId(testId.paginaSiguiente));
    expect(ultimoDestino().get(PAGE_PARAM)).toBe('3');

    await user.click(screen.getByTestId(testId.paginaAnterior));
    expect(ultimoDestino().get(PAGE_PARAM)).toBe('1');
  });

  it('R23: en los extremos no ofrece avanzar ni retroceder mas alla', async () => {
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
  });
});

describe('pantalla de proveedores — estados', () => {
  it('R20: vacio, sin resultados, cargando y error son mutuamente excluyentes y se distinguen por data-testid', async () => {
    const estados = [testId.vacio, testId.sinResultados, testId.esqueleto, testId.error];
    expect(new Set(estados).size).toBe(estados.length);

    const soloEste = (visible: string) => {
      expect(screen.getByTestId(visible), visible).toBeInTheDocument();
      for (const otro of estados.filter((estado) => estado !== visible)) {
        expect(screen.queryByTestId(otro), `${otro} junto a ${visible}`).toBeNull();
      }
    };

    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));
    await renderPantalla();
    soloEste(testId.vacio);
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    cleanup();

    await renderPantalla({ [SEARCH_PARAM]: 'sin-coincidencias' });
    soloEste(testId.sinResultados);
    cleanup();

    await renderPantallaCargando();
    soloEste(testId.esqueleto);
    cleanup();

    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });
    await renderPantalla();
    soloEste(testId.error);
  });

  it('R16: sin proveedores ni busqueda presenta el estado vacio con la accion de crear, fuera de la tabla', async () => {
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    expect(within(vacio).getByTestId(testId.abrirAlta)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByTestId(testId.sinResultados)).toBeNull();
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('R17: una pagina que se quedo atras sin busqueda ofrece volver a la primera conservando tamano y orden', async () => {
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([], { page: 4, pageSize: MAX_PAGE_SIZE, total: 12, totalPages: 1 }),
    );

    await renderPantalla({
      [PAGE_PARAM]: '4',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: orden('name', 'desc'),
    });

    const destino = screen.getByTestId(testId.primeraPagina).closest('a')?.getAttribute('href');

    expect(destino?.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    expect(paramsDe(destino)).toEqual({
      page: FIRST_PAGE,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'name', direction: 'desc' },
      filters: {},
      search: '',
    });
  });

  it('R18: mientras carga presenta el esqueleto propio con tantas filas como el tamano pedido', async () => {
    await renderPantallaCargando({ [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();

    expect(within(esqueleto).getAllByTestId(testId.filaEsqueleto)).toHaveLength(MAX_PAGE_SIZE);
    expect(within(esqueleto).getAllByRole('columnheader')).toHaveLength(
      SUPPLIER_SKELETON_COLUMN_COUNT,
    );
  });

  it('R19: un error de la consulta presenta el estado de error con reintento y no una tabla vacia', async () => {
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es válida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.sinResultados)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R19: un unauthorized de la operacion no muestra ningun dato de proveedores', async () => {
    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
    expect(screen.queryAllByTestId(testId.enlaceDetalle)).toHaveLength(0);
    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
  });

  it('R32, R33: con busqueda o filtro y cero filas presenta «sin resultados» dentro de la tabla, sin crear, con la busqueda y el filtro a la vista', async () => {
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([], { pageSize: MAX_PAGE_SIZE, total: 0 }),
    );

    await renderPantalla({
      [SEARCH_PARAM]: 'sin-coincidencias',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: orden('name', 'desc'),
      [CREATED_FROM_PARAM]: '2026-01-01',
      [CREATED_TO_PARAM]: '2026-01-31',
    });

    const sinResultados = screen.getByTestId(testId.sinResultados);
    const vacioDeLaTabla = screen.getByTestId(testId.vacioDeLaTabla);
    expect(vacioDeLaTabla).toContainElement(sinResultados);
    expect(within(vacioDeLaTabla).queryByTestId(testId.abrirAlta)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
    expect(screen.queryByTestId(testId.sinResultadosPrimeraPagina)).toBeNull();

    expect(screen.getByTestId(testId.busqueda)).toHaveValue('sin-coincidencias');
    expect(screen.getByTestId(testId.filtroFecha)).toBeVisible();

    const limpiar = within(sinResultados).getByTestId(testId.limpiarBusqueda);
    const destino = limpiar.getAttribute('href');
    expect(destino?.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    for (const parametro of [SEARCH_PARAM, CREATED_FROM_PARAM, CREATED_TO_PARAM]) {
      expect(consultaDe(destino).has(parametro), parametro).toBe(false);
    }
    expect(paramsDe(destino)).toEqual({
      page: FIRST_PAGE,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'name', direction: 'desc' },
      filters: {},
      search: '',
    });

    await user.click(limpiar);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(destino));
  });

  it('R32: con busqueda, cero filas y una pagina posterior ofrece volver a la primera conservando busqueda, filtros, tamano y orden', async () => {
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([], { page: 3, pageSize: MAX_PAGE_SIZE, total: 0, totalPages: 1 }),
    );

    await renderPantalla({
      [PAGE_PARAM]: '3',
      [SEARCH_PARAM]: 'sin-coincidencias',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: orden('name', 'asc'),
      [CREATED_FROM_PARAM]: '2026-01-01',
    });

    const sinResultados = screen.getByTestId(testId.sinResultados);
    expect(within(sinResultados).getByTestId(testId.limpiarBusqueda)).toBeInTheDocument();

    const destino = within(sinResultados)
      .getByTestId(testId.sinResultadosPrimeraPagina)
      .getAttribute('href');
    expect(destino?.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    expect(paramsDe(destino)).toEqual({
      page: FIRST_PAGE,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'name', direction: 'asc' },
      filters: { [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: null } },
      search: 'sin-coincidencias',
    });
  });

  it('R33: al pasar de filas a «sin resultados» con el mismo arbol, la busqueda conserva el foco y lo escrito', async () => {
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([proveedor()]));

    const { rerender } = render(await pantallaMontada({ [SEARCH_PARAM]: 'nor' }));

    const busqueda = screen.getByTestId(testId.busqueda);
    await user.type(busqueda, 'te');
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('norte');

    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([]));
    rerender(await pantallaMontada({ [SEARCH_PARAM]: 'norte' }));

    expect(screen.getByTestId(testId.sinResultados)).toBeInTheDocument();
    expect(screen.getByTestId(testId.busqueda)).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('norte');
    expect(screen.getByTestId(testId.filtroFecha)).toBeInTheDocument();
  });
});

describe('pantalla de proveedores — alta y edicion en panel lateral', () => {
  it('el alta se abre en un panel lateral sobre la lista, sin navegar ni perder la pagina', async () => {
    // R26 — panel lateral, NO dialogo modal centrado y NO otra URL. Y al cerrarse se vuelve a la
    // lista con la MISMA pagina y el MISMO tamano: sale gratis porque el estado de lista vive en
    // la cadena de consulta, asi que no hay ni una consulta de mas ni una navegacion.
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 2, pageSize: MAX_PAGE_SIZE, total: 60 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2', [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    expect(listSuppliersActionMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: MAX_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });

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

    // Ni al abrir ni al cerrar se navego a ninguna parte, y no se volvio a consultar la lista.
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);
  });

  it('el estado vacio ofrece crear el primer proveedor y abre el mismo panel', async () => {
    // R16 (su accion) + R26 — sin ni un proveedor, lo unico util es dar de alta el primero.
    const user = setupUser();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    await user.click(within(vacio).getByTestId(testId.abrirAlta));

    expect(await screen.findByTestId(testId.formulario)).toBeInTheDocument();
  });

  it('el alta captura nombre, telefono y correo y los envia por la operacion de alta', async () => {
    // R27, R43 — la mutacion sale por la Server Action del modulo; ningun `fetch` a rutas propias.
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const enviado = createSupplierActionMock.mock.calls[0][1];
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(enviado.get(campo), campo).toBe(valor);
    }
    // Y la edicion no se toco: son dos operaciones distintas.
    expect(updateSupplierActionMock).not.toHaveBeenCalled();
  });

  it('la edicion precarga los valores actuales y envia el reemplazo completo', async () => {
    // R28, R46 — los datos del proveedor llegan al panel POR PROPS desde la seccion de lista: no
    // se vuelve a consultar nada para abrirlo, y el reemplazo viaja con los TRES campos aunque
    // solo se cambie uno.
    const user = setupUser();
    const elProveedor = proveedor({ name: 'Químicos del Sur' });
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);

    const precargado: Record<string, string> = {
      name: elProveedor.name,
      phone: elProveedor.phone ?? '',
      email: elProveedor.email ?? '',
    };

    for (const [campo, valor] of Object.entries(precargado)) {
      expect(screen.getByTestId(`supplier-field-${campo}`), campo).toHaveValue(valor);
    }

    // Abrir la edicion no dispara ninguna lectura extra: los datos ya estaban en la fila (R46).
    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);

    // Se cambia un solo campo y se envia: el reemplazo viaja COMPLETO, con los demas incluidos.
    await user.clear(screen.getByTestId('supplier-field-name'));
    await user.type(screen.getByTestId('supplier-field-name'), 'Químicos del Sureste');
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateSupplierActionMock).toHaveBeenCalledTimes(1));

    // La firma real es `(id, prevState, formData)`: el id llega aplicado parcialmente con `bind`.
    const [id, , enviado] = updateSupplierActionMock.mock.calls[0];
    expect(id).toBe(elProveedor.id);
    expect(enviado.get('name')).toBe('Químicos del Sureste');
    for (const [campo, valor] of Object.entries(precargado)) {
      if (campo === 'name') continue;
      expect(enviado.get(campo), `${campo} debe viajar en el reemplazo`).toBe(valor);
    }
    expect(createSupplierActionMock).not.toHaveBeenCalled();
  });

  it('un supplier_duplicate_name se pinta junto al campo nombre, sin cerrar el panel ni perder lo escrito', async () => {
    // R32 (primera mitad) — el error identifica campo, asi que va JUNTO al campo. Y se decide por
    // el `code` estable, nunca por el texto: el mensaje del fixture no se parece a «duplicado».
    //
    // QC-70 R20: el codigo es el ABIERTO por caso (`supplier_duplicate_name`); el generico
    // `duplicate_name` ya no existe en el catalogo. QC-70 R32: la frase que se pinta es la que
    // llega del back, no un texto propio del formulario para ese mismo codigo.
    const user = setupUser();
    createSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_duplicate_name',
      message: 'MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const errorDeCampo = await screen.findByTestId('supplier-error-name');
    // QC-70 R32: el mensaje del back, tal cual, sin sustituirlo por uno propio.
    expect(errorDeCampo).toHaveTextContent('MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA');
    expect(screen.getByTestId('supplier-field-name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('supplier-field-name')).toHaveAttribute(
      'aria-describedby',
      errorDeCampo.id,
    );
    // Va junto al campo, NO en la region de error del formulario.
    expect(screen.queryByTestId(testId.errorFormulario)).toBeNull();

    // El panel sigue abierto y no se pierde lo escrito (R32).
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    for (const [campo, valor] of Object.entries(ALTA_VALIDA)) {
      expect(screen.getByTestId(`supplier-field-${campo}`), campo).toHaveValue(valor);
    }
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it('un unauthorized se pinta en la region de error del formulario y conserva lo escrito', async () => {
    // R32 (segunda mitad) — `unauthorized` no identifica campo: va a la region `role="alert"` del
    // formulario. El panel sigue abierto y lo escrito sigue ahi.
    const user = setupUser();
    createSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(region).toHaveAttribute('role', 'alert');
    expect(within(region).getByTestId('supplier-form-error-message')).toHaveTextContent(
      'No autorizado.',
    );
    expect(within(region).getByTestId('supplier-form-error-code')).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId('supplier-error-name')).toBeNull();

    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId('supplier-field-name')).toHaveValue(ALTA_VALIDA.name);
  });

  it('un supplier_not_found ofrece volver a la lista desde la region de error del formulario', async () => {
    // R32 — el proveedor dejo de existir mientras el panel estaba abierto. El destino se deriva
    // de `SUPPLIERS_ROUTE` (R2), nunca de un literal.
    //
    // QC-70 R20: el codigo es el ABIERTO por caso (`supplier_not_found`).
    const user = setupUser();
    updateSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'supplier_not_found',
      message: 'No existe.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirEdicion));
    await screen.findByTestId(testId.formulario);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(updateSupplierActionMock).toHaveBeenCalledTimes(1));

    const vuelta = await screen.findByTestId('supplier-form-back-to-list');
    expect(vuelta.getAttribute('href')).toBe(SUPPLIERS_ROUTE);
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
  });

  it('la validacion previa aplica el MISMO esquema del contrato publico y ni llama a la operacion', async () => {
    // R45 — el formulario valida con `createSupplierSchema`, el mismo que el servidor: la regla
    // cruzada «telefono o correo, al menos uno» se corta aqui, sin reescribirla y sin ninguna
    // libreria de formularios. El assert compara contra el propio esquema, no contra un copy.
    const user = setupUser();
    const sinContacto = { name: ALTA_VALIDA.name, phone: '', email: '' };

    expect(createSupplierSchema.safeParse(sinContacto).success).toBe(false);

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user, { phone: '', email: '' });
    await user.click(screen.getByTestId(testId.enviar));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByTestId('supplier-form-error-code')).toHaveTextContent(
      'invalid_input',
    );
    // La operacion NI SE LLAMA: el rechazo es de la validacion previa.
    expect(createSupplierActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(testId.panel)).toBeInTheDocument();
    expect(screen.getByTestId('supplier-field-name')).toHaveValue(ALTA_VALIDA.name);
  });

  it('un guardado con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    // R33
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());

    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    // Y no se navego: se vuelve a la lista con la misma pagina y el mismo tamano (R26).
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('la zona privada sigue teniendo exactamente una region de avisos', async () => {
    // R34 — en negativo: ningun `<Toaster />` propio de esta pantalla ni de su panel, solo el que
    // el layout privado ya monta.
    //
    // `sonner` solo pinta el `<ol data-sonner-toaster>` cuando hay algun toast en cola; lo que si
    // esta siempre montado es su `<section aria-live>` con `role="region"` (mismo criterio que
    // `tests/unit/private-layout.test.tsx`).
    const user = setupUser();

    await renderPantalla();

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);

    // Tampoco al abrir el panel, que es donde una segunda region se colaria sin que nadie mirase.
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('los campos y las acciones del panel se usan igual en viewport angosto y en ancho', async () => {
    // R48 — fuente de 16 px en los campos (por debajo, Safari en iOS hace zoom al enfocar) y
    // area tactil de 44x44 px, en los dos anchos y sin excepcion de escritorio.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      const user = setupUser();

      await renderPantalla();

      // Las acciones de fila son SIEMPRE visibles: nada detras de `:hover`.
      const [fila] = screen.getAllByTestId(testId.fila);
      for (const accion of [testId.abrirEdicion, testId.abrirBaja]) {
        const control = within(fila).getByTestId(accion);
        expect(control, `${accion} a ${ancho}px`).toBeVisible();
        expect(control.className, `area tactil de ${accion} a ${ancho}px`).toContain('min-h-11');
        expect(control.className, `area tactil de ${accion} a ${ancho}px`).toContain('min-w-11');
        expect(control.className, `nada tras el puntero a ${ancho}px`).not.toContain('hidden');
      }

      await user.click(screen.getByTestId(testId.abrirAlta));
      await screen.findByTestId(testId.formulario);

      for (const campo of Object.keys(ALTA_VALIDA)) {
        const control = screen.getByTestId(`supplier-field-${campo}`);
        expect(control.className, `${campo} a ${ancho}px`).toContain('text-base');
        // Y no vuelve a 14 px en el breakpoint `md`, que es lo que trae el primitivo.
        expect(control.className, `${campo} a ${ancho}px`).toContain('md:text-base');
        expect(control.className, `${campo} a ${ancho}px`).toContain('min-h-11');
      }

      expect(screen.getByTestId(testId.enviar).className).toContain('min-h-11');
      expect(screen.getByTestId(testId.cancelarFormulario).className).toContain('min-h-11');

      cleanup();
    }
  });
});

describe('pantalla de proveedores — baja con aviso de arrastre', () => {
  it('sin confirmar no invoca la operacion de baja, y el dialogo nombra al proveedor y avisa del arrastre', async () => {
    // R35, R47 — el doble FALLA si se le llama: no basta con no haberlo visto llamado, se
    // comprueba que ninguna via lo dispara. El aviso del arrastre se afirma por `data-testid`,
    // no por su copy; el nombre del proveedor es dato del fixture.
    const user = setupUser();
    const elProveedor = proveedor({ name: 'Reactivos del Golfo' });
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));
    deleteSupplierActionMock.mockImplementation(() => {
      throw new Error('la baja no puede invocarse sin confirmacion');
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));

    const dialogo = await screen.findByTestId(testId.dialogoBaja);
    expect(within(dialogo).getByTestId(testId.mensajeBaja)).toHaveTextContent(elProveedor.name);
    expect(within(dialogo).getByTestId(testId.arrastreBaja)).toBeInTheDocument();
    expect(deleteSupplierActionMock).not.toHaveBeenCalled();

    // Cancelar no da de baja nada.
    await user.click(screen.getByTestId(testId.cancelarBaja));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBaja)).toBeNull());
    expect(deleteSupplierActionMock).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('al confirmar invoca la baja con el id oculto, cierra, avisa por toast y refresca', async () => {
    // R35 (segunda mitad) + R33 — el `id` viaja en un campo oculto, que es la forma que
    // `deleteSupplierAction` espera; no hace falta `bind`.
    const user = setupUser();
    const elProveedor = proveedor({ name: 'Reactivos del Golfo' });
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBaja));
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    await waitFor(() => expect(deleteSupplierActionMock).toHaveBeenCalledTimes(1));
    expect(deleteSupplierActionMock.mock.calls[0][1].get('id')).toBe(elProveedor.id);

    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBaja)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('una baja rechazada mantiene el dialogo abierto con el mensaje a la vista', async () => {
    // R32 aplicado a la baja: cerrar el dialogo dejaria al usuario creyendo que se dio de baja.
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

    const error = await screen.findByTestId('delete-supplier-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.getByTestId(testId.dialogoBaja)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

/** QC-71 T9 — R17 y R18 en la pantalla de proveedores: lista, formulario y baja. */
describe('pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('la lista con el error inesperado ensena el identificador como texto y con su etiqueta', async () => {
    listSuppliersActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const aviso = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID);
    expect(within(aviso).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('la lista con un error del catalogo no ensena identificador ninguno', async () => {
    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });

  it('el formulario conserva el identificador que devolvio la operacion', async () => {
    const user = setupUser();
    createSupplierActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('el formulario con un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    createSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const region = await screen.findByTestId(testId.errorFormulario);
    expect(within(region).getByTestId('supplier-form-error-code')).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });

  it('el dialogo de baja ensena el identificador del error inesperado', async () => {
    const user = setupUser();
    deleteSupplierActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getAllByTestId(testId.abrirBaja)[0]);
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    const region = await screen.findByTestId('delete-supplier-error');
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
    await user.click(screen.getAllByTestId(testId.abrirBaja)[0]);
    await screen.findByTestId(testId.dialogoBaja);
    await user.click(screen.getByTestId(testId.confirmarBaja));

    const region = await screen.findByTestId('delete-supplier-error');
    expect(region).toHaveTextContent('No autorizado.');
    esperarSinIdentificador();
  });
});
