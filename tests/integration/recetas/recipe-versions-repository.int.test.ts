/**
 * QC-172 T4 — el adaptador `recipe-prisma.ts` frente a versiones de receta, contra Postgres REAL.
 *
 * Las funciones del adaptador usan el cliente Prisma GLOBAL y abren su propia `$transaction`, asi
 * que una transaccion del test con ROLLBACK no las envolveria: cada empresa nace con un nombre
 * irrepetible en `beforeAll` y se borra en `afterAll` (versiones -> originales -> productos ->
 * usuario -> rol y tipo de documento -> empresa). El caso del fallo forzado crea un trigger
 * acotado a UNA receta y lo borra en un `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  createRecipe,
  createRecipeVersion,
  findAliveRecipeById,
  listAliveRecipes,
  listAliveRecipeVersions,
  replaceAliveRecipeWithPropagation,
  softDeleteAliveRecipe,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { ListQuery } from '@/lib/modules/recetas/domain/list-query';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import type { NewRecipe, RecipeLineData } from '@/lib/modules/recetas/ports/recipe-repository';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  readonly productos: readonly [string, string, string];
  readonly scope: RecipeScope;
};

let A: Empresa;
let B: Empresa;

const PASOS = [{ blocks: [{ kind: 'paragraph' as const, spans: [{ text: 'Mezclar en frio' }] }] }];

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
  const productos: string[] = [];
  for (const letra of ['a', 'b', 'c']) {
    const producto = await prisma.product.create({
      data: { name: `Producto ${letra} ${marca}`, nameNormalized: `producto${letra}${marca}`, companyId: company.id },
      select: { id: true },
    });
    productos.push(producto.id);
  }
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    productos: productos as unknown as readonly [string, string, string],
    scope: { companyId: company.id },
  };
}

beforeAll(async () => {
  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');
});

afterAll(async () => {
  const empresas = [A, B].filter((empresa): empresa is Empresa => empresa !== undefined);
  for (const empresa of empresas) {
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId, parentRecipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
    await prisma.product.deleteMany({ where: { companyId: empresa.companyId } });
  }
  for (const empresa of empresas) {
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------

function linea(productId: string, percentage: string): RecipeLineData {
  return { productId, percentage };
}

async function original(empresa: Empresa, overrides: Partial<NewRecipe> = {}): Promise<string> {
  const [a, b] = empresa.productos;
  const data: NewRecipe = {
    name: `Crema ${token()}`,
    description: 'Base para versiones',
    steps: PASOS,
    lines: [linea(a, '70.00'), linea(b, '30.00')],
    imagePath: 'recetas/crema.jpg',
    ...overrides,
  };
  const creada = await createRecipe(data, empresa.userId, new Date(), empresa.scope);
  if (creada === 'duplicate') throw new Error('alta de original: duplicate');
  return creada.id;
}

async function version(
  empresa: Empresa,
  originalId: string,
  lines: readonly RecipeLineData[],
  name = `Version ${token()}`,
): Promise<string> {
  const creada = await createRecipeVersion(originalId, { name, lines }, empresa.userId, new Date(), empresa.scope);
  if (creada === 'duplicate' || creada === 'not_found') throw new Error(`alta de version: ${creada}`);
  return creada.id;
}

/** Retrato de lo que una escritura podria cambiar en una receta: fila y lineas. */
async function retrato(id: string): Promise<unknown> {
  const fila = await prisma.recipe.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      description: true,
      steps: true,
      imagePath: true,
      deletedAt: true,
      updatedAt: true,
      updatedBy: true,
      lines: { select: { id: true, productId: true, percentage: true }, orderBy: { productId: 'asc' } },
    },
  });
  return { ...fila, lines: fila.lines.map((l) => ({ ...l, percentage: l.percentage.toFixed(2) })) };
}

async function lineasDe(id: string): Promise<readonly RecipeLineData[]> {
  const lineas = await prisma.recipeLine.findMany({ where: { recipeId: id }, orderBy: { productId: 'asc' } });
  return lineas.map((l) => ({ productId: l.productId, percentage: l.percentage.toFixed(2) }));
}

function ordenadas(lines: readonly RecipeLineData[]): readonly RecipeLineData[] {
  return [...lines].sort((x, y) => (x.productId < y.productId ? -1 : 1));
}

const contarVersiones = (originalId: string): Promise<number> =>
  prisma.recipe.count({ where: { parentRecipeId: originalId } });

// ---------------------------------------------------------------------------

