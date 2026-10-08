/**
 * `startConditioningAliveById` / `finishConditioningAliveById` contra Postgres REAL, cableados
 * como `lib/composition`: `createStartConditioning`/`createFinishConditioning` sobre
 * `startConditioningAliveOrder`/`finishConditioningAliveOrder` (`order-prisma.ts`), que usan el
 * cliente Prisma GLOBAL con un `updateMany` condicional.
 *
 * AISLAMIENTO: `commit`. Una transaccion del test con ROLLBACK impediria que dos Comenzar reales
 * compitan por el bloqueo de la misma fila (R10). Cada caso fabrica su propia empresa efimera con
 * randomUUID y la limpia en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { createFinishConditioning, createStartConditioning } from '@/lib/modules/pedidos';
import {
  finishConditioningAliveOrder,
  startConditioningAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { OrderStatus } from '@/lib/modules/pedidos';
import type { OrderConditioningRepository } from '@/lib/modules/pedidos/ports/order-conditioning-repository';

const conditioningRepository: OrderConditioningRepository = {
  startConditioningAlive: startConditioningAliveOrder,
  finishConditioningAlive: finishConditioningAliveOrder,
};

const startConditioningAliveById = createStartConditioning({ conditioning: conditioningRepository });
const finishConditioningAliveById = createFinishConditioning({ conditioning: conditioningRepository });

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let nextSequence = 900_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

type Fixture = {
  readonly companyId: string;
  readonly recipeId: string;
  /** Quien empaco: `packed_by` de los pedidos ya empacados. */
  readonly packerId: string;
  readonly conditionerId: string;
  readonly otherConditionerId: string;
  readonly documentTypeCodes: readonly string[];
};

async function createCompany(label: string): Promise<string> {
  const name = `Empresa ${label} ${token()}`;
  const company = await prisma.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function createUser(companyId: string): Promise<{ id: string; documentTypeCode: string }> {
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
  return { id: user.id, documentTypeCode: documentType.code };
}

async function borrarUsuarios(userIds: readonly string[], documentTypeCodes: readonly string[]): Promise<void> {
  const users = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { roleId: true } });
  await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
  await prisma.role.deleteMany({ where: { id: { in: users.map((u) => u.roleId) } } });
  await prisma.documentType.deleteMany({ where: { code: { in: [...documentTypeCodes] } } });
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const companyId = await createCompany('acondicionamiento');
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  const packer = await createUser(companyId);
  const conditioner = await createUser(companyId);
  const otherConditioner = await createUser(companyId);
  return {
    companyId,
    recipeId: recipe.id,
    packerId: packer.id,
    conditionerId: conditioner.id,
    otherConditionerId: otherConditioner.id,
    documentTypeCodes: [packer.documentTypeCode, conditioner.documentTypeCode, otherConditioner.documentTypeCode],
  };
}

async function borrarFixture(fixture: Fixture, orderIds: readonly string[]): Promise<void> {
  await prisma.order.deleteMany({ where: { id: { in: [...orderIds] } } });
  await prisma.recipe.deleteMany({ where: { id: fixture.recipeId } });
  await borrarUsuarios([fixture.packerId, fixture.conditionerId, fixture.otherConditionerId], fixture.documentTypeCodes);
  await prisma.company.deleteMany({ where: { id: fixture.companyId } });
}

/** Siembra un pedido en `status` con las columnas que sus `CHECK` exigen. */
async function createOrder(
  fixture: Fixture,
  status: OrderStatus,
  overrides: { readonly conditionedBy?: string; readonly deletedAt?: Date } = {},
): Promise<string> {
  const empacado = ['EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'].includes(status);
  const acondicionado = status === 'EN_ACONDICIONAMIENTO' || status === 'TERMINADO';
  const order = await prisma.order.create({
    data: {
      companyId: fixture.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: freshSequence(),
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
      status,
      packedBy: empacado ? fixture.packerId : null,
      conditionedBy: acondicionado ? (overrides.conditionedBy ?? fixture.conditionerId) : null,
      finishedAt: status === 'TERMINADO' ? new Date('2026-10-01T10:00:00Z') : null,
      deletedAt: overrides.deletedAt ?? null,
      ...(status === 'CANCELADO' ? { cancellationReason: 'motivo de prueba' } : {}),
    },
    select: { id: true },
  });
  return order.id;
}

type OrderSnapshot = {
  readonly status: OrderStatus;
  readonly packedBy: string | null;
  readonly conditionedBy: string | null;
  readonly finishedAt: Date | null;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
};

