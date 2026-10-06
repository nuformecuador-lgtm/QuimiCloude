import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import FormulasPage from '@/app/(private)/produccion/formulas/page';
import {
  ACTIONS_COLUMN_ID,
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  RECIPE_SKELETON_COLUMN_COUNT,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildRecipeColumns,
  parseRecipeListParams,
  type RecipeColumnId,
} from '@/app/(private)/produccion/formulas/components';
import { PRIVATE_NAV_ITEMS, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { RECIPE_QUERYABLE, type RecipeSummary } from '@/lib/modules/recetas';
import type {
  DeleteRecipeFormState,
  RecipeListResult,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';

// Las Server Actions de recetas se sustituyen porque son el borde del modulo: sin ellas no se
// pueden provocar el error, el vacio ni un borrado sin base de datos.

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

// Catalogo entero de permisos: la pagina exige el suyo antes de pintar y aqui no se prueba
// autorizacion, sino lo que se ve cuando se puede ver.
const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
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
  listRecipesActionMock,
  getRecipeActionMock,
  deleteRecipeActionMock,
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
  listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
  getRecipeActionMock: vi.fn(),
  deleteRecipeActionMock: vi.fn<(id: string) => Promise<DeleteRecipeFormState>>(),
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

// Sin la lectura de la cabecera del identificador el adaptador de recetas ni siquiera carga.
const { readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { readRequestIdHeaderMock: vi.fn(async () => id) };
});

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
  deleteRecipeAction: deleteRecipeActionMock,
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
}));

const testId = {
  content: 'private-content',
  titulo: 'recipes-title',
  lista: 'recipe-list',
  tabla: 'recipe-table',
  tablaCompartida: 'data-table',
  fila: /^data-table-row-/,
  esqueleto: 'recipe-table-skeleton',
  filaEsqueleto: 'recipe-row-skeleton',
  vacio: 'recipe-list-empty',
  primeraPagina: 'recipe-list-first-page',
  sinResultados: 'recipe-list-no-results',
  limpiarBusqueda: 'recipe-list-clear-search',
  primeraPaginaSinResultados: 'recipe-list-no-results-first-page',
  vacioDeLaTabla: 'data-table-empty',
  error: 'recipe-list-error',
  errorMensaje: 'recipe-list-error-message',
  errorCodigo: 'recipe-list-error-code',
  reintentar: 'recipe-list-retry',
  busqueda: 'data-table-search',
  filtroFecha: `data-table-filter-date-${CREATED_AT_COLUMN_ID}`,
  limpiarFecha: `data-table-filter-clear-${CREATED_AT_COLUMN_ID}`,
  tamanoPagina: 'data-table-page-size',
  paginaAnterior: 'data-table-previous',
  paginaSiguiente: 'data-table-next',
  estadoPagina: 'data-table-page-indicator',
  crear: 'recipe-create-open',
  editar: 'recipe-edit-open',
  abrirBorrado: 'recipe-delete-open',
  dialogoBorrado: 'delete-recipe-dialog',
  mensajeBorrado: 'delete-recipe-message',
  cancelarBorrado: 'delete-recipe-cancel',
  confirmarBorrado: 'delete-recipe-confirm',
  imagen: 'recipe-image',
  imagenMarcador: 'recipe-image-placeholder',
} as const;

const COLUMNAS_ORDENABLES: readonly RecipeColumnId[] = ['name', 'createdAt', 'updatedAt'];

const AREA_TACTIL = ['min-h-11', 'min-w-11'] as const;

// Cadenas inconfundibles: con un valor realista no se distinguiria «no se muestra» de «se muestra
// pero parece otra cosa».
const ID_QUE_NO_DEBE_VERSE = 'RECETA-ID-NO-VISIBLE';
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';
const DESCRIPCION_QUE_NO_DEBE_VERSE = 'DESCRIPCION-NO-VISIBLE';

