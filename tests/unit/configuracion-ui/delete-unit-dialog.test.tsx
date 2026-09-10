// QC-39 T11 — La confirmacion de borrado de una unidad: R30, R38, R40, R41, R42.
//
// **`deleteUnitAction` es un doble espia; las otras tres actions FALLAN si se les llama.** Un
// dialogo de borrado que de paso listara o creara seria un fallo silencioso, asi que se afirma en
// negativo con el doble, no con un comentario.
//
// Nada se identifica por copy (R49): rol ARIA, `data-testid` o constantes IMPORTADAS del
// componente, y los codigos de error salen de las CLASES del dominio. El nombre de la unidad si es
// un dato del caso de prueba —no es copy—, y se afirma que aparece; el identificador tecnico se
// afirma en negativo, que es lo que importa.

import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DELETE_UNIT_CONFIRM_TESTID,
  DELETE_UNIT_DIALOG_TESTID,
  DELETE_UNIT_DISMISS_TESTID,
  DELETE_UNIT_ERROR_MESSAGE_TESTID,
  DELETE_UNIT_ERROR_TESTID,
  DELETE_UNIT_ID_FIELD,
  DELETE_UNIT_ID_TESTID,
  DELETE_UNIT_MESSAGE_TESTID,
  DeleteUnitDialog,
  UNIT_ACTION_DELETE_TESTID,
  UNIT_IN_USE_CODE,
  UnitRowActions,
  deleteUnitLabel,
} from '@/app/(private)/configuracion/unidades/components';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';

// QC-71 (R15, R16): los codigos que estos casos pintan son los CATALOGADOS. El generico ya no
// cabe en esta forma de estado -exige `reference`-, y por eso se excluye del tipo del parametro
// en vez de dejarlo pasar con un cast.
type CodigoCatalogado = Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>;
import {
  SystemUnitError,
  UnauthorizedError,
  UnitInUseError,
  type UnitView,
} from '@/lib/modules/unidades';
import type { UnitMutationFormState } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import { setupUser } from '../../helpers/user-event';

