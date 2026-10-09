/**
 * Siembra CONFIRMADA para los `.int` de la entrega: la entrega corre en `withOrderTransaction`
 * sobre el cliente global, asi que una transaccion del test no la envolveria. Cada empresa es
 * efimera (randomUUID) y `borrarEmpresaDeEntrega` la limpia en orden de FK.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { addImportedFinishedGoodsBatch } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor, OrderStatus } from '@/lib/modules/pedidos';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export type EmpresaDeEntrega = {
  readonly companyId: string;
  readonly actor: Actor;
  readonly packerId: string;
  readonly conditionerId: string;
  readonly userIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly documentTypeCodes: readonly string[];
  readonly unitId: string;
  readonly recipeId: string;
};

async function crearUsuario(companyId: string): Promise<{ id: string; roleId: string; documentTypeCode: string }> {
  const marca = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({ data: { name: `rol-${marca}`, description: 'Rol de prueba' }, select: { id: true } });
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
  return { id: user.id, roleId: role.id, documentTypeCode: documentType.code };
}

export async function crearEmpresaDeEntrega(label: string): Promise<EmpresaDeEntrega> {
  const marca = token();
  const nombre = `Empresa ${label} ${marca}`;
  const { id: companyId } = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
  const usuarios = [await crearUsuario(companyId), await crearUsuario(companyId), await crearUsuario(companyId)];
  const [actor, packer, conditioner] = usuarios as [(typeof usuarios)[0], (typeof usuarios)[0], (typeof usuarios)[0]];
  const unit = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
    select: { id: true },
  });
  return {
    companyId,
    actor: { id: actor.id, companyId, permissions: ['entregas.modificar'] },
    packerId: packer.id,
    conditionerId: conditioner.id,
    userIds: usuarios.map((u) => u.id),
    roleIds: usuarios.map((u) => u.roleId),
    documentTypeCodes: usuarios.map((u) => u.documentTypeCode),
    unitId: unit.id,
    recipeId: recipe.id,
  };
}

export async function crearCliente(
  empresa: EmpresaDeEntrega,
  lastNames: string,
  deletedAt: Date | null = null,
): Promise<string> {
  const city = 'Bogota';
  const { id } = await prisma.customer.create({
    data: {
      firstNames: 'Cliente',
      firstNamesNormalized: normalizeCustomerText('Cliente'),
      lastNames,
      lastNamesNormalized: normalizeCustomerText(lastNames),
      city,
      cityNormalized: normalizeCustomerText(city),
      companyId: empresa.companyId,
      deletedAt,
    },
    select: { id: true },
  });
  return id;
}

export async function crearPresentacion(empresa: EmpresaDeEntrega, content: string): Promise<string> {
  const nombre = `Botella ${token()}`;
  const { id } = await prisma.presentation.create({
    data: { name: nombre, nameNormalized: normalizar(nombre), unitId: empresa.unitId, companyId: empresa.companyId, content },
    select: { id: true },
  });
  return id;
}

let secuencia = 800_000;

/** Pedido con las columnas que exigen sus CHECK en `status`; `TERMINADO` lleva quien empaco, quien
 *  acondiciono y `finished_at`. */
