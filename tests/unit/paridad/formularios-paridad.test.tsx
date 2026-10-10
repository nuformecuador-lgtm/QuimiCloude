import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';

import { CustomerSheet } from '@/app/(private)/clientes/components';
import { PresentationSheet } from '@/app/(private)/configuracion/presentaciones/components';
import { UnitSheet } from '@/app/(private)/configuracion/unidades/components';
import { UserSheet, WorkGroupSheet } from '@/app/(private)/configuracion/usuarios/components';
import { ProductSheet } from '@/app/(private)/inventario/components/product-sheet';
import { ORDER_DISTRIBUTION_DEBOUNCE_MS, OrderSheet } from '@/app/(private)/pedidos/components';
import { CatalogLineSheet } from '@/app/(private)/proveedores/[id]/components';
import { SupplierSheet } from '@/components/shared/supplier/supplier-sheet';
import type { CustomerView } from '@/lib/modules/clientes';
import { errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import type { RoleOption, UserDetail, UserRow, WorkGroupRow } from '@/lib/modules/identity';
import { PRODUCT_TYPES, type ProductView } from '@/lib/modules/inventario';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { CatalogLineView, SupplierView } from '@/lib/modules/proveedores';
import type { RecipeDetail } from '@/lib/modules/recetas';
import type { UnitRef, UnitView } from '@/lib/modules/unidades';

import { setupUser } from '../../helpers/user-event';
import { arbolAccesible } from './arbol-accesible';

/**
 * Paridad de los formularios en panel de `design.md > 2.1`, congelada contra el codigo de hoy antes
 * de que pasen a `FormSheet` / `useEntitySheet`. Un `describe` por formulario; los estados:
 * abierto en alta, abierto en edicion, con error general, con error de campo donde es facil
 * provocarlo y «enviando» (la operacion sigue en vuelo). Se serializa `document.body` para que
 * entren los portales. Mocks de los tests de cada panel (`tests/unit/<area>-ui/*-sheet.test.tsx`).
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

const routerMock = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
  back: vi.fn<() => void>(),
  forward: vi.fn<() => void>(),
  prefetch: vi.fn<(href: string) => void>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
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

vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: acciones.fn('endAllSessionsAction'),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  createOrderAction: acciones.fn('createOrderAction'),
  updateOrderAction: acciones.fn('updateOrderAction'),
  cancelOrderAction: acciones.fn('cancelOrderAction'),
  deleteOrderAction: acciones.fn('deleteOrderAction'),
  getOrderAction: acciones.fn('getOrderAction'),
  listOrdersAction: acciones.fn('listOrdersAction'),
  listOrderCoverageAction: acciones.fn('listOrderCoverageAction'),
  quoteOrderCostAction: acciones.fn('quoteOrderCostAction'),
  quoteOrderPresentationAvailabilityAction: acciones.fn('quoteOrderPresentationAvailabilityAction'),
  updateOrderDistributionAction: acciones.fn('updateOrderDistributionAction'),
  setOrderCustomerAction: acciones.fn('setOrderCustomerAction'),
  searchOrderCustomersAction: acciones.fn('searchOrderCustomersAction'),
  getOrderCustomerFilterOptionAction: acciones.fn('getOrderCustomerFilterOptionAction'),
  getOrderDeliveryAction: acciones.fn('getOrderDeliveryAction'),
  deliverOrderAction: acciones.fn('deliverOrderAction'),
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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: acciones.fn('assignResponsiblesAction'),
  removeWorkGroupFromOrderAction: acciones.fn('removeWorkGroupFromOrderAction'),
  unassignResponsibleAction: acciones.fn('unassignResponsibleAction'),
  listOrderResponsiblesAction: acciones.fn('listOrderResponsiblesAction'),
  listResponsiblesForOrdersAction: acciones.fn('listResponsiblesForOrdersAction'),
  listAssignedOrdersAction: acciones.fn('listAssignedOrdersAction'),
  listFinishedOrdersAction: acciones.fn('listFinishedOrdersAction'),
  listCompanyOrdersAction: acciones.fn('listCompanyOrdersAction'),
  listResponsibleCandidatesAction: acciones.fn('listResponsibleCandidatesAction'),
}));

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

function errorDe(code: ErrorCode): ErrorState {
  return { status: 'error', code, message: errorMessage(code) } as ErrorState;
}

function paginaVacia() {
  return { status: 'success', data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 } };
}

/**
 * Una operacion en vuelo que se suelta al acabar el test. No vale `nuncaResuelve()`: React enreda
 * toda transicion nueva con la accion asincrona que siga pendiente, y una que no termina nunca
 * dejaria colgados los tests siguientes.
 */
const enVuelo: (() => void)[] = [];

function operacionEnVuelo<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    enVuelo.push(() => resolve(ERROR_DE_CATALOGO as T));
  });
}

