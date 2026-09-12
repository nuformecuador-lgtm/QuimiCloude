/**
 * T8 (QC-90) — escritura del PRIMER LOTE contra una base Postgres REAL, con la migracion
 * `20260909120000_product_batches` aplicada. Esta ficha no anade ninguna migracion (R29):
 * todo lo que aqui se ejercita ya existia en la base el 2026-09-09.
 *
 * AISLAMIENTO — DOS ESTRATEGIAS, y la eleccion no es de gusto:
 *
 * 1) Restricciones de la BASE (el `CHECK (unit_cost > 0)`) -> `prisma.$transaction`
 *    interactiva que SIEMPRE termina en `ROLLBACK`, con `SAVEPOINT` para lo que debe fallar y
 *    afirmaciones sobre el SQLSTATE crudo. SQL crudo a proposito: lo que se demuestra es que
 *    **Postgres** rechaza, no que zod llego primero. Mismo patron que
 *    `tests/integration/proveedores/catalog-line.int.test.ts`.
 *
 * 2) El ADAPTADOR real (`product-prisma.ts`) llama al cliente Prisma GLOBAL, no a un `tx`
 *    inyectado, asi que NO participa de una transaccion del test que se deshaga. `tasks.md`
 *    pedia «cada caso dentro de `prisma.$transaction` con ROLLBACK», pero para estos casos eso
 *    seria un aislamiento de mentira: la escritura del adaptador se comitearia igual y el
 *    ROLLBACK del test no desharia nada. Se sigue el patron que de verdad usa
 *    `product-crud.int.test.ts`: cada caso siembra sus propios datos, afirma SOLO sobre los
 *    ids que el mismo creo -ninguna afirmacion global tipo «hay N productos»- y limpia en un
 *    `finally`, en orden de FK.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK. `presentation_id` -> `presentations` y
 * `created_by`/`updated_by` -> `users` son FK REALES (las dos ultimas escritas a mano en la
 * migracion, sin `@relation` en el esquema). No se depende del seed.
 *
 * IMPORTES — el costo se compara como CADENA, leyendolo con `unit_cost::text`, nunca como
 * `number` (R4). Comparar contra un literal numerico dejaria pasar exactamente el error que
 * la ficha entera evita: la coma flotante.
 *
 * Requisitos cubiertos: R13, R18, R19, R20, R21, R22 y el lado base de R5, R7 y R12.
 */
import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import {
  addBatchToAlive,
  createWithFirstBatch,
  findAliveIdByName,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { ValidationError } from '@/lib/modules/inventario/domain/errors';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { deriveUnitCost } from '@/lib/modules/inventario/domain/unit-cost';
import { prisma } from '@/lib/shared/db/prisma';

import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';

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

const CHECK_VIOLATION = '23514';

/**
 * SQLSTATE crudo, leido del campo ESTRUCTURADO del conector y JAMAS del texto del mensaje:
 * en esta maquina Postgres responde en espanol. Copiado del patron ya en uso en
 * `catalog-line.int.test.ts` y en `order-prisma.ts`.
 */
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

/**
 * Usuario REAL de apoyo: `product_batches.created_by` y `updated_by` son FK a `users`
 * (`product_batches_created_by_fkey`), aunque el esquema Prisma las declare como escalares.
 * No vale inventar un uuid. Copiado de `catalog-line.int.test.ts`, que resolvio lo mismo.
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
  // Empresa efimera propia del fixture: `users.company_id` es obligatoria (QC-47 R9) y el
  // indice de nombre de empresa es GLOBAL, asi que reusar la del seed chocaria.
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
  // QC-49 (R1): la empresa se DEVUELVE ademas del usuario. Antes solo hacia falta para poder
  // crear el usuario; ahora es tambien la empresa de todo el inventario del caso -producto,
  // presentacion y lote- y el ambito con el que se llama al adaptador.
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
 * QC-80 (R1): `presentations.unit_id` es NOT NULL con FK a `units`, asi que toda
 * presentacion de apoyo necesita una unidad REAL. Se resuelve la unidad de sistema
 * `kilogramo` POR SU NOMBRE NORMALIZADO -nunca por un uuid escrito a mano: los
 * identificadores los genera `gen_random_uuid()` y son distintos en cada base-, que es
 * exactamente como la busca el relleno de la migracion. Ningun test de este archivo
 * afirma nada sobre la unidad de la presentacion: es solo lo que la columna exige.
 */
async function unidadDeSistema(db: Db): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  return unit.id;
}

