import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeSupplierName } from '../../../domain/supplier-name';

import { ValidationError } from '../../../domain/errors';

import type {
  CatalogLineFields,
  CatalogLineView,
  NewCatalogLine,
} from '../../../domain/catalog-line-view';
import type { Page, PageQuery } from '../../../domain/page';

/**
 * Implementa `SupplierCatalogRepository` (`design.md > 6`, `> 7`) con Prisma.
 *
 * Las UNICAS dos tablas que toca son `supplier_catalog_lines` y -para comprobar que el
 * proveedor sigue vivo- `suppliers`, las dos de su propio modulo. Desde QC-52 no hay
 * ninguna consulta que cruce a `inventario` ni a `unidades`: `presentation_id` y `unit_id`
 * son escalares en el esquema, sin `@relation` (R30), de modo que el cliente de Prisma no
 * ofrece siquiera un `include` por el que atravesar. Los autores viajan como identificador
 * en crudo.
 */

/**
 * `select` unico de la lectura del catalogo. `name_normalized` NO sale: es una clave de
 * comparacion, no un dato de salida. `deleted_at` tampoco (R22).
 */
const CATALOG_LINE_SELECT = {
  id: true,
  supplierId: true,
  name: true,
  presentationId: true,
  unitId: true,
  imagePath: true,
  cost: true,
  minPurchase: true,
  deliveryTime: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.SupplierCatalogLineSelect;

type CatalogLineRow = Prisma.SupplierCatalogLineGetPayload<{
  select: typeof CATALOG_LINE_SELECT;
}>;

/**
 * `cost` y `minPurchase` viajan como CADENA por el puerto (R11): el dominio no puede
 * importar `@prisma/client` y el binario de coma flotante esta prohibido para importes.
 * Este es el unico sitio del modulo que hace la conversion, en los dos sentidos.
 */
export function toDecimalInput(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

/** Camino inverso: `Prisma.Decimal` -> cadena con los 4 decimales de `DECIMAL(14,4)`. */
export function fromDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(4);
}

/** Fila -> `CatalogLineView`. Sin ninguna traduccion de negocio y sin ningun dato ajeno. */
export function toCatalogLineView(row: CatalogLineRow): CatalogLineView {
  return {
    id: row.id,
    supplierId: row.supplierId,
    name: row.name,
    presentationId: row.presentationId,
    unitId: row.unitId,
    imagePath: row.imagePath,
    // `cost` es `Decimal` no anulable en el esquema: la cadena existe siempre.
    cost: fromDecimal(row.cost) as string,
    minPurchase: fromDecimal(row.minPurchase),
    deliveryTime: row.deliveryTime,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Columnas del indice unico PARCIAL `supplier_catalog_lines_name_presentation_unique`
 * (R15), y su nombre. Prisma no modela indices parciales, asi que el indice se escribio a
 * mano en la migracion y no aparece en `db/schema.prisma`.
 *
 * Se aceptan las DOS formas en las que el conector puede reportar el objetivo del `23505`:
 * la lista de COLUMNAS -que es lo que trae `meta.target` para los indices unicos que Prisma
 * si conoce, verificado en QC-25 y QC-42- y el NOMBRE del indice, que es lo que el conector
 * devuelve para un indice creado a mano y que la tabla `supplier_catalog_lines` no le
 * declara. Comprobado empiricamente contra Postgres en
 * `tests/integration/proveedores/catalog-line.int.test.ts`.
 */
const CATALOG_LINE_UNIQUE_TARGETS = [
  'supplier_id',
  'name_normalized',
  'presentation_id',
  'supplier_catalog_lines_name_presentation_unique',
];

/**
 * `P2002` de la terna que identifica la linea: el unico duplicado posible de esta tabla,
 * porque es su unico indice unico.
 *
 * Si `meta.target` no viniera, NO se asume: se devuelve `false` y el error se relanza
 * crudo, que es el mismo criterio conservador de `supplier-prisma.ts` y `recipe-prisma.ts`.
 */
export function isDuplicateLineViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target: unknown = error.meta?.target;
  const columnas = typeof target === 'string' ? [target] : Array.isArray(target) ? target : [];
  return CATALOG_LINE_UNIQUE_TARGETS.some((columna) =>
    columnas.some((valor) => typeof valor === 'string' && valor.includes(columna)),
  );
}

/**
 * Nombre de la restriccion o de la columna que disparo un `P2003`, leido de `meta` y NUNCA
 * del texto del mensaje: en esta maquina Postgres lo devuelve en espanol, y un adaptador que
 * dependa del idioma del servidor esta roto de nacimiento.
 *
 * Se leen las DOS claves porque el conector ha usado las dos: `field_name` en las versiones
 * en las que se escribio el precedente de `inventario`, y `constraint` en Prisma 6.
 *
 * HALLAZGO EMPIRICO (2026-09-04, Prisma 6.19.3, Postgres local) — hoy NINGUNA de las dos
 * viene: todo `P2003` sobre `supplier_catalog_lines` y sobre `products` llega con
 * `meta = { modelName, constraint: null }` y el mensaje termina en «violated on the (not
 * available)». Da igual que la FK este declarada con `@relation` (`products.presentation_id`,
 * `supplier_catalog_lines.supplier_id`) o sea un escalar (`unit_id`, `created_by`): el
 * conector no dice CUAL. Consecuencia, escrita para que no se lea como un descuido:
 * `classifyForeignKeyViolation` devuelve `'unknown'` en todos los casos reales de hoy y el
 * error se RELANZA CRUDO. La clasificacion de abajo es correcta y esta probada en unitario;
 * empezara a traducir sola en cuanto el conector diga el nombre. Traducir «a ciegas»
 * -asumir que todo `P2003` de esta tabla es la presentacion- seria inventarse un dato que
 * nadie tiene, y le diria `invalid_input` al usuario cuando el fallo fuera del autor.
 */
function fieldNameOf(error: Prisma.PrismaClientKnownRequestError): string {
  const meta: unknown = error.meta;
  if (typeof meta !== 'object' || meta === null) return '';
  for (const clave of ['field_name', 'constraint'] as const) {
    if (!(clave in meta)) continue;
    const valor: unknown = (meta as Record<string, unknown>)[clave];
    if (typeof valor === 'string') return valor;
  }
  return '';
}

/**
 * Clasifica, de forma PURA, la columna que disparo un `23503` en esta tabla
 * (`design.md > 6.2`). Se decide por `meta.field_name`, NUNCA por el texto del mensaje: en
 * esta maquina Postgres lo devuelve en espanol, y un adaptador que dependa del idioma del
 * servidor esta roto de nacimiento.
 *
 * - `supplier_id`: el proveedor no existe. Es un desenlace de negocio y viaja como
 *   resultado discriminado (`'supplier_not_found'`), que el dominio lee como R23.
 * - `presentation_id` / `unit_id`: son campos de ENTRADA que el borde ya valido como uuid
 *   pero cuya existencia solo la base puede garantizar. Entrada invalida
 *   (`ValidationError`, `invalid_input`), sin codigo nuevo (R32). Precedente literal:
 *   `products.presentation_id` en el adaptador de `inventario`.
 * - `created_by` / `updated_by`: NO se traducen. El actor sale de una sesion real, asi que
 *   un autor inexistente no es un caso de negocio sino un fallo del sistema, y traducirlo
 *   diria al usuario una mentira. Se relanza crudo.
 *
 * El orden de las comprobaciones importa: se mira `supplier_id` primero porque el nombre
 * de la restriccion de las otras dos empieza por `supplier_catalog_lines_`, y una
 * comparacion por inclusion hecha al reves seria ambigua.
 *
 * Ver el hallazgo de `fieldNameOf`: hoy el conector no entrega ningun nombre, asi que en
 * ejecucion esta funcion recibe `''` y devuelve `'unknown'`. Se prueba en unitario con los
 * nombres reales de las restricciones, que es donde la logica si es observable.
 */
export function classifyForeignKeyViolation(
  fieldName: string,
): 'supplier' | 'catalog_reference' | 'unknown' {
  if (fieldName.includes('supplier_id')) return 'supplier';
  if (fieldName.includes('presentation_id') || fieldName.includes('unit_id')) {
    return 'catalog_reference';
  }
  return 'unknown';
}

function foreignKeyViolationOf(error: unknown): Prisma.PrismaClientKnownRequestError | null {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
    ? error
    : null;
}

/**
 * `23503` sobre `supplier_id`: el proveedor no existe (R23). Se decide por la COLUMNA, no
 * por el texto del mensaje.
 */
export function isSupplierForeignKeyViolation(error: unknown): boolean {
  const violation = foreignKeyViolationOf(error);
  return violation !== null && classifyForeignKeyViolation(fieldNameOf(violation)) === 'supplier';
}

/**
 * Lanza `ValidationError` si el `P2003` viene de `presentation_id` o de `unit_id`; en
 * cualquier otro caso no hace nada y quien llama relanza el error crudo.
 */
function throwIfInvalidCatalogReference(error: unknown): void {
  const violation = foreignKeyViolationOf(error);
  if (violation === null) return;
  if (classifyForeignKeyViolation(fieldNameOf(violation)) === 'catalog_reference') {
    throw new ValidationError();
  }
}

/**
 * ¿Hay un proveedor VIVO con ese id? (R23). Es la misma consulta que abre
 * `listBySupplierAlive`, extraida para que las operaciones que la necesitan compartan una
 * sola definicion de «proveedor vivo».
 */
async function isSupplierAlive(supplierId: string): Promise<boolean> {
  const row = await prisma.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
    select: { id: true },
  });
  return row !== null;
}

