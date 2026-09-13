// tests/integration/asignaciones/atomicity.int.test.ts
/**
 * QC-87 (T14) — R27: TODAS las filas de una misma operacion, en UNA sola transaccion.
 *
 * «Un fallo no deja el pedido con parte de las personas asignadas.» Eso, contra Postgres, se
 * demuestra provocando un fallo A MITAD del lote y mirando la tabla despues. Hay dos mitades del
 * requisito y las dos estan aqui:
 *
 *   1. **El fallo de la BASE.** `insertMissing` es UNA sentencia (`createMany`), y Postgres la
 *      ejecuta de forma atomica: si la tercera fila viola una clave ajena, no entran ni la primera
 *      ni la segunda. No hay ninguna «mitad» que pueda quedarse escrita. Se ejercita el adaptador
 *      REAL con un lote cuya fila del medio apunta a una persona que no existe -> `23503` y CERO
 *      filas.
 *   2. **El rechazo del CASO DE USO.** Cuando una de las personas del lote no existe o no es
 *      asignable, la operacion se rechaza ENTERA y ANTES de escribir: las demas del mismo lote no
 *      quedan creadas, y lo que ya hubiera en el pedido de una operacion anterior sigue intacto.
 *
 * SAVEPOINT — el `23503` del caso 1 aborta el bloque de Postgres, asi que va envuelto en
 * `withSavepoint`: sin eso, la transaccion del test quedaria abortada y las consultas siguientes
 * -las que comprueban que no quedo nada- fallarian con `25P02` en vez de contestar. El rechazo del
 * caso 2 es del DOMINIO y no toca la base, asi que no lo necesita.
 *
 * AISLAMIENTO: `transaccion` (ver `./use-case-fixture.ts`).
 *
 * CADA ASERCION CAE AL MUTAR: partir `insertMissing` en un `create` por fila —la forma «obvia» de
 * escribirlo— pone rojo el caso 1: la primera fila quedaria escrita y la tabla ya no estaria
 * vacia. Mover la comprobacion de personas DESPUES de la escritura pone rojo el caso 2.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/db/prisma', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shared/db/prisma')>('@/lib/shared/db/prisma');
  const { txAwareProxy } = await import('./prisma-tx-holder');
  return { prisma: txAwareProxy(actual.prisma) };
});

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma';

import {
  NOW,
  actorOf,
  codeOf,
  createOrder,
  createPerson,
  inRolledBackTransaction,
  readRows,
  withSavepoint,
} from './use-case-fixture';

import type { NewAssignment } from '@/lib/modules/asignaciones/ports/order-assignment-repository';

describe('asignaciones · atomicidad de la escritura (integracion)', () => {
  it('R27: si una fila del lote viola una clave ajena, NO entra ninguna de las demas', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const repo = createOrderAssignmentRepository(fixture.tx);
      const orderId = await createOrder(fixture);
      const primera = await createPerson(fixture, fixture.companyA);
      const tercera = await createPerson(fixture, fixture.companyA);
      // Una persona que NO existe: la FK compuesta `order_assignments_user_id_fkey` de QC-86 la
      // rechaza. Es el fallo «a mitad» que R27 describe, provocado por la base y no simulado.
      const fantasma = '00000000-0000-4000-8000-0000000000ff';

      const fila = (userId: string): NewAssignment => ({
        orderId,
        userId,
        companyId: fixture.companyA,
        workGroupId: null,
        workGroupName: null,
      });

      const error = await withSavepoint(fixture.tx, () =>
        repo.insertMissing([fila(primera), fila(fantasma), fila(tercera)], NOW),
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toMatch(/23503|Foreign key/i);

      // LO QUE MIDE R27: ni la primera ni la tercera quedaron escritas. El pedido no se quedo con
      // «parte de las personas asignadas».
      expect(await readRows(fixture.tx, orderId)).toEqual([]);
    });
  });

  it('R27: el rechazo del caso de uso no deja creada ninguna fila del lote y no toca las anteriores', async () => {
    await inRolledBackTransaction(async (fixture) => {
      const actor = actorOf(fixture.companyA);
      const orderId = await createOrder(fixture);
      const yaAsignada = await createPerson(fixture, fixture.companyA);
      await fixture.useCases.assign(actor, { orderId, userIds: [yaAsignada], workGroupIds: [] }, NOW);
      const antes = await readRows(fixture.tx, orderId);

      const buena1 = await createPerson(fixture, fixture.companyA);
      const buena2 = await createPerson(fixture, fixture.companyA);
      // Existe y es de la empresa, pero su cuenta no esta `active` (R18): el lote entero cae.
      const noAsignable = await createPerson(fixture, fixture.companyA, { accountStatus: 'pending' });

      const error = await fixture.useCases
        .assign(actor, { orderId, userIds: [buena1, noAsignable, buena2], workGroupIds: [] }, NOW)
        .catch((caught: unknown) => caught);
      expect(codeOf(error)).toBe('user_not_assignable');

      // Ni `buena1` ni `buena2` entraron, y la fila de la operacion ANTERIOR sigue exactamente
      // igual: un rechazo no es una escritura parcial ni una reescritura.
      expect(await readRows(fixture.tx, orderId)).toEqual(antes);
    });
  });
});
