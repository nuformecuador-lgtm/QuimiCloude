/**
 * Herramientas de la receta (`recipe_tools`) contra Postgres REAL: el adaptador `recipe-prisma.ts`
 * y los casos de uso de `recetas` cableados por `@/lib/composition`.
 *
 * Las funciones del adaptador usan el cliente Prisma GLOBAL y abren su propia `$transaction`, asi
 * que una transaccion del test con ROLLBACK no las envolveria: la empresa nace con un nombre
 * irrepetible en `beforeAll` y se borra en `afterAll` (versiones -> originales, cuyas lineas y
 * herramientas caen con ON DELETE CASCADE -> productos -> usuario -> rol y tipo de documento ->
 * empresa). El caso del fallo forzado crea un trigger acotado a UNA receta y lo borra en un
 * `finally`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inventario, recetas } from '@/lib/composition';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { ValidationError } from '@/lib/modules/recetas';
import {
  createRecipe,
  createRecipeVersion,
  findAliveRecipeById,
  replaceAliveRecipe,
  replaceAliveRecipeWithPropagation,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import type { NewRecipe, RecipeToolData } from '@/lib/modules/recetas/ports/recipe-repository';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** Materias primas para las lineas. */
  readonly ingredientes: readonly [string, string];
  /** Productos MACHINE para las herramientas. */
  readonly maquinas: readonly [string, string, string];
  readonly scope: RecipeScope;
};

let A: Empresa;

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
  const producto = async (letra: string, type: 'PRODUCT' | 'MACHINE'): Promise<string> =>
    (
      await prisma.product.create({
        data: {
          name: `${type} ${letra} ${marca}`,
          nameNormalized: `${type.toLowerCase()}${letra}${marca}`,
          companyId: company.id,
          type,
        },
        select: { id: true },
      })
    ).id;
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    ingredientes: [await producto('a', 'PRODUCT'), await producto('b', 'PRODUCT')],
    maquinas: [await producto('x', 'MACHINE'), await producto('y', 'MACHINE'), await producto('z', 'MACHINE')],
    scope: { companyId: company.id },
  };
}

beforeAll(async () => {
  A = await sembrarEmpresa('herramientas');
});

afterAll(async () => {
  if (A !== undefined) {
    await prisma.recipe.deleteMany({ where: { companyId: A.companyId, parentRecipeId: { not: null } } });
    await prisma.recipe.deleteMany({ where: { companyId: A.companyId } });
    await prisma.product.deleteMany({ where: { companyId: A.companyId } });
    await prisma.user.deleteMany({ where: { id: A.userId } });
    await prisma.role.deleteMany({ where: { id: A.roleId } });
    await prisma.documentType.deleteMany({ where: { code: A.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: A.companyId } });
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------

function tool(productId: string, quantity: number): RecipeToolData {
  return { productId, quantity };
}

function datos(overrides: Partial<NewRecipe> = {}): NewRecipe {
  const [a, b] = A.ingredientes;
  return {
    name: `Crema ${token()}`,
    description: null,
    steps: [],
    lines: [
      { productId: a, percentage: '70.00' },
      { productId: b, percentage: '30.00' },
    ],
    imagePath: null,
    tools: [],
    ...overrides,
  };
}

async function original(tools: readonly RecipeToolData[]): Promise<string> {
  const creada = await createRecipe(datos({ tools }), A.userId, new Date(), A.scope);
  if (creada === 'duplicate') throw new Error('alta de original: duplicate');
  return creada.id;
}

async function version(originalId: string, tools: readonly RecipeToolData[]): Promise<string> {
  const [a, b] = A.ingredientes;
  const creada = await createRecipeVersion(
    originalId,
    {
      name: `Version ${token()}`,
      lines: [
        { productId: a, percentage: '70.00' },
        { productId: b, percentage: '30.00' },
      ],
      tools,
    },
    A.userId,
    new Date(),
    A.scope,
  );
  if (creada === 'duplicate' || creada === 'not_found') throw new Error(`alta de version: ${creada}`);
  return creada.id;
}

/** Herramientas tal como las devuelve la lectura del adaptador, en su orden. */
async function herramientasDe(id: string): Promise<readonly RecipeToolData[]> {
  const fila = await findAliveRecipeById(id, A.scope);
  return (fila?.tools ?? []).map((t) => tool(t.productId, t.quantity));
}

/** Retrato de lo que una escritura podria cambiar: fila, lineas y herramientas (con su id). */
async function retrato(id: string): Promise<unknown> {
  return prisma.recipe.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      updatedAt: true,
      lines: { select: { id: true, productId: true }, orderBy: { productId: 'asc' } },
      tools: { select: { id: true, productId: true, quantity: true, createdAt: true }, orderBy: { productId: 'asc' } },
    },
  });
}

