// QC-67 T10 — La confirmacion del borrado de un usuario: R30, R31, R29.
//
// **La Server Action esta mockeada**: es el borde del modulo `identity` (R37), y es ademas el
// punto de observacion de R30 —«mientras no confirme, NO se invoca»— y de R29 —el `FormData` que
// recibe lleva el `id` de la fila—.
//
// **Ningun assert sobre literales de copy** (R41): rol ARIA, `data-testid` exportado como
// constante, codigos estables del catalogo y datos del propio caso.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE_USER_CONFIRM_TESTID,
  DELETE_USER_DIALOG_TESTID,
  DELETE_USER_DISMISS_TESTID,
  DELETE_USER_ERROR_MESSAGE_TESTID,
  DELETE_USER_ERROR_TESTID,
  DELETE_USER_ID_FIELD,
  DELETE_USER_ID_TESTID,
  DELETE_USER_MESSAGE_TESTID,
  DeleteUserDialog,
  USER_STATUS_BADGE_TESTID,
  UserStatusBadge,
} from '@/app/(private)/configuracion/usuarios/components';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';
import type { UserRow } from '@/lib/modules/identity';
import type { UserMutationFormState } from '@/lib/modules/identity/adapters/driving/user-actions';
import { errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

const { routerMock, deleteUserActionMock } = vi.hoisted(() => ({
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

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    deleteUserAction: deleteUserActionMock,
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    setUserAccountStatusAction: vi.fn(noDebeInvocarse('setUserAccountStatusAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
  };
});

const FILA: UserRow = {
  id: 'u-ana',
  displayName: 'Lopez Perez, Ana',
  username: 'ana.lopez',
  email: 'ana.lopez@example.com',
  roleName: 'Operario',
  accountStatus: 'active',
};

/**
 * Los dos rechazos vivos de esta operacion, por su codigo estable (R31). El generico queda fuera
 * del tipo —exige `reference`— y tiene su propio caso mas abajo.
 */
const RECHAZOS: readonly Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>[] = [
  'self_operation',
  'last_administrator',
];

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  deleteUserActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/**
 * El dialogo junto a la insignia de estado de «su fila»: asi se puede afirmar que un rechazo no
 * retira la fila ni cambia lo que la fila pinta (R31).
 */
function DialogoDePrueba({ user = FILA }: { readonly user?: UserRow }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <UserStatusBadge status={user.accountStatus} />
      {open ? <DeleteUserDialog user={user} open onOpenChange={setOpen} /> : null}
    </>
  );
}

describe('la confirmacion nombra a la persona y no escribe nada por si sola (R30)', () => {
  it('el mensaje nombra al usuario', () => {
    render(<DialogoDePrueba />);

    expect(screen.getByTestId(DELETE_USER_MESSAGE_TESTID)).toHaveTextContent(FILA.displayName);
  });

  it('MIENTRAS no se confirme, la operacion de borrado NO se invoca', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    // Abrirlo no escribe; volver, tampoco.
    expect(deleteUserActionMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId(DELETE_USER_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(DELETE_USER_DIALOG_TESTID)).toBeNull());
    expect(deleteUserActionMock).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
  });

  it('CUANDO se confirma, la invoca con el identificador de la fila como campo oculto', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    const oculto = screen.getByTestId(DELETE_USER_ID_TESTID);
    expect(oculto).toHaveAttribute('type', 'hidden');
    expect(oculto).toHaveValue(FILA.id);

    await user.click(screen.getByTestId(DELETE_USER_CONFIRM_TESTID));

    await waitFor(() => expect(deleteUserActionMock).toHaveBeenCalledTimes(1));
    const enviado = deleteUserActionMock.mock.calls[0]![1];
    expect(enviado.get(DELETE_USER_ID_FIELD)).toBe(FILA.id);
  });

  it('con exito cierra, avisa una vez y refresca sin tocar la URL (R29)', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    await user.click(screen.getByTestId(DELETE_USER_CONFIRM_TESTID));

    await waitFor(() => expect(screen.queryByTestId(DELETE_USER_DIALOG_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('un rechazo se pinta DENTRO del dialogo, por su codigo (R31)', () => {
  for (const code of RECHAZOS) {
    it(`\`${code}\` se pinta dentro, el dialogo sigue abierto y la fila no se retira`, async () => {
      const user = setupUser();
      deleteUserActionMock.mockResolvedValue({
        status: 'error',
        code,
        message: 'No se pudo eliminar.',
      });
      render(<DialogoDePrueba />);

      await user.click(screen.getByTestId(DELETE_USER_CONFIRM_TESTID));

      const aviso = await screen.findByTestId(DELETE_USER_ERROR_TESTID);
      const dialogo = screen.getByTestId(DELETE_USER_DIALOG_TESTID);
      expect(within(dialogo).getByTestId(DELETE_USER_ERROR_TESTID)).toBe(aviso);
      expect(aviso).toHaveAttribute('role', 'alert');
      // Se distingue por su CODIGO, nunca por el texto del mensaje.
      expect(aviso).toHaveAttribute('data-code', code);
      expect(within(aviso).getByTestId(DELETE_USER_ERROR_MESSAGE_TESTID)).toBeInTheDocument();

      // El dialogo sigue abierto, la fila sigue ahi y nada se refresco.
      expect(screen.getByTestId(DELETE_USER_CONFIRM_TESTID)).toBeInTheDocument();
      expect(screen.getByTestId(USER_STATUS_BADGE_TESTID)).toHaveAttribute(
        'data-status',
        FILA.accountStatus,
      );
      expect(toastExito).not.toHaveBeenCalled();
      expect(routerMock.refresh).not.toHaveBeenCalled();
    });
  }

  it('el rechazo INESPERADO ensena el identificador de la peticion (QC-71 R17)', async () => {
    const user = setupUser();
    deleteUserActionMock.mockResolvedValue(errorInesperado());
    render(<DialogoDePrueba />);

    await user.click(screen.getByTestId(DELETE_USER_CONFIRM_TESTID));

    const aviso = await screen.findByTestId(DELETE_USER_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', UNEXPECTED_ERROR_CODE);
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeInTheDocument();
  });

  it('el dialogo no monta ninguna region de avisos propia (R29)', () => {
    render(<DialogoDePrueba />);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
