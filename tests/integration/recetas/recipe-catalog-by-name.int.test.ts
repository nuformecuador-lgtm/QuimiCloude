/**
 * QC-159 T1 — `RecipeCatalog.findAliveByNormalizedName` contra Postgres REAL.
 *
 * Mismo criterio que `tests/integration/recetas/company-scope-queries.int.test.ts` (QC-50):
 * `findAliveRecipeByNormalizedName` habla con el cliente Prisma GLOBAL, no con un `tx`
 * inyectado, asi que envolver la corrida en una transaccion del test no la alcanzaria -
 * correria en otra conexion del pool y veria una base vacia-. La siembra y el borrado logico
 * REAL committean de verdad y este archivo limpia lo suyo en `afterAll`, en el orden que
 * exigen las FK (lineas -> recetas -> producto propio -> usuario -> rol y tipo de documento ->
 * empresa). La empresa nace con nombre irrepetible (`token()`).
 *
 * Cubre R17, R20, R33.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findAliveRecipeByNormalizedName } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import { createRecipe, softDeleteAliveRecipe } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import type { NewRecipe } from '@/lib/modules/recetas/ports/recipe-repository';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly recetas: string[];
};

let A: Empresa;
let B: Empresa;

const AHORA = new Date();

async function sembrarEmpresa(etiqueta: string): Promise<Empresa> {
  const marca = token();
  const nombre = `Empresa ${etiqueta} ${marca}`;
  const company = await prisma.company.create({
    data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
    select: { id: true },
  });
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
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    recetas: [],
  };
}

function recetaNueva(overrides: Partial<NewRecipe> = {}): NewRecipe {
  return {
    name: `Receta ${token()}`,
    description: null,
    steps: [],
    lines: [],
    imagePath: null,
    ...overrides,
  };
}

async function alta(empresa: Empresa, overrides: Partial<NewRecipe> = {}): Promise<string> {
  const resultado = await createRecipe(recetaNueva(overrides), empresa.userId, AHORA, {
    companyId: empresa.companyId,
  } satisfies RecipeScope);
  if (resultado === 'duplicate') throw new Error('el alta devolvio duplicate');
  empresa.recetas.push(resultado.id);
  return resultado.id;
}

beforeAll(async () => {
  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');
});

afterAll(async () => {
  const empresas = [A, B].filter((empresa): empresa is Empresa => empresa !== undefined);
  for (const empresa of empresas) {
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
  }
  for (const empresa of empresas) {
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

describe('findAliveByNormalizedName — R17, R20, R33', () => {
  it('encuentra la receta viva con mayusculas, acentos y guiones distintos del nombre sembrado', async () => {
    const nombre = `Jabón-Especial ${token()}`;
    await alta(A, { name: nombre });

    const variante = nombre.toUpperCase().replace(/ó/gi, 'o').replace(/-/g, ' ');
    const encontrada = await findAliveRecipeByNormalizedName(variante, A.companyId);

    expect(encontrada).not.toBeNull();
    expect(encontrada?.name).toBe(nombre);
  });

  it('no devuelve una receta dada de baja', async () => {
    const nombre = `Desengrasante borrado ${token()}`;
    const id = await alta(A, { name: nombre });
    expect(await softDeleteAliveRecipe(id, A.userId, new Date(), { companyId: A.companyId })).toBe('ok');

    const encontrada = await findAliveRecipeByNormalizedName(nombre, A.companyId);

    expect(encontrada).toBeNull();
  });

  it('no devuelve una receta viva de OTRA empresa', async () => {
    const nombre = `Cloro compartido ${token()}`;
    await alta(B, { name: nombre });

    // Control positivo: desde B si aparece.
    const desdeB = await findAliveRecipeByNormalizedName(nombre, B.companyId);
    expect(desdeB).not.toBeNull();

    const desdeA = await findAliveRecipeByNormalizedName(nombre, A.companyId);
    expect(desdeA).toBeNull();
  });

  it('un nombre que normaliza a vacio devuelve null', async () => {
    const encontrada = await findAliveRecipeByNormalizedName('   %%% ---   ', A.companyId);

    expect(encontrada).toBeNull();
  });
});
