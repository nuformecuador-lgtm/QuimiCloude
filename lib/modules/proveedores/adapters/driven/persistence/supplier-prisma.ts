import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeSupplierName } from '../../../domain/supplier-name';

import { catalogLineCompanyScope, companyScopeColumns, supplierCompanyScope } from './company-scope';
import { dateRangeCondition, normalizedSearchCondition, textCondition } from './list-query-sql';
import { buildCatalogLineWhere, catalogLineOrderBy } from './supplier-catalog-line-prisma';

import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { SupplierScope } from '../../../domain/supplier-scope';
import {
  SHOWCASE_LINE_BATCH,
  SHOWCASE_LINE_SORT,
  SHOWCASE_SUPPLIER_BATCH,
  SHOWCASE_SUPPLIER_SORT,
} from '../../../domain/supplier-showcase';
import type { ShowcasePage, ShowcaseQuery } from '../../../domain/supplier-showcase';
import type { NewSupplier, SupplierView } from '../../../domain/supplier-view';

/**
 * Implementa `SupplierRepository` (`design.md > 7`) con Prisma. Junto con
 * `supplier-catalog-line-prisma.ts` es uno de los DOS unicos archivos del modulo
 * `proveedores` que importan `@prisma/client`, `@/lib/shared/db/prisma` y
 * `@/lib/shared/pagination`.
 *
 * `deleted_at IS NULL` va en el `where` de TODA lectura y de toda escritura que exija que
 * la fila siga viva, nunca en un `if` posterior (R22): el filtro es del puerto, y por eso
 * ningun caso de uso puede olvidarlo.
 *
 * PROHIBIDO tocar `users` y las tablas de `inventario`: `created_by`/`updated_by` viajan
 * como identificadores en crudo. Ni `include`, ni `select`, ni `$queryRaw` hacia ellas.
 * `supplier_catalog_lines` SI se escribe desde aqui, y solo en un sitio: la baja logica del
 * proveedor arrastra su catalogo en la misma transaccion (R20, ver mas abajo).
 */

/** `select` unico para las dos lecturas. `deleted_at` NO sale: nunca es dato de salida. */
const SUPPLIER_SELECT = {
  id: true,
  name: true,
  nameNormalized: true,
  phone: true,
  email: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} satisfies Prisma.SupplierSelect;

type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof SUPPLIER_SELECT }>;