/** Deja que terminen las consultas que el panel lanza al abrirse (detalle, miembros, cotizacion). */
async function asentar() {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await act(async () => {});
  }
}

const UNIDAD_KG: UnitView = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const UNIDAD_G: UnitView = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Gramo',
  symbol: 'g',
  baseUnitId: UNIDAD_KG.id,
  factor: '0.001',
  isSystem: false,
};

const UNIDADES_REF: readonly UnitRef[] = [
  { id: UNIDAD_KG.id, name: UNIDAD_KG.name, symbol: UNIDAD_KG.symbol, baseUnitId: null, factor: null },
];

const CLIENTE: CustomerView = {
  id: '11111111-1111-4111-8111-111111111111',
  firstNames: 'Ana María',
  lastNames: 'Pérez Gómez',
  city: 'Bogotá',
  phone: '3001234567',
  email: 'ana@example.com',
  address: 'Calle 1 # 2-3',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const PRESENTACION = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bidón 20 L',
  unitId: UNIDAD_KG.id,
  content: '20.0000',
};

const ROLES: readonly RoleOption[] = [
  { id: '66666666-6666-4666-8666-666666666661', name: 'Administrador' },
  { id: '66666666-6666-4666-8666-666666666662', name: 'Operador' },
] as readonly RoleOption[];

const FILA_USUARIO = {
  id: '77777777-7777-4777-8777-777777777777',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operador',
  accountStatus: 'active',
} as UserRow;

const FICHA_USUARIO: UserDetail = {
  id: FILA_USUARIO.id,
  firstNames: 'Ana Maria',
  lastNames: 'Lopez Perez',
  birthDate: new Date('1990-04-17T00:00:00.000Z'),
  email: 'ana.lopez@example.com',
  phone: '3001234567',
  documentTypeCode: 'CC',
  documentNumber: '1020304050',
  username: 'ana.lopez',
  roleId: ROLES[1]!.id,
  roleName: ROLES[1]!.name,
  accountStatus: 'active',
  accountStatusChangedAt: new Date('2026-09-01T10:00:00.000Z'),
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-01T10:00:00.000Z'),
} as UserDetail;

const GRUPO: WorkGroupRow = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Laboratorio',
  members: [],
};

const PRODUCTO: ProductView = {
  id: '99999999-9999-4999-8999-999999999999',
  name: 'Hidróxido de sodio',
  imagePath: null,
  stock: '12',
  unitId: UNIDAD_KG.id,
  qtyAlert: '5',
  type: PRODUCT_TYPES.PRODUCT,
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
};

const PROVEEDOR: SupplierView = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Químicos del Norte',
  nameNormalized: 'quimicos del norte',
  phone: '+52 81 1234 5678',
  email: 'ventas@quimicosdelnorte.example',
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const LINEA: CatalogLineView = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: PROVEEDOR.id,
  name: 'Sosa cáustica escamas',
  presentationId: PRESENTACION.id,
  unitId: UNIDAD_KG.id,
  imagePath: null,
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

const RECETA = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Esmalte azul', imageUrl: null };

const DETALLE_RECETA: RecipeDetail = {
  id: RECETA.id,
  name: RECETA.name,
  description: null,
  imageUrl: null,
  stepCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
  steps: [],
  packingSteps: [],
  lines: [
    {
      id: 'linea-1',
      productId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      productName: 'Sosa cáustica',
      percentage: '10.00',
      productUnitId: UNIDAD_KG.id,
      productStock: '40.0000',
    },
  ],
  tools: [],
  original: null,
  isUnderReview: false,
  displayName: RECETA.name,
} as RecipeDetail;

