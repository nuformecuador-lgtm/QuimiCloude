/**
 * QC-50 T23 — el ambito por empresa de `recetas`, contra Postgres REAL.
 *
 * Mismo criterio que `tests/integration/pedidos/company-scope-queries.int.test.ts` (QC-60) y
 * `tests/integration/inventario/company-scope.int.test.ts` (QC-49): los adaptadores de este
 * modulo hablan con el cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no con un `tx`
 * inyectado, asi que envolver la corrida en una transaccion del test no los alcanzaria -
 * correrian en otra conexion del pool y verian una base vacia-. Las siembras y el alta REAL por
 * el adaptador COMMITEAN de verdad y este archivo limpia lo suyo en `afterAll`, en el orden que
 * exigen las FK (lineas -> recetas -> producto/unidad propios -> usuario -> rol y tipo de
 * documento -> empresa; la unidad de sistema es compartida y se borra la ultima). Las empresas
 * nacen con nombre irrepetible (`token()`), y por eso los `total` se afirman como IGUALDAD y no
 * como «al menos».
 *
 * La UNICA parte que necesita `SAVEPOINT` es R11: para leer el `meta.target` REAL de un `23505`
 * hace falta el error crudo de Prisma, y `createRecipe`/`prisma.recipe.create` no lo entregan
 * fuera de una transaccion que se pueda deshacer sin tocar las filas de siembra de los demas
 * casos. Esos sub-casos abren su PROPIA `prisma.$transaction` con `ROLLBACK` garantizado y un
 * `SAVEPOINT` alrededor de la escritura que se espera que falle -mismo patron que
 * `recetas-constraints.int.test.ts`-, y no dejan ninguna fila.
 *
 * Un `'not_found'` no prueba que no se escribiera nada: la fila ajena -y sus lineas, con
 * `include: { lines: true }`- se RELEE entera despues de cada escritura cruzada, y cada
 * aserto negativo lleva su control positivo para que un `updateMany`/`create` roto no deje
 * verde el archivo.
 *
 * Cubre R11, R15, R16, R17, R18, R20, R22, R24, R25, R30.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { findProductRefs } from '@/lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma';
import { findRecipeRefsIncludingDeleted } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma';
import {
  createRecipe,
  findAliveRecipeById,
  listAliveRecipes,
  replaceAliveRecipe,
  softDeleteAliveRecipe,
} from '@/lib/modules/recetas/adapters/driven/persistence/recipe-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { ListQuery } from '@/lib/modules/recetas/domain/list-query';
import type { RecipeScope } from '@/lib/modules/recetas/domain/recipe-scope';
import type { NewRecipe } from '@/lib/modules/recetas/ports/recipe-repository';

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

/** El instante de toda la siembra: `createRecipe` escribe el `now` que se le pasa, y el filtro
 *  de fecha (unico filtro que `recipes` declara) se prueba contra ESTE dia UTC. */
const AHORA = new Date();
const DIA_UTC = AHORA.toISOString().slice(0, 10);

type Empresa = {
  readonly companyId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
  /** Producto y unidad PROPIOS, para las lineas de sus recetas y para R22/R24. */
  readonly productId: string;
  readonly unitId: string;
  /** Ids de receta sembrados, en orden. Los casos los toman por indice. */
  readonly recetas: string[];
};

/** Unidad de sistema (`company_id IS NULL`): compartida por las dos empresas (R24). */
let SYSTEM_UNIT_ID: string;

/** Tres vivas y una con borrado logico (indice 3). */
let A: Empresa;
/** Dos vivas: recuento distinto del de A, para que un `total` con filas ajenas no coincida por
 *  casualidad. La primera lleva un nombre distintivo para el caso de busqueda (R15). */
let B: Empresa;
/** Sin ninguna receta: el listado tiene que verse vacio, no el de al lado. */
let C: Empresa;

const MARCA_BUSQUEDA_B = `jabonespecial${token()}`;

