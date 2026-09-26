// Contrato estatico de `db/migrations/*_finished_products_and_content_copies` para las tablas
// de `inventario`: presentations.content, la identidad del producto terminado en products,
// product_batches.package_content y el CHECK de coste reescrito (C2), y los tres CHECK/indice
// de inventory_movements que dan de alta un asiento de produccion.

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

describe('presentations.content (R6, R9)', () => {
  it('R6: nace como DECIMAL(14,4) anulable, sin DEFAULT', () => {
    expect(upStatements).toContain('ALTER TABLE "presentations" ADD COLUMN "content" DECIMAL(14,4)')
  })

  it('R6: el CHECK exige mayor que cero cuando no es NULL', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "presentations" ADD CONSTRAINT "presentations_content_positive" CHECK ("content" IS NULL OR "content" > 0)',
    )
  })

  it('R9: ninguna sentencia rellena presentations.content con un UPDATE', () => {
    expect(upSource).not.toMatch(/UPDATE\s+"presentations"/i)
  })

  it('db/schema.prisma declara Presentation.content como Decimal opcional', () => {
    expect(schema).toMatch(/model Presentation \{[\s\S]*?content\s+Decimal\?\s+@db\.Decimal\(14, 4\)/)
  })
})

describe('la identidad del producto terminado en products (R21, R22, R23, R34, R35)', () => {
  it('recipe_id y presentation_id nacen anulables, sin DEFAULT', () => {
    expect(upStatements).toContain('ALTER TABLE "products" ADD COLUMN "recipe_id" UUID')
    expect(upStatements).toContain('ALTER TABLE "products" ADD COLUMN "presentation_id" UUID')
  })

  it('products_recipe_id_fkey es RESTRICT/CASCADE contra recipes(id)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "products_recipe_id_fkey"\s+FOREIGN KEY \("recipe_id"\) REFERENCES "recipes"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE/,
    )
  })

  it('products_company_id_presentation_id_fkey es COMPUESTA contra presentations(company_id, id)', () => {
    expect(upSource).toMatch(
      /ADD CONSTRAINT "products_company_id_presentation_id_fkey"\s+FOREIGN KEY \("company_id", "presentation_id"\) REFERENCES "presentations"\("company_id", "id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE/,
    )
  })

  it('products_finished_identity_matches_type exige receta y presentacion solo en FINISHED_PRODUCT', () => {
    expect(upSource).toMatch(/ADD CONSTRAINT "products_finished_identity_matches_type" CHECK \(/)
    expect(upSource).toMatch(/"type" = 'FINISHED_PRODUCT'/)
    expect(upSource).toMatch(/"recipe_id" IS NOT NULL AND "presentation_id" IS NOT NULL/)
    expect(upSource).toMatch(/"recipe_id" IS NULL\) = \("presentation_id" IS NULL\)/)
  })

  it('R22, R23, R35: products_finished_identity_key es unico PARCIAL por empresa, receta, presentacion y vivo', () => {
    expect(upSource).toMatch(
      /CREATE UNIQUE INDEX "products_finished_identity_key"\s+ON "products" \("company_id", "recipe_id", "presentation_id"\)\s+WHERE "type" = 'FINISHED_PRODUCT' AND "deleted_at" IS NULL/,
    )
  })

  it('products_recipe_id_idx es TOTAL, para el RESTRICT de recipes', () => {
    expect(upStatements).toContain('CREATE INDEX "products_recipe_id_idx" ON "products" ("recipe_id")')
  })

  it('R34: db/schema.prisma declara recipeId y presentationId sin @relation', () => {
    const productBody = /model Product \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? ''
    expect(productBody).toMatch(/recipeId\s+String\?\s+@map\("recipe_id"\) @db\.Uuid/)
    expect(productBody).toMatch(/presentationId\s+String\?\s+@map\("presentation_id"\) @db\.Uuid/)
    expect(productBody).not.toMatch(/recipeId[^\n]*@relation/)
    expect(productBody).not.toMatch(/presentationId[^\n]*@relation/)
  })
})

describe('product_batches.package_content y el CHECK de coste (C2, R25, R41, R43)', () => {
  it('package_content nace anulable, sin DEFAULT, con CHECK > 0', () => {
    expect(upStatements).toContain('ALTER TABLE "product_batches" ADD COLUMN "package_content" DECIMAL(14,4)')
    expect(upStatements).toContain(
      'ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_package_content_positive" CHECK ("package_content" IS NULL OR "package_content" > 0)',
    )
  })

  it('C2: reescribe product_batches_unit_cost_positive para permitir 0 solo con package_content', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "product_batches" DROP CONSTRAINT "product_batches_unit_cost_positive"',
    )
    expect(upStatements).toContain(
      'ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_unit_cost_positive" CHECK ("unit_cost" > 0 OR ("unit_cost" = 0 AND "package_content" IS NOT NULL))',
    )
  })

  it('C2, R43: product_batches_package_content_requires_unit_cost exige unit_cost cuando hay package_content', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_package_content_requires_unit_cost" CHECK ("package_content" IS NULL OR "unit_cost" IS NOT NULL)',
    )
  })

  it('R34: db/schema.prisma declara ProductBatch.packageContent como Decimal opcional', () => {
    expect(schema).toMatch(
      /model ProductBatch \{[\s\S]*?packageContent\s+Decimal\?\s+@map\("package_content"\) @db\.Decimal\(14, 4\)/,
    )
  })
})

