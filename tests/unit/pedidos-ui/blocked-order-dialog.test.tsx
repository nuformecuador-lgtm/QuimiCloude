// El aviso de pedido que no alcanza: dos acciones y ninguna mas, con objetivo tactil de 44x44.
//
// Los botones se localizan por `data-testid` y por rol ARIA, nunca por su copy.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_ORDER_CONFIRM_TESTID,
  BLOCKED_ORDER_DIALOG_TESTID,
  BLOCKED_ORDER_DISMISS_TESTID,
  BLOCKED_ORDER_MESSAGE_TESTID,
  BlockedOrderDialog,
} from '@/app/(private)/pedidos/components';

import { setupUser } from '../../helpers/user-event';

// El barrel arrastra componentes que importan las actions de servidor; aqui no se invoca ninguna.
vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el aviso de bloqueo`);
  };
  return {
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
  };
});

const MENSAJE = 'No hay material suficiente para este pedido.';

function esObjetivoTactil(elemento: Element): boolean {
  return elemento.className.includes('min-h-11') && elemento.className.includes('min-w-11');
}

function renderAviso(overrides: { onConfirm?: () => void; onDismiss?: () => void } = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onDismiss = overrides.onDismiss ?? vi.fn();
  render(<BlockedOrderDialog open message={MENSAJE} onConfirm={onConfirm} onDismiss={onDismiss} />);
  return { onConfirm, onDismiss };
}

afterEach(() => {
  cleanup();
});

describe('el aviso de pedido que no alcanza', () => {
  it('R7: ofrece exactamente dos acciones, «Guardar bloqueado» y «Volver»', async () => {
    renderAviso();

    const dialogo = await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID);
    const botones = within(dialogo).getAllByRole('button');

    expect(botones).toHaveLength(2);
    expect(botones).toContain(within(dialogo).getByTestId(BLOCKED_ORDER_CONFIRM_TESTID));
    expect(botones).toContain(within(dialogo).getByTestId(BLOCKED_ORDER_DISMISS_TESTID));
    expect(screen.getByTestId(BLOCKED_ORDER_MESSAGE_TESTID)).toHaveTextContent(MENSAJE);
  });

  it('R7, R9: las dos acciones tienen objetivo tactil de al menos 44x44', async () => {
    renderAviso();

    await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID);

    expect(esObjetivoTactil(screen.getByTestId(BLOCKED_ORDER_CONFIRM_TESTID))).toBe(true);
    expect(esObjetivoTactil(screen.getByTestId(BLOCKED_ORDER_DISMISS_TESTID))).toBe(true);
  });

  it('R8: «Guardar bloqueado» avisa a quien lo monta y no cierra por su cuenta', async () => {
    const user = setupUser();
    const { onConfirm, onDismiss } = renderAviso();

    await user.click(await screen.findByTestId(BLOCKED_ORDER_CONFIRM_TESTID));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('R9: «Volver» pide cerrar sin confirmar', async () => {
    const user = setupUser();
    const { onConfirm, onDismiss } = renderAviso();

    await user.click(await screen.findByTestId(BLOCKED_ORDER_DISMISS_TESTID));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
