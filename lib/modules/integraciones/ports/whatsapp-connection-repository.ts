import type { IntegracionesScope } from '../domain/integraciones-scope';
import type {
  WhatsappConnectionOrigin,
  WhatsappConnectionRecord,
  WhatsappConnectionStatus,
} from '../domain/whatsapp-connection';

/** Sin `companyId`: la empresa la pone el adaptador desde `scope`, nunca desde la fila. */
export type NewWhatsappConnectionRow = {
  readonly id: string;
  readonly origin: WhatsappConnectionOrigin;
  readonly displayName: string;
  readonly metaAppId: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly displayPhoneNumber: string | null;
  readonly verifiedName: string | null;
  readonly accessTokenEnc: string;
  readonly appSecretEnc: string;
  readonly verifyTokenHash: string;
  readonly status: WhatsappConnectionStatus;
  readonly lastError: string | null;
  readonly lastCheckedAt: Date | null;
  readonly createdById: string;
};

/** Solo lo que una operación puede cambiar; un campo ausente se conserva. */
export type WhatsappConnectionPatch = {
  readonly displayName?: string;
  readonly metaAppId?: string;
  readonly wabaId?: string;
  readonly phoneNumberId?: string;
  readonly displayPhoneNumber?: string | null;
  readonly verifiedName?: string | null;
  readonly accessTokenEnc?: string;
  readonly appSecretEnc?: string;
  readonly verifyTokenHash?: string;
  readonly status?: WhatsappConnectionStatus;
  readonly lastError?: string | null;
  readonly lastCheckedAt?: Date | null;
};

/**
 * Solo filas vivas de la empresa de `scope`. `null` es igual para «no existe», «borrada» y «de otra
 * empresa». `scope` va al final de cada firma: una llamada que lo omita no compila.
 */
export interface WhatsappConnectionRepository {
  findLive(scope: IntegracionesScope): Promise<WhatsappConnectionRecord | null>;
  findLiveById(id: string, scope: IntegracionesScope): Promise<WhatsappConnectionRecord | null>;
  create(row: NewWhatsappConnectionRow, scope: IntegracionesScope): Promise<WhatsappConnectionRecord>;
  update(
    id: string,
    patch: WhatsappConnectionPatch,
    scope: IntegracionesScope,
  ): Promise<WhatsappConnectionRecord | null>;
}
