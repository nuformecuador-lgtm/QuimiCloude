import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import ClientesPage from '@/app/(private)/clientes/page';
import PresentacionesPage from '@/app/(private)/configuracion/presentaciones/page';
import UnidadesPage from '@/app/(private)/configuracion/unidades/page';
import UsuariosPage from '@/app/(private)/configuracion/usuarios/page';
import InventarioPage from '@/app/(private)/inventario/page';
import FormulasPage from '@/app/(private)/produccion/formulas/page';
import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import type { CustomerView } from '@/lib/modules/clientes';
import { PERMISSIONS, type SessionUser, type UserRow, type WorkGroupRow } from '@/lib/modules/identity';
import {
  PRODUCT_TYPES,
  type FinishedStockRow,
  type PresentationView,
  type ProductView,
} from '@/lib/modules/inventario';
import type { CatalogLineListItem, SupplierView } from '@/lib/modules/proveedores';
import type { RecipeSummary } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import {
  CUSTOMERS_ROUTE,
  FORMULAS_ROUTE,
  INVENTORY_ROUTE,
  USERS_ROUTE,
  supplierDetailRoute,
} from '@/lib/shared/routes';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import {
  WIDE_VIEWPORT,
  clearSidebarStateCookie,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { resolverServerComponents } from './arbol-accesible';

/**
 * Inventario de las acciones de fila de cada tabla de `design.md > 2.4`, congelado contra el
 * codigo de hoy (botones de icono o render prop) y que NO se regenera en la tanda 3, cuando las
 * celdas pasan a `RowActionsMenu` (R20-R23).
 *
 * Por fila y por accion se guarda: el `data-testid`, el orden, si esta deshabilitada y lo que abre
 * (el `data-testid` del panel o dialogo que aparece) o, si es un enlace, su `href`. Se lee con un
 * helper que entiende las dos formas: si la celda tiene un disparador de menu
 * (`aria-haspopup="menu"`), lo abre y lee sus `menuitem`; si no, lee los botones y enlaces de la
 * celda. A proposito NO se guarda ni el nombre accesible (depende de P2) ni el testid del
 * disparador, para que el inventario sea el mismo con botones y con menu.
 *
 * Cada pantalla se pinta entera, con la sesion con todos los permisos y con solo los de consulta.
 * Mocks de las paridades de QC-231 de cada pantalla (`clientes-`, `presentaciones-`, `unidades-`,
 * `grupos-`, `usuarios-`, `inventario-`, `recetas-` y `catalogo-paridad.test.tsx`).
 */

const acciones = vi.hoisted(() => {
  const registro = new Map<string, ReturnType<typeof vi.fn>>();
  const fn = (nombre: string) => {
    let doble = registro.get(nombre);
    if (doble === undefined) {
      doble = vi.fn();
      registro.set(nombre, doble);
    }
    return doble;
  };
  return { fn, todas: () => registro.values() };
});

const entorno = vi.hoisted(() => ({
  ruta: '/',
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSessionUserMock: vi.fn(),
  cookiesMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => entorno.ruta,
  useRouter: () => entorno.routerMock,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: entorno.cookiesMock }));

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => null) },
  identity: { getSessionUser: entorno.getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => ({
  createCustomerAction: acciones.fn('createCustomerAction'),
  updateCustomerAction: acciones.fn('updateCustomerAction'),
  deleteCustomerAction: acciones.fn('deleteCustomerAction'),
  getCustomerAction: acciones.fn('getCustomerAction'),
  listCustomersAction: acciones.fn('listCustomersAction'),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  createPresentationAction: acciones.fn('createPresentationAction'),
  updatePresentationAction: acciones.fn('updatePresentationAction'),
  deletePresentationAction: acciones.fn('deletePresentationAction'),
  listPresentationsAction: acciones.fn('listPresentationsAction'),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  createProductAction: acciones.fn('createProductAction'),
  updateProductAction: acciones.fn('updateProductAction'),
  deleteProductAction: acciones.fn('deleteProductAction'),
  getProductAction: acciones.fn('getProductAction'),
  listProductsAction: acciones.fn('listProductsAction'),
  listFinishedStockAction: acciones.fn('listFinishedStockAction'),
  listProductFormUnitsAction: acciones.fn('listProductFormUnitsAction'),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  adjustBatchStockAction: acciones.fn('adjustBatchStockAction'),
  listProductBatchesAction: acciones.fn('listProductBatchesAction'),
  listOrderBatchesAction: acciones.fn('listOrderBatchesAction'),
  listBatchMovementsAction: acciones.fn('listBatchMovementsAction'),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: acciones.fn('listUnitsAction'),
  getMassVolumeBridgeAction: acciones.fn('getMassVolumeBridgeAction'),
  createUnitAction: acciones.fn('createUnitAction'),
  updateUnitAction: acciones.fn('updateUnitAction'),
  deleteUnitAction: acciones.fn('deleteUnitAction'),
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => ({
  createUserAction: acciones.fn('createUserAction'),
  updateUserAction: acciones.fn('updateUserAction'),
  deleteUserAction: acciones.fn('deleteUserAction'),
  setUserAccountStatusAction: acciones.fn('setUserAccountStatusAction'),
  getUserAction: acciones.fn('getUserAction'),
  listUsersAction: acciones.fn('listUsersAction'),
}));

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: acciones.fn('listRolesAction'),
}));

vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: acciones.fn('endAllSessionsAction'),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  createWorkGroupAction: acciones.fn('createWorkGroupAction'),
  renameWorkGroupAction: acciones.fn('renameWorkGroupAction'),
  deleteWorkGroupAction: acciones.fn('deleteWorkGroupAction'),
  addWorkGroupMemberAction: acciones.fn('addWorkGroupMemberAction'),
  removeWorkGroupMemberAction: acciones.fn('removeWorkGroupMemberAction'),
  listWorkGroupsAction: acciones.fn('listWorkGroupsAction'),
  listWorkGroupMembersAction: acciones.fn('listWorkGroupMembersAction'),
  listWorkGroupCandidatesAction: acciones.fn('listWorkGroupCandidatesAction'),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  createRecipeAction: acciones.fn('createRecipeAction'),
  updateRecipeAction: acciones.fn('updateRecipeAction'),
  deleteRecipeAction: acciones.fn('deleteRecipeAction'),
  getRecipeAction: acciones.fn('getRecipeAction'),
  listRecipesAction: acciones.fn('listRecipesAction'),
  createRecipeVersionAction: acciones.fn('createRecipeVersionAction'),
  updateRecipeVersionAction: acciones.fn('updateRecipeVersionAction'),
  listRecipeVersionsAction: acciones.fn('listRecipeVersionsAction'),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  createSupplierAction: acciones.fn('createSupplierAction'),
  updateSupplierAction: acciones.fn('updateSupplierAction'),
  deleteSupplierAction: acciones.fn('deleteSupplierAction'),
  getSupplierAction: acciones.fn('getSupplierAction'),
  listSuppliersAction: acciones.fn('listSuppliersAction'),
  listSupplierShowcaseAction: acciones.fn('listSupplierShowcaseAction'),
  listShowcaseLinesAction: acciones.fn('listShowcaseLinesAction'),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  createCatalogLineAction: acciones.fn('createCatalogLineAction'),
  updateCatalogLineAction: acciones.fn('updateCatalogLineAction'),
  deleteCatalogLineAction: acciones.fn('deleteCatalogLineAction'),
  listCatalogLinesAction: acciones.fn('listCatalogLinesAction'),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: acciones.fn('issueUploadLinksAction'),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: acciones.fn('enqueueBatchAction'),
  getBatchStatusAction: acciones.fn('getBatchStatusAction'),
}));

// ---------------------------------------------------------------------------------------------
// El helper: lee las acciones de una fila, sean botones o items de un menu.
// ---------------------------------------------------------------------------------------------

/** El `id` de la columna de acciones, comun a las ocho tablas (R24 lo conserva). */
const COLUMNA_DE_ACCIONES = 'actions';

const DIALOGOS = '[role="dialog"], [role="alertdialog"]';

type Accion = {
  readonly testid: string | null;
  readonly deshabilitada: boolean;
  /** El enlace al que lleva, si es un enlace. */
  readonly href: string | null;
  /** El `data-testid` del panel o dialogo que abre; `null` si es un enlace o esta deshabilitada. */
  readonly abre: string | null;
};

/** `null`: la fila no tiene celda de acciones. `[]`: la tiene y esta vacia. */
type InventarioDeFila = readonly Accion[] | null;

type Usuario = ReturnType<typeof setupUser>;

function filas(): HTMLElement[] {
  return screen.queryAllByTestId(/^data-table-row-/);
}

function celdaDeAcciones(fila: HTMLElement): HTMLElement | null {
  return fila.querySelector<HTMLElement>(`[data-testid="data-table-cell-${COLUMNA_DE_ACCIONES}"]`);
}

