/**
 * T12, T13, T14, T15 (QC-52) — tests de integracion de la LINEA DEL CATALOGO contra una
 * base Postgres REAL, con la migracion `20260904123854_split_product_and_supplier_catalog`
 * aplicada.
 *
 * MISMAS DOS ESTRATEGIAS DE AISLAMIENTO que `supplier-crud.int.test.ts`:
 *
 * 1) Restricciones de la BASE → `prisma.$transaction` interactiva que SIEMPRE termina en
 *    `ROLLBACK`, `SAVEPOINT` para lo que debe fallar y afirmaciones sobre el SQLSTATE crudo
 *    de `meta.code`. El SQL crudo es obligatorio aqui: la API tipada traduce el SQLSTATE a
 *    su propio codigo y lo pierde. Lo que se demuestra es que **Postgres** rechaza, no que
 *    `zod` llego primero: un test que se quedara verde quitando el indice no contaria.
 *
 * 2) El ADAPTADOR real (`supplier-catalog-line-prisma.ts`) llama al cliente Prisma GLOBAL,
 *    asi que no participa de la transaccion del test: esos casos siembran con `prisma` real
 *    y limpian ellos mismos en un `finally`, por id exacto y en orden de FK.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — `presentation_id` -> `presentations`, `unit_id` ->
 * `units`, `created_by`/`updated_by` -> `users` y `supplier_id` -> `suppliers` son FK REALES
 * aunque el esquema Prisma declare las cuatro primeras como escalares sin `@relation`. No se
 * depende del seed.
 *
 * DECIMALES — `cost` y `min_purchase` se manejan como cadena (lo que expone el puerto) o
 * como `Prisma.Decimal`, NUNCA como `number` (R11).
 *
 * QUE SE CAYO DE LA VERSION DE QC-43, Y CON QUE REGLA:
 *   - el caso de unicidad por la pareja proveedor-articulo: QC-43 R27, sustituida por R15.
 *   - el caso de que un articulo dado de baja no se lleva la linea y que `productName` sale
 *     `null`: QC-43 R37, derogada por R18 (la linea ya no tiene nombre que resolver fuera).
 *   - el caso de la baja FISICA de la linea: QC-43 R34, derogada por la decision cerrada 5 y
 *     por R21.
 *   - la tercera parte del caso de R48 -«el borrado SI sigue permitido» sobre un proveedor
 *     dado de baja-: QC-43 R48, DEROGADA ENTERA por P5 y escrita al reves por R23.
 *
 * Requisitos cubiertos: R10, R13, R15, R16, R17, R19, R20, R21, R22, R23, R24, R32.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createCatalogLine,
  listCatalogLinesBySupplierAlive,
  replaceAliveCatalogLine,
  softDeleteAliveCatalogLine,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import { softDeleteAliveSupplier } from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { ListQuery } from '@/lib/modules/proveedores/domain/list-query';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1)
// ---------------------------------------------------------------------------

/**
 * QC-57: el adaptador recibe ahora el CONTRATO GENERICO de consulta. Sin orden, sin filtros y
 * sin busqueda es exactamente la lista de siempre (R11), asi que los casos de este archivo
 * siguen midiendo lo mismo -paginacion, total y las dos condiciones de vida- y ningun aserto
 * se relaja.
 */
function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return { page: 1, sort: null, filters: {}, search: '', ...partial };
}


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
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

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

function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

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

async function deleteTestUser(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roleId: true, documentTypeCode: true },
  });
  await db.user.delete({ where: { id: userId } });
  await db.role.delete({ where: { id: user.roleId } });
  await db.documentType.delete({ where: { code: user.documentTypeCode } });
}

/** Presentacion REAL de apoyo: `presentation_id` es FK a `presentations` (R30). */
async function createTestPresentation(db: Db): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  });
  return presentation.id;
}

/** Unidad REAL de apoyo: `unit_id` es FK a `units` (R30). */
async function createTestUnit(db: Db): Promise<string> {
  const name = `Unidad ${token()}`;
  const unit = await db.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol: 'ut' },
    select: { id: true },
  });
  return unit.id;
}

/**
 * Articulo REAL del inventario. La linea del catalogo ya NO lo referencia (R9): solo sirve
 * para el caso de R19, que demuestra que las dos tablas son independientes.
 */
async function createTestProduct(db: Db): Promise<{ id: string; presentationId: string }> {
  const presentationId = await createTestPresentation(db);
  const productName = `Articulo ${token()}`;
  const product = await db.product.create({
    data: { name: productName, nameNormalized: normalizeForTest(productName), presentationId },
    select: { id: true },
  });
  return { id: product.id, presentationId };
}

