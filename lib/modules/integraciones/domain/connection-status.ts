import type { WhatsappConnectionRecord, WhatsappConnectionStatus } from './whatsapp-connection';

import type { WhatsappConnectionPatch } from '../ports/whatsapp-connection-repository';
import type { GraphPhoneNumber } from '../ports/whatsapp-graph-client';

/**
 * Meta solo verifica el webhook al suscribirlo: una conexión que ya recibió alguno no vuelve a
 * quedar pendiente por una prueba nueva.
 */
export function statusAfterGoodTest(
  record: Pick<WhatsappConnectionRecord, 'lastWebhookAt'>,
): WhatsappConnectionStatus {
  return record.lastWebhookAt === null ? 'PENDING' : 'ACTIVE';
}

export function goodTestPatch(
  record: Pick<WhatsappConnectionRecord, 'lastWebhookAt'>,
  phone: GraphPhoneNumber,
  checkedAt: Date,
): WhatsappConnectionPatch {
  return {
    displayPhoneNumber: phone.displayPhoneNumber,
    verifiedName: phone.verifiedName,
    lastCheckedAt: checkedAt,
    lastError: null,
    status: statusAfterGoodTest(record),
  };
}

export function failedTestPatch(message: string, checkedAt: Date): WhatsappConnectionPatch {
  return { status: 'ERROR', lastError: message, lastCheckedAt: checkedAt };
}
