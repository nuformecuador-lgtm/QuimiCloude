import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCREEN_ENTER_MS, ScreenEnter } from '@/app/(private)/components/screen-enter';

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn<() => string | null>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
}));

const HREFS = ['/pedidos', '/inventario'];

function frame(): HTMLElement {
  return screen.getByTestId('page').parentElement!;
}

function Page({ children }: { children?: React.ReactNode }) {
  return (
    <div data-testid="page">
      <header>cabecera</header>
      {children}
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  usePathnameMock.mockReturnValue('/pedidos');
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ScreenEnter', () => {
  it('R19: el marco lleva data-screen-enter al montar y no ocupa caja propia', () => {
    render(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    expect(frame()).toHaveAttribute('data-screen-enter', '');
    expect(frame()).toHaveClass('contents');
  });

  it('R19: el atributo se quita a los 420 ms', () => {
    render(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    act(() => vi.advanceTimersByTime(SCREEN_ENTER_MS - 1));
    expect(frame()).toHaveAttribute('data-screen-enter');
    act(() => vi.advanceTimersByTime(1));
    expect(frame()).not.toHaveAttribute('data-screen-enter');
    expect(SCREEN_ENTER_MS).toBe(420);
  });

  it('R19: al cambiar de módulo el atributo vuelve', () => {
    const { rerender } = render(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    act(() => vi.advanceTimersByTime(SCREEN_ENTER_MS));
    expect(frame()).not.toHaveAttribute('data-screen-enter');

    usePathnameMock.mockReturnValue('/inventario');
    rerender(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    expect(frame()).toHaveAttribute('data-screen-enter', '');
  });

  it('R20: navegar dentro del módulo (detalle, filtros) no repite la entrada', () => {
    const { rerender } = render(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    act(() => vi.advanceTimersByTime(SCREEN_ENTER_MS));

    usePathnameMock.mockReturnValue('/pedidos/42');
    rerender(
      <ScreenEnter hrefs={HREFS}>
        <Page>
          <section>detalle</section>
        </Page>
      </ScreenEnter>,
    );
    expect(frame()).not.toHaveAttribute('data-screen-enter');
    expect(screen.getByText('detalle')).toBeInTheDocument();
  });

  it('R19: fuera del App Router (pathname null) pinta igual', () => {
    usePathnameMock.mockReturnValue(null);
    render(
      <ScreenEnter hrefs={HREFS}>
        <Page />
      </ScreenEnter>,
    );
    expect(frame()).toHaveAttribute('data-screen-enter', '');
  });
});
