// Contrato ESTATICO de `db/migrations/*_product_batches_production_date` (QC-219): el lote gana su
// dia de produccion, anulable, y un CHECK que exige el vencimiento cuando lo tiene (R24).
//
// PATRON: predicados sobre el texto SQL, aplicados al archivo real y a una copia mutada en
// memoria. Mismo patron que `inventory-movements-production-per-line-migration.test.ts`.

import { readdirSync, readFileSync } from 'node:fs'
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
const migrationsDir = join(repoRoot, 'db', 'migrations')

const candidateDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_product_batches_production_date'),
)
expect(
  candidateDirs,
  'debe existir exactamente una migracion *_product_batches_production_date',
).toHaveLength(1)
const migrationDir = join(migrationsDir, candidateDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
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

const ADD_COLUMN = 'ALTER TABLE "product_batches" ADD COLUMN "production_date" DATE'
const ADD_CHECK =
  'ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_production_date_requires_expiry" CHECK ("production_date" IS NULL OR "expiry_date" IS NOT NULL)'
const DROP_CHECK =
  'ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_production_date_requires_expiry"'
const DROP_COLUMN = 'ALTER TABLE "product_batches" DROP COLUMN "production_date"'

/** Las dos sentencias del UP, exactas y en orden: una de mas es un cambio que nadie pidio. */
function upEsElEsperado(sql: string): boolean {
  const found = statements(sql)
  return found.length === 2 && found[0] === ADD_COLUMN && found[1] === ADD_CHECK
}

/** Las dos sentencias del DOWN, exactas y en orden inverso al UP. */
function downEsElEsperado(sql: string): boolean {
  const found = statements(sql)
  return found.length === 2 && found[0] === DROP_CHECK && found[1] === DROP_COLUMN
}

describe('product_batches.production_date — migration.sql (R24)', () => {
  it('R24: la columna nace anulable, sin DEFAULT, y el CHECK exige vencimiento si hay produccion', () => {
    expect(upEsElEsperado(upSource)).toBe(true)
  })

  it('R24: no reescribe ninguna fila (sin UPDATE, sin DEFAULT, sin NOT NULL)', () => {
    const code = stripSqlComments(upSource)
    expect(code).not.toMatch(/\bUPDATE\b/i)
    expect(code).not.toMatch(/\bDEFAULT\b/i)
    expect(code).not.toMatch(/NOT NULL\s*;/i)
  })

  it('R24: el detector muerde -una columna NOT NULL, un DEFAULT o un CHECK invertido dan rojo-', () => {
    const notNull = upSource.replace('"production_date" DATE;', '"production_date" DATE NOT NULL;')
    expect(notNull, 'la mutacion no se aplico').not.toBe(upSource)
    expect(upEsElEsperado(notNull)).toBe(false)

    const conDefault = upSource.replace('"production_date" DATE;', '"production_date" DATE DEFAULT CURRENT_DATE;')
    expect(conDefault, 'la mutacion no se aplico').not.toBe(upSource)
    expect(upEsElEsperado(conDefault)).toBe(false)

    const checkFlojo = upSource.replace('"expiry_date" IS NOT NULL', '"expiry_date" IS NULL')
    expect(checkFlojo, 'la mutacion no se aplico').not.toBe(upSource)
    expect(upEsElEsperado(checkFlojo)).toBe(false)

    const sinCheck = upSource.replace(/ALTER TABLE "product_batches" ADD CONSTRAINT[\s\S]*?;\s*$/, '')
    expect(sinCheck, 'la mutacion no se aplico').not.toBe(upSource)
    expect(upEsElEsperado(sinCheck)).toBe(false)
  })
})

describe('product_batches.production_date — down.sql revierte exactamente, en orden inverso (R24)', () => {
  it('R24: quita el CHECK y despues la columna', () => {
    expect(downEsElEsperado(downSource)).toBe(true)
  })

  it('R24: el detector muerde -el orden al reves o un DROP de menos dan rojo-', () => {
    const alReves = `${DROP_COLUMN};\n${DROP_CHECK};\n`
    expect(downEsElEsperado(alReves)).toBe(false)
    expect(downEsElEsperado(`${DROP_COLUMN};\n`)).toBe(false)
  })

  it('R24: no borra filas: sin DELETE ni TRUNCATE', () => {
    expect(stripSqlComments(downSource)).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })
})

describe('nombres en ingles', () => {
  it('ningun caracter acentuado en el SQL de ninguno de los dos sentidos', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
