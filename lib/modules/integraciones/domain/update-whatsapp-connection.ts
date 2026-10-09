import { requirePermission, type Actor } from './actor';
import {
  ACCESS_TOKEN_FIELD,
  APP_SECRET_FIELD,
  connectionSecretContext,
  decryptStoredSecret,
} from './connection-secrets';
import { goodTestPatch } from './connection-status';
import { ValidationError, WhatsappConnectionNotFoundError } from './errors';
import { metaMessageOf } from './graph-failure';
import { scopeOf } from './integraciones-scope';
import { toWhatsappConnectionView, type WhatsappConnectionView } from './whatsapp-connection';
import { isWhatsappConnectionId, updateWhatsappConnectionSchema } from './whatsapp-connection-input';

import type { SecretCipher } from '../ports/secret-cipher';
import type {
  WhatsappConnectionPatch,
  WhatsappConnectionRepository,
} from '../ports/whatsapp-connection-repository';
import type { WhatsappGraphClient } from '../ports/whatsapp-graph-client';

export type UpdateWhatsappConnectionDeps = {
  readonly connections: WhatsappConnectionRepository;
  readonly graph: WhatsappGraphClient;
  readonly cipher: SecretCipher;
  readonly now?: () => Date;
};

export type UpdateWhatsappConnectionResult =
  | { readonly status: 'saved'; readonly connection: WhatsappConnectionView }
  | { readonly status: 'test_failed'; readonly message: string };

export function createUpdateWhatsappConnection(
  deps: UpdateWhatsappConnectionDeps,
): (
  id: string,
  input: unknown,
  actor: Actor | null | undefined,
) => Promise<UpdateWhatsappConnectionResult> {
  const now = deps.now ?? (() => new Date());

  return async function updateWhatsappConnection(id, input, actor) {
    requirePermission(actor);
    const scope = scopeOf(actor);

    const parsed = updateWhatsappConnectionSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    if (!isWhatsappConnectionId(id)) throw new WhatsappConnectionNotFoundError();
    const record = await deps.connections.findLiveById(id, scope);
    if (record === null) throw new WhatsappConnectionNotFoundError();

    const textPatch: WhatsappConnectionPatch = {
      displayName: data.displayName,
      metaAppId: data.metaAppId,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
    };

    const needsTest =
      data.accessToken !== null ||
      data.appSecret !== null ||
      data.phoneNumberId !== record.phoneNumberId;

    let patch = textPatch;
    if (needsTest) {
      const accessToken =
        data.accessToken ?? (await decryptStoredSecret(deps, record, ACCESS_TOKEN_FIELD, scope));
      const probe = await deps.graph.fetchPhoneNumber({
        phoneNumberId: data.phoneNumberId,
        accessToken,
      });
      const checkedAt = now();
      if (!probe.ok) {
        // Nada se escribe: la conexión sigue funcionando con las credenciales que tenía.
        const known = data.appSecret === null ? [accessToken] : [accessToken, data.appSecret];
        return { status: 'test_failed', message: metaMessageOf(probe, known) };
      }

      const tested = goodTestPatch(record, probe.phone, checkedAt);
      patch = {
        ...textPatch,
        ...tested,
        status: record.status === 'DISABLED' ? 'DISABLED' : tested.status,
        ...(data.accessToken === null
          ? {}
          : {
              accessTokenEnc: await deps.cipher.encrypt(
                data.accessToken,
                connectionSecretContext(record.id, ACCESS_TOKEN_FIELD, scope),
              ),
            }),
        ...(data.appSecret === null
          ? {}
          : {
              appSecretEnc: await deps.cipher.encrypt(
                data.appSecret,
                connectionSecretContext(record.id, APP_SECRET_FIELD, scope),
              ),
            }),
      };
    }

    const updated = await deps.connections.update(record.id, patch, scope);
    if (updated === null) throw new WhatsappConnectionNotFoundError();
    return { status: 'saved', connection: toWhatsappConnectionView(updated) };
  };
}