describe('listAlive — las versiones no salen en la lista de recetas', () => {
  it('R9: ni la pagina ni su total cuentan versiones, sin consulta, con busqueda y con filtro', async () => {
    const empresa = await sembrarEmpresa('lista');
    try {
      const marca = token();
      const crema = await original(empresa, { name: `Crema ${marca}` });
      await version(empresa, crema, [linea(empresa.productos[0], '100.00')], `Crema ${marca} sin perfume`);
      await version(empresa, crema, [linea(empresa.productos[1], '100.00')], `Crema ${marca} intensa`);

      const consultas: readonly ListQuery[] = [
        { page: 1, sort: null, filters: {}, search: '' },
        { page: 1, sort: null, filters: {}, search: marca },
        {
          page: 1,
          sort: null,
          filters: { createdAt: { kind: 'dateRange', from: '2000-01-01', to: null } },
          search: 'crema',
        },
      ];
      for (const consulta of consultas) {
        const { rows, total } = await listAliveRecipes(0, 50, consulta, empresa.scope);
        expect(rows.map((row) => row.id)).toEqual([crema]);
        expect(total).toBe(1);
        expect(rows[0]?.original).toBeNull();
      }
    } finally {
      await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId, parentRecipeId: { not: null } } });
      await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
      await prisma.product.deleteMany({ where: { companyId: empresa.companyId } });
      await prisma.user.deleteMany({ where: { id: empresa.userId } });
      await prisma.role.deleteMany({ where: { id: empresa.roleId } });
      await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
      await prisma.company.deleteMany({ where: { id: empresa.companyId } });
    }
  });
});

describe('createVersion', () => {
  it('crea la version en la empresa del ambito, colgando de la original, sin pasos, descripcion ni imagen', async () => {
    const crema = await original(A);
    const id = await version(A, crema, [linea(A.productos[0], '50.00'), linea(A.productos[2], '50.00')]);

    const fila = await prisma.recipe.findUniqueOrThrow({ where: { id } });
    expect(fila.parentRecipeId).toBe(crema);
    expect(fila.companyId).toBe(A.companyId);
    expect(fila.steps).toEqual([]);
    expect(fila.description).toBeNull();
    expect(fila.imagePath).toBeNull();
    expect(await lineasDe(id)).toEqual(ordenadas([linea(A.productos[0], '50.00'), linea(A.productos[2], '50.00')]));
  });

  it('R12: un nombre ya usado por otra version viva de la misma original devuelve duplicate', async () => {
    const crema = await original(A);
    await version(A, crema, [], 'Sin perfume');
    const repetida = await createRecipeVersion(
      crema,
      { name: 'SIN PERFUME', lines: [] },
      A.userId,
      new Date(),
      A.scope,
    );
    expect(repetida).toBe('duplicate');
    expect(await contarVersiones(crema)).toBe(1);
  });

  it('R5: una original dada de baja devuelve not_found y no crea ninguna fila', async () => {
    const crema = await original(A);
    expect(await softDeleteAliveRecipe(crema, A.userId, new Date(), A.scope)).toBe('ok');

    const resultado = await createRecipeVersion(crema, { name: 'Tardia', lines: [] }, A.userId, new Date(), A.scope);
    expect(resultado).toBe('not_found');
    expect(await contarVersiones(crema)).toBe(0);
  });

  it('R4: crear una version desde una version devuelve not_found y no crea ninguna fila', async () => {
    const crema = await original(A);
    const sinPerfume = await version(A, crema, []);

    const resultado = await createRecipeVersion(sinPerfume, { name: 'Nieta', lines: [] }, A.userId, new Date(), A.scope);
    expect(resultado).toBe('not_found');
    expect(await contarVersiones(sinPerfume)).toBe(0);
  });

  it('R40: una original de otra empresa devuelve not_found y no crea ninguna fila', async () => {
    const deB = await original(B);

    const resultado = await createRecipeVersion(deB, { name: 'Intrusa', lines: [] }, A.userId, new Date(), A.scope);
    expect(resultado).toBe('not_found');
    expect(await contarVersiones(deB)).toBe(0);
  });
});