function ambitoDe(empresa: Empresa): RecipeScope {
  return { companyId: empresa.companyId };
}

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
  // `recipes.created_by`/`updated_by` son FK reales a `users`.
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
  const product = await prisma.product.create({
    data: {
      name: `Producto ${marca}`,
      nameNormalized: `producto${marca}`,
      companyId: company.id,
    },
    select: { id: true },
  });
  const unit = await prisma.unit.create({
    data: {
      name: `Unidad ${marca}`,
      nameNormalized: `unidad${marca}`,
      symbol: `u${marca.slice(0, 8)}`,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    companyId: company.id,
    userId: user.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
    productId: product.id,
    unitId: unit.id,
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

/** Alta por el adaptador REAL: la conciliacion de lineas y la columna de empresa son las de
 *  produccion (R18). */
async function alta(empresa: Empresa, overrides: Partial<NewRecipe> = {}): Promise<string> {
  const resultado = await createRecipe(recetaNueva(overrides), empresa.userId, AHORA, ambitoDe(empresa));
  if (resultado === 'duplicate') throw new Error('el alta devolvio duplicate');
  empresa.recetas.push(resultado.id);
  return resultado.id;
}

beforeAll(async () => {
  const marcaSistema = token();
  const unidadSistema = await prisma.unit.create({
    data: {
      name: `Unidad de sistema ${marcaSistema}`,
      nameNormalized: `unidadsistema${marcaSistema}`,
      symbol: `s${marcaSistema.slice(0, 8)}`,
      companyId: null,
    },
    select: { id: true },
  });
  SYSTEM_UNIT_ID = unidadSistema.id;

  A = await sembrarEmpresa('A');
  B = await sembrarEmpresa('B');
  C = await sembrarEmpresa('C');

  // A: tres vivas, la tercera se borra logicamente despues (indice 3 = borrada).
  await alta(A, {
    name: `Solucion comun ${token()}`,
    lines: [{ productId: A.productId, percentage: '100.00' }],
  });
  await alta(A, { name: `Segunda receta A ${token()}` });
  await alta(A, { name: `Tercera receta A ${token()}` });
  const recABorrada = await alta(A, { name: `Borrada A ${token()}` });
  expect(await softDeleteAliveRecipe(recABorrada, A.userId, AHORA, ambitoDe(A))).toBe('ok');

  // B: dos vivas. La primera lleva el termino distintivo para el caso de busqueda (R15).
  await alta(B, {
    name: `Jabon especial ${MARCA_BUSQUEDA_B}`,
    lines: [{ productId: B.productId, percentage: '100.00' }],
  });
  await alta(B, { name: `Segunda receta B ${token()}` });
});

afterAll(async () => {
  const empresas = [A, B, C].filter((empresa): empresa is Empresa => empresa !== undefined);
  for (const empresa of empresas) {
    // `recipe_lines` cae con su receta por `ON DELETE CASCADE`.
    await prisma.recipe.deleteMany({ where: { companyId: empresa.companyId } });
  }
  for (const empresa of empresas) {
    await prisma.product.deleteMany({ where: { id: empresa.productId } });
    await prisma.unit.deleteMany({ where: { id: empresa.unitId } });
    await prisma.user.deleteMany({ where: { id: empresa.userId } });
    await prisma.role.deleteMany({ where: { id: empresa.roleId } });
    await prisma.documentType.deleteMany({ where: { code: empresa.documentTypeCode } });
    await prisma.company.deleteMany({ where: { id: empresa.companyId } });
  }
  if (SYSTEM_UNIT_ID !== undefined) {
    await prisma.unit.deleteMany({ where: { id: SYSTEM_UNIT_ID } });
  }
  await prisma.$disconnect();
});

/** Receta entera CON sus lineas: comparar solo el estado dejaria pasar una linea movida. */
async function foto(id: string): Promise<string> {
  const fila = await prisma.recipe.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
  return JSON.stringify(fila);
}

/** De la columna, porque el contrato de salida no publica la empresa (R19). */
async function empresaDeLaReceta(id: string): Promise<string> {
  const fila = await prisma.recipe.findUniqueOrThrow({ where: { id }, select: { companyId: true } });
  return fila.companyId;
}

function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}

async function idsVisibles(empresa: Empresa): Promise<string[]> {
  const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(empresa));
  return pagina.rows.map((item) => item.id);
}

describe('R15 — el listado devuelve EXACTAMENTE las recetas de su empresa, y el total tambien', () => {
  it('A ve sus tres vivas y ninguna de las dos de B', async () => {
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(A));

    const vivasDeA = [A.recetas[0], A.recetas[1], A.recetas[2]];
    expect([...pagina.rows.map((r) => r.id)].sort()).toEqual([...vivasDeA].sort());
    // Si el `count` usara otro `where` que el `findMany`, aqui saldria 4 con tres elementos.
    expect(pagina.total).toBe(3);

    for (const ajena of B.recetas) {
      expect(pagina.rows.map((r) => r.id)).not.toContain(ajena);
    }
  });

  it('B ve sus dos y ninguna de las de A', async () => {
    // Atrapa un adaptador que devolviera siempre las filas de la primera empresa sembrada.
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(B));

    expect([...pagina.rows.map((r) => r.id)].sort()).toEqual([...B.recetas].sort());
    expect(pagina.total).toBe(2);
    for (const ajena of A.recetas) {
      expect(pagina.rows.map((r) => r.id)).not.toContain(ajena);
    }
  });

  it('la receta con borrado logico de A no aparece: el ambito no sustituye a deleted_at', async () => {
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(A));
    expect(pagina.rows.map((r) => r.id)).not.toContain(A.recetas[3]);
    expect(pagina.total).toBe(3);
  });

  it('una empresa sin recetas ve la lista vacia, no la de al lado', async () => {
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(C));
    expect(pagina.rows).toEqual([]);
    expect(pagina.total).toBe(0);
  });

  it('R19: ni el resumen de la lista ni la ficha publican la empresa', async () => {
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(A));
    expect(pagina.rows.length).toBeGreaterThan(0);
    for (const item of pagina.rows) {
      expect(Object.keys(item)).not.toContain('companyId');
    }

    const ficha = await findAliveRecipeById(A.recetas[0] ?? '', ambitoDe(A));
    expect(ficha).not.toBeNull();
    expect(Object.keys(ficha ?? {})).not.toContain('companyId');
  });
});

