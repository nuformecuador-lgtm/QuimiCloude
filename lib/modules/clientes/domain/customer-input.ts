// lib/modules/clientes/domain/customer-input.ts
import { z } from 'zod';

export const CUSTOMER_FIRST_NAMES_MAX_LENGTH = 80;
export const CUSTOMER_LAST_NAMES_MAX_LENGTH = 80;
export const CUSTOMER_CITY_MAX_LENGTH = 80;
export const CUSTOMER_PHONE_MAX_LENGTH = 40;
export const CUSTOMER_EMAIL_MAX_LENGTH = 160;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 200;

/** Convierte en ausencia lo que llega vacio o solo con espacios. */
export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

const firstNamesSchema = z.string().trim().min(1).max(CUSTOMER_FIRST_NAMES_MAX_LENGTH);
const lastNamesSchema = z.string().trim().min(1).max(CUSTOMER_LAST_NAMES_MAX_LENGTH);
const citySchema = z.string().trim().min(1).max(CUSTOMER_CITY_MAX_LENGTH);
const phoneSchema = z.string().trim().max(CUSTOMER_PHONE_MAX_LENGTH).nullish();
const emailSchema = z.string().trim().max(CUSTOMER_EMAIL_MAX_LENGTH).nullish();
const addressSchema = z.string().trim().max(CUSTOMER_ADDRESS_MAX_LENGTH).nullish();

/**
 * Alta y edicion usan el mismo esquema (R20): reemplazo completo, sin `refine` cruzado entre
 * opcionales.
 */
export const createCustomerSchema = z
  .object({
    firstNames: firstNamesSchema,
    lastNames: lastNamesSchema,
    city: citySchema,
    phone: phoneSchema,
    email: emailSchema,
    address: addressSchema,
  })
  .transform((value) => ({
    firstNames: value.firstNames,
    lastNames: value.lastNames,
    city: value.city,
    phone: blankToNull(value.phone),
    email: blankToNull(value.email),
    address: blankToNull(value.address),
  }));

export const updateCustomerSchema = createCustomerSchema;

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
