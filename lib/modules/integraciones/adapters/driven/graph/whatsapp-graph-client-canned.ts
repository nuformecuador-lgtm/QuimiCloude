import type { GraphProbeResult, WhatsappGraphClient } from '../../../ports/whatsapp-graph-client';

/** Doble para el E2E: responde sin red. Un Access Token con este prefijo hace fallar la prueba. */
export const CANNED_INVALID_TOKEN_PREFIX = 'E2E_INVALID';
export const CANNED_GRAPH_ERROR_MESSAGE = 'Invalid OAuth access token - Cannot parse access token';
export const CANNED_DISPLAY_PHONE_NUMBER = '+57 300 0000000';
export const CANNED_VERIFIED_NAME = 'Empresa de prueba E2E';

async function fetchPhoneNumber(input: {
  readonly phoneNumberId: string;
  readonly accessToken: string;
}): Promise<GraphProbeResult> {
  if (input.accessToken.startsWith(CANNED_INVALID_TOKEN_PREFIX)) {
    return { ok: false, kind: 'rejected', message: CANNED_GRAPH_ERROR_MESSAGE };
  }
  return {
    ok: true,
    phone: { displayPhoneNumber: CANNED_DISPLAY_PHONE_NUMBER, verifiedName: CANNED_VERIFIED_NAME },
  };
}

export const whatsappGraphClientCanned = { fetchPhoneNumber } satisfies WhatsappGraphClient;