/** Presentacion REAL de apoyo: `presentation_id` es NOT NULL con FK RESTRICT (R2). */
async function createTestPresentation(db: Db, companyId: string): Promise<string> {
  const name = `Bidon ${token()}`;
  const presentation = await db.presentation.create({
    // QC-49 (R1, R22): la presentacion es DE LA EMPRESA, y tiene que ser la MISMA que la del
    // producto y la del lote o `product_batches_check_company` rechaza la escritura.
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

/**
 * Escenario minimo compartido: un usuario (autoria), su empresa y una presentacion.
 *
 * QC-49 (R1, R13) anadio la empresa: es la de las tres tablas de inventario del caso Y el
 * AMBITO con el que se llama al adaptador, que desde esta ficha lo exige en su firma. Es la
 * MISMA que la del usuario a proposito -asi el caso se parece a lo que hace la Server Action,
 * donde el actor y su inventario son de la misma empresa-, y `deleteTestUser` ya la borra.
 */
type Fixture = {
  readonly actorId: string;
  readonly presentationId: string;
  readonly companyId: string;
};

/** El ambito del caso. Lo pide el adaptador en todas sus firmas: sin el no compila (R13). */
function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

async function createFixture(): Promise<Fixture> {
  const { userId, companyId } = await createTestUser(prisma);
  const presentationId = await createTestPresentation(prisma, companyId);
  return { actorId: userId, presentationId, companyId };
}

/** Limpieza en ORDEN DE FK: lotes -> productos -> presentacion -> usuario. */
async function dropFixture(fixture: Fixture, productIds: readonly string[]): Promise<void> {
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
    stock: 3,
    unitCost: '2.5000',
    lot: null,
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

/**
 * Lee el lote con los tipos CRUDOS de Postgres pasados a texto. `unit_cost::text` y
 * `expiry_date::text` son la unica forma de afirmar sobre lo que la columna GUARDO sin que
 * el cliente lo reinterprete por el camino: leer la fecha como `Date` volveria a meter la
 * zona horaria en la comparacion, que es justo lo que R13 vigila, y leer el importe como
 * numero perderia los decimales que R7 exige.
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

// ---------------------------------------------------------------------------

describe('R7 (lado base): el costo unitario derivado se guarda con sus 4 decimales', () => {
  it('guarda el derivado de total/existencia tal cual, sin perder decimales', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      // `'10' / 3` es el caso que delata cualquier paso por coma flotante: el derivado tiene
      // los cuatro decimales llenos y ninguno es representable en binario.
      const derivado = deriveUnitCost('10', 3);
      expect(derivado).toBe('3.3333');
      if (derivado === null) throw new Error('la derivacion no puede ser nula en este caso');

      const creado = await createWithFirstBatch(
        newProduct({ stock: 3 }),
        newBatch(fixture, { stock: 3, unitCost: derivado }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      // CADENA, no `number`: `DECIMAL(14,4)` devuelve '3.3333' exacto; un `toBe(3.3333)`
      // estaria comparando contra un binario que no vale 3.3333.
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
      // 1 de enero a proposito: con una zona horaria NEGATIVA -las de America, donde corre
      // este ERP- un corrimiento de un dia no cambiaria solo el dia, cambiaria el ANO, y el
      // fallo seria imposible de leer como un redondeo inocente.
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

describe('R12 (lado base): lote y expiracion ausentes quedan en NULL', () => {
  it('deja lot y expiry_date en NULL cuando no vienen', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { lot: null, expiryDate: null }),
        new Date(),
        ambito(fixture),
      );
      productIds.push(creado.id);

      const fila = await readBatchAsText(creado.batchId);
      // NULL de verdad, no cadena vacia: ausente significa ausente.
      expect(fila.lot).toBeNull();
      expect(fila.expiry_date).toBeNull();
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
      // Al crear, quien crea y quien modifico por ultima vez son la misma persona.
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
        data: { name, nameNormalized: normalizeProductName(name), companyId },
        select: { id: true },
      });

      // SQL CRUDO: la API tipada traduciria el SQLSTATE a su propio codigo y lo perderia.
      // Lo que se demuestra aqui es que POSTGRES rechaza el 0 aunque nadie valide antes.
      const sqlState = await expectRejectedByDatabase(
        tx,
        // QC-49 (R1, R2, R22): el lote declara SU empresa, NOT NULL, y tiene que ser la misma
        // que la de su producto y la de su presentacion. Sin ella el rechazo llegaria como
        // 23502 y el caso dejaria de probar el CHECK del costo, que es lo suyo.
        () => tx.$executeRaw`
          INSERT INTO "product_batches" (
            "product_id", "presentation_id", "stock", "unit_cost",
            "company_id", "created_by", "updated_by", "updated_at"
          ) VALUES (
            ${producto.id}::uuid, ${presentationId}::uuid, 1, 0::numeric,
            ${companyId}::uuid, ${actorId}::uuid, ${actorId}::uuid, now()
          )
        `,
        'un lote con unit_cost = 0',
      );

      // SQLSTATE, jamas el texto del mensaje.
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
      // Presentacion INEXISTENTE: el `INSERT` del lote muere en
      // `product_batches_presentation_id_fkey` (RESTRICT) DESPUES de que el producto ya se
      // haya escrito dentro de la transaccion. Es el unico caso que prueba de verdad el
      // `$transaction`: sin el, aqui quedaria un producto sin lote, que es lo que R1 prohibe.
      await expect(
        createWithFirstBatch(
          { name: nombre, stock: 5 },
          newBatch(fixture, { presentationId: randomUUID() }),
          new Date(),
          ambito(fixture),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      // Se filtra por el nombre normalizado que este caso invento -no hay afirmacion global
      // sobre `products`-: si la transaccion no hubiera deshecho, aqui habria una fila.
      const restantes = await prisma.product.count({
        where: { nameNormalized: nombreNormalizado },
      });
      expect(restantes).toBe(0);
    } finally {
      // No hay producto que borrar: si lo hubiera, el caso ya habria fallado. Se limpia el
      // fixture igual, que si se escribio.
      await dropFixture(fixture, []);
    }
  });
});

describe('R18: agregar un lote no toca el producto', () => {
  it('deja name, stock, qty_alert y updated_at del producto intactos', async () => {
    const fixture = await createFixture();
    const productIds: string[] = [];

    try {
      const primero = await createWithFirstBatch(
        newProduct({ stock: 7, qtyAlert: 2 }),
        newBatch(fixture, { stock: 7 }),
        new Date(),
          ambito(fixture),
      );
      productIds.push(primero.id);

      const antes = await prisma.product.findUniqueOrThrow({ where: { id: primero.id } });

      // El segundo lote trae OTRA existencia. R18: la del producto queda como estaba, y con
      // ella el nombre y la alerta. La existencia del producto sera la suma de los lotes en
      // QC-91; hoy, transitoriamente, no se mueve.
      const agregado = await addBatchToAlive(
        primero.id,
        newBatch(fixture, { stock: 99, unitCost: '1.0000' }),
        new Date(Date.now() + 60_000),
        ambito(fixture),
      );
      expect(agregado).not.toBeNull();

      const despues = await prisma.product.findUniqueOrThrow({ where: { id: primero.id } });
      expect(despues.name).toBe(antes.name);
      expect(despues.stock).toBe(antes.stock);
      expect(despues.qtyAlert).toBe(antes.qtyAlert);
      // ACTUALIZADO EL 2026-09-11 POR QC-80 (R7, R21): donde se comparaba `unit_id` -columna
      // eliminada- se compara ahora la fila ENTERA. La afirmacion no se debilita, se refuerza:
      // agregar un lote no cambia NINGUNA columna del producto, ni las que vengan despues.
      expect(despues).toEqual(antes);
      // Ni `updated_at`: agregar un lote NO es editar el producto (`design.md > 2`).
      expect(despues.updatedAt.toISOString()).toBe(antes.updatedAt.toISOString());

      // Y el lote si se escribio: son dos, no uno.
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

      // Borrado LOGICO: la fila sigue ahi, pero `deleted_at` deja de ser NULL y el `where`
      // del adaptador ya no la encuentra.
      await prisma.product.update({
        where: { id: creado.id },
        data: { deletedAt: new Date() },
      });

      const agregado = await addBatchToAlive(creado.id, newBatch(fixture), new Date(), ambito(fixture));
      expect(agregado).toBeNull();

      // Sigue habiendo UN solo lote: el del alta.
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
      // Dos filas EMPATADAS en `created_at` -mismo instante exacto- y una tercera posterior.
      // El empate es lo que obliga al desempate por id: sin el, Postgres puede devolver
      // cualquiera de las dos y la eleccion cambiaria entre corridas.
      const antiguo = new Date('2026-01-01T10:00:00.000Z');
      const reciente = new Date('2026-02-01T10:00:00.000Z');

      for (const createdAt of [antiguo, antiguo, reciente]) {
        const fila = await prisma.product.create({
          data: {
            name: nombre,
            nameNormalized: normalizado,
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

      const elegido = await findAliveIdByName(nombre, ambito(fixture));
      expect(elegido).toBe(menorId);

      // Estable: dos llamadas seguidas devuelven el mismo, que es lo que R20 pide.
      expect(await findAliveIdByName(nombre, ambito(fixture))).toBe(elegido);
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
      const fila = await prisma.product.create({
        data: { name: nombre, nameNormalized: normalizado, companyId: fixture.companyId },
        select: { id: true },
      });
      productIds.push(fila.id);

      // Vivo: se encuentra.
      expect(await findAliveIdByName(nombre, ambito(fixture))).toBe(fila.id);

      await prisma.product.update({ where: { id: fila.id }, data: { deletedAt: new Date() } });

      // Borrado: `null`, y por eso el alta acabara creando un producto NUEVO en vez de
      // revivir este. La fila sigue existiendo entera; lo que cambia es el `where`.
      expect(await findAliveIdByName(nombre, ambito(fixture))).toBeNull();
      const sigue = await prisma.product.findUnique({ where: { id: fila.id } });
      expect(sigue).not.toBeNull();
    } finally {
      await dropFixture(fixture, productIds);
    }
  });
});
