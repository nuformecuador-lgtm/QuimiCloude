// Contrato estatico del SQL de `recipe_tools` y de `model RecipeTool`. La FK a `products`, el CHECK
// y la RLS estan escritos a mano y Prisma no los regenera, asi que lo comprueba este archivo. Cada
// predicado se prueba tambien contra el SQL mutado en memoria, para que no pase en verde sin mirar.

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

function migrationDir(suffix: string): string {
  const dirs = readdirSync(migrationsDir).filter((name) => name.endsWith(suffix))
  expect(dirs, `debe existir exactamente una migracion *${suffix}`).toHaveLength(1)
  return join(migrationsDir, dirs[0] as string)
}

const toolsDir = migrationDir('_recipe_tools')
const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const upSource = read(join(toolsDir, 'migration.sql'))
const downSource = read(join(toolsDir, 'down.sql'))
const schemaSource = read(join(repoRoot, 'db', 'schema.prisma'))

/** Sentencias sin comentarios `--` y con espacios normalizados. */
function statements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
}

const up = statements(upSource)
const down = statements(downSource)

const FK_PRODUCTO =
  'ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE'
const CHECK_CANTIDAD =
  'ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_quantity_positive" CHECK ("quantity" > 0)'

function rlsHallazgos(stmts: readonly string[]): readonly string[] {
  const hallazgos: string[] = []
  if (!stmts.includes('ALTER TABLE "recipe_tools" ENABLE ROW LEVEL SECURITY')) hallazgos.push('falta ENABLE')
  if (!stmts.includes('ALTER TABLE "recipe_tools" FORCE ROW LEVEL SECURITY')) hallazgos.push('falta FORCE')
  if (stmts.some((s) => /^CREATE POLICY\b/i.test(s))) hallazgos.push('no debe declarar policies')
  return hallazgos
}

function modelBody(name: string, source: string): string {
  return new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source)?.[1] ?? ''
}

describe('migration.sql de recipe_tools', () => {
  it('R1: crea la tabla con cantidad entera NOT NULL y sin company_id', () => {
    const create = up.find((s) => s.startsWith('CREATE TABLE "recipe_tools"'))
    expect(create, 'el UP no crea recipe_tools').toBeDefined()
    expect(create).toContain('"recipe_id" UUID NOT NULL')
    expect(create).toContain('"product_id" UUID NOT NULL')
    expect(create).toContain('"quantity" INTEGER NOT NULL')
    expect(create).not.toContain('company_id')
    for (const statement of up) {
      expect(statement, `el UP no debe tener DML: ${statement}`).not.toMatch(/^(INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
    }
  })

  it('R1: la FK a la receta va en CASCADE y la de producto, escrita a mano, en RESTRICT', () => {
    expect(up).toContain(
      'ALTER TABLE "recipe_tools" ADD CONSTRAINT "recipe_tools_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    )
    expect(up).toContain(FK_PRODUCTO)
    const mutado = statements(upSource.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE'))
    expect(mutado).not.toContain(FK_PRODUCTO)
  })

  it('R6: la base rechaza una cantidad no positiva con un CHECK', () => {
    expect(up).toContain(CHECK_CANTIDAD)
    const mutado = statements(upSource.replace('"quantity" > 0', '"quantity" >= 0'))
    expect(mutado).not.toContain(CHECK_CANTIDAD)
  })

  it('R4: una herramienta no se repite en la misma receta (unico compuesto) y el producto lleva indice', () => {
    expect(up).toContain(
      'CREATE UNIQUE INDEX "recipe_tools_recipe_id_product_id_key" ON "recipe_tools"("recipe_id", "product_id")',
    )
    expect(up).toContain('CREATE INDEX "recipe_tools_product_id_idx" ON "recipe_tools"("product_id")')
  })

  it('activa y fuerza la RLS, sin policies', () => {
    expect(rlsHallazgos(up)).toEqual([])
    expect(rlsHallazgos(up.filter((s) => !s.includes('FORCE ROW LEVEL SECURITY')))).toEqual(['falta FORCE'])
  })
})

describe('down.sql de recipe_tools', () => {
  it('borra la tabla entera y nada mas', () => {
    expect(down).toEqual(['DROP TABLE IF EXISTS "recipe_tools"'])
    expect(downSource).not.toMatch(/"recipe_lines"|"recipes"\s/)
  })
})

describe('model RecipeTool en schema.prisma', () => {
  const body = modelBody('RecipeTool', schemaSource)

  it('es de recetas, sin companyId y gemelo de RecipeLine', () => {
    expect(body, 'no se encontro model RecipeTool').not.toBe('')
    expect(schemaSource).toMatch(/\/\/\/ @module recetas\nmodel RecipeTool \{/)
    expect(body).not.toMatch(/companyId|company_id/)
    expect(body).toMatch(/quantity\s+Int\b/)
    expect(body).toMatch(
      /recipe\s+Recipe\s+@relation\(fields: \[recipeId\], references: \[id\], onDelete: Cascade, onUpdate: Cascade\)/,
    )
    expect(body).toContain('@@unique([recipeId, productId], map: "recipe_tools_recipe_id_product_id_key")')
    expect(body).toContain('@@index([productId], map: "recipe_tools_product_id_idx")')
    expect(body).toContain('@@map("recipe_tools")')
  })

  it('productId es escalar: no cruza a inventario con un @relation', () => {
    expect(body).toMatch(/productId\s+String\s+@map\("product_id"\) @db\.Uuid\n/)
    expect(body).not.toMatch(/\bProduct\b/)
  })

  it('Recipe declara la lista de herramientas', () => {
    expect(modelBody('Recipe', schemaSource)).toMatch(/tools\s+RecipeTool\[\]/)
  })
})
