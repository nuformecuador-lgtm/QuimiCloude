import { z } from 'zod';

import { compareQuantities } from './decimal-quantity';
import { MANUAL_PRODUCT_TYPE_VALUES, PRODUCT_TYPES } from './product-type';

/**
 * Esquema de entrada del producto (`design.md > 6.1`). Validacion de borde (R28): nada
 * sin tipar ni sin validar cruza hacia el dominio.
 *
 * QC-52 (R1): el producto ya NO tiene costo, compra minima ni tiempo de entrega. Son
 * terminos COMERCIALES y dependen de a quien le compres, asi que viven en la linea del
 * catalogo del proveedor. Con ellos se fueron `COST_PATTERN`, `costSchema` y
 * `deliveryTimeSchema` de este archivo: lo que ya no se acepta tampoco se valida.
 */

/**
 * `trim()` va ANTES de `min(1)`: si se aplicara despues, '   ' pasaria el minimo de
 * longitud y solo se recortaria tras la validacion, incumpliendo R9 -"recortar antes de
 * guardarlo"-. Con `.trim().min(1)`, en ese orden, zod ya recorta el valor de salida del
 * `parse` y lo que queda vacio tras recortar se rechaza.
 */
const productNameSchema = z.string().trim().min(1).max(120);

/**
 * Duplicado a proposito del de `product-batch-input.ts`: de otro campo del mismo modulo solo se
 * comparte por el dominio, no por una constante compartida entre archivos que no la exportan.
 */
const QTY_ALERT_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/** Decimal de hasta diez enteros y cuatro decimales, sin signo: el cero es una alerta valida. */
const qtyAlertSchema = z.string().trim().regex(QTY_ALERT_PATTERN);

/** Tipo de producto: opcional, por defecto PRODUCT. `FINISHED_PRODUCT` no se puede elegir a mano. */
const productTypeSchema = z
  .enum(MANUAL_PRODUCT_TYPE_VALUES)
  .optional()
  .default(PRODUCT_TYPES.PRODUCT);

/**
 * El producto no declara unidad en el borde: la unidad la declara la PRESENTACION
 * (`presentations.unit_id`, NOT NULL), y `products.unit_id` la escribe `createWithFirstBatch`
 * copiandola de esa presentacion -el disparador solo RECHAZA lo que no cuadra-, asi que es un
 * dato que se lee (`ProductView.unitId`), no uno que se envie. Por eso
 * el alta y la edicion no aceptan `unitId` -y con `strictObject`, enviarlo es `invalid_input`,
 * no un campo ignorado en silencio-.
 */

/**
 * `qtyAlert` es obligatorio en la entrada aunque la columna `qty_alert` sea NULLABLE en la
 * base: un producto anterior con ese campo en NULL no se puede guardar sin rellenarlo, porque
 * la edicion es reemplazo completo y usa el mismo esquema que el alta.
 *
 * `strictObject`, no `z.object`: un campo de mas se RECHAZA como `invalid_input`, no se
 * ignora en silencio.
 */
/**
 * Los campos BASE del producto, compartidos por todos los tipos.
 * La existencia ya no esta aqui: es del lote, no del producto.
 *
 * `qtyAlert` solo aplica a PRODUCT y PACKAGING: MACHINE no lo declara en el borde.
 */
export const productFieldsShape = {
  name: productNameSchema,
  type: productTypeSchema,
  qtyAlert: qtyAlertSchema,
} as const;

/**
 * Esquema de CREACION discriminado por tipo:
 * - PRODUCT: producto (con qtyAlert) + lote completo (presentationId, stock, unitCost|totalCost, lot opcional, expiryDate opcional, purchaseDate opcional)
 * - MACHINE: producto SIN qtyAlert + lote igual que PRODUCT (sin qtyAlert; campos opcionales pueden quedar en null)
 * - PACKAGING: producto (con qtyAlert) + lote (presentationId, stock, unitCost|totalCost, lot opcional -backend genera-, purchaseDate opcional, SIN expiryDate)
 *
 * Los tres tipos crean lote: `purchaseDate` vive SOLO en `product_batches`, nunca en `products`.
 */