function receta(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: ID_QUE_NO_DEBE_VERSE,
    name: 'Detergente industrial',
    description: DESCRIPCION_QUE_NO_DEBE_VERSE,
    imageUrl: 'https://storage.example.com/recetas/detergente.png',
    stepCount: 3,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

// Orden deliberadamente no alfabetico: si la pantalla reordenara en el cliente, se notaria.
const RECETAS_DEL_SIMULADOR: readonly RecipeSummary[] = [
  receta({ id: 'receta-c', name: 'Cloro' }),
  receta({ id: 'receta-a', name: 'Amoniaco' }),
  receta({ id: 'receta-b', name: 'Borax' }),
];

function paginaDeRecetas(
  items: readonly RecipeSummary[],
  extra: { page?: number; pageSize?: number; total?: number; totalPages?: number } = {},
): RecipeListResult {
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

// `react-dom` en jsdom no ejecuta componentes `async`: se resuelven antes de renderizar, conservando
// el `<Suspense>` y el `fallback` reales de la pagina.
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

  // Hijos sueltos y no un array: un array exigiria `key` que la pagina no declara.
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return FormulasPage({ searchParams: Promise.resolve(searchParams) });
}

async function montaje(searchParams: Consulta = {}, extra?: ReactNode) {
  const arbol = await resolverServerComponents(await arbolDeLaPantalla(searchParams));
  const layout = await PrivateLayout({ children: arbol });
  return extra === undefined ? (
    layout
  ) : (
    <>
      {layout}
      {extra}
    </>
  );
}

async function renderPantalla(searchParams: Consulta = {}, extra?: ReactNode) {
  return render(await montaje(searchParams, extra));
}

// Sin resolver, la seccion queda suspendida y el `<Suspense>` pinta su `fallback`.
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await PrivateLayout({ children: await arbolDeLaPantalla(searchParams) }));
}

function consulta(href: unknown): URLSearchParams {
  return new URLSearchParams(String(href).split('?')[1]);
}

function ultimoDestino(): URLSearchParams {
  return consulta(routerMock.push.mock.calls.at(-1)?.[0]);
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

function botonDeOrden(columnId: string): HTMLElement | undefined {
  const cabecera = screen.getByTestId(`data-table-head-${columnId}`);
  return within(cabecera)
    .queryAllByRole('button')
    .find((boton) => boton.getAttribute('data-testid') !== `data-table-header-menu-${columnId}`);
}

// El router real de Next deja la transicion pendiente hasta que llega la pagina nueva; el doble no
// lo hace. Este componente reproduce esa espera: la navegacion actualiza su estado dentro de la
// misma transicion y suspende hasta que el test la suelta.
const navegacionEnVuelo: { iniciar: (() => void) | null } = { iniciar: null };

function NavegacionPendiente({ hasta }: { readonly hasta: Promise<void> }) {
  const [enVuelo, setEnVuelo] = useState(false);

  useEffect(() => {
    navegacionEnVuelo.iniciar = () => setEnVuelo(true);
    return () => {
      navegacionEnVuelo.iniciar = null;
    };
  }, []);

  if (enVuelo) use(hasta);
  return null;
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue(FORMULAS_ROUTE);
  logoutActionMock.mockResolvedValue(undefined);
  getSessionUserMock.mockResolvedValue(USUARIO_DEL_TEST);
  cookiesMock.mockResolvedValue({ get: () => undefined });
  listRecipesActionMock.mockResolvedValue(paginaDeRecetas([receta()]));
  deleteRecipeActionMock.mockResolvedValue({ status: 'success' });
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
  // El fijado de columnas persiste por tabla y contaminaria el caso siguiente.
  window.localStorage.clear();
});

describe('pantalla de recetas — ubicacion y navegacion', () => {
  it('R1: la lista monta la tabla compartida dentro del armazon privado, sin main ni paginacion propios', async () => {
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));

    const tabla = screen.getByTestId(testId.tabla);
    expect(armazon).toContainElement(tabla);
    expect(tabla).toContainElement(screen.getByTestId(testId.tablaCompartida));
    expect(tabla).toContainElement(screen.getByTestId(testId.tamanoPagina));

    for (const propio of ['recipe-row', 'recipe-page-size', 'recipe-page-next', 'recipe-page-status']) {
      expect(screen.queryByTestId(propio), propio).toBeNull();
    }
  });

  it('QC-26 R5: el item del sidebar comparte RECIPES_LABEL con el encabezado', async () => {
    await renderPantalla();

    expect(screen.getByTestId(testId.titulo)).toHaveTextContent(RECIPES_LABEL);

    const itemRecetas = screen.getByTestId('nav-produccion-recetas');
    expect(itemRecetas).toHaveTextContent(RECIPES_LABEL);

    const declarado = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item) => item.testId === 'nav-produccion-recetas');
    expect(declarado?.href).toBe(FORMULAS_ROUTE);
    expect(declarado?.label).toBe(RECIPES_LABEL);
  });
});

