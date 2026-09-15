import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { BatchDuplicateLotError, ValidationError } from '../../../domain/errors';
import { normalizeProductName } from '../../../domain/product-name';

import { companyScopeColumns, productCompanyScope } from './company-scope';
import {
  dateRangeCondition,
  normalizedSearchCondition,
  numberRangeCondition,
  selectCondition,
  textCondition,
} from './list-query-sql';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { NewProductBatch } from '../../../domain/product-batch';
import type { NewProduct, ProductView } from '../../../domain/product-view';

// El ambito de empresa va como conjuncion aparte en un `AND` de primer nivel, para que ninguna otra
// condicion del `where` pueda relajarlo. Una fila de otra empresa sale igual que una que no existe
// (`null`/`false`): distinguirlas seria un oraculo de existencia sobre filas ajenas.

/**
 * Unidad del lote mas reciente. El desempate por `id` hace falta: con `created_at` empatado el
 * ganador no estaria definido. De `Presentation` solo se lee `unitId`: `units` es de otro modulo.
 */
const LATEST_BATCH_UNIT = {
  select: { presentation: { select: { unitId: true } } },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 1,
  // `satisfies` y no `as const`: `orderBy` exige un array mutable.
} satisfies Prisma.Product$batchesArgs;

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  imagePath: true,
  stock: true,
  qtyAlert: true,
  createdAt: true,
  updatedAt: true,
  batches: LATEST_BATCH_UNIT,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    stock: row.stock,
    qtyAlert: row.qtyAlert,
    latestBatchUnitId: row.batches[0]?.presentation.unitId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** `now` llega del caso de uso y no de `now()` de la base, para que los dos compartan reloj. */
