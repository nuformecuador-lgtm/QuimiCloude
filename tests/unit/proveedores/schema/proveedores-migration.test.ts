// T7 — Contrato estatico del SQL de la migracion `suppliers_and_supplier_catalog_lines`
// (QC-42: modelo-proveedores).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`specs/QC-42-modelo-proveedores/design.md` seccion 4): las TRES FK que cruzan de
// modulo —`supplier_catalog_lines_product_id_fkey` hacia `products`,
// `suppliers_created_by_fkey` y `suppliers_updated_by_fkey` hacia `users`—, el indice
// unico PARCIAL del nombre normalizado, los CUATRO CHECK (tres de no negatividad mas el
// de contacto) y los cuatro ALTER de RLS. Si una migracion futura se los lleva por
// drift, el esquema sigue validando y el cliente sigue compilando: tiene que caer aqui,
// que es la unica guardia que tienen.
//
// Cada afirmacion se escribe como un PREDICADO reutilizable y se aplica dos veces: al
// SQL real y a una version MUTADA EN MEMORIA (el archivo en disco no se toca). Las
// mutaciones obligatorias son `>= 0` -> `> -1` en los tres CHECK de no negatividad,
// quitar el `WHERE "deleted_at" IS NULL` del indice unico, `DECIMAL(14,4)` ->
// `DOUBLE PRECISION`, un `RESTRICT` -> `CASCADE`, y el `OR` de
// `suppliers_contact_required` -> `AND`. Un test que no puede fallar no vigila nada.
//
// Cubre R2, R4, R5, R7, R9, R11, R13, R14, R16, R17, R19, R22, R24, R26, R29, R31, R32,
// R33, R34.

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
  '20260903131417_suppliers_and_supplier_catalog_lines',
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

const createSuppliers = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?suppliers"?/i)
const createSupplierCatalogLines = findStatement(
  up,
  /^CREATE TABLE (?:IF NOT EXISTS )?"?supplier_catalog_lines"?/i,
)

// --- Predicados reutilizables: los mismos que usan los tests de sensibilidad de abajo ---

/** ¿La columna se declara como decimal exacto (14,4)? (R14) */
function declaresExactDecimal(statement: string, column: string): boolean {
  const esDecimalExacto = new RegExp(`"${column}"\\s+DECIMAL\\s*\\(\\s*14\\s*,\\s*4\\s*\\)`, 'i').test(
    statement,
  )
  const esComaFlotante = new RegExp(
    `"${column}"\\s+(DOUBLE\\s+PRECISION|FLOAT\\d*|REAL)\\b`,
    'i',
  ).test(statement)
  return esDecimalExacto && !esComaFlotante
}