describe('pantalla de recetas — columnas', () => {
  it('R2: la lista presenta imagen, nombre, pasos, creado, actualizado y acciones, y nunca la descripcion', async () => {
    const laReceta = receta();
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([laReceta]));

    await renderPantalla();

    const columnas = buildRecipeColumns({ rowActions: () => null });
    expect(columnas.map((columna) => columna.id)).toEqual([
      'image',
      'name',
      'stepCount',
      'createdAt',
      'updatedAt',
      'actions',
    ]);

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

    expect(screen.queryByTestId('data-table-head-description')).toBeNull();
    expect(screen.queryByTestId('data-table-cell-description')).toBeNull();
    expect(document.body.textContent).not.toContain(DESCRIPCION_QUE_NO_DEBE_VERSE);

    // @ts-expect-error la descripcion no es un id de columna valido
    const descripcion: RecipeColumnId = 'description';
    expect(columnas.map((columna) => columna.id)).not.toContain(descripcion);
  });

  it('R3: la lista no muestra id, createdBy ni updatedBy', async () => {
    await renderPantalla();

    expect(document.body.textContent).not.toContain(ID_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(EDITOR_QUE_NO_DEBE_VERSE);

    const columnas = buildRecipeColumns({ rowActions: () => null });
    for (const prohibida of ['id', 'createdBy', 'updatedBy', 'imageUrl']) {
      expect(
        columnas.some((columna) => String(columna.id) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`data-table-cell-${prohibida}`)).toBeNull();
    }

    // @ts-expect-error la autoria no es un id de columna valido
    const autoria: RecipeColumnId = 'createdBy';
    expect(columnas.map((columna) => columna.id)).not.toContain(autoria);
  });

  it('R5: la imagen usa la direccion de la consulta tal cual y sin imagen se pinta el marcador', async () => {
    const conImagen = receta({ imageUrl: 'https://cdn.example.com/una-receta.jpg' });
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([conImagen]));

    await renderPantalla();
    expect(screen.getByTestId(testId.imagen)).toHaveAttribute('src', conImagen.imageUrl as string);
    expect(screen.queryByTestId(testId.imagenMarcador)).toBeNull();

    cleanup();

    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([receta({ imageUrl: null })]));
    await renderPantalla();

    expect(screen.queryByTestId(testId.imagen)).toBeNull();
    expect(screen.getByTestId(testId.imagenMarcador)).toBeInTheDocument();
    // Un `src` vacio dispara en algunos navegadores una peticion a la propia pagina.
    expect(document.querySelector('img[src=""]')).toBeNull();
  });

  it('R18: el esqueleto cuenta tantas celdas como columnas declara la lista', () => {
    expect(RECIPE_SKELETON_COLUMN_COUNT).toBe(buildRecipeColumns({ rowActions: () => null }).length);
  });

  it('R7, R11: cada columna ordena y filtra exactamente lo que declara la lista blanca, y nada de la lista blanca queda sin columna', () => {
    const columnas = buildRecipeColumns({ rowActions: () => null });
    const ids: readonly string[] = columnas.map((columna) => columna.id);

    for (const columna of columnas) {
      expect(Boolean(columna.sortable), `orden de «${columna.id}»`).toBe(
        RECIPE_QUERYABLE.sortable.includes(columna.id),
      );

      const declarado = Object.hasOwn(RECIPE_QUERYABLE.filterable, columna.id)
        ? RECIPE_QUERYABLE.filterable[columna.id]
        : undefined;
      expect(columna.filter?.kind, `filtro de «${columna.id}»`).toBe(declarado);
    }

    for (const campo of RECIPE_QUERYABLE.sortable) {
      expect(ids, `«${campo}» ordena en el servidor y no tiene columna`).toContain(campo);
    }
    for (const campo of Object.keys(RECIPE_QUERYABLE.filterable)) {
      expect(ids, `«${campo}» filtra en el servidor y no tiene columna`).toContain(campo);
    }
  });

  it('R21: las acciones van en una columna que no se puede fijar, siempre visibles y con area tactil de 44x44', async () => {
    await renderPantalla();

    const acciones = buildRecipeColumns({ rowActions: () => null }).find(
      (columna) => columna.id === ACTIONS_COLUMN_ID,
    );
    expect(acciones?.pinnable).toBe(false);
    expect(screen.queryByTestId(`data-table-header-menu-${ACTIONS_COLUMN_ID}`)).toBeNull();
    expect(screen.queryByTestId(`data-table-pin-${ACTIONS_COLUMN_ID}`)).toBeNull();

    const celda = within(screen.getAllByTestId(testId.fila)[0] as HTMLElement).getByTestId(
      `data-table-cell-${ACTIONS_COLUMN_ID}`,
    );
    for (const control of [
      within(celda).getByTestId(testId.editar),
      within(celda).getByTestId(testId.abrirBorrado),
    ]) {
      expect(control).toBeVisible();
      for (const clase of AREA_TACTIL) {
        expect(control).toHaveClass(clase);
      }
    }
  });

  it('R21: editar navega a la pagina de la receta y crear a la de alta, sin abrir panel ni modal', async () => {
    await renderPantalla();

    const crear = screen.getByTestId(testId.crear);
    expect(crear.tagName).toBe('A');
    expect(crear).toHaveAttribute('href', expect.stringContaining(`${FORMULAS_ROUTE}/nueva`));

    const editar = screen.getByTestId(testId.editar);
    expect(editar.tagName).toBe('A');
    expect(editar.getAttribute('href')).toBe(`${FORMULAS_ROUTE}/${ID_QUE_NO_DEBE_VERSE}`);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('pantalla de recetas — orden, busqueda y filtro', () => {
  it('R6, R7, R8, R10: hay busqueda, solo name, createdAt y updatedAt ordenan por cabecera, y ordenar navega sin reordenar las filas', async () => {
    const user = setupUser();
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas(RECETAS_DEL_SIMULADOR));

    await renderPantalla();

    expect(screen.getAllByRole('searchbox')).toEqual([screen.getByTestId(testId.busqueda)]);

    const columnas = buildRecipeColumns({ rowActions: () => null });
    expect(columnas.filter((columna) => columna.sortable === true).map((columna) => columna.id)).toEqual(
      COLUMNAS_ORDENABLES,
    );

    for (const columna of columnas) {
      const cabecera = screen.getByTestId(`data-table-head-${columna.id}`);
      if (COLUMNAS_ORDENABLES.includes(columna.id)) {
        expect(cabecera, columna.id).toHaveAttribute('aria-sort', 'none');
        expect(botonDeOrden(columna.id), columna.id).toBeDefined();
      } else {
        expect(cabecera, columna.id).not.toHaveAttribute('aria-sort');
        expect(botonDeOrden(columna.id), columna.id).toBeUndefined();
      }
    }

    for (const columnId of COLUMNAS_ORDENABLES) {
      routerMock.push.mockClear();
      await user.click(botonDeOrden(columnId) as HTMLElement);

      await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
      expect(ultimoDestino().get(SORT_PARAM)).toBe(`${columnId}${SORT_SEPARATOR}asc`);
    }

    expect(screen.getAllByTestId(testId.fila).map((fila) => fila.getAttribute('data-testid'))).toEqual(
      RECETAS_DEL_SIMULADOR.map((laReceta) => `data-table-row-${laReceta.id}`),
    );
  });

  it('R6: el orden elegido en el menu de la cabecera navega, y la cabecera expone el orden vigente', async () => {
    const user = setupUser();

    await renderPantalla({ [SORT_PARAM]: `updatedAt${SORT_SEPARATOR}desc` });

    expect(screen.getByTestId('data-table-head-updatedAt')).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByTestId('data-table-head-name')).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByTestId('data-table-header-menu-name'));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-sort-desc-name')));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().get(SORT_PARAM)).toBe(`name${SORT_SEPARATOR}desc`);
  });

  it('R7: los menus de imagen y pasos no ofrecen orden', async () => {
    const user = setupUser();

    await renderPantalla();

    for (const columnId of ['image', 'stepCount']) {
      await user.click(screen.getByTestId(`data-table-header-menu-${columnId}`));
      const menu = await screen.findByTestId(`data-table-header-menu-content-${columnId}`);

      expect(within(menu).queryByTestId(`data-table-sort-asc-${columnId}`)).toBeNull();
      expect(within(menu).queryByTestId(`data-table-sort-desc-${columnId}`)).toBeNull();

      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByTestId(`data-table-header-menu-content-${columnId}`)).toBeNull(),
      );
    }
  });

  it('R8: vaciar la busqueda navega sin termino y escribir uno navega con el, una sola vez tras el rebote', async () => {
    const user = setupUser();

    await renderPantalla({ [SEARCH_PARAM]: 'acido' });

    const busqueda = screen.getByTestId(testId.busqueda);
    expect(busqueda).toHaveValue('acido');

    await user.clear(busqueda);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().has(SEARCH_PARAM)).toBe(false);

    routerMock.push.mockClear();
    await user.type(busqueda, 'cloro');

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().get(SEARCH_PARAM)).toBe('cloro');
  });

  it('R9: el atajo de fecha navega con el rango, limpiarlo navega sin el, y ninguna otra columna filtra', async () => {
    const user = setupUser();

    await renderPantalla({ [CREATED_FROM_PARAM]: '2026-01-01', [CREATED_TO_PARAM]: '2026-01-31' });

    await user.click(screen.getByTestId(testId.filtroFecha));
    await user.click(await esperarInteractiva(await screen.findByTestId('data-table-date-last-week')));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    const desde = ultimoDestino().get(CREATED_FROM_PARAM);
    const hasta = ultimoDestino().get(CREATED_TO_PARAM);
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(String(desde) < String(hasta)).toBe(true);

    await user.keyboard('{Escape}');
    routerMock.push.mockClear();
    await user.click(screen.getByTestId(testId.limpiarFecha));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().has(CREATED_FROM_PARAM)).toBe(false);
    expect(ultimoDestino().has(CREATED_TO_PARAM)).toBe(false);

    const filtrables = buildRecipeColumns({ rowActions: () => null })
      .filter((columna) => columna.filter !== undefined)
      .map((columna) => columna.id);
    expect(filtrables).toEqual([CREATED_AT_COLUMN_ID]);
    expect(document.querySelectorAll('[data-testid^="data-table-filter-date-"]')).toHaveLength(1);
  });

  it('R9: elegir a mano en el calendario un dia de inicio y otro de fin navega con ese rango en YYYY-MM-DD', async () => {
    const user = setupUser();
    const inicio = diaDelMesEnCurso(10);
    const fin = diaDelMesEnCurso(20);

    const { rerender } = await renderPantalla();

    await user.click(screen.getByTestId(testId.filtroFecha));
    await user.click(await botonDelDia(inicio));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(ultimoDestino().get(CREATED_FROM_PARAM)).toBe(inicio);

    // El calendario es controlado por la URL: sin volver a pintar con ella no recordaria el inicio.
    rerender(await montaje(Object.fromEntries(ultimoDestino())));

    await user.click(await botonDelDia(fin));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(2));

    const destino = ultimoDestino();
    expect(destino.get(CREATED_FROM_PARAM)).toMatch(FORMATO_DE_DIA);
    expect(destino.get(CREATED_TO_PARAM)).toMatch(FORMATO_DE_DIA);
    expect(parseRecipeListParams(Object.fromEntries(destino)).filters).toEqual({
      [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: inicio, to: fin },
    });
  });

  it('R10: las filas son las que devolvio la operacion y en su orden, aunque la URL pida otro orden', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas(RECETAS_DEL_SIMULADOR));

    await renderPantalla({ [SORT_PARAM]: `name${SORT_SEPARATOR}asc` });

    expect(screen.getAllByTestId('data-table-cell-name').map((celda) => celda.textContent)).toEqual(
      RECETAS_DEL_SIMULADOR.map((laReceta) => laReceta.name),
    );
  });

  it('R12: una URL con pagina, tamano, orden, busqueda y rango pide la lista con todos ellos', async () => {
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([receta()], { page: 2, pageSize: MAX_PAGE_SIZE, total: 40 }),
    );

    await renderPantalla({
      [PAGE_PARAM]: '2',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: `createdAt${SORT_SEPARATOR}asc`,
      [SEARCH_PARAM]: 'acido',
      [CREATED_FROM_PARAM]: '2026-01-01',
      [CREATED_TO_PARAM]: '2026-01-31',
    });

    expect(listRecipesActionMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'createdAt', direction: 'asc' },
      filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: '2026-01-31' } },
      search: 'acido',
    });
    expect(screen.getByTestId(testId.busqueda)).toHaveValue('acido');
    expect(screen.getByTestId('data-table-head-createdAt')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('R13: los parametros invalidos se acotan uno a uno y la lista se presenta sin fallar', async () => {
    await renderPantalla({
      [PAGE_PARAM]: '-3',
      [PAGE_SIZE_PARAM]: '999',
      [SORT_PARAM]: `description${SORT_SEPARATOR}asc`,
      [SEARCH_PARAM]: '   ',
      [CREATED_FROM_PARAM]: '2026-02-30',
    });

    expect(listRecipesActionMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: null,
      filters: {},
      search: '',
    });
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.error)).toBeNull();
  });

  it('R14: mientras un gesto esta en vuelo la tabla se marca ocupada y el campo de busqueda conserva foco y texto', async () => {
    const user = setupUser();
    let soltar: () => void = () => undefined;
    const hasta = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    routerMock.push.mockImplementation(() => navegacionEnVuelo.iniciar?.());

    await renderPantalla(
      {},
      <Suspense fallback={null}>
        <NavegacionPendiente hasta={hasta} />
      </Suspense>,
    );

    const contenedor = screen.getByTestId(testId.tabla);
    expect(contenedor).toHaveAttribute('aria-busy', 'false');

    const busqueda = screen.getByTestId(testId.busqueda);
    await user.type(busqueda, 'acido');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByTestId(testId.busqueda)).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('acido');
    expect(screen.getAllByTestId(testId.fila)).toHaveLength(1);

    await act(async () => {
      soltar();
      await hasta;
    });
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
  });
});

