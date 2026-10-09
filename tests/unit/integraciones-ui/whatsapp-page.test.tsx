// La pantalla /integraciones/whatsapp: corte por permiso, pestañas, alta sin conexion, tarjeta con
// conexion y ningun verify token en la pagina.
//
// Se mockea el proveedor de sesion, no `requirePagePermission`: el corte se ejecuta de verdad.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WHATSAPP_CONNECTION_ACTIONS_TESTID,
  WHATSAPP_CONNECTION_CARD_TESTID,
  WHATSAPP_CONNECTION_FORM_TESTID,
  WHATSAPP_CONNECTION_PANEL_TESTID,
  WHATSAPP_CONNECTION_STATUS_TESTID,
  WHATSAPP_FIELD_TESTIDS,
  WHATSAPP_SETUP_GUIDE_STEPS,
  WHATSAPP_SETUP_GUIDE_TESTID,
  WHATSAPP_TAB_CONNECTION_TESTID,
  WHATSAPP_TAB_TEMPLATES_TESTID,
  WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID,
  WHATSAPP_VERIFY_TOKEN_TESTID,
  WHATSAPP_WEBHOOK_PANEL_TESTID,
  WHATSAPP_WEBHOOK_URL_TESTID,
} from '@/app/(private)/integraciones/whatsapp/components';
import WhatsappIntegrationPage from '@/app/(private)/integraciones/whatsapp/page';
import { errorMessage } from '@/lib/modules/errores';
import type { SessionUser } from '@/lib/modules/identity';
import type { WhatsappConnectionView } from '@/lib/modules/integraciones';
import type { WhatsappConnectionQueryResult } from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';
import { WHATSAPP_INTEGRATION_LABEL } from '@/lib/shared/navigation/private-nav';
import { LOGIN_ROUTE_SESSION_ENDED, WHATSAPP_INTEGRATION_ROUTE } from '@/lib/shared/routes';

