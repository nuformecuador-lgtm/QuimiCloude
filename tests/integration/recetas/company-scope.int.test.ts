/**
 * QC-50 T22 — restricciones, unicidad, backfill y reversion de `20260916120000_recipes_company_scope`
 * contra Postgres real.
 *
 * AISLAMIENTO: `transaccion`. Cada caso corre en una transaccion interactiva que termina en
 * ROLLBACK, con `SAVEPOINT` para lo que se espera que falle. Molde: `inventario/company-scope.int.test.ts`
 * (QC-49) y `pedidos/company-scope.int.test.ts` (QC-60). En Postgres el DDL es transaccional: el
 * backfill y la guardia del `down.sql` se ejecutan dentro de esa misma transaccion y el ROLLBACK
 * los deshace, asi que nada de esto toca la base de desarrollo.
 *
 * RLS. `recipes`, `recipe_lines` y `companies` estan `ENABLE` + `FORCE ROW LEVEL SECURITY` y sin
 * ninguna policy. En esta corrida `DATABASE_URL`/`DIRECT_URL` conectan como superusuario (la
 * misma mina que documentan QC-49 y QC-60): un superusuario se salta la RLS siempre, `FORCE`
 * incluido, asi que ninguno de los casos de aqui prueba el filtrado de RLS -eso no es alcance de
 * esta ficha- y no hace falta ningun `NO FORCE` manual para leer o escribir directo.
 *
 * QUE SE EJECUTA DEL SQL REAL. `migration.sql` trae DOS bloques `DO $$`: el del backfill (R3, R4)
 * y el de la guardia de nombres repetidos antes de relevar el indice. Solo el PRIMERO -el
 * backfill- hace falta aqui; el segundo lo cubre el test de esquema
 * (`tests/unit/recetas/schema/recipes-company-scope-migration.test.ts`, T21). `down.sql` trae UN
 * solo bloque `DO $$` con sus TRES guardias en secuencia (empresa ambigua, fila de otra empresa,
 * nombre repetido entre empresas): se ejecuta leido del disco, nunca copiado a mano, para que un
 * cambio futuro en el archivo real se refleje aqui sin tocar este test. Y el `down.sql` se
 * ejecuta ademas ENTERO -troceado en sus sentencias, tambien del disco- para comparar el retrato
 * del esquema de antes con el de despues contra `pg_indexes` e `information_schema`, en vez de
 * afirmar sobre el texto del archivo.
 *
 * LA MINA DE R7: la guardia 2 (fila de otra empresa) y la guardia 3 (nombre repetido entre
 * empresas VIVAS) no son independientes en los datos: el `target_company_id` de la guardia es UNA
 * sola empresa, asi que dos recetas vivas de empresas DISTINTAS con el mismo nombre implican, por
 * construccion, que al menos una de esas dos filas tiene `company_id <> target_company_id` -y la
 * guardia 2 la atrapa ANTES de llegar a la 3, porque Postgres ejecuta el bloque en orden-. Para
 * afirmar el mensaje propio de la guardia 3 (causa b del enunciado) hay que aislarla desactivando
 * la guardia 2 con una mutacion en memoria del texto leido del disco -nunca del archivo en si-,
 * el mismo patron de falsabilidad que ya usa el test de esquema (T21) y que aqui, ademas, se
 * ejecuta de verdad contra la base para probar que la guardia 3 muerde por si sola y no es un
 * placebo que dependiera de la 2.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

/** No es un fallo: es como se fuerza el ROLLBACK de la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'

type Rechazo = { readonly sqlState: string; readonly texto: string }

/**
 * El texto junta mensaje y `meta` porque Prisma deja el mensaje de Postgres en uno u otro segun
 * la via; en el se busca la etiqueta del disparador o de la excepcion, que no se traduce.
 */
function rechazoDe(error: unknown): Rechazo {
  let sqlState = ''
  const partes: string[] = []
  if (error instanceof Error) partes.push(error.message)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    sqlState = error.code
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null) {
      partes.push(JSON.stringify(meta))
      if ('code' in meta) {
        const code: unknown = (meta as { code: unknown }).code
        if (typeof code === 'string') sqlState = code
      }
    }
  }
  if (partes.length === 0) partes.push(String(error))
  return { sqlState, texto: partes.join(' | ') }
}

