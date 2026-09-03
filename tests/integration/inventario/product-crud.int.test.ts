/**
 * Tests de integracion de QC-20 (crud-de-productos) contra una base Postgres REAL, con la
 * migracion `20260902170759_product_audit_and_presentation_uniqueness` aplicada encima de
 * la de QC-14.
 *
 * DOS ESTRATEGIAS DE AISLAMIENTO EN ESTE ARCHIVO, y es deliberado:
 *
 * 1) Los casos que verifican una restriccion de la BASE (R7: la FK de auditoria) usan el
 *    patron ya establecido en `inventario-constraints.int.test.ts`: `prisma.$transaction`
 *    interactiva que SIEMPRE termina en `ROLLBACK` (`RollbackSignal`), con `SAVEPOINT` para
 *    la operacion que se espera que falle y afirmaciones sobre el SQLSTATE crudo (leido de
 *    `meta.code`, nunca del texto -en espanol en esta maquina-).
 *
 * 2) Los casos que ejercitan el ADAPTADOR real (`product-prisma.ts`: `createProduct`,
 *    `findAliveProductById`, `updateAliveProduct`, `softDeleteAliveProduct`,
 *    `listAliveProducts`) NO pueden usar ese patron: esas funciones llaman al cliente
 *    Prisma GLOBAL (`@/lib/shared/db/prisma`), no a un `tx` inyectado, asi que una llamada
 *    hecha "dentro" del callback de `prisma.$transaction(...)` en realidad corre en OTRA
 *    conexion del pool y hace COMMIT de inmediato -no participa de esa transaccion-. Por
 *    eso estos casos crean sus propios datos con `prisma` real (compromiso deliberado:
 *    fila REAL, no una que se deshaga sola) y los borran ellos mismos en un bloque
 *    `finally`, por su `id` exacto. Ninguna afirmacion global ("hay N productos"): cada
 *    caso filtra por los ids que el mismo sembro.
 *
 * SQLSTATE, nunca el texto del mensaje (design.md > 12, segundo aviso).
 *
 * `cost` no aparece en este archivo (los productos de prueba no lo necesitan), pero si
 * apareciera se manejaria como `Prisma.Decimal`, nunca como `number` (docs/architecture.md
 * > Dominio n.o 4).
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createProduct,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1: tx + ROLLBACK), identicas en forma a
// `inventario-constraints.int.test.ts` y `recetas-constraints.int.test.ts`.
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

const FOREIGN_KEY_VIOLATION = '23503';

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
// Datos de apoyo, validos para las dos estrategias: `db` acepta tanto `tx` (dentro de una
// transaccion que se deshace) como `prisma` (cliente real). `PrismaClient` satisface
// estructuralmente `Prisma.TransactionClient` (tiene todo lo que ese tipo exige y algo
// mas), asi que un solo helper sirve para las dos estrategias.
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient;

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

/** Presentacion de apoyo. `presentations.name_normalized` es NOT NULL + indice unico. */
async function createTestPresentation(db: Db, name = `Bidon ${token()}`): Promise<string> {
  const presentation = await db.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  });
  return presentation.id;
}

/**
 * Unidad REAL de apoyo.
 *
 * 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. `products.unit_id`
 * tiene FK (`products_unit_id_fkey`), asi que ya no vale escribir el texto 'kg' ni inventar
 * un uuid -la base lo rechazaria con 23503-: la unidad se crea de verdad y se borra en el
 * `finally`, como el resto de datos de apoyo de este archivo. El nombre lleva `token()`
 * porque `units.name_normalized` tiene indice unico.
 */
async function createTestUnit(db: Db, symbol: string | null = 'kg'): Promise<string> {
  const name = `unidad ${token()}`;
  const unit = await db.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol },
    select: { id: true },
  });
  return unit.id;
}

/**
 * Usuario REAL completo (tipo de documento + rol + usuario), necesario para R7: la FK de
 * auditoria exige una referencia que exista de verdad. Marcado con `token()` porque
 * `users` tiene indices unicos parciales sobre correo, usuario y documento (QC-4).
 */
async function createTestUser(db: Db): Promise<string> {
  const marker = token();
  const documentType = await db.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await db.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
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
    },
    select: { id: true },
  });
  return user.id;
}

/** Borra, en orden, un usuario REAL creado con `createTestUser` y su rol/tipo de documento. */
async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true },
  });
  await db.user.delete({ where: { id: userId } });
  await db.role.delete({ where: { id: user.roleId } });
  await db.documentType.delete({ where: { code: user.documentTypeCode } });
}

