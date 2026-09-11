// QC-45 T8 — La confirmacion de borrado: R27, R28, R25.
//
// **`deletePresentationAction` es un doble espia; las otras tres actions FALLAN si se les llama.**
// Un dialogo de borrado que de paso listara o creara seria un fallo silencioso, asi que se afirma
// en negativo con el doble, no con un comentario.
//
// Nada se identifica por copy (R35): rol ARIA, `data-testid` o constantes IMPORTADAS del
// componente. El nombre de la presentacion si es un dato del caso de prueba -no es copy-, y se
// afirma que aparece; el uuid se afirma en negativo, que es lo que importa.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '../../helpers/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE_PRESENTATION_CONFIRM_TESTID,
  DELETE_PRESENTATION_DIALOG_TESTID,
  DELETE_PRESENTATION_DISMISS_TESTID,
  DELETE_PRESENTATION_ERROR_MESSAGE_TESTID,
  DELETE_PRESENTATION_ERROR_TESTID,
  DELETE_PRESENTATION_ID_FIELD,
  DELETE_PRESENTATION_ID_TESTID,
  DELETE_PRESENTATION_MESSAGE_TESTID,
  DeletePresentationDialog,
  PRESENTATION_IN_USE_CODE,
} from '@/app/(private)/configuracion/presentaciones/components';
import type { PresentationView } from '@/lib/modules/inventario';
import type { PresentationMutationFormState } from '@/lib/modules/inventario/adapters/driving/presentation-actions';

const { deletePresentationActionMock, routerMock } = vi.hoisted(() => ({
  deletePresentationActionMock:
    vi.fn<
      (
        prev: PresentationMutationFormState,
        data: FormData,
      ) => Promise<PresentationMutationFormState>
    >(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    deletePresentationAction: deletePresentationActionMock,
    createPresentationAction: vi.fn(noDebeInvocarse('createPresentationAction')),
    updatePresentationAction: vi.fn(noDebeInvocarse('updatePresentationAction')),
    listPresentationsAction: vi.fn(noDebeInvocarse('listPresentationsAction')),
  };
});

const NOMBRE = 'Bidón 20 L';

function presentacion(overrides: Partial<PresentationView> = {}): PresentationView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: NOMBRE,
    nameNormalized: 'bidon 20 l',
    unitId: 'unit-kg',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  };
}

const cerrar = vi.fn<(open: boolean) => void>();

/**
 * Si el dialogo pidio cerrarse. Se mira el PRIMER argumento y no la llamada entera: el primitivo
 * acompana el `onOpenChange` con el evento y el motivo del cierre, y un
 * `toHaveBeenCalledWith(false)` fallaria por esos extras sin que nada este mal.
 */
function seCerro(): boolean {
  return cerrar.mock.calls.some(([abierto]) => abierto === false);
}

let toastExito: ReturnType<typeof vi.spyOn>;

function montar(view: PresentationView = presentacion()) {
  render(<DeletePresentationDialog presentation={view} open onOpenChange={cerrar} />);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  deletePresentationActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('el dialogo nombra la presentacion (R27)', () => {
  it('el mensaje de confirmacion contiene el nombre que el usuario ve en la lista', () => {
    const la = montar();

    expect(screen.getByTestId(DELETE_PRESENTATION_MESSAGE_TESTID)).toHaveTextContent(la.name);
  });

  it('en negativo: el identificador tecnico NO aparece en la parte visible del dialogo', () => {
    const la = montar();

    const dialogo = screen.getByTestId(DELETE_PRESENTATION_DIALOG_TESTID);
    expect(dialogo.textContent ?? '').not.toContain(la.id);
    // El uuid viaja donde tiene que viajar: en el campo oculto que la operacion lee.
    expect(screen.getByTestId(DELETE_PRESENTATION_ID_TESTID)).toHaveValue(la.id);
  });
});

describe('mientras el usuario no confirme no se invoca el borrado (R27)', () => {
  it('abrir el dialogo no llama a `deletePresentationAction`', () => {
    montar();

    expect(screen.getByTestId(DELETE_PRESENTATION_DIALOG_TESTID)).toBeInTheDocument();
    expect(deletePresentationActionMock).not.toHaveBeenCalled();
  });

  it('volver atras cierra sin borrar nada', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(DELETE_PRESENTATION_DISMISS_TESTID));

    expect(deletePresentationActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('al confirmar se invoca el borrado y se aplica R25', () => {
  it('llama a la action con el `id` y luego cierra, avisa y refresca la misma URL', async () => {
    const user = setupUser();
    const la = montar();

    await user.click(screen.getByTestId(DELETE_PRESENTATION_CONFIRM_TESTID));

    await waitFor(() => expect(deletePresentationActionMock).toHaveBeenCalledTimes(1));
    const enviado = deletePresentationActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(DELETE_PRESENTATION_ID_FIELD)).toBe(la.id);

    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('`presentation_in_use` se pinta DENTRO del dialogo, que sigue abierto (R28)', () => {
  it('el codigo del rechazo por FK es el del catalogo y conserva su valor', () => {
    // QC-70 R19, R20 — `presentation_in_use` ya era inequivoco, asi que NO se renombra; lo que
    // cambia es que el literal sale del catalogo y esta tipado con `ErrorCode`. Se fija el valor
    // aqui para que un renombrado silencioso no deje al dialogo comparando contra una palabra
    // muerta.
    expect(PRESENTATION_IN_USE_CODE).toBe('presentation_in_use');
  });

  it('la region de error lleva el codigo estable y el dialogo no se cierra', async () => {
    const user = setupUser();
    const mensajeDelServidor = 'La presentacion tiene productos asignados y no se puede borrar.';
    deletePresentationActionMock.mockResolvedValue({
      status: 'error',
      code: PRESENTATION_IN_USE_CODE,
      message: mensajeDelServidor,
    });
    montar();

    await user.click(screen.getByTestId(DELETE_PRESENTATION_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_PRESENTATION_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', PRESENTATION_IN_USE_CODE);
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId(DELETE_PRESENTATION_DIALOG_TESTID)).toContainElement(region);
    expect(screen.getByTestId(DELETE_PRESENTATION_ERROR_MESSAGE_TESTID)).toHaveTextContent(
      mensajeDelServidor,
    );
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
    // Nada se retira de la lista: no hay refresco ni navegacion que la altere.
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('cualquier otro codigo se pinta igual: decide el codigo, nunca el texto', async () => {
    // QC-70 R20 — el `not_found` generico ya no existe: el caso concreto de esta pantalla es
    // `presentation_not_found`, que es lo que emite el borrado cuando la presentacion se fue.
    const user = setupUser();
    deletePresentationActionMock.mockResolvedValue({
      status: 'error',
      code: 'presentation_not_found',
      message: 'La presentacion solicitada no existe.',
    });
    montar();

    await user.click(screen.getByTestId(DELETE_PRESENTATION_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_PRESENTATION_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'presentation_not_found');
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
  });
});
