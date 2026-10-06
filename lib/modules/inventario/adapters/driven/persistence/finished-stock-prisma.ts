import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import { normalizeProductName } from '../../../domain/product-name';
import { PRODUCT_TYPES } from '../../../domain/product-type';

import { companyScopeColumns } from './company-scope';
import { toProductView } from './product-prisma';

import type { FinishedStockBatch, FinishedStockGroup } from '../../../domain/finished-stock';
import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ListQuery } from '../../../domain/list-query';
import type { Page } from '../../../domain/page';
import type { ProductView, ProductType } from '../../../domain/product-view';

// EXCEPCION APROBADA (2026-10-04, humano + leader) a «cada modulo solo lee sus tablas»: este
// listado hace JOIN en SQL a `orders` y `recipes` -y a `order_presentation_lines`, por el tope
// de envases de cada lote-, que son de `pedidos` y `recetas`. Paginar, ordenar por el numero de
// pedido y buscar por numero o por receta en la base no se puede hacer a traves de sus puertos
// sin traer el conjunto entero a memoria. Vale SOLO para `listStockGroups`; ninguna otra
// consulta de este modulo puede leer esas tablas, y aqui solo se leen, nunca se escriben.

/** Ancho minimo del correlativo en el numero visible; si se pasa, crece en vez de truncarse. */
const ORDER_SEQUENCE_WIDTH = 7;

type GroupRow = {
  readonly orderId: string | null;
  readonly legacyProductId: string | null;
  readonly orderYear: number | null;
  readonly orderSequence: number | null;
  readonly recipeName: string | null;
};

type DetailRow = {
  readonly productId: string;
  readonly stock: Prisma.Decimal;
  readonly packageContent: Prisma.Decimal | null;
  readonly presentationName: string | null;
  readonly presentationUnitId: string | null;
  readonly orderId: string | null;
  readonly orderedPackages: number | null;
  readonly name: string;
  readonly imagePath: string | null;
  readonly productStock: Prisma.Decimal;
  readonly unitId: string | null;
  readonly qtyAlert: Prisma.Decimal | null;
  readonly type: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly fixedPresentationId: string | null;
  readonly fixedPresentationName: string | null;
  readonly fixedPresentationContent: Prisma.Decimal | null;
  readonly fixedPresentationUnitId: string | null;
};

/** El asiento `production` del lote. Terminar escribe uno por lote; `LIMIT 1` impide que un
 *  segundo duplicara el lote en la suma. */
