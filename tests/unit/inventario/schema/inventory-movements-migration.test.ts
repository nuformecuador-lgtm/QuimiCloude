// Contrato ESTATICO del SQL de `*_inventory_movements` y de las escrituras que `lib/` hace sobre
// `inventoryMovement`. Cubre R11, R14, R15, R16 y R31, que hasta ahora no tenian ningun test.
//
// Mismo patron que los hermanos de esta carpeta: cada afirmacion es un predicado puro exportado,
// aplicado al texto real y a una copia mutada EN MEMORIA. El archivo en disco nunca se toca; una
// mutacion que no cambia nada no demuestra que el detector muerda.

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

const movementDirs = readdirSync(migrationsDir).filter((name) => name.endsWith('_inventory_movements'))
expect(movementDirs, 'debe existir exactamente una migracion *_inventory_movements').toHaveLength(1)
const migrationDir = join(migrationsDir, movementDirs[0] as string)

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** Lo que se afirma es SQL ejecutable, no prosa. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados para poder medir posiciones y contenido. */
export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

// --- R11: el censo exacto de columnas -------------------------------------------------------

/** Parte una lista de argumentos por comas de nivel superior, sin romper `gen_random_uuid()`. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/**
 * Las columnas declaradas por el `CREATE TABLE "inventory_movements"` del texto dado, con su
 * definicion completa. Vacio si el `CREATE TABLE` no aparece con esa forma -no lanza, no miente-.
 */
export function tableColumns(sql: string): ReadonlyArray<{ readonly name: string; readonly definition: string }> {
  const createStatement = statements(sql).find((s) => /^CREATE TABLE "?inventory_movements"?/i.test(s))
  if (createStatement === undefined) return []
  const open = createStatement.indexOf('(')
  const close = createStatement.lastIndexOf(')')
  if (open === -1 || close === -1 || close <= open) return []
  return splitTopLevel(createStatement.slice(open + 1, close))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !/^CONSTRAINT\b/i.test(entry))
    .map((entry) => {
      const match = /^"?(\w+)"?\s+(.*)$/.exec(entry)
      return match ? { name: match[1] as string, definition: (match[2] as string).trim() } : { name: '', definition: entry }
    })
}

/**
 * R11. ¿El censo de columnas es EXACTAMENTE `{id, batch_id, kind, quantity, reason, company_id,
 * created_by, created_at}`, con `quantity` como `INTEGER NOT NULL` -entero con signo-, `reason`
 * anulable y `company_id` obligatoria?
 *
 * Igualdad exacta, no `toContain`: una columna de mas o de menos tiene que tumbar el test.
 */
export function hasExactColumnCensus(sql: string): boolean {
  const columns = tableColumns(sql)
  const names = [...columns.map((c) => c.name)].sort()
  const expected = ['batch_id', 'company_id', 'created_at', 'created_by', 'id', 'kind', 'quantity', 'reason'].sort()
  if (names.length === 0 || JSON.stringify(names) !== JSON.stringify(expected)) return false
  const quantity = columns.find((c) => c.name === 'quantity')
  const reason = columns.find((c) => c.name === 'reason')
  const companyId = columns.find((c) => c.name === 'company_id')
  if (quantity === undefined || reason === undefined || companyId === undefined) return false
  const quantityIsSignedInteger = /^INTEGER\s+NOT\s+NULL$/i.test(quantity.definition)
  const reasonIsNullable = !/NOT\s+NULL/i.test(reason.definition)
  const companyIdIsRequired = /NOT\s+NULL/i.test(companyId.definition)
  return quantityIsSignedInteger && reasonIsNullable && companyIdIsRequired
}

// --- R14: sin asientos retroactivos ----------------------------------------------------------

/**
 * ¿El texto contiene un `INSERT INTO "<table>"` de verdad? Distingue del `BEFORE INSERT` de un
 * disparador y de la palabra suelta en un comentario -ya quitados por `stripSqlComments`-: exige
 * literalmente `INSERT` seguido de `INTO` y el nombre de la tabla.
 */
export function containsInsertInto(sql: string, table: string): boolean {
  return new RegExp(`INSERT\\s+INTO\\s+"?${table}"?`, 'i').test(stripSqlComments(sql))
}

type MigrationFiles = { readonly name: string; readonly upSql: string; readonly downSql: string }