describe('findAliveById y listAliveVersions', () => {
  it('R8: findAliveById de una version trae su original con pasos, descripcion e imagen; la de una original, null', async () => {
    const nombre = `Crema ${token()}`;
    const crema = await original(A, { name: nombre });
    const sinPerfume = await version(A, crema, [linea(A.productos[0], '100.00')]);

    const leida = await findAliveRecipeById(sinPerfume, A.scope);
    expect(leida?.steps).toEqual([]);
    expect(leida?.lines.map((l) => [l.productId, l.percentage])).toEqual([[A.productos[0], '100.00']]);
    expect(leida?.original).toEqual({
      id: crema,
      name: nombre,
      description: 'Base para versiones',
      imagePath: 'recetas/crema.jpg',
      steps: PASOS,
    });

    expect((await findAliveRecipeById(crema, A.scope))?.original).toBeNull();
  });

  it('R10, R40: listAliveVersions devuelve las vivas por nombre, sin las de baja ni las de otra empresa', async () => {
    const crema = await original(A);
    const beta = await version(A, crema, [], 'Beta');
    const alfa = await version(A, crema, [], 'Alfa');
    const baja = await version(A, crema, [], 'Aaa de baja');
    expect(await softDeleteAliveRecipe(baja, A.userId, new Date(), A.scope)).toBe('ok');

    const versiones = await listAliveRecipeVersions(crema, A.scope);
    expect(versiones.map((v) => v.id)).toEqual([alfa, beta]);
    expect(versiones.every((v) => v.original?.id === crema)).toBe(true);

    expect(await listAliveRecipeVersions(crema, B.scope)).toEqual([]);
  });
});

describe('softDeleteAlive — baja en cascada', () => {
  it('R23: dar de baja una original da de baja sus versiones vivas con la misma fecha y autor, y no toca las ya dadas de baja', async () => {
    const crema = await original(A);
    const v1 = await version(A, crema, []);
    const v2 = await version(A, crema, []);
    const yaDeBaja = await version(A, crema, []);
    const antes = new Date('2026-01-01T00:00:00.000Z');
    expect(await softDeleteAliveRecipe(yaDeBaja, A.userId, antes, A.scope)).toBe('ok');

    const ahora = new Date('2026-06-15T10:30:00.000Z');
    expect(await softDeleteAliveRecipe(crema, A.userId, ahora, A.scope)).toBe('ok');

    const filas = await prisma.recipe.findMany({
      where: { id: { in: [crema, v1, v2, yaDeBaja] } },
      select: { id: true, deletedAt: true, updatedBy: true },
    });
    const porId = new Map(filas.map((f) => [f.id, f]));
    for (const id of [crema, v1, v2]) {
      expect(porId.get(id)?.deletedAt?.toISOString()).toBe(ahora.toISOString());
      expect(porId.get(id)?.updatedBy).toBe(A.userId);
    }
    expect(porId.get(yaDeBaja)?.deletedAt?.toISOString()).toBe(antes.toISOString());
  });

  it('R24: dar de baja una version solo la da de baja a ella', async () => {
    const crema = await original(A);
    const v1 = await version(A, crema, []);
    const v2 = await version(A, crema, []);

    expect(await softDeleteAliveRecipe(v1, A.userId, new Date(), A.scope)).toBe('ok');

    expect(await findAliveRecipeById(v1, A.scope)).toBeNull();
    expect(await findAliveRecipeById(crema, A.scope)).not.toBeNull();
    expect(await findAliveRecipeById(v2, A.scope)).not.toBeNull();
  });

  it('R40: la baja desde otra empresa devuelve not_found y no toca ni la original ni sus versiones', async () => {
    const crema = await original(A);
    const v1 = await version(A, crema, []);
    const antes = [await retrato(crema), await retrato(v1)];

    expect(await softDeleteAliveRecipe(crema, B.userId, new Date(), B.scope)).toBe('not_found');
    expect([await retrato(crema), await retrato(v1)]).toEqual(antes);
  });
});

