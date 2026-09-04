import { z } from 'zod';

import { normalizeSupplierName } from './supplier-name';

/**
 * Largos maximos del proveedor (`design.md > 6.1`). Viven AQUI, en la validacion de
 * aplicacion, y no en el tipo de la columna (R10, decision cerrada 14): cambiarlos es una
 * linea y su caso de test, no una migracion.
 *
 * Son la posicion por defecto del diseno, no una decision del humano (P6): 120 el nombre
 * replica QC-20 D11; 40 y 160 son cotas holgadas para un telefono internacional y un
 * correo. R10 apunta a esta tabla, no a los numeros.
 */
export const SUPPLIER_NAME_MAX_LENGTH = 120;
export const SUPPLIER_PHONE_MAX_LENGTH = 40;
export const SUPPLIER_EMAIL_MAX_LENGTH = 160;

/**
 * Convierte en AUSENCIA lo que llega vacio o solo con espacios (R13). Lo que se guarda es
 * `null`, nunca la cadena vacia: «no tengo el dato» y «el dato es la cadena vacia» no son
 * lo mismo, y el `CHECK` de la base trata las dos igual justo para que no puedan diverger.
 */
export function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * `trim()` va ANTES de `min(1)`: si se aplicara despues, '   ' pasaria el minimo de
 * longitud y solo se recortaria tras la validacion, incumpliendo R9 -«recortar antes de
 * guardarlo»-. Mismo orden que `productNameSchema` de `inventario`.
 *
 * El `refine` cierra el hueco que `min(1)` no ve (R9): «---» y «...» tienen longitud, pero
 * `normalizeSupplierName` los deja en vacio, y una fila con `name_normalized = ''`
 * chocaria contra el indice unico parcial con un mensaje que nadie entiende (pregunta
 * abierta 1 del `design.md` de QC-42, precedente QC-20 D22).
 */
const supplierNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(SUPPLIER_NAME_MAX_LENGTH)
  .refine((name) => normalizeSupplierName(name) !== '');

/**
 * Sin validacion de FORMATO ni de unicidad en el telefono ni en el correo (decision 9 de
 * QC-42, heredada entera): ni `z.string().email()`, ni patron de telefono. Un proveedor
 * quimico da un correo comercial que no tiene por que ser unico ni parecerse a nada.
 */
const supplierPhoneSchema = z.string().trim().max(SUPPLIER_PHONE_MAX_LENGTH).nullish();
const supplierEmailSchema = z.string().trim().max(SUPPLIER_EMAIL_MAX_LENGTH).nullish();

/**
 * Esquema de alta del proveedor (R41). El orden de las tres etapas NO es indiferente
 * (`design.md > 6.1`):
 *
 *   1. `object`  — forma, largos y recorte de extremos.
 *   2. `transform` — `blankToNull`: el blanco se convierte en ausencia.
 *   3. `refine`  — la regla cruzada de R11 se evalua sobre lo que DE VERDAD se va a
 *      guardar.
 *
 * Si el `refine` mirara la cadena original, `{ phone: '   ', email: null }` pasaria el
 * borde y llegaria a la base a que el `CHECK` lo rechazara con un `23514` que el usuario
 * lee como error del sistema. El blanco se corta en el borde (R11) y ADEMAS en la base
 * (R12): son dos defensas distintas, no una redundancia.
 */
export const createSupplierSchema = z
  .object({
    name: supplierNameSchema,
    phone: supplierPhoneSchema,
    email: supplierEmailSchema,
  })
  .transform((value) => ({
    name: value.name,
    phone: blankToNull(value.phone),
    email: blankToNull(value.email),
  }))
  .refine((value) => value.phone !== null || value.email !== null);

/**
 * La edicion es REEMPLAZO COMPLETO del conjunto de campos de negocio, no `PATCH` campo a
 * campo (R14, `design.md > 12.4`): con una regla cruzada entre dos campos, un parche
 * parcial obligaria a distinguir «campo ausente» de «campo puesto a nulo» y a reevaluar la
 * regla contra el estado guardado.
 */
export const updateSupplierSchema = createSupplierSchema;

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
