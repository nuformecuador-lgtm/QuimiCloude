/**
 * QC-159 T2 — `ProductNameLookup.findAliveByNormalizedNames` (`findProductsByNormalizedNames`
 * de `product-catalog-prisma.ts`) contra Postgres REAL.
 *
 * AISLAMIENTO: usa el cliente Prisma GLOBAL, no un `tx` inyectado (mismo criterio que
 * `findProductRefs` en `company-scope-queries.int.test.ts`), asi que una transaccion del test
 * con ROLLBACK no lo envolveria. Empresa efimera propia del archivo; se limpia en `afterAll`
 * por su id exacto.
 *
 * Cubre R11, R26, R33.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRODUCT_TYPES } from '@/lib/modules/inventario/domain/product-type';
import { findProductsByNormalizedNames } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { ProductType } from '@/lib/modules/inventario/domain/product-type';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Empresa = { readonly id: string };

let A: Empresa;
let B: Empresa;

/** Producto TERMINADO sembrado en A: su identidad exige el CHECK
 *  `products_finished_identity_matches_type` (recipe_id + presentation_id + unidad). */
let unitId: string;
let presentationId: string;
let recipeId: string;

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const nombre = `Empresa ${etiqueta} ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  return { id };
}

async function crearProducto(
  empresa: Empresa,
  name: string,
  overrides: {
    readonly type?: ProductType;
    readonly deletedAt?: Date | null;
    readonly recipeId?: string;
    readonly presentationId?: string;
  } = {},
): Promise<string> {
  const { id } = await prisma.product.create({
    data: {
      name,
      nameNormalized: normalizeProductName(name),
      companyId: empresa.id,
      type: overrides.type ?? PRODUCT_TYPES.PRODUCT,
      deletedAt: overrides.deletedAt ?? null,
      recipeId: overrides.recipeId ?? null,
      presentationId: overrides.presentationId ?? null,
    },
    select: { id: true },
  });
  return id;
}

beforeAll(async () => {
  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');

  const marca = token();
  const unit = await prisma.unit.create({
    data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca.slice(0, 8)}` },
    select: { id: true },
  });
  unitId = unit.id;
  const presentation = await prisma.presentation.create({
    data: {
      name: `Presentacion ${marca}`,
      nameNormalized: `presentacion${marca}`,
      unitId,
      companyId: A.id,
    },
    select: { id: true },
  });
  presentationId = presentation.id;
  const recipe = await prisma.recipe.create({
    data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId: A.id },
    select: { id: true },
  });
  recipeId = recipe.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { companyId: { in: [A.id, B.id] } } });
  await prisma.recipe.deleteMany({ where: { id: recipeId } });
  await prisma.presentation.deleteMany({ where: { id: presentationId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.company.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await prisma.$disconnect();
});

describe('findAliveByNormalizedNames — R11, R26, R33', () => {
  it('devuelve todos los homonimos vivos con su type, incluido uno terminado', async () => {
    const nombre = `Detergente ${token()}`;
    await crearProducto(A, nombre);
    await crearProducto(A, nombre.toUpperCase(), {
      type: PRODUCT_TYPES.FINISHED_PRODUCT,
      recipeId,
      presentationId,
    });

    const encontrados = await findProductsByNormalizedNames([nombre], A.id);

    expect(encontrados).toHaveLength(2);
    expect([...encontrados.map((p) => p.type)].sort()).toEqual(
      [PRODUCT_TYPES.PRODUCT, PRODUCT_TYPES.FINISHED_PRODUCT].sort(),
    );
    for (const producto of encontrados) {
      expect(producto.nameNormalized).toBe(normalizeProductName(nombre));
    }
  });

  it('no devuelve un producto dado de baja', async () => {
    const nombre = `Cloro dado de baja ${token()}`;
    await crearProducto(A, nombre, { deletedAt: new Date() });

    const encontrados = await findProductsByNormalizedNames([nombre], A.id);

    expect(encontrados).toEqual([]);
  });

  it('no devuelve un producto de OTRA empresa', async () => {
    const nombre = `Acido compartido ${token()}`;
    await crearProducto(B, nombre);

    const desdeB = await findProductsByNormalizedNames([nombre], B.id);
    expect(desdeB).toHaveLength(1);

    const desdeA = await findProductsByNormalizedNames([nombre], A.id);
    expect(desdeA).toEqual([]);
  });

  it('una lista vacia devuelve una lista vacia', async () => {
    // Que ademas NO consulte la base se prueba con un doble en
    // `tests/unit/inventario/product-name-lookup.test.ts`.
    const encontrados = await findProductsByNormalizedNames([], A.id);

    expect(encontrados).toEqual([]);
  });
});
