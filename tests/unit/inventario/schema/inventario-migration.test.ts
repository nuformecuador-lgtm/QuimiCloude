// T5 — Contrato estatico del SQL de la migracion `products_and_presentations`.
//
// Lo que se vigila aqui NO esta en `db/schema.prisma`: los cuatro CHECK de no negatividad
// y los cuatro ALTER de RLS se escribieron a mano porque Prisma no los modela
// (`specs/QC-14-modelo-producto/design.md` seccion 3). Este archivo es la unica guardia
// que tienen frente al drift: si una migracion futura los borra, tiene que caer aqui.
//
// Cubre R6, R8, R9, R12, R14, R16, R19, R21, R22.

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260902005510_products_and_presentations')

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

const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${pattern}`).toHaveLength(1)
  return found[0] as string
}

/** Nombres de tabla creadas, en el orden en que aparecen. */
function createdTables(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** Nombres de tabla dropeadas, en el orden en que aparecen. */
function droppedTables(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

const createProducts = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?products"?/i)

// --- Predicados reutilizables: los mismos que usan los tests de sensibilidad de abajo ---

/**
 * ¿`cost` se declara como decimal exacto (14,4)? (R8)
 *
 * En positivo Y en negativo: no basta con que aparezca `DECIMAL` en algun sitio, tiene que
 * ser esa columna, con esa precision, y no puede ser coma flotante binaria.
 */
function declaresExactDecimalCost(statement: string): boolean {
  const esDecimalExacto = /"cost"\s+DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i.test(statement)
  const esComaFlotante = /"cost"\s+(DOUBLE\s+PRECISION|FLOAT\d*|REAL)\b/i.test(statement)
  return esDecimalExacto && !esComaFlotante
}

/** ¿El CHECK exige que la columna sea mayor o igual que cero, y no algo mas laxo? (R9) */
function isNonNegativeCheck(statement: string, column: string): boolean {
  return new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>=\\s*0\\s*\\)`, 'i').test(statement)
}

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R12, R14) */
function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. (R21) */
function hasRlsEnabledAndForced(source: readonly string[], table: string): boolean {
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return source.some((statement) => enable.test(statement)) && source.some((statement) => force.test(statement))
}

/**
 * Identificadores que ESTA migracion crea: tablas, columnas, restricciones e indices.
 *
 * Dentro de un `CREATE TABLE` todo identificador entrecomillado lo crea esta migracion
 * (la tabla, sus columnas y el nombre de la PK). De `ADD CONSTRAINT` y `CREATE INDEX` se
 * toma el nombre que declaran, no lo que referencian.
 */
function createdIdentifiers(source: readonly string[]): readonly string[] {
  const nombres = new Set<string>()
  for (const statement of source) {
    if (/^CREATE TABLE/i.test(statement)) {
      for (const match of statement.matchAll(/"([^"]+)"/g)) nombres.add(match[1] as string)
      continue
    }
    const constraint = /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    if (constraint) nombres.add(constraint[1] as string)
    const index = /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement)
    if (index) nombres.add(index[1] as string)
  }
  return [...nombres]
}

/**
 * Vocabulario ingles admitido para los identificadores de esta feature (R19). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista cerrada a proposito: una columna nueva obliga a pasar por aqui, y una en
 * espanol (`compra_minima`, `existencia`, `presentacion`) no encuentra sus piezas y cae.
 * Un patron `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'alert',
  'at',
  'cost',
  'created',
  'delete',
  'deleted',
  'delivery',
  'fkey',
  'id',
  'idx',
  'key',
  'min',
  'name',
  'negative',
  'non',
  'pkey',
  'presentation',
  'presentations',
  'product',
  'products',
  'purchase',
  'qty',
  'stock',
  'time',
  'unit',
  'updated',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R19) */
function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

