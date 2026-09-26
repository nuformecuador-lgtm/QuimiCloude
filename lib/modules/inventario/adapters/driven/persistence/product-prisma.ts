import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { compareQuantities } from '../../../domain/decimal-quantity';
import { BatchDuplicateLotError, BatchStockNegativeError, ValidationError } from '../../../domain/errors';
import { planFinishedGoods } from '../../../domain/finished-goods';
import { normalizeProductName } from '../../../domain/product-name';
import { netReservedQuantity } from '../../../domain/reservation-ledger';

import { writeMovement } from './batch-movement-prisma';
import {
  batchCompanyScope,
  companyScopeColumns,
  movementCompanyScope,
  presentationCompanyScope,
  productCompanyScope,
} from './company-scope';
import { findReservedAndAvailableByBatch, findReservedAndAvailableByProduct } from './reservation-prisma';
import {
  dateRangeCondition,
  normalizedSearchCondition,
  numberRangeCondition,
  selectCondition,
  textCondition,
  type NumberRangeCondition,
} from './list-query-sql';

import type { FinishedGoodsOutcome } from '../../../domain/finished-goods';
import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ListFilterValue, ListQuery, ListSort } from '../../../domain/list-query';
import type { MovementReason } from '../../../domain/movement-reason';
import type { Page } from '../../../domain/page';
import type { NewProductBatch } from '../../../domain/product-batch';
import type { ProductBatchView } from '../../../domain/product-batch-view';
import type { NewProduct, ProductView, ProductType } from '../../../domain/product-view';
import { PRODUCT_TYPES } from '../../../domain/product-type';
import { PRODUCT_TYPE_VALUES } from '../../../domain/product-queryable';

// El ambito de empresa va como conjuncion aparte en un `AND` de primer nivel, para que ninguna otra
// condicion del `where` pueda relajarlo. Una fila de otra empresa sale igual que una que no existe
// (`null`/`false`): distinguirlas seria un oraculo de existencia sobre filas ajenas.

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  imagePath: true,
  stock: true,
  unitId: true,
  qtyAlert: true,
  type: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

const ZERO_QUANTITY = '0.0000';

