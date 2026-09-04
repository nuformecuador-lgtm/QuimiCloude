import { prisma } from '@/lib/shared/db/prisma';

import type { UnitRef } from '../../../domain/unit-catalog';

/**
 * Implementa `UnitRepository['listAll']` (`ports/unit-repository.ts`, R40): lista el
 * catalogo completo de unidades ordenado por nombre, siempre con `take` -ninguna
 * consulta sin cota-. `Unit` no tiene `deleted_at` (no hay borrado logico de unidades):
 * no hay ningun filtro de vida que aplicar en el `where`.
 *
 * NO es `unit-catalog-prisma.ts` (`findRefs`, resolver ids conocidos para `recetas`):
 * ese adaptador es de otro puerto y no se toca.
 */
export async function listUnits(limit: number): Promise<readonly UnitRef[]> {
  const rows = await prisma.unit.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, symbol: true },
    take: limit,
  });

  return rows.map((row) => ({ id: row.id, name: row.name, symbol: row.symbol }));
}