describe('migration.sql — columnas y tipos de products', () => {
  it('min_purchase es INTEGER NOT NULL DEFAULT 0', () => {
    // R6: la compra minima no es anulable y el defecto lo pone la base, no la aplicacion.
    expect(createProducts).toMatch(/"min_purchase" INTEGER NOT NULL DEFAULT 0/i)
    expect(createProducts).not.toMatch(/"min_purchase"[^,]*(DECIMAL|NUMERIC|DOUBLE|REAL)/i)
  })

  it('cost se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision', () => {
    // R8. Primero la afirmacion sobre el archivo real...
    expect(declaresExactDecimalCost(createProducts)).toBe(true)

    // ...y despues la sensibilidad: mutacion EN MEMORIA, el archivo en disco no se toca.
    const mutado = createProducts.replace(/DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i, 'DOUBLE PRECISION')
    expect(mutado, 'la mutacion no se aplico: cambio el texto de la migracion').not.toBe(
      createProducts,
    )
    expect(declaresExactDecimalCost(mutado)).toBe(false)

    // Y tampoco vale un decimal con otra precision: (14,4) es la decision cerrada 7.
    const otraPrecision = createProducts.replace(/DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i, 'DECIMAL(10,2)')
    expect(declaresExactDecimalCost(otraPrecision)).toBe(false)
  })

  it('las cuatro columnas enteras se declaran INTEGER', () => {
    // R7 en su forma SQL; la declaracion Prisma la cubre el test del esquema.
    for (const columna of ['stock', 'min_purchase', 'delivery_time', 'qty_alert']) {
      expect(createProducts, `${columna} deberia ser INTEGER`).toMatch(
        new RegExp(`"${columna}" INTEGER`, 'i'),
      )
    }
  })
})