/** ¿El CHECK exige que la columna no sea negativa (>= 0), sin relajarla? (R17) */
function isNonNegativeCheck(statement: string, column: string): boolean {
  const admiteCero = new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>=\\s*0\\s*\\)`, 'i').test(
    statement,
  )
  const relajado = new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>\\s*-1\\s*\\)`, 'i').test(statement)
  return admiteCero && !relajado
}

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R22, R31) */
function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** ¿La clave foranea propaga el borrado FISICO del padre a sus hijos? (R29) */
function isCascadeOnDelete(statement: string): boolean {
  const propaga = /ON\s+DELETE\s+CASCADE/i.test(statement)
  const retiene = /ON\s+DELETE\s+(RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return propaga && !retiene
}

/** ¿Existe el indice UNICO sobre `name_normalized` de `suppliers`? (R7) */
function hasUniqueIndexOnNormalizedName(source: readonly string[]): boolean {
  return source.some(
    (statement) =>
      /^CREATE UNIQUE INDEX "?\w+"? ON "?suppliers"?\s*\(\s*"?name_normalized"?\s*\)/i.test(
        statement,
      ),
  )
}

/** ¿Ese indice unico es PARCIAL, y solo alcanza a los proveedores vivos? (R9) */
function isPartialOnLiveRows(statement: string): boolean {
  return /WHERE\s+"?deleted_at"?\s+IS\s+NULL/i.test(statement)
}

/** ¿El CHECK de contacto exige AL MENOS UNO de los dos (OR), no los dos (AND)? (R4) */
function requiresAtLeastOneContact(statement: string): boolean {
  const conOr = /CHECK\s*\(\s*"?phone"?\s+IS\s+NOT\s+NULL\s+OR\s+"?email"?\s+IS\s+NOT\s+NULL\s*\)/i.test(
    statement,
  )
  const conAnd = /CHECK\s*\(\s*"?phone"?\s+IS\s+NOT\s+NULL\s+AND\s+"?email"?\s+IS\s+NOT\s+NULL\s*\)/i.test(
    statement,
  )
  return conOr && !conAnd
}

/** ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. (R33) */
function hasRlsEnabledAndForced(source: readonly string[], table: string): boolean {
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/** ¿La columna se declara UUID y ANULABLE (sin `NOT NULL`)? (R24) */
function isNullableUuidColumn(statement: string, column: string): boolean {
  const match = new RegExp(`"${column}" ([A-Z ()0-9,]+?)(,|$)`, 'i').exec(statement)
  if (match === null || match[1] === undefined) return false
  const declaracion = match[1].trim()
  return /^UUID\b/i.test(declaracion) && !/NOT NULL/i.test(declaracion)
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
 * Vocabulario ingles admitido para los identificadores de esta feature (R32). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'by',
  'catalog',
  'contact',
  'cost',
  'created',
  'deleted',
  'delivery',
  'email',
  'fkey',
  'id',
  'idx',
  'key',
  'line',
  'lines',
  'min',
  'name',
  'negative',
  'non',
  'normalized',
  'phone',
  'pkey',
  'product',
  'purchase',
  'required',
  'supplier',
  'suppliers',
  'time',
  'unique',
  'updated',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R32) */
function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

describe('migration.sql — columnas y tipos', () => {
  it('suppliers se crea antes que supplier_catalog_lines', () => {
    // La FK interna apunta a `suppliers`: al reves, la migracion no aplica.
    expect(createdTables(up)).toEqual(['suppliers', 'supplier_catalog_lines'])
  })

  it('ninguna columna de las dos tablas declara VARCHAR(n)', () => {
    // R5: los largos (120 el nombre) son validacion de aplicacion (QC-43), no de la
    // columna.
    for (const statement of [createSuppliers, createSupplierCatalogLines]) {
      expect(statement).not.toMatch(/VARCHAR\s*\(/i)
      expect(statement).not.toMatch(/CHARACTER\s+VARYING/i)
      expect(statement).not.toMatch(/\bCHAR\s*\(/i)
    }
    expect(createSuppliers).toMatch(/"name" TEXT NOT NULL/i)
    expect(createSuppliers).toMatch(/"name_normalized" TEXT NOT NULL/i)
    expect(createSuppliers).toMatch(/"phone" TEXT/i)
    expect(createSuppliers).toMatch(/"email" TEXT/i)
    expect(up.filter((statement) => /length\s*\(/i.test(statement))).toHaveLength(0)
  })

  it('cost y min_purchase se declaran DECIMAL(14,4) y el test cae si alguien lo cambia a double precision', () => {
    // R14. Primero la afirmacion sobre el archivo real...
    expect(declaresExactDecimal(createSupplierCatalogLines, 'cost')).toBe(true)
    expect(declaresExactDecimal(createSupplierCatalogLines, 'min_purchase')).toBe(true)
    expect(createSupplierCatalogLines).toMatch(/"cost" DECIMAL\(14,4\) NOT NULL/i)
    expect(createSupplierCatalogLines).toMatch(/"min_purchase" DECIMAL\(14,4\)/i)

    // ...y despues la sensibilidad: mutacion EN MEMORIA, el archivo en disco no se toca.
    const mutado = createSupplierCatalogLines.replace(
      /"cost" DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i,
      '"cost" DOUBLE PRECISION',
    )
    expect(mutado, 'la mutacion no se aplico: cambio el texto de la migracion').not.toBe(
      createSupplierCatalogLines,
    )
    expect(declaresExactDecimal(mutado, 'cost')).toBe(false)

    // Y tampoco vale un decimal con otra precision.
    const otraPrecision = createSupplierCatalogLines.replace(
      /"cost" DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i,
      '"cost" DECIMAL(10,2)',
    )
    expect(declaresExactDecimal(otraPrecision, 'cost')).toBe(false)
  })

  it('delivery_time es INTEGER, no decimal', () => {
    // R16: el plazo se guarda como numero entero de dias.
    expect(createSupplierCatalogLines).toMatch(/"delivery_time" INTEGER/i)
    expect(createSupplierCatalogLines).not.toMatch(/"delivery_time" DECIMAL/i)
  })

  it('product_id y cost son NOT NULL; min_purchase y delivery_time admiten NULL', () => {
    // R13: la ausencia de minimo y plazo es legitima; el producto y el costo son
    // obligatorios.
    expect(createSupplierCatalogLines).toMatch(/"product_id" UUID NOT NULL/i)
    expect(createSupplierCatalogLines).toMatch(/"supplier_id" UUID NOT NULL/i)
    expect(createSupplierCatalogLines).toMatch(/"cost" DECIMAL\(14,4\) NOT NULL/i)
    expect(createSupplierCatalogLines).not.toMatch(/"min_purchase" DECIMAL\(14,4\) NOT NULL/i)
    expect(createSupplierCatalogLines).not.toMatch(/"delivery_time" INTEGER NOT NULL/i)
  })

  it('name es NOT NULL en la tabla suppliers', () => {
    // R2: sin nombre no hay fila, y el rechazo es de la propia base.
    expect(createSuppliers).toMatch(/"name" TEXT NOT NULL/i)
  })

  it('created_by y updated_by son UUID anulables', () => {
    // R24: un proveedor puede no tener autor —una importacion, un seed—.
    for (const columna of ['created_by', 'updated_by']) {
      expect(isNullableUuidColumn(createSuppliers, columna), `${columna} debe ser UUID anulable`).toBe(
        true,
      )
    }
    // Sensibilidad del predicado: con `NOT NULL` tiene que caer, y con otra columna tambien.
    const conNotNull = createSuppliers.replace('"created_by" UUID,', '"created_by" UUID NOT NULL,')
    expect(conNotNull, 'la mutacion no se aplico').not.toBe(createSuppliers)
    expect(isNullableUuidColumn(conNotNull, 'created_by')).toBe(false)
    expect(isNullableUuidColumn(createSuppliers, 'name')).toBe(false)
  })

  it('las dos FK de auditoria no son ON DELETE SET NULL', () => {
    // R24: la ausencia de autor es NULL desde el origen —«no lo creo una persona»—, no
    // el resultado de que borraron al usuario. `SET NULL` confundiria las dos cosas.
    for (const constraint of ['suppliers_created_by_fkey', 'suppliers_updated_by_fkey']) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} no puede anular la columna`).not.toMatch(
        /ON\s+DELETE\s+SET\s+NULL/i,
      )
      expect(isRestrictOnDelete(statement), `${constraint} debe ser RESTRICT`).toBe(true)
    }
  })
})

describe('migration.sql — CHECK de no negatividad', () => {
  const checkCost = findStatement(
    up,
    /ADD CONSTRAINT "?supplier_catalog_lines_cost_non_negative"?/i,
  )
  const checkMinPurchase = findStatement(
    up,
    /ADD CONSTRAINT "?supplier_catalog_lines_min_purchase_non_negative"?/i,
  )
  const checkDeliveryTime = findStatement(
    up,
    /ADD CONSTRAINT "?supplier_catalog_lines_delivery_time_non_negative"?/i,
  )

  it('los tres CHECK de no negatividad existen, y el test cae si se relaja >= 0 a > -1', () => {
    // R17 y decision cerrada 5: ninguno de los tres admite negativos, y el 0 si es valido
    // (pregunta abierta 1 de `requirements.md`).
    for (const [statement, column] of [
      [checkCost, 'cost'],
      [checkMinPurchase, 'min_purchase'],
      [checkDeliveryTime, 'delivery_time'],
    ] as const) {
      expect(isNonNegativeCheck(statement, column), `${column} debe ser >= 0`).toBe(true)
      expect(statement).toMatch(/ALTER TABLE "?supplier_catalog_lines"?/i)

      // Sensibilidad OBLIGATORIA: mutar `>= 0` a `> -1` (equivalente numerico, pero no lo
      // que el esquema declara) tiene que tumbar el predicado.
      const mutado = statement.replace(/>=\s*0/, '> -1')
      expect(mutado, `la mutacion no se aplico sobre ${column}`).not.toBe(statement)
      expect(isNonNegativeCheck(mutado, column), `un CHECK > -1 no deberia pasar para ${column}`).toBe(
        false,
      )
    }

    // Exactamente cuatro CHECK en toda la migracion: los tres de no negatividad mas el
    // de contacto (R4).
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(4)
  })
})

describe('migration.sql — CHECK de contacto', () => {
  const checkContact = findStatement(up, /ADD CONSTRAINT "?suppliers_contact_required"?/i)

  it('existe suppliers_contact_required con OR, y el test cae si se cambia a AND', () => {
    // R4 y decision cerrada 7: la regla cruzada «al menos telefono o correo» vive EN LA
    // BASE, no solo en la aplicacion.
    expect(requiresAtLeastOneContact(checkContact)).toBe(true)
    expect(checkContact).toMatch(/ALTER TABLE "?suppliers"?/i)
    expect(checkContact).toMatch(/"phone"\s+IS\s+NOT\s+NULL/i)
    expect(checkContact).toMatch(/"email"\s+IS\s+NOT\s+NULL/i)

    // Sensibilidad OBLIGATORIA: cambiar el OR por AND exigiria los dos contactos a la
    // vez, que es una regla distinta y mas estricta que la que pide R4.
    const mutado = checkContact.replace(/\bOR\b/i, 'AND')
    expect(mutado, 'la mutacion no se aplico sobre el CHECK de contacto').not.toBe(checkContact)
    expect(requiresAtLeastOneContact(mutado), 'un CHECK con AND no deberia pasar').toBe(false)
  })
})

describe('migration.sql — claves foraneas e indices', () => {
  const fkSupplier = findStatement(
    up,
    /ADD CONSTRAINT "?supplier_catalog_lines_supplier_id_fkey"?/i,
  )
  const fkProduct = findStatement(
    up,
    /ADD CONSTRAINT "?supplier_catalog_lines_product_id_fkey"?/i,
  )

  it('las FK de supplier_id y product_id existen', () => {
    // R11, R13: una linea sin proveedor, sin producto, o con un proveedor o un producto
    // inexistentes se rechaza en la propia base.
    expect(fkSupplier).toMatch(/FOREIGN KEY \(\s*"?supplier_id"?\s*\)/i)
    expect(fkSupplier).toMatch(/REFERENCES "?suppliers"?\s*\(\s*"?id"?\s*\)/i)
    expect(fkProduct).toMatch(/FOREIGN KEY \(\s*"?product_id"?\s*\)/i)
    expect(fkProduct).toMatch(/REFERENCES "?products"?\s*\(\s*"?id"?\s*\)/i)
    expect(createSupplierCatalogLines).toMatch(/"supplier_id" UUID NOT NULL/i)
    expect(createSupplierCatalogLines).toMatch(/"product_id" UUID NOT NULL/i)
  })

  it('las tres FK que cruzan de modulo existen en el SQL con ON DELETE RESTRICT, y ninguna es SET NULL', () => {
    // R22: la referencia al producto y las dos de auditoria son escalares SIN
    // `@relation` en Prisma —para que el ORM no pueda atravesar de modulo con un
    // `include`— pero la FK es REAL y esta escrita a mano aqui (`design.md` seccion 4.1).
    const aMano = [
      ['supplier_catalog_lines_product_id_fkey', 'supplier_catalog_lines', 'product_id', 'products'],
      ['suppliers_created_by_fkey', 'suppliers', 'created_by', 'users'],
      ['suppliers_updated_by_fkey', 'suppliers', 'updated_by', 'users'],
    ] as const

    for (const [constraint, table, column, target] of aMano) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} sobre ${table}`).toMatch(
        new RegExp(`ALTER TABLE "?${table}"?`, 'i'),
      )
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(new RegExp(`REFERENCES "?${target}"?\\s*\\(\\s*"?id"?\\s*\\)`, 'i'))
      expect(statement).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
      expect(isRestrictOnDelete(statement), `${constraint} debe ser ON DELETE RESTRICT`).toBe(true)
      expect(statement).toMatch(/ON UPDATE CASCADE/i)
    }

    // Sensibilidad OBLIGATORIA: cambiar un RESTRICT por CASCADE tiene que tumbar el
    // predicado.
    const mutado = fkProduct.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkProduct)
    expect(isRestrictOnDelete(mutado), 'ON DELETE CASCADE no deberia pasar').toBe(false)
    for (const accion of ['SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      expect(isRestrictOnDelete(fkProduct.replace(/ON DELETE RESTRICT/i, `ON DELETE ${accion}`))).toBe(
        false,
      )
    }

    // La migracion crea exactamente cuatro FK: las tres a mano mas la interna.
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(4)
  })

  it('las dos FK de auditoria apuntan a users', () => {
    // R24: el autor y el ultimo editor son usuarios que existen. La integridad la
    // garantiza la base aunque Prisma no declare la relacion.
    for (const [constraint, column] of [
      ['suppliers_created_by_fkey', 'created_by'],
      ['suppliers_updated_by_fkey', 'updated_by'],
    ] as const) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement).toMatch(/ALTER TABLE "?suppliers"?/i)
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(/REFERENCES "?users"?\s*\(\s*"?id"?\s*\)/i)
    }
    // Con su indice del lado hijo: por ahi pasa la verificacion del RESTRICT.
    for (const index of ['suppliers_created_by_idx', 'suppliers_updated_by_idx']) {
      expect(up.some((statement) => new RegExp(`^CREATE INDEX "?${index}"?`, 'i').test(statement)))
        .toBe(true)
    }
    // El indice del lado hijo de la FK al producto tambien existe.
    const index = findStatement(up, /^CREATE INDEX "?supplier_catalog_lines_product_id_idx"?/i)
    expect(index).toMatch(/ON "?supplier_catalog_lines"?\s*\(\s*"?product_id"?\s*\)/i)
  })

  it('la FK supplier_catalog_lines_supplier_id_fkey es ON DELETE CASCADE, y el test cae si se cambia a RESTRICT', () => {
    // R29: borrar FISICAMENTE un proveedor se lleva sus lineas y no deja huerfanas. En
    // operacion normal no se dispara nunca, porque el borrado del proveedor es LOGICO y
    // ninguna FK reacciona a un UPDATE.
    expect(isCascadeOnDelete(fkSupplier)).toBe(true)

    const mutado = fkSupplier.replace(/ON DELETE CASCADE/i, 'ON DELETE RESTRICT')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkSupplier)
    expect(isCascadeOnDelete(mutado), 'ON DELETE RESTRICT no deberia pasar').toBe(false)
    expect(isCascadeOnDelete(fkSupplier.replace(/ON DELETE CASCADE/i, 'ON DELETE SET NULL'))).toBe(
      false,
    )
  })

  it('la FK a products es ON DELETE RESTRICT', () => {
    // R31: un producto dado de baja LOGICAMENTE conserva su fila, asi que la linea sigue
    // apuntandolo; y un borrado FISICO de un producto usado por alguna linea se rechaza.
    expect(isRestrictOnDelete(fkProduct)).toBe(true)
    expect(fkProduct).toMatch(/REFERENCES "?products"?/i)
    const mutado = fkProduct.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(mutado).not.toBe(fkProduct)
    expect(isRestrictOnDelete(mutado)).toBe(false)
  })

  it('existe el indice unico (supplier_id, product_id), no parcial', () => {
    // R11 y decision cerrada 3: un producto no puede aparecer dos veces en el catalogo
    // del mismo proveedor, y lo rechaza la BASE. Sirve ademas de indice para «lineas de
    // este proveedor» por el prefijo izquierdo.
    const statement = findStatement(
      up,
      /^CREATE UNIQUE INDEX "?supplier_catalog_lines_supplier_id_product_id_key"?/i,
    )
    expect(statement).toMatch(
      /ON "?supplier_catalog_lines"?\s*\(\s*"?supplier_id"?\s*,\s*"?product_id"?\s*\)/i,
    )
    // No es parcial: la unicidad de la pareja alcanza a TODAS las lineas, porque la
    // linea no tiene borrado logico (R28).
    expect(statement).not.toMatch(/WHERE/i)
  })
})