/** Proveedor REAL de apoyo, vivo o dado de baja. */
async function createTestSupplier(db: Db, deletedAt: Date | null = null): Promise<string> {
  const name = `Proveedor ${token()}`;
  const supplier = await db.supplier.create({
    data: {
      name,
      nameNormalized: normalizeSupplierName(name),
      phone: '+57 300 000 0000',
      deletedAt,
    },
    select: { id: true },
  });
  return supplier.id;
}

/**
 * `INSERT INTO supplier_catalog_lines` crudo: el unico camino que propaga el SQLSTATE.
 *
 * Los dos autores se pasan POR SEPARADO a proposito: R13 habla de LAS DOS columnas, y si
 * las dos se escribieran siempre con el mismo valor, quitar una de las dos FK dejaria el
 * test verde -lo rechazaria la otra- y la mitad de la regla quedaria sin vigilar.
 */
function rawInsertLine(
  tx: Prisma.TransactionClient,
  supplierId: string,
  presentationId: string,
  name: string,
  cost: string,
  createdBy: string | null = null,
  updatedBy: string | null = createdBy,
  deletedAt: Date | null = null,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "supplier_catalog_lines"
      ("supplier_id", "name", "name_normalized", "presentation_id", "cost",
       "created_by", "updated_by", "updated_at", "deleted_at")
    VALUES (
      CAST(${supplierId} AS uuid),
      ${name},
      ${normalizeSupplierName(name)},
      CAST(${presentationId} AS uuid),
      CAST(${cost} AS numeric),
      CAST(${createdBy} AS uuid),
      CAST(${updatedBy} AS uuid),
      CURRENT_TIMESTAMP,
      CAST(${deletedAt?.toISOString() ?? null} AS timestamptz))`;
}

/** Campos de negocio validos, con lo minimo puesto: cada caso cambia lo que quiere probar. */
function fields(
  name: string,
  presentationId: string,
  overrides: Partial<{
    unitId: string | null;
    imagePath: string | null;
    cost: string;
    minPurchase: string | null;
    deliveryTime: number | null;
  }> = {},
) {
  return {
    name,
    presentationId,
    unitId: null,
    imagePath: null,
    cost: '10.0000',
    minPurchase: null,
    deliveryTime: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

let sharedActorId: string;

beforeAll(async () => {
  // Falla claro si la migracion de QC-52 no esta aplicada: sin las columnas nuevas y sin el
  // indice unico parcial, la mitad de este archivo no significa nada.
  const columnas = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_catalog_lines'
      AND column_name IN ('name', 'name_normalized', 'presentation_id', 'unit_id', 'image_path', 'deleted_at')`;
  const [indice] = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'supplier_catalog_lines_name_presentation_unique'`;
  if (columnas.length !== 6 || indice === undefined) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-52 ' +
        '(split_product_and_supplier_catalog): faltan las columnas nuevas de la linea o el ' +
        'indice `supplier_catalog_lines_name_presentation_unique`. Corre `pnpm run db:migrate`.',
    );
  }

  sharedActorId = await createTestUser(prisma);
});

afterAll(async () => {
  await deleteTestUser(prisma, sharedActorId);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Restricciones de la BASE (estrategia 1)
// ---------------------------------------------------------------------------

describe('R15, R16, R17: la identidad de la linea la garantiza el indice unico parcial', () => {
  it('el indice rechaza con 23505 la segunda linea viva con el mismo nombre normalizado y la misma presentacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const presentationId = await createTestPresentation(tx);

      await rawInsertLine(tx, supplierId, presentationId, 'Acido citrico', '10.0000');

      // R15, y la mitad que solo la BASE puede demostrar: no hay `SELECT` previo por
      // igualdad -entre el `SELECT` y el `INSERT` cabe otra transaccion-, asi que el indice
      // es la UNICA garantia. Se prueba con una escritura equivalente pero NO identica: el
      // nombre se compara NORMALIZADO -sin acentos, sin mayusculas, sin puntuacion-, asi
      // que «ACIDO CITRICO» y «acido-citrico» son la misma linea.
      for (const equivalente of ['ACIDO CITRICO', 'acido-citrico', '  Acido  Citrico  ', 'Ácido Cítrico']) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertLine(tx, supplierId, presentationId, equivalente, '99.0000'),
          `segunda linea viva con el nombre equivalente ${equivalente}`,
        );
        expect(sqlState, `${equivalente} deberia chocar contra el indice`).toBe(UNIQUE_VIOLATION);
      }

      // Una sola fila, y con el costo de la PRIMERA: ningun rechazo actualizo nada.
      const lineas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { cost: true },
      });
      expect(lineas).toHaveLength(1);
      expect(lineas[0]?.cost.toString()).toBe('10');
    });
  });

  it('R16: el mismo nombre en otra presentacion, y la misma linea en otro proveedor, conviven', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const bidon = await createTestPresentation(tx);
      const tambor = await createTestPresentation(tx);

      // Un mismo proveedor puede vender lo mismo en bidon de 20 L y en tambor de 200 L como
      // DOS lineas distintas con precios distintos. Es la mitad de R16 que sale de tener
      // `presentation_id` DENTRO de la clave del indice.
      await rawInsertLine(tx, supplierId, bidon, 'Acido citrico', '10.0000');
      await rawInsertLine(tx, supplierId, tambor, 'Acido citrico', '85.0000');
      const delProveedor = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { presentationId: true, cost: true },
        orderBy: { cost: 'asc' },
      });
      expect(delProveedor.map((l) => l.presentationId).sort()).toEqual([bidon, tambor].sort());
      expect(delProveedor.map((l) => l.cost.toString())).toEqual(['10', '85']);

      // Y la otra mitad: DOS proveedores distintos pueden tener cada uno la misma linea, con
      // el mismo nombre y la misma presentacion. Sale de tener `supplier_id` en la clave.
      const otroSupplierId = await createTestSupplier(tx);
      await rawInsertLine(tx, otroSupplierId, bidon, 'Acido citrico', '12.0000');
      expect(
        await tx.supplierCatalogLine.count({
          where: { presentationId: bidon, nameNormalized: normalizeSupplierName('Acido citrico') },
        }),
      ).toBe(2);
    });
  });

  it('R17: una linea dada de baja libera su combinacion para una linea viva nueva', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const presentationId = await createTestPresentation(tx);

      // La primera se da de baja: la fila SIGUE en la tabla -nada se borra fisicamente
      // (R21)- pero el indice es PARCIAL `WHERE deleted_at IS NULL`, asi que deja de
      // ocupar la combinacion.
      await rawInsertLine(
        tx,
        supplierId,
        presentationId,
        'Acido citrico',
        '10.0000',
        null,
        null,
        new Date('2026-02-02T00:00:00Z'),
      );
      await rawInsertLine(tx, supplierId, presentationId, 'Acido citrico', '77.0000');

      const filas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { cost: true, deletedAt: true },
        orderBy: { cost: 'asc' },
      });
      expect(filas).toHaveLength(2);
      expect(filas.map((f) => f.cost.toString())).toEqual(['10', '77']);
      expect(filas.filter((f) => f.deletedAt === null)).toHaveLength(1);

      // Y la garantia sigue en pie para las VIVAS: una tercera linea viva con la misma
      // combinacion si choca. Sin esto, el test anterior pasaria tambien con el indice
      // borrado del todo.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, presentationId, 'Acido citrico', '88.0000'),
        'tercera linea viva con la combinacion ya ocupada',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);
    });
  });
});

describe('R10, R30: la presentacion, la unidad y el costo los cierra la base', () => {
  it('la FK rechaza con 23503 la presentacion y la unidad inexistentes, y admite la linea sin unidad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const presentationId = await createTestPresentation(tx);
      const unitId = await createTestUnit(tx);

      // (1) Presentacion INVENTADA: la FK la rechaza. Es la mitad de R30 que el esquema
      // Prisma no puede demostrar -el campo es un escalar sin `@relation`, asi que el
      // cliente no sabe que la restriccion existe-.
      const presentacionFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, randomUUID(), 'Acido citrico', '10.0000'),
        'alta de linea con una presentacion inexistente',
      );
      expect(presentacionFantasma).toBe(FOREIGN_KEY_VIOLATION);

      // (2) Unidad INVENTADA: la columna es anulable y eso no afloja nada. En SQL una FK
      // solo se verifica cuando la columna tiene valor.
      const unidadFantasma = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "supplier_catalog_lines"
            ("supplier_id", "name", "name_normalized", "presentation_id", "unit_id", "cost", "updated_at")
          VALUES (CAST(${supplierId} AS uuid), 'Sosa', 'sosa', CAST(${presentationId} AS uuid),
                  CAST(${randomUUID()} AS uuid), 10.0000, CURRENT_TIMESTAMP)`,
        'alta de linea con una unidad inexistente',
      );
      expect(unidadFantasma).toBe(FOREIGN_KEY_VIOLATION);

      // (3) SIN unidad: valido (R10). Y CON una unidad real, tambien.
      await rawInsertLine(tx, supplierId, presentationId, 'Sin unidad', '10.0000');
      await tx.$executeRaw`
        INSERT INTO "supplier_catalog_lines"
          ("supplier_id", "name", "name_normalized", "presentation_id", "unit_id", "cost", "updated_at")
        VALUES (CAST(${supplierId} AS uuid), 'Con unidad', 'conunidad', CAST(${presentationId} AS uuid),
                CAST(${unitId} AS uuid), 10.0000, CURRENT_TIMESTAMP)`;
      const filas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { name: true, unitId: true },
        orderBy: { name: 'asc' },
      });
      expect(filas).toEqual([
        { name: 'Con unidad', unitId },
        { name: 'Sin unidad', unitId: null },
      ]);
    });
  });

  it('los tres CHECK de QC-42/QC-43 siguen vigilando el costo, el minimo y el plazo', async () => {
    // R10, «tanto en la validacion de aplicacion como EN LA PROPIA BASE». QC-52 no toca
    // estos tres CHECK y este caso es lo que lo demuestra: si la migracion se los hubiera
    // llevado -Prisma no los modela, asi que ni los recrea ni avisa-, el esquema seguiria
    // validando y el cliente seguiria compilando.
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const presentationId = await createTestPresentation(tx);

      // Costo estrictamente mayor que cero: el cero tambien cae.
      for (const cost of ['0', '-1.5']) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertLine(tx, supplierId, presentationId, `Costo ${cost}`, cost),
          `alta de linea con costo ${cost}`,
        );
        expect(sqlState, `el costo ${cost} deberia caer`).toBe(CHECK_VIOLATION);
      }

      // Minimo de compra y plazo de entrega no negativos.
      for (const [columna, valor] of [
        ['min_purchase', '-0.0001'],
        ['delivery_time', '-1'],
      ] as const) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () =>
            tx.$executeRawUnsafe(
              `INSERT INTO "supplier_catalog_lines"
                 ("supplier_id", "name", "name_normalized", "presentation_id", "cost", "${columna}", "updated_at")
               VALUES ($1::uuid, $2, $2, $3::uuid, 10.0000, ${valor}, CURRENT_TIMESTAMP)`,
              supplierId,
              `linea ${columna}`,
              presentationId,
            ),
          `alta de linea con ${columna} negativo`,
        );
        expect(sqlState, `${columna} negativo deberia caer`).toBe(CHECK_VIOLATION);
      }

      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(0);
    });
  });
});

