/**
 * QC-59 T29 — restricciones, unicidad, backfill y reversion de
 * `20260917120000_suppliers_company_scope` contra Postgres real.
 *
 * AISLAMIENTO: `transaccion`. Cada caso corre en una transaccion interactiva que termina en
 * ROLLBACK, con `SAVEPOINT` para lo que se espera que falle. Molde:
 * `recetas/company-scope.int.test.ts` (QC-50) y `pedidos/company-scope.int.test.ts` (QC-60). En
 * Postgres el DDL es transaccional: los backfills, las guardias y el `down.sql` entero se
 * ejecutan dentro de esa misma transaccion y el ROLLBACK los deshace, asi que nada de esto toca
 * la base de la corrida mas alla de su propia transaccion.
 *
 * RLS. `suppliers`, `supplier_catalog_lines`, `presentations` y `companies` estan `ENABLE` +
 * `FORCE ROW LEVEL SECURITY` y sin ninguna policy. En esta corrida `DATABASE_URL`/`DIRECT_URL`
 * conectan como superusuario -la misma mina que documentan QC-49, QC-60 y QC-50-: un
 * superusuario se salta la RLS siempre, `FORCE` incluido, asi que ningun caso de aqui prueba el
 * filtrado de RLS -no es alcance de esta ficha- y no hace falta ningun `NO FORCE` manual para
 * leer o escribir directo.
 *
 * QUE SE EJECUTA DEL SQL REAL. `migration.sql` trae CUATRO bloques `DO $$`: el backfill de
 * proveedores, el backfill de lineas, la guardia de presentaciones cruzadas y la guardia de
 * nombres repetidos previa al relevo del indice. Aqui hacen falta los dos primeros; los otros
 * dos los cubre el test de esquema sobre el texto. `down.sql` trae UN solo bloque `DO $$` con
 * sus TRES guardias en secuencia, que se ejecuta leido del disco -nunca copiado a mano-, y
 * ademas se ejecuta ENTERO, troceado en sus sentencias, para comparar el retrato del esquema de
 * antes con el de despues contra `pg_indexes`, `pg_constraint` e `information_schema`, en vez de
 * afirmar sobre el texto del archivo.
 *
 * LA MINA DE LAS GUARDIAS DEL DOWN: las tres no son independientes en los datos. La guardia 1
 * resuelve UNA sola empresa objetivo, asi que cualquier fila que dispare la 3 -dos proveedores
 * vivos de empresas distintas con el mismo nombre- implica, por construccion, que al menos uno
 * de los dos pertenece a otra empresa, y la guardia 2 la atrapa ANTES. Lo mismo pasa con la
 * segunda mitad de la guardia 2: una linea de otra empresa solo puede colgar de un proveedor de
 * esa otra empresa -lo impone la clave foranea compuesta-, asi que la mitad de proveedores
 * aborta primero. Para afirmar el mensaje que pertenece a cada una hay que aislarla desactivando
 * la anterior con una mutacion EN MEMORIA del texto leido del disco -nunca del archivo-, y cada
 * aborto va acompanado de un control que demuestra que muerde por si solo y no es un placebo que
 * dependiera de la guardia de delante.
 *
 * R15, ANGULO 3. «Dar de baja libera el nombre» se afirma aqui SOLO por comportamiento: no se
 * lee `pg_indexes` ni el texto del SQL en ese caso, a proposito. Los otros dos angulos viven en
 * `tests/integration/inventario/list-query-indexes.int.test.ts` (predicado del catalogo) y en el
 * test de esquema de la migracion (texto), y si este se apoyara en cualquiera de ellos dejarian
 * de ser tres afirmaciones independientes.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeCompanyName } from '@/lib/modules/identity';
import { prisma } from '@/lib/shared/db/prisma';

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** No es un fallo: es como se fuerza el ROLLBACK de la transaccion del test. */
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

const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

type Rechazo = { readonly sqlState: string; readonly texto: string };

/**
 * El texto junta mensaje y `meta` porque Prisma deja el mensaje de Postgres en uno u otro segun
 * la via; en el se busca el nombre de la restriccion o la etiqueta de la excepcion, que no se
 * traducen.
 */
function rechazoDe(error: unknown): Rechazo {
  let sqlState = '';
  const partes: string[] = [];
  if (error instanceof Error) partes.push(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    sqlState = error.code;
    const meta: unknown = error.meta;
    if (typeof meta === 'object' && meta !== null) {
      partes.push(JSON.stringify(meta));
      if ('code' in meta) {
        const code: unknown = (meta as { code: unknown }).code;
        if (typeof code === 'string') sqlState = code;
      }
    }
  }
  if (partes.length === 0) partes.push(String(error));
  return { sqlState, texto: partes.join(' | ') };
}

/**
 * El SAVEPOINT deja la transaccion utilizable: un error de restriccion la aborta entera, y casi
 * todos los casos consultan despues del rechazo.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<Rechazo> {
  savepointSeq += 1;
  const savepoint = `sp_${String(savepointSeq)}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
  try {
    await run();
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    return rechazoDe(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`);
}

/** Solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '');
}

// ---------------------------------------------------------------------------
// Los bloques `DO $$` leidos del disco
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`);
      dir = parent;
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(repoRoot, 'db', 'migrations');
const scopeDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_suppliers_company_scope'),
);
expect(scopeDirs, 'debe existir exactamente una migracion *_suppliers_company_scope').toHaveLength(
  1,
);
const migrationDir = join(migrationsDir, scopeDirs[0] as string);

function leerSql(archivo: string): string {
  return readFileSync(join(migrationDir, archivo), 'utf8');
}

/** Todos los bloques `DO $$ ... $$;` de un archivo, en el orden en que aparecen. */
function allDoBlocks(archivo: string): string[] {
  const sql = leerSql(archivo);
  const matches = [...sql.matchAll(/DO\s+\$\$[\s\S]*?\$\$;/g)];
  if (matches.length === 0) throw new Error(`${archivo} no tiene ningun bloque DO $$`);
  return matches.map((match) => match[0]);
}

const BLOQUES_DEL_UP = allDoBlocks('migration.sql');
expect(
  BLOQUES_DEL_UP,
  'el UP tiene cuatro bloques DO: los dos backfills y las dos guardias',
).toHaveLength(4);

