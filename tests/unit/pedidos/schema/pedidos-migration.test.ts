// T6 — Contrato estatico del SQL de la migracion `orders` (QC-33: modelo-pedidos).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma NO lo regenera nunca
// (`specs/QC-33-modelo-pedidos/design.md` secciones 3, 4 y 7.1): las CUATRO FK que cruzan las
// tres fronteras de modulo —`orders_recipe_id_fkey` hacia `recipes`, `orders_unit_id_fkey` hacia
// `units`, `orders_created_by_fkey` y `orders_updated_by_fkey` hacia `users`—, los CINCO CHECK y
// los dos `ALTER` de RLS. Si una migracion futura se los lleva por drift, el esquema sigue
// validando y el cliente sigue compilando: tiene que caer aqui, que es la unica guardia que
// tienen.
//
// El indice unico del correlativo es TOTAL, SIN `WHERE`, y eso es LO CONTRARIO de
// `recipes_name_unique` (QC-24): aqui el borrado es logico y la fila sigue ocupando su
// (ano, posicion), asi que nadie reutiliza el numero (R22). Es facil de copiar mal, y por eso
// tiene su propia mutacion.
//
// Cada afirmacion que importa se escribe como un PREDICADO PURO y se aplica DOS VECES: al SQL
// real (pasa) y a una version MUTADA EN MEMORIA (falla). El archivo en disco no se toca nunca.
// Las SEIS mutaciones obligatorias (`design.md > 9`) son: (1) anadir `WHERE "deleted_at" IS NULL`
// al indice unico, (2) cambiar un `RESTRICT` por `CASCADE`, (3) cambiar `> 0` por `>= 0` en el
// CHECK de la cantidad, (4) quitar el CHECK del entregado, (5) quitar el `AT TIME ZONE 'UTC'` del
// CHECK del ano y (6) quitar un `DROP TYPE` del DOWN. Un test que no puede fallar no vigila nada.
//
// Cubre R7, R9, R10, R12, R13, R14, R15, R20, R21, R22, R23, R25, R29, R30, R33, R36, R37, R38,
// R41 y R42.

import { readdirSync, readFileSync } from 'node:fs'
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

/**
 * Localiza la carpeta de la migracion por SUFIJO, no por el timestamp escrito a mano: si algun
 * dia se renombra, el test tiene que caer por lo que vigila, no por la ruta.
 */