describe('R13, R32: los autores de la linea son una referencia real a un usuario', () => {
  it('la FK rechaza con 23503 el autor inexistente y admite la linea sin autor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const presentationId = await createTestPresentation(tx);
      const autorReal = await createTestUser(tx);

      // (1) Autor REAL: se acepta y queda escrito en las dos columnas.
      await rawInsertLine(tx, supplierId, presentationId, 'Con autor', '10.0000', autorReal);
      const conAutor = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { supplierId, name: 'Con autor' },
        select: { createdBy: true, updatedBy: true },
      });
      expect(conAutor).toEqual({ createdBy: autorReal, updatedBy: autorReal });

      // (2) Autor INVENTADO: la FK lo rechaza. Se prueban las DOS columnas por separado
      // -una fantasma y la otra nula cada vez-, porque cada una tiene su propia FK y
      // escribir siempre las dos juntas dejaria una sin vigilar.
      const soloCreadorFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, presentationId, 'Fantasma', '10.0000', randomUUID(), null),
        'alta de linea con un created_by inexistente',
      );
      expect(soloCreadorFantasma).toBe(FOREIGN_KEY_VIOLATION);

      const soloEditorFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, presentationId, 'Fantasma', '10.0000', null, randomUUID()),
        'alta de linea con un updated_by inexistente',
      );
      expect(soloEditorFantasma).toBe(FOREIGN_KEY_VIOLATION);
      expect(await tx.supplierCatalogLine.count({ where: { name: 'Fantasma' } })).toBe(0);

      // (3) SIN autor: una importacion o un seed pueden no tenerlo.
      await rawInsertLine(tx, supplierId, presentationId, 'Sin autor', '10.0000', null);
      const sinAutor = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { supplierId, name: 'Sin autor' },
        select: { createdBy: true, updatedBy: true },
      });
      expect(sinAutor).toEqual({ createdBy: null, updatedBy: null });
    });
  });
});

