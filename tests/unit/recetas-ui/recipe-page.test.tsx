import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import FormulasPage from '@/app/(private)/produccion/formulas/page';
import {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  RECIPE_COLUMNS,
  parseRecipeListParams,
} from '@/app/(private)/produccion/formulas/components';
import { PRIVATE_NAV_ITEMS, RECIPES_LABEL } from '@/lib/shared/navigation/private-nav';
import type { SessionUser } from '@/lib/modules/identity';
import type { RecipeSummary } from '@/lib/modules/recetas';
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

/**
 * Pantalla de recetas — lista, render dentro del armazon privado: R1, R7, R8-R19, R25, R39, R50
 * (`specs/QC-26-pantalla-de-recetas/tasks.md > T20`).
 *
 * La pantalla se monta **dentro del layout privado** —igual que en produccion— reutilizando el
 * patron de mocks de `tests/unit/inventario/product-page.test.tsx` y el helper
 * `tests/helpers/viewport.ts`: jsdom no implementa `matchMedia` y el layout lo usa.
 *
 * **`listRecipesAction` y `deleteRecipeAction` estan mockeadas.** No es un atajo: son el borde
 * del modulo `recetas` (QC-25, `done`), que esta ficha no abre, y sustituirlas es lo unico que
 * permite ejercitar los tres estados de la lista y un borrado sin base de datos.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre
 * literales de copy. Donde aparece texto es **dato del fixture** —el nombre de una receta, el
 * mensaje que devuelve una action—, no copy de la pantalla.
 *
 * **R9, R10, R14, R25 son tests en negativo a proposito**: mostrar el id o el autor, pedir el
 * detalle por fila, colar un buscador o un segundo `<Toaster />` son justo las cosas que una
 * feature posterior puede anadir sin que nada se ponga rojo.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-42',
  username: 'carla.duarte',
  displayName: 'Carla Duarte Salas',
  roleName: 'Administrador',
  // QC-74 T8: `SessionUser` exige `permissions`. Vacio: este test no autoriza nada.
  permissions: [],
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

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
  deleteRecipeAction: deleteRecipeActionMock,
}));

const testId = {
  content: 'private-content',
  titulo: 'recipes-title',
  lista: 'recipe-list',
  tabla: 'recipe-table',
  fila: 'recipe-row',
  esqueleto: 'recipe-table-skeleton',
  filaEsqueleto: 'recipe-row-skeleton',
  vacio: 'recipe-list-empty',
  primeraPagina: 'recipe-list-first-page',
  error: 'recipe-list-error',
  errorMensaje: 'recipe-list-error-message',
  errorCodigo: 'recipe-list-error-code',
  reintentar: 'recipe-list-retry',
  tamanoPagina: 'recipe-page-size',
  paginaAnterior: 'recipe-page-previous',
  paginaSiguiente: 'recipe-page-next',
  estadoPagina: 'recipe-page-status',
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

/**
 * Ids de autoria del fixture. Cadenas **inconfundibles** a proposito: el test en negativo de R9
 * busca su ausencia en todo el documento, y con un id realista no distinguiria entre «no se
 * muestra» y «se muestra pero parece otra cosa».
 */
const ID_QUE_NO_DEBE_VERSE = 'RECETA-ID-NO-VISIBLE';
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';