describe('pantalla de recetas — datos y estados', () => {
  it('R15: pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle', async () => {
    await renderPantalla();

    expect(listRecipesActionMock).toHaveBeenCalledTimes(1);
    expect(getRecipeActionMock).not.toHaveBeenCalled();

    expect(document.querySelector('[data-testid^="recipe-line-unavailable-"]')).toBeNull();
    expect(document.querySelector('[data-testid="recipe-lines-unavailable-notice"]')).toBeNull();
  });

  it('R16: sin busqueda ni filtro y sin recetas presenta el vacio propio fuera de la tabla, con crear', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { total: 0 }));

    // El orden no cuenta como busqueda ni filtro.
    await renderPantalla({ [SORT_PARAM]: `name${SORT_SEPARATOR}asc` });

    const vacio = screen.getByTestId(testId.vacio);
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.sinResultados)).toBeNull();
    expect(within(vacio).getByTestId(testId.crear)).toHaveAttribute(
      'href',
      expect.stringContaining(`${FORMULAS_ROUTE}/nueva`),
    );
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('R17: una pagina que se quedo atras ofrece volver a la primera conservando tamano y orden', async () => {
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([], { page: 4, pageSize: MAX_PAGE_SIZE, total: 30, totalPages: 2 }),
    );

    await renderPantalla({
      [PAGE_PARAM]: '4',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: `name${SORT_SEPARATOR}desc`,
    });

    const destino = screen.getByTestId(testId.primeraPagina).getAttribute('href');

    expect(destino?.startsWith(FORMULAS_ROUTE)).toBe(true);
    expect(parseRecipeListParams(Object.fromEntries(consulta(destino)))).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'name', direction: 'desc' },
      filters: {},
      search: '',
    });
  });

  it('R18: mientras carga presenta el esqueleto propio con tantas filas como el tamano pedido y sin tabla', async () => {
    await renderPantallaCargando({ [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();

    const filas = within(esqueleto).getAllByTestId(testId.filaEsqueleto);
    expect(filas).toHaveLength(MAX_PAGE_SIZE);
    for (const fila of filas) {
      expect(within(fila).getAllByRole('cell')).toHaveLength(RECIPE_SKELETON_COLUMN_COUNT);
    }
  });

  it('R19: un error de la consulta presenta el error propio con reintento, fuera de la tabla', async () => {
    const user = setupUser();
    listRecipesActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es valida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es valida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.tablaCompartida)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R19: un error unauthorized se presenta y no se muestra ningun dato de la lista', async () => {
    listRecipesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Detergente industrial');
  });

  const ESTADOS_EXCLUYENTES = {
    error: testId.error,
    vacio: testId.vacio,
    sinResultados: testId.sinResultados,
    cargando: testId.esqueleto,
  } as const;

  function estadosVisibles(): string[] {
    const visibles = Object.entries(ESTADOS_EXCLUYENTES)
      .filter(([, id]) => screen.queryByTestId(id) !== null)
      .map(([estado]) => estado);
    return screen.queryAllByTestId(testId.fila).length > 0 ? [...visibles, 'filas'] : visibles;
  }

  it.each([
    {
      estado: 'error',
      montar: async () => {
        listRecipesActionMock.mockResolvedValue({
          status: 'error',
          code: 'invalid_input',
          message: 'La consulta no es valida.',
        });
        await renderPantalla();
      },
    },
    {
      estado: 'vacio',
      montar: async () => {
        listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { total: 0 }));
        await renderPantalla();
      },
    },
    {
      estado: 'sinResultados',
      montar: async () => {
        listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { total: 0 }));
        await renderPantalla({ [SEARCH_PARAM]: 'inexistente' });
      },
    },
    { estado: 'cargando', montar: async () => void (await renderPantallaCargando()) },
    { estado: 'filas', montar: async () => void (await renderPantalla()) },
  ])('R20: el estado «$estado» se presenta sin ninguno de los otros', async ({ estado, montar }) => {
    await montar();

    expect(estadosVisibles()).toEqual([estado]);
  });
});

