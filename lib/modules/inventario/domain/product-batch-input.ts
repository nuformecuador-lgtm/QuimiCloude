import { z } from 'zod';

import { productFieldsShape } from './product-input';
import { deriveUnitCost } from './unit-cost';

/**
 * Entrada del ALTA de producto con su primer lote (`design.md > 4`).
 *
 * Es UN solo objeto para los dos lados: el formulario valida con el en el cliente y el caso
 * de uso revalida con el en el servidor (R24, R27). Que sea el mismo -y no dos copias
 * parecidas- es lo que hace que un rechazo caiga siempre en el mismo campo en los dos sitios.
 *
 * `createProductSchema` no se toca: la EDICION no conoce el lote (R26).
 */

/**
 * Forma exacta de `decimal(14,4)`: hasta 10 enteros, hasta 4 decimales, sin signo (R4).
 *
 * DUPLICADO A PROPOSITO. Los dos patrones existen ya en
 * `proveedores/domain/catalog-line-input.ts`, pero eso es OTRO modulo y de un modulo solo se
 * importa su contrato publico, nunca una ruta profunda
 * (`docs/architecture.md > La regla de dependencias`). Sacarlos a `lib/shared/` los volveria
 * vocabulario compartido de dos dominios que hoy no comparten nada: el dia que un tercer
 * modulo los pida, esa sera la conversacion. Repetir doce caracteres es mas barato que atar
 * `inventario` a `proveedores`.
 */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/** Toda cifra decimal cuyos digitos son ceros: '0', '0.0', '00.0000'. */
const ZERO_PATTERN = /^0+(\.0*)?$/;

/**
 * Importe estrictamente mayor que cero (R5). El cero se descarta LEXICAMENTE, sobre la
 * cadena: «todos los digitos son cero» es exacto asi y no pasa por coma flotante (R4).
 *
 * Esta es la defensa del BORDE. La de la base -el `CHECK (unit_cost > 0)` de la migracion
 * `20260909120000_product_batches`- es otra, y no se sustituyen.
 */
const amountSchema = z
  .string()
  .trim()
  .regex(DECIMAL_PATTERN)
  .refine((value) => !ZERO_PATTERN.test(value));

/** Presentacion del lote: uuid y OBLIGATORIA (R2). Que EXISTA lo garantiza la FK, no zod. */
const presentationIdSchema = z.string().uuid();

/** Largo maximo del lote (R14). Vive en la validacion, no en el tipo de la columna. */
export const PRODUCT_BATCH_LOT_MAX_LENGTH = 60;

/**
 * Lote: opcional (R12) y recortado (R14). `trim()` va ANTES de `min(1)`, como en el nombre
 * del producto: si se aplicara despues, `'   '` pasaria el minimo y solo se recortaria tras
 * la validacion. Un lote de solo espacios no es un lote, es un campo vacio.
 */
const lotSchema = z.string().trim().min(1).max(PRODUCT_BATCH_LOT_MAX_LENGTH);

/**
 * Fecha de expiracion: opcional (R12) y como fecha CIVIL `YYYY-MM-DD`, no como instante
 * (R13). Se valida la FORMA con un patron y no se convierte a `Date` aqui: convertirla en el
 * borde es justo por donde se cuela el corrimiento de dia por zona horaria.
 */
const expiryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** ¿Ese importe pasa su propia validacion de campo? (R4, R5). */
function esImporteAceptado(amount: unknown): boolean {
  return typeof amount === 'string' && DECIMAL_PATTERN.test(amount) && !ZERO_PATTERN.test(amount);
}

const MESSAGE_SIN_COSTO = 'Indica el costo unitario o el costo total.';
const MESSAGE_EXISTENCIA = 'Indica una existencia de 1 o mas para derivar el costo del total.';
const MESSAGE_TOTAL_INSUFICIENTE =
  'El costo total es demasiado bajo para esa existencia: el costo unitario quedaria en 0.';

/**
 * `strictObject` (R24): un campo desconocido se RECHAZA, no se ignora en silencio. Mismo
 * criterio y mismo motivo que QC-52 y QC-43 -quien manda un campo de mas cree haber guardado
 * algo que no se guardo-.
 */
export const createProductWithFirstBatchSchema = z
  .strictObject({
    ...productFieldsShape,
    presentationId: presentationIdSchema,
    unitCost: amountSchema.nullish(),
    totalCost: amountSchema.nullish(),
    lot: lotSchema.nullish(),
    expiryDate: expiryDateSchema.nullish(),
  })
  /**
   * Las tres reglas cruzadas del costo, cada una con su `path` EXPLICITO. El `path` no es
   * decorativo: R8 exige que el rechazo se pinte EN EL CAMPO DE LA EXISTENCIA, y el
   * formulario ya reparte los errores por `issue.path[0]` (`design.md > 4`).
   */
  .superRefine((value, ctx) => {
    const unitCost = value.unitCost ?? null;
    const totalCost = value.totalCost ?? null;

    // zod v4 ejecuta esta comprobacion AUNQUE algun campo haya fallado ya por su cuenta, y
    // le pasa el valor crudo. Sin esta salida, un `totalCost` de '0' cobraria DOS rechazos
    // -el suyo y el de R9- y quien pinta el formulario mostraria dos mensajes para un solo
    // error. Un importe o una existencia ya rechazados no necesitan que se les anada nada.
    if ((unitCost !== null && !esImporteAceptado(unitCost)) ||
        (totalCost !== null && !esImporteAceptado(totalCost)) ||
        !Number.isInteger(value.stock)) {
      return;
    }

    // R11: no viene ninguno de los dos. El issue va a LOS DOS campos, porque cualquiera de
    // los dos resuelve el problema y no hay forma de saber cual queria escribir quien envia.
    if (unitCost === null && totalCost === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['unitCost'] });
      ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['totalCost'] });
      return;
    }

    // R10: si viene el unitario, PREVALECE y el total ni se mira. No se comparan uno con
    // otro a proposito: `total / existencia` redondea a 4 decimales, y una discrepancia de un
    // centimo por redondeo seria un rechazo que el usuario no puede corregir (pregunta
    // abierta 4 de `requirements.md`). Quien ignora el total es el caso de uso.
    if (unitCost !== null) return;

    // Llegados aqui solo puede quedar el total -la salida de R11 se llevo el caso de los dos
    // nulos-, pero el tipo no lo sabe y estrecharlo con una comprobacion es mas honesto que
    // afirmarlo con un `!`.
    if (totalCost === null) return;

    // R8: solo total y sin existencia que dividir. No hay costo unitario posible y la
    // columna es NOT NULL, asi que se pide la existencia -en su campo-.
    if (value.stock < 1) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_EXISTENCIA, path: ['stock'] });
      return;
    }

    // R9: el derivado redondea a `0.0000`. Se rechaza ANTES de escribir, senalando el campo
    // del costo total, que es el dato que quien envia puede corregir.
    if (deriveUnitCost(totalCost, value.stock) === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_TOTAL_INSUFICIENTE, path: ['totalCost'] });
    }
  });

export type CreateProductWithFirstBatchInput = z.infer<typeof createProductWithFirstBatchSchema>;
