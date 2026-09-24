/**
 * Dos aislamientos. Las restricciones de la base van en una transaccion que termina en ROLLBACK,
 * con SQL crudo para probar que rechaza Postgres y no zod. El adaptador usa el cliente Prisma
 * global y no participaria de esa transaccion, asi que sus casos siembran lo suyo, afirman solo
 * sobre sus ids y limpian en `finally`.
 *
 * El costo se lee con `unit_cost::text` y se compara como cadena: como `number` pasaria por coma
 * flotante.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  addBatchToAlive,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { ValidationError } from '@/lib/modules/inventario/domain/errors';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { deriveUnitCost } from '@/lib/modules/inventario/domain/unit-cost';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

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

const CHECK_VIOLATION = '23514';

/** Del campo estructurado y nunca del texto: el mensaje de Postgres viene localizado. */
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

/**
 * `created_by` y `updated_by` son FK reales a `users` aunque el esquema Prisma las declare
 * escalares: un uuid inventado no vale.
 */
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
  // Nombre irrepetible: el indice unico de nombre de empresa es global.
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
  // La empresa se devuelve porque es tambien la del inventario del caso y la del ambito.
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
  // La empresa va DESPUES del usuario: `users_company_id_fkey` es ON DELETE RESTRICT.
  await db.company.delete({ where: { id: user.companyId } });
}

/**
 * `presentations.unit_id` es obligatoria. Se busca por nombre normalizado porque los uuid los
 * genera `gen_random_uuid()` y cambian en cada base.
 */
async function unidadDeSistema(db: Db): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

/** `presentation_id` es NOT NULL con FK: hace falta una presentacion real. */
async function createTestPresentation(db: Db, companyId: string): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    // Misma empresa que el producto y el lote, o `product_batches_check_company` rechaza.
    data: {
      name,
      nameNormalized: normalizeForTest(name),
      unitId: await unidadDeSistema(db),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

/** La empresa es la del usuario para parecerse a la Server Action, donde coinciden. */
type Fixture = {
  readonly actorId: string;
  readonly presentationId: string;
  readonly companyId: string;
};

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const { userId, companyId } = await createTestUser(prisma);
  const presentationId = await createTestPresentation(prisma, companyId);
  return { actorId: userId, presentationId, companyId };
}

