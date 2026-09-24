// Contrato estatico de `db/migrations/*_finished_products_and_content_copies` para la parte que
// toca `orders`: la copia del contenido de la presentacion (D16) y sus dos CHECK.

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
  name.endsWith('_finished_products_and_content_copies'),
)
expect(
  candidateDirs,
  'debe existir exactamente una migracion *_finished_products_and_content_copies',
).toHaveLength(1)
const migrationDir = join(migrationsDir, candidateDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

const schema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

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

const upStatements = statements(upSource)
const downStatements = statements(downSource)

describe('orders.presentation_content (R9, R38, R39, R40)', () => {
  it('R9: nace como DECIMAL(14,4) anulable, sin DEFAULT', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "orders" ADD COLUMN "presentation_content" DECIMAL(14,4)',
    )
  })

  it('R9: sin relleno: ningun UPDATE toca orders.presentation_content', () => {
    expect(upSource).not.toMatch(/UPDATE\s+"orders"/i)
  })

  it('orders_presentation_content_positive exige mayor que cero cuando no es NULL', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_positive" CHECK ("presentation_content" IS NULL OR "presentation_content" > 0)',
    )
  })

  it('orders_presentation_content_requires_presentation: no hay copia sin presentacion', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "orders_presentation_content_requires_presentation" CHECK ("presentation_id" IS NOT NULL OR "presentation_content" IS NULL)',
    )
  })

  it('db/schema.prisma declara Order.presentationContent como Decimal opcional', () => {
    expect(schema).toMatch(
      /model Order \{[\s\S]*?presentationContent\s+Decimal\?\s+@map\("presentation_content"\) @db\.Decimal\(14, 4\)/,
    )
  })
})

describe('down.sql de orders.presentation_content', () => {
  it('quita las dos CHECK antes que la columna, en orden inverso al up', () => {
    const withoutComments = stripSqlComments(downSource)
    const order = [
      'DROP CONSTRAINT "orders_presentation_content_requires_presentation"',
      'DROP CONSTRAINT "orders_presentation_content_positive"',
      'DROP COLUMN "presentation_content"',
    ]
    const positions = order.map((needle) => withoutComments.indexOf(needle))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] as number)
    }
  })

  it('R36: la guarda de la migracion esta antes que cualquier cambio sobre orders', () => {
    const guardIndex = downSource.search(/DO \$\$/)
    const firstOrdersAlter = downSource.search(/ALTER TABLE "orders"/)
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(guardIndex).toBeLessThan(firstOrdersAlter)
  })

  it('no borra ninguna fila de orders', () => {
    expect(downStatements.join('\n')).not.toMatch(/DELETE FROM "orders"|TRUNCATE "orders"/i)
  })
})

describe('R34: nombres en ingles', () => {
  it('ningun caracter acentuado en las sentencias que tocan orders', () => {
    const ordersLines = [...upSource.split('\n'), ...downSource.split('\n')].filter((line) =>
      /orders/i.test(line),
    )
    for (const line of ordersLines) {
      expect(line).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
