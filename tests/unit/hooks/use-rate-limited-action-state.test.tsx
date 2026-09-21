import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';

import { RATE_LIMITED_MESSAGE } from '@/lib/modules/rate-limit';
import { useRateLimitedActionState, withRateLimitNotice } from '@/hooks/use-rate-limited-action-state';

import { setupUser } from '../../helpers/user-event';

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn<(message: string) => void>(),
}));

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { error: toastErrorMock },
}));

type TestState = { readonly value: string };

const INITIAL_STATE: TestState = { value: 'initial' };
const FALLBACK_TEXT = 'algo inesperado paso';

/** El limite mas cercano al harness, para afirmar que un error SIN atrapar sube hasta aqui. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p>{FALLBACK_TEXT}</p> : this.props.children;
  }
}

function Harness({
  action,
}: {
  readonly action: (state: TestState, payload: string) => Promise<TestState>;
}) {
  const [state, dispatch] = useRateLimitedActionState(action, INITIAL_STATE);
  return (
    <div>
      <p data-testid="state">{state.value}</p>
      <button onClick={() => dispatch('enviado')}>enviar</button>
    </div>
  );
}

function renderHarness(action: (state: TestState, payload: string) => Promise<TestState>) {
  return render(
    <Boundary>
      <Harness action={action} />
    </Boundary>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useRateLimitedActionState', () => {
  it('R11 — con el freno, avisa con el mensaje neutro y mantiene el estado anterior sin boundary', async () => {
    const user = setupUser();
    const action = vi.fn<(state: TestState, payload: string) => Promise<TestState>>(() => {
      throw new Error(RATE_LIMITED_MESSAGE);
    });

    renderHarness(action);
    await user.click(screen.getByRole('button', { name: 'enviar' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledWith(RATE_LIMITED_MESSAGE);
    expect(screen.getByTestId('state')).toHaveTextContent('initial');
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull();
  });

  it('R12 — cualquier otro error se relanza y llega al limite de error, sin aviso', async () => {
    const user = setupUser();
    const action = vi.fn<(state: TestState, payload: string) => Promise<TestState>>(() => {
      throw new Error('fallo distinto al freno');
    });

    renderHarness(action);
    await user.click(screen.getByRole('button', { name: 'enviar' }));

    await waitFor(() => expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument());
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('sin error, el estado pasa a ser el que la accion devuelve', async () => {
    const user = setupUser();
    const action = vi.fn<(state: TestState, payload: string) => Promise<TestState>>(
      async (_state, payload) => ({ value: payload }),
    );

    renderHarness(action);
    await user.click(screen.getByRole('button', { name: 'enviar' }));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('enviado'));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe('withRateLimitNotice', () => {
  it('sin freno, devuelve el resultado de la accion y no hay aviso', async () => {
    const action = vi.fn(async (a: number, b: string) => ({ a, b }));

    const result = await withRateLimitNotice(action)(1, 'x');

    expect(result).toEqual({ a: 1, b: 'x' });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('R11 — con el freno, devuelve undefined y avisa una vez con el mensaje neutro', async () => {
    const action = vi.fn(async () => {
      throw new Error(RATE_LIMITED_MESSAGE);
    });

    const result = await withRateLimitNotice(action)();

    expect(result).toBeUndefined();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(RATE_LIMITED_MESSAGE);
  });

  it('R12 — cualquier otro error se relanza tal cual, sin aviso', async () => {
    const otherError = new Error('fallo distinto al freno');
    const action = vi.fn(async () => {
      throw otherError;
    });

    await expect(withRateLimitNotice(action)()).rejects.toBe(otherError);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('pasa los argumentos tal cual a la accion', async () => {
    const action = vi.fn(async (...args: unknown[]) => args);

    await withRateLimitNotice(action)(1, 'dos', { tres: 3 });

    expect(action).toHaveBeenCalledWith(1, 'dos', { tres: 3 });
  });
});