/**
 * `name_normalized` se deriva SIEMPRE aqui, en TODA escritura, con `normalizeSupplierName`
 * -la funcion que ya existia en el dominio del modulo y que QC-52 REUTILIZA en vez de
 * escribir otra (R14, `design.md > 2.3`)-. Dos definiciones de «mismo nombre» en el mismo
 * modulo divergen, y la que manda es la del indice unico.
 *
 * Va en el adaptador y no en el caso de uso porque `CatalogLineFields` -el tipo que
 * `design.md > 7` fija literalmente- no lleva `nameNormalized`: es una columna derivada,
 * no un campo de negocio que nadie escriba a mano.
 */
function writableFields(data: CatalogLineFields): {
  readonly name: string;
  readonly nameNormalized: string;
  readonly presentationId: string;
  readonly unitId: string | null;
  readonly imagePath: string | null;
  readonly cost: Prisma.Decimal;
  readonly minPurchase: Prisma.Decimal | null;
  readonly deliveryTime: number | null;
} {
  return {
    name: data.name,
    nameNormalized: normalizeSupplierName(data.name),
    presentationId: data.presentationId,
    unitId: data.unitId,
    imagePath: data.imagePath,
    cost: toDecimalInput(data.cost) as Prisma.Decimal,
    minPurchase: toDecimalInput(data.minPurchase),
    deliveryTime: data.deliveryTime,
  };
}

