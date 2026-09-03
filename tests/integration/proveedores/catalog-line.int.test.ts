/**
 * T18 — tests de integracion de la LINEA DEL CATALOGO (QC-43) contra una base Postgres
 * REAL, con la migracion `20260903200343_supplier_contact_cost_and_line_audit` aplicada
 * encima de la de QC-42.
 *
 * MISMAS DOS ESTRATEGIAS DE AISLAMIENTO que `supplier-crud.int.test.ts` y que
 * `product-crud.int.test.ts` (QC-20), y por los mismos motivos:
 *
 * 1) Restricciones de la BASE (R27, R29, R32) → `prisma.$transaction` interactiva que
 *    SIEMPRE termina en `ROLLBACK`, `SAVEPOINT` para lo que debe fallar y afirmaciones
 *    sobre el SQLSTATE crudo de `meta.code`. El SQL crudo es obligatorio aqui: la API
 *    tipada traduce el SQLSTATE a su propio codigo y lo pierde, y ademas un costo cero no
 *    puede llegar al adaptador porque `zod` lo para antes. Lo que se demuestra es que
 *    **Postgres** rechaza, no que `zod` llego primero: un test que se quedara verde
 *    quitando el `CHECK` no contaria.
 *
 * 2) El ADAPTADOR real (`supplier-catalog-line-prisma.ts`) llama al cliente Prisma GLOBAL,
 *    asi que no participa de la transaccion del test: esos casos siembran con `prisma`
 *    real y limpian ellos mismos en un `finally`, por id exacto y en orden de FK.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — `product_id` -> `products`, `created_by`/`updated_by`
 * -> `users` y `supplier_id` -> `suppliers` son FK REALES aunque el esquema Prisma declare
 * las dos primeras como escalares sin `@relation`. No se depende del seed.
 *
 * DECIMALES — `cost` y `min_purchase` se manejan como cadena (lo que expone el puerto) o
 * como `Prisma.Decimal`, NUNCA como `number`: seria reintroducir la coma flotante binaria
 * que `docs/architecture.md > Dominio` n.o 4 prohibe.
 *
 * Requisitos cubiertos: R25, R27, R29, R31 (la mitad que solo ve Postgres), R32, R34, R36,
 * R37, R48.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createCatalogLine,
  deleteCatalogLineById,
  listCatalogLinesBySupplierAlive,
  updateCatalogLineTerms,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma';
import { normalizeSupplierName } from '@/lib/modules/proveedores/domain/supplier-name';
import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Utilidades de aislamiento (estrategia 1)
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
    .replace(/[̀-ͯ]/gu, '')
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

/** Producto REAL de apoyo, con su presentacion: `product_id` es FK a `products`. */
async function createTestProduct(db: Db, deletedAt: Date | null = null): Promise<string> {
  const presentationName = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    data: { name: presentationName, nameNormalized: normalizeForTest(presentationName) },
    select: { id: true },
  });
  const product = await db.product.create({
    data: {
      name: `Producto ${token()}`,
      presentationId: presentation.id,
      minPurchase: 0,
      deletedAt,
    },
    select: { id: true },
  });
  return product.id;
}

async function deleteTestProduct(db: Db, productId: string): Promise<void> {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { presentationId: true },
  });
  await db.product.delete({ where: { id: productId } });
  await db.presentation.delete({ where: { id: product.presentationId } });
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
 * Los dos autores se pasan POR SEPARADO a proposito: R32 habla de LAS DOS columnas, y si
 * las dos se escribieran siempre con el mismo valor, quitar una de las dos FK dejaria el
 * test verde -lo rechazaria la otra- y la mitad de la regla quedaria sin vigilar.
 */
