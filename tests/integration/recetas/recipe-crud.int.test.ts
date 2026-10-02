/**
 * Tests de integracion de QC-25 (crud-de-recetas), Grupo D (T14), contra una base Postgres
 * REAL, ejercitando el adaptador `adapters/driven/persistence/recipe-prisma.ts` DIRECTAMENTE
 * -no un doble-. Las tablas `recipes` y `recipe_lines` (QC-24) y sus restricciones ya las
 * cubre `tests/integration/recetas/recetas-constraints.int.test.ts`; este archivo cubre el
 * comportamiento del ADAPTADOR: conciliacion de lineas, paginacion y borrado logico,
 * llamando a `createRecipe`, `findAliveRecipeById`, `listAliveRecipes`, `replaceAliveRecipe`
 * y `softDeleteAliveRecipe` tal cual los usa `lib/composition`.
 *
 * DOS ESTRATEGIAS DE AISLAMIENTO, mismo criterio que
 * `tests/integration/inventario/product-crud.int.test.ts`:
 *
 * 1) Los casos que verifican una restriccion CRUDA de la base (R10: SQLSTATE 23505) usan
 *    `prisma.$transaction` interactiva con `ROLLBACK` garantizado y `SAVEPOINT` para la
 *    operacion que se espera que falle.
 *
 * 2) Los casos que ejercitan el ADAPTADOR real (`createRecipe`, `findAliveRecipeById`,
 *    `listAliveRecipes`, `replaceAliveRecipe`, `softDeleteAliveRecipe`) NO pueden usar esa
 *    estrategia: esas funciones llaman al cliente Prisma GLOBAL (`@/lib/shared/db/prisma`),
 *    no a un `tx` inyectado, asi que una llamada hecha "dentro" del callback de
 *    `prisma.$transaction(...)` correria en otra conexion del pool y haria COMMIT de
 *    inmediato. Por eso estos casos crean sus propios datos con `prisma` real y los borran
 *    ellos mismos en un bloque `finally`, por su `id` exacto. Ninguna afirmacion global.
 *
 * SQLSTATE, nunca el texto del mensaje (Postgres en esta maquina responde en espanol).
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createRecipe,
  createRecipeVersion,
  findAliveRecipeById,
  listAliveRecipes,
  listAliveRecipeVersions,
  replaceAliveRecipe,
  replaceAliveRecipeWithPropagation,
  softDeleteAliveRecipe,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { createUpdateRecipe } from '@/lib/modules/recetas/domain/update-recipe';
import { findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';
import { MAX_PAGE_SIZE, toOffsetLimit } from '@/lib/shared/pagination';

import type { ListQuery } from '@/lib/modules/recetas/domain/list-query';
import type { NewRecipe, RecipeRepository } from '@/lib/modules/recetas/ports/recipe-repository';
import type { RecipeImageStorage } from '@/lib/modules/recetas/ports/recipe-image-storage';
import type { RecipeScope } from '@/lib/modules/recetas';
import type { ProductCatalog } from '@/lib/modules/inventario';
import type { Actor } from '@/lib/modules/recetas/domain/actor';

/**
 * QC-57: `listAliveRecipes` recibe ahora, ademas de la ventana, el CONTRATO GENERICO de
 * consulta ya saneado. Esta es la consulta VACIA -sin orden, sin filtro y sin busqueda-, o sea
 * exactamente el comportamiento que este archivo ya verificaba antes de la ficha: orden por
 * nombre y solo las vivas. Se adapta la LLAMADA; ningun aserto de comportamiento cambia (R26).
 */
const SIN_CONSULTA: ListQuery = { page: 1, sort: null, filters: {}, search: '' };

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1: tx + ROLLBACK), identicas en forma a
// `recetas-constraints.int.test.ts` y a `product-crud.int.test.ts`.
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test');
    this.name = 'RollbackSignal';
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx);
        throw new RollbackSignal();
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

let savepointSeq = 0;

