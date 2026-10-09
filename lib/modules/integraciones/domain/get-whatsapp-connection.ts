import { requirePermission, type Actor } from './actor';
import { scopeOf } from './integraciones-scope';
import { toWhatsappConnectionView, type WhatsappConnectionView } from './whatsapp-connection';

import type { WhatsappConnectionRepository } from '../ports/whatsapp-connection-repository';

export type GetWhatsappConnectionDeps = {
  readonly connections: WhatsappConnectionRepository;
};

export function createGetWhatsappConnection(
  deps: GetWhatsappConnectionDeps,
): (actor: Actor | null | undefined) => Promise<WhatsappConnectionView | null> {
  return async function getWhatsappConnection(actor) {
    requirePermission(actor);
    const record = await deps.connections.findLive(scopeOf(actor));
    return record === null ? null : toWhatsappConnectionView(record);
  };
}
