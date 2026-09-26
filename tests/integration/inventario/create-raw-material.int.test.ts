/**
 * QC-159 T3 — `createCreateRawMaterial`, con el adaptador REAL de `product-prisma.ts`, contra
 * Postgres. Cierra el hueco de `create-raw-material.test.ts` (con doble): que la escritura de
 * verdad deje el producto SIN lote, sin unidad y con existencia 0 (P1).
 *
 * AISLAMIENTO: `createProduct` (product-prisma.ts) llama al cliente Prisma GLOBAL, no a un `tx`
 * inyectado, asi que una transaccion del test con ROLLBACK no la envolveria (mismo criterio que
 * `product-crud.int.test.ts`). Empresa efimera propia del archivo; se borra en `afterAll` por
 * su `id` exacto.
 *
 * Cubre R25.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCreateRawMaterial } from '@/lib/modules/inventario/domain/create-raw-material';
import { PRODUCT_TYPES } from '@/lib/modules/inventario/domain/product-type';
import { createProduct } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { Actor } from '@/lib/modules/inventario/domain/actor';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let empresaId: string;

beforeAll(async () => {
  const nombre = `Empresa materia prima ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaId = id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { companyId: empresaId } });
  await prisma.company.deleteMany({ where: { id: empresaId } });
  await prisma.$disconnect();
});

const ACTOR: Actor = {
  id: 'no-importa',
  companyId: '',
  permissions: ['inventario.modificar'],
};

describe('createCreateRawMaterial — con el adaptador Prisma real (R25)', () => {
  it('crea un producto PRODUCT sin lote, sin unidad, con existencia 0 y en la empresa del actor', async () => {
    const createRawMaterial = createCreateRawMaterial({ products: { create: createProduct } });
    const nombre = `Sosa caustica ${token()}`;

    const { id } = await createRawMaterial({ name: nombre }, { ...ACTOR, companyId: empresaId });

    const producto = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(producto.companyId).toBe(empresaId);
    expect(producto.type).toBe(PRODUCT_TYPES.PRODUCT);
    expect(producto.unitId).toBeNull();
    expect(producto.stock.toFixed(4)).toBe('0.0000');
    expect(producto.qtyAlert).toBeNull();
    expect(producto.name).toBe(nombre);

    const lotes = await prisma.productBatch.count({ where: { productId: id } });
    expect(lotes).toBe(0);

    const asientos = await prisma.inventoryMovement.count({ where: { companyId: empresaId } });
    expect(asientos).toBe(0);
  });
});
