/**
 * `findMassVolumeBridge` contra Postgres real. Cada caso corre en una transaccion que se deshace:
 * el adaptador recibe el cliente de la transaccion, asi que ve lo sembrado sin confirmarlo.
 */
import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  createUnitCatalogReader,
  findMassVolumeBridge,
} from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(body: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

async function systemBaseId(tx: Prisma.TransactionClient, nameNormalized: string): Promise<string> {
  const row = await tx.unit.findFirstOrThrow({
    where: { companyId: null, baseUnitId: null, nameNormalized },
    select: { id: true },
  });
  return row.id;
}

describe('UnitCatalog.findMassVolumeBridge', () => {
  it('R3 devuelve los ids del mililitro y el gramo de sistema', async () => {
    await inRolledBackTransaction(async (tx) => {
      const expected = {
        volumeBaseId: await systemBaseId(tx, 'mililitro'),
        massBaseId: await systemBaseId(tx, 'gramo'),
      };

      expect(await findMassVolumeBridge(tx)).toEqual(expected);
      expect(await createUnitCatalogReader(tx).findMassVolumeBridge()).toEqual(expected);
    });
  });

  it('N1 ignora un gramo propio de la empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const nombre = `Empresa puente ${randomUUID()}`;
      const company = await tx.company.create({
        data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
        select: { id: true },
      });
      const gramoPropio = await tx.unit.create({
        data: { name: 'gramo', nameNormalized: 'gramo', symbol: null, companyId: company.id },
        select: { id: true },
      });

      const bridge = await findMassVolumeBridge(tx);

      expect(bridge).not.toBeNull();
      expect(bridge?.massBaseId).toBe(await systemBaseId(tx, 'gramo'));
      expect(bridge?.massBaseId).not.toBe(gramoPropio.id);
      expect(bridge?.volumeBaseId).not.toBe(gramoPropio.id);
    });
  });
});