/** Fila de Prisma -> `SupplierView` del puerto. Sin ninguna traduccion de negocio. */
export function toSupplierView(row: SupplierRow): SupplierView {
  return {
    id: row.id,
    name: row.name,
    nameNormalized: row.nameNormalized,
    phone: row.phone,
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * Columna que protege el indice unico PARCIAL de `suppliers` (`suppliers_name_unique`,
 * escrito a mano en la migracion de QC-42: Prisma no modela indices parciales, y por eso no
 * aparece en `db/schema.prisma`). Mismo criterio verificado empiricamente en QC-25 para
 * `recipes_name_unique`: cuando el conector traduce el `23505` de un indice asi a `P2002`,
 * `error.meta.target` trae la(s) COLUMNA(S), nunca el nombre del indice.
 */
const SUPPLIER_NAME_UNIQUE_COLUMN = 'name_normalized';

/**
 * `P2002` cuenta como nombre duplicado SOLO cuando la columna que disparo la violacion es
 * la del nombre normalizado (R15). Hoy `suppliers` no tiene ningun otro unico, pero
 * traducir cualquier `23505` a «nombre repetido» seria incorrecto en cuanto lo tuviera, y
 * ese fue un hallazgo real de la revision de QC-25.
 *
 * Si `meta.target` no viniera, NO se asume: mejor relanzar el error crudo que traducirlo
 * mal (mismo criterio conservador que `recipe-prisma.ts`).
 */
export function isUniqueNameViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return target.includes(SUPPLIER_NAME_UNIQUE_COLUMN);
  if (Array.isArray(target)) return target.includes(SUPPLIER_NAME_UNIQUE_COLUMN);
  return false;
}

/**
 * `create` de `SupplierRepository` (R7, R8, R16).
 *
 * Escribe `created_by` Y `updated_by` con el mismo `actorId`: al nacer, el autor de la
 * creacion y el de la ultima modificacion son la misma persona (R8). `name` y
 * `name_normalized` se escriben JUNTOS, con lo que dio el caso de uso (R16): este adaptador
 * no vuelve a normalizar nada, para que no puedan diverger dos definiciones.
 *
 * `createdAt`/`updatedAt` usan el `now` inyectado, no el `now()` de la base, para que el
 * reloj sea el mismo que fijo el caso de uso.
 */
export async function createSupplier(
  data: NewSupplier,
  actorId: string,
  now: Date,
  scope: SupplierScope,
): Promise<{ id: string } | 'duplicate'> {
  try {
    const created = await prisma.supplier.create({
      data: {
        ...companyScopeColumns(scope),
        name: data.name,
        nameNormalized: data.nameNormalized,
        phone: data.phone,
        email: data.email,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      },
      select: { id: true },
    });
    return { id: created.id };
  } catch (error) {
    // R15, R17: la unicidad la garantiza SOLO el indice, sin `SELECT` previo -eso seria una
    // carrera-. El dominio recibe un resultado discriminado, jamas un SQLSTATE.
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/** `findAliveById` (R22, R24): `deleted_at IS NULL` y el ambito de empresa en el `where`, no
 *  en un `if` posterior. */
export async function findAliveSupplierById(
  id: string,
  scope: SupplierScope,
): Promise<SupplierView | null> {
  const row = await prisma.supplier.findFirst({
    where: { id, deletedAt: null, ...supplierCompanyScope(scope) },
    select: SUPPLIER_SELECT,
  });
  return row === null ? null : toSupplierView(row);
}

/**
 * `updateAlive` (R8, R14, R15, R22, R24).
 *
 * `updateMany` con `deletedAt: null` en el `where` y no `update`: si el proveedor no existe
 * o ya esta dado de baja, `count` sale 0 y se devuelve `'not_found'` en vez de lanzar.
 *
 * `data` NUNCA incluye `createdBy`: conservar el autor de la creacion es la mitad de R8 que
 * solo se puede demostrar aqui, y se demuestra contra Postgres en T17.
 */
export async function updateAliveSupplier(
  id: string,
  data: NewSupplier,
  actorId: string,
  now: Date,
  scope: SupplierScope,
): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const { count } = await prisma.supplier.updateMany({
      where: { id, deletedAt: null, ...supplierCompanyScope(scope) },
      data: {
        name: data.name,
        nameNormalized: data.nameNormalized,
        phone: data.phone,
        email: data.email,
        updatedAt: now,
        updatedBy: actorId,
      },
    });
    return count === 1 ? 'ok' : 'not_found';
  } catch (error) {
    if (isUniqueNameViolation(error)) return 'duplicate';
    throw error;
  }
}

/**
 * `softDeleteAlive` (R13, R20, R21, R22, R23). Borrado LOGICO: marca `deleted_at` -y sella
 * `updated_at`/`updated_by`-, NUNCA `prisma.supplier.delete`. La fila se conserva entera, y
 * como el indice unico del nombre es PARCIAL sobre los vivos, el nombre queda libre.
 *
 * QC-52 le anade LA CAIDA DEL CATALOGO (R20, decision cerrada 5): la baja arrastra todas
 * las lineas vivas de ese proveedor. Tres cosas de esta implementacion son el requisito, no
 * detalles:
 *
 * 1. **Una sola transaccion.** No puede quedar un proveedor dado de baja con alguna linea
 *    viva ni al reves, ni siquiera durante un instante ni si el proceso muere en medio.
 * 2. **La MISMA marca de tiempo** en las dos sentencias, la que inyecto el caso de uso. Dos
 *    `now()` distintos harian imposible saber despues que lineas cayeron con que baja.
 * 3. **Transaccion INTERACTIVA, no un array.** Si el primer `UPDATE` afecta 0 filas -no hay
 *    proveedor vivo con ese id- se sale antes del segundo y la transaccion NO ESCRIBE NADA
 *    (R23). Con `$transaction([a, b])` las dos sentencias corren siempre, y la segunda
 *    podria marcar lineas de un proveedor que nadie acaba de dar de baja.
 *
 * `supplier_catalog_lines` es tabla del MISMO modulo, asi que escribirla desde aqui no cruza
 * ninguna frontera. Lo que sigue prohibido es `users` y las tablas de `inventario`.
 *
 * El `onDelete: Cascade` de `supplier_catalog_lines_supplier_id_fkey` se conserva y NO tiene
 * nada que ver con esto: ninguna FK reacciona a un `UPDATE`. Sigue siendo la red de un
 * borrado fisico -una purga, el `down.sql`- que no ocurre en operacion normal.
 */
export async function softDeleteAliveSupplier(
  id: string,
  actorId: string,
  now: Date,
  scope: SupplierScope,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.supplier.updateMany({
      where: { id, deletedAt: null, ...supplierCompanyScope(scope) },
      data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
    });
    if (count !== 1) return false;

    await tx.supplierCatalogLine.updateMany({
      where: { supplierId: id, deletedAt: null, ...catalogLineCompanyScope(scope) },
      data: { deletedAt: now, updatedAt: now, updatedBy: actorId },
    });
    return true;
  });
}

