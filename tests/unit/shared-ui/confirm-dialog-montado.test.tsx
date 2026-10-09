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
import {
  ConfirmDialog,
  ConfirmDialogBody,
  ConfirmDialogFrame,
} from '@/components/shared/confirm-dialog';
import type { DataTableParams } from '@/components/shared/data-table';
import { errorMessage } from '@/lib/modules/errores';
import type { UserRow, WorkGroupRow } from '@/lib/modules/identity';
import type { UserMutationFormState } from '@/lib/modules/identity/adapters/driving/user-actions';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';

const { routerMock, deleteUserActionMock, noDebeInvocarse } = vi.hoisted(() => ({
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
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  getMassVolumeBridgeAction: vi.fn(async () => ({ status: 'success' as const, data: null })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
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
    await user.click(within(fila).getByTestId(WORK_GROUP_ACTION_DELETE_TESTID));
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