function baseProductInput(overrides: Partial<NewProduct> = {}): Omit<NewProduct, 'presentationId'> {
  return {
    name: `Producto ${token()}`,
    minPurchase: 0,
    ...overrides,
  };
}

/** `INSERT INTO products` crudo, solo para el caso R7 que necesita el SQLSTATE real. */
function rawInsertProductWithAuthor(
  tx: Prisma.TransactionClient,
  name: string,
  presentationId: string,
  createdBy: string,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "products" ("name", "presentation_id", "created_by", "updated_by", "updated_at")
    VALUES (${name}, CAST(${presentationId} AS uuid), CAST(${createdBy} AS uuid), CAST(${createdBy} AS uuid), CURRENT_TIMESTAMP)`;
}

/** Recorre TODAS las paginas de `listAliveProducts` con un `pageSize` dado y devuelve la
 * union de sus items, en el orden en que se recorrieron. No asume nada sobre cuantas
 * paginas hay de antemano: usa el `totalPages` que devuelve la primera llamada. */
async function collectAllPages(
  pageSize: number,
): Promise<{ id: string; name: string }[]> {
  const first = await listAliveProducts({ page: 1, pageSize });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await listAliveProducts({ page, pageSize });
    items.push(...next.items);
  }
  return items.map((item) => ({ id: item.id, name: item.name }));
}

// ---------------------------------------------------------------------------

/**
 * Actor compartido por los casos que ejercitan el adaptador y no les importa QUIEN es el
 * autor (R15, R16, R26, R35): un usuario REAL de verdad (nunca un uuid inventado), creado
 * una vez y reutilizado, en vez de repetir el helper caro de tipo de documento + rol +
 * usuario en cada `it`. R7 y R6 -que si les importa el autor- crean el suyo propio.
 */
let sharedActorId: string;

beforeAll(async () => {
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'products' AND column_name IN ('created_by', 'updated_by'))
        OR (table_name = 'presentations' AND column_name = 'name_normalized')
      )`;
  const missing: string[] = [];
  if (!columns.some((c) => c.table_name === 'products' && c.column_name === 'created_by')) {
    missing.push('products.created_by');
  }
  if (!columns.some((c) => c.table_name === 'products' && c.column_name === 'updated_by')) {
    missing.push('products.updated_by');
  }
  if (!columns.some((c) => c.table_name === 'presentations' && c.column_name === 'name_normalized')) {
    missing.push('presentations.name_normalized');
  }
  if (missing.length > 0) {
    throw new Error(
      `la base de pruebas no tiene aplicada la migracion de QC-20 (product_audit_and_presentation_uniqueness). ` +
        `Faltan: ${missing.join(', ')}. Corre \`pnpm run db:migrate\` antes de estos tests.`,
    );
  }

  sharedActorId = await createTestUser(prisma);
});

afterAll(async () => {
  await deleteTestUser(prisma, sharedActorId);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('auditoria de autor (R7)', () => {
  it('rechaza con SQLSTATE 23503 el producto cuyo autor no es un usuario existente', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createTestPresentation(tx);
      const realUserId = await createTestUser(tx);

      // Camino feliz: el autor SI existe. Se hace con la API tipada porque aqui no se
      // afirma sobre ningun SQLSTATE.
      const created = await tx.product.create({
        data: {
          name: 'Producto con autor real',
          presentationId,
          minPurchase: 0,
          createdBy: realUserId,
          updatedBy: realUserId,
        },
        select: { id: true, createdBy: true },
      });
      expect(created.createdBy).toBe(realUserId);

      // Rechazo: el autor NO existe. SQL crudo porque solo el propaga el SQLSTATE real
      // en `meta.code` (la API tipada da `P2003`, no `23503`).
      const fakeAuthorId = randomUUID();
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertProductWithAuthor(tx, 'Producto con autor fantasma', presentationId, fakeAuthorId),
        'alta de producto con un autor inexistente',
      );
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION);

      // «No crear ninguna fila»: se busca lo que ese intento habria escrito, no el total.
      const survivors = await tx.product.findMany({
        where: { name: 'Producto con autor fantasma' },
        select: { id: true },
      });
      expect(survivors).toEqual([]);
    });
  });
});