// ---------------------------------------------------------------------------
// El ADAPTADOR real contra Postgres (estrategia 2)
// ---------------------------------------------------------------------------

describe('R10, R13: alta de la linea del catalogo por el adaptador', () => {
  it('crea la linea con sus siete campos, deriva el nombre normalizado y sella los dos autores', async () => {
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    const unitId = await createTestUnit(prisma);
    try {
      const created = await createCatalogLine(
        {
          supplierId,
          ...fields('  Ácido Cítrico Anhidro  ', presentationId, {
            unitId,
            imagePath: 'catalogo/acido.png',
            cost: '1234.5678',
            minPurchase: '2.5000',
            deliveryTime: 7,
          }),
        },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(typeof created).not.toBe('string');
      if (typeof created === 'string') return;

      // R14: `name_normalized` se persiste JUNTO al nombre, derivado con la MISMA funcion
      // que usa el resto del modulo. Se comprueba contra la fila, no contra la vista: la
      // columna no es dato de salida y por eso el `select` del adaptador no la trae.
      const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, nameNormalized: true, deletedAt: true, createdBy: true, updatedBy: true },
      });
      expect(fila.nameNormalized).toBe(normalizeSupplierName('Ácido Cítrico Anhidro'));
      expect(fila.nameNormalized).toBe('acidocitricoanhidro');
      expect(fila.deletedAt).toBeNull();
      // R13: al nacer, el autor de la creacion y el de la ultima modificacion son el mismo.
      expect(fila.createdBy).toBe(sharedActorId);
      expect(fila.updatedBy).toBe(sharedActorId);

      const page = await listCatalogLinesBySupplierAlive(supplierId, consulta({ pageSize: 10 }));
      if (page === 'supplier_not_found') throw new Error('el proveedor de apoyo esta dado de baja');
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: created.id,
        supplierId,
        presentationId,
        unitId,
        imagePath: 'catalogo/acido.png',
        // R11: cadena con los 4 decimales de `DECIMAL(14,4)`, nunca un `number`.
        cost: '1234.5678',
        minPurchase: '2.5000',
        deliveryTime: 7,
        createdBy: sharedActorId,
        updatedBy: sharedActorId,
      });
      // R18: la vista no trae ni un solo campo derivado de otro modulo.
      expect(Object.keys(page.items[0] ?? {}).some((k) => /product/i.test(k))).toBe(false);
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.unit.delete({ where: { id: unitId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });

  it('R32: la base rechaza la presentacion y la unidad inexistentes, y el adaptador NO traduce a ciegas', async () => {
    // R10 (la mitad que solo Postgres puede demostrar), R32, `design.md > 6.2`.
    //
    // HALLAZGO QUE ESTE CASO DOCUMENTA, y que hay que leer antes de tocar el adaptador. El
    // diseno pedia traducir el `P2003` de `presentation_id`/`unit_id` a `invalid_input` y
    // relanzar crudo el de `created_by`/`updated_by`, decidiendo por `meta.field_name`. Con
    // Prisma 6.19.3 esa distincion NO ES POSIBLE: se comprobo contra esta misma base que
    // TODO `P2003` -de una FK declarada con `@relation` o de un escalar, en esta tabla y en
    // `products`- llega con `meta = { modelName, constraint: null }`. El conector no dice
    // cual. El precedente de `inventario` al que apunta `design.md > 6.2` esta hoy en la
    // misma situacion.
    //
    // Asi que el adaptador RELANZA CRUDO los cuatro casos, y este test afirma lo que de
    // verdad ocurre en vez de lo que nos gustaria. Lo que NO se hace es traducir a ciegas
    // -asumir que todo `P2003` de esta tabla es la presentacion-: le diria `invalid_input`
    // al usuario cuando el fallo fuera del autor, que es exactamente la mentira que
    // `design.md > 6.2` prohibe en el otro sentido.
    //
    // Lo que SI queda cerrado aqui, y es la mitad de R10 que importa: la BASE rechaza. La
    // logica de clasificacion, que es correcta y empezara a traducir en cuanto el conector
    // diga el nombre, se prueba en `tests/unit/proveedores/catalog-line-fk.test.ts`.
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    try {
      for (const [etiqueta, campos] of [
        ['presentacion inexistente', fields('Presentacion fantasma', randomUUID())],
        ['unidad inexistente', fields('Unidad fantasma', presentationId, { unitId: randomUUID() })],
      ] as const) {
        const fallo = await createCatalogLine(
          { supplierId, ...campos },
          sharedActorId,
          new Date('2026-01-01T00:00:00Z'),
        ).catch((error: unknown) => error);
        expect(fallo, etiqueta).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        expect((fallo as Prisma.PrismaClientKnownRequestError).code, etiqueta).toBe('P2003');
      }

      // El autor inventado tampoco se traduce, y ese SI es el trato que el diseno pedia: el
      // actor sale de una sesion real, asi que un autor inexistente es un fallo del sistema.
      const porAutor = await createCatalogLine(
        { supplierId, ...fields('Autor fantasma', presentationId) },
        randomUUID(),
        new Date('2026-01-01T00:00:00Z'),
      ).catch((error: unknown) => error);
      expect(porAutor).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect((porAutor as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');

      // Y ninguno de los tres intentos dejo fila.
      expect(await prisma.supplierCatalogLine.count({ where: { supplierId } })).toBe(0);
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });
});

describe('R24: la edicion reemplaza los siete campos y respeta la identidad de la linea', () => {
  it('renombra, cambia de presentacion, conserva created_by y no toca ningun dato del proveedor', async () => {
    const supplierId = await createTestSupplier(prisma);
    const bidon = await createTestPresentation(prisma);
    const tambor = await createTestPresentation(prisma);
    const unitId = await createTestUnit(prisma);
    const autorA = await createTestUser(prisma);
    const autorB = await createTestUser(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', bidon) },
        autorA,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      const proveedorAntes = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { name: true, phone: true, updatedAt: true, updatedBy: true },
      });

      // P6: la edicion SI puede cambiar el nombre y la presentacion. Es lo que hace
      // corregible una errata sin perder el historial ni la autoria de la linea.
      const editada = await replaceAliveCatalogLine(
        created.id,
        fields('Sosa Caustica', tambor, {
          unitId,
          imagePath: 'catalogo/sosa.png',
          cost: '99.9900',
          minPurchase: '1.0000',
          deliveryTime: 3,
        }),
        autorB,
        new Date('2026-02-02T00:00:00Z'),
      );
      expect(editada).toBe('ok');

      const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: created.id },
        select: {
          name: true,
          nameNormalized: true,
          presentationId: true,
          unitId: true,
          imagePath: true,
          cost: true,
          supplierId: true,
          createdBy: true,
          updatedBy: true,
        },
      });
      // R14: las dos columnas del nombre se mantienen SINCRONIZADAS en toda escritura.
      expect(fila.name).toBe('Sosa Caustica');
      expect(fila.nameNormalized).toBe(normalizeSupplierName('Sosa Caustica'));
      expect(fila.presentationId).toBe(tambor);
      expect(fila.unitId).toBe(unitId);
      expect(fila.imagePath).toBe('catalogo/sosa.png');
      expect(fila.cost.toString()).toBe('99.99');
      // R13: el autor de la creacion NO se pisa.
      expect(fila.createdBy).toBe(autorA);
      expect(fila.updatedBy).toBe(autorB);
      // R24: el proveedor de la linea es lo unico que la edicion no puede cambiar.
      expect(fila.supplierId).toBe(supplierId);

      // Y editar la linea NO toca ningun dato del proveedor.
      const proveedorDespues = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { name: true, phone: true, updatedAt: true, updatedBy: true },
      });
      expect(proveedorDespues).toEqual(proveedorAntes);
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestUser(prisma, autorB);
      await deleteTestUser(prisma, autorA);
      await prisma.unit.delete({ where: { id: unitId } });
      await prisma.presentation.delete({ where: { id: tambor } });
      await prisma.presentation.delete({ where: { id: bidon } });
    }
  });

  it('el renombrado que choca con otra linea viva del mismo proveedor da duplicate y no escribe nada', async () => {
    // R24 remite a R15: renombrar hacia una combinacion ya ocupada es el mismo duplicado que
    // en el alta, y lo detecta el mismo indice. El adaptador lo traduce a `'duplicate'`, no
    // deja escapar un SQLSTATE ni lo confunde con `'not_found'`.
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    try {
      const primera = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', presentationId) },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      const segunda = await createCatalogLine(
        { supplierId, ...fields('Sosa caustica', presentationId, { cost: '20.0000' }) },
        sharedActorId,
        new Date('2026-01-01T00:00:01Z'),
      );
      if (typeof primera === 'string' || typeof segunda === 'string') {
        throw new Error('el alta de apoyo fallo');
      }

      expect(
        await replaceAliveCatalogLine(
          segunda.id,
          fields('ACIDO CITRICO', presentationId, { cost: '20.0000' }),
          sharedActorId,
          new Date('2026-02-02T00:00:00Z'),
        ),
      ).toBe('duplicate');

      // La segunda quedo INTACTA: el rechazo no escribio nada.
      const sinCambios = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: segunda.id },
        select: { name: true, cost: true },
      });
      expect(sinCambios.name).toBe('Sosa caustica');

      // Y renombrar a algo libre SI funciona: el `'duplicate'` de arriba no es que la
      // edicion este rota.
      expect(
        await replaceAliveCatalogLine(
          segunda.id,
          fields('Hipoclorito', presentationId, { cost: '20.0000' }),
          sharedActorId,
          new Date('2026-02-02T00:00:00Z'),
        ),
      ).toBe('ok');
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });
});

