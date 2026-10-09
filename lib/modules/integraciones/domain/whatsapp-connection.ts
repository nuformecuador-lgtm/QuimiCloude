export const WHATSAPP_CONNECTION_STATUSES = ['PENDING', 'ACTIVE', 'ERROR', 'DISABLED'] as const;
export type WhatsappConnectionStatus = (typeof WHATSAPP_CONNECTION_STATUSES)[number];

export const WHATSAPP_CONNECTION_ORIGINS = ['MANUAL', 'EMBEDDED_SIGNUP'] as const;
export type WhatsappConnectionOrigin = (typeof WHATSAPP_CONNECTION_ORIGINS)[number];

/** Lo que el dominio lee y escribe. Lleva los valores cifrados: nunca sale del módulo. */
export type WhatsappConnectionRecord = {
  readonly id: string;
  readonly companyId: string;
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
  readonly lastWebhookAt: Date | null;
};

/** Lo único que sale hacia la UI: sin secretos, valores cifrados ni resumen del verify token. */
export type WhatsappConnectionView = {
  readonly id: string;
  readonly displayName: string;
  readonly metaAppId: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly displayPhoneNumber: string | null;
  readonly verifiedName: string | null;
  readonly status: WhatsappConnectionStatus;
  readonly lastError: string | null;
  readonly lastCheckedAt: string | null;
  readonly lastWebhookAt: string | null;
};

/** Campo a campo y sin spread: un campo nuevo de la fila no llega a la vista sin escribirlo aquí. */
export function toWhatsappConnectionView(record: WhatsappConnectionRecord): WhatsappConnectionView {
  return {
    id: record.id,
    displayName: record.displayName,
    metaAppId: record.metaAppId,
    wabaId: record.wabaId,
    phoneNumberId: record.phoneNumberId,
    displayPhoneNumber: record.displayPhoneNumber,
    verifiedName: record.verifiedName,
    status: record.status,
    lastError: record.lastError,
    lastCheckedAt: record.lastCheckedAt === null ? null : record.lastCheckedAt.toISOString(),
    lastWebhookAt: record.lastWebhookAt === null ? null : record.lastWebhookAt.toISOString(),
  };
}