function findMigrationDir(suffix: string): string {
  const migrationsRoot = join(repoRoot, 'db', 'migrations')
  const candidates = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(
        candidates.length,
      )}: ${candidates.join(', ')}`,
    )
  }
  return join(migrationsRoot, candidates[0] as string)
}

const migrationDir = findMigrationDir('_orders')

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

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
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

/** Tipos enumerados creados, en orden. Son los PRIMEROS enum del repositorio. */
function createdTypes(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^CREATE TYPE "?(\w+)"? AS ENUM/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** Tipos enumerados dropeados, en orden. Un `DROP TABLE` NO se los lleva (R38). */
function droppedTypes(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^DROP TYPE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

const createOrders = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?orders"?/i)

// --- Predicados PUROS: los mismos que usan las seis mutaciones de sensibilidad de abajo ---

/**
 * MUTACION 1 — ¿El indice unico del correlativo es TOTAL, es decir, SIN `WHERE`? (R22)
 *
 * Un `WHERE "deleted_at" IS NULL` liberaria el numero al borrar logicamente y R22 dejaria de
 * cumplirse EN SILENCIO. Es justo lo contrario de `recipes_name_unique`.
 */
function isTotalUniqueIndex(statement: string): boolean {
  const esUnico = /^CREATE UNIQUE INDEX/i.test(statement)
  const esParcial = /\bWHERE\b/i.test(statement)
  return esUnico && !esParcial
}

/** ¿El indice unico cubre (order_year, order_sequence), en ese orden? (R21, R23) */
function coversYearAndSequence(statement: string): boolean {
  return /ON "?orders"?\s*\(\s*"?order_year"?\s*,\s*"?order_sequence"?\s*\)/i.test(statement)
}

/** MUTACION 2 — ¿La FK rechaza el borrado del padre en vez de propagarlo o anularlo? (R13, R15) */
function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** MUTACION 3 — ¿El CHECK exige ESTRICTAMENTE mayor que cero? (R7, R20) */
function isStrictlyPositiveCheck(statement: string, column: string): boolean {
  const exigeMayorQueCero = new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>\\s*0\\s*\\)`, 'i').test(
    statement,
  )
  const admiteCero = new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>=\\s*0\\s*\\)`, 'i').test(
    statement,
  )
  return exigeMayorQueCero && !admiteCero
}

/** ¿El CHECK admite el cero pero no el negativo? Es la diferencia DELIBERADA con el de arriba. (R9) */
function isNonNegativeCheck(statement: string, column: string): boolean {
  return new RegExp(`CHECK\\s*\\(\\s*"?${column}"?\\s*>=\\s*0\\s*\\)`, 'i').test(statement)
}

/** El texto EXACTO del CHECK del entregado, tal cual lo fijo el humano (R29). No se reformula. */
const DELIVERED_CHECK = `CHECK ("deleted_at" IS NULL OR "status" <> 'ENTREGADO')`

/**
 * MUTACION 4 — ¿Existe el CHECK del entregado, con su texto EXACTO? (R29, R30)
 *
 * Se compara literalmente y no con una expresion «equivalente»: la decision cerrada 14 fijo esa
 * condicion y no se «mejora». Ademas es lo unico que garantiza que el CHECK no se pasa de
 * estricto y sigue permitiendo borrar un PENDIENTE (R30).
 */
function hasDeliveredNotDeletedCheck(source: readonly string[]): boolean {
  return source.some(
    (statement) =>
      /ADD CONSTRAINT "?orders_delivered_not_deleted"?/i.test(statement) &&
      statement.includes(DELIVERED_CHECK),
  )
}

/** El texto EXACTO del CHECK del ano (R41). La forma de DOS argumentos no es cosmetica. */
const YEAR_CHECK = `CHECK ("order_year" = EXTRACT(YEAR FROM ("created_at" AT TIME ZONE 'UTC'))::int)`

/**
 * MUTACION 5 — ¿El CHECK del ano compara contra `created_at` MEDIDO EN UTC? (R41)
 *
 * `"created_at" AT TIME ZONE 'UTC'` es `timezone(text, timestamptz)`, IMMUTABLE, con la zona
 * escrita en el propio constraint. Sin el, `EXTRACT(YEAR FROM "created_at")` es STABLE y Postgres
 * RECHAZA la migracion; y si colara, el ano dependeria del `TimeZone` de la conexion.
 */
function matchesUtcYearCheck(statement: string): boolean {
  const exigeUtc = /AT TIME ZONE 'UTC'/i.test(statement)
  return exigeUtc && statement.includes(YEAR_CHECK)
}

/** MUTACION 6 — ¿El DOWN borra LOS DOS tipos enumerados? (R38) */
function dropsBothEnumTypes(source: readonly string[]): boolean {
  const tipos = droppedTypes(source)
  return (
    tipos.length === 2 && tipos.includes('OrderStatus') && tipos.includes('OrderPriority')
  )
}

/** ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. (R37) */
function hasRlsEnabledAndForced(source: readonly string[], table: string): boolean {
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/**
 * Identificadores que ESTA migracion crea: tabla, columnas, restricciones e indices.
 *
 * Dentro de un `CREATE TABLE` todo identificador entrecomillado lo crea esta migracion, MENOS los
 * dos nombres de tipo, que aparecen entrecomillados como tipo de columna (`"priority"
 * "OrderPriority"`) y los crea el `CREATE TYPE`. Van aparte porque son `PascalCase` por
 * convencion de Prisma, no `snake_case`.
 */
const TIPOS_CREADOS: ReadonlySet<string> = new Set(['OrderStatus', 'OrderPriority'])

function createdIdentifiers(source: readonly string[]): readonly string[] {
  const nombres = new Set<string>()
  for (const statement of source) {
    if (/^CREATE TABLE/i.test(statement)) {
      for (const match of statement.matchAll(/"([^"]+)"/g)) {
        const nombre = match[1] as string
        if (!TIPOS_CREADOS.has(nombre)) nombres.add(nombre)
      }
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
 * Vocabulario ingles admitido para los identificadores de esta feature (R36). Cada identificador
 * se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista CERRADA a proposito: una columna nueva obliga a pasar por aqui, y una en espanol
 * (`pedido`, `cantidad`, `ano`, `precio`) no encuentra sus piezas y cae. Un patron `^[a-z_]+$` no
 * distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'by',
  'created',
  'deleted',
  'delivered',
  'fkey',
  'id',
  'idx',
  'key',
  'matches',
  'negative',
  'non',
  'not',
  'order',
  'orders',
  'pkey',
  'positive',
  'price',
  'priority',
  'quantity',
  'recipe',
  'sequence',
  'status',
  'unit',
  'updated',
  'year',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R36) */
function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

describe('migration.sql — la tabla orders y sus ausencias', () => {
  it('la migracion crea los dos tipos y despues la tabla orders', () => {
    // El orden importa: las columnas `priority` y `status` usan los tipos, asi que crearlos
    // despues de la tabla no aplicaria. Son los PRIMEROS enum del repositorio.
    expect(createdTypes(up)).toEqual(['OrderStatus', 'OrderPriority'])
    expect(createdTables(up)).toEqual(['orders'])
    const indiceTipo = up.findIndex((statement) => /^CREATE TYPE/i.test(statement))
    const indiceTabla = up.findIndex((statement) => /^CREATE TABLE/i.test(statement))
    expect(indiceTipo).toBeGreaterThanOrEqual(0)
    expect(indiceTipo).toBeLessThan(indiceTabla)
  })

  it('la tabla orders no crea ninguna columna de total ni columna generada', () => {
    // R10 y decision cerrada 5: el total es `quantity * unit_price`, se calcula al leer y NO se
    // guarda. Ni como columna normal ni como columna GENERADA por la base -que es la forma en la
    // que se cuela «sin querer» un total derivado-.
    expect(createOrders).not.toMatch(/"(total|subtotal|grand_total|line_total|total_price|amount)"/i)
    expect(createOrders).not.toMatch(/GENERATED\s+ALWAYS\s+AS/i)
    expect(createOrders).not.toMatch(/STORED/i)
    // Tampoco impuestos ni descuentos (R11), ni cliente (R3), ni fecha de solicitud (R4).
    expect(createOrders).not.toMatch(/"(tax|vat|iva|discount|invoice)[^"]*"/i)
    expect(createOrders).not.toMatch(/"(customer|client|recipient)[^"]*"/i)
    expect(createOrders).not.toMatch(/"(requested_at|request_date|order_date|ordered_at)"/i)
    // Y ninguna vista ni funcion que lo calcule por detras.
    expect(up.filter((statement) => /^CREATE (OR REPLACE )?(VIEW|FUNCTION)/i.test(statement)))
      .toHaveLength(0)
  })
})

describe('migration.sql — los cinco CHECK', () => {
  const checkQuantity = findStatement(up, /ADD CONSTRAINT "?orders_quantity_positive"?/i)
  const checkUnitPrice = findStatement(up, /ADD CONSTRAINT "?orders_unit_price_non_negative"?/i)
  const checkDelivered = findStatement(up, /ADD CONSTRAINT "?orders_delivered_not_deleted"?/i)
  const checkSequence = findStatement(up, /ADD CONSTRAINT "?orders_order_sequence_positive"?/i)
  const checkYear = findStatement(up, /ADD CONSTRAINT "?orders_order_year_matches_created_at"?/i)

  it('la migracion crea exactamente los cinco CHECK con sus nombres', () => {
    // Lista cerrada: ni uno de mas -que restringiria algo que ningun requisito pide- ni uno de
    // menos. `design.md > 3`.
    const nombres = up
      .map((statement) => /ADD CONSTRAINT "([^"]+)" CHECK/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(nombres).toEqual([
      'orders_quantity_positive',
      'orders_unit_price_non_negative',
      'orders_delivered_not_deleted',
      'orders_order_sequence_positive',
      'orders_order_year_matches_created_at',
    ])
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(5)
  })

  it('existe el CHECK orders_quantity_positive con `> 0`, y el test cae si se cambia a `>= 0`', () => {
    // R7 y decision cerrada 7: ni negativa ni cero. La ausencia la rechaza el NOT NULL (23502) y
    // el cero este CHECK (23514); el test de integracion distingue los dos.
    expect(isStrictlyPositiveCheck(checkQuantity, 'quantity')).toBe(true)
    expect(checkQuantity).toMatch(/ALTER TABLE "?orders"?/i)
    expect(createOrders).toMatch(/"quantity" DECIMAL\(14,4\) NOT NULL/i)

    // MUTACION 3 — en memoria; el archivo en disco no se toca.
    const relajado = checkQuantity.replace(/>\s*0/, '>= 0')
    expect(relajado, 'la mutacion no se aplico sobre el CHECK').not.toBe(checkQuantity)
    expect(isStrictlyPositiveCheck(relajado, 'quantity'), 'un CHECK >= 0 no deberia pasar').toBe(
      false,
    )
    // Y cualquier otro aflojamiento, tambien.
    for (const laxo of ['> -1', '>= -1', '<> 0']) {
      const mutado = checkQuantity.replace(/>\s*0/, laxo)
      expect(isStrictlyPositiveCheck(mutado, 'quantity'), `un CHECK ${laxo} no deberia pasar`).toBe(
        false,
      )
    }
  })

  it('existe el CHECK orders_unit_price_non_negative con `>= 0`', () => {
    // R9 y decision cerrada 6: «nunca negativo», NO «siempre positivo». El precio CERO es
    // legitimo -una muestra, una reposicion sin cargo- y es la diferencia DELIBERADA con el CHECK
    // de la cantidad. Si alguien lo endurece a `> 0`, este caso cae.
    expect(isNonNegativeCheck(checkUnitPrice, 'unit_price')).toBe(true)
    expect(isStrictlyPositiveCheck(checkUnitPrice, 'unit_price'), 'el cero debe seguir cabiendo')
      .toBe(false)
    expect(checkUnitPrice).toMatch(/ALTER TABLE "?orders"?/i)
    // La ausencia la rechaza el NOT NULL, no el CHECK (23502 frente a 23514).
    expect(createOrders).toMatch(/"unit_price" DECIMAL\(14,4\) NOT NULL/i)

    // Sensibilidad: endurecerlo a `> 0` tumba el predicado.
    const endurecido = checkUnitPrice.replace(/>=\s*0/, '> 0')
    expect(endurecido, 'la mutacion no se aplico').not.toBe(checkUnitPrice)
    expect(isNonNegativeCheck(endurecido, 'unit_price')).toBe(false)
  })

  it('existe el CHECK orders_delivered_not_deleted con su texto exacto, y el test cae si se quita', () => {
    // R29 y decision cerrada 14: un pedido ENTREGADO no se borra, y la garantia vive EN LA BASE,
    // no solo en la validacion de QC-34 (misma filosofia que QC-20 D16). Texto EXACTO: se compara
    // literalmente, no con una expresion equivalente.
    expect(hasDeliveredNotDeletedCheck(up)).toBe(true)
    expect(checkDelivered).toContain(DELIVERED_CHECK)
    expect(checkDelivered).toMatch(/ALTER TABLE "?orders"?/i)

    // MUTACION 4 — quitar la sentencia entera del UP. El predicado tiene que caer.
    const sinCheck = up.filter((statement) => statement !== checkDelivered)
    expect(sinCheck.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasDeliveredNotDeletedCheck(sinCheck), 'sin el CHECK no deberia pasar').toBe(false)

    // Y reformularlo tampoco vale: el texto lo fijo el humano y no se «mejora».
    const reformulado = up.map((statement) =>
      statement === checkDelivered
        ? statement.replace(DELIVERED_CHECK, `CHECK (NOT ("status" = 'ENTREGADO' AND "deleted_at" IS NOT NULL))`)
        : statement,
    )
    expect(hasDeliveredNotDeletedCheck(reformulado)).toBe(false)
  })

  it('el CHECK solo alcanza a ENTREGADO', () => {
    // R30: borrar logicamente un PENDIENTE o un EN_CURSO sigue siendo legal, y poner ENTREGADO a
    // un pedido VIVO tambien. La condicion nombra un unico estado, y `deleted_at IS NULL` es la
    // primera rama: mientras la fila este viva, el CHECK se satisface pase lo que pase con el
    // estado. Un CHECK de mas -o que nombrase otro estado- lo prohibiria en silencio.
    expect(checkDelivered).toContain('"deleted_at" IS NULL OR')
    for (const otroEstado of ['PENDIENTE', 'EN_CURSO']) {
      expect(checkDelivered, `el CHECK no debe nombrar ${otroEstado}`).not.toContain(otroEstado)
    }
    // Y ningun otro CHECK de la migracion menciona `status` ni `deleted_at`.
    const otrosChecks = up.filter(
      (statement) => /CHECK\s*\(/i.test(statement) && statement !== checkDelivered,
    )
    expect(otrosChecks).toHaveLength(4)
    for (const statement of otrosChecks) {
      expect(statement).not.toMatch(/"status"/i)
      expect(statement).not.toMatch(/"deleted_at"/i)
    }
    // Tampoco hay ningun CHECK que restrinja las transiciones: eso es QC-34 (R19).
    expect(up.filter((statement) => /CREATE TRIGGER/i.test(statement))).toHaveLength(0)
  })

  it('existe el CHECK orders_order_sequence_positive', () => {
    // R20 y decision cerrada 9: la posicion del correlativo es un entero POSITIVO. Una posicion 0
    // o negativa no es un correlativo. La ausencia del ano o de la posicion la rechaza el NOT
    // NULL (23502).
    expect(isStrictlyPositiveCheck(checkSequence, 'order_sequence')).toBe(true)
    expect(createOrders).toMatch(/"order_year" INTEGER NOT NULL/i)
    expect(createOrders).toMatch(/"order_sequence" INTEGER NOT NULL/i)
    // Sin `@default` ni secuencia: la posicion la calcula QC-34, y una `SERIAL` seria global y
    // rompería el reinicio anual.
    expect(createOrders).not.toMatch(/"order_sequence"[^,]*(SERIAL|nextval|DEFAULT)/i)

    const relajado = checkSequence.replace(/>\s*0/, '>= 0')
    expect(relajado, 'la mutacion no se aplico').not.toBe(checkSequence)
    expect(isStrictlyPositiveCheck(relajado, 'order_sequence')).toBe(false)
  })

  it("existe el CHECK orders_order_year_matches_created_at con su texto exacto, y el test cae si se le quita el AT TIME ZONE 'UTC'", () => {
    // R41 y decision cerrada 28: el ano del correlativo es el de `created_at` MEDIDO EN UTC, y la
    // garantia vive en la base. Sin esto, nada impide un pedido de 2027 numerado `2026-0000001`.
    expect(matchesUtcYearCheck(checkYear)).toBe(true)
    expect(checkYear).toContain(YEAR_CHECK)
    expect(checkYear).toMatch(/ALTER TABLE "?orders"?/i)

    // MUTACION 5 — quitar el cambio de zona. Sin el, la expresion es STABLE y Postgres RECHAZA la
    // migracion («functions in check constraint must be marked IMMUTABLE»); si colara, el ano
    // dependeria del `TimeZone` de la conexion.
    const sinUtc = checkYear.replace(/ AT TIME ZONE 'UTC'/i, '')
    expect(sinUtc, "la mutacion no quito el AT TIME ZONE 'UTC'").not.toBe(checkYear)
    expect(matchesUtcYearCheck(sinUtc), 'sin el cambio de zona no deberia pasar').toBe(false)

    // Otra zona tampoco vale: la decision fija UTC, no el reloj de Ecuador.
    const otraZona = checkYear.replace(/'UTC'/i, "'America/Guayaquil'")
    expect(matchesUtcYearCheck(otraZona)).toBe(false)
  })
})

describe('migration.sql — las cuatro claves foraneas', () => {
  const fkRecipe = findStatement(up, /ADD CONSTRAINT "?orders_recipe_id_fkey"?/i)
  const fkUnit = findStatement(up, /ADD CONSTRAINT "?orders_unit_id_fkey"?/i)
  const fkCreatedBy = findStatement(up, /ADD CONSTRAINT "?orders_created_by_fkey"?/i)
  const fkUpdatedBy = findStatement(up, /ADD CONSTRAINT "?orders_updated_by_fkey"?/i)

  it('las cuatro FK estan escritas en el SQL', () => {
    // R33 y decision cerrada 17: `recipe_id`, `unit_id`, `created_by` y `updated_by` son
    // ESCALARES sin `@relation` en Prisma -para que el ORM no atraviese de modulo con un
    // `include`- pero las cuatro FK son REALES y estan escritas A MANO aqui. Prisma no las
    // regenera: si el drift se las lleva, el esquema sigue validando y no se entera nadie.
    const aMano = [
      ['orders_recipe_id_fkey', 'recipe_id', 'recipes'],
      ['orders_unit_id_fkey', 'unit_id', 'units'],
      ['orders_created_by_fkey', 'created_by', 'users'],
      ['orders_updated_by_fkey', 'updated_by', 'users'],
    ] as const

    for (const [constraint, columna, destino] of aMano) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} sobre orders`).toMatch(/ALTER TABLE "?orders"?/i)
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${columna}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(new RegExp(`REFERENCES "?${destino}"?\\s*\\(\\s*"?id"?\\s*\\)`, 'i'))
      expect(isRestrictOnDelete(statement), `${constraint} debe ser ON DELETE RESTRICT`).toBe(true)
      expect(statement).toMatch(/ON UPDATE CASCADE/i)
    }
    // Exactamente cuatro, ni una mas.
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(4)
    // Con su indice del lado hijo cada una: Postgres no indexa el hijo de una FK, y por ahi pasa
    // tanto la verificacion del RESTRICT como la consulta «que pedidos usan esta receta».
    for (const indice of [
      'orders_recipe_id_idx',
      'orders_unit_id_idx',
      'orders_created_by_idx',
      'orders_updated_by_idx',
    ]) {
      expect(
        up.some((statement) => new RegExp(`^CREATE INDEX "?${indice}"?`, 'i').test(statement)),
        `falta ${indice}`,
      ).toBe(true)
    }
  })

  it('existe orders_unit_id_fkey', () => {
    // R12 y decision cerrada 11: la unidad es obligatoria y es referencia al catalogo de QC-32.
    // Un pedido sin unidad se rechaza con 23502 (NOT NULL) y con una unidad inexistente con 23503
    // (esta FK).
    expect(fkUnit).toMatch(/FOREIGN KEY \(\s*"?unit_id"?\s*\)/i)
    expect(fkUnit).toMatch(/REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i)
    expect(createOrders).toMatch(/"unit_id" UUID NOT NULL/i)
  })

  it('orders_unit_id_fkey es ON DELETE RESTRICT, y el test cae si se cambia a CASCADE', () => {
    // R13. Aqui el RESTRICT es la garantia ACTIVA: `units` NO tiene borrado logico (QC-32,
    // decision 11), asi que un DELETE sobre una unidad usada es posible y esto es lo unico que lo
    // para. Con CASCADE, borrar una unidad se llevaria los pedidos por delante.
    expect(isRestrictOnDelete(fkUnit)).toBe(true)

    // MUTACION 2 — RESTRICT -> CASCADE, en memoria.
    const mutado = fkUnit.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkUnit)
    expect(isRestrictOnDelete(mutado), 'ON DELETE CASCADE no deberia pasar').toBe(false)
    for (const accion of ['SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      expect(
        isRestrictOnDelete(fkUnit.replace(/ON DELETE RESTRICT/i, `ON DELETE ${accion}`)),
        `ON DELETE ${accion} no deberia pasar`,
      ).toBe(false)
    }
  })

  it('existe orders_recipe_id_fkey', () => {
    // R14 y decision cerrada 16: la receta es obligatoria y es referencia. Un pedido sin receta
    // se rechaza con 23502 y con una receta inexistente con 23503.
    expect(fkRecipe).toMatch(/FOREIGN KEY \(\s*"?recipe_id"?\s*\)/i)
    expect(fkRecipe).toMatch(/REFERENCES "?recipes"?\s*\(\s*"?id"?\s*\)/i)
    expect(createOrders).toMatch(/"recipe_id" UUID NOT NULL/i)
  })

  it('orders_recipe_id_fkey es ON DELETE RESTRICT', () => {
    // R15: el borrado de receta es LOGICO (QC-24), asi que en operacion normal esta FK no se
    // dispara nunca -ninguna FK reacciona a un UPDATE- y el pedido conserva su referencia intacta
    // apuntando a la receta dada de baja. Existe para que un borrado FISICO por consola o una
    // purga no deje pedidos apuntando al vacio.
    expect(isRestrictOnDelete(fkRecipe)).toBe(true)
    const mutado = fkRecipe.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkRecipe)
    expect(isRestrictOnDelete(mutado)).toBe(false)
  })

  it('existen orders_created_by_fkey y orders_updated_by_fkey', () => {
    // R25 y decision cerrada 17: el autor y el ultimo editor son usuarios que EXISTEN, y lo
    // garantiza la base aunque Prisma no declare la relacion. Las columnas son ANULABLES (R26) y
    // eso no afloja nada: en SQL una FK solo se verifica cuando la columna tiene valor.
    for (const statement of [fkCreatedBy, fkUpdatedBy]) {
      expect(statement).toMatch(/ALTER TABLE "?orders"?/i)
      expect(statement).toMatch(/REFERENCES "?users"?\s*\(\s*"?id"?\s*\)/i)
      // NUNCA `ON DELETE SET NULL`: convertiria «al usuario lo borraron» en «no lo creo una
      // persona», que son cosas distintas y la decision 18 las separa a proposito.
      expect(statement).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
      expect(isRestrictOnDelete(statement)).toBe(true)
    }
    // Anulables en la tabla, y sin `NOT NULL` (R26).
    expect(createOrders).toMatch(/"created_by" UUID,/i)
    expect(createOrders).toMatch(/"updated_by" UUID,/i)
    expect(createOrders).not.toMatch(/"created_by" UUID NOT NULL/i)
    expect(createOrders).not.toMatch(/"updated_by" UUID NOT NULL/i)
  })
})

