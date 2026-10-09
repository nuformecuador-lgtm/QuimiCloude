import { act, cleanup, render, screen } from '@testing-library/react';

import { CustomerSheet } from '@/app/(private)/clientes/components';
import { PresentationSheet } from '@/app/(private)/configuracion/presentaciones/components';
import { UnitSheet } from '@/app/(private)/configuracion/unidades/components';
import { UserSheet } from '@/app/(private)/configuracion/usuarios/components';
import { ProductBatchDateField } from '@/app/(private)/inventario/components/product-batch-date-field';
import { ProductField } from '@/app/(private)/inventario/components/product-field';
import { DialogTextField } from '@/app/(private)/inventario/importar/components/import-dialog-parts';
import { OrderField, OrderSheet } from '@/app/(private)/pedidos/components';
import { CatalogLineSheet, UnitSelect } from '@/app/(private)/proveedores/[id]/components';
import { DataTableFilterDate } from '@/components/shared/data-table/data-table-filter-date';
import type { DataTableTexts } from '@/components/shared/data-table/data-table-types';
import { SharedSelect } from '@/components/shared/shared-select';
import { SupplierField } from '@/components/shared/supplier/supplier-field';
import type { CustomerView } from '@/lib/modules/clientes';
import { errorMessage, type ErrorCode, type ErrorState } from '@/lib/modules/errores';
import type { RoleOption, UserDetail, UserRow } from '@/lib/modules/identity';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import type { RecipeDetail } from '@/lib/modules/recetas';
import type { UnitRef, UnitView } from '@/lib/modules/unidades';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import {
  NARROW_VIEWPORT,
  WIDE_VIEWPORT,
  resetViewport,
  setViewportWidth,
} from '../../helpers/viewport';
import { arbolAccesibleDe } from './arbol-accesible';

/**
 * Paridad de los campos de la lista cerrada de T0a (`progress/impl_QC-232-….md > Campos`),
 * congelada contra el codigo de hoy antes de que deleguen en `TextField`, `SelectField`,
 * `DatePicker` y `FieldError`. Cada campo, con y sin error; los selectores, tambien abiertos; y
 * los selectores de fecha abiertos.
 *
 * Los exportados se montan sueltos. Los que hoy son locales de su formulario (`CustomerTextField`,
 * `UnitTextField`, `UserTextField`, `UserSelectField`, `CatalogField`, el select local de pedido,
 * el «deriva de» de unidades y los dos en linea de presentaciones) se montan dentro de su panel y
 * se serializa solo su contenedor (`div.flex.flex-col.gap-2`), que es lo que la pieza compartida
 * tiene que reproducir. Mocks de `formularios-paridad.test.tsx`.
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


function errorDe(code: ErrorCode): ErrorState {
  return { status: 'error', code, message: errorMessage(code) } as ErrorState;
}

function paginaVacia() {
  return { status: 'success', data: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 } };
}

async function asentar() {
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    await act(async () => {});
  }
}

const ATRIBUTOS_DEL_CONTROL = [
  'name',
  'type',
  'inputmode',
  'autocomplete',
  'required',
  'maxlength',
  'min',
  'step',
  'pattern',
];

/**
 * Lo que el arbol accesible no guarda y R17/R19 piden conservar: de cada `input` y `textarea` del
 * campo (tambien los ocultos de selects y fechas), sus atributos de envio y el valor que viajaria
 * en el `FormData`.
 */
function controlesDe(contenedor: HTMLElement): string {
  const controles = Array.from(contenedor.querySelectorAll<HTMLInputElement>('input, textarea'));
  const lineas = controles.map((control) => {
    const partes = [control.tagName.toLowerCase()];
    for (const atributo of ATRIBUTOS_DEL_CONTROL) {
      const valor = control.getAttribute(atributo);
      if (valor !== null) partes.push(`${atributo}=${JSON.stringify(valor)}`);
    }
    partes.push(`value=${JSON.stringify(control.value)}`);
    return partes.join(' ');
  });
  return `controles:\n${lineas.join('\n')}\n`;
}

/** El arbol accesible del campo mas sus controles. */
function serializarCampo(contenedor: HTMLElement): string {
  return `${arbolAccesibleDe(contenedor)}${controlesDe(contenedor)}`;
}

/** El contenedor del campo: etiqueta, control, ayuda y error. Es lo que la pieza reproduce. */
function campo(testId: string): string {
  const contenedor = screen.getByTestId(testId).closest('div.flex.flex-col.gap-2');
  if (!(contenedor instanceof HTMLElement)) throw new Error(`el campo ${testId} no tiene contenedor`);
  return serializarCampo(contenedor);
}