/** Paso 2 del UP: la empresa de los proveedores. */
const BACKFILL_PROVEEDORES = BLOQUES_DEL_UP[0] as string;
/** Paso 3 del UP: la empresa de cada linea, derivada de la de su proveedor. */
const BACKFILL_LINEAS = BLOQUES_DEL_UP[1] as string;
expect(BACKFILL_PROVEEDORES).toContain('UPDATE "suppliers" SET "company_id" = target_company_id');
expect(BACKFILL_LINEAS).toContain('FROM "suppliers" AS s');

/** `down.sql` trae UN solo bloque `DO $$`, con las tres guardias en secuencia. */
const GUARDIA_DEL_DOWN = allDoBlocks('down.sql')[0] as string;

// Mutaciones EN MEMORIA del texto leido del disco -nunca del archivo-, para aislar cada guardia
// de la que la precede y la subsume en los datos (ver cabecera).
const SIN_GUARDIA_DE_PROVEEDORES = GUARDIA_DEL_DOWN.replace(
  'FROM "suppliers" WHERE "company_id" <> target_company_id;',
  'FROM "suppliers" WHERE FALSE;',
);
expect(
  SIN_GUARDIA_DE_PROVEEDORES,
  'la mutacion de la mitad de proveedores de la guardia 2 no encontro su texto',
).not.toBe(GUARDIA_DEL_DOWN);

const SIN_GUARDIA_2 = SIN_GUARDIA_DE_PROVEEDORES.replace(
  'FROM "supplier_catalog_lines" WHERE "company_id" <> target_company_id;',
  'FROM "supplier_catalog_lines" WHERE FALSE;',
);
expect(
  SIN_GUARDIA_2,
  'la mutacion de la mitad de lineas de la guardia 2 no encontro su texto',
).not.toBe(SIN_GUARDIA_DE_PROVEEDORES);

const SIN_GUARDIAS_2_Y_3 = SIN_GUARDIA_2.replace(
  'HAVING count(DISTINCT "company_id") > 1',
  'HAVING FALSE',
);
expect(SIN_GUARDIAS_2_Y_3, 'la mutacion de la guardia 3 no encontro su texto').not.toBe(
  SIN_GUARDIA_2,
);

// ---------------------------------------------------------------------------
// El `down.sql` ENTERO, troceado en sentencias para ejecutarlo del disco
// ---------------------------------------------------------------------------

/**
 * Trocea por los `;` de nivel superior. Los `;` que viven dentro de un bloque `$$ ... $$`, de
 * una cadena o de un comentario `--` no separan nada; los comentarios se descartan porque la
 * unica forma de que uno terminara dentro de la sentencia siguiente seria tragarse su texto.
 */
function sentenciasSql(sql: string): string[] {
  const sentencias: string[] = [];
  let actual = '';
  let enDolar = false;
  let enComilla = false;
  let enComentario = false;
  let i = 0;
  while (i < sql.length) {
    const caracter = sql[i] as string;
    const pareja = sql.slice(i, i + 2);
    if (enComentario) {
      if (caracter === '\n') {
        enComentario = false;
        actual += caracter;
      }
      i += 1;
    } else if (!enDolar && !enComilla && pareja === '--') {
      enComentario = true;
      i += 2;
    } else if (!enDolar && caracter === "'") {
      enComilla = !enComilla;
      actual += caracter;
      i += 1;
    } else if (!enComilla && pareja === '$$') {
      enDolar = !enDolar;
      actual += pareja;
      i += 2;
    } else if (!enDolar && !enComilla && caracter === ';') {
      sentencias.push(actual.trim());
      actual = '';
      i += 1;
    } else {
      actual += caracter;
      i += 1;
    }
  }
  if (actual.trim() !== '') sentencias.push(actual.trim());
  return sentencias.filter((sentencia) => sentencia !== '');
}

const DOWN_SQL = leerSql('down.sql');
const SENTENCIAS_DEL_DOWN = sentenciasSql(DOWN_SQL);

// El troceador tambien puede mentir: si se comiera una sentencia, ejecutar el DOWN «entero»
// dejaria de significar nada y la comparacion de retratos pasaria por otro camino. Se afirma que
// el bloque de guardias viaja intacto en UNA sola pieza y que los pasos que este archivo
// comprueba estan cada uno en la suya.
expect(SENTENCIAS_DEL_DOWN.filter((s) => s.startsWith('DO $$'))).toHaveLength(1);
for (const esperada of [
  'ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"',
  'ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"',
  'ALTER TABLE "presentations" DROP CONSTRAINT "presentations_company_id_id_key"',
  'ALTER TABLE "suppliers"     DROP CONSTRAINT "suppliers_company_id_id_key"',
  'DROP INDEX "suppliers_company_name_unique"',
  'CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL',
  'DROP INDEX "supplier_catalog_lines_company_id_supplier_id_idx"',
  'ALTER TABLE "suppliers"              DROP COLUMN "company_id"',
  'ALTER TABLE "supplier_catalog_lines" DROP COLUMN "company_id"',
  'ALTER TABLE "suppliers"              FORCE ROW LEVEL SECURITY',
]) {
  expect(SENTENCIAS_DEL_DOWN, `el troceador perdio: ${esperada}`).toContain(esperada);
}

/** Mutacion en memoria -nunca del archivo-: el DOWN deja de restaurar el unico global. */
const SIN_RESTAURAR_EL_GLOBAL = sentenciasSql(
  DOWN_SQL.replace(
    'CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;',
    '',
  ),
);
expect(SIN_RESTAURAR_EL_GLOBAL.length, 'la mutacion del CREATE INDEX no encontro su texto').toBe(
  SENTENCIAS_DEL_DOWN.length - 1,
);

// ---------------------------------------------------------------------------
// Los dos retratos del esquema
// ---------------------------------------------------------------------------

type Retrato = {
  readonly columnas: readonly string[];
  readonly indices: readonly string[];
  readonly restricciones: readonly string[];
};

type Fotografia = {
  readonly suppliers: Retrato;
  readonly lineas: Retrato;
  /** Las claves de `presentations`: el UP le anade una y el DOWN tiene que quitarsela. */
  readonly presentaciones: readonly string[];
  readonly rls: readonly string[];
  readonly politicas: readonly string[];
};

type Lector = Pick<Prisma.TransactionClient, '$queryRaw' | '$queryRawUnsafe'>;

/**
 * Lo que el esquema dice de si mismo, leido de `information_schema` y del catalogo, nunca del
 * SQL del disco: es el unico oraculo que no comparte origen con lo que se esta probando.
 */