const UNIQUE_VIOLATION = '23505';

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return sqlStateOf(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** Usuario REAL, necesario porque `recipes.created_by`/`updated_by` son FK reales. Devuelve
 *  tambien su empresa: QC-50 hizo `recipes.company_id` obligatoria, y este archivo usa esa
 *  MISMA empresa para las recetas que siembra, en vez de inventar una tercera. */
async function createTestUser(db: Db): Promise<{ userId: string; companyId: string }> {
  const marker = token();
  const documentType = await db.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await db.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  // Empresa efimera propia de este fixture: QC-47 R9 hizo `users.company_id` obligatoria, asi
  // que ningun usuario se puede crear ya sin una. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName` -la UNICA definicion de «mismo
  // nombre de empresa» (R3), importada del contrato publico de `identity`-, nunca de una copia
  // escrita a mano aqui.
  const companyName = `Empresa ${marker}`;
  const company = await db.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await db.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return { userId: user.id, companyId: company.id };
}

async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true, companyId: true },
  });
  await db.user.delete({ where: { id: userId } });
  await db.role.delete({ where: { id: user.roleId } });
  await db.documentType.delete({ where: { code: user.documentTypeCode } });
  // La empresa efimera va DESPUES del usuario: `users_company_id_fkey` es `ON DELETE RESTRICT`
  // (QC-47 R11), asi que borrarla antes la rechazaria la base con 23503.
  if (user.companyId === null) throw new Error('el usuario de prueba se creo con empresa');
  await db.company.delete({ where: { id: user.companyId } });
}

/** Copia local de `normalizeProductName` (QC-57). NO se importa el original a proposito: lo
 *  que aqui se prueba es otra cosa, y si el algoritmo real se rompiera este archivo no debe
 *  quedar verde por arrastre. El algoritmo lo prueba
 *  `tests/unit/inventario/product-name.test.ts`. */
function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

/**
 * Empresa del ANDAMIAJE de inventario (QC-49 R1).
 *
 * `products.company_id` --y `presentations.company_id` y `product_batches.company_id`-- son NOT
 * NULL desde `<ts>_inventory_company_scope`, asi que sembrar un producto exige una empresa. Se
 * REUTILIZA una que ya existe en la base (`db:seed` deja la de instalacion) en vez de crear una
 * nueva: este archivo limpia a mano lo que siembra, y una empresa creada aqui quedaria de
 * residuo --justo lo que QC-77 tiene que ir a limpiar despues--.
 *
 * Aqui la empresa es ANDAMIAJE y nada mas: este archivo no prueba el aislamiento por empresa
 * --eso es `tests/integration/inventario/company-scope.int.test.ts`-- y ningun aserto suyo
 * depende de cual sea.
 */
async function andamiajeCompanyId(db: Db): Promise<string> {
  const company = await db.company.findFirstOrThrow({ select: { id: true } });
  return company.id;
}

/** Producto vivo, para usar como linea de receta. Sin presentacion desde el 2026-09-09. */
async function createTestProduct(db: Db, name = `Producto ${token()}`): Promise<string> {
  const product = await db.product.create({
    data: {
      name,
      nameNormalized: normalizeProductNameForTest(name),
      companyId: await andamiajeCompanyId(db),
    },
    select: { id: true },
  });
  return product.id;
}

/** Borra un producto de prueba. */
async function deleteTestProduct(db: Db, productId: string): Promise<void> {
  await db.product.delete({ where: { id: productId } });
}

function baseRecipeInput(overrides: Partial<NewRecipe> = {}): NewRecipe {
  return {
    name: `Receta ${token()}`,
    description: null,
    steps: [],
    lines: [],
    imagePath: null,
    ...overrides,
  };
}

/**
 * Recorre TODAS las paginas de `listAliveRecipes` con un `limit` dado, avanzando el
 * `offset` hasta cubrir el `total` que devuelve la propia primera llamada. No asume nada
 * de antemano sobre cuantas paginas hay: cualquier receta viva que ya exista en la base de
 * pruebas participa en el recorrido igual que las que siembra este archivo.
 */