describe('R6: el autor de la creacion no cambia al editar ni al borrar', () => {
  it('conserva created_by al editar y al borrar, y solo actualiza updated_by', async () => {
    const presentationId = await createTestPresentation(prisma);
    const authorA = await createTestUser(prisma);
    const authorB = await createTestUser(prisma);
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput(), presentationId };
      const created = await createProduct(input, authorA, new Date('2026-01-01T00:00:00Z'));
      productId = created.id;

      const afterCreate = await findAliveProductById(created.id);
      expect(afterCreate?.createdBy).toBe(authorA);
      expect(afterCreate?.updatedBy).toBe(authorA);

      const ok = await updateAliveProduct(
        created.id,
        { ...input, name: 'Nombre editado por B' },
        authorB,
        new Date('2026-01-02T00:00:00Z'),
      );
      expect(ok).toBe(true);

      const afterUpdate = await findAliveProductById(created.id);
      // Es EXACTAMENTE lo que un test con dobles no puede demostrar (design.md > 12):
      // `updateAlive` ni siquiera recibe `createdBy` como parametro, asi que un doble
      // saldria verde por construccion. Aqui se comprueba contra la base real.
      expect(afterUpdate?.createdBy).toBe(authorA);
      expect(afterUpdate?.updatedBy).toBe(authorB);
      expect(afterUpdate?.name).toBe('Nombre editado por B');

      const deleted = await softDeleteAliveProduct(
        created.id,
        authorB,
        new Date('2026-01-03T00:00:00Z'),
      );
      expect(deleted).toBe(true);

      // El borrado es logico: se relee con Prisma directo, sin el filtro `deleted_at IS
      // NULL` que aplica `findAliveProductById` (R16), para poder ver la fila borrada.
      const afterDelete = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      expect(afterDelete.createdBy).toBe(authorA);
      expect(afterDelete.updatedBy).toBe(authorB);
      expect(afterDelete.deletedAt).not.toBeNull();
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await deleteTestUser(prisma, authorA);
      await deleteTestUser(prisma, authorB);
    }
  });
});

describe('R8 / D20: el listado no resuelve nombres de autor', () => {
  it('la lista devuelve los autores como identificadores, sin resolver ningun nombre', async () => {
    const presentationId = await createTestPresentation(prisma);
    const authorId = await createTestUser(prisma);
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput(), presentationId };
      const created = await createProduct(input, authorId, new Date());
      productId = created.id;

      const author = await prisma.user.findUniqueOrThrow({
        where: { id: authorId },
        select: { firstNames: true, lastNames: true },
      });

      const pages = await collectAllPages(25);
      const inList = pages.find((item) => item.id === created.id);
      expect(inList).toBeDefined();

      // El propio `listAliveProducts` no expone `createdBy`/`updatedBy` en su tipo de
      // salida sin pasar por `ProductView`, asi que se relee con la API del adaptador
      // que si los trae (`findAliveProductById`), y se afirma sobre la FORMA del dato: es
      // el identificador (uuid) del autor, no su nombre ni un texto que lo contenga.
      const view = await findAliveProductById(created.id);
      expect(view?.createdBy).toBe(authorId);
      expect(view?.updatedBy).toBe(authorId);
      expect(view?.createdBy).toMatch(/^[0-9a-f-]{36}$/u);
      expect(view?.createdBy).not.toContain(author.firstNames);
      expect(view?.createdBy).not.toContain(author.lastNames);
      expect(view?.createdBy).not.toBe(`${author.firstNames} ${author.lastNames}`);

      // Y el adaptador no toco `users` para nada: el nombre que se leyo arriba se pidio
      // por su cuenta, con una consulta propia de este test, no del adaptador (design.md
      // > 2.1, R8: `inventario` no consulta el modelo `User`).
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      await deleteTestUser(prisma, authorId);
    }
  });
});

describe('R15: el borrado logico conserva la fila', () => {
  it('al borrar conserva la fila y marca deleted_at', async () => {
    const presentationId = await createTestPresentation(prisma);
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. El producto de este
    // caso nace CON unidad -igual que antes, cuando era `unit: 'kg'`- porque lo que R15
    // vigila es que el borrado logico no pierda ningun dato de la fila, la unidad incluida.
    const unitId = await createTestUnit(prisma);
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput({ stock: 9, unitId }), presentationId };
      const created = await createProduct(input, sharedActorId, new Date());
      productId = created.id;

      const before = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      expect(before.deletedAt).toBeNull();

      const ok = await softDeleteAliveProduct(created.id, sharedActorId, new Date());
      expect(ok).toBe(true);

      // Se relee con Prisma DIRECTO (sin el filtro de "vivo") para comprobar que la fila
      // sigue existiendo ENTERA: R15 prohibe el borrado fisico.
      const after = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      expect(after.id).toBe(created.id);
      expect(after.name).toBe(before.name);
      expect(after.stock).toBe(before.stock);
      expect(after.unitId).toBe(before.unitId);
      expect(after.unitId).toBe(unitId);
      expect(after.deletedAt).not.toBeNull();
      expect(after.deletedAt).toBeInstanceOf(Date);
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
      // La unidad se borra DESPUES del producto: `products_unit_id_fkey` es ON DELETE
      // RESTRICT (QC-32 R13) y al reves fallaria.
      await prisma.unit.deleteMany({ where: { id: unitId } });
    }
  });
});

