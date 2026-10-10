/**
 * QC-219 T8 — Terminar exige los datos de lote, contra Postgres real y con la composicion real
 * (`asignaciones` de `@/lib/composition`): `finishConditioning`, `saveConditioningBatchData` y
 * `getConditioningOrder` con sus adaptadores de produccion.
 *
 * AISLAMIENTO: `commit`. Guardar abre su propia `prisma.$transaction` sobre el cliente global y
 * Terminar escribe con el cliente global; lo sembrado tiene que quedar confirmado. Cada caso fabrica
 * su empresa efimera con randomUUID y la borra en su `finally`, en orden de FK.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { asignaciones } from '@/lib/composition';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { receiveFinishedGoods } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

type Actor = { readonly id: string; readonly companyId: string; readonly permissions: readonly string[] };

const PERMISOS_ACONDICIONADOR = ['asignaciones.consultar', 'acondicionamiento.modificar'] as const;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** El dia civil UTC desplazado `dias`, como lo compara el caso de uso. */
function diaUtc(dias: number): string {
  const instante = new Date();
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

let nextSequence = 960_000;
function freshSequence(): number {
  nextSequence += 1;
  return nextSequence;
}

type Fixture = {
  readonly companyId: string;
  readonly documentTypeCode: string;
  readonly roleIds: readonly string[];
  readonly recipeId: string;
  readonly unitId: string;
  readonly packerId: string;
  readonly acondicionador1: string;
  readonly acondicionador2: string;
  readonly operario: string;
  readonly presentationIds: string[];
};

async function crearRol(permisos: readonly string[]): Promise<string> {
  const role = await prisma.role.create({
    data: { name: `rol-${token()}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  for (const permissionCode of permisos) {
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionCode } });
  }
  return role.id;
}

async function crearPersona(companyId: string, roleId: string, documentTypeCode: string, nombre: string): Promise<string> {
  const marca = token();
  const user = await prisma.user.create({
    data: {
      firstNames: nombre,
      lastNames: 'Prueba',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `${marca}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode,
      documentNumber: marca.slice(0, 12),
      username: `u.${marca}`,
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
  const nombre = `Empresa datos de lote ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const rolAcondicionador = await crearRol(PERMISOS_ACONDICIONADOR);
  const rolOtro = await crearRol(['empaque.modificar']);
  const persona = (roleId: string, n: string) => crearPersona(company.id, roleId, documentType.code, n);
  const packerId = await persona(rolOtro, 'Empacador');
  const operario = await persona(rolOtro, 'Olga');
  const acondicionador1 = await persona(rolAcondicionador, 'Alba');
  const acondicionador2 = await persona(rolAcondicionador, 'Bruno');

  const unit = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: company.id },
    select: { id: true },
  });

  return {
    companyId: company.id,
    documentTypeCode: documentType.code,
    roleIds: [rolAcondicionador, rolOtro],
    recipeId: recipe.id,
    unitId: unit.id,
    packerId,
    acondicionador1,
    acondicionador2,
    operario,
    presentationIds: [],
  };
}

async function borrarFixture(fixture: Fixture): Promise<void> {
  const companyId = fixture.companyId;
  const products = await prisma.product.findMany({ where: { companyId }, select: { id: true } });
  const productIds = products.map((product) => product.id);
  await prisma.orderConditioningTeamMember.deleteMany({ where: { companyId } });
  await prisma.reservationMovement.deleteMany({ where: { companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { batch: { productId: { in: productIds } } } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.presentation.deleteMany({ where: { id: { in: fixture.presentationIds } } });
  await prisma.unit.deleteMany({ where: { id: fixture.unitId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: [...fixture.roleIds] } } });
  await prisma.role.deleteMany({ where: { id: { in: [...fixture.roleIds] } } });
  await prisma.documentType.deleteMany({ where: { code: fixture.documentTypeCode } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function crearPresentacion(fixture: Fixture, nombre: string, content: string): Promise<string> {
  const { id } = await prisma.presentation.create({
    data: {
      name: nombre,
      nameNormalized: `${nombre}${token()}`.toLowerCase().replace(/[^a-z0-9]/gu, ''),
      unitId: fixture.unitId,
      companyId: fixture.companyId,
      content,
    },
    select: { id: true },
  });
  fixture.presentationIds.push(id);
  return id;
}

/** Una linea del reparto; con `conLote`, ademas su entrada por Terminar el empaque. */
async function crearLinea(fixture: Fixture, orderId: string, nombre: string, conLote: boolean): Promise<string | null> {
  const presentationId = await crearPresentacion(fixture, nombre, '1');
  const line = await prisma.orderPresentationLine.create({
    data: { orderId, companyId: fixture.companyId, presentationId, packages: 2, presentationContent: null },
    select: { id: true },
  });
  if (!conLote) return null;
  const outcome = await prisma.$transaction((tx) =>
    receiveFinishedGoods(
      tx,
      {
        orderId,
        recipeId: fixture.recipeId,
        recipeName: 'Limpiador',
        presentationId,
        orderPresentationLineId: line.id,
        packages: 2,
        orderContent: null,
        unitCost: '1.0000',
        actorId: fixture.packerId,
        now: new Date(),
      },
      { companyId: fixture.companyId },
    ),
  );
  if (outcome.kind !== 'received') throw new Error(`esperaba received, llego ${outcome.kind}`);
  const movement = await prisma.inventoryMovement.findFirstOrThrow({
    where: { orderPresentationLineId: line.id, kind: 'production' },
    select: { batchId: true },
  });
  return movement.batchId;
}

/** Un pedido `EN_ACONDICIONAMIENTO` de `acondicionador1`, con el operario en su equipo. */
async function pedidoEnAcondicionamiento(fixture: Fixture): Promise<string> {
  const order = await prisma.order.create({
    data: {
      companyId: fixture.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: freshSequence(),
      recipeId: fixture.recipeId,
      quantity: new Prisma.Decimal('10'),
    },
    select: { id: true },
  });
  return order.id;
}

async function comenzar(fixture: Fixture, orderId: string): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'EN_ACONDICIONAMIENTO', packedBy: fixture.packerId, conditionedBy: fixture.acondicionador1 },
  });
  await prisma.orderConditioningTeamMember.create({
    data: { orderId, userId: fixture.operario, companyId: fixture.companyId, position: 0 },
  });
}

function actor(fixture: Fixture, id: string): Actor {
  return { id, companyId: fixture.companyId, permissions: PERMISOS_ACONDICIONADOR };
}

async function leerPedido(id: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    select: { status: true, conditionedBy: true, finishedAt: true },
  });
}

async function leerEquipo(orderId: string) {
  return prisma.orderConditioningTeamMember.findMany({
    where: { orderId },
    orderBy: { position: 'asc' },
    select: { userId: true, position: true },
  });
}

function datos(batchId: string, lot: string) {
  return { batchId, lot, expiryDate: diaUtc(365), productionDate: diaUtc(0) };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('QC-219 — Terminar exige los datos de lote', () => {
  it('R15, R16, R25: sin datos rechaza con conditioning_batch_data_missing; el pedido sigue EN_ACONDICIONAMIENTO, sin finishedAt y con su equipo', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoEnAcondicionamiento(fixture);
      const lote1 = (await crearLinea(fixture, pedido, 'Botella 1 L', true))!;
      const lote2 = (await crearLinea(fixture, pedido, 'Garrafa 5 L', true))!;
      await comenzar(fixture, pedido);
      const uno = actor(fixture, fixture.acondicionador1);
      const equipoAntes = await leerEquipo(pedido);

      await expect(asignaciones.finishConditioning(uno, { orderId: pedido })).rejects.toMatchObject({
        code: 'conditioning_batch_data_missing',
      });
      expect(await leerPedido(pedido)).toEqual({
        status: 'EN_ACONDICIONAMIENTO',
        conditionedBy: fixture.acondicionador1,
        finishedAt: null,
      });
      expect(await leerEquipo(pedido)).toEqual(equipoAntes);

      // R16: el otro acondicionador recibe order_conditioning_taken aunque falten datos.
      await expect(
        asignaciones.finishConditioning(actor(fixture, fixture.acondicionador2), { orderId: pedido }),
      ).rejects.toMatchObject({ code: 'order_conditioning_taken' });

      // R4, R15: con una sola linea guardada siguen faltando datos; el detalle cuenta lo mismo.
      await asignaciones.saveConditioningBatchData(uno, { orderId: pedido, lines: [datos(lote1, `L1-${token()}`)] });
      expect((await asignaciones.getConditioningOrder(uno, { orderId: pedido })).batchData?.missingCount).toBe(1);
      await expect(asignaciones.finishConditioning(uno, { orderId: pedido })).rejects.toMatchObject({
        code: 'conditioning_batch_data_missing',
      });
      expect((await leerPedido(pedido)).status).toBe('EN_ACONDICIONAMIENTO');

      // Con las dos lineas, termina y conserva el equipo.
      await asignaciones.saveConditioningBatchData(uno, { orderId: pedido, lines: [datos(lote2, `L2-${token()}`)] });
      expect((await asignaciones.getConditioningOrder(uno, { orderId: pedido })).batchData?.missingCount).toBe(0);
      const { numberText } = await asignaciones.finishConditioning(uno, { orderId: pedido });
      expect(numberText.length).toBeGreaterThan(0);
      const terminado = await leerPedido(pedido);
      expect(terminado.status).toBe('TERMINADO');
      expect(terminado.finishedAt).not.toBeNull();
      expect(await leerEquipo(pedido)).toEqual(equipoAntes);
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R17: una linea sin lote de produccion cuenta como sin datos y bloquea Terminar', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoEnAcondicionamiento(fixture);
      const lote = (await crearLinea(fixture, pedido, 'Botella 1 L', true))!;
      await crearLinea(fixture, pedido, 'Garrafa 5 L', false);
      await comenzar(fixture, pedido);
      const uno = actor(fixture, fixture.acondicionador1);

      await asignaciones.saveConditioningBatchData(uno, { orderId: pedido, lines: [datos(lote, `L-${token()}`)] });
      const detalle = await asignaciones.getConditioningOrder(uno, { orderId: pedido });
      expect(detalle.batchData?.missingCount).toBe(1);
      expect(detalle.batchData?.lines.map((line) => line.batchId)).toEqual([lote, null]);

      await expect(asignaciones.finishConditioning(uno, { orderId: pedido })).rejects.toMatchObject({
        code: 'conditioning_batch_data_missing',
      });
      expect(await leerPedido(pedido)).toEqual({
        status: 'EN_ACONDICIONAMIENTO',
        conditionedBy: fixture.acondicionador1,
        finishedAt: null,
      });
    } finally {
      await borrarFixture(fixture);
    }
  });

  it('R18: corregir un TERMINADO cambia el lote y no toca estado, finishedAt ni equipo', async () => {
    const fixture = await crearFixture();
    try {
      const pedido = await pedidoEnAcondicionamiento(fixture);
      const lote = (await crearLinea(fixture, pedido, 'Botella 1 L', true))!;
      await comenzar(fixture, pedido);
      const uno = actor(fixture, fixture.acondicionador1);

      await asignaciones.saveConditioningBatchData(uno, { orderId: pedido, lines: [datos(lote, `L-${token()}`)] });
      await asignaciones.finishConditioning(uno, { orderId: pedido });
      const antes = await leerPedido(pedido);
      const equipoAntes = await leerEquipo(pedido);

      const corregido = `CORR-${token()}`;
      await asignaciones.saveConditioningBatchData(uno, { orderId: pedido, lines: [datos(lote, corregido)] });

      expect(await leerPedido(pedido)).toEqual(antes);
      expect(await leerEquipo(pedido)).toEqual(equipoAntes);
      const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: lote }, select: { lot: true } });
      expect(fila.lot).toBe(corregido);
    } finally {
      await borrarFixture(fixture);
    }
  });
});
