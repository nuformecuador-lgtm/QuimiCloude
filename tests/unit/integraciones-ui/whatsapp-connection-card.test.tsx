// La tarjeta de estado de la conexion de WhatsApp: etiquetas de cada estado y el ultimo error
// pegado a «Error», dentro del mismo bloque de estado.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WHATSAPP_CONNECTION_CARD_TESTID,
  WHATSAPP_CONNECTION_LAST_CHECKED_TESTID,
  WHATSAPP_CONNECTION_LAST_ERROR_TESTID,
  WHATSAPP_CONNECTION_PHONE_TESTID,
  WHATSAPP_CONNECTION_STATUS_TESTID,
  WHATSAPP_CONNECTION_VERIFIED_NAME_TESTID,
  WHATSAPP_STATUS_BADGE_TESTID,
  WhatsappConnectionCard,
} from '@/app/(private)/integraciones/whatsapp/components';
import type { WhatsappConnectionStatus, WhatsappConnectionView } from '@/lib/modules/integraciones';
import { EMPTY_MARK } from '@/lib/shared/ui/empty-mark';

// El barrel arrastra las acciones del servidor; aqui ninguna debe invocarse.
vi.mock('@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions', () => {
  const prohibida = () => {
    throw new Error('ninguna accion del servidor debe invocarse en este test');
  };
  return {
    getWhatsappConnectionAction: prohibida,
    createWhatsappConnectionAction: prohibida,
    updateWhatsappConnectionAction: prohibida,
    testWhatsappConnectionAction: prohibida,
    enableWhatsappConnectionAction: prohibida,
    disableWhatsappConnectionAction: prohibida,
    regenerateWhatsappVerifyTokenAction: prohibida,
  };
});

const ULTIMO_ERROR = 'Invalid OAuth access token - Cannot parse access token';

function vista(overrides: Partial<WhatsappConnectionView> = {}): WhatsappConnectionView {
  return {
    id: '5f0c6a8e-0000-4000-8000-000000000001',
    displayName: 'Ventas Bogotá',
    metaAppId: '111',
    wabaId: '222',
    phoneNumberId: '333',
    displayPhoneNumber: '+57 300 0000000',
    verifiedName: 'Empresa de prueba',
    status: 'PENDING',
    lastError: null,
    lastCheckedAt: '2026-10-09T15:30:00.000Z',
    lastWebhookAt: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('WhatsappConnectionCard', () => {
  it.each<[WhatsappConnectionStatus, string]>([
    ['PENDING', 'Pendiente'],
    ['ACTIVE', 'Activa'],
    ['ERROR', 'Error'],
    ['DISABLED', 'Deshabilitada'],
  ])('R37: el estado %s se pinta con la etiqueta «%s» dentro del bloque de estado', (status, etiqueta) => {
    render(<WhatsappConnectionCard connection={vista({ status })} />);

    const bloque = screen.getByTestId(WHATSAPP_CONNECTION_STATUS_TESTID);
    expect(within(bloque).getByTestId(WHATSAPP_STATUS_BADGE_TESTID).textContent).toBe(etiqueta);
    expect(bloque.getAttribute('data-status')).toBe(status);
  });

  it('R37: con ERROR, el ultimo error esta dentro del bloque de estado, junto a «Error»', () => {
    render(<WhatsappConnectionCard connection={vista({ status: 'ERROR', lastError: ULTIMO_ERROR })} />);

    const bloque = screen.getByTestId(WHATSAPP_CONNECTION_STATUS_TESTID);
    const error = within(bloque).getByTestId(WHATSAPP_CONNECTION_LAST_ERROR_TESTID);
    expect(error.textContent).toBe(ULTIMO_ERROR);
    expect(within(bloque).getByText('Error')).toBeTruthy();
    expect(error.getAttribute('title')).toBeNull();
  });

  it.each<WhatsappConnectionStatus>(['PENDING', 'ACTIVE', 'DISABLED'])(
    'R37: con %s y lastError no nulo, el ultimo error no se pinta',
    (status) => {
      render(<WhatsappConnectionCard connection={vista({ status, lastError: ULTIMO_ERROR })} />);

      expect(screen.queryByTestId(WHATSAPP_CONNECTION_LAST_ERROR_TESTID)).toBeNull();
      expect(screen.getByTestId(WHATSAPP_CONNECTION_CARD_TESTID).textContent).not.toContain(ULTIMO_ERROR);
    },
  );

  it('R37: pinta el numero, el nombre verificado y la ultima verificacion', () => {
    render(<WhatsappConnectionCard connection={vista()} />);

    expect(screen.getByTestId(WHATSAPP_CONNECTION_PHONE_TESTID).textContent).toBe('+57 300 0000000');
    expect(screen.getByTestId(WHATSAPP_CONNECTION_VERIFIED_NAME_TESTID).textContent).toBe(
      'Empresa de prueba',
    );
    const hora = screen.getByTestId(WHATSAPP_CONNECTION_LAST_CHECKED_TESTID).querySelector('time');
    expect(hora?.getAttribute('dateTime')).toBe('2026-10-09T15:30:00.000Z');
    expect(hora?.textContent).toMatch(/2026/);
  });

  it('R37: sin numero, nombre ni verificacion pinta la marca de vacio', () => {
    render(
      <WhatsappConnectionCard
        connection={vista({ displayPhoneNumber: null, verifiedName: null, lastCheckedAt: null })}
      />,
    );

    expect(screen.getByTestId(WHATSAPP_CONNECTION_PHONE_TESTID).textContent).toBe(EMPTY_MARK);
    expect(screen.getByTestId(WHATSAPP_CONNECTION_VERIFIED_NAME_TESTID).textContent).toBe(EMPTY_MARK);
    expect(screen.getByTestId(WHATSAPP_CONNECTION_LAST_CHECKED_TESTID).textContent).toBe(EMPTY_MARK);
  });
});
