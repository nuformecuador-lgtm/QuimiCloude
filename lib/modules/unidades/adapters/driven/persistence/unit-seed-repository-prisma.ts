import { prisma } from '@/lib/shared/db/prisma';

import type { UnitSeedRepository } from '../../../ports/unit-seed-repository';

/**
 * Adaptador Prisma del puerto `UnitSeedRepository` (`design.md > 5.1`, T5). Es el UNICO
 * sitio del repositorio donde puede aparecer `prisma.unit` (R15, R16): ni el dominio, ni el
 * puerto, ni `lib/composition`, ni `scripts/seed.ts` lo nombran, y
 * `tests/guards/guard-arquitectura-modulos.test.ts` lo vigila.
 *
 * Ningun metodo actualiza nada. `update`, `updateMany` y `upsert` no aparecen aqui a
 * proposito: el puerto no los pide porque R26 prohibe que el seed toque una unidad
 * existente.
 *
 * Se exporta el objeto ya construido —y no una fabrica— porque quien ata el puerto a esta
 * implementacion es SOLO `lib/composition/index.ts` (`design.md > 5.4`).
 */
export const unitSeedRepositoryPrisma: UnitSeedRepository = {
  async findExistingNormalizedNames(normalizedNames) {
    const rows = await prisma.unit.findMany({
      where: { nameNormalized: { in: [...normalizedNames] } },
      select: { nameNormalized: true },
    });
    return rows.map((row) => row.nameNormalized);
  },

  async createUnit(unit) {
    // Sin `catch` de `P2002`: la carrera entre dos seeds simultaneos debe fallar
    // ruidosamente (`design.md > 6.2`). Tampoco hay `upsert`: pisaria el simbolo de una
    // unidad cambiada a mano (R26).
    await prisma.unit.create({
      data: { name: unit.name, nameNormalized: unit.nameNormalized, symbol: unit.symbol },
    });
  },
};
