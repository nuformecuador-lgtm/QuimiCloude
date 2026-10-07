/**
 * La anotacion de la ejecucion y la escritura del pedido se confirman juntas o ninguna, contra
 * Postgres real y con la composicion real (`asignaciones` y `pedidos` de `@/lib/composition`).
 *
 * Como se fuerza el fallo: el registro atado a la transaccion de ejecucion se envuelve para que,
 * con `falloDeAnotacion.activo`, escriba la fila con `step_position = 0`. La rechaza el `CHECK` de
 * la tabla dentro de la misma transaccion, asi que el error es de la base y no un doble. El
 * registro global (anotar un paso, retomar) no se toca.
 *
 * AISLAMIENTO: `commit`. `withExecutionTransaction` abre su propia transaccion sobre el cliente
 * global, y lo que se mide es justo que su ROLLBACK deshaga lo escrito. Cada caso fabrica su
 * empresa efimera y la borra en su `finally`: anotaciones antes que pedidos, y los lotes de
 * producto terminado antes que sus productos y que la receta.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { NewExecutionEntry } from '@/lib/modules/asignaciones';

const falloDeAnotacion = vi.hoisted(() => ({ activo: false }));

vi.mock('@/lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/lib/modules/asignaciones/adapters/driven/persistence/execution-log-prisma')>();
  return {
    ...real,
    createExecutionLogRepository: (db?: Parameters<typeof real.createExecutionLogRepository>[0]) => {
      const repo = real.createExecutionLogRepository(db);
      // Sin cliente es el registro global de la composicion: ese no corre dentro de la transaccion.
      if (db === undefined) return repo;
      return {
        ...repo,
        append: (entry: NewExecutionEntry) =>
          repo.append(falloDeAnotacion.activo ? ({ ...entry, stepPosition: 0 } as unknown as NewExecutionEntry) : entry),
      };
    },
  };
});

import { asignaciones, pedidos } from '@/lib/composition';
import { MaterialShortageError, OrderBlockedError, OrderDeliveredFrozenError } from '@/lib/modules/asignaciones';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { createWithFirstBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import { seedPackaging } from '../../helpers/packaging-seed';

/** El rechazo viene de Postgres: uno de los dos CHECK de posicion de la tabla. */
const CHECK_DE_POSICION = /order_execution_entries_(step_position_positive|packing_has_no_step)/u;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Actor = { readonly id: string; readonly companyId: string; readonly permissions: readonly string[] };

type Fixture = {
  readonly companyId: string;
  readonly operarioId: string;
  readonly otroOperarioId: string;
  readonly empacadorId: string;
  readonly roleIds: readonly string[];
  readonly documentTypeCode: string;
  readonly unitId: string;
  readonly presentationId: string;
  readonly packagingProductId: string;
  readonly workGroupId: string;
  readonly workGroupName: string;
};