const PEDIDO: OrderSummary = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  number: { year: 2026, sequence: 42 },
  numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
  recipeId: RECETA.id,
  recipeName: RECETA.name,
  recipeVersion: null,
  quantity: '25',
  priority: 'ALTA',
  status: 'EN_CURSO',
  cancellationReason: null,
  ingredientsCost: null,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
  presentationLines: [],
  unitId: UNIDAD_KG.id,
  unitLabel: UNIDAD_KG.symbol,
  customer: null,
};

function porDefecto() {
  for (const doble of acciones.todas()) doble.mockReset();
  acciones.fn('listPresentationsAction').mockResolvedValue(paginaVacia());
  acciones.fn('listProductsAction').mockResolvedValue(paginaVacia());
  acciones.fn('listWorkGroupMembersAction').mockResolvedValue(paginaVacia());
  acciones.fn('listWorkGroupCandidatesAction').mockResolvedValue(paginaVacia());
  acciones.fn('getUserAction').mockResolvedValue({ status: 'success', data: FICHA_USUARIO });
  acciones.fn('getRecipeAction').mockResolvedValue({ status: 'success', data: DETALLE_RECETA });
  acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('listRecipesAction').mockResolvedValue(paginaVacia());
  acciones.fn('searchOrderCustomersAction').mockResolvedValue(paginaVacia());
  acciones.fn('listResponsibleCandidatesAction').mockResolvedValue({ status: 'success', data: [] });
  acciones.fn('quoteOrderCostAction').mockResolvedValue({
    status: 'success',
    data: { ingredientsCost: null },
  });
  acciones.fn('quoteOrderPresentationAvailabilityAction').mockResolvedValue({
    status: 'success',
    data: { kind: 'ok', available: '0' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  porDefecto();
});

afterEach(async () => {
  cleanup();
  for (const soltar of enVuelo.splice(0)) soltar();
  await act(async () => {});
});

type Formulario = {
  readonly nombre: string;
  /** Monta el panel en alta y lo abre como lo abre hoy la pantalla. */
  readonly alta: (user: ReturnType<typeof setupUser>) => Promise<void>;
  /** Monta el panel en edicion y lo abre. */
  readonly edicion: (user: ReturnType<typeof setupUser>) => Promise<void>;
  readonly form: string;
  readonly submit: string;
  readonly error: string;
  /** La operacion que invoca guardar en la edicion. */
  readonly accion: string;
  /** Lo que el panel sigue recalculando despues de enviar, y hay que dejar terminar. */
  readonly trasEnviar?: () => Promise<void>;
  readonly errorDeCampo?: {
    readonly resultado?: ErrorState;
    readonly preparar?: (user: ReturnType<typeof setupUser>) => Promise<void>;
    readonly testId: string;
  };
};

/**
 * El reparto del pedido pide el disponible con una espera (`ORDER_DISTRIBUTION_DEBOUNCE_MS`) al
 * abrirse y tras cada envio: se deja terminar para que el arbol no dependa de en que punto de esa
 * espera se fotografie.
 */
async function esperarDisponible() {
  await new Promise((resolver) => setTimeout(resolver, ORDER_DISTRIBUTION_DEBOUNCE_MS + 100));
  await waitFor(() =>
    expect(
      screen.getByTestId('order-distribution-available').closest('[aria-busy]'),
    ).toHaveAttribute('aria-busy', 'false'),
  );
  await asentar();
}

function montar(elemento: ReactElement) {
  render(elemento);
}

/**
 * Lo que viajaria en el `FormData` al guardar (R19), que el arbol accesible no guarda: los
 * nombres, en orden, con su valor. Los `File` vacios se nombran sin contenido.
 */
function datosDelFormulario(testId: string): string {
  const formulario = screen.getByTestId(testId);
  if (!(formulario instanceof HTMLFormElement)) throw new Error(`${testId} no es un <form>`);
  return Array.from(new FormData(formulario).entries())
    .map(
      ([nombre, valor]) =>
        `${nombre}=${typeof valor === 'string' ? JSON.stringify(valor) : '<archivo>'}`,
    )
    .join('\n');
}

async function abrirCon(user: ReturnType<typeof setupUser>, disparador: string, form: string) {
  await user.click(screen.getByTestId(disparador));
  await screen.findByTestId(form);
  await asentar();
}

const FORMULARIOS: readonly Formulario[] = [
  {
    nombre: 'cliente',
    alta: async (user) => {
      montar(<CustomerSheet />);
      await abrirCon(user, 'customer-create-open', 'customer-form');
    },
    edicion: async () => {
      montar(<CustomerSheet customer={CLIENTE} open onOpenChange={vi.fn()} />);
      await screen.findByTestId('customer-form');
      await asentar();
    },
    form: 'customer-form',
    submit: 'customer-form-submit',
    error: 'customer-form-error',
    accion: 'updateCustomerAction',
    errorDeCampo: {
      // Solo espacios: pasa la validacion nativa y la rechaza el esquema, sin llamar a la operacion.
      preparar: async (user) => {
        const campo = screen.getByTestId('customer-field-first-names');
        await user.clear(campo);
        await user.type(campo, '   ');
      },
      testId: 'customer-error-first-names',
    },
  },
  {
    nombre: 'presentacion',
    alta: async (user) => {
      montar(<PresentationSheet units={UNIDADES_REF} />);
      await abrirCon(user, 'presentation-create-open', 'presentation-form');
    },
    edicion: async () => {
      montar(
        <PresentationSheet
          presentation={PRESENTACION}
          units={UNIDADES_REF}
          open
          onOpenChange={vi.fn()}
        />,
      );
      await screen.findByTestId('presentation-form');
      await asentar();
    },
    form: 'presentation-form',
    submit: 'presentation-form-submit',
    error: 'presentation-form-error',
    accion: 'updatePresentationAction',
    errorDeCampo: {
      resultado: errorDe('presentation_duplicate_name'),
      testId: 'presentation-error-name',
    },
  },
  {
    nombre: 'unidad',
    alta: async (user) => {
      montar(<UnitSheet baseUnits={[UNIDAD_KG]} />);
      await abrirCon(user, 'unit-create-open', 'unit-form');
    },
    edicion: async () => {
      montar(<UnitSheet unit={UNIDAD_G} baseUnits={[UNIDAD_KG]} open onOpenChange={vi.fn()} />);
      await screen.findByTestId('unit-form');
      await asentar();
    },
    form: 'unit-form',
    submit: 'unit-form-submit',
    error: 'unit-form-error',
    accion: 'updateUnitAction',
    errorDeCampo: { resultado: errorDe('unit_duplicate_name'), testId: 'unit-error-name' },
  },
  {
    nombre: 'usuario',
    alta: async () => {
      montar(
        <UserSheet
          user={null}
          currentUserId="actor"
          roles={ROLES}
          rolesError={null}
          open
          onOpenChange={vi.fn()}
        />,
      );
      await screen.findByTestId('user-form');
      await asentar();
    },
    edicion: async () => {
      montar(
        <UserSheet
          user={FILA_USUARIO}
          currentUserId="actor"
          roles={ROLES}
          rolesError={null}
          open
          onOpenChange={vi.fn()}
        />,
      );
      await screen.findByTestId('user-form');
      await asentar();
    },
    form: 'user-form',
    submit: 'user-form-submit',
    error: 'user-form-error',
    accion: 'updateUserAction',
    errorDeCampo: { resultado: errorDe('duplicate_email'), testId: 'user-error-email' },
  },
  {
    nombre: 'grupo de trabajo',
    alta: async () => {
      montar(<WorkGroupSheet group={null} open onOpenChange={vi.fn()} />);
      await screen.findByTestId('work-group-form');
      await asentar();
    },
    edicion: async () => {
      montar(<WorkGroupSheet group={GRUPO} open onOpenChange={vi.fn()} />);
      await screen.findByTestId('work-group-form');
      await asentar();
    },
    form: 'work-group-form',
    submit: 'work-group-form-submit',
    error: 'work-group-form-error',
    accion: 'renameWorkGroupAction',
    errorDeCampo: {
      resultado: errorDe('work_group_duplicate_name'),
      testId: 'work-group-error-name',
    },
  },
  {
    nombre: 'producto',
    alta: async (user) => {
      montar(<ProductSheet units={UNIDADES_REF} formUnits={UNIDADES_REF} />);
      await abrirCon(user, 'product-create-open', 'product-form');
    },
    edicion: async (user) => {
      montar(<ProductSheet product={PRODUCTO} units={UNIDADES_REF} />);
      await abrirCon(user, 'product-edit-open', 'product-form');
    },
    form: 'product-form',
    submit: 'product-form-submit',
    error: 'product-form-error',
    accion: 'updateProductAction',
  },
  {
    nombre: 'pedido',
    alta: async (user) => {
      montar(<OrderSheet recipes={{ items: [RECETA], totalPages: 1 }} units={[UNIDAD_KG]} bridge={null} />);
      await abrirCon(user, 'order-create-open', 'order-form');
    },
    edicion: async () => {
      montar(
        <OrderSheet
          order={PEDIDO}
          recipes={{ items: [RECETA], totalPages: 1 }}
          units={[UNIDAD_KG]}
          bridge={null}
          open
          onOpenChange={vi.fn()}
        />,
      );
      await screen.findByTestId('order-form');
      await screen.findByTestId('order-ingredients-table');
      await asentar();
      await esperarDisponible();
    },
    form: 'order-form',
    submit: 'order-form-submit',
    error: 'order-form-error',
    accion: 'updateOrderAction',
    trasEnviar: () => esperarDisponible(),
    errorDeCampo: { resultado: errorDe('recipe_not_found'), testId: 'recipe-picker-error' },
  },
  {
    nombre: 'linea de catalogo',
    alta: async (user) => {
      montar(<CatalogLineSheet supplierId={PROVEEDOR.id} units={UNIDADES_REF} />);
      await abrirCon(user, 'catalog-line-create-open', 'catalog-line-form');
    },
    edicion: async (user) => {
      montar(<CatalogLineSheet supplierId={PROVEEDOR.id} line={LINEA} units={UNIDADES_REF} />);
      await abrirCon(user, 'catalog-line-edit-open', 'catalog-line-form');
    },
    form: 'catalog-line-form',
    submit: 'catalog-line-form-submit',
    error: 'catalog-line-form-error',
    accion: 'updateCatalogLineAction',
    errorDeCampo: { resultado: errorDe('duplicate_catalog_line'), testId: 'catalog-error-name' },
  },
  {
    nombre: 'proveedor',
    alta: async (user) => {
      montar(<SupplierSheet />);
      await abrirCon(user, 'supplier-create-open', 'supplier-form');
    },
    edicion: async (user) => {
      montar(<SupplierSheet supplier={PROVEEDOR} />);
      await abrirCon(user, 'supplier-edit-open', 'supplier-form');
    },
    form: 'supplier-form',
    submit: 'supplier-form-submit',
    error: 'supplier-form-error',
    accion: 'updateSupplierAction',
    errorDeCampo: { resultado: errorDe('supplier_duplicate_name'), testId: 'supplier-error-name' },
  },
];

/** La fecha de compra del alta de producto cae en «hoy»: se fija para que el arbol no dependa del dia. */
const HOY = new Date('2026-10-09T12:00:00');

for (const formulario of FORMULARIOS) {
  describe(`paridad de formularios — ${formulario.nombre}`, () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(HOY);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('R1 R6 R7 — abierto en alta', async () => {
      const user = setupUser();
      await formulario.alta(user);
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R6 R10 — abierto en edicion', async () => {
      const user = setupUser();
      await formulario.edicion(user);
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R19 — lo que viaja en el FormData, en alta y en edicion', async () => {
      const user = setupUser();
      await formulario.alta(user);
      expect(datosDelFormulario(formulario.form)).toMatchSnapshot();
      cleanup();
      await formulario.edicion(user);
      expect(datosDelFormulario(formulario.form)).toMatchSnapshot();
    });

    it('R1 R10 — con error general: el panel sigue abierto', async () => {
      acciones.fn(formulario.accion).mockResolvedValue(ERROR_DE_CATALOGO);
      const user = setupUser();
      await formulario.edicion(user);
      await user.click(screen.getByTestId(formulario.submit));
      await screen.findByTestId(formulario.error);
      await asentar();
      await formulario.trasEnviar?.();
      expect(arbolAccesible()).toMatchSnapshot();
    });

    if (formulario.errorDeCampo !== undefined) {
      const errorDeCampo = formulario.errorDeCampo;
      it('R1 R18 — con error de campo', async () => {
        if (errorDeCampo.resultado !== undefined) {
          acciones.fn(formulario.accion).mockResolvedValue(errorDeCampo.resultado);
        }
        const user = setupUser();
        await formulario.edicion(user);
        await errorDeCampo.preparar?.(user);
        await user.click(screen.getByTestId(formulario.submit));
        await screen.findByTestId(errorDeCampo.testId);
        await asentar();
        await formulario.trasEnviar?.();
        expect(arbolAccesible()).toMatchSnapshot();
      });
    }

    it('R1 R8 — enviando, con la operacion en vuelo', async () => {
      acciones.fn(formulario.accion).mockReturnValue(operacionEnVuelo());
      const user = setupUser();
      await formulario.edicion(user);
      await user.click(screen.getByTestId(formulario.submit));
      await waitFor(() => expect(acciones.fn(formulario.accion)).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.getByTestId(formulario.submit)).toHaveAttribute('aria-busy', 'true'),
      );
      await formulario.trasEnviar?.();
      expect(arbolAccesible()).toMatchSnapshot();
    });
  });
}

