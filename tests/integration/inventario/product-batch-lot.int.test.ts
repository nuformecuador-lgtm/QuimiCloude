/**
 * T8 (QC-81) — el LOTE OBLIGATORIO con correlativo por empresa y la FECHA DE COMPRA, contra una
 * base Postgres REAL con la migracion `20260913120000_product_batch_lot_and_purchase_date` aplicada
 * (la base efimera de la corrida, QC-77).
 *
 * Nada de lo que se afirma aqui lo puede demostrar un unitario con la base simulada (D11, R33): el
 * correlativo lo calcula un `SELECT max` dentro de la transaccion que escribe, la unicidad es un
 * indice de la base, la carrera la resuelve un `pg_advisory_xact_lock` y el relleno lo hace el SQL
 * de la migracion.
 *
 * AISLAMIENTO — `commit`, declarado en `tests/integration/aislamiento.json`. El adaptador real
 * (`product-prisma.ts`) llama al cliente Prisma GLOBAL y abre SU PROPIA `prisma.$transaction`, una
 * por intento: envolverlo en una transaccion del test que se deshace seria un aislamiento de
 * mentira, y la carrera necesita ademas que cada alta CONFIRME para que la siguiente la vea. Cada
 * caso fabrica su empresa efimera (`randomUUID`), escribe SOLO en ella, afirma SOLO sobre sus filas
 * y la limpia en un `finally`, en orden de FK. Se apoya en que la base de la corrida es suya.
 *
 * SQL CRUDO POR `pg` Y NO POR PRISMA en los casos de restricciones (R7, R11) y en los de la
 * migracion (R18-R21): el error de `pg` trae `code` y `constraint` como campos ESTRUCTURADOS, asi
 * que se afirma sobre el SQLSTATE y el NOMBRE de la restriccion sin leer el texto del mensaje -en
 * esta maquina Postgres responde en espanol-. Y el `migration.sql` tiene varias sentencias y
 * bloques `DO`, que solo el protocolo simple de `pg` ejecuta de una vez.
 *
 * Requisitos cubiertos: R3, R7, R8, R9, R11, R12, R13, R14, R16, R18, R19, R20, R21, R25, R27, R33.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { BatchDuplicateLotError, createCreateProduct } from '@/lib/modules/inventario';
import {
  addBatchToAlive,
  createProduct,
  createWithFirstBatch,
  findAliveIdByName,
  findAliveProductById,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

// ---------------------------------------------------------------------------
// Conexion cruda y errores de Postgres
// ---------------------------------------------------------------------------

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRACION = join(RAIZ, 'db', 'migrations', '20260913120000_product_batch_lot_and_purchase_date');

/** El SQL REAL de la migracion, leido del disco: nada se reimplementa en el test. */
const UP_SQL = readFileSync(join(MIGRACION, 'migration.sql'), 'utf8');
const DOWN_SQL = readFileSync(join(MIGRACION, 'down.sql'), 'utf8');

const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const CHECK_VIOLATION = '23514';
const RAISE_EXCEPTION = 'P0001';

/** La URL de la base de la corrida. `_setup.ts` ya aborto si no apunta a ella (QC-77 R12). */
function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

async function withPg<T>(body: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: connectionString() });
  await client.connect();
  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

type PgFailure = { readonly code: string; readonly constraint: string | null; readonly message: string };

/** Los campos ESTRUCTURADOS del error de `pg`. Nunca se decide por el texto traducido. */
function pgFailureOf(error: unknown): PgFailure {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    throw new Error(`se esperaba un error de Postgres y llego: ${String(error)}`);
  }
  const campos = error as { code: unknown; constraint?: unknown; message?: unknown };
  return {
    code: String(campos.code),
    constraint: typeof campos.constraint === 'string' ? campos.constraint : null,
    message: typeof campos.message === 'string' ? campos.message : '',
  };
}

async function expectPgRejection(run: () => Promise<unknown>, what: string): Promise<PgFailure> {
  try {
    await run();
  } catch (error) {
    return pgFailureOf(error);
  }
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

// ---------------------------------------------------------------------------
// Datos de apoyo (mismo patron que `product-batch-write.int.test.ts`)
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Fixture = {
  readonly actorId: string;
  readonly companyId: string;
  readonly presentationId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

/**
 * Empresa EFIMERA con su usuario (FK real de `created_by`/`updated_by`) y una presentacion suya
 * (FK real de `presentation_id`, y el disparador de empresa exige que sea de la MISMA empresa).
 */
async function createFixture(): Promise<Fixture> {
  const marker = token();
  const documentType = await prisma.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  });
  const role = await prisma.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  });
  const companyName = `Empresa ${marker}`;
  const company = await prisma.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
    select: { id: true },
  });
  const user = await prisma.user.create({
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
  const unit = await prisma.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  });
  const presentationName = `Bidon ${marker}`;
  const presentation = await prisma.presentation.create({
    data: {
      name: presentationName,
      nameNormalized: `bidon${marker}`,
      unitId: unit.id,
      companyId: company.id,
    },
    select: { id: true },
  });
  return {
    actorId: user.id,
    companyId: company.id,
    presentationId: presentation.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
  };
}

/**
 * Limpieza en ORDEN DE FK: lotes -> productos -> presentacion -> usuario -> rol y tipo de
 * documento -> empresa. Los `deleteMany` por `companyId` solo alcanzan filas de ESTA empresa, que
 * nacio en este caso con un nombre irrepetible: no hay filas ajenas que puedan caer.
 */
