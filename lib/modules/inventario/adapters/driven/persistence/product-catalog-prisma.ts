import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '../../../domain/inventory-scope';
import type { ProductId, ProductRef } from '../../../domain/product-catalog';

import { productCompanyScope } from './company-scope';

/**
 * Implementa `ProductCatalog['findRefs']`: el hueco que el contrato publico de `inventario`
 * deja abierto para que otro modulo pueda saber si un producto existe, SIN tocar la tabla
 * ni el repositorio de producto.
 *
 * Una sola consulta, `deleted_at IS NULL` en el `where` (nunca en un filtro posterior):
 * `findRefs` SOLO devuelve productos VIVOS -los ids que no existan o esten borrados
 * logicamente simplemente no vienen en la respuesta (contrato de `ProductCatalog`,
 * `domain/product-catalog.ts`)-.
 *
 * El ambito de empresa se compone con `productCompanyScope`, el punto unico del modulo, en
 * un `AND` aparte del filtro por identificadores: un producto de otra empresa se resuelve
 * exactamente igual que uno inexistente, simplemente no vuelve.
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

/**
 * La consulta real. Vive aparte de `findProductRefs` para que declare el `scope` con el mismo
 * tipo que el resto del modulo -`InventoryScope`, no la cadena suelta del contrato publico- y lo
 * lleve hasta `productCompanyScope` igual que cualquier otra lectura de `inventario`.
 */
async function findAliveProducts(
  ids: readonly ProductId[],
  scope: InventoryScope,
): Promise<readonly ProductCatalogRow[]> {
  // Sin JOIN desde el 2026-09-09: la presentacion se mudo a `product_batches`, asi que una
  // referencia de producto ya no la expone. Y sin `unit_id` desde QC-80 (R21): la columna
  // desaparecio de `products` y `ProductRef` no la sustituye por la unidad derivada del lote,
  // porque el unico llamante -`recetas`- nunca la consumio.
  return prisma.product.findMany({
    where: {
      AND: [productCompanyScope(scope), { id: { in: [...ids] }, deletedAt: null }],
    },
    select: {
      id: true,
      name: true,
      stock: true,
    },
  });
}

export async function findProductRefs(
  ids: readonly ProductId[],
  companyId: string,
): Promise<readonly ProductRef[]> {
  if (ids.length === 0) return [];

  const rows = await findAliveProducts(ids, { companyId });

  return rows.map((row) =>
    toProductRef({
      id: row.id,
      name: row.name,
      stock: row.stock,
    }),
  );
}