/**
 * Desempate ESTABLE por identificador (R10). No es adorno y por eso es una constante con
 * nombre: el nombre solo es unico ENTRE LOS VIVOS -indice unico parcial-, asi que sin este
 * segundo criterio dos filas empatadas pueden intercambiarse -o perderse- entre paginas,
 * porque el orden de las empatadas no esta definido y Postgres puede devolverlas distinto en
 * cada consulta.
 */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.SupplierOrderByWithRelationInput;

/** Orden POR DEFECTO: exactamente el de hoy, `name ASC, id ASC` (R11). Sin `sort`, la lista no
 *  se mueve. Se construye en CADA llamada, no como constante compartida: Prisma exige un array
 *  mutable en `orderBy`, y devolver siempre la misma instancia dejaria que un llamante la
 *  mutara para todos. */
function defaultOrderBy(): Prisma.SupplierOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `sort` del contrato -> `orderBy` de Prisma (R10, R11).
 *
 * Ninguna de las tres columnas ordenables de `SUPPLIER_QUERYABLE` es anulable, asi que aqui no
 * hace falta `nulls: 'last'` -donde SI hace falta es en el catalogo, con `min_purchase` y
 * `delivery_time`-.
 *
 * El `default` NO puede darse por inalcanzable: `sanitizeListQuery` ya poda lo que no esta
 * declarado, pero el adaptador no puede depender de que su llamante lo haya hecho. Es defensa
 * en profundidad, y ademas mantiene R5 cierto tambien aqui: un campo desconocido cae al orden
 * por defecto, no revienta la consulta.
 */
export function supplierOrderBy(
  sort: ListSort | null,
): Prisma.SupplierOrderByWithRelationInput[] {
  if (sort === null) return defaultOrderBy();
  const dir = sort.direction;

  switch (sort.columnId) {
    case 'name':
      return [{ name: dir }, TIE_BREAKER];
    case 'createdAt':
      return [{ createdAt: dir }, TIE_BREAKER];
    case 'updatedAt':
      return [{ updatedAt: dir }, TIE_BREAKER];
    default:
      return defaultOrderBy();
  }
}

/**
 * Un filtro del contrato -> la condicion de la columna que le corresponde. Devuelve `null` -y
 * el filtro no aparece en el `where`- cuando el campo no es filtrable aqui o cuando el valor no
 * acota nada (rango con los dos extremos nulos, `select` con lista VACIA: «no he elegido nada»
 * NO es «ningun resultado», `design.md > 3.3`).
 *
 * Las CUATRO formas estan contempladas (R12) aunque hoy `SUPPLIER_QUERYABLE` solo declare
 * `createdAt` como `dateRange`: traducir es trabajo del adaptador, y declarar manana un campo
 * nuevo no puede depender de que alguien recuerde que aqui faltaba una rama.
 */
function supplierFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.SupplierWhereInput | null {
  switch (value.kind) {
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
      if (field === 'email') return { email: condition };
      if (field === 'phone') return { phone: condition };
      return null;
    }
    // Ningun campo de `SUPPLIER_QUERYABLE` se declara `select` ni `numberRange`, y el proveedor
    // no tiene ninguna columna que lo admitiria: un filtro asi se poda antes de llegar aqui
    // (R8) y, si llegara, se omite en vez de romper la consulta (R5).
    case 'select':
    case 'numberRange':
      return null;
  }
}

/**
 * `where` UNICO del listado de proveedores: el mismo objeto para el `findMany` y para el
 * `count` (R14). Cuatro capas, y ninguna sobra:
 *
 *   1. **`deletedAt: null` y el ambito de empresa SIEMPRE**, al mismo nivel y NUNCA fundidos
 *      con la busqueda ni con los filtros: un termino de busqueda no puede ampliar lo visible
 *      mas alla de la propia empresa. `deletedAt` no es consultable en ninguna lista blanca y
 *      `sanitizeListQuery` lo poda ademas por su cuenta.
 *   2. **La busqueda contra `name_normalized`** (R16, R18, R19), normalizando el termino con
 *      `normalizeSupplierName` -la MISMA funcion que escribio la columna y que decide si un
 *      nombre ya existe-. Es lo que hace que «quimicos» encuentre «Químicos del Pacífico».
 *      Sin `mode: 'insensitive'`: la columna ya viene sin acentos ni mayusculas, y pedirlo
 *      ademas dejaria fuera el indice de trigramas.
 *   3. **Los filtros, TODOS a la vez** (R15): un `AND` explicito, de modo que una fila sale
 *      solo si los cumple todos.
 */
export function buildSupplierWhere(
  query: ListQuery,
  scope: SupplierScope,
): Prisma.SupplierWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeSupplierName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => supplierFilterWhere(field, value))
    .filter((condition): condition is Prisma.SupplierWhereInput => condition !== null);

  return {
    deletedAt: null,
    ...supplierCompanyScope(scope),
    ...(search === null ? {} : { nameNormalized: search }),
    ...(filters.length === 0 ? {} : { AND: filters }),
  };
}