async function collectAllRecipes(
  limit: number,
): Promise<{ id: string; name: string }[]> {
  const first = await listAliveRecipes(0, limit, SIN_CONSULTA, sharedScope);
  const items = [...first.rows];
  for (let offset = limit; offset < first.total; offset += limit) {
    const next = await listAliveRecipes(offset, limit, SIN_CONSULTA, sharedScope);
    items.push(...next.rows);
  }
  return items.map((item) => ({ id: item.id, name: item.name }));
}

// ---------------------------------------------------------------------------

let sharedActorId: string;
let sharedCompanyId: string;
let sharedScope: RecipeScope;

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('recipes', 'recipe_lines')`;
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-24 (recipes y recipe_lines). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    );
  }

  const actor = await createTestUser(prisma);
  sharedActorId = actor.userId;
  sharedCompanyId = actor.companyId;
  sharedScope = { companyId: sharedCompanyId };
});

afterAll(async () => {
  await deleteTestUser(prisma, sharedActorId);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('R5: alta de una receta con sus lineas', () => {
  it('crea la receta con todas sus lineas y devuelve su identificador', async () => {
    const productA = await createTestProduct(prisma, 'Tensioactivo anionico');
    const productB = await createTestProduct(prisma, 'Hidroxido de sodio');
    let recipeId: string | null = null;

    try {
      const input = baseRecipeInput({
        description: 'Formula de prueba',
        steps: [
          { blocks: [{ kind: 'paragraph', spans: [{ text: 'Pesar' }] }] },
          { blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Mezclar' }] }] }] },
        ],
        lines: [
          { productId: productA, percentage: '70.00' },
          { productId: productB, percentage: '30.00' },
        ],
      });

      const result = await createRecipe(input, sharedActorId, new Date(), sharedScope);
      expect(result).not.toBe('duplicate');
      const created = result as { id: string };
      recipeId = created.id;
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);

      const detail = await findAliveRecipeById(created.id, sharedScope);
      expect(detail).not.toBeNull();
      expect(detail?.name).toBe(input.name);
      expect(detail?.description).toBe('Formula de prueba');
      // El DOCUMENTO del paso viaja y vuelve entero, con sus bloques y su orden (QC-62 R1, R16):
      // la columna `steps` es JSON y guarda el objeto tal cual, sin aplanar ni derivar nada.
      expect(detail?.steps).toEqual([
        { blocks: [{ kind: 'paragraph', spans: [{ text: 'Pesar' }] }] },
        { blocks: [{ kind: 'checklist', items: [{ spans: [{ text: 'Mezclar' }] }] }] },
      ]);
      expect(detail?.lines).toHaveLength(2);
      const byProduct = new Map(detail?.lines.map((line) => [line.productId, line]));
      expect(byProduct.get(productA)?.percentage).toBe('70.00');
      expect(byProduct.get(productB)?.percentage).toBe('30.00');
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
      await deleteTestProduct(prisma, productA);
      await deleteTestProduct(prisma, productB);
    }
  });
});

describe('R4: guarda y relee cada porcentaje con el mismo valor enviado', () => {
  it('92,50 % + 7,50 % se guardan y se releen exactos, contra Postgres real', async () => {
    const productA = await createTestProduct(prisma, 'Insumo al 92,50 %');
    const productB = await createTestProduct(prisma, 'Insumo al 7,50 %');
    let recipeId: string | null = null;

    try {
      const input = baseRecipeInput({
        lines: [
          { productId: productA, percentage: '92.50' },
          { productId: productB, percentage: '7.50' },
        ],
      });

      const result = await createRecipe(input, sharedActorId, new Date(), sharedScope);
      expect(result).not.toBe('duplicate');
      recipeId = (result as { id: string }).id;

      const detail = await findAliveRecipeById(recipeId, sharedScope);
      expect(detail?.lines).toHaveLength(2);
      const byProduct = new Map(detail?.lines.map((line) => [line.productId, line]));
      expect(byProduct.get(productA)?.percentage).toBe('92.50');
      expect(byProduct.get(productB)?.percentage).toBe('7.50');
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
      await deleteTestProduct(prisma, productA);
      await deleteTestProduct(prisma, productB);
    }
  });
});

describe('R10: unicidad del nombre normalizado', () => {
  it('el indice unico rechaza con SQLSTATE 23505 la segunda receta viva con el mismo nombre normalizado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token();
      const normalized = `desengrasanteintegracion${marker}`;

      // La MISMA empresa en las dos filas (`sharedCompanyId`): el indice unico ahora es
      // `(company_id, name_normalized)`, asi que sin ella el choque no seria por nombre.
      const first = await tx.recipe.create({
        data: { name: `Desengrasante ${marker}`, nameNormalized: normalized, companyId: sharedCompanyId },
        select: { id: true },
      });

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "recipes" ("name", "name_normalized", "company_id", "updated_at")
            VALUES (${`Desengrasante otra vez ${marker}`}, ${normalized}, ${sharedCompanyId}::uuid, CURRENT_TIMESTAMP)`,
        'segunda receta viva con el mismo nombre normalizado',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      const survivors = await tx.recipe.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      });
      expect(survivors).toEqual([{ id: first.id }]);
    });
  });
});

