import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DeleteCustomerDialog } from '@/app/(private)/clientes/components';
import { DeletePresentationDialog } from '@/app/(private)/configuracion/presentaciones/components';
import { DeleteUnitDialog } from '@/app/(private)/configuracion/unidades/components';
import {
  DeleteUserDialog,
  DeleteWorkGroupDialog,
  EndUserSessionsDialog,
  UserStatusDialog,
} from '@/app/(private)/configuracion/usuarios/components';
import { DeleteProductDialog } from '@/app/(private)/inventario/components/delete-product-dialog';
import { CancelOrderDialog, DeleteOrderDialog } from '@/app/(private)/pedidos/components';
import { DeleteRecipeDialog } from '@/app/(private)/produccion/formulas/components/delete-recipe-dialog';
import { DeleteCatalogLineDialog, DeleteSupplierDialog } from '@/app/(private)/proveedores/[id]/components';
import { OrderCancelDialog } from '@/app/(private)/asignacion/[id]/components/order-cancel-dialog';
import { OrderExecutionScreen } from '@/app/(private)/asignacion/[id]/components/order-execution-screen';
import { AssignedOrderStartTrigger } from '@/app/(private)/asignacion/components/assigned-order-start-trigger';
import { PackingOrderScreen } from '@/app/(private)/asignacion/empaque/[id]/components/packing-order-screen';
import type { PackingOrderDetail, StartedOrderExecution } from '@/lib/modules/asignaciones';
import type { CustomerView } from '@/lib/modules/clientes';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import type { UserRow, WorkGroupRow } from '@/lib/modules/identity';
import { PRODUCT_TYPES, type PresentationView, type ProductView } from '@/lib/modules/inventario';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { CatalogLineView, SupplierView } from '@/lib/modules/proveedores';
import type { UnitView } from '@/lib/modules/unidades';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { arbolAccesible, arbolAccesibleDe } from './arbol-accesible';

/**
 * Paridad de los dialogos de confirmacion de `design.md > 2.2`, congelada contra el codigo de hoy
 * antes de que pasen a `ConfirmDialog` / `DeleteConfirmDialog`. Un `describe` por dialogo; los
 * estados: abierto, pendiente (la operacion no resuelve nunca) y con error si lo tiene, y el
 * disparador propio cerrado donde lo hay. Se serializa `document.body` para que entren los
 * portales. Mocks de los tests de cada dialogo (`tests/unit/<area>-ui/*`).
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
  return { fn };
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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-execution-actions', () => ({
  finishAssignedOrderAction: acciones.fn('finishAssignedOrderAction'),
  recordStepMoveAction: acciones.fn('recordStepMoveAction'),
  cancelAssignedOrderAction: acciones.fn('cancelAssignedOrderAction'),
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-packing-actions', () => ({
  startPackingAction: acciones.fn('startPackingAction'),
  finishPackingAction: acciones.fn('finishPackingAction'),
}));

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

const CLIENTE: CustomerView = {
  id: '11111111-1111-4111-8111-111111111111',
  firstNames: 'Ana María',
  lastNames: 'Pérez Gómez',
  city: 'Bogotá',
  phone: '3001234567',
  email: null,
  address: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const PRESENTACION: PresentationView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bidón 20 L',
  nameNormalized: 'bidon 20 l',
  unitId: '33333333-3333-4333-8333-333333333333',
  content: '20',
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

const UNIDAD: UnitView = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Gramo',
  symbol: 'g',
  baseUnitId: null,
  factor: null,
  isSystem: false,
};

const USUARIO = {
  id: '44444444-4444-4444-8444-444444444444',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operador',
  accountStatus: 'active',
} as UserRow;

const GRUPO: WorkGroupRow = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Laboratorio',
  members: [{ id: USUARIO.id, displayName: USUARIO.displayName }],
};

const PRODUCTO: ProductView = {
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Hidróxido de sodio',
  imagePath: null,
  stock: '12',
  unitId: UNIDAD.id,
  qtyAlert: '5',
  type: PRODUCT_TYPES.PRODUCT,
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
};

const RECETA = { id: '77777777-7777-4777-8777-777777777777', name: 'Detergente industrial' };

const PROVEEDOR: SupplierView = {
  id: '88888888-8888-4888-8888-888888888888',
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
  id: '99999999-9999-4999-8999-999999999999',
  supplierId: PROVEEDOR.id,
  name: 'Sosa cáustica escamas',
  presentationId: PRESENTACION.id,
  unitId: UNIDAD.id,
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

const PEDIDO: OrderSummary = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
  unitId: UNIDAD.id,
  unitLabel: UNIDAD.symbol,
  customer: null,
};

const EJECUCION: StartedOrderExecution = {
  orderId: 'order-1',
  numberText: 'PED-0007',
  status: 'EN_CURSO',
  recipeName: 'Barniz acrílico',
  orderQuantity: '250',
  steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Paso sin elementos pendientes' }] }] }],
  lines: [],
  tools: [],
  presentationLines: [],
  unitId: null,
  unitLabel: null,
  resumeStepPosition: null,
};

const EMPACADOR_ID = '11111111-1111-4111-8111-111111111111';

function pedidoDeEmpaque(overrides: Partial<PackingOrderDetail> = {}): PackingOrderDetail {
  return {
    id: 'order-1',
    numberText: '2026-0000030',
    recipeName: 'Jarabe simple',
    quantity: '12.5',
    presentationLines: [
      { presentationId: 'p-1', presentationName: 'Botella 200 ml', packagingName: null, packages: 5 },
    ],
    unitId: 'unit-1',
    unitLabel: 'kg',
    packages: '8',
    status: 'POR_EMPACAR',
    packedByName: null,
    packedById: null,
    packingSteps: [],
    ...overrides,
  };
}

/**
 * Lo que la pantalla pinta en portales (el fondo y el dialogo), sin la pantalla de detras: las
 * pantallas de asignacion tienen su propia paridad y aqui solo se congela su confirmacion.
 */