/**
 * Los controles de la celda en su orden. Con disparador de menu, abre el menu y devuelve sus
 * items; sin el, los botones y enlaces de la celda.
 */
async function controlesDeLaCelda(user: Usuario, celda: HTMLElement): Promise<HTMLElement[]> {
  const disparador = celda.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  if (disparador === null) {
    return Array.from(celda.querySelectorAll<HTMLElement>('button, a[href]'));
  }
  await user.click(disparador);
  const menu = await screen.findByRole('menu');
  await esperarInteractiva(menu);
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function estaDeshabilitada(control: HTMLElement): boolean {
  return (
    control.hasAttribute('disabled') ||
    control.getAttribute('aria-disabled') === 'true' ||
    control.hasAttribute('data-disabled')
  );
}

function hrefDe(control: HTMLElement): string | null {
  return control.tagName === 'A' ? control.getAttribute('href') : null;
}

function testidDe(elemento: Element): string {
  return (
    elemento.getAttribute('data-testid') ??
    elemento.querySelector('[data-testid]')?.getAttribute('data-testid') ??
    '<sin testid>'
  );
}

/** Pulsa el control y devuelve el testid del panel o dialogo que aparece, o `null` si no abre nada. */
async function queAbre(user: Usuario, control: HTMLElement): Promise<string | null> {
  const antes = new Set(Array.from(document.querySelectorAll(DIALOGOS)));
  await user.click(control);
  try {
    const nuevo = await waitFor(
      () => {
        const abierto = Array.from(document.querySelectorAll(DIALOGOS)).find(
          (dialogo) => !antes.has(dialogo),
        );
        if (abierto === undefined) throw new Error('no se abrio nada');
        return abierto;
      },
      { timeout: 3000 },
    );
    return testidDe(nuevo);
  } catch {
    return null;
  }
}

async function asentar() {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await act(async () => {});
  }
}

/**
 * El inventario de cada fila de la tabla que pinta `pintar`. Cada accion se pulsa sobre una
 * pantalla recien pintada, para que lo que abre una no se mezcle con la siguiente.
 */