describe('R12/R13: conciliacion de lineas en la edicion', () => {
  it('la linea que desaparece de la lista final se borra fisicamente', async () => {
    const productA = await createTestProduct(prisma, 'Producto que se queda');
    const productB = await createTestProduct(prisma, 'Producto que se va');
    let recipeId: string | null = null;

    try {
      const input = baseRecipeInput({
        lines: [
          { productId: productA, percentage: '40.00' },
          { productId: productB, percentage: '60.00' },
        ],
      });
      const created = await createRecipe(input, sharedActorId, new Date(), sharedScope);
      expect(created).not.toBe('duplicate');
      recipeId = (created as { id: string }).id;

      const result = await replaceAliveRecipe(
        recipeId,
        { ...input, lines: [{ productId: productA, percentage: '100.00' }] },
        sharedActorId,
        new Date(),
        sharedScope,
      );
      expect(result).toBe('ok');

      const detail = await findAliveRecipeById(recipeId, sharedScope);
      expect(detail?.lines).toHaveLength(1);
      expect(detail?.lines[0]?.productId).toBe(productA);

      // Borrado FISICO: la fila de la linea que desaparecio ya no existe, no esta marcada.
      const gone = await prisma.recipeLine.findFirst({
        where: { recipeId, productId: productB },
      });
      expect(gone).toBeNull();
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
      await deleteTestProduct(prisma, productA);
      await deleteTestProduct(prisma, productB);
    }
  });

  it('si falla una linea la edicion revierte entera y la receta queda como estaba', async () => {
    const productA = await createTestProduct(prisma, 'Producto valido');
    let recipeId: string | null = null;

    try {
      const originalName = `Receta original ${token()}`;
      const input = baseRecipeInput({
        name: originalName,
        lines: [{ productId: productA, percentage: '100.00' }],
      });
      const created = await createRecipe(input, sharedActorId, new Date(), sharedScope);
      expect(created).not.toBe('duplicate');
      recipeId = (created as { id: string }).id;

      const fantomProductId = randomUUID();
      const failing = replaceAliveRecipe(
        recipeId,
        {
          ...input,
          name: `Nombre nuevo ${token()}`,
          lines: [
            { productId: productA, percentage: '90.00' },
            { productId: fantomProductId, percentage: '10.00' },
          ],
        },
        sharedActorId,
        new Date(),
        sharedScope,
      );
      await expect(failing).rejects.toBeTruthy();

      // La receta y su unica linea original quedan EXACTAMENTE como estaban.
      const detail = await findAliveRecipeById(recipeId, sharedScope);
      expect(detail?.name).toBe(originalName);
      expect(detail?.lines).toHaveLength(1);
      expect(detail?.lines[0]?.productId).toBe(productA);
      expect(detail?.lines[0]?.percentage).toBe('100.00');

      const fantomLine = await prisma.recipeLine.findFirst({
        where: { recipeId, productId: fantomProductId },
      });
      expect(fantomLine).toBeNull();
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
      await deleteTestProduct(prisma, productA);
    }
  });
});

