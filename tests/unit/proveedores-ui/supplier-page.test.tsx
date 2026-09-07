import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import PrivateLayout from '@/app/(private)/layout';
import ProveedoresPage from '@/app/(private)/proveedores/page';
import {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  SUPPLIER_COLUMNS,
  parseSupplierListParams,
} from '@/app/(private)/proveedores/components';
import { PERMISSIONS, type SessionUser } from '@/lib/modules/identity';
import { createSupplierSchema, type SupplierView } from '@/lib/modules/proveedores';
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
 * Pantalla de la lista de proveedores, render dentro del armazon privado: R1, R7, R9, R11, R12,
 * R13, R14, R15, R16, R17, R18, R47 y R48
 * (`specs/QC-44-pantalla-de-proveedores/tasks.md > T4, T5, T6`).
 *
 * La pantalla se monta **dentro del layout privado** —igual que en produccion— reutilizando el
 * patron de mocks de `tests/unit/private-layout.test.tsx` (`next/headers`, `next/navigation`,
 * `@/lib/composition`) y el helper `tests/helpers/viewport.ts`: jsdom no implementa `matchMedia`
 * y el layout lo usa.
 *
 * **`listSuppliersAction` esta mockeada.** No es un atajo: es el borde del modulo `proveedores`
 * (QC-43/QC-52, `done` y mergeado), que esta ficha no abre (R49), y sustituirla es lo unico que
 * permite ejercitar los tres estados de la lista sin base de datos.
 *
 * **Los asserts van sobre roles ARIA, `data-testid` y constantes exportadas**, nunca sobre
 * literales de copy (decision del 2026-09-04). Donde aparece texto es **dato del fixture** —el
 * nombre de un proveedor, el mensaje que devuelve la action—, no copy de la pantalla.
 *
 * **R11 y R12 son tests en negativo a proposito**: mostrar quien creo el proveedor, o colar un
 * buscador que solo filtraria la pagina visible, son justo las cosas que una feature posterior
 * puede anadir sin que nada se ponga rojo.
 */

type CookieStoreStub = {
  get: (name: string) => { name: string; value: string } | undefined;
};

