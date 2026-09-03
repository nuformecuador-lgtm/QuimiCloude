import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/shared/db/prisma';

import type { UnitSeedRepository } from '../../../ports/unit-seed-repository';

/**
 * Adaptador Prisma del puerto `UnitSeedRepository` (`design.md > 5.1`, T5). Es el UNICO
 * sitio del repositorio donde puede aparecer una consulta a la tabla `units` (R15, R16):
 * ni el dominio, ni el puerto, ni `lib/composition`, ni `scripts/seed.ts` la nombran, y
 * `tests/unit/unidades/module-contract.test.ts` lo vigila.
 *
 * Ningun metodo actualiza nada. `update`, `updateMany` y `upsert` no aparecen aqui a
 * proposito: el puerto no los pide porque R26 prohibe que el seed toque una unidad
 * existente.
 *
 * Se exporta una FABRICA sobre el cliente —y no solo el objeto ya construido— por la misma
 * razon que `createInitialAccessRepository` en `identity` (QC-6): el test de integracion
 * necesita construirla sobre un `Prisma.TransactionClient` para ejercitar ESTE adaptador,
 * el de produccion, dentro de una transaccion que termina en `ROLLBACK`. Con solo el objeto
 * atado al `PrismaClient` compartido, el test no tendria mas remedio que escribir una copia
 * del adaptador y probar la copia, y entonces vaciar este archivo dejaria la suite verde.
 */
export function createUnitSeedRepository(
  db: PrismaClient | Prisma.TransactionClient,
): UnitSeedRepository {
  return {
    async findExistingNormalizedNames(normalizedNames) {
      const rows = await db.unit.findMany({
        where: { nameNormalized: { in: [...normalizedNames] } },
        select: { nameNormalized: true },
      });
      return rows.map((row) => row.nameNormalized);
    },

    async createUnit(unit) {
      // Sin `catch` de `P2002`: la carrera entre dos seeds simultaneos debe fallar
      // ruidosamente (`design.md > 6.2`). Tampoco hay `upsert`: pisaria el simbolo de una
      // unidad cambiada a mano (R26).
      await db.unit.create({
        data: { name: unit.name, nameNormalized: unit.nameNormalized, symbol: unit.symbol },
      });
    },
  };
}

/**
 * El adaptador ya construido sobre el cliente Prisma compartido. Es lo que ata
 * `lib/composition/index.ts` (`design.md > 5.4`), que es el UNICO sitio donde un puerto se
 * une a su implementacion.
 */
export const unitSeedRepositoryPrisma: UnitSeedRepository = createUnitSeedRepository(prisma);