async function crearPersona(companyId: string, roleId: string, documentTypeCode: string): Promise<string> {
  const marca = token();
  const user = await prisma.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode,
      documentNumber: marca.slice(0, 12),
      username: `ana.${marca}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId,
      accountStatus: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

async function crearFixture(): Promise<Fixture> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const rolOperario = await prisma.role.create({
    data: { name: `rol-operario-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const rolEmpacador = await prisma.role.create({
    data: { name: `rol-empacador-${marca}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  // El auto-asignado del Finalizar lee este permiso de la base, no del actor.
  await prisma.rolePermission.create({ data: { roleId: rolEmpacador.id, permissionCode: 'empaque.modificar' } });
  const nombre = `Empresa ejecucion ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const operarioId = await crearPersona(company.id, rolOperario.id, documentType.code);
  const otroOperarioId = await crearPersona(company.id, rolOperario.id, documentType.code);
  const empacadorId = await crearPersona(company.id, rolEmpacador.id, documentType.code);
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
    select: { id: true },
  });
  const presentation = await prisma.presentation.create({
    data: {
      name: `Botella ${marca}`,
      nameNormalized: `botella${marca}`,
      unitId: unit.id,
      companyId: company.id,
      content: '1.0000',
    },
    select: { id: true },
  });
  const workGroupName = `Turno ${marca}`;
  const workGroup = await prisma.workGroup.create({
    data: { name: workGroupName, nameNormalized: `turno${marca}`, companyId: company.id },
    select: { id: true },
  });
  await prisma.workGroupMember.create({
    data: { workGroupId: workGroup.id, userId: empacadorId, companyId: company.id },
  });
  return {
    companyId: company.id,
    operarioId,
    otroOperarioId,
    empacadorId,
    roleIds: [rolOperario.id, rolEmpacador.id],
    documentTypeCode: documentType.code,
    unitId: unit.id,
    presentationId: presentation.id,
    packagingProductId: await seedPackaging({
      companyId: company.id,
      presentationId: presentation.id,
      createdBy: operarioId,
    }),
    workGroupId: workGroup.id,
    workGroupName,
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  const companyId = fixture.companyId;
  await prisma.orderExecutionEntry.deleteMany({ where: { companyId } });
  await prisma.reservationMovement.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId } });
  await prisma.orderAssignment.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.recipeLine.deleteMany({ where: { recipe: { companyId } } });
  // El producto terminado referencia la receta: sus lotes y el producto caen antes que ella.
  await prisma.productBatch.deleteMany({ where: { product: { companyId, type: 'FINISHED_PRODUCT' } } });
  await prisma.product.deleteMany({ where: { companyId, type: 'FINISHED_PRODUCT' } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { product: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.presentation.deleteMany({ where: { companyId } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.workGroupMember.deleteMany({ where: { companyId } });
  await prisma.workGroup.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [...fixture.roleIds] } } });
  await prisma.role.deleteMany({ where: { id: { in: [...fixture.roleIds] } } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function conFixture(caso: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await crearFixture();
  try {
    await caso(fixture);
  } finally {
    falloDeAnotacion.activo = false;
    await borrarFixture(fixture);
  }
}

async function conAnotacionFallida<T>(trabajo: () => Promise<T>): Promise<T> {
  falloDeAnotacion.activo = true;
  try {
    return await trabajo();
  } finally {
    falloDeAnotacion.activo = false;
  }
}

function operario(fixture: Fixture, id = fixture.operarioId): Actor {
  return { id, companyId: fixture.companyId, permissions: ['asignaciones.consultar', 'asignaciones.ejecutar'] };
}

function empacador(fixture: Fixture): Actor {
  return { id: fixture.empacadorId, companyId: fixture.companyId, permissions: ['empaque.modificar'] };
}

function quienPide(fixture: Fixture): Actor {
  return { id: fixture.operarioId, companyId: fixture.companyId, permissions: ['pedidos.consultar', 'pedidos.modificar'] };
}

type Pedido = { readonly orderId: string; readonly batchId: string };

/**
 * Un pedido real de 10 en 10 envases: una receta al 100 % de un insumo con `stock` de existencia,
 * dado de alta por `pedidos.createOrder`, que aparta insumo y envases. El operario lo tiene
 * asignado por el equipo del empacador, para que el Finalizar tenga a quien auto-asignar.
 */
async function crearPedido(
  fixture: Fixture,
  opciones: { readonly stock?: string; readonly confirmBlocked?: boolean } = {},
): Promise<Pedido> {
  const marca = token();
  const insumo = await createWithFirstBatch(
    { name: `Insumo ${marca}` },
    {
      presentationId: fixture.presentationId,
      stock: opciones.stock ?? '100',
      unitCost: '2.5000',
      lot: null,
      purchaseDate: '2026-09-01',
      expiryDate: null,
      createdBy: fixture.operarioId,
    },
    new Date(),
    { companyId: fixture.companyId },
  );
  const receta = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: fixture.companyId },
    select: { id: true },
  });
  await prisma.recipeLine.create({ data: { recipeId: receta.id, productId: insumo.id, percentage: '100.00' } });

  const creado = await pedidos.createOrder(
    {
      recipeId: receta.id,
      quantity: '10.0000',
      priority: 'BAJA',
      unitId: fixture.unitId,
      presentationLines: [{ packagingProductId: fixture.packagingProductId, packages: 10 }],
      confirmBlocked: opciones.confirmBlocked ?? false,
    },
    quienPide(fixture),
  );
  const ahora = new Date();
  await prisma.orderAssignment.createMany({
    data: [fixture.operarioId, fixture.otroOperarioId].map((userId) => ({
      orderId: creado.id,
      userId,
      companyId: fixture.companyId,
      workGroupId: fixture.workGroupId,
      workGroupName: fixture.workGroupName,
      createdAt: ahora,
      updatedAt: ahora,
    })),
  });
  return { orderId: creado.id, batchId: insumo.batchId };
}

