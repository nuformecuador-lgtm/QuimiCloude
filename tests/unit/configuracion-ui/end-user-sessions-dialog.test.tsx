// QC-101 T9 — La confirmacion del cierre de TODAS las sesiones de otra persona: R9, R10, R13, R14,
// R15 y R19 (la mitad de interfaz).
//
// **La Server Action esta mockeada por su RUTA EXACTA**: es el borde del modulo `identity`, y es el
// punto de observacion de R9 —«mientras no confirme, NO se invoca»— y de R10 —se invoca UNA vez y
// el `FormData` lleva el `id` de la persona—. Que la action delegue bien en el caso de uso lo
// prueban `tests/unit/identity/sesiones/session-actions.test.ts` (R1, R2, R5, R6) y el service (R3).
//
// **Ningun assert sobre literales de copy**: los textos se toman de las funciones de
// `user-labels.ts`, los controles de las constantes `END_USER_SESSIONS_*` y los codigos del
// catalogo.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  END_USER_SESSIONS_CONFIRM_TESTID,
  END_USER_SESSIONS_DIALOG_TESTID,
  END_USER_SESSIONS_DISMISS_TESTID,
  END_USER_SESSIONS_ERROR_MESSAGE_TESTID,
  END_USER_SESSIONS_ERROR_TESTID,
  END_USER_SESSIONS_ID_FIELD,
  END_USER_SESSIONS_ID_TESTID,
  END_USER_SESSIONS_MESSAGE_TESTID,
  EndUserSessionsDialog,
  USER_STATUS_BADGE_TESTID,
  UserStatusBadge,
  endUserSessionsMessage,
  endUserSessionsSuccess,
  endUserSessionsTitle,
} from '@/app/(private)/configuracion/usuarios/components';
import { UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID } from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';
import type { UserRow } from '@/lib/modules/identity';
import type { EndSessionsFormState } from '@/lib/modules/identity/adapters/driving/session-actions';
import { errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

const { routerMock, endAllSessionsActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  endAllSessionsActionMock:
    vi.fn<(prev: EndSessionsFormState, data: FormData) => Promise<EndSessionsFormState>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/session-actions', () => ({
  endAllSessionsAction: endAllSessionsActionMock,
}));