describe('migration.sql — CHECK de no negatividad', () => {
  const columnas = [
    ['stock', 'products_stock_non_negative'],
    ['min_purchase', 'products_min_purchase_non_negative'],
    ['qty_alert', 'products_qty_alert_non_negative'],
    ['cost', 'products_cost_non_negative'],
  ] as const

  function checkDe(constraint: string): string {
    return findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
  }

  it('las cuatro columnas numericas llevan CHECK de no negatividad, y el test cae si se relaja el >= 0', () => {
    // R9. Los cuatro CHECK existen, con los nombres exactos y sobre su propia columna.
    for (const [columna, constraint] of columnas) {
      const statement = checkDe(constraint)
      expect(isNonNegativeCheck(statement, columna), `${constraint} no exige >= 0`).toBe(true)
    }

    // Y no hay ningun CHECK de mas ni de menos en toda la migracion.
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(columnas.length)

    // Sensibilidad: relajar el umbral en memoria tiene que tumbar el predicado.
    for (const [columna, constraint] of columnas) {
      const statement = checkDe(constraint)
      const mutado = statement.replace(/>=\s*0/, '> -1')
      expect(mutado, `la mutacion no se aplico sobre ${constraint}`).not.toBe(statement)
      expect(isNonNegativeCheck(mutado, columna), `${constraint} mutado no deberia pasar`).toBe(
        false,
      )
    }
  })

  it('delivery_time no lleva CHECK, y es decision cerrada, no un olvido', () => {
    // Decision cerrada 7: enumera stock, min_purchase, qty_alert y cost. El tiempo de
    // entrega NO esta en esa lista (`design.md` 3.1, pregunta abierta 4). Se afirma en
    // positivo para que nadie lo "arregle" anadiendo un quinto CHECK sin reabrir la decision.
    const checks = up.filter((statement) => /CHECK\s*\(/i.test(statement))
    expect(checks.some((statement) => /"?delivery_time"?/i.test(statement))).toBe(false)
    expect(createProducts).toMatch(/"delivery_time" INTEGER\s*,/i)
    expect(createProducts).not.toMatch(/"delivery_time"[^,]*CHECK/i)
  })
})

describe('migration.sql — presentaciones, clave foranea e indices', () => {
  it('presentations se crea antes que products', () => {
    // La FK apunta a `presentations`: al reves, la migracion no aplica.
    expect(createdTables(up)).toEqual(['presentations', 'products'])
  })

  it('la FK de presentacion existe y es ON DELETE RESTRICT', () => {
    // R12 (la presentacion es obligatoria y tiene que existir) y R14 (no se borra una
    // presentacion con productos, incluidos los borrados logicamente: para la FK siguen ahi).
    const foreignKeys = up.filter((statement) => /FOREIGN KEY/i.test(statement))
    expect(foreignKeys).toHaveLength(1)
    const foreignKey = foreignKeys[0] as string
    expect(foreignKey).toMatch(/ADD CONSTRAINT "products_presentation_id_fkey"/i)
    expect(foreignKey).toMatch(/FOREIGN KEY \(\s*"?presentation_id"?\s*\)/i)
    expect(foreignKey).toMatch(/REFERENCES "?presentations"?\s*\(\s*"?id"?\s*\)/i)
    expect(isRestrictOnDelete(foreignKey)).toBe(true)
    // La columna hija es obligatoria: sin NOT NULL, R12 se cae aunque la FK sea correcta.
    expect(createProducts).toMatch(/"presentation_id" UUID NOT NULL/i)
  })

  it('la FK de presentacion es ON DELETE RESTRICT', () => {
    // R14. Sensibilidad: cualquier otra accion referencial tumba el predicado.
    const foreignKey = findStatement(up, /FOREIGN KEY/i)
    expect(isRestrictOnDelete(foreignKey)).toBe(true)

    for (const accion of ['CASCADE', 'SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      const mutado = foreignKey.replace(/ON DELETE RESTRICT/i, `ON DELETE ${accion}`)
      expect(mutado, `la mutacion a ${accion} no se aplico`).not.toBe(foreignKey)
      expect(isRestrictOnDelete(mutado), `ON DELETE ${accion} no deberia pasar`).toBe(false)
    }
  })

  it('existe el indice products_presentation_id_idx sobre la columna de la FK', () => {
    // Postgres no indexa el lado hijo de una FK: por ahi pasan tanto la consulta
    // «productos de esta presentacion» como la verificacion del RESTRICT.
    const statement = findStatement(up, /^CREATE INDEX "?products_presentation_id_idx"?/i)
    expect(statement).toMatch(/ON "?products"?\s*\(\s*"?presentation_id"?\s*\)/i)
  })

  it('la migracion no crea ningun indice unico sobre products', () => {
    // R16: dos productos pueden llamarse igual. Ni sobre `name` ni sobre nada mas.
    const unicos = up.filter((statement) => /^CREATE UNIQUE INDEX/i.test(statement))
    expect(unicos).toHaveLength(0)
    expect(createProducts).not.toMatch(/UNIQUE/i)
    // La unica unicidad de la tabla es la PK, y es sobre `id`.
    expect(createProducts).toMatch(/CONSTRAINT "products_pkey" PRIMARY KEY \(\s*"?id"?\s*\)/i)
  })
})

describe('migration.sql — idioma de los identificadores y RLS', () => {
  it('todos los identificadores creados por la migracion estan en ingles', () => {
    // R19. La lista no puede estar vacia, o la asercion no afirmaria nada.
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(15)
    expect(identificadores).toContain('products')
    expect(identificadores).toContain('min_purchase')
    expect(identificadores).toContain('products_presentation_id_fkey')

    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    // Sensibilidad de R19: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of ['compra_minima', 'existencia', 'presentacion', 'tiempo_entrega']) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('cantidad_alerta')).toBe(false)
    expect(isEnglishSnakeCase('unidad_medida')).toBe(false)
    expect(isEnglishSnakeCase('presentación_id')).toBe(false)
    expect(isEnglishSnakeCase('Products')).toBe(false)
    expect(isEnglishSnakeCase('min purchase')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('min_purchase')).toBe(true)
    expect(isEnglishSnakeCase('products_cost_non_negative')).toBe(true)
  })

  it('las dos tablas quedan con RLS activado y forzado', () => {
    // R21. Sin FORCE, el dueno de las tablas —con quien se conecta Prisma— la ignora entera.
    for (const tabla of ['presentations', 'products']) {
      expect(hasRlsEnabledAndForced(up, tabla), `${tabla} sin ENABLE + FORCE`).toBe(true)
    }
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(4)

    // Sensibilidad: quitar el FORCE de una tabla tiene que tumbar el predicado.
    const sinForce = up.filter(
      (statement) => !/^ALTER TABLE "?products"? FORCE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(sinForce.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasRlsEnabledAndForced(sinForce, 'products')).toBe(false)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto', () => {
    // R22. El indice, la FK y los cuatro CHECK caen con sus tablas: no se dropean aparte.
    const creadas = createdTables(up)
    const dropeadas = droppedTables(down)
    expect(creadas).toEqual(['presentations', 'products'])
    expect(dropeadas).toEqual([...creadas].reverse())

    // El DOWN no hace NADA mas que dropear esas dos tablas: se cuentan las sentencias.
    expect(dropeadas).toHaveLength(2)
    expect(down).toHaveLength(dropeadas.length)

    // Y en particular no toca `pgcrypto`, que ya creo la migracion de identity y de la que
    // esa feature depende. Se mira el SQL ejecutable: la cabecera lo explica en prosa.
    const downEjecutable = stripSqlComments(downSource)
    expect(downEjecutable).not.toMatch(/pgcrypto/i)
    expect(downEjecutable).not.toMatch(/DROP\s+EXTENSION/i)

    // El UP si la declara, con IF NOT EXISTS: por eso el DOWN no puede eliminarla.
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )
  })
})
