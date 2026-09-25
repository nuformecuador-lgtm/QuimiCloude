// La confirmacion de baja de un cliente.
//
// `deleteCustomerAction` es un doble espia; las otras cuatro actions FALLAN si se les llama. Un
// dialogo de baja que de paso listara, creara o editara seria un fallo silencioso, asi que se
// afirma en negativo con el doble, no con un comentario.
//
// Nada se identifica por copy: rol ARIA, `data-testid` o constantes IMPORTADAS del componente. El
// nombre del cliente si es un dato del caso de prueba -no es copy-, y se afirma que aparece; el
// identificador tecnico se afirma en negativo.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_ACTION_DELETE_TESTID,
  CustomerRowActions,
  DELETE_CUSTOMER_CONFIRM_TESTID,
  DELETE_CUSTOMER_DIALOG_TESTID,
  DELETE_CUSTOMER_DISMISS_TESTID,
  DELETE_CUSTOMER_ERROR_MESSAGE_TESTID,
  DELETE_CUSTOMER_ERROR_TESTID,
  DELETE_CUSTOMER_ID_FIELD,
  DELETE_CUSTOMER_ID_TESTID,
  DELETE_CUSTOMER_MESSAGE_TESTID,
  DeleteCustomerDialog,
  deleteCustomerLabel,
} from '@/app/(private)/clientes/components';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import {
  CustomerNotFoundError,
  UnauthorizedError,
  ValidationError,
  type CustomerView,
} from '@/lib/modules/clientes';
import type { CustomerMutationFormState } from '@/lib/modules/clientes/adapters/driving/customer-actions';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