function productionOf(companyId: string, columns: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT ${columns}
        FROM "inventory_movements" im
       WHERE im."batch_id" = b."id"
         AND im."company_id" = ${companyId}::uuid
         AND im."kind" = 'production'::"InventoryMovementKind"
       ORDER BY im."created_at", im."id"
       LIMIT 1
    ) m ON TRUE`;
}

function finishedBatchesWhere(companyId: string): Prisma.Sql {
  return Prisma.sql`
    b."company_id" = ${companyId}::uuid
    AND p."company_id" = ${companyId}::uuid
    AND p."deleted_at" IS NULL
    AND p."type" = ${PRODUCT_TYPES.FINISHED_PRODUCT}::"ProductType"`;
}

/**
 * El numero visible compuesto en SQL para poder buscar sobre el en la base. Mismo formato que
 * `formatOrderNumber` de `pedidos` (ano, guion, correlativo a siete cifras); el test de
 * integracion lo compara contra esa funcion.
 */
const ORDER_NUMBER_TEXT = Prisma.sql`(o."order_year"::text || '-' || lpad(o."order_sequence"::text, GREATEST(${Prisma.raw(String(ORDER_SEQUENCE_WIDTH))}, length(o."order_sequence"::text)), '0'))`;

function searchCondition(search: string): Prisma.Sql {
  const normalized = normalizeProductName(search);
  const byNumber = search === '' ? Prisma.sql`FALSE` : Prisma.sql`strpos(${ORDER_NUMBER_TEXT}, ${search}) > 0`;
  if (normalized === '') return search === '' ? Prisma.sql`TRUE` : byNumber;
  return Prisma.sql`(
    ${byNumber}
    OR strpos(r."name_normalized", ${normalized}) > 0
    OR strpos(lp."name_normalized", ${normalized}) > 0
  )`;
}

/** Filas visibles: un grupo por pedido y uno por producto con lotes sin pedido, con stock > 0. */
function listedGroups(companyId: string, search: string): Prisma.Sql {
  return Prisma.sql`
    WITH finished_batches AS (
      SELECT b."product_id", b."stock", m."order_id"
        FROM "product_batches" b
        JOIN "products" p ON p."id" = b."product_id"
        ${productionOf(companyId, Prisma.sql`im."order_id"`)}
       WHERE ${finishedBatchesWhere(companyId)}
    ),
    stock_groups AS (
      SELECT fb."order_id",
             CASE WHEN fb."order_id" IS NULL THEN fb."product_id" END AS "legacy_product_id"
        FROM finished_batches fb
       GROUP BY 1, 2
      HAVING SUM(fb."stock") > 0
    )
    SELECT g."order_id" AS "orderId",
           g."legacy_product_id" AS "legacyProductId",
           o."order_year" AS "orderYear",
           o."order_sequence" AS "orderSequence",
           r."name" AS "recipeName",
           lp."name" AS "legacyName"
      FROM stock_groups g
      LEFT JOIN "orders" o ON o."id" = g."order_id" AND o."company_id" = ${companyId}::uuid
      LEFT JOIN "recipes" r ON r."id" = o."recipe_id" AND r."company_id" = ${companyId}::uuid
      LEFT JOIN "products" lp ON lp."id" = g."legacy_product_id" AND lp."company_id" = ${companyId}::uuid
     WHERE ${searchCondition(search)}`;
}

async function findGroupPage(
  query: ListQuery,
  scope: InventoryScope,
  offset: number,
  limit: number,
): Promise<{ readonly rows: readonly GroupRow[]; readonly total: number }> {
  const { companyId } = companyScopeColumns(scope);
  const listed = listedGroups(companyId, query.search);

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      SELECT "orderId", "legacyProductId", "orderYear", "orderSequence", "recipeName"
        FROM (${listed}) listed
       ORDER BY ("orderId" IS NULL),
                "orderYear" DESC NULLS LAST,
                "orderSequence" DESC NULLS LAST,
                "orderId",
                "legacyName",
                "legacyProductId"
      OFFSET ${offset}
       LIMIT ${limit}
    `),
    prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT count(*)::int AS "total" FROM (${listed}) listed
    `),
  ]);
  return { rows, total: counted[0]?.total ?? 0 };
}

/** Todos los lotes -tambien los agotados- de los pedidos y productos sin pedido de la pagina. */
async function findGroupDetails(
  orderIds: readonly string[],
  legacyProductIds: readonly string[],
  scope: InventoryScope,
): Promise<readonly DetailRow[]> {
  if (orderIds.length === 0 && legacyProductIds.length === 0) return [];
  const { companyId } = companyScopeColumns(scope);

  return prisma.$queryRaw<DetailRow[]>(Prisma.sql`
    SELECT b."product_id" AS "productId",
           b."stock",
           b."package_content" AS "packageContent",
           pr."name" AS "presentationName",
           pr."unit_id" AS "presentationUnitId",
           m."order_id" AS "orderId",
           opl."packages" AS "orderedPackages",
           p."name",
           p."image_path" AS "imagePath",
           p."stock" AS "productStock",
           p."unit_id" AS "unitId",
           p."qty_alert" AS "qtyAlert",
           p."type"::text AS "type",
           p."created_at" AS "createdAt",
           p."updated_at" AS "updatedAt",
           fp."id" AS "fixedPresentationId",
           fp."name" AS "fixedPresentationName",
           fp."content" AS "fixedPresentationContent",
           fp."unit_id" AS "fixedPresentationUnitId"
      FROM "product_batches" b
      JOIN "products" p ON p."id" = b."product_id"
      LEFT JOIN "presentations" pr ON pr."id" = b."presentation_id" AND pr."company_id" = ${companyId}::uuid
      LEFT JOIN "presentations" fp ON fp."id" = p."presentation_id" AND fp."company_id" = ${companyId}::uuid
      ${productionOf(companyId, Prisma.sql`im."order_id", im."order_presentation_line_id"`)}
      LEFT JOIN "order_presentation_lines" opl
             ON opl."id" = m."order_presentation_line_id" AND opl."company_id" = ${companyId}::uuid
     WHERE ${finishedBatchesWhere(companyId)}
       AND (m."order_id" = ANY(${[...orderIds]}::uuid[])
            OR (m."order_id" IS NULL AND b."product_id" = ANY(${[...legacyProductIds]}::uuid[])))
     ORDER BY b."created_at", b."id"
  `);
}

function toProduct(row: DetailRow): ProductView {
  return {
    ...toProductView({
      id: row.productId,
      name: row.name,
      imagePath: row.imagePath,
      stock: row.productStock,
      unitId: row.unitId,
      qtyAlert: row.qtyAlert,
      type: row.type as ProductType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
    presentationId: row.fixedPresentationId,
    presentationName: row.fixedPresentationName,
    presentationContent: row.fixedPresentationContent === null ? null : row.fixedPresentationContent.toFixed(4),
    presentationUnitId: row.fixedPresentationUnitId,
  };
}

function toBatch(row: DetailRow): FinishedStockBatch {
  return {
    productId: row.productId,
    stock: row.stock.toFixed(4),
    packageContent: row.packageContent === null ? null : row.packageContent.toFixed(4),
    orderedPackages: row.orderedPackages,
    presentationName: row.presentationName,
    presentationUnitId: row.presentationUnitId,
  };
}

function productsOf(rows: readonly DetailRow[]): readonly ProductView[] {
  const byId = new Map<string, ProductView>();
  for (const row of rows) if (!byId.has(row.productId)) byId.set(row.productId, toProduct(row));
  return [...byId.values()];
}

function toGroup(group: GroupRow, details: readonly DetailRow[]): FinishedStockGroup | null {
  if (group.orderId !== null) {
    const rows = details.filter((row) => row.orderId === group.orderId);
    if (group.orderYear === null || group.orderSequence === null) return null;
    return {
      kind: 'order',
      orderId: group.orderId,
      orderNumber: { year: Number(group.orderYear), sequence: Number(group.orderSequence) },
      recipeName: group.recipeName,
      products: productsOf(rows),
      batches: rows.map(toBatch),
    };
  }
  const rows = details.filter((row) => row.orderId === null && row.productId === group.legacyProductId);
  const product = productsOf(rows)[0];
  if (product === undefined) return null;
  return { kind: 'withoutOrder', product, batches: rows.map(toBatch) };
}

/**
 * Dos consultas para la pagina -los grupos con su total, y despues todos los lotes de esos
 * grupos con sus productos-, nunca una por fila. Un grupo que desaparece entre las dos (un
 * producto dado de baja en medio) se omite de la pagina sin corregir el total.
 */
export async function listStockGroups(
  query: ListQuery,
  scope: InventoryScope,
): Promise<Page<FinishedStockGroup>> {
  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const { rows, total } = await findGroupPage(query, scope, offset, limit);

  const details = await findGroupDetails(
    rows.flatMap((row) => (row.orderId === null ? [] : [row.orderId])),
    rows.flatMap((row) => (row.legacyProductId === null ? [] : [row.legacyProductId])),
    scope,
  );

  const items = rows
    .map((row) => toGroup(row, details))
    .filter((group): group is FinishedStockGroup => group !== null);
  return buildPage(items, total, query.page, limit);
}
