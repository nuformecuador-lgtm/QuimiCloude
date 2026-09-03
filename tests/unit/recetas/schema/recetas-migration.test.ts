// T8 — Contrato estatico del SQL de la migracion `recipes_and_recipe_lines` (QC-24).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`specs/QC-24-modelo-recetas/design.md` seccion 4): las TRES FK que cruzan de modulo
// —`recipe_lines_product_id_fkey` hacia `products`, `recipes_created_by_fkey` y
// `recipes_updated_by_fkey` hacia `users`—, el indice unico PARCIAL del nombre normalizado,
// el CHECK de cantidad positiva y los cuatro ALTER de RLS. Si una migracion futura se los
// lleva por drift, el esquema sigue validando y el cliente sigue compilando: tiene que caer
// aqui, que es la unica guardia que tienen.
//
// Cada afirmacion se escribe como un PREDICADO reutilizable y se aplica dos veces: al SQL
// real y a una version MUTADA EN MEMORIA (el archivo en disco no se toca). Las cuatro
// mutaciones obligatorias son `> 0` -> `>= 0`, quitar el `WHERE "deleted_at" IS NULL`,
// `DECIMAL(14,4)` -> `DOUBLE PRECISION` y `RESTRICT` -> `CASCADE`. Un test que no puede
// fallar no vigila nada.
//
// Cubre R3, R5, R7, R9, R11, R13, R14, R16, R19, R21, R25, R27, R28, R29, R30, R33.
//
// 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este archivo NO cambia
// de veredicto: afirma sobre el SQL ya APLICADO de `20260902163256_recipes_and_recipe_lines`,
// que es historia y no se reescribe. La columna `recipe_lines.unit` que aqui se comprueba la
// sustituye despues `20260903121404_units_catalog` por `unit_id`; ese SQL lo vigila
// `tests/unit/unidades/schema/unidades-migration.test.ts`. Para saber la forma VIGENTE de la
// tabla hay que leer los dos archivos, en ese orden.

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260902163256_recipes_and_recipe_lines')

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

const createRecipes = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?recipes"?/i)
const createRecipeLines = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?recipe_lines"?/i)

// --- Predicados reutilizables: los mismos que usan los tests de sensibilidad de abajo ---

/**
 * ¿`quantity` se declara como decimal exacto (14,4)? (R13)
 *
 * En positivo Y en negativo: no basta con que aparezca `DECIMAL` en algun sitio, tiene que
 * ser esa columna, con esa precision, y no puede ser coma flotante binaria.
 */
function declaresExactDecimalQuantity(statement: string): boolean {
  const esDecimalExacto = /"quantity"\s+DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i.test(statement)
  const esComaFlotante = /"quantity"\s+(DOUBLE\s+PRECISION|FLOAT\d*|REAL)\b/i.test(statement)
  return esDecimalExacto && !esComaFlotante
}

/** ¿El CHECK exige que la cantidad sea ESTRICTAMENTE mayor que cero? (R14) */
function isPositiveCheck(statement: string, column: string): boolean {
  const exigeMayorQueCero = new RegExp(
    `CHECK\\s*\\(\\s*"?${column}"?\\s*>\\s*0\\s*\\)`,
    'i',
  ).test(statement)
  const admiteCero = new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>=\\s*0\\s*\\)`, 'i').test(
    statement,
  )
  return exigeMayorQueCero && !admiteCero
}

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R19, R27) */
function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** ¿La clave foranea propaga el borrado FISICO del padre a sus hijos? (R25) */
function isCascadeOnDelete(statement: string): boolean {
  const propaga = /ON\s+DELETE\s+CASCADE/i.test(statement)
  const retiene = /ON\s+DELETE\s+(RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return propaga && !retiene
}

/** ¿Existe el indice UNICO sobre `name_normalized` de `recipes`? (R7) */
function hasUniqueIndexOnNormalizedName(source: readonly string[]): boolean {
  return source.some(
    (statement) =>
      /^CREATE UNIQUE INDEX "?\w+"? ON "?recipes"?\s*\(\s*"?name_normalized"?\s*\)/i.test(statement),
  )
}

/** ¿Ese indice unico es PARCIAL, y solo alcanza a las recetas vivas? (R9) */
function isPartialOnLiveRows(statement: string): boolean {
  return /WHERE\s+"?deleted_at"?\s+IS\s+NULL/i.test(statement)
}

/** ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. (R29) */
function hasRlsEnabledAndForced(source: readonly string[], table: string): boolean {
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/** ¿La columna se declara UUID y ANULABLE (sin `NOT NULL`)? (R33) */
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
 * Vocabulario ingles admitido para los identificadores de esta feature (R28). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista cerrada a proposito: una columna nueva obliga a pasar por aqui, y una en
 * espanol (`receta`, `cantidad`, `producto`) no encuentra sus piezas y cae. Un patron
 * `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'by',
  'created',
  'deleted',
  'description',
  'fkey',
  'id',
  'idx',
  'image',
  'key',
  'lines',
  'name',
  'normalized',
  'path',
  'pkey',
  'positive',
  'product',
  'quantity',
  'recipe',
  'recipes',
  'steps',
  'unique',
  'unit',
  'updated',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R28) */
