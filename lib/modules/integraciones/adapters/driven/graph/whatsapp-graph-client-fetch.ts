import { z } from 'zod';

import { readGraphApiVersion } from '../config/whatsapp-config-env';

import type { GraphProbeResult, WhatsappGraphClient } from '../../../ports/whatsapp-graph-client';

/** La base no cambia entre entornos; lo que cambia, la versión, va por variable. */
const GRAPH_BASE_URL = 'https://graph.facebook.com';
const PHONE_NUMBER_FIELDS = 'display_phone_number,verified_name';
const GRAPH_TIMEOUT_MS = 10_000;

const phoneNumberBody = z.object({
  display_phone_number: z.string(),
  verified_name: z.string(),
});

const graphErrorBody = z.object({
  error: z.object({ message: z.string() }),
});

const UNREACHABLE: GraphProbeResult = { ok: false, kind: 'unreachable', message: null };
const REJECTED_WITHOUT_MESSAGE: GraphProbeResult = { ok: false, kind: 'rejected', message: null };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * El token va solo en la cabecera: una URL acaba en logs de proxies y de errores. Nada de esta
 * función registra la URL, la cabecera ni el cuerpo. Si falta la versión, lanza antes de llamar.
 */
async function fetchPhoneNumber(input: {
  readonly phoneNumberId: string;
  readonly accessToken: string;
}): Promise<GraphProbeResult> {
  const version = readGraphApiVersion();
  const url =
    `${GRAPH_BASE_URL}/${version}/${encodeURIComponent(input.phoneNumberId)}` +
    `?fields=${PHONE_NUMBER_FIELDS}`;

  let status: number;
  let text: string;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      cache: 'no-store',
    });
    status = response.status;
    text = await response.text();
  } catch {
    return UNREACHABLE;
  }

  const body = parseJson(text);
  if (status >= 200 && status < 300) {
    const parsed = phoneNumberBody.safeParse(body);
    if (!parsed.success) return REJECTED_WITHOUT_MESSAGE;
    return {
      ok: true,
      phone: {
        displayPhoneNumber: parsed.data.display_phone_number,
        verifiedName: parsed.data.verified_name,
      },
    };
  }

  const failure = graphErrorBody.safeParse(body);
  return failure.success
    ? { ok: false, kind: 'rejected', message: failure.data.error.message }
    : REJECTED_WITHOUT_MESSAGE;
}

export const whatsappGraphClientFetch = { fetchPhoneNumber } satisfies WhatsappGraphClient;
