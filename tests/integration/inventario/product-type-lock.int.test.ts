/**
 * QC-150 T6 — R4: la edicion nunca cambia el tipo de o hacia `FINISHED_PRODUCT`. Contra Postgres
 * real, con un producto terminado sembrado a mano (con su `recipe_id`/`presentation_id`, que
 * exige el CHECK `products_finished_identity_matches_type`) para probar el `UPDATE` condicional
 * de `updateAliveProduct` -que ni un mock puede demostrar-.
 *
 * AISLAMIENTO: `updateAliveProduct` abre su propia `prisma.$transaction` contra el cliente
 * GLOBAL, igual que `product-crud.int.test.ts`, asi que una transaccion del test no la
 * envolveria. Cada caso siembra su propio fixture y lo borra en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { updateAliveProduct } from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

let empresaDelArchivo: string;

function ambito(): InventoryScope {
  return { companyId: empresaDelArchivo };
}

beforeAll(async () => {
  const nombre = `Empresa tipo-bloqueado ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  return id;
}

async function sembrarPresentacion(unitId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.presentation.create({
    data: {
      name: `Presentacion ${marca}`,
      nameNormalized: `presentacion${marca}`,
      unitId,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  return id;
}

async function sembrarReceta(): Promise<string> {
  const marca = token();
  const { id } = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: empresaDelArchivo },
    select: { id: true },
  });
  return id;
}

async function sembrarProductoTerminado(recipeId: string, presentationId: string, unitId: string): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Terminado ${marca}`,
      nameNormalized: `terminado${marca}`,
      type: 'FINISHED_PRODUCT',
      unitId,
      companyId: empresaDelArchivo,
      recipeId,
      presentationId,
    },
    select: { id: true },
  });
  return id;
}

async function sembrarProductoNormal(): Promise<string> {
  const marca = token();
  const { id } = await prisma.product.create({
    data: {
      name: `Producto ${marca}`,
      nameNormalized: `producto${marca}`,
      type: 'PRODUCT',
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  return id;
}

function edicion(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Editado ${token()}`, qtyAlert: '0', ...overrides };
}

describe('R4 — la edicion no cambia el tipo de o hacia FINISHED_PRODUCT', () => {
  it('cambiar un producto normal a FINISHED_PRODUCT se rechaza sin modificar la fila', async () => {
    const productId = await sembrarProductoNormal();
    try {
      const antes = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      const resultado = await updateAliveProduct(
        productId,
        edicion({ type: 'FINISHED_PRODUCT' }),
        new Date(),
        ambito(),
      );

      expect(resultado).toBe('type_locked');
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues).toEqual(antes);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
    }
  });

  it('cambiar un producto terminado a PRODUCT se rechaza sin modificar la fila', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId);
    const recipeId = await sembrarReceta();
    const productId = await sembrarProductoTerminado(recipeId, presentationId, unitId);

    try {
      const antes = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      const resultado = await updateAliveProduct(productId, edicion({ type: 'PRODUCT' }), new Date(), ambito());

      expect(resultado).toBe('type_locked');
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues).toEqual(antes);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });

  it('editar un producto terminado con su mismo tipo si se acepta (nombre, alerta)', async () => {
    const unitId = await sembrarUnidad();
    const presentationId = await sembrarPresentacion(unitId);
    const recipeId = await sembrarReceta();
    const productId = await sembrarProductoTerminado(recipeId, presentationId, unitId);

    try {
      const nuevaEdicion = edicion({ type: 'FINISHED_PRODUCT' });

      const resultado = await updateAliveProduct(productId, nuevaEdicion, new Date(), ambito());

      expect(resultado).toBe(true);
      const despues = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(despues.name).toBe(nuevaEdicion.name);
      expect(despues.type).toBe('FINISHED_PRODUCT');
      // La unidad no la toca la edicion, para ningun tipo: se mantiene tal cual.
      expect(despues.unitId).toBe(unitId);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.recipe.deleteMany({ where: { id: recipeId } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});