export async function createProduct(
  data: NewProduct,
  now: Date,
  scope: InventoryScope,
): Promise<{ id: string }> {
  const created = await prisma.product.create({
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      ...companyScopeColumns(scope),
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  return { id: created.id };
}

export async function findAliveProductById(
  id: string,
  scope: InventoryScope,
): Promise<ProductView | null> {
  const row = await prisma.product.findFirst({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    select: PRODUCT_SELECT,
  });
  return row === null ? null : toProductView(row);
}

/** `updateMany` y no `update`: sin fila viva `count` sale 0 y se devuelve `false` en vez de lanzar. */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  now: Date,
  scope: InventoryScope,
): Promise<boolean> {
  const { count } = await prisma.product.updateMany({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    data: {
      name: data.name,
      nameNormalized: normalizeProductName(data.name),
      stock: data.stock ?? null,
      qtyAlert: data.qtyAlert ?? null,
      updatedAt: now,
    },
  });
  return count === 1;
}

export async function softDeleteAliveProduct(
  id: string,
  now: Date,
  scope: InventoryScope,
): Promise<boolean> {
  const { count } = await prisma.product.updateMany({
    where: { AND: [productCompanyScope(scope), { id, deletedAt: null }] },
    data: {
      deletedAt: now,
      updatedAt: now,
    },
  });
  return count === 1;
}

/** El nombre no es unico: sin este desempate, dos homonimos pueden cambiar de pagina entre consultas. */
const TIE_BREAKER = { id: 'asc' } as const satisfies Prisma.ProductOrderByWithRelationInput;

/** Un array nuevo por llamada: `orderBy` lo exige mutable, y una instancia compartida la podria
 *  mutar cualquier llamante. */
function defaultOrderBy(): Prisma.ProductOrderByWithRelationInput[] {
  return [{ name: 'asc' }, TIE_BREAKER];
}

/**
 * `nulls: 'last'` va explicito porque Postgres pone los nulos al principio en `DESC`. El `default`
 * no es inalcanzable: el adaptador no confia en que el llamante haya podado el campo.
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

function productFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.ProductWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      // Ningun campo de productos se filtra por eleccion: no hay columna a la que traducirlo.
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

/** El termino se normaliza con la misma funcion que escribio `name_normalized`, para que la
 *  busqueda y la escritura no discrepen. */
export function buildProductWhere(
  query: ListQuery,
  scope: InventoryScope,
): Prisma.ProductWhereInput {
  const search = normalizedSearchCondition(query.search, normalizeProductName);
  const filters = Object.entries(query.filters)
    .map(([field, value]) => productFilterWhere(field, value))
    .filter((condition): condition is Prisma.ProductWhereInput => condition !== null);

  return {
    AND: [
      productCompanyScope(scope),
      {
        deletedAt: null,
        ...(search === null ? {} : { nameNormalized: search }),
        ...(filters.length === 0 ? {} : { AND: filters }),
      },
    ],
  };
}

/**
 * A `buildPage` va el `limit` acotado y no el `pageSize` pedido: con el pedido, `pageSize` y
 * `totalPages` mentirian. El `count` usa el mismo `where` que el `findMany`, para que `total` no
 * cuente filas de otra empresa ni fuera del filtro.
 */
export async function listAliveProducts(
  query: ListQuery,
  scope: InventoryScope,
): Promise<Page<ProductView>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where = buildProductWhere(query, scope);

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

/** Con `created_at` empatado decide el `id`: sin el, dos altas del mismo nombre podrian colgar su
 *  lote de productos distintos. */
export async function findAliveIdByName(
  name: string,
  scope: InventoryScope,
): Promise<string | null> {
  const row = await prisma.product.findFirst({
    where: {
      AND: [
        productCompanyScope(scope),
        { nameNormalized: normalizeProductName(name), deletedAt: null },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return row === null ? null : row.id;
}

/** Del texto directo a `Prisma.Decimal`: pasar por un numero del lenguaje meteria el error de la
 *  coma flotante antes de una columna `DECIMAL(14,4)`. */
function toBatchUnitCost(unitCost: string): Prisma.Decimal {
  return new Prisma.Decimal(unitCost);
}

/** Con `Z`: sin zona, la cadena se leeria en la hora local del servidor y la fecha podria correrse un
 *  dia al pasar a UTC. */
function toBatchExpiryDate(expiryDate: string | null): Date | null {
  return expiryDate === null ? null : new Date(`${expiryDate}T00:00:00Z`);
}

/** Con `Z`, por lo mismo que `toBatchExpiryDate`. */
function toBatchPurchaseDate(purchaseDate: string): Date {
  return new Date(`${purchaseDate}T00:00:00Z`);
}

/** Lock de dos enteros: es otro espacio de claves que el `pg_advisory_lock(bigint)` de
 *  `tests/helpers/test-database.ts`, asi que no pueden colisionar. */
const BATCH_LOT_LOCK_NAMESPACE = 81;

/** La empresa va en la clave del lock: dos empresas no se hacen cola entre si. */
const BATCH_LOT_LOCK_KEY_PREFIX = 'product_batches_lot:';

/** El maximo llega como texto: es un `numeric` sin techo, y `BigInt` lo suma sin perder precision
 *  donde `Number` redondearia a partir de 2^53. */
type BatchLotTopRow = { readonly top: string | null };

/**
 * El lote escrito a mano, tal cual y sin lock; o el siguiente de la serie numerica de la empresa.
 *
 * El lock es una sentencia aparte y va antes del `SELECT max`: en READ COMMITTED cada sentencia
 * toma su instantanea al empezar, y dentro de la misma sentencia leeria el maximo anterior al
 * commit de la otra sesion. El lock solo evita choques; la garantia es el indice unico.
 */
async function resolveLot(
  tx: Prisma.TransactionClient,
  batch: NewProductBatch,
  scope: InventoryScope,
): Promise<string> {
  if (batch.lot !== null) return batch.lot;

  const { companyId } = companyScopeColumns(scope);

  // `$executeRaw` y no `$queryRaw`: `pg_advisory_xact_lock` devuelve `void`, y el cliente no sabe
  // deserializar una columna de ese tipo.
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${BATCH_LOT_LOCK_NAMESPACE}::int, hashtext(${BATCH_LOT_LOCK_KEY_PREFIX + companyId}::text))`,
  );

  // `numeric` y sin cota de digitos, como el relleno de la migracion: un maximo que no cupiera en el
  // tipo dejaria la serie proponiendo siempre el mismo valor. Limite conocido: tras 60 nueves el
  // siguiente tiene 61 caracteres, y el `23514` del CHECK de largo sale sin traducir.
  const rows = await tx.$queryRaw<ReadonlyArray<BatchLotTopRow>>(Prisma.sql`
    SELECT max(("lot")::numeric)::text AS "top"
      FROM "product_batches"
     WHERE "company_id" = ${companyId}::uuid
       AND "lot" ~ '^[0-9]+$'
  `);

  const top = rows[0]?.top ?? null;
  return (BigInt(top ?? '0') + BigInt(1)).toString();
}

/**
 * `lot` llega aparte y ya resuelto, no se lee de `batch`: asi el tipo impide escribir el `null` de
 * «que lo genere el backend» en una columna NOT NULL. `createdBy`/`updatedBy` van como escalares:
 * la FK a `users` solo existe en la migracion, para que el cliente no pueda atravesar a `identity`.
 */
function toBatchCreateData(
  productId: string,
  batch: NewProductBatch,
  lot: string,
  now: Date,
  scope: InventoryScope,
): Prisma.ProductBatchUncheckedCreateInput {
  return {
    productId,
    presentationId: batch.presentationId,
    stock: batch.stock,
    unitCost: toBatchUnitCost(batch.unitCost),
    lot,
    purchaseDate: toBatchPurchaseDate(batch.purchaseDate),
    expiryDate: toBatchExpiryDate(batch.expiryDate),
    // Que la empresa coincida con la del producto y la de la presentacion lo verifica el disparador
    // `product_batches_check_company`, no este archivo.
    ...companyScopeColumns(scope),
    createdBy: batch.createdBy,
    updatedBy: batch.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Por el codigo `P2003` y nunca por el texto, que depende del idioma del servidor. El conector no
 * dice que FK fallo (`meta.constraint` llega `null`), pero la unica alimentada por la entrada es
 * `presentation_id`: las demas salen de un producto recien escrito o leido, de la sesion o del ambito.
 */
function isBatchForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** Un `RAISE EXCEPTION` no tiene codigo `P####` propio: llega como `P2010` con el SQLSTATE en
 *  `meta.code`, o como `PrismaClientUnknownRequestError` con el codigo dentro del mensaje. */
function sqlStateOf(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const match = /\bcode:\s*"(\d{5})"/.exec(error.message);
    if (match !== null) return match[1] as string;
  }
  return null;
}

/** Identificadores que escribe el propio `RAISE EXCEPTION` del disparador, no texto que Postgres
 *  traduzca: buscarlos no es decidir por el mensaje. */
const BATCH_COMPANY_SCOPE_VIOLATIONS = [
  'product_batches_company_differs_from_product',
  'product_batches_company_differs_from_presentation',
] as const;

/** Ademas del `23514` hace falta el nombre: los CHECK de `stock` y `unit_cost` dan el mismo
 *  SQLSTATE y no son entrada que no encaja. */
function isBatchCompanyScopeViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  const carga = `${detalle}\n${bruto}`;
  return BATCH_COMPANY_SCOPE_VIOLATIONS.some((nombre) => carga.includes(nombre));
}

/** Lo que no se sabe traducir se relanza: un CHECK violado o una caida de conexion no son entrada
 *  invalida. */
function translateBatchWriteError(error: unknown): never {
  if (isBatchForeignKeyViolation(error)) throw new ValidationError();
  if (isBatchCompanyScopeViolation(error)) throw new ValidationError();
  throw error;
}

/** Por columnas y no por el nombre del indice: con esta version de Prisma, `meta.target` trae las
 *  columnas (igual que en `unit-write-prisma.ts`). */
const BATCH_LOT_UNIQUE_COLUMNS: ReadonlySet<string> = new Set(['company_id', 'lot']);

function uniqueTargetsOf(error: Prisma.PrismaClientKnownRequestError): readonly string[] {
  const target: unknown = error.meta?.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.filter((item): item is string => typeof item === 'string');
  return [];
}

/** Conjunto exacto y no «contiene»: un indice unico nuevo sin mapear no debe anunciarse como lote
 *  duplicado. */
export function isDuplicateBatchLot(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const targets = new Set(uniqueTargetsOf(error));
  if (targets.size !== BATCH_LOT_UNIQUE_COLUMNS.size) return false;
  return [...BATCH_LOT_UNIQUE_COLUMNS].every((column) => targets.has(column));
}

/** Acotado: el lock ya evita el choque, y uno que se repite no es mala suerte. */
const BATCH_LOT_MAX_ATTEMPTS = 3;

type BatchLotAttemptLog = { lastLot: string | null };

/**
 * El reintento va fuera de `prisma.$transaction`: una transaccion abortada no admite mas sentencias,
 * y cada vuelta abre una nueva que vuelve a pedir el lock y a leer el maximo. El `catch` tambien va
 * fuera: dentro del callback consumiria el error y se comitearia lo ya escrito. Solo se reintenta el
 * lote generado; uno escrito a mano chocaria igual en cada intento.
 */
async function writeBatchWithLotRetry<T>(
  batch: NewProductBatch,
  scope: InventoryScope,
  write: (tx: Prisma.TransactionClient, resolveBatchLot: () => Promise<string>) => Promise<T>,
): Promise<T> {
  const { companyId } = companyScopeColumns(scope);
  const attemptLog: BatchLotAttemptLog = { lastLot: null };
  let lastCollision: unknown = null;

  for (let attempt = 1; attempt <= BATCH_LOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction((tx) =>
        write(tx, async () => {
          const lot = await resolveLot(tx, batch, scope);
          attemptLog.lastLot = lot;
          return lot;
        }),
      );
    } catch (error) {
      if (!isDuplicateBatchLot(error)) translateBatchWriteError(error);
      if (batch.lot !== null) {
        // El diagnostico acaba en el log del servidor, nunca en el navegador.
        throw new BatchDuplicateLotError(`empresa ${companyId}, lote escrito a mano '${batch.lot}'`);
      }
      lastCollision = error;
    }
  }

  throw new Error(
    `no se pudo escribir un lote generado sin chocar con el indice unico (company_id, lot): empresa ${companyId}, ultimo lote intentado '${attemptLog.lastLot ?? '(sin resolver)'}', ${BATCH_LOT_MAX_ATTEMPTS} intentos`,
    { cause: lastCollision },
  );
}

/** Producto y lote en la misma transaccion: si el lote falla, el producto tampoco queda. */
export async function createWithFirstBatch(
  product: NewProduct,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ id: string; batchId: string }> {
  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    const created = await tx.product.create({
      data: {
        name: product.name,
        nameNormalized: normalizeProductName(product.name),
        stock: product.stock ?? null,
        qtyAlert: product.qtyAlert ?? null,
        ...companyScopeColumns(scope),
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    const lot = await resolveBatchLot();

    const createdBatch = await tx.productBatch.create({
      data: toBatchCreateData(created.id, batch, lot, now, scope),
      select: { id: true },
    });

    return { id: created.id, batchId: createdBatch.id };
  });
}

/** Con `productId` escalar y no como escritura anidada desde `product`, que dispararia el
 *  `@updatedAt` de `products`. */
export async function addBatchToAlive(
  productId: string,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ batchId: string } | null> {
  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    const alive = await tx.product.findFirst({
      where: { AND: [productCompanyScope(scope), { id: productId, deletedAt: null }] },
      select: { id: true },
    });
    if (alive === null) return null;

    // Despues de confirmar el producto: un alta que no va a escribir no pide lock.
    const lot = await resolveBatchLot();

    const createdBatch = await tx.productBatch.create({
      data: toBatchCreateData(alive.id, batch, lot, now, scope),
      select: { id: true },
    });

    return { batchId: createdBatch.id };
  });
}