describe('pantalla de recetas — sin resultados', () => {
  it('R32, R33: con busqueda y cero filas presenta sin resultados dentro de la tabla, sin crear, y limpiar conserva tamano y orden', async () => {
    const user = setupUser();
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([], { pageSize: MAX_PAGE_SIZE, total: 0 }),
    );

    await renderPantalla({
      [SEARCH_PARAM]: 'inexistente',
      [CREATED_FROM_PARAM]: '2026-01-01',
      [CREATED_TO_PARAM]: '2026-01-31',
      [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE),
      [SORT_PARAM]: `name${SORT_SEPARATOR}desc`,
    });

    const vacioDeLaTabla = screen.getByTestId(testId.vacioDeLaTabla);
    const sinResultados = screen.getByTestId(testId.sinResultados);
    expect(vacioDeLaTabla).toContainElement(sinResultados);
    expect(screen.getByTestId(testId.busqueda)).toHaveValue('inexistente');
    expect(screen.getByTestId(testId.filtroFecha)).toBeInTheDocument();

    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(within(vacioDeLaTabla).queryByTestId(testId.crear)).toBeNull();
    expect(screen.queryByTestId(testId.primeraPaginaSinResultados)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);

    const limpiar = within(sinResultados).getByTestId(testId.limpiarBusqueda);
    const destino = String(limpiar.getAttribute('href'));
    expect(destino.startsWith(`${FORMULAS_ROUTE}?`)).toBe(true);

    const parametros = consulta(destino);
    for (const retirado of [SEARCH_PARAM, CREATED_FROM_PARAM, CREATED_TO_PARAM]) {
      expect(parametros.has(retirado), retirado).toBe(false);
    }
    expect(parseRecipeListParams(Object.fromEntries(parametros))).toEqual({
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      sort: { columnId: 'name', direction: 'desc' },
      filters: {},
      search: '',
    });

    await user.click(limpiar);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(destino));
  });

  it('R32: con busqueda, cero filas y pagina 3 ofrece volver a la primera conservando busqueda, filtro, tamano y orden', async () => {
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { page: 3, total: 0 }));

    await renderPantalla({
      [PAGE_PARAM]: '3',
      [SEARCH_PARAM]: 'inexistente',
      [SORT_PARAM]: `createdAt${SORT_SEPARATOR}asc`,
      [CREATED_FROM_PARAM]: '2026-01-01',
    });

    const sinResultados = screen.getByTestId(testId.sinResultados);
    const destino = within(sinResultados)
      .getByTestId(testId.primeraPaginaSinResultados)
      .getAttribute('href');

    expect(destino?.startsWith(FORMULAS_ROUTE)).toBe(true);
    expect(parseRecipeListParams(Object.fromEntries(consulta(destino)))).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: { columnId: 'createdAt', direction: 'asc' },
      filters: { createdAt: { kind: 'dateRange', from: '2026-01-01', to: null } },
      search: 'inexistente',
    });
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('R14, R33: pasar de filas a sin resultados con el mismo arbol conserva el campo de busqueda, su foco y su texto', async () => {
    const user = setupUser();

    const { rerender } = await renderPantalla();

    const busqueda = screen.getByTestId(testId.busqueda);
    await user.type(busqueda, 'inexistente');
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    const destino = ultimoDestino();
    expect(destino.get(SEARCH_PARAM)).toBe('inexistente');

    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { total: 0 }));
    rerender(await montaje(Object.fromEntries(destino)));

    expect(await screen.findByTestId(testId.sinResultados)).toBeInTheDocument();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);
    expect(screen.getByTestId(testId.busqueda)).toBe(busqueda);
    expect(busqueda).toHaveFocus();
    expect(busqueda).toHaveValue('inexistente');
    expect(screen.getByTestId(testId.filtroFecha)).toBeInTheDocument();
  });
});

