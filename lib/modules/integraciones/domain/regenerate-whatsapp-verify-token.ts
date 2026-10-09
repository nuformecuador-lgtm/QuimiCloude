import { requirePermission, type Actor } from './actor';
import { WhatsappConnectionNotFoundError } from './errors';
import { scopeOf } from './integraciones-scope';
import { toWhatsappConnectionView, type WhatsappConnectionView } from './whatsapp-connection';
import { isWhatsappConnectionId } from './whatsapp-connection-input';

import type { RandomSource } from '../ports/random-source';
import type { SecretDigest } from '../ports/secret-digest';
import type { WhatsappConnectionRepository } from '../ports/whatsapp-connection-repository';

export type RegenerateWhatsappVerifyTokenDeps = {
  readonly connections: WhatsappConnectionRepository;
  readonly digest: SecretDigest;
  readonly random: RandomSource;
};

export type RegenerateWhatsappVerifyTokenResult = {
  readonly status: 'regenerated';
  readonly connection: WhatsappConnectionView;
  readonly verifyToken: string;
};

export function createRegenerateWhatsappVerifyToken(
  deps: RegenerateWhatsappVerifyTokenDeps,
): (id: string, actor: Actor | null | undefined) => Promise<RegenerateWhatsappVerifyTokenResult> {
  return async function regenerateWhatsappVerifyToken(id, actor) {
    requirePermission(actor);
    const scope = scopeOf(actor);

    if (!isWhatsappConnectionId(id)) throw new WhatsappConnectionNotFoundError();
    const record = await deps.connections.findLiveById(id, scope);
    if (record === null) throw new WhatsappConnectionNotFoundError();

    const verifyToken = deps.random.newVerifyToken();
    const updated = await deps.connections.update(
      record.id,
      { verifyTokenHash: deps.digest.digestOf(verifyToken) },
      scope,
    );
    if (updated === null) throw new WhatsappConnectionNotFoundError();

    return { status: 'regenerated', connection: toWhatsappConnectionView(updated), verifyToken };
  };
}
