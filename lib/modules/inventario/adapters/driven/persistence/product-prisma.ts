import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { NotFoundError, ValidationError } from '../../../domain/errors';
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
 * PROHIBIDO tocar `users`: `createdBy`/`updatedBy` viajan como identificadores en crudo
 * (D20, R8). Este archivo no consulta el modelo de usuarios de Prisma, ni `include`/
 * `select` hacia `users`, ni `$queryRaw` sobre esa tabla. Quien necesite el nombre del
 * autor pide el contrato publico de `identity` (alcance de QC-22, no de esta ficha).
 *
 * `nameNormalized` se calcula AQUI, en TODA escritura de producto (`createProduct` y
 * `updateAliveProduct`), con la UNICA definicion del modulo -`normalizeProductName`- y en la
 * misma llamada que escribe `name`: mismo patron que `recipe-prisma.ts` y
 * `supplier-catalog-line-prisma.ts` (QC-57, R19, R23). No hay ningun camino que escriba el
 * nombre sin escribir su forma normalizada, que es lo que permite que la busqueda del listado
 * y la comparacion de nombres no discrepen. `softDeleteAliveProduct` no toca el nombre, asi
 * que tampoco toca esta columna.
 */

/** `select` unico para las tres lecturas, con el `join` a `presentation` DENTRO del modulo (legitimo, `design.md > 6.1`). */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  presentationId: true,
  presentation: { select: { name: true } },
  stock: true,
  qtyAlert: true,
  unitId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/**
 * QC-52 (R1): `toDecimalInput`/`fromDecimalCost` se fueron con `cost`. Eran la unica
 * conversion `string <-> Prisma.Decimal` del modulo, y sin costo en el producto no queda
 * ningun importe que convertir aqui. La misma pareja de funciones vive, viva, en el
 * adaptador de la linea de catalogo de `proveedores`, que es donde el importe se quedo.
 */

/** Fila de Prisma (con el `join` de presentacion) -> `ProductView` del puerto. */
export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    presentationId: row.presentationId,
    presentationName: row.presentation.name,
    stock: row.stock,
    qtyAlert: row.qtyAlert,
    unitId: row.unitId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Clasifica, de forma PURA, el nombre de la restriccion (`meta.field_name` de un
 * `PrismaClientKnownRequestError` `P2003`) segun la columna que la disparo
 * (`design.md > 7`: "23503 al crear/editar un producto (autor o presentacion
 * inexistente) se traduce a NotFoundError/ValidationError segun la columna"). Se afirma
 * sobre el contenido de `meta`, nunca sobre el texto del mensaje (en espanol en esta
 * maquina, `design.md > 12`).
 *
 * `presentation_id` es un campo de ENTRADA que el borde ya valido como UUID pero cuya
 * existencia solo la base puede garantizar: se trata como entrada invalida
 * (`ValidationError`). `created_by`/`updated_by` no son entrada del formulario -son el
 * actor de sesion-, y su ausencia como usuario real es "el autor no existe"
 * (`NotFoundError`), que es la lectura literal de R7.
 */
export function classifyForeignKeyViolation(fieldName: string): 'presentation' | 'actor' | 'unknown' {
  if (fieldName.includes('presentation_id')) return 'presentation';
  if (fieldName.includes('created_by') || fieldName.includes('updated_by')) return 'actor';
  return 'unknown';
}

function fieldNameOf(error: Prisma.PrismaClientKnownRequestError): string {
  const meta: unknown = error.meta;
  if (typeof meta === 'object' && meta !== null && 'field_name' in meta) {
    const fieldName: unknown = (meta as { field_name: unknown }).field_name;
    if (typeof fieldName === 'string') return fieldName;
  }
  return '';
}

/**
 * Traduce un `P2003` (violacion de FK) al error de dominio que le corresponde y lo lanza.
 * Si la restriccion no es ninguna de las dos que este adaptador escribe a mano
 * (`products_presentation_id_fkey`, `products_created_by_fkey`,
 * `products_updated_by_fkey`), relanza el error original: el dominio nunca ve un
 * SQLSTATE, pero tampoco se traga un fallo que no sabe interpretar.
 */
function translateForeignKeyViolation(error: Prisma.PrismaClientKnownRequestError): never {
  switch (classifyForeignKeyViolation(fieldNameOf(error))) {
    case 'presentation':
      throw new ValidationError();
    case 'actor':
      throw new NotFoundError();
    default:
      throw error;
  }
}

function isForeignKeyViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * `create` de `ProductRepository` (R5, R6, R7). Escribe `created_by` Y `updated_by` con
 * el mismo `actorId`: al nacer, el autor de creacion y el de la ultima modificacion son
 * la misma persona (R6). `createdAt`/`updatedAt` usan el `now` inyectado por el caso de
 * uso, no `now()` de la base, para que el reloj sea el mismo que el service fijo.
 */
export async function createProduct(
  data: NewProduct,
  actorId: string,
  now: Date,
): Promise<{ id: string }> {
  try {
    const created = await prisma.product.create({
      data: {
        name: data.name,
        nameNormalized: normalizeProductName(data.name),
        presentationId: data.presentationId,
        stock: data.stock ?? null,
        qtyAlert: data.qtyAlert ?? null,
        unitId: data.unitId ?? null,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
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
 * `updateAlive` de `ProductRepository` (R6, R13, R14, R16). `updateMany` con
 * `deletedAt: null` en el `where` y no `update`: si el producto no existe o ya esta
 * borrado, `count` sale 0 y se devuelve `false` en vez de lanzar (R14). `data` NUNCA
 * incluye `createdBy`: conservar el autor de creacion es la mitad de R6 que solo se
 * demuestra aqui, porque ningun test unitario con doble del puerto puede verlo (R13: la
 * existencia -`stock`- se guarda tal cual, sin recalcularla, como el resto de campos de
 * negocio).
 */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  actorId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { count } = await prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: {
        name: data.name,
        nameNormalized: normalizeProductName(data.name),
        presentationId: data.presentationId,
        stock: data.stock ?? null,
        qtyAlert: data.qtyAlert ?? null,
        unitId: data.unitId ?? null,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1;
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
}

/**
 * `softDeleteAlive` de `ProductRepository` (R6, R14, R15, R16). Borrado LOGICO: solo
 * marca `deleted_at` (y `updated_by`/`updated_at`), NUNCA `prisma.product.delete`. La
 * fila se conserva entera. Mismo `updateMany` con `deletedAt: null` en el `where` que
 * `updateAliveProduct`, por la misma razon (R14): apuntar a un producto inexistente o ya
 * borrado devuelve `false`, no lanza.
 *
 * `updated_by` sigue siendo una FK a `users`: se traduce el mismo `P2003` que en
 * `createProduct`/`updateAliveProduct` por consistencia, aunque R7 solo lo exige para
 * alta y edicion (`design.md > 7`) -es la misma columna con la misma restriccion, y
 * dejarla sin traducir aqui filtraria un `PrismaClientKnownRequestError` crudo al
 * dominio en un camino que de otro modo se comporta igual-.
 */
export async function softDeleteAliveProduct(
  id: string,
  actorId: string,
  now: Date,
): Promise<boolean> {
  try {
    const { count } = await prisma.product.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: now,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1;
  } catch (error) {
    if (isForeignKeyViolation(error)) translateForeignKeyViolation(error);
    throw error;
  }
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
 * TRES COSAS QUE NO SON OBVIAS:
 *
 *   1. **`presentationName` no es una columna de `products`**: es el `name` de la presentacion
 *      unida, y Prisma lo ordena atravesando la relacion (`{ presentation: { name: dir } }`).
 *      Se declara ordenable porque la pantalla ya muestra esa columna.
 *   2. **`stock` y `qtyAlert` son ANULABLES y sus nulos van SIEMPRE AL FINAL**, en `asc` Y en
 *      `desc`, **declarado explicito** (`nulls: 'last'`) y NO heredado del defecto de Postgres
 *      -que los pone al final en `ASC` pero al PRINCIPIO en `DESC`-. Es la decision cerrada del
 *      2026-09-04, que manda sobre `design.md > 3.3`: quien ordena por existencia quiere ver los
 *      extremos reales, y de mayor a menor arrancaria si no con todos los productos sin
 *      existencia registrada.
 *   3. **El `default` no puede darse por inalcanzable**: `sanitizeListQuery` ya poda lo que no
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
    case 'presentationName':
      return [{ presentation: { name: dir } }, TIE_BREAKER];
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
      if (field === 'presentationId') return { presentationId: condition };
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
