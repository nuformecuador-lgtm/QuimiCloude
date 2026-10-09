import { requirePermission, type Actor } from './actor';
import { ACCESS_TOKEN_FIELD, APP_SECRET_FIELD, decryptStoredSecret } from './connection-secrets';
import { goodTestPatch } from './connection-status';
import { ValidationError, WhatsappConnectionNotFoundError } from './errors';
import { metaMessageOf } from './graph-failure';
import { scopeOf, type IntegracionesScope } from './integraciones-scope';
import {
  toWhatsappConnectionView,
  type WhatsappConnectionRecord,
  type WhatsappConnectionView,
} from './whatsapp-connection';
import { isWhatsappConnectionId } from './whatsapp-connection-input';

import type { SecretCipher } from '../ports/secret-cipher';
import type {
  WhatsappConnectionPatch,
  WhatsappConnectionRepository,
} from '../ports/whatsapp-connection-repository';
import type { WhatsappGraphClient } from '../ports/whatsapp-graph-client';

export type SetWhatsappConnectionEnabledDeps = {
  readonly connections: WhatsappConnectionRepository;
  readonly graph: WhatsappGraphClient;
  readonly cipher: SecretCipher;
  readonly now?: () => Date;
};

export type SetWhatsappConnectionEnabledResult =
  | { readonly status: 'saved'; readonly connection: WhatsappConnectionView }
  | { readonly status: 'test_failed'; readonly message: string };

export function createSetWhatsappConnectionEnabled(
  deps: SetWhatsappConnectionEnabledDeps,
): (
  id: string,
  enabled: boolean,
  actor: Actor | null | undefined,
) => Promise<SetWhatsappConnectionEnabledResult> {
  const now = deps.now ?? (() => new Date());

  async function save(
    record: WhatsappConnectionRecord,
    patch: WhatsappConnectionPatch,
    scope: IntegracionesScope,
  ): Promise<SetWhatsappConnectionEnabledResult> {
    const updated = await deps.connections.update(record.id, patch, scope);
    if (updated === null) throw new WhatsappConnectionNotFoundError();
    return { status: 'saved', connection: toWhatsappConnectionView(updated) };
  }

  return async function setWhatsappConnectionEnabled(id, enabled, actor) {
    requirePermission(actor);
    const scope = scopeOf(actor);

    if (typeof enabled !== 'boolean') throw new ValidationError();
    if (!isWhatsappConnectionId(id)) throw new WhatsappConnectionNotFoundError();
    const record = await deps.connections.findLiveById(id, scope);
    if (record === null) throw new WhatsappConnectionNotFoundError();

    const unchanged = { status: 'saved', connection: toWhatsappConnectionView(record) } as const;

    if (!enabled) {
      if (record.status === 'DISABLED') return unchanged;
      return save(record, { status: 'DISABLED' }, scope);
    }

    if (record.status !== 'DISABLED') return unchanged;

    const accessToken = await decryptStoredSecret(deps, record, ACCESS_TOKEN_FIELD, scope);
    const appSecret = await decryptStoredSecret(deps, record, APP_SECRET_FIELD, scope);
    const probe = await deps.graph.fetchPhoneNumber({
      phoneNumberId: record.phoneNumberId,
      accessToken,
    });
    const checkedAt = now();

    // Una conexión que no pasa la prueba no se habilita: no recibiría webhooks.
    if (!probe.ok) {
      return { status: 'test_failed', message: metaMessageOf(probe, [accessToken, appSecret]) };
    }
    return save(record, goodTestPatch(record, probe.phone, checkedAt), scope);
  };
}
