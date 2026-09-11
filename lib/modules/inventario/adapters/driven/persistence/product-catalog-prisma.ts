import { prisma } from '@/lib/shared/db/prisma';

import type { ProductId, ProductRef } from '../../../domain/product-catalog';

/**
 * Implementa `ProductCatalog['findRefs']` (`design.md > 6`, T9): el hueco que QC-24
 * dejo abierto en el contrato publico de `inventario` para que `recetas` pueda saber
 * si un producto existe, SIN tocar la tabla ni el repositorio de producto.
 *
 * Una sola consulta, `deleted_at IS NULL` en el `where` (nunca en un filtro posterior):
 * `findRefs` SOLO devuelve productos VIVOS -los ids que no existan o esten borrados
 * logicamente simplemente no vienen en la respuesta (contrato de `ProductCatalog`,
 * `domain/product-catalog.ts`)-.
 */

type ProductCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly stock: number | null;
};

/** Fila de Prisma -> `ProductRef` del contrato publico. Funcion pura, testeable sin base. */
export function toProductRef(row: ProductCatalogRow): ProductRef {
  return {
    id: row.id,
    name: row.name,
    stock: row.stock,
  };
}

export async function findProductRefs(ids: readonly ProductId[]): Promise<readonly ProductRef[]> {
  if (ids.length === 0) return [];

  // Sin JOIN desde el 2026-09-09: la presentacion se mudo a `product_batches`, asi que una
  // referencia de producto ya no la expone. Y sin `unit_id` desde QC-80 (R21): la columna
  // desaparecio de `products` y `ProductRef` no la sustituye por la unidad derivada del lote,
  // porque el unico llamante -`recetas`- nunca la consumio.
  const rows = await prisma.product.findMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    select: {
      id: true,
      name: true,
      stock: true,
    },
  });

  return rows.map((row) =>
    toProductRef({
      id: row.id,
      name: row.name,
      stock: row.stock,
    }),
  );
}
