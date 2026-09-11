// QC-67 T11 — El cambio del estado de cuenta: R32, R33, R34, R29.
//
// **La Server Action esta mockeada**: es el borde del modulo `identity` (R37), y es el punto de
// observacion de R32 —el `FormData` lleva el `id` y el estado destino— y de R30 —sin confirmar no
// se escribe nada—.
//
// **Ningun assert sobre literales de copy** (R41): las opciones se comparan contra
// `USER_ACCOUNT_STATUSES` **importado del contrato**, los controles por `data-testid` exportado y
// los errores por su codigo estable.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  USER_ACCOUNT_STATUS_LABELS,
  USER_STATUS_BADGE_TESTID,
  USER_STATUS_CONFIRM_TESTID,
  USER_STATUS_DIALOG_TESTID,
  USER_STATUS_DISMISS_TESTID,
  USER_STATUS_ERROR_MESSAGE_TESTID,
  USER_STATUS_ERROR_TESTID,
  USER_STATUS_FIELD,
  USER_STATUS_ID_FIELD,
  USER_STATUS_ID_TESTID,
  USER_STATUS_MESSAGE_TESTID,
  USER_STATUS_OPTION_TESTID,
  USER_STATUS_SELECT_TESTID,
  UserStatusBadge,
  UserStatusDialog,
} from '@/app/(private)/configuracion/usuarios/components';
import type { ErrorCode } from '@/lib/modules/errores';
import { USER_ACCOUNT_STATUSES, type UserRow } from '@/lib/modules/identity';
import type { UserMutationFormState } from '@/lib/modules/identity/adapters/driving/user-actions';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { routerMock, setUserAccountStatusActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  setUserAccountStatusActionMock:
    vi.fn<(prev: UserMutationFormState, data: FormData) => Promise<UserMutationFormState>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de estado`);
  };
  return {
    setUserAccountStatusAction: setUserAccountStatusActionMock,
    createUserAction: vi.fn(noDebeInvocarse('createUserAction')),
    updateUserAction: vi.fn(noDebeInvocarse('updateUserAction')),
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
    getUserAction: vi.fn(noDebeInvocarse('getUserAction')),
    listUsersAction: vi.fn(noDebeInvocarse('listUsersAction')),
  };
});

function fila(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-ana',
    displayName: 'Lopez Perez, Ana',
    username: 'ana.lopez',
    email: 'ana.lopez@example.com',
    roleName: 'Operario',
    accountStatus: 'active',
    ...overrides,
  };
}

const BLOQUEADA = fila({ id: 'u-bloqueada', accountStatus: 'blocked' });

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  setUserAccountStatusActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** El dialogo junto a la insignia de «su fila», para poder afirmar que la fila no cambia (R33). */
function DialogoDePrueba({ user = fila() }: { readonly user?: UserRow }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <UserStatusBadge status={user.accountStatus} />
      {open ? <UserStatusDialog user={user} open onOpenChange={setOpen} /> : null}
    </>
  );
}

/** Abre el selector y devuelve sus opciones, ya interactivas. */
async function abrirSelector(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(USER_STATUS_SELECT_TESTID));
  const opciones = await screen.findAllByTestId(USER_STATUS_OPTION_TESTID);
  return opciones;
}

describe('UNA sola accion, con los CUATRO valores del conjunto cerrado (R32)', () => {
  it('nombra a la persona y ofrece los cuatro estados, ni uno mas ni uno menos', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    expect(screen.getByTestId(USER_STATUS_MESSAGE_TESTID)).toHaveTextContent(
      fila().displayName,
    );

    const opciones = await abrirSelector(user);
    expect(opciones).toHaveLength(USER_ACCOUNT_STATUSES.length);
    expect(opciones.map((opcion) => opcion.getAttribute('data-status'))).toEqual([
      ...USER_ACCOUNT_STATUSES,
    ]);
  });

  it('NINGUN valor se excluye por el estado actual: ni el suyo, ni los demas', async () => {
    for (const actual of USER_ACCOUNT_STATUSES) {
      const user = setupUser();
      render(<DialogoDePrueba user={fila({ accountStatus: actual })} />);

      const opciones = await abrirSelector(user);
      expect(opciones.map((opcion) => opcion.getAttribute('data-status'))).toEqual([
        ...USER_ACCOUNT_STATUSES,
      ]);
      cleanup();
    }
  });

  it('no hay un boton por verbo: solo confirmar y volver, mas el propio selector', () => {
    render(<DialogoDePrueba />);

    const dialogo = screen.getByTestId(USER_STATUS_DIALOG_TESTID);
    const botones = within(dialogo).getAllByRole('button');
    // DOS botones, no cuatro: no hay «Activar», «Bloquear», «Desactivar» ni «Dejar pendiente».
    expect(botones).toHaveLength(2);
    expect(botones).toContain(screen.getByTestId(USER_STATUS_CONFIRM_TESTID));
    expect(botones).toContain(screen.getByTestId(USER_STATUS_DISMISS_TESTID));
    // El selector es un desplegable, no un boton mas.
    expect(within(dialogo).getByRole('combobox')).toBe(
      screen.getByTestId(USER_STATUS_SELECT_TESTID),
    );
    // Y ninguna etiqueta de verbo por estado: las etiquetas son las de los cuatro valores.
    for (const estado of USER_ACCOUNT_STATUSES) {
      expect(
        within(dialogo).queryAllByRole('button', { name: USER_ACCOUNT_STATUS_LABELS[estado] }),
      ).toHaveLength(0);
    }
  });

  it('MIENTRAS no se confirme, la operacion NO se invoca', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    await abrirSelector(user);
    expect(setUserAccountStatusActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(USER_STATUS_DISMISS_TESTID));
    await waitFor(() => expect(screen.queryByTestId(USER_STATUS_DIALOG_TESTID)).toBeNull());
    expect(setUserAccountStatusActionMock).not.toHaveBeenCalled();
  });
});

describe('`blocked` → `active` se ofrece igual que cualquier otro (R34)', () => {
  it('la cuenta bloqueada puede pasar a activa, y se envia el id y el destino', async () => {
    const user = setupUser();
    render(<DialogoDePrueba user={BLOQUEADA} />);

    const oculto = screen.getByTestId(USER_STATUS_ID_TESTID);
    expect(oculto).toHaveAttribute('type', 'hidden');
    expect(oculto).toHaveValue(BLOQUEADA.id);

    const opciones = await abrirSelector(user);
    const activa = opciones.find((opcion) => opcion.getAttribute('data-status') === 'active');
    await user.click(await esperarInteractiva(activa!));
    await user.click(screen.getByTestId(USER_STATUS_CONFIRM_TESTID));

    await waitFor(() => expect(setUserAccountStatusActionMock).toHaveBeenCalledTimes(1));
    const enviado = setUserAccountStatusActionMock.mock.calls[0]![1];
    expect(enviado.get(USER_STATUS_ID_FIELD)).toBe(BLOQUEADA.id);
    expect(enviado.get(USER_STATUS_FIELD)).toBe('active');
    // Ni contadores, ni bloqueos, ni promesas: la pantalla envia esos dos campos y nada mas.
    expect([...enviado.keys()].sort()).toEqual([USER_STATUS_FIELD, USER_STATUS_ID_FIELD].sort());
  });

  it('con exito cierra, avisa una vez y refresca sin tocar la URL (R29)', async () => {
    const user = setupUser();
    render(<DialogoDePrueba user={BLOQUEADA} />);

    await user.click(screen.getByTestId(USER_STATUS_CONFIRM_TESTID));

    await waitFor(() => expect(screen.queryByTestId(USER_STATUS_DIALOG_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('un rechazo se pinta DENTRO y no cambia el estado de la fila (R33)', () => {
  for (const code of ['self_operation', 'invalid_input'] as const satisfies readonly ErrorCode[]) {
    it(`\`${code}\` deja el dialogo abierto y la fila con su estado de siempre`, async () => {
      const user = setupUser();
      setUserAccountStatusActionMock.mockResolvedValue({
        status: 'error',
        code,
        message: 'No se pudo cambiar el estado.',
      });
      render(<DialogoDePrueba user={BLOQUEADA} />);

      await user.click(screen.getByTestId(USER_STATUS_CONFIRM_TESTID));

      const aviso = await screen.findByTestId(USER_STATUS_ERROR_TESTID);
      const dialogo = screen.getByTestId(USER_STATUS_DIALOG_TESTID);
      expect(within(dialogo).getByTestId(USER_STATUS_ERROR_TESTID)).toBe(aviso);
      expect(aviso).toHaveAttribute('role', 'alert');
      expect(aviso).toHaveAttribute('data-code', code);
      expect(within(aviso).getByTestId(USER_STATUS_ERROR_MESSAGE_TESTID)).toBeInTheDocument();

      expect(screen.getByTestId(USER_STATUS_CONFIRM_TESTID)).toBeInTheDocument();
      // El estado PINTADO en la fila no se mueve: repintar es cosa del servidor, y solo con exito.
      expect(screen.getByTestId(USER_STATUS_BADGE_TESTID)).toHaveAttribute(
        'data-status',
        BLOQUEADA.accountStatus,
      );
      expect(toastExito).not.toHaveBeenCalled();
      expect(routerMock.refresh).not.toHaveBeenCalled();
    });
  }

  it('el dialogo no monta ninguna region de avisos propia (R29)', () => {
    render(<DialogoDePrueba />);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
