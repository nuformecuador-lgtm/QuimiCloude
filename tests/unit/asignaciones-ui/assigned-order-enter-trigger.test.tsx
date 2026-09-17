import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_REASON_TESTID,
  ASSIGNED_ORDER_ENTER_TESTID,
  AssignedOrderEnterTrigger,
  assignedOrderEnterDisabledReason,
} from '@/app/(private)/asignacion/components';
import { assignedOrderRoute } from '@/lib/shared/routes';

afterEach(() => {
  cleanup();
});

describe('R22 - PENDIENTE: el disparador esta habilitado', () => {
  it('es un enlace habilitado cuyo href deriva de assignedOrderRoute', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger).toHaveAttribute('href', assignedOrderRoute('order-1'));
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
  });

  it('no pinta ningun motivo: el disparador habilitado no necesita explicarse', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    expect(screen.queryByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID)).not.toBeInTheDocument();
  });
});

describe('R21 - EN_CURSO: el disparador esta deshabilitado y con su motivo', () => {
  it('el disparador esta deshabilitado', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger).toBeDisabled();
  });

  it('el motivo es VISIBLE en pantalla, no solo un `title` (R32)', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const reason = screen.getByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID);
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(assignedOrderEnterDisabledReason());
  });

  it('el motivo tiene su propio nombre accesible via aria-describedby, no solo title', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    const reason = screen.getByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID);

    expect(trigger).not.toHaveAttribute('title');
    expect(trigger.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('el mismo data-testid en los dos estados: un test lo localiza sin dos selectores', () => {
    const { unmount } = render(
      <AssignedOrderEnterTrigger order={{ id: 'order-3', status: 'PENDIENTE' }} />,
    );
    expect(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID)).toBeInTheDocument();
    unmount();

    render(<AssignedOrderEnterTrigger order={{ id: 'order-3', status: 'EN_CURSO' }} />);
    expect(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID)).toBeInTheDocument();
  });
});