describe('R21, R22: la baja de la linea es logica y ninguna consulta la devuelve', () => {
  it('la fila se conserva entera con su marca de baja, y el listado deja de verla', async () => {
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    const baja = new Date('2026-02-02T00:00:00Z');
    try {
      const created = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', presentationId) },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      expect(await softDeleteAliveCatalogLine(created.id, sharedActorId, baja)).toBe(true);

      // R21: la fila SIGUE EXISTIENDO, entera, con la marca puesta. Se comprueba contra la
      // TABLA, no contra el listado -que la ocultaria igual si el borrado fuera fisico-.
      const fila = await prisma.supplierCatalogLine.findUnique({
        where: { id: created.id },
        select: { name: true, cost: true, deletedAt: true, updatedAt: true, createdBy: true, updatedBy: true },
      });
      expect(fila).not.toBeNull();
      expect(fila?.name).toBe('Acido citrico');
      expect(fila?.deletedAt?.toISOString()).toBe(baja.toISOString());
      expect(fila?.updatedAt.toISOString()).toBe(baja.toISOString());
      // R13: la baja registra al actor como autor de la ultima modificacion.
      expect(fila?.updatedBy).toBe(sharedActorId);
      expect(fila?.createdBy).toBe(sharedActorId);

      // R22: ninguna consulta del catalogo la devuelve.
      const page = await listCatalogLinesBySupplierAlive(supplierId, consulta({ pageSize: 10 }));
      if (page === 'supplier_not_found') throw new Error('el proveedor de apoyo esta dado de baja');
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);

      // R23: la segunda baja de lo que ya esta dado de baja es «no encontrado», y la edicion
      // de una linea dada de baja tambien. Los tres casos son el mismo.
      expect(await softDeleteAliveCatalogLine(created.id, sharedActorId, baja)).toBe(false);
      expect(
        await replaceAliveCatalogLine(
          created.id,
          fields('Acido citrico', presentationId),
          sharedActorId,
          new Date('2026-03-03T00:00:00Z'),
        ),
      ).toBe('not_found');

      // El proveedor sigue vivo y entero: la baja de una linea no lo toca.
      const proveedor = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { deletedAt: true },
      });
      expect(proveedor?.deletedAt).toBeNull();
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });
});

