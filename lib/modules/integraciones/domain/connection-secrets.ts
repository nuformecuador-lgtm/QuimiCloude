import { SecretUnreadableError } from './errors';
import type { IntegracionesScope } from './integraciones-scope';
import type { SecretContext } from './secret-context';
import type { WhatsappConnectionRecord } from './whatsapp-connection';

import type { SecretCipher } from '../ports/secret-cipher';
import type { WhatsappConnectionRepository } from '../ports/whatsapp-connection-repository';

export const ACCESS_TOKEN_FIELD = 'access_token';
export const APP_SECRET_FIELD = 'app_secret';
export type ConnectionSecretField = typeof ACCESS_TOKEN_FIELD | typeof APP_SECRET_FIELD;

export const UNREADABLE_SECRET_MESSAGE =
  'No se pudo leer una credencial guardada. Vuelve a escribir el Access Token y el App Secret.';

export function connectionSecretContext(
  connectionId: string,
  field: ConnectionSecretField,
  scope: IntegracionesScope,
): SecretContext {
  return { companyId: scope.companyId, recordId: connectionId, field };
}

/**
 * Un secreto ilegible no se arregla reintentando: la conexión queda en error pidiendo las
 * credenciales de nuevo. Una conexión deshabilitada sigue deshabilitada.
 */
export async function decryptStoredSecret(
  deps: { readonly cipher: SecretCipher; readonly connections: WhatsappConnectionRepository },
  record: WhatsappConnectionRecord,
  field: ConnectionSecretField,
  scope: IntegracionesScope,
): Promise<string> {
  const stored = field === ACCESS_TOKEN_FIELD ? record.accessTokenEnc : record.appSecretEnc;
  try {
    return await deps.cipher.decrypt(stored, connectionSecretContext(record.id, field, scope));
  } catch (error) {
    if (error instanceof SecretUnreadableError && record.status !== 'DISABLED') {
      await deps.connections.update(
        record.id,
        { status: 'ERROR', lastError: UNREADABLE_SECRET_MESSAGE },
        scope,
      );
    }
    throw error;
  }
}