describe('inventory_movements: el asiento de produccion (R16, R21, R34)', () => {
  it('order_id_matches_kind pasa a exigir order_id tambien en production', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_order_id_matches_kind"',
    )
    expect(upSource).toMatch(
      /ADD CONSTRAINT "inventory_movements_order_id_matches_kind"\s+CHECK \(\("kind" IN \('consumption', 'production'\)\) = \("order_id" IS NOT NULL\)\)/,
    )
  })

  it('reason_matches_kind deja a production sin motivo, igual que opening y consumption', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_reason_matches_kind"',
    )
    expect(upSource).toMatch(/"kind" IN \('opening', 'consumption', 'production'\) AND "reason" IS NULL/)
  })

  it('inventory_movements_production_quantity_positive exige cantidad positiva solo en production', () => {
    expect(upStatements).toContain(
      'ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_production_quantity_positive" CHECK ("kind" <> \'production\' OR "quantity" > 0)',
    )
  })

  it('R21: inventory_movements_one_production_per_order es unico PARCIAL por production', () => {
    expect(upSource).toMatch(
      /CREATE UNIQUE INDEX "inventory_movements_one_production_per_order"\s+ON "inventory_movements" \("order_id"\)\s+WHERE "kind" = 'production'/,
    )
  })
})

describe('R36: el down.sql falla si queda algun producto terminado o algun asiento de produccion', () => {
  it('el bloque de guarda esta al principio y usa RAISE EXCEPTION con 23514', () => {
    const guardIndex = downSource.search(/DO \$\$/)
    const firstAlter = downSource.search(/ALTER TABLE|DROP INDEX/)
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(guardIndex).toBeLessThan(firstAlter)
    expect(downSource).toMatch(/"type"\s*=\s*'FINISHED_PRODUCT'/)
    expect(downSource).toMatch(/"kind"\s*=\s*'production'/)
    expect(downSource).toMatch(/RAISE EXCEPTION/)
    expect(downSource).toMatch(/USING ERRCODE = '23514'/)
  })
})

describe('el down.sql revierte en orden inverso al up y repone el CHECK original de coste', () => {
  it('quita los objetos de inventory_movements, product_batches, products y presentations, en ese orden', () => {
    const withoutComments = stripSqlComments(downSource)
    const order = [
      'DROP INDEX "inventory_movements_one_production_per_order"',
      'DROP CONSTRAINT "inventory_movements_production_quantity_positive"',
      'DROP CONSTRAINT "inventory_movements_reason_matches_kind"',
      'DROP CONSTRAINT "inventory_movements_order_id_matches_kind"',
      'DROP CONSTRAINT "product_batches_package_content_requires_unit_cost"',
      'DROP CONSTRAINT "product_batches_unit_cost_positive"',
      'DROP CONSTRAINT "product_batches_package_content_positive"',
      'DROP COLUMN "package_content"',
      'DROP INDEX "products_recipe_id_idx"',
      'DROP INDEX "products_finished_identity_key"',
      'DROP CONSTRAINT "products_finished_identity_matches_type"',
      'DROP CONSTRAINT "products_company_id_presentation_id_fkey"',
      'DROP CONSTRAINT "products_recipe_id_fkey"',
      'DROP COLUMN "presentation_id"',
      'DROP COLUMN "recipe_id"',
      'DROP CONSTRAINT "presentations_content_positive"',
      'DROP COLUMN "content"',
    ]
    const positions = order.map((needle) => withoutComments.indexOf(needle))
    for (const position of positions) expect(position).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1] as number)
    }
  })

  it('repone product_batches_unit_cost_positive con la expresion original de QC-121', () => {
    expect(downStatements).toContain(
      'ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_unit_cost_positive" CHECK ("unit_cost" > 0)',
    )
  })

  it('no borra ninguna fila: sin DELETE ni TRUNCATE fuera de la guarda', () => {
    const withoutGuard = downSource.replace(/DO \$\$[\s\S]*?END \$\$;/, '')
    expect(withoutGuard).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })
})

describe('R34: nombres en ingles', () => {
  it('ningun caracter acentuado en el SQL de ninguno de los dos sentidos', () => {
    for (const sql of [upSource, downSource]) {
      expect(sql).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/)
    }
  })
})
