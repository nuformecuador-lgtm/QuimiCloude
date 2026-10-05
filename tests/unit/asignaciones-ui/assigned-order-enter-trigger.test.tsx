import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_REASON_TESTID,
  ASSIGNED_ORDER_ENTER_TESTID,
  ASSIGNED_ORDER_START_CONFIRM_TESTID,
  ASSIGNED_ORDER_START_DIALOG_TESTID,
  AssignedOrderEnterTrigger,
  assignedOrderBlockedNoticeText,
  assignedOrderEnterNoticeText,
  assignedOrderStartConfirmTexts,
} from '@/app/(private)/asignacion/components';
import { assignedOrderRoute } from '@/lib/shared/routes';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn<(href: string) => void>() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('R22 - PENDIENTE: el disparador esta habilitado', () => {
  it('es un boton habilitado que no navega por si solo: no hay enlace a la ejecucion', () => {
    const { container } = render(
      <AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />,
    );

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    expect(container.querySelector('a')).toBeNull();
  });

  it('no pinta ningun motivo: el disparador habilitado no necesita explicarse', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    expect(screen.queryByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID)).not.toBeInTheDocument();
  });
});

describe('PENDIENTE: «Entrar» pide confirmar antes de comenzar el pedido', () => {
  it('pulsar «Entrar» abre la confirmacion con su titulo, su texto y sus dos botones', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    expect(screen.queryByTestId(ASSIGNED_ORDER_START_DIALOG_TESTID)).toBeNull();
    fireEvent.click(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID));

    const texts = assignedOrderStartConfirmTexts();
    const dialog = screen.getByTestId(ASSIGNED_ORDER_START_DIALOG_TESTID);
    expect(dialog).toHaveTextContent(texts.title);
    expect(dialog).toHaveTextContent(texts.description);
    expect(screen.getByRole('button', { name: texts.cancel })).toBeInTheDocument();
    expect(screen.getByTestId(ASSIGNED_ORDER_START_CONFIRM_TESTID)).toHaveTextContent(
      texts.confirm,
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('cancelar cierra la confirmacion sin navegar', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    fireEvent.click(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID));
    fireEvent.click(screen.getByRole('button', { name: assignedOrderStartConfirmTexts().cancel }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('confirmar navega a la ruta de ejecucion del pedido', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-1', status: 'PENDIENTE' }} />);

    fireEvent.click(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID));
    fireEvent.click(screen.getByTestId(ASSIGNED_ORDER_START_CONFIRM_TESTID));

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith(assignedOrderRoute('order-1'));
  });

  it('EN_CURSO re-entra sin confirmacion: es un enlace y no hay dialogo', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    fireEvent.click(screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID));

    expect(screen.queryByTestId(ASSIGNED_ORDER_START_DIALOG_TESTID)).toBeNull();
  });
});

describe('R27 (QC-63, 2026-09-17; enmienda QC-88 R21) - EN_CURSO: el disparador ENTRA y avisa', () => {
  it('es un enlace habilitado cuyo href deriva de assignedOrderRoute, no un boton deshabilitado', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger.tagName).toBe('A');
    expect(trigger).toHaveAttribute('href', assignedOrderRoute('order-2'));
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('el aviso es VISIBLE en pantalla, no solo un `title` (R32)', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-2', status: 'EN_CURSO' }} />);

    const reason = screen.getByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID);
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(assignedOrderEnterNoticeText());
  });

  it('el aviso tiene su propio nombre accesible via aria-describedby, no solo title', () => {
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
    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('href', assignedOrderRoute('order-3'));
  });
});

describe('R31 - BLOQUEADO: el disparador esta deshabilitado y explica por que', () => {
  it('es un boton deshabilitado y no un enlace: no hay href hacia la ejecucion', () => {
    const { container } = render(
      <AssignedOrderEnterTrigger order={{ id: 'order-4', status: 'BLOQUEADO' }} />,
    );

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveAttribute('href');
    expect(container.querySelector('a')).toBeNull();
  });

  it('el motivo es texto VISIBLE, no un `title`, y se enlaza con aria-describedby', () => {
    render(<AssignedOrderEnterTrigger order={{ id: 'order-4', status: 'BLOQUEADO' }} />);

    const trigger = screen.getByTestId(ASSIGNED_ORDER_ENTER_TESTID);
    const reason = screen.getByTestId(ASSIGNED_ORDER_ENTER_REASON_TESTID);
    expect(reason).toBeVisible();
    expect(reason).toHaveTextContent(assignedOrderBlockedNoticeText());
    expect(trigger).not.toHaveAttribute('title');
    expect(trigger.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('el motivo del bloqueado no es el aviso de EN_CURSO', () => {
    expect(assignedOrderBlockedNoticeText()).not.toBe(assignedOrderEnterNoticeText());
  });
});