describe('paridad de formularios — grupo de trabajo, pie deshabilitado', () => {
  it('R1 R9 — alta con el nombre vacio: guardar deshabilitado', async () => {
    render(<WorkGroupSheet group={null} open onOpenChange={vi.fn()} />);
    await screen.findByTestId('work-group-form');
    await asentar();
    expect(screen.getByTestId('work-group-form-submit')).toBeDisabled();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de formularios — pedido, sin receta no se guarda', () => {
  it('R1 R9 — alta sin receta: guardar deshabilitado', async () => {
    const user = setupUser();
    render(<OrderSheet recipes={{ items: [RECETA], totalPages: 1 }} units={[UNIDAD_KG]} bridge={null} />);
    await abrirCon(user, 'order-create-open', 'order-form');
    expect(screen.getByTestId('order-form-submit')).toBeDisabled();
  });
});

describe('paridad de formularios — disparadores propios, cerrados', () => {
  it.each([
    ['cliente', () => render(<CustomerSheet />)],
    ['presentacion', () => render(<PresentationSheet units={UNIDADES_REF} />)],
    ['unidad', () => render(<UnitSheet baseUnits={[UNIDAD_KG]} />)],
    ['producto, alta', () => render(<ProductSheet units={UNIDADES_REF} formUnits={UNIDADES_REF} />)],
    ['producto, edicion', () => render(<ProductSheet product={PRODUCTO} units={UNIDADES_REF} />)],
    [
      'pedido',
      () =>
        render(
          <OrderSheet recipes={{ items: [RECETA], totalPages: 1 }} units={[UNIDAD_KG]} bridge={null} />,
        ),
    ],
    [
      'linea de catalogo, alta',
      () => render(<CatalogLineSheet supplierId={PROVEEDOR.id} units={UNIDADES_REF} />),
    ],
    [
      'linea de catalogo, edicion',
      () => render(<CatalogLineSheet supplierId={PROVEEDOR.id} line={LINEA} units={UNIDADES_REF} />),
    ],
    ['proveedor, alta', () => render(<SupplierSheet />)],
    ['proveedor, edicion', () => render(<SupplierSheet supplier={PROVEEDOR} />)],
  ])('R1 R11 — %s', (_nombre, pintar) => {
    pintar();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
