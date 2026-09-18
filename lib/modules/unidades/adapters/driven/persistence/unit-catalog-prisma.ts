import { prisma } from '@/lib/shared/db/prisma';

import type { UnitId, UnitRef } from '../../../domain/unit-catalog';

import { companyScopeWhere } from './unit-prisma';

/**
 * Implementa `UnitCatalog['findRefs']` (`domain/unit-catalog.ts`): el hueco que el
 * contrato publico de `unidades` deja abierto para que otro modulo pueda saber si una
 * unidad existe, SIN tocar la tabla ni el repositorio de unidad. Mismo patron que
 * `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`.
 *
 * A diferencia de `ProductCatalog`, `Unit` NO tiene `deleted_at` (no hay borrado logico
 * de unidades): no hay ningun filtro de vida que aplicar en el `where`.
 *
 * El ambito se compone con `companyScopeWhere`, la UNICA definicion de «de la empresa o de
 * sistema» del modulo, en un `AND` aparte del filtro por identificadores -nunca un segundo
 * `OR` propio-: una unidad de sistema (`companyId` nulo) se resuelve para cualquier empresa,
 * una de la empresa propia se resuelve, y una de otra empresa no vuelve, igual que si no
 * existiera.
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

export async function findUnitRefs(
  ids: readonly UnitId[],
  companyId: string,
): Promise<readonly UnitRef[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.unit.findMany({
    where: {
      AND: [companyScopeWhere({ companyId }), { id: { in: [...ids] } }],
    },
    select: { id: true, name: true, symbol: true, baseUnitId: true, factor: true },
  });

  return rows.map(toUnitRef);
}