function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

describe('migration.sql — columnas y tipos', () => {
  it('recipes se crea antes que recipe_lines', () => {
    // La FK interna apunta a `recipes`: al reves, la migracion no aplica.
    expect(createdTables(up)).toEqual(['recipes', 'recipe_lines'])
  })

  it('ninguna columna de las dos tablas declara VARCHAR(n)', () => {
    // R3: el nombre (120) y la descripcion (500) son validacion de aplicacion (QC-25), no
    // de la columna. Un `VARCHAR(n)` bajaria el limite a la base y cambiarlo exigiria
    // migracion; ademas la base rechazaria una receta por longitud, que es justo lo que
    // R3 prohibe.
    for (const statement of [createRecipes, createRecipeLines]) {
      expect(statement).not.toMatch(/VARCHAR\s*\(/i)
      expect(statement).not.toMatch(/CHARACTER\s+VARYING/i)
      expect(statement).not.toMatch(/\bCHAR\s*\(/i)
    }
    expect(createRecipes).toMatch(/"name" TEXT NOT NULL/i)
    expect(createRecipes).toMatch(/"name_normalized" TEXT NOT NULL/i)
    expect(createRecipes).toMatch(/"description" TEXT/i)
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Esta asercion se
    // CONSERVA TAL CUAL y es deliberado: lo que este archivo lee es el SQL HISTORICO de la
    // migracion de QC-24, que ya se aplico y no se reescribe nunca -reescribir una
    // migracion aplicada es drift, y esta guardia existe justo para que no ocurra-. La
    // columna `recipe_lines.unit` existio con esa forma exacta, y la que la sustituye por
    // `unit_id` es la migracion `20260903121404_units_catalog`, cuyo SQL vigila
    // `tests/unit/unidades/schema/unidades-migration.test.ts`. Lo que sigue vivo de R15 de
    // QC-24 -unidad OBLIGATORIA en toda linea- se comprueba hoy sobre `unit_id`, que
    // tambien nace `NOT NULL` (QC-32 R11).
    expect(createRecipeLines).toMatch(/"unit" TEXT NOT NULL/i)
    // Y ningun CHECK de longitud disfrazado.
    expect(up.filter((statement) => /length\s*\(/i.test(statement))).toHaveLength(0)
  })

  it("steps es JSONB NOT NULL DEFAULT '[]'", () => {
    // R5: «sin pasos» es una lista vacia y lo garantiza la BASE, no cada consumidor con su
    // propio `?? []`. Y sin ningun CHECK sobre la forma del documento (decision cerrada 10):
    // la base guarda el JSON tal cual.
    expect(createRecipes).toMatch(/"steps" JSONB NOT NULL DEFAULT '\[\]'/i)
    expect(createRecipes).not.toMatch(/"steps"[^,]*(NULL\s*,|jsonb_typeof)/i)
    expect(up.filter((statement) => /jsonb_typeof/i.test(statement))).toHaveLength(0)
  })

  it('quantity se declara DECIMAL(14,4) y el test cae si alguien lo cambia a double precision', () => {
    // R13. Primero la afirmacion sobre el archivo real...
    expect(declaresExactDecimalQuantity(createRecipeLines)).toBe(true)
    expect(createRecipeLines).toMatch(/"quantity" DECIMAL\(14,4\) NOT NULL/i)

    // ...y despues la sensibilidad: mutacion EN MEMORIA, el archivo en disco no se toca.
    const mutado = createRecipeLines.replace(/DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i, 'DOUBLE PRECISION')
    expect(mutado, 'la mutacion no se aplico: cambio el texto de la migracion').not.toBe(
      createRecipeLines,
    )
    expect(declaresExactDecimalQuantity(mutado)).toBe(false)

    // Y tampoco vale un decimal con otra precision: (14,4) es la decision cerrada 8.
    const otraPrecision = createRecipeLines.replace(
      /DECIMAL\s*\(\s*14\s*,\s*4\s*\)/i,
      'DECIMAL(10,2)',
    )
    expect(declaresExactDecimalQuantity(otraPrecision)).toBe(false)
  })

  it('created_by y updated_by son UUID anulables y sus FK no son ON DELETE SET NULL', () => {
    // R33 y decision cerrada 22: una receta puede no tener autor —una importacion, un
    // seed—. Y R21 sigue en pie: la FK solo se verifica cuando la columna tiene valor.
    for (const columna of ['created_by', 'updated_by']) {
      expect(isNullableUuidColumn(createRecipes, columna), `${columna} debe ser UUID anulable`).toBe(
        true,
      )
    }
    // Sensibilidad del predicado: con `NOT NULL` tiene que caer, y con otro tipo tambien.
    const conNotNull = createRecipes.replace('"created_by" UUID,', '"created_by" UUID NOT NULL,')
    expect(conNotNull, 'la mutacion no se aplico').not.toBe(createRecipes)
    expect(isNullableUuidColumn(conNotNull, 'created_by')).toBe(false)
    expect(isNullableUuidColumn(createRecipes, 'recipe_id')).toBe(false)

    // `SET NULL` convertiria «al usuario lo borraron» en «no la creo una persona», que son
    // cosas distintas y la decision 22 las separa a proposito (`design.md` seccion 4.1).
    for (const constraint of ['recipes_created_by_fkey', 'recipes_updated_by_fkey']) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} no puede anular la columna`).not.toMatch(
        /ON\s+DELETE\s+SET\s+NULL/i,
      )
      expect(isRestrictOnDelete(statement), `${constraint} debe ser RESTRICT`).toBe(true)
    }
    // La columna del producto, en cambio, es obligatoria (R16).
    expect(createRecipeLines).toMatch(/"product_id" UUID NOT NULL/i)
    expect(createRecipeLines).toMatch(/"recipe_id" UUID NOT NULL/i)
  })
})

describe('migration.sql — CHECK de cantidad positiva', () => {
  const constraint = 'recipe_lines_quantity_positive'
  const check = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))

  it('recipe_lines lleva CHECK quantity > 0, y el test cae si se relaja a >= 0', () => {
    // R14 y decision cerrada 8: ni negativa ni cero. La ausencia la rechaza el NOT NULL
    // (23502) y el cero este CHECK (23514); el test de integracion distingue los dos.
    expect(isPositiveCheck(check, 'quantity')).toBe(true)
    expect(check).toMatch(/ALTER TABLE "?recipe_lines"?/i)

    // Sensibilidad: relajar el umbral en memoria tiene que tumbar el predicado.
    const relajado = check.replace(/>\s*0/, '>= 0')
    expect(relajado, 'la mutacion no se aplico sobre el CHECK').not.toBe(check)
    expect(isPositiveCheck(relajado, 'quantity'), 'un CHECK >= 0 no deberia pasar').toBe(false)

    // Y cualquier otro aflojamiento, tambien.
    for (const laxo of ['> -1', '>= -1', '<> 0']) {
      const mutado = check.replace(/>\s*0/, laxo)
      expect(isPositiveCheck(mutado, 'quantity'), `un CHECK ${laxo} no deberia pasar`).toBe(false)
    }

    // El unico CHECK de toda la migracion es este: ni uno de mas ni uno de menos.
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(1)
  })
})

describe('migration.sql — claves foraneas e indices', () => {
  const fkRecipe = findStatement(up, /ADD CONSTRAINT "?recipe_lines_recipe_id_fkey"?/i)
  const fkProduct = findStatement(up, /ADD CONSTRAINT "?recipe_lines_product_id_fkey"?/i)

  it('las FK de recipe_id y product_id existen', () => {
    // R16: una linea sin receta, sin producto, o con una receta o un producto inexistentes
    // se rechaza en la propia base. Las dos columnas son NOT NULL y las dos FK son reales,
    // aunque `product_id` sea un escalar sin `@relation` en Prisma.
    expect(fkRecipe).toMatch(/FOREIGN KEY \(\s*"?recipe_id"?\s*\)/i)
    expect(fkRecipe).toMatch(/REFERENCES "?recipes"?\s*\(\s*"?id"?\s*\)/i)
    expect(fkProduct).toMatch(/FOREIGN KEY \(\s*"?product_id"?\s*\)/i)
    expect(fkProduct).toMatch(/REFERENCES "?products"?\s*\(\s*"?id"?\s*\)/i)
    expect(createRecipeLines).toMatch(/"recipe_id" UUID NOT NULL/i)
    expect(createRecipeLines).toMatch(/"product_id" UUID NOT NULL/i)
  })

  it('las tres FK que cruzan de modulo existen en el SQL con ON DELETE RESTRICT', () => {
    // R19: la referencia al producto y las dos de auditoria son escalares SIN `@relation`
    // en Prisma —para que el ORM no pueda atravesar de modulo con un `include`— pero la FK
    // es REAL y esta escrita a mano aqui (`design.md` seccion 4.1). Prisma no las regenera:
    // si desaparecen del archivo, nadie mas se entera.
    const aMano = [
      ['recipe_lines_product_id_fkey', 'recipe_lines', 'product_id', 'products'],
      ['recipes_created_by_fkey', 'recipes', 'created_by', 'users'],
      ['recipes_updated_by_fkey', 'recipes', 'updated_by', 'users'],
    ] as const

    for (const [constraint, table, column, target] of aMano) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} sobre ${table}`).toMatch(
        new RegExp(`ALTER TABLE "?${table}"?`, 'i'),
      )
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(new RegExp(`REFERENCES "?${target}"?\\s*\\(\\s*"?id"?\\s*\\)`, 'i'))
      expect(isRestrictOnDelete(statement), `${constraint} debe ser ON DELETE RESTRICT`).toBe(true)
      expect(statement).toMatch(/ON UPDATE CASCADE/i)
    }

    // Sensibilidad: cambiar un RESTRICT por CASCADE tiene que tumbar el predicado.
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
    // R21: el autor y el ultimo editor son usuarios que existen. La integridad la garantiza
    // la base aunque Prisma no declare la relacion.
    for (const [constraint, column] of [
      ['recipes_created_by_fkey', 'created_by'],
      ['recipes_updated_by_fkey', 'updated_by'],
    ] as const) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement).toMatch(/ALTER TABLE "?recipes"?/i)
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(/REFERENCES "?users"?\s*\(\s*"?id"?\s*\)/i)
    }
    // Con su indice del lado hijo: por ahi pasa la verificacion del RESTRICT.
    for (const index of ['recipes_created_by_idx', 'recipes_updated_by_idx']) {
      expect(up.some((statement) => new RegExp(`^CREATE INDEX "?${index}"?`, 'i').test(statement)))
        .toBe(true)
    }
  })

  it('la FK recipe_lines_recipe_id_fkey es ON DELETE CASCADE, y el test cae si se cambia a RESTRICT', () => {
    // R25: borrar FISICAMENTE una receta se lleva sus lineas y no deja huerfanas. En
    // operacion normal no se dispara nunca, porque el borrado de la receta es LOGICO y
    // ninguna FK reacciona a un UPDATE (`design.md` seccion 4.2).
    expect(isCascadeOnDelete(fkRecipe)).toBe(true)

    const mutado = fkRecipe.replace(/ON DELETE CASCADE/i, 'ON DELETE RESTRICT')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkRecipe)
    expect(isCascadeOnDelete(mutado), 'ON DELETE RESTRICT no deberia pasar').toBe(false)
    expect(isCascadeOnDelete(fkRecipe.replace(/ON DELETE CASCADE/i, 'ON DELETE SET NULL'))).toBe(
      false,
    )
  })

  it('la FK a products es ON DELETE RESTRICT', () => {
    // R27: un producto dado de baja LOGICAMENTE conserva su fila, asi que la linea sigue
    // apuntandolo; y un borrado FISICO de un producto usado por alguna linea se rechaza.
    expect(isRestrictOnDelete(fkProduct)).toBe(true)
    expect(fkProduct).toMatch(/REFERENCES "?products"?/i)
    // Sensibilidad: con CASCADE, borrar el producto se llevaria la linea por delante.
    const mutado = fkProduct.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(mutado).not.toBe(fkProduct)
    expect(isRestrictOnDelete(mutado)).toBe(false)
    // El indice del lado hijo existe: por ahi pasa la verificacion del RESTRICT.
    const index = findStatement(up, /^CREATE INDEX "?recipe_lines_product_id_idx"?/i)
    expect(index).toMatch(/ON "?recipe_lines"?\s*\(\s*"?product_id"?\s*\)/i)
  })

  it('existe el indice unico (recipe_id, product_id)', () => {
    // R11 y decision cerrada 12: un producto no puede aparecer dos veces en la misma receta,
    // y lo rechaza la BASE. Sirve ademas de indice para «lineas de esta receta» por el
    // prefijo izquierdo, por eso no hay un `recipe_lines_recipe_id_idx` aparte.
    const statement = findStatement(up, /^CREATE UNIQUE INDEX "?recipe_lines_recipe_id_product_id_key"?/i)
    expect(statement).toMatch(
      /ON "?recipe_lines"?\s*\(\s*"?recipe_id"?\s*,\s*"?product_id"?\s*\)/i,
    )
    // No es parcial: la unicidad de la pareja alcanza a TODAS las lineas, porque la linea
    // no tiene borrado logico (R24).
    expect(statement).not.toMatch(/WHERE/i)
  })
})

