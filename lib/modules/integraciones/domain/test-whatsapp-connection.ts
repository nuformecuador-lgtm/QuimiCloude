import { requirePermission, type Actor } from './actor';
import { ACCESS_TOKEN_FIELD, APP_SECRET_FIELD, decryptStoredSecret } from './connection-secrets';
import { failedTestPatch, goodTestPatch } from './connection-status';
import { ActionNotAllowedError, WhatsappConnectionNotFoundError } from './errors';
import { metaMessageOf } from './graph-failure';
import { scopeOf } from './integraciones-scope';
import { toWhatsappConnectionView, type WhatsappConnectionView } from './whatsapp-connection';
import { isWhatsappConnectionId } from './whatsapp-connection-input';

import type { SecretCipher } from '../ports/secret-cipher';
import type { WhatsappConnectionRepository } from '../ports/whatsapp-connection-repository';
import type { WhatsappGraphClient } from '../ports/whatsapp-graph-client';

export type TestWhatsappConnectionDeps = {
  readonly connections: WhatsappConnectionRepository;
  readonly graph: WhatsappGraphClient;
  readonly cipher: SecretCipher;
  readonly now?: () => Date;
};

export type TestWhatsappConnectionResult =
  | { readonly status: 'tested'; readonly ok: true; readonly connection: WhatsappConnectionView }
  | {
      readonly status: 'tested';
      readonly ok: false;
      readonly connection: WhatsappConnectionView;
      readonly message: string;
    };

export function createTestWhatsappConnection(
  deps: TestWhatsappConnectionDeps,
): (id: string, actor: Actor | null | undefined) => Promise<TestWhatsappConnectionResult> {
  const now = deps.now ?? (() => new Date());

  return async function testWhatsappConnection(id, actor) {
    requirePermission(actor);
    const scope = scopeOf(actor);

    if (!isWhatsappConnectionId(id)) throw new WhatsappConnectionNotFoundError();
    const record = await deps.connections.findLiveById(id, scope);
    if (record === null) throw new WhatsappConnectionNotFoundError();
    if (record.status === 'DISABLED') throw new ActionNotAllowedError('conexión deshabilitada');

    const accessToken = await decryptStoredSecret(deps, record, ACCESS_TOKEN_FIELD, scope);
    const appSecret = await decryptStoredSecret(deps, record, APP_SECRET_FIELD, scope);

    const probe = await deps.graph.fetchPhoneNumber({
      phoneNumberId: record.phoneNumberId,
      accessToken,
    });
    const checkedAt = now();

    if (probe.ok) {
      const updated = await deps.connections.update(
        record.id,
        goodTestPatch(record, probe.phone, checkedAt),
        scope,
      );
      if (updated === null) throw new WhatsappConnectionNotFoundError();
      return { status: 'tested', ok: true, connection: toWhatsappConnectionView(updated) };
    }

    const message = metaMessageOf(probe, [accessToken, appSecret]);
    const updated = await deps.connections.update(
      record.id,
      failedTestPatch(message, checkedAt),
      scope,
    );
    if (updated === null) throw new WhatsappConnectionNotFoundError();
    return { status: 'tested', ok: false, connection: toWhatsappConnectionView(updated), message };
  };
}