const USUARIO_DEL_TEST: SessionUser = {
  id: 'u-test-44',
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

const testId = {
  content: 'private-content',
  titulo: 'proveedores-title',
  lista: 'supplier-list',
  tabla: 'supplier-table',
  fila: 'supplier-row',
  enlaceDetalle: 'supplier-detail-link',
  esqueleto: 'supplier-table-skeleton',
  filaEsqueleto: 'supplier-row-skeleton',
  vacio: 'supplier-list-empty',
  primeraPagina: 'supplier-list-first-page',
  error: 'supplier-list-error',
  errorMensaje: 'supplier-list-error-message',
  errorCodigo: 'supplier-list-error-code',
  reintentar: 'supplier-list-retry',
  tamanoPagina: 'supplier-page-size',
  paginaAnterior: 'supplier-page-previous',
  paginaSiguiente: 'supplier-page-next',
  estadoPagina: 'supplier-page-status',
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

/**
 * Datos validos del formulario de proveedor. Valores del test, nunca los del fixture de lista:
 * asi un assert sobre lo enviado no puede pasar por casualidad.
 *
 * Lleva telefono Y correo a proposito: el esquema del contrato publico exige **al menos uno** de
 * los dos (`supplier-input.ts`, regla cruzada de QC-42/QC-43), y el caso de que falten los dos
 * tiene su propio test.
 */
const ALTA_VALIDA: Readonly<Record<string, string>> = {
  name: 'Ácido Cítrico del Bajío',
  phone: '+52 33 9876 5432',
  email: 'compras@acidocitrico.example',
};

/** Rellena el formulario abierto. Vacia primero: el panel puede venir precargado (edicion). */
async function rellenarFormulario(
  user: ReturnType<typeof userEvent.setup>,
  valores: Readonly<Record<string, string>> = {},
) {
  const datos = { ...ALTA_VALIDA, ...valores };
  for (const [campo, valor] of Object.entries(datos)) {
    const control = screen.getByTestId(`supplier-field-${campo}`);
    await user.clear(control);
    if (valor !== '') await user.type(control, valor);
  }
}

/**
 * Ids de autoria del fixture. Son cadenas **inconfundibles** a proposito: el test en negativo de
 * R12 busca su ausencia en todo el documento, y con un id realista no distinguiria entre «no se
 * muestra» y «se muestra pero parece otra cosa».
 */
const AUTOR_QUE_NO_DEBE_VERSE = 'AUTOR-CREADOR-NO-VISIBLE';
const EDITOR_QUE_NO_DEBE_VERSE = 'AUTOR-EDITOR-NO-VISIBLE';

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
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente.
 *
 * **No es un atajo, es una limitacion real del entorno**: `react-dom` en jsdom no sabe ejecutar
 * un componente `async` —se queda suspendido para siempre—, asi que sin esto la lista no llegaria
 * a pintarse nunca. Lo que se conserva es el arbol REAL de `page.tsx`: la `<Suspense>`, su `key`
 * y su `fallback` siguen siendo los que declara la pagina.
 *
 * El test de R17 se apoya justamente en lo contrario: renderizar el arbol SIN resolver deja la
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
  // original fueran hijos estaticos.
  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

type Consulta = Record<string, string | string[] | undefined>;

/** Arbol que devuelve la pagina real, sin resolver: la seccion sigue siendo async. */
async function arbolDeLaPantalla(searchParams: Consulta = {}) {
  return ProveedoresPage({ searchParams: Promise.resolve(searchParams) });
}

/** Monta la pantalla dentro del layout privado, con la lista ya resuelta. */
async function renderPantalla(searchParams: Consulta = {}) {
  const arbol = await resolverServerComponents(await arbolDeLaPantalla(searchParams));
  return render(await PrivateLayout({ children: arbol }));
}

/** Monta la pantalla con la lista aun en vuelo: `<Suspense>` pinta su `fallback` (R17). */
async function renderPantallaCargando(searchParams: Consulta = {}) {
  return render(await PrivateLayout({ children: await arbolDeLaPantalla(searchParams) }));
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
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
  resetViewport();
  clearSidebarStateCookie();
});

describe('pantalla de proveedores — lista', () => {
  it('se renderiza dentro del armazon privado y no declara un landmark principal propio', async () => {
    // R1 — `SidebarInset` del layout privado ya es el `main`, y tiene que seguir siendo unico.
    await renderPantalla();

    const principales = screen.getAllByRole('main');
    expect(principales).toHaveLength(1);

    const armazon = screen.getByTestId(testId.content);
    expect(armazon).toBe(principales[0]);
    expect(armazon).toContainElement(screen.getByTestId(testId.titulo));
    expect(armazon).toContainElement(screen.getByTestId(testId.tabla));
  });

  it('la tabla presenta las columnas de negocio declaradas', async () => {
    // R14 — se itera la DECLARACION de columnas en vez de listar los literales uno a uno: quitar
    // una columna deja este test sin encabezado que encontrar.
    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();

    for (const columna of SUPPLIER_COLUMNS) {
      expect(
        screen.getByTestId(columna.testId),
        `falta el encabezado de «${columna.key}»`,
      ).toBeInTheDocument();
      expect(screen.getByTestId(`supplier-cell-${columna.key}`)).toHaveTextContent(
        columna.value(elProveedor),
      );
    }

    // Las cinco columnas que pide R14, por su clave y en su orden de lectura.
    expect(SUPPLIER_COLUMNS.map((columna) => columna.key)).toEqual([
      'name',
      'phone',
      'email',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('ninguna columna es createdBy ni updatedBy, y esos ids no llegan al documento', async () => {
    // R12 — test **en negativo**: los ids de autoria estan en los datos (`SupplierView` los trae)
    // y no pueden llegar a la pantalla. Anadir una columna que los pinte pone esto rojo.
    await renderPantalla();

    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
    expect(document.body.textContent).not.toContain(EDITOR_QUE_NO_DEBE_VERSE);

    for (const prohibida of ['createdBy', 'updatedBy', 'id', 'nameNormalized']) {
      expect(
        SUPPLIER_COLUMNS.some((columna) => String(columna.key) === prohibida),
        `«${prohibida}» no puede ser columna`,
      ).toBe(false);
      expect(screen.queryByTestId(`supplier-cell-${prohibida}`)).toBeNull();
    }
  });

  it('cada fila enlaza al detalle con la ruta que devuelve el helper, no con un literal', async () => {
    // R15, R3 — el destino se DERIVA de `supplierDetailRoute(id)`: si alguien lo escribiera a
    // mano y el helper cambiara de forma, esta comparacion cae.
    const elProveedor = proveedor();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([elProveedor]));

    await renderPantalla();

    const enlace = within(screen.getByTestId(testId.fila)).getByTestId(testId.enlaceDetalle);
    expect(enlace.getAttribute('href')).toBe(supplierDetailRoute(elProveedor.id));
    expect(enlace.getAttribute('href')?.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    // Y es un enlace de verdad, no un boton que finge navegar.
    expect(enlace.tagName).toBe('A');
  });

  it('el desbordamiento horizontal lo absorbe el envoltorio de la tabla y ningun ancestro', async () => {
    // R13 — el scroll horizontal es de la tabla, nunca del documento; y nada de `100vh`
    // (R48: en movil la barra de direcciones lo convierte en un alto que no existe).
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
  });

  it('la lista y sus acciones de fila se usan igual en viewport angosto y en ancho', async () => {
    // R48 — mismo criterio que QC-11 y QC-22: se comprueba en los dos anchos, sin excepcion de
    // escritorio. El area tactil de la accion de fila llega a 44x44 px (`min-h-11 min-w-11`) y
    // **no depende de `:hover`** para descubrirse.
    for (const ancho of [NARROW_VIEWPORT, WIDE_VIEWPORT]) {
      setViewportWidth(ancho);
      await renderPantalla();

      expect(screen.getByTestId(testId.tabla), `tabla a ${ancho}px`).toBeVisible();
      expect(screen.getByTestId(testId.tamanoPagina), `tamano a ${ancho}px`).toBeVisible();

      const enlace = screen.getByTestId(testId.enlaceDetalle);
      expect(enlace, `enlace al detalle a ${ancho}px`).toBeVisible();
      expect(enlace.className, `area tactil a ${ancho}px`).toContain('min-h-11');
      expect(enlace.className, `area tactil a ${ancho}px`).toContain('min-w-11');
      expect(enlace.className, `nada oculto tras el puntero a ${ancho}px`).not.toContain('hidden');

      cleanup();
    }
  });

  it('el selector de tamano de pagina ofrece 10 y 25, usa 10 por defecto y al cambiar recarga', async () => {
    // R8 — el defecto se observa en lo que se le PIDE al backend, que es quien decide la
    // consulta; las dos opciones, en el selector; y cambiarlo NAVEGA, no guarda estado local.
    const user = userEvent.setup();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([proveedor()], { total: 40 }));

    await renderPantalla();

    expect(listSuppliersActionMock).toHaveBeenCalledTimes(1);
    expect(listSuppliersActionMock).toHaveBeenCalledWith({ page: 1, pageSize: DEFAULT_PAGE_SIZE });

    await user.click(screen.getByTestId(testId.tamanoPagina));

    const opciones = await screen.findAllByRole('option');
    expect(opciones).toHaveLength(PAGE_SIZE_OPTIONS.length);
    for (const tamano of PAGE_SIZE_OPTIONS) {
      expect(screen.getByTestId(`supplier-page-size-${tamano}`)).toBeInTheDocument();
    }

    await user.click(screen.getByTestId(`supplier-page-size-${MAX_PAGE_SIZE}`));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));

    const destino = new URLSearchParams(String(routerMock.push.mock.calls[0][0]).split('?')[1]);
    expect(destino.get(PAGE_SIZE_PARAM)).toBe(String(MAX_PAGE_SIZE));
    // Cambiar el tamano vuelve a la primera pagina: la «pagina 7» de 10 puede no existir con 25.
    expect(destino.get(PAGE_PARAM)).toBe('1');
  });

  it('permite avanzar y retroceder de pagina e indica la pagina actual y el total', async () => {
    // R9
    const user = userEvent.setup();
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 2, total: 30, totalPages: 3 }),
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
    // R9 — el indicador no puede prometer una pagina que no existe.
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 1, total: 5, totalPages: 1 }),
    );

    await renderPantalla();

    expect(screen.getByTestId(testId.paginaAnterior)).toBeDisabled();
    expect(screen.getByTestId(testId.paginaSiguiente)).toBeDisabled();
  });

  it('la pantalla no ofrece busqueda ni control de orden', async () => {
    // R11 — test **en negativo**: filtrar en cliente solo buscaria dentro de la pagina visible,
    // y el backend (`pageQuerySchema`) solo acepta `page` y `pageSize`.
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
});