async function readOrder(id: string): Promise<OrderSnapshot> {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, packedBy: true, conditionedBy: true, finishedAt: true, updatedAt: true, updatedBy: true },
  });
}

/** Lo que el acondicionamiento NO debe tocar: asientos de inventario y lotes de la empresa. */
async function inventarioDe(companyId: string): Promise<{ movimientos: number; lotes: number }> {
  return {
    movimientos: await prisma.inventoryMovement.count({ where: { companyId } }),
    lotes: await prisma.productBatch.count({ where: { companyId } }),
  };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('startConditioningAliveById contra la base', () => {
  it('R8: sobre POR_ACONDICIONAR deja EN_ACONDICIONAMIENTO con el actor como quien acondiciona y autor, conserva packed_by y no toca inventario ni finished_at', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'POR_ACONDICIONAR');
    try {
      const inventarioAntes = await inventarioDe(fixture.companyId);
      const ahora = new Date();

      await expect(startConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, ahora)).resolves.toBe('ok');

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('EN_ACONDICIONAMIENTO');
      expect(fila.conditionedBy).toBe(fixture.conditionerId);
      expect(fila.updatedBy).toBe(fixture.conditionerId);
      expect(fila.updatedAt).toEqual(ahora);
      expect(fila.packedBy).toBe(fixture.packerId);
      expect(fila.finishedAt).toBeNull();
      expect(await inventarioDe(fixture.companyId)).toEqual(inventarioAntes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R9: el mismo acondicionador sobre su EN_ACONDICIONAMIENTO es already_mine, sin escribir nada', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'EN_ACONDICIONAMIENTO');
    try {
      const antes = await readOrder(pedido);
      await expect(startConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, new Date())).resolves.toBe(
        'already_mine',
      );
      expect(await readOrder(pedido)).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R9: sobre un EN_ACONDICIONAMIENTO de otra persona es taken, sin escribir nada', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'EN_ACONDICIONAMIENTO');
    try {
      const antes = await readOrder(pedido);
      await expect(
        startConditioningAliveById(pedido, fixture.companyId, fixture.otherConditionerId, new Date()),
      ).resolves.toBe('taken');
      expect(await readOrder(pedido)).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R10: dos Comenzar reales a la vez sobre el mismo POR_ACONDICIONAR dejan a uno ok y al otro taken', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'POR_ACONDICIONAR');
    try {
      // Sin `await` entre las dos: compiten de verdad por el bloqueo de la fila.
      const [uno, dos] = await Promise.all([
        startConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, new Date()),
        startConditioningAliveById(pedido, fixture.companyId, fixture.otherConditionerId, new Date()),
      ]);

      expect([uno, dos].filter((r) => r === 'ok')).toHaveLength(1);
      expect([uno, dos].filter((r) => r === 'taken')).toHaveLength(1);

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('EN_ACONDICIONAMIENTO');
      expect(fila.conditionedBy).toBe(uno === 'ok' ? fixture.conditionerId : fixture.otherConditionerId);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R14: sobre cualquier estado distinto de POR_ACONDICIONAR y EN_ACONDICIONAMIENTO es not_conditionable, sin escribir', async () => {
    const fixture = await crearFixture();
    const estados: readonly OrderStatus[] = [
      'PENDIENTE',
      'EN_CURSO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'TERMINADO',
      'ENTREGADO',
      'CANCELADO',
      'BLOQUEADO',
    ];
    const pedidos = new Map<OrderStatus, string>();
    try {
      for (const estado of estados) pedidos.set(estado, await createOrder(fixture, estado));
      for (const [estado, pedido] of pedidos) {
        const antes = await readOrder(pedido);
        const resultado = await startConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, new Date());
        expect(resultado, estado).toBe('not_conditionable');
        expect(await readOrder(pedido), estado).toEqual(antes);
      }
    } finally {
      await borrarFixture(fixture, [...pedidos.values()]);
    }
  });

  it('R14: un pedido inexistente, dado de baja o de otra empresa es not_found', async () => {
    const fixture = await crearFixture();
    const otraEmpresa = await createCompany('ajena');
    const ajeno = await createUser(otraEmpresa);
    // `orders_delivered_not_deleted` prohibe la baja en los estados de empaque y acondicionamiento.
    const borrado = await createOrder(fixture, 'PENDIENTE', { deletedAt: new Date() });
    const propio = await createOrder(fixture, 'POR_ACONDICIONAR');
    try {
      await expect(
        startConditioningAliveById(randomUUID(), fixture.companyId, fixture.conditionerId, new Date()),
      ).resolves.toBe('not_found');
      await expect(startConditioningAliveById(borrado, fixture.companyId, fixture.conditionerId, new Date())).resolves.toBe(
        'not_found',
      );

      const antes = await readOrder(propio);
      await expect(startConditioningAliveById(propio, otraEmpresa, ajeno.id, new Date())).resolves.toBe('not_found');
      expect(await readOrder(propio)).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [borrado, propio]);
      await borrarUsuarios([ajeno.id], [ajeno.documentTypeCode]);
      await prisma.company.deleteMany({ where: { id: otraEmpresa } });
    }
  });
});

