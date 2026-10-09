import { requirePermission, type Actor } from './actor';
import { ACCESS_TOKEN_FIELD, APP_SECRET_FIELD, connectionSecretContext } from './connection-secrets';
import { ValidationError, WhatsappConnectionExistsError } from './errors';
import { metaMessageOf } from './graph-failure';
import { scopeOf } from './integraciones-scope';
import { toWhatsappConnectionView, type WhatsappConnectionView } from './whatsapp-connection';
import { createWhatsappConnectionSchema } from './whatsapp-connection-input';

import type { RandomSource } from '../ports/random-source';
import type { SecretCipher } from '../ports/secret-cipher';
import type { SecretDigest } from '../ports/secret-digest';
import type { WhatsappConnectionRepository } from '../ports/whatsapp-connection-repository';
import type { WhatsappGraphClient } from '../ports/whatsapp-graph-client';

export type CreateWhatsappConnectionDeps = {
  readonly connections: WhatsappConnectionRepository;
  readonly graph: WhatsappGraphClient;
  readonly cipher: SecretCipher;
  readonly digest: SecretDigest;
  readonly random: RandomSource;
  readonly now?: () => Date;
};

/** El verify token en claro solo viaja aquí: después solo queda su resumen. */
export type CreateWhatsappConnectionResult =
  | {
      readonly status: 'created';
      readonly connection: WhatsappConnectionView;
      readonly verifyToken: string;
    }
  | { readonly status: 'test_failed'; readonly message: string };

export function createCreateWhatsappConnection(
  deps: CreateWhatsappConnectionDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<CreateWhatsappConnectionResult> {
  const now = deps.now ?? (() => new Date());

  return async function createWhatsappConnection(input, actor) {
    requirePermission(actor);
    const scope = scopeOf(actor);

    const parsed = createWhatsappConnectionSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    if ((await deps.connections.findLive(scope)) !== null) {
      throw new WhatsappConnectionExistsError();
    }

    const probe = await deps.graph.fetchPhoneNumber({
      phoneNumberId: data.phoneNumberId,
      accessToken: data.accessToken,
    });
    const checkedAt = now();
    if (!probe.ok) {
      return {
        status: 'test_failed',
        message: metaMessageOf(probe, [data.accessToken, data.appSecret]),
      };
    }

    // El id existe antes de cifrar: forma parte del contexto que liga cada secreto a su fila.
    const id = deps.random.newId();
    const verifyToken = deps.random.newVerifyToken();
    const accessTokenEnc = await deps.cipher.encrypt(
      data.accessToken,
      connectionSecretContext(id, ACCESS_TOKEN_FIELD, scope),
    );
    const appSecretEnc = await deps.cipher.encrypt(
      data.appSecret,
      connectionSecretContext(id, APP_SECRET_FIELD, scope),
    );

    const record = await deps.connections.create(
      {
        id,
        origin: 'MANUAL',
        displayName: data.displayName,
        metaAppId: data.metaAppId,
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        displayPhoneNumber: probe.phone.displayPhoneNumber,
        verifiedName: probe.phone.verifiedName,
        accessTokenEnc,
        appSecretEnc,
        verifyTokenHash: deps.digest.digestOf(verifyToken),
        status: 'PENDING',
        lastError: null,
        lastCheckedAt: checkedAt,
        createdById: actor.id,
      },
      scope,
    );

    return { status: 'created', connection: toWhatsappConnectionView(record), verifyToken };
  };
}