function arbolDePortales(contenedor: HTMLElement): string {
  return Array.from(document.body.children)
    .filter((hijo): hijo is HTMLElement => hijo !== contenedor && hijo instanceof HTMLElement)
    .map((portal) => arbolAccesibleDe(portal))
    .join('');
}

/**
 * Una operacion en vuelo que se suelta al acabar el test. No vale `operacionEnVuelo()`: React enreda
 * toda transicion nueva con la accion asincrona que siga pendiente, y una que no termina nunca
 * dejaria colgados los estados de error de los tests siguientes.
 */
const enVuelo: (() => void)[] = [];

function operacionEnVuelo<T>(): Promise<T> {
  return new Promise<T>((resolve) => {
    enVuelo.push(() => resolve(ERROR_DE_CATALOGO as T));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  for (const soltar of enVuelo.splice(0)) soltar();
  await act(async () => {});
});

type DialogoControlado = {
  readonly nombre: string;
  readonly pintar: () => void;
  readonly accion: string;
  readonly dialogo: string;
  readonly confirmar: string;
  readonly error: string;
  /** Lo que hay que hacer antes de poder confirmar (escribir el motivo). */
  readonly preparar?: (user: ReturnType<typeof setupUser>) => Promise<void>;
  readonly marcaPendiente?: false;
};

const escribirMotivo = (testId: string) => async (user: ReturnType<typeof setupUser>) => {
  await user.type(screen.getByTestId(testId), 'Pedido duplicado');
};

const CONTROLADOS: readonly DialogoControlado[] = [
  {
    nombre: 'borrar cliente',
    pintar: () => render(<DeleteCustomerDialog customer={CLIENTE} open onOpenChange={vi.fn()} />),
    accion: 'deleteCustomerAction',
    dialogo: 'delete-customer-dialog',
    confirmar: 'delete-customer-confirm',
    error: 'delete-customer-error',
  },
  {
    nombre: 'borrar presentacion',
    pintar: () =>
      render(<DeletePresentationDialog presentation={PRESENTACION} open onOpenChange={vi.fn()} />),
    accion: 'deletePresentationAction',
    dialogo: 'delete-presentation-dialog',
    confirmar: 'delete-presentation-confirm',
    error: 'delete-presentation-error',
  },
  {
    nombre: 'borrar unidad',
    pintar: () => render(<DeleteUnitDialog unit={UNIDAD} open onOpenChange={vi.fn()} />),
    accion: 'deleteUnitAction',
    dialogo: 'delete-unit-dialog',
    confirmar: 'delete-unit-confirm',
    error: 'delete-unit-error',
  },
  {
    nombre: 'borrar usuario',
    pintar: () => render(<DeleteUserDialog user={USUARIO} open onOpenChange={vi.fn()} />),
    accion: 'deleteUserAction',
    dialogo: 'delete-user-dialog',
    confirmar: 'delete-user-confirm',
    error: 'delete-user-error',
  },
  {
    nombre: 'borrar grupo de trabajo',
    pintar: () => render(<DeleteWorkGroupDialog group={GRUPO} open onOpenChange={vi.fn()} />),
    accion: 'deleteWorkGroupAction',
    dialogo: 'delete-work-group-dialog',
    confirmar: 'delete-work-group-confirm',
    error: 'delete-work-group-error',
  },
  {
    nombre: 'estado de usuario',
    pintar: () => render(<UserStatusDialog user={USUARIO} open onOpenChange={vi.fn()} />),
    accion: 'setUserAccountStatusAction',
    dialogo: 'user-status-dialog',
    confirmar: 'user-status-confirm',
    error: 'user-status-error',
  },
  {
    nombre: 'cerrar sesiones',
    pintar: () => render(<EndUserSessionsDialog user={USUARIO} open onOpenChange={vi.fn()} />),
    accion: 'endAllSessionsAction',
    dialogo: 'end-user-sessions-dialog',
    confirmar: 'end-user-sessions-confirm',
    error: 'end-user-sessions-error',
  },
  {
    nombre: 'borrar pedido',
    pintar: () => render(<DeleteOrderDialog order={PEDIDO} open onOpenChange={vi.fn()} />),
    accion: 'deleteOrderAction',
    dialogo: 'delete-order-dialog',
    confirmar: 'delete-order-confirm',
    error: 'delete-order-error',
  },
  {
    nombre: 'cancelar pedido',
    pintar: () => render(<CancelOrderDialog order={PEDIDO} open onOpenChange={vi.fn()} />),
    accion: 'cancelOrderAction',
    dialogo: 'cancel-order-dialog',
    confirmar: 'cancel-order-confirm',
    error: 'cancel-order-error',
    preparar: escribirMotivo('cancel-order-reason'),
  },
];

for (const caso of CONTROLADOS) {
  describe(`paridad de confirmaciones — ${caso.nombre}`, () => {
    it('R1 R12 — abierto', async () => {
      caso.pintar();
      await screen.findByTestId(caso.dialogo);
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R13 — pendiente, con la operacion en vuelo', async () => {
      acciones.fn(caso.accion).mockReturnValue(operacionEnVuelo());
      const user = setupUser();
      caso.pintar();
      await screen.findByTestId(caso.dialogo);
      await caso.preparar?.(user);
      await user.click(screen.getByTestId(caso.confirmar));
      await waitFor(() => expect(acciones.fn(caso.accion)).toHaveBeenCalledTimes(1));
      if (caso.marcaPendiente !== false) {
        await waitFor(() =>
          expect(screen.getByTestId(caso.confirmar)).toHaveAttribute('aria-busy', 'true'),
        );
      }
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R14 — con error, el dialogo sigue abierto', async () => {
      acciones.fn(caso.accion).mockResolvedValue(ERROR_DE_CATALOGO);
      const user = setupUser();
      caso.pintar();
      await screen.findByTestId(caso.dialogo);
      await caso.preparar?.(user);
      await user.click(screen.getByTestId(caso.confirmar));
      await screen.findByTestId(caso.error);
      expect(arbolAccesible()).toMatchSnapshot();
    });
  });
}

describe('paridad de confirmaciones — cancelar pedido sin motivo', () => {
  it('R1 R13 — confirmar deshabilitado mientras no hay motivo', async () => {
    render(<CancelOrderDialog order={PEDIDO} open onOpenChange={vi.fn()} />);
    await screen.findByTestId('cancel-order-dialog');
    expect(screen.getByTestId('cancel-order-confirm')).toBeDisabled();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

type DialogoConDisparador = {
  readonly nombre: string;
  readonly pintar: () => void;
  readonly accion: string;
  readonly disparador: string;
  readonly dialogo: string;
  readonly confirmar: string;
  readonly error: string;
  readonly preparar?: (user: ReturnType<typeof setupUser>) => Promise<void>;
  /** Hoy el boton no marca el envio en curso (ni `aria-busy` ni texto de pendiente). */
  readonly marcaPendiente?: false;
};

const CON_DISPARADOR: readonly DialogoConDisparador[] = [
  {
    nombre: 'borrar producto',
    pintar: () => render(<DeleteProductDialog product={PRODUCTO} />),
    accion: 'deleteProductAction',
    disparador: 'product-delete-open',
    dialogo: 'delete-product-dialog',
    confirmar: 'delete-product-confirm',
    error: 'delete-product-error',
    marcaPendiente: false,
  },
  {
    nombre: 'borrar linea de catalogo',
    pintar: () => render(<DeleteCatalogLineDialog line={LINEA} />),
    accion: 'deleteCatalogLineAction',
    disparador: 'catalog-line-delete-open',
    dialogo: 'delete-catalog-line-dialog',
    confirmar: 'delete-catalog-line-confirm',
    error: 'delete-catalog-line-error',
    marcaPendiente: false,
  },
  {
    nombre: 'borrar proveedor',
    pintar: () => render(<DeleteSupplierDialog supplier={PROVEEDOR} />),
    accion: 'deleteSupplierAction',
    disparador: 'supplier-delete-open',
    dialogo: 'delete-supplier-dialog',
    confirmar: 'delete-supplier-confirm',
    error: 'delete-supplier-error',
    marcaPendiente: false,
  },
  {
    nombre: 'cancelar pedido desde asignacion',
    pintar: () => render(<OrderCancelDialog orderId={PEDIDO.id} stepPosition={2} />),
    accion: 'cancelAssignedOrderAction',
    disparador: 'order-cancel-trigger',
    dialogo: 'order-cancel-dialog',
    confirmar: 'order-cancel-confirm',
    error: 'order-cancel-error',
    preparar: escribirMotivo('order-cancel-reason'),
  },
];

async function abrir(user: ReturnType<typeof setupUser>, caso: DialogoConDisparador) {
  await user.click(screen.getByTestId(caso.disparador));
  await screen.findByTestId(caso.dialogo);
  await esperarInteractiva(screen.getByTestId(caso.confirmar));
}

for (const caso of CON_DISPARADOR) {
  describe(`paridad de confirmaciones — ${caso.nombre}`, () => {
    it('R1 R15 — el disparador propio, cerrado', () => {
      caso.pintar();
      expect(screen.queryByTestId(caso.dialogo)).toBeNull();
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R12 R15 — abierto desde su disparador', async () => {
      const user = setupUser();
      caso.pintar();
      await abrir(user, caso);
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R13 — pendiente, con la operacion en vuelo', async () => {
      acciones.fn(caso.accion).mockReturnValue(operacionEnVuelo());
      const user = setupUser();
      caso.pintar();
      await abrir(user, caso);
      await caso.preparar?.(user);
      await user.click(screen.getByTestId(caso.confirmar));
      await waitFor(() => expect(acciones.fn(caso.accion)).toHaveBeenCalledTimes(1));
      if (caso.marcaPendiente !== false) {
        await waitFor(() =>
          expect(screen.getByTestId(caso.confirmar)).toHaveAttribute('aria-busy', 'true'),
        );
      }
      expect(arbolAccesible()).toMatchSnapshot();
    });

    it('R1 R14 — con error, el dialogo sigue abierto', async () => {
      acciones.fn(caso.accion).mockResolvedValue(ERROR_DE_CATALOGO);
      const user = setupUser();
      caso.pintar();
      await abrir(user, caso);
      await caso.preparar?.(user);
      await user.click(screen.getByTestId(caso.confirmar));
      await screen.findByTestId(caso.error);
      expect(arbolAccesible()).toMatchSnapshot();
    });
  });
}

describe('paridad de confirmaciones — borrar receta (transicion)', () => {
  const VERSIONES = [
    { id: 'v-1', name: 'Version 1' },
    { id: 'v-2', name: 'Version 2' },
  ];

  async function abrirReceta(user: ReturnType<typeof setupUser>) {
    await user.click(screen.getByTestId('recipe-delete-open'));
    await screen.findByTestId('delete-recipe-dialog');
  }

  it('R1 R15 — el disparador propio, cerrado', () => {
    render(<DeleteRecipeDialog recipe={RECETA} />);
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R13 — abierto mientras cuenta las versiones: confirmar deshabilitado', async () => {
    acciones.fn('listRecipeVersionsAction').mockReturnValue(operacionEnVuelo());
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    expect(screen.getByTestId('delete-recipe-confirm')).toBeDisabled();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R12 — abierto con el aviso de versiones', async () => {
    acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: VERSIONES });
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    await screen.findByTestId('delete-recipe-versions-notice');
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R12 — abierto sin versiones', async () => {
    acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    await waitFor(() => expect(screen.getByTestId('delete-recipe-confirm')).toBeEnabled());
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R13 — pendiente, con la transicion en vuelo', async () => {
    acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
    acciones.fn('deleteRecipeAction').mockReturnValue(operacionEnVuelo());
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    await waitFor(() => expect(screen.getByTestId('delete-recipe-confirm')).toBeEnabled());
    await user.click(await esperarInteractiva(screen.getByTestId('delete-recipe-confirm')));
    await waitFor(() => expect(screen.getByTestId('delete-recipe-confirm')).toBeDisabled());
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R14 — con error, el dialogo sigue abierto', async () => {
    acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
    acciones.fn('deleteRecipeAction').mockResolvedValue(ERROR_DE_CATALOGO);
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    await waitFor(() => expect(screen.getByTestId('delete-recipe-confirm')).toBeEnabled());
    await user.click(await esperarInteractiva(screen.getByTestId('delete-recipe-confirm')));
    await screen.findByTestId('delete-recipe-error');
    // La transicion termina despues de pintar el error: se fotografia ya terminada.
    await waitFor(() => expect(screen.getByTestId('delete-recipe-confirm')).toBeEnabled());
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R14 — el recuento de versiones falla', async () => {
    acciones.fn('listRecipeVersionsAction').mockResolvedValue(ERROR_DE_CATALOGO);
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} />);
    await abrirReceta(user);
    await screen.findByTestId('delete-recipe-error');
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R12 — la variante de version, abierta', async () => {
    const user = setupUser();
    render(<DeleteRecipeDialog recipe={RECETA} kind="version" />);
    await abrirReceta(user);
    expect(acciones.fn('listRecipeVersionsAction')).not.toHaveBeenCalled();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de confirmaciones — comenzar un pedido asignado (ConfirmActionDialog)', () => {
  it('R1 — el disparador, cerrado', () => {
    render(
      <AssignedOrderStartTrigger href="/asignacion/order-1" testId="assigned-order-enter-order-1">
        Entrar
      </AssignedOrderStartTrigger>,
    );
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R12 — abierto', async () => {
    const user = setupUser();
    render(
      <AssignedOrderStartTrigger href="/asignacion/order-1" testId="assigned-order-enter-order-1">
        Entrar
      </AssignedOrderStartTrigger>,
    );
    await user.click(screen.getByTestId('assigned-order-enter-order-1'));
    await screen.findByTestId('assigned-order-start-dialog');
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de confirmaciones — finalizar la ejecucion (ConfirmActionDialog)', () => {
  it('R1 R12 — abierto: solo el dialogo, en su portal', async () => {
    vi.useFakeTimers();
    let contenedor: HTMLElement;
    try {
      contenedor = render(<OrderExecutionScreen execution={EJECUCION} />).container;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(screen.getByTestId('step-reader-finish'));
    await screen.findByTestId('order-execution-finish-dialog');
    expect(arbolDePortales(contenedor)).toMatchSnapshot();
  });
});

describe('paridad de confirmaciones — empaque (ConfirmActionDialog)', () => {
  it('R1 R12 — comenzar, abierto: solo el dialogo, en su portal', async () => {
    const { container } = render(
      <PackingOrderScreen order={pedidoDeEmpaque()} actorId={EMPACADOR_ID} />,
    );
    fireEvent.click(screen.getByTestId('packing-order-start-button'));
    await screen.findByTestId('packing-order-start-dialog');
    expect(arbolDePortales(container)).toMatchSnapshot();
  });

  it('R1 R12 — terminar, abierto: solo el dialogo, en su portal', async () => {
    const { container } = render(
      <PackingOrderScreen
        order={pedidoDeEmpaque({
          status: 'EN_EMPAQUE',
          packedById: EMPACADOR_ID,
          packedByName: 'Empacador de Prueba',
        })}
        actorId={EMPACADOR_ID}
      />,
    );
    fireEvent.click(screen.getByTestId('packing-order-finish-button'));
    await screen.findByTestId('packing-order-finish-dialog');
    expect(arbolDePortales(container)).toMatchSnapshot();
  });
});
