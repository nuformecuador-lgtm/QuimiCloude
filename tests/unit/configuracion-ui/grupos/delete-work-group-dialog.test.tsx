// QC-85 T11 — La confirmacion del borrado de un grupo: R33, R34, R35.
//
// **La Server Action esta mockeada**: es el borde del modulo `identity`, que esta ficha solo
// consume (R36), y es el punto de observacion de R33 —«mientras no se confirme, la operacion NO se
// invoca»—.
//
// **Ningun assert sobre literales de copy** (R41): el dialogo, su mensaje y sus dos botones se
// localizan por `data-testid` exportado; del mensaje solo se afirma que NOMBRA al grupo —con el
// dato del propio caso—, no como lo dice.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE_WORK_GROUP_CONFIRM_TESTID,
  DELETE_WORK_GROUP_DIALOG_TESTID,
  DELETE_WORK_GROUP_DISMISS_TESTID,
  DELETE_WORK_GROUP_ERROR_MESSAGE_TESTID,
  DELETE_WORK_GROUP_ERROR_TESTID,
  DELETE_WORK_GROUP_ID_TESTID,
  DELETE_WORK_GROUP_MESSAGE_TESTID,
  DeleteWorkGroupDialog,
  WORK_GROUP_ID_FIELD,
} from '@/app/(private)/configuracion/usuarios/components';
import { errorMessage } from '@/lib/modules/errores';
import type { WorkGroupRow } from '@/lib/modules/identity';
import type { WorkGroupMutationFormState } from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { setupUser } from '../../../helpers/user-event';

const { routerMock, deleteWorkGroupActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  deleteWorkGroupActionMock:
    vi.fn<
      (prev: WorkGroupMutationFormState, data: FormData) => Promise<WorkGroupMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    createWorkGroupAction: vi.fn(noDebeInvocarse('createWorkGroupAction')),
    renameWorkGroupAction: vi.fn(noDebeInvocarse('renameWorkGroupAction')),
    deleteWorkGroupAction: deleteWorkGroupActionMock,
    addWorkGroupMemberAction: vi.fn(noDebeInvocarse('addWorkGroupMemberAction')),
    removeWorkGroupMemberAction: vi.fn(noDebeInvocarse('removeWorkGroupMemberAction')),
    listWorkGroupsAction: vi.fn(noDebeInvocarse('listWorkGroupsAction')),
    listWorkGroupMembersAction: vi.fn(noDebeInvocarse('listWorkGroupMembersAction')),
  };
});

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
  };
});

const GRUPO: WorkGroupRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Laboratorio',
  members: [],
};

/** Si alguien pidio CERRAR: el primitivo pasa mas argumentos que el `open`, y el unico que este
 *  componente declara en su prop es el PRIMERO. */
function seCerro(onOpenChange: { mock: { calls: unknown[][] } }): boolean {
  return onOpenChange.mock.calls.some((argumentos) => argumentos[0] === false);
}

function montar(onOpenChange = vi.fn<(open: boolean) => void>()) {
  render(<DeleteWorkGroupDialog group={GRUPO} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  toastExito = vi.spyOn(toast, 'success').mockImplementation(() => 'id');
  deleteWorkGroupActionMock.mockResolvedValue({ status: 'success' });
});

afterEach(() => {
  cleanup();
  toastExito.mockRestore();
});

describe('la confirmacion NOMBRA al grupo y no escribe hasta que se confirma (R33)', () => {
  it('abrir el dialogo NO invoca nada', async () => {
    montar();

    expect(await screen.findByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeInTheDocument();
    expect(deleteWorkGroupActionMock).not.toHaveBeenCalled();
  });

  it('el mensaje dice QUE grupo se va a borrar', async () => {
    montar();

    expect(await screen.findByTestId(DELETE_WORK_GROUP_MESSAGE_TESTID)).toHaveTextContent(
      GRUPO.name,
    );
  });

  it('descartar tampoco invoca nada: cierra y ya', async () => {
    const user = setupUser();
    const onOpenChange = montar();

    await user.click(await screen.findByTestId(DELETE_WORK_GROUP_DISMISS_TESTID));

    await waitFor(() => expect(seCerro(onOpenChange)).toBe(true));
    expect(deleteWorkGroupActionMock).not.toHaveBeenCalled();
  });

  it('confirmar SI la invoca, con el identificador de ese grupo y nada mas', async () => {
    const user = setupUser();
    montar();

    expect(await screen.findByTestId(DELETE_WORK_GROUP_ID_TESTID)).toHaveValue(GRUPO.id);
    await user.click(screen.getByTestId(DELETE_WORK_GROUP_CONFIRM_TESTID));

    await waitFor(() => expect(deleteWorkGroupActionMock).toHaveBeenCalledTimes(1));
    const datos = deleteWorkGroupActionMock.mock.calls[0]![1];
    expect([...datos.keys()]).toEqual([WORK_GROUP_ID_FIELD]);
    expect(datos.get(WORK_GROUP_ID_FIELD)).toBe(GRUPO.id);
  });
});

describe('un rechazo se queda DENTRO del dialogo, por su codigo (R34)', () => {
  it('se pinta el error, el dialogo sigue abierto y no se avisa de ningun exito', async () => {
    const user = setupUser();
    deleteWorkGroupActionMock.mockResolvedValue({
      status: 'error',
      code: 'work_group_not_found',
      message: errorMessage('work_group_not_found'),
    });
    const onOpenChange = montar();

    await user.click(await screen.findByTestId(DELETE_WORK_GROUP_CONFIRM_TESTID));

    const error = await screen.findByTestId(DELETE_WORK_GROUP_ERROR_TESTID);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveAttribute('data-code', 'work_group_not_found');
    expect(screen.getByTestId(DELETE_WORK_GROUP_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      errorMessage('work_group_not_found'),
    );
    // El dialogo sigue abierto: nadie lo cerro, y la lista de detras no se refresco.
    expect(screen.getByTestId(DELETE_WORK_GROUP_DIALOG_TESTID)).toBeInTheDocument();
    expect(seCerro(onOpenChange)).toBe(false);
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('un rechazo por autorizacion se distingue por su codigo, igual que cualquier otro', async () => {
    const user = setupUser();
    deleteWorkGroupActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });
    montar();

    await user.click(await screen.findByTestId(DELETE_WORK_GROUP_CONFIRM_TESTID));

    expect(await screen.findByTestId(DELETE_WORK_GROUP_ERROR_TESTID)).toHaveAttribute(
      'data-code',
      'unauthorized',
    );
  });
});

describe('con exito cierra, avisa y refresca sin recargar (R35)', () => {
  it('cierra el dialogo, avisa por toast y reejecuta la lista con la MISMA URL', async () => {
    const user = setupUser();
    const onOpenChange = montar();

    await user.click(await screen.findByTestId(DELETE_WORK_GROUP_CONFIRM_TESTID));

    await waitFor(() => expect(seCerro(onOpenChange)).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
