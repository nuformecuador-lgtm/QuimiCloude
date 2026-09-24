import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import { normalizeSupplierName } from '../../../domain/supplier-name';

import type { CatalogLineFields } from '../../../domain/catalog-line-view';
import type { SupplierScope } from '../../../domain/supplier-scope';

import { catalogLineCompanyScope, companyScopeColumns, supplierCompanyScope } from './company-scope';

/**
 * Implementa `SupplierCatalogImportRepository` con Prisma. Junto con
 * `supplier-catalog-line-prisma.ts` es de los pocos archivos del modulo que importan
 * `@prisma/client` y `@/lib/shared/db/prisma`; las dos comparten tabla pero no puerto, y por
 * eso no comparten codigo de escritura -solo la lectura del proveedor vivo, que se repite
 * aqui a proposito en vez de exportarla del otro adaptador, para que el puerto viejo quede
 * intacto.
 */

/**
 * ¿Hay un proveedor VIVO **de esa empresa** con ese id? Misma consulta que el adaptador del
 * catalogo de siempre, repetida a proposito: los dos adaptadores implementan puertos
 * distintos y ninguno exporta funciones internas al otro.
 */
async function isSupplierAlive(supplierId: string, scope: SupplierScope): Promise<boolean> {
  const row = await prisma.supplier.findFirst({
    where: { id: supplierId, deletedAt: null, ...supplierCompanyScope(scope) },
    select: { id: true },
  });
  return row !== null;
}

type AliveByIdentityRow = {
  readonly id: string;
  readonly nameNormalized: string;
  readonly presentationId: string;
  readonly cost: Prisma.Decimal;
};

type AliveByIdentityLine = {
  readonly id: string;
  readonly nameNormalized: string;
  readonly presentationId: string;
  readonly cost: string;
};

/** Union del resultado, EXTRAIDA a un alias: un tipo de retorno multilinea deja al troceo de la
 *  guardia de ambito confundir la llave de un tipo con la del cuerpo de la funcion (mismo riesgo
 *  que ya anota `module-contract.test.ts` sobre `Promise<{ id: string } | 'duplicate'>`). */
type AliveByIdentitiesResult = { lines: readonly AliveByIdentityLine[] } | 'supplier_not_found';

/**
 * `findAliveByIdentities`: busca las lineas VIVAS de ese proveedor **de esa empresa** cuya
 * identidad -nombre normalizado y presentacion- coincide con alguna de las claves pedidas.
 * Con cero claves no consulta nada, igual que hace el catalogo de unidades cuando se le pide
 * una lista vacia.
 */
export async function findAliveCatalogLinesByIdentities(
  supplierId: string,
  keys: readonly { nameNormalized: string; presentationId: string }[],
  scope: SupplierScope,
): Promise<AliveByIdentitiesResult> {
  if (!(await isSupplierAlive(supplierId, scope))) return 'supplier_not_found';
  if (keys.length === 0) return { lines: [] };

  const rows: readonly AliveByIdentityRow[] = await prisma.supplierCatalogLine.findMany({
    where: {
      supplierId,
      deletedAt: null,
      ...catalogLineCompanyScope(scope),
      OR: keys.map((key) => ({
        nameNormalized: key.nameNormalized,
        presentationId: key.presentationId,
      })),
    },
    select: { id: true, nameNormalized: true, presentationId: true, cost: true },
  });

  return {
    lines: rows.map((row) => ({
      id: row.id,
      nameNormalized: row.nameNormalized,
      presentationId: row.presentationId,
      cost: row.cost.toFixed(4),
    })),
  };
}

type UpsertRow = { readonly inserted: boolean };

