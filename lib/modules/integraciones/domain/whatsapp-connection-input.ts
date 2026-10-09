import { z } from 'zod';

export const WHATSAPP_DISPLAY_NAME_MAX_LENGTH = 80;
export const WHATSAPP_SECRET_MAX_LENGTH = 1024;

const displayNameSchema = z.string().trim().min(1).max(WHATSAPP_DISPLAY_NAME_MAX_LENGTH);
// Sin regla de dígitos ni de longitud: un ID que Meta no reconoce lo detecta la prueba contra Graph.
const metaIdSchema = z.string().trim().min(1);
const secretSchema = z.string().trim().min(1).max(WHATSAPP_SECRET_MAX_LENGTH);
const optionalSecretSchema = z
  .string()
  .trim()
  .max(WHATSAPP_SECRET_MAX_LENGTH)
  .nullish()
  .transform((value) => (value === null || value === undefined || value === '' ? null : value));

export const createWhatsappConnectionSchema = z.object({
  displayName: displayNameSchema,
  metaAppId: metaIdSchema,
  wabaId: metaIdSchema,
  phoneNumberId: metaIdSchema,
  accessToken: secretSchema,
  appSecret: secretSchema,
});

/** Un secreto vacío o ausente significa «conservar el guardado». */
export const updateWhatsappConnectionSchema = z.object({
  displayName: displayNameSchema,
  metaAppId: metaIdSchema,
  wabaId: metaIdSchema,
  phoneNumberId: metaIdSchema,
  accessToken: optionalSecretSchema,
  appSecret: optionalSecretSchema,
});

export type CreateWhatsappConnectionInput = z.infer<typeof createWhatsappConnectionSchema>;
export type UpdateWhatsappConnectionInput = z.infer<typeof updateWhatsappConnectionSchema>;

const connectionIdSchema = z.string().uuid();

/** Un id sin forma de uuid no puede existir en la base: se trata como no encontrado sin ir al puerto. */
export function isWhatsappConnectionId(id: unknown): id is string {
  return connectionIdSchema.safeParse(id).success;
}
