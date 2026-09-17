import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_REASON_TESTID,
  ASSIGNED_ORDER_ENTER_TESTID,
  AssignedOrderEnterTrigger,
  AssignedOrdersEmpty,
  AssignedOrdersError,
} from '@/app/(private)/asignacion/components';

// `AssignedOrdersError` llama `useRouter()` para el reintento y jsdom no monta el App Router.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
});

/** Las dos clases que, en este repo, SON el objetivo tactil de 44x44. */
function esObjetivoTactil(elemento: Element): boolean {
  return elemento.className.includes('min-h-11') && elemento.className.includes('min-w-11');
}

describe('objetivos tactiles de 44x44 en todo lo que esta feature monta (R32)', () => {
  it('el disparador «entrar» habilitado (PENDIENTE)', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    expect(esObjetivoTactil(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID))).toBe(true);
  });

  it('el disparador «entrar» en curso (EN_CURSO)', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(esObjetivoTactil(trigger)).toBe(true);
    expect(trigger).not.toBeDisabled();
  });

  it('el enlace de «volver a la primera pagina» del estado vacio', () => {
    render(<AssignedOrdersEmpty firstPageHref="/asignacion?page=1&pageSize=10" />);

    expect(esObjetivoTactil(screen.getByTestId('assigned-orders-first-page'))).toBe(true);
  });

  it('el boton de «reintentar» del estado de error', () => {
    render(
      <AssignedOrdersError
        error={{ status: 'error', code: 'unexpected', message: 'fallo inesperado', reference: 'r-1' }}
      />,
    );

    expect(esObjetivoTactil(screen.getByTestId('assigned-orders-retry'))).toBe(true);
  });
});

describe('el motivo del disparador deshabilitado se alcanza SIN el puntero (R21, R32)', () => {
  it('es texto en el DOM, no un `title`, y su id coincide con `aria-describedby`', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-3', status: 'EN_CURSO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    const reason = screen.getByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID);

    expect(trigger).not.toHaveAttribute('title');
    expect(reason).toBeVisible();
    expect(trigger.getAttribute('aria-describedby')).toBe(reason.id);
  });
});