/**
 * El SAVEPOINT deja la transaccion utilizable: un error de restriccion la aborta entera, y varios
 * casos consultan despues del rechazo.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<Rechazo> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return rechazoDe(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

/** Solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

// ---------------------------------------------------------------------------
// Los dos bloques `DO $$` leidos del disco
// ---------------------------------------------------------------------------

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsDir = join(repoRoot, 'db', 'migrations')
const scopeDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_recipes_company_scope'),
)
expect(scopeDirs, 'debe existir exactamente una migracion *_recipes_company_scope').toHaveLength(
  1,
)
const migrationDir = join(migrationsDir, scopeDirs[0] as string)

function leerSql(archivo: string): string {
  return readFileSync(join(migrationDir, archivo), 'utf8')
}

/** Todos los bloques `DO $$ ... $$;` de un archivo, en el orden en que aparecen. */
function allDoBlocks(archivo: string): string[] {
  const sql = leerSql(archivo)
  const matches = [...sql.matchAll(/DO\s+\$\$[\s\S]*?\$\$;/g)]
  if (matches.length === 0) throw new Error(`${archivo} no tiene ningun bloque DO $$`)
  return matches.map((match) => match[0])
}

/** `migration.sql` trae dos bloques `DO $$`: el primero es el backfill (R3, R4). El segundo -la
 *  guardia de nombres repetidos antes de relevar el indice- lo cubre el test de esquema (T21) y
 *  no hace falta aqui. */
const BACKFILL = allDoBlocks('migration.sql')[0] as string

/** `down.sql` trae UN solo bloque `DO $$`, con las tres guardias de R7 en secuencia. */
const GUARDIA_DEL_DOWN = allDoBlocks('down.sql')[0] as string

// Mutaciones en memoria del texto leido del disco -nunca del archivo-, para aislar la guardia 3
// (R7, causa b) de la 2, que la precede y la subsume en los datos (ver cabecera). Los patrones
// son los mismos que ya prueba `recipes-company-scope-migration.test.ts` (T21) sobre `downSource`
// completo; aqui se aplican sobre el bloque extraido y se EJECUTAN de verdad.
const GUARDIA_2_DESACTIVADA = GUARDIA_DEL_DOWN.replace(
  'FROM "recipes" WHERE "company_id" <> target_company_id;',
  'FROM "recipes" WHERE FALSE;',
)
expect(GUARDIA_2_DESACTIVADA, 'la mutacion de la guardia 2 no encontro su texto').not.toBe(
  GUARDIA_DEL_DOWN,
)

const GUARDIA_2_Y_3_DESACTIVADAS = GUARDIA_2_DESACTIVADA.replace(
  /SELECT count\(\*\), COALESCE\(sum\(repeated\.copies\), 0\)\s*\n\s*INTO duplicated_names, duplicated_rows\s*\n\s*FROM \(\s*\n\s*SELECT "name_normalized", count\(DISTINCT "company_id"\)[\s\S]*?HAVING count\(DISTINCT "company_id"\) > 1\s*\n\s*\) AS repeated;/,
  'duplicated_names := 0;\n  duplicated_rows := 0;',
)
expect(
  GUARDIA_2_Y_3_DESACTIVADAS,
  'la mutacion de la guardia 3 no encontro su texto',
).not.toBe(GUARDIA_2_DESACTIVADA)

// ---------------------------------------------------------------------------
// El `down.sql` ENTERO, troceado en sentencias para ejecutarlo del disco
// ---------------------------------------------------------------------------

/**
 * Trocea por los `;` de nivel superior. Los `;` que viven dentro de un bloque `$$ ... $$`, de
 * una cadena o de un comentario `--` no separan nada; los comentarios se descartan porque la
 * unica forma de que uno termine dentro de la sentencia siguiente seria tragarse su texto.
 */