/** En orden de FK: asientos, lotes, productos, presentacion, usuario. */
async function dropFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.productBatch.deleteMany({ where: { productId: { in: [...productIds] } } });
  await prisma.product.deleteMany({ where: { id: { in: [...productIds] } } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await deleteTestUser(prisma, fixture.actorId);
}

function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Producto ${token()}`, ...overrides };
}

function newBatch(fixture: Fixture, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: fixture.presentationId,
    stock: '3',
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

/**
 * `::text` para afirmar sobre lo que guardo la columna: como `Date` volveria a meter la zona
 * horaria, y como numero perderia decimales.
 */
type BatchTextRow = {
  readonly unit_cost: string;
  readonly expiry_date: string | null;
  readonly lot: string | null;
  readonly created_by: string | null;
  readonly updated_by: string | null;
};

async function readBatchAsText(batchId: string): Promise<BatchTextRow> {
  const rows = await prisma.$queryRaw<readonly BatchTextRow[]>`
    SELECT "unit_cost"::text  AS "unit_cost",
           "expiry_date"::text AS "expiry_date",
           "lot",
           "created_by"::text AS "created_by",
           "updated_by"::text AS "updated_by"
    FROM "product_batches"
    WHERE "id" = ${batchId}::uuid
  `;
  const row = rows[0];
  if (row === undefined) throw new Error(`no existe el lote ${batchId}`);
  return row;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('R7 (lado base): el costo unitario derivado se guarda con sus 4 decimales', () => {
  it('guarda el derivado de total/existencia tal cual, sin perder decimales', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      // `'10' / 3` llena los cuatro decimales con un valor no representable en binario.
      const derivado = deriveUnitCost('10', '3');
      expect(derivado).toBe('3.3333');
      if (derivado === null) throw new Error('la derivacion no puede ser nula en este caso');

      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { stock: '3', unitCost: derivado }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      // Un `toBe(3.3333)` compararia contra un binario que no vale 3.3333.
      expect(fila.unit_cost).toBe('3.3333');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R13: la fecha de expiracion se guarda sin corrimiento de dia', () => {
  it('guarda la misma fecha civil que se escribio', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      // 1 de enero: con una zona horaria negativa, un corrimiento de un dia cambiaria el ano.
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { expiryDate: '2026-01-01' }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      expect(fila.expiry_date).toBe('2026-01-01');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R12 (lado base): la expiracion ausente queda en NULL y el lote ausente lleva correlativo', () => {
  it('deja expiry_date en NULL cuando no viene', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { expiryDate: null }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      expect(fila.expiry_date).toBeNull();
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('QC-81 R8, R9: escribe el lot ausente con el correlativo generado, no NULL', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { lot: null }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      // La empresa del fixture nace sin lotes: el primer correlativo de su serie es '1'.
      expect(fila.lot).toBe('1');
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R22: la autoria del lote es el actor de la sesion', () => {
  it('escribe created_by y updated_by con el identificador del actor', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(newProduct(), newBatch(fixture), new Date(), ambito(fixture));
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      expect(fila.created_by).toBe(fixture.actorId);
      expect(fila.updated_by).toBe(fixture.actorId);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R5 (lado base): la base rechaza un costo unitario de 0', () => {
  it('el CHECK product_batches_unit_cost_positive rechaza el 0 con 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { userId: actorId, companyId } = await createTestUser(tx);
      const presentationId = await createTestPresentation(tx, companyId);
      const name = `Producto ${token()}`;
      const producto = await tx.product.create({
        // La unidad de la presentacion: sin ella, el disparador `product_batches_check_unit`
        // rechazaria el INSERT antes de llegar al CHECK del costo que este caso mide.
        data: {
          name,
          nameNormalized: normalizeProductName(name),
          unitId: await unidadDeSistema(tx),
          companyId,
        },
        select: { id: true },
      });

      // SQL crudo: la API tipada traduciria el SQLSTATE a su propio codigo.
      const sqlState = await expectRejectedByDatabase(
        tx,
        // Empresa, `lot` y `purchase_date` van con valor: sin ellos saldria 23502 y no se
        // probaria el CHECK del costo.
        () => tx.$executeRaw`
          INSERT INTO "product_batches" (
            "product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date",
            "company_id", "created_by", "updated_by", "updated_at"
          ) VALUES (
            ${producto.id}::uuid, ${presentationId}::uuid, 1, 0::numeric,
            ${`L-${randomUUID()}`}, DATE '2026-09-01',
            ${companyId}::uuid, ${actorId}::uuid, ${actorId}::uuid, now()
          )
        `,
        'un lote con unit_cost = 0',
      );

      expect(sqlState).toBe(CHECK_VIOLATION);
    });
  });
});

describe('R21: producto y primer lote se escriben en una sola transaccion', () => {
  it('un fallo del lote no deja ningun producto escrito', async () => {
    const fixture = await createFixture();
    const nombre = `Producto ${token()}`;
    const nombreNormalizado = normalizeProductName(nombre);

    try {
      // La presentacion inexistente hace fallar el lote despues de escribir el producto: sin la
      // transaccion quedaria un producto sin lote.
      await expect(
        createWithFirstBatch(
          { name: nombre },
          newBatch(fixture, { presentationId: randomUUID() }),
          new Date(),
          ambito(fixture),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      // Por el nombre inventado en este caso y no con un conteo global: la base es compartida.
      const restantes = await prisma.product.count({
        where: { nameNormalized: nombreNormalizado },
      });
      expect(restantes).toBe(0);
    } finally {
      await dropFixture(fixture, []);
    }
  });
});

describe('R18: agregar un lote no toca el producto (QC-121, R2, R9, R11)', () => {
  it('deja name, qty_alert, unit_id y updated_at intactos, y recalcula stock', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const primero = await createWithFirstBatch(
        newProduct({ qtyAlert: '2' }),
        newBatch(fixture, { stock: '7' }),
        new Date(),
          ambito(fixture),
      );
      productIds.push(primero.id);

      const antes = await prisma.product.findUniqueOrThrow({ where: { id: primero.id } });

      const agregado = await addBatchToAlive(
        primero.id,
        newBatch(fixture, { stock: '99', unitCost: '1.0000' }),
        new Date(Date.now() + 60_000),
        ambito(fixture),
      );
      expect(agregado).not.toBeNull();

      const despues = await prisma.product.findUniqueOrThrow({ where: { id: primero.id } });
      expect(despues.name).toBe(antes.name);
      expect(despues.qtyAlert?.toFixed(4)).toBe(antes.qtyAlert?.toFixed(4));
      expect(despues.unitId).toBe(antes.unitId);
      // Agregar un lote no es editar el producto: `updated_at` tampoco se mueve.
      expect(despues.updatedAt.toISOString()).toBe(antes.updatedAt.toISOString());
      // La unica columna que SI cambia: la suma de los dos lotes (R8, R9).
      expect(despues.stock.toFixed(4)).toBe((7 + 99).toFixed(4));

      const lotes = await prisma.productBatch.count({ where: { productId: primero.id } });
      expect(lotes).toBe(2);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });

  it('devuelve null -y no escribe lote- si el producto ya no esta vivo', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(newProduct(), newBatch(fixture), new Date(), ambito(fixture));
      productIds.push(creado.id);

      // Borrado logico: la fila sigue y solo el `where` del adaptador deja de encontrarla.
      await prisma.product.update({
        where: { id: creado.id },
        data: { deletedAt: new Date() },
      });

      const agregado = await addBatchToAlive(creado.id, newBatch(fixture), new Date(), ambito(fixture));
      expect(agregado).toBeNull();

      const lotes = await prisma.productBatch.count({ where: { productId: creado.id } });
      expect(lotes).toBe(1);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R20: con homonimos vivos se elige siempre el mismo producto', () => {
  it('elige el de creacion mas antigua y desempata por identificador ascendente', async () => {
    const fixture = await createFixture();
    const nombre = `Homonimo ${token()}`;
    const normalizado = normalizeProductName(nombre);
    const productIds: string[] = [];

    try {
      // El empate en `created_at` obliga al desempate por id: sin el, Postgres puede devolver
      // cualquiera de las dos y la eleccion cambiaria entre corridas.
      const antiguo = new Date('2026-01-01T10:00:00.000Z');
      const reciente = new Date('2026-02-01T10:00:00.000Z');
      // La misma unidad que la presentacion del fixture: sin ella, ningun homonimo casaria con
      // la busqueda por nombre Y unidad.
      const unitId = await unidadDeSistema(prisma);

      for (const createdAt of [antiguo, antiguo, reciente]) {
        const fila = await prisma.product.create({
          data: {
            name: nombre,
            nameNormalized: normalizado,
            unitId,
            createdAt,
            updatedAt: createdAt,
            companyId: fixture.companyId,
          },
          select: { id: true },
        });
        productIds.push(fila.id);
      }

      const empatados = await prisma.product.findMany({
        where: { nameNormalized: normalizado, createdAt: antiguo },
        select: { id: true },
      });
      const menorId = [...empatados.map((fila) => fila.id)].sort()[0];

      const elegido = await findAliveIdByNameInPresentationUnit(
        nombre,
        fixture.presentationId,
        ambito(fixture),
      );
      expect(elegido).toBe(menorId);

      expect(
        await findAliveIdByNameInPresentationUnit(nombre, fixture.presentationId, ambito(fixture)),
      ).toBe(elegido);
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});

describe('R19: un nombre que solo coincide con productos borrados no encuentra nada', () => {
  it('devuelve null cuando todos los homonimos estan borrados logicamente', async () => {
    const fixture = await createFixture();
    const nombre = `Borrado ${token()}`;
    const normalizado = normalizeProductName(nombre);
    const productIds: string[] = [];

    try {
      const unitId = await unidadDeSistema(prisma);
      const fila = await prisma.product.create({
        data: { name: nombre, nameNormalized: normalizado, unitId, companyId: fixture.companyId },
        select: { id: true },
      });
      productIds.push(fila.id);

      expect(
        await findAliveIdByNameInPresentationUnit(nombre, fixture.presentationId, ambito(fixture)),
      ).toBe(fila.id);

      await prisma.product.update({ where: { id: fila.id }, data: { deletedAt: new Date() } });

      // Por eso el alta creara un producto nuevo en vez de revivir este.
      expect(
        await findAliveIdByNameInPresentationUnit(nombre, fixture.presentationId, ambito(fixture)),
      ).toBeNull();
      const sigue = await prisma.product.findUnique({ where: { id: fila.id } });
      expect(sigue).not.toBeNull();
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});
