// QC-88 T14 (retomado) — La regla multiplataforma sobre lo que esta feature anade (R32).
//
// `docs/architecture.md > Componentes > Regla: multiplataforma` y `design.md > 8.4`. Se afirma
// sobre el DOM, no sobre una promesa en un comentario:
//
//   1. objetivos tactiles de 44x44 en TODO control que esta feature monta: el disparador
//      «entrar» (los dos estados), el enlace de «volver a la primera pagina» del vacio y el
//      boton de «reintentar» del error;
//   2. el motivo del disparador deshabilitado (R21) es alcanzable SIN pasar el puntero por
//      nada: es texto en el DOM, referenciado por `aria-describedby`, nunca un `title`.
//
// **No se declara ninguna excepcion de escritorio** (`design.md > 8.4`), asi que no hay nada que
// eximir aqui. Mismo patron y mismo helper que `tests/unit/pedidos-ui/a11y-tactil.test.tsx`
// (QC-102 T7/T9).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_REASON_TESTID,
  ASSIGNED_ORDER_ENTER_TESTID,
  AssignedOrderEnterTrigger,
  AssignedOrdersEmpty,
  AssignedOrdersError,
} from '@/app/(private)/asignacion/components';

// `AssignedOrdersError` es 'use client' y llama `useRouter()` (para `router.refresh()` del
// reintento): jsdom no monta el App Router, asi que se dobla igual que
// `tests/unit/pedidos-ui/a11y-tactil.test.tsx` no necesita porque no monta ese componente; aqui
// SI hace falta el doble.
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

  it('el disparador «entrar» deshabilitado (EN_CURSO)', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    expect(esObjetivoTactil(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID))).toBe(true);
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