describe('migration.sql — unicidad del nombre normalizado', () => {
  const uniqueName = findStatement(up, /^CREATE UNIQUE INDEX "?suppliers_name_unique"?/i)

  it('existe CREATE UNIQUE INDEX sobre name_normalized, y el test cae si desaparece', () => {
    // R7: la unicidad del nombre la garantiza un INDICE, no una comparacion al vuelo
    // (decision cerrada 8). Prisma no modela indices parciales, asi que este indice vive
    // SOLO en este archivo.
    expect(hasUniqueIndexOnNormalizedName(up)).toBe(true)
    expect(uniqueName).toMatch(/ON "?suppliers"?\s*\(\s*"?name_normalized"?\s*\)/i)

    const sinIndice = up.filter((statement) => statement !== uniqueName)
    expect(sinIndice.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasUniqueIndexOnNormalizedName(sinIndice)).toBe(false)

    const noUnico = up.map((statement) =>
      statement === uniqueName ? statement.replace(/CREATE UNIQUE INDEX/i, 'CREATE INDEX') : statement,
    )
    expect(hasUniqueIndexOnNormalizedName(noUnico)).toBe(false)
  })

  it('el indice unico del nombre es PARCIAL (WHERE deleted_at IS NULL), y el test cae si se quita el WHERE', () => {
    // R9 y decision cerrada 8: borrar logicamente un proveedor LIBERA su nombre. Con un
    // indice total, borrar un proveedor quemaria su nombre para siempre.
    expect(isPartialOnLiveRows(uniqueName)).toBe(true)

    // Sensibilidad OBLIGATORIA: quitar el WHERE tiene que tumbar el predicado.
    const sinWhere = uniqueName.replace(/\s*WHERE\s+"deleted_at"\s+IS\s+NULL/i, '')
    expect(sinWhere, 'la mutacion no quito el WHERE').not.toBe(uniqueName)
    expect(isPartialOnLiveRows(sinWhere), 'un indice total no deberia pasar').toBe(false)

    const otroWhere = uniqueName.replace(
      /WHERE\s+"deleted_at"\s+IS\s+NULL/i,
      'WHERE "deleted_at" IS NOT NULL',
    )
    expect(isPartialOnLiveRows(otroWhere)).toBe(false)
  })
})

