import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

// Este adaptador ya no importa NINGUN error de dominio, y es correcto: el 2026-09-09 la autoria
// y la presentacion se fueron de `products` a `product_batches`, asi que aqui no queda ninguna
// clave foranea que traducir. Lo que QC-70 renombro en este archivo -el antiguo `NotFoundError`
// del autor inexistente a `ProductNotFoundError` (R17)- desaparecio con la columna que lo
// disparaba: el renombrado sigue vivo en `update-product.ts` y `delete-product.ts`, que son los
// sitios que de verdad lo lanzan.
import { normalizeProductName } from '../../../domain/product-name';

import {
  dateRangeCondition,
  normalizedSearchCondition,
  numberRangeCondition,
  selectCondition,
  textCondition,
} from './list-query-sql';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { NewProduct, ProductView } from '../../../domain/product-view';

/**
 * Implementa `ProductRepository` (`design.md > 7`) con Prisma. Es el UNICO archivo del
 * modulo `inventario` que importa `@prisma/client` y `@/lib/shared/db/prisma`, y el unico
 * que llama a `lib/shared/pagination` (R31, `design.md > 7`, `> 8`).
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura (`findAliveProductById`,
 * `listAliveProducts`) y de toda escritura que exija que la fila siga viva
 * (`updateAliveProduct`, `softDeleteAliveProduct`), nunca en un `if` posterior (R16).
 *
 * PROHIBIDO tocar `users`. Desde el 2026-09-09 la autoria (`createdBy`/`updatedBy`) se mudo
 * de `products` a `product_batches`, asi que este adaptador ya no escribe ni lee ninguna
 * columna de auditoria, ni consulta el modelo de usuarios de Prisma ni `$queryRaw` sobre esa
 * tabla.
 *
 * `nameNormalized` se calcula AQUI, en TODA escritura de producto (`createProduct` y
 * `updateAliveProduct`), con la UNICA definicion del modulo -`normalizeProductName`- y en la
 * misma llamada que escribe `name`: mismo patron que `recipe-prisma.ts` y
 * `supplier-catalog-line-prisma.ts` (QC-57, R19, R23). No hay ningun camino que escriba el
 * nombre sin escribir su forma normalizada, que es lo que permite que la busqueda del listado
 * y la comparacion de nombres no discrepen. `softDeleteAliveProduct` no toca el nombre, asi
 * que tampoco toca esta columna.
 */

/** `select` unico para las tres lecturas, sin ningun `join` desde el 2026-09-09 (la
 * presentacion se mudo a `product_batches`). */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  imagePath: true,
  stock: true,
  qtyAlert: true,
  unitId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * QC-52 (R1): `toDecimalInput`/`fromDecimalCost` se fueron con `cost`. Eran la unica
 * conversion `string <-> Prisma.Decimal` del modulo, y sin costo en el producto no queda
 * ningun importe que convertir aqui. La misma pareja de funciones vive, viva, en el
 * adaptador de la linea de catalogo de `proveedores`, que es donde el importe se quedo.
 */

/** Fila de Prisma -> `ProductView` del puerto. */
export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    stock: row.stock,
    qtyAlert: row.qtyAlert,
    unitId: row.unitId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * `create` de `ProductRepository` (R5). Sin autor ni presentacion: se mudaron a
 * `product_batches` el 2026-09-09. `createdAt`/`updatedAt` usan el `now` inyectado por el
 * caso de uso, no `now()` de la base, para que el reloj sea el mismo que el service fijo.
 */
export async function createProduct(
  data: NewProduct,
  now: Date,
): Promise<{ id: string }> {
  const created = await prisma.product.create({
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      unitId: data.unitId ?? null,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * `findAliveById` de `ProductRepository` (R16). `deleted_at IS NULL` en el `where`, no
 * en un `if` posterior.
 */
export async function findAliveProductById(id: string): Promise<ProductView | null> {
  const row = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: PRODUCT_SELECT,
  });
  return row === null ? null : toProductView(row);
}

/**
 * `updateAlive` de `ProductRepository` (R13, R14, R16). `updateMany` con
 * `deletedAt: null` en el `where` y no `update`: si el producto no existe o ya esta
 * borrado, `count` sale 0 y se devuelve `false` en vez de lanzar (R14). La existencia
 * -`stock`- se guarda tal cual, sin recalcularla, como el resto de campos de negocio.
 */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.product.updateMany({
    where: { id, deletedAt: null },
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      unitId: data.unitId ?? null,
      updatedAt: now,
    },
  });
  return count === 1;
}

/**
 * `softDeleteAlive` de `ProductRepository` (R14, R15, R16). Borrado LOGICO: solo
 * marca `deleted_at` (y `updated_at`), NUNCA `prisma.product.delete`. La fila se conserva
 * entera. Mismo `updateMany` con `deletedAt: null` en el `where` que `updateAliveProduct`,
 * por la misma razon (R14): apuntar a un producto inexistente o ya borrado devuelve `false`,
 * no lanza.
 */
export async function softDeleteAliveProduct(
  id: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.product.updateMany({
    where: { id, deletedAt: null },
    data: {
      deletedAt: now,
      updatedAt: now,
    },
  });
  return count === 1;
}