describe('pantalla de recetas — paginacion y plataforma', () => {
  it('R22: el selector de tamano ofrece 10 y 25, usa 10 por defecto y cambiarlo navega a la primera pagina', async () => {
    const user = setupUser();
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([receta()], { total: 40 }));

    await renderPantalla();

    expect(listRecipesActionMock).toHaveBeenCalledWith({
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

    await user.click(
      await esperarInteractiva(screen.getByTestId(`data-table-page-size-${MAX_PAGE_SIZE}`)),
    );
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    expect(ultimoDestino().get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(ultimoDestino().get(PAGE_PARAM)).toBe('1');
  });

  it('R23: permite avanzar y retroceder e indica la pagina actual y el total', async () => {
    const user = setupUser();
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([receta()], { page: 2, total: 30, totalPages: 3 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2' });

    const estado = screen.getByTestId(testId.estadoPagina);
    expect(estado).toHaveTextContent('2');
    expect(estado).toHaveTextContent('3');

    await user.click(screen.getByTestId(testId.paginaSiguiente));
    expect(consulta(routerMock.push.mock.calls[0][0]).get(PAGE_PARAM)).toBe('3');

    await user.click(screen.getByTestId(testId.paginaAnterior));
    expect(consulta(routerMock.push.mock.calls[1][0]).get(PAGE_PARAM)).toBe('1');
  });

  it('R23: en los extremos no ofrece avanzar ni retroceder mas alla', async () => {
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([receta()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
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

  it('R24: en viewport angosto y ancho la lista, sus acciones, el orden, la busqueda y el filtro estan a la vista y son tactiles', async () => {
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.crear), `crear a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();

      const controles: Record<string, HTMLElement> = {
        editar: screen.getByTestId(testId.editar),
        borrar: screen.getByTestId(testId.abrirBorrado),
        busqueda: screen.getByTestId(testId.busqueda),
        filtro: screen.getByTestId(testId.filtroFecha),
        orden: botonDeOrden('name') as HTMLElement,
      };
      for (const [nombre, control] of Object.entries(controles)) {
        expect(control, `${nombre} a ${ancho}px`).toBeVisible();
        for (const clase of AREA_TACTIL) {
          expect(control, `${nombre} a ${ancho}px`).toHaveClass(clase);
        }
      }
      // Por debajo de 16 px iOS amplia la pagina al enfocar el campo.
      expect(controles.busqueda, `busqueda a ${ancho}px`).toHaveClass('text-base');

      cleanup();
    }
  });

  it('QC-26 R25: la zona privada sigue teniendo exactamente una region de avisos', async () => {
    // `sonner` solo pinta su lista con avisos en cola; la `section` con `aria-live` esta siempre.
    await renderPantalla();

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });
});

describe('pantalla de recetas — borrado (QC-26 R24, R39)', () => {
  it('el borrado pide confirmacion nombrando la receta y sin confirmar no invoca la operacion', async () => {
    const user = setupUser();
    const laReceta = receta({ name: 'Ácido peracético' });
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([laReceta]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));

    const dialogo = await screen.findByTestId(testId.dialogoBorrado);
    expect(within(dialogo).getByTestId(testId.mensajeBorrado)).toHaveTextContent(laReceta.name);
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(testId.cancelarBorrado));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(deleteRecipeActionMock).toHaveBeenCalledTimes(1));
    expect(deleteRecipeActionMock).toHaveBeenCalledWith(laReceta.id);
  });

  it('un borrado con exito cierra el dialogo, avisa por toast y refresca la lista', async () => {
    const user = setupUser();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('un borrado rechazado muestra el error en el dialogo y no navega ni refresca', async () => {
    const user = setupUser();
    deleteRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    const error = await screen.findByTestId('delete-recipe-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('No autorizado.');
    expect(screen.getByTestId(testId.dialogoBorrado)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('lista de recetas — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    listRecipesActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();

    const region = screen.getByTestId(testId.error);
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    listRecipesActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('unauthorized');
    esperarSinIdentificador();
  });
});

describe('borrado de receta — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    deleteRecipeActionMock.mockResolvedValue(errorInesperado());

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    const region = await screen.findByTestId('delete-recipe-error');
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    const region = await screen.findByTestId('delete-recipe-error');
    expect(region).toHaveTextContent('No autorizado.');
    esperarSinIdentificador();
  });
});
