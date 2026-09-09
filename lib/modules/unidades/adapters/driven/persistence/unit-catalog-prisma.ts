import { prisma } from '@/lib/shared/db/prisma';

import type { UnitId, UnitRef } from '../../../domain/unit-catalog';

/**
 * Implementa `UnitCatalog['findRefs']` (`domain/unit-catalog.ts`): el hueco que el
 * contrato publico de `unidades` dejaba abierto para que otro modulo -QC-25 es su
 * primer consumidor, R50- pueda saber si una unidad existe, SIN tocar la tabla ni el
 * repositorio de unidad. Mismo patron que
 * `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`.
 *
 * A diferencia de `ProductCatalog`, `Unit` NO tiene `deleted_at` (no hay borrado logico
 * de unidades): no hay ningun filtro de vida que aplicar en el `where`.
 */

type UnitCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly symbol: string | null;
  /** `Decimal` de Prisma o cualquier cosa con `toString()`: este adaptador no importa el tipo
   *  de Prisma para no arrastrarlo al test, que llama a `toUnitRef` con filas planas. */
  readonly baseUnitId: string | null;
  readonly factor: { toString(): string } | null;
};

/** Fila de Prisma -> `UnitRef` del contrato publico. Funcion pura, testeable sin base.
 *  `factor` sale como TEXTO por la misma razon que en `unit-prisma.ts`: un decimal no se
 *  degrada a `number` ni cruza el contrato como `Decimal`. */
export function toUnitRef(row: UnitCatalogRow): UnitRef {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    baseUnitId: row.baseUnitId,
    factor: row.factor === null ? null : row.factor.toString(),
  };
}

export async function findUnitRefs(ids: readonly UnitId[]): Promise<readonly UnitRef[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.unit.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, symbol: true, baseUnitId: true, factor: true },
  });

  return rows.map(toUnitRef);
}