async function inventarioDeLaTabla(pintar: () => Promise<void>): Promise<InventarioDeFila[]> {
  await pintar();
  const cuantas = filas().length;
  cleanup();

  const resultado: InventarioDeFila[] = [];
  for (let indice = 0; indice < cuantas; indice++) {
    const user = setupUser();
    await pintar();
    const celda = celdaDeAcciones(filas()[indice]!);
    if (celda === null) {
      resultado.push(null);
      cleanup();
      continue;
    }
    const controles = await controlesDeLaCelda(user, celda);
    const forma = controles.map((control) => ({
      testid: control.getAttribute('data-testid'),
      deshabilitada: estaDeshabilitada(control),
      href: hrefDe(control),
    }));
    cleanup();

    const accionesDeLaFila: Accion[] = [];
    for (const [posicion, accion] of forma.entries()) {
      if (accion.href !== null || accion.deshabilitada) {
        accionesDeLaFila.push({ ...accion, abre: null });
        continue;
      }
      const usuario = setupUser();
      await pintar();
      const controlesFrescos = await controlesDeLaCelda(usuario, celdaDeAcciones(filas()[indice]!)!);
      const abre = await queAbre(usuario, controlesFrescos[posicion]!);
      accionesDeLaFila.push({ ...accion, abre });
      cleanup();
      await asentar();
    }
    resultado.push(accionesDeLaFila);
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Sesiones y datos.
// ---------------------------------------------------------------------------------------------

const TODOS_LOS_PERMISOS = PERMISSIONS.map((permiso) => permiso.code);

/** Sin ningun permiso de escritura: los que hoy ocultan o deshabilitan las acciones. */
const SOLO_CONSULTA = TODOS_LOS_PERMISOS.filter(
  (codigo) => codigo.endsWith('.consultar'),
);

function sesion(permissions: readonly string[]): SessionUser {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions: [...permissions],
  } as SessionUser;
}

function pagina<T>(items: readonly T[]) {
  return {
    status: 'success' as const,
    data: { items, total: items.length, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

async function pintarServidor(arbol: Promise<ReactNode>) {
  render(<>{await resolverServerComponents(await arbol)}</>);
  await asentar();
}

const CLIENTE: CustomerView = {
  id: '11111111-1111-4111-8111-111111111111',
  firstNames: 'Ana',
  lastNames: 'Lopez',
  city: 'Bogota',
  phone: '3001234567',
  email: null,
  address: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const KILOGRAMO: UnitView = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const GRAMO: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Gramo',
  symbol: 'g',
  baseUnitId: KILOGRAMO.id,
  factor: '0.001',
  isSystem: false,
};

const PRESENTACION: PresentationView = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bidón 20 L',
  nameNormalized: 'bidon 20 l',
  unitId: KILOGRAMO.id,
  content: '20',
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

const USUARIOS: readonly UserRow[] = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    displayName: 'Lopez Perez, Ana',
    username: 'ana.lopez',
    email: 'ana.lopez@example.com',
    roleName: 'Operador',
    accountStatus: 'active',
  },
  {
    id: '56565656-5656-4565-8565-565656565656',
    displayName: 'Rojas, Beto',
    username: 'beto.rojas',
    email: null,
    roleName: 'Operador',
    accountStatus: 'blocked',
  },
] as readonly UserRow[];

const GRUPOS: readonly WorkGroupRow[] = [
  {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Laboratorio',
    members: [{ id: USUARIOS[0]!.id, displayName: USUARIOS[0]!.displayName }],
  },
  { id: '67676767-6767-4676-8676-676767676767', name: 'Empaque', members: [] },
];

function producto(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'Hidróxido de sodio',
    imagePath: null,
    stock: '12',
    unitId: KILOGRAMO.id,
    qtyAlert: '5',
    type: PRODUCT_TYPES.PRODUCT,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    ...overrides,
  };
}

function filaTerminada(): FinishedStockRow {
  const terminado = producto({
    id: '78787878-7878-4787-8787-787878787878',
    name: 'Desengrasante 5 L',
    type: PRODUCT_TYPES.FINISHED_PRODUCT,
  });
  return {
    kind: 'order',
    key: 'order-1',
    orderId: 'order-1',
    orderNumber: { year: 2026, sequence: 1 },
    numberText: '2026-0001',
    recipeName: 'Desengrasante industrial',
    packagedStock: null,
    products: [{ product: terminado, stock: terminado.stock, packagedStock: null }],
  };
}

function receta(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: '88888888-8888-4888-8888-888888888888',
    name: 'Amoniaco',
    description: 'Descripcion',
    imageUrl: null,
    stepCount: 3,
    createdAt: new Date('2026-01-15T10:20:30.000Z'),
    updatedAt: new Date('2026-02-20T08:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

const PROVEEDOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const PROVEEDOR: SupplierView = {
  id: PROVEEDOR_ID,
  name: 'Químicos del Norte',
  nameNormalized: 'quimicos del norte',
  phone: '+52 81 1234 5678',
  email: 'ventas@quimicosdelnorte.example',
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const LINEA: CatalogLineListItem = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: PROVEEDOR_ID,
  name: 'Sosa cáustica escamas',
  presentationId: PRESENTACION.id,
  unitId: KILOGRAMO.id,
  imagePath: null,
  imageUrl: null,
  cost: '1234.5678',
  minPurchase: '0.1005',
  deliveryTime: 5,
  material: null,
  measurements: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-05T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function porDefecto() {
  for (const doble of acciones.todas()) doble.mockReset();
  entorno.cookiesMock.mockResolvedValue({ get: () => undefined });
  acciones.fn('listCustomersAction').mockResolvedValue(pagina([CLIENTE]));
  acciones.fn('listPresentationsAction').mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], total: 1, page: 1, pageSize: MAX_PAGE_SIZE, totalPages: 1 },
  });
  acciones.fn('listUnitsAction').mockImplementation(async (query?: unknown) =>
    query === undefined
      ? { status: 'success', data: [KILOGRAMO, GRAMO] }
      : pagina([KILOGRAMO, GRAMO]),
  );
  acciones.fn('listUsersAction').mockResolvedValue(pagina(USUARIOS));
  acciones.fn('listRolesAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listWorkGroupsAction').mockResolvedValue(pagina(GRUPOS));
  acciones.fn('listWorkGroupMembersAction').mockResolvedValue(pagina([]));
  acciones.fn('listWorkGroupCandidatesAction').mockResolvedValue(pagina([]));
  acciones.fn('getUserAction').mockReturnValue(new Promise(() => undefined));
  acciones.fn('listProductsAction').mockResolvedValue(pagina([producto()]));
  acciones.fn('listFinishedStockAction').mockResolvedValue(pagina([filaTerminada()]));
  acciones.fn('listProductFormUnitsAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listProductBatchesAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listOrderBatchesAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listOrderBatchesAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listRecipesAction').mockResolvedValue(
    pagina([receta(), receta({ id: '89898989-8989-4898-8989-898989898989', name: 'Borax' })]),
  );
  acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('getSupplierAction').mockResolvedValue({ status: 'success', data: PROVEEDOR });
  acciones.fn('listCatalogLinesAction').mockResolvedValue(pagina([LINEA]));
}

