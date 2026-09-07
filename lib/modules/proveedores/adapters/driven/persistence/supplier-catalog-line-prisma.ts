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
import {
  dateRangeCondition,
  normalizedSearchCondition,
  numberRangeCondition,
  selectCondition,
  textCondition,
} from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';

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
 * Desempate ESTABLE por identificador (R10). El nombre de la linea solo es unico dentro del
 * mismo proveedor y la misma presentacion, y `created_at` empata en cuanto dos lineas se dan
 * de alta en el mismo milisegundo: sin este segundo criterio dos filas empatadas pueden
 * intercambiarse -o perderse- entre paginas.
 */
const TIE_BREAKER = {
  id: 'asc',
} as const satisfies Prisma.SupplierCatalogLineOrderByWithRelationInput;

/** Orden POR DEFECTO: exactamente el de hoy, `created_at ASC, id ASC` (R11). NO se cambia a
 *  `name ASC` aunque la linea tenga nombre propio y sea ordenable: sin `sort`, la lista no se
 *  mueve. Se construye en CADA llamada porque Prisma exige un array mutable en `orderBy`. */
function defaultOrderBy(): Prisma.SupplierCatalogLineOrderByWithRelationInput[] {
  return [{ createdAt: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * **`minPurchase` y `deliveryTime` son ANULABLES y sus nulos van SIEMPRE AL FINAL**, en `asc`
 * Y en `desc`, **declarado explicito** (`nulls: 'last'`) y NO heredado del defecto de Postgres
 * -que los pone al final en `ASC` pero al PRINCIPIO en `DESC`-. Es la decision cerrada del
 * 2026-09-04, que manda sobre `design.md > 3.3`: quien ordena por compra minima quiere ver los
 * extremos reales, y de mayor a menor arrancaria si no con todas las lineas que no la tienen
 * registrada.
 *
 * `cost` NO es anulable, asi que no lleva `nulls`.
 *
 * El `default` NO puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta
 * declarado, pero el adaptador no puede depender de que su llamante lo haya hecho. Es defensa
 * en profundidad, y mantiene R5 cierto tambien aqui.
 */
export function catalogLineOrderBy(
  sort: ListSort | null,
): Prisma.SupplierCatalogLineOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'cost':
      return [{ cost: dir }, TIE_BREAKER];
    case 'minPurchase':
      return [{ minPurchase: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'deliveryTime':
      return [{ deliveryTime: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Rango numerico del contrato -> rango en `Prisma.Decimal` (`design.md > 5`).
 *
 * `cost` y `min_purchase` son `DECIMAL(14,4)` y el `numberRange` de QC-55 emite `number`. La
 * conversion vive AQUI, en el adaptador, y no en el dominio: `docs/architecture.md >
 * Anti-patrones` prohibe comparar importes en coma flotante binaria, y el dominio ademas no
 * puede importar `@prisma/client`. Dejar que Prisma comparase el `number` en crudo es
 * exactamente lo que ese anti-patron nombra.
 */
function toDecimalRange(
  condition: { gte?: number; lte?: number },
): { gte?: Prisma.Decimal; lte?: Prisma.Decimal } {
  return {
    ...(condition.gte === undefined ? {} : { gte: new Prisma.Decimal(condition.gte) }),
    ...(condition.lte === undefined ? {} : { lte: new Prisma.Decimal(condition.lte) }),
  };
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. Devuelve `null` -y
 * el filtro no aparece en el `where`- cuando el campo no es filtrable aqui o cuando el valor no
 * acota nada (rango con los dos extremos nulos, `select` con lista VACIA: no haber elegido nada
 * NO es «ningun resultado», `design.md > 3.3`).
 *
 * `deliveryTime` es `Int` y se compara como numero; `cost` y `minPurchase` son `Decimal` y
 * pasan por `toDecimalRange`. Las CUATRO formas del contrato estan contempladas (R12).
 */
function catalogLineFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.SupplierCatalogLineWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      if (field === 'presentationId') return { presentationId: condition };
      if (field === 'unitId') return { unitId: condition };
      return null;
    }
    case 'numberRange': {
      const condition = numberRangeCondition(value.min, value.max);
      if (condition === null) return null;
      if (field === 'deliveryTime') return { deliveryTime: condition };
      if (field === 'cost') return { cost: toDecimalRange(condition) };
      if (field === 'minPurchase') return { minPurchase: toDecimalRange(condition) };
      return null;
    }
    case 'dateRange': {
      const condition = dateRangeCondition(value.from, value.to);
      if (condition === null) return null;
      if (field === 'createdAt') return { createdAt: condition };
      if (field === 'updatedAt') return { updatedAt: condition };
      return null;
    }
    case 'text': {
      const condition = textCondition(value.value);
      if (condition === null) return null;
      if (field === 'name') return { name: condition };
      return null;
    }
  }
}

/**
 * `where` UNICO del listado del catalogo: el mismo objeto para el `findMany` y para el `count`
 * (R14). Cuatro capas, y ninguna sobra:
 *
 *   1. **`supplierId`**: el catalogo es siempre el de UN proveedor.
 *   2. **`deletedAt: null` SIEMPRE** (R7, R22): la LINEA tiene que estar viva. La otra
 *      condicion de vida -que el PROVEEDOR lo este- la comprueba `listBySupplierAlive` antes
 *      de llegar aqui, y las dos juntas son las que ningun caso de uso puede olvidar porque no
 *      viven en un `if` del dominio.
 *   3. **La busqueda contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 *      `normalizeSupplierName` -la MISMA funcion que escribio la columna y que protege el
 *      indice unico parcial-: buscar y comparar no discrepan.
 *   4. **Los filtros, TODOS a la vez** (R15): un `AND` explicito, de modo que una fila sale
 *      solo si los cumple todos.
 */
export function buildCatalogLineWhere(
  supplierId: string,
  query: ListQuery,
): Prisma.SupplierCatalogLineWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeSupplierName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => catalogLineFilterWhere(field, value))
    .filter((condition): condition is Prisma.SupplierCatalogLineWhereInput => condition !== null);

  return {
    supplierId,
    deletedAt: null,
    ...(search === null ? {} : { nameNormalized: search }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `listBySupplierAlive` con el CONTRATO GENERICO de consulta (QC-57 R10, R11, R13, R14, R15,
 * R16, R18, R29; QC-52 R22, R23).
 *
 * DOS FILTROS DE VIDA, no uno, y los dos se conservan: comprueba PRIMERO que el proveedor este
 * vivo -si no lo esta, no devuelve nada, ni siquiera una pagina vacia- y ademas exige
 * `deleted_at IS NULL` en la propia linea, dentro del `where`. Ninguno es opcional y ninguno
 * depende de lo que traiga la consulta.
 *
 * ORDEN, FILTRO Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13), y el `total` sale
 * de un `count` con el MISMO `where` que el `findMany` (R14). El `limit` es el ACOTADO de
 * `toOffsetLimit`: pedir 100 se acota a 25, no se rechaza (R29).
 */
export async function listCatalogLinesBySupplierAlive(
  supplierId: string,
  query: ListQuery,
): Promise<Page<CatalogLineView> | 'supplier_not_found'> {
  if (!(await isSupplierAlive(supplierId))) return 'supplier_not_found';

  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildCatalogLineWhere(supplierId, query);

  const [rows, total] = await Promise.all([
    prisma.supplierCatalogLine.findMany({
      where,
      select: CATALOG_LINE_SELECT,
      orderBy: catalogLineOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.supplierCatalogLine.count({ where }),
  ]);

  return buildPage(rows.map(toCatalogLineView), total, query.page, limit);
}
