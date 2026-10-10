// QC-232 T2k — R33 (enmienda del 2026-10-09): los dialogos de baja y de confirmacion quedan
// SIEMPRE montados y controlados por estado, para que el cierre anime su salida.
//
// **Como se ve «marcado como cerrado».** El humano lo dijo como `data-state="closed"`, que es el
// atributo de Radix. Base UI, el primitivo de este proyecto, no pinta `data-state`: marca el popup
// con `data-open` mientras esta abierto y con `data-closed` (mas `data-ending-style` durante la
// salida) en cuanto se cierra. Es el equivalente, y es lo que se afirma aqui.
//
// **Como se simula la salida en jsdom.** Base UI desmonta el popup cuando terminan las animaciones
// del elemento (`element.getAnimations()`); jsdom no implementa `getAnimations`, y sin ella Base UI
// desmonta al instante. Cada caso instala, JUSTO antes de cerrar, un `getAnimations` que devuelve
// una animacion cuyo `finished` queda pendiente: mientras no se suelta, la salida «dura». Al
// soltarla, el popup se desmonta, como en el navegador al acabar la animacion.

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_ACTION_DELETE_TESTID,
  CUSTOMER_ROW_ACTIONS_TESTID,
  CustomerRowActions,
  DELETE_CUSTOMER_CONFIRM_TESTID,
  DELETE_CUSTOMER_DIALOG_TESTID,
  DELETE_CUSTOMER_DISMISS_TESTID,
  DELETE_CUSTOMER_ERROR_TESTID,
  DELETE_CUSTOMER_ID_TESTID,
} from '@/app/(private)/clientes/components';
import {
  DELETE_PRESENTATION_CONFIRM_TESTID,
  DELETE_PRESENTATION_DIALOG_TESTID,
  DELETE_PRESENTATION_DISMISS_TESTID,
  DELETE_PRESENTATION_ERROR_TESTID,
  DELETE_PRESENTATION_ID_TESTID,
  PRESENTATION_ACTION_DELETE_TESTID,
  PRESENTATION_ROW_ACTIONS_TESTID,
  PresentationRowActions,
} from '@/app/(private)/configuracion/presentaciones/components';
import {
  DELETE_UNIT_CONFIRM_TESTID,
  DELETE_UNIT_DIALOG_TESTID,
  DELETE_UNIT_DISMISS_TESTID,
  DELETE_UNIT_ERROR_TESTID,
  DELETE_UNIT_ID_TESTID,
  UNIT_ACTION_DELETE_TESTID,
  UNIT_ROW_ACTIONS_TESTID,
  UnitRowActions,
} from '@/app/(private)/configuracion/unidades/components';
import {
  DELETE_USER_CONFIRM_TESTID,
  DELETE_USER_DIALOG_TESTID,
  DELETE_USER_DISMISS_TESTID,
  DELETE_USER_ERROR_TESTID,
  DELETE_USER_ID_TESTID,
  DELETE_WORK_GROUP_DIALOG_TESTID,
  DELETE_WORK_GROUP_DISMISS_TESTID,
  DELETE_WORK_GROUP_ID_TESTID,
  USER_ACTION_DELETE_TESTID,
  USER_ACTION_STATUS_TESTID,
  USER_ROW_ACTIONS_TESTID,
  USER_STATUS_DIALOG_TESTID,
  USER_STATUS_DISMISS_TESTID,
  USER_STATUS_ID_TESTID,
  UserTable,
  WORK_GROUP_ACTION_DELETE_TESTID,
  WORK_GROUP_ROW_ACTIONS_TESTID,
  WorkGroupTable,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  CANCEL_ORDER_DIALOG_TESTID,
  CANCEL_ORDER_DISMISS_TESTID,
  CANCEL_ORDER_REASON_TESTID,
  DELETE_ORDER_DIALOG_TESTID,
  DELETE_ORDER_DISMISS_TESTID,
  OrderRowSheetActions,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { ProductTable } from '@/app/(private)/inventario/components';
import { RecipeTable } from '@/app/(private)/produccion/formulas/components';
import { CatalogTable } from '@/app/(private)/proveedores/[id]/components';
import {
  ConfirmDialog,
  ConfirmDialogBody,
  ConfirmDialogFrame,
} from '@/components/shared/confirm-dialog';
import type { DataTableParams } from '@/components/shared/data-table';
import type { CustomerView } from '@/lib/modules/clientes';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import type { UserRow, WorkGroupRow } from '@/lib/modules/identity';
import type { UserMutationFormState } from '@/lib/modules/identity/adapters/driving/user-actions';
import { PRODUCT_TYPES, type PresentationView, type ProductView } from '@/lib/modules/inventario';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { CatalogLineListItem } from '@/lib/modules/proveedores';
import type { RecipeSummary } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { clickRowAction } from '../../helpers/row-actions-menu';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

/** Lo que devuelve cualquier Server Action de baja de estas pantallas. */
type EstadoDeBaja = { status: 'idle' } | { status: 'success' } | ErrorState;

const {
  routerMock,
  deleteUserActionMock,
  noDebeInvocarse,
  deleteCustomerActionMock,
  deletePresentationActionMock,
  deleteUnitActionMock,
  deleteProductActionMock,
  deleteCatalogLineActionMock,
  deleteRecipeActionMock,
  listProductBatchesActionMock,
} = vi.hoisted(() => ({
  deleteCustomerActionMock: vi.fn<(prev: EstadoDeBaja, data: FormData) => Promise<EstadoDeBaja>>(),
  deletePresentationActionMock:
    vi.fn<(prev: EstadoDeBaja, data: FormData) => Promise<EstadoDeBaja>>(),
  deleteUnitActionMock: vi.fn<(prev: EstadoDeBaja, data: FormData) => Promise<EstadoDeBaja>>(),
  deleteProductActionMock: vi.fn<(prev: EstadoDeBaja, data: FormData) => Promise<EstadoDeBaja>>(),
  deleteCatalogLineActionMock:
    vi.fn<(prev: EstadoDeBaja, data: FormData) => Promise<EstadoDeBaja>>(),
  deleteRecipeActionMock: vi.fn<(id: string) => Promise<EstadoDeBaja>>(),
  listProductBatchesActionMock: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  noDebeInvocarse: (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse aqui`);
  },
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  deleteUserActionMock:
    vi.fn<(prev: UserMutationFormState, data: FormData) => Promise<UserMutationFormState>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => ({
  listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
  getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
  createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
  updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
  deleteUserAction: deleteUserActionMock,
  setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
  renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
  deleteWorkGroupAction: vi.fn(noDebeInvocarse('deleteWorkGroupAction')),
  addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
  removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
  listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
  listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  listWorkGroupCandidatesAction: vi.fn(noDebeInvocarse('listWorkGroupCandidatesAction')),
}));

vi.mock('@/lib/modules/identity/adapters/driving/role-actions', () => ({
  listRolesAction: vi.fn(noDebeInvocarse('listRolesAction')),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
  listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
  getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
  createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
  updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
  deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
}));

// El panel de la fila monta su formulario y este pide sus catalogos: sin estos dobles, sus modulos
// arrastrarian la sesion real. Aqui solo importa que respondan.
vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
  listRecipesAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  getRecipeAction: vi.fn(async () => ({ status: 'error' as const, code: 'not_found' })),
  deleteRecipeAction: deleteRecipeActionMock,
  createRecipeAction: vi.fn(noDebeInvocarse('createRecipeAction')),
  updateRecipeAction: vi.fn(noDebeInvocarse('updateRecipeAction')),
  createRecipeVersionAction: vi.fn(noDebeInvocarse('createRecipeVersionAction')),
  updateRecipeVersionAction: vi.fn(noDebeInvocarse('updateRecipeVersionAction')),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  getMassVolumeBridgeAction: vi.fn(async () => ({ status: 'success' as const, data: null })),
  createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
  updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
  deleteUnitAction: deleteUnitActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
  updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
  deletePresentationAction: deletePresentationActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createProductAction: vi.fn(noDebeInvocarse('createProductAction')),
  updateProductAction: vi.fn(noDebeInvocarse('updateProductAction')),
  deleteProductAction: deleteProductActionMock,
  getProductAction: vi.fn(noDebeInvocarse('getProductAction')),
  listFinishedStockAction: vi.fn(noDebeInvocarse('listFinishedStockAction')),
  listProductFormUnitsAction: vi.fn(async () => ({ status: 'success' as const, data: [] })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/batch-actions', () => ({
  adjustBatchStockAction: vi.fn(noDebeInvocarse('adjustBatchStockAction')),
  listProductBatchesAction: listProductBatchesActionMock,
  listOrderBatchesAction: vi.fn(noDebeInvocarse('listOrderBatchesAction')),
  listBatchMovementsAction: vi.fn(noDebeInvocarse('listBatchMovementsAction')),
}));

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => ({
  createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
  updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
  deleteCustomerAction: deleteCustomerActionMock,
  getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
  listCustomersAction: vi.fn(noDebeInvocarse('listCustomersAction')),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  createSupplierAction: vi.fn(noDebeInvocarse('createSupplierAction')),
  updateSupplierAction: vi.fn(noDebeInvocarse('updateSupplierAction')),
  deleteSupplierAction: vi.fn(noDebeInvocarse('deleteSupplierAction')),
  getSupplierAction: vi.fn(noDebeInvocarse('getSupplierAction')),
  listSuppliersAction: vi.fn(noDebeInvocarse('listSuppliersAction')),
  listSupplierShowcaseAction: vi.fn(noDebeInvocarse('listSupplierShowcaseAction')),
  listShowcaseLinesAction: vi.fn(noDebeInvocarse('listShowcaseLinesAction')),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  createCatalogLineAction: vi.fn(noDebeInvocarse('createCatalogLineAction')),
  updateCatalogLineAction: vi.fn(noDebeInvocarse('updateCatalogLineAction')),
  deleteCatalogLineAction: deleteCatalogLineActionMock,
  listCatalogLinesAction: vi.fn(noDebeInvocarse('listCatalogLinesAction')),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(noDebeInvocarse('issueUploadLinksAction')),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(noDebeInvocarse('enqueueBatchAction')),
  getBatchStatusAction: vi.fn(noDebeInvocarse('getBatchStatusAction')),
}));

/** Una salida «en curso»: su `finished` no se resuelve hasta que el caso la suelta. */
let soltarSalida: (() => void) | null = null;

function salidaEnCurso(): void {
  let resolver!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  soltarSalida = resolver;
  const animacion = { finished, pending: false, playState: 'running' };
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [animacion],
  });
}

async function terminarSalida(): Promise<void> {
  await act(async () => {
    soltarSalida?.();
  });
}

function sinAnimaciones(): void {
  soltarSalida?.();
  soltarSalida = null;
  Reflect.deleteProperty(Element.prototype, 'getAnimations');
}

/** Cerrado y aun en el DOM: el popup anima su salida. */
function expectCerradoEnElDom(testId: string): void {
  const popup = screen.getByTestId(testId);
  expect(popup).toHaveAttribute('data-closed');
  expect(popup).not.toHaveAttribute('data-open');
}

beforeEach(() => {
  vi.clearAllMocks();
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  sinAnimaciones();
  cleanup();
  resetViewport();
});

describe('la pieza compartida, controlada y siempre montada (R33)', () => {
  const TEST_IDS = {
    dialog: 'montado-dialog',
    message: 'montado-message',
    dismiss: 'montado-dismiss',
    confirm: 'montado-confirm',
  } as const;

  function Controlado() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" data-testid="montado-abrir" onClick={() => setOpen(true)}>
          Abrir
        </button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          texts={{ title: 'Titulo', description: 'Descripcion', dismiss: 'Volver', confirm: 'Si' }}
          testIds={TEST_IDS}
          onConfirm={() => undefined}
        />
      </>
    );
  }

  it('tras cerrarse, el popup sigue en el DOM marcado como cerrado mientras dura la salida', async () => {
    const user = setupUser();
    render(<Controlado />);
    expect(screen.queryByTestId(TEST_IDS.dialog)).toBeNull();

    await user.click(screen.getByTestId('montado-abrir'));
    expect(await screen.findByTestId(TEST_IDS.dialog)).toHaveAttribute('data-open');

    salidaEnCurso();
    await user.click(screen.getByTestId(TEST_IDS.dismiss));

    await waitFor(() => expectCerradoEnElDom(TEST_IDS.dialog));

    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).toBeNull());
  });

  it('acabada la salida, el foco vuelve a quien lo abrio, como cuando se desmontaba', async () => {
    const user = setupUser();
    render(<Controlado />);
    const abrir = screen.getByTestId('montado-abrir');

    await user.click(abrir);
    await screen.findByTestId(TEST_IDS.dialog);
    await user.click(screen.getByTestId(TEST_IDS.dismiss));

    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).toBeNull());
    await waitFor(() => expect(abrir).toHaveFocus());
  });

  it('con `ConfirmDialogFrame`, el cuerpo arranca limpio en cada apertura', async () => {
    function Cuerpo() {
      const [veces, setVeces] = useState(0);
      return (
        <ConfirmDialogBody
          texts={{
            title: 'Titulo',
            description: <span data-testid="montado-veces">{veces}</span>,
            dismiss: 'Volver',
            confirm: 'Si',
          }}
          testIds={{ dismiss: TEST_IDS.dismiss, confirm: TEST_IDS.confirm }}
          submit={{ kind: 'transition', onConfirm: () => setVeces((n) => n + 1) }}
        />
      );
    }
    function ConFrame() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" data-testid="montado-abrir" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <ConfirmDialogFrame open={open} onOpenChange={setOpen} testId={TEST_IDS.dialog}>
            <Cuerpo />
          </ConfirmDialogFrame>
        </>
      );
    }

    const user = setupUser();
    render(<ConFrame />);
    await user.click(screen.getByTestId('montado-abrir'));
    await user.click(await screen.findByTestId(TEST_IDS.confirm));
    expect(screen.getByTestId('montado-veces')).toHaveTextContent('1');

    await user.click(screen.getByTestId(TEST_IDS.dismiss));
    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.dialog)).toBeNull());

    await user.click(screen.getByTestId('montado-abrir'));
    expect(await screen.findByTestId('montado-veces')).toHaveTextContent('0');
  });
});

function parametros(): DataTableParams {
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: null, filters: {}, search: '' };
}

describe('usuarios: borrado y cambio de estado (R33)', () => {
  const USUARIOS: readonly UserRow[] = [
    {
      id: 'u1',
      displayName: 'Lopez, Ana',
      username: 'ana.lopez',
      email: 'ana.lopez@example.com',
      roleName: 'Operador',
      accountStatus: 'active',
    },
  ];

  function montar() {
    render(
      <UserTable
        users={USUARIOS}
        params={parametros()}
        totalPages={1}
        canModify
        currentUserId={null}
        roles={[{ id: 'r1', name: 'Operador' }]}
        rolesError={null}
      />,
    );
  }

  async function abrir(user: ReturnType<typeof setupUser>, accion: string) {
    const fila = screen.getByTestId(`data-table-row-${USUARIOS[0]!.id}`);
    await user.click(within(fila).getByTestId(USER_ROW_ACTIONS_TESTID));
    await user.click(await esperarInteractiva(await screen.findByTestId(accion)));
  }

  it('el borrado sigue en el DOM, cerrado y con su usuario, mientras sale', async () => {
    const user = setupUser();
    montar();
    await abrir(user, USER_ACTION_DELETE_TESTID);
    await screen.findByTestId(DELETE_USER_DIALOG_TESTID);

    salidaEnCurso();
    await user.click(screen.getByTestId(DELETE_USER_DISMISS_TESTID));

    await waitFor(() => expectCerradoEnElDom(DELETE_USER_DIALOG_TESTID));
    expect(screen.getByTestId(DELETE_USER_ID_TESTID)).toHaveValue(USUARIOS[0]!.id);
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(DELETE_USER_DIALOG_TESTID)).toBeNull());
  });

  it('un rechazo anterior no reaparece al volver a abrir el borrado', async () => {
    deleteUserActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: errorMessage('invalid_input'),
    });
    const user = setupUser();
    montar();
    await abrir(user, USER_ACTION_DELETE_TESTID);
    await user.click(await screen.findByTestId(DELETE_USER_CONFIRM_TESTID));
    expect(await screen.findByTestId(DELETE_USER_ERROR_TESTID)).toBeInTheDocument();

    await user.click(screen.getByTestId(DELETE_USER_DISMISS_TESTID));
    await waitFor(() => expect(screen.queryByTestId(DELETE_USER_DIALOG_TESTID)).toBeNull());

    await abrir(user, USER_ACTION_DELETE_TESTID);
    await screen.findByTestId(DELETE_USER_DIALOG_TESTID);
    expect(screen.queryByTestId(DELETE_USER_ERROR_TESTID)).toBeNull();
  });

  it('el cambio de estado sigue en el DOM, cerrado y con su usuario, mientras sale', async () => {
    const user = setupUser();
    montar();
    await abrir(user, USER_ACTION_STATUS_TESTID);
    await screen.findByTestId(USER_STATUS_DIALOG_TESTID);

    salidaEnCurso();
    await user.click(screen.getByTestId(USER_STATUS_DISMISS_TESTID));

    await waitFor(() => expectCerradoEnElDom(USER_STATUS_DIALOG_TESTID));
    expect(screen.getByTestId(USER_STATUS_ID_TESTID)).toHaveValue(USUARIOS[0]!.id);
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(USER_STATUS_DIALOG_TESTID)).toBeNull());
  });
});

describe('grupos de trabajo: borrado (R33)', () => {
  const GRUPOS: readonly WorkGroupRow[] = [{ id: 'g1', name: 'Laboratorio', members: [] }];

  it('el borrado sigue en el DOM, cerrado y con su grupo, mientras sale', async () => {
    const user = setupUser();
    render(
      <WorkGroupTable groups={GRUPOS} params={parametros()} totalPages={1} canModify />,
    );
    const fila = screen.getByTestId(`data-table-row-${GRUPOS[0]!.id}`);
    await user.click(within(fila).getByTestId(WORK_GROUP_ROW_ACTIONS_TESTID));
    await user.click(
      await esperarInteractiva(await screen.findByTestId(WORK_GROUP_ACTION_DELETE_TESTID)),
    );
    await screen.findByTestId(DELETE_WORK_GROUP_DIALOG_TESTID);

    salidaEnCurso();
    await user.click(screen.getByTestId(DELETE_WORK_GROUP_DISMISS_TESTID));

    await waitFor(() => expectCerradoEnElDom(DELETE_WORK_GROUP_DIALOG_TESTID));
    expect(screen.getByTestId(DELETE_WORK_GROUP_ID_TESTID)).toHaveValue(GRUPOS[0]!.id);
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeNull());
  });
});

describe('pedidos: cancelar y borrar desde la fila (R33)', () => {
  const RECETAS: RecipePickerPage = { items: [], totalPages: 1 };

  const PEDIDO: OrderSummary = {
    id: '11111111-1111-4111-8111-111111111111',
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: '22222222-2222-4222-8222-222222222222',
    recipeName: 'Esmalte azul',
    recipeVersion: null,
    quantity: '12.5000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [],
    unitId: null,
    unitLabel: null,
    customer: null,
  };

  function montar() {
    render(<OrderRowSheetActions order={PEDIDO} recipes={RECETAS} units={[]} bridge={null} />);
  }

  async function abrir(user: ReturnType<typeof setupUser>, accion: string) {
    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await esperarInteractiva(await screen.findByTestId(accion)));
  }

  it('cerrada la fila, no hay ningun dialogo en el arbol', () => {
    montar();
    expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull();
    expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull();
  });

  it('la cancelacion sigue en el DOM, cerrada, mientras sale; y reabre sin el motivo anterior', async () => {
    const user = setupUser();
    montar();
    await abrir(user, 'order-action-cancel');
    await user.type(await screen.findByTestId(CANCEL_ORDER_REASON_TESTID), 'Motivo');

    salidaEnCurso();
    await user.click(screen.getByTestId(CANCEL_ORDER_DISMISS_TESTID));

    await waitFor(() => expectCerradoEnElDom(CANCEL_ORDER_DIALOG_TESTID));
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(CANCEL_ORDER_DIALOG_TESTID)).toBeNull());

    sinAnimaciones();
    await abrir(user, 'order-action-cancel');
    expect(await screen.findByTestId(CANCEL_ORDER_REASON_TESTID)).toHaveValue('');
  });

  it('el borrado sigue en el DOM, cerrado, mientras sale', async () => {
    const user = setupUser();
    montar();
    await abrir(user, 'order-action-delete');
    await screen.findByTestId(DELETE_ORDER_DIALOG_TESTID);

    salidaEnCurso();
    await user.click(screen.getByTestId(DELETE_ORDER_DISMISS_TESTID));

    await waitFor(() => expectCerradoEnElDom(DELETE_ORDER_DIALOG_TESTID));
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(DELETE_ORDER_DIALOG_TESTID)).toBeNull());
  });
});

// ---------------------------------------------------------------------------------------------
// Bajas montadas por fila en el resto de pantallas: se abren con el menu de la fila, como el
// usuario, y se monta el componente real. Clientes, presentaciones y unidades exportan su
// `*RowActions` por el barril; inventario, formulas y el catalogo del proveedor no, y por eso se
// monta su tabla con una fila. Los `data-testid` de esas tres filas y de sus dialogos no salen por
// el barril: se escriben aqui, igual que `order-row-actions` arriba.
// ---------------------------------------------------------------------------------------------

const RECHAZO: ErrorState = {
  status: 'error',
  code: 'invalid_input',
  message: errorMessage('invalid_input'),
};

type BajaDeFila = {
  readonly pantalla: string;
  readonly montar: () => void;
  readonly disparador: string;
  readonly accion: string;
  readonly dialogo: string;
  readonly descartar: string;
  readonly confirmar: string;
  readonly error: string;
  /** El campo oculto con el id de la fila, si el dialogo lo lleva. */
  readonly idOculto: { readonly testId: string; readonly valor: string } | null;
  readonly rechazar: () => void;
  /**
   * Si al reabrir el dialogo arranca sin el rechazo anterior. Inventario y el catalogo del
   * proveedor guardan el estado de `useActionState` en el propio dialogo, que ya estaba siempre
   * montado: ahi el rechazo reaparece, y se afirma tal cual para que un cambio no pase en silencio.
   */
  readonly reabreSinError: boolean;
};

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

const UNIDAD: UnitView = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Gramo',
  symbol: 'g',
  baseUnitId: null,
  factor: null,
  isSystem: false,
};

const PRESENTACION: PresentationView = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Bidon 20 L',
  nameNormalized: 'bidon 20 l',
  unitId: UNIDAD.id,
  content: null,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  updatedAt: new Date('2026-01-15T10:00:00.000Z'),
};

const PRODUCTO: ProductView = {
  id: '77777777-7777-4777-8777-777777777777',
  name: 'Hidroxido de sodio',
  imagePath: null,
  stock: '12',
  unitId: null,
  qtyAlert: null,
  type: PRODUCT_TYPES.PRODUCT,
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
};

const RECETA: RecipeSummary = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Amoniaco',
  description: null,
  imageUrl: null,
  stepCount: 3,
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const PROVEEDOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const LINEA: CatalogLineListItem = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: PROVEEDOR_ID,
  name: 'Sosa caustica escamas',
  presentationId: PRESENTACION.id,
  unitId: null,
  imagePath: null,
  imageUrl: null,
  cost: '1234.5678',
  minPurchase: null,
  deliveryTime: null,
  material: null,
  measurements: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-05T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const BAJAS_DE_FILA: readonly BajaDeFila[] = [
  {
    pantalla: 'clientes',
    montar: () => render(<CustomerRowActions customer={CLIENTE} canModify />),
    disparador: CUSTOMER_ROW_ACTIONS_TESTID,
    accion: CUSTOMER_ACTION_DELETE_TESTID,
    dialogo: DELETE_CUSTOMER_DIALOG_TESTID,
    descartar: DELETE_CUSTOMER_DISMISS_TESTID,
    confirmar: DELETE_CUSTOMER_CONFIRM_TESTID,
    error: DELETE_CUSTOMER_ERROR_TESTID,
    idOculto: { testId: DELETE_CUSTOMER_ID_TESTID, valor: CLIENTE.id },
    rechazar: () => deleteCustomerActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: true,
  },
  {
    pantalla: 'presentaciones',
    montar: () => render(<PresentationRowActions presentation={PRESENTACION} units={[]} />),
    disparador: PRESENTATION_ROW_ACTIONS_TESTID,
    accion: PRESENTATION_ACTION_DELETE_TESTID,
    dialogo: DELETE_PRESENTATION_DIALOG_TESTID,
    descartar: DELETE_PRESENTATION_DISMISS_TESTID,
    confirmar: DELETE_PRESENTATION_CONFIRM_TESTID,
    error: DELETE_PRESENTATION_ERROR_TESTID,
    idOculto: { testId: DELETE_PRESENTATION_ID_TESTID, valor: PRESENTACION.id },
    rechazar: () => deletePresentationActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: true,
  },
  {
    pantalla: 'unidades',
    montar: () => render(<UnitRowActions unit={UNIDAD} baseUnits={[]} />),
    disparador: UNIT_ROW_ACTIONS_TESTID,
    accion: UNIT_ACTION_DELETE_TESTID,
    dialogo: DELETE_UNIT_DIALOG_TESTID,
    descartar: DELETE_UNIT_DISMISS_TESTID,
    confirmar: DELETE_UNIT_CONFIRM_TESTID,
    error: DELETE_UNIT_ERROR_TESTID,
    idOculto: { testId: DELETE_UNIT_ID_TESTID, valor: UNIDAD.id },
    rechazar: () => deleteUnitActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: true,
  },
  {
    pantalla: 'proveedores/[id] (catalogo)',
    montar: () =>
      render(
        <CatalogTable
          lines={[LINEA]}
          params={parametros()}
          totalPages={1}
          supplierId={PROVEEDOR_ID}
          units={[]}
        />,
      ),
    disparador: 'catalog-line-row-actions',
    accion: 'catalog-line-delete-open',
    dialogo: 'delete-catalog-line-dialog',
    descartar: 'delete-catalog-line-cancel',
    confirmar: 'delete-catalog-line-confirm',
    error: 'delete-catalog-line-error',
    idOculto: { testId: 'delete-catalog-line-id', valor: LINEA.id },
    rechazar: () => deleteCatalogLineActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: false,
  },
  {
    pantalla: 'produccion/formulas',
    montar: () => render(<RecipeTable recipes={[RECETA]} params={parametros()} totalPages={1} />),
    disparador: 'recipe-row-actions',
    accion: 'recipe-delete-open',
    dialogo: 'delete-recipe-dialog',
    descartar: 'delete-recipe-cancel',
    confirmar: 'delete-recipe-confirm',
    error: 'delete-recipe-error',
    idOculto: null,
    rechazar: () => deleteRecipeActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: true,
  },
  {
    pantalla: 'inventario',
    montar: () =>
      render(<ProductTable products={[PRODUCTO]} params={parametros()} totalPages={1} />),
    disparador: 'product-row-actions',
    accion: 'product-delete-open',
    dialogo: 'delete-product-dialog',
    descartar: 'delete-product-cancel',
    confirmar: 'delete-product-confirm',
    error: 'delete-product-error',
    idOculto: { testId: 'delete-product-id', valor: PRODUCTO.id },
    rechazar: () => deleteProductActionMock.mockResolvedValue(RECHAZO),
    reabreSinError: false,
  },
];

describe.each(BAJAS_DE_FILA)('$pantalla: baja desde el menu de la fila (R33)', (caso) => {
  async function abrir(user: ReturnType<typeof setupUser>) {
    await clickRowAction(user, screen.getByTestId(caso.disparador), caso.accion);
    return screen.findByTestId(caso.dialogo);
  }

  it('cerrada la fila, el dialogo no esta en el arbol', () => {
    caso.montar();
    expect(screen.queryByTestId(caso.dialogo)).toBeNull();
  });

  it('tras cerrarse sigue en el DOM, cerrado y con su fila, mientras sale', async () => {
    const user = setupUser();
    caso.montar();
    expect(await abrir(user)).toHaveAttribute('data-open');

    salidaEnCurso();
    await user.click(screen.getByTestId(caso.descartar));

    await waitFor(() => expectCerradoEnElDom(caso.dialogo));
    if (caso.idOculto !== null) {
      expect(screen.getByTestId(caso.idOculto.testId)).toHaveValue(caso.idOculto.valor);
    }
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId(caso.dialogo)).toBeNull());
  });

  const tituloReapertura = caso.reabreSinError
    ? 'un rechazo anterior no reaparece al volver a abrir'
    : 'heredado: un rechazo anterior SI reaparece al volver a abrir';

  it(tituloReapertura, async () => {
    caso.rechazar();
    const user = setupUser();
    caso.montar();
    await abrir(user);
    const confirmar = screen.getByTestId(caso.confirmar);
    // Formulas no deja confirmar hasta saber cuantas versiones arrastra el borrado.
    await waitFor(() => expect(confirmar).toBeEnabled());
    await user.click(confirmar);
    expect(await screen.findByTestId(caso.error)).toBeInTheDocument();

    await user.click(screen.getByTestId(caso.descartar));
    await waitFor(() => expect(screen.queryByTestId(caso.dialogo)).toBeNull());

    await abrir(user);
    if (caso.reabreSinError) {
      expect(screen.queryByTestId(caso.error)).toBeNull();
    } else {
      // Comportamiento heredado: el estado del intento anterior vive en el dialogo montado.
      expect(screen.getByTestId(caso.error)).toBeInTheDocument();
    }
  });
});

describe('inventario: el panel de lotes de la fila (R33)', () => {
  it('tras cerrarse sigue en el DOM, cerrado, mientras sale', async () => {
    const user = setupUser();
    render(<ProductTable products={[PRODUCTO]} params={parametros()} totalPages={1} />);
    await clickRowAction(user, screen.getByTestId('product-row-actions'), 'product-batches-open');
    const panel = await screen.findByTestId('product-batches-sheet');
    expect(panel).toHaveAttribute('data-open');

    salidaEnCurso();
    // El cierre propio del panel (`SheetContent`), localizado por su `data-slot`, no por su copy.
    const cerrar = panel.querySelector<HTMLElement>('[data-slot="sheet-close"]');
    expect(cerrar).not.toBeNull();
    await user.click(cerrar!);

    await waitFor(() => expectCerradoEnElDom('product-batches-sheet'));
    await terminarSalida();
    await waitFor(() => expect(screen.queryByTestId('product-batches-sheet')).toBeNull());
  });
});