export function toProductView(row: ProductRow): ProductView {
  return {
    id: row.id,
    name: row.name,
    imagePath: row.imagePath,
    stock: row.stock.toFixed(4),
    unitId: row.unitId,
    qtyAlert: row.qtyAlert === null ? null : row.qtyAlert.toFixed(4),
    type: row.type as ProductType,
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
      qtyAlert: data.qtyAlert ?? null,
      type: data.type ?? PRODUCT_TYPES.PRODUCT,
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

type ProductTypeRow = { readonly type: ProductType };

/**
 * Bloquea la fila para decidir el tipo antes de escribir, sin dos consultas sueltas que dejen
 * hueco a una carrera: `FOR NO KEY UPDATE` retiene la fila hasta que la transaccion cierra.
 * Devuelve `false` sin fila viva de la empresa, `'type_locked'` si la edicion cambiaria el tipo
 * a o desde `FINISHED_PRODUCT`, y `true` tras escribir. El tipo en si nunca se escribe: la
 * edicion no lo cambia, ni para un producto terminado ni para ningun otro.
 */
export async function updateAliveProduct(
  id: string,
  data: NewProduct,
  now: Date,
  scope: InventoryScope,
): Promise<boolean | 'type_locked'> {
  const { companyId } = companyScopeColumns(scope);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ReadonlyArray<ProductTypeRow>>(Prisma.sql`
      SELECT "type"
        FROM "products"
       WHERE "id" = ${id}::uuid
         AND "company_id" = ${companyId}::uuid
         AND "deleted_at" IS NULL
         FOR NO KEY UPDATE
    `);
    const alive = rows[0];
    if (alive === undefined) return false;

    const requestedType = data.type ?? PRODUCT_TYPES.PRODUCT;
    const wasFinished = alive.type === PRODUCT_TYPES.FINISHED_PRODUCT;
    const staysFinished = requestedType === PRODUCT_TYPES.FINISHED_PRODUCT;
    if (wasFinished !== staysFinished) return 'type_locked';

    const { count } = await tx.product.updateMany({
      where: { id, companyId, deletedAt: null },
      data: {
        name: data.name,
        nameNormalized: normalizeProductName(data.name),
        qtyAlert: data.qtyAlert ?? null,
        updatedAt: now,
      },
    });
    return count === 1;
  });
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
      // Sin `nulls`: `products.stock` es `NOT NULL DEFAULT 0`, nunca vacia.
      return [{ stock: dir }, TIE_BREAKER];
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

/** Del rango generico del contrato al rango en `Prisma.Decimal`: `stock` y `qtyAlert` son
 *  columnas `Decimal(14,4)`, y compararlas contra un `number` de JavaScript perderia precision
 *  a partir de 2^53. Mismo patron que `toDecimalRange` de `pedidos/order-prisma.ts`. */
function toDecimalRange(condition: NumberRangeCondition): { gte?: Prisma.Decimal; lte?: Prisma.Decimal } {
  return {
    ...(condition.gte === undefined ? {} : { gte: new Prisma.Decimal(condition.gte) }),
    ...(condition.lte === undefined ? {} : { lte: new Prisma.Decimal(condition.lte) }),
  };
}

function productFilterWhere(
  field: string,
  value: ListFilterValue,
): Prisma.ProductWhereInput | null {
  switch (value.kind) {
    case 'select': {
      const condition = selectCondition(value.values);
      if (condition === null) return null;
      if (field === 'type') {
        const validValues = value.values.filter((v) => PRODUCT_TYPE_VALUES.includes(v as ProductType)) as ProductType[];
        if (validValues.length === 0) return null;
        return { type: { in: validValues } };
      }
      return null;
    }
    case 'numberRange': {
      const condition = numberRangeCondition(value.min, value.max);
      if (condition === null) return null;
      if (field === 'stock') return { stock: toDecimalRange(condition) };
      if (field === 'qtyAlert') return { qtyAlert: toDecimalRange(condition) };
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

  // UNA consulta agregada mas para la pagina entera, nunca una por fila: `reserved`/`available`
  // salen del libro de reservas, sumados por producto.
  const reservedByProduct = await findReservedAndAvailableByProduct(
    prisma,
    scope.companyId,
    rows.map((row) => row.id),
  );
  const items = rows.map((row) => {
    const aggregate = reservedByProduct.get(row.id);
    return { ...toProductView(row), reserved: aggregate?.reserved ?? ZERO_QUANTITY, available: aggregate?.available ?? ZERO_QUANTITY };
  });

  return buildPage(items, total, query.page, limit);
}

/**
 * La unidad no llega de quien llama: se lee de la presentacion, con su propio ambito de
 * empresa. Sin esa fila -no existe o es de otra empresa- no hay unidad que buscar y se
 * devuelve `null` (el alta seguira por crear y fallara alli). Con `created_at` empatado decide
 * el `id`: sin el, dos altas del mismo nombre y unidad podrian colgar su lote de productos
 * distintos.
 *
 * `presentationId === null` (solo MACHINE, 2026-09-23): no hay unidad; se busca el vivo
 * con el mismo nombre y `unit_id` NULL.
 */
export async function findAliveIdByNameInPresentationUnit(
  name: string,
  presentationId: string | null,
  scope: InventoryScope,
): Promise<{ id: string; type: ProductType } | null> {
  let unitId: string | null | undefined;

  if (presentationId === null) {
    unitId = null;
  } else {
    const presentation = await prisma.presentation.findFirst({
      where: { AND: [presentationCompanyScope(scope), { id: presentationId }] },
      select: { unitId: true },
    });
    if (presentation === null) return null;
    unitId = presentation.unitId;
  }

  const row = await prisma.product.findFirst({
    where: {
      AND: [
        productCompanyScope(scope),
        {
          nameNormalized: normalizeProductName(name),
          unitId,
          deletedAt: null,
        },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true },
  });
  return row === null ? null : { id: row.id, type: row.type as ProductType };
}

/**
 * Suma los lotes vivos-de-empresa del producto y escribe `products.stock`. No toca
 * `product_batches`: quien la llama ya escribio el lote (o el ajuste) y su asiento antes de
 * invocarla, en la MISMA transaccion. Exportada para el consumo del pedido.
 *
 * La suma la hace Postgres en `numeric`, sobre las filas de la MISMA empresa: pasar por
 * JavaScript convertiria cada `Decimal` a un tipo intermedio antes de sumar y perderia
 * precision. Que los lotes sumados compartan unidad ya lo garantiza el disparador
 * `product_batches_check_unit`, asi que este `UPDATE` no necesita comprobarlo.
 *
 * El `UPDATE` es SQL crudo -y no `updateMany`- para no disparar el `@updatedAt` de Prisma: el
 * recalculo no debe mover `products.updated_at`.
 */
export async function recalculateProductStock(
  tx: Prisma.TransactionClient,
  productId: string,
  scope: InventoryScope,
): Promise<void> {
  const { companyId } = companyScopeColumns(scope);

  await tx.$executeRaw(Prisma.sql`
    UPDATE "products"
       SET "stock" = COALESCE((
             SELECT sum("stock")
               FROM "product_batches"
              WHERE "product_id" = ${productId}::uuid
                AND "company_id" = ${companyId}::uuid
           ), 0)
     WHERE "id" = ${productId}::uuid
       AND "company_id" = ${companyId}::uuid
  `);
}

/** Del texto directo a `Prisma.Decimal`: pasar por un numero del lenguaje meteria el error de la
 *  coma flotante antes de una columna `DECIMAL(14,4)`. `null` solo llega de MACHINE sin costo. */
function toBatchUnitCost(unitCost: string | null): Prisma.Decimal | null {
  return unitCost === null ? null : new Prisma.Decimal(unitCost);
}

/** `'5.0000'` -> `'-5.0000'`: la salida del consumo se guarda en negativo, como la resta de un
 *  ajuste. `quantity` llega siempre positiva -es lo que se decremento-, asi que basta anteponer
 *  el signo. */
function negateQuantity(quantity: string): string {
  return quantity.startsWith('-') ? quantity.slice(1) : `-${quantity}`;
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

/** El texto del error, incluido lo que trae `meta.message`, donde Postgres deja el nombre de la
 *  restriccion violada. */
function violationMessageOf(error: unknown): string {
  const meta: unknown = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : null;
  const detalle =
    typeof meta === 'object' && meta !== null && 'message' in meta
      ? String((meta as { message: unknown }).message)
      : '';
  const bruto = error instanceof Error ? error.message : '';
  return `${detalle}\n${bruto}`;
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
  return BATCH_COMPANY_SCOPE_VIOLATIONS.some((nombre) => violationMessageOf(error).includes(nombre));
}

const BATCH_STOCK_NON_NEGATIVE_CONSTRAINT = 'product_batches_stock_non_negative';

/** Mismo criterio que `isBatchCompanyScopeViolation`: `23514` mas el nombre de la restriccion. */
function isBatchStockNegativeViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  return violationMessageOf(error).includes(BATCH_STOCK_NON_NEGATIVE_CONSTRAINT);
}

const BATCH_UNIT_MISMATCH_TRIGGER = 'product_batches_unit_differs_from_product';

/** Disparador de `product_batches_check_unit`: mismo criterio, `23514` mas el nombre. Solo puede
 *  llegar por la aplicacion en carrera con un cambio de unidad de la presentacion. */
function isBatchUnitMismatchViolation(error: unknown): boolean {
  if (sqlStateOf(error) !== '23514') return false;
  return violationMessageOf(error).includes(BATCH_UNIT_MISMATCH_TRIGGER);
}

/** Lo que no se sabe traducir se relanza: un CHECK violado o una caida de conexion no son entrada
 *  invalida. */
function translateBatchWriteError(error: unknown): never {
  if (isBatchForeignKeyViolation(error)) throw new ValidationError();
  if (isBatchCompanyScopeViolation(error)) throw new ValidationError();
  if (isBatchUnitMismatchViolation(error)) throw new ValidationError();
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

/**
 * Producto y lote en la misma transaccion: si el lote falla, el producto tampoco queda. El
 * producto nace con la unidad de esta presentacion -sin fila viva de la empresa, se aborta con
 * `ValidationError` antes de escribir nada- y su existencia queda recalculada al final.
 * `batch.presentationId === null` (MACHINE): el producto nace sin unidad y el lote sin
 * presentacion.
 */
export async function createWithFirstBatch(
  product: NewProduct,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ id: string; batchId: string; lot: string }> {
  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    let unitId: string | null = null;
    if (batch.presentationId !== null) {
      const presentation = await tx.presentation.findFirst({
        where: { AND: [presentationCompanyScope(scope), { id: batch.presentationId }] },
        select: { unitId: true },
      });
      if (presentation === null) throw new ValidationError();
      unitId = presentation.unitId;
    }

    const created = await tx.product.create({
      data: {
        name: product.name,
        nameNormalized: normalizeProductName(product.name),
        unitId,
        qtyAlert: product.qtyAlert ?? null,
        type: product.type ?? PRODUCT_TYPES.PRODUCT,
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

    await writeMovement(
      tx,
      {
        batchId: createdBatch.id,
        kind: 'opening',
        quantity: batch.stock,
        reason: null,
        orderId: null,
        createdBy: batch.createdBy,
      },
      now,
      scope,
    );

    await recalculateProductStock(tx, created.id, scope);

    return { id: created.id, batchId: createdBatch.id, lot };
  });
}

type AliveProductRow = { readonly id: string; readonly type: string };

/** Con `productId` escalar y no como escritura anidada desde `product`, que dispararia el
 *  `@updatedAt` de `products`. */
export async function addBatchToAlive(
  productId: string,
  batch: NewProductBatch,
  now: Date,
  scope: InventoryScope,
): Promise<{ batchId: string; lot: string } | null | 'finished_product'> {
  const { companyId } = companyScopeColumns(scope);

  return writeBatchWithLotRetry(batch, scope, async (tx, resolveBatchLot) => {
    // El borrado logico toma este mismo lock sobre la fila, asi que uno espera al otro. En READ
    // COMMITTED, el SELECT que espera vuelve a evaluar el WHERE y ya no ve la fila borrada.
    const rows = await tx.$queryRaw<ReadonlyArray<AliveProductRow>>(Prisma.sql`
      SELECT "id", "type"
        FROM "products"
       WHERE "id" = ${productId}::uuid
         AND "company_id" = ${companyId}::uuid
         AND "deleted_at" IS NULL
         FOR NO KEY UPDATE
    `);
    const alive = rows[0];
    if (alive === undefined) return null;

    // Bajo la misma fila bloqueada, cierra la carrera con un alta manual que naciera
    // terminado despues de que `findAliveIdByNameInPresentationUnit` ya lo hubiera leido.
    if (alive.type === PRODUCT_TYPES.FINISHED_PRODUCT) return 'finished_product';

    // Despues de la fila: un alta que no va a escribir no pide el lock de aviso. Y con la fila ya
    // tomada arriba, esta funcion pide siempre los dos locks en ese orden: fila y luego aviso.
    const lot = await resolveBatchLot();

    const createdBatch = await tx.productBatch.create({
      data: toBatchCreateData(alive.id, batch, lot, now, scope),
      select: { id: true },
    });

    await writeMovement(
      tx,
      {
        batchId: createdBatch.id,
        kind: 'opening',
        quantity: batch.stock,
        reason: null,
        orderId: null,
        createdBy: batch.createdBy,
      },
      now,
      scope,
    );

    await recalculateProductStock(tx, alive.id, scope);

    return { batchId: createdBatch.id, lot };
  });
}

const BATCH_VIEW_SELECT = {
  id: true,
  lot: true,
  stock: true,
  purchaseDate: true,
  expiryDate: true,
  packageContent: true,
  presentation: { select: { unitId: true } },
} satisfies Prisma.ProductBatchSelect;

type BatchViewRow = Prisma.ProductBatchGetPayload<{ select: typeof BATCH_VIEW_SELECT }>;

/** Fecha civil, sin hora: la columna es `@db.Date` y las tres cifras del ISO bastan. */
function toCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toBatchView(row: BatchViewRow): ProductBatchView {
  return {
    id: row.id,
    lot: row.lot,
    stock: row.stock.toFixed(4),
    unitId: row.presentation?.unitId ?? null,
    purchaseDate: toCivilDate(row.purchaseDate),
    expiryDate: row.expiryDate === null ? null : toCivilDate(row.expiryDate),
    packageContent: row.packageContent === null ? null : row.packageContent.toFixed(4),
  };
}

/** Todos los lotes del producto, siempre que el producto siga vivo: un producto borrado o ajeno
 *  devuelve un array vacio, no una excepcion. */
export async function findBatchesOfAliveProduct(
  productId: string,
  scope: InventoryScope,
): Promise<readonly ProductBatchView[]> {
  const rows = await prisma.productBatch.findMany({
    where: {
      AND: [batchCompanyScope(scope), { productId, product: { deletedAt: null } }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: BATCH_VIEW_SELECT,
  });

  // UNA consulta agregada para todos los lotes del producto, no una por lote.
  const reservedByBatch = await findReservedAndAvailableByBatch(
    prisma,
    scope.companyId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const aggregate = reservedByBatch.get(row.id);
    return {
      ...toBatchView(row),
      reserved: aggregate?.reserved ?? ZERO_QUANTITY,
      available: aggregate?.available ?? row.stock.toFixed(4),
      overReserved: aggregate?.overReserved ?? false,
    };
  });
}

/** `P2025`: el `where` unico mas el filtro de empresa no encontraron fila que actualizar. */
function isBatchNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

type AdjustProductRow = { readonly id: string; readonly type: string };

/**
 * `stock: { increment: delta } }` es un `UPDATE ... SET stock = stock + $delta` relativo: dos
 * ajustes concurrentes suman sobre lo que la base tenga en ese instante, nunca sobre un total
 * leido antes. `productBatch.update` es la UNICA funcion del repositorio que escribe sobre una
 * fila de lote ya existente -el `where` combina el identificador unico con la empresa, y sin fila
 * que lo cumpla Prisma lanza `P2025` en vez de tocar una fila ajena-. El asiento y el recalculo
 * de `products.stock` quedan en la MISMA transaccion que el ajuste.
 *
 * El bloqueo del PRODUCTO va primero -mismo orden que `addBatchToAlive`-, para que dos ajustes
 * sobre lotes distintos del mismo producto se serialicen ahi en vez de abrazarse con un camino
 * futuro que tambien parta del producto. Sin fila que bloquear -lote inexistente o de otra
 * empresa- se devuelve `null` sin llegar a `productBatch.update`.
 */
export async function adjustBatchStock(
  batchId: string,
  delta: string,
  reason: MovementReason,
  actorId: string,
  now: Date,
  scope: InventoryScope,
): Promise<{ stock: string; reserved: string; overReserved: boolean } | null | 'increase_not_allowed'> {
  const { companyId } = companyScopeColumns(scope);

  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ReadonlyArray<AdjustProductRow>>(Prisma.sql`
        SELECT p."id", p."type"
          FROM "products" p
          JOIN "product_batches" b ON b."product_id" = p."id"
         WHERE b."id" = ${batchId}::uuid
           AND b."company_id" = ${companyId}::uuid
         FOR NO KEY UPDATE OF p
      `);
      const product = rows[0];
      if (product === undefined) return null;

      // Un ajuste que suma sobre un producto terminado se rechaza aqui, con la fila ya
      // bloqueada, antes de tocar el lote o el libro.
      if (product.type === PRODUCT_TYPES.FINISHED_PRODUCT && compareQuantities(delta, '0') > 0) {
        return 'increase_not_allowed';
      }

      const updated = await tx.productBatch.update({
        where: { id: batchId, companyId },
        data: { stock: { increment: new Prisma.Decimal(delta) }, updatedBy: actorId, updatedAt: now },
        select: { stock: true },
      });

      await writeMovement(
        tx,
        { batchId, kind: 'adjustment', quantity: delta, reason, orderId: null, createdBy: actorId },
        now,
        scope,
      );

      await recalculateProductStock(tx, product.id, scope);

      // El apartado no lo escribe este archivo -es un libro aparte, `reservation_movements`,
      // dueno de `reservation-prisma.ts`-, pero un ajuste tiene que poder decir si deja el lote
      // sobre-reservado, y las dos tablas estan en la misma transaccion.
      const reservationRows = await tx.reservationMovement.findMany({
        where: { companyId, batchId },
        select: { kind: true, quantity: true },
      });
      const reserved = netReservedQuantity(
        reservationRows.map((row) => ({ kind: row.kind, quantity: row.quantity.toFixed(4) })),
      );
      const stock = updated.stock.toFixed(4);

      return { stock, reserved, overReserved: compareQuantities(reserved, stock) > 0 };
    });
  } catch (error) {
    if (isBatchNotFound(error)) return null;
    if (isBatchStockNegativeViolation(error)) throw new BatchStockNegativeError();
    throw error;
  }
}

/**
 * El decremento CONDICIONAL del consumo al entregar: `stock >= quantity` va
 * en el `WHERE`, asi que dos escrituras concurrentes nunca dejan el lote negativo aunque las dos
 * pasen el mismo bloqueo de producto. `count === 0` no dice POR QUE fallo -lote de otra empresa,
 * inexistente o con menos de lo pedido-, y con el producto ya bloqueado por quien llama la unica
 * causa posible es la merma: por eso se resuelve leyendo el `stock` actual, sin lanzar.
 *
 * Como `adjustBatchStock`, asienta en la MISMA transaccion con `kind: 'consumption'`, cantidad EN
 * NEGATIVO -es una salida- y el pedido que la causa. No recalcula `products.stock`: con varios
 * lotes de un mismo producto consumidos en la misma entrega, recalcular una vez por producto (en
 * `consumeForOrder`) evita sumar la misma tabla varias veces por nada.
 */
export async function consumeBatchStock(
  tx: Prisma.TransactionClient,
  input: { readonly batchId: string; readonly quantity: string; readonly orderId: string; readonly actorId: string },
  now: Date,
  scope: InventoryScope,
): Promise<{ kind: 'consumed'; stock: string } | { kind: 'insufficient'; available: string }> {
  const { companyId } = companyScopeColumns(scope);
  const decimalQuantity = new Prisma.Decimal(input.quantity);

  const { count } = await tx.productBatch.updateMany({
    where: { id: input.batchId, companyId, stock: { gte: decimalQuantity } },
    data: { stock: { decrement: decimalQuantity }, updatedBy: input.actorId, updatedAt: now },
  });

  if (count === 0) {
    const current = await tx.productBatch.findFirst({
      where: { id: input.batchId, companyId },
      select: { stock: true },
    });
    return { kind: 'insufficient', available: current === null ? '0.0000' : current.stock.toFixed(4) };
  }

  await writeMovement(
    tx,
    {
      batchId: input.batchId,
      kind: 'consumption',
      quantity: negateQuantity(input.quantity),
      reason: null,
      orderId: input.orderId,
      createdBy: input.actorId,
    },
    now,
    scope,
  );

  const updated = await tx.productBatch.findFirst({
    where: { id: input.batchId, companyId },
    select: { stock: true },
  });
  return { kind: 'consumed', stock: (updated?.stock ?? new Prisma.Decimal(0)).toFixed(4) };
}

type PresentationForShareRow = { readonly name: string; readonly unitId: string; readonly content: string | null };

/**
 * La entrada de un lote de produccion al Finalizar un pedido: presentacion `FOR SHARE`,
 * producto terminado (nace si falta, `ON CONFLICT ... DO NOTHING` sobre el indice parcial de
 * la combinacion), lote, asiento `production` y recalculo, todo sobre la MISMA transaccion que
 * el resto del Finalizar -no abre la suya, a diferencia de `createWithFirstBatch`-.
 */
export async function receiveFinishedGoods(
  tx: Prisma.TransactionClient,
  input: {
    readonly orderId: string;
    readonly recipeId: string;
    readonly recipeName: string;
    readonly presentationId: string;
    readonly orderQuantity: string;
    readonly orderContent: string | null;
    readonly lotCost: string;
    readonly actorId: string;
    readonly now: Date;
  },
  scope: InventoryScope,
): Promise<FinishedGoodsOutcome> {
  const { companyId } = companyScopeColumns(scope);

  const presentationRows = await tx.$queryRaw<ReadonlyArray<PresentationForShareRow>>(Prisma.sql`
    SELECT "name", "unit_id" AS "unitId", "content"::text AS "content"
      FROM "presentations"
     WHERE "id" = ${input.presentationId}::uuid
       AND "company_id" = ${companyId}::uuid
       FOR SHARE
  `);
  const presentation = presentationRows[0];
  if (presentation === undefined) return { kind: 'presentation_without_content' };

  const content = input.orderContent ?? presentation.content;
  if (content === null) return { kind: 'presentation_without_content' };

  const plan = planFinishedGoods({ orderQuantity: input.orderQuantity, content, lotCost: input.lotCost });
  if (plan.kind === 'no_content') return { kind: 'presentation_without_content' };
  if (plan.kind === 'no_whole_package') return { kind: 'no_whole_package' };

  const name = `${input.recipeName} · ${presentation.name}`;
  // El arbitro de `ON CONFLICT ... WHERE` lo resuelve Postgres en el analisis de la sentencia,
  // antes de que un parametro tenga valor: esa clausula necesita el texto tal cual, no un bind.
  const finishedProductTypeSql = Prisma.raw(`'${PRODUCT_TYPES.FINISHED_PRODUCT}'`);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "products"
      ("name", "name_normalized", "type", "unit_id", "company_id", "recipe_id", "presentation_id", "created_at", "updated_at")
    VALUES
      (${name}, ${normalizeProductName(name)}, ${PRODUCT_TYPES.FINISHED_PRODUCT}::"ProductType", ${presentation.unitId}::uuid, ${companyId}::uuid,
       ${input.recipeId}::uuid, ${input.presentationId}::uuid, ${input.now}, ${input.now})
    ON CONFLICT (company_id, recipe_id, presentation_id) WHERE type = ${finishedProductTypeSql} AND deleted_at IS NULL
    DO NOTHING
  `);

  const productRows = await tx.$queryRaw<ReadonlyArray<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name"
      FROM "products"
     WHERE "company_id" = ${companyId}::uuid
       AND "recipe_id" = ${input.recipeId}::uuid
       AND "presentation_id" = ${input.presentationId}::uuid
       AND "type" = ${PRODUCT_TYPES.FINISHED_PRODUCT}::"ProductType"
       AND "deleted_at" IS NULL
       FOR NO KEY UPDATE
  `);
  const product = productRows[0];
  if (product === undefined) {
    throw new Error('receiveFinishedGoods: el producto terminado no aparecio tras el INSERT ON CONFLICT');
  }

  const batch: NewProductBatch = {
    presentationId: input.presentationId,
    stock: plan.quantity,
    unitCost: plan.unitCost,
    lot: null,
    purchaseDate: toCivilDate(input.now),
    expiryDate: null,
    createdBy: input.actorId,
  };
  const lot = await resolveLot(tx, batch, scope);

  const createdBatch = await tx.productBatch.create({
    data: {
      ...toBatchCreateData(product.id, batch, lot, input.now, scope),
      packageContent: new Prisma.Decimal(plan.content),
    },
    select: { id: true },
  });

  await writeMovement(
    tx,
    {
      batchId: createdBatch.id,
      kind: 'production',
      quantity: plan.quantity,
      reason: null,
      orderId: input.orderId,
      createdBy: input.actorId,
    },
    input.now,
    scope,
  );

  await recalculateProductStock(tx, product.id, scope);

  return { kind: 'received', productId: product.id, productName: product.name, packages: plan.packages };
}

/** `quantity / packageContent`, como entero: `receiveFinishedGoods` siempre escribe la cantidad
 *  del asiento `production` como un multiplo exacto del contenido del lote (`planFinishedGoods`),
 *  asi que la division nunca deja resto. */
function packagesFromReceipt(quantity: Prisma.Decimal, packageContent: Prisma.Decimal): string {
  const scaledQuantity = BigInt(quantity.toFixed(4).replace('.', ''));
  const scaledContent = BigInt(packageContent.toFixed(4).replace('.', ''));
  return (scaledQuantity / scaledContent).toString();
}

/**
 * La consulta real. Vive aparte de `findFinishedGoodsReceipts` por el mismo motivo que
 * `findAliveProducts`: declara el `scope` como `InventoryScope` y lo lleva hasta
 * `movementCompanyScope`, el punto unico del modulo.
 */
async function findProductionMovements(
  orderIds: readonly string[],
  scope: InventoryScope,
): Promise<
  readonly { readonly orderId: string | null; readonly quantity: Prisma.Decimal; readonly batch: { readonly packageContent: Prisma.Decimal | null } }[]
> {
  return prisma.inventoryMovement.findMany({
    where: {
      AND: [movementCompanyScope(scope), { kind: 'production', orderId: { in: [...orderIds] } }],
    },
    select: { orderId: true, quantity: true, batch: { select: { packageContent: true } } },
  });
}

/**
 * Implementa `ProductCatalog['findFinishedGoodsReceipts']`: los envases que de verdad entraron
 * por cada pedido, leidos del asiento `production` -uno por pedido, porque el Finalizar solo se
 * escribe una vez- y divididos por el contenido guardado en su lote. Un `orderId` sin ese
 * asiento, con lote sin contenido de envase, o de otra empresa, simplemente no aparece en la
 * respuesta: quien compone la fila del pedido trata la ausencia como `packages: null`.
 *
 * No exige `inventario.consultar`: quien llama ya autorizo con su propio permiso. Por eso NO es
 * un caso de uso de `inventario`, sino una lectura directa que `asignaciones` compone dentro de
 * la suya.
 */
export async function findFinishedGoodsReceipts(
  orderIds: readonly string[],
  companyId: string,
): Promise<readonly { orderId: string; packages: string }[]> {
  if (orderIds.length === 0) return [];

  const rows = await findProductionMovements(orderIds, { companyId });

  return rows
    .filter(
      (row): row is typeof row & { orderId: string; batch: { packageContent: Prisma.Decimal } } =>
        row.orderId !== null && row.batch.packageContent !== null,
    )
    .map((row) => ({ orderId: row.orderId, packages: packagesFromReceipt(row.quantity, row.batch.packageContent) }));
}
