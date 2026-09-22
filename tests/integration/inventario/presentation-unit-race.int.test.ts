/**
 * R20: la base rechaza el cambio de unidad de una presentacion con lotes AUNQUE llegue en carrera
 * con el alta de un lote sobre esa misma presentacion, en los dos ordenes posibles
 * (`design.md > 6`, `> 4.2`). `presentation-unit.int.test.ts` prueba el camino secuencial -la
 * presentacion YA tiene el lote antes de editar-; este archivo prueba lo que ese no puede: dos
 * transacciones REALES intercaladas de forma deterministica, con una presentacion que arranca SIN
 * ningun lote, para que el resultado dependa de verdad de quien gane la carrera.
 *
 * Mecanismo (medido en `db/migrations/20260918130000_product_unit_and_stored_stock/migration.sql`):
 * el disparador del INSERT de un lote toma `SELECT ... FOR SHARE` sobre su presentacion, y el
 * `UPDATE ... SET unit_id` de la presentacion necesita un lock incompatible con ese `FOR SHARE`
 * -aunque no cambie ningun valor todavia, el simple `UPDATE` ya lo pide-. Sea cual sea el orden en
 * que las dos sentencias llegan, la segunda espera a que la primera CONFIRME, y entonces ve el
 * estado ya definitivo (unidad nueva, o lote ya escrito) y se rechaza con `23514`:
 *   (a) INSERT primero: el `UPDATE` espera, ve el lote ya confirmado y lo rechaza el disparador de
 *       `presentations` (`presentations_unit_locked_by_batches`).
 *   (b) UPDATE primero: el `INSERT` espera, lee la unidad ya cambiada y lo rechaza el disparador de
 *       `product_batches` (`product_batches_unit_differs_from_product`).
 * En ningun orden queda un producto con lotes en dos unidades.
 *
 * SQL DIRECTO A PROPOSITO, con dos `pg.Client`: R20 exige el rechazo "aunque llegue por otro
 * camino", y ademas hace falta control manual de BEGIN/COMMIT para sostener una transaccion
 * abierta mientras la otra se bloquea -algo que `prisma.$transaction(async tx => ...)` no da sin
 * reescribir el propio adaptador-. El bloqueo se comprueba leyendo `pg_stat_activity` por el `pid`
 * de la conexion bloqueada (`wait_event_type = 'Lock'`), con el mismo patron medido en
 * `pedidos/order-sequence-race.int.test.ts`.
 *
 * AISLAMIENTO -- por COMMIT, no por transaccion con ROLLBACK: la carrera necesita que la primera
 * sentencia CONFIRME para que la segunda, al desbloquearse, vea su efecto. Cada caso fabrica su
 * propia empresa efimera (`randomUUID`) y la limpia en un `finally`, en el orden de las FK (lotes
 * -> producto -> presentacion -> unidades -> empresa). Declarado en `tests/integration/aislamiento.json`.
 */
import { randomUUID } from 'node:crypto';

import { Client, DatabaseError } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/shared/db/prisma';

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '');
}

function connectionString(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (url === undefined || url.trim() === '') {
    throw new Error('falta DATABASE_URL (o DIRECT_URL) en el entorno de la corrida de integracion');
  }
  return url;
}

let empresaDelArchivo: string;

beforeAll(async () => {
  const nombre = `Empresa presentacion-unidad-carrera ${token()}`;
  const { id } = await prisma.company.create({
    data: { name: nombre, nameNormalized: nombre.toLowerCase().replace(/[^a-z0-9]/gu, '') },
    select: { id: true },
  });
  empresaDelArchivo = id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: empresaDelArchivo } });
  await prisma.$disconnect();
});

type Escenario = {
  readonly unidadOriginal: string;
  readonly unidadNueva: string;
  readonly presentationId: string;
  readonly productId: string;
};

async function sembrarUnidad(): Promise<string> {
  const marca = token();
  const { id } = await prisma.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `u${marca}` },
    select: { id: true },
  });
  return id;
}

/** Presentacion y producto en la MISMA unidad, sin ningun lote todavia: quien gane la carrera lo
 *  decide el orden de llegada de las dos sentencias, no el estado de partida. */