describe('R15 — la busqueda y los filtros NO ensanchan lo visible', () => {
  it('una busqueda que solo casa con el nombre de B devuelve vacio desde A, con su control positivo desde B', async () => {
    // Si el ambito y la busqueda fueran hermanos dentro de un `OR`, la receta de B entraria por
    // cumplir el termino buscado.
    const desdeA = await listAliveRecipes(0, 50, consulta({ search: 'Jabon especial' }), ambitoDe(A));
    expect(desdeA.rows).toEqual([]);
    expect(desdeA.total).toBe(0);

    // Sin este control, una busqueda rota que devolviera siempre cero dejaria verde lo de arriba.
    const desdeB = await listAliveRecipes(0, 50, consulta({ search: 'Jabon especial' }), ambitoDe(B));
    expect(desdeB.rows.map((r) => r.id)).toEqual([B.recetas[0]]);
    expect(desdeB.total).toBe(1);
  });

  it('un filtro de fecha que casa en las dos empresas solo trae las de la propia', async () => {
    // Las dos empresas sembraron con el MISMO `now` (`AHORA`): el filtro por ese dia casa con
    // las filas de las dos, y por eso demuestra que el ambito no se disuelve en el filtro.
    const filters = { createdAt: { kind: 'dateRange' as const, from: DIA_UTC, to: DIA_UTC } };

    const desdeA = await listAliveRecipes(0, 50, consulta({ filters }), ambitoDe(A));
    expect([...desdeA.rows.map((r) => r.id)].sort()).toEqual(
      [A.recetas[0], A.recetas[1], A.recetas[2]].sort(),
    );
    expect(desdeA.total).toBe(3);

    const desdeB = await listAliveRecipes(0, 50, consulta({ filters }), ambitoDe(B));
    expect([...desdeB.rows.map((r) => r.id)].sort()).toEqual([...B.recetas].sort());
    expect(desdeB.total).toBe(2);
  });
});