/**
 * `measurements` -> parametro para `::jsonb`. La trampa que no hay que caer en (anotada
 * porque cuesta ver por que hace falta): `JSON.stringify(null)` produce el TEXTO `'null'`,
 * y `'null'::jsonb` es el LITERAL json `null` -que el CHECK de la migracion rechaza, porque
 * exige objeto o SQL `NULL`-. Pasando `null` de JavaScript, y no la cadena `'null'`, el
 * parametro llega como SQL `NULL` de verdad y `NULL::jsonb` es SQL `NULL`, que el CHECK si
 * acepta.
 */
function measurementsParam(value: CatalogLineFields['measurements']): string | null {
  return value === null ? null : JSON.stringify(value);
}

/**
 * `upsertCostByIdentity`. Una transaccion:
 *
 * 1. `SELECT ... FOR SHARE` del proveedor vivo de la empresa. Sin fila, `'supplier_not_found'`
 *    y la transaccion no escribe nada (una baja concurrente del proveedor, en curso, hace
 *    que esta escritura espere a que termine en vez de correr a la vez).
 * 2. Por cada linea, un `INSERT ... ON CONFLICT (...) WHERE deleted_at IS NULL DO UPDATE`
 *    sobre el mismo indice unico parcial que arbitra el alta manual: sin fila devuelta,
 *    «sin cambios» (mismo costo); con `inserted`, «creada»; si no, «actualizada». El indice
 *    es el UNICO arbitro -no hay ningun `SELECT` previo del que la escritura dependa-, que es
 *    lo que hace que dos confirmaciones simultaneas no dupliquen nada.
 *
 * Si cualquier sentencia de la transaccion lanza -incluida una violacion de restriccion en
 * una fila intermedia-, `prisma.$transaction` deshace TODO lo escrito hasta ese punto: no hay
 * ningun `catch` dentro del bucle que la convierta en un resultado parcial.
 */
export async function upsertCatalogLinesByIdentity(
  supplierId: string,
  lines: readonly CatalogLineFields[],
  actorId: string,
  now: Date,
  scope: SupplierScope,
): Promise<{ created: number; updated: number; unchanged: number } | 'supplier_not_found'> {
  const { companyId } = companyScopeColumns(scope);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<readonly { id: string }[]>(Prisma.sql`
      SELECT "id" FROM "suppliers"
      WHERE "id" = ${supplierId}::uuid
        AND "company_id" = ${companyId}::uuid
        AND "deleted_at" IS NULL
      FOR SHARE
    `);
    if (locked.length === 0) return 'supplier_not_found' as const;

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const line of lines) {
      const rows = await tx.$queryRaw<readonly UpsertRow[]>(Prisma.sql`
        INSERT INTO "supplier_catalog_lines" (
          "id", "supplier_id", "name", "name_normalized", "presentation_id", "unit_id",
          "image_path", "cost", "min_purchase", "delivery_time", "material", "measurements",
          "company_id", "created_by", "updated_by", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(),
          ${supplierId}::uuid,
          ${line.name},
          ${normalizeSupplierName(line.name)},
          ${line.presentationId}::uuid,
          ${line.unitId}::uuid,
          ${line.imagePath},
          ${line.cost}::numeric,
          ${line.minPurchase}::numeric,
          ${line.deliveryTime}::integer,
          ${line.material},
          ${measurementsParam(line.measurements)}::jsonb,
          ${companyId}::uuid,
          ${actorId}::uuid,
          ${actorId}::uuid,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        ON CONFLICT (supplier_id, name_normalized, presentation_id) WHERE deleted_at IS NULL
        DO UPDATE SET
          "cost" = EXCLUDED."cost",
          "updated_by" = EXCLUDED."updated_by",
          "updated_at" = EXCLUDED."updated_at"
        WHERE supplier_catalog_lines."cost" IS DISTINCT FROM EXCLUDED."cost"
        RETURNING (xmax = 0) AS "inserted"
      `);

      const row = rows[0];
      if (row === undefined) {
        unchanged += 1;
      } else if (row.inserted) {
        created += 1;
      } else {
        updated += 1;
      }
    }

    return { created, updated, unchanged };
  });
}