async function enCurso(fixture: Fixture): Promise<Pedido> {
  const pedido = await crearPedido(fixture);
  await asignaciones.startAssignedOrder(operario(fixture), { orderId: pedido.orderId });
  return pedido;
}

async function porEmpacar(fixture: Fixture): Promise<Pedido> {
  const pedido = await enCurso(fixture);
  await asignaciones.finishAssignedOrder(operario(fixture), { orderId: pedido.orderId, stepPosition: null });
  return pedido;
}

async function enEmpaque(fixture: Fixture): Promise<Pedido> {
  const pedido = await porEmpacar(fixture);
  await asignaciones.startPacking(empacador(fixture), { orderId: pedido.orderId });
  return pedido;
}

async function anotaciones(orderId: string) {
  return prisma.orderExecutionEntry.findMany({
    where: { orderId },
    select: { action: true, stepPosition: true, reason: true, userId: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
}

async function pedidoEnBase(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, packedBy: true, finishedAt: true, cancellationReason: true, updatedAt: true },
  });
}

async function movimientosDeReserva(orderId: string) {
  const rows = await prisma.reservationMovement.findMany({
    where: { orderId },
    select: { id: true, kind: true, quantity: true, createdBy: true, batchId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({ ...row, quantity: row.quantity.toFixed(4) }));
}

async function apartadoNeto(orderId: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ neto: string | null }[]>`
    SELECT SUM(CASE WHEN "kind" = 'reserve' THEN "quantity" ELSE -"quantity" END)::text AS "neto"
      FROM "reservation_movements"
     WHERE "order_id" = ${orderId}::uuid`;
  return Number(rows[0]?.neto ?? '0').toFixed(4);
}

async function asientosDeInventario(orderId: string): Promise<number> {
  return prisma.inventoryMovement.count({ where: { orderId } });
}

async function existencia(batchId: string): Promise<string> {
  const row = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return row.stock.toFixed(4);
}

async function existenciaDeEnvases(fixture: Fixture): Promise<string> {
  const row = await prisma.product.findUniqueOrThrow({ where: { id: fixture.packagingProductId }, select: { stock: true } });
  return row.stock.toFixed(4);
}

async function responsables(orderId: string): Promise<readonly string[]> {
  const rows = await prisma.orderAssignment.findMany({ where: { orderId }, select: { userId: true } });
  return rows.map((row) => row.userId).sort();
}

async function productoTerminado(fixture: Fixture): Promise<number> {
  return prisma.product.count({ where: { companyId: fixture.companyId, type: 'FINISHED_PRODUCT' } });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('asignaciones · la anotacion y el pedido se confirman juntos (Postgres real)', () => {
  it('R24: arrancar con la anotacion rechazada por la base deja el pedido PENDIENTE y ninguna fila', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await crearPedido(fixture);
      const reservasAntes = await movimientosDeReserva(orderId);

      await expect(
        conAnotacionFallida(() => asignaciones.startAssignedOrder(operario(fixture), { orderId })),
      ).rejects.toThrow(CHECK_DE_POSICION);

      expect((await pedidoEnBase(orderId)).status).toBe('PENDIENTE');
      expect(await anotaciones(orderId)).toEqual([]);
      expect(await movimientosDeReserva(orderId)).toEqual(reservasAntes);
    });
  });

  it('R44: abrir un BLOQUEADO no anota nada y no cambia el estado', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await crearPedido(fixture, { stock: '1', confirmBlocked: true });
      const antes = await pedidoEnBase(orderId);
      expect(antes.status).toBe('BLOQUEADO');

      await expect(asignaciones.startAssignedOrder(operario(fixture), { orderId })).rejects.toBeInstanceOf(
        OrderBlockedError,
      );

      expect(await pedidoEnBase(orderId)).toEqual(antes);
      expect(await anotaciones(orderId)).toEqual([]);
    });
  });

  it('R24: finalizar con la anotacion rechazada deja EN_CURSO, sin consumo y sin el empacador que habia asignado', async () => {
    await conFixture(async (fixture) => {
      const { orderId, batchId } = await enCurso(fixture);
      const reservasAntes = await movimientosDeReserva(orderId);
      const responsablesAntes = await responsables(orderId);
      expect(responsablesAntes).not.toContain(fixture.empacadorId);

      await expect(
        conAnotacionFallida(() =>
          asignaciones.finishAssignedOrder(operario(fixture), { orderId, stepPosition: null }),
        ),
      ).rejects.toThrow(CHECK_DE_POSICION);

      expect((await pedidoEnBase(orderId)).status).toBe('EN_CURSO');
      expect(await movimientosDeReserva(orderId)).toEqual(reservasAntes);
      expect(await asientosDeInventario(orderId)).toBe(0);
      expect(await existencia(batchId)).toBe('100.0000');
      expect(await responsables(orderId)).toEqual(responsablesAntes);
      expect((await anotaciones(orderId)).map((fila) => fila.action)).toEqual(['START']);
    });
  });

  it('R24: con la anotacion buena, el mismo Finalizar si consume, asigna al empacador y anota FINISH', async () => {
    await conFixture(async (fixture) => {
      const { orderId, batchId } = await enCurso(fixture);

      await asignaciones.finishAssignedOrder(operario(fixture), { orderId, stepPosition: null });

      expect((await pedidoEnBase(orderId)).status).toBe('POR_EMPACAR');
      expect(await existencia(batchId)).toBe('90.0000');
      expect(await responsables(orderId)).toContain(fixture.empacadorId);
      expect((await anotaciones(orderId)).map((fila) => fila.action)).toEqual(['START', 'FINISH']);
    });
  });

  it('R24: finalizar sin material suficiente no anota, no consume y no cambia el estado', async () => {
    await conFixture(async (fixture) => {
      const { orderId, batchId } = await enCurso(fixture);
      // Merma por fuera de la aplicacion: lo apartado ya no esta en el lote.
      await prisma.productBatch.update({ where: { id: batchId }, data: { stock: '0' } });
      const reservasAntes = await movimientosDeReserva(orderId);
      const responsablesAntes = await responsables(orderId);

      await expect(
        asignaciones.finishAssignedOrder(operario(fixture), { orderId, stepPosition: null }),
      ).rejects.toBeInstanceOf(MaterialShortageError);

      expect((await pedidoEnBase(orderId)).status).toBe('EN_CURSO');
      expect(await existencia(batchId)).toBe('0.0000');
      expect(await movimientosDeReserva(orderId)).toEqual(reservasAntes);
      expect(await asientosDeInventario(orderId)).toBe(0);
      expect(await responsables(orderId)).toEqual(responsablesAntes);
      expect((await anotaciones(orderId)).map((fila) => fila.action)).toEqual(['START']);
    });
  });

  it('R24: cancelar con la anotacion rechazada deja EN_CURSO, sin motivo y con las reservas intactas', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await enCurso(fixture);
      const reservasAntes = await movimientosDeReserva(orderId);
      expect(reservasAntes.length).toBeGreaterThan(0);

      await expect(
        conAnotacionFallida(() =>
          asignaciones.cancelAssignedOrder(operario(fixture), { orderId, stepPosition: 2, reason: 'Se rompio el reactor' }),
        ),
      ).rejects.toThrow(CHECK_DE_POSICION);

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('EN_CURSO');
      expect(fila.cancellationReason).toBeNull();
      expect(await movimientosDeReserva(orderId)).toEqual(reservasAntes);
      expect((await anotaciones(orderId)).map((anotacion) => anotacion.action)).toEqual(['START']);
    });
  });

  it('R23, R29: cancelar guarda el mismo motivo en el pedido y en la fila, y libera todo lo apartado a nombre de quien cancela', async () => {
    await conFixture(async (fixture) => {
      const { orderId, batchId } = await enCurso(fixture);
      const quienCancela = operario(fixture, fixture.otroOperarioId);
      expect(Number(await apartadoNeto(orderId))).toBeGreaterThan(0);
      const reservasAntes = await movimientosDeReserva(orderId);

      await asignaciones.cancelAssignedOrder(quienCancela, {
        orderId,
        stepPosition: 2,
        reason: '  Falta el operario del turno  ',
      });

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('CANCELADO');
      const cancelaciones = (await anotaciones(orderId)).filter((anotacion) => anotacion.action === 'CANCEL');
      expect(cancelaciones).toHaveLength(1);
      expect(cancelaciones[0]?.reason).toBe('Falta el operario del turno');
      expect(cancelaciones[0]?.userId).toBe(fixture.otroOperarioId);
      expect(cancelaciones[0]?.stepPosition).toBe(2);
      expect(fila.cancellationReason).toBe(cancelaciones[0]?.reason);

      expect(await apartadoNeto(orderId)).toBe('0.0000');
      const nuevos = (await movimientosDeReserva(orderId)).filter(
        (movimiento) => !reservasAntes.some((antes) => antes.id === movimiento.id),
      );
      expect(nuevos.length).toBeGreaterThan(0);
      expect(nuevos.every((movimiento) => movimiento.kind === 'release')).toBe(true);
      expect(nuevos.every((movimiento) => movimiento.createdBy === fixture.otroOperarioId)).toBe(true);
      expect(await asientosDeInventario(orderId)).toBe(0);
      expect(await existencia(batchId)).toBe('100.0000');
      expect(await existenciaDeEnvases(fixture)).toBe('1000.0000');
    });
  });

  it('R16: dos arranques a la vez sobre un PENDIENTE dejan un START y un RESUME', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await crearPedido(fixture);

      // Sin `await` entre las dos: compiten de verdad por el candado de la fila.
      const resultados = await Promise.allSettled([
        asignaciones.startAssignedOrder(operario(fixture), { orderId }),
        asignaciones.startAssignedOrder(operario(fixture, fixture.otroOperarioId), { orderId }),
      ]);

      const rechazos = resultados.flatMap((resultado) =>
        resultado.status === 'rejected' ? [String(resultado.reason)] : [],
      );
      expect(rechazos).toEqual([]);
      expect((await pedidoEnBase(orderId)).status).toBe('EN_CURSO');
      const acciones = (await anotaciones(orderId)).map((fila) => fila.action).sort();
      expect(acciones).toEqual(['RESUME', 'START']);
    });
  });

  it('R20: anotar un paso sobre un ENTREGADO no escribe nada', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await enEmpaque(fixture);
      await asignaciones.finishPacking(empacador(fixture), { orderId });
      expect((await pedidoEnBase(orderId)).status).toBe('ENTREGADO');
      const antes = await anotaciones(orderId);

      await expect(
        asignaciones.recordStepMove(operario(fixture), { orderId, direction: 'advance', stepPosition: 2 }),
      ).rejects.toBeInstanceOf(OrderDeliveredFrozenError);

      expect(await anotaciones(orderId)).toEqual(antes);
    });
  });
});