describe('migration.sql — no toca products ni users salvo sus propias FK', () => {
  it('la migracion no contiene ningun ALTER TABLE "products" ni ALTER TABLE "users"', () => {
    // R19: esta feature no toca `products`. Las unicas menciones de `products` y `users`
    // son las FK que `supplier_catalog_lines` y `suppliers` declaran sobre SI MISMAS
    // (el `ALTER TABLE` afecta a la tabla de esta feature, `products`/`users` solo
    // aparece dentro de `REFERENCES`).
    expect(up.some((statement) => /^ALTER TABLE "?products"?\b/i.test(statement))).toBe(false)
    expect(up.some((statement) => /^ALTER TABLE "?users"?\b/i.test(statement))).toBe(false)
    expect(up.some((statement) => /^CREATE TABLE "?products"?\b/i.test(statement))).toBe(false)
    expect(up.some((statement) => /^CREATE TABLE "?users"?\b/i.test(statement))).toBe(false)

    // Toda mencion a `products` o `users` en las sentencias que SI son de esta feature
    // (las que empiezan por `ALTER TABLE "supplier_catalog_lines"` o `"suppliers"`) solo
    // puede aparecer dentro de un `REFERENCES`.
    const alteresDeLaFeature = up.filter((statement) =>
      /^ALTER TABLE "?(supplier_catalog_lines|suppliers)"?\b/i.test(statement),
    )
    for (const statement of alteresDeLaFeature) {
      if (/\bproducts\b|\busers\b/i.test(statement)) {
        expect(statement, `mencion a products/users fuera de REFERENCES: ${statement}`).toMatch(
          /REFERENCES\s+"?(products|users)"?/i,
        )
      }
    }
  })
})