describe('R29/R30 (parte)/R32: paginacion', () => {
  it('devuelve como maximo el tamano de pagina pedido y el total de recetas', async () => {
    const marker = token();
    const createdIds: string[] = [];

    try {
      for (let i = 0; i < 3; i += 1) {
        const created = await createRecipe(
          baseRecipeInput({ name: `Pagina ${marker} ${i}` }),
          sharedActorId,
          new Date(),
          sharedScope,
        );
        expect(created).not.toBe('duplicate');
        createdIds.push((created as { id: string }).id);
      }

      const { rows, total } = await listAliveRecipes(0, 2, SIN_CONSULTA, sharedScope);
      expect(rows.length).toBeLessThanOrEqual(2);
      // Al menos las tres que este caso acaba de sembrar estan vivas.
      expect(total).toBeGreaterThanOrEqual(3);
    } finally {
      await prisma.recipe.deleteMany({ where: { id: { in: createdIds } } });
    }
  });

  it('el tamano de pagina se acota y el flujo completo no devuelve mas del maximo', async () => {
    // R30 (parte): el acotado en si lo prueba `tests/unit/pagination.test.ts`; aqui se
    // confirma el FLUJO COMPLETO con la base real: pedir un tamano enorme no hace que
    // `listAliveRecipes` devuelva mas del maximo, porque `toOffsetLimit` ya lo acoto antes
    // de llegar al adaptador.
    const { offset, limit } = toOffsetLimit(1, 999_999);
    expect(limit).toBe(MAX_PAGE_SIZE);

    const { rows } = await listAliveRecipes(offset, limit, SIN_CONSULTA, sharedScope);
    expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it('ordena por nombre ascendente y recorre las paginas sin repetir ni omitir ninguna receta', async () => {
    const marker = token();
    // Nombres con el marcador AL FRENTE y un sufijo ordenado, para que el orden esperado
    // entre ELLAS sea previsible sin importar que otras recetas vivas haya en la base.
    const suffixes = ['a', 'b', 'c', 'd', 'e'];
    const createdIds: string[] = [];

    try {
      for (const suffix of suffixes) {
        const created = await createRecipe(
          baseRecipeInput({ name: `zzzorden-${marker}-${suffix}` }),
          sharedActorId,
          new Date(),
          sharedScope,
        );
        expect(created).not.toBe('duplicate');
        createdIds.push((created as { id: string }).id);
      }

      // pageSize pequeno a proposito, para forzar varias paginas.
      const all = await collectAllRecipes(2);
      const own = all.filter((item) => item.name.startsWith(`zzzorden-${marker}-`));

      expect(own).toHaveLength(suffixes.length);
      // Cada una aparece EXACTAMENTE una vez y en el orden alfabetico esperado.
      expect(own.map((item) => item.name)).toEqual(
        suffixes.map((suffix) => `zzzorden-${marker}-${suffix}`),
      );

      // Y el recorrido completo no repite ningun id, tampoco de recetas ajenas a este caso.
      const allIds = all.map((item) => item.id);
      expect(new Set(allIds).size).toBe(allIds.length);
    } finally {
      await prisma.recipe.deleteMany({ where: { id: { in: createdIds } } });
    }
  });
});

describe('R35/R36: borrado logico', () => {
  it('al borrar conserva la fila y marca deleted_at', async () => {
    let recipeId: string | null = null;
    try {
      const input = baseRecipeInput({ description: 'No se debe perder' });
      const created = await createRecipe(input, sharedActorId, new Date(), sharedScope);
      expect(created).not.toBe('duplicate');
      recipeId = (created as { id: string }).id;

      const before = await prisma.recipe.findUniqueOrThrow({ where: { id: recipeId } });
      expect(before.deletedAt).toBeNull();

      const result = await softDeleteAliveRecipe(recipeId, sharedActorId, new Date(), sharedScope);
      expect(result).toBe('ok');

      // Se relee con Prisma DIRECTO, sin el filtro de "viva", para ver la fila borrada.
      const after = await prisma.recipe.findUniqueOrThrow({ where: { id: recipeId } });
      expect(after.id).toBe(recipeId);
      expect(after.name).toBe(before.name);
      expect(after.description).toBe('No se debe perder');
      expect(after.deletedAt).not.toBeNull();
      expect(after.deletedAt).toBeInstanceOf(Date);
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
    }
  });

  it('la lista y el detalle excluyen las recetas borradas', async () => {
    let recipeId: string | null = null;
    try {
      const created = await createRecipe(baseRecipeInput(), sharedActorId, new Date(), sharedScope);
      expect(created).not.toBe('duplicate');
      recipeId = (created as { id: string }).id;

      // Viva: aparece en el detalle y en el listado.
      expect(await findAliveRecipeById(recipeId, sharedScope)).not.toBeNull();
      const aliveList = await collectAllRecipes(MAX_PAGE_SIZE);
      expect(aliveList.some((item) => item.id === recipeId)).toBe(true);

      const result = await softDeleteAliveRecipe(recipeId, sharedActorId, new Date(), sharedScope);
      expect(result).toBe('ok');

      // Borrada: desaparece de las dos consultas, aunque la fila siga existiendo.
      expect(await findAliveRecipeById(recipeId, sharedScope)).toBeNull();
      const deletedList = await collectAllRecipes(MAX_PAGE_SIZE);
      expect(deletedList.some((item) => item.id === recipeId)).toBe(false);

      const stillThere = await prisma.recipe.findUnique({ where: { id: recipeId } });
      expect(stillThere).not.toBeNull();
    } finally {
      if (recipeId !== null) await prisma.recipe.delete({ where: { id: recipeId } });
    }
  });
});

/** El repositorio y el catalogo de productos REALES, cableados exactamente como
 *  `lib/composition`, para ejercitar `createUpdateRecipe` de punta a punta contra Postgres. */
const realRecipeRepository: RecipeRepository = {
  create: createRecipe,
  findAliveById: findAliveRecipeById,
  listAlive: listAliveRecipes,
  replaceAlive: replaceAliveRecipe,
  softDeleteAlive: softDeleteAliveRecipe,
  createVersion: createRecipeVersion,
  listAliveVersions: listAliveRecipeVersions,
  replaceAliveWithPropagation: replaceAliveRecipeWithPropagation,
};

const realProductCatalog: ProductCatalog = {
  findRefs: findProductRefs,
  findCostingBatches: () => {
    throw new Error('recetas no debe costear nada');
  },
  findFinishedGoodsReceipts: () => {
    throw new Error('recetas no debe leer envases de empaque');
  },
};

const imagenesMudas: RecipeImageStorage = {
  upload: () => {
    throw new Error('este caso no sube ninguna imagen');
  },
  remove: async () => undefined,
  publicUrl: (path) => path,
};

describe('R23: editar una receta sembrada sin lineas se rechaza', () => {
  it('rechaza cambiar solo el nombre de una receta viva sin lineas, y el nombre no cambia', async () => {
    // Receta sembrada DIRECTO por Prisma, sin ninguna linea: exactamente lo que deja la
    // migracion de esta ficha (R8) sobre las recetas previas.
    const nombreOriginal = `Sembrada sin lineas ${token()}`;
    const recipe = await prisma.recipe.create({
      data: {
        name: nombreOriginal,
        nameNormalized: nombreOriginal.toLowerCase().replace(/\s+/gu, ''),
        companyId: sharedCompanyId,
      },
      select: { id: true },
    });

    try {
      const actor: Actor = {
        id: sharedActorId,
        companyId: sharedCompanyId,
        permissions: ['recetas.consultar', 'recetas.modificar'],
      };
      const updateRecipe = createUpdateRecipe({
        recipes: realRecipeRepository,
        products: realProductCatalog,
        images: imagenesMudas,
      });

      await expect(
        updateRecipe(recipe.id, { name: 'Nombre nuevo', description: null, steps: [], lines: [] }, actor),
      ).rejects.toThrow();

      const sinCambios = await prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id } });
      expect(sinCambios.name).toBe(nombreOriginal);
    } finally {
      await prisma.recipe.delete({ where: { id: recipe.id } });
    }
  });
});