describe('R16, R17, R20 — findAliveById / replaceAlive / softDeleteAlive con un id AJENO', () => {
  it('la ficha de una receta de B, pedida desde A, es null —y desde B no lo es', async () => {
    expect(await findAliveRecipeById(B.recetas[0] ?? '', ambitoDe(A))).toBeNull();
    const propia = await findAliveRecipeById(B.recetas[0] ?? '', ambitoDe(B));
    expect(propia?.id).toBe(B.recetas[0]);
  });

  it('replaceAlive de una receta de B desde A devuelve not_found y NO toca la fila ni sus lineas', async () => {
    const ajena = B.recetas[0] ?? '';
    const antes = await foto(ajena);
    const lineasAntes = await prisma.recipeLine.count({ where: { recipeId: ajena } });
    expect(lineasAntes).toBe(1);

    const resultado = await replaceAliveRecipe(
      ajena,
      recetaNueva({
        name: `Nombre inyectado desde A ${token()}`,
        lines: [{ productId: A.productId, percentage: '90.00' }],
      }),
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    expect(resultado).toBe('not_found');
    expect(await foto(ajena)).toBe(antes);
    // R20: ninguna linea de la receta ajena se borro, se creo ni se actualizo.
    expect(await prisma.recipeLine.count({ where: { recipeId: ajena } })).toBe(lineasAntes);
    const lineaOriginal = await prisma.recipeLine.findFirstOrThrow({ where: { recipeId: ajena } });
    expect(lineaOriginal.productId).toBe(B.productId);
    expect(lineaOriginal.percentage.toFixed(2)).toBe('100.00');
  });

  it('control positivo: el mismo replaceAlive, desde B, SI escribe y concilia sus lineas', async () => {
    // Sin este caso, un `updateMany` que nunca escribiera dejaria verde el anterior.
    const propia = B.recetas[0] ?? '';
    const antes = await foto(propia);
    const nuevoNombre = `Jabon especial renombrado ${token()}`;

    const resultado = await replaceAliveRecipe(
      propia,
      recetaNueva({
        name: nuevoNombre,
        lines: [{ productId: B.productId, percentage: '50.00' }],
      }),
      B.userId,
      new Date(),
      ambitoDe(B),
    );

    expect(resultado).toBe('ok');
    expect(await foto(propia)).not.toBe(antes);
    const detalle = await findAliveRecipeById(propia, ambitoDe(B));
    expect(detalle?.name).toBe(nuevoNombre);
    expect(detalle?.lines).toHaveLength(1);
    expect(detalle?.lines[0]?.percentage).toBe('50.00');
    expect(await empresaDeLaReceta(propia)).toBe(B.companyId);
  });

  it('softDeleteAlive de una receta de B desde A devuelve not_found y NO le marca deleted_at', async () => {
    const ajena = B.recetas[1] ?? '';
    const antes = await foto(ajena);

    const resultado = await softDeleteAliveRecipe(ajena, A.userId, new Date(), ambitoDe(A));

    expect(resultado).toBe('not_found');
    expect(await foto(ajena)).toBe(antes);
    const fila = await prisma.recipe.findUniqueOrThrow({ where: { id: ajena } });
    expect(fila.deletedAt).toBeNull();
    expect(await idsVisibles(B)).toContain(ajena);
  });

  it('control positivo: softDeleteAlive desde B SI marca la fila, y desaparece de su listado', async () => {
    const propio = B.recetas[1] ?? '';

    const resultado = await softDeleteAliveRecipe(propio, B.userId, new Date(), ambitoDe(B));

    expect(resultado).toBe('ok');
    const fila = await prisma.recipe.findUniqueOrThrow({ where: { id: propio } });
    expect(fila.deletedAt).not.toBeNull();
    const desdeB = await listAliveRecipes(0, 50, consulta(), ambitoDe(B));
    expect(desdeB.rows.map((r) => r.id)).not.toContain(propio);
    // B sigue con su otra receta viva (recetas[0]): solo esta se borro.
    expect(desdeB.total).toBe(1);
  });

  it('ninguna de las escrituras cruzadas creo, movio ni borro nada del lado de A', async () => {
    const pagina = await listAliveRecipes(0, 50, consulta(), ambitoDe(A));
    expect(pagina.total).toBe(3);
    expect(await prisma.recipeLine.count({ where: { recipe: { companyId: A.companyId } } })).toBe(1);
  });
});

describe('R18 — el alta escribe la empresa del AMBITO', () => {
  it('cada receta sembrada quedo escrita con la empresa de quien la dio de alta', async () => {
    expect(await empresaDeLaReceta(A.recetas[0] ?? '')).toBe(A.companyId);
    expect(await empresaDeLaReceta(A.recetas[1] ?? '')).toBe(A.companyId);
    expect(await empresaDeLaReceta(A.recetas[2] ?? '')).toBe(A.companyId);
  });

  it('una alta nueva de C escribe la empresa de C, y no la ve nadie mas', async () => {
    const creada = await alta(C, { name: `Receta de C ${token()}` });
    expect(await empresaDeLaReceta(creada)).toBe(C.companyId);
    expect(await idsVisibles(A)).not.toContain(creada);
    expect(await idsVisibles(B)).not.toContain(creada);
    expect(await idsVisibles(C)).toContain(creada);
  });
});

describe('R22 — findProductRefs acotado a la empresa', () => {
  it('un producto propio vuelve, y el mismo id pedido para otra empresa NO vuelve', async () => {
    const propio = await findProductRefs([A.productId], A.companyId);
    expect(propio.map((ref) => ref.id)).toEqual([A.productId]);

    // Control negativo: el producto de A pedido en nombre de B no vuelve, igual que si no
    // existiera.
    const ajeno = await findProductRefs([A.productId], B.companyId);
    expect(ajeno).toEqual([]);
  });
});

describe('R24 — findUnitRefs: de sistema, propia y ajena', () => {
  it('la unidad de sistema vuelve para cualquier empresa', async () => {
    const desdeA = await findUnitRefs([SYSTEM_UNIT_ID], A.companyId);
    expect(desdeA.map((ref) => ref.id)).toEqual([SYSTEM_UNIT_ID]);

    const desdeB = await findUnitRefs([SYSTEM_UNIT_ID], B.companyId);
    expect(desdeB.map((ref) => ref.id)).toEqual([SYSTEM_UNIT_ID]);
  });

  it('la unidad propia vuelve para su empresa', async () => {
    const propia = await findUnitRefs([A.unitId], A.companyId);
    expect(propia.map((ref) => ref.id)).toEqual([A.unitId]);
  });

  it('la unidad de otra empresa NO vuelve', async () => {
    const ajena = await findUnitRefs([A.unitId], B.companyId);
    expect(ajena).toEqual([]);
  });
});

describe('R25 — findRecipeRefsIncludingDeleted acotado, con la baja logica viajando en la referencia', () => {
  it('una receta propia viva vuelve con isDeleted en false', async () => {
    const refs = await findRecipeRefsIncludingDeleted([A.recetas[0] ?? ''], A.companyId);
    expect(refs).toEqual([{ id: A.recetas[0], name: expect.any(String), isDeleted: false }]);
  });

  it('una receta propia con borrado logico vuelve, marcada, y no se confunde con la ausencia', async () => {
    const refs = await findRecipeRefsIncludingDeleted([A.recetas[3] ?? ''], A.companyId);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.id).toBe(A.recetas[3]);
    expect(refs[0]?.isDeleted).toBe(true);
  });

  it('una receta de otra empresa NO vuelve en absoluto, viva o borrada', async () => {
    // Control positivo primero: el mismo id SI vuelve pedido en nombre de su propia empresa.
    const propia = await findRecipeRefsIncludingDeleted([B.recetas[0] ?? ''], B.companyId);
    expect(propia).toHaveLength(1);

    const ajenaViva = await findRecipeRefsIncludingDeleted([B.recetas[0] ?? ''], A.companyId);
    expect(ajenaViva).toEqual([]);

    const ajenaBorrada = await findRecipeRefsIncludingDeleted([A.recetas[3] ?? ''], B.companyId);
    expect(ajenaBorrada).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// R11 — el duplicado de nombre, y el `meta.target` REAL del indice compuesto.
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

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<unknown> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return error;
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

function metaTargetDe(error: unknown): readonly string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    throw new Error(`se esperaba un PrismaClientKnownRequestError, llego: ${String(error)}`);
  }
  const target: unknown = error.meta?.target;
  if (Array.isArray(target)) return target as string[];
  throw new Error(`meta.target no vino como array: ${JSON.stringify(error.meta)}`);
}

describe('R11 — el duplicado de nombre llega como \'duplicate\', con el meta.target real', () => {
  it('el adaptador traduce el 23505 del indice compuesto a \'duplicate\', y acepta el mismo nombre en otra empresa', async () => {
    const nombre = `Desengrasante ${token()}`;

    const primera = await alta(A, { name: nombre });
    const segundaEnA = await createRecipe(recetaNueva({ name: nombre }), A.userId, new Date(), ambitoDe(A));
    expect(segundaEnA).toBe('duplicate');

    // Control positivo: el MISMO nombre normalizado en OTRA empresa se acepta (R10).
    const enB = await createRecipe(recetaNueva({ name: nombre }), B.userId, new Date(), ambitoDe(B));
    expect(enB).not.toBe('duplicate');
    if (enB !== 'duplicate') B.recetas.push(enB.id);

    expect(primera).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('el meta.target real incluye name_normalized (indice recipes_company_name_unique)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const nombre = `Choque de nombre ${token()}`;
      await tx.recipe.create({
        data: { name: nombre, nameNormalized: nombre.toLowerCase(), companyId: A.companyId },
        select: { id: true },
      });

      const error = await expectRejectedByDatabase(
        tx,
        () =>
          tx.recipe.create({
            data: { name: nombre, nameNormalized: nombre.toLowerCase(), companyId: A.companyId },
            select: { id: true },
          }),
        'segunda receta viva con el mismo nombre normalizado en la misma empresa',
      );

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      const target = metaTargetDe(error);
      // Se afirma que INCLUYE la columna del nombre -no que sea exactamente esa lista-: es lo
      // que sigue reconociendo el adaptador aunque el indice compuesto anada `company_id`.
      expect(target).toContain('name_normalized');
    });
  });

  it('el unico (recipe_id, product_id) de recipe_lines NUNCA se traduce a nombre duplicado', async () => {
    // Dos lineas con el MISMO producto en la MISMA receta: el 23505 que dispara es el de
    // `recipe_lines`, no el de `recipes`, y el adaptador tiene que relanzarlo crudo -nunca
    // devolver 'duplicate'-.
    const promesa = createRecipe(
      recetaNueva({
        lines: [
          { productId: A.productId, percentage: '40.00' },
          { productId: A.productId, percentage: '60.00' },
        ],
      }),
      A.userId,
      new Date(),
      ambitoDe(A),
    );

    await expect(promesa).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    try {
      await promesa;
      throw new Error('se esperaba que createRecipe lanzara');
    } catch (error) {
      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
      const target = metaTargetDe(error);
      expect(target).not.toContain('name_normalized');
      expect(target).toContain('recipe_id');
      expect(target).toContain('product_id');
    }

    // Y no quedo ninguna fila huerfana: la receta entera se revirtio.
    const huerfanas = await prisma.recipeLine.count({ where: { productId: A.productId } });
    expect(huerfanas).toBe(1); // la unica linea viva es la de la receta sembrada en R16/R17/R20.
  });
});

// ---------------------------------------------------------------------------
// R30 — quitar FORCE ROW LEVEL SECURITY no cambia ningun resultado.
// ---------------------------------------------------------------------------

/** Todo lo que el modulo sabe contestar sobre una empresa, en una cadena comparable. */
async function retrato(empresa: Empresa, ajena: Empresa): Promise<string> {
  const listado = await listAliveRecipes(0, 50, consulta(), ambitoDe(empresa));
  const fichaAjena = await findAliveRecipeById(ajena.recetas[0] ?? '', ambitoDe(empresa));
  const escrituraAjena = await replaceAliveRecipe(
    ajena.recetas[0] ?? '',
    recetaNueva(),
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  const borradoAjeno = await softDeleteAliveRecipe(
    ajena.recetas[0] ?? '',
    empresa.userId,
    new Date(),
    ambitoDe(empresa),
  );
  const refsAjenas = await findRecipeRefsIncludingDeleted([ajena.recetas[0] ?? ''], empresa.companyId);
  return JSON.stringify({
    recetas: [...listado.rows.map((r) => r.id)].sort(),
    total: listado.total,
    fichaAjena,
    escrituraAjena,
    borradoAjeno,
    refsAjenas,
    filaAjena: await foto(ajena.recetas[0] ?? ''),
  });
}

async function forzarRls(tabla: 'recipes' | 'recipe_lines', forzar: boolean): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla}" ${forzar ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`);
}