export async function crearPedido(
  empresa: EmpresaDeEntrega,
  status: OrderStatus,
  customerId: string | null,
  lineas: readonly { readonly presentationId: string; readonly packages: number }[],
): Promise<{ orderId: string; lineIds: readonly string[] }> {
  const empacado = ['EN_EMPAQUE', 'POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'].includes(status);
  const acondicionado = ['EN_ACONDICIONAMIENTO', 'TERMINADO', 'ENTREGADO'].includes(status);
  secuencia += 1;
  const { id: orderId } = await prisma.order.create({
    data: {
      companyId: empresa.companyId,
      orderYear: new Date().getUTCFullYear(),
      orderSequence: secuencia,
      recipeId: empresa.recipeId,
      quantity: new Prisma.Decimal('10'),
      status,
      customerId,
      packedBy: empacado ? empresa.packerId : null,
      conditionedBy: acondicionado ? empresa.conditionerId : null,
      finishedAt: status === 'TERMINADO' || status === 'ENTREGADO' ? new Date('2026-10-01T10:00:00Z') : null,
    },
    select: { id: true },
  });
  // 2026-10-09: cada linea lleva su `createdAt` explicito y creciente. Las lineas se leen por
  // `created_at, id`, y dos `create` seguidos pueden caer en el mismo milisegundo: entonces el
  // desempate es el `id` aleatorio y el orden de las lineas del escenario dejaba de ser el pedido.
  const base = Date.now();
  const lineIds: string[] = [];
  for (const [indice, linea] of lineas.entries()) {
    const { id } = await prisma.orderPresentationLine.create({
      data: {
        orderId,
        companyId: empresa.companyId,
        presentationId: linea.presentationId,
        packages: linea.packages,
        presentationContent: null,
        createdAt: new Date(base + indice * 1000),
      },
      select: { id: true },
    });
    lineIds.push(id);
  }
  return { orderId, lineIds };
}

/** Producto terminado vivo de la receta de la empresa en esa presentacion. */
export async function crearTerminado(empresa: EmpresaDeEntrega, presentationId: string): Promise<string> {
  const nombre = `Terminado ${token()}`;
  const { id } = await prisma.product.create({
    data: {
      name: nombre,
      nameNormalized: normalizar(nombre),
      type: 'FINISHED_PRODUCT',
      unitId: empresa.unitId,
      recipeId: empresa.recipeId,
      presentationId,
      companyId: empresa.companyId,
    },
    select: { id: true },
  });
  return id;
}

/** Lote de producto terminado por la ruta real de importacion (asiento `opening`). */
export async function crearLote(
  empresa: EmpresaDeEntrega,
  productId: string,
  presentationId: string,
  stock: string,
  packageContent: string,
  purchaseDate = '2026-09-01',
): Promise<string> {
  const { batchId } = await prisma.$transaction((tx) =>
    addImportedFinishedGoodsBatch(
      tx,
      productId,
      {
        presentationId,
        stock,
        unitCost: '1.0000',
        lot: `L-${token().slice(0, 12)}`,
        purchaseDate,
        expiryDate: null,
        createdBy: empresa.actor.id,
      },
      packageContent,
      new Date(),
      { companyId: empresa.companyId },
    ),
  );
  return batchId;
}

export async function stockDeLote(batchId: string): Promise<string> {
  const { stock } = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { stock: true } });
  return stock.toFixed(4);
}

export async function stockDeProducto(productId: string): Promise<string> {
  const { stock } = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } });
  return stock.toFixed(4);
}

/** Lo que una entrega escribe en la empresa: entregas, lineas y asientos `delivery`. */
export async function escritoPorEntregas(
  companyId: string,
): Promise<{ entregas: number; lineas: number; asientos: number }> {
  return {
    entregas: await prisma.orderDelivery.count({ where: { companyId } }),
    lineas: await prisma.orderDeliveryLine.count({ where: { companyId } }),
    asientos: await prisma.inventoryMovement.count({ where: { companyId, kind: 'delivery' } }),
  };
}

export async function borrarEmpresaDeEntrega(empresa: EmpresaDeEntrega): Promise<void> {
  const companyId = empresa.companyId;
  await prisma.inventoryMovement.deleteMany({ where: { companyId } });
  await prisma.orderDeliveryLine.deleteMany({ where: { companyId } });
  await prisma.orderDelivery.deleteMany({ where: { companyId } });
  await prisma.productBatch.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.orderPresentationLine.deleteMany({ where: { companyId } });
  await prisma.order.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.recipe.deleteMany({ where: { companyId } });
  await prisma.presentation.deleteMany({ where: { companyId } });
  await prisma.unit.deleteMany({ where: { id: empresa.unitId } });
  await prisma.user.deleteMany({ where: { id: { in: [...empresa.userIds] } } });
  await prisma.role.deleteMany({ where: { id: { in: [...empresa.roleIds] } } });
  await prisma.documentType.deleteMany({ where: { code: { in: [...empresa.documentTypeCodes] } } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}
