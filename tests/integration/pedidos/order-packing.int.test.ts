/**
 * `startPackingAliveById` / `finishPackingAliveById` contra Postgres REAL, cableados exactamente
 * como `lib/composition`: `createStartPacking`/`createFinishPacking` sobre
 * `startPackingAliveOrder`/`finishPackingAliveOrder` (`order-prisma.ts`), que usan el cliente
 * Prisma GLOBAL con un `updateMany` condicional -sin `tx`-.
 *
 * AISLAMIENTO — mismo motivo que `order-reservation-concurrency.int.test.ts`: cada escritura es
 * SU PROPIA sentencia contra el cliente global, asi que envolver la corrida en una transaccion de
 * test con ROLLBACK impediria que dos llamadas reales compitan por el bloqueo de la misma fila
 * (R19). Cada caso fabrica su propia empresa efimera con randomUUID y la limpia en un `finally`.
 *
 * Requisitos cubiertos: R18, R19, R20, R21, R22, R23, R24, R25, R27, R28.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createFinishPacking, createStartPacking } from '@/lib/modules/pedidos';
import {
  finishPackingAliveOrder,
  startPackingAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { OrderPackingRepository } from '@/lib/modules/pedidos/ports/order-packing-repository';

const orderPackingRepository: OrderPackingRepository = {
  startPackingAlive: startPackingAliveOrder,
  finishPackingAlive: finishPackingAliveOrder,
};

const startPackingAliveById = createStartPacking({ packing: orderPackingRepository });
const finishPackingAliveById = createFinishPacking({ packing: orderPackingRepository });

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

let nextSequence = 800_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

type Fixture = {
  readonly companyId: string;
  readonly recipeId: string;
  readonly packerId: string;
  readonly otherPackerId: string;
};

async function createCompany(label: string): Promise<string> {
  const marca = token();
  const name = `Empresa ${label} ${marca}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function createUser(companyId: string): Promise<string> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  });
  return user.id;
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const companyId = await createCompany('empaque');
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  const packerId = await createUser(companyId);
  const otherPackerId = await createUser(companyId);
  return { companyId, recipeId: recipe.id, packerId, otherPackerId };
}

async function borrarFixture(fixture: Fixture, orderIds: readonly string[]): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.order.deleteMany({ where: { id: { in: [...orderIds] } } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  const userIds = [fixture.packerId, fixture.otherPackerId];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { roleId: true } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.role.deleteMany({ where: { id: { in: users.map((u) => u.roleId) } } });
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

/** Empresa AJENA, con un unico empacador propio: para R24 (pedido de otra empresa). */
async function crearOtraEmpresa(): Promise<{ companyId: string; packerId: string }> {
  const companyId = await createCompany('ajena');
  const packerId = await createUser(companyId);
  return { companyId, packerId };
}

async function borrarOtraEmpresa(otra: { companyId: string; packerId: string }): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: otra.packerId }, select: { roleId: true } });
  await prisma.user.deleteMany({ where: { id: otra.packerId } });
  if (user !== null) await prisma.role.deleteMany({ where: { id: user.roleId } });
  await prisma.company.deleteMany({ where: { id: otra.companyId } });
}

type OrderStatusValue = 'PENDIENTE' | 'EN_CURSO' | 'POR_EMPACAR' | 'EN_EMPAQUE' | 'ENTREGADO' | 'CANCELADO';

async function createOrder(
  fixture: Fixture,
  overrides: {
    readonly status: OrderStatusValue;
    readonly packedBy?: string | null;
    readonly finishedAt?: Date | null;
    readonly deletedAt?: Date | null;
    readonly companyId?: string;
  },
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      companyId: overrides.companyId ?? fixture.companyId,
      orderYear: currentUtcYear(),
      orderSequence: freshSequence(),
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
      status: overrides.status,
      packedBy: overrides.packedBy ?? null,
      finishedAt: overrides.finishedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
      ...(overrides.status === 'CANCELADO' ? { cancellationReason: 'motivo de prueba' } : {}),
    },
    select: { id: true },
  });
  return order.id;
}

async function readOrder(
  id: string,
): Promise<{ status: string; packedBy: string | null; updatedAt: Date; finishedAt: Date | null }> {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, packedBy: true, updatedAt: true, finishedAt: true },
  });
}