describe('migration.sql — unicidad del nombre normalizado', () => {
  const uniqueName = findStatement(up, /^CREATE UNIQUE INDEX "?recipes_name_unique"?/i)

  it('existe CREATE UNIQUE INDEX sobre name_normalized, y el test cae si desaparece', () => {
    // R7: la unicidad del nombre la garantiza un INDICE, no una comparacion al vuelo
    // (decision cerrada 7). Prisma no modela indices parciales, asi que este indice vive
    // SOLO en este archivo: si el drift se lo lleva, nada mas lo nota.
    expect(hasUniqueIndexOnNormalizedName(up)).toBe(true)
    expect(uniqueName).toMatch(/ON "?recipes"?\s*\(\s*"?name_normalized"?\s*\)/i)

    // Sensibilidad: sin la sentencia, el predicado tiene que caer.
    const sinIndice = up.filter((statement) => statement !== uniqueName)
    expect(sinIndice.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasUniqueIndexOnNormalizedName(sinIndice)).toBe(false)

    // Y un indice NO unico sobre la misma columna tampoco garantiza nada.
    const noUnico = up.map((statement) =>
      statement === uniqueName ? statement.replace(/CREATE UNIQUE INDEX/i, 'CREATE INDEX') : statement,
    )
    expect(hasUniqueIndexOnNormalizedName(noUnico)).toBe(false)
  })

  it('el indice unico del nombre es PARCIAL (WHERE deleted_at IS NULL), y el test cae si se quita el WHERE', () => {
    // R9 y decision cerrada 20: borrar logicamente una receta LIBERA su nombre. Con un
    // indice total, borrar una receta quemaria su nombre para siempre (`design.md` 8.2).
    expect(isPartialOnLiveRows(uniqueName)).toBe(true)

    const sinWhere = uniqueName.replace(/\s*WHERE\s+"deleted_at"\s+IS\s+NULL/i, '')
    expect(sinWhere, 'la mutacion no quito el WHERE').not.toBe(uniqueName)
    expect(isPartialOnLiveRows(sinWhere), 'un indice total no deberia pasar').toBe(false)

    // Un WHERE sobre otra cosa tampoco vale: tiene que ser el de las filas vivas.
    const otroWhere = uniqueName.replace(
      /WHERE\s+"deleted_at"\s+IS\s+NULL/i,
      'WHERE "deleted_at" IS NOT NULL',
    )
    expect(isPartialOnLiveRows(otroWhere)).toBe(false)
  })
})