// El dialogo no toca NINGUNA de las actions de administracion de usuarios: dobles que fallan.
vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de cierre de sesiones`);
  };
  return {
    deleteUserAction: vi.fn(noDebeInvocarse('deleteUserAction')),
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
 * Los dos rechazos de dominio que esta operacion puede devolver (`design.md > 1`, contratos I/O).
 * El generico queda fuera del tipo —exige `reference`— y tiene su propio caso.
 */
const RECHAZOS: readonly Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>[] = [
  'unauthorized',
  'user_not_found',
];

const CLASES_TACTILES = ['min-h-11', 'min-w-11'] as const;

/** El orden en que ocurren las tres cosas de R13, apuntado por los propios dobles. */
let orden: string[];
let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  orden = [];
  endAllSessionsActionMock.mockResolvedValue({ status: 'success' });
  routerMock.refresh.mockImplementation(() => {
    orden.push('refresh');
  });
  const original = toast.success.bind(toast);
  toastExito = vi.spyOn(toast, 'success').mockImplementation((...args) => {
    orden.push('toast');
    return original(...args);
  });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/**
 * El dialogo junto a la insignia de estado de «su fila», montado solo mientras esta abierto —como lo
 * monta el panel—. Asi se puede afirmar que un rechazo no altera nada de lo pintado (R14).
 */
function DialogoDePrueba({ user = FILA }: { readonly user?: UserRow }) {
  const [open, setOpen] = useState(true);
  const cambiar = (siguiente: boolean) => {
    if (!siguiente) orden.push('close');
    setOpen(siguiente);
  };
  return (
    <>
      <UserStatusBadge status={user.accountStatus} />
      {open ? <EndUserSessionsDialog user={user} open onOpenChange={cambiar} /> : null}
    </>
  );
}

describe('la confirmacion nombra a la persona y no cierra nada por si sola (R9)', () => {
  it('R9 — el titulo y la descripcion nombran a la persona y advierten con los textos de user-labels', () => {
    render(<DialogoDePrueba />);

    const dialogo = screen.getByTestId(END_USER_SESSIONS_DIALOG_TESTID);
    expect(within(dialogo).getByText(endUserSessionsTitle(FILA.displayName))).toBeInTheDocument();
    const mensaje = screen.getByTestId(END_USER_SESSIONS_MESSAGE_TESTID);
    expect(mensaje).toHaveTextContent(endUserSessionsMessage(FILA.displayName));
    expect(mensaje).toHaveTextContent(FILA.displayName);
  });

  it('R9 — abrir el dialogo NO invoca la action, y volver tampoco', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    expect(endAllSessionsActionMock).not.toHaveBeenCalled();
    await user.click(screen.getByTestId(END_USER_SESSIONS_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(END_USER_SESSIONS_DIALOG_TESTID)).toBeNull());
    expect(endAllSessionsActionMock).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastExito).not.toHaveBeenCalled();
  });
});

describe('confirmar invoca la action UNA vez con el id de la persona (R10)', () => {
  it('R10 — al confirmar se invoca EXACTAMENTE una vez, con el id como campo oculto', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    const oculto = screen.getByTestId(END_USER_SESSIONS_ID_TESTID);
    expect(oculto).toHaveAttribute('type', 'hidden');
    expect(oculto).toHaveAttribute('name', END_USER_SESSIONS_ID_FIELD);
    expect(oculto).toHaveValue(FILA.id);

    await user.click(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    await waitFor(() => expect(endAllSessionsActionMock).toHaveBeenCalledTimes(1));
    const enviado = endAllSessionsActionMock.mock.calls[0]![1];
    expect(enviado.get(END_USER_SESSIONS_ID_FIELD)).toBe(FILA.id);
    // El `FormData` lleva ese campo y ningun otro: nada de numeros, dispositivos ni sesiones.
    expect([...enviado.keys()]).toEqual([END_USER_SESSIONS_ID_FIELD]);
    // Y sigue siendo una sola llamada cuando el exito ya se proceso.
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(endAllSessionsActionMock).toHaveBeenCalledTimes(1);
  });
});

describe('con exito: cerrar, avisar sin numero y refrescar la MISMA URL (R13, R19)', () => {
  it('R13 — en este orden: cierra el dialogo, avisa por toast y refresca, sin navegar', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    await user.click(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    await waitFor(() => expect(screen.queryByTestId(END_USER_SESSIONS_DIALOG_TESTID)).toBeNull());
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(orden).toEqual(['close', 'toast', 'refresh']);
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('R13 R19 — el aviso es el de user-labels, nombra a la persona y no afirma ningun numero', async () => {
    const user = setupUser();
    render(<DialogoDePrueba />);

    await user.click(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    await waitFor(() => expect(toastExito).toHaveBeenCalledTimes(1));
    const aviso = String(toastExito.mock.calls[0]![0]);
    expect(aviso).toBe(endUserSessionsSuccess(FILA.displayName));
    // Retirado el nombre, no queda ni un digito: el sistema no sabe cuantas sesiones cerro.
    expect(aviso.replaceAll(FILA.displayName, '')).not.toMatch(/\d/);
  });

  it('R19 — ningun texto del dialogo abierto contiene un digito fuera del nombre', () => {
    render(<DialogoDePrueba />);

    const texto = screen.getByTestId(END_USER_SESSIONS_DIALOG_TESTID).textContent ?? '';
    expect(texto.replaceAll(FILA.displayName, '')).not.toMatch(/\d/);
  });

  it('R13 — el dialogo no monta ninguna region de avisos propia', () => {
    render(<DialogoDePrueba />);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});

describe('un rechazo se pinta DENTRO del dialogo, por su codigo (R14)', () => {
  for (const code of RECHAZOS) {
    it(`R14 — \`${code}\` se pinta dentro, el dialogo sigue abierto y no hay aviso de exito`, async () => {
      const user = setupUser();
      endAllSessionsActionMock.mockResolvedValue({
        status: 'error',
        code,
        message: 'No se pudo completar la operacion.',
      });
      render(<DialogoDePrueba />);

      await user.click(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

      const aviso = await screen.findByTestId(END_USER_SESSIONS_ERROR_TESTID);
      const dialogo = screen.getByTestId(END_USER_SESSIONS_DIALOG_TESTID);
      expect(within(dialogo).getByTestId(END_USER_SESSIONS_ERROR_TESTID)).toBe(aviso);
      expect(aviso).toHaveAttribute('role', 'alert');
      // Se distingue por su CODIGO, nunca por el texto del mensaje.
      expect(aviso).toHaveAttribute('data-code', code);
      expect(within(aviso).getByTestId(END_USER_SESSIONS_ERROR_MESSAGE_TESTID)).toBeInTheDocument();

      // Abierto, con lo pintado intacto, sin aviso de exito, sin refresco y sin cerrarse.
      expect(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID)).toBeInTheDocument();
      expect(screen.getByTestId(USER_STATUS_BADGE_TESTID)).toHaveAttribute(
        'data-status',
        FILA.accountStatus,
      );
      expect(toastExito).not.toHaveBeenCalled();
      expect(routerMock.refresh).not.toHaveBeenCalled();
      expect(orden).not.toContain('close');
    });
  }

  it('R14 — el rechazo INESPERADO se pinta dentro con el identificador de la peticion', async () => {
    const user = setupUser();
    endAllSessionsActionMock.mockResolvedValue(errorInesperado());
    render(<DialogoDePrueba />);

    await user.click(screen.getByTestId(END_USER_SESSIONS_CONFIRM_TESTID));

    const aviso = await screen.findByTestId(END_USER_SESSIONS_ERROR_TESTID);
    expect(aviso).toHaveAttribute('data-code', UNEXPECTED_ERROR_CODE);
    expect(within(aviso).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(END_USER_SESSIONS_DIALOG_TESTID)).toBeInTheDocument();
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('multiplataforma: objetivo tactil y nada que dependa de `:hover` (R15)', () => {
  it('R15 — confirmar y volver miden al menos 44x44 px', () => {
    render(<DialogoDePrueba />);

    for (const testid of [END_USER_SESSIONS_CONFIRM_TESTID, END_USER_SESSIONS_DISMISS_TESTID]) {
      const control = screen.getByTestId(testid);
      for (const clase of CLASES_TACTILES) {
        expect(control.className, `${testid} sin ${clase}`).toContain(clase);
      }
    }
  });

  it('R15 — los dos controles estan en el DOM desde el primer render, sin clases de visibilidad por puntero', () => {
    render(<DialogoDePrueba />);

    const dialogo = screen.getByTestId(END_USER_SESSIONS_DIALOG_TESTID);
    expect(within(dialogo).getAllByRole('button').length).toBeGreaterThanOrEqual(2);
    for (const testid of [END_USER_SESSIONS_CONFIRM_TESTID, END_USER_SESSIONS_DISMISS_TESTID]) {
      const clases = screen.getByTestId(testid).className;
      expect(clases).not.toMatch(/group-hover|hover:(opacity|visible|block|flex|inline)/);
      expect(clases.split(/\s+/)).not.toContain('invisible');
      expect(clases.split(/\s+/)).not.toContain('hidden');
    }
  });
});