/** El desplegable abierto de un selector, que vive en su portal. */
async function abrirDesplegable(user: ReturnType<typeof setupUser>, testId: string): Promise<string> {
  await user.click(screen.getByTestId(testId));
  const lista = await screen.findByRole('listbox');
  await esperarInteractiva(lista);
  return arbolAccesibleDe(lista);
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

const UNIDAD_L: UnitView = {
  id: '56565656-5656-4565-8565-565656565656',
  name: 'Litro',
  symbol: null,
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const UNIDADES_REF: readonly UnitRef[] = [
  { id: UNIDAD_KG.id, name: UNIDAD_KG.name, symbol: UNIDAD_KG.symbol, baseUnitId: null, factor: null },
  { id: UNIDAD_L.id, name: UNIDAD_L.name, symbol: null, baseUnitId: null, factor: null },
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

const LINEA: CatalogLineView = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

const DETALLE_RECETA = {
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
  lines: [],
  tools: [],
  original: null,
  isUnderReview: false,
  displayName: RECETA.name,
} as unknown as RecipeDetail;

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

const TEXTOS_DE_TABLA: DataTableTexts = {
  empty: 'vacio',
  loading: 'cargando',
  error: 'error',
  search: 'buscar',
  filters: 'filtros',
  columnMenu: 'menu-columna',
  previousPage: 'anterior',
  nextPage: 'siguiente',
  pageIndicator: (page, totalPages) => `${page}/${totalPages}`,
  pageSize: 'tamano',
  sortAscending: 'asc',
  sortDescending: 'desc',
  pinColumn: 'fijar',
  unpinColumn: 'soltar',
  filterColumn: 'filtrar',
  clearFilter: 'limpiar',
  lastWeek: 'ultima semana',
  lastMonth: 'ultimo mes',
  lastYear: 'ultimo año',
};

/** «Hoy» fijo: la fecha de compra cae en hoy y el calendario marca el dia de hoy. */
const HOY = new Date('2026-10-09T12:00:00');

beforeEach(() => {
  vi.clearAllMocks();
  for (const doble of acciones.todas()) doble.mockReset();
  acciones.fn('listPresentationsAction').mockResolvedValue(paginaVacia());
  acciones.fn('listProductsAction').mockResolvedValue(paginaVacia());
  acciones.fn('getUserAction').mockResolvedValue({ status: 'success', data: FICHA_USUARIO });
  acciones.fn('getRecipeAction').mockResolvedValue({ status: 'success', data: DETALLE_RECETA });
  acciones.fn('listRecipeVersionsAction').mockResolvedValue({ status: 'success', data: [] });
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOY);
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.useRealTimers();
  resetViewport();
});

async function enviar(user: ReturnType<typeof setupUser>, submit: string, error: string) {
  await user.click(screen.getByTestId(submit));
  await screen.findByTestId(error);
  await asentar();
}

describe('paridad de campos — texto', () => {
  async function editarCliente() {
    render(<CustomerSheet customer={CLIENTE} open onOpenChange={vi.fn()} />);
    await screen.findByTestId('customer-form');
  }

  it('R1 R16 R17 — T1 CustomerTextField, sin error (obligatorio, telefono y correo)', async () => {
    await editarCliente();
    expect(campo('customer-field-first-names')).toMatchSnapshot();
    expect(campo('customer-field-phone')).toMatchSnapshot();
    expect(campo('customer-field-email')).toMatchSnapshot();
  });

  it('R1 R18 — T1 CustomerTextField, con error', async () => {
    const user = setupUser();
    await editarCliente();
    const nombres = screen.getByTestId('customer-field-first-names');
    await user.clear(nombres);
    await user.type(nombres, '   ');
    await enviar(user, 'customer-form-submit', 'customer-error-first-names');
    expect(campo('customer-field-first-names')).toMatchSnapshot();
  });

  async function editarUnidad() {
    render(<UnitSheet unit={UNIDAD_G} baseUnits={[UNIDAD_KG]} open onOpenChange={vi.fn()} />);
    await screen.findByTestId('unit-form');
  }

  it('R1 R16 R17 — T2 UnitTextField, sin error (nombre, simbolo, factor)', async () => {
    await editarUnidad();
    expect(campo('unit-field-name')).toMatchSnapshot();
    expect(campo('unit-field-symbol')).toMatchSnapshot();
    expect(campo('unit-field-factor')).toMatchSnapshot();
  });

  it('R1 R18 — T2 UnitTextField, con error', async () => {
    acciones.fn('updateUnitAction').mockResolvedValue(errorDe('unit_duplicate_name'));
    const user = setupUser();
    await editarUnidad();
    await enviar(user, 'unit-form-submit', 'unit-error-name');
    expect(campo('unit-field-name')).toMatchSnapshot();
  });

  async function abrirUsuario(user: UserRow | null) {
    render(
      <UserSheet
        user={user}
        currentUserId="actor"
        roles={ROLES}
        rolesError={null}
        open
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByTestId('user-form');
    await asentar();
  }

  it('R1 R16 R17 — T3 UserTextField controlado, en el alta', async () => {
    await abrirUsuario(null);
    expect(campo('user-field-first-names')).toMatchSnapshot();
    expect(campo('user-field-username')).toMatchSnapshot();
  });

  it('R1 R16 R17 — T3 UserTextField no controlado, en la edicion (texto, fecha, correo, telefono)', async () => {
    await abrirUsuario(FILA_USUARIO);
    expect(campo('user-field-first-names')).toMatchSnapshot();
    expect(campo('user-field-birth-date')).toMatchSnapshot();
    expect(campo('user-field-email')).toMatchSnapshot();
    expect(campo('user-field-phone')).toMatchSnapshot();
  });

  it('R1 R18 — T3 UserTextField, con error', async () => {
    acciones.fn('updateUserAction').mockResolvedValue(errorDe('duplicate_email'));
    const user = setupUser();
    await abrirUsuario(FILA_USUARIO);
    await enviar(user, 'user-form-submit', 'user-error-email');
    expect(campo('user-field-email')).toMatchSnapshot();
  });

  it('R1 R16 R17 — T4 ProductField: texto con ayuda, numero, fecha y controlado', () => {
    const { container } = render(
      <>
        <ProductField
          name="lot"
          label="Lote"
          type="text"
          helper="El identificador del lote."
          defaultValue="L-01"
        />
        <ProductField name="stock" label="Existencia" type="number" required defaultValue="3" />
        <ProductField name="expiryDate" label="Caducidad" type="date" defaultValue="2026-12-31" />
        <ProductField
          name="qtyAlert"
          label="Alerta"
          type="text"
          inputMode="decimal"
          required
          value="5"
          onChange={vi.fn()}
        />
      </>,
    );
    for (const hijo of Array.from(container.children)) {
      expect(serializarCampo(hijo as HTMLElement)).toMatchSnapshot();
    }
  });

  it('R1 R18 — T4 ProductField, con error (hoy sin role="alert")', () => {
    const { container } = render(
      <ProductField
        name="qtyAlert"
        label="Alerta"
        type="text"
        inputMode="decimal"
        required
        defaultValue="x"
        error="Escribe un decimal."
      />,
    );
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });

  it('R1 R16 R17 — T5 OrderField, numerico, sin y con error (hoy sin role="alert")', () => {
    const { container } = render(
      <>
        <OrderField
          name="quantity"
          label="Cantidad"
          required
          type="number"
          step="any"
          min="0.01"
          inputMode="decimal"
          roundDecimals={2}
          defaultValue="25"
        />
        <OrderField
          name="quantity"
          label="Cantidad"
          required
          type="number"
          step="any"
          min="0.01"
          inputMode="decimal"
          defaultValue="0"
          error="Escribe una cantidad mayor que cero."
        />
        <OrderField name="price" label="Precio" inputMode="decimal" defaultValue="10" />
      </>,
    );
    for (const hijo of Array.from(container.children)) {
      expect(serializarCampo(hijo as HTMLElement)).toMatchSnapshot();
    }
  });

  async function editarLinea() {
    const user = setupUser();
    render(
      <CatalogLineSheet supplierId={LINEA.supplierId} line={LINEA} units={UNIDADES_REF} />,
    );
    await user.click(screen.getByTestId('catalog-line-edit-open'));
    await screen.findByTestId('catalog-line-form');
    await asentar();
    return user;
  }

  it('R1 R16 R17 — T6 CatalogField, sin error (texto, decimal con patron, entero)', async () => {
    await editarLinea();
    expect(campo('catalog-field-name')).toMatchSnapshot();
    expect(campo('catalog-field-cost')).toMatchSnapshot();
    expect(campo('catalog-field-deliveryTime')).toMatchSnapshot();
  });

  it('R1 R18 — T6 CatalogField, con error (hoy sin role="alert")', async () => {
    acciones.fn('updateCatalogLineAction').mockResolvedValue(errorDe('duplicate_catalog_line'));
    const user = await editarLinea();
    await enviar(user, 'catalog-line-form-submit', 'catalog-error-name');
    expect(campo('catalog-field-name')).toMatchSnapshot();
  });

  it('R1 R16 R17 R18 — T7 SupplierField, sin y con error (hoy sin role="alert")', () => {
    const { container } = render(
      <>
        <SupplierField name="name" label="Nombre" required defaultValue="Químicos del Norte" />
        <SupplierField name="phone" label="Teléfono" inputMode="tel" autoComplete="tel" defaultValue="" />
        <SupplierField name="name" label="Nombre" required defaultValue="" error="Ya existe." />
      </>,
    );
    for (const hijo of Array.from(container.children)) {
      expect(serializarCampo(hijo as HTMLElement)).toMatchSnapshot();
    }
  });

  it('R1 R16 R17 R18 — T8 DialogTextField, sin y con error', () => {
    const { container } = render(
      <>
        <DialogTextField id="campo-nombre" field="name" label="Nombre" value="Ácido" onChange={vi.fn()} required />
        <DialogTextField
          id="campo-contenido"
          field="content"
          label="Contenido"
          value="x"
          onChange={vi.fn()}
          inputMode="decimal"
          error="Escribe un decimal."
        />
      </>,
    );
    for (const hijo of Array.from(container.children)) {
      expect(serializarCampo(hijo as HTMLElement)).toMatchSnapshot();
    }
  });

  async function editarPresentacion() {
    render(
      <PresentationSheet
        presentation={PRESENTACION}
        units={UNIDADES_REF}
        open
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByTestId('presentation-form');
  }

  it('R1 R16 R17 — T9 y T10 en linea de presentaciones, sin error', async () => {
    await editarPresentacion();
    expect(campo('presentation-field-name')).toMatchSnapshot();
    expect(campo('presentation-field-content')).toMatchSnapshot();
  });

  it('R1 R18 — T9 nombre de la presentacion, con error', async () => {
    acciones.fn('updatePresentationAction').mockResolvedValue(
      errorDe('presentation_duplicate_name'),
    );
    const user = setupUser();
    await editarPresentacion();
    await enviar(user, 'presentation-form-submit', 'presentation-error-name');
    expect(campo('presentation-field-name')).toMatchSnapshot();
  });

  it('R1 R18 — T10 contenido de la presentacion, con error', async () => {
    const user = setupUser();
    await editarPresentacion();
    const contenido = screen.getByTestId('presentation-field-content');
    await user.clear(contenido);
    await user.type(contenido, 'abc');
    await enviar(user, 'presentation-form-submit', 'presentation-error-content');
    expect(campo('presentation-field-content')).toMatchSnapshot();
  });
});

describe('paridad de campos — select', () => {
  async function abrirUsuario() {
    render(
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
  }

  it('R1 R16 R17 — S1 UserSelectField, cerrado y abierto', async () => {
    const user = setupUser();
    await abrirUsuario();
    expect(campo('user-field-document-type')).toMatchSnapshot();
    expect(campo('user-field-role')).toMatchSnapshot();
    expect(await abrirDesplegable(user, 'user-field-role')).toMatchSnapshot();
  });

  it('R1 R18 — S1 UserSelectField, con error', async () => {
    acciones.fn('updateUserAction').mockResolvedValue(errorDe('role_not_found'));
    const user = setupUser();
    await abrirUsuario();
    await enviar(user, 'user-form-submit', 'user-error-role');
    expect(campo('user-field-role')).toMatchSnapshot();
  });

  it('R1 R16 R17 — S2 select local de prioridad del pedido, cerrado y abierto', async () => {
    const user = setupUser();
    render(
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
    await asentar();
    expect(campo('order-priority-select')).toMatchSnapshot();
    expect(await abrirDesplegable(user, 'order-priority-select')).toMatchSnapshot();
  });

  async function editarUnidad() {
    render(<UnitSheet unit={UNIDAD_G} baseUnits={[UNIDAD_KG]} open onOpenChange={vi.fn()} />);
    await screen.findByTestId('unit-form');
  }

  it('R1 R16 R17 — S3 «deriva de» de unidades, cerrado y abierto', async () => {
    const user = setupUser();
    await editarUnidad();
    expect(campo('unit-field-base')).toMatchSnapshot();
    expect(await abrirDesplegable(user, 'unit-field-base')).toMatchSnapshot();
  });

  it('R1 R18 — S3 «deriva de» de unidades, con error', async () => {
    acciones.fn('updateUnitAction').mockResolvedValue(errorDe('invalid_derivation'));
    const user = setupUser();
    await editarUnidad();
    await enviar(user, 'unit-form-submit', 'unit-error-base');
    expect(campo('unit-field-base')).toMatchSnapshot();
  });

  it('R1 R16 R17 R18 — S4 UnitSelect, sin error, abierto y con error (hoy sin role="alert")', async () => {
    const user = setupUser();
    const { container, unmount } = render(<UnitSelect units={UNIDADES_REF} defaultValue={UNIDAD_KG.id} />);
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
    expect(await abrirDesplegable(user, 'unit-select')).toMatchSnapshot();
    unmount();

    const conError = render(<UnitSelect units={UNIDADES_REF} error="Elige una unidad." />);
    expect(serializarCampo(conError.container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });

  it('R1 R16 R17 R18 — S5 SharedSelect, con ayuda, abierto y con error', async () => {
    const user = setupUser();
    const opciones = [
      { value: 'PRODUCT', label: 'Producto' },
      { value: 'PACKAGING', label: 'Envase' },
    ];
    const { container, unmount } = render(
      <SharedSelect
        name="type"
        label="Tipo"
        required
        helper="Que tipo de producto es."
        defaultValue="PRODUCT"
        options={opciones}
      />,
    );
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
    await user.click(screen.getByRole('combobox'));
    const lista = await screen.findByRole('listbox');
    await esperarInteractiva(lista);
    expect(arbolAccesibleDe(lista)).toMatchSnapshot();
    unmount();

    const conError = render(
      <SharedSelect name="type" label="Tipo" options={opciones} error="Elige un tipo." />,
    );
    expect(serializarCampo(conError.container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });
});

describe('paridad de campos — fecha', () => {
  async function abrirCalendario(user: ReturnType<typeof setupUser>, testId: string) {
    await user.click(screen.getByTestId(testId));
    const popup = await screen.findByRole('dialog');
    await esperarInteractiva(popup);
    return arbolAccesibleDe(popup);
  }

  it('R1 R16 R19 — F1 fecha de compra: cerrada, con «hoy» y su input oculto', () => {
    const { container } = render(<ProductBatchDateField />);
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });

  it('R1 R16 — F1 fecha de compra: abierta, con los dias futuros deshabilitados', async () => {
    const user = setupUser();
    render(<ProductBatchDateField initialValue="2026-10-02" />);
    expect(await abrirCalendario(user, 'product-field-purchaseDate')).toMatchSnapshot();
  });

  it('R1 R18 — F1 fecha de compra, con error (hoy sin role="alert")', () => {
    const { container } = render(
      <ProductBatchDateField initialValue="2026-10-02" error="La fecha no puede ser futura." />,
    );
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });

  it('R1 R16 — F2 filtro de fecha de la tabla: cerrado', () => {
    const { container } = render(
      <DataTableFilterDate
        columnId="creado"
        label="Creado"
        value={undefined}
        texts={TEXTOS_DE_TABLA}
        onChange={vi.fn()}
      />,
    );
    expect(serializarCampo(container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });

  it('R1 R16 — F2 filtro de fecha de la tabla: abierto en ancho, con un rango elegido', async () => {
    const user = setupUser();
    render(
      <DataTableFilterDate
        columnId="creado"
        label="Creado"
        value={{ kind: 'dateRange', from: '2026-10-01', to: '2026-10-05' }}
        texts={TEXTOS_DE_TABLA}
        onChange={vi.fn()}
      />,
    );
    expect(await abrirCalendario(user, 'data-table-filter-date-creado')).toMatchSnapshot();
  });

  it('R1 R16 — F2 filtro de fecha de la tabla: abierto en angosto, sin rango', async () => {
    setViewportWidth(NARROW_VIEWPORT);
    const user = setupUser();
    render(
      <DataTableFilterDate
        columnId="creado"
        label="Creado"
        value={undefined}
        texts={TEXTOS_DE_TABLA}
        onChange={vi.fn()}
      />,
    );
    expect(await abrirCalendario(user, 'data-table-filter-date-creado')).toMatchSnapshot();
  });
});