const { getSessionUserMock, getConnectionMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getConnectionMock: vi.fn<() => Promise<WhatsappConnectionQueryResult>>(),
  notFoundMock: vi.fn<() => never>(),
  redirectMock: vi.fn<(ruta: string) => never>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse al pintar la pagina`);
  };
  return {
    getWhatsappConnectionAction: getConnectionMock,
    createWhatsappConnectionAction: vi.fn(noDebeInvocarse('createWhatsappConnectionAction')),
    updateWhatsappConnectionAction: vi.fn(noDebeInvocarse('updateWhatsappConnectionAction')),
    testWhatsappConnectionAction: vi.fn(noDebeInvocarse('testWhatsappConnectionAction')),
    enableWhatsappConnectionAction: vi.fn(noDebeInvocarse('enableWhatsappConnectionAction')),
    disableWhatsappConnectionAction: vi.fn(noDebeInvocarse('disableWhatsappConnectionAction')),
    regenerateWhatsappVerifyTokenAction: vi.fn(
      noDebeInvocarse('regenerateWhatsappVerifyTokenAction'),
    ),
  };
});

const PERMISO = 'integraciones.modificar';
const RAIZ = join(__dirname, '..', '..', '..');
const TOKEN_DE_ALTA = 'tok_centinela_que_nunca_debe_aparecer_en_la_pagina_0001';
const WEBHOOK = {
  url: 'https://app.ejemplo.com/api/integraciones/whatsapp/webhook/conn-1',
  complete: true,
};

function sesionCon(permissions: readonly string[]): SessionUser {
  return {
    id: 'u-test-whatsapp',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions,
  };
}

function vista(overrides: Partial<WhatsappConnectionView> = {}): WhatsappConnectionView {
  return {
    id: 'conn-1',
    displayName: 'Ventas',
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

function fuenteDeLaPagina(): string {
  return readFileSync(
    join(RAIZ, 'app', '(private)', ...WHATSAPP_INTEGRATION_ROUTE.split('/').filter(Boolean), 'page.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, '');
}

/** Todas las claves de props del arbol que devuelve la pagina, y sus valores de texto. */
function recorrerProps(nodo: ReactNode, claves: Set<string>, textos: string[]): void {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) recorrerProps(hijo as ReactNode, claves, textos);
    return;
  }
  if (typeof nodo === 'string') {
    textos.push(nodo);
    return;
  }
  if (!isValidElement(nodo)) return;
  const props = nodo.props as Record<string, unknown>;
  for (const [clave, valor] of Object.entries(props)) {
    claves.add(clave);
    if (clave === 'children') recorrerProps(valor as ReactNode, claves, textos);
    else textos.push(JSON.stringify(valor) ?? '');
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  notFoundMock.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND');
  });
  redirectMock.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
  getSessionUserMock.mockResolvedValue(sesionCon([PERMISO]));
  getConnectionMock.mockResolvedValue({ status: 'success', data: null, webhook: null });
});

afterEach(() => {
  cleanup();
});

describe('WhatsappIntegrationPage', () => {
  it('R4: sin integraciones.modificar responde notFound y no consulta la conexion', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['clientes.consultar']));

    await expect(WhatsappIntegrationPage()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('R4: sin sesion redirige al login y no consulta la conexion', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(WhatsappIntegrationPage()).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledWith(LOGIN_ROUTE_SESSION_ENDED);
    expect(getConnectionMock).not.toHaveBeenCalled();
  });

  it('R4: exige integraciones.modificar como primera sentencia y una sola vez', () => {
    const fuente = fuenteDeLaPagina();
    const primera = /export default async function \w+\(\)\s*\{\s*([^;]+);/.exec(fuente)?.[1];

    expect(primera).toBe(`await requirePagePermission('${PERMISO}')`);
    expect([...fuente.matchAll(/requirePagePermission\(/g)]).toHaveLength(1);
  });

  it('R35: muestra el titulo y las pestañas «Conexión» activa y «Plantillas» deshabilitada con «Disponible próximamente» visible', async () => {
    render(await WhatsappIntegrationPage());

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(WHATSAPP_INTEGRATION_LABEL);
    const conexion = screen.getByTestId(WHATSAPP_TAB_CONNECTION_TESTID);
    expect(conexion).toHaveAttribute('role', 'tab');
    expect(conexion.textContent).toBe('Conexión');
    expect(conexion).toHaveAttribute('aria-selected', 'true');

    const plantillas = screen.getByTestId(WHATSAPP_TAB_TEMPLATES_TESTID);
    expect(plantillas).toHaveAttribute('role', 'tab');
    expect(plantillas).toHaveAttribute('aria-selected', 'false');
    expect(
      plantillas.hasAttribute('disabled') || plantillas.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(within(plantillas).getByText('Plantillas')).toBeVisible();
    expect(within(plantillas).getByText('Disponible próximamente')).toBeVisible();
    expect(plantillas.getAttribute('title')).toBeNull();
  });

  it('R35: las pestañas miden al menos 44 px', async () => {
    render(await WhatsappIntegrationPage());

    for (const testId of [WHATSAPP_TAB_CONNECTION_TESTID, WHATSAPP_TAB_TEMPLATES_TESTID]) {
      expect(screen.getByTestId(testId).className).toMatch(/(^|\s)min-h-11(\s|$)/);
    }
  });

  it('R36: sin conexion, la pestaña «Conexión» muestra la guia y el formulario de alta', async () => {
    render(await WhatsappIntegrationPage());

    const panel = screen.getByTestId(WHATSAPP_CONNECTION_PANEL_TESTID);
    const guia = within(panel).getByTestId(WHATSAPP_SETUP_GUIDE_TESTID);
    for (const paso of WHATSAPP_SETUP_GUIDE_STEPS) expect(guia.textContent).toContain(paso);
    expect(within(panel).getByTestId(WHATSAPP_CONNECTION_FORM_TESTID)).toHaveAttribute(
      'data-mode',
      'create',
    );
    for (const testId of Object.values(WHATSAPP_FIELD_TESTIDS)) {
      expect(within(panel).getByTestId(testId)).toBeTruthy();
    }
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_CARD_TESTID)).toBeNull();
  });

  it('R37: con conexion, muestra la tarjeta, el panel del webhook y las acciones, sin formulario de alta', async () => {
    getConnectionMock.mockResolvedValue({
      status: 'success',
      data: vista({ status: 'ERROR', lastError: 'Token caducado' }),
      webhook: WEBHOOK,
    });

    render(await WhatsappIntegrationPage());

    const panel = screen.getByTestId(WHATSAPP_CONNECTION_PANEL_TESTID);
    expect(within(panel).getByTestId(WHATSAPP_CONNECTION_CARD_TESTID)).toBeTruthy();
    expect(within(panel).getByTestId(WHATSAPP_CONNECTION_STATUS_TESTID).textContent).toBe(
      'ErrorToken caducado',
    );
    expect(within(panel).getByTestId(WHATSAPP_WEBHOOK_PANEL_TESTID)).toBeTruthy();
    expect((within(panel).getByTestId(WHATSAPP_WEBHOOK_URL_TESTID) as HTMLInputElement).value).toBe(
      WEBHOOK.url,
    );
    expect(within(panel).getByTestId(WHATSAPP_CONNECTION_ACTIONS_TESTID)).toBeTruthy();
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(WHATSAPP_SETUP_GUIDE_TESTID)).toBeNull();
  });

  it('R37: si la consulta falla, muestra el mensaje del catalogo dentro de la pestaña', async () => {
    getConnectionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: errorMessage('unauthorized'),
    });

    render(await WhatsappIntegrationPage());

    const panel = screen.getByTestId(WHATSAPP_CONNECTION_PANEL_TESTID);
    expect(within(panel).getByRole('alert').textContent).toContain(errorMessage('unauthorized'));
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_FORM_TESTID)).toBeNull();
    expect(screen.queryByTestId(WHATSAPP_CONNECTION_CARD_TESTID)).toBeNull();
  });

  it('R16: ni el HTML ni las props de la pagina contienen un verify token', async () => {
    getConnectionMock.mockResolvedValue({ status: 'success', data: vista(), webhook: WEBHOOK });

    const arbol = await WhatsappIntegrationPage();
    const claves = new Set<string>();
    const textos: string[] = [];
    recorrerProps(arbol, claves, textos);

    expect([...claves].filter((clave) => /token|secret|hash|enc$/i.test(clave))).toEqual([]);
    expect(textos.join('\n')).not.toContain(TOKEN_DE_ALTA);

    const { container } = render(arbol);
    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_NOTICE_TESTID)).toBeNull();
    expect(screen.queryByTestId(WHATSAPP_VERIFY_TOKEN_TESTID)).toBeNull();
    expect(container.innerHTML).not.toContain(TOKEN_DE_ALTA);
    expect(fuenteDeLaPagina()).not.toMatch(/verifyToken/);
  });
});