describe('migration.sql — el correlativo por ano', () => {
  const uniqueIndex = findStatement(
    up,
    /^CREATE UNIQUE INDEX "?orders_order_year_order_sequence_key"?/i,
  )

  it('existe CREATE UNIQUE INDEX sobre (order_year, order_sequence)', () => {
    // R21 y decision cerrada 9: la unicidad del correlativo la garantiza un INDICE, no una
    // comprobacion previa por igualdad -que seria una carrera entre dos altas simultaneas-. Si el
    // drift se lo lleva, nada mas lo nota.
    expect(coversYearAndSequence(uniqueIndex)).toBe(true)
    expect(uniqueIndex).toMatch(/^CREATE UNIQUE INDEX/i)

    // Sensibilidad: un indice NO unico sobre las mismas columnas no garantiza nada.
    const noUnico = uniqueIndex.replace(/CREATE UNIQUE INDEX/i, 'CREATE INDEX')
    expect(noUnico, 'la mutacion no se aplico').not.toBe(uniqueIndex)
    expect(isTotalUniqueIndex(noUnico), 'un indice no unico no deberia pasar').toBe(false)
    // Y sobre otras columnas tampoco: tiene que ser esa pareja.
    expect(
      coversYearAndSequence(uniqueIndex.replace(/"order_sequence"/, '"recipe_id"')),
    ).toBe(false)
  })

  it('el indice unico del correlativo NO lleva WHERE, y el test cae si se le anade `WHERE deleted_at IS NULL`', () => {
    // R22 y decision cerrada 9: el indice es TOTAL, y eso es LO CONTRARIO de `recipes_name_unique`
    // (QC-24 R9), que si es parcial y libera el nombre al borrar. Aqui el borrado es LOGICO: la
    // fila del pedido borrado sigue existiendo y sigue ocupando su (ano, posicion), asi que nadie
    // reutiliza el numero. Es facil de copiar mal.
    expect(isTotalUniqueIndex(uniqueIndex)).toBe(true)
    expect(uniqueIndex).not.toMatch(/WHERE/i)

    // MUTACION 1 — anadir el predicado parcial, en memoria. Romperia R22 EN SILENCIO.
    const parcial = `${uniqueIndex} WHERE "deleted_at" IS NULL`
    expect(parcial, 'la mutacion no anadio el WHERE').not.toBe(uniqueIndex)
    expect(isTotalUniqueIndex(parcial), 'un indice parcial no deberia pasar').toBe(false)
    // Cualquier otro predicado tampoco: total significa SIN `WHERE`.
    expect(isTotalUniqueIndex(`${uniqueIndex} WHERE "status" <> 'ENTREGADO'`)).toBe(false)

    // Y ningun otro indice de la migracion es parcial.
    for (const statement of up.filter((candidate) => /^CREATE (UNIQUE )?INDEX/i.test(candidate))) {
      expect(statement, 'ningun indice de orders es parcial').not.toMatch(/WHERE/i)
    }
  })

  it('el ano forma parte de la clave unica', () => {
    // R23: (2026, 1) y (2027, 1) son dos claves DISTINTAS, asi que la numeracion se reinicia cada
    // ano. El reinicio sale gratis de que el ano este EN el indice; el prefijo izquierdo sirve
    // ademas de indice para «pedidos de este ano», por eso no hay un `orders_order_year_idx`
    // aparte.
    expect(uniqueIndex).toMatch(/\(\s*"?order_year"?\s*,/i)
    expect(coversYearAndSequence(uniqueIndex)).toBe(true)
    // Y no hay ningun OTRO indice unico que impida repetir la posicion entre anos.
    const unicos = up.filter((statement) => /^CREATE UNIQUE INDEX/i.test(statement))
    expect(unicos).toHaveLength(1)
    expect(unicos[0]).toBe(uniqueIndex)
    expect(up.some((statement) => /^CREATE UNIQUE INDEX[^(]*\(\s*"?order_sequence"?\s*\)/i.test(statement)))
      .toBe(false)
  })

  it('la migracion no crea ninguna restriccion de continuidad sobre order_sequence', () => {
    // R42 y decision cerrada 27: los huecos SE ACEPTAN. Un alta que se cae a medio camino consume
    // su numero y nadie lo reutiliza. Una numeracion continua obligaria a SERIALIZAR las altas con
    // un bloqueo, y este ERP no factura ni liquida impuestos (decision 23), asi que ninguna norma
    // contable la exige. Una AUSENCIA de restriccion hay que afirmarla en positivo.
    const sobreLaPosicion = up.filter((statement) => /order_sequence/i.test(statement))
    expect(sobreLaPosicion).toEqual([createOrders, uniqueIndex, findStatement(up, /orders_order_sequence_positive/i)])

    // Nada que exija «la siguiente»: ni secuencia, ni trigger, ni funcion, ni ventana.
    for (const prohibido of [
      /CREATE SEQUENCE/i,
      /nextval\s*\(/i,
      /CREATE TRIGGER/i,
      /CREATE (OR REPLACE )?FUNCTION/i,
      /\bLAG\s*\(/i,
      /\bLEAD\s*\(/i,
      /\bSERIAL\b/i,
      /GENERATED\s+(ALWAYS|BY DEFAULT)\s+AS\s+IDENTITY/i,
    ]) {
      expect(
        up.filter((statement) => prohibido.test(statement)),
        `la migracion no debe usar ${String(prohibido)}`,
      ).toHaveLength(0)
    }
    // El unico CHECK sobre la posicion es el de «entero positivo», que no habla de continuidad.
    const checkSequence = findStatement(up, /ADD CONSTRAINT "?orders_order_sequence_positive"?/i)
    expect(checkSequence).toContain('CHECK ("order_sequence" > 0)')
  })
})

describe('migration.sql — idioma de los identificadores y RLS', () => {
  it('todos los identificadores creados por la migracion estan en ingles, y los valores de los enum son los que fijo el humano', () => {
    // R36: tabla, columnas, indices, restricciones y tipos en INGLES. Los VALORES de los dos
    // conjuntos cerrados son terminos de negocio fijados por el humano y van en castellano (R16):
    // la regla del idioma alcanza a los identificadores, no a los datos.
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(20)
    expect(identificadores).toContain('orders')
    expect(identificadores).toContain('order_year')
    expect(identificadores).toContain('unit_price')
    expect(identificadores).toContain('orders_order_year_order_sequence_key')
    expect(identificadores).toContain('orders_delivered_not_deleted')
    expect(identificadores).toContain('orders_order_year_matches_created_at')

    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }

    // Los dos tipos son `PascalCase` por convencion de Prisma, y tambien en ingles.
    for (const tipo of createdTypes(up)) {
      expect(tipo, `el tipo ${tipo} debe ser PascalCase ingles`).toMatch(/^Order(Status|Priority)$/)
    }
    // Y sus VALORES, en castellano y en su orden exacto.
    expect(findStatement(up, /^CREATE TYPE "?OrderStatus"?/i)).toContain(
      `AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO')`,
    )
    expect(findStatement(up, /^CREATE TYPE "?OrderPriority"?/i)).toContain(
      `AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')`,
    )
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    // Sensibilidad de R36: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of ['pedido', 'pedidos', 'cantidad', 'unidad', 'precio', 'prioridad', 'estado']) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('ano_pedido')).toBe(false)
    expect(isEnglishSnakeCase('pedidos_creado_por_fkey')).toBe(false)
    expect(isEnglishSnakeCase('Orders')).toBe(false)
    expect(isEnglishSnakeCase('order year')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('order_sequence')).toBe(true)
    expect(isEnglishSnakeCase('orders_unit_price_non_negative')).toBe(true)
  })

  it('orders queda con RLS activado y forzado', () => {
    // R37. Sin `FORCE`, el dueno de las tablas -que es con quien se conecta Prisma- la ignora
    // entera. Se activa sin policies: deny-by-default para cualquier via que no sea Prisma. Es
    // defensa en profundidad, NO la frontera de autorizacion
    // (`docs/architecture.md > Acceso a datos y autorizacion`), que la fija QC-34.
    expect(hasRlsEnabledAndForced(up, 'orders')).toBe(true)
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(2)

    // Sensibilidad: quitar el FORCE tiene que tumbar el predicado -y es la mitad que importa,
    // porque el ENABLE solo no hace nada contra el dueno-.
    const sinForce = up.filter(
      (statement) => !/^ALTER TABLE "?orders"? FORCE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(sinForce.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasRlsEnabledAndForced(sinForce, 'orders')).toBe(false)

    const sinEnable = up.filter(
      (statement) => !/^ALTER TABLE "?orders"? ENABLE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(hasRlsEnabledAndForced(sinEnable, 'orders')).toBe(false)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql borra la tabla y los dos tipos, en ese orden, y nada mas; y el test cae si se quita un DROP TYPE', () => {
    // R38. Los cinco indices, los cinco CHECK y las cuatro FK cuelgan de `orders` y caen con ella:
    // un `DROP CONSTRAINT` «por simetria» sobraria. LOS DOS TIPOS SI hay que borrarlos a mano —un
    // DROP TABLE no se lleva un enum— y dejarlos huerfanos NO es «el esquema exacto anterior».
    // Es el primer `down.sql` del repo que borra tipos.
    expect(droppedTables(down)).toEqual(createdTables(up))
    expect(dropsBothEnumTypes(down)).toBe(true)
    // EL ORDEN IMPORTA: los tipos, DESPUES de la tabla que los usa. Al reves, Postgres rechaza el
    // DROP TYPE por dependencia.
    expect(down[0]).toMatch(/^DROP TABLE (?:IF EXISTS )?"?orders"?/i)
    expect(droppedTypes(down)).toEqual(['OrderStatus', 'OrderPriority'])
    // Y nada mas: tres sentencias, ni una de mas.
    expect(down).toHaveLength(3)
    expect(down.every((statement) => /^DROP (TABLE|TYPE) IF EXISTS/i.test(statement))).toBe(true)

    // MUTACION 6 — quitar un `DROP TYPE`. Es el caso que deja el enum huerfano y la reversion
    // incompleta, y sin esta mutacion el predicado no vigilaria nada.
    const sinUnTipo = down.filter((statement) => !/DROP TYPE IF EXISTS "?OrderPriority"?/i.test(statement))
    expect(sinUnTipo.length, 'la mutacion no quito ninguna sentencia').toBe(down.length - 1)
    expect(dropsBothEnumTypes(sinUnTipo), 'con un solo DROP TYPE no deberia pasar').toBe(false)
    // Quitar el otro tambien tiene que caer: el predicado exige los dos, no «alguno».
    const sinElOtro = down.filter((statement) => !/DROP TYPE IF EXISTS "?OrderStatus"?/i.test(statement))
    expect(dropsBothEnumTypes(sinElOtro)).toBe(false)

    // No toca `pgcrypto`: esta migracion no la crea en exclusiva (`IF NOT EXISTS`) y de ella
    // dependen `identity`, `inventario`, `recetas` y `unidades`. Se mira el SQL EJECUTABLE: la
    // cabecera lo explica en prosa.
    const downEjecutable = stripSqlComments(downSource)
    expect(downEjecutable).not.toMatch(/pgcrypto/i)
    expect(downEjecutable).not.toMatch(/DROP\s+EXTENSION/i)
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )

    // Y no se lleva por delante ninguna tabla de `identity`, `inventario`, `recetas` ni
    // `unidades`: revertir esta migracion solo revierte esta migracion.
    for (const ajena of [
      'users',
      'roles',
      'document_types',
      'products',
      'presentations',
      'recipes',
      'recipe_lines',
      'units',
    ]) {
      expect(droppedTables(down), `el DOWN no debe dropear ${ajena}`).not.toContain(ajena)
      expect(downEjecutable, `el DOWN no debe nombrar ${ajena}`).not.toMatch(
        new RegExp(`\\b${ajena}\\b`, 'i'),
      )
    }
  })
})