import { deriveUnitCost } from './unit-cost';

/** Duplicado a proposito del de `proveedores`: de otro modulo solo se importa su contrato. */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;
const ZERO_PATTERN = /^0+(\.0*)?$/;

const amountSchema = z
  .string()
  .trim()
  .regex(DECIMAL_PATTERN)
  .refine((value) => !ZERO_PATTERN.test(value));

const presentationIdSchema = z.string().uuid();

/** La existencia es del lote que se crea, no del producto: el alta la declara por su cuenta.
 *  Decimal de hasta diez enteros y cuatro decimales, sin signo: el cero es una existencia
 *  valida, la negativa no tiene forma que acepte el patron. */
const stockSchema = z.string().trim().regex(DECIMAL_PATTERN);

export const PRODUCT_BATCH_LOT_MAX_LENGTH = 60;

const NUMERIC_LOT_PATTERN = /^[0-9]+$/;
const MESSAGE_LOTE_NUMERICO_LARGO = 'Un lote de solo números puede tener hasta 59 caracteres.';

const lotSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true })
  .refine(
    (value) => !(NUMERIC_LOT_PATTERN.test(value) && value.length >= PRODUCT_BATCH_LOT_MAX_LENGTH),
    { message: MESSAGE_LOTE_NUMERICO_LARGO },
  );

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const expiryDateSchema = z.string().regex(CIVIL_DATE_PATTERN);

function esDiaDeCalendario(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const instante = new Date(Date.UTC(year, month - 1, day));
  return (
    instante.getUTCFullYear() === year &&
    instante.getUTCMonth() === month - 1 &&
    instante.getUTCDate() === day
  );
}

const purchaseDateSchema = z
  .string()
  .regex(CIVIL_DATE_PATTERN, { abort: true })
  .refine(esDiaDeCalendario);

function esImporteAceptado(amount: unknown): boolean {
  return typeof amount === 'string' && DECIMAL_PATTERN.test(amount) && !ZERO_PATTERN.test(amount);
}

const MESSAGE_SIN_COSTO = 'Indica el costo unitario o el costo total.';
const MESSAGE_EXISTENCIA = 'Indica una existencia mayor que 0 para derivar el costo del total.';
const MESSAGE_TOTAL_INSUFICIENTE =
  'El costo total es demasiado bajo para esa existencia: el costo unitario quedaria en 0.';

/** Campos de lote comunes (sin qtyAlert, sin expiryDate). */
const batchFieldsCommon = {
  stock: stockSchema,
  presentationId: presentationIdSchema,
  unitCost: amountSchema.nullish(),
  totalCost: amountSchema.nullish(),
  lot: lotSchema.nullish(),
  purchaseDate: purchaseDateSchema.nullish(),
} as const;

/**
 * Regla cruzada del par de costos, compartida por los tres tipos de alta con lote.
 * Un `unitCost` malformado o un `stock` sin forma decimal ya lo rechaza cada subesquema: aqui
 * solo se exige que venga al menos un costo y que un total derivado no quede en cero.
 */
function exigirCostoDelLote(
  value: { readonly unitCost?: string | null; readonly totalCost?: string | null; readonly stock: string },
  ctx: z.RefinementCtx,
): void {
  const unitCost = value.unitCost ?? null;
  const totalCost = value.totalCost ?? null;

  if ((unitCost !== null && !esImporteAceptado(unitCost)) ||
      (totalCost !== null && !esImporteAceptado(totalCost)) ||
      !DECIMAL_PATTERN.test(value.stock)) {
    return;
  }

  if (unitCost === null && totalCost === null) {
    ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['unitCost'] });
    ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['totalCost'] });
    return;
  }

  if (unitCost !== null) return;
  if (totalCost === null) return;

  if (compareQuantities(value.stock, '0') <= 0) {
    ctx.addIssue({ code: 'custom', message: MESSAGE_EXISTENCIA, path: ['stock'] });
    return;
  }

  if (deriveUnitCost(totalCost, value.stock) === null) {
    ctx.addIssue({ code: 'custom', message: MESSAGE_TOTAL_INSUFICIENTE, path: ['totalCost'] });
  }
}