/**
 * Desempate ESTABLE por identificador (R10). No es adorno y por eso es una constante con
 * nombre: el nombre de un producto NO es unico (D14 de QC-20), asi que sin este segundo criterio
 * dos homonimos pueden intercambiarse -o perderse- entre paginas, porque el orden de las filas
 * empatadas no esta definido y Postgres puede devolverlas distinto en cada consulta.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.ProductOrderByWithRelationInput;

/** Orden POR DEFECTO: exactamente el de hoy (R11). Sin `sort`, la lista no se mueve. */
/** Se construye en CADA llamada, no como constante compartida: Prisma exige un array
 *  mutable en `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la
 *  mutara para todos. */
function defaultOrderBy(): Prisma.ProductOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * DOS COSAS QUE NO SON OBVIAS:
 *
 *   1. **`stock` y `qtyAlert` son ANULABLES y sus nulos van SIEMPRE AL FINAL**, en `asc` Y en
 *      `desc`, **declarado explicito** (`nulls: 'last'`) y NO heredado del defecto de Postgres
 *      -que los pone al final en `ASC` pero al PRINCIPIO en `DESC`-. Es la decision cerrada del
 *      2026-09-04, que manda sobre `design.md > 3.3`: quien ordena por existencia quiere ver los
 *      extremos reales, y de mayor a menor arrancaria si no con todos los productos sin
 *      existencia registrada.
 *   2. **El `default` no puede darse por inalcanzable**: `sanitizeListQuery` ya poda lo que no
 *      esta en `PRODUCT_QUERYABLE`, pero el adaptador no puede depender de que su llamante lo
 *      haya hecho -es defensa en profundidad, y ademas mantiene R5 cierto aqui tambien: un campo
 *      desconocido cae al orden por defecto, no revienta la consulta-.
 */
export function productOrderBy(
  sort: ListSort | null,
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'stock':
      return [{ stock: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'qtyAlert':
      return [{ qtyAlert: { sort: dir, nulls: 'last' } }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'updatedAt':
      return [{ updatedAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. Devuelve `null` -y el
 * filtro no aparece en el `where`- cuando el campo no es filtrable aqui o cuando el valor no
 * acota nada (rango con los dos extremos nulos, `select` con lista VACIA: «no he elegido nada»
 * NO es «ningun resultado», `design.md > 3.3`).
 *
 * Las CUATRO formas del contrato estan contempladas (R12). La de `text` sobre `name` no llega
 * hoy -`PRODUCT_QUERYABLE` no declara `name` filtrable: el nombre se BUSCA con `search`, no se
 * filtra-, y `sanitizeListQuery` la podaria antes; se escribe igual porque traducir es trabajo
 * del adaptador y declarar manana un campo de texto no puede depender de que alguien recuerde
 * que aqui faltaba una rama.
 */
function productFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.ProductWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      if (field === 'unitId') return { unitId: condition };
      return null;
    }
    case 'numberRange': {
      const condition = numberRangeCondition(value.min, value.max);
      if (condition === null) return null;
      if (field === 'stock') return { stock: condition };
      if (field === 'qtyAlert') return { qtyAlert: condition };
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
 * `where` UNICO del listado de productos: el mismo objeto para el `findMany` y para el `count`
 * (R14). Tres capas, y ninguna sobra:
 *
 *   1. **`deletedAt: null` SIEMPRE** (R7, R16 de QC-20). No es un filtro que el llamante pueda
 *      quitar: `deletedAt` no es consultable en ninguna lista blanca y `sanitizeListQuery` lo
 *      poda ademas por su cuenta.
 *   2. **La busqueda contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 *      `normalizeProductName` -la MISMA funcion que escribio la columna-. Es lo que hace que
 *      «solucion» encuentre «Solución Buffer pH 7». Sin `mode: 'insensitive'`: la columna ya
 *      viene sin acentos ni mayusculas, y pedirlo ademas dejaria fuera el indice de trigramas.
 *   3. **Los filtros, TODOS a la vez** (R15): un `AND` explicito, de modo que una fila sale solo
 *      si los cumple todos.
 */
export function buildProductWhere(query: ListQuery): Prisma.ProductWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeProductName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => productFilterWhere(field, value))
    .filter((condition): condition is Prisma.ProductWhereInput => condition !== null);

  return {
    deletedAt: null,
    ...(search === null ? {} : { nameNormalized: search }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `listAlive` de `ProductRepository` con el CONTRATO GENERICO de consulta (QC-57 R10, R11,
 * R13, R14, R15, R16, R18, R29). El `limit` que llega a Prisma -y el `pageSize` que sale en el
 * `Page`- es el ACOTADO que devuelve `toOffsetLimit`, nunca el `pageSize` que pidio el llamante
 * (`design.md > 8`): pasarle el pedido a `buildPage` dejaria un `Page` con un `pageSize` y un
 * `totalPages` mentirosos aunque el `LIMIT` de SQL fuera correcto. Pedir 100 se ACOTA a 25, no
 * se rechaza (R29).
 *
 * ORDEN, FILTRO Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13): filtrar lo ya
 * descargado es justo lo que QC-22 y QC-26 rechazaron por enganoso, y ademas dejaria un `total`
 * mentiroso.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (R14) -literalmente la misma
 * constante, no dos copias parecidas-, de modo que el `total` y el `totalPages` describan el
 * conjunto YA FILTRADO y no el catalogo entero.
 */
export async function listAliveProducts(query: ListQuery): Promise<Page<ProductView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildProductWhere(query);

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PRODUCT_SELECT,
      orderBy: productOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return buildPage(rows.map(toProductView), total, query.page, limit);
}