describe('migration.sql — idioma de los identificadores y RLS', () => {
  it('todos los identificadores creados por la migracion estan en ingles', () => {
    // R32. La lista no puede estar vacia, o la asercion no afirmaria nada.
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(15)
    expect(identificadores).toContain('suppliers')
    expect(identificadores).toContain('supplier_catalog_lines')
    expect(identificadores).toContain('name_normalized')
    expect(identificadores).toContain('supplier_catalog_lines_product_id_fkey')
    expect(identificadores).toContain('suppliers_name_unique')

    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    // Sensibilidad de R32: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of ['proveedor', 'proveedores', 'catalogo', 'costo', 'minimo', 'plazo']) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('nombre_normalizado')).toBe(false)
    expect(isEnglishSnakeCase('suppliers_creado_por_fkey')).toBe(false)
    expect(isEnglishSnakeCase('Suppliers')).toBe(false)
    expect(isEnglishSnakeCase('supplier catalog lines')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('name_normalized')).toBe(true)
    expect(isEnglishSnakeCase('supplier_catalog_lines_cost_non_negative')).toBe(true)
  })

  it('las dos tablas quedan con RLS activado y forzado', () => {
    // R33. Sin FORCE, el dueno de las tablas —con quien se conecta Prisma— la ignora
    // entera.
    for (const tabla of ['suppliers', 'supplier_catalog_lines']) {
      expect(hasRlsEnabledAndForced(up, tabla), `${tabla} sin ENABLE + FORCE`).toBe(true)
    }
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(4)

    // Sensibilidad OBLIGATORIA: quitar el FORCE de una tabla tiene que tumbar el
    // predicado.
    const sinForce = up.filter(
      (statement) =>
        !/^ALTER TABLE "?supplier_catalog_lines"? FORCE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(sinForce.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasRlsEnabledAndForced(sinForce, 'supplier_catalog_lines')).toBe(false)
    expect(hasRlsEnabledAndForced(sinForce, 'suppliers')).toBe(true)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto', () => {
    // R34. Los indices (incluido el unico parcial), los CUATRO CHECK y las CUATRO FK
    // —tambien las tres escritas a mano hacia `products` y `users`— caen con sus
    // tablas: no se dropean aparte.
    const creadas = createdTables(up)
    const dropeadas = droppedTables(down)
    expect(creadas).toEqual(['suppliers', 'supplier_catalog_lines'])
    expect(dropeadas).toEqual([...creadas].reverse())

    // El DOWN no hace NADA mas que dropear esas dos tablas: se cuentan las sentencias.
    expect(dropeadas).toHaveLength(2)
    expect(down).toHaveLength(dropeadas.length)
    expect(down.every((statement) => /^DROP TABLE IF EXISTS/i.test(statement))).toBe(true)

    // Y en particular no toca `pgcrypto`, que ya crearon las migraciones de identity,
    // inventario y recetas. Se mira el SQL ejecutable: la cabecera lo explica en prosa.
    const downEjecutable = stripSqlComments(downSource)
    expect(downEjecutable).not.toMatch(/pgcrypto/i)
    expect(downEjecutable).not.toMatch(/DROP\s+EXTENSION/i)

    // El UP si la declara, con IF NOT EXISTS: por eso el DOWN no puede eliminarla.
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )

    // El DOWN no toca ninguna tabla de otro modulo: revertir esta migracion no puede
    // llevarse `users`, `products`, `recipes` ni `recipe_lines` por delante.
    for (const ajena of [
      'users',
      'roles',
      'document_types',
      'products',
      'presentations',
      'recipes',
      'recipe_lines',
    ]) {
      expect(dropeadas, `el DOWN no debe dropear ${ajena}`).not.toContain(ajena)
      expect(downEjecutable).not.toMatch(new RegExp(`\\b${ajena}\\b`, 'i'))
    }
  })
})
