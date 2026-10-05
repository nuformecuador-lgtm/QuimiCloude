/**
 * Aislamiento por commit y no por transaccion: el adaptador usa el cliente Prisma global y abre su
 * propia transaccion, asi que un rollback del test no desharia nada. Cada caso usa su empresa
 * efimera y la borra en `finally`.
 *
 * Restricciones y migracion van por `pg` crudo: su error trae `code` y `constraint` como campos (el
 * texto de Postgres viene localizado), y solo su protocolo simple ejecuta de una vez un `.sql` con
 * varias sentencias y bloques `DO`.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { BatchDuplicateLotError, createCreateProduct, ValidationError } from '@/lib/modules/inventario';
import { findBatchMovements } from '@/lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma';
import {
  addBatchToAlive,
  adjustBatchStock,
  createProduct,
  createWithFirstBatch,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  findAliveProductById,
  findBatchesOfAliveProduct,
  listAliveProducts,
  softDeleteAliveProduct,
  updateAliveProduct,
} from '@/lib/modules/inventario/adapters/driven/persistence/product-prisma';
import { findUnitRefs } from '@/lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma';
import { normalizeProductName } from '@/lib/modules/inventario/domain/product-name';
import { prisma } from '@/lib/shared/db/prisma';

import type { InventoryScope } from '@/lib/modules/inventario/domain/inventory-scope';
import type { NewProductBatch } from '@/lib/modules/inventario/domain/product-batch';
import type { NewProduct } from '@/lib/modules/inventario/domain/product-view';
import type { ProductRepository } from '@/lib/modules/inventario/ports/product-repository';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIGRACION = join(RAIZ, 'db', 'migrations', '20260913120000_product_batch_lot_and_purchase_date');

// Leido del disco para probar la migracion real y no una copia.
const UP_SQL = readFileSync(join(MIGRACION, 'migration.sql'), 'utf8');
const DOWN_SQL = readFileSync(join(MIGRACION, 'down.sql'), 'utf8');

const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const CHECK_VIOLATION = '23514';
const RAISE_EXCEPTION = 'P0001';

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

function token(): string {
  return randomUUID().replace(/-/gu, '');
}

type Fixture = {
  readonly actorId: string;
  readonly companyId: string;
  readonly presentationId: string;
  readonly unitId: string;
  readonly roleId: string;
  readonly documentTypeCode: string;
};

/**
 * El usuario y la presentacion existen porque `created_by` y `presentation_id` son FK reales, y un
 * disparador exige que la presentacion sea de la misma empresa que el lote.
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
    unitId: unit.id,
    roleId: role.id,
    documentTypeCode: documentType.code,
  };
}

/**
 * En orden de FK. Borrar por `companyId` no alcanza filas ajenas: la empresa nacio en este caso
 * con un nombre irrepetible.
 */
async function dropFixture(fixture: Fixture): Promise<void> {
  await prisma.inventoryMovement.deleteMany({ where: { companyId: fixture.companyId } });
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
  return { name: `Producto ${token()}`, ...overrides };
}

/** `lot: null` pide que el lote lo genere el adaptador. */
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

async function lotOf(batchId: string): Promise<string> {
  const fila = await prisma.productBatch.findUniqueOrThrow({ where: { id: batchId }, select: { lot: true } });
  return fila.lot;
}

async function lotsOfCompany(fixture: Fixture): Promise<string[]> {
  const filas = await prisma.productBatch.findMany({
    where: { companyId: fixture.companyId },
    select: { lot: true },
  });
  return filas.map((fila) => fila.lot).sort();
}

async function altaConLote(fixture: Fixture, lot: string | null): Promise<{ productId: string; lot: string }> {
  const creado = await createWithFirstBatch(newProduct(), newBatch(fixture, { lot }), new Date(), ambito(fixture));
  return { productId: creado.id, lot: await lotOf(creado.batchId) };
}