// ---------------------------------------------------------------------------
// Adaptador
// ---------------------------------------------------------------------------

describe('recipe-prisma — escritura y lectura de herramientas', () => {
  it('R1: el alta guarda las herramientas y la lectura las devuelve en orden de alta', async () => {
    const [x, y, z] = A.maquinas;
    const id = await original([tool(z, 3), tool(x, 1), tool(y, 2)]);

    expect(await herramientasDe(id)).toEqual([tool(z, 3), tool(x, 1), tool(y, 2)]);
  });

  it('R2: el alta sin herramientas deja la receta sin ninguna', async () => {
    const id = await original([]);
    expect(await herramientasDe(id)).toEqual([]);
  });

  it('R17: replaceAlive con tools null no toca las herramientas; con [] las borra', async () => {
    const [x, y] = A.maquinas;
    const id = await original([tool(x, 2), tool(y, 5)]);
    const antes = await prisma.recipeTool.findMany({ where: { recipeId: id }, orderBy: { productId: 'asc' } });

    expect(await replaceAliveRecipe(id, datos({ tools: null }), A.userId, new Date(), A.scope)).toBe('ok');
    expect(await prisma.recipeTool.findMany({ where: { recipeId: id }, orderBy: { productId: 'asc' } })).toEqual(
      antes,
    );

    expect(await replaceAliveRecipe(id, datos({ tools: [] }), A.userId, new Date(), A.scope)).toBe('ok');
    expect(await herramientasDe(id)).toEqual([]);
  });

  it('R1: replaceAlive con herramientas cambia cantidades, quita y anade, conservando el id y el orden de la que sigue', async () => {
    const [x, y, z] = A.maquinas;
    const id = await original([tool(x, 1), tool(y, 1)]);
    const idDeX = (await prisma.recipeTool.findFirstOrThrow({ where: { recipeId: id, productId: x } })).id;

    expect(
      await replaceAliveRecipe(id, datos({ tools: [tool(z, 4), tool(x, 7)] }), A.userId, new Date(), A.scope),
    ).toBe('ok');

    expect(await herramientasDe(id)).toEqual([tool(x, 7), tool(z, 4)]);
    expect((await prisma.recipeTool.findFirstOrThrow({ where: { recipeId: id, productId: x } })).id).toBe(idDeX);
  });

  it('R11: createVersion guarda las herramientas de la version', async () => {
    const [x, y] = A.maquinas;
    const crema = await original([tool(x, 1)]);
    const v = await version(crema, [tool(x, 1), tool(y, 2)]);

    expect(await herramientasDe(v)).toEqual([tool(x, 1), tool(y, 2)]);
    expect(await herramientasDe(crema)).toEqual([tool(x, 1)]);
  });

  it('R14, R15: la propagacion aplica la regla por producto y no toca las versiones no indicadas', async () => {
    const [x, y, z] = A.maquinas;
    const crema = await original([tool(x, 1), tool(y, 2)]);
    const copia = await version(crema, [tool(x, 1), tool(y, 2)]);
    const cambiada = await version(crema, [tool(x, 9), tool(z, 1)]);
    const noElegida = await version(crema, [tool(x, 1), tool(y, 2)]);
    const intacta = await retrato(noElegida);

    const resultado = await replaceAliveRecipeWithPropagation(
      crema,
      datos({ tools: [tool(x, 3), tool(z, 5)] }),
      [copia, cambiada],
      A.userId,
      new Date(),
      A.scope,
    );

    expect(resultado).toMatchObject({ kind: 'ok' });
    expect(await herramientasDe(crema)).toEqual([tool(x, 3), tool(z, 5)]);
    // Sigue a la original en todo lo que no habia cambiado.
    expect(await herramientasDe(copia)).toEqual([tool(x, 3), tool(z, 5)]);
    // `x` y `z` los cambio la version: se quedan; `y` lo quito ella misma.
    expect(await herramientasDe(cambiada)).toEqual([tool(x, 9), tool(z, 1)]);
    expect(await retrato(noElegida)).toEqual(intacta);
  });

  it('R17: la propagacion con tools null no toca las herramientas de la original ni de las versiones', async () => {
    const [x, y] = A.maquinas;
    const crema = await original([tool(x, 1)]);
    const v = await version(crema, [tool(x, 1), tool(y, 2)]);

    const resultado = await replaceAliveRecipeWithPropagation(
      crema,
      datos({ tools: null }),
      [v],
      A.userId,
      new Date(),
      A.scope,
    );

    expect(resultado).toMatchObject({ kind: 'ok' });
    expect(await herramientasDe(crema)).toEqual([tool(x, 1)]);
    expect(await herramientasDe(v)).toEqual([tool(x, 1), tool(y, 2)]);
  });

  it('R15: un versionId invalido revierte tambien las herramientas de la original', async () => {
    const [x, y] = A.maquinas;
    const crema = await original([tool(x, 1)]);
    const v = await version(crema, [tool(x, 1)]);
    const antes = [await retrato(crema), await retrato(v)];

    const resultado = await replaceAliveRecipeWithPropagation(
      crema,
      datos({ tools: [tool(y, 4)] }),
      [v, randomUUID()],
      A.userId,
      new Date(),
      A.scope,
    );

    expect(resultado).toBe('version_not_found');
    expect([await retrato(crema), await retrato(v)]).toEqual(antes);
  });

  it('R15: un fallo forzado al escribir las herramientas de una version no deja nada cambiado', async () => {
    const [x, y] = A.maquinas;
    const crema = await original([tool(x, 1)]);
    const v = await version(crema, [tool(x, 1)]);
    const antes = [await retrato(crema), await retrato(v)];

    const sufijo = token().slice(0, 12);
    const nombre = `qc194_falla_${sufijo}`;
    if (!/^[0-9a-f-]{36}$/.test(v)) throw new Error(`id inesperado: ${v}`);
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION public."${nombre}"() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
    );
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${nombre}" BEFORE INSERT OR UPDATE ON public.recipe_tools FOR EACH ROW
           WHEN (NEW.recipe_id = '${v}'::uuid) EXECUTE FUNCTION public."${nombre}"()`,
      );

      await expect(
        replaceAliveRecipeWithPropagation(
          crema,
          datos({ tools: [tool(x, 1), tool(y, 2)] }),
          [v],
          A.userId,
          new Date(),
          A.scope,
        ),
      ).rejects.toThrow(/fallo forzado/);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${nombre}" ON public.recipe_tools`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public."${nombre}"()`);
    }

    expect([await retrato(crema), await retrato(v)]).toEqual(antes);
  });

  it('R5: un producto inexistente que llegara al adaptador se traduce a ValidationError y no escribe nada', async () => {
    const [x] = A.maquinas;
    const id = await original([tool(x, 1)]);
    const antes = await retrato(id);

    await expect(
      replaceAliveRecipe(id, datos({ tools: [tool(randomUUID(), 1)] }), A.userId, new Date(), A.scope),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createRecipe(datos({ tools: [tool(randomUUID(), 1)] }), A.userId, new Date(), A.scope),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await retrato(id)).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
// Casos de uso por `@/lib/composition`
// ---------------------------------------------------------------------------

describe('casos de uso de recetas — herramientas', () => {
  const actor = (): { id: string; companyId: string; permissions: readonly string[] } => ({
    id: A.userId,
    companyId: A.companyId,
    permissions: ['recetas.modificar', 'recetas.consultar', 'inventario.modificar'],
  });

  function entrada(tools?: readonly RecipeToolData[]): Record<string, unknown> {
    const [a, b] = A.ingredientes;
    return {
      name: `Crema ${token()}`,
      steps: [],
      lines: [
        { productId: a, percentage: '70.00' },
        { productId: b, percentage: '30.00' },
      ],
      ...(tools === undefined ? {} : { tools }),
    };
  }

  it('R19, R21: dar de baja un MACHINE usado como herramienta funciona, y la receta se sigue editando conservandola', async () => {
    const [, , z] = A.maquinas;
    const otra = (
      await prisma.product.create({
        data: { name: `MACHINE baja ${token()}`, nameNormalized: `machinebaja${token()}`, companyId: A.companyId, type: 'MACHINE' },
        select: { id: true },
      })
    ).id;
    const { id } = await recetas.createRecipe(entrada([tool(otra, 2), tool(z, 1)]), actor());

    await inventario.deleteProduct(otra, actor());
    expect((await prisma.product.findUniqueOrThrow({ where: { id: otra } })).deletedAt).not.toBeNull();

    const detalle = await recetas.getRecipe(id, actor());
    expect(detalle.tools.map((t) => [t.productId, t.productName === null, t.quantity])).toEqual([
      [otra, true, 2],
      [z, false, 1],
    ]);

    // Se reenvia tal cual, con otra cantidad: la de baja se acepta porque ya estaba.
    await recetas.updateRecipe(id, { ...entrada([tool(otra, 5), tool(z, 1)]), name: detalle.name }, actor());
    expect(await herramientasDe(id)).toEqual([tool(otra, 5), tool(z, 1)]);

    // Pero no puede entrar como nueva en otra receta.
    await expect(recetas.createRecipe(entrada([tool(otra, 1)]), actor())).rejects.toBeInstanceOf(ValidationError);
  });

  it('R13: editar las herramientas de una version no cambia las de la original', async () => {
    const [x, y] = A.maquinas;
    const { id: crema } = await recetas.createRecipe(entrada([tool(x, 1)]), actor());
    const { id: v } = await recetas.createRecipeVersion(crema, { name: `V ${token()}` }, actor());
    expect(await herramientasDe(v)).toEqual([tool(x, 1)]);
    const antes = await retrato(crema);

    const [a, b] = A.ingredientes;
    await recetas.updateRecipeVersion(
      v,
      {
        name: `V ${token()}`,
        lines: [
          { productId: a, percentage: '70.00' },
          { productId: b, percentage: '30.00' },
        ],
        tools: [tool(x, 3), tool(y, 1)],
      },
      actor(),
    );

    expect(await herramientasDe(v)).toEqual([tool(x, 3), tool(y, 1)]);
    expect(await retrato(crema)).toEqual(antes);
  });

  it('R3: una herramienta nueva que no es MACHINE se rechaza sin crear la receta', async () => {
    const [a] = A.ingredientes;
    const nombre = `Crema ${token()}`;
    await expect(recetas.createRecipe({ ...entrada([tool(a, 1)]), name: nombre }, actor())).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await prisma.recipe.count({ where: { companyId: A.companyId, name: nombre } })).toBe(0);
  });
});