beforeEach(() => {
  vi.clearAllMocks();
  porDefecto();
  clearSidebarStateCookie();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(async () => {
  cleanup();
  await asentar();
  resetViewport();
  clearSidebarStateCookie();
});

// ---------------------------------------------------------------------------------------------
// Una tabla por `describe`.
// ---------------------------------------------------------------------------------------------

type Tabla = {
  readonly nombre: string;
  readonly ruta: string;
  readonly pintar: () => Promise<void>;
  /**
   * La pantalla entera exige el permiso de escritura (`requirePagePermission`): sin el no hay
   * fila que inventariar, asi que no tiene caso «solo consulta».
   */
  readonly exigeEscritura?: true;
};

const TABLAS: readonly Tabla[] = [
  {
    nombre: 'clientes',
    ruta: CUSTOMERS_ROUTE,
    pintar: () => pintarServidor(ClientesPage({ searchParams: Promise.resolve({}) })),
  },
  {
    nombre: 'presentaciones',
    ruta: '/configuracion/presentaciones',
    pintar: () => pintarServidor(PresentacionesPage({ searchParams: Promise.resolve({}) })),
    exigeEscritura: true,
  },
  {
    nombre: 'unidades',
    ruta: '/configuracion/unidades',
    pintar: () => pintarServidor(UnidadesPage({ searchParams: Promise.resolve({}) })),
    exigeEscritura: true,
  },
  {
    nombre: 'grupos de trabajo',
    ruta: USERS_ROUTE,
    pintar: () =>
      pintarServidor(UsuariosPage({ searchParams: Promise.resolve({ tab: 'grupos' }) })),
  },
  {
    nombre: 'usuarios',
    ruta: USERS_ROUTE,
    pintar: () => pintarServidor(UsuariosPage({ searchParams: Promise.resolve({}) })),
  },
  {
    nombre: 'productos',
    ruta: INVENTORY_ROUTE,
    pintar: () => pintarServidor(InventarioPage({ searchParams: Promise.resolve({}) })),
  },
  {
    nombre: 'producto terminado',
    ruta: INVENTORY_ROUTE,
    // Las lineas de producto, que son las que llevan acciones, viven dentro de su grupo plegado.
    pintar: async () => {
      await pintarServidor(
        InventarioPage({
          searchParams: Promise.resolve({ type: PRODUCT_TYPES.FINISHED_PRODUCT }),
        }),
      );
      for (const desplegar of screen.getAllByTestId('finished-stock-toggle')) {
        fireEvent.click(desplegar);
      }
      await asentar();
    },
  },
  {
    nombre: 'recetas',
    ruta: FORMULAS_ROUTE,
    pintar: () => pintarServidor(FormulasPage({ searchParams: Promise.resolve({}) })),
  },
  {
    nombre: 'catalogo de proveedor',
    ruta: supplierDetailRoute(PROVEEDOR_ID),
    pintar: () =>
      pintarServidor(
        ProveedorDetallePage({
          params: Promise.resolve({ id: PROVEEDOR_ID }),
          searchParams: Promise.resolve({}),
        }),
      ),
  },
];

for (const tabla of TABLAS) {
  describe(`acciones por fila — ${tabla.nombre}`, () => {
    beforeEach(() => {
      entorno.ruta = tabla.ruta;
    });

    it('R20 R21 R23 — con permiso: mismas acciones, orden, testids y destino', async () => {
      entorno.getSessionUserMock.mockResolvedValue(sesion(TODOS_LOS_PERMISOS));
      const inventario = await inventarioDeLaTabla(tabla.pintar);
      expect(inventario.length).toBeGreaterThan(0);
      expect(inventario).toMatchSnapshot();
    });

    if (tabla.exigeEscritura !== true) {
      it('R22 — solo con permisos de consulta', async () => {
        entorno.getSessionUserMock.mockResolvedValue(sesion(SOLO_CONSULTA));
        const inventario = await inventarioDeLaTabla(tabla.pintar);
        expect(inventario.length).toBeGreaterThan(0);
        expect(inventario).toMatchSnapshot();
      });
    }
  });
}