async function crearEscenario(): Promise<Escenario> {
  const unidadOriginal = await sembrarUnidad();
  const unidadNueva = await sembrarUnidad();
  const marcaP = token();
  const presentation = await prisma.presentation.create({
    data: {
      name: `Presentacion carrera ${marcaP}`,
      nameNormalized: `presentacioncarrera${marcaP}`,
      unitId: unidadOriginal,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  const marcaProd = token();
  const product = await prisma.product.create({
    data: {
      name: `Producto carrera ${marcaProd}`,
      nameNormalized: `productocarrera${marcaProd}`,
      unitId: unidadOriginal,
      companyId: empresaDelArchivo,
    },
    select: { id: true },
  });
  return {
    unidadOriginal,
    unidadNueva,
    presentationId: presentation.id,
    productId: product.id,
  };
}

/** En orden de FK: lotes -> producto -> presentacion -> las dos unidades propias del escenario. */
async function borrarEscenario(escenario: Escenario): Promise<void> {
  await prisma.productBatch.deleteMany({ where: { presentationId: escenario.presentationId } });
  await prisma.product.deleteMany({ where: { id: escenario.productId } });
  await prisma.presentation.deleteMany({ where: { id: escenario.presentationId } });
  await prisma.unit.deleteMany({
    where: { id: { in: [escenario.unidadOriginal, escenario.unidadNueva] } },
  });
}

/** `updated_at` no lleva `DEFAULT` en la base -lo pone Prisma en la aplicacion (`@updatedAt`)-, asi
 *  que el SQL directo tiene que darlo el mismo. */
const INSERT_LOTE_SQL = `
  INSERT INTO "product_batches"
    ("product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date", "company_id", "updated_at")
  VALUES ($1, $2, $3, $4, $5, $6, $7, now())
`;

const UPDATE_PRESENTATION_UNIT_SQL = `UPDATE "presentations" SET "unit_id" = $1 WHERE "id" = $2`;

/** Muy por debajo de los 20 s de plazo del proyecto `integration`. */
const COTA_DE_BLOQUEO_MS = 3_000;

type Vigilada<T> = {
  readonly promesa: Promise<T>;
  readonly terminada: () => boolean;
};

/** Envuelve una promesa sin esperarla: permite preguntar si ya se asento mientras se hace otra cosa. */
function vigilar<T>(promesa: Promise<T>): Vigilada<T> {
  let terminada = false;
  const anotar = (): void => {
    terminada = true;
  };
  promesa.then(anotar, anotar);
  return { promesa, terminada: () => terminada };
}

/** El `pid` de backend de una conexion recien abierta, para poder buscarla luego en
 *  `pg_stat_activity` sin ambiguedad con la propia conexion que sujeta el lock. */
async function pidDe(client: Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid()::int AS "pid"');
  const pid = rows[0]?.pid;
  if (pid === undefined) throw new Error('pg_backend_pid() no devolvio ninguna fila');
  return pid;
}

/**
 * Espera a que la conexion `pid` quede bloqueada esperando un lock. Se lee por el pool de Prisma
 * -conexion distinta de las dos que compiten- porque una de esas dos esta, precisamente, ocupada
 * esperando.
 */
async function esperarBloqueada(pid: number, observada: Vigilada<unknown>, siTerminaAntes: string): Promise<void> {
  const limite = Date.now() + COTA_DE_BLOQUEO_MS;
  for (;;) {
    const filas = await prisma.$queryRaw<ReadonlyArray<{ waitEventType: string | null }>>`
      SELECT "wait_event_type" AS "waitEventType" FROM pg_stat_activity WHERE pid = ${pid}`;
    if (filas[0]?.waitEventType === 'Lock') return;
    if (observada.terminada()) throw new Error(siTerminaAntes);
    if (Date.now() > limite) {
      throw new Error(
        `${siTerminaAntes}: no quedo esperando un lock en ${String(COTA_DE_BLOQUEO_MS)} ms ` +
          `(wait_event_type=${filas[0]?.waitEventType ?? 'sin fila'})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('R20 — la base rechaza el cambio de unidad de una presentacion con lotes en carrera con el alta de un lote sobre ella', () => {
  it('R20 (orden a, el lote llega primero) — el INSERT del lote confirma primero; el UPDATE de unidad, que esperaba, ve el lote ya escrito y lo rechaza con presentations_unit_locked_by_batches', async () => {
    const escenario = await crearEscenario();
    const holder = new Client({ connectionString: connectionString() });
    const contender = new Client({ connectionString: connectionString() });
    try {
      await holder.connect();
      await holder.query('BEGIN');
      // El disparador `product_batches_check_unit_trigger` toma `FOR SHARE` sobre la presentacion
      // y la deja tomada: la transaccion sigue abierta, sin confirmar.
      await holder.query(INSERT_LOTE_SQL, [
        escenario.productId,
        escenario.presentationId,
        5,
        '10.0000',
        `L-${randomUUID()}`,
        '2026-09-01',
        empresaDelArchivo,
      ]);

      await contender.connect();
      const contenderPid = await pidDe(contender);
      await contender.query('BEGIN');
      const cambioDeUnidad = vigilar(
        contender.query(UPDATE_PRESENTATION_UNIT_SQL, [escenario.unidadNueva, escenario.presentationId]),
      );
      await esperarBloqueada(
        contenderPid,
        cambioDeUnidad,
        'el UPDATE de unidad no quedo esperando el FOR SHARE del INSERT del lote (orden a)',
      );

      // Confirma el lote: suelta el `FOR SHARE` y dispara la reanudacion del UPDATE.
      await holder.query('COMMIT');

      const rechazo: unknown = await cambioDeUnidad.promesa.then(
        () => null,
        (error: unknown) => error,
      );
      expect(rechazo).toBeInstanceOf(DatabaseError);
      expect((rechazo as DatabaseError).code).toBe('23514');
      expect((rechazo as DatabaseError).message).toContain('presentations_unit_locked_by_batches');
      await contender.query('ROLLBACK').catch(() => undefined);

      const presentacion = await prisma.presentation.findUniqueOrThrow({
        where: { id: escenario.presentationId },
        select: { unitId: true },
      });
      expect(presentacion.unitId).toBe(escenario.unidadOriginal);

      const producto = await prisma.product.findUniqueOrThrow({
        where: { id: escenario.productId },
        select: { unitId: true },
      });
      expect(producto.unitId).toBe(escenario.unidadOriginal);

      // El lote de `holder` quedo, y en la misma unidad que su producto: nadie termino con lotes
      // en dos unidades.
      const lotes = await prisma.productBatch.findMany({
        where: { presentationId: escenario.presentationId },
        select: { presentation: { select: { unitId: true } } },
      });
      expect(lotes).toHaveLength(1);
      expect(lotes[0]?.presentation.unitId).toBe(escenario.unidadOriginal);
    } finally {
      await holder.end().catch(() => undefined);
      await contender.end().catch(() => undefined);
      await borrarEscenario(escenario);
    }
  });

  it('R20 (orden b, la unidad llega primero) — el UPDATE de unidad confirma primero, sin lotes todavia; el INSERT del lote, que esperaba, lee la unidad ya cambiada y lo rechaza con product_batches_unit_differs_from_product', async () => {
    const escenario = await crearEscenario();
    const holder = new Client({ connectionString: connectionString() });
    const contender = new Client({ connectionString: connectionString() });
    try {
      await holder.connect();
      await holder.query('BEGIN');
      // Sin ningun lote todavia, `presentations_check_unit_locked_trigger` deja pasar el cambio;
      // el `UPDATE` deja tomado un lock que choca con el `FOR SHARE` del lote, y la transaccion
      // sigue abierta, sin confirmar.
      await holder.query(UPDATE_PRESENTATION_UNIT_SQL, [escenario.unidadNueva, escenario.presentationId]);

      await contender.connect();
      const contenderPid = await pidDe(contender);
      await contender.query('BEGIN');
      const altaDeLote = vigilar(
        contender.query(INSERT_LOTE_SQL, [
          escenario.productId,
          escenario.presentationId,
          5,
          '10.0000',
          `L-${randomUUID()}`,
          '2026-09-01',
          empresaDelArchivo,
        ]),
      );
      await esperarBloqueada(
        contenderPid,
        altaDeLote,
        'el INSERT del lote no quedo esperando el lock del UPDATE de unidad (orden b)',
      );

      // Confirma el cambio de unidad: suelta el lock y dispara la reanudacion del INSERT.
      await holder.query('COMMIT');

      const rechazo: unknown = await altaDeLote.promesa.then(
        () => null,
        (error: unknown) => error,
      );
      expect(rechazo).toBeInstanceOf(DatabaseError);
      expect((rechazo as DatabaseError).code).toBe('23514');
      expect((rechazo as DatabaseError).message).toContain('product_batches_unit_differs_from_product');
      await contender.query('ROLLBACK').catch(() => undefined);

      const presentacion = await prisma.presentation.findUniqueOrThrow({
        where: { id: escenario.presentationId },
        select: { unitId: true },
      });
      // El cambio de unidad SI gano su carrera: nada en `presentations` lo impedia, la
      // presentacion no tenia ningun lote en ese instante.
      expect(presentacion.unitId).toBe(escenario.unidadNueva);

      const producto = await prisma.product.findUniqueOrThrow({
        where: { id: escenario.productId },
        select: { unitId: true },
      });
      expect(producto.unitId).toBe(escenario.unidadOriginal);

      // El lote de `contender` NUNCA se escribio: no quedo ningun producto con lotes en dos
      // unidades.
      const lotes = await prisma.productBatch.count({ where: { presentationId: escenario.presentationId } });
      expect(lotes).toBe(0);
    } finally {
      await holder.end().catch(() => undefined);
      await contender.end().catch(() => undefined);
      await borrarEscenario(escenario);
    }
  });
});