describe('R16: los productos borrados no aparecen en ninguna consulta', () => {
  it('la lista paginada y la ficha excluyen los productos borrados', async () => {
    const presentationId = await createTestPresentation(prisma);
    let productId: string | null = null;

    try {
      const input: NewProduct = { ...baseProductInput(), presentationId };
      const created = await createProduct(input, sharedActorId, new Date());
      productId = created.id;

      // Vivo: aparece en la ficha y en el listado.
      expect(await findAliveProductById(created.id)).not.toBeNull();
      const aliveList = await collectAllPages(25);
      expect(aliveList.some((item) => item.id === created.id)).toBe(true);

      const ok = await softDeleteAliveProduct(created.id, sharedActorId, new Date());
      expect(ok).toBe(true);

      // Borrado: desaparece de las DOS consultas, aunque la fila siga existiendo.
      expect(await findAliveProductById(created.id)).toBeNull();
      const deletedList = await collectAllPages(25);
      expect(deletedList.some((item) => item.id === created.id)).toBe(false);

      const stillThere = await prisma.product.findUnique({ where: { id: created.id } });
      expect(stillThere).not.toBeNull();
    } finally {
      if (productId !== null) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
    }
  });
});

describe('R26: la paginacion es estable con homonimos', () => {
  it('recorre las paginas sin repetir ni omitir productos homonimos', async () => {
    const presentationId = await createTestPresentation(prisma);
    const homonymName = `Homonimo ${token()}`;
    const createdIds: string[] = [];

    try {
      // Cinco productos con el MISMO nombre (D14/R12 lo permite explicitamente): sin el
      // desempate por id, dos de ellos podrian intercambiarse entre paginas.
      for (let i = 0; i < 5; i += 1) {
        const input: NewProduct = { ...baseProductInput({ name: homonymName }), presentationId };
        const created = await createProduct(input, sharedActorId, new Date());
        createdIds.push(created.id);
      }

      // `pageSize` pequeno a proposito, para forzar varias paginas.
      const seen = await collectAllPages(2);
      const seenIds = seen.map((item) => item.id);

      const ownSeen = seenIds.filter((id) => createdIds.includes(id));
      // Cada uno de los cinco aparece EXACTAMENTE una vez en toda la recorrida.
      expect(ownSeen.sort()).toEqual([...createdIds].sort());
      expect(new Set(ownSeen).size).toBe(createdIds.length);

      // Y el recorrido completo tampoco repite NINGUN id (no solo los propios): la prueba
      // de que el orden es estable es que la union entera es sin duplicados.
      expect(new Set(seenIds).size).toBe(seenIds.length);
    } finally {
      await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
    }
  });
});

describe('R35: orden name ASC, id ASC', () => {
  it('ordena por nombre ascendente y desempata por identificador ascendente', async () => {
    const presentationId = await createTestPresentation(prisma);
    const homonymName = `Zzz-Orden ${token()}`;
    const createdIds: string[] = [];

    try {
      for (let i = 0; i < 4; i += 1) {
        const input: NewProduct = { ...baseProductInput({ name: homonymName }), presentationId };
        const created = await createProduct(input, sharedActorId, new Date());
        createdIds.push(created.id);
      }

      const all = await collectAllPages(25);
      const own = all.filter((item) => item.name === homonymName);

      expect(own).toHaveLength(createdIds.length);
      // Mismo nombre para todos: lo unico que puede ordenarlos es el desempate por id.
      const orderedIds = own.map((item) => item.id);
      const expectedOrder = [...orderedIds].sort();
      expect(orderedIds).toEqual(expectedOrder);
    } finally {
      await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.presentation.deleteMany({ where: { id: presentationId } });
    }
  });
});
