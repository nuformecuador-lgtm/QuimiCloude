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
 * «Lote de solo digitos» (QC-81 D13, R34). NO se exporta: fuera de este archivo no hace falta.
 *
 * `[0-9]` y no `\d`, a proposito: es el MISMO conjunto, escrito con el MISMO texto, que el
 * `'^[0-9]+$'` con el que `resolveLot` (`adapters/driven/persistence/product-prisma.ts`) y el
 * relleno de la migracion `20260913120000_product_batch_lot_and_purchase_date` deciden que lote es
 * numerico y cuenta para la serie (R9). La regla de la entrada y la serie tienen que coincidir en
 * que es un lote numerico, y con el mismo texto eso se ve a simple vista.
 */
const NUMERIC_LOT_PATTERN = /^[0-9]+$/;

const MESSAGE_LOTE_NUMERICO_LARGO = 'Un lote de solo números puede tener hasta 59 caracteres.';

/**
 * Lote: OPCIONAL EN LA ENTRADA, OBLIGATORIO EN LA FILA (QC-81 R7, R8, R10).
 *
 * Son dos cosas distintas y no se contradicen. Desde QC-81 la columna `product_batches.lot` es
 * `NOT NULL`, tiene un `CHECK` que rechaza el blanco y es unica por empresa: ninguna fila queda sin
 * lote. Pero el CAMPO de esta entrada sigue declarado `nullish()`, porque «no escribi lote» es una
 * peticion valida: significa «que lo genere el backend» (R8), y quien lo genera es el adaptador,
 * dentro de la transaccion que escribe (`design.md > 3.1`). El caso de uso lo traduce a
 * `lot: null` en `NewProductBatch`, que ya no quiere decir «se guarda vacio».
 *
 * Esto DEROGA la mitad del lote de QC-90 R12 («lote opcional, se guarda `NULL`»); la mitad de la
 * expiracion sigue igual.
 *
 * Cuando SI viene, se recorta (R14) y se guarda tal cual (QC-81 R10). `trim()` va ANTES de
 * `min(1)`, como en el nombre del producto: si se aplicara despues, `'   '` pasaria el minimo y
 * solo se recortaria tras la validacion. Un lote de solo espacios no es un lote, es un campo
 * vacio, y se rechaza en vez de confundirse con «generalo».
 *
 * **Un lote TECLEADO de solo digitos no llega a 60 caracteres (D13, R34).** Si ya recortado casa con
 * `NUMERIC_LOT_PATTERN` y tiene `PRODUCT_BATCH_LOT_MAX_LENGTH` caracteres o mas, se rechaza en el
 * campo `lot` con su propio mensaje. Asi el mayor lote numerico tecleable es 10^59 - 1 y el siguiente
 * GENERADO, como mucho 10^59, tiene 60 caracteres y cabe siempre (R36). Cuenta CARACTERES, no
 * magnitud: un `'000…001'` de 60 se rechaza aunque valga 1. Un lote con algun caracter que no sea
 * digito conserva sus 60 (R35). Los lotes generados no pasan por aqui (`design.md > 4.6`).
 *
 * `abort: true` en el `max`, por el mismo motivo que en `purchaseDateSchema`: zod v4 ejecuta el
 * `refine` aunque el `max` haya fallado, y un lote de 61 digitos cobraria DOS rechazos. Con el corte,
 * cada lote mal escrito recibe uno solo (R34).
 */
const lotSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true })
  .refine(
    (value) => !(NUMERIC_LOT_PATTERN.test(value) && value.length >= PRODUCT_BATCH_LOT_MAX_LENGTH),
    { message: MESSAGE_LOTE_NUMERICO_LARGO },
  );

/** Forma de la fecha CIVIL `YYYY-MM-DD` que comparten la expiracion y la compra. */
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha de expiracion: opcional (R12) y como fecha CIVIL `YYYY-MM-DD`, no como instante
 * (R13). Se valida la FORMA con un patron y no se convierte a `Date` aqui: convertirla en el
 * borde es justo por donde se cuela el corrimiento de dia por zona horaria.
 */
const expiryDateSchema = z.string().regex(CIVIL_DATE_PATTERN);

/**
 * ¿La cadena `YYYY-MM-DD` es un dia que EXISTE en el calendario? (QC-81 R6).
 *
 * El patron solo mira la forma: `2026-02-30` y `2026-13-01` la cumplen. Aqui se compone el
 * instante con `Date.UTC` y se comprueba que el año, el mes y el dia VUELVEN IGUALES: `Date.UTC`
 * no rechaza un dia fuera de rango, lo desborda (`2026-02-30` -> 2 de marzo), y ese desborde es
 * justo lo que delata la fecha inexistente.
 *
 * Todo en UTC, sin zona local: la lectura no depende de la maquina que valide. El `Date` que se
 * construye es un medio de la comprobacion y MUERE AQUI; lo que el esquema entrega sigue siendo la
 * cadena, igual que la expiracion (`design.md > 4.1`).
 *
 * Limite sabido e inocuo: `Date.UTC` lee los años `0000`-`0099` como 1900-1999, asi que esos
 * años no vuelven iguales y se rechazan. Ninguna compra real cae ahi.
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

/**
 * Fecha de compra (QC-81 R3, R6): fecha CIVIL `YYYY-MM-DD` que ademas EXISTE en el calendario.
 *
 * `abort: true` en el patron no es adorno: zod v4 ejecuta las comprobaciones siguientes aunque
 * una anterior haya fallado, y sin el corte un `31/12/2026` cobraria DOS rechazos en
 * `purchaseDate` -el de forma y el de calendario- para un solo error. Con el corte, la
 * comprobacion de calendario solo recibe cadenas que ya tienen la forma, que es lo unico que
 * `esDiaDeCalendario` sabe leer.
 *
 * Lo que este esquema NO comprueba es que la fecha no sea futura (R4): zod no conoce el reloj del
 * caso de uso, y meterlo aqui haria que el mismo esquema diera veredictos distintos en el navegador
 * y en el servidor. Eso vive en `create-product.ts`, con el `now()` inyectado.
 */
const purchaseDateSchema = z
  .string()
  .regex(CIVIL_DATE_PATTERN, { abort: true })
  .refine(esDiaDeCalendario);

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
    /**
     * QC-81 (R2, R3, R6): `nullish()` y NO obligatorio, aunque la columna sea NOT NULL. Ausente
     * significa HOY -es literalmente la decision D3, «su valor por defecto es la fecha actual»- y
     * lo resuelve el caso de uso con su `now()`. Es tambien lo que mantiene la pantalla de hoy
     * funcionando SIN TOCARLA: el formulario de alta no manda este campo, y si el esquema lo
     * exigiera toda alta desde la pantalla moriria con `invalid_input` hasta que QC-103 lo pinte
     * (QC-81 R28 prohibe tocar `app/**`). QC-103 solo tiene que anadir el campo.
     */
    purchaseDate: purchaseDateSchema.nullish(),
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