const { deleteCustomerActionMock, routerMock } = vi.hoisted(() => ({
  deleteCustomerActionMock:
    vi.fn<
      (prev: CustomerMutationFormState, data: FormData) => Promise<CustomerMutationFormState>
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

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el dialogo de baja`);
  };
  return {
    deleteCustomerAction: deleteCustomerActionMock,
    createCustomerAction: vi.fn(noDebeInvocarse('createCustomerAction')),
    updateCustomerAction: vi.fn(noDebeInvocarse('updateCustomerAction')),
    getCustomerAction: vi.fn(noDebeInvocarse('getCustomerAction')),
    listCustomersAction: vi.fn(noDebeInvocarse('listCustomersAction')),
  };
});

/** Codigos ESTABLES, leidos de las clases del dominio y nunca escritos a mano. */
const CUSTOMER_NOT_FOUND_CODE = new CustomerNotFoundError().code;
const UNAUTHORIZED_CODE = new UnauthorizedError().code;
const INVALID_INPUT_CODE = new ValidationError().code;

function cliente(overrides: Partial<CustomerView> = {}): CustomerView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    firstNames: 'Ana María',
    lastNames: 'Pérez Gómez',
    city: 'Bogotá',
    phone: '3001234567',
    email: 'ana@example.com',
    address: 'Calle 1 # 2-3',
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

/** Envoltorio de la fila, para afirmar que nadie la retira al fallar la baja. */
const FILA_TESTID = 'fila-de-la-lista';

const cerrar = vi.fn<(open: boolean) => void>();

/** Si el dialogo pidio cerrarse. Se mira el PRIMER argumento, no la llamada entera. */
function seCerro(): boolean {
  return cerrar.mock.calls.some(([abierto]) => abierto === false);
}

let toastExito: ReturnType<typeof vi.spyOn>;

function montar(view: CustomerView = cliente()) {
  render(<DeleteCustomerDialog customer={view} open onOpenChange={cerrar} />);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteCustomerActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('el dialogo nombra al cliente (R31)', () => {
  it('el mensaje de confirmacion contiene los nombres y apellidos completos', () => {
    const el = montar();

    expect(screen.getByTestId(DELETE_CUSTOMER_MESSAGE_TESTID)).toHaveTextContent(el.firstNames);
    expect(screen.getByTestId(DELETE_CUSTOMER_MESSAGE_TESTID)).toHaveTextContent(el.lastNames);
  });

  it('advierte que la accion no se puede deshacer', () => {
    montar();

    expect(screen.getByTestId(DELETE_CUSTOMER_MESSAGE_TESTID).textContent ?? '').toMatch(
      /no se puede deshacer/i,
    );
  });

  it('en negativo: el identificador tecnico NO aparece en la parte visible del dialogo', () => {
    const el = montar();

    const dialogo = screen.getByTestId(DELETE_CUSTOMER_DIALOG_TESTID);
    expect(dialogo.textContent ?? '').not.toContain(el.id);
    expect(screen.getByTestId(DELETE_CUSTOMER_ID_TESTID)).toHaveValue(el.id);
  });
});

describe('mientras el usuario no confirme no se invoca la baja (R31)', () => {
  it('abrir el dialogo no llama a `deleteCustomerAction`', () => {
    montar();

    expect(screen.getByTestId(DELETE_CUSTOMER_DIALOG_TESTID)).toBeInTheDocument();
    expect(deleteCustomerActionMock).not.toHaveBeenCalled();
  });

  it('pedir la baja desde la fila abre el dialogo y tampoco invoca nada', async () => {
    const user = setupUser();
    const el = cliente();
    render(<CustomerRowActions customer={el} canModify />);

    await user.click(screen.getByTestId(CUSTOMER_ACTION_DELETE_TESTID));

    await screen.findByTestId(DELETE_CUSTOMER_DIALOG_TESTID);
    expect(screen.getByTestId(CUSTOMER_ACTION_DELETE_TESTID)).toHaveAttribute(
      'aria-label',
      deleteCustomerLabel(`${el.firstNames} ${el.lastNames}`),
    );
    expect(deleteCustomerActionMock).not.toHaveBeenCalled();
  });

  it('volver atras cierra sin dar de baja nada', async () => {
    const user = setupUser();
    montar();

    await user.click(screen.getByTestId(DELETE_CUSTOMER_DISMISS_TESTID));

    expect(deleteCustomerActionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('al confirmar se invoca la baja y se aplica R30', () => {
  it('llama a la action con el `id` y luego cierra, avisa y refresca la misma URL', async () => {
    const user = setupUser();
    const el = montar();

    await user.click(screen.getByTestId(DELETE_CUSTOMER_CONFIRM_TESTID));

    await waitFor(() => expect(deleteCustomerActionMock).toHaveBeenCalledTimes(1));
    const enviado = deleteCustomerActionMock.mock.calls[0]![1];
    expect(enviado.get(DELETE_CUSTOMER_ID_FIELD)).toBe(el.id);

    await waitFor(() => expect(seCerro()).toBe(true));
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('los rechazos se pintan DENTRO del dialogo, que sigue abierto (R32)', () => {
  /** Confirma una baja que la operacion rechaza con el codigo dado. */
  async function rechazoCon(code: string, message: string) {
    const user = setupUser();
    deleteCustomerActionMock.mockResolvedValue({ status: 'error', code, message } as never);
    montar();

    await user.click(screen.getByTestId(DELETE_CUSTOMER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_CUSTOMER_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(region).toHaveAttribute('data-code', code);
    expect(screen.getByTestId(DELETE_CUSTOMER_DIALOG_TESTID)).toContainElement(region);
    expect(screen.getByTestId(DELETE_CUSTOMER_ERROR_MESSAGE_TESTID)).toHaveTextContent(message);
    // El dialogo sigue abierto y la fila sigue en la lista: ni cierre, ni toast, ni refresco.
    expect(seCerro()).toBe(false);
    expect(toastExito).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  }

  it('`customer_not_found`: el cliente ya no existe', async () => {
    await rechazoCon(CUSTOMER_NOT_FOUND_CODE, 'El cliente solicitado no existe.');
  });

  it('`unauthorized`: mismo trato, distinguido por su codigo', async () => {
    await rechazoCon(UNAUTHORIZED_CODE, 'No tienes permiso para esta operacion.');
  });

  it('`invalid_input`: mismo trato, distinguido por su codigo', async () => {
    await rechazoCon(INVALID_INPUT_CODE, 'La entrada recibida no es valida.');
  });

  it('los tres codigos son DISTINTOS entre si: el dialogo no los confunde', () => {
    expect(new Set([CUSTOMER_NOT_FOUND_CODE, UNAUTHORIZED_CODE, INVALID_INPUT_CODE]).size).toBe(3);
  });
});

describe('la fila no se retira cuando la baja se rechaza (R32)', () => {
  it('tras un `customer_not_found` la fila sigue montada con sus dos acciones', async () => {
    const user = setupUser();
    deleteCustomerActionMock.mockResolvedValue({
      status: 'error',
      code: CUSTOMER_NOT_FOUND_CODE,
      message: 'El cliente solicitado no existe.',
    });

    render(
      <div data-testid={FILA_TESTID}>
        <CustomerRowActions customer={cliente()} canModify />
      </div>,
    );
    await user.click(screen.getByTestId(CUSTOMER_ACTION_DELETE_TESTID));
    await screen.findByTestId(DELETE_CUSTOMER_DIALOG_TESTID);
    await user.click(screen.getByTestId(DELETE_CUSTOMER_CONFIRM_TESTID));

    await screen.findByTestId(DELETE_CUSTOMER_ERROR_TESTID);
    expect(screen.getByTestId(FILA_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(CUSTOMER_ACTION_DELETE_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(DELETE_CUSTOMER_DIALOG_TESTID)).toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});

describe('sin control de ver, filtrar, contar ni restaurar bajas (R33)', () => {
  it('el dialogo no ofrece ningun control de restauracion', () => {
    montar();

    expect(screen.queryByText(/restaurar/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /restaurar/i })).toBeNull();
  });
});

describe('el identificador del error inesperado', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    deleteCustomerActionMock.mockResolvedValue(errorInesperado());
    montar();

    await user.click(screen.getByTestId(DELETE_CUSTOMER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_CUSTOMER_ERROR_TESTID);
    const referencia = screen.getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID);
    expect(region).toContainElement(referencia);
    expect(referencia).toHaveTextContent(UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL);
    expect(referencia).toHaveTextContent(REFERENCIA_DEL_CASO);
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    deleteCustomerActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado.',
    });
    montar();

    await user.click(screen.getByTestId(DELETE_CUSTOMER_CONFIRM_TESTID));

    const region = await screen.findByTestId(DELETE_CUSTOMER_ERROR_TESTID);
    expect(region).toHaveAttribute('data-code', 'unauthorized');
    esperarSinIdentificador();
  });
});