/**
 * `listAlive` con el CONTRATO GENERICO de consulta (QC-57 R10, R11, R13, R14, R15, R16, R18,
 * R29; QC-43 R18, R19, R21, R22).
 *
 * El `limit` que llega a Prisma -y el `pageSize` que sale en el `Page`- es el ACOTADO que
 * devuelve `toOffsetLimit`, nunca el que pidio el llamante: pasarle el pedido a `buildPage`
 * dejaria un `totalPages` mentiroso aunque el `LIMIT` de SQL fuera correcto. Pedir 100 se
 * ACOTA a 25, no se rechaza (R29).
 *
 * ORDEN, FILTRO Y BUSQUEDA VAN AL MOTOR, nunca a la pagina ya traida (R13): filtrar lo ya
 * descargado es justo lo que QC-22 y QC-26 rechazaron por enganoso, y ademas dejaria un `total`
 * mentiroso.
 *
 * `total` sale de un `count` con el MISMO `where` que el `findMany` (R14) -literalmente la
 * misma constante, no dos copias parecidas-.
 */
export async function listAliveSuppliers(
  query: ListQuery,
  scope: SupplierScope,
): Promise<Page<SupplierView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildSupplierWhere(query, scope);

  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: SUPPLIER_SELECT,
      orderBy: supplierOrderBy(query.sort),
      skip: offset,
      take: limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  return buildPage(rows.map(toSupplierView), total, query.page, limit);
}

/**
 * `listShowcaseAlive` de `SupplierRepository`: la tanda de proveedores de la vista de catalogo
 * visual, con la primera tanda de lineas de cada uno.
 *
 * SIN `some` de lineas si no hay filtro de producto: asi el proveedor sin catalogo sale y
 * cuenta en su tanda. `take: SHOWCASE_SUPPLIER_BATCH + 1` evita un `count` aparte: la fila
 * de mas solo dice `hasMore` y se descarta antes de devolver la pagina.
 *
 * Para las lineas de cada proveedor de la tanda, UNA `findMany` por proveedor en paralelo, con
 * `buildCatalogLineWhere`/`catalogLineOrderBy` -las MISMAS funciones que usa el «cargar mas»
 * (`list-showcase-lines.ts`)-, para que la primera tanda de una fila y su continuacion nunca
 * discrepen en el orden ni en el filtro. `take: SHOWCASE_LINE_BATCH + 1` es el mismo
 * truco que arriba, por fila.
 */
export async function listShowcaseAliveSuppliers(
  query: ShowcaseQuery,
  scope: SupplierScope,
): Promise<ShowcasePage> {
  const supplierSearch = normalizedSearchCondition(query.supplierSearch, normalizeSupplierName);
  const productSearch = normalizedSearchCondition(query.productSearch, normalizeSupplierName);

  const where: Prisma.SupplierWhereInput = {
    deletedAt: null,
    ...supplierCompanyScope(scope),
    ...(supplierSearch === null ? {} : { nameNormalized: supplierSearch }),
    ...(productSearch === null
      ? {}
      : {
          catalogLines: {
            some: {
              deletedAt: null,
              ...catalogLineCompanyScope(scope),
              nameNormalized: productSearch,
            },
          },
        }),
  };

  const rows = await prisma.supplier.findMany({
    where,
    select: { id: true, name: true },
    orderBy: supplierOrderBy(SHOWCASE_SUPPLIER_SORT),
    skip: (query.page - 1) * SHOWCASE_SUPPLIER_BATCH,
    take: SHOWCASE_SUPPLIER_BATCH + 1,
  });

  const hasMore = rows.length > SHOWCASE_SUPPLIER_BATCH;
  const pageRows = rows.slice(0, SHOWCASE_SUPPLIER_BATCH);

  const items = await Promise.all(
    pageRows.map(async (supplier) => {
      const lineQuery: ListQuery = { page: 1, sort: null, filters: {}, search: query.productSearch };
      const lineWhere = buildCatalogLineWhere(supplier.id, lineQuery, scope);

      const lineRows = await prisma.supplierCatalogLine.findMany({
        where: lineWhere,
        select: { id: true, name: true, imagePath: true },
        orderBy: catalogLineOrderBy(SHOWCASE_LINE_SORT),
        take: SHOWCASE_LINE_BATCH + 1,
      });

      return {
        id: supplier.id,
        name: supplier.name,
        lines: lineRows.slice(0, SHOWCASE_LINE_BATCH),
        hasMoreLines: lineRows.length > SHOWCASE_LINE_BATCH,
      };
    }),
  );

  return { items, page: query.page, hasMore };
}
