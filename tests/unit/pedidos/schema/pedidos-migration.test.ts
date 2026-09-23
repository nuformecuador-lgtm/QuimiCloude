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
 * dia se renombra, el test tiene que caer por lo que vigila, no por la ruta. Ancla el sufijo
 * justo despues de los 14 digitos del timestamp (no un `endsWith` suelto): `_orders` no debe
 * confundirse con `_reserve_existing_orders`, que tambien termina en `_orders`.
 */
function findMigrationDir(suffix: string): string {
  const migrationsRoot = join(repoRoot, 'db', 'migrations')
  const pattern = new RegExp(`^\\d{14}${suffix}$`)
  const candidates = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
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

// OJO (QC-60): este bloque vigila el SQL DE QC-33, que es historico y no cambia. El indice que
// describe, `orders_order_year_order_sequence_key`, YA NO ESTA VIVO en el esquema: QC-60 lo
// sustituyo por `orders_company_year_sequence_key`, con `company_id` de cabeza, porque el
// correlativo pasa a medirse DENTRO de la empresa. Lo que sigue siendo cierto --y es lo unico que
// se afirma aqui-- es que ASI lo dejo escrito QC-33. El relevo lo vigila
// `orders-company-scope-migration.test.ts`, y el ultimo bloque de este archivo lo ata.
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

// ---------------------------------------------------------------------------------------------
// T9 — Contrato estatico del SQL de la migracion `order_cancellation` (QC-34: crud-de-pedidos).
//
// Lo de arriba vigila QC-33 y NO SE TOCA. Esto vigila la UNICA migracion de QC-34
// (`specs/QC-34-crud-de-pedidos/design.md` secciones 3.1-3.6, 4.1 y 12), que anade el cuarto
// valor del conjunto cerrado, la columna del motivo, el CHECK de R30, el CHECK de borrado
// ampliado y la funcion `next_order_sequence`. Nada de eso lo regenera Prisma salvo la columna:
// todo lo demas es DRIFT y esta es su unica guardia.
//
// OJO (QC-60): `next_order_sequence(integer)` YA NO EXISTE en la base. QC-60 la mato porque su
// firma --solo el ano-- no puede expresar una serie por `(empresa, ano)`, y el numero pasa a
// repartirlo el adaptador con `pg_advisory_xact_lock` y `max()+1` dentro del `INSERT`. Lo que
// este bloque afirma sigue siendo cierto y sigue haciendo falta: que QC-34 la dejo ESCRITA ASI,
// porque el `down.sql` de QC-60 la recrea IDENTICA y esta es la unica descripcion de «identica»
// que hay en el repo. El relevo lo ata el ultimo bloque de este archivo.
//
// Misma tecnica: PREDICADO PURO aplicado DOS VECES, al SQL real (pasa) y a una version MUTADA EN
// MEMORIA (falla). El archivo en disco no se toca nunca. Las SEIS mutaciones obligatorias
// (`design.md > 12`) son: (1) quitar el `::text` de un CHECK, (2) cambiar la igualdad de
// booleanos de R30 por una implicacion, (3) quitar `CANCELADO` del `NOT IN`, (4) quitar el
// `DROP DEFAULT` del down, (5) quitar la guardia de datos del paso 0 y (6) sustituir el bloque de
// recreacion del tipo por un `ALTER TYPE ... DROP VALUE`. El predicado cae en las seis.
//
// Cubre R30, R32, R48, R49, R50 y R51.

const cancellationDir = findMigrationDir('_order_cancellation')

/**
 * El troceador de arriba parte por `;` a secas, y esta migracion lleva cuerpos con
 * comilla-dolar (`CREATE FUNCTION ... AS $$ ... $$`, `DO $$ ... END $$`) que contienen `;`
 * propios. Partirlos por ahi trocearia el cuerpo de la funcion en pedazos sin sentido, asi que
 * este troceador ignora los `;` que estan DENTRO de un bloque `$$`.
 */
function splitTopLevelStatements(sql: string): readonly string[] {
  const out: string[] = []
  let current = ''
  let dentroDeDolar = false
  for (let i = 0; i < sql.length; i += 1) {
    if (sql.startsWith('$$', i)) {
      dentroDeDolar = !dentroDeDolar
      current += '$$'
      i += 1
      continue
    }
    const caracter = sql[i] as string
    if (caracter === ';' && !dentroDeDolar) {
      out.push(current)
      current = ''
      continue
    }
    current += caracter
  }
  out.push(current)
  return out
}

function dollarAwareStatements(sql: string): readonly string[] {
  return splitTopLevelStatements(stripSqlComments(sql))
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const cancelUpSource = readFileSync(join(cancellationDir, 'migration.sql'), 'utf8')
const cancelDownSource = readFileSync(join(cancellationDir, 'down.sql'), 'utf8')
const cancelUp = dollarAwareStatements(cancelUpSource)
const cancelDown = dollarAwareStatements(cancelDownSource)

/** Como `findStatement`, pero lanza en vez de afirmar: se usa tambien a nivel de modulo. */
function onlyStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  if (found.length !== 1) {
    throw new Error(
      `se esperaba exactamente una sentencia que coincidiera con ${String(pattern)}; hay ${String(
        found.length,
      )}`,
    )
  }
  return found[0] as string
}

// --- Textos EXACTOS que fija `design.md`. Se comparan literalmente y no se «mejoran» ---

const ADD_CANCELADO_VALUE = `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELADO'`
const REASON_CHECK = `CHECK (("status"::text = 'CANCELADO') = ("cancellation_reason" IS NOT NULL))`
const DELETE_CHECK_QC34 = `CHECK ("deleted_at" IS NULL OR "status"::text NOT IN ('ENTREGADO', 'CANCELADO'))`

/**
 * MUTACION 1 — ¿La sentencia compara el estado POR TEXTO y nunca como valor de enum?
 * (`design.md > 3.1`)
 *
 * Postgres NO deja usar un valor recien anadido a un enum como valor del enum en la misma
 * transaccion que lo anadio, y Prisma Migrate ejecuta cada migracion en una: `"status" =
 * 'CANCELADO'` reventaria con `55P04 unsafe use of new value`. El cast a texto es IMMUTABLE y
 * por eso sigue valiendo dentro de un CHECK. NO es cosmetico y no se simplifica.
 */
function comparesStatusAsText(statement: string): boolean {
  const casteaATexto = /"status"::text/i.test(statement)
  const comparaComoEnum = /"status"\s*(?:=|<>|!=|\bNOT\s+IN\b|\bIN\b)/i.test(statement)
  return casteaATexto && !comparaComoEnum
}

/**
 * MUTACION 2 — ¿El CHECK del motivo es una IGUALDAD DE BOOLEANOS, con su texto exacto? (R30)
 *
 * Una implicacion (`a <= b`, o `NOT a OR b`) solo cubriria un sentido: dejaria escribir un motivo
 * en un pedido NO cancelado, que la decision cerrada 4 prohibe expresamente.
 */
function isBiconditionalReasonCheck(source: readonly string[]): boolean {
  return source.some(
    (statement) =>
      /ADD CONSTRAINT "?orders_cancellation_reason_matches_status"?/i.test(statement) &&
      statement.includes(REASON_CHECK) &&
      comparesStatusAsText(statement),
  )
}

/**
 * MUTACION 3 — ¿El CHECK de borrado excluye LOS DOS estados finales, con su texto exacto? (R32)
 *
 * Quitar `'CANCELADO'` del `NOT IN` deja borrar un pedido cancelado, que es justo lo que la
 * decision cerrada 9 amplia respecto de QC-33.
 */
function blocksDeletingBothFinalStatuses(source: readonly string[]): boolean {
  return source.some(
    (statement) =>
      /ADD CONSTRAINT "?orders_delivered_not_deleted"?/i.test(statement) &&
      statement.includes(DELETE_CHECK_QC34) &&
      comparesStatusAsText(statement),
  )
}

/**
 * MUTACIONES 4 y 6 — ¿El DOWN RECREA el tipo entero, con su `DROP DEFAULT`, y sin ningun
 * `ALTER TYPE ... DROP VALUE`? (R49)
 *
 * `ALTER TYPE ... DROP VALUE` NO EXISTE en Postgres, en ninguna version. Y el DEFAULT hay que
 * quitarlo ANTES del `ALTER COLUMN ... TYPE` y reponerlo despues: Postgres no sabe recastear el
 * default de un tipo que esta cambiando.
 */
function recreatesEnumType(source: readonly string[]): boolean {
  const tiene = (pattern: RegExp): boolean => source.some((statement) => pattern.test(statement))
  const renombra = tiene(/^ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old"$/i)
  const crea = tiene(
    /^CREATE TYPE "OrderStatus" AS ENUM \('PENDIENTE', 'EN_CURSO', 'ENTREGADO'\)$/i,
  )
  const quitaDefault = tiene(/^ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT$/i)
  const casteaPorTexto = tiene(
    /ALTER COLUMN "status" TYPE "OrderStatus" USING \("status"::text::"OrderStatus"\)/i,
  )
  const reponeDefault = tiene(/ALTER COLUMN "status" SET DEFAULT 'PENDIENTE'/i)
  const borraElViejo = tiene(/^DROP TYPE (?:IF EXISTS )?"OrderStatus_old"$/i)
  const sinDropValue = !tiene(/ALTER TYPE[\s\S]*DROP VALUE/i)
  return (
    renombra &&
    crea &&
    quitaDefault &&
    casteaPorTexto &&
    reponeDefault &&
    borraElViejo &&
    sinDropValue
  )
}

/**
 * MUTACION 5 — ¿El DOWN lleva la guardia de datos del paso 0? (R50)
 *
 * Sin ella, revertir con pedidos cancelados o revienta al recastear o —peor— alguien la
 * «arregla» convirtiendolos a otro estado y corre el dato en silencio.
 */
function hasCancelledRowsGuard(source: readonly string[]): boolean {
  const guardia = source.find(
    (statement) => /^DO \$\$/i.test(statement) && /RAISE EXCEPTION/i.test(statement),
  )
  if (guardia === undefined) return false
  return (
    /count\(\*\) INTO cancelled FROM "orders" WHERE "status"::text = 'CANCELADO'/i.test(guardia) &&
    /IF cancelled > 0 THEN/i.test(guardia) &&
    /RAISE EXCEPTION 'ROLLBACK ABORTADO/i.test(guardia)
  )
}

/** ¿El DOWN deja el CHECK de QC-33 en su forma LITERAL? (R49) */
function restoresQc33DeliveredCheck(source: readonly string[]): boolean {
  return hasDeliveredNotDeletedCheck(source)
}

/** ¿El DOWN borra la funcion y TODAS las secuencias creadas al vuelo? (R49) */
function dropsSequenceMachinery(source: readonly string[]): boolean {
  const borraFuncion = source.some((statement) =>
    /^DROP FUNCTION IF EXISTS "next_order_sequence"\(integer\)$/i.test(statement),
  )
  const borraSecuencias = source.some(
    (statement) =>
      /^DO \$\$/i.test(statement) &&
      /relkind = 'S' AND c\.relname LIKE 'orders_sequence_%'/i.test(statement) &&
      /DROP SEQUENCE IF EXISTS %I/i.test(statement),
  )
  return borraFuncion && borraSecuencias
}

/**
 * Vocabulario ingles admitido para los identificadores que crea ESTA feature (R51). Es una lista
 * propia y CERRADA: no se toca la de QC-33, porque ampliar aquella para que quepan las palabras
 * de esta seria aflojar una guardia ajena.
 */
const VOCABULARIO_INGLES_QC34 = new Set([
  'cancellation',
  'matches',
  'next',
  'order',
  'orders',
  'reason',
  'sequence',
  'status',
])

function isEnglishSnakeCaseQC34(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES_QC34.has(pieza))
}

describe('QC-34 migration.sql — el cuarto estado, el motivo y la secuencia por ano', () => {
  it('la migracion hace exactamente cinco cosas, en el orden de design.md > 3.6', () => {
    // R48: `ADD VALUE` -> `ADD COLUMN` -> CHECK del motivo -> DROP/ADD del CHECK de borrado ->
    // la funcion. Seis sentencias (el CHECK de borrado son dos), ni una mas.
    expect(cancelUp).toHaveLength(6)
    expect(cancelUp[0]).toBe(ADD_CANCELADO_VALUE)
    expect(cancelUp[1]).toBe(`ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT`)
    expect(cancelUp[2]).toMatch(/ADD CONSTRAINT "orders_cancellation_reason_matches_status"/)
    expect(cancelUp[3]).toBe(`ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted"`)
    expect(cancelUp[4]).toMatch(/ADD CONSTRAINT "orders_delivered_not_deleted"/)
    expect(cancelUp[5]).toMatch(
      /^CREATE OR REPLACE FUNCTION "next_order_sequence"\(p_year integer\)/i,
    )
  })

  it('el valor nuevo del conjunto cerrado se anade con ADD VALUE IF NOT EXISTS y va en castellano', () => {
    // Decision cerrada 3 y R51: los IDENTIFICADORES en ingles, los VALORES del conjunto cerrado en
    // castellano, porque son terminos de negocio fijados por el humano (QC-33 R36).
    expect(cancelUp.filter((statement) => /^ALTER TYPE/i.test(statement))).toEqual([
      ADD_CANCELADO_VALUE,
    ])
    // Y el UP no recrea el tipo: aqui basta con anadir el valor. Recrearlo es cosa del DOWN.
    expect(cancelUp.some((statement) => /CREATE TYPE/i.test(statement))).toBe(false)
  })

  it('el UP no toca ninguna otra columna, restriccion, indice ni tabla (R48)', () => {
    // R48 es una AUSENCIA, y una ausencia hay que afirmarla en positivo. Los cuatro `ALTER TABLE`
    // son los declarados y ninguno mas; y ninguna otra tabla se nombra.
    const altersDeOrders = cancelUp.filter((statement) => /^ALTER TABLE /i.test(statement))
    expect(altersDeOrders).toEqual([
      `ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT`,
      onlyStatement(cancelUp, /ADD CONSTRAINT "orders_cancellation_reason_matches_status"/),
      `ALTER TABLE "orders" DROP CONSTRAINT "orders_delivered_not_deleted"`,
      onlyStatement(cancelUp, /ADD CONSTRAINT "orders_delivered_not_deleted"/),
    ])
    for (const statement of altersDeOrders) {
      expect(statement).toMatch(/^ALTER TABLE "orders" /)
    }
    // Nada de crear o borrar tablas, indices, triggers, FK ni policies.
    for (const prohibido of [
      /CREATE TABLE/i,
      /DROP TABLE/i,
      /CREATE (UNIQUE )?INDEX/i,
      /DROP INDEX/i,
      /CREATE TRIGGER/i,
      /FOREIGN KEY/i,
      /ROW LEVEL SECURITY/i,
      /CREATE POLICY/i,
    ]) {
      expect(
        cancelUp.filter((statement) => prohibido.test(statement)),
        `el UP no debe usar ${String(prohibido)}`,
      ).toHaveLength(0)
    }
    const upEjecutable = stripSqlComments(cancelUpSource)
    for (const ajena of [
      'users',
      'roles',
      'products',
      'presentations',
      'recipes',
      'recipe_lines',
      'units',
      'suppliers',
    ]) {
      expect(upEjecutable, `el UP no debe nombrar ${ajena}`).not.toMatch(
        new RegExp(`"${ajena}"`, 'i'),
      )
    }
    // Solo dos CHECK nuevos, y son los de esta ficha: tras la migracion `orders` tiene SEIS.
    const nombresDeCheck = cancelUp
      .map((statement) => /ADD CONSTRAINT "([^"]+)" CHECK/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(nombresDeCheck).toEqual([
      'orders_cancellation_reason_matches_status',
      'orders_delivered_not_deleted',
    ])
  })

  it('la columna del motivo es TEXT sin longitud y ANULABLE (R27, R30)', () => {
    // Decision cerrada 4: el tope de 500 vive en `zod`, no en la columna -cambiar un tope de
    // validacion no puede ser una migracion-. Y es anulable porque el motivo solo existe en un
    // pedido cancelado: es la mitad del CHECK de R30.
    const addColumn = onlyStatement(cancelUp, /ADD COLUMN "cancellation_reason"/i)
    expect(addColumn).toBe(`ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT`)
    expect(addColumn).not.toMatch(/VARCHAR|CHAR\s*\(|\bNOT NULL\b|\bDEFAULT\b/i)
    expect(addColumn).not.toMatch(/500/)
  })

  it('MUTACION 1 — los dos CHECK comparan el estado por ::text, y el test cae si se le quita', () => {
    // `design.md > 3.1`: sin el cast, Postgres rechaza la migracion con `55P04 unsafe use of new
    // value "CANCELADO" of enum type`, porque el valor se acaba de anadir en esa transaccion.
    const checkMotivo = onlyStatement(cancelUp, /"orders_cancellation_reason_matches_status"/)
    const checkBorrado = onlyStatement(cancelUp, /ADD CONSTRAINT "orders_delivered_not_deleted"/)
    for (const statement of [checkMotivo, checkBorrado]) {
      expect(comparesStatusAsText(statement)).toBe(true)

      // MUTACION 1 — en memoria; el archivo en disco no se toca.
      const sinCast = statement.replace(/"status"::text/gi, '"status"')
      expect(sinCast, 'la mutacion no quito el ::text').not.toBe(statement)
      expect(comparesStatusAsText(sinCast), 'sin el ::text no deberia pasar').toBe(false)
    }
    // Y con el cast quitado, los predicados de los dos CHECK tambien caen.
    expect(isBiconditionalReasonCheck([checkMotivo.replace(/"status"::text/gi, '"status"')])).toBe(
      false,
    )
    expect(
      blocksDeletingBothFinalStatuses([checkBorrado.replace(/"status"::text/gi, '"status"')]),
    ).toBe(false)
  })

  it('MUTACION 2 — el CHECK del motivo es una igualdad de booleanos, y el test cae si se vuelve una implicacion', () => {
    // R30 y decision cerrada 4: el motivo existe SI Y SOLO SI el pedido esta cancelado. Los DOS
    // sentidos. `status` es NOT NULL, asi que ningun lado evalua a NULL -el agujero clasico del
    // CHECK que se cumple por ser nulo-.
    expect(isBiconditionalReasonCheck(cancelUp)).toBe(true)
    const checkMotivo = onlyStatement(cancelUp, /"orders_cancellation_reason_matches_status"/)
    expect(checkMotivo).toContain(REASON_CHECK)

    // MUTACION 2 — `a = b` pasa a `a <= b`, que en booleanos es «a implica b»: dejaria escribir un
    // motivo en un pedido NO cancelado.
    const implicacion = checkMotivo.replace(`'CANCELADO') = (`, `'CANCELADO') <= (`)
    expect(implicacion, 'la mutacion no se aplico').not.toBe(checkMotivo)
    expect(isBiconditionalReasonCheck([implicacion]), 'una implicacion no deberia pasar').toBe(false)

    // Y la otra forma de escribir la misma implicacion tampoco.
    const conOr = checkMotivo.replace(
      REASON_CHECK,
      `CHECK (NOT ("status"::text = 'CANCELADO') OR ("cancellation_reason" IS NOT NULL))`,
    )
    expect(isBiconditionalReasonCheck([conOr]), 'un NOT ... OR no deberia pasar').toBe(false)
    // Ni la implicacion contraria, que dejaria cancelar sin motivo.
    const alReves = checkMotivo.replace(`'CANCELADO') = (`, `'CANCELADO') >= (`)
    expect(isBiconditionalReasonCheck([alReves])).toBe(false)
  })

  it('MUTACION 3 — el CHECK de borrado excluye ENTREGADO y CANCELADO, y el test cae si se quita CANCELADO', () => {
    // R32 y decision cerrada 9: se cancela para dejar constancia, asi que borrar despues la
    // borraria de las consultas. El NOMBRE no cambia -es la misma regla ampliada- y por eso el UP
    // hace DROP y ADD del mismo constraint.
    expect(blocksDeletingBothFinalStatuses(cancelUp)).toBe(true)
    const checkBorrado = onlyStatement(cancelUp, /ADD CONSTRAINT "orders_delivered_not_deleted"/)
    expect(checkBorrado).toContain(DELETE_CHECK_QC34)
    // Sigue siendo simetrico y sigue permitiendo borrar un PENDIENTE o un EN_CURSO (QC-33 R30).
    expect(checkBorrado).toContain('"deleted_at" IS NULL OR')
    for (const vivo of ['PENDIENTE', 'EN_CURSO']) {
      expect(checkBorrado, `el CHECK no debe nombrar ${vivo}`).not.toContain(vivo)
    }

    // MUTACION 3 — quitar `CANCELADO` del NOT IN deja borrar un pedido cancelado EN SILENCIO.
    const soloEntregado = checkBorrado.replace(`'ENTREGADO', 'CANCELADO'`, `'ENTREGADO'`)
    expect(soloEntregado, 'la mutacion no se aplico').not.toBe(checkBorrado)
    expect(
      blocksDeletingBothFinalStatuses([soloEntregado]),
      'sin CANCELADO en el NOT IN no deberia pasar',
    ).toBe(false)
    // Y volver a la definicion literal de QC-33 tampoco vale: es justo lo que esta ficha amplia.
    const comoQc33 = checkBorrado.replace(DELETE_CHECK_QC34, DELIVERED_CHECK)
    expect(blocksDeletingBothFinalStatuses([comoQc33])).toBe(false)
    // Y quitar la sentencia entera, tampoco.
    expect(
      blocksDeletingBothFinalStatuses(cancelUp.filter((statement) => statement !== checkBorrado)),
    ).toBe(false)
  })

  it('la funcion next_order_sequence crea la secuencia del ano al vuelo, con su lock de aviso', () => {
    // R11, R12 y decision cerrada 10, `design.md > 4.1`. El camino normal NO toma ningun lock: es
    // un `nextval` y punto. El `pg_advisory_xact_lock` serializa SOLO la rama de creacion -una vez
    // al ano-; sin el, dos altas simultaneas el 1 de enero pueden chocar con un 42P07/23505 de
    // `pg_class`.
    const funcion = onlyStatement(cancelUp, /CREATE OR REPLACE FUNCTION "next_order_sequence"/i)
    expect(funcion).toMatch(/RETURNS integer/i)
    expect(funcion).toMatch(/LANGUAGE plpgsql/i)
    expect(funcion).toMatch(/seq_name text := format\('orders_sequence_%s', p_year\)/i)
    expect(funcion).toMatch(/RETURN nextval\(seq_name::regclass\)::integer/i)
    expect(funcion).toMatch(/EXCEPTION WHEN undefined_table THEN/i)
    expect(funcion).toMatch(/PERFORM pg_advisory_xact_lock\(hashtext\(seq_name\)\)/i)
    expect(funcion).toMatch(/CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1/i)
    // El lock va DENTRO del manejador de la excepcion, nunca antes del `nextval` del camino feliz:
    // si se adelantara, cada alta del ano haria cola, que es la opcion que la decision 10
    // descarto.
    const posicionNextval = funcion.indexOf('RETURN nextval')
    const posicionExcepcion = funcion.search(/EXCEPTION WHEN undefined_table/i)
    const posicionLock = funcion.search(/pg_advisory_xact_lock/i)
    expect(posicionNextval).toBeGreaterThanOrEqual(0)
    expect(posicionNextval).toBeLessThan(posicionExcepcion)
    expect(posicionExcepcion).toBeLessThan(posicionLock)
    // Ninguna tabla de contadores (alternativa 11.2, descartada: serializa las altas del ano).
    expect(stripSqlComments(cancelUpSource)).not.toMatch(/ON CONFLICT/i)
    expect(
      cancelUp.filter((statement) => /CREATE OR REPLACE FUNCTION/i.test(statement)),
    ).toHaveLength(1)
  })

  it('todos los identificadores que crea la migracion estan en ingles (R51)', () => {
    // R51 y QC-33 R36: columna, restriccion, funcion y secuencias en INGLES; el valor nuevo del
    // conjunto cerrado en castellano, porque es un termino de negocio fijado por el humano.
    const identificadores = [
      'cancellation_reason',
      'orders_cancellation_reason_matches_status',
      'next_order_sequence',
      'orders_sequence',
    ]
    for (const identificador of identificadores) {
      expect(
        isEnglishSnakeCaseQC34(identificador),
        `identificador no ingles: ${identificador}`,
      ).toBe(true)
      expect(
        stripSqlComments(cancelUpSource),
        `la migracion debe crear ${identificador}`,
      ).toContain(identificador)
    }
    // Sensibilidad: si el predicado aceptara el castellano, no vigilaria nada.
    for (const enEspanol of [
      'motivo',
      'motivo_cancelacion',
      'razon',
      'siguiente_secuencia',
      'pedidos_secuencia',
    ]) {
      expect(isEnglishSnakeCaseQC34(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    // Y el UNICO valor de enum que se anade es el castellano que fijo el humano.
    expect(cancelUp[0]).toContain(`'CANCELADO'`)
  })
})

describe('QC-34 down.sql — reversion exacta al esquema de QC-33', () => {
  it('el DOWN da los cinco pasos de design.md > 3.5, en orden', () => {
    // R49. El orden no es negociable: guardia -> los dos CHECK que nombran CANCELADO -> la
    // columna -> la recreacion del tipo -> el CHECK de QC-33 -> el aparato de secuencias.
    expect(cancelDown).toHaveLength(13)
    expect(cancelDown[0]).toMatch(/^DO \$\$/i)
    expect(cancelDown[1]).toBe(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cancellation_reason_matches_status"`,
    )
    expect(cancelDown[2]).toBe(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_delivered_not_deleted"`,
    )
    expect(cancelDown[3]).toBe(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "cancellation_reason"`)
    // Los dos CHECK caen ANTES del cambio de tipo: un ALTER COLUMN TYPE revalida toda restriccion
    // que toque la columna, y una que menciona un valor inexistente en el tipo nuevo no se puede
    // revalidar.
    const posicionRename = cancelDown.findIndex((statement) =>
      /RENAME TO "OrderStatus_old"/i.test(statement),
    )
    expect(posicionRename).toBeGreaterThan(3)
  })

  it('MUTACION 5 — el DOWN aborta si hay pedidos CANCELADO, y el test cae si se quita la guardia', () => {
    // R50: revertir NO puede convertir un pedido cancelado en otra cosa -no hay estado destino que
    // signifique lo mismo, y elegir uno seria inventar un hecho de negocio en un script de
    // rollback-. Un down que los pasara a PENDIENTE saldria verde y correria el dato en silencio.
    expect(hasCancelledRowsGuard(cancelDown)).toBe(true)
    const guardia = cancelDown[0] as string
    expect(guardia).toMatch(
      /RAISE EXCEPTION 'ROLLBACK ABORTADO: hay % pedido\(s\) en estado CANCELADO/i,
    )
    // Y no convierte NINGUNA fila: en todo el DOWN no hay un solo UPDATE ni DELETE.
    for (const statement of cancelDown) {
      expect(statement, 'el DOWN no debe modificar filas').not.toMatch(
        /^(UPDATE|DELETE|TRUNCATE)\b/i,
      )
    }
    expect(stripSqlComments(cancelDownSource)).not.toMatch(/UPDATE "orders"/i)

    // MUTACION 5 — quitar la guardia entera.
    const sinGuardia = cancelDown.filter((statement) => statement !== guardia)
    expect(sinGuardia.length, 'la mutacion no quito ninguna sentencia').toBe(cancelDown.length - 1)
    expect(hasCancelledRowsGuard(sinGuardia), 'sin la guardia no deberia pasar').toBe(false)
    // Y dejarla contando pero sin abortar tampoco vale.
    const sinRaise = [guardia.replace(/RAISE EXCEPTION/i, 'RAISE NOTICE'), ...sinGuardia]
    expect(hasCancelledRowsGuard(sinRaise), 'un RAISE NOTICE no aborta nada').toBe(false)
  })

  it('MUTACIONES 4 y 6 — el DOWN recrea el tipo; cae si se quita el DROP DEFAULT o si aparece un ALTER TYPE ... DROP VALUE', () => {
    // R49: `ALTER TYPE ... DROP VALUE` NO EXISTE EN POSTGRES, en ninguna version. La unica forma
    // es renombrar el viejo, crear el nuevo con los tres valores de QC-33, reescribir la columna
    // casteando POR TEXTO y borrar el viejo.
    expect(recreatesEnumType(cancelDown)).toBe(true)

    // MUTACION 4 — quitar el `DROP DEFAULT`. Postgres no sabe recastear el default de un tipo que
    // esta cambiando, asi que el ALTER COLUMN reventaria; y el orden importa: DROP antes, SET
    // despues.
    const dropDefault = onlyStatement(cancelDown, /ALTER COLUMN "status" DROP DEFAULT/i)
    const sinDropDefault = cancelDown.filter((statement) => statement !== dropDefault)
    expect(sinDropDefault.length, 'la mutacion no quito ninguna sentencia').toBe(
      cancelDown.length - 1,
    )
    expect(recreatesEnumType(sinDropDefault), 'sin el DROP DEFAULT no deberia pasar').toBe(false)
    const posicionDrop = cancelDown.indexOf(dropDefault)
    const posicionTipo = cancelDown.findIndex((statement) =>
      /ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    const posicionSet = cancelDown.findIndex((statement) =>
      /ALTER COLUMN "status" SET DEFAULT/i.test(statement),
    )
    expect(posicionDrop).toBeLessThan(posicionTipo)
    expect(posicionTipo).toBeLessThan(posicionSet)

    // MUTACION 6 — sustituir el bloque de recreacion por el `DROP VALUE` que no existe.
    const bloque =
      /RENAME TO "OrderStatus_old"|^CREATE TYPE "OrderStatus"|ALTER COLUMN "status"|^DROP TYPE "OrderStatus_old"/i
    const conDropValue = [
      ...cancelDown.filter((statement) => !bloque.test(statement)),
      `ALTER TYPE "OrderStatus" DROP VALUE 'CANCELADO'`,
    ]
    expect(conDropValue.length).toBeLessThan(cancelDown.length)
    expect(recreatesEnumType(conDropValue), 'un ALTER TYPE ... DROP VALUE no deberia pasar').toBe(
      false,
    )
    // Y anadirlo SIN quitar nada tampoco: el predicado prohibe que aparezca.
    expect(recreatesEnumType([...cancelDown, `ALTER TYPE "OrderStatus" DROP VALUE 'CANCELADO'`])).toBe(
      false,
    )
    // El tipo nuevo lleva EXACTAMENTE los tres valores de QC-33, en su orden de declaracion -que
    // es el que da significado a `OrderPriority` y al orden del listado-.
    expect(
      recreatesEnumType(
        cancelDown.map((statement) =>
          statement.replace(
            `AS ENUM ('PENDIENTE', 'EN_CURSO', 'ENTREGADO')`,
            `AS ENUM ('PENDIENTE', 'EN_CURSO')`,
          ),
        ),
      ),
    ).toBe(false)
  })

  it('el DOWN restaura el CHECK de QC-33 en su forma literal, y borra la funcion y las secuencias', () => {
    // R49: no basta con dropear el CHECK -eso dejaria la base SIN NINGUNA regla de borrado, que no
    // es «el esquema anterior»-. El texto es el LITERAL de QC-33, el mismo que vigila el bloque de
    // arriba.
    expect(restoresQc33DeliveredCheck(cancelDown)).toBe(true)
    const restaurado = onlyStatement(cancelDown, /ADD CONSTRAINT "orders_delivered_not_deleted"/)
    expect(restaurado).toContain(DELIVERED_CHECK)
    expect(restaurado, 'el CHECK restaurado no debe nombrar CANCELADO').not.toContain('CANCELADO')
    // Sensibilidad: si el DOWN solo dropeara el CHECK, o lo dejara ampliado, cae.
    expect(
      restoresQc33DeliveredCheck(cancelDown.filter((statement) => statement !== restaurado)),
    ).toBe(false)
    expect(restoresQc33DeliveredCheck([restaurado.replace(DELIVERED_CHECK, DELETE_CHECK_QC34)])).toBe(
      false,
    )

    // La funcion y TODAS las secuencias creadas al vuelo: dejarlas seria residuo de R11/R12, que
    // R49 prohibe expresamente.
    expect(dropsSequenceMachinery(cancelDown)).toBe(true)
    const dropFuncion = onlyStatement(cancelDown, /DROP FUNCTION IF EXISTS "next_order_sequence"/i)
    expect(
      dropsSequenceMachinery(cancelDown.filter((statement) => statement !== dropFuncion)),
    ).toBe(false)
    const dropSecuencias = onlyStatement(cancelDown, /DROP SEQUENCE IF EXISTS %I/i)
    expect(
      dropsSequenceMachinery(cancelDown.filter((statement) => statement !== dropSecuencias)),
    ).toBe(false)
  })

  it('el DOWN no se lleva por delante nada que no sea de esta migracion', () => {
    // Revertir esta migracion revierte SOLO esta migracion: no toca la tabla, ni las cuatro FK, ni
    // el RLS, ni los cuatro CHECK de QC-33 que no cambia, ni ninguna tabla ajena.
    const downEjecutable = stripSqlComments(cancelDownSource)
    for (const prohibido of [
      /DROP TABLE/i,
      /TRUNCATE/i,
      /DROP EXTENSION/i,
      /ROW LEVEL SECURITY/i,
      /DROP INDEX/i,
      /FOREIGN KEY/i,
    ]) {
      expect(
        cancelDown.filter((statement) => prohibido.test(statement)),
        `el DOWN no debe usar ${String(prohibido)}`,
      ).toHaveLength(0)
    }
    for (const intocable of [
      'orders_quantity_positive',
      'orders_unit_price_non_negative',
      'orders_order_sequence_positive',
      'orders_order_year_matches_created_at',
      'orders_order_year_order_sequence_key',
      'OrderPriority',
    ]) {
      expect(downEjecutable, `el DOWN no debe nombrar ${intocable}`).not.toContain(intocable)
    }
    for (const ajena of [
      'users',
      'roles',
      'products',
      'presentations',
      'recipes',
      'recipe_lines',
      'units',
      'suppliers',
    ]) {
      expect(downEjecutable, `el DOWN no debe nombrar ${ajena}`).not.toMatch(
        new RegExp(`"${ajena}"`, 'i'),
      )
    }
  })
})

// ---------------------------------------------------------------------------------------------
// EL RELEVO — por que este archivo sigue vigilando dos objetos que ya no viven.
//
// Los dos bloques de arriba describen el SQL HISTORICO de las migraciones originales de
// `orders`, que no cambia nunca. Pero dos de las cosas que describen dejaron de estar vivas con
// `20260915120000_orders_company_scope`: el indice unico GLOBAL `(ano, secuencia)` y la funcion
// `next_order_sequence(integer)`. Sin este bloque, un lector honesto saldria de aqui creyendo
// que el correlativo sigue siendo global y que la funcion sigue repartiendo numeros.
//
// No se apaga ninguna afirmacion de arriba --las dos siguen siendo ciertas SOBRE SU ARCHIVO, y
// la de la funcion ademas hace falta: el `down.sql` de la migracion del relevo la recrea
// IDENTICA y aquella es la unica descripcion de «identica» que hay en el repo--. Lo que se anade
// es el puntero al sucesor, comprobado y no comentado: si alguien borrara esa migracion o le
// quitara el relevo, este bloque cae.
//
// El contrato COMPLETO de esa migracion --la columna, la FK, la clave candidata, la FK
// compuesta, las tres guardias del DOWN y todo lo que NO hace-- esta en
// `tests/unit/pedidos/schema/orders-company-scope-migration.test.ts`. Aqui solo se ata el relevo.
describe('QC-60 orders_company_scope — el relevo de los dos objetos de arriba', () => {
  const scopeUp = statements(
    readFileSync(join(findMigrationDir('_orders_company_scope'), 'migration.sql'), 'utf8'),
  )

  it('el unico GLOBAL de QC-33 cae y lo sustituye el compuesto por empresa, en ese orden', () => {
    const cae = scopeUp.indexOf('DROP INDEX "orders_order_year_order_sequence_key"')
    const nace = scopeUp.findIndex((statement) =>
      /^CREATE UNIQUE INDEX "orders_company_year_sequence_key" ON "orders" \("company_id", "order_year", "order_sequence"\)$/i.test(
        statement,
      ),
    )
    expect(cae, 'QC-60 debe dropear el unico global de QC-33').toBeGreaterThan(-1)
    expect(nace, 'QC-60 debe crear el unico por empresa').toBeGreaterThan(-1)
    expect(cae).toBeLessThan(nace)
  })

  it('la funcion de QC-34 muere en el UP de QC-60 y su DOWN la recrea identica', () => {
    expect(scopeUp).toContain('DROP FUNCTION "next_order_sequence"(integer)')
    const scopeDownSource = readFileSync(
      join(findMigrationDir('_orders_company_scope'), 'down.sql'),
      'utf8',
    )
    // «Identica» se mide contra el cuerpo que vigila el bloque HISTORICO de este mismo archivo.
    const original = onlyStatement(cancelUp, /CREATE OR REPLACE FUNCTION "next_order_sequence"/i)
    const cuerpoOriginal = /AS \$\$([\s\S]*)\$\$/.exec(original)?.[1]
    const cuerpoRecreado = /CREATE OR REPLACE FUNCTION "next_order_sequence"[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(
      stripSqlComments(scopeDownSource),
    )?.[1]
    expect(cuerpoOriginal, 'no se encontro el cuerpo de la funcion en QC-34').toBeDefined()
    expect(cuerpoRecreado, 'el DOWN de QC-60 debe recrear la funcion').toBeDefined()
    expect((cuerpoRecreado as string).replace(/\s+/g, ' ').trim()).toBe(
      (cuerpoOriginal as string).replace(/\s+/g, ' ').trim(),
    )
  })
})