async function forceDe(tabla: 'recipes' | 'recipe_lines'): Promise<boolean | null> {
  const filas = await prisma.$queryRaw<{ relforcerowsecurity: boolean }[]>`
    SELECT c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ${tabla}`;
  return filas[0]?.relforcerowsecurity ?? null;
}

describe('R30 — quitar FORCE ROW LEVEL SECURITY no cambia NINGUN resultado', () => {
  it('el retrato de A y el de B, sobre recipes y recipe_lines, es identico con FORCE y sin FORCE', async () => {
    // No prueba que la RLS proteja -Prisma conecta como DUENO de las tablas y no setea
    // `auth.uid()`-: prueba que el aislamiento NO depende de ella. Si quitarla cambiara algo, la
    // frontera estaria en la base y no en el adaptador.
    const conForceA = await retrato(A, B);
    const conForceB = await retrato(B, A);
    expect(await forceDe('recipes')).toBe(true);
    expect(await forceDe('recipe_lines')).toBe(true);

    let sinForceA = '';
    let sinForceB = '';
    try {
      await forzarRls('recipes', false);
      await forzarRls('recipe_lines', false);
      // Si el `ALTER` no hubiera entrado, dos retratos iguales no probarian nada.
      expect(await forceDe('recipes')).toBe(false);
      expect(await forceDe('recipe_lines')).toBe(false);
      sinForceA = await retrato(A, B);
      sinForceB = await retrato(B, A);
    } finally {
      // Sin el `finally`, un fallo dejaria la base de la corrida con la RLS relajada.
      await forzarRls('recipes', true);
      await forzarRls('recipe_lines', true);
    }

    expect(sinForceA).toBe(conForceA);
    expect(sinForceB).toBe(conForceB);

    // Del catalogo, sin fiarse del `finally`.
    expect(await forceDe('recipes')).toBe(true);
    expect(await forceDe('recipe_lines')).toBe(true);
  });
});