/** Lee `migration.sql`/`down.sql` de cada carpeta de `db/migrations`; cadena vacia si falta. */
function readAllMigrations(dir: string): readonly MigrationFiles[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folder = join(dir, entry.name)
      const read = (file: string): string => {
        try {
          return readFileSync(join(folder, file), 'utf8')
        } catch {
          return ''
        }
      }
      return { name: entry.name, upSql: read('migration.sql'), downSql: read('down.sql') }
    })
}

/** R14 (segunda mitad). ¿NINGUNA migracion del repo inserta filas en `inventory_movements`? */
export function noMigrationInsertsIntoInventoryMovements(migrations: readonly MigrationFiles[]): boolean {
  return migrations.every(
    (migration) =>
      !containsInsertInto(migration.upSql, 'inventory_movements') &&
      !containsInsertInto(migration.downSql, 'inventory_movements'),
  )
}

// --- R15: solo altas ---------------------------------------------------------------------------

/** R15(a). ¿El texto NO ofrece ninguna via de `UPDATE`/`DELETE` sobre `inventory_movements`? */
export function grantsNoUpdateOrDeletePath(sql: string): boolean {
  const text = stripSqlComments(sql)
  const hasUpdate = /UPDATE\s+"?inventory_movements"?\s+SET/i.test(text)
  const hasDelete = /DELETE\s+FROM\s+"?inventory_movements"?/i.test(text)
  return !hasUpdate && !hasDelete
}

/** R15(a). ¿La tabla nace SIN `updated_at` ni `deleted_at` -lo que haria posible corregir en silencio? */
export function tableHasNoMutationTimestamps(sql: string): boolean {
  const columns = tableColumns(sql).map((c) => c.name)
  return columns.length > 0 && !columns.includes('updated_at') && !columns.includes('deleted_at')
}

const LIB_DIR = 'lib'
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage'])
const SOURCE_SUFFIXES = ['.ts', '.tsx']

/** Archivos fuente bajo `lib/`, en ruta relativa al repo con `/`. */
function filesUnderLib(root: string): string[] {
  const found: string[] = []
  const base = join(root, LIB_DIR)
  const walk = (directory: string, relative: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        walk(full, childRelative)
        continue
      }
      if (SOURCE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) found.push(`${LIB_DIR}/${childRelative}`)
    }
  }
  walk(base, '')
  return found
}

