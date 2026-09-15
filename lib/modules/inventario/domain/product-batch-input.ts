import { z } from 'zod';

import { productFieldsShape } from './product-input';
import { deriveUnitCost } from './unit-cost';

// Un solo esquema para el formulario y el caso de uso, para que un rechazo caiga en el mismo campo
// en los dos lados.

/**
 * Duplicado a proposito del de `proveedores`: de otro modulo solo se importa su contrato, y sacarlo
 * a `lib/shared/` ataria dos dominios que no comparten nada.
 */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

const ZERO_PATTERN = /^0+(\.0*)?$/;

/** El cero se descarta sobre la cadena, sin pasar por coma flotante. */
const amountSchema = z
  .string()
  .trim()
  .regex(DECIMAL_PATTERN)
  .refine((value) => !ZERO_PATTERN.test(value));

/** Que la presentacion exista lo garantiza la FK, no zod. */
const presentationIdSchema = z.string().uuid();

export const PRODUCT_BATCH_LOT_MAX_LENGTH = 60;

/**
 * `[0-9]` y no `\d`: es el mismo texto con el que la serie del adaptador y la migracion deciden
 * que lote es numerico.
 */
const NUMERIC_LOT_PATTERN = /^[0-9]+$/;

const MESSAGE_LOTE_NUMERICO_LARGO = 'Un lote de solo números puede tener hasta 59 caracteres.';

/**
 * Opcional en la entrada aunque la columna sea NOT NULL: ausente significa «que lo genere el
 * backend». `trim()` va antes de `min(1)` para que un lote de solo espacios se rechace y no se
 * confunda con «generalo».
 *
 * Un lote de solo digitos no puede tener 60 caracteres: su siguiente correlativo no cabria en el
 * largo maximo.
 */
const lotSchema = z
  .string()
  .trim()
  .min(1)
  // Sin `abort`, zod ejecuta tambien el `refine` y un lote demasiado largo cobra dos errores.
  .max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true })
  .refine(
    (value) => !(NUMERIC_LOT_PATTERN.test(value) && value.length >= PRODUCT_BATCH_LOT_MAX_LENGTH),
    { message: MESSAGE_LOTE_NUMERICO_LARGO },
  );

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La fecha civil viaja como texto y la convierte el adaptador: convertirla a `Date` en el borde es
 * por donde entra el corrimiento de dia por zona horaria.
 */
const expiryDateSchema = z.string().regex(CIVIL_DATE_PATTERN);

/**
 * `Date.UTC` no rechaza un dia fuera de rango, lo desborda (`2026-02-30` -> 2 de marzo): si el año,
 * el mes y el dia no vuelven iguales, la fecha no existe. Los años `0000`-`0099` los lee como
 * 1900-1999, asi que tambien se rechazan; ninguna compra real cae ahi.
 */
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

/** Que no sea futura lo comprueba el caso de uso: el esquema no tiene el reloj. */
const purchaseDateSchema = z
  .string()
  // Sin `abort`, zod ejecuta tambien el `refine` y una fecha sin forma cobra dos errores.
  .regex(CIVIL_DATE_PATTERN, { abort: true })
  .refine(esDiaDeCalendario);

function esImporteAceptado(amount: unknown): boolean {
  return typeof amount === 'string' && DECIMAL_PATTERN.test(amount) && !ZERO_PATTERN.test(amount);
}

const MESSAGE_SIN_COSTO = 'Indica el costo unitario o el costo total.';
const MESSAGE_EXISTENCIA = 'Indica una existencia de 1 o mas para derivar el costo del total.';
const MESSAGE_TOTAL_INSUFICIENTE =
  'El costo total es demasiado bajo para esa existencia: el costo unitario quedaria en 0.';

/** Un campo desconocido se rechaza: quien lo manda cree haber guardado algo que no se guardo. */
export const createProductWithFirstBatchSchema = z
  .strictObject({
    ...productFieldsShape,
    presentationId: presentationIdSchema,
    unitCost: amountSchema.nullish(),
    totalCost: amountSchema.nullish(),
    lot: lotSchema.nullish(),
    expiryDate: expiryDateSchema.nullish(),
    // Opcional aunque la columna sea NOT NULL: ausente significa hoy.
    purchaseDate: purchaseDateSchema.nullish(),
  })
  // Cada issue lleva `path` explicito porque el formulario pinta el rechazo en `issue.path[0]`.
  .superRefine((value, ctx) => {
    const unitCost = value.unitCost ?? null;
    const totalCost = value.totalCost ?? null;

    // zod ejecuta esto aunque un campo ya haya fallado por su cuenta; sin esta salida ese error se
    // cobraria dos veces.
    if ((unitCost !== null && !esImporteAceptado(unitCost)) ||
        (totalCost !== null && !esImporteAceptado(totalCost)) ||
        !Number.isInteger(value.stock)) {
      return;
    }

    // A los dos campos: cualquiera de los dos resuelve el problema.
    if (unitCost === null && totalCost === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['unitCost'] });
      ctx.addIssue({ code: 'custom', message: MESSAGE_SIN_COSTO, path: ['totalCost'] });
      return;
    }

    // Si viene el unitario prevalece y no se compara con el total: el redondeo a 4 decimales daria
    // rechazos que nadie puede corregir.
    if (unitCost !== null) return;

    // Ya no puede ser `null`, pero el tipo no lo sabe; mejor estrecharlo que afirmarlo con `!`.
    if (totalCost === null) return;

    if (value.stock < 1) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_EXISTENCIA, path: ['stock'] });
      return;
    }

    // En el campo del total, que es el dato que quien envia puede corregir.
    if (deriveUnitCost(totalCost, value.stock) === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGE_TOTAL_INSUFICIENTE, path: ['totalCost'] });
    }
  });

export type CreateProductWithFirstBatchInput = z.infer<typeof createProductWithFirstBatchSchema>;
