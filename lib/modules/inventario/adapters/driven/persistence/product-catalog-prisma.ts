import { prisma } from '@/lib/shared/db/prisma';

import { sumStockByUnit } from '../../../domain/product-stock';

import type { ProductId, ProductRef } from '../../../domain/product-catalog';
import type { ProductStockByUnit } from '../../../domain/product-stock';

/**
 * Implementa `ProductCatalog['findRefs']` (`design.md > 6`, T9): el hueco que QC-24
 * dejo abierto en el contrato publico de `inventario` para que `recetas` pueda saber
 * si un producto existe, SIN tocar la tabla ni el repositorio de producto.
 *
 * Una sola consulta, `deleted_at IS NULL` en el `where` (nunca en un filtro posterior):
 * `findRefs` SOLO devuelve productos VIVOS -los ids que no existan o esten borrados
 * logicamente simplemente no vienen en la respuesta (contrato de `ProductCatalog`,
 * `domain/product-catalog.ts`)-.
 *
 * QC-49 (R29): ESTE ARCHIVO SE QUEDA SIN AMBITO DE EMPRESA, Y ES LA UNICA EXCEPCION DEL MODULO.
 * Es deliberada, esta aprobada por escrito y tiene destino con nombre; no es un olvido, y ninguna
 * otra consulta de `inventario` puede acogerse a ella.
 *
 * POR QUE. `findRefs` es la COSTURA por la que `recetas` resuelve referencias de producto con
 * identificadores QUE YA TIENE GUARDADOS. No la llama ninguna sesion: no hay actor del que sacar
 * la empresa, y anadirle el `scope` a la firma obligaria a hacer subir el ambito por los casos de
 * uso de `recetas` -otro modulo, que esta ficha no toca (R28)-.
 *
 * QUE CUESTA. Mientras dure: una receta de la empresa A que guarde el identificador de un
 * producto de la B lo sigue resolviendo, y ve su nombre y su existencia. No abre ninguna via para
 * ESCRIBIR nada ajeno -este archivo solo lee- ni para descubrir identificadores que no se
 * tuvieran ya.
 *
 * ADONDE VA: **QC-50**, que aisla `recetas`. Quien la cierre reutiliza `./company-scope`, el
 * punto unico que esta ficha deja exportado, en vez de escribir un segundo filtro aqui. Mismo
 * criterio con el que QC-76 dejo `UnitCatalog.findRefs` fuera de su ambito.
 */

type ProductCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly stock: number | null;
  readonly stockByUnit: readonly ProductStockByUnit[];
};

/** Fila de Prisma -> `ProductRef` del contrato publico. Funcion pura, testeable sin base. */
export function toProductRef(row: ProductCatalogRow): ProductRef {
  return {
    id: row.id,
    name: row.name,
    stock: row.stock,
    stockByUnit: row.stockByUnit,
  };
}

export async function findProductRefs(ids: readonly ProductId[]): Promise<readonly ProductRef[]> {
  if (ids.length === 0) return [];

  // Sin JOIN de presentacion directo desde el 2026-09-09: se lee via `batches` para armar
  // `stockByUnit`. Y sin `unit_id` propio desde QC-80 (R21): la columna desaparecio de
  // `products` y `ProductRef` no la sustituye por la unidad derivada del lote, porque el
  // unico llamante -`recetas`- nunca la consumio.
  const rows = await prisma.product.findMany({
    where: { id: { in: [...ids] }, deletedAt: null },
    select: {
      id: true,
      name: true,
      stock: true,
      batches: {
        select: { stock: true, presentation: { select: { unitId: true } } },
      },
    },
  });

  return rows.map((row) =>
    toProductRef({
      id: row.id,
      name: row.name,
      stock: row.stock,
      stockByUnit: sumStockByUnit(
        row.batches.map((batch) => ({ stock: batch.stock, unitId: batch.presentation.unitId })),
      ),
    }),
  );
}