/** Los nombres de operacion (`create`, `update`, ...) llamados sobre `inventoryMovement` en el texto. */
export function inventoryMovementOperationsIn(source: string): string[] {
  return [...source.matchAll(/\.inventoryMovement\.(\w+)\s*\(/g)].map((match) => match[1] as string)
}

/** R15(b). Censo EN POSITIVO: todas las operaciones sobre `inventoryMovement` bajo `lib/`. */
function allInventoryMovementOperations(root: string): string[] {
  return filesUnderLib(root).flatMap((file) => inventoryMovementOperationsIn(readFileSync(join(root, file), 'utf8')))
}

// --- R16: ingles y snake_case, y esta ficha no borra lotes ------------------------------------

/**
 * R16. ¿Todo identificador CREADO por esta migracion -tabla, columnas, indices, restricciones,
 * funcion, disparador- cumple `^[a-z][a-z0-9_]*$`?
 *
 * `length > 0` es la autoprueba de vacuidad: si el patron de extraccion deja de encontrar algo
 * -por ejemplo porque la migracion cambio de forma-, el test cae en vez de pasar sobre una lista
 * vacia.
 */
export function allCreatedIdentifiersAreSnakeCase(sql: string): boolean {
  const text = stripSqlComments(sql)
  const declared = [
    ...text.matchAll(
      /(?:CREATE TABLE|ADD COLUMN|CREATE INDEX|CREATE UNIQUE INDEX|ADD CONSTRAINT|CREATE TRIGGER|CONSTRAINT)\s+"(\w+)"/gi,
    ),
  ].map((match) => match[1] as string)
  const functions = [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+(\w+)\s*\(/gi)].map(
    (match) => match[1] as string,
  )
  const all = [...declared, ...functions]
  return all.length > 0 && all.every((identifier) => /^[a-z][a-z0-9_]*$/.test(identifier))
}

/** R16. ¿La migracion NO anade marca de borrado ni borra filas ni la propia tabla `product_batches`? */
export function doesNotDropOrDeleteProductBatches(sql: string): boolean {
  const text = stripSqlComments(sql)
  const marksDeletion = /ALTER TABLE\s+"?product_batches"?\s+ADD COLUMN\s+"?deleted_at"?/i.test(text)
  const dropsTable = /DROP\s+TABLE\s+"?product_batches"?/i.test(text)
  const deletesRows = /DELETE\s+FROM\s+"?product_batches"?/i.test(text)
  return !marksDeletion && !dropsTable && !deletesRows
}

// --- R31: el down.sql corresponde exactamente al migration.sql, en orden inverso ---------------

type CreatedObjects = {
  readonly tables: readonly string[]
  readonly foreignKeys: readonly string[]
  readonly indexes: readonly string[]
  readonly checks: readonly string[]
  readonly functions: readonly string[]
  readonly triggers: readonly string[]
}

/** Lo que el `migration.sql` CREA, derivado del texto -nunca escrito a mano-. */
export function objectsCreatedByUp(sql: string): CreatedObjects {
  const text = stripSqlComments(sql)
  return {
    tables: [...text.matchAll(/CREATE TABLE "(\w+)"/gi)].map((m) => m[1] as string),
    foreignKeys: [...text.matchAll(/ADD CONSTRAINT "(\w+)"\s+FOREIGN KEY/gi)].map((m) => m[1] as string),
    indexes: [...text.matchAll(/CREATE (?:UNIQUE )?INDEX "(\w+)"/gi)].map((m) => m[1] as string),
    checks: [...text.matchAll(/ADD CONSTRAINT "(\w+)"\s+CHECK/gi)].map((m) => m[1] as string),
    functions: [...text.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (\w+)\(/gi)].map((m) => m[1] as string),
    triggers: [...text.matchAll(/CREATE TRIGGER "(\w+)"/gi)].map((m) => m[1] as string),
  }
}

/** Lo que el `down.sql` REVIERTE, derivado del texto -nunca escrito a mano-. */
export function objectsDroppedByDown(sql: string): CreatedObjects {
  const text = stripSqlComments(sql)
  const droppedConstraints = [...text.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"(\w+)"/gi)].map(
    (m) => m[1] as string,
  )
  return {
    tables: [...text.matchAll(/DROP TABLE (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
    foreignKeys: droppedConstraints.filter((name) => name.endsWith('_fkey')),
    indexes: [...text.matchAll(/DROP INDEX (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
    checks: droppedConstraints.filter((name) => !name.endsWith('_fkey')),
    functions: [...text.matchAll(/DROP FUNCTION (?:IF EXISTS )?(\w+)\(/gi)].map((m) => m[1] as string),
    triggers: [...text.matchAll(/DROP TRIGGER (?:IF EXISTS )?"(\w+)"/gi)].map((m) => m[1] as string),
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')
}

/**
 * R31. ¿El `down.sql` revierte, por CORRESPONDENCIA, cada objeto que el `migration.sql` crea: la
 * tabla, las 3 FK, los 3 indices, los 2 CHECK, la funcion y el disparador?
 *
 * Los limites de cantidad (1/3/3/2/1/1) son la autoprueba de vacuidad: si un patron dejara de
 * encontrar nada, la longitud caeria a 0 y el test se pondria rojo, no pasaria por descarte.
 */
export function downDropsExactlyWhatUpCreates(upSql: string, downSql: string): boolean {
  const created = objectsCreatedByUp(upSql)
  const dropped = objectsDroppedByDown(downSql)
  return (
    sameSet(created.tables, dropped.tables) &&
    sameSet(created.foreignKeys, dropped.foreignKeys) &&
    sameSet(created.indexes, dropped.indexes) &&
    sameSet(created.checks, dropped.checks) &&
    sameSet(created.functions, dropped.functions) &&
    sameSet(created.triggers, dropped.triggers) &&
    created.tables.length === 1 &&
    created.foreignKeys.length === 3 &&
    created.indexes.length === 3 &&
    created.checks.length === 2 &&
    created.functions.length === 1 &&
    created.triggers.length === 1
  )
}

/**
 * R31. ¿El `down.sql` cae en ORDEN INVERSO: disparador y funcion primero, la tabla al final, y
 * todo `DROP INDEX`/`DROP CONSTRAINT` en medio?
 */
export function downOrderIsReverseOfUp(downSql: string): boolean {
  const source = statements(downSql)
  const indexOf = (pattern: RegExp): number => source.findIndex((statement) => pattern.test(statement))
  const dropTrigger = indexOf(/^DROP TRIGGER/i)
  const dropFunction = indexOf(/^DROP FUNCTION/i)
  const dropTable = indexOf(/^DROP TABLE/i)
  const middlePositions = source
    .map((statement, position) => (/^(DROP INDEX|ALTER TABLE .* DROP CONSTRAINT)/i.test(statement) ? position : -1))
    .filter((position) => position !== -1)
  if ([dropTrigger, dropFunction, dropTable].includes(-1) || middlePositions.length === 0) return false
  const lastBeforeTable = Math.max(...middlePositions)
  return dropTrigger < dropFunction && dropFunction < lastBeforeTable && lastBeforeTable < dropTable
}

// --- Casos ------------------------------------------------------------------------------------

describe('QC-92 migration.sql — R11: el censo exacto de columnas del libro', () => {
  it('R11: el censo de columnas es exactamente id, batch_id, kind, quantity, reason, company_id, created_by, created_at', () => {
    expect(hasExactColumnCensus(upSource)).toBe(true)

    // Autoprueba de vacuidad: un texto sin CREATE TABLE no puede dar verde.
    expect(hasExactColumnCensus('SELECT 1;')).toBe(false)
    expect(tableColumns('SELECT 1;')).toEqual([])

    // Sensibilidad: una columna de mas tumba el censo exacto.
    const conColumnaDeMas = upSource.replace(
      '"reason" TEXT,',
      '"reason" TEXT,\n    "note" TEXT,',
    )
    expect(conColumnaDeMas, 'la mutacion no anadio la columna').not.toBe(upSource)
    expect(hasExactColumnCensus(conColumnaDeMas)).toBe(false)

    // Sensibilidad: quitar una columna tambien.
    const sinReason = upSource.replace('"reason" TEXT,\n', '')
    expect(sinReason).not.toBe(upSource)
    expect(hasExactColumnCensus(sinReason)).toBe(false)

    // Sensibilidad: quantity sin signo -o con otro tipo- no vale.
    const quantityNumeric = upSource.replace('"quantity" INTEGER NOT NULL,', '"quantity" NUMERIC NOT NULL,')
    expect(quantityNumeric).not.toBe(upSource)
    expect(hasExactColumnCensus(quantityNumeric)).toBe(false)

    // Sensibilidad: reason obligatorio rompe "el motivo esta ausente en el alta".
    const reasonObligatorio = upSource.replace('"reason" TEXT,', '"reason" TEXT NOT NULL,')
    expect(reasonObligatorio).not.toBe(upSource)
    expect(hasExactColumnCensus(reasonObligatorio)).toBe(false)

    // Sensibilidad: company_id anulable rompe el aislamiento por empresa.
    const companyAnulable = upSource.replace('"company_id" UUID NOT NULL,', '"company_id" UUID,')
    expect(companyAnulable).not.toBe(upSource)
    expect(hasExactColumnCensus(companyAnulable)).toBe(false)
  })
})

describe('QC-92 migration.sql y down.sql — R14: sin asientos retroactivos', () => {
  it('R14: ni migration.sql ni down.sql contienen un INSERT INTO real, aunque BEFORE INSERT si aparece', () => {
    // El BEFORE INSERT del disparador esta en el archivo real, y no cuenta como INSERT INTO.
    expect(upSource).toMatch(/BEFORE INSERT/)
    expect(containsInsertInto(upSource, 'inventory_movements')).toBe(false)
    expect(containsInsertInto(downSource, 'inventory_movements')).toBe(false)

    // Sensibilidad: un INSERT INTO fabricado si tiene que dar rojo.
    const conInsert = `${upSource}\nINSERT INTO "inventory_movements" ("id","batch_id","kind","quantity","company_id") VALUES ('a','b','opening',1,'c');`
    expect(conInsert, 'la mutacion no anadio el INSERT INTO').not.toBe(upSource)
    expect(containsInsertInto(conInsert, 'inventory_movements')).toBe(true)

    // Y un INSERT INTO sobre OTRA tabla no debe confundirse con el de inventory_movements.
    const insertOtraTabla = `${upSource}\nINSERT INTO "companies" ("id") VALUES ('a');`
    expect(containsInsertInto(insertOtraTabla, 'inventory_movements')).toBe(false)
  })

  it('R14: ninguna otra migracion del repo escribe filas en inventory_movements', () => {
    const migrations = readAllMigrations(migrationsDir)
    // Autoprueba de vacuidad: si el recorrido de migraciones se quedara vacio, el test no debe pasar en silencio.
    expect(migrations.length, 'deberian encontrarse varias decenas de migraciones').toBeGreaterThan(5)
    expect(noMigrationInsertsIntoInventoryMovements(migrations)).toBe(true)

    const fabricadaConInsert = [
      ...migrations,
      { name: 'fake_migration', upSql: 'INSERT INTO "inventory_movements" ("id") VALUES (\'x\');', downSql: '' },
    ]
    expect(noMigrationInsertsIntoInventoryMovements(fabricadaConInsert)).toBe(false)

    const fabricadaConInsertEnDown = [
      ...migrations,
      { name: 'fake_migration', upSql: '', downSql: 'INSERT INTO "inventory_movements" ("id") VALUES (\'x\');' },
    ]
    expect(noMigrationInsertsIntoInventoryMovements(fabricadaConInsertEnDown)).toBe(false)
  })
})

describe('QC-92 migration.sql — R15: inventory_movements solo admite altas', () => {
  it('R15(a): el SQL no ofrece ninguna via de UPDATE ni DELETE, y la tabla nace sin updated_at ni deleted_at', () => {
    expect(grantsNoUpdateOrDeletePath(upSource)).toBe(true)
    expect(grantsNoUpdateOrDeletePath(downSource)).toBe(true)
    expect(tableHasNoMutationTimestamps(upSource)).toBe(true)

    // Autoprueba de vacuidad de tableHasNoMutationTimestamps: sin CREATE TABLE, no puede dar verde.
    expect(tableHasNoMutationTimestamps('SELECT 1;')).toBe(false)

    // Sensibilidad: un UPDATE fabricado sobre la tabla tiene que caer.
    const conUpdate = `${upSource}\nUPDATE "inventory_movements" SET "reason" = 'x' WHERE "id" = '1';`
    expect(conUpdate, 'la mutacion no anadio el UPDATE').not.toBe(upSource)
    expect(grantsNoUpdateOrDeletePath(conUpdate)).toBe(false)

    const conDelete = `${upSource}\nDELETE FROM "inventory_movements" WHERE "id" = '1';`
    expect(conDelete).not.toBe(upSource)
    expect(grantsNoUpdateOrDeletePath(conDelete)).toBe(false)

    // Sensibilidad: anadir updated_at o deleted_at a la tabla habilitaria corregir en silencio.
    const conUpdatedAt = upSource.replace(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "updated_at" TIMESTAMPTZ(6),',
    )
    expect(conUpdatedAt).not.toBe(upSource)
    expect(tableHasNoMutationTimestamps(conUpdatedAt)).toBe(false)

    const conDeletedAt = upSource.replace(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "deleted_at" TIMESTAMPTZ(6),',
    )
    expect(conDeletedAt).not.toBe(upSource)
    expect(tableHasNoMutationTimestamps(conDeletedAt)).toBe(false)
  })

  it('R15(b): las unicas operaciones sobre inventoryMovement bajo lib/ son exactamente create y findMany', () => {
    const files = filesUnderLib(repoRoot)
    // Autoprueba de vacuidad: si el recorrido de lib/ se quedara vacio, el censo pasaria por no encontrar nada.
    expect(files.length, 'el recorrido de lib/ deberia encontrar cientos de archivos').toBeGreaterThan(50)

    const operations = new Set(allInventoryMovementOperations(repoRoot))
    expect([...operations].sort()).toEqual(['create', 'findMany'])

    // Sensibilidad: el propio detector, probado sobre fuentes fabricadas -no solo sobre el arbol real-.
    expect(inventoryMovementOperationsIn('await tx.inventoryMovement.update({ where: {}, data: {} });')).toEqual([
      'update',
    ])
    expect(
      inventoryMovementOperationsIn('await tx.inventoryMovement.updateMany({ where: {}, data: {} });'),
    ).toEqual(['updateMany'])
    expect(inventoryMovementOperationsIn('await tx.inventoryMovement.delete({ where: {} });')).toEqual(['delete'])
    expect(inventoryMovementOperationsIn('await tx.inventoryMovement.deleteMany({ where: {} });')).toEqual([
      'deleteMany',
    ])
    expect(inventoryMovementOperationsIn('await tx.inventoryMovement.upsert({ where: {}, create: {}, update: {} });')).toEqual(
      ['upsert'],
    )
    // Y si el lector no encuentra ninguna llamada, la lista queda vacia -no null, no una excepcion-.
    expect(inventoryMovementOperationsIn('export const nada = 1;')).toEqual([])
  })
})

describe('QC-92 migration.sql — R16: ingles, snake_case, y esta ficha no borra lotes', () => {
  it('R16: todo identificador creado por la migracion es snake_case en ingles', () => {
    expect(allCreatedIdentifiersAreSnakeCase(upSource)).toBe(true)

    // Autoprueba de vacuidad: sin ningun identificador declarado, no puede dar verde.
    expect(allCreatedIdentifiersAreSnakeCase('SELECT 1;')).toBe(false)

    // Sensibilidad: camelCase no pasa.
    const camelCase = upSource.replace(/"inventory_movements_batch_id_idx"/g, '"inventoryMovementsBatchIdIdx"')
    expect(camelCase, 'la mutacion no cambio el nombre del indice').not.toBe(upSource)
    expect(allCreatedIdentifiersAreSnakeCase(camelCase)).toBe(false)

    // Sensibilidad: una mayuscula suelta tampoco.
    const conMayuscula = upSource.replace(/"inventory_movements_pkey"/g, '"inventory_Movements_pkey"')
    expect(conMayuscula).not.toBe(upSource)
    expect(allCreatedIdentifiersAreSnakeCase(conMayuscula)).toBe(false)

    // Sensibilidad: castellano tampoco -aunque este en snake_case-.
    const enCastellano = upSource.replace(/"inventory_movements_quantity_not_zero"/g, '"inventory_movements_cantidad_no_cero"')
    expect(enCastellano).not.toBe(upSource)
    // El detector solo mira forma, no vocabulario; esta mutacion sigue en snake_case y sigue dando
    // verde -por eso R16 exige TAMBIEN inspeccion humana del vocabulario, que este test no sustituye-.
    expect(allCreatedIdentifiersAreSnakeCase(enCastellano)).toBe(true)
  })

  it('R16: la migracion no anade marca de borrado ni borra filas ni la tabla de product_batches', () => {
    expect(doesNotDropOrDeleteProductBatches(upSource)).toBe(true)
    expect(doesNotDropOrDeleteProductBatches(downSource)).toBe(true)

    const conMarcaDeBorrado = `${upSource}\nALTER TABLE "product_batches" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);`
    expect(conMarcaDeBorrado, 'la mutacion no anadio la marca de borrado').not.toBe(upSource)
    expect(doesNotDropOrDeleteProductBatches(conMarcaDeBorrado)).toBe(false)

    const conDropTabla = `${upSource}\nDROP TABLE "product_batches";`
    expect(conDropTabla).not.toBe(upSource)
    expect(doesNotDropOrDeleteProductBatches(conDropTabla)).toBe(false)

    const conDeleteFilas = `${upSource}\nDELETE FROM "product_batches" WHERE "lot" IS NULL;`
    expect(conDeleteFilas).not.toBe(upSource)
    expect(doesNotDropOrDeleteProductBatches(conDeleteFilas)).toBe(false)
  })
})

describe('QC-92 down.sql — R31: revierte exactamente lo que crea migration.sql, en orden inverso', () => {
  it('R31: cada objeto creado por el up tiene su DROP correspondiente en el down, ni uno mas ni uno menos', () => {
    expect(downDropsExactlyWhatUpCreates(upSource, downSource)).toBe(true)

    const created = objectsCreatedByUp(upSource)
    expect(created.tables).toEqual(['inventory_movements'])
    expect([...created.foreignKeys].sort()).toEqual(
      [
        'inventory_movements_batch_id_fkey',
        'inventory_movements_company_id_fkey',
        'inventory_movements_created_by_fkey',
      ].sort(),
    )
    expect([...created.indexes].sort()).toEqual(
      [
        'inventory_movements_batch_id_idx',
        'inventory_movements_company_id_idx',
        'inventory_movements_created_by_idx',
      ].sort(),
    )
    expect([...created.checks].sort()).toEqual(
      ['inventory_movements_quantity_not_zero', 'inventory_movements_reason_matches_kind'].sort(),
    )
    expect(created.functions).toEqual(['inventory_movements_check_company'])
    expect(created.triggers).toEqual(['inventory_movements_check_company_trigger'])

    // Autoprueba de vacuidad: sin ningun CREATE, la correspondencia no puede dar verde.
    expect(downDropsExactlyWhatUpCreates('SELECT 1;', downSource)).toBe(false)
    expect(downDropsExactlyWhatUpCreates(upSource, 'SELECT 1;')).toBe(false)

    // Sensibilidad: si al down se le olvida una FK, la correspondencia cae.
    const sinUnaFk = downSource.replace(
      'ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_created_by_fkey";\n',
      '',
    )
    expect(sinUnaFk, 'la mutacion no quito el DROP de la FK').not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinUnaFk)).toBe(false)

    // Sensibilidad: si le falta un indice.
    const sinUnIndice = downSource.replace('DROP INDEX IF EXISTS "inventory_movements_created_by_idx";\n', '')
    expect(sinUnIndice).not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinUnIndice)).toBe(false)

    // Sensibilidad: si le falta un CHECK.
    const sinUnCheck = downSource.replace(
      'ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_quantity_not_zero";\n',
      '',
    )
    expect(sinUnCheck).not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinUnCheck)).toBe(false)

    // Sensibilidad: si le falta el disparador o la funcion.
    const sinDisparador = downSource.replace(
      'DROP TRIGGER IF EXISTS "inventory_movements_check_company_trigger" ON "inventory_movements";\n',
      '',
    )
    expect(sinDisparador).not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinDisparador)).toBe(false)

    const sinFuncion = downSource.replace('DROP FUNCTION IF EXISTS inventory_movements_check_company();\n', '')
    expect(sinFuncion).not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinFuncion)).toBe(false)

    // Sensibilidad: si al down le falta el DROP TABLE, la tabla sobrevive a la reversion.
    const sinTabla = downSource.replace('DROP TABLE IF EXISTS "inventory_movements";', '')
    expect(sinTabla).not.toBe(downSource)
    expect(downDropsExactlyWhatUpCreates(upSource, sinTabla)).toBe(false)
  })

  it('R31: el down cae en orden inverso -disparador y funcion primero, la tabla al final-', () => {
    expect(downOrderIsReverseOfUp(downSource)).toBe(true)

    // Autoprueba de vacuidad: sin ningun DROP reconocible, no puede dar verde.
    expect(downOrderIsReverseOfUp('SELECT 1;')).toBe(false)

    // Sensibilidad: si la tabla se borrara PRIMERO, el DROP FUNCTION/TRIGGER posterior fallaria
    // -o, peor, se ejecutaria sobre un objeto que ya no tiene sentido revertir en ese orden-.
    const tablaPrimero = `DROP TABLE IF EXISTS "inventory_movements";\n${downSource.replace(
      'DROP TABLE IF EXISTS "inventory_movements";',
      '',
    )}`
    expect(tablaPrimero, 'la mutacion no reordeno el DROP TABLE').not.toBe(downSource)
    expect(downOrderIsReverseOfUp(tablaPrimero)).toBe(false)

    // Sensibilidad: si la funcion se borrara ANTES que el disparador que la usa, el DROP FUNCTION
    // fallaria porque el disparador sigue dependiendo de ella.
    const funcionAntesQueDisparador = downSource
      .replace('DROP FUNCTION IF EXISTS inventory_movements_check_company();\n', '')
      .replace(
        'DROP TRIGGER IF EXISTS "inventory_movements_check_company_trigger" ON "inventory_movements";',
        'DROP FUNCTION IF EXISTS inventory_movements_check_company();\nDROP TRIGGER IF EXISTS "inventory_movements_check_company_trigger" ON "inventory_movements";',
      )
    expect(funcionAntesQueDisparador).not.toBe(downSource)
    expect(downOrderIsReverseOfUp(funcionAntesQueDisparador)).toBe(false)
  })
})