describe('finishConditioningAliveById contra la base', () => {
  it('R12: quien acondiciona deja TERMINADO con finished_at = now, conserva packed_by y quien acondiciona, y no toca inventario', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'EN_ACONDICIONAMIENTO');
    try {
      const inventarioAntes = await inventarioDe(fixture.companyId);
      const ahora = new Date();

      await expect(finishConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, ahora)).resolves.toBe('ok');

      const fila = await readOrder(pedido);
      expect(fila.status).toBe('TERMINADO');
      expect(fila.finishedAt).toEqual(ahora);
      expect(fila.packedBy).toBe(fixture.packerId);
      expect(fila.conditionedBy).toBe(fixture.conditionerId);
      expect(fila.updatedBy).toBe(fixture.conditionerId);
      expect(fila.updatedAt).toEqual(ahora);
      expect(await inventarioDe(fixture.companyId)).toEqual(inventarioAntes);
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R13: otra persona con el permiso recibe not_conditioner y el pedido sigue EN_ACONDICIONAMIENTO sin finished_at', async () => {
    const fixture = await crearFixture();
    const pedido = await createOrder(fixture, 'EN_ACONDICIONAMIENTO');
    try {
      const antes = await readOrder(pedido);
      await expect(
        finishConditioningAliveById(pedido, fixture.companyId, fixture.otherConditionerId, new Date()),
      ).resolves.toBe('not_conditioner');

      const despues = await readOrder(pedido);
      expect(despues).toEqual(antes);
      expect(despues.status).toBe('EN_ACONDICIONAMIENTO');
      expect(despues.finishedAt).toBeNull();
    } finally {
      await borrarFixture(fixture, [pedido]);
    }
  });

  it('R14: sobre cualquier estado distinto de EN_ACONDICIONAMIENTO es not_conditionable, sin escribir', async () => {
    const fixture = await crearFixture();
    const estados: readonly OrderStatus[] = [
      'PENDIENTE',
      'EN_CURSO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'POR_ACONDICIONAR',
      'TERMINADO',
      'ENTREGADO',
      'CANCELADO',
      'BLOQUEADO',
    ];
    const pedidos = new Map<OrderStatus, string>();
    try {
      for (const estado of estados) pedidos.set(estado, await createOrder(fixture, estado));
      for (const [estado, pedido] of pedidos) {
        const antes = await readOrder(pedido);
        const resultado = await finishConditioningAliveById(pedido, fixture.companyId, fixture.conditionerId, new Date());
        expect(resultado, estado).toBe('not_conditionable');
        expect(await readOrder(pedido), estado).toEqual(antes);
      }
    } finally {
      await borrarFixture(fixture, [...pedidos.values()]);
    }
  });

  it('R14: un pedido inexistente, dado de baja o de otra empresa es not_found', async () => {
    const fixture = await crearFixture();
    const otraEmpresa = await createCompany('ajena');
    const ajeno = await createUser(otraEmpresa);
    const borrado = await createOrder(fixture, 'PENDIENTE', { deletedAt: new Date() });
    const propio = await createOrder(fixture, 'EN_ACONDICIONAMIENTO');
    try {
      await expect(
        finishConditioningAliveById(randomUUID(), fixture.companyId, fixture.conditionerId, new Date()),
      ).resolves.toBe('not_found');
      await expect(finishConditioningAliveById(borrado, fixture.companyId, fixture.conditionerId, new Date())).resolves.toBe(
        'not_found',
      );

      const antes = await readOrder(propio);
      await expect(finishConditioningAliveById(propio, otraEmpresa, ajeno.id, new Date())).resolves.toBe('not_found');
      expect(await readOrder(propio)).toEqual(antes);
    } finally {
      await borrarFixture(fixture, [borrado, propio]);
      await borrarUsuarios([ajeno.id], [ajeno.documentTypeCode]);
      await prisma.company.deleteMany({ where: { id: otraEmpresa } });
    }
  });
});
