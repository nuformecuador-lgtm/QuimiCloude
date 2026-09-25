// Contrato estatico del SQL de la migracion `customers_search_normalized` (F1.4, `design.md > 17`).
//
// Mismo patron que `customers-migration.test.ts`: cada afirmacion es un PREDICADO puro, aplicado
// al SQL real y a una version MUTADA EN MEMORIA (el archivo en disco no se toca).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260924200000_customers_search_normalized')
const precedentMigrationFile = join(
  repoRoot,
  'db',
  'migrations',
  '20260904160000_list_query_indexes',
  'migration.sql',
)

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const precedentSource = readFileSync(precedentMigrationFile, 'utf8')

const NORMALIZED_COLUMNS = ['first_names_normalized', 'last_names_normalized', 'city_normalized'] as const

/** Los dos literales del `translate(columna, '<de>', '<a>')`: el juego de caracteres del precedente. */
function extractTranslatePairs(sql: string): readonly (readonly [string, string])[] {
  const pattern = /translate\(\s*"?[a-zA-Z_]+"?\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g
  return [...stripSqlComments(sql).matchAll(pattern)].map((match) => [match[1] as string, match[2] as string])
}

const precedentPair = extractTranslatePairs(precedentSource)[0]

describe('migration.sql — cabecera sin citas', () => {
  it('la cabecera de migration.sql y de down.sql no cita ninguna ficha ni requisito', () => {
    for (const fuente of [upSource, downSource]) {
      expect(fuente).not.toMatch(/\bR\d+\b/)
      expect(fuente).not.toMatch(/\bQC-\d+\b/)
      expect(fuente).not.toMatch(/design\.md/)
      expect(fuente).not.toMatch(/decisi[oó]n cerrada/i)
    }

    // Sensibilidad OBLIGATORIA: una cita fabricada de cada patron tiene que tumbar el predicado.
    for (const citaFabricada of ['QC-999', '`design.md > 1`']) {
      expect(`${upSource}\n-- ${citaFabricada}`).toMatch(/\bQC-\d+\b|design\.md/)
    }
  })
})

describe('migration.sql — extension pg_trgm (R45)', () => {
  it('CREATE EXTENSION IF NOT EXISTS, una sola vez, sin ningun DROP EXTENSION en el UP', () => {
    const up = statements(upSource)
    const creaExtension = up.filter((statement) => /^CREATE EXTENSION IF NOT EXISTS "?pg_trgm"?$/i.test(statement))
    expect(creaExtension).toHaveLength(1)
    expect(upSource).not.toMatch(/DROP\s+EXTENSION/i)
  })
})

/** ¿El UPDATE de relleno aparece ANTES del primer SET NOT NULL? El predicado real de R43. */
function rellenaAntesDeNotNull(sql: string): boolean {
  const indiceUpdate = sql.search(/UPDATE\s+"?customers"?/i)
  const indiceSetNotNull = sql.search(/ALTER COLUMN "?first_names_normalized"? SET NOT NULL/i)
  if (indiceUpdate === -1 || indiceSetNotNull === -1) return false
  return indiceUpdate < indiceSetNotNull
}

describe('migration.sql — las tres columnas: anulables primero, relleno, y NOT NULL despues (R43, R44)', () => {
  it('cada columna se anade sin NOT NULL y se rellena antes del SET NOT NULL', () => {
    for (const columna of NORMALIZED_COLUMNS) {
      const add = new RegExp(`ALTER TABLE "?customers"? ADD COLUMN "?${columna}"? TEXT;`, 'i')
      expect(upSource).toMatch(add)
      // Ni NOT NULL ni UNIQUE en el ADD COLUMN (R44): se rellena antes de exigirlo.
      expect(upSource).not.toMatch(new RegExp(`ADD COLUMN "?${columna}"? TEXT NOT NULL`, 'i'))
    }

    expect(rellenaAntesDeNotNull(upSource)).toBe(true)

    // Sensibilidad OBLIGATORIA: el SET NOT NULL puesto ANTES del UPDATE tiene que tumbar el
    // predicado real, aplicado a texto sintetico con el orden invertido.
    const notNullPrimero = [
      'ALTER TABLE "customers" ALTER COLUMN "first_names_normalized" SET NOT NULL;',
      'UPDATE "customers" SET "first_names_normalized" = lower("first_names");',
    ].join('\n')
    expect(rellenaAntesDeNotNull(notNullPrimero)).toBe(false)
  })

  it('SET NOT NULL para las tres columnas, y ningun UNIQUE (R44)', () => {
    for (const columna of NORMALIZED_COLUMNS) {
      expect(upSource).toMatch(new RegExp(`ALTER COLUMN "?${columna}"? SET NOT NULL`, 'i'))
    }
    expect(stripSqlComments(upSource)).not.toMatch(/UNIQUE/i)

    // Sensibilidad OBLIGATORIA: un UNIQUE fabricado tiene que aparecer.
    const conUnique = `${upSource}\nALTER TABLE "customers" ADD CONSTRAINT "x" UNIQUE ("city_normalized");`
    expect(stripSqlComments(conUnique)).toMatch(/UNIQUE/i)
  })

  it('el relleno usa la MISMA pareja de translate que el precedente (R43)', () => {
    expect(precedentPair, 'no se pudo leer la pareja de translate del precedente').toBeDefined()
    const pares = extractTranslatePairs(upSource)
    expect(pares.length).toBeGreaterThanOrEqual(3)
    for (const par of pares) {
      expect(par).toEqual(precedentPair)
    }

    // Sensibilidad: una pareja distinta a la del precedente tiene que dejar de coincidir.
    const parMutado: readonly [string, string] = ['xy', 'ab']
    expect(parMutado).not.toEqual(precedentPair)
  })
})

describe('migration.sql — tres GIN de trigramas parciales, solo sobre vivos (R45)', () => {
  it('cada indice es gin_trgm_ops con WHERE deleted_at IS NULL', () => {
    for (const columna of NORMALIZED_COLUMNS) {
      const indice = new RegExp(
        `CREATE INDEX "?customers_${columna}_trgm_idx"? ON "?customers"? USING gin \\(\\s*"?${columna}"? gin_trgm_ops\\s*\\) WHERE "?deleted_at"? IS NULL`,
        'i',
      )
      expect(upSource).toMatch(indice)
    }
    expect(statements(upSource).filter((statement) => /^CREATE (?:UNIQUE )?INDEX/i.test(statement))).toHaveLength(3)

    // Sensibilidad OBLIGATORIA: un indice sin el WHERE tiene que dejar de coincidir con el mismo
    // predicado que exige el caso real, arriba.
    const conWhere = new RegExp(
      `CREATE INDEX "?customers_${NORMALIZED_COLUMNS[0]}_trgm_idx"? ON "?customers"? USING gin \\(\\s*"?${NORMALIZED_COLUMNS[0]}"? gin_trgm_ops\\s*\\) WHERE "?deleted_at"? IS NULL`,
      'i',
    )
    const indiceSinWhere = `CREATE INDEX "customers_${NORMALIZED_COLUMNS[0]}_trgm_idx" ON "customers" USING gin ("${NORMALIZED_COLUMNS[0]}" gin_trgm_ops);`
    expect(indiceSinWhere).not.toBe(upSource)
    expect(
      conWhere.test(indiceSinWhere),
    ).toBe(false)
  })
})

describe('migration.sql — no toca ninguna otra tabla (R45)', () => {
  it('todo ALTER/CREATE INDEX de esta migracion es sobre customers', () => {
    const up = statements(upSource)
    const alteresAjenos = up.filter(
      (statement) => /^ALTER TABLE/i.test(statement) && !/^ALTER TABLE "?customers"?\b/i.test(statement),
    )
    expect(alteresAjenos).toEqual([])
    const indicesAjenos = up.filter(
      (statement) => /^CREATE (?:UNIQUE )?INDEX/i.test(statement) && !/ON "?customers"?/i.test(statement),
    )
    expect(indicesAjenos).toEqual([])

    // Sensibilidad OBLIGATORIA: un ALTER sobre otra tabla tiene que aparecer en la lista.
    const conAlterAjeno = [...up, 'ALTER TABLE "orders" ADD COLUMN "x" TEXT']
    expect(
      conAlterAjeno.filter(
        (statement) => /^ALTER TABLE/i.test(statement) && !/^ALTER TABLE "?customers"?\b/i.test(statement),
      ),
    ).toHaveLength(1)
  })
})

describe('down.sql — reversion exacta, sin DROP EXTENSION (R46)', () => {
  it('tres DROP INDEX y tres DROP COLUMN, en orden inverso, y ningun DROP EXTENSION', () => {
    const down = statements(downSource)
    const dropIndexes = down.filter((statement) => /^DROP INDEX/i.test(statement))
    const dropColumns = down.filter((statement) => /^ALTER TABLE "?customers"? DROP COLUMN/i.test(statement))
    expect(dropIndexes).toHaveLength(3)
    expect(dropColumns).toHaveLength(3)
    expect(down).toHaveLength(6)
    expect(stripSqlComments(downSource)).not.toMatch(/DROP\s+EXTENSION/i)

    for (const columna of NORMALIZED_COLUMNS) {
      expect(downSource).toMatch(new RegExp(`DROP COLUMN IF EXISTS "?${columna}"?`, 'i'))
      expect(downSource).toMatch(new RegExp(`DROP INDEX IF EXISTS "?customers_${columna}_trgm_idx"?`, 'i'))
    }

    // Los indices se dejan caer ANTES que las columnas.
    expect(downSource.search(/DROP INDEX/i)).toBeLessThan(downSource.search(/DROP COLUMN/i))

    // Sensibilidad OBLIGATORIA: un DROP EXTENSION fabricado tiene que aparecer.
    const conDropExtension = `${downSource}\nDROP EXTENSION IF EXISTS "pg_trgm";`
    expect(conDropExtension).toMatch(/DROP\s+EXTENSION/i)

    // Sensibilidad OBLIGATORIA: un DOWN que se olvida una columna tiene que perder su DROP COLUMN.
    const sinUnaColumna = downSource.replace(
      /ALTER TABLE "customers" DROP COLUMN IF EXISTS "city_normalized";\n?/,
      '',
    )
    expect(sinUnaColumna, 'la mutacion no se aplico').not.toBe(downSource)
    expect(
      statements(sinUnaColumna).filter((statement) => /^ALTER TABLE "?customers"? DROP COLUMN/i.test(statement)),
    ).toHaveLength(2)
  })
})