async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.productBatch.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.product.deleteMany({ where: { companyId: fixture.companyId } });
  await prisma.presentation.deleteMany({ where: { id: fixture.presentationId } });
  await prisma.user.delete({ where: { id: fixture.actorId } });
  await prisma.role.delete({ where: { id: fixture.roleId } });
  await prisma.documentType.delete({ where: { code: fixture.documentTypeCode } });
  await prisma.company.delete({ where: { id: fixture.companyId } });
}

async function dropFixtures(fixtures: readonly Fixture[]): Promise<void> {
  for (const fixture of fixtures) await dropFixture(fixture);
}

function ambito(fixture: Fixture): InventoryScope {
  return { companyId: fixture.companyId };
}

function newProduct(overrides: Partial<NewProduct> = {}): NewProduct {
  return { name: `Producto ${token()}`, stock: 3, ...overrides };
}

/** `lot: null` es «que lo genere el backend» (QC-81 R8); un caso con lote a mano lo pasa. */
function newBatch(fixture: Fixture, overrides: Partial<NewProductBatch> = {}): NewProductBatch {
  return {
    presentationId: fixture.presentationId,
    stock: 3,
    unitCost: '2.5000',
    lot: null,
    purchaseDate: '2026-09-01',
    expiryDate: null,
    createdBy: fixture.actorId,
    ...overrides,
  };
}

async function lotOf(batchId: string): Promise<string> {
  const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { lot: true } });
  return fila.lot;
}

/** Todos los lotes de la empresa del caso, ordenados. Solo filas de su empresa efimera. */
async function lotsOfCompany(fixture: Fixture): Promise<string[]> {
  const filas = await prisma.productBatch.findMany({
    where: { companyId: fixture.companyId },
    select: { lot: true },
  });
  return filas.map((fila) => fila.lot).sort();
}