describe('pantalla de proveedores — los tres estados', () => {
  it('los tres estados se distinguen por data-testid distintos', async () => {
    // R16, R17, R18 y R47 — vacio, cargando y error no pueden confundirse entre si: cada uno
    // tiene su identificador estable y ninguno es el de otro.
    const identificadores = [testId.vacio, testId.esqueleto, testId.error];
    expect(new Set(identificadores).size).toBe(identificadores.length);

    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));
    await renderPantalla();
    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.esqueleto)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
    cleanup();

    await renderPantallaCargando();
    expect(screen.getByTestId(testId.esqueleto)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.error)).toBeNull();
    cleanup();

    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });
    await renderPantalla();
    expect(screen.getByTestId(testId.error)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryByTestId(testId.esqueleto)).toBeNull();
  });

  it('sin proveedores presenta el estado vacio en lugar de una tabla sin filas', async () => {
    // R16 — una tabla con cero filas dice lo mismo que una consulta que fallo: no sirve.
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));

    await renderPantalla();

    expect(screen.getByTestId(testId.vacio)).toBeInTheDocument();
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    // Lista realmente vacia: no se ofrece «volver a la primera pagina», que ya es esta.
    expect(screen.queryByTestId(testId.primeraPagina)).toBeNull();
  });

  it('una pagina que se quedo atras ofrece volver a la primera', async () => {
    // R10 + R16 — caso «la pagina se vacio tras una baja»: no es un error, es un vacio con
    // salida, y el destino se deriva de la constante de ruta (R2), no de un literal.
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([], { page: 4, total: 12, totalPages: 2 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '4' });

    const destino = screen.getByTestId(testId.primeraPagina).closest('a')?.getAttribute('href');

    expect(destino?.startsWith(SUPPLIERS_ROUTE)).toBe(true);
    expect(
      parseSupplierListParams(
        Object.fromEntries(new URLSearchParams(String(destino).split('?')[1])),
      ),
    ).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('mientras carga presenta el esqueleto en lugar de la tabla', async () => {
    // R17 — la seccion es un Server Component async: sin resolver queda suspendida y el
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

  it('un error de la consulta presenta el estado de error con reintento y NO una tabla vacia', async () => {
    // R18 — confundir «fallo» con «no hay nada» es justo lo que este requisito impide.
    const user = userEvent.setup();
    listSuppliersActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La consulta no es válida.',
    });

    await renderPantalla();

    expect(screen.getByTestId(testId.error)).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(testId.errorMensaje)).toHaveTextContent('La consulta no es válida.');
    expect(screen.getByTestId(testId.errorCodigo)).toHaveTextContent('invalid_input');

    // Ni tabla, ni lista, ni estado vacio: el fallo no se disfraza de catalogo sin proveedores.
    expect(screen.queryByTestId(testId.tabla)).toBeNull();
    expect(screen.queryByTestId(testId.lista)).toBeNull();
    expect(screen.queryByTestId(testId.vacio)).toBeNull();
    expect(screen.queryAllByTestId(testId.fila)).toHaveLength(0);

    await user.click(screen.getByTestId(testId.reintentar));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('un unauthorized de la operacion no muestra ningun dato de proveedores', async () => {
    // R7 — la pantalla no repite `requireAdmin` ni lee la sesion para decidir que pinta: si la
    // operacion corta, se presenta el error y **no** se ensena ni un dato. Consecuencia
    // deliberada de `design.md > 3`: sin la regla ruta->rol, la pantalla se veria pero seguiria
    // sin mostrar nada.
    const nombreQueNoDebeVerse = 'PROVEEDOR-QUE-NO-DEBE-VERSE';
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
    expect(document.body.textContent).not.toContain(nombreQueNoDebeVerse);
    expect(document.body.textContent).not.toContain(AUTOR_QUE_NO_DEBE_VERSE);
  });
});

describe('pantalla de proveedores — alta y edicion en panel lateral', () => {
  it('el alta se abre en un panel lateral sobre la lista, sin navegar ni perder la pagina', async () => {
    // R26 — panel lateral, NO dialogo modal centrado y NO otra URL. Y al cerrarse se vuelve a la
    // lista con la MISMA pagina y el MISMO tamano: sale gratis porque el estado de lista vive en
    // la cadena de consulta, asi que no hay ni una consulta de mas ni una navegacion.
    const user = userEvent.setup();
    listSuppliersActionMock.mockResolvedValue(
      paginaDeProveedores([proveedor()], { page: 2, pageSize: MAX_PAGE_SIZE, total: 60 }),
    );

    await renderPantalla({ [PAGE_PARAM]: '2', [PAGE_SIZE_PARAM]: String(MAX_PAGE_SIZE) });

    expect(listSuppliersActionMock).toHaveBeenCalledWith({ page: 2, pageSize: MAX_PAGE_SIZE });

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
    const user = userEvent.setup();
    listSuppliersActionMock.mockResolvedValue(paginaDeProveedores([], { total: 0 }));

    await renderPantalla();

    const vacio = screen.getByTestId(testId.vacio);
    await user.click(within(vacio).getByTestId(testId.abrirAlta));

    expect(await screen.findByTestId(testId.formulario)).toBeInTheDocument();
  });

  it('el alta captura nombre, telefono y correo y los envia por la operacion de alta', async () => {
    // R27, R43 — la mutacion sale por la Server Action del modulo; ningun `fetch` a rutas propias.
    const user = userEvent.setup();

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
    const user = userEvent.setup();
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

  it('un duplicate_name se pinta junto al campo nombre, sin cerrar el panel ni perder lo escrito', async () => {
    // R32 (primera mitad) — el error identifica campo, asi que va JUNTO al campo. Y se decide por
    // el `code` estable, nunca por el texto: el mensaje del fixture no se parece a «duplicado».
    const user = userEvent.setup();
    createSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_name',
      message: 'MENSAJE-DEL-SERVIDOR-QUE-NADIE-INTERPRETA',
    });

    await renderPantalla();
    await user.click(screen.getByTestId(testId.abrirAlta));
    await screen.findByTestId(testId.formulario);

    await rellenarFormulario(user);
    await user.click(screen.getByTestId(testId.enviar));

    await waitFor(() => expect(createSupplierActionMock).toHaveBeenCalledTimes(1));

    const errorDeCampo = await screen.findByTestId('supplier-error-name');
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
    const user = userEvent.setup();
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

  it('un not_found ofrece volver a la lista desde la region de error del formulario', async () => {
    // R32 — el proveedor dejo de existir mientras el panel estaba abierto. El destino se deriva
    // de `SUPPLIERS_ROUTE` (R2), nunca de un literal.
    const user = userEvent.setup();
    updateSupplierActionMock.mockResolvedValue({
      status: 'error',
      code: 'not_found',
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();

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
    const user = userEvent.setup();

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
      const user = userEvent.setup();

      await renderPantalla();

      // Las acciones de fila son SIEMPRE visibles: nada detras de `:hover`.
      const fila = screen.getByTestId(testId.fila);
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
