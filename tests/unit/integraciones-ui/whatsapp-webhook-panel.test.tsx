// El panel del webhook: URL con copiar, aviso de URL publica ausente y el verify token mostrado
// una sola vez.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WHATSAPP_VERIFY_TOKEN_COPY_TESTID,
  WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID,
  WHATSAPP_VERIFY_TOKEN_TESTID,
  WHATSAPP_WEBHOOK_COPIED_TESTID,
  WHATSAPP_WEBHOOK_COPY_TESTID,
  WHATSAPP_WEBHOOK_INCOMPLETE_TESTID,
  WHATSAPP_WEBHOOK_TEXTS,
  WHATSAPP_WEBHOOK_URL_TESTID,
  WhatsappVerifyTokenProvider,
  WhatsappWebhookPanel,
  useRevealWhatsappVerifyToken,
  type RevealedVerifyToken,
} from '@/app/(private)/integraciones/whatsapp/components';
import { setupUser } from '../../helpers/user-event';

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

const URL_COMPLETA = 'https://app.ejemplo.com/api/integraciones/whatsapp/webhook/conn-1';
const URL_RELATIVA = '/api/integraciones/whatsapp/webhook/conn-1';
const TOKEN = 'tok_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8';

const writeTextMock = vi.fn<(texto: string) => Promise<void>>();

const REVELADO: RevealedVerifyToken = {
  verifyToken: TOKEN,
  webhook: { url: URL_COMPLETA, complete: true },
};

/** Hace de accion que crea o regenera: revela el token en el contexto compartido. */
function Revelador() {
  const reveal = useRevealWhatsappVerifyToken();
  return (
    <button type="button" onClick={() => reveal(REVELADO)}>
      revelar
    </button>
  );
}

function montar(webhook: { url: string; complete: boolean }) {
  return render(
    <WhatsappVerifyTokenProvider>
      <Revelador />
      <WhatsappWebhookPanel webhook={webhook} />
    </WhatsappVerifyTokenProvider>,
  );
}

// `user-event` instala su propio portapapeles al abrir la sesion: el doble va despues.
function usuarioConPortapapeles() {
  const user = setupUser();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writeTextMock },
  });
  return user;
}

beforeEach(() => {
  writeTextMock.mockReset();
  writeTextMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('WhatsappWebhookPanel', () => {
  it('R37: muestra la URL en un campo de solo lectura y el boton la copia con aviso en aria-live', async () => {
    const user = usuarioConPortapapeles();
    montar({ url: URL_COMPLETA, complete: true });

    const campo = screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID) as HTMLInputElement;
    expect(campo.value).toBe(URL_COMPLETA);
    expect(campo.readOnly).toBe(true);
    expect(screen.getByLabelText(WHATSAPP_WEBHOOK_TEXTS.urlLabel)).toBe(campo);

    const aviso = screen.getByTestId(WHATSAPP_WEBHOOK_COPIED_TESTID);
    expect(aviso.getAttribute('aria-live')).toBe('polite');
    expect(aviso.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: WHATSAPP_WEBHOOK_TEXTS.copyUrlAccessible }));

    expect(writeTextMock).toHaveBeenCalledWith(URL_COMPLETA);
    await waitFor(() => expect(aviso.textContent).toBe('Copiada'));
  });

  it('R37: si el portapapeles falla, la URL queda seleccionada', async () => {
    writeTextMock.mockRejectedValue(new Error('NotAllowedError'));
    const user = usuarioConPortapapeles();
    montar({ url: URL_COMPLETA, complete: true });

    await user.click(screen.getByTestId(WHATSAPP_WEBHOOK_COPY_TESTID));

    const campo = screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID) as HTMLInputElement;
    await waitFor(() => {
      expect(campo.selectionStart).toBe(0);
      expect(campo.selectionEnd).toBe(URL_COMPLETA.length);
    });
    expect(screen.getByTestId(WHATSAPP_WEBHOOK_COPIED_TESTID).textContent).toBe('');
  });

  it('R34: sin APP_BASE_URL muestra la ruta relativa y el aviso de URL publica', () => {
    montar({ url: URL_RELATIVA, complete: false });

    expect((screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID) as HTMLInputElement).value).toBe(
      URL_RELATIVA,
    );
    expect(screen.getByTestId(WHATSAPP_WEBHOOK_INCOMPLETE_TESTID).textContent).toBe(
      'Falta configurar la URL pública de la aplicación (APP_BASE_URL).',
    );
  });

  it('R34: con la URL completa no hay aviso', () => {
    montar({ url: URL_COMPLETA, complete: true });

    expect(screen.queryByTestId(WHATSAPP_WEBHOOK_INCOMPLETE_TESTID)).toBeNull();
  });

  it('R38: sin revelar, el panel no pinta verify token', () => {
    montar({ url: URL_COMPLETA, complete: true });

    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID)).toBeNull();
    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_TESTID)).toBeNull();
  });

  it('R38: tras revelar, muestra el token con su boton copiar y el aviso de que no se volvera a mostrar', async () => {
    const user = usuarioConPortapapeles();
    montar({ url: URL_COMPLETA, complete: true });

    await user.click(screen.getByRole('button', { name: 'revelar' }));

    const aviso = screen.getByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID);
    expect(aviso.textContent).toContain('Cópialo ahora: no se volverá a mostrar.');
    const campo = screen.getByTestId(WHATSAPP_VERIFY_TOKEN_TESTID) as HTMLInputElement;
    expect(campo.value).toBe(TOKEN);
    expect(campo.readOnly).toBe(true);
    expect((screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID) as HTMLInputElement).value).toBe(
      URL_COMPLETA,
    );

    await user.click(screen.getByTestId(WHATSAPP_VERIFY_TOKEN_COPY_TESTID));
    expect(writeTextMock).toHaveBeenCalledWith(TOKEN);
  });

  it('R40: el campo mide 16 px y los botones de copiar tienen talla tactil', () => {
    montar({ url: URL_COMPLETA, complete: true });

    expect(screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID).className).toMatch(/\bmin-h-11\b/);
    expect(screen.getByTestId(WHATSAPP_WEBHOOK_URL_TESTID).className).toMatch(/\bmd:text-base\b/);
    expect(screen.getByTestId(WHATSAPP_WEBHOOK_COPY_TESTID).className).toMatch(/\bmin-h-11\b/);
    expect(screen.getByTestId(WHATSAPP_WEBHOOK_COPY_TESTID).className).toMatch(/\bmin-w-11\b/);
  });
});