describe('R20, R22, R23: la baja del proveedor arrastra su catalogo, y R48 de QC-43 queda derogada', () => {
  it('las tres filas quedan dadas de baja con el MISMO instante, ninguna se borra y ninguna consulta las devuelve', async () => {
    // R20, decision cerrada 5. Tres cosas se miden aqui y ninguna sobra:
    //   - las TRES filas siguen existiendo (nada se borra fisicamente);
    //   - las tres tienen `deleted_at`;
    //   - y es EL MISMO INSTANTE. Dos `now()` distintos harian imposible saber despues que
    //     lineas cayeron con que baja, y es el error facil: `$transaction([a, b])` con
    //     `CURRENT_TIMESTAMP` en cada `UPDATE` pasaria las dos primeras comprobaciones.
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    const baja = new Date('2026-02-02T10:11:12.000Z');
    try {
      const a = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', presentationId) },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      const b = await createCatalogLine(
        { supplierId, ...fields('Sosa caustica', presentationId, { cost: '20.0000' }) },
        sharedActorId,
        new Date('2026-01-01T00:00:01Z'),
      );
      if (typeof a === 'string' || typeof b === 'string') throw new Error('el alta de apoyo fallo');

      expect(await softDeleteAliveSupplier(supplierId, sharedActorId, baja)).toBe(true);

      const proveedor = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { deletedAt: true },
      });
      const lineas = await prisma.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { id: true, deletedAt: true, updatedBy: true },
        orderBy: { createdAt: 'asc' },
      });

      // Las tres filas SIGUEN EXISTIENDO.
      expect(lineas).toHaveLength(2);
      // Las tres tienen marca de baja...
      expect(proveedor.deletedAt).not.toBeNull();
      expect(lineas.every((l) => l.deletedAt !== null)).toBe(true);
      // ...y es EL MISMO instante en las tres.
      const instantes = new Set([
        proveedor.deletedAt?.toISOString(),
        ...lineas.map((l) => l.deletedAt?.toISOString()),
      ]);
      expect([...instantes]).toEqual([baja.toISOString()]);
      expect(lineas.every((l) => l.updatedBy === sharedActorId)).toBe(true);

      // R22: ninguna consulta las devuelve, ni por el proveedor ni por la linea.
      expect(await listCatalogLinesBySupplierAlive(supplierId, consulta({ pageSize: 10 }))).toBe(
        'supplier_not_found',
      );

      // QC-43 R48 DEROGADA ENTERA (P5, R23): las CUATRO operaciones sobre las lineas de un
      // proveedor dado de baja responden «no encontrado», LA BAJA INCLUIDA. QC-43 permitia
      // el borrado como excepcion, con el argumento de que si no esas filas quedarian
      // «atrapadas sin ninguna operacion capaz de eliminarlas»; desde R20 ya estan dadas de
      // baja y no hay nada que atrapar.
      expect(await softDeleteAliveCatalogLine(a.id, sharedActorId, new Date())).toBe(false);
      expect(
        await replaceAliveCatalogLine(
          a.id,
          fields('Otro nombre', presentationId),
          sharedActorId,
          new Date(),
        ),
      ).toBe('not_found');
      expect(
        await createCatalogLine(
          { supplierId, ...fields('Linea nueva', presentationId) },
          sharedActorId,
          new Date(),
        ),
      ).toBe('supplier_not_found');

      // Y la fila de `a` sigue ahi, con su marca original: el `false` de arriba no fue un
      // borrado silencioso ni volvio a sellar nada.
      const intacta = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: a.id },
        select: { deletedAt: true },
      });
      expect(intacta.deletedAt?.toISOString()).toBe(baja.toISOString());
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });

  it('si no hay proveedor vivo que dar de baja, la transaccion no escribe nada', async () => {
    // R20, R23. Es el motivo por el que `softDeleteAliveSupplier` usa una transaccion
    // INTERACTIVA y no un `$transaction([a, b])`: con el array las dos sentencias corren
    // siempre, y la segunda marcaria lineas vivas de un proveedor que nadie acaba de dar de
    // baja. Aqui se fuerza justo esa situacion -un proveedor ya dado de baja con una linea
    // viva colada a mano- y se exige que la segunda baja no toque nada.
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', presentationId) },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      // El proveedor se marca A MANO, sin pasar por el adaptador: asi la linea queda viva y
      // se puede observar si la segunda llamada la toca.
      await prisma.supplier.update({
        where: { id: supplierId },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      });

      expect(await softDeleteAliveSupplier(supplierId, sharedActorId, new Date())).toBe(false);

      const linea = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: created.id },
        select: { deletedAt: true },
      });
      expect(linea.deletedAt, 'la transaccion escribio pese a no haber proveedor vivo').toBeNull();
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });
});