describe('migration.sql — idioma de los identificadores y RLS', () => {
  it('todos los identificadores creados por la migracion estan en ingles', () => {
    // R28. La lista no puede estar vacia, o la asercion no afirmaria nada.
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(15)
    expect(identificadores).toContain('recipes')
    expect(identificadores).toContain('recipe_lines')
    expect(identificadores).toContain('name_normalized')
    expect(identificadores).toContain('recipe_lines_product_id_fkey')
    expect(identificadores).toContain('recipes_name_unique')

    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    // Sensibilidad de R28: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of ['receta', 'lineas_receta', 'cantidad', 'unidad', 'pasos', 'imagen']) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('nombre_normalizado')).toBe(false)
    expect(isEnglishSnakeCase('recipes_creado_por_fkey')).toBe(false)
    expect(isEnglishSnakeCase('Recipes')).toBe(false)
    expect(isEnglishSnakeCase('recipe lines')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('name_normalized')).toBe(true)
    expect(isEnglishSnakeCase('recipe_lines_quantity_positive')).toBe(true)
  })

  it('las dos tablas quedan con RLS activado y forzado', () => {
    // R29. Sin FORCE, el dueno de las tablas —con quien se conecta Prisma— la ignora entera.
    for (const tabla of ['recipes', 'recipe_lines']) {
      expect(hasRlsEnabledAndForced(up, tabla), `${tabla} sin ENABLE + FORCE`).toBe(true)
    }
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(4)

    // Sensibilidad: quitar el FORCE de una tabla tiene que tumbar el predicado.
    const sinForce = up.filter(
      (statement) => !/^ALTER TABLE "?recipe_lines"? FORCE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(sinForce.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasRlsEnabledAndForced(sinForce, 'recipe_lines')).toBe(false)
    expect(hasRlsEnabledAndForced(sinForce, 'recipes')).toBe(true)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql revierte exactamente lo que crea migration.sql y no toca pgcrypto', () => {
    // R30. Los indices (incluido el unico parcial), el CHECK y las CUATRO FK —tambien las
    // tres escritas a mano— caen con sus tablas: no se dropean aparte.
    const creadas = createdTables(up)
    const dropeadas = droppedTables(down)
    expect(creadas).toEqual(['recipes', 'recipe_lines'])
    expect(dropeadas).toEqual([...creadas].reverse())

    // El DOWN no hace NADA mas que dropear esas dos tablas: se cuentan las sentencias.
    expect(dropeadas).toHaveLength(2)
    expect(down).toHaveLength(dropeadas.length)
    expect(down.every((statement) => /^DROP TABLE IF EXISTS/i.test(statement))).toBe(true)

    // Y en particular no toca `pgcrypto`, que ya crearon las migraciones de identity y de
    // inventario y de la que esas features dependen. Se mira el SQL ejecutable: la cabecera
    // lo explica en prosa.
    const downEjecutable = stripSqlComments(downSource)
    expect(downEjecutable).not.toMatch(/pgcrypto/i)
    expect(downEjecutable).not.toMatch(/DROP\s+EXTENSION/i)

    // El UP si la declara, con IF NOT EXISTS: por eso el DOWN no puede eliminarla.
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )

    // El DOWN no toca ninguna tabla de otro modulo: revertir esta migracion no puede
    // llevarse `users`, `products` ni `presentations` por delante.
    for (const ajena of ['users', 'roles', 'document_types', 'products', 'presentations']) {
      expect(dropeadas, `el DOWN no debe dropear ${ajena}`).not.toContain(ajena)
      expect(downEjecutable).not.toMatch(new RegExp(`\\b${ajena}\\b`, 'i'))
    }
  })
})