/** Alta de producto nuevo con su primer lote; devuelve el lote que quedo escrito. */
async function altaConLote(fixture: Fixture, lot: string | null): Promise<{ productId: string; lot: string }> {
  const creado = await createWithFirstBatch(newProduct(), newBatch(fixture, { lot }), new Date(), ambito(fixture));
  return { productId: creado.id, lot: await lotOf(creado.batchId) };
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// El correlativo
// ---------------------------------------------------------------------------

describe('R8, R9: el lote ausente lo genera el backend con la serie de la empresa', () => {
  it('R8, R9: empresa sin lotes, el alta con lot ausente genera "1" y la siguiente "2"', async () => {
    const fixture = await createFixture();
    try {
      const primera = await altaConLote(fixture, null);
      expect(primera.lot).toBe('1');

      const segunda = await altaConLote(fixture, null);
      expect(segunda.lot).toBe('2');

      expect(await lotsOfCompany(fixture)).toEqual(['1', '2']);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R8, R9: por el camino de lote a producto existente (addBatchToAlive) tambien genera "1" y "2"', async () => {
    const fixture = await createFixture();
    try {
      // El producto nace con un lote NO numerico escrito a mano: la empresa no tiene todavia ningun
      // lote de la serie, asi que el primero generado por `addBatchToAlive` tiene que ser '1'.
      const base = await altaConLote(fixture, 'INICIAL-A-MANO');

      const primero = await addBatchToAlive(base.productId, newBatch(fixture), new Date(), ambito(fixture));
      if (primero === null) throw new Error('addBatchToAlive devolvio null con el producto vivo');
      expect(await lotOf(primero.batchId)).toBe('1');

      const segundo = await addBatchToAlive(base.productId, newBatch(fixture), new Date(), ambito(fixture));
      if (segundo === null) throw new Error('addBatchToAlive devolvio null con el producto vivo');
      expect(await lotOf(segundo.batchId)).toBe('2');

      expect(await lotsOfCompany(fixture)).toEqual(['1', '2', 'INICIAL-A-MANO']);
    } finally {
      await dropFixture(fixture);
    }
  });
});

describe('R16: la serie continua desde el mas alto que existe en la empresa', () => {
  it('R16: con "50" tecleado a mano cuando la serie iba por 3, el siguiente generado es "51" y nunca uno existente', async () => {
    const fixture = await createFixture();
    try {
      expect((await altaConLote(fixture, null)).lot).toBe('1');
      expect((await altaConLote(fixture, null)).lot).toBe('2');
      expect((await altaConLote(fixture, null)).lot).toBe('3');
      await altaConLote(fixture, '50');

      const existentesAntes = await lotsOfCompany(fixture);
      const siguiente = await altaConLote(fixture, null);

      expect(siguiente.lot).toBe('51');
      expect(existentesAntes).not.toContain(siguiente.lot);

      // Y ningun valor repetido en la empresa: cada fila tiene su lote.
      const todos = await lotsOfCompany(fixture);
      expect(new Set(todos).size).toBe(todos.length);
      expect(todos).toEqual(['1', '2', '3', '50', '51']);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R16: con "999999999999999999" tecleado a mano el siguiente es "1000000000000000000" y el siguiente "1000000000000000001", sin techo y sin chocar', async () => {
    // Hallazgo m4 de la revision. Con el maximo leido como `bigint` sobre `'^[0-9]{1,18}$'`, el
    // valor de 19 digitos generado aqui quedaba FUERA del maximo: la segunda alta volvia a leer los
    // dieciocho nueves, proponia otra vez '1000000000000000000', chocaba tres veces y fallaba, y
    // desde entonces fallaba toda alta con lote generado de la empresa. El espia de
    // `prisma.$transaction` mide que ninguna de las dos altas choca: una sola transaccion cada una,
    // sin reintento.
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      await altaConLote(fixture, '999999999999999999');

      spy.mockClear();
      const antesDeLaPrimera = await lotsOfCompany(fixture);
      const primera = await altaConLote(fixture, null);
      expect(primera.lot).toBe('1000000000000000000');
      expect(antesDeLaPrimera).not.toContain(primera.lot);
      expect(spy, 'la primera alta generada no reintenta').toHaveBeenCalledTimes(1);

      spy.mockClear();
      const antesDeLaSegunda = await lotsOfCompany(fixture);
      const segunda = await altaConLote(fixture, null);
      expect(segunda.lot).toBe('1000000000000000001');
      expect(antesDeLaSegunda).not.toContain(segunda.lot);
      expect(spy, 'la segunda alta generada no reintenta').toHaveBeenCalledTimes(1);

      const todos = await lotsOfCompany(fixture);
      expect(new Set(todos).size).toBe(todos.length);
      expect(todos).toEqual(['1000000000000000000', '1000000000000000001', '999999999999999999']);
    } finally {
      spy.mockRestore();
      await dropFixture(fixture);
    }
  });
});

describe('R9: solo los lotes puramente numericos cuentan para la serie', () => {
  it('R9: "ACME-2026-07" no altera la serie y "007" cuenta como 7, asi que el siguiente es "8" sin ceros', async () => {
    const fixture = await createFixture();
    try {
      await altaConLote(fixture, 'ACME-2026-07');
      expect((await altaConLote(fixture, null)).lot).toBe('1');

      await altaConLote(fixture, '007');
      const siguiente = await altaConLote(fixture, null);
      expect(siguiente.lot).toBe('8');
      expect(siguiente.lot).not.toMatch(/^0/u);

      expect(await lotsOfCompany(fixture)).toEqual(['007', '1', '8', 'ACME-2026-07']);
    } finally {
      await dropFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// La unicidad por empresa
// ---------------------------------------------------------------------------

describe('R13, R25: un lote a mano repetido en la empresa se rechaza sin escribir nada', () => {
  it('R13, R25: rechaza con BatchDuplicateLotError (batch_duplicate_lot), sin reintentar ni sustituir y con cero filas escritas', async () => {
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      const existente = await altaConLote(fixture, 'L-REPETIDO');
      const nombreNuevo = `Producto ${token()}`;

      // Camino 1: producto NUEVO con un lote que ya existe. Si el reconocimiento del choque por
      // columnas no casara con el `P2002` real, aqui llegaria el error crudo y el caso daria rojo.
      spy.mockClear();
      const rechazoAlta = await createWithFirstBatch(
        newProduct({ name: nombreNuevo }),
        newBatch(fixture, { lot: 'L-REPETIDO' }),
        new Date(),
        ambito(fixture),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(rechazoAlta).toBeInstanceOf(BatchDuplicateLotError);
      expect((rechazoAlta as BatchDuplicateLotError).code).toBe('batch_duplicate_lot');
      // Sin reintentar: UNA sola transaccion abierta para esta alta.
      expect(spy).toHaveBeenCalledTimes(1);

      // Camino 2: lote a producto EXISTENTE con el mismo lote repetido.
      spy.mockClear();
      const rechazoAgregar = await addBatchToAlive(
        existente.productId,
        newBatch(fixture, { lot: 'L-REPETIDO' }),
        new Date(),
        ambito(fixture),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(rechazoAgregar).toBeInstanceOf(BatchDuplicateLotError);
      expect((rechazoAgregar as BatchDuplicateLotError).code).toBe('batch_duplicate_lot');
      expect(spy).toHaveBeenCalledTimes(1);

      // CERO filas escritas (R25): ni el producto nuevo -la transaccion deshizo su INSERT- ni un
      // lote, y ningun correlativo sustituto ('1').
      expect(await prisma.product.count({ where: { nameNormalized: normalizeProductName(nombreNuevo) } })).toBe(0);
      expect(await prisma.product.count({ where: { companyId: fixture.companyId } })).toBe(1);
      expect(await lotsOfCompany(fixture)).toEqual(['L-REPETIDO']);
    } finally {
      spy.mockRestore();
      await dropFixture(fixture);
    }
  });
});

describe('R12, R27: la unicidad y el correlativo son de la empresa del ambito', () => {
  it('R12, R27: dos empresas escriben el MISMO lote, y B sin lotes genera "1" aunque A tenga "50"', async () => {
    const empresaA = await createFixture();
    const empresaB = await createFixture();
    try {
      expect((await altaConLote(empresaA, '50')).lot).toBe('50');

      // R27: el correlativo se calcula contra la empresa del AMBITO. Si leyera el maximo global,
      // aqui saldria '51'.
      expect((await altaConLote(empresaB, null)).lot).toBe('1');

      // R12: el mismo valor en otra empresa se acepta.
      expect((await altaConLote(empresaB, '50')).lot).toBe('50');

      // Y A sigue su propia serie, sin enterarse de lo que hizo B.
      expect((await altaConLote(empresaA, null)).lot).toBe('51');

      expect(await lotsOfCompany(empresaA)).toEqual(['50', '51']);
      expect(await lotsOfCompany(empresaB)).toEqual(['1', '50']);
    } finally {
      await dropFixtures([empresaA, empresaB]);
    }
  });
});

describe('R11: la unicidad (empresa, lote) esta en la base, no en el codigo', () => {
  it('R11: un duplicado dentro de la empresa por SQL crudo lo rechaza product_batches_company_lot_unique con 23505', async () => {
    const fixture = await createFixture();
    try {
      const existente = await altaConLote(fixture, 'RAW-1');

      // SQL CRUDO, sin pasar por el adaptador ni por zod: lo que se demuestra es que POSTGRES
      // rechaza, aunque nadie compruebe nada antes.
      const rechazo = await withPg((client) =>
        expectPgRejection(
          () =>
            client.query(
              `INSERT INTO "product_batches" (
                 "product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date",
                 "company_id", "created_by", "updated_by", "updated_at"
               ) VALUES ($1::uuid, $2::uuid, 1, 1.0000, $3, DATE '2026-09-01', $4::uuid, $5::uuid, $5::uuid, now())`,
              [existente.productId, fixture.presentationId, 'RAW-1', fixture.companyId, fixture.actorId],
            ),
          'un segundo lote RAW-1 en la misma empresa',
        ),
      );

      expect(rechazo.code).toBe(UNIQUE_VIOLATION);
      expect(rechazo.constraint).toBe('product_batches_company_lot_unique');
      expect(await lotsOfCompany(fixture)).toEqual(['RAW-1']);
    } finally {
      await dropFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// La carrera
// ---------------------------------------------------------------------------

describe('R14: altas simultaneas de la misma empresa obtienen lotes distintos y consecutivos', () => {
  /** Altas lanzadas a la vez en cada ronda, y rondas seguidas sobre la misma empresa. */
  const ALTAS_POR_RONDA = 8;
  const RONDAS = 3;

  it('R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin reintentos y con lotes consecutivos', async () => {
    // POR QUE ESTE TEST PUEDE PONERSE ROJO (y es la unica clase de test que vale para R14):
    //
    //   - Sin el `pg_advisory_xact_lock` como sentencia APARTE y ANTES del `SELECT max`, las ocho
    //     transacciones leen el mismo maximo en READ COMMITTED y proponen el mismo numero. Todas
    //     menos una chocan contra `product_batches_company_lot_unique`. El reintento acotado (3
    //     intentos) no alcanza para ocho a la vez: en cada vuelta vuelven a chocar entre si, alguna
    //     agota los intentos y el `Promise.all` RECHAZA -> rojo por excepcion.
    //   - Si aun asi los reintentos lo taparan, el espia de `prisma.$transaction` lo delata: con el
    //     lock hay exactamente UNA transaccion por alta; cualquier reintento abre otra y el conteo
    //     sale mayor que 8 -> rojo aunque los lotes acaben bien.
    //   - Si el lock estuviera dentro de la misma sentencia que lee el maximo, la instantanea se
    //     tomaria antes de que la anterior confirmara: mismo desenlace que sin lock.
    //
    // Ocho a la vez y tres rondas para que no pase por suerte de planificacion; son 24 altas
    // cortas, pocos segundos.
    //
    // REQUISITO DEL ENTORNO: este test solo tiene sentido con un pool de Prisma de MAS DE UNA
    // conexion. Con `connection_limit=1` en la URL, las ocho altas se serializarian en el propio
    // pool -cada `prisma.$transaction` esperaria a que la anterior soltara la unica conexion- y el
    // test pasaria aunque el lock no existiera. Con el pool por defecto de Prisma (varias conexiones)
    // si compiten de verdad, y la mutacion sin lock lo pone en rojo.
    //
    // CADA RONDA SE ESPERA ENTERA CON `Promise.allSettled`, y no con `Promise.all`, antes de afirmar
    // y antes del `finally` (hallazgo m5 de la revision). Con `Promise.all`, el primer rechazo corta
    // la espera mientras las demas altas SIGUEN escribiendo; el `finally` corria `dropFixture` en
    // mitad de esas escrituras, chocaba con una FK y ese era el error visible, tapando la causa
    // real. Esperadas todas, se relanza el PRIMER rechazo TAL CUAL -p. ej. el `Error` de reintentos
    // agotados con el `P2002` como `cause`-, que es el que explica el rojo.
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      for (let ronda = 0; ronda < RONDAS; ronda += 1) {
        spy.mockClear();

        // Sin ningun `await` entre las altas: se crean las ocho promesas y se esperan juntas.
        const altas = Array.from({ length: ALTAS_POR_RONDA }, () =>
          createWithFirstBatch(newProduct(), newBatch(fixture), new Date(), ambito(fixture)),
        );
        const asentadas = await Promise.allSettled(altas);

        // Todas resuelven: si alguna rechazo, se ve SU error, no uno de la limpieza.
        const primerRechazo = asentadas.find(
          (asentada): asentada is PromiseRejectedResult => asentada.status === 'rejected',
        );
        if (primerRechazo !== undefined) {
          const causa: unknown = primerRechazo.reason;
          throw causa;
        }
        const resultados = asentadas.map((asentada) => {
          if (asentada.status !== 'fulfilled') throw new Error('inalcanzable: ya se relanzo el rechazo');
          return asentada.value;
        });

        expect(spy).toHaveBeenCalledTimes(ALTAS_POR_RONDA);

        const lotes = await Promise.all(resultados.map((r) => lotOf(r.batchId)));
        const numeros = lotes.map((lot) => Number(lot)).sort((a, b) => a - b);
        const desde = ronda * ALTAS_POR_RONDA + 1;
        const esperados = Array.from({ length: ALTAS_POR_RONDA }, (_, i) => desde + i);

        // Distintos y consecutivos, continuando desde la ronda anterior.
        expect(new Set(lotes).size).toBe(ALTAS_POR_RONDA);
        expect(numeros).toEqual(esperados);
        expect(lotes.every((lot) => /^[1-9][0-9]*$/u.test(lot))).toBe(true);
      }

      expect((await lotsOfCompany(fixture)).length).toBe(ALTAS_POR_RONDA * RONDAS);
    } finally {
      spy.mockRestore();
      await dropFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// La fecha de compra
// ---------------------------------------------------------------------------

type PurchaseDateRow = { readonly purchase_date: string };

/** `purchase_date::text`: lo que la columna GUARDO, sin que el cliente reinterprete la zona. */
async function purchaseDateOf(where: { batchId: string } | { productId: string }): Promise<string> {
  const filas =
    'batchId' in where
      ? await prisma.$queryRaw<readonly PurchaseDateRow[]>`
          SELECT "purchase_date"::text AS "purchase_date" FROM "product_batches" WHERE "id" = ${where.batchId}::uuid`
      : await prisma.$queryRaw<readonly PurchaseDateRow[]>`
          SELECT "purchase_date"::text AS "purchase_date" FROM "product_batches" WHERE "product_id" = ${where.productId}::uuid`;
  if (filas.length !== 1 || filas[0] === undefined) {
    throw new Error(`se esperaba exactamente un lote y hay ${String(filas.length)}`);
  }
  return filas[0].purchase_date;
}

/** El repositorio REAL, atado igual que en `lib/composition/index.ts`, para poder inyectar `now`. */
const repositorioReal: ProductRepository = {
  create: createProduct,
  findAliveById: findAliveProductById,
  updateAlive: updateAliveProduct,
  softDeleteAlive: softDeleteAliveProduct,
  listAlive: listAliveProducts,
  findAliveIdByName,
  createWithFirstBatch,
  addBatchToAlive,
};

describe('R3: la fecha de compra se guarda sin corrimiento de dia', () => {
  it('R3: una fecha escrita llega identica a purchase_date, por los dos caminos del adaptador', async () => {
    const fixture = await createFixture();
    try {
      // 1 de enero: con una zona negativa un corrimiento de un dia cambiaria tambien el ANO.
      const creado = await createWithFirstBatch(
        newProduct(),
        newBatch(fixture, { purchaseDate: '2026-01-01' }),
        new Date('2026-01-01T02:00:00.000Z'),
        ambito(fixture),
      );
      expect(await purchaseDateOf({ batchId: creado.batchId })).toBe('2026-01-01');

      const agregado = await addBatchToAlive(
        creado.id,
        newBatch(fixture, { purchaseDate: '2025-12-31' }),
        new Date(),
        ambito(fixture),
      );
      if (agregado === null) throw new Error('addBatchToAlive devolvio null con el producto vivo');
      expect(await purchaseDateOf({ batchId: agregado.batchId })).toBe('2025-12-31');
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R3, R2: por el caso de uso, sin fecha llega el dia UTC del now inyectado y con fecha llega la escrita', async () => {
    const fixture = await createFixture();
    try {
      // 03:30 UTC del 1 de marzo es todavia 28 de febrero en cualquier zona de America: si el dia
      // se sacara de la zona local en vez de UTC, la columna diria '2026-02-28'.
      const instante = new Date('2026-03-01T03:30:00.000Z');
      const altaDeProducto = createCreateProduct({ products: repositorioReal, now: () => instante });
      const actor = {
        id: fixture.actorId,
        companyId: fixture.companyId,
        permissions: ['inventario.modificar'],
      };

      const sinFecha = await altaDeProducto(
        {
          name: `Producto ${token()}`,
          stock: 2,
          qtyAlert: 1,
          presentationId: fixture.presentationId,
          unitCost: '1.5000',
        },
        actor,
      );
      expect(await purchaseDateOf({ productId: sinFecha.id })).toBe('2026-03-01');

      const conFecha = await altaDeProducto(
        {
          name: `Producto ${token()}`,
          stock: 2,
          qtyAlert: 1,
          presentationId: fixture.presentationId,
          unitCost: '1.5000',
          purchaseDate: '2026-02-14',
        },
        actor,
      );
      expect(await purchaseDateOf({ productId: conFecha.id })).toBe('2026-02-14');
    } finally {
      await dropFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// El lote obligatorio, en la base
// ---------------------------------------------------------------------------

describe('R7: la base no admite un lote nulo ni en blanco', () => {
  it('R7: lot = "" y lot = "   " los rechaza product_batches_lot_not_blank (23514) y lot = NULL da 23502', async () => {
    const fixture = await createFixture();
    try {
      const existente = await altaConLote(fixture, 'VALIDO');

      await withPg(async (client) => {
        const insertar = (lot: string | null) => () =>
          client.query(
            `INSERT INTO "product_batches" (
               "product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date",
               "company_id", "created_by", "updated_by", "updated_at"
             ) VALUES ($1::uuid, $2::uuid, 1, 1.0000, $3, DATE '2026-09-01', $4::uuid, $5::uuid, $5::uuid, now())`,
            [existente.productId, fixture.presentationId, lot, fixture.companyId, fixture.actorId],
          );

        const vacio = await expectPgRejection(insertar(''), "lot = ''");
        expect(vacio.code).toBe(CHECK_VIOLATION);
        expect(vacio.constraint).toBe('product_batches_lot_not_blank');

        const espacios = await expectPgRejection(insertar('   '), "lot = '   '");
        expect(espacios.code).toBe(CHECK_VIOLATION);
        expect(espacios.constraint).toBe('product_batches_lot_not_blank');

        const nulo = await expectPgRejection(insertar(null), 'lot = NULL');
        expect(nulo.code).toBe(NOT_NULL_VIOLATION);
      });

      expect(await lotsOfCompany(fixture)).toEqual(['VALIDO']);
    } finally {
      await dropFixture(fixture);
    }
  });
});

// ---------------------------------------------------------------------------
// La migracion, con su SQL REAL
// ---------------------------------------------------------------------------

/**
 * METODO: un ESQUEMA DE USAR Y TIRAR con una copia de `product_batches`.
 *
 * 1. `CREATE SCHEMA qc81_<random>` y dentro `product_batches (LIKE public.product_batches INCLUDING
 *    DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`. El `LIKE` conserva el nombre de los CHECK
 *    pero NO el de los indices -los renombra-, asi que el indice unico de la copia se renombra a
 *    `product_batches_company_lot_unique` para que la copia sea fiel y el `down.sql` lo encuentre.
 *    Ni FK ni disparadores se copian: el SQL de la migracion no los nombra.
 * 2. Con `search_path` SOLO a ese esquema, se aplica el `down.sql` del disco: la copia queda en el
 *    estado previo a QC-81. Con el `search_path` reducido a ese esquema, un nombre que no resolviera
 *    en la copia FALLA, nunca cae en `public`.
 * 3. Se siembra, se aplica el `migration.sql` del disco en UNA transaccion -como `prisma migrate
 *    deploy`- y se afirma.
 * 4. `DROP SCHEMA ... CASCADE` en `finally`.
 *
 * Asi no se bloquea ni se toca `public.product_batches`, que usan los demas archivos de la corrida.
 */
async function withMigrationSandbox(body: (client: Client, schema: string) => Promise<void>): Promise<void> {
  const schema = `qc81_${token().slice(0, 16)}`;
  await withPg(async (client) => {
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(
        `CREATE TABLE "${schema}"."product_batches"
           (LIKE public.product_batches INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
      );

      const unico = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = $1 AND tablename = 'product_batches'
            AND indexdef LIKE 'CREATE UNIQUE INDEX % (company_id, lot)'`,
        [schema],
      );
      const copiado = unico.rows[0];
      if (unico.rows.length !== 1 || copiado === undefined) {
        throw new Error(`la copia no trae el indice unico (company_id, lot): ${JSON.stringify(unico.rows)}`);
      }
      await client.query(
        `ALTER INDEX "${schema}"."${copiado.indexname}" RENAME TO "product_batches_company_lot_unique"`,
      );

      // La copia es fiel al estado migrado ANTES de aplicarle el DOWN: si no lo fuera, el DOWN
      // podria "funcionar" sobre una tabla que no se parece a la real.
      expect(await schemaState(client, schema)).toEqual(ESTADO_MIGRADO);

      await client.query(`SET search_path TO "${schema}"`);
      await runInTransaction(client, DOWN_SQL);
      expect(await schemaState(client, schema)).toEqual(ESTADO_PREVIO);

      await body(client, schema);
    } finally {
      // Por si el cuerpo dejo la sesion en una transaccion abortada.
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  });
}

/** Un archivo SQL entero en UNA transaccion, igual que lo ejecuta Prisma Migrate. */
async function runInTransaction(client: Client, sql: string): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

type SchemaState = {
  readonly purchaseDate: { readonly nullable: boolean; readonly type: string } | null;
  readonly lotNullable: boolean;
  readonly checks: readonly string[];
  readonly uniqueIndex: boolean;
  readonly rlsForced: boolean;
};

const ESTADO_MIGRADO: SchemaState = {
  purchaseDate: { nullable: false, type: 'date' },
  lotNullable: false,
  checks: ['product_batches_lot_length', 'product_batches_lot_not_blank'],
  uniqueIndex: true,
  rlsForced: false, // el `LIKE` no copia la RLS; el DOWN y el UP la dejan forzada
};

const ESTADO_PREVIO: SchemaState = {
  purchaseDate: null,
  lotNullable: true,
  checks: [],
  uniqueIndex: false,
  rlsForced: true,
};

/** Lo que QC-81 anade al esquema, leido del catalogo del motor para ESA copia. */
async function schemaState(client: Client, schema: string): Promise<SchemaState> {
  const columnas = await client.query<{ column_name: string; is_nullable: string; data_type: string }>(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'product_batches' AND column_name IN ('lot', 'purchase_date')`,
    [schema],
  );
  const purchase = columnas.rows.find((c) => c.column_name === 'purchase_date');
  const lot = columnas.rows.find((c) => c.column_name === 'lot');
  if (lot === undefined) throw new Error(`la copia ${schema} no tiene la columna lot`);

  const checks = await client.query<{ conname: string }>(
    `SELECT c.conname FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = 'product_batches' AND c.contype = 'c'
        AND c.conname IN ('product_batches_lot_not_blank', 'product_batches_lot_length')
      ORDER BY c.conname`,
    [schema],
  );
  const indice = await client.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname = $1 AND tablename = 'product_batches' AND indexname = 'product_batches_company_lot_unique'`,
    [schema],
  );
  const rls = await client.query<{ forced: boolean }>(
    `SELECT t.relforcerowsecurity AS forced FROM pg_class t
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = 'product_batches'`,
    [schema],
  );

  const def = indice.rows[0]?.indexdef ?? '';
  return {
    purchaseDate: purchase === undefined ? null : { nullable: purchase.is_nullable === 'YES', type: purchase.data_type },
    lotNullable: lot.is_nullable === 'YES',
    checks: checks.rows.map((r) => r.conname),
    uniqueIndex: def.startsWith('CREATE UNIQUE INDEX') && def.endsWith('(company_id, lot)'),
    rlsForced: rls.rows[0]?.forced === true,
  };
}

type SeedRow = {
  readonly id: string;
  readonly companyId: string;
  readonly lot: string | null;
  readonly createdAt: string;
};

/** Filas sembradas en la copia, en el estado PREVIO a la migracion (lot anulable, sin fecha). */
async function seed(client: Client, rows: readonly SeedRow[]): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO "product_batches" (
         "id", "product_id", "presentation_id", "stock", "unit_cost", "lot",
         "company_id", "created_at", "updated_at"
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 1.0000, $4, $5::uuid, $6::timestamptz, $6::timestamptz)`,
      [row.id, randomUUID(), randomUUID(), row.lot, row.companyId, row.createdAt],
    );
  }
}

describe('R18, R19, R20, R21: la migracion aplicada con su SQL real sobre una copia de la tabla', () => {
  it('R18, R19: numera las filas sin lote por orden de creacion y por empresa desde el maximo, conserva los lotes y pone el dia UTC de created_at', async () => {
    await withMigrationSandbox(async (client, schema) => {
      const empresaA = randomUUID();
      const empresaB = randomUUID();
      // Empate de `created_at`: lo desempata el `id`, asi que los dos ids se ordenan aqui.
      const [empateMenor, empateMayor] = [randomUUID(), randomUUID()].sort() as [string, string];

      const filas = {
        a1: { id: randomUUID(), companyId: empresaA, lot: null, createdAt: '2026-01-10T12:00:00Z' },
        // 23:30 en UTC-5 es ya el dia 12 en UTC: la fecha de compra tiene que ser el 12.
        a2: { id: randomUUID(), companyId: empresaA, lot: null, createdAt: '2026-01-11T23:30:00-05:00' },
        a3: { id: empateMayor, companyId: empresaA, lot: null, createdAt: '2026-01-13T08:00:00Z' },
        a4: { id: empateMenor, companyId: empresaA, lot: null, createdAt: '2026-01-13T08:00:00Z' },
        a50: { id: randomUUID(), companyId: empresaA, lot: '50', createdAt: '2026-01-09T00:00:00Z' },
        acme: { id: randomUUID(), companyId: empresaA, lot: 'ACME', createdAt: '2026-01-14T10:00:00Z' },
        aBlanco: { id: randomUUID(), companyId: empresaA, lot: '   ', createdAt: '2026-01-15T10:00:00Z' },
        // En B se inserta primero la mas NUEVA: manda `created_at`, no el orden de insercion.
        b1: { id: randomUUID(), companyId: empresaB, lot: null, createdAt: '2026-02-01T10:00:00Z' },
        b2: { id: randomUUID(), companyId: empresaB, lot: null, createdAt: '2026-01-05T10:00:00Z' },
      } satisfies Record<string, SeedRow>;
      await seed(client, Object.values(filas));

      // Una sesion en zona NEGATIVA: si el relleno usara la zona de la sesion, a2 caeria el 11.
      await client.query(`SET TIME ZONE 'America/Guayaquil'`);
      await runInTransaction(client, UP_SQL);

      const leidas = await client.query<{ id: string; lot: string; purchase_date: string }>(
        `SELECT id::text AS id, lot, purchase_date::text AS purchase_date FROM "product_batches"`,
      );
      const por = new Map(leidas.rows.map((r) => [r.id, r]));
      const de = (fila: SeedRow) => {
        const encontrada = por.get(fila.id);
        if (encontrada === undefined) throw new Error(`falta la fila sembrada ${fila.id}`);
        return encontrada;
      };

      // R18: A continua desde su maximo (50), por created_at y con el id como desempate; el lote
      // en blanco tambien recibe numero. B no tiene lotes: arranca en 1.
      expect(de(filas.a1).lot).toBe('51');
      expect(de(filas.a2).lot).toBe('52');
      expect(de(filas.a4).lot).toBe('53');
      expect(de(filas.a3).lot).toBe('54');
      expect(de(filas.aBlanco).lot).toBe('55');
      expect(de(filas.b2).lot).toBe('1');
      expect(de(filas.b1).lot).toBe('2');
      // Las que ya tenian lote lo conservan intacto.
      expect(de(filas.a50).lot).toBe('50');
      expect(de(filas.acme).lot).toBe('ACME');

      // R19: el dia UTC de SU created_at, nunca el de hoy.
      expect(de(filas.a1).purchase_date).toBe('2026-01-10');
      expect(de(filas.a2).purchase_date).toBe('2026-01-12');
      expect(de(filas.a3).purchase_date).toBe('2026-01-13');
      expect(de(filas.a4).purchase_date).toBe('2026-01-13');
      expect(de(filas.a50).purchase_date).toBe('2026-01-09');
      expect(de(filas.acme).purchase_date).toBe('2026-01-14');
      expect(de(filas.aBlanco).purchase_date).toBe('2026-01-15');
      expect(de(filas.b1).purchase_date).toBe('2026-02-01');
      expect(de(filas.b2).purchase_date).toBe('2026-01-05');
      const hoy = (await client.query<{ hoy: string }>(`SELECT CURRENT_DATE::text AS hoy`)).rows[0]?.hoy;
      expect(leidas.rows.some((r) => r.purchase_date === hoy)).toBe(false);

      expect(leidas.rows).toHaveLength(Object.keys(filas).length);
      expect(await schemaState(client, schema)).toEqual({ ...ESTADO_MIGRADO, rlsForced: true });
    });
  });

  it('R18: el relleno continua SIN TECHO desde un lote de 18 o mas digitos, sin chocar con uno de 19 ya escrito y sin reventar con uno de 40', async () => {
    // Hallazgo m4 de la revision, en su mitad de la migracion. Con el maximo leido como `bigint`
    // sobre `'^[0-9]{1,18}$'`:
    //   - en C, el '1000000000000000000' ya tecleado quedaba fuera del maximo, la fila sin lote
    //     recibia OTRA VEZ '1000000000000000000' y el indice unico abortaba la migracion entera;
    //   - en B, el lote de 40 digitos quedaba fuera del maximo y la serie arrancaba en '1'.
    await withMigrationSandbox(async (client, schema) => {
      const empresaA = randomUUID();
      const empresaB = randomUUID();
      const empresaC = randomUUID();
      const cuarentaDigitos = '1234567890123456789012345678901234567890';

      const filas = {
        a18: { id: randomUUID(), companyId: empresaA, lot: '999999999999999999', createdAt: '2026-01-01T10:00:00Z' },
        a1: { id: randomUUID(), companyId: empresaA, lot: null, createdAt: '2026-01-02T10:00:00Z' },
        a2: { id: randomUUID(), companyId: empresaA, lot: null, createdAt: '2026-01-03T10:00:00Z' },
        b40: { id: randomUUID(), companyId: empresaB, lot: cuarentaDigitos, createdAt: '2026-01-01T10:00:00Z' },
        b1: { id: randomUUID(), companyId: empresaB, lot: null, createdAt: '2026-01-02T10:00:00Z' },
        c18: { id: randomUUID(), companyId: empresaC, lot: '999999999999999999', createdAt: '2026-01-01T10:00:00Z' },
        c19: { id: randomUUID(), companyId: empresaC, lot: '1000000000000000000', createdAt: '2026-01-01T11:00:00Z' },
        c1: { id: randomUUID(), companyId: empresaC, lot: null, createdAt: '2026-01-02T10:00:00Z' },
      } satisfies Record<string, SeedRow>;
      await seed(client, Object.values(filas));

      await runInTransaction(client, UP_SQL);

      const leidas = await client.query<{ id: string; lot: string }>(
        `SELECT id::text AS id, lot FROM "product_batches"`,
      );
      const loteDe = (fila: SeedRow): string => {
        const encontrada = leidas.rows.find((r) => r.id === fila.id);
        if (encontrada === undefined) throw new Error(`falta la fila sembrada ${fila.id}`);
        return encontrada.lot;
      };

      // A: continua desde los dieciocho nueves, pasando a 19 digitos.
      expect(loteDe(filas.a1)).toBe('1000000000000000000');
      expect(loteDe(filas.a2)).toBe('1000000000000000001');
      // B: continua desde el lote de 40 digitos, exacto y sin notacion cientifica ni decimales.
      expect(loteDe(filas.b1)).toBe('1234567890123456789012345678901234567891');
      // C: el maximo es el de 19 digitos, no los dieciocho nueves, asi que no hay choque.
      expect(loteDe(filas.c1)).toBe('1000000000000000001');
      // Los que ya tenian lote lo conservan intacto.
      expect(loteDe(filas.a18)).toBe('999999999999999999');
      expect(loteDe(filas.b40)).toBe(cuarentaDigitos);
      expect(loteDe(filas.c18)).toBe('999999999999999999');
      expect(loteDe(filas.c19)).toBe('1000000000000000000');

      expect(leidas.rows).toHaveLength(Object.keys(filas).length);
      expect(await schemaState(client, schema)).toEqual({ ...ESTADO_MIGRADO, rlsForced: true });
    });
  });

  it('R20: con la tabla vacia la migracion aplica sin error y deja NOT NULL, los dos CHECK y el indice unico', async () => {
    await withMigrationSandbox(async (client, schema) => {
      const vacia = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "product_batches"`);
      expect(vacia.rows[0]?.n).toBe(0);

      await expect(runInTransaction(client, UP_SQL)).resolves.toBeUndefined();

      expect(await schemaState(client, schema)).toEqual({ ...ESTADO_MIGRADO, rlsForced: true });
    });
  });

  it('R21: con dos filas de la misma empresa y el mismo lote la migracion aborta con su mensaje y no deja nada a medias', async () => {
    await withMigrationSandbox(async (client, schema) => {
      const empresa = randomUUID();
      const sinLote = randomUUID();
      await seed(client, [
        { id: randomUUID(), companyId: empresa, lot: 'DUP', createdAt: '2026-01-01T10:00:00Z' },
        { id: randomUUID(), companyId: empresa, lot: 'DUP', createdAt: '2026-01-02T10:00:00Z' },
        { id: sinLote, companyId: empresa, lot: null, createdAt: '2026-01-03T10:00:00Z' },
      ]);

      const rechazo = await expectPgRejection(() => runInTransaction(client, UP_SQL), 'migrar con DUP repetido');

      // Su guardia, con su mensaje: cuantas son y que hacer. El texto es del RAISE de la migracion,
      // no una traduccion del servidor.
      expect(rechazo.code).toBe(RAISE_EXCEPTION);
      expect(rechazo.message).toContain('QC-81: hay 1 lote(s) repetido(s)');
      expect(rechazo.message).toContain('2 fila(s)');
      expect(rechazo.message).toContain('renombra a mano los lotes repetidos');

      // Nada a medias: ni columna, ni CHECK, ni indice, ni NOT NULL, y la RLS como estaba.
      expect(await schemaState(client, schema)).toEqual(ESTADO_PREVIO);
      // Y ningun dato tocado: la fila sin lote sigue sin lote.
      const fila = await client.query<{ lot: string | null }>(`SELECT lot FROM "product_batches" WHERE id = $1::uuid`, [
        sinLote,
      ]);
      expect(fila.rows[0]?.lot).toBeNull();
    });
  });
});