async function retratoDeTabla(db: Lector, tabla: string): Promise<Retrato> {
  const columnas = await db.$queryRawUnsafe<{ linea: string }[]>(
    `SELECT column_name::text || ' | ' || data_type::text || ' | ' || is_nullable::text AS linea
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    tabla,
  );
  const indices = await db.$queryRawUnsafe<{ linea: string }[]>(
    `SELECT indexname::text || ' | ' || indexdef::text AS linea
       FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname`,
    tabla,
  );
  const restricciones = await db.$queryRawUnsafe<{ linea: string }[]>(
    `SELECT conname::text || ' | ' || contype::text || ' | ' || pg_get_constraintdef(oid)::text AS linea
       FROM pg_constraint
      WHERE conrelid = ('public.' || $1)::regclass
      ORDER BY conname`,
    tabla,
  );
  const lineas = (filas: { linea: string }[]): string[] => filas.map((fila) => fila.linea);
  return {
    columnas: lineas(columnas),
    indices: lineas(indices),
    restricciones: lineas(restricciones),
  };
}

async function fotografiaDeEsquema(db: Lector): Promise<Fotografia> {
  const presentaciones = await db.$queryRaw<{ linea: string }[]>`
    SELECT conname::text || ' | ' || contype::text AS linea
      FROM pg_constraint
     WHERE conrelid = 'public.presentations'::regclass
     ORDER BY conname`;
  const rls = await db.$queryRaw<{ linea: string }[]>`
    SELECT relname::text || ' | ' || relrowsecurity::text || ' | ' || relforcerowsecurity::text AS linea
      FROM pg_class
     WHERE oid IN (
             'public.suppliers'::regclass,
             'public.supplier_catalog_lines'::regclass,
             'public.presentations'::regclass,
             'public.companies'::regclass
           )
     ORDER BY relname`;
  const politicas = await db.$queryRaw<{ linea: string }[]>`
    SELECT tablename::text || ' | ' || policyname::text AS linea
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('suppliers', 'supplier_catalog_lines', 'presentations', 'companies')
     ORDER BY tablename, policyname`;
  return {
    suppliers: await retratoDeTabla(db, 'suppliers'),
    lineas: await retratoDeTabla(db, 'supplier_catalog_lines'),
    presentaciones: presentaciones.map((fila) => fila.linea),
    rls: rls.map((fila) => fila.linea),
    politicas: politicas.map((fila) => fila.linea),
  };
}

async function ejecutarDown(
  tx: Prisma.TransactionClient,
  sentencias: readonly string[],
): Promise<void> {
  for (const sentencia of sentencias) {
    await tx.$executeRawUnsafe(sentencia);
  }
}

function nombresDeIndice(retrato: Retrato): string[] {
  return retrato.indices.map((linea) => linea.split(' | ')[0] as string);
}

function nombresDeRestriccion(retrato: Retrato): string[] {
  return retrato.restricciones.map((linea) => linea.split(' | ')[0] as string);
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const name = `Empresa proveedores ${marcador}`;
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  });
  return company.id;
}

async function quimicloudId(tx: Prisma.TransactionClient): Promise<string> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS id FROM "companies" WHERE "name_normalized" = 'quimicloud'`;
  expect(filas, 'la base de la corrida debe traer sembrada la empresa «QuimiCloud»').toHaveLength(
    1,
  );
  return (filas[0] as { id: string }).id;
}

/** `company_id` nulo: vale para cualquier empresa, y es lo que `presentations` admite siempre. */
async function unidadDeSistema(tx: Prisma.TransactionClient): Promise<string> {
  const unit = await tx.unit.findFirstOrThrow({
    where: { companyId: null },
    select: { id: true },
  });
  return unit.id;
}

async function crearPresentacion(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<string> {
  const marcador = token();
  const presentation = await tx.presentation.create({
    data: {
      name: `Bidon ${marcador}`,
      nameNormalized: `bidon${marcador}`,
      unitId: await unidadDeSistema(tx),
      companyId,
    },
    select: { id: true },
  });
  return presentation.id;
}

/** `nameNormalized` explicito y literal, nunca derivado con un normalizador: lo que se prueba es
 *  el indice de la base, y un fallo del algoritmo de normalizacion podria dejar esto en verde. */
async function crearProveedor(
  tx: Prisma.TransactionClient,
  companyId: string,
  nameNormalized: string,
  deletedAt: Date | null = null,
): Promise<string> {
  const supplier = await tx.supplier.create({
    data: {
      name: `Proveedor ${nameNormalized}`,
      nameNormalized,
      phone: '+57 300 000 0000',
      companyId,
      deletedAt,
    },
    select: { id: true },
  });
  return supplier.id;
}

async function crearLinea(
  tx: Prisma.TransactionClient,
  companyId: string,
  supplierId: string,
  presentationId: string,
): Promise<string> {
  const marcador = token();
  const line = await tx.supplierCatalogLine.create({
    data: {
      companyId,
      supplierId,
      presentationId,
      name: `Linea ${marcador}`,
      nameNormalized: `linea${marcador}`,
      cost: new Prisma.Decimal('10.0000'),
    },
    select: { id: true },
  });
  return line.id;
}

/** `INSERT` crudo de linea: el unico camino que propaga el SQLSTATE y el nombre de la
 *  restriccion sin que la API tipada los traduzca. */
async function insertarLineaCruda(
  tx: Prisma.TransactionClient,
  companyId: string | null,
  supplierId: string,
  presentationId: string,
  marcador: string,
): Promise<number> {
  return tx.$executeRaw`
    INSERT INTO "supplier_catalog_lines"
      ("company_id", "supplier_id", "name", "name_normalized", "presentation_id", "cost", "updated_at")
    VALUES (
      CAST(${companyId} AS uuid),
      CAST(${supplierId} AS uuid),
      ${`Linea ${marcador}`},
      ${`linea${marcador}`},
      CAST(${presentationId} AS uuid),
      CAST('10.0000' AS numeric),
      CURRENT_TIMESTAMP)`;
}

/** Nombres de los indices UNICOS de `suppliers` cuya clave es exactamente `columnas`, en orden. */
async function indicesUnicosDeSuppliersSobre(
  tx: Prisma.TransactionClient,
  columnas: readonly string[],
): Promise<string[]> {
  const filas = await tx.$queryRaw<{ nombre: string }[]>`
    SELECT i.relname AS nombre
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'public.suppliers'::regclass
       AND x.indisunique
       AND ARRAY(
             SELECT a.attname::text
               FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, pos)
               JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
              ORDER BY k.pos
           ) = ${columnas}::text[]`;
  return filas.map((f) => f.nombre);
}

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// R1, R2 — la empresa es obligatoria en las DOS tablas y tiene que existir
// ---------------------------------------------------------------------------

describe('R1 — todo proveedor lleva una empresa que existe', () => {
  it('R1: rechaza con 23502 un proveedor SIN empresa y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "suppliers" ("name", "name_normalized", "phone", "updated_at")
            VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, '+57 300 000 0000', CURRENT_TIMESTAMP)`,
        'proveedor sin empresa',
      );
      expect(rechazo.sqlState).toBe(NOT_NULL_VIOLATION);
      expect(
        await tx.supplier.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0);
    });
  });

  it('R1: rechaza con 23503 un proveedor con una empresa INEXISTENTE, nombrando su FK, y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const inventada = randomUUID();
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "suppliers" ("name", "name_normalized", "phone", "company_id", "updated_at")
            VALUES (${`Empresa inventada ${marcador}`}, ${`inventada${marcador}`}, '+57 300 000 0000', CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'proveedor con una empresa inexistente',
      );
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazo.texto).toContain('suppliers_company_id_fkey');
      expect(await tx.supplier.count({ where: { companyId: inventada } })).toBe(0);
    });
  });
});

describe('R2 — toda linea de catalogo lleva su propia empresa, y tiene que existir', () => {
  it('R2: rechaza con 23502 una linea SIN empresa y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const quimicloud = await quimicloudId(tx);
      const supplierId = await crearProveedor(tx, quimicloud, `conempresa${marcador}`);
      const presentationId = await crearPresentacion(tx, quimicloud);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLineaCruda(tx, null, supplierId, presentationId, marcador),
        'linea sin empresa',
      );
      expect(rechazo.sqlState).toBe(NOT_NULL_VIOLATION);
      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(0);
    });
  });

  it('R2: rechaza con 23503 una linea con una empresa INEXISTENTE y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const quimicloud = await quimicloudId(tx);
      const supplierId = await crearProveedor(tx, quimicloud, `conempresa${marcador}`);
      const presentationId = await crearPresentacion(tx, quimicloud);
      const inventada = randomUUID();

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLineaCruda(tx, inventada, supplierId, presentationId, marcador),
        'linea con una empresa inexistente',
      );
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION);

      // Una empresa que no existe incumple a la vez la FK simple a `companies` y las DOS
      // compuestas -el proveedor y la presentacion son de otra empresa, por definicion-, y cual
      // de los tres disparadores de integridad referencial salta primero lo decide el orden
      // interno del catalogo, no este test. Lo que si es exacto es el conjunto: el rechazo viene
      // de una de las tres restricciones de empresa de esta tabla y de ninguna otra.
      const CANDIDATAS = [
        'supplier_catalog_lines_company_id_fkey',
        'supplier_catalog_lines_company_id_supplier_id_fkey',
        'supplier_catalog_lines_company_id_presentation_id_fkey',
      ];
      expect(CANDIDATAS.filter((nombre) => rechazo.texto.includes(nombre)).length).toBeGreaterThan(
        0,
      );
      expect(await tx.supplierCatalogLine.count({ where: { companyId: inventada } })).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R4 — la FK compuesta hacia el proveedor: ningun camino deja discrepar las dos empresas
// ---------------------------------------------------------------------------

describe('R4 — la empresa de la linea no puede contradecir la de su proveedor', () => {
  it('R4: el INSERT de una linea con empresa distinta de la de su proveedor se rechaza, nombrando la FK compuesta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, `a${marcador}`);
      const empresaB = await crearEmpresa(tx, `b${marcador}`);
      const supplierDeA = await crearProveedor(tx, empresaA, `dea${marcador}`);
      // La presentacion es de B, como la linea: asi la UNICA restriccion incumplida es la del
      // proveedor, y el nombre que aparece en el rechazo es exacto y no ambiguo.
      const presentationDeB = await crearPresentacion(tx, empresaB);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLineaCruda(tx, empresaB, supplierDeA, presentationDeB, marcador),
        'linea de la empresa B colgada de un proveedor de la empresa A',
      );

      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazo.texto).toContain('supplier_catalog_lines_company_id_supplier_id_fkey');
      expect(await tx.supplierCatalogLine.count({ where: { supplierId: supplierDeA } })).toBe(0);
    });
  });

  it('R4: tampoco hay camino por UPDATE — ni cambiando la empresa de la linea ni cambiando su proveedor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, `a${marcador}`);
      const empresaB = await crearEmpresa(tx, `b${marcador}`);
      const supplierDeA = await crearProveedor(tx, empresaA, `dea${marcador}`);
      const supplierDeB = await crearProveedor(tx, empresaB, `deb${marcador}`);
      const presentationDeA = await crearPresentacion(tx, empresaA);
      const lineaDeA = await crearLinea(tx, empresaA, supplierDeA, presentationDeA);

      const porEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            UPDATE "supplier_catalog_lines" SET "company_id" = CAST(${empresaB} AS uuid)
             WHERE "id" = CAST(${lineaDeA} AS uuid)`,
        'UPDATE de la empresa de la linea a otra distinta de la de su proveedor',
      );
      expect(porEmpresa.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(porEmpresa.texto).toContain('supplier_catalog_lines_company_id_supplier_id_fkey');

      const porProveedor = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            UPDATE "supplier_catalog_lines" SET "supplier_id" = CAST(${supplierDeB} AS uuid)
             WHERE "id" = CAST(${lineaDeA} AS uuid)`,
        'UPDATE del proveedor de la linea a uno de otra empresa',
      );
      expect(porProveedor.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(porProveedor.texto).toContain('supplier_catalog_lines_company_id_supplier_id_fkey');

      // La fila sigue como estaba: ninguno de los dos caminos la movio a medias.
      const fila = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineaDeA },
        select: { companyId: true, supplierId: true },
      });
      expect(fila).toEqual({ companyId: empresaA, supplierId: supplierDeA });
    });
  });
});

// ---------------------------------------------------------------------------
// R5 — la FK compuesta hacia la presentacion: la ajena se rechaza, la propia se acepta
// ---------------------------------------------------------------------------

describe('R5 — una linea solo puede apuntar a una presentacion de su propia empresa', () => {
  it('R5: la presentacion de OTRA empresa se rechaza, nombrando la otra FK compuesta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, `a${marcador}`);
      const empresaB = await crearEmpresa(tx, `b${marcador}`);
      const supplierDeA = await crearProveedor(tx, empresaA, `dea${marcador}`);
      const presentationDeB = await crearPresentacion(tx, empresaB);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLineaCruda(tx, empresaA, supplierDeA, presentationDeB, marcador),
        'linea de A apuntando a una presentacion de B',
      );

      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazo.texto).toContain('supplier_catalog_lines_company_id_presentation_id_fkey');
      // Y no se pregunto nada a `inventario`: la presentacion ajena ni se nombra ni se lee.
      expect(await tx.supplierCatalogLine.count({ where: { supplierId: supplierDeA } })).toBe(0);
    });
  });

  it('R5: la presentacion de la PROPIA empresa se acepta — control positivo del caso anterior', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, `a${marcador}`);
      const supplierDeA = await crearProveedor(tx, empresaA, `dea${marcador}`);
      const presentationDeA = await crearPresentacion(tx, empresaA);

      const escritas = await insertarLineaCruda(
        tx,
        empresaA,
        supplierDeA,
        presentationDeA,
        marcador,
      );
      expect(escritas).toBe(1);

      const fila = await tx.supplierCatalogLine.findFirstOrThrow({
        where: { supplierId: supplierDeA },
        select: { companyId: true, presentationId: true },
      });
      expect(fila).toEqual({ companyId: empresaA, presentationId: presentationDeA });
    });
  });
});

// ---------------------------------------------------------------------------
// R14 — el nombre de proveedor es unico DENTRO de la empresa
// ---------------------------------------------------------------------------

describe('R14 — el nombre normalizado es unico por empresa, sobre proveedores VIVOS', () => {
  it('R14: ACEPTA el mismo nombre normalizado en dos empresas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, `a${marcador}`);
      const empresaB = await crearEmpresa(tx, `b${marcador}`);
      const compartido = `quimicosdelpacifico${marcador}`;

      const deA = await crearProveedor(tx, empresaA, compartido);
      const deB = await crearProveedor(tx, empresaB, compartido);

      const filas = await tx.supplier.findMany({
        where: { nameNormalized: compartido },
        select: { id: true, companyId: true },
      });
      expect(filas).toHaveLength(2);
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]));
      expect(new Set([deA, deB]).size).toBe(2);
    });
  });

  it('R14: RECHAZA con 23505 el mismo nombre normalizado dentro de la MISMA empresa, contra el indice compuesto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, marcador);
      const compartido = `quimicosdelpacifico${marcador}`;
      const primero = await crearProveedor(tx, empresaA, compartido);

      // Nombre original distinto y misma clave normalizada: choca el indice unico, no una
      // comprobacion previa de la aplicacion.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "suppliers" ("name", "name_normalized", "phone", "company_id", "updated_at")
            VALUES (${`QUIMICOS ${marcador}`}, ${compartido}, '+57 300 000 0000', CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segundo proveedor con el mismo nombre normalizado en la misma empresa',
      );
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION);

      // El unico GLOBAL de QC-42 ya no existe: el que muerde es exactamente el compuesto por
      // empresa, y ningun otro.
      expect(await indicesUnicosDeSuppliersSobre(tx, ['company_id', 'name_normalized'])).toEqual([
        'suppliers_company_name_unique',
      ]);
      expect(await indicesUnicosDeSuppliersSobre(tx, ['name_normalized'])).toEqual([]);

      const filas = await tx.supplier.findMany({
        where: { nameNormalized: compartido },
        select: { id: true },
      });
      expect(filas).toEqual([{ id: primero }]);
    });
  });
});

// ---------------------------------------------------------------------------
// R15, angulo 3 — SOLO comportamiento: dar de baja libera el nombre
// ---------------------------------------------------------------------------

describe('R15 (angulo 3) — el borrado logico LIBERA el nombre para su empresa', () => {
  it('R15: con el proveedor dado de baja, su nombre vuelve a poder darse de alta en la MISMA empresa', async () => {
    // Este caso no lee `pg_indexes` ni el texto de la migracion a proposito: es el angulo de
    // COMPORTAMIENTO, y tiene que poder ponerse rojo el solo si el indice dejara de ser parcial.
    // Los otros dos angulos se afirman en otros archivos, y apoyarse aqui en cualquiera de ellos
    // los convertiria en uno.
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, marcador);
      const compartido = `insumosdelnorte${marcador}`;
      const original = await crearProveedor(tx, empresaA, compartido);

      // Mientras vive, el nombre esta tomado en su empresa.
      const mientrasVive = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "suppliers" ("name", "name_normalized", "phone", "company_id", "updated_at")
            VALUES (${`Otro ${compartido}`}, ${compartido}, '+57 300 000 0000', CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segundo proveedor con el nombre de uno que sigue vivo',
      );
      expect(mientrasVive.sqlState).toBe(UNIQUE_VIOLATION);

      // Baja logica: sale del alcance del indice PARCIAL.
      await tx.supplier.update({ where: { id: original }, data: { deletedAt: new Date() } });

      // Con el original dado de baja, el mismo nombre en la MISMA empresa se acepta. Si el
      // `WHERE` del indice se perdiera, esta linea seria la que fallaria, y en silencio: un
      // 23505 identico al de arriba, sin nada que distinguiera «nombre tomado por un vivo» de
      // «nombre tomado por uno dado de baja».
      const nuevo = await crearProveedor(tx, empresaA, compartido);
      expect(nuevo).not.toBe(original);

      // El dado de baja sigue existiendo tal cual, con su nombre y con su empresa.
      const dadoDeBaja = await tx.supplier.findUniqueOrThrow({
        where: { id: original },
        select: { nameNormalized: true, deletedAt: true, companyId: true },
      });
      expect(dadoDeBaja).toEqual({
        nameNormalized: compartido,
        deletedAt: expect.any(Date) as Date,
        companyId: empresaA,
      });

      const vivosConEseNombre = await tx.supplier.findMany({
        where: { companyId: empresaA, nameNormalized: compartido, deletedAt: null },
        select: { id: true },
      });
      expect(vivosConEseNombre).toEqual([{ id: nuevo }]);
    });
  });
});

// ---------------------------------------------------------------------------
// R3 — la linea sigue cayendo con el borrado FISICO de su proveedor
// ---------------------------------------------------------------------------

describe('R3 — las claves candidatas no cambian lo que ya hacia el borrado fisico', () => {
  it('R3: al borrar FISICAMENTE el proveedor, sus lineas caen con el (ON DELETE CASCADE)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const empresaA = await crearEmpresa(tx, marcador);
      const supplierId = await crearProveedor(tx, empresaA, `conlineas${marcador}`);
      const presentationId = await crearPresentacion(tx, empresaA);
      const lineaId = await crearLinea(tx, empresaA, supplierId, presentationId);

      // Las DOS claves foraneas hacia el proveedor -la simple de siempre y la compuesta nueva-
      // son `ON DELETE CASCADE`: la compuesta no convierte el borrado en un `RESTRICT`.
      await tx.supplier.delete({ where: { id: supplierId } });

      expect(await tx.supplierCatalogLine.count({ where: { id: lineaId } })).toBe(0);
      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(0);
      // La presentacion no se toca: su FK es `RESTRICT` y la linea desaparecio por el otro lado.
      expect(await tx.presentation.count({ where: { id: presentationId } })).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// R7, R8 — los dos backfills del UP
// ---------------------------------------------------------------------------

describe('R7, R8 — los dos backfills asignan TODAS las filas preexistentes, sin perder ninguna', () => {
  it('R7, R8: el backfill de proveedores rellena vivos y dados de baja, y ningun recuento cambia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();

      // Estado previo a la migracion, DENTRO de la transaccion: en Postgres el DDL es
      // transaccional, asi que el ROLLBACK lo deshace.
      await tx.$executeRawUnsafe(`ALTER TABLE "suppliers" ALTER COLUMN "company_id" DROP NOT NULL`);

      const vivo = randomUUID();
      const dadoDeBaja = randomUUID();

      // El borrado logico sigue siendo fila: un backfill que lo saltara impediria el
      // `SET NOT NULL` posterior.
      await tx.$executeRawUnsafe(
        `INSERT INTO "suppliers" ("id","name","name_normalized","phone","updated_at")
         VALUES ($1::uuid, $2, $3, '+57 300 000 0000', CURRENT_TIMESTAMP)`,
        vivo,
        `Vivo ${marcador}`,
        `vivo${marcador}`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "suppliers" ("id","name","name_normalized","phone","deleted_at","updated_at")
         VALUES ($1::uuid, $2, $3, '+57 300 000 0000', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        dadoDeBaja,
        `De baja ${marcador}`,
        `debaja${marcador}`,
      );

      const antes = {
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        presentaciones: await tx.presentation.count(),
        empresas: await tx.company.count(),
      };

      await tx.$executeRawUnsafe(BACKFILL_PROVEEDORES);

      const quimicloud = await quimicloudId(tx);
      const filas = await tx.supplier.findMany({
        where: { id: { in: [vivo, dadoDeBaja] } },
        select: { id: true, companyId: true, deletedAt: true },
      });
      expect(filas).toHaveLength(2);
      expect(filas.every((fila) => fila.companyId === quimicloud)).toBe(true);
      expect(filas.filter((fila) => fila.deletedAt !== null)).toHaveLength(1);

      // R8: ni una fila borrada ni una creada, en ninguna de las cuatro tablas.
      expect({
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        presentaciones: await tx.presentation.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes);

      // Es la condicion que necesita el `SET NOT NULL` que sigue en la migracion real.
      const nulos = await tx.$queryRaw<{ pendientes: bigint }[]>`
        SELECT count(*) AS pendientes FROM "suppliers" WHERE "company_id" IS NULL`;
      expect(Number(nulos[0]?.pendientes ?? -1)).toBe(0);
    });
  });

  it('R7, R8: el backfill de lineas toma la empresa DE SU PROVEEDOR, no la resuelve por nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      await tx.$executeRawUnsafe(
        `ALTER TABLE "supplier_catalog_lines" ALTER COLUMN "company_id" DROP NOT NULL`,
      );

      // El proveedor es de una empresa que NO es «QuimiCloud»: si el backfill de lineas
      // repitiera la resolucion por nombre en vez de derivarla del proveedor, la linea quedaria
      // con una empresa distinta de la suya y la FK compuesta lo rechazaria en el acto.
      const empresaA = await crearEmpresa(tx, marcador);
      const supplierId = await crearProveedor(tx, empresaA, `conlineas${marcador}`);
      const presentationId = await crearPresentacion(tx, empresaA);

      const lineaId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO "supplier_catalog_lines"
           ("id","supplier_id","name","name_normalized","presentation_id","cost","updated_at")
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 10.0000, CURRENT_TIMESTAMP)`,
        lineaId,
        supplierId,
        `Linea ${marcador}`,
        `linea${marcador}`,
        presentationId,
      );

      const antes = {
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        presentaciones: await tx.presentation.count(),
        empresas: await tx.company.count(),
      };

      await tx.$executeRawUnsafe(BACKFILL_LINEAS);

      const fila = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineaId },
        select: { companyId: true, supplierId: true },
      });
      expect(fila).toEqual({ companyId: empresaA, supplierId });

      expect({
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        presentaciones: await tx.presentation.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes);

      const nulos = await tx.$queryRaw<{ pendientes: bigint }[]>`
        SELECT count(*) AS pendientes FROM "supplier_catalog_lines" WHERE "company_id" IS NULL`;
      expect(Number(nulos[0]?.pendientes ?? -1)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// R11 — la reversion aborta por CADA una de sus causas, y ninguna es un placebo
// ---------------------------------------------------------------------------

describe('R11 — el DOWN aborta la reversion entera ante dato que no puede tirar', () => {
  it('R11 causa (a): sin poder identificar la empresa del UP, la guardia 1 aborta', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      await crearEmpresa(tx, marcador);
      const quimicloud = await quimicloudId(tx);

      // Se renombra la empresa del UP: ya no hay ninguna con ese nombre normalizado y hay mas de
      // una empresa en la tabla, que es exactamente el caso que la guardia 1 no puede resolver.
      await tx.$executeRaw`
        UPDATE "companies" SET "name_normalized" = ${`renombrada${marcador}`}
         WHERE "id" = CAST(${quimicloud} AS uuid)`;

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_DEL_DOWN),
        'reversion sin poder identificar la empresa que escribio el UP',
      );
      expect(rechazo.texto).toContain('suppliers_company_scope down');
      expect(rechazo.texto).toContain('no se pudo identificar la empresa que escribio el UP');
      // Ni la guardia 2 ni la 3: si apareciera alguna, estaria abortando por otro motivo.
      expect(rechazo.texto).not.toContain('pertenecen a una empresa distinta');
      expect(rechazo.texto).not.toContain('compartido(s) por proveedores VIVOS');
    });
  });

  it('R11 causa (a) no es un placebo: con la empresa identificable y sin mas dato, el mismo bloque NO aborta', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Mismo bloque, mismos datos de la base, sin renombrar nada: si tambien abortara aqui, el
      // caso de arriba no probaria que la causa fuera la guardia 1.
      await expect(tx.$executeRawUnsafe(GUARDIA_DEL_DOWN)).resolves.not.toThrow();
    });
  });

  it('R11 causa (b): un proveedor de otra empresa hace abortar la guardia 2, y no toca nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const quimicloud = await quimicloudId(tx);
      const ajena = await crearEmpresa(tx, marcador);
      const proveedorAjeno = await crearProveedor(tx, ajena, `ajeno${marcador}`);
      const antes = {
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        empresas: await tx.company.count(),
      };

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_DEL_DOWN),
        'reversion con un proveedor de otra empresa',
      );
      expect(rechazo.texto).toContain('suppliers_company_scope down');
      expect(rechazo.texto).toContain('proveedor(es) que pertenecen a una empresa distinta');
      expect(rechazo.texto).not.toContain('compartido(s) por proveedores VIVOS');

      expect({
        proveedores: await tx.supplier.count(),
        lineas: await tx.supplierCatalogLine.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes);
      const fila = await tx.supplier.findUniqueOrThrow({
        where: { id: proveedorAjeno },
        select: { companyId: true },
      });
      expect(fila.companyId).toBe(ajena);
      // Sigue habiendo exactamente una «QuimiCloud»: la guardia no toco el catalogo de empresas.
      expect(await quimicloudId(tx)).toBe(quimicloud);
    });
  });

  it('R11 causa (c): una linea de otra empresa hace abortar la guardia 2, aislada de su mitad de proveedores', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const ajena = await crearEmpresa(tx, marcador);
      const proveedorAjeno = await crearProveedor(tx, ajena, `ajeno${marcador}`);
      const presentacionAjena = await crearPresentacion(tx, ajena);
      const lineaAjena = await crearLinea(tx, ajena, proveedorAjeno, presentacionAjena);

      // La mitad de proveedores de la guardia 2 abortaria aqui igual -la linea ajena solo puede
      // colgar de un proveedor ajeno, lo impone la FK compuesta-, pero por SU motivo, y taparia
      // el de las lineas. Se desactiva en memoria para afirmar el mensaje que les pertenece.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(SIN_GUARDIA_DE_PROVEEDORES),
        'reversion con una linea de otra empresa, con la mitad de proveedores desactivada',
      );
      expect(rechazo.texto).toContain('suppliers_company_scope down');
      expect(rechazo.texto).toContain('linea(s) de catalogo que pertenecen a una empresa distinta');
      expect(rechazo.texto).not.toContain('proveedor(es) que pertenecen a una empresa distinta');

      const fila = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineaAjena },
        select: { companyId: true },
      });
      expect(fila.companyId).toBe(ajena);
    });
  });

  it('R11 causa (d): dos proveedores vivos de empresas distintas con el mismo nombre hacen abortar la guardia 3, aislada de la 2', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const quimicloud = await quimicloudId(tx);
      const ajena = await crearEmpresa(tx, marcador);
      const compartido = `quimicosdelpacifico${marcador}`;
      const deQuimicloud = await crearProveedor(tx, quimicloud, compartido);
      const deAjena = await crearProveedor(tx, ajena, compartido);

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(SIN_GUARDIA_2),
        'reversion con dos proveedores vivos de empresas distintas y el mismo nombre, guardia 2 desactivada',
      );
      expect(rechazo.texto).toContain('suppliers_company_scope down');
      expect(rechazo.texto).toContain('compartido(s) por proveedores VIVOS de mas de una empresa');
      expect(rechazo.texto).not.toContain('pertenecen a una empresa distinta');

      const filas = await tx.supplier.findMany({
        where: { id: { in: [deQuimicloud, deAjena] } },
        select: { id: true, nameNormalized: true },
      });
      expect(filas).toHaveLength(2);
      expect(filas.every((fila) => fila.nameNormalized === compartido)).toBe(true);
    });
  });

  it('R11: sin las guardias 2 Y 3 el mismo dato pasa — los abortos de arriba no son placebos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const quimicloud = await quimicloudId(tx);
      const ajena = await crearEmpresa(tx, marcador);
      const compartido = `quimicosdelpacifico${marcador}`;
      await crearProveedor(tx, quimicloud, compartido);
      const proveedorAjeno = await crearProveedor(tx, ajena, compartido);
      const presentacionAjena = await crearPresentacion(tx, ajena);
      await crearLinea(tx, ajena, proveedorAjeno, presentacionAjena);

      // Exactamente los mismos datos que los casos (b), (c) y (d), con las dos guardias de dato
      // desactivadas: si esto abortara igual, seria la guardia 1 la que estaria abortando alli y
      // ninguno de esos casos probaria lo que dice probar.
      await expect(tx.$executeRawUnsafe(SIN_GUARDIAS_2_Y_3)).resolves.not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// R10 — el DOWN ejecutado ENTERO deja el esquema exactamente como estaba
// ---------------------------------------------------------------------------

describe('R10 — ejecutar el down.sql entero devuelve el esquema al estado anterior al UP', () => {
  it('R10: los dos retratos de despues son los de antes sin las columnas, con el unico GLOBAL y PARCIAL restaurado y la RLS forzada', async () => {
    const capturado: { antes?: Fotografia; despues?: Fotografia } = {};

    await inRolledBackTransaction(async (tx) => {
      capturado.antes = await fotografiaDeEsquema(tx);
      await ejecutarDown(tx, SENTENCIAS_DEL_DOWN);
      capturado.despues = await fotografiaDeEsquema(tx);
    });

    const antes = capturado.antes;
    const despues = capturado.despues;
    expect(antes, 'no se capturo el retrato de antes').toBeDefined();
    expect(despues, 'no se capturo el retrato de despues').toBeDefined();
    if (antes === undefined || despues === undefined) return;

    // Punto de partida: el esquema de la corrida es el de DESPUES del UP. Si no lo fuera, todo
    // lo de abajo compararia contra otra cosa.
    expect(antes.suppliers.columnas.filter((l) => l.startsWith('company_id | '))).toHaveLength(1);
    expect(antes.lineas.columnas.filter((l) => l.startsWith('company_id | '))).toHaveLength(1);
    expect(nombresDeIndice(antes.suppliers)).toContain('suppliers_company_name_unique');
    expect(nombresDeIndice(antes.suppliers)).not.toContain('suppliers_name_unique');

    // Las dos columnas se van, y NINGUNA otra se mueve ni cambia de tipo o de nulabilidad.
    for (const tabla of ['suppliers', 'lineas'] as const) {
      expect(despues[tabla].columnas.filter((l) => l.startsWith('company_id | '))).toHaveLength(0);
      expect(despues[tabla].columnas).toEqual(
        antes[tabla].columnas.filter((l) => !l.startsWith('company_id | ')),
      );
    }

    // El unico GLOBAL vuelve, y vuelve PARCIAL: sin el `WHERE`, el nombre de un proveedor dado
    // de baja quedaria ocupado para siempre y el esquema NO seria el que habia antes del UP.
    const global = despues.suppliers.indices.find((l) => l.startsWith('suppliers_name_unique | '));
    expect(global, 'el DOWN no restauro suppliers_name_unique').toBeDefined();
    expect(global).toContain('CREATE UNIQUE INDEX');
    expect(global).toContain('(name_normalized)');
    expect(global).toMatch(/WHERE \(deleted_at IS NULL\)/u);
    expect(nombresDeIndice(despues.suppliers)).not.toContain('suppliers_company_name_unique');
    expect(nombresDeIndice(despues.suppliers)).not.toContain('suppliers_company_id_id_key');
    expect(nombresDeIndice(despues.lineas)).not.toContain(
      'supplier_catalog_lines_company_id_supplier_id_idx',
    );

    // Y el resto de indices de las dos tablas queda intacto, definicion a definicion.
    expect(despues.suppliers.indices.filter((l) => !l.startsWith('suppliers_name_unique | '))).toEqual(
      antes.suppliers.indices.filter(
        (l) =>
          !l.startsWith('suppliers_company_name_unique | ') &&
          !l.startsWith('suppliers_company_id_id_key | '),
      ),
    );
    expect(despues.lineas.indices).toEqual(
      antes.lineas.indices.filter(
        (l) => !l.startsWith('supplier_catalog_lines_company_id_supplier_id_idx | '),
      ),
    );

    // Las cuatro restricciones que anadio el UP se van, y ninguna otra de las dos tablas se toca.
    expect(despues.suppliers.restricciones).toEqual(
      antes.suppliers.restricciones.filter(
        (l) =>
          !l.startsWith('suppliers_company_id_fkey | ') &&
          !l.startsWith('suppliers_company_id_id_key | '),
      ),
    );
    expect(despues.lineas.restricciones).toEqual(
      antes.lineas.restricciones.filter(
        (l) =>
          !l.startsWith('supplier_catalog_lines_company_id_fkey | ') &&
          !l.startsWith('supplier_catalog_lines_company_id_supplier_id_fkey | ') &&
          !l.startsWith('supplier_catalog_lines_company_id_presentation_id_fkey | '),
      ),
    );
    expect(despues.suppliers.restricciones.some((l) => l.includes('company'))).toBe(false);
    expect(despues.lineas.restricciones.some((l) => l.includes('company'))).toBe(false);

    // Y la clave candidata que el UP le puso a `presentations` -la unica cosa que esta ficha
    // toca de una tabla de otro modulo- tambien se va, sin llevarse ninguna otra por delante.
    expect(despues.presentaciones).toEqual(
      antes.presentaciones.filter((l) => !l.startsWith('presentations_company_id_id_key | ')),
    );

    // RLS activada Y forzada en las cuatro tablas que el DOWN desforzo, y sin ninguna policy.
    expect(despues.rls).toEqual([
      'companies | true | true',
      'presentations | true | true',
      'supplier_catalog_lines | true | true',
      'suppliers | true | true',
    ]);
    expect(despues.rls).toEqual(antes.rls);
    expect(despues.politicas).toEqual([]);
    expect(antes.politicas).toEqual([]);
  });

  it('R10: el ROLLBACK devuelve la base a su estado real — el DDL de Postgres es transaccional', async () => {
    const antesDeTodo = await fotografiaDeEsquema(prisma);

    await inRolledBackTransaction(async (tx) => {
      await ejecutarDown(tx, SENTENCIAS_DEL_DOWN);
      // Dentro de la transaccion el esquema SI cambio: si no, el ROLLBACK no estaria deshaciendo
      // nada y este caso pasaria con un DOWN que no hiciera absolutamente nada.
      const dentro = await fotografiaDeEsquema(tx);
      expect(dentro.suppliers.columnas).not.toEqual(antesDeTodo.suppliers.columnas);
    });

    expect(await fotografiaDeEsquema(prisma)).toEqual(antesDeTodo);
  });

  it('R10: sin la linea que restaura el unico global, el DOWN deja el esquema DISTINTO — la comparacion no es un placebo', async () => {
    const capturado: { despues?: Fotografia } = {};

    await inRolledBackTransaction(async (tx) => {
      await ejecutarDown(tx, SIN_RESTAURAR_EL_GLOBAL);
      capturado.despues = await fotografiaDeEsquema(tx);
    });

    const despues = capturado.despues;
    expect(despues, 'no se capturo el retrato de despues').toBeDefined();
    if (despues === undefined) return;

    // Exactamente la asercion que el caso de arriba da por buena, del reves: con el DOWN mutado
    // la tabla se queda SIN ninguna garantia de unicidad de nombre.
    expect(nombresDeIndice(despues.suppliers)).not.toContain('suppliers_name_unique');
    expect(nombresDeIndice(despues.suppliers)).not.toContain('suppliers_company_name_unique');
    expect(nombresDeRestriccion(despues.suppliers)).not.toContain('suppliers_company_id_id_key');
  });
});

// ---------------------------------------------------------------------------
// R34 — una empresa dada de baja conserva sus proveedores y sus lineas
// ---------------------------------------------------------------------------

describe('R34 — marcar una empresa como borrada no vacia ni altera sus proveedores ni sus lineas', () => {
  it('R34: la empresa dada de baja conserva su proveedor y su linea intactos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token();
      const companyId = await crearEmpresa(tx, marcador);
      const supplierId = await crearProveedor(tx, companyId, `proveedor${marcador}`);
      const presentationId = await crearPresentacion(tx, companyId);
      const lineaId = await crearLinea(tx, companyId, supplierId, presentationId);

      await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } });

      const proveedor = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { companyId: true, deletedAt: true },
      });
      expect(proveedor.companyId).toBe(companyId);
      expect(proveedor.deletedAt).toBeNull();

      const linea = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineaId },
        select: { companyId: true, supplierId: true, presentationId: true, deletedAt: true },
      });
      expect(linea).toEqual({
        companyId,
        supplierId,
        presentationId,
        deletedAt: null,
      });
      expect(await tx.supplierCatalogLine.count({ where: { supplierId } })).toBe(1);

      const empresa = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { deletedAt: true },
      });
      expect(empresa.deletedAt).not.toBeNull();
    });
  });
});