function sentenciasSql(sql: string): string[] {
  const sentencias: string[] = []
  let actual = ''
  let enDolar = false
  let enComilla = false
  let enComentario = false
  let i = 0
  while (i < sql.length) {
    const caracter = sql[i] as string
    const pareja = sql.slice(i, i + 2)
    if (enComentario) {
      if (caracter === '\n') {
        enComentario = false
        actual += caracter
      }
      i += 1
    } else if (!enDolar && !enComilla && pareja === '--') {
      enComentario = true
      i += 2
    } else if (!enDolar && caracter === "'") {
      enComilla = !enComilla
      actual += caracter
      i += 1
    } else if (!enComilla && pareja === '$$') {
      enDolar = !enDolar
      actual += pareja
      i += 2
    } else if (!enDolar && !enComilla && caracter === ';') {
      sentencias.push(actual.trim())
      actual = ''
      i += 1
    } else {
      actual += caracter
      i += 1
    }
  }
  if (actual.trim() !== '') sentencias.push(actual.trim())
  return sentencias.filter((sentencia) => sentencia !== '')
}

const DOWN_SQL = leerSql('down.sql')
const SENTENCIAS_DEL_DOWN = sentenciasSql(DOWN_SQL)

// El troceador tambien puede mentir: si se comiera una sentencia, ejecutar el DOWN «entero»
// dejaria de significar nada y la comparacion de retratos pasaria por otro camino. Se afirma
// que el bloque de guardias viaja intacto en UNA sola pieza y que los cuatro pasos que este
// archivo comprueba estan cada uno en la suya.
expect(SENTENCIAS_DEL_DOWN.filter((s) => s.startsWith('DO $$'))).toHaveLength(1)
for (const esperada of [
  'DROP INDEX "recipes_company_name_unique"',
  'CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL',
  'ALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey"',
  'ALTER TABLE "recipes" DROP COLUMN "company_id"',
  'ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY',
]) {
  expect(SENTENCIAS_DEL_DOWN, `el troceador perdio: ${esperada}`).toContain(esperada)
}

/** Mutacion en memoria -nunca del archivo-: el DOWN deja de restaurar el unico global. */
const SIN_RESTAURAR_EL_GLOBAL = sentenciasSql(
  DOWN_SQL.replace(
    'CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;',
    '',
  ),
)
expect(
  SIN_RESTAURAR_EL_GLOBAL.length,
  'la mutacion del CREATE INDEX no encontro su texto',
).toBe(SENTENCIAS_DEL_DOWN.length - 1)

// ---------------------------------------------------------------------------
// Los dos retratos del esquema
// ---------------------------------------------------------------------------

type Retrato = {
  readonly columnas: readonly string[]
  readonly indices: readonly string[]
  readonly restricciones: readonly string[]
  readonly rls: readonly string[]
  readonly politicas: readonly string[]
}

type Lector = Pick<Prisma.TransactionClient, '$queryRaw'>

/**
 * Lo que el esquema dice de si mismo, leido de `information_schema` y del catalogo, nunca del
 * SQL del disco: es el unico oraculo que no comparte origen con lo que se esta probando.
 */
async function retratoDeEsquema(db: Lector): Promise<Retrato> {
  const columnas = await db.$queryRaw<{ linea: string }[]>`
    SELECT column_name::text || ' | ' || data_type::text || ' | ' || is_nullable::text AS linea
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'recipes'
     ORDER BY ordinal_position`
  const indices = await db.$queryRaw<{ linea: string }[]>`
    SELECT indexname::text || ' | ' || indexdef::text AS linea
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'recipes'
     ORDER BY indexname`
  const restricciones = await db.$queryRaw<{ linea: string }[]>`
    SELECT conname::text || ' | ' || contype::text AS linea
      FROM pg_constraint
     WHERE conrelid = 'public.recipes'::regclass
     ORDER BY conname`
  const rls = await db.$queryRaw<{ linea: string }[]>`
    SELECT relname::text || ' | ' || relrowsecurity::text || ' | ' || relforcerowsecurity::text AS linea
      FROM pg_class
     WHERE oid IN (
             'public.recipes'::regclass,
             'public.recipe_lines'::regclass,
             'public.companies'::regclass
           )
     ORDER BY relname`
  const politicas = await db.$queryRaw<{ linea: string }[]>`
    SELECT tablename::text || ' | ' || policyname::text AS linea
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('recipes', 'recipe_lines', 'companies')
     ORDER BY tablename, policyname`
  const lineas = (filas: { linea: string }[]): string[] => filas.map((fila) => fila.linea)
  return {
    columnas: lineas(columnas),
    indices: lineas(indices),
    restricciones: lineas(restricciones),
    rls: lineas(rls),
    politicas: lineas(politicas),
  }
}