/** Esquema para PRODUCT: lote completo con expiryDate opcional. El literal va DESPUES del spread. */
const createProductWithBatchSchema = z
  .strictObject({
    ...productFieldsShape,
    type: z.literal(PRODUCT_TYPES.PRODUCT),
    ...batchFieldsCommon,
    expiryDate: expiryDateSchema.nullish(),
  })
  .superRefine(exigirCostoDelLote);

/**
 * Esquema para MACHINE (Instrumento): solo `name`, `type`, `stock` y `purchaseDate` viajan
 * en el borde (2026-09-23). `presentationId` y `unitCost` son anulables UNICAMENTE aqui
 * (la migracion `20260923140000_product_batch_nullable_machine`); PRODUCT y PACKAGING
 * siguen exigiendolos. `strictObject`: sin `qtyAlert`, y las claves no pintadas no viajan.
 * Sin `exigirCostoDelLote`: un instrumento no lleva costo de lote.
 */
const createMachineSchema = z.strictObject({
  name: productNameSchema,
  type: z.literal(PRODUCT_TYPES.MACHINE),
  stock: stockSchema,
  presentationId: presentationIdSchema.nullish(),
  unitCost: amountSchema.nullish(),
  totalCost: amountSchema.nullish(),
  lot: lotSchema.nullish(),
  purchaseDate: purchaseDateSchema.nullish(),
  expiryDate: expiryDateSchema.nullish(),
});

/** Esquema para PACKAGING: lote sin expiryDate, lot opcional. */
const createPackagingSchema = z
  .strictObject({
    ...productFieldsShape,
    ...batchFieldsCommon,
    type: z.literal(PRODUCT_TYPES.PACKAGING),
  })
  .superRefine(exigirCostoDelLote);

/** Unión discriminada para la CREACION. */
const createUnion = z.discriminatedUnion('type', [
  createProductWithBatchSchema,
  createMachineSchema,
  createPackagingSchema,
]);

/**
 * Actualización discriminada por tipo: `qtyAlert` es obligatorio en PRODUCT y PACKAGING,
 * y ausente en MACHINE (el formulario no lo pinta para Instrumento).
 */
const updateUnion = z.discriminatedUnion('type', [
  z.strictObject({
    name: productNameSchema,
    type: z.literal(PRODUCT_TYPES.PRODUCT),
    qtyAlert: qtyAlertSchema,
  }),
  z.strictObject({
    name: productNameSchema,
    type: z.literal(PRODUCT_TYPES.MACHINE),
  }),
  z.strictObject({
    name: productNameSchema,
    type: z.literal(PRODUCT_TYPES.PACKAGING),
    qtyAlert: qtyAlertSchema,
  }),
  // Un producto terminado no nace de este esquema (R2, R3): esta rama solo deja pasar la
  // forma, para que rechazar un cambio de tipo sea cosa del caso de uso (R4), no de zod.
  z.strictObject({
    name: productNameSchema,
    type: z.literal(PRODUCT_TYPES.FINISHED_PRODUCT),
    qtyAlert: qtyAlertSchema,
  }),
]);

/**
 * `type` viaja por `FormData` y por la action, pero fixtures de test y llamantes legados no lo
 * mandan: si falta, se inyecta PRODUCT antes de la unión discriminada (que exige el discriminador).
 * No afecta al tipo inferido: es solo entrada.
 */
function withDefaultType<T extends z.ZodType>(schema: T) {
  return z.preprocess((data) => {
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && !('type' in data)) {
      return { ...data, type: PRODUCT_TYPES.PRODUCT };
    }
    return data;
  }, schema);
}

export const createProductSchema = withDefaultType(createUnion);
export const updateProductSchema = withDefaultType(updateUnion);

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;