describe('R19: las dos tablas son independientes', () => {
  it('dar de baja un articulo del inventario no altera ninguna linea, y ninguna linea impide darlo de baja', async () => {
    // R19, decision cerrada 3. Es la prueba de que el corte es REAL y no solo de imports:
    // hasta QC-43 la linea tenia una FK `RESTRICT` hacia `products`, asi que una linea viva
    // BLOQUEABA el borrado del articulo. Esa FK se fue con la columna (R9).
    //
    // El caso vive en `tests/integration/proveedores/` a proposito y no en el de inventario:
    // lo que se afirma es que el catalogo del proveedor no se entera de nada.
    const supplierId = await createTestSupplier(prisma);
    const presentationId = await createTestPresentation(prisma);
    const producto = await createTestProduct(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, ...fields('Acido citrico', presentationId, { cost: '42.0000' }) },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      const antes = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: created.id },
      });

      // (1) Baja LOGICA del articulo: la linea no se entera.
      await prisma.product.update({
        where: { id: producto.id },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      });
      expect(await prisma.supplierCatalogLine.findUniqueOrThrow({ where: { id: created.id } })).toEqual(
        antes,
      );

      // (2) Borrado FISICO del articulo: tampoco. Antes de QC-52 esto habria fallado con un
      // 23503 si la linea lo referenciara, y ese `RESTRICT` es justo lo que se cayo.
      await prisma.product.delete({ where: { id: producto.id } });
      expect(await prisma.supplierCatalogLine.findUniqueOrThrow({ where: { id: created.id } })).toEqual(
        antes,
      );

      // (3) Y la linea sigue viva y visible en el catalogo de su proveedor.
      const page = await listCatalogLinesBySupplierAlive(supplierId, consulta({ pageSize: 10 }));
      if (page === 'supplier_not_found') throw new Error('el proveedor de apoyo esta dado de baja');
      expect(page.items.map((l) => l.id)).toEqual([created.id]);
      expect(page.items[0]?.cost).toBe('42.0000');
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await prisma.product.deleteMany({ where: { id: producto.id } });
      await prisma.presentation.delete({ where: { id: producto.presentationId } });
      await prisma.presentation.delete({ where: { id: presentationId } });
    }
  });
});