describe('replaceAliveWithPropagation', () => {
  it('R14, R15, R19: guarda la original y propaga a las versiones elegidas lo que no cambiaron', async () => {
    const [a, b, c] = A.productos;
    const crema = await original(A); // a 70 / b 30
    const cambiada = await version(A, crema, [linea(a, '50.00'), linea(c, '50.00')]);
    const copia = await version(A, crema, [linea(a, '70.00'), linea(b, '30.00')]);
    const noElegida = await version(A, crema, [linea(a, '70.00'), linea(b, '30.00')]);
    const intacta = await retrato(noElegida);

    const despues: NewRecipe = {
      name: 'Crema renovada',
      description: 'Nueva',
      steps: PASOS,
      lines: [linea(a, '60.00'), linea(b, '40.00')],
      imagePath: null,
    };
    const resultado = await replaceAliveRecipeWithPropagation(
      crema,
      despues,
      [cambiada, copia],
      A.userId,
      new Date(),
      A.scope,
    );

    expect(resultado).toEqual({
      kind: 'ok',
      propagated: [
        { versionId: cambiada, isUnderReview: false },
        { versionId: copia, isUnderReview: false },
      ],
    });
    expect(await lineasDe(crema)).toEqual(ordenadas(despues.lines));
    // `a` lo cambio la version, `b` ya lo habia quitado y `c` es suyo: queda igual.
    expect(await lineasDe(cambiada)).toEqual(ordenadas([linea(a, '50.00'), linea(c, '50.00')]));
    expect(await lineasDe(copia)).toEqual(ordenadas(despues.lines));
    expect(await retrato(noElegida)).toEqual(intacta);
  });

  it('R20, R19: una version que queda fuera de 100 % no impide guardar y sale como por revisar', async () => {
    const [a, b, c] = A.productos;
    const crema = await original(A); // a 70 / b 30
    const conC = await version(A, crema, [linea(a, '70.00'), linea(c, '30.00')]);

    const resultado = await replaceAliveRecipeWithPropagation(
      crema,
      { name: `Crema ${token()}`, description: null, steps: [], lines: [linea(a, '50.00'), linea(b, '50.00')], imagePath: null },
      [conC],
      A.userId,
      new Date(),
      A.scope,
    );

    expect(resultado).toEqual({ kind: 'ok', propagated: [{ versionId: conC, isUnderReview: true }] });
    expect(await lineasDe(conC)).toEqual(ordenadas([linea(a, '50.00'), linea(c, '30.00')]));
  });

  it('R17: un id que no es version viva de esa original devuelve version_not_found y no deja nada cambiado', async () => {
    const crema = await original(A);
    const propia = await version(A, crema, [linea(A.productos[0], '70.00'), linea(A.productos[1], '30.00')]);
    const otraOriginal = await original(A);
    const ajenaDeOriginal = await version(A, otraOriginal, []);
    const deBaja = await version(A, crema, []);
    expect(await softDeleteAliveRecipe(deBaja, A.userId, new Date(), A.scope)).toBe('ok');
    const deB = await version(B, await original(B), []);

    const intrusos = [ajenaDeOriginal, deBaja, deB, otraOriginal, crema, randomUUID()];
    for (const intruso of intrusos) {
      const antes = [await retrato(crema), await retrato(propia)];
      const resultado = await replaceAliveRecipeWithPropagation(
        crema,
        { name: `Cambiada ${token()}`, description: null, steps: [], lines: [linea(A.productos[2], '100.00')], imagePath: null },
        [propia, intruso],
        A.userId,
        new Date(),
        A.scope,
      );
      expect(resultado, `intruso ${intruso}`).toBe('version_not_found');
      expect([await retrato(crema), await retrato(propia)]).toEqual(antes);
    }
  });

  it('R7, R40: devuelve not_found si el id es una version, de otra empresa o de baja', async () => {
    const crema = await original(A);
    const sinPerfume = await version(A, crema, []);
    const deBaja = await original(A);
    expect(await softDeleteAliveRecipe(deBaja, A.userId, new Date(), A.scope)).toBe('ok');
    const datos: NewRecipe = { name: `X ${token()}`, description: null, steps: [], lines: [], imagePath: null };

    expect(await replaceAliveRecipeWithPropagation(sinPerfume, datos, [], A.userId, new Date(), A.scope)).toBe('not_found');
    expect(await replaceAliveRecipeWithPropagation(crema, datos, [sinPerfume], B.userId, new Date(), B.scope)).toBe('not_found');
    expect(await replaceAliveRecipeWithPropagation(deBaja, datos, [], A.userId, new Date(), A.scope)).toBe('not_found');
  });

  it('R18: un fallo forzado a mitad de la propagacion no deja nada cambiado', async () => {
    const [a, b] = A.productos;
    const crema = await original(A);
    const primera = await version(A, crema, [linea(a, '70.00'), linea(b, '30.00')]);
    const segunda = await version(A, crema, [linea(a, '70.00'), linea(b, '30.00')]);
    const antes = [await retrato(crema), await retrato(primera), await retrato(segunda)];

    const sufijo = token().slice(0, 12);
    const funcion = `qc172_falla_${sufijo}`;
    const trigger = `qc172_falla_${sufijo}`;
    if (!/^[0-9a-f-]{36}$/.test(segunda)) throw new Error(`id inesperado: ${segunda}`);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION public."${funcion}"() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
    );
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${trigger}" BEFORE INSERT OR UPDATE ON public.recipe_lines FOR EACH ROW
           WHEN (NEW.recipe_id = '${segunda}'::uuid) EXECUTE FUNCTION public."${funcion}"()`,
      );

      await expect(
        replaceAliveRecipeWithPropagation(
          crema,
          { name: `Cambiada ${token()}`, description: null, steps: [], lines: [linea(a, '60.00'), linea(b, '40.00')], imagePath: null },
          [primera, segunda],
          A.userId,
          new Date(),
          A.scope,
        ),
      ).rejects.toThrow(/fallo forzado/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON public.recipe_lines`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public."${funcion}"()`);
    }

    expect([await retrato(crema), await retrato(primera), await retrato(segunda)]).toEqual(antes);
  });
});
