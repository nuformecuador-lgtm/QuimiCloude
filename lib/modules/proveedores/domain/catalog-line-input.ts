import { z } from 'zod';

import { normalizeSupplierName } from './supplier-name';

/**
 * `cost` y `minPurchase` viajan como CADENA, nunca como `number` (R11): el dominio no puede
 * importar `@prisma/client` y el binario de coma flotante esta prohibido para importes
 * (`docs/architecture.md > Anti-patrones`). Quien convierte a `Prisma.Decimal` -y de vuelta
 * con `.toFixed(4)`- es el adaptador driven.
 *
 * El patron admite hasta 10 enteros y 4 decimales, la forma exacta de `DECIMAL(14,4)`, y
 * NO admite signo: por eso «>= 0» de `minPurchase` (R10) ya lo garantiza el patron, sin
 * comparacion numerica ninguna.
 */
const DECIMAL_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;

/** Toda cifra decimal cuyos digitos son ceros: '0', '0.0', '00.0000'. */
const ZERO_PATTERN = /^0+(\.0*)?$/;

/**
 * Costo estrictamente mayor que cero (R10, decision cerrada 6). El cero se descarta
 * LEXICAMENTE, no convirtiendo a `number`: sobre una cadena decimal, «todos los digitos
 * son cero» es exacto y no pasa por coma flotante.
 *
 * Esta es la defensa del BORDE. La de la base -el `CHECK ("cost" > 0)` que puso QC-43 y que
 * QC-52 conserva- es otra (R10, «en los dos sitios») y se prueba contra Postgres real.
 */
const costSchema = z
  .string()
  .regex(DECIMAL_PATTERN)
  .refine((value) => !ZERO_PATTERN.test(value));

/**
 * Minimo de compra: mismo decimal, pero el cero SI vale (R10). «Sin minimo pactado»
 * expresado de forma redundante no es un dato a medio escribir, y la base lo mantiene en
 * `>= 0` (decision 5 de QC-42, que esta ficha no toca).
 */
const minPurchaseSchema = z.string().regex(DECIMAL_PATTERN).nullish();

/**
 * Tiempo de entrega en dias enteros, sin cota superior (pregunta abierta 3 del diseno de
 * QC-42): un techo arbitrario seria un numero inventado y una migracion para cambiarlo.
 * Cero es «mismo dia», no un dato a medio escribir.
 */
const deliveryTimeSchema = z.number().int().min(0).nullish();

/**
 * Largo maximo del nombre de la linea (`design.md > 7`): el mismo 120 que el nombre de
 * producto (QC-20 D11) y el de proveedor (QC-43). Vive en la validacion de aplicacion, no
 * en el tipo de la columna: cambiarlo es una linea y su caso de test, no una migracion.
 */
export const CATALOG_LINE_NAME_MAX_LENGTH = 120;

/**
 * Nombre de la linea (R14). El orden importa y no es negociable: `trim()` va ANTES de
 * `min(1)`, porque si se aplicara despues, `'   '` pasaria el minimo de longitud y solo se
 * recortaria tras la validacion.
 *
 * El `refine` cierra el hueco que `min(1)` no ve: `'###'` tiene longitud, pero
 * `normalizeSupplierName` lo deja en vacio, y una fila con `name_normalized = ''` chocaria
 * contra el indice unico parcial con un mensaje que nadie entiende. Es la MISMA
 * comprobacion, en el mismo sitio y con la misma funcion que `supplierNameSchema` de
 * `supplier-input.ts` -que es el precedente que `design.md > 7` manda seguir-: escribirla
 * en los dos casos de uso en vez de aqui la duplicaria sin ganar nada, y `zod` si la
 * expresa mientras la funcion de normalizacion sea la del propio dominio.
 */
const catalogLineNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATALOG_LINE_NAME_MAX_LENGTH)
  .refine((name) => normalizeSupplierName(name) !== '');

/** Presentacion: uuid y OBLIGATORIA (R10). Que EXISTA lo garantiza la FK, no este esquema. */
const presentationIdSchema = z.string().uuid();

/** Unidad: uuid y OPCIONAL (R10). Misma nota sobre la existencia: la cierra la FK. */
const unitIdSchema = z.string().uuid().nullish();

/**
 * Ruta de la imagen: texto no vacio y opcional, SIN patron de forma (P1, `design.md > 7`).
 * Es el mismo criterio con el que la migracion de `products.image_path` se nego a poner un
 * `CHECK`: la forma de la ruta -clave de Storage, ruta relativa, URL absoluta- no esta
 * acordada en ningun sitio del repo, y un patron inventado aqui seria la definicion de
 * facto de algo que nadie decidio.
 */
const imagePathSchema = z.string().min(1).nullish();

/**
 * Los SIETE campos de negocio de la linea, compartidos por el alta y la edicion. Estan
 * declarados UNA vez: dos listas paralelas divergen en cuanto alguien anade un campo a una
 * sola de ellas.
 */
const catalogLineFieldsShape = {
  name: catalogLineNameSchema,
  presentationId: presentationIdSchema,
  unitId: unitIdSchema,
  imagePath: imagePathSchema,
  cost: costSchema,
  minPurchase: minPurchaseSchema,
  deliveryTime: deliveryTimeSchema,
} as const;

/**
 * Alta de una linea del catalogo (R31). `supplierId` se valida solo en su FORMA -que sea un
 * uuid-; que el proveedor exista Y ESTE VIVO lo comprueba el puerto (R23).
 *
 * `strictObject`, no `object`: una entrada que traiga un identificador de articulo del
 * inventario se RECHAZA como entrada invalida en vez de ignorarse en silencio (R9).
 * Ignorarla seria peor, porque quien la envia creeria haber vinculado algo que no se guardo
 * en ningun sitio -y desde QC-52 no hay ninguna columna donde pudiera guardarse-.
 */
export const createCatalogLineSchema = z.strictObject({
  supplierId: z.string().uuid(),
  ...catalogLineFieldsShape,
});

/**
 * Edicion de la linea: REEMPLAZO COMPLETO de los siete campos de negocio (R24, P6). No hay
 * edicion parcial campo a campo.
 *
 * Sigue SIN `supplierId`, y esa es la unica cosa que la edicion no puede cambiar: no
 * porque un `if` la filtre, sino porque el tipo no la tiene. `strictObject` hace que
 * colarla -o colar el identificador de un articulo del inventario- de `invalid_input`, no
 * un campo ignorado.
 */
export const updateCatalogLineSchema = z.strictObject({ ...catalogLineFieldsShape });

export type CreateCatalogLineInput = z.infer<typeof createCatalogLineSchema>;
export type UpdateCatalogLineInput = z.infer<typeof updateCatalogLineSchema>;