async function movementCountDe(companyId: string): Promise<number> {
  return prisma.inventoryMovement.count({ where: { companyId } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('startPackingAliveById — R18, R19, R20, R23, R24, R25', () => {
  it('R18: Comenzar sobre POR_EMPACAR deja EN_EMPAQUE con ese empacador, en una sola escritura', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'POR_EMPACAR' });
    try {
      const antes = await movementCountDe(fixture.companyId);
      const ahora = new Date();
      const resultado = await startPackingAliveById(pedido, fixture.companyId, fixture.packerId, ahora);
      expect(resultado).toBe('ok');

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('EN_EMPAQUE');
      expect(fila.packedBy).toBe(fixture.packerId);
      expect(await movementCountDe(fixture.companyId)).toBe(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R19: dos Comenzar reales a la vez sobre el mismo pedido dejan a uno ok y al otro taken', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'POR_EMPACAR' });
    try {
      // Sin `await` entre las dos llamadas: compiten de verdad por el bloqueo de la fila.
      const [resultadoUno, resultadoDos] = await Promise.all([
        startPackingAliveById(pedido, fixture.companyId, fixture.packerId, new Date()),
        startPackingAliveById(pedido, fixture.companyId, fixture.otherPackerId, new Date()),
      ]);

      const resultados = [resultadoUno, resultadoDos];
      expect(resultados.filter((r) => r === 'ok')).toHaveLength(1);
      expect(resultados.filter((r) => r === 'taken')).toHaveLength(1);

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('EN_EMPAQUE');
      const ganador = resultadoUno === 'ok' ? fixture.packerId : fixture.otherPackerId;
      expect(fila.packedBy).toBe(ganador);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R20: Comenzar de nuevo el mismo empacador sobre su EN_EMPAQUE es already_mine, sin escribir nada', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const antes = await readOrder(pedido);
      const resultado = await startPackingAliveById(pedido, fixture.companyId, fixture.packerId, new Date());
      expect(resultado).toBe('already_mine');

      const despues = await readOrder(pedido);
      expect(despues).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R20: Comenzar sobre un EN_EMPAQUE de otro es taken, sin escribir nada', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const antes = await readOrder(pedido);
      const resultado = await startPackingAliveById(pedido, fixture.companyId, fixture.otherPackerId, new Date());
      expect(resultado).toBe('taken');

      const despues = await readOrder(pedido);
      expect(despues).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R23: Comenzar sobre PENDIENTE, EN_CURSO, ENTREGADO o CANCELADO es not_packable', async () => {
    const fixture = await crearFixture();
    const pedidos: Record<string, string> = {
      PENDIENTE: await createOrder(fixture, { status: 'PENDIENTE' }),
      EN_CURSO: await createOrder(fixture, { status: 'EN_CURSO' }),
      ENTREGADO: await createOrder(fixture, { status: 'ENTREGADO' }),
      CANCELADO: await createOrder(fixture, { status: 'CANCELADO' }),
    };
    try {
      for (const [estado, pedido] of Object.entries(pedidos)) {
        const resultado = await startPackingAliveById(pedido, fixture.companyId, fixture.packerId, new Date());
        expect(resultado, estado).toBe('not_packable');
      }
    } finally {
      await borrarFixture(fixture, Object.values(pedidos));
    }
  });

  it('R24: Comenzar sobre un pedido inexistente, dado de baja o de otra empresa es not_found', async () => {
    const fixture = await crearFixture();
    const otra = await crearOtraEmpresa();
    // `orders_delivered_not_deleted` prohibe `deleted_at` en POR_EMPACAR/EN_EMPAQUE: la unica
    // forma real de un pedido "dado de baja" es un estado anterior a esos dos, como PENDIENTE.
    const borrado = await createOrder(fixture, { status: 'PENDIENTE', deletedAt: new Date() });
    const propio = await createOrder(fixture, { status: 'POR_EMPACAR' });
    try {
      const inexistente = await startPackingAliveById(randomUUID(), fixture.companyId, fixture.packerId, new Date());
      expect(inexistente).toBe('not_found');

      const dadoDeBaja = await startPackingAliveById(borrado, fixture.companyId, fixture.packerId, new Date());
      expect(dadoDeBaja).toBe('not_found');

      // El pedido es de `fixture`; se pide con la empresa AJENA como scope: misma fila, empresa
      // equivocada, igual de invisible que si no existiera.
      const cruzado = await startPackingAliveById(propio, otra.companyId, otra.packerId, new Date());
      expect(cruzado).toBe('not_found');
    } finally {
      await borrarFixture(fixture, [borrado, propio]);
      await borrarOtraEmpresa(otra);
    }
  });
});

describe('finishPackingAliveById — R21, R22, R23, R24, R25, R27, R28', () => {
  it('R21: Terminar sobre su EN_EMPAQUE deja ENTREGADO con finished_at, en una sola escritura', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const antes = await movementCountDe(fixture.companyId);
      const ahora = new Date();
      const resultado = await finishPackingAliveById(pedido, fixture.companyId, fixture.packerId, ahora);
      expect(resultado).toBe('ok');

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('ENTREGADO');
      expect(fila.finishedAt).toEqual(ahora);
      expect(await movementCountDe(fixture.companyId)).toBe(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R22: Terminar activado por quien no empaca el pedido es not_packer, sin escribir nada', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const antes = await readOrder(pedido);
      const resultado = await finishPackingAliveById(pedido, fixture.companyId, fixture.otherPackerId, new Date());
      expect(resultado).toBe('not_packer');

      const despues = await readOrder(pedido);
      expect(despues).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R23: Terminar sobre POR_EMPACAR, PENDIENTE, EN_CURSO, ENTREGADO o CANCELADO es not_packable', async () => {
    const fixture = await crearFixture();
    const pedidos: Record<string, string> = {
      POR_EMPACAR: await createOrder(fixture, { status: 'POR_EMPACAR' }),
      PENDIENTE: await createOrder(fixture, { status: 'PENDIENTE' }),
      EN_CURSO: await createOrder(fixture, { status: 'EN_CURSO' }),
      ENTREGADO: await createOrder(fixture, { status: 'ENTREGADO' }),
      CANCELADO: await createOrder(fixture, { status: 'CANCELADO' }),
    };
    try {
      for (const [estado, pedido] of Object.entries(pedidos)) {
        const resultado = await finishPackingAliveById(pedido, fixture.companyId, fixture.packerId, new Date());
        expect(resultado, estado).toBe('not_packable');
      }
    } finally {
      await borrarFixture(fixture, Object.values(pedidos));
    }
  });

  it('R24: Terminar sobre un pedido inexistente, dado de baja o de otra empresa es not_found', async () => {
    const fixture = await crearFixture();
    const otra = await crearOtraEmpresa();
    // `orders_delivered_not_deleted` prohibe `deleted_at` en EN_EMPAQUE: la unica forma real de
    // un pedido "dado de baja" es un estado anterior, como PENDIENTE.
    const borrado = await createOrder(fixture, { status: 'PENDIENTE', deletedAt: new Date() });
    const propio = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const inexistente = await finishPackingAliveById(randomUUID(), fixture.companyId, fixture.packerId, new Date());
      expect(inexistente).toBe('not_found');

      const dadoDeBaja = await finishPackingAliveById(borrado, fixture.companyId, fixture.packerId, new Date());
      expect(dadoDeBaja).toBe('not_found');

      const cruzado = await finishPackingAliveById(propio, otra.companyId, otra.packerId, new Date());
      expect(cruzado).toBe('not_found');
    } finally {
      await borrarFixture(fixture, [borrado, propio]);
      await borrarOtraEmpresa(otra);
    }
  });

  it('R27: un pedido terminado por Terminar aparece con su finished_at, sin ninguna otra accion', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, { status: 'EN_EMPAQUE', packedBy: fixture.packerId });
    try {
      const ahora = new Date();
      await finishPackingAliveById(pedido, fixture.companyId, fixture.packerId, ahora);

      const fila = await prisma.order.findUniqueOrThrow({
        where: { id: pedido },
        select: { status: true, finishedAt: true },
      });
      expect(fila.status).toBe('ENTREGADO');
      expect(fila.finishedAt).toEqual(ahora);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });
});