describe('R29 (de paso) — marcar la empresa como borrada no toca sus recetas ni sus lineas', () => {
  it('las recetas y las lineas de B sobreviven enteras a su propio borrado logico', async () => {
    const recetasAntes = await prisma.recipe.findMany({
      where: { companyId: B.companyId },
      orderBy: { id: 'asc' },
    });
    const lineasAntes = await prisma.recipeLine.findMany({
      where: { recipe: { companyId: B.companyId } },
      orderBy: { id: 'asc' },
    });
    expect(recetasAntes.length).toBeGreaterThan(0);

    try {
      await prisma.company.update({ where: { id: B.companyId }, data: { deletedAt: new Date() } });
      const empresa = await prisma.company.findUniqueOrThrow({ where: { id: B.companyId } });
      expect(empresa.deletedAt).not.toBeNull();

      expect(
        JSON.stringify(
          await prisma.recipe.findMany({ where: { companyId: B.companyId }, orderBy: { id: 'asc' } }),
        ),
      ).toBe(JSON.stringify(recetasAntes));
      expect(
        JSON.stringify(
          await prisma.recipeLine.findMany({
            where: { recipe: { companyId: B.companyId } },
            orderBy: { id: 'asc' },
          }),
        ),
      ).toBe(JSON.stringify(lineasAntes));
    } finally {
      await prisma.company.update({ where: { id: B.companyId }, data: { deletedAt: null } });
    }
  });
});
