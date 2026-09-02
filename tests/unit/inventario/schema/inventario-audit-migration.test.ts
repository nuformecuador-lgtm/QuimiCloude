// T2 — Contrato estatico del SQL de la migracion
// `product_audit_and_presentation_uniqueness` (QC-20).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma`: las dos FK de auditoria a `users`
// se escribieron a mano porque `createdBy`/`updatedBy` son campos ESCALARES sin
// `@relation` (`specs/QC-20-crud-de-productos/design.md` seccion 2.1) y por eso son DRIFT
// para Prisma. Este archivo es la unica guardia que tienen frente a ese drift: si una
// migracion futura las borra, tiene que caer aqui.
//
// Cubre R7, R20, R30, R32.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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
const migrationDir = join(
  repoRoot,
  'db',
  'migrations',
  '20260902170759_product_audit_and_presentation_uniqueness',
)

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas. */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const migrationSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(migrationSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${pattern}`).toHaveLength(1)
  return found[0] as string
}

/** `tabla.columna` anadidas por `ALTER TABLE <tabla> ADD COLUMN <columna> ...`. */
function addedColumns(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const table = /^ALTER TABLE "?(\w+)"?\s+ADD COLUMN\s+"?(\w+)"?/i.exec(statement)
    return table ? [`${table[1]}.${table[2]}`] : []
  })
}

/** `tabla.columna` eliminadas por `ALTER TABLE <tabla> DROP COLUMN [IF EXISTS] <columna>`. */
function droppedColumns(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const table = /^ALTER TABLE "?(\w+)"?\s+DROP COLUMN\s+(?:IF EXISTS\s+)?"?(\w+)"?/i.exec(statement)
    return table ? [`${table[1]}.${table[2]}`] : []
  })
}

/** Nombres de restriccion anadidos por `ALTER TABLE ... ADD CONSTRAINT "<nombre>" ...`. */
function addedConstraints(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const match = /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    return match ? [match[1] as string] : []
  })
}

/** Nombres de restriccion quitados por `ALTER TABLE ... DROP CONSTRAINT [IF EXISTS] "<nombre>"`. */
function droppedConstraints(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const match = /DROP CONSTRAINT\s+(?:IF EXISTS\s+)?"([^"]+)"/i.exec(statement)
    return match ? [match[1] as string] : []
  })
}

/** Nombres de indice creados por `CREATE [UNIQUE] INDEX "<nombre>" ON ...`. */
function createdIndexes(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const match = /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement)
    return match ? [match[1] as string] : []
  })
}

/** Nombres de indice quitados por `DROP INDEX [IF EXISTS] "<nombre>"`. */
function droppedIndexes(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) => {
    const match = /^DROP INDEX\s+(?:IF EXISTS\s+)?"([^"]+)"/i.exec(statement)
    return match ? [match[1] as string] : []
  })
}

/**
 * Todos los identificadores que crea esta migracion: columnas anadidas (como
 * `tabla.columna`), restricciones y el indice unico. Sirve tanto para R30 (idioma) como
 * de insumo de R32 (simetria con el DOWN).
 */
function createdIdentifierPieces(): readonly string[] {
  const columnas = addedColumns(up).map((identificador) => identificador.split('.')[1] as string)
  const restricciones = addedConstraints(up)
  const indices = createdIndexes(up)
  return [...columnas, ...restricciones, ...indices]
}

/**
 * Vocabulario ingles admitido para los identificadores de esta feature (R30). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista: una columna
 * nueva en espanol no encuentra sus piezas y cae.
 */
const VOCABULARIO_INGLES = new Set([
  'by',
  'created',
  'fkey',
  'key',
  'name',
  'normalized',
  'presentations',
  'products',
  'updated',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R30) */
function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

describe('migration.sql — auditoria de products: columnas y claves foraneas (R7, R30)', () => {
  it('añade created_by y updated_by como UUID anulable en products', () => {
    expect(up.some((s) => /^ALTER TABLE "?products"? ADD COLUMN "?created_by"? UUID\s*$/i.test(s))).toBe(
      true,
    )
    expect(up.some((s) => /^ALTER TABLE "?products"? ADD COLUMN "?updated_by"? UUID\s*$/i.test(s))).toBe(
      true,
    )
    // Ninguna de las dos lleva NOT NULL: son anulables a proposito (design.md > 2.1 b).
    expect(up.some((s) => /created_by[^,]*NOT NULL/i.test(s))).toBe(false)
    expect(up.some((s) => /updated_by[^,]*NOT NULL/i.test(s))).toBe(false)
  })

  it('las dos FK de auditoria referencian users(id) y estan en el SQL (compensa el drift de design.md > 2.1 a)', () => {
    const createdByFk = findStatement(up, /ADD CONSTRAINT "?products_created_by_fkey"?/i)
    const updatedByFk = findStatement(up, /ADD CONSTRAINT "?products_updated_by_fkey"?/i)

    for (const fk of [createdByFk, updatedByFk]) {
      expect(fk).toMatch(/FOREIGN KEY/i)
      expect(fk).toMatch(/REFERENCES "?users"?\s*\(\s*"?id"?\s*\)/i)
    }
    expect(createdByFk).toMatch(/FOREIGN KEY\s*\(\s*"?created_by"?\s*\)/i)
    expect(updatedByFk).toMatch(/FOREIGN KEY\s*\(\s*"?updated_by"?\s*\)/i)

    // Coherentes con columnas anulables: ni RESTRICT (bloquearia borrar cualquier usuario
    // que alguna vez toco un producto) ni CASCADE (borraria el producto con el usuario).
    for (const fk of [createdByFk, updatedByFk]) {
      expect(fk).toMatch(/ON DELETE SET NULL/i)
      expect(fk).not.toMatch(/ON DELETE (RESTRICT|CASCADE|SET DEFAULT|NO ACTION)/i)
    }
  })

  it('la sensibilidad de la FK cae si se relaja a ON DELETE CASCADE', () => {
    const createdByFk = findStatement(up, /ADD CONSTRAINT "?products_created_by_fkey"?/i)
    const mutado = createdByFk.replace(/ON DELETE SET NULL/i, 'ON DELETE CASCADE')
    expect(mutado, 'la mutacion no se aplico').not.toBe(createdByFk)
    expect(mutado).not.toMatch(/ON DELETE SET NULL/i)
  })
})

describe('migration.sql — unicidad normalizada de presentations (R20)', () => {
  it('añade name_normalized y luego la fija NOT NULL despues del backfill', () => {
    const addColumn = findStatement(up, /^ALTER TABLE "?presentations"? ADD COLUMN "?name_normalized"?/i)
    expect(addColumn).not.toMatch(/NOT NULL/i)

    const setNotNull = findStatement(
      up,
      /^ALTER TABLE "?presentations"? ALTER COLUMN "?name_normalized"? SET NOT NULL\s*$/i,
    )
    expect(setNotNull).toBeTruthy()

    // El backfill (UPDATE) esta escrito ANTES del SET NOT NULL en el archivo: si no,
    // la columna no admitiria las filas existentes.
    const addIndex = migrationSource.indexOf('ADD COLUMN "name_normalized"')
    const updateIndex = migrationSource.indexOf('UPDATE "presentations"')
    const notNullIndex = migrationSource.indexOf('SET NOT NULL')
    expect(addIndex).toBeGreaterThanOrEqual(0)
    expect(updateIndex).toBeGreaterThan(addIndex)
    expect(notNullIndex).toBeGreaterThan(updateIndex)
  })

  it('el backfill normaliza con trim, minusculas, sin diacriticos y sin caracteres no alfanumericos', () => {
    const update = findStatement(up, /^UPDATE "?presentations"?/i)
    expect(update).toMatch(/btrim\(\s*"?name"?\s*\)/i)
    expect(update).toMatch(/lower\(/i)
    expect(update).toMatch(/translate\(/i)
    expect(update).toMatch(/regexp_replace\(.+,\s*'\[\^a-z0-9\]'\s*,\s*''\s*,\s*'g'\s*\)/i)
  })

  it('existe el indice unico presentations_name_normalized_key sobre name_normalized, y es la unica garantia real', () => {
    const index = findStatement(up, /^CREATE UNIQUE INDEX "?presentations_name_normalized_key"?/i)
    expect(index).toMatch(/ON "?presentations"?\s*\(\s*"?name_normalized"?\s*\)/i)

    // No hay ningun otro indice unico en toda la migracion (ni sobre products, D14).
    const unicos = up.filter((s) => /^CREATE UNIQUE INDEX/i.test(s))
    expect(unicos).toHaveLength(1)
  })

  it('la migracion no usa unaccent() ni crea ninguna extension nueva (design.md > 11.3)', () => {
    expect(migrationSource).not.toMatch(/unaccent/i)
    expect(migrationSource).not.toMatch(/CREATE EXTENSION/i)
  })

  it('la migracion no añade ningun CHECK sobre delivery_time (D10)', () => {
    expect(up.some((s) => /CHECK/i.test(s))).toBe(false)
  })
})

describe('migration.sql — nombra en ingles las columnas, la FK y el indice unico que anade la migracion', () => {
  it('nombra en ingles las columnas, la FK y el indice unico que anade la migracion', () => {
    const identificadores = createdIdentifierPieces()
    // La lista no puede estar vacia, o la asercion no afirmaria nada.
    expect(identificadores.length).toBeGreaterThanOrEqual(5)
    expect(identificadores).toContain('created_by')
    expect(identificadores).toContain('updated_by')
    expect(identificadores).toContain('name_normalized')
    expect(identificadores).toContain('products_created_by_fkey')
    expect(identificadores).toContain('products_updated_by_fkey')
    expect(identificadores).toContain('presentations_name_normalized_key')

    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(true)
    }
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    for (const enEspanol of ['creado_por', 'actualizado_por', 'nombre_normalizado']) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('nombre_normalizado_único')).toBe(false)
    expect(isEnglishSnakeCase('Created_By')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('created_by')).toBe(true)
    expect(isEnglishSnakeCase('presentations_name_normalized_key')).toBe(true)
  })
})

describe('down.sql — el down.sql revierte exactamente lo que anade el migration.sql y nada mas', () => {
  it('el down.sql revierte exactamente lo que anade el migration.sql y nada mas', () => {
    // 1) Columnas: las mismas dos de products y la de presentations, en orden inverso.
    const columnasAnadidas = addedColumns(up)
    const columnasQuitadas = droppedColumns(down)
    expect(columnasAnadidas).toEqual(['products.created_by', 'products.updated_by', 'presentations.name_normalized'])
    expect(columnasQuitadas).toEqual([...columnasAnadidas].reverse())

    // 2) Restricciones: las dos FK de auditoria, en orden inverso.
    const restriccionesAnadidas = addedConstraints(up)
    const restriccionesQuitadas = droppedConstraints(down)
    expect(restriccionesAnadidas).toEqual(['products_created_by_fkey', 'products_updated_by_fkey'])
    expect(restriccionesQuitadas).toEqual([...restriccionesAnadidas].reverse())

    // 3) Indices: el unico que crea la migracion.
    const indicesCreados = createdIndexes(up)
    const indicesQuitados = droppedIndexes(down)
    expect(indicesCreados).toEqual(['presentations_name_normalized_key'])
    expect(indicesQuitados).toEqual(indicesCreados)

    // 4) El DOWN no hace NADA mas que esas seis reversiones: ni una sentencia de mas.
    expect(down).toHaveLength(
      columnasQuitadas.length + restriccionesQuitadas.length + indicesQuitados.length,
    )

    // 5) Todo con IF EXISTS: revertir dos veces (o sobre una base a medio migrar) no debe
    // reventar.
    for (const statement of down) {
      expect(statement, `sentencia del DOWN sin IF EXISTS: ${statement}`).toMatch(/IF EXISTS/i)
    }
  })

  it('la guardia de simetria cae si el DOWN se olvida de una columna', () => {
    // Mutacion EN MEMORIA: el archivo en disco no se toca.
    const mutado = down.filter((statement) => !/"?updated_by"?/i.test(statement))
    expect(mutado.length, 'la mutacion no quito nada').toBeLessThan(down.length)
    expect(droppedColumns(mutado)).not.toEqual([...addedColumns(up)].reverse())
  })

  it('la guardia de simetria cae si el DOWN dropea algo que el UP no crea', () => {
    const mutado = [
      ...down,
      'ALTER TABLE "products" DROP COLUMN IF EXISTS "name"',
    ]
    expect(droppedColumns(mutado)).not.toEqual([...addedColumns(up)].reverse())
  })
})

describe('down.sql — no toca RLS ni ninguna tabla de identity (R4, R8)', () => {
  it('el down.sql no dropea ninguna tabla ni toca ROW LEVEL SECURITY', () => {
    const downEjecutable = stripSqlComments(downSource)
    expect(downEjecutable).not.toMatch(/DROP TABLE/i)
    expect(downEjecutable).not.toMatch(/ROW LEVEL SECURITY/i)
    expect(downEjecutable).not.toMatch(/"?users"?/i)
  })
})