function receta(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: ID_QUE_NO_DEBE_VERSE,
    name: 'Detergente industrial',
    description: 'Fórmula base para limpieza pesada',
    imageUrl: 'https://storage.example.com/recetas/detergente.png',
    stepCount: 3,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: AUTOR_QUE_NO_DEBE_VERSE,
    updatedBy: EDITOR_QUE_NO_DEBE_VERSE,
    ...overrides,
  };
}

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

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar
 * un componente `async`, asi que sin esto la lista no llegaria a pintarse nunca. Lo que se
 * conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key` y su `fallback` siguen
 * siendo los que declara la pagina.
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

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo async. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return FormulasPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla dentro del layout privado, con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await resolverServerComponents(await arbolDeLaPantalla(searchParams));
  return render(await PrivateLayout({ children: arbol }));
}

/** Monta la pantalla con la lista aun en vuelo: `<Suspense>` pinta su `fallback` (R16). */
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await PrivateLayout({ children: await arbolDeLaPantalla(searchParams) }));
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
});

describe('pantalla de recetas — ubicacion y navegacion', () => {
  it('la lista de recetas se renderiza dentro del armazon privado y no declara main propio', async () => {
    // R1
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));
    expect(armazon).toContainElement(screen.getByTestId(testId.tabla));
  });

  it('el item del sidebar comparte RECIPES_LABEL con el encabezado y ya no dice Formulas', async () => {
    // R5 — mismo simbolo importado a los dos lados, nunca un literal de copy repetido.
    await renderPantalla();

    expect(screen.getByTestId(testId.titulo)).toHaveTextContent(RECIPES_LABEL);

    const itemRecetas = screen.getByTestId('nav-produccion-recetas');
    expect(itemRecetas).toHaveTextContent(RECIPES_LABEL);
    expect(itemRecetas.textContent).not.toContain('Fórmulas');

    // El item que declara la navegacion apunta al mismo prefijo que la pantalla monta.
    const declarado = PRIVATE_NAV_ITEMS.flatMap((item) =>
      item.kind === 'group' ? item.items : [item],
    ).find((item) => item.testId === 'nav-produccion-recetas');
    expect(declarado?.href).toBe(FORMULAS_ROUTE);
    expect(declarado?.label).toBe(RECIPES_LABEL);
  });
});

describe('pantalla de recetas — lista', () => {
  it('la lista presenta todas las columnas de negocio declaradas', async () => {
    // R8 — se itera la DECLARACION de columnas de texto y se comprueba la imagen aparte.
    const laReceta = receta();
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([laReceta]));

    await renderPantalla();

    for (const columna of RECIPE_COLUMNS) {
      expect(
        screen.getByTestId(columna.testId),
        `falta el encabezado de «${columna.key}»`,
      ).toBeInTheDocument();
      expect(screen.getByTestId(`recipe-cell-${columna.key}`)).toHaveTextContent(
        columna.value(laReceta),
      );
    }

    expect(RECIPE_COLUMNS.map((columna) => columna.key)).toEqual([
      'name',
      'description',
      'stepCount',
      'createdAt',
      'updatedAt',
    ]);

    expect(screen.getByTestId(testId.imagen)).toHaveAttribute('src', laReceta.imageUrl);
  });

  it('la lista no muestra id, createdBy ni updatedBy', async () => {
    // R9 — test **en negativo**: los ids de autoria y el identificador tecnico estan en los
    // datos y no pueden llegar a la pantalla. Anadir una columna que los pinte pone esto rojo.
    await renderPantalla();

    expect(document.body.textContent).not.toContain(ID_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(EDITOR_QUE_NO_DEBE_VERSE);

    for (const prohibida of ['id', 'createdBy', 'updatedBy']) {
      expect(
        RECIPE_COLUMNS.some((columna) => String(columna.key) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`recipe-cell-${prohibida}`)).toBeNull();
    }
  });

  it('pintar una pagina invoca la operacion de listado una sola vez y nunca la de detalle', async () => {
    // R10 — los dos hechos en negativo: una sola invocacion de listado, y cero de detalle. Y la
    // lista no pinta ninguna marca de linea con producto de baja: no tiene de donde sacarla.
    await renderPantalla();

    expect(listRecipesActionMock).toHaveBeenCalledTimes(1);
    expect(getRecipeActionMock).not.toHaveBeenCalled();

    expect(document.querySelector('[data-testid^="recipe-line-unavailable-"]')).toBeNull();
    expect(document.querySelector('[data-testid="recipe-lines-unavailable-notice"]')).toBeNull();
  });

  it('el selector de tamano ofrece 10 y 25 y usa 10 por defecto', async () => {
    // R11 — el defecto se observa en lo que se le PIDE al backend; las dos opciones, en el
    // selector.
    const user = userEvent.setup();
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([receta()], { total: 40 }));

    await renderPantalla();

    expect(listRecipesActionMock).toHaveBeenCalledWith({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`recipe-page-size-${tamano}`)).toBeInTheDocument();
    }

    // Elegir el otro tamano NAVEGA: no hay estado local que mienta sobre la URL.
    await user.click(screen.getByTestId(`recipe-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    expect(destino.get(PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder e indica la pagina actual y el total', async () => {
    // R12
    const user = userEvent.setup();
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([receta()], { page: 2, total: 30, totalPages: 3 }),
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
    // R12 — el indicador no puede prometer una pagina que no existe.
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([receta()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
  });

  it('los parametros invalidos o fuera de rango se acotan y presentan la lista sin fallar', async () => {
    // R13 — la pantalla nunca falla por un parametro malo: pide la primera pagina/defecto.
    await renderPantalla({ [PAGE_PARAM]: '-3', [PAGE_SIZE_PARAM]: '999' });

    expect(listRecipesActionMock).toHaveBeenCalledWith({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(screen.getByTestId(testId.tabla)).toBeInTheDocument();
  });

  it('la pantalla no ofrece busqueda ni control de orden', async () => {
    // R14 — test **en negativo**: filtrar en cliente solo miraria dentro de la pagina cargada, y
    // el backend no soporta ni busqueda ni orden configurable.
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

  it('sin recetas presenta el estado vacio con la accion de crear', async () => {
    // R15 — una tabla con cero filas dice lo mismo que una consulta que fallo: no sirve.
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(within(vacio).getByTestId(testId.crear)).toBeInTheDocument();
    expect(within(vacio).getByTestId(testId.crear)).toHaveAttribute(
      'href',
      expect.stringContaining(`${FORMULAS_ROUTE}/nueva`),
    );
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('una pagina que se quedo atras ofrece volver a la primera', async () => {
    // R12 + R15
    listRecipesActionMock.mockResolvedValue(
      paginaDeRecetas([], { page: 4, total: 12, totalPages: 2 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '4' });

    const destino = screen.getByTestId(testId.primeraPagina).getAttribute('href');

    expect(destino?.startsWith(FORMULAS_ROUTE)).toBe(true);
    expect(
      parseRecipeListParams(
        Object.fromEntries(new URLSearchParams(String(destino).split('?')[1])),
      ),
    ).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('mientras carga presenta el esqueleto en lugar de la lista', async () => {
    // R16 — la seccion es un Server Component async: sin resolver queda suspendida y el
    // `<Suspense>` de la pagina pinta su `fallback`.
    await renderPantallaCargando({ [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    const esqueleto = screen.getByTestId(testId.esqueleto);
    expect(esqueleto).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();

    expect(within(esqueleto).getAllByTestId(testId.filaEsqueleto)).toHaveLength(MAX_PAGE_SIZE);
  });

  it('un error de la consulta presenta el estado de error con reintento y no una lista vacia', async () => {
    // R17
    const user = userEvent.setup();
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
    expect(screen.queryByTestId(testId.vacio)).toBeNull();

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('un error unauthorized se presenta y no se muestra ningun dato del catalogo', async () => {
    // R7 — la pantalla no decide autorizacion: presenta lo que la operacion responde y no
    // ensena ni un dato.
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

  it('la imagen se pinta con la direccion que entrega la consulta y sin imagen se pinta el marcador', async () => {
    // R18
    const conImagen = receta({ imageUrl: 'https://cdn.example.com/una-receta.jpg' });
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([conImagen]));

    await renderPantalla();
    expect(screen.getByTestId(testId.imagen)).toHaveAttribute('src', conImagen.imageUrl as string);
    expect(screen.queryByTestId(testId.imagenMarcador)).toBeNull();

    cleanup();

    const sinImagen = receta({ imageUrl: null });
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([sinImagen]));
    await renderPantalla();

    expect(screen.queryByTestId(testId.imagen)).toBeNull();
    expect(screen.getByTestId(testId.imagenMarcador)).toBeInTheDocument();
    // Ningun `<img>` con `src` vacio: en algunos navegadores dispara una peticion a la propia
    // pagina.
    expect(document.querySelector('img[src=""]')).toBeNull();
  });

  it('el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro', async () => {
    // R19
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

    const fila = screen.getByTestId(testId.fila);
    expect(within(fila).getByTestId(testId.editar)).toBeVisible();
    expect(within(fila).getByTestId(testId.abrirBorrado)).toBeVisible();
  });

  it('crear y editar navegan a su pagina propia y no abren panel ni modal', async () => {
    // R20 — en negativo: nada de `role="dialog"` al hacer clic, porque son enlaces reales.
    await renderPantalla();

    const crear = screen.getByTestId(testId.crear);
    expect(crear.tagName).toBe('A');
    expect(crear).toHaveAttribute('href', expect.stringContaining(`${FORMULAS_ROUTE}/nueva`));

    const editar = screen.getByTestId(testId.editar);
    expect(editar.tagName).toBe('A');
    expect(editar.getAttribute('href')).toBe(`${FORMULAS_ROUTE}/${ID_QUE_NO_DEBE_VERSE}`);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('la zona privada sigue teniendo exactamente una region de avisos', async () => {
    // R25 — en negativo: ningun `<Toaster />` propio, solo el que el layout ya monta.
    //
    // `sonner` solo pinta el `<ol data-sonner-toaster>` cuando hay algun toast en cola; lo que
    // si esta siempre montado es su `<section aria-live>` con `role="region"` (mismo criterio
    // que `tests/unit/private-layout.test.tsx`).
    await renderPantalla();

    const regiones = screen.getAllByRole('region');
    expect(regiones).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('presenta la lista y sus acciones en viewport angosto y en ancho', async () => {
    // R50 — targets tactiles y sin `100vh`; ancho y angosto a los dos lados del breakpoint.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.crear), `crear a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.editar), `editar a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.abrirBorrado), `borrado a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();

      cleanup();
    }
  });
});

describe('pantalla de recetas — borrado', () => {
  it('el borrado pide confirmacion nombrando la receta y sin confirmar no invoca la operacion', async () => {
    // R39 — el criterio de honestidad exige comprobar que SIN confirmar la operacion NO se
    // llama, no solo que el dialogo aparece.
    const user = userEvent.setup();
    const laReceta = receta({ name: 'Ácido peracético' });
    listRecipesActionMock.mockResolvedValue(paginaDeRecetas([laReceta]));

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));

    const dialogo = await screen.findByTestId(testId.dialogoBorrado);
    expect(within(dialogo).getByTestId(testId.mensajeBorrado)).toHaveTextContent(laReceta.name);
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    // Cancelar no borra nada.
    await user.click(screen.getByTestId(testId.cancelarBorrado));
    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(deleteRecipeActionMock).not.toHaveBeenCalled();

    // Solo al confirmar se invoca la operacion, con el id de la receta.
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(deleteRecipeActionMock).toHaveBeenCalledTimes(1));
    expect(deleteRecipeActionMock).toHaveBeenCalledWith(laReceta.id);
  });

  it('un borrado con exito cierra el dialogo, avisa por toast y refresca la lista', async () => {
    // R24
    const user = userEvent.setup();

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirBorrado));
    await screen.findByTestId(testId.dialogoBorrado);
    await user.click(screen.getByTestId(testId.confirmarBorrado));

    await waitFor(() => expect(screen.queryByTestId(testId.dialogoBorrado)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('un borrado rechazado muestra el error en el dialogo y no navega ni refresca', async () => {
    // R39 — el rechazo se ve, el dialogo sigue abierto y no hay exito falso.
    const user = userEvent.setup();
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