afterAll(async () => {
  await prisma.$disconnect();
});

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
      // Un lote a mano no numerico no inicia la serie: el primero generado tiene que ser '1'.
      const base = await altaConLote(fixture, 'INICIAL-A-MANO');

      const primero = await addBatchToAlive(base.productId, newBatch(fixture), new Date(), ambito(fixture));
      if (primero === null || primero === 'finished_product') {
        throw new Error('addBatchToAlive devolvio null con el producto vivo');
      }
      expect(await lotOf(primero.batchId)).toBe('1');

      const segundo = await addBatchToAlive(base.productId, newBatch(fixture), new Date(), ambito(fixture));
      if (segundo === null || segundo === 'finished_product') {
        throw new Error('addBatchToAlive devolvio null con el producto vivo');
      }
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

      const todos = await lotsOfCompany(fixture);
      expect(new Set(todos).size).toBe(todos.length);
      expect(todos).toEqual(['1', '2', '3', '50', '51']);
    } finally {
      await dropFixture(fixture);
    }
  });

  it('R16: con "999999999999999999" tecleado a mano el siguiente es "1000000000000000000" y el siguiente "1000000000000000001", sin techo y sin chocar', async () => {
    // Si el maximo solo mirara lotes de hasta 18 digitos, el de 19 generado quedaria fuera y la
    // segunda alta repetiria el lote y chocaria. Una transaccion por alta prueba que no reintento.
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

describe('R13, R25: un lote a mano repetido en la empresa se rechaza sin escribir nada', () => {
  it('R13, R25: rechaza con BatchDuplicateLotError (batch_duplicate_lot), sin reintentar ni sustituir y con cero filas escritas', async () => {
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      const existente = await altaConLote(fixture, 'L-REPETIDO');
      const nombreNuevo = `Producto ${token()}`;

      // Si el adaptador no reconociera el `P2002` real, aqui llegaria el error crudo.
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
      // Una sola transaccion: no reintento.
      expect(spy).toHaveBeenCalledTimes(1);

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

      // Tampoco queda el producto nuevo (la transaccion deshizo su INSERT) ni un lote sustituto '1'.
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

      // Si el maximo se leyera global y no por empresa, aqui saldria '51'.
      expect((await altaConLote(empresaB, null)).lot).toBe('1');

      expect((await altaConLote(empresaB, '50')).lot).toBe('50');

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

      // Sin pasar por el adaptador: lo que se prueba es que rechaza Postgres.
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

describe('R14: altas simultaneas de la misma empresa obtienen lotes distintos y consecutivos', () => {
  const ALTAS_POR_RONDA = 8;
  const RONDAS = 3;

  it('R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin reintentos y con lotes consecutivos', async () => {
    // Sin el lock, las 8 altas leen el mismo maximo, chocan y agotan los reintentos. Si los
    // reintentos lo taparan, el conteo de transacciones pasaria de 8. Tres rondas para que no pase
    // por suerte.
    //
    // Exige un pool de mas de una conexion: con una sola, las altas se serializarian y el test
    // pasaria sin lock.
    //
    // `Promise.allSettled` para que la limpieza no tape la causa: con `Promise.all` el `finally`
    // borraba el fixture con altas aun escribiendo y el error visible era el de la FK.
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      for (let ronda = 0; ronda < RONDAS; ronda += 1) {
        spy.mockClear();

        // Sin `await` entre las altas, para que compitan de verdad.
        const altas = Array.from({ length: ALTAS_POR_RONDA }, () =>
          createWithFirstBatch(newProduct(), newBatch(fixture), new Date(), ambito(fixture)),
        );
        const asentadas = await Promise.allSettled(altas);

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

/** Las mismas claves que el lock de aviso del correlativo en el adaptador. */
const CORRELATIVO_LOCK_NAMESPACE = 81;
const CORRELATIVO_LOCK_PREFIJO = 'product_batches_lot:';

/** Muy por debajo de los 5 s por defecto de la transaccion interactiva de Prisma. */
const COTA_DE_BLOQUEO_MS = 3_000;

type Vigilada<T> = {
  readonly operacion: Promise<T>;
  readonly haTerminado: () => boolean;
};

/** Anota el nombre en `orden` cuando la operacion se asienta, salga bien o mal. */
function vigilar<T>(nombre: string, operacion: Promise<T>, orden: string[]): Vigilada<T> {
  let terminada = false;
  const anotar = (): void => {
    terminada = true;
    orden.push(nombre);
  };
  void operacion.then(anotar, anotar);
  return { operacion, haTerminado: () => terminada };
}

/**
 * Espera a ver un backend de la base de la corrida bloqueado en uno de esos `wait_event`. Se lee
 * por el pool de Prisma y no por el `Client` que sujeta el lock: dentro de una transaccion,
 * `pg_stat_activity` se congela en la primera lectura.
 */
async function esperarBloqueo(
  waitEvents: readonly string[],
  observada: { readonly haTerminado: () => boolean },
  siTerminaAntes: string,
): Promise<void> {
  const limite = Date.now() + COTA_DE_BLOQUEO_MS;
  for (;;) {
    const filas = await prisma.$queryRaw<ReadonlyArray<{ n: number }>>`
      SELECT count(*)::int AS "n"
        FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'
         AND wait_event IN (${Prisma.join([...waitEvents])})`;
    if ((filas[0]?.n ?? 0) > 0) return;
    if (observada.haTerminado()) throw new Error(siTerminaAntes);
    if (Date.now() > limite) {
      throw new Error(`${siTerminaAntes}: nadie espero un lock ${waitEvents.join(' o ')} en ${COTA_DE_BLOQUEO_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('R37: el alta de un lote y el borrado del mismo producto a la vez', () => {
  // Exigen un pool de Prisma de mas de una conexion: el alta ocupa una mientras otra lee
  // `pg_stat_activity`.

  it('R37: con el borrado confirmado antes, el alta espera la fila, devuelve null y no escribe ningun lote', async () => {
    const fixture = await createFixture();
    const sujetador = new Client({ connectionString: connectionString() });
    const orden: string[] = [];
    const pendientes: Promise<unknown>[] = [];
    try {
      await sujetador.connect();
      const base = await altaConLote(fixture, `BASE-${token()}`);
      const lotesAntes = await lotsOfCompany(fixture);

      await sujetador.query('BEGIN');
      const borrado = await sujetador.query(
        `UPDATE "products" SET "deleted_at" = now(), "updated_at" = now()
          WHERE "id" = $1::uuid AND "company_id" = $2::uuid AND "deleted_at" IS NULL`,
        [base.productId, fixture.companyId],
      );
      expect(borrado.rowCount).toBe(1);

      const loteTecleado = `R37-${token()}`;
      const alta = vigilar(
        'alta',
        addBatchToAlive(base.productId, newBatch(fixture, { lot: loteTecleado }), new Date(), ambito(fixture)),
        orden,
      );
      pendientes.push(alta.operacion);

      await esperarBloqueo(['transactionid', 'tuple'], alta, 'el alta no espero a la fila');
      await sujetador.query('COMMIT');

      const [resultado] = await Promise.allSettled([alta.operacion]);
      if (resultado.status === 'rejected') {
        const causa: unknown = resultado.reason;
        throw causa;
      }

      expect(resultado.value).toBeNull();
      expect(await lotsOfCompany(fixture)).toEqual(lotesAntes);
      expect(await prisma.productBatch.count({ where: { productId: base.productId } })).toBe(1);
    } finally {
      // Cerrar la conexion deshace lo que no se confirmo y suelta los locks antes de limpiar.
      await sujetador.end().catch(() => undefined);
      await Promise.allSettled(pendientes);
      await dropFixture(fixture);
    }
  });

  it('R37: con el alta llegando antes, el borrado espera a que el alta confirme y el lote queda escrito', async () => {
    const fixture = await createFixture();
    const sujetador = new Client({ connectionString: connectionString() });
    const orden: string[] = [];
    const pendientes: Promise<unknown>[] = [];
    try {
      await sujetador.connect();
      const base = await altaConLote(fixture, `BASE-${token()}`);

      // Pausa el alta despues de bloquear la fila y antes de escribir el lote.
      await sujetador.query('BEGIN');
      await sujetador.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2::text))', [
        CORRELATIVO_LOCK_NAMESPACE,
        CORRELATIVO_LOCK_PREFIJO + fixture.companyId,
      ]);

      const alta = vigilar(
        'alta',
        addBatchToAlive(base.productId, newBatch(fixture), new Date(), ambito(fixture)),
        orden,
      );
      pendientes.push(alta.operacion);
      await esperarBloqueo(['advisory'], alta, 'el alta no espero al lock de aviso del correlativo');

      const borrado = vigilar('borrado', softDeleteAliveProduct(base.productId, new Date(), ambito(fixture)), orden);
      pendientes.push(borrado.operacion);
      await esperarBloqueo(['transactionid', 'tuple'], borrado, 'el borrado no espero al alta');

      await sujetador.query('COMMIT');

      const [resultadoAlta, resultadoBorrado] = await Promise.allSettled([alta.operacion, borrado.operacion]);
      if (resultadoAlta.status === 'rejected') {
        const causa: unknown = resultadoAlta.reason;
        throw causa;
      }
      if (resultadoBorrado.status === 'rejected') {
        const causa: unknown = resultadoBorrado.reason;
        throw causa;
      }

      const escrito = resultadoAlta.value;
      if (escrito === null || escrito === 'finished_product') {
        throw new Error('addBatchToAlive devolvio null con el producto vivo');
      }
      expect(resultadoBorrado.value).toBe(true);
      expect(await prisma.productBatch.count({ where: { id: escrito.batchId, productId: base.productId } })).toBe(1);
      const producto = await prisma.product.findUniqueOrThrow({
        where: { id: base.productId },
        select: { deletedAt: true },
      });
      expect(producto.deletedAt).not.toBeNull();
    } finally {
      await sujetador.end().catch(() => undefined);
      await Promise.allSettled(pendientes);
      await dropFixture(fixture);
    }
  });
});

type PurchaseDateRow = { readonly purchase_date: string };

/** `::text` para leer lo que guardo la columna sin que el cliente reinterprete la zona horaria. */
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

/** Atado a mano, como en `lib/composition`, para poder inyectar `now` en el caso de uso. */
const repositorioReal: ProductRepository = {
  create: createProduct,
  findAliveById: findAliveProductById,
  updateAlive: updateAliveProduct,
  softDeleteAlive: softDeleteAliveProduct,
  listAlive: listAliveProducts,
  findAliveIdByNameInPresentationUnit,
  findAliveIdByNameInUnit,
  findAlivePackagingByName,
  createWithFirstBatch,
  addBatchToAlive,
  adjustBatchStock,
  findBatchesOfAliveProduct,
  findBatchMovements,
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
      if (agregado === null || agregado === 'finished_product') {
        throw new Error('addBatchToAlive devolvio null con el producto vivo');
      }
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
      const altaDeProducto = createCreateProduct({ products: repositorioReal, units: { findRefs: findUnitRefs }, now: () => instante });
      const actor = {
        id: fixture.actorId,
        companyId: fixture.companyId,
        permissions: ['inventario.modificar'],
      };

      const sinFecha = await altaDeProducto(
        {
          name: `Producto ${token()}`,
          stock: '2',
          qtyAlert: '1',
          unitId: fixture.unitId,
          unitCost: '1.5000',
        },
        actor,
      );
      expect(await purchaseDateOf({ productId: sinFecha.id })).toBe('2026-03-01');

      const conFecha = await altaDeProducto(
        {
          name: `Producto ${token()}`,
          stock: '2',
          qtyAlert: '1',
          unitId: fixture.unitId,
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

/** Cada alta usa un nombre irrepetible, asi que cada producto tiene un solo lote. */
async function lotOfProduct(productId: string): Promise<string> {
  const filas = await prisma.productBatch.findMany({ where: { productId }, select: { lot: true } });
  const unica = filas[0];
  if (filas.length !== 1 || unica === undefined) {
    throw new Error(`se esperaba exactamente un lote del producto y hay ${String(filas.length)}`);
  }
  return unica.lot;
}

describe('R34, R35, R36: el lote tecleado de solo digitos no llega a 60 y el generado cabe siempre', () => {
  it('R35, R36, R34: por el caso de uso, 59 nueves tecleados se escriben, los dos siguientes generados tienen 60 caracteres sin reintento y 60 digitos tecleados dan ValidationError sin filas nuevas', async () => {
    // Por el caso de uso: el esquema de entrada solo se aplica ahi. `findAliveIdByNameInUnit`
    // no abre transaccion, asi que una sola por alta es la escritura sin reintento.
    const fixture = await createFixture();
    const spy = vi.spyOn(prisma, '$transaction');
    try {
      const altaDeProducto = createCreateProduct({ products: repositorioReal, units: { findRefs: findUnitRefs }, now: () => new Date() });
      const actor = {
        id: fixture.actorId,
        companyId: fixture.companyId,
        permissions: ['inventario.modificar'],
      };
      const alta = (lot?: string) =>
        altaDeProducto(
          {
            name: `Producto ${token()}`,
            stock: '2',
            qtyAlert: '1',
            unitId: fixture.unitId,
            unitCost: '1.5000',
            ...(lot === undefined ? {} : { lot }),
          },
          actor,
        );

      const nueves59 = '9'.repeat(59);
      const primeroGenerado = `1${'0'.repeat(59)}`;
      const segundoGenerado = `1${'0'.repeat(58)}1`;

      const tecleado = await alta(nueves59);
      expect(await lotOfProduct(tecleado.id)).toBe(nueves59);

      // Si el CHECK de largo rechazara 60 caracteres, el alta fallaria aqui con `unexpected`.
      spy.mockClear();
      const primera = await alta();
      expect(await lotOfProduct(primera.id)).toBe(primeroGenerado);
      expect(primeroGenerado).toHaveLength(60);
      expect(spy, 'la primera alta generada no reintenta').toHaveBeenCalledTimes(1);

      spy.mockClear();
      const segunda = await alta();
      expect(await lotOfProduct(segunda.id)).toBe(segundoGenerado);
      expect(segundoGenerado).toHaveLength(60);
      expect(spy, 'la segunda alta generada no reintenta').toHaveBeenCalledTimes(1);

      expect(await lotsOfCompany(fixture)).toEqual([primeroGenerado, segundoGenerado, nueves59].sort());

      const productosAntes = await prisma.product.count({ where: { companyId: fixture.companyId } });
      const lotesAntes = await prisma.productBatch.count({ where: { companyId: fixture.companyId } });
      spy.mockClear();

      const rechazo = await alta('9'.repeat(60)).then(
        () => null,
        (error: unknown) => error,
      );

      expect(rechazo).toBeInstanceOf(ValidationError);
      expect((rechazo as ValidationError).code).toBe('invalid_input');
      expect(spy, 'el rechazo de la entrada no abre ninguna transaccion').not.toHaveBeenCalled();
      expect(await prisma.product.count({ where: { companyId: fixture.companyId } })).toBe(productosAntes);
      expect(await prisma.productBatch.count({ where: { companyId: fixture.companyId } })).toBe(lotesAntes);
      expect(await lotsOfCompany(fixture)).toEqual([primeroGenerado, segundoGenerado, nueves59].sort());
    } finally {
      spy.mockRestore();
      await dropFixture(fixture);
    }
  });
});

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

/**
 * Copia de `product_batches` en un esquema de usar y tirar, para no bloquear la tabla real que usan
 * los demas archivos. `LIKE` no conserva los nombres de indice, asi que el unico se renombra para
 * que `down.sql` lo encuentre. Con `search_path` solo en ese esquema, un nombre que no resuelva
 * falla en vez de caer en `public`.
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

      // Si la copia no fuera fiel, el DOWN podria funcionar sobre una tabla distinta de la real.
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

/** En una transaccion, para que un fallo no deje la copia a medias. */
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
  rlsForced: false, // `LIKE` no copia la RLS; el DOWN y el UP la dejan forzada
};

const ESTADO_PREVIO: SchemaState = {
  purchaseDate: null,
  lotNullable: true,
  checks: [],
  uniqueIndex: false,
  rlsForced: true,
};

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

/** La copia esta en el estado previo a la migracion: `lot` anulable y sin `purchase_date`. */
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

      // Un lote en blanco cuenta como sin lote y tambien recibe numero.
      expect(de(filas.a1).lot).toBe('51');
      expect(de(filas.a2).lot).toBe('52');
      expect(de(filas.a4).lot).toBe('53');
      expect(de(filas.a3).lot).toBe('54');
      expect(de(filas.aBlanco).lot).toBe('55');
      expect(de(filas.b2).lot).toBe('1');
      expect(de(filas.b1).lot).toBe('2');
      expect(de(filas.a50).lot).toBe('50');
      expect(de(filas.acme).lot).toBe('ACME');

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
    // Si el maximo solo mirara lotes de hasta 18 digitos, en C la fila sin lote repetiria el de 19
    // y abortaria la migracion, y en B la serie arrancaria en '1'.
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

      expect(loteDe(filas.a1)).toBe('1000000000000000000');
      expect(loteDe(filas.a2)).toBe('1000000000000000001');
      expect(loteDe(filas.b1)).toBe('1234567890123456789012345678901234567891');
      expect(loteDe(filas.c1)).toBe('1000000000000000001');
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

      // Se puede afirmar sobre el texto porque es el del RAISE de la migracion, no uno localizado.
      expect(rechazo.code).toBe(RAISE_EXCEPTION);
      expect(rechazo.message).toContain('QC-81: hay 1 lote(s) repetido(s)');
      expect(rechazo.message).toContain('2 fila(s)');
      expect(rechazo.message).toContain('renombra a mano los lotes repetidos');

      expect(await schemaState(client, schema)).toEqual(ESTADO_PREVIO);
      const fila = await client.query<{ lot: string | null }>(`SELECT lot FROM "product_batches" WHERE id = $1::uuid`, [
        sinLote,
      ]);
      expect(fila.rows[0]?.lot).toBeNull();
    });
  });
});

