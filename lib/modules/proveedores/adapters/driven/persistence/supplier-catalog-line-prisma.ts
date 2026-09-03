import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

import type {
  CatalogLineTerms,
  CatalogLineView,
  NewCatalogLine,
} from '../../../domain/catalog-line-view';
import type { Page, PageQuery } from '../../../domain/page';

/**
 * Implementa `SupplierCatalogRepository` (`design.md > 7`) con Prisma.
 *
 * Este archivo no consulta el modelo de productos ni el de usuarios -ni siquiera los
 * nombra: la guardia de propiedad de modelos busca la CADENA y no se ciega por comentarios,
 * asi que escribirla aqui, aunque fuera para decir que no se usa, la pondria roja-. El
 * nombre del producto lo resuelve el caso de uso por el contrato publico de `inventario`
 * (R26) y el autor viaja como identificador en crudo. Las unicas dos tablas que toca son
 * `supplier_catalog_lines` y -para comprobar que el proveedor sigue vivo (R36)-
 * `suppliers`, que son las dos de su propio modulo.
 */

/** `select` unico de la lectura del catalogo. */
const CATALOG_LINE_SELECT = {
  id: true,
  supplierId: true,
  productId: true,
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
 * `cost` y `minPurchase` viajan como CADENA por el puerto (`design.md > 6.2`): el dominio
 * no puede importar `@prisma/client` y el binario de coma flotante esta prohibido para
 * importes. Este es el unico sitio del modulo que hace la conversion, en los dos sentidos.
 */
export function toDecimalInput(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

/** Camino inverso: `Prisma.Decimal` -> cadena con los 4 decimales de `DECIMAL(14,4)`. */
export function fromDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toFixed(4);
}

/**
 * Fila -> `CatalogLineView`. `productName` sale SIEMPRE `null` desde aqui, y es deliberado
 * (`design.md > 5.3`): este adaptador no sabe nada de productos y preguntarlo seria cruzar
 * la frontera de `inventario`. Lo completa `list-catalog-lines.ts` con una sola llamada al
 * contrato para toda la pagina.
 */
export function toCatalogLineView(row: CatalogLineRow): CatalogLineView {
  return {
    id: row.id,
    supplierId: row.supplierId,
    productId: row.productId,
    productName: null,
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

/** Columnas del indice unico `(supplier_id, product_id)` (R27), tal como Prisma las reporta. */
const CATALOG_LINE_UNIQUE_COLUMNS = ['supplier_id', 'product_id'];

/** `P2002` sobre la pareja proveedor-producto: el unico duplicado posible de esta tabla. */
export function isDuplicateLineViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target: unknown = error.meta?.target;
  const columnas = typeof target === 'string' ? [target] : Array.isArray(target) ? target : [];
  return CATALOG_LINE_UNIQUE_COLUMNS.some((columna) =>
    columnas.some((valor) => typeof valor === 'string' && valor.includes(columna)),
  );
}

/** Nombre de la columna que disparo un `P2003`, leido de `meta.field_name` (nunca del texto). */
function fieldNameOf(error: Prisma.PrismaClientKnownRequestError): string {
  const meta: unknown = error.meta;
  if (typeof meta === 'object' && meta !== null && 'field_name' in meta) {
    const fieldName: unknown = (meta as { field_name: unknown }).field_name;
    if (typeof fieldName === 'string') return fieldName;
  }
  return '';
}

/**
 * `23503` sobre `supplier_id`: el proveedor no existe (R25). Se decide por la COLUMNA, no
 * por el texto del mensaje -que en esta maquina Postgres devuelve en espanol-.
 *
 * Las otras dos FK de la tabla, `created_by` y `updated_by` hacia `users` (R32), NO se
 * traducen: el actor sale de una sesion real (QC-8), asi que un autor inexistente no es un
 * caso de negocio sino un fallo del sistema, y traducirlo a `'supplier_not_found'` diria al
 * usuario una mentira. Se relanza crudo. Que la base lo rechaza lo prueba T18 con SQL
 * directo, que es donde ese camino si es alcanzable.
 */
export function isSupplierForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003' &&
    fieldNameOf(error).includes('supplier_id')
  );
}

/**
 * `create` (R25, R27, R31). Escribe `created_by` Y `updated_by` con el mismo `actorId`: al
 * nacer, el autor de la creacion y el de la ultima modificacion son la misma persona.
 */
export async function createCatalogLine(
  data: NewCatalogLine,
  actorId: string,
  now: Date,
): Promise<{ id: string } | 'duplicate' | 'supplier_not_found'> {
  try {
    const created = await prisma.supplierCatalogLine.create({
      data: {
        supplierId: data.supplierId,
        productId: data.productId,
        cost: toDecimalInput(data.cost) as Prisma.Decimal,
        minPurchase: toDecimalInput(data.minPurchase),
        deliveryTime: data.deliveryTime,
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
    throw error;
  }
}

/**
 * `updateTerms` (R31, R33). `updateMany` -no `update`- para devolver `'not_found'` en vez
 * de lanzar cuando la linea no existe.
 *
 * `data` no lleva `supplierId`, `productId` ni `createdBy`: la pareja es la identidad de la
 * linea y el autor de la creacion no se toca. No es que no se pasen «por ahora»; es que el
 * tipo del puerto (`CatalogLineTerms`) no los tiene.
 */
export async function updateCatalogLineTerms(
  id: string,
  data: CatalogLineTerms,
  actorId: string,
  now: Date,
): Promise<'ok' | 'not_found'> {
  const { count } = await prisma.supplierCatalogLine.updateMany({
    where: { id },
    data: {
      cost: toDecimalInput(data.cost) as Prisma.Decimal,
      minPurchase: toDecimalInput(data.minPurchase),
      deliveryTime: data.deliveryTime,
      updatedAt: now,
      updatedBy: actorId,
    },
  });
  return count === 1 ? 'ok' : 'not_found';
}

/**
 * `deleteById` (R34). Borrado FISICO: la fila deja de existir. `deleteMany` en vez de
 * `delete` por la misma razon de siempre -devolver `'not_found'` en vez de lanzar- y porque
 * la linea no tiene borrado logico donde marcar nada (decision 11 de QC-42).
 */
export async function deleteCatalogLineById(id: string): Promise<'deleted' | 'not_found'> {
  const { count } = await prisma.supplierCatalogLine.deleteMany({ where: { id } });
  return count === 1 ? 'deleted' : 'not_found';
}

/**
 * `listBySupplierAlive` (R35, R36).
 *
 * Comprueba PRIMERO que el proveedor este vivo y, si no lo esta, no devuelve nada: las
 * lineas no tienen borrado logico propio (decision 11 de QC-42), asi que sin esta
 * comprobacion el catalogo de un proveedor dado de baja seguiria siendo consultable con solo
 * conocer su id. Esa es exactamente la decision cerrada 7.
 *
 * Orden `created_at ASC, id ASC` (R21, `design.md > 8`): estable y sin depender de datos de
 * otro modulo. Ordenar por nombre de producto exigiria un `join` a `products` -que cruza la
 * frontera- o traer el catalogo entero a memoria.
 */
export async function listCatalogLinesBySupplierAlive(
  supplierId: string,
  query: PageQuery,
): Promise<Page<CatalogLineView> | 'supplier_not_found'> {
  const proveedorVivo = await prisma.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
    select: { id: true },
  });
  if (proveedorVivo === null) return 'supplier_not_found';

  const { offset, limit } = toOffsetLimit(query.page, query.pageSize);
  const where: Prisma.SupplierCatalogLineWhereInput = { supplierId };

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