const { deleteUnitActionMock, routerMock } = vi.hoisted(() => ({
  deleteUnitActionMock:
    vi.fn<(prev: UnitMutationFormState, data: FormData) => Promise<UnitMutationFormState>>(),
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

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de borrado`);
  };
  return {
    deleteUnitAction: deleteUnitActionMock,
    createUnitAction: vi.fn(noDebeInvocarse('createUnitAction')),
    updateUnitAction: vi.fn(noDebeInvocarse('updateUnitAction')),
    listUnitsAction: vi.fn(noDebeInvocarse('listUnitsAction')),
  };
});

/** Codigos ESTABLES, leidos de las clases de error y nunca escritos a mano (R42). */
const UNIT_IN_USE = new UnitInUseError().code;
const SYSTEM_UNIT_CODE = new SystemUnitError().code;
const UNAUTHORIZED_CODE = new UnauthorizedError().code;

const NOMBRE = 'Kilogramo';

/** Envoltorio de la fila, para afirmar que nadie la retira al fallar el borrado. */
const FILA_TESTID = 'fila-de-la-lista';

function unidad(overrides: Partial<UnitView> = {}): UnitView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: NOMBRE,
    symbol: 'kg',
    baseUnitId: null,
    factor: null,
    isSystem: false,
    ...overrides,
  };
}

const cerrar = vi.fn<(open: boolean) => void>();

/**
 * Si el dialogo pidio cerrarse. Se mira el PRIMER argumento y no la llamada entera: el primitivo
 * acompana el `onOpenChange` con el evento y el motivo del cierre, y un `toHaveBeenCalledWith(false)`
 * fallaria por esos extras sin que nada este mal.
 */
function seCerro(): boolean {
  return cerrar.mock.calls.some(([abierto]) => abierto === false);
}

let toastExito: ReturnType<typeof vi.spyOn>;

function montar(view: UnitView = unidad()) {
  render(<DeleteUnitDialog unit={view} open onOpenChange={cerrar} />);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteUnitActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('el dialogo nombra la unidad (R40)', () => {
  it('el mensaje de confirmacion contiene el nombre que el usuario ve en la lista', () => {
    const la = montar();

    expect(screen.getByTestId(DELETE_UNIT_MESSAGE_TESTID)).toHaveTextContent(la.name);
  });

  it('en negativo: el identificador tecnico NO aparece en la parte visible del dialogo', () => {
    const la = montar();

    const dialogo = screen.getByTestId(DELETE_UNIT_DIALOG_TESTID);
    expect(dialogo.textContent ?? '').not.toContain(la.id);
    // El uuid viaja donde tiene que viajar: en el campo oculto que la operacion lee.
    expect(screen.getByTestId(DELETE_UNIT_ID_TESTID)).toHaveValue(la.id);
  });
});

describe('mientras el usuario no confirme no se invoca el borrado (R40)', () => {
  it('abrir el dialogo no llama a `deleteUnitAction`', () => {
    montar();

    expect(screen.getByTestId(DELETE_UNIT_DIALOG_TESTID)).toBeInTheDocument();
    expect(deleteUnitActionMock).not.toHaveBeenCalled();
  });

  it('pedir el borrado desde la fila abre el dialogo y tampoco invoca nada', async () => {
    const user = setupUser();
    const la = unidad();
    render(<UnitRowActions unit={la} baseUnits={[]} />);

    await user.click(screen.getByTestId(UNIT_ACTION_DELETE_TESTID));

    await screen.findByTestId(DELETE_UNIT_DIALOG_TESTID);
    // El nombre accesible del disparador identifica la unidad sobre la que se actua (R28).
    expect(screen.getByTestId(UNIT_ACTION_DELETE_TESTID)).toHaveAttribute(
      'aria-label',
      deleteUnitLabel(la.name),
    );
    expect(deleteUnitActionMock).not.toHaveBeenCalled();
  });

  it('volver atras cierra sin borrar nada', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(DELETE_UNIT_DISMISS_TESTID));

    expect(deleteUnitActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('al confirmar se invoca el borrado y se aplica R38', () => {
  it('llama a la action con el `id` y luego cierra, avisa y refresca la misma URL', async () => {
    const user = setupUser();
    const la = montar();

    await user.click(screen.getByTestId(DELETE_UNIT_CONFIRM_TESTID));

    await waitFor(() => expect(deleteUnitActionMock).toHaveBeenCalledTimes(1));
    const enviado = deleteUnitActionMock.mock.calls[0]![1];
    expect(enviado.get(DELETE_UNIT_ID_FIELD)).toBe(la.id);

    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('los rechazos se pintan DENTRO del dialogo, que sigue abierto (R41, R42)', () => {
  /** Confirma un borrado que la operacion rechaza con el codigo dado. */
  async function rechazoCon(code: CodigoCatalogado, message: string) {
    const user = setupUser();
    deleteUnitActionMock.mockResolvedValue({ status: 'error', code, message });
    montar();

    await user.click(screen.getByTestId(DELETE_UNIT_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_UNIT_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    // Se distingue por el CODIGO, nunca por el texto.
    expect(region).toHaveAttribute('data-code', code);
    expect(screen.getByTestId(DELETE_UNIT_DIALOG_TESTID)).toContainElement(region);
    expect(screen.getByTestId(DELETE_UNIT_ERROR_MESSAGE_TESTID)).toHaveTextContent(message);
    // El dialogo sigue abierto y la fila sigue en la lista: ni cierre, ni toast, ni refresco.
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  }

  it('`unit_in_use`: la unidad la usa un producto, una linea de receta u otra unidad (R41)', async () => {
    expect(UNIT_IN_USE_CODE).toBe(UNIT_IN_USE);
    await rechazoCon(UNIT_IN_USE, 'La unidad esta en uso y no se puede borrar.');
  });

  it('`system_unit`: la pantalla NO repite la comprobacion, presenta el error del dominio (R30)', async () => {
    await rechazoCon(SYSTEM_UNIT_CODE, 'Una unidad de sistema no se puede borrar.');
  });

  it('`unauthorized`: mismo trato, distinguido por su codigo (R42)', async () => {
    await rechazoCon(UNAUTHORIZED_CODE, 'No tienes permiso para esta operacion.');
  });

  it('los tres codigos son DISTINTOS entre si: el dialogo no los confunde', () => {
    expect(new Set([UNIT_IN_USE, SYSTEM_UNIT_CODE, UNAUTHORIZED_CODE]).size).toBe(3);
  });
});

describe('la fila no se retira cuando el borrado se rechaza (R41)', () => {
  it('tras un `unit_in_use` la fila sigue montada con sus dos acciones', async () => {
    const user = setupUser();
    deleteUnitActionMock.mockResolvedValue({
      status: 'error',
      code: UNIT_IN_USE,
      message: 'La unidad esta en uso y no se puede borrar.',
    });

    // La lista real la repinta el servidor tras `router.refresh()`. Aqui se comprueba lo unico que
    // la pantalla decide: nadie retira la fila por su cuenta cuando el borrado falla.
    render(
      <div data-testid={FILA_TESTID}>
        <UnitRowActions unit={unidad()} baseUnits={[]} />
      </div>,
    );
    await user.click(screen.getByTestId(UNIT_ACTION_DELETE_TESTID));
    await screen.findByTestId(DELETE_UNIT_DIALOG_TESTID);
    await user.click(screen.getByTestId(DELETE_UNIT_CONFIRM_TESTID));

    await screen.findByTestId(DELETE_UNIT_ERROR_TESTID);
    expect(screen.getByTestId(FILA_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(UNIT_ACTION_DELETE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(DELETE_UNIT_DIALOG_TESTID)).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