function rawInsertLine(
  tx: Prisma.TransactionClient,
  supplierId: string,
  productId: string,
  cost: string,
  createdBy: string | null = null,
  updatedBy: string | null = createdBy,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "supplier_catalog_lines"
      ("supplier_id", "product_id", "cost", "created_by", "updated_by", "updated_at")
    VALUES (
      CAST(${supplierId} AS uuid),
      CAST(${productId} AS uuid),
      CAST(${cost} AS numeric),
      CAST(${createdBy} AS uuid),
      CAST(${updatedBy} AS uuid),
      CURRENT_TIMESTAMP)`;
}

// ---------------------------------------------------------------------------

let sharedActorId: string;

beforeAll(async () => {
  // Falla claro si la migracion de esta ficha no esta aplicada: las columnas de autor y el
  // CHECK del costo son suyos, y sin ellos la mitad de este archivo no significa nada.
  const columnas = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_catalog_lines'
      AND column_name IN ('created_by', 'updated_by')`;
  const [costCheck] = await prisma.$queryRaw<{ definition: string }[]>`
    SELECT pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'supplier_catalog_lines'
      AND c.conname = 'supplier_catalog_lines_cost_positive'`;
  if (columnas.length !== 2 || costCheck === undefined) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-43 ' +
        '(supplier_contact_cost_and_line_audit): faltan las columnas de autor de la linea o el ' +
        'CHECK `supplier_catalog_lines_cost_positive`. Corre `pnpm run db:migrate` antes de estos tests.',
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

describe('R29: el costo estrictamente mayor que cero lo exige la base', () => {
  it('el CHECK rechaza con SQLSTATE 23514 la linea con costo cero o negativo, al insertar y al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const productId = await createTestProduct(tx);

      // (1) INSERT con costo CERO. QC-42 lo aceptaba (`cost >= 0`); esta ficha no.
      const cero = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, productId, '0'),
        'alta de linea con costo cero',
      );
      expect(cero).toBe(CHECK_VIOLATION);

      // (2) INSERT con costo NEGATIVO: lo de siempre, y sigue rechazado.
      const negativo = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, productId, '-1.5'),
        'alta de linea con costo negativo',
      );
      expect(negativo).toBe(CHECK_VIOLATION);

      // Ninguno de los dos intentos dejo fila.
      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(0);

      // (3) UPDATE: el CHECK tambien vigila la modificacion. Se parte de una linea valida.
      await rawInsertLine(tx, supplierId, productId, '25.5000');
      const linea = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { supplierId, productId },
        select: { id: true, cost: true },
      });
      expect(linea.cost.toString()).toBe('25.5');

      const alModificar = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "supplier_catalog_lines" SET "cost" = 0 WHERE "id" = CAST(${linea.id} AS uuid)`,
        'bajar a cero el costo de una linea existente',
      );
      expect(alModificar).toBe(CHECK_VIOLATION);

      const intacta = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: linea.id },
        select: { cost: true },
      });
      expect(intacta.cost.toString()).toBe('25.5');
    });
  });
});

describe('R32: los autores de la linea son una referencia real a un usuario', () => {
  it('la FK rechaza con SQLSTATE 23503 el autor inexistente y admite la linea sin autor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const productId = await createTestProduct(tx);
      const autorReal = await createTestUser(tx);

      // (1) Autor REAL: se acepta y queda escrito en las dos columnas.
      await rawInsertLine(tx, supplierId, productId, '10.0000', autorReal);
      const conAutor = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { supplierId, productId },
        select: { id: true, createdBy: true, updatedBy: true },
      });
      expect(conAutor.createdBy).toBe(autorReal);
      expect(conAutor.updatedBy).toBe(autorReal);

      // (2) Autor INVENTADO: la FK lo rechaza. La columna es anulable y eso no afloja
      // nada: en SQL una FK solo se verifica cuando la columna tiene valor. Se prueban las
      // DOS columnas por separado -una fantasma y la otra nula cada vez-, porque cada una
      // tiene su propia FK y escribir siempre las dos juntas dejaria una sin vigilar.
      const otroProductId = await createTestProduct(tx);
      const soloCreadorFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, otroProductId, '10.0000', randomUUID(), null),
        'alta de linea con un created_by inexistente',
      );
      expect(soloCreadorFantasma).toBe(FOREIGN_KEY_VIOLATION);

      const soloEditorFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, otroProductId, '10.0000', null, randomUUID()),
        'alta de linea con un updated_by inexistente',
      );
      expect(soloEditorFantasma).toBe(FOREIGN_KEY_VIOLATION);
      expect(await tx.supplierCatalogLine.count({ where: { productId: otroProductId } })).toBe(0);

      // (3) SIN autor: una importacion o un seed pueden no tenerlo (R32).
      await rawInsertLine(tx, supplierId, otroProductId, '10.0000', null);
      const sinAutor = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { productId: otroProductId },
        select: { createdBy: true, updatedBy: true },
      });
      expect(sinAutor).toEqual({ createdBy: null, updatedBy: null });
    });
  });
});

describe('R27: la pareja proveedor-producto es unica por el indice de la base', () => {
  it('el indice unico (supplier_id, product_id) rechaza con SQLSTATE 23505 la segunda linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const supplierId = await createTestSupplier(tx);
      const productId = await createTestProduct(tx);

      await rawInsertLine(tx, supplierId, productId, '10.0000');
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertLine(tx, supplierId, productId, '99.0000'),
        'segunda linea para la misma pareja proveedor-producto',
      );
      expect(sqlState).toBe(UNIQUE_VIOLATION);

      // Una sola fila, y con el costo de la PRIMERA: el rechazo no actualizo nada.
      const lineas = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { cost: true },
      });
      expect(lineas).toHaveLength(1);
      expect(lineas[0]?.cost.toString()).toBe('10');

      // El mismo producto en OTRO proveedor si es una linea legitima.
      const otroSupplierId = await createTestSupplier(tx);
      await rawInsertLine(tx, otroSupplierId, productId, '11.0000');
      expect(await tx.supplierCatalogLine.count({ where: { productId } })).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// El ADAPTADOR real contra Postgres (estrategia 2)
// ---------------------------------------------------------------------------

describe('R25: alta de la linea del catalogo', () => {
  it('crea la linea del catalogo de un proveedor vivo y devuelve su identificador', async () => {
    const supplierId = await createTestSupplier(prisma);
    const productId = await createTestProduct(prisma);
    try {
      const created = await createCatalogLine(
        {
          supplierId,
          productId,
          cost: '1234.5678',
          minPurchase: '2.5000',
          deliveryTime: 7,
        },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(created).not.toBe('duplicate');
      expect(created).not.toBe('supplier_not_found');
      if (typeof created === 'string') return;
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);

      const page = await listCatalogLinesBySupplierAlive(supplierId, { page: 1, pageSize: 10 });
      expect(page).not.toBe('supplier_not_found');
      if (page === 'supplier_not_found') return;
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: created.id,
        supplierId,
        productId,
        // Cadena con los 4 decimales de `DECIMAL(14,4)`, nunca un `number`.
        cost: '1234.5678',
        minPurchase: '2.5000',
        deliveryTime: 7,
        createdBy: sharedActorId,
        updatedBy: sharedActorId,
      });
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productId);
    }
  });
});

describe('R31: el autor de la creacion de la linea no se pisa al editarla', () => {
  it('la edicion de la linea no pisa created_by y no toca ninguna columna del proveedor', async () => {
    const supplierId = await createTestSupplier(prisma);
    const productId = await createTestProduct(prisma);
    const autorA = await createTestUser(prisma);
    const autorB = await createTestUser(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, productId, cost: '10.0000', minPurchase: null, deliveryTime: null },
        autorA,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      const proveedorAntes = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { name: true, phone: true, updatedAt: true, updatedBy: true },
      });

      const editada = await updateCatalogLineTerms(
        created.id,
        { cost: '99.9900', minPurchase: '1.0000', deliveryTime: 3 },
        autorB,
        new Date('2026-02-02T00:00:00Z'),
      );
      expect(editada).toBe('ok');

      const fila = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: created.id },
        select: { cost: true, createdBy: true, updatedBy: true, supplierId: true, productId: true },
      });
      expect(fila.createdBy).toBe(autorA);
      expect(fila.updatedBy).toBe(autorB);
      expect(fila.cost.toString()).toBe('99.99');
      // R33: ni el proveedor ni el producto de la linea cambiaron.
      expect(fila.supplierId).toBe(supplierId);
      expect(fila.productId).toBe(productId);

      // R31: editar la linea NO toca ningun dato del proveedor.
      const proveedorDespues = await prisma.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { name: true, phone: true, updatedAt: true, updatedBy: true },
      });
      expect(proveedorDespues).toEqual(proveedorAntes);
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productId);
      await deleteTestUser(prisma, autorB);
      await deleteTestUser(prisma, autorA);
    }
  });
});

describe('R34: la baja de la linea es un borrado fisico', () => {
  it('al dar de baja la linea su fila deja de existir y el proveedor queda intacto', async () => {
    const supplierId = await createTestSupplier(prisma);
    const productId = await createTestProduct(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, productId, cost: '10.0000', minPurchase: null, deliveryTime: null },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      expect(await deleteCatalogLineById(created.id)).toBe('deleted');

      // No queda marcada: deja de existir. Se comprueba contra la TABLA, no contra el
      // listado -que la ocultaria igual si el borrado fuera logico-.
      expect(
        await prisma.supplierCatalogLine.findUnique({
          where: { id: created.id },
          select: { id: true },
        }),
      ).toBeNull();

      // El proveedor sigue vivo y entero: la baja de una linea no lo toca.
      const proveedor = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { deletedAt: true },
      });
      expect(proveedor?.deletedAt).toBeNull();

      // Segunda baja de lo que ya no existe: `'not_found'`, no una excepcion.
      expect(await deleteCatalogLineById(created.id)).toBe('not_found');
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productId);
    }
  });
});

describe('R36: el catalogo de un proveedor dado de baja no se consulta', () => {
  it('el listado del catalogo no devuelve ninguna linea de un proveedor dado de baja, aunque las filas sigan en la base', async () => {
    const supplierId = await createTestSupplier(prisma);
    const productId = await createTestProduct(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, productId, cost: '10.0000', minPurchase: null, deliveryTime: null },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      const vivo = await listCatalogLinesBySupplierAlive(supplierId, { page: 1, pageSize: 10 });
      expect(vivo).not.toBe('supplier_not_found');
      if (vivo === 'supplier_not_found') return;
      expect(vivo.items.map((linea) => linea.id)).toEqual([created.id]);

      await prisma.supplier.update({
        where: { id: supplierId },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      });

      // La linea NO tiene borrado logico propio: la fila sigue en la base...
      expect(
        await prisma.supplierCatalogLine.count({ where: { id: created.id } }),
      ).toBe(1);
      // ...y aun asi el listado no la devuelve. Sin esta comprobacion, el catalogo de un
      // proveedor dado de baja seguiria siendo consultable con solo conocer su id.
      expect(await listCatalogLinesBySupplierAlive(supplierId, { page: 1, pageSize: 10 })).toBe(
        'supplier_not_found',
      );
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productId);
    }
  });
});

describe('R37: un producto dado de baja no se lleva la linea por delante', () => {
  it('la linea de un producto dado de baja se conserva y sigue apareciendo en el catalogo de su proveedor', async () => {
    const supplierId = await createTestSupplier(prisma);
    const productId = await createTestProduct(prisma);
    try {
      const created = await createCatalogLine(
        { supplierId, productId, cost: '42.0000', minPurchase: null, deliveryTime: null },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof created === 'string') throw new Error(`el alta de apoyo fallo: ${created}`);

      // El producto se descataloga DESPUES de pactar el precio.
      await prisma.product.update({
        where: { id: productId },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      });

      const page = await listCatalogLinesBySupplierAlive(supplierId, { page: 1, pageSize: 10 });
      expect(page).not.toBe('supplier_not_found');
      if (page === 'supplier_not_found') return;
      // Perder la linea seria perder el precio pactado de algo que solo esta descatalogado.
      expect(page.items.map((linea) => linea.id)).toEqual([created.id]);
      expect(page.items[0]?.cost).toBe('42.0000');
      // `productName` sale `null` del adaptador SIEMPRE: lo resuelve el caso de uso con el
      // contrato de `inventario` (`design.md > 5.3`), nunca un `join` a `products`.
      expect(page.items[0]?.productName).toBeNull();
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productId);
    }
  });
});

describe('R48: un proveedor dado de baja no admite escrituras nuevas en su catalogo', () => {
  it('un proveedor dado de baja no admite lineas nuevas ni edicion de las suyas, y el borrado si sigue permitido', async () => {
    // Decision del humano del 2026-09-03. La FK NO basta: la fila del proveedor sigue
    // existiendo tras la baja logica, asi que sin la comprobacion del adaptador el alta se
    // aceptaba y creaba una linea que R36 no deja ver NUNCA.
    const supplierId = await createTestSupplier(prisma);
    const productoDeLaLineaVieja = await createTestProduct(prisma);
    const productoNuevo = await createTestProduct(prisma);
    try {
      const vieja = await createCatalogLine(
        {
          supplierId,
          productId: productoDeLaLineaVieja,
          cost: '10.0000',
          minPurchase: null,
          deliveryTime: null,
        },
        sharedActorId,
        new Date('2026-01-01T00:00:00Z'),
      );
      if (typeof vieja === 'string') throw new Error(`el alta de apoyo fallo: ${vieja}`);

      await prisma.supplier.update({
        where: { id: supplierId },
        data: { deletedAt: new Date('2026-02-02T00:00:00Z') },
      });

      // (1) ALTA rechazada, y sin crear ninguna fila.
      const alta = await createCatalogLine(
        {
          supplierId,
          productId: productoNuevo,
          cost: '55.0000',
          minPurchase: null,
          deliveryTime: null,
        },
        sharedActorId,
        new Date('2026-03-03T00:00:00Z'),
      );
      expect(alta).toBe('supplier_not_found');
      expect(await prisma.supplierCatalogLine.count({ where: { productId: productoNuevo } })).toBe(
        0,
      );

      // (2) EDICION rechazada, y sin cambiar nada de la linea que si existe.
      const edicion = await updateCatalogLineTerms(
        vieja.id,
        { cost: '99.0000', minPurchase: null, deliveryTime: null },
        sharedActorId,
        new Date('2026-03-03T00:00:00Z'),
      );
      expect(edicion).toBe('not_found');
      const sinCambios = await prisma.supplierCatalogLine.findUniqueOrThrow({
        where: { id: vieja.id },
        select: { cost: true, updatedBy: true },
      });
      expect(sinCambios.cost.toString()).toBe('10');

      // (3) BORRADO SI permitido, y es deliberado: quita una fila que ya nadie puede ver
      // ni editar. Rechazarlo dejaria esas lineas atrapadas para siempre.
      expect(await deleteCatalogLineById(vieja.id)).toBe('deleted');
      expect(
        await prisma.supplierCatalogLine.findUnique({
          where: { id: vieja.id },
          select: { id: true },
        }),
      ).toBeNull();
    } finally {
      await prisma.supplierCatalogLine.deleteMany({ where: { supplierId } });
      await prisma.supplier.delete({ where: { id: supplierId } });
      await deleteTestProduct(prisma, productoNuevo);
      await deleteTestProduct(prisma, productoDeLaLineaVieja);
    }
  });
});