async function ejecutarDown(
  tx: Prisma.TransactionClient,
  sentencias: readonly string[],
): Promise<void> {
  for (const sentencia of sentencias) {
    await tx.$executeRawUnsafe(sentencia)
  }
}

function nombresDeIndice(retrato: Retrato): string[] {
  return retrato.indices.map((linea) => linea.split(' | ')[0] as string)
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const name = `Empresa recetas ${marcador}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function quimicloudId(tx: Prisma.TransactionClient): Promise<string> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS id FROM "companies" WHERE "name_normalized" = 'quimicloud'`
  expect(filas, 'la base de la corrida debe traer sembrada la empresa «QuimiCloud»').toHaveLength(
    1,
  )
  return (filas[0] as { id: string }).id
}


async function crearProducto(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
): Promise<string> {
  const product = await tx.product.create({
    data: { name: `Producto ${marcador}`, nameNormalized: `producto${marcador}`, companyId },
    select: { id: true },
  })
  return product.id
}

/** `nameNormalized` explicito y literal, nunca derivado con un normalizador: lo que se prueba es
 *  el indice de la base, y un fallo del algoritmo de normalizacion podria dejar esto en verde. */
async function crearReceta(
  tx: Prisma.TransactionClient,
  companyId: string,
  nameNormalized: string,
): Promise<string> {
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${nameNormalized}`, nameNormalized, companyId },
    select: { id: true },
  })
  return recipe.id
}

async function crearLineaDeReceta(
  tx: Prisma.TransactionClient,
  recipeId: string,
  productId: string,
): Promise<string> {
  const line = await tx.recipeLine.create({
    data: { recipeId, productId, percentage: new Prisma.Decimal('100.00') },
    select: { id: true },
  })
  return line.id
}

/** Nombres de los indices UNICOS de `recipes` cuya clave es exactamente `columnas`, en orden. */
async function indicesUnicosDeRecipesSobre(
  tx: Prisma.TransactionClient,
  columnas: readonly string[],
): Promise<string[]> {
  const filas = await tx.$queryRaw<{ nombre: string }[]>`
    SELECT i.relname AS nombre
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'public.recipes'::regclass
       AND x.indisunique
       AND ARRAY(
             SELECT a.attname::text
               FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, pos)
               JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
              ORDER BY k.pos
           ) = ${columnas}::text[]`
  return filas.map((f) => f.nombre)
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// R1 — la empresa es obligatoria y tiene que existir
// ---------------------------------------------------------------------------

describe('R1 — toda receta lleva una empresa que existe', () => {
  it('rechaza con 23502 una receta SIN empresa y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "recipes" ("name", "name_normalized", "updated_at")
            VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, CURRENT_TIMESTAMP)`,
        'receta sin empresa',
      )
      expect(rechazo.sqlState).toBe(NOT_NULL_VIOLATION)
      expect(
        await tx.recipe.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0)
    })
  })

  it('rechaza con 23503 una receta con una empresa INEXISTENTE y no escribe la fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const inventada = randomUUID()
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "recipes" ("name", "name_normalized", "company_id", "updated_at")
            VALUES (${`Empresa inventada ${marcador}`}, ${`inventada${marcador}`}, CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'receta con una empresa inexistente',
      )
      expect(rechazo.sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(rechazo.texto).toContain('recipes_company_id_fkey')
      expect(await tx.recipe.count({ where: { companyId: inventada } })).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// R10 — el nombre es unico POR EMPRESA, y el borrado logico libera el nombre (el nucleo)
// ---------------------------------------------------------------------------

describe('R10 — el nombre normalizado es unico por empresa, sobre recetas VIVAS', () => {
  it('ACEPTA el mismo nombre normalizado en dos empresas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const compartido = `desengrasante${marcador}`

      const deA = await crearReceta(tx, empresaA, compartido)
      const deB = await crearReceta(tx, empresaB, compartido)

      const filas = await tx.recipe.findMany({
        where: { nameNormalized: compartido },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]))
      expect(new Set([deA, deB]).size).toBe(2)
    })
  })

  it('RECHAZA con 23505 el mismo nombre normalizado dentro de la MISMA empresa, contra el indice compuesto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, marcador)
      const compartido = `desengrasante${marcador}`
      const primera = await crearReceta(tx, empresaA, compartido)

      // Nombre original distinto y misma clave normalizada: choca el indice unico, no una
      // comprobacion previa de la aplicacion.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "recipes" ("name", "name_normalized", "company_id", "updated_at")
            VALUES (${`DESENGRASANTE ${marcador}`}, ${compartido}, CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda receta con el mismo nombre normalizado en la misma empresa',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)

      // El unico GLOBAL de QC-24 ya no existe: el que muerde es exactamente el compuesto por
      // empresa, y ningun otro.
      expect(
        await indicesUnicosDeRecipesSobre(tx, ['company_id', 'name_normalized']),
      ).toEqual(['recipes_company_name_unique'])

      const filas = await tx.recipe.findMany({
        where: { nameNormalized: compartido },
        select: { id: true },
      })
      expect(filas).toEqual([{ id: primera }])
    })
  })

  it('el BORRADO LOGICO libera el nombre para su empresa — la razon de ser del indice parcial', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, marcador)
      const compartido = `formuladepiso${marcador}`
      const original = await crearReceta(tx, empresaA, compartido)

      // Mientras esta viva, el nombre esta tomado en su empresa: choca el mismo indice del caso
      // anterior. Crudo, como alli: por la API tipada el codigo que llega es `P2002` de Prisma,
      // no el SQLSTATE de Postgres.
      const mientrasVive = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO "recipes" ("name", "name_normalized", "company_id", "updated_at")
            VALUES (${`Otra ${compartido}`}, ${compartido}, CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda receta con el nombre de una que sigue viva',
      )
      expect(mientrasVive.sqlState).toBe(UNIQUE_VIOLATION)

      // Baja logica: sale del alcance del indice PARCIAL (`WHERE "deleted_at" IS NULL`).
      await tx.recipe.update({ where: { id: original }, data: { deletedAt: new Date() } })

      // Con la original borrada, el mismo nombre en la MISMA empresa se acepta sin problema: si
      // el `WHERE` del indice se perdiera, esta linea seria la que fallaria, y en silencio -un
      // 23505 igual al del caso anterior, sin que nada distinga "nombre tomado por una viva" de
      // "nombre tomado por una borrada"-.
      const nueva = await crearReceta(tx, empresaA, compartido)
      expect(nueva).not.toBe(original)

      // La borrada sigue existiendo tal cual, con su nombre: nada la reescribio ni la borro de
      // verdad.
      const borrada = await tx.recipe.findUniqueOrThrow({
        where: { id: original },
        select: { nameNormalized: true, deletedAt: true, companyId: true },
      })
      expect(borrada).toEqual({
        nameNormalized: compartido,
        deletedAt: expect.any(Date) as Date,
        companyId: empresaA,
      })

      // Solo la nueva cuenta como viva con ese nombre, en esa empresa.
      const vivasConEseNombre = await tx.recipe.findMany({
        where: { companyId: empresaA, nameNormalized: compartido, deletedAt: null },
        select: { id: true },
      })
      expect(vivasConEseNombre).toEqual([{ id: nueva }])

      // Y el propio catalogo del motor confirma que el indice sigue siendo PARCIAL por
      // `deleted_at`: sin eso, ninguna de las dos aserciones de arriba probaria nada por si
      // sola -podrian coincidir por casualidad con un indice total roto de otra forma-.
      const definicion = await tx.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'public' AND indexname = 'recipes_company_name_unique'`
      expect(definicion).toHaveLength(1)
      expect(definicion[0]?.indexdef).toMatch(/WHERE \(deleted_at IS NULL\)/i)
    })
  })
})

// ---------------------------------------------------------------------------
// R2 — la linea cae con su receta, y no tiene empresa propia
// ---------------------------------------------------------------------------

describe('R2 — recipe_lines no gana columna de empresa, y cae con su receta', () => {
  it('recipe_lines no tiene ninguna columna company_id', async () => {
    await inRolledBackTransaction(async (tx) => {
      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'recipe_lines'`
      expect(columnas.map((columna) => columna.column_name)).not.toContain('company_id')
    })
  })

  it('al borrar la receta, sus lineas caen con ella (ON DELETE CASCADE)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId)
      const recipeId = await crearReceta(tx, companyId, `receta${marcador}`)
      const lineId = await crearLineaDeReceta(tx, recipeId, productId)

      await tx.recipe.delete({ where: { id: recipeId } })

      expect(await tx.recipeLine.count({ where: { id: lineId } })).toBe(0)
      expect(await tx.recipeLine.count({ where: { recipeId } })).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// R3, R4 — el backfill del UP
// ---------------------------------------------------------------------------

describe('R3, R4 — el backfill asigna TODAS las filas preexistentes a «QuimiCloud», sin perder ninguna', () => {
  it('rellena recetas vivas y borradas, y los recuentos de companies/recipes/recipe_lines no cambian', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()

      // Estado previo a la migracion, DENTRO de la transaccion: en Postgres el DDL es
      // transaccional, asi que el ROLLBACK lo deshace y la base de desarrollo no se toca.
      await tx.$executeRawUnsafe(`ALTER TABLE "recipes" ALTER COLUMN "company_id" DROP NOT NULL`)

      const vivo = randomUUID()
      const borrado = randomUUID()

      // El borrado logico sigue siendo fila: un backfill que lo saltara impediria el
      // `SET NOT NULL` posterior.
      await tx.$executeRawUnsafe(
        `INSERT INTO "recipes" ("id","name","name_normalized","updated_at")
         VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP)`,
        vivo,
        `Vivo ${marcador}`,
        `vivo${marcador}`,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "recipes" ("id","name","name_normalized","deleted_at","updated_at")
         VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        borrado,
        `Borrado ${marcador}`,
        `borrado${marcador}`,
      )

      const antes = {
        recetas: await tx.recipe.count(),
        lineas: await tx.recipeLine.count(),
        empresas: await tx.company.count(),
      }

      await tx.$executeRawUnsafe(BACKFILL)

      const quimicloud = await tx.company.findFirstOrThrow({
        where: { nameNormalized: 'quimicloud' },
        select: { id: true },
      })

      const recetas = await tx.recipe.findMany({
        where: { id: { in: [vivo, borrado] } },
        select: { id: true, companyId: true, deletedAt: true },
      })
      expect(recetas).toHaveLength(2)
      expect(recetas.every((fila) => fila.companyId === quimicloud.id)).toBe(true)
      expect(recetas.filter((fila) => fila.deletedAt !== null)).toHaveLength(1)

      // R4: ni una fila borrada ni una creada, en ninguna de las tres tablas.
      expect({
        recetas: await tx.recipe.count(),
        lineas: await tx.recipeLine.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes)

      // Es la condicion que necesita el `SET NOT NULL` que sigue en la migracion real.
      const nulos = await tx.$queryRaw<{ pendientes: bigint }[]>`
        SELECT count(*) AS pendientes FROM "recipes" WHERE "company_id" IS NULL`
      expect(Number(nulos[0]?.pendientes ?? -1)).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// R7 — la reversion aborta por cada una de sus dos causas de dato
// ---------------------------------------------------------------------------

describe('R7 — el DOWN aborta la reversion entera ante dato que no puede tirar', () => {
  it('causa (a): una receta de otra empresa hace abortar la guardia 2, y no toca nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const quimicloud = await quimicloudId(tx)
      const ajena = await crearEmpresa(tx, marcador)
      const recetaAjena = await crearReceta(tx, ajena, `ajena${marcador}`)
      const antes = {
        recetas: await tx.recipe.count(),
        empresas: await tx.company.count(),
      }

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_DEL_DOWN),
        'reversion con una receta de otra empresa',
      )
      expect(rechazo.texto).toContain('recipes_company_scope down')
      expect(rechazo.texto).toContain('pertenecen a una empresa distinta')
      // Ninguna mencion a la guardia 3: si apareciera, esta abortando por el motivo equivocado.
      expect(rechazo.texto).not.toContain('compartido(s) por recetas VIVAS')

      expect({
        recetas: await tx.recipe.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes)
      const fila = await tx.recipe.findUniqueOrThrow({
        where: { id: recetaAjena },
        select: { companyId: true },
      })
      expect(fila.companyId).toBe(ajena)
      // Sigue habiendo exactamente una «QuimiCloud»: la guardia no toco el catalogo de empresas.
      expect(await quimicloudId(tx)).toBe(quimicloud)
    })
  })

  it('causa (b): dos recetas vivas de empresas distintas con el mismo nombre hacen abortar la guardia 3, aislada de la 2', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const quimicloud = await quimicloudId(tx)
      const ajena = await crearEmpresa(tx, marcador)
      const compartido = `desinfectante${marcador}`
      const recetaDeQuimicloud = await crearReceta(tx, quimicloud, compartido)
      const recetaDeAjena = await crearReceta(tx, ajena, compartido)
      const antes = {
        recetas: await tx.recipe.count(),
        empresas: await tx.company.count(),
      }

      // La guardia 2 REAL abortaria aqui igual -hay una receta de `ajena`-, pero por SU propio
      // motivo, y tapa el de la 3 (ver cabecera). Se desactiva para afirmar el mensaje que le
      // pertenece a la guardia 3, no lo que la 2 diria primero.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_2_DESACTIVADA),
        'reversion con dos recetas vivas de empresas distintas y el mismo nombre, guardia 2 desactivada',
      )
      expect(rechazo.texto).toContain('recipes_company_scope down')
      expect(rechazo.texto).toContain('compartido(s) por recetas VIVAS de mas de una empresa')
      expect(rechazo.texto).not.toContain('pertenecen a una empresa distinta')

      expect({
        recetas: await tx.recipe.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes)
      const filas = await tx.recipe.findMany({
        where: { id: { in: [recetaDeQuimicloud, recetaDeAjena] } },
        select: { id: true, companyId: true, nameNormalized: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.every((fila) => fila.nameNormalized === compartido)).toBe(true)
    })
  })

  it('sin las guardias 2 Y 3, la reversion deja pasar el mismo dato: el aborto de arriba no es un placebo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const quimicloud = await quimicloudId(tx)
      const ajena = await crearEmpresa(tx, marcador)
      const compartido = `desinfectante${marcador}`
      await crearReceta(tx, quimicloud, compartido)
      await crearReceta(tx, ajena, compartido)

      // Exactamente los mismos datos que el caso anterior, pero con las dos guardias de dato
      // desactivadas: si esto abortara igual, seria la guardia 1 (empresa ambigua) la que
      // estaria abortando en el caso (b), no la 3, y ese caso no probaria lo que dice probar.
      await expect(tx.$executeRawUnsafe(GUARDIA_2_Y_3_DESACTIVADAS)).resolves.not.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// R6 — el DOWN ejecutado ENTERO deja el esquema exactamente como estaba
// ---------------------------------------------------------------------------

describe('R6 — ejecutar el down.sql entero devuelve el esquema al estado anterior al UP', () => {
  it('el retrato de despues es el de antes sin la columna, con el unico GLOBAL y PARCIAL restaurado, sin la constraint y con RLS forzada en las dos tablas', async () => {
    const capturado: { antes?: Retrato; despues?: Retrato } = {}

    await inRolledBackTransaction(async (tx) => {
      capturado.antes = await retratoDeEsquema(tx)
      await ejecutarDown(tx, SENTENCIAS_DEL_DOWN)
      capturado.despues = await retratoDeEsquema(tx)
    })

    const antes = capturado.antes
    const despues = capturado.despues
    expect(antes, 'no se capturo el retrato de antes').toBeDefined()
    expect(despues, 'no se capturo el retrato de despues').toBeDefined()
    if (antes === undefined || despues === undefined) return

    // Punto de partida: el esquema de la corrida es el de DESPUES del UP. Si no lo fuera, todo
    // lo de abajo compararia contra otra cosa.
    expect(antes.columnas.filter((linea) => linea.startsWith('company_id | '))).toHaveLength(1)
    expect(nombresDeIndice(antes)).toContain('recipes_company_name_unique')
    expect(nombresDeIndice(antes)).not.toContain('recipes_name_unique')

    // La columna se va, y NINGUNA otra se mueve ni cambia de tipo o de nulabilidad.
    expect(despues.columnas.filter((linea) => linea.startsWith('company_id | '))).toHaveLength(0)
    expect(despues.columnas).toEqual(
      antes.columnas.filter((linea) => !linea.startsWith('company_id | ')),
    )

    // El unico GLOBAL vuelve, y vuelve PARCIAL: sin el `WHERE` el nombre de una receta borrada
    // quedaria ocupado para siempre, y el esquema NO seria el que habia antes del UP.
    const global = despues.indices.find((linea) => linea.startsWith('recipes_name_unique | '))
    expect(global, 'el DOWN no restauro recipes_name_unique').toBeDefined()
    expect(global).toContain('CREATE UNIQUE INDEX')
    expect(global).toContain('(name_normalized)')
    expect(global).toMatch(/WHERE \(deleted_at IS NULL\)/u)
    expect(nombresDeIndice(despues)).not.toContain('recipes_company_name_unique')
    // Y el resto de indices de la tabla queda intacto, definicion a definicion.
    expect(
      despues.indices.filter((linea) => !linea.startsWith('recipes_name_unique | ')),
    ).toEqual(antes.indices.filter((linea) => !linea.startsWith('recipes_company_name_unique | ')))

    // La FK se va, y ninguna otra restriccion de la tabla se toca.
    expect(despues.restricciones).toEqual(
      antes.restricciones.filter((linea) => !linea.startsWith('recipes_company_id_fkey | ')),
    )
    expect(despues.restricciones.some((linea) => linea.includes('company'))).toBe(false)

    // RLS activada Y forzada en las tres tablas que el DOWN desforzo, y sin ninguna policy.
    expect(despues.rls).toEqual([
      'companies | true | true',
      'recipe_lines | true | true',
      'recipes | true | true',
    ])
    expect(despues.rls).toEqual(antes.rls)
    expect(despues.politicas).toEqual([])
    expect(antes.politicas).toEqual([])
  })

  it('el ROLLBACK devuelve la base a su estado real: el DDL de Postgres es transaccional', async () => {
    const antesDeTodo = await retratoDeEsquema(prisma)

    await inRolledBackTransaction(async (tx) => {
      await ejecutarDown(tx, SENTENCIAS_DEL_DOWN)
      // Dentro de la transaccion el esquema SI cambio: si no, el ROLLBACK no estaria
      // deshaciendo nada y este caso pasaria con un DOWN que no hiciera absolutamente nada.
      const dentro = await retratoDeEsquema(tx)
      expect(dentro.columnas).not.toEqual(antesDeTodo.columnas)
    })

    expect(await retratoDeEsquema(prisma)).toEqual(antesDeTodo)
  })

  it('sin la linea que restaura el unico global, el DOWN deja el esquema DISTINTO: la comparacion de arriba no es un placebo', async () => {
    const capturado: { despues?: Retrato } = {}

    await inRolledBackTransaction(async (tx) => {
      await ejecutarDown(tx, SIN_RESTAURAR_EL_GLOBAL)
      capturado.despues = await retratoDeEsquema(tx)
    })

    const despues = capturado.despues
    expect(despues, 'no se capturo el retrato de despues').toBeDefined()
    if (despues === undefined) return

    // Exactamente la asercion que el caso de arriba da por buena, del reves: con el DOWN mutado
    // la tabla se queda SIN ninguna garantia de unicidad de nombre, y el caso de arriba se
    // pondria rojo aqui.
    expect(nombresDeIndice(despues)).not.toContain('recipes_name_unique')
    expect(nombresDeIndice(despues)).not.toContain('recipes_company_name_unique')
  })
})

// ---------------------------------------------------------------------------
// R29 — una empresa borrada conserva sus recetas y sus lineas
// ---------------------------------------------------------------------------

describe('R29 — dar de baja logica una empresa no vacia ni altera sus recetas ni sus lineas', () => {
  it('la empresa borrada conserva su receta y su linea intactas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId)
      const recipeId = await crearReceta(tx, companyId, `receta${marcador}`)
      const lineId = await crearLineaDeReceta(tx, recipeId, productId)

      await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } })

      const receta = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { companyId: true, deletedAt: true },
      })
      expect(receta.companyId).toBe(companyId)
      expect(receta.deletedAt).toBeNull()

      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { recipeId: true, productId: true },
      })
      expect(linea).toEqual({ recipeId, productId })
      expect(await tx.recipeLine.count({ where: { recipeId } })).toBe(1)

      const empresa = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { deletedAt: true },
      })
      expect(empresa.deletedAt).not.toBeNull()
    })
  })
})
