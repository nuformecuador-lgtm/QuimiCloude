import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  mockAllIsIntersecting,
  resetIntersectionMocking,
  setupIntersectionMocking,
} from 'react-intersection-observer/test-utils';

import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import ProveedoresPage from '@/app/(private)/proveedores/page';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import type { ShowcaseLine, ShowcasePage, ShowcaseRow } from '@/lib/modules/proveedores';
import type {
  CreateSupplierFormState,
  ShowcaseLinesResult,
  SupplierShowcaseResult,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

/**
 * QC-140 T11 — catalogo visual de proveedores, montado dentro del armazon privado con el arbol
 * real de `page.tsx`.
 *
 * `listSupplierShowcaseAction` y `listShowcaseLinesAction` estan mockeadas: son el borde del
 * modulo. `createSupplierAction`/`updateSupplierAction` tambien, porque `SupplierForm` (panel de
 * alta compartido) las importa directamente y el arbol real las arrastra.
 *
 * El centinela de carga perezosa se simula con `react-intersection-observer/test-utils`, el mismo
 * utillaje que usa `showcase-load-trigger.test.tsx`.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-140',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  permissions: PERMISSIONS.map((permiso) => permiso.code),
};

const {
  usePathnameMock,
  redirectMock,
  routerMock,
  logoutActionMock,
  cookiesMock,
  getSessionUserMock,
  listSupplierShowcaseActionMock,
  listShowcaseLinesActionMock,
  createSupplierActionMock,
  updateSupplierActionMock,
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
  listSupplierShowcaseActionMock: vi.fn<(query: unknown) => Promise<SupplierShowcaseResult>>(),
  listShowcaseLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<ShowcaseLinesResult>>(),
  createSupplierActionMock:
    vi.fn<(prev: CreateSupplierFormState, data: FormData) => Promise<CreateSupplierFormState>>(),
  updateSupplierActionMock: vi.fn(),
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
  listSupplierShowcaseAction: listSupplierShowcaseActionMock,
  listShowcaseLinesAction: listShowcaseLinesActionMock,
  createSupplierAction: createSupplierActionMock,
  updateSupplierAction: updateSupplierActionMock,
}));

const testId = {
  content: 'private-content',
  titulo: 'proveedores-title',
  lista: 'supplier-showcase-list',
  // El sufijo es el `id` de la fila: un patron mas laxo se colaria por `supplier-showcase-row-empty`,
  // el aviso de «sin productos todavia» que cada fila puede mostrar en vez del carrusel.
  fila: /^supplier-showcase-row-[0-9a-f-]{36}$/,
  enlaceDetalle: 'supplier-detail-link',
  esqueleto: 'supplier-showcase-skeleton',
  filaEsqueleto: 'supplier-showcase-row-skeleton',
  vacio: 'supplier-list-empty',
  sinResultados: 'supplier-showcase-no-results',
  limpiarFiltros: 'supplier-showcase-clear-filters',
  error: 'supplier-list-error',
  errorMensaje: 'supplier-list-error-message',
  errorCodigo: 'supplier-list-error-code',
  reintentarLista: 'supplier-list-retry',
  reintentarCarga: 'supplier-showcase-list-retry',
  abrirAlta: 'supplier-create-open',
  panel: 'supplier-sheet',
  formulario: 'supplier-form',
  enviar: 'supplier-form-submit',
  cancelarFormulario: 'supplier-form-cancel',
  filtroProducto: 'supplier-showcase-product-filter',
  filtroProveedor: 'supplier-showcase-supplier-filter',
} as const;

const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido Cítrico del Bajío',
  phone: '+52 33 9876 5432',
  email: 'compras@acidocitrico.example',
};

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

function linea(overrides: Partial<ShowcaseLine> = {}): ShowcaseLine {
  return {
    id: crypto.randomUUID(),
    name: 'Ácido cítrico anhidro',
    imagePath: null,
    ...overrides,
  };
}

function fila(overrides: Partial<ShowcaseRow> = {}): ShowcaseRow {
  const name = overrides.name ?? 'Químicos del Norte';
  return {
    id: crypto.randomUUID(),
    name,
    lines: [linea()],
    hasMoreLines: false,
    ...overrides,
  };
}

function paginaDe(items: readonly ShowcaseRow[], hasMore = false): ShowcasePage {
  return { items, page: 1, hasMore };
}

function exito(pagina: ShowcasePage): SupplierShowcaseResult {
  return { status: 'success', data: pagina };
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

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return ProveedoresPage({ searchParams: Promise.resolve(searchParams) });
}

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

let toastExito: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  setupIntersectionMocking(vi.fn);
});

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(SUPPLIERS_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([fila()])));
  createSupplierActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  toastExito = vi.spyOn(toast, 'success');
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  resetIntersectionMocking();
  toast.dismiss();
  vi.restoreAllMocks();
  resetViewport();
  clearSidebarStateCookie();
});

describe('catalogo visual de proveedores — estructura (R1, R2, R5)', () => {
  it('R1: se renderiza dentro del armazon privado, con una unica region principal', async () => {
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);
    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));
  });

  it('R2: no monta ninguna tabla ni paginacion por numero de pagina', async () => {
    await renderPantalla();

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('data-table')).toBeNull();
    expect(screen.queryByTestId('data-table-pagination')).toBeNull();
    expect(screen.queryByTestId('data-table-page-size')).toBeNull();
  });

  it('R5: una fila por proveedor, con su nombre y su carrusel', async () => {
    const filas = [
      fila({ name: 'Alfa Reactivos' }),
      fila({ name: 'Zeta Química' }),
    ];
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe(filas)));

    await renderPantalla();

    const vistas = screen.getAllByTestId(testId.fila);
    expect(vistas).toHaveLength(2);
    for (const elProveedor of filas) {
      expect(within(screen.getByTestId(`supplier-showcase-row-${elProveedor.id}`))).toBeTruthy();
      expect(screen.getByText(elProveedor.name)).toBeInTheDocument();
    }
  });

  it('R32: los filtros viven fuera del <Suspense> que envuelve la seccion', () => {
    const fuente = readFileSync(
      join(__dirname, '..', '..', '..', 'app', '(private)', 'proveedores', 'page.tsx'),
      'utf8',
    );
    const indiceFiltros = fuente.indexOf('SupplierShowcaseFilters');
    const indiceSuspense = fuente.indexOf('<Suspense');

    expect(indiceFiltros).toBeGreaterThan(-1);
    expect(indiceSuspense).toBeGreaterThan(indiceFiltros);
  });
});

describe('catalogo visual de proveedores — tanda inicial (R11)', () => {
  it('pide la primera pagina con los filtros vigentes de la URL', async () => {
    await renderPantalla({ supplier: 'norte', product: 'acido' });

    expect(listSupplierShowcaseActionMock).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      supplierSearch: 'norte',
      productSearch: 'acido',
    });
  });
});

describe('catalogo visual de proveedores — carga perezosa (R12, R13, R14, R17)', () => {
  it('R12: al llegar al centinela pide la siguiente tanda y la añade sin perder la primera', async () => {
    const primera = fila({ name: 'Alfa Reactivos' });
    const segunda = fila({ name: 'Beta Solventes' });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([primera], true)));
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([segunda], false)));

    await renderPantalla();

    mockAllIsIntersecting(true);

    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${segunda.id}`)).toBeInTheDocument(),
    );
    expect(screen.getByTestId(`supplier-showcase-row-${primera.id}`)).toBeInTheDocument();
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(2);
    expect(listSupplierShowcaseActionMock.mock.calls[1]?.[0]).toEqual({
      page: 2,
      supplierSearch: '',
      productSearch: '',
    });
  });

  it('R13: sin mas proveedores por cargar, no vuelve a pedir tanda ninguna', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([fila()], false)));

    await renderPantalla();

    expect(screen.queryByTestId('showcase-load-trigger')).toBeNull();
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(1);
  });

  it('R14: mientras una tanda esta en vuelo, no pide otra aunque el centinela vuelva a disparar', async () => {
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([fila()], true)));
    let resolver: (value: SupplierShowcaseResult) => void = () => {};
    listSupplierShowcaseActionMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );

    await renderPantalla();

    mockAllIsIntersecting(true);
    await waitFor(() => expect(screen.getByTestId(testId.lista)).toHaveAttribute('aria-busy', 'true'));

    mockAllIsIntersecting(true);
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(2);

    resolver(exito(paginaDe([], false)));
    await waitFor(() => expect(screen.getByTestId(testId.lista)).toHaveAttribute('aria-busy', 'false'));
  });

  it('R17: una tanda que repite un id ya cargado no lo duplica', async () => {
    const primera = fila({ name: 'Alfa Reactivos' });
    const repetida = fila({ id: primera.id, name: 'Alfa Reactivos' });
    const nueva = fila({ name: 'Gamma Insumos' });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([primera], true)));
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([repetida, nueva], false)));

    await renderPantalla();

    mockAllIsIntersecting(true);

    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${nueva.id}`)).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId(testId.fila)).toHaveLength(2);
  });
});

describe('catalogo visual de proveedores — fallo de una tanda incremental (R35)', () => {
  it('conserva lo ya cargado, pinta el aviso al pie sin detalle tecnico y no dispara el centinela mientras esta puesto', async () => {
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([fila()], true)));
    listSupplierShowcaseActionMock.mockResolvedValueOnce({
      status: 'error',
      code: 'unexpected',
      message: 'algo salio mal',
      reference: 'req-999',
    });

    await renderPantalla();
    mockAllIsIntersecting(true);

    const aviso = await screen.findByRole('alert');
    expect(aviso).not.toHaveTextContent('algo salio mal');
    expect(aviso).not.toHaveTextContent('req-999');
    expect(screen.getAllByTestId(testId.fila)).toHaveLength(1);
    expect(screen.queryByTestId('showcase-load-trigger')).toBeNull();

    mockAllIsIntersecting(true);
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(2);
  });

  it('Reintentar repite la misma tanda y, si sale bien, retira el aviso', async () => {
    const segunda = fila({ name: 'Beta Solventes' });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([fila()], true)));
    listSupplierShowcaseActionMock.mockResolvedValueOnce({
      status: 'error',
      code: 'unexpected',
      message: 'x',
      reference: 'r-1',
    });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([segunda], false)));
    const user = setupUser();

    await renderPantalla();
    mockAllIsIntersecting(true);
    await screen.findByRole('alert');

    await user.click(screen.getByTestId(testId.reintentarCarga));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByTestId(`supplier-showcase-row-${segunda.id}`)).toBeInTheDocument();
    expect(listSupplierShowcaseActionMock).toHaveBeenCalledTimes(3);
    expect(listSupplierShowcaseActionMock.mock.calls[2]?.[0]).toEqual({
      page: 2,
      supplierSearch: '',
      productSearch: '',
    });
  });
});

describe('catalogo visual de proveedores — estados (R26, R32, R33, R34)', () => {
  it('R33: sin proveedores y sin filtro, muestra el vacio con el boton de alta', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([])));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    expect(within(vacio).getByTestId(testId.abrirAlta)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByTestId(testId.sinResultados)).toBeNull();
  });

  it('R26: con un filtro activo y cero coincidencias, muestra «sin resultados» distinto del vacio, con accion que limpia los dos filtros', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([])));

    await renderPantalla({ product: 'sin-coincidencias' });

    const sinResultados = screen.getByTestId(testId.sinResultados);
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(within(sinResultados).queryByTestId(testId.abrirAlta)).toBeNull();

    const limpiar = within(sinResultados).getByTestId(testId.limpiarFiltros);
    expect(limpiar.getAttribute('href')).toBe(SUPPLIERS_ROUTE);
  });

  it('R32: mientras se resuelve la tanda inicial, pinta el esqueleto de reserva', async () => {
    await renderPantallaCargando();

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    // Los filtros no cuelgan del Suspense: siguen montados durante la carga.
    expect(screen.getByTestId(testId.filtroProducto)).toBeInTheDocument();
  });

  it('R34: si falla la tanda inicial, muestra el estado de error sin ningun dato de proveedores', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);

    const user = setupUser();
    await user.click(screen.getByTestId(testId.reintentarLista));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('catalogo visual de proveedores — alta reinicia la lista (R36)', () => {
  it('un alta con exito cierra el panel, refresca y la lista vuelve a empezar desde la primera tanda', async () => {
    const user = setupUser();
    const original = fila({ name: 'Químicos del Norte' });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([original], true)));
    const segundaTanda = fila({ name: 'Beta Solventes' });
    listSupplierShowcaseActionMock.mockResolvedValueOnce(exito(paginaDe([segundaTanda], false)));

    const pantalla = await renderPantalla();

    // Se acumula una segunda tanda por carga perezosa antes del alta.
    mockAllIsIntersecting(true);
    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${segundaTanda.id}`)).toBeInTheDocument(),
    );

    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);
    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);

    // `router.refresh()` vuelve a ejecutar la seccion en el servidor: la simulacion es pintar de
    // nuevo el arbol, con la primera pagina de nuevo desde el principio (D15: el proveedor nuevo
    // aparece aunque todavia no tenga lineas).
    const nuevoProveedor = fila({ name: 'Ácido Cítrico del Bajío', lines: [], hasMoreLines: false });
    listSupplierShowcaseActionMock.mockReset();
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([nuevoProveedor], false)));

    pantalla.rerender(await resolverServerComponents(await arbolDeLaPantalla()));

    await waitFor(() =>
      expect(screen.getByTestId(`supplier-showcase-row-${nuevoProveedor.id}`)).toBeInTheDocument(),
    );
    // La fila de la segunda tanda, acumulada por el cliente ANTES del alta, ya no esta: la lista
    // se remonto desde la primera tanda y no arrastro el estado acumulado.
    expect(screen.queryByTestId(`supplier-showcase-row-${segundaTanda.id}`)).toBeNull();
    expect(screen.queryByTestId(`supplier-showcase-row-${original.id}`)).toBeNull();
  });
});

describe('catalogo visual de proveedores — sin edicion ni baja en la fila (R37)', () => {
  it('ninguna fila monta el disparador de editar ni el de dar de baja', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(exito(paginaDe([fila()])));

    await renderPantalla();

    expect(screen.queryByTestId('supplier-edit-open')).toBeNull();
    expect(screen.queryByTestId('supplier-delete-open')).toBeNull();
    expect(screen.queryByTestId('delete-supplier-dialog')).toBeNull();
  });
});

describe('catalogo visual de proveedores — alta en panel lateral', () => {
  it('el alta se abre en un panel lateral sobre la lista, sin navegar', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));

    const panel = await screen.findByTestId(testId.panel);
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(within(panel).getByTestId(testId.formulario)).toBeInTheDocument();

    await user.click(screen.getByTestId(testId.cancelarFormulario));
    await waitFor(() => expect(screen.queryByTestId(testId.panel)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

/** QC-71 T9 — R17 y R18 en el catalogo visual de proveedores: lista y formulario de alta. */
describe('pantalla de proveedores — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('la lista con el error inesperado ensena el identificador como texto y con su etiqueta', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const aviso = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID);
    expect(within(aviso).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('la lista con un error del catalogo no ensena identificador ninguno', async () => {
    listSupplierShowcaseActionMock.mockResolvedValue({
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

    const region = await screen.findByTestId('supplier-form-error');
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

    const region = await screen.findByTestId('supplier-form-error');
    expect(within(region).getByTestId('supplier-form-error-code')).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});

describe('catalogo visual de proveedores — multiplataforma (R39)', () => {
  it('los controles clave se usan igual en viewport angosto y en ancho', async () => {
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.filtroProducto), `producto a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.filtroProveedor), `proveedor a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.abrirAlta).className).toContain('min-h-11');

      cleanup();
    }
  });
});