/**
 * `create` (R13, R14, R15, R23). Escribe `created_by` Y `updated_by` con el mismo
 * `actorId`: al nacer, el autor de la creacion y el de la ultima modificacion son la misma
 * persona.
 *
 * R23 — un proveedor DADO DE BAJA no admite lineas nuevas. La FK no basta: la fila del
 * proveedor sigue existiendo tras la baja logica, asi que el `INSERT` pasaria y quedaria una
 * linea que ninguna consulta devuelve nunca. La comprobacion previa es del ADAPTADOR, no
 * del caso de uso, por el mismo motivo por el que lo es el filtro `deleted_at IS NULL`: es
 * el puerto quien define «proveedor vivo». No es atomica -entre la lectura y el `INSERT`
 * cabe una baja concurrente- y esa carrera se asume a sabiendas: su unico efecto es una
 * linea invisible. No se confunde con la comprobacion de unicidad de R15, que SI seria un
 * error resolver con un `SELECT` previo: alli la base tiene un indice que lo hace atomico y
 * aqui no hay ninguna restriccion que pueda expresar «el proveedor sigue vivo».
 */
export async function createCatalogLine(
  data: NewCatalogLine,
  actorId: string,
  now: Date,
): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'> {
  if (!(await isSupplierAlive(data.supplierId))) return 'supplier_not_found';

  try {
    const created = await prisma.supplierCatalogLine.create({
      data: {
        supplierId: data.supplierId,
        ...writableFields(data),
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isDuplicateLineViolation(error)) return 'duplicate';
    if (isSupplierForeignKeyViolation(error)) return 'supplier_not_found';
    throwIfInvalidCatalogReference(error);
    throw error;
  }
}

/**
 * `replaceAlive` (R13, R15, R23, R24). Reemplaza los SIETE campos de negocio, nombre y
 * presentacion incluidos, y vuelve a derivar `name_normalized`.
 *
 * `updateMany` -no `update`- para devolver `'not_found'` en vez de lanzar. El `where` lleva
 * las dos condiciones de vida y ninguna vive en un `if` posterior: `deletedAt: null` sobre
 * la propia linea (R23) y `supplier: { deletedAt: null }` sobre su proveedor (R23, P5). El
 * filtro por la relacion se traduce a un `UPDATE ... WHERE EXISTS (...)`, una sola sentencia
 * atomica y sin carrera.
 *
 * `data` no lleva `supplierId` ni `createdBy`: el proveedor de una linea no se puede cambiar
 * y el autor de la creacion no se toca. No es que no se pasen «por ahora»; es que el tipo
 * del puerto (`CatalogLineFields`) no los tiene.
 */
export async function replaceAliveCatalogLine(
  id: string,
  data: CatalogLineFields,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const { count } = await prisma.supplierCatalogLine.updateMany({
      where: { id, deletedAt: null, supplier: { deletedAt: null } },
      data: {
        ...writableFields(data),
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1 ? 'ok' : 'not_found';
  } catch (error) {
    if (isDuplicateLineViolation(error)) return 'duplicate';
    throwIfInvalidCatalogReference(error);
    throw error;
  }
}

/**
 * `softDeleteAlive` (R13, R21, R23). Borrado LOGICO: marca `deleted_at` -y sella
 * `updated_at`/`updated_by`-, y NUNCA `prisma.supplierCatalogLine.delete`. Sustituye al
 * borrado fisico de QC-43, cuyo R34 queda derogado (decision cerrada 5).
 *
 * Mismo `where` que `replaceAlive`, y eso es lo que deroga QC-43 R48 entera (P5): la linea
 * de un proveedor dado de baja tampoco se puede dar de baja, porque ya lo esta -la baja del
 * proveedor la arrastro (R20)- y responder «hecho» sobre una fila ya marcada seria mentir.
 *
 * Como el indice unico es PARCIAL sobre las vivas, esta baja LIBERA la combinacion de
 * nombre normalizado y presentacion para otra linea del mismo proveedor (R17).
 */
export async function softDeleteAliveCatalogLine(
  id: string,
  actorId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.supplierCatalogLine.updateMany({
    where: { id, deletedAt: null, supplier: { deletedAt: null } },
    data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
  });
  return count === 1;
}

/**
 * `listBySupplierAlive` (R22, R23).
 *
 * Dos filtros, no uno. Comprueba PRIMERO que el proveedor este vivo -si no lo esta, no
 * devuelve nada, ni siquiera una pagina vacia- y ademas exige `deleted_at IS NULL` en la
 * propia linea. El segundo es el que QC-52 anade: hasta esta ficha la linea no tenia baja
 * logica donde marcar nada.
 *
 * Orden `created_at ASC, id ASC` (`design.md > 6.5`): estable y sin depender de nada de
 * otro modulo. NO se cambia a `name ASC` aunque ahora la linea tenga nombre propio; eso es
 * candidato para QC-44, que es quien tendra pantalla.
 */
export async function listCatalogLinesBySupplierAlive(
  supplierId: string,
  query: PageQuery,
): Promise<Page<CatalogLineView> | 'supplier_not_found'> {
  if (!(await isSupplierAlive(supplierId))) return 'supplier_not_found';

  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where: Prisma.SupplierCatalogLineWhereInput = { supplierId, deletedAt: null };

  const [rows, total] = await Promise.all([
    prisma.supplierCatalogLine.findMany({
      where,
      select: CATALOG_LINE_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.supplierCatalogLine.count({ where }),
  ]);

  return buildPage(rows.map(toCatalogLineView), total, query.page, limit);
}