describe('asignaciones · el empaque y su anotacion se confirman juntos (Postgres real)', () => {
  it('R24: comenzar empaque con la anotacion rechazada deja POR_EMPACAR, sin packed_by y sin fila', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await porEmpacar(fixture);
      const antes = await anotaciones(orderId);

      await expect(
        conAnotacionFallida(() => asignaciones.startPacking(empacador(fixture), { orderId })),
      ).rejects.toThrow(CHECK_DE_POSICION);

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('POR_EMPACAR');
      expect(fila.packedBy).toBeNull();
      expect(await anotaciones(orderId)).toEqual(antes);
    });
  });

  it('R24, R41: terminar empaque con la anotacion rechazada deja EN_EMPAQUE, sin finished_at, sin lote y sin consumo de envases', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await enEmpaque(fixture);
      const antes = await anotaciones(orderId);
      const apartadoAntes = await apartadoNeto(orderId);
      const asientosAntes = await asientosDeInventario(orderId);

      await expect(
        conAnotacionFallida(() => asignaciones.finishPacking(empacador(fixture), { orderId })),
      ).rejects.toThrow(CHECK_DE_POSICION);

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('EN_EMPAQUE');
      expect(fila.finishedAt).toBeNull();
      expect(await productoTerminado(fixture)).toBe(0);
      expect(await existenciaDeEnvases(fixture)).toBe('1000.0000');
      expect(await apartadoNeto(orderId)).toBe(apartadoAntes);
      expect(await asientosDeInventario(orderId)).toBe(asientosAntes);
      expect(await anotaciones(orderId)).toEqual(antes);
    });
  });

  it('R24: terminar empaque sin envases suficientes no anota, no da de alta lote y no consume nada', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await enEmpaque(fixture);
      // Merma por fuera de la aplicacion: quedan 4 envases de los 10 apartados.
      await prisma.productBatch.updateMany({ where: { productId: fixture.packagingProductId }, data: { stock: '4' } });
      await prisma.product.update({ where: { id: fixture.packagingProductId }, data: { stock: '4' } });
      const antes = await anotaciones(orderId);
      const apartadoAntes = await apartadoNeto(orderId);
      const asientosAntes = await asientosDeInventario(orderId);

      await expect(asignaciones.finishPacking(empacador(fixture), { orderId })).rejects.toBeInstanceOf(
        MaterialShortageError,
      );

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('EN_EMPAQUE');
      expect(fila.finishedAt).toBeNull();
      expect(await productoTerminado(fixture)).toBe(0);
      expect(await existenciaDeEnvases(fixture)).toBe('4.0000');
      expect(await apartadoNeto(orderId)).toBe(apartadoAntes);
      expect(await asientosDeInventario(orderId)).toBe(asientosAntes);
      expect(await anotaciones(orderId)).toEqual(antes);
    });
  });

  it('R41: comenzar otra vez el propio EN_EMPAQUE no anota y deja el pedido como estaba', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await enEmpaque(fixture);
      const filaAntes = await pedidoEnBase(orderId);
      const antes = await anotaciones(orderId);

      await asignaciones.startPacking(empacador(fixture), { orderId });

      expect(await pedidoEnBase(orderId)).toEqual(filaAntes);
      expect(await anotaciones(orderId)).toEqual(antes);
    });
  });

  it('R41, R5bis: comenzar y terminar con la anotacion buena dejan una fila PACK_START y una PACK_FINISH sin posicion', async () => {
    await conFixture(async (fixture) => {
      const { orderId } = await porEmpacar(fixture);

      await asignaciones.startPacking(empacador(fixture), { orderId });
      await asignaciones.finishPacking(empacador(fixture), { orderId });

      const fila = await pedidoEnBase(orderId);
      expect(fila.status).toBe('ENTREGADO');
      expect(fila.packedBy).toBe(fixture.empacadorId);
      expect(fila.finishedAt).not.toBeNull();
      expect(await productoTerminado(fixture)).toBe(1);
      const empaque = (await anotaciones(orderId)).filter(
        (anotacion) => anotacion.action === 'PACK_START' || anotacion.action === 'PACK_FINISH',
      );
      expect(empaque).toEqual([
        { action: 'PACK_START', stepPosition: null, reason: null, userId: fixture.empacadorId },
        { action: 'PACK_FINISH', stepPosition: null, reason: null, userId: fixture.empacadorId },
      ]);
    });
  });
});
