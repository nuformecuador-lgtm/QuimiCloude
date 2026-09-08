// T8 — Contrato estatico del SQL de la migracion `units_catalog` (QC-32: modelo-unidades).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`specs/QC-32-modelo-unidades/design.md` seccion 4): la GUARDIA DE DATOS del UP y la
// simetrica del DOWN —las dos escritas a mano, las dos existen para fallar antes que perder el
// texto de unidad de una fila—, las DOS FK que cruzan de modulo (`products_unit_id_fkey` y
// `recipe_lines_unit_id_fkey`, `ON DELETE RESTRICT`), el indice unico del nombre normalizado,
// los dos `DROP COLUMN "unit"`, los dos ALTER de RLS y —desde el 2026-09-03— el CONJUNTO
// ARRANCADOR, que ya no es un seed de aplicacion sino un `INSERT` de esta misma migracion
// (`design.md` seccion 6.1, R25 y R26). Si una migracion futura de `products` o de
// `recipe_lines` se lleva algo de eso por drift, el esquema sigue validando y el cliente sigue
// compilando: tiene que caer aqui, que es la unica guardia que tienen.
//
// El bloque del arrancador vigila ademas el punto MAS FRAGIL de la ficha: `name_normalized` se
// escribe LITERAL en el SQL porque no hay forma de llamar a `normalizeUnitName` (TypeScript)
// desde una migracion, asi que este archivo importa la funcion REAL y la aplica a los literales
// extraidos del `INSERT`. Es lo unico en todo el repo que se da cuenta si alguien cambia la
// normalizacion o un literal del SQL y deja las dos mitades desincronizadas (R26).
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una version MUTADA EN MEMORIA
// (el archivo en disco NO se toca). Las tres mutaciones obligatorias de `design.md` seccion 9
// son `RESTRICT` -> `CASCADE` en las FK, quitar el bloque `DO $$` del UP y quitar el
// `NOT NULL` del `ADD COLUMN "unit"` del DOWN. Un test que no puede fallar no vigila nada; es
// el mismo patron de `tests/guards/guard-arquitectura-modulos.test.ts`.
//
// R22, R23 y R24 se cierran DE VERDAD en T10, contra la base real: aqui solo se lee texto.
//
// Cubre R5, R8, R10 y R11 (su parte de SQL), R12, R13, R18, R20, R21, R22, R23, R24, R25 y R26
// (su primera mitad: que el nombre normalizado persistido coincide con la unica definicion de
// R4; la mitad negativa —que no hay seed de aplicacion— la cubre `module-contract.test.ts`).
//
// ---------------------------------------------------------------------------------------
// AMPLIADO EL 2026-09-07 POR QC-76 (`specs/QC-76-equivalencia-y-ambito-de-unidades/`, T4).
//
// NADA DE LO DE ARRIBA SE TOCA: la migracion de QC-32 esta APLICADA y su contenido no puede
// cambiar (QC-76 R27), asi que sus predicados y sus casos siguen exactamente como estaban. Lo
// que se anade son DOS bloques al final del archivo:
//
//   1. un caso que vigila que la carpeta `20260903121404_units_catalog` sigue INTACTA byte a
//      byte (R27), comparando el CONTENIDO —no la fecha— contra su huella; y
//   2. la seccion de la migracion NUEVA `20260907190000_units_equivalence_and_scope`: los
//      cuatro indices unicos parciales, los tres CHECK, las dos FK con RESTRICT, el DROP del
//      unico global ANTES de los parciales, la funcion y el disparador, el UPDATE de las
//      cuatro filas, CERO `INSERT`/`DELETE` sobre `units`, el cierre en `ENABLE` + `FORCE`,
//      el idioma de los identificadores, y el `down.sql` con su guardia de datos y el indice
//      global restaurado.
//
// Mismo patron que arriba: cada afirmacion es un PREDICADO PURO que recibe el texto SQL, y
// cada uno se aplica dos veces —al SQL real y a una copia MUTADA EN MEMORIA que borra el
// objeto que vigila—. El archivo en disco NO se toca nunca. Cubre de QC-76: R27, R28, R29,
// R30, R31, R33 y R34, mas la mitad de SQL de R2, R4, R5, R6, R7, R8, R9, R13, R14 y R15
// (que la restriccion EXISTE en el archivo; que MUERDE en la base lo prueba
// `tests/integration/unidades/unidades-constraints.int.test.ts`).
// ---------------------------------------------------------------------------------------

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { normalizeUnitName } from '@/lib/modules/unidades'

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
const migrationsDir = join(repoRoot, 'db', 'migrations')

/**
 * La carpeta se localiza por PATRON, no por el timestamp escrito a pelo: si la migracion se
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella y no romperse
 * por una razon que no es la suya.
 */
const unitsCatalogDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_units_catalog'),
)
expect(unitsCatalogDirs, 'debe existir exactamente una migracion *_units_catalog').toHaveLength(1)
const migrationDir = join(migrationsDir, unitsCatalogDirs[0] as string)

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas.
 *
 * Parte por `;`, igual que el precedente de QC-24. Los bloques `DO $$ ... $$` llevan `;`
 * dentro y salen partidos en trozos, pero ninguno de esos trozos empieza por `CREATE`,
 * `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion de abajo. Las dos guardias se
 * comprueban sobre el TEXTO COMPLETO, no sobre esta lista.
 */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
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

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
}

const createUnits = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?units"?/i)

// --- Predicados puros: los mismos que usan los tests de sensibilidad de abajo -------------

/** El primer bloque `DO $$ ... $$` del texto, o `null` si no hay ninguno. */
function firstGuardBlock(sql: string): { readonly body: string; readonly index: number } | null {
  const match = /DO\s+\$\$[\s\S]*?\$\$/.exec(stripSqlComments(sql))
  if (match === null) return null
  return { body: match[0], index: match.index }
}

/** Posicion del primer cambio de esquema del texto, o `-1` si no hay ninguno. */
function firstSchemaChangeIndex(sql: string): number {
  const match = /\b(CREATE\s+EXTENSION|CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+TABLE|DROP\s+INDEX)\b/i.exec(
    stripSqlComments(sql),
  )
  return match === null ? -1 : match.index
}

/**
 * R22. ¿El UP arranca con la guardia de datos, ANTES de tocar el esquema, contando las filas
 * con unidad ESCRITA de las dos tablas ajenas y abortando la migracion entera si hay alguna?
 *
 * Las tres piezas juntas: sin `RAISE EXCEPTION` la guardia no aborta nada; sin contar las dos
 * tablas se pierde una mitad del dato; y si va despues del primer `CREATE`/`ALTER`, el mensaje
 * llega detras de un error de Postgres que no explica nada.
 */
export function upStartsWithDataGuard(sql: string): boolean {
  const guard = firstGuardBlock(sql)
  if (guard === null) return false
  const aborta = /RAISE\s+EXCEPTION/i.test(guard.body)
  const cuentaProductos = /FROM\s+"products"\s+WHERE\s+"unit"\s+IS\s+NOT\s+NULL/i.test(guard.body)
  const cuentaLineas = /FROM\s+"recipe_lines"\s+WHERE\s+"unit"\s+IS\s+NOT\s+NULL/i.test(guard.body)
  const primerCambio = firstSchemaChangeIndex(sql)
  const vaLaPrimera = primerCambio !== -1 && guard.index < primerCambio
  return aborta && cuentaProductos && cuentaLineas && vaLaPrimera
}

/**
 * R24. ¿El DOWN arranca con su propia guardia, contando las filas que APUNTAN al catalogo y
 * abortando la reversion entera si hay alguna?
 *
 * Es R22 leido al reves: sin ella, el DOWN o pierde en silencio la unidad de cada fila, o
 * revienta con un error de Postgres que no dice que hacer.
 */
export function downStartsWithReferenceGuard(sql: string): boolean {
  const guard = firstGuardBlock(sql)
  if (guard === null) return false
  const aborta = /RAISE\s+EXCEPTION/i.test(guard.body)
  const cuentaProductos = /FROM\s+"products"\s+WHERE\s+"unit_id"\s+IS\s+NOT\s+NULL/i.test(
    guard.body,
  )
  const cuentaLineas = /FROM\s+"recipe_lines"/i.test(guard.body)
  const primerCambio = firstSchemaChangeIndex(sql)
  const vaLaPrimera = primerCambio !== -1 && guard.index < primerCambio
  return aborta && cuentaProductos && cuentaLineas && vaLaPrimera
}

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R13) */
export function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** Las dos FK que esta migracion escribe a mano, con su tabla y su columna. */
const UNIT_FOREIGN_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['products_unit_id_fkey', 'products'],
  ['recipe_lines_unit_id_fkey', 'recipe_lines'],
]

/**
 * R12 y R18. ¿Existen las DOS claves foraneas hacia `units`, cada una una sola vez, sobre su
 * tabla y su columna? Prisma no las declara (los `unitId` son escalares sin `@relation`), asi
 * que este archivo es el unico sitio donde viven.
 */
export function bothUnitForeignKeysExist(sql: string): boolean {
  const source = statements(sql)
  return UNIT_FOREIGN_KEYS.every(([constraint, table]) => {
    const found = source.filter((statement) =>
      new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    const statement = found[0] as string
    return (
      new RegExp(`^ALTER TABLE "?${table}"?`, 'i').test(statement) &&
      /FOREIGN KEY \(\s*"?unit_id"?\s*\)/i.test(statement) &&
      /REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i.test(statement)
    )
  })
}

/** R13. ¿Las DOS FK hacia `units` rechazan el borrado de una unidad en uso? */
export function bothUnitForeignKeysRestrict(sql: string): boolean {
  const source = statements(sql)
  return UNIT_FOREIGN_KEYS.every(([constraint]) => {
    const found = source.filter((statement) =>
      new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    return isRestrictOnDelete(found[0] as string)
  })
}

/** R5. ¿Existe el indice UNICO sobre `name_normalized` de `units`? */
export function hasUniqueIndexOnNormalizedName(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^CREATE UNIQUE INDEX "?\w+"? ON "?units"?\s*\(\s*"?name_normalized"?\s*\)/i.test(statement),
  )
}

/** Una fila del conjunto arrancador, tal como esta ESCRITA en el `INSERT` de la migracion. El
 *  cuarto valor (`updated_at`) no es un literal sino `CURRENT_TIMESTAMP`, y se comprueba
 *  aparte. */
export type FilaArrancadora = {
  readonly name: string
  readonly nameNormalized: string
  readonly symbol: string | null
}

/**
 * R25. Las filas del `INSERT INTO "units"` del UP, EN EL ORDEN en que estan escritas; `null`
 * si no hay INSERT o si no rellena exactamente las cuatro columnas esperadas.
 *
 * Devolver `null` en vez de `[]` cuando el INSERT falta es deliberado: una lista vacia y un
 * arrancador ausente son la misma cosa para un `toEqual([])` distraido, y esa es justo la
 * mutacion (b) de los tests de sensibilidad.
 */
export function starterRows(sql: string): readonly FilaArrancadora[] | null {
  const ejecutable = stripSqlComments(sql)
  const insert = /INSERT\s+INTO\s+"units"\s*\(([^)]*)\)\s*VALUES([\s\S]*?);/i.exec(ejecutable)
  if (insert === null) return null
  const columnas = [...(insert[1] as string).matchAll(/"(\w+)"/g)].map((match) => match[1])
  if (columnas.join(',') !== 'name,name_normalized,symbol,updated_at') return null

  const literal = (valor: string): string | null => {
    const match = /^'([^']*)'$/.exec(valor.trim())
    return match === null ? null : (match[1] as string)
  }
  const filas: FilaArrancadora[] = []
  for (const tupla of (insert[2] as string).matchAll(/\(([^)]*)\)/g)) {
    const valores = (tupla[1] as string).split(',')
    if (valores.length !== 4) return null
    const name = literal(valores[0] as string)
    const nameNormalized = literal(valores[1] as string)
    if (name === null || nameNormalized === null) return null
    filas.push({ name, nameNormalized, symbol: literal(valores[2] as string) })
  }
  return filas
}

/** Las CUATRO unidades arrancadoras que cerro el humano el 2026-09-03 (R25, pregunta abierta
 *  4). Nombres en minuscula, las cuatro con simbolo, «unidad» fuera. */
const CONJUNTO_ARRANCADOR: readonly FilaArrancadora[] = [
  { name: 'mililitro', nameNormalized: 'mililitro', symbol: 'ml' },
  { name: 'litro', nameNormalized: 'litro', symbol: 'l' },
  { name: 'gramo', nameNormalized: 'gramo', symbol: 'gr' },
  { name: 'kilogramo', nameNormalized: 'kilogramo', symbol: 'kg' },
]

/** R25. ¿El INSERT deja EXACTAMENTE esas cuatro filas, en ese orden, y ninguna mas? */
export function insertsExactlyTheStarterSet(sql: string): boolean {
  const filas = starterRows(sql)
  if (filas === null || filas.length !== CONJUNTO_ARRANCADOR.length) return false
  return filas.every((fila, indice) => {
    const esperada = CONJUNTO_ARRANCADOR[indice] as FilaArrancadora
    return (
      fila.name === esperada.name &&
      fila.nameNormalized === esperada.nameNormalized &&
      fila.symbol === esperada.symbol
    )
  })
}

/**
 * R26. ¿El nombre normalizado literal de cada fila es el que produce sobre su nombre la UNICA
 * definicion de la normalizacion (R4, `lib/modules/unidades/domain/unit-name.ts`)?
 *
 * Este es el punto fragil de la ficha: el SQL no puede llamar a `normalizeUnitName`, asi que
 * el literal es un DUPLICADO que se desincroniza en silencio. Aqui se importa la funcion real.
 */
export function normalizedNamesMatchTheOnlyDefinition(sql: string): boolean {
  const filas = starterRows(sql)
  if (filas === null || filas.length === 0) return false
  return filas.every((fila) => fila.nameNormalized === normalizeUnitName(fila.name))
}

/**
 * R25 y `design.md` seccion 6.1: el INSERT va DESPUES del `CREATE TABLE "units"` y, sobre
 * todo, ANTES del `FORCE ROW LEVEL SECURITY`. No es cosmetico: `FORCE` sin policies deniega
 * TAMBIEN al dueno de la tabla, que es con quien se conecta Prisma, asi que un INSERT
 * colocado despues no insertaria nada — y el catalogo naceria vacio sin que nada fallara.
 */
export function starterInsertSitsBetweenTableAndForce(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const tabla = ejecutable.search(/CREATE\s+TABLE\s+"units"/i)
  const insert = ejecutable.search(/INSERT\s+INTO\s+"units"/i)
  const force = ejecutable.search(/ALTER\s+TABLE\s+"units"\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i)
  if (tabla === -1 || insert === -1 || force === -1) return false
  return tabla < insert && insert < force
}

/** R10 y R11. ¿Desaparece la columna `unit` de TEXTO de las dos tablas ajenas? */
export function dropsBothTextUnitColumns(sql: string): boolean {
  const source = statements(sql)
  return ['products', 'recipe_lines'].every((table) =>
    source.some((statement) =>
      new RegExp(`^ALTER TABLE "?${table}"? DROP COLUMN "unit"$`, 'i').test(statement),
    ),
  )
}

/** R21. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
export function hasRlsEnabledAndForced(sql: string, table: string): boolean {
  const source = statements(sql)
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/**
 * R23. ¿El DOWN devuelve el esquema EXACTO anterior?
 *
 * `products.unit` vuelve a ser `TEXT` anulable, `recipe_lines.unit` vuelve a ser
 * `TEXT NOT NULL` y NINGUNA de las dos lleva `DEFAULT`: un `DEFAULT ''` dejaria un esquema
 * PARECIDO al de antes —no el exacto— y sembraria unidades en blanco. Y la tabla del catalogo
 * desaparece: no queda residuo.
 */
export function restoresUnitColumnsExactly(sql: string): boolean {
  const source = statements(sql)
  // El `\b` no sirve detras de la comilla de cierre —dos caracteres no-palabra seguidos no
  // son frontera—, asi que el corte se hace con el espacio que separa la columna del tipo.
  const producto = source.find((statement) =>
    /^ALTER TABLE "?products"? ADD COLUMN "unit" /i.test(statement),
  )
  const linea = source.find((statement) =>
    /^ALTER TABLE "?recipe_lines"? ADD COLUMN "unit" /i.test(statement),
  )
  if (producto === undefined || linea === undefined) return false
  const productoAnulable = /ADD COLUMN "unit" TEXT$/i.test(producto)
  const lineaObligatoria = /ADD COLUMN "unit" TEXT NOT NULL$/i.test(linea)
  const sinDefault = !/DEFAULT/i.test(producto) && !/DEFAULT/i.test(linea)
  return productoAnulable && lineaObligatoria && sinDefault && droppedTables(source).includes('units')
}

/**
 * Identificadores que ESTA migracion crea: la tabla, sus columnas, el nombre de su PK, las
 * restricciones, los indices y las columnas anadidas a las tablas ajenas.
 *
 * De `ADD CONSTRAINT`, `CREATE INDEX` y `ADD COLUMN` se toma el nombre que declaran, no lo que
 * referencian: `REFERENCES "units"("id")` no crea nada.
 */
export function createdIdentifiers(sql: string): readonly string[] {
  const nombres = new Set<string>()
  for (const statement of statements(sql)) {
    if (/^CREATE TABLE/i.test(statement)) {
      for (const match of statement.matchAll(/"([^"]+)"/g)) nombres.add(match[1] as string)
      continue
    }
    const constraint = /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    if (constraint) nombres.add(constraint[1] as string)
    const index = /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement)
    if (index) nombres.add(index[1] as string)
    const column = /ADD COLUMN "([^"]+)"/i.exec(statement)
    if (column) nombres.add(column[1] as string)
  }
  return [...nombres]
}

/**
 * Vocabulario ingles admitido para los identificadores de esta feature (R20). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista cerrada a proposito: una columna nueva obliga a pasar por aqui, y una en
 * espanol (`unidad`, `nombre`, `simbolo`) no encuentra sus piezas y cae. Un patron
 * `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'created',
  'fkey',
  'id',
  'idx',
  'key',
  'lines',
  'name',
  'normalized',
  'pkey',
  'product',
  'products',
  'recipe',
  'symbol',
  'unit',
  'units',
  'updated',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R20) */
export function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

// --- El UP ---------------------------------------------------------------------------------

describe('migration.sql — la guardia de datos', () => {
  it('el UP empieza con la guardia DO $$ que aborta si hay unidad escrita, y el test cae si se quita', () => {
    // R22 y decision cerrada 6: la migracion supone la base VACIA de unidades escritas. Si no
    // lo esta, se PARA: perder el texto de unidad seria perder el dato. Prisma ejecuta cada
    // `migration.sql` dentro de UNA transaccion, asi que el `RAISE EXCEPTION` deshace todo lo
    // anterior y la migracion queda sin aplicar y sin marcar (`design.md` seccion 4.1).
    expect(upStartsWithDataGuard(upSource)).toBe(true)

    // La guardia es lo PRIMERO del archivo, antes incluso del `CREATE EXTENSION`.
    const guard = firstGuardBlock(upSource)
    expect(guard).not.toBeNull()
    expect((guard as { index: number }).index).toBeLessThan(firstSchemaChangeIndex(upSource))
    // Y el mensaje dice QUE HACER, no solo que fallo: un RAISE sin salida es una pared.
    expect((guard as { body: string }).body).toMatch(/pregunta abierta 2/i)

    // --- Sensibilidad 1 de `design.md` seccion 9: sin el bloque `DO $$`, el predicado CAE.
    // La mutacion es EN MEMORIA; el archivo en disco no se toca.
    const sinGuardia = upSource.replace(/DO\s+\$\$[\s\S]*?\$\$;/, '')
    expect(sinGuardia, 'la mutacion no quito el bloque DO $$').not.toBe(upSource)
    expect(upStartsWithDataGuard(sinGuardia), 'un UP sin guardia no deberia pasar').toBe(false)

    // Tampoco vale una guardia que solo cuente una de las dos tablas...
    const soloProductos = upSource.replace(
      /SELECT count\(\*\) INTO lineas_con_unidad\s+FROM "recipe_lines" WHERE "unit" IS NOT NULL;/,
      'lineas_con_unidad := 0;',
    )
    expect(soloProductos, 'la mutacion no quito el conteo de recipe_lines').not.toBe(upSource)
    expect(upStartsWithDataGuard(soloProductos)).toBe(false)

    // ...ni una que avise sin abortar.
    // Con `/g`: la cabecera del archivo tambien nombra el `RAISE EXCEPTION` en prosa, y
    // mutar solo la primera aparicion cambiaria un comentario en vez de la guardia.
    const sinExcepcion = upSource.replace(/RAISE\s+EXCEPTION/g, 'RAISE NOTICE')
    expect(sinExcepcion, 'la mutacion no cambio el RAISE').not.toBe(upSource)
    expect(upStartsWithDataGuard(sinExcepcion), 'un aviso no es una guardia').toBe(false)
  })
})

describe('migration.sql — la tabla units', () => {
  it('existe CREATE UNIQUE INDEX sobre name_normalized', () => {
    // R5 y decision cerrada 5: la unicidad del nombre la garantiza un INDICE UNICO en la
    // propia base, no una comprobacion previa al vuelo —que seria una carrera: dos altas
    // simultaneas la superarian las dos—. Es TOTAL, no parcial: sin `deleted_at` (R8) no hay
    // filas muertas que liberen el nombre.
    expect(hasUniqueIndexOnNormalizedName(upSource)).toBe(true)
    const statement = findStatement(up, /^CREATE UNIQUE INDEX "?units_name_normalized_key"?/i)
    expect(statement).toMatch(/ON "?units"?\s*\(\s*"?name_normalized"?\s*\)/i)
    expect(statement).not.toMatch(/WHERE/i)

    // Sensibilidad: un indice NO unico sobre la misma columna no garantiza nada.
    const noUnico = upSource.replace(
      /CREATE UNIQUE INDEX "units_name_normalized_key"/i,
      'CREATE INDEX "units_name_normalized_key"',
    )
    expect(noUnico, 'la mutacion no se aplico').not.toBe(upSource)
    expect(hasUniqueIndexOnNormalizedName(noUnico)).toBe(false)

    // Y NO se crea ningun indice sobre `symbol` (R7, pregunta abierta 1): la identidad de la
    // unidad es su nombre, y dos unidades pueden compartir simbolo.
    expect(up.filter((candidate) => /INDEX/i.test(candidate) && /symbol/i.test(candidate))).toEqual(
      [],
    )
    expect(createUnits).toMatch(/"symbol" TEXT/i)
    expect(createUnits).not.toMatch(/"symbol" TEXT NOT NULL/i)
    expect(createUnits).not.toMatch(/"symbol"[^,]*UNIQUE/i)
  })

  it('la tabla units no crea ninguna columna de borrado logico', () => {
    // R8 y decision cerrada 11, afirmado en positivo: el borrado logico es un UPDATE y
    // NINGUNA FK reacciona a un UPDATE, asi que `deleted_at` neutralizaria en silencio el
    // `ON DELETE RESTRICT` que es la unica garantia real de R13.
    for (const forbidden of ['deleted_at', 'archived_at', 'disabled_at', 'is_active', 'active']) {
      expect(createUnits, `units no debe crear ${forbidden}`).not.toMatch(
        new RegExp(`"${forbidden}"`, 'i'),
      )
    }
    // La tabla se crea con sus SEIS columnas exactas, ni una mas.
    const columnas = [...createUnits.matchAll(/"([a-z_]+)" (?:UUID|TEXT|TIMESTAMPTZ)/gi)].map(
      (match) => match[1],
    )
    expect(columnas).toEqual([
      'id',
      'name',
      'name_normalized',
      'symbol',
      'created_at',
      'updated_at',
    ])
    // Nombre obligatorio (R2), nombre normalizado obligatorio (R4), sin VARCHAR(n) (R6).
    expect(createUnits).toMatch(/"name" TEXT NOT NULL/i)
    expect(createUnits).toMatch(/"name_normalized" TEXT NOT NULL/i)
    expect(createUnits).not.toMatch(/VARCHAR\s*\(/i)
    expect(createUnits).not.toMatch(/CHARACTER\s+VARYING/i)
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toEqual([])
  })
})

describe('migration.sql — el conjunto arrancador', () => {
  it('el INSERT deja exactamente las cuatro unidades arrancadoras, en orden y sin ninguna mas', () => {
    // R25 y decision cerrada 9 (sustituida el 2026-09-03): el catalogo nace CON su tabla, no
    // con un seed de aplicacion. La idempotencia la da `_prisma_migrations` —una migracion se
    // aplica una vez—, no un `findMany` previo.
    expect(starterRows(upSource)).toEqual(CONJUNTO_ARRANCADOR)
    expect(insertsExactlyTheStarterSet(upSource)).toBe(true)

    // Los nombres van en MINUSCULA y las CUATRO llevan simbolo (pregunta abierta 4, cerrada
    // por el humano). «unidad» NO esta en el arrancador.
    const filas = starterRows(upSource) as readonly FilaArrancadora[]
    expect(filas).toHaveLength(4)
    for (const fila of filas) {
      expect(fila.name, `${fila.name} no esta en minuscula`).toBe(fila.name.toLowerCase())
      expect(fila.symbol, `la unidad ${fila.name} deberia llevar simbolo`).not.toBeNull()
    }
    expect(filas.map((fila) => fila.name)).not.toContain('unidad')

    // Un solo INSERT en toda la migracion, y sobre `units`: esta ficha no siembra datos en
    // ninguna tabla ajena.
    expect(up.filter((statement) => /^INSERT INTO/i.test(statement))).toHaveLength(1)
    // `updated_at` va EXPLICITO en las cuatro filas: `id` y `created_at` tienen DEFAULT, pero
    // `updated_at` es NOT NULL sin default —lo rellena `@updatedAt` en tiempo de ejecucion, y
    // aqui no hay tiempo de ejecucion de Prisma— (`design.md` seccion 6.1).
    const insert = findStatement(up, /^INSERT INTO "units"/i)
    expect([...insert.matchAll(/CURRENT_TIMESTAMP/gi)]).toHaveLength(4)
  })

  it('el nombre normalizado literal de cada fila es el que produce normalizeUnitName', () => {
    // R26, primera mitad, y es LA razon de que R26 exista: `name_normalized` se escribe
    // LITERAL en el SQL porque no se puede llamar a `normalizeUnitName` (TypeScript) desde una
    // migracion. Este test importa la funcion REAL y la aplica a los literales extraidos del
    // INSERT, asi que es LO UNICO en todo el repo que se da cuenta si alguien cambia la
    // normalizacion (o un literal del SQL) y deja las dos mitades desincronizadas.
    expect(normalizedNamesMatchTheOnlyDefinition(upSource)).toBe(true)
    for (const fila of starterRows(upSource) as readonly FilaArrancadora[]) {
      expect(fila.nameNormalized, `name_normalized de «${fila.name}»`).toBe(
        normalizeUnitName(fila.name),
      )
    }
    // Y las cuatro claves son DISTINTAS entre si, o el propio INSERT chocaria contra el indice
    // unico de R5 y la migracion entera no aplicaria.
    const claves = (starterRows(upSource) as readonly FilaArrancadora[]).map(
      (fila) => fila.nameNormalized,
    )
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('el INSERT va despues del CREATE TABLE y antes del FORCE ROW LEVEL SECURITY', () => {
    // `design.md` seccion 6.1, punto 1: el sitio no es cosmetico. `FORCE ROW LEVEL SECURITY`
    // sin policies deniega TAMBIEN al dueno de la tabla —que es con quien se conecta Prisma—,
    // asi que un INSERT colocado despues del FORCE no insertaria nada y el catalogo naceria
    // vacio SIN QUE NADA FALLARA. Ese es el fallo silencioso que vigila este caso.
    expect(starterInsertSitsBetweenTableAndForce(upSource)).toBe(true)

    // Sensibilidad: movido detras del FORCE, el predicado cae. Mutacion EN MEMORIA.
    const sqlDelInsert = /INSERT INTO "units"[\s\S]*?;/.exec(upSource)?.[0] as string
    expect(sqlDelInsert).toBeDefined()
    const detrasDelForce = `${upSource.replace(sqlDelInsert, '')}\n${sqlDelInsert}`
    expect(detrasDelForce, 'la mutacion no movio el INSERT').not.toBe(upSource)
    expect(
      starterInsertSitsBetweenTableAndForce(detrasDelForce),
      'un INSERT despues del FORCE no deberia pasar',
    ).toBe(false)
    // Las filas siguen siendo las cuatro correctas: lo que cae es el ORDEN, no el contenido.
    expect(insertsExactlyTheStarterSet(detrasDelForce)).toBe(true)
  })

  it('los predicados del arrancador caen ante una normalizacion desincronizada, ante el INSERT quitado y ante una quinta fila', () => {
    // Un test que no puede fallar no vigila nada (`design.md` seccion 9). Las tres mutaciones
    // son EN MEMORIA; el archivo en disco no se toca.

    // (a) `name_normalized` desincronizado: 'Mililitro' con mayuscula NO es lo que produce
    // `normalizeUnitName('mililitro')`. Es exactamente el fallo que R26 teme, y en la base
    // real no lo detecta nada: la fila entra igual.
    const desincronizado = upSource.replace(
      "('mililitro', 'mililitro', 'ml'",
      "('mililitro', 'Mililitro', 'ml'",
    )
    expect(desincronizado, 'la mutacion no cambio el name_normalized').not.toBe(upSource)
    expect(
      normalizedNamesMatchTheOnlyDefinition(desincronizado),
      'un name_normalized que la funcion no produce no deberia pasar',
    ).toBe(false)
    expect(insertsExactlyTheStarterSet(desincronizado)).toBe(false)

    // (b) sin el INSERT no hay arrancador: `starterRows` devuelve `null`, no una lista vacia,
    // para que no pueda colarse como «cero filas correctas».
    const sinInsert = upSource.replace(/INSERT INTO "units"[\s\S]*?;/, '')
    expect(sinInsert, 'la mutacion no quito el INSERT').not.toBe(upSource)
    expect(starterRows(sinInsert)).toBeNull()
    expect(insertsExactlyTheStarterSet(sinInsert), 'sin INSERT no deberia pasar').toBe(false)
    expect(normalizedNamesMatchTheOnlyDefinition(sinInsert)).toBe(false)
    expect(starterInsertSitsBetweenTableAndForce(sinInsert)).toBe(false)

    // (c) una quinta fila: R25 dice «y NO DEBE crear ninguna otra». Ojo con la trampa —esta
    // quinta fila esta bien normalizada, asi que el predicado de R26 la acepta: es el de R25
    // el que tiene que caer.
    const conQuinta = upSource.replace(
      "  ('kilogramo', 'kilogramo', 'kg', CURRENT_TIMESTAMP);",
      "  ('kilogramo', 'kilogramo', 'kg', CURRENT_TIMESTAMP),\n  ('unidad', 'unidad', NULL, CURRENT_TIMESTAMP);",
    )
    expect(conQuinta, 'la mutacion no anadio la quinta fila').not.toBe(upSource)
    expect(starterRows(conQuinta)).toHaveLength(5)
    expect(insertsExactlyTheStarterSet(conQuinta), 'cinco filas no deberian pasar').toBe(false)
    expect(normalizedNamesMatchTheOnlyDefinition(conQuinta)).toBe(true)
  })
})

describe('migration.sql — las dos claves foraneas hacia units', () => {
  const fkProduct = findStatement(up, /ADD CONSTRAINT "?products_unit_id_fkey"?/i)
  const fkRecipeLine = findStatement(up, /ADD CONSTRAINT "?recipe_lines_unit_id_fkey"?/i)

  it('las dos FK de unit_id existen en el SQL', () => {
    // R12: un producto o una linea que apunte a una unidad inexistente es basura, y eso solo
    // lo garantiza una FK de verdad. Las columnas se anaden antes: opcional en `products`
    // (R10) y obligatoria en `recipe_lines` (R11), esta ultima SIN `DEFAULT`, que sembraria
    // referencias inventadas.
    expect(bothUnitForeignKeysExist(upSource)).toBe(true)
    expect(fkProduct).toMatch(/REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i)
    expect(fkRecipeLine).toMatch(/REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i)
    expect(up).toContain('ALTER TABLE "products" ADD COLUMN "unit_id" UUID')
    expect(up).toContain('ALTER TABLE "recipe_lines" ADD COLUMN "unit_id" UUID NOT NULL')
    expect(
      up.filter((statement) => /ADD COLUMN "unit_id"/i.test(statement) && /DEFAULT/i.test(statement)),
    ).toEqual([])

    // Sensibilidad: si una de las dos desaparece del archivo, el predicado cae. Prisma no las
    // regenera nunca, asi que nadie mas lo notaria.
    const sinFkProducto = upSource.replace(/ALTER TABLE "products" ADD CONSTRAINT[\s\S]*?;/, '')
    expect(sinFkProducto, 'la mutacion no quito la FK').not.toBe(upSource)
    expect(bothUnitForeignKeysExist(sinFkProducto)).toBe(false)

    // Con su indice del lado hijo: Postgres no indexa la columna hija de una FK, y por ahi
    // pasa la verificacion del RESTRICT en cada intento de borrar una unidad.
    expect(findStatement(up, /^CREATE INDEX "?products_unit_id_idx"?/i)).toMatch(
      /ON "?products"?\s*\(\s*"?unit_id"?\s*\)/i,
    )
    expect(findStatement(up, /^CREATE INDEX "?recipe_lines_unit_id_idx"?/i)).toMatch(
      /ON "?recipe_lines"?\s*\(\s*"?unit_id"?\s*\)/i,
    )
    // Exactamente dos FK: esta migracion no toca las que escribieron QC-20 y QC-24.
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(2)
    expect(up.filter((statement) => /DROP CONSTRAINT/i.test(statement))).toEqual([])
  })

  it('las dos FK estan escritas en el SQL aunque Prisma no declare la relacion', () => {
    // R18 y decision cerrada 13: los dos `unitId` son escalares SIN `@relation`
    // —`unidades-schema.test.ts` lo vigila— para que el cliente Prisma no pueda atravesar de
    // `inventario` ni de `recetas` a `unidades` con un `include`, un cruce de frontera que
    // NINGUNA guardia detecta porque no es un import (`design.md` secciones 4.3 y 8.1). La
    // integridad, aun asi, es real: vive en estas dos sentencias y solo aqui.
    for (const [constraint, table] of UNIT_FOREIGN_KEYS) {
      const statement = findStatement(up, new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i'))
      expect(statement, `${constraint} sobre ${table}`).toMatch(
        new RegExp(`^ALTER TABLE "?${table}"?`, 'i'),
      )
      expect(statement).toMatch(/FOREIGN KEY \(\s*"?unit_id"?\s*\)/i)
      expect(statement).toMatch(/ON UPDATE CASCADE/i)
    }
    // Y la tabla se crea ANTES de que nadie la referencie, o la migracion no aplicaria.
    expect(createdTables(up)).toEqual(['units'])
    expect(upSource.indexOf('CREATE TABLE "units"')).toBeLessThan(
      upSource.indexOf('ADD CONSTRAINT "products_unit_id_fkey"'),
    )
  })

  it('las dos FK son ON DELETE RESTRICT, y el test cae si se cambian a CASCADE', () => {
    // R13 y decision cerrada 10: no se puede borrar una unidad en uso. `RESTRICT` es la UNICA
    // garantia real —de ahi que la decision 11 prohiba `deleted_at` en el catalogo—. Con
    // `CASCADE`, borrar una unidad se llevaria por delante productos y lineas de receta;
    // con `SET NULL` convertiria «esta unidad se borro» en «este producto no declara
    // unidad», que son cosas distintas (`design.md` seccion 8.3).
    expect(bothUnitForeignKeysRestrict(upSource)).toBe(true)
    expect(isRestrictOnDelete(fkProduct)).toBe(true)
    expect(isRestrictOnDelete(fkRecipeLine)).toBe(true)

    // --- Sensibilidad 2 de `design.md` seccion 9: `RESTRICT` -> `CASCADE`, EN MEMORIA.
    const enCascada = upSource.replace(/ON DELETE RESTRICT/gi, 'ON DELETE CASCADE')
    expect(enCascada, 'la mutacion no cambio ningun RESTRICT').not.toBe(upSource)
    expect(bothUnitForeignKeysRestrict(enCascada), 'ON DELETE CASCADE no deberia pasar').toBe(false)

    // Y si solo se afloja UNA de las dos, tambien cae: la garantia es de las dos o de
    // ninguna.
    const soloUna = upSource.replace(
      /("recipe_lines_unit_id_fkey"[\s\S]*?)ON DELETE RESTRICT/i,
      '$1ON DELETE CASCADE',
    )
    expect(soloUna, 'la mutacion no se aplico sobre la FK de la linea').not.toBe(upSource)
    expect(bothUnitForeignKeysRestrict(soloUna)).toBe(false)

    // Cualquier otro aflojamiento tampoco pasa.
    for (const accion of ['CASCADE', 'SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      expect(
        isRestrictOnDelete(fkProduct.replace(/ON DELETE RESTRICT/i, `ON DELETE ${accion}`)),
        `ON DELETE ${accion} no deberia pasar`,
      ).toBe(false)
    }
  })
})

describe('migration.sql — la unidad de texto desaparece, y el RLS', () => {
  it('los dos DROP COLUMN unit dejan las tablas ajenas sin unidad de texto', () => {
    // R10 y R11 en su forma de SQL: si la columna `unit` sobreviviera al lado de `unit_id`,
    // habria dos verdades sobre la misma cosa. Van al FINAL del archivo, despues de construir
    // todo lo nuevo (`design.md` seccion 4.2): llegar hasta ahi significa que la guardia del
    // principio conto cero filas con unidad escrita.
    expect(dropsBothTextUnitColumns(upSource)).toBe(true)
    for (const table of ['products', 'recipe_lines']) {
      expect(upSource.indexOf(`ALTER TABLE "${table}" ADD COLUMN "unit_id"`)).toBeLessThan(
        upSource.indexOf(`ALTER TABLE "${table}" DROP COLUMN "unit";`),
      )
    }
    // Sensibilidad: si un DROP se pierde, el predicado cae.
    const sinDrop = upSource.replace('ALTER TABLE "recipe_lines" DROP COLUMN "unit";', '')
    expect(sinDrop, 'la mutacion no quito el DROP COLUMN').not.toBe(upSource)
    expect(dropsBothTextUnitColumns(sinDrop)).toBe(false)

    // Y no se dropea ninguna otra columna ni ninguna tabla ajena.
    expect(up.filter((statement) => /DROP COLUMN/i.test(statement))).toHaveLength(2)
    expect(droppedTables(up)).toEqual([])
  })

  it('units queda con RLS activado y forzado', () => {
    // R21 y decision cerrada 14. Sin `FORCE`, el dueno de las tablas —que es con quien se
    // conecta Prisma— la ignora entera. Se activa sin policies: deny-by-default. Es defensa
    // en profundidad, NO la frontera de autorizacion (`docs/architecture.md > Acceso a datos
    // y autorizacion`), que vive en el service y la fija QC-38. Un test de RLS escrito con
    // Prisma saldria verde pase lo que pase, por eso R21 se cierra aqui, sobre el texto.
    expect(hasRlsEnabledAndForced(upSource, 'units')).toBe(true)
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(2)

    // Sensibilidad: sin el FORCE, el predicado cae —y ese es justo el caso que un test de
    // datos no distinguiria del correcto—.
    const sinForce = upSource.replace('ALTER TABLE "units" FORCE ROW LEVEL SECURITY;', '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'units')).toBe(false)

    const sinEnable = upSource.replace('ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;', '')
    expect(sinEnable).not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'units')).toBe(false)

    // Esta migracion no toca el RLS de las tablas ajenas que altera.
    for (const ajena of ['products', 'recipe_lines']) {
      expect(hasRlsEnabledAndForced(upSource, ajena)).toBe(false)
    }
  })
})

describe('migration.sql — idioma de los identificadores', () => {
  it('todos los identificadores creados por la migracion estan en ingles', () => {
    // R20 y decision cerrada 16. La lista no puede estar vacia, o la asercion no afirmaria
    // nada.
    const identificadores = createdIdentifiers(upSource)
    expect(identificadores.length).toBeGreaterThan(10)
    for (const esperado of [
      'units',
      'name_normalized',
      'symbol',
      'units_pkey',
      'units_name_normalized_key',
      'unit_id',
      'products_unit_id_fkey',
      'recipe_lines_unit_id_fkey',
      'products_unit_id_idx',
      'recipe_lines_unit_id_idx',
    ]) {
      expect(identificadores, `falta el identificador ${esperado}`).toContain(esperado)
    }
    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol o con acentos', () => {
    // Sensibilidad de R20: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of [
      'unidad',
      'unidades',
      'simbolo',
      'nombre',
      'nombre_normalizado',
      'unidad_id',
      'productos_unidad_id_fkey',
    ]) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('Units')).toBe(false)
    expect(isEnglishSnakeCase('unit id')).toBe(false)
    expect(isEnglishSnakeCase('símbolo')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('units')).toBe(true)
    expect(isEnglishSnakeCase('name_normalized')).toBe(true)
    expect(isEnglishSnakeCase('recipe_lines_unit_id_fkey')).toBe(true)
  })
})

// --- El DOWN -------------------------------------------------------------------------------

describe('down.sql — la guardia de la reversion', () => {
  it('el DOWN empieza con su propia guardia DO $$, y el test cae si se quita', () => {
    // R24: es la decision 6 leida al reves —fallar antes que perder el dato—. Si alguna fila
    // apunta ya a una unidad del catalogo, revertir borraria esa referencia sin poder
    // reconstruir el texto anterior. Sin la guardia, el DOWN o pierde la unidad de cada fila
    // en silencio, o revienta con un error de Postgres que no dice que hacer.
    expect(downStartsWithReferenceGuard(downSource)).toBe(true)

    const guard = firstGuardBlock(downSource)
    expect(guard).not.toBeNull()
    expect((guard as { index: number }).index).toBeLessThan(firstSchemaChangeIndex(downSource))
    expect((guard as { body: string }).body).toMatch(/antes de revertir/i)

    // --- Sensibilidad: sin el bloque `DO $$`, el predicado CAE. Mutacion EN MEMORIA.
    const sinGuardia = downSource.replace(/DO\s+\$\$[\s\S]*?\$\$;/, '')
    expect(sinGuardia, 'la mutacion no quito el bloque DO $$').not.toBe(downSource)
    expect(downStartsWithReferenceGuard(sinGuardia), 'un DOWN sin guardia no deberia pasar').toBe(
      false,
    )

    // Un aviso tampoco es una guardia: tiene que ABORTAR.
    const sinExcepcion = downSource.replace(/RAISE\s+EXCEPTION/, 'RAISE NOTICE')
    expect(sinExcepcion).not.toBe(downSource)
    expect(downStartsWithReferenceGuard(sinExcepcion)).toBe(false)

    // Y el UP no queda cubierto por la guardia del DOWN ni al reves: son dos predicados
    // distintos porque miran columnas distintas (`unit` de texto vs. `unit_id`).
    expect(downStartsWithReferenceGuard(upSource)).toBe(false)
    expect(upStartsWithDataGuard(downSource)).toBe(false)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql devuelve products.unit a TEXT y recipe_lines.unit a TEXT NOT NULL, y borra units', () => {
    // R23 y decision cerrada 15: revertir deja el esquema EXACTO anterior. `products.unit`
    // vuelve a ser texto opcional (QC-14) y `recipe_lines.unit` texto obligatorio (QC-24).
    // Un `ADD COLUMN ... NOT NULL` sin DEFAULT solo es legal si la tabla esta vacia, y la
    // guardia de arriba acaba de garantizarlo.
    expect(restoresUnitColumnsExactly(downSource)).toBe(true)
    expect(down).toContain('ALTER TABLE "products" ADD COLUMN "unit" TEXT')
    expect(down).toContain('ALTER TABLE "recipe_lines" ADD COLUMN "unit" TEXT NOT NULL')
    expect(droppedTables(down)).toEqual(['units'])

    // --- Sensibilidad 3 de `design.md` seccion 9: sin el `NOT NULL` del `ADD COLUMN "unit"`
    // del DOWN, el predicado CAE. La linea de receta volveria con la unidad OPCIONAL y el
    // esquema seria PARECIDO al anterior, no el exacto que R23 pide.
    const sinNotNull = downSource.replace(
      'ALTER TABLE "recipe_lines" ADD COLUMN "unit" TEXT NOT NULL;',
      'ALTER TABLE "recipe_lines" ADD COLUMN "unit" TEXT;',
    )
    expect(sinNotNull, 'la mutacion no quito el NOT NULL').not.toBe(downSource)
    expect(restoresUnitColumnsExactly(sinNotNull), 'una columna anulable no deberia pasar').toBe(
      false,
    )

    // Un `DEFAULT ''` tampoco: dejaria un esquema parecido y sembraria unidades en blanco.
    const conDefault = downSource.replace(
      'ADD COLUMN "unit" TEXT NOT NULL;',
      "ADD COLUMN \"unit\" TEXT NOT NULL DEFAULT '';",
    )
    expect(conDefault, 'la mutacion no anadio el DEFAULT').not.toBe(downSource)
    expect(restoresUnitColumnsExactly(conDefault)).toBe(false)

    // Y devolver `products.unit` como obligatoria seria otro esquema, no el de antes.
    const productoObligatorio = downSource.replace(
      'ALTER TABLE "products"     ADD COLUMN "unit" TEXT;',
      'ALTER TABLE "products" ADD COLUMN "unit" TEXT NOT NULL;',
    )
    expect(productoObligatorio, 'la mutacion no se aplico sobre products').not.toBe(downSource)
    expect(restoresUnitColumnsExactly(productoObligatorio)).toBe(false)
  })

  it('down.sql revierte en orden inverso al UP y no deja residuo ni toca lo ajeno', () => {
    // R23: no queda tabla, columna, indice ni restriccion residual del catalogo. Las dos FK y
    // los dos indices de `unit_id` SI se dropean explicitamente: cuelgan de tablas ajenas que
    // sobreviven al rollback, asi que no caen solos como caerian con su tabla.
    for (const constraint of ['recipe_lines_unit_id_fkey', 'products_unit_id_fkey']) {
      expect(down, `falta el DROP CONSTRAINT de ${constraint}`).toContainEqual(
        expect.stringContaining(`DROP CONSTRAINT "${constraint}"`),
      )
    }
    for (const index of ['recipe_lines_unit_id_idx', 'products_unit_id_idx']) {
      expect(down).toContain(`DROP INDEX "${index}"`)
    }
    expect(down.filter((statement) => /DROP COLUMN "unit_id"/i.test(statement))).toHaveLength(2)
    // La tabla se borra la ultima, cuando ya nadie la referencia.
    expect(down[down.length - 1]).toBe('DROP TABLE "units"')

    const downEjecutable = stripSqlComments(downSource)
    // `pgcrypto` NO se toca: la crean tambien QC-4, QC-14 y QC-24 y esas features dependen de
    // ella. El UP si la declara, con `IF NOT EXISTS`, y por eso el DOWN no puede eliminarla.
    expect(downEjecutable).not.toMatch(/pgcrypto/i)
    expect(downEjecutable).not.toMatch(/DROP\s+EXTENSION/i)
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )

    // Revertir esta migracion no puede llevarse por delante ninguna tabla de otro modulo.
    for (const ajena of ['users', 'roles', 'document_types', 'products', 'presentations', 'recipes']) {
      expect(droppedTables(down), `el DOWN no debe dropear ${ajena}`).not.toContain(ajena)
    }
    expect(down.filter((statement) => /^DROP TABLE/i.test(statement))).toHaveLength(1)
  })
})

// ===========================================================================================
// QC-76 — la migracion de la equivalencia y el ambito
// ===========================================================================================

/**
 * La carpeta NUEVA, localizada por PATRON y no por su timestamp: si se regenera con otra
 * marca de tiempo, el test tiene que seguir apuntando a ella (mismo criterio que arriba).
 */
const equivalenceDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_units_equivalence_and_scope'),
)
expect(
  equivalenceDirs,
  'debe existir exactamente una migracion *_units_equivalence_and_scope',
).toHaveLength(1)
const equivalenceDir = join(migrationsDir, equivalenceDirs[0] as string)

const qc76UpSource = readFileSync(join(equivalenceDir, 'migration.sql'), 'utf8')
const qc76DownSource = readFileSync(join(equivalenceDir, 'down.sql'), 'utf8')
const qc76Up = statements(qc76UpSource)
const qc76Down = statements(qc76DownSource)

/**
 * Huella del CONTENIDO de un archivo, con los finales de linea normalizados a `\n`.
 *
 * Se normaliza porque un `git config core.autocrlf` distinto en otra maquina cambiaria los
 * bytes sin que nadie haya editado nada, y este test tiene que fallar por lo que dice que
 * vigila —el contenido— y por nada mas.
 */
function contentDigest(path: string): string {
  return createHash('sha256')
    .update(readFileSync(path, 'utf8').replace(/\r\n/gu, '\n'))
    .digest('hex')
}

/**
 * QC-76 R27. La migracion de QC-32 esta APLICADA: su checksum vive en `_prisma_migrations` y
 * editarla obligaria a reconstruir la base de desarrollo, que tiene datos reales. Estas dos
 * huellas se calcularon el 2026-09-07 sobre los archivos tal y como los dejo QC-32.
 *
 * SI ESTE CASO SE PONE ROJO NO SE ACTUALIZA LA HUELLA: se revierte el archivo. Cambiarla es
 * exactamente lo que R27 prohibe, y el numero de aqui es el unico sitio del repo que lo nota.
 */
const UNITS_CATALOG_DIGESTS: ReadonlyArray<readonly [string, string]> = [
  ['migration.sql', 'c8b90544b912c229a84459a4487fd6b0459750e3215bf72734edcb5a6543e2bd'],
  ['down.sql', 'bf9b7559c717f20dfcccd6ed57b9b4a6a3f2d037af3ed2daccf0b495e08543bf'],
]

/** Los cuatro indices unicos PARCIALES, con las columnas y el `WHERE` que los hace parciales. */
const PARTIAL_UNIQUE_INDEXES: ReadonlyArray<{
  readonly name: string
  readonly columns: readonly string[]
  readonly where: readonly string[]
}> = [
  {
    name: 'units_company_name_unique',
    columns: ['company_id', 'name_normalized'],
    where: ['"company_id" IS NOT NULL'],
  },
  {
    name: 'units_system_name_unique',
    columns: ['name_normalized'],
    where: ['"company_id" IS NULL'],
  },
  {
    name: 'units_company_symbol_unique',
    columns: ['company_id', 'symbol'],
    where: ['"company_id" IS NOT NULL', '"symbol" IS NOT NULL'],
  },
  {
    name: 'units_system_symbol_unique',
    columns: ['symbol'],
    where: ['"company_id" IS NULL', '"symbol" IS NOT NULL'],
  },
]

/**
 * R14 y R15. ¿Estan los CUATRO indices unicos parciales, cada uno una sola vez, sobre `units`,
 * con sus columnas y con su `WHERE`?
 *
 * El `WHERE` es lo que los hace por AMBITO: sin el, `UNIQUE (company_id, name_normalized)` a
 * secas dejaria meter «kilogramo» de sistema tantas veces como se quiera —dos `NULL` no chocan
 * en un indice unico normal— y `UNIQUE (name_normalized)` volveria a ser el global de QC-32.
 */
export function hasTheFourPartialUniqueIndexes(sql: string): boolean {
  const source = statements(sql)
  return PARTIAL_UNIQUE_INDEXES.every(({ name, columns, where }) => {
    const found = source.filter((statement) =>
      new RegExp(`^CREATE UNIQUE INDEX "?${name}"? ON "?units"?`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    const statement = found[0] as string
    const corte = statement.toUpperCase().indexOf(' WHERE ')
    if (corte === -1) return false
    const declared = statement.slice(0, corte)
    const filter = statement.slice(corte)
    return (
      columns.every((column) => declared.includes(`"${column}"`)) &&
      where.every((condition) => filter.includes(condition))
    )
  })
}

/** Los tres CHECK de una sola fila, con el predicado que cada uno tiene que decir. */
const ROW_CHECKS: ReadonlyArray<readonly [string, RegExp]> = [
  // R2: la pareja va junta o ninguna.
  ['units_derivation_pair_check', /\(\s*"unit_id" IS NULL\s*\)\s*=\s*\(\s*"factor" IS NULL\s*\)/i],
  // R4 y R5: cualquier factor mayor que cero, y ninguno menor o igual.
  ['units_factor_positive_check', /"factor" IS NULL OR "factor" > 0/i],
  // R7: nadie deriva de si mismo.
  ['units_no_self_derivation_check', /"unit_id" IS NULL OR "unit_id" <> "id"/i],
]

/** R2, R4, R5, R7. ¿Estan los TRES `CHECK`, cada uno una sola vez y diciendo su predicado? */
export function hasTheThreeRowChecks(sql: string): boolean {
  const source = statements(sql)
  return ROW_CHECKS.every(([constraint, predicate]) => {
    const found = source.filter((statement) =>
      new RegExp(`ADD CONSTRAINT "?${constraint}"? CHECK`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    return predicate.test(found[0] as string)
  })
}

/** Las dos FK que anade QC-76 a `units`, con la columna y la tabla a la que apuntan. */
const NEW_UNIT_FOREIGN_KEYS: ReadonlyArray<readonly [string, string, string]> = [
  // R13: la empresa tiene que existir.
  ['units_company_id_fkey', 'company_id', 'companies'],
  // R8: no se borra una unidad de la que otra deriva.
  ['units_unit_id_fkey', 'unit_id', 'units'],
]

/**
 * R8 y R13. ¿Estan las DOS FK nuevas sobre `units`, apuntando a donde deben y con
 * `ON DELETE RESTRICT`?
 *
 * `RESTRICT` es la UNICA garantia real de R8 —de ahi que R32 prohiba `deleted_at` en esta
 * tabla: un borrado logico es un UPDATE y ninguna FK reacciona a un UPDATE—. Y NUNCA
 * `ON DELETE SET NULL`: dejaria la fila hija con `factor` y sin `unit_id`, violando ademas
 * `units_derivation_pair_check`.
 */
export function bothNewForeignKeysRestrict(sql: string): boolean {
  const source = statements(sql)
  return NEW_UNIT_FOREIGN_KEYS.every(([constraint, column, target]) => {
    const found = source.filter((statement) =>
      new RegExp(`ADD CONSTRAINT "?${constraint}"?`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    const statement = found[0] as string
    return (
      /^ALTER TABLE "?units"?/i.test(statement) &&
      new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i').test(statement) &&
      new RegExp(`REFERENCES "?${target}"?\\s*\\(\\s*"?id"?\\s*\\)`, 'i').test(statement) &&
      isRestrictOnDelete(statement)
    )
  })
}

/**
 * R14. ¿Cae el indice unico GLOBAL de QC-32, y cae ANTES de crear los parciales?
 *
 * EL ORDEN ES LA MITAD DEL REQUISITO: si `units_name_normalized_key` siguiera vivo, dos
 * empresas no podrian tener cada una su «kilogramo» por mucho indice parcial que se cree.
 */
export function dropsTheGlobalIndexBeforeThePartials(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const drop = ejecutable.search(/DROP INDEX "?units_name_normalized_key"?/i)
  if (drop === -1) return false
  return PARTIAL_UNIQUE_INDEXES.every(({ name }) => {
    const create = ejecutable.search(new RegExp(`CREATE UNIQUE INDEX "?${name}"?`, 'i'))
    return create !== -1 && drop < create
  })
}

/**
 * R6 y R9. ¿Estan la funcion y el disparador de derivacion, con sus cinco ramas?
 *
 * Ni un CHECK ni una FK pueden mirar OTRA fila, y «la unidad de la que derivo no deriva de
 * nadie» y «la unidad de la que derivo es mia o de sistema» son predicados sobre la fila
 * PADRE. El disparador es `BEFORE`, asi que la fila no llega a escribirse, y cada `RAISE`
 * lleva su `ERRCODE = '23514'` para que el test de integracion distinga CUAL salto.
 */
export function hasTheDerivationTrigger(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const funcion = /CREATE (?:OR REPLACE )?FUNCTION units_check_derivation\(\)/i.test(ejecutable)
  const disparador =
    /CREATE TRIGGER "?units_check_derivation_trigger"?[\s\S]*?BEFORE INSERT OR UPDATE ON "?units"?[\s\S]*?EXECUTE (?:FUNCTION|PROCEDURE) units_check_derivation\(\)/i.test(
      ejecutable,
    )
  const ramas = [
    'units_derivation_single_level',
    'units_derivation_foreign_company',
    'units_derivation_system_from_company',
    'units_derivation_parent_cannot_derive',
    'units_derivation_children_scope',
  ].every((rama) => ejecutable.includes(rama))
  const errcode = (ejecutable.match(/ERRCODE = '23514'/gi) ?? []).length >= 5
  return funcion && disparador && ramas && errcode
}

/**
 * R28. ¿Actualiza el UP las cuatro filas del catalogo: `litro -> mililitro` y
 * `kilogramo -> gramo` con factor 1000, y las cuatro sin empresa?
 *
 * Las filas se buscan por `name_normalized` y NUNCA por id: los uuid los genero
 * `gen_random_uuid()` en QC-32 y son distintos en cada base. `mililitro` y `gramo` se quedan
 * sin derivacion, que es lo que R28 pide para ellas.
 */
export function updatesTheFourStarterRows(sql: string): boolean {
  const ejecutable = stripSqlComments(sql).replace(/\s+/gu, ' ')
  const sinEmpresa = /UPDATE "units" SET "company_id" = NULL/i.test(ejecutable)
  const derivaciones: ReadonlyArray<readonly [string, string]> = [
    ['litro', 'mililitro'],
    ['kilogramo', 'gramo'],
  ]
  return (
    sinEmpresa &&
    derivaciones.every(([derived, base]) =>
      new RegExp(
        `UPDATE "units" AS derived SET "unit_id" = base\\."id", "factor" = 1000\\.0000 FROM "units" AS base WHERE derived\\."name_normalized" = '${derived}' AND base\\."name_normalized" = '${base}'`,
        'i',
      ).test(ejecutable),
    ) &&
    // Y el UPDATE aborta si no toca EXACTAMENTE una fila (`design.md > 3.2`): sin esta
    // comprobacion, la RLS forzada podria dejarlo en cero filas EN SILENCIO.
    /GET DIAGNOSTICS/i.test(ejecutable) &&
    (ejecutable.match(/RAISE EXCEPTION 'QC-76:/gi) ?? []).length >= 2
  )
}

/** R29. ¿No hay NINGUN `INSERT` ni NINGUN `DELETE` sobre `units`? */
export function createsAndDeletesNoUnits(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  return (
    !/\bINSERT\s+INTO\s+"?units"?/i.test(ejecutable) &&
    !/\bDELETE\s+FROM\s+"?units"?/i.test(ejecutable)
  )
}

/** R30. ¿Termina el archivo con `ENABLE` y `FORCE ROW LEVEL SECURITY` sobre `units`? */
export function endsWithRlsEnabledAndForced(sql: string): boolean {
  const source = statements(sql)
  const dosUltimas = source.slice(-2)
  return (
    hasRlsEnabledAndForced(sql, 'units') &&
    /^ALTER TABLE "?units"? ENABLE ROW LEVEL SECURITY$/i.test(dosUltimas[0] ?? '') &&
    /^ALTER TABLE "?units"? FORCE ROW LEVEL SECURITY$/i.test(dosUltimas[1] ?? '')
  )
}

/**
 * R34. ¿Empieza el DOWN con su guardia de datos, ANTES de cualquier `DROP`, contando las
 * unidades con empresa y las derivaciones que no dejo el propio UP, y abortando si hay alguna?
 *
 * Sin ella el DOWN haria dos cosas irreparables en silencio: convertir las unidades PRIVADAS
 * de cada empresa en unidades DE SISTEMA visibles para todas, y tirar cualquier equivalencia
 * declarada despues de aplicar la migracion.
 */
export function downStartsWithDataGuard(sql: string): boolean {
  const guard = firstGuardBlock(sql)
  if (guard === null) return false
  const aborta = /RAISE\s+EXCEPTION/i.test(guard.body)
  const cuentaEmpresas = /count\(\*\)[\s\S]*?FROM "units"[\s\S]*?"company_id" IS NOT NULL/i.test(
    guard.body,
  )
  const cuentaDerivaciones = /count\(\*\)[\s\S]*?"unit_id" IS NOT NULL/i.test(guard.body)
  const primerCambio = firstSchemaChangeIndex(sql)
  const primerDrop = stripSqlComments(sql).search(
    /\bDROP\s+(TABLE|INDEX|COLUMN|CONSTRAINT|TRIGGER|FUNCTION)\b/i,
  )
  const vaLaPrimera =
    primerCambio !== -1 &&
    guard.index < primerCambio &&
    primerDrop !== -1 &&
    guard.index < primerDrop
  return aborta && cuentaEmpresas && cuentaDerivaciones && vaLaPrimera
}

/**
 * R33. ¿Deja el DOWN el esquema EXACTO anterior? Los cuatro parciales caen, el unico GLOBAL de
 * QC-32 vuelve, y no queda residuo: ni CHECK, ni FK, ni indices de FK, ni columnas, ni funcion,
 * ni disparador.
 */
export function downRestoresThePreviousSchema(sql: string): boolean {
  const source = statements(sql)
  const ejecutable = stripSqlComments(sql)
  const caenLosParciales = PARTIAL_UNIQUE_INDEXES.every(({ name }) =>
    source.some((statement) => new RegExp(`^DROP INDEX "?${name}"?$`, 'i').test(statement)),
  )
  const vuelveElGlobal = source.some((statement) =>
    /^CREATE UNIQUE INDEX "?units_name_normalized_key"? ON "?units"?\s*\(\s*"?name_normalized"?\s*\)$/i.test(
      statement,
    ),
  )
  const caenLosChecks = ROW_CHECKS.every(([constraint]) =>
    source.some((statement) =>
      new RegExp(`DROP CONSTRAINT "?${constraint}"?`, 'i').test(statement),
    ),
  )
  const caenLasFks = NEW_UNIT_FOREIGN_KEYS.every(([constraint]) =>
    source.some((statement) =>
      new RegExp(`DROP CONSTRAINT "?${constraint}"?`, 'i').test(statement),
    ),
  )
  const caenLosIndices = ['units_company_id_idx', 'units_unit_id_idx'].every((index) =>
    source.some((statement) => new RegExp(`^DROP INDEX "?${index}"?$`, 'i').test(statement)),
  )
  const caenLasColumnas = ['company_id', 'unit_id', 'factor'].every((column) =>
    new RegExp(`DROP COLUMN "${column}"`, 'i').test(ejecutable),
  )
  const caeElDisparador =
    /DROP TRIGGER "?units_check_derivation_trigger"? ON "?units"?/i.test(ejecutable) &&
    /DROP FUNCTION units_check_derivation\(\)/i.test(ejecutable)
  return (
    caenLosParciales &&
    vuelveElGlobal &&
    caenLosChecks &&
    caenLasFks &&
    caenLosIndices &&
    caenLasColumnas &&
    caeElDisparador
  )
}

/**
 * Identificadores que crea la migracion de QC-76: los de `createdIdentifiers` (columnas,
 * restricciones e indices) mas la funcion y el disparador, que aquel no mira porque QC-32 no
 * creaba ninguno.
 *
 * Las columnas se vuelven a recorrer con `matchAll` porque `createdIdentifiers` se queda con
 * el PRIMER `ADD COLUMN` de cada sentencia, y esta migracion anade las tres en un solo
 * `ALTER TABLE` (`design.md > 3.1`): con el original, `unit_id` y `factor` no pasarian por la
 * guardia de idioma.
 */
export function createdIdentifiersWithRoutines(sql: string): readonly string[] {
  const ejecutable = stripSqlComments(sql)
  const nombres = new Set<string>(createdIdentifiers(sql))
  for (const match of ejecutable.matchAll(/ADD COLUMN\s+"(\w+)"/gi)) {
    nombres.add(match[1] as string)
  }
  for (const match of ejecutable.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+"?(\w+)"?\s*\(/gi)) {
    nombres.add(match[1] as string)
  }
  for (const match of ejecutable.matchAll(/CREATE TRIGGER\s+"?(\w+)"?/gi)) {
    nombres.add(match[1] as string)
  }
  return [...nombres]
}

/**
 * Vocabulario ingles admitido para los identificadores de QC-76 (R31). Extiende el de QC-32 en
 * vez de sustituirlo, y sigue siendo una lista CERRADA a proposito: un identificador nuevo
 * obliga a pasar por aqui, y uno en espanol (`unidad`, `empresa`, `simbolo`) no encuentra sus
 * piezas y cae.
 */
const VOCABULARIO_INGLES_QC76 = new Set([
  ...VOCABULARIO_INGLES,
  'cannot',
  'check',
  'children',
  'company',
  'derivation',
  'derive',
  'factor',
  'foreign',
  'level',
  'no',
  'pair',
  'parent',
  'positive',
  'scope',
  'self',
  'single',
  'system',
  'trigger',
  'unique',
])

/** ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? (R31) */
export function isEnglishSnakeCaseQC76(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES_QC76.has(pieza))
}

// --- Los casos -----------------------------------------------------------------------------

describe('QC-76 R27 — la migracion de QC-32 sigue intacta', () => {
  it('el contenido de units_catalog no ha cambiado (huella del CONTENIDO, no la fecha)', () => {
    // R27. Esa migracion ESTA APLICADA: su checksum vive en `_prisma_migrations` y editarla
    // obligaria a reconstruir la base de desarrollo, que tiene datos reales. Se compara el
    // CONTENIDO —no el nombre de la carpeta ni su fecha, que no prueban nada— con los finales
    // de linea normalizados, para que un `core.autocrlf` distinto no lo tina de rojo por algo
    // que nadie ha editado.
    //
    // Si esto se pone rojo, la respuesta NO es actualizar la huella: es revertir el archivo.
    for (const [file, digest] of UNITS_CATALOG_DIGESTS) {
      expect(contentDigest(join(migrationDir, file)), `${file} de QC-32 ha cambiado`).toBe(digest)
    }
    // Y la carpeta no gana ni pierde archivos: un tercer `.sql` colado ahi cambiaria lo que se
    // aplica sin cambiar ninguna de las dos huellas.
    expect([...readdirSync(migrationDir)].sort()).toEqual(['down.sql', 'migration.sql'])

    // Los cambios de QC-76 viven en OTRA carpeta, y no es la misma.
    expect(equivalenceDir).not.toBe(migrationDir)
  })

  it('la huella cae ante un solo cambio en el archivo', () => {
    // El caso de arriba no vale nada si la huella no distingue. Se comprueba sobre una copia
    // EN MEMORIA: el archivo en disco no se toca.
    const original = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
    const mutado = original.replace('RESTRICT', 'CASCADE')
    expect(mutado, 'la mutacion tiene que cambiar algo').not.toBe(original)
    const huellaMutada = createHash('sha256').update(mutado.replace(/\r\n/gu, '\n')).digest('hex')
    expect(huellaMutada).not.toBe(UNITS_CATALOG_DIGESTS[0]?.[1])
  })
})

describe('QC-76 migration.sql — restricciones, indices y disparador', () => {
  it('anade las tres columnas nuevas, opcionales y en ingles', () => {
    // R1, R3, R11, R31. Las tres OPCIONALES: una unidad puede no derivar de nadie (base) y
    // puede no tener empresa (de sistema). Y ninguna lleva `DEFAULT`: un default en
    // `company_id` inventaria duenos.
    const alter = qc76Up.filter((statement) => /^ALTER TABLE "?units"? ADD COLUMN/i.test(statement))
    expect(alter).toHaveLength(1)
    const statement = alter[0] as string
    expect(statement).toMatch(/ADD COLUMN "company_id" UUID/i)
    expect(statement).toMatch(/ADD COLUMN "unit_id" UUID/i)
    expect(statement).toMatch(/ADD COLUMN "factor" DECIMAL\(14,4\)/i)
    expect(statement).not.toMatch(/NOT NULL/i)
    expect(statement).not.toMatch(/DEFAULT/i)
    // Ni coma flotante para el factor (R3): un `DOUBLE PRECISION` haria que 0.1 no fuera 0.1.
    expect(statement).not.toMatch(/FLOAT|DOUBLE|REAL/i)
    // Ninguna marca de borrado logico (R32) ni bandera de sistema (R12).
    expect(statement).not.toMatch(/deleted/i)
    expect(statement).not.toMatch(/system/i)
  })

  it('declara los tres CHECK, las dos FK con ON DELETE RESTRICT y los dos indices de FK', () => {
    // R2, R4, R5, R7 (los CHECK), R8 y R13 (las FK). Los dos indices porque Postgres NO indexa
    // el lado hijo de una FK y por ahi pasa la verificacion de cada RESTRICT.
    expect(hasTheThreeRowChecks(qc76UpSource)).toBe(true)
    expect(bothNewForeignKeysRestrict(qc76UpSource)).toBe(true)
    for (const index of ['units_company_id_idx', 'units_unit_id_idx']) {
      expect(qc76Up, `falta ${index}`).toContainEqual(
        expect.stringMatching(new RegExp(`^CREATE INDEX "${index}" ON "units"`, 'i')),
      )
    }
    // NO son unicos: un `CREATE UNIQUE INDEX` sobre `company_id` dejaria una unidad por
    // empresa.
    expect(qc76UpSource).not.toMatch(/CREATE UNIQUE INDEX "units_company_id_idx"/i)
  })

  it('los predicados de CHECK y FK caen si se quita un CHECK o si un RESTRICT pasa a CASCADE', () => {
    // Un test que no puede fallar no vigila nada. Se muta EN MEMORIA; el disco no se toca.
    expect(hasTheThreeRowChecks(qc76UpSource.replace('units_factor_positive_check', 'x'))).toBe(
      false,
    )
    expect(hasTheThreeRowChecks(qc76UpSource.replace('"unit_id" <> "id"', '"unit_id" = "id"'))).toBe(
      false,
    )
    expect(
      bothNewForeignKeysRestrict(qc76UpSource.replace(/ON DELETE RESTRICT/g, 'ON DELETE CASCADE')),
    ).toBe(false)
    expect(bothNewForeignKeysRestrict(qc76UpSource.replace('units_unit_id_fkey', 'x'))).toBe(false)
  })

  it('crea los cuatro indices unicos parciales, con su WHERE, despues de tirar el global', () => {
    // R14 y R15. La unicidad pasa a ser POR AMBITO: dentro de la empresa, y las de sistema
    // entre ellas. El simbolo, solo CUANDO EXISTE (decision cerrada 28).
    expect(hasTheFourPartialUniqueIndexes(qc76UpSource)).toBe(true)
    expect(dropsTheGlobalIndexBeforeThePartials(qc76UpSource)).toBe(true)
    // Y no queda ningun otro indice unico sobre `units` que no sea uno de los cuatro.
    const unicos = qc76Up
      .map((statement) => /^CREATE UNIQUE INDEX "([^"]+)" ON "units"/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
      .sort()
    expect(unicos).toEqual([...PARTIAL_UNIQUE_INDEXES].map(({ name }) => name).sort())
  })

  it('los predicados de los parciales caen si se borra un indice, su WHERE o el DROP del global', () => {
    expect(
      hasTheFourPartialUniqueIndexes(qc76UpSource.replace('units_system_symbol_unique', 'x')),
    ).toBe(false)
    expect(
      hasTheFourPartialUniqueIndexes(
        qc76UpSource.replace(
          'ON "units" ("name_normalized") WHERE "company_id" IS NULL',
          'ON "units" ("name_normalized")',
        ),
      ),
    ).toBe(false)
    expect(
      dropsTheGlobalIndexBeforeThePartials(
        qc76UpSource.replace('DROP INDEX "units_name_normalized_key";', ''),
      ),
    ).toBe(false)
  })

  it('declara la funcion y el disparador de derivacion, con sus cinco ramas', () => {
    // R6 y R9: lo que necesita mirar OTRA fila no cabe en un CHECK. `BEFORE`, asi que la fila
    // no llega a escribirse, y cada rama con su `ERRCODE = '23514'` para que el test de
    // integracion distinga cual salto.
    expect(hasTheDerivationTrigger(qc76UpSource)).toBe(true)
    expect(qc76UpSource).toMatch(/BEFORE INSERT OR UPDATE ON "units"/i)
    expect(qc76UpSource).toMatch(/FOR EACH ROW/i)
    expect(qc76UpSource).toMatch(/LANGUAGE plpgsql/i)
  })

  it('el predicado del disparador cae si se quita el trigger o una de sus ramas', () => {
    expect(
      hasTheDerivationTrigger(
        qc76UpSource.replace(/CREATE TRIGGER[\s\S]*?units_check_derivation\(\);/i, ''),
      ),
    ).toBe(false)
    expect(hasTheDerivationTrigger(qc76UpSource.replace('units_derivation_single_level', 'x'))).toBe(
      false,
    )
    expect(
      hasTheDerivationTrigger(qc76UpSource.replace(/ERRCODE = '23514'/g, "ERRCODE = 'P0001'")),
    ).toBe(false)
  })
})

describe('QC-76 migration.sql — los datos y la RLS', () => {
  it('actualiza las cuatro filas de R28 y no crea ni borra ninguna unidad', () => {
    // R28: `litro -> mililitro` y `kilogramo -> gramo`, las dos con factor 1000, y las cuatro
    // SIN empresa. R29: ni un `INSERT` ni un `DELETE` sobre `units` —«unidad» sigue fuera del
    // arrancador, como la dejo QC-32—.
    expect(updatesTheFourStarterRows(qc76UpSource)).toBe(true)
    expect(createsAndDeletesNoUnits(qc76UpSource)).toBe(true)
    // `mililitro` y `gramo` se quedan sin derivacion: NO hay ningun UPDATE que las nombre como
    // fila actualizada. Solo aparecen como la BASE a la que apuntan las otras dos.
    expect(qc76UpSource).not.toMatch(/derived\."name_normalized" = 'mililitro'/i)
    expect(qc76UpSource).not.toMatch(/derived\."name_normalized" = 'gramo'/i)
  })

  it('los predicados de datos caen si se quita un UPDATE, su guardia, o si se cuela un INSERT', () => {
    expect(
      updatesTheFourStarterRows(
        qc76UpSource.replace(
          'derived."name_normalized" = \'kilogramo\'',
          'derived."name_normalized" = \'x\'',
        ),
      ),
    ).toBe(false)
    expect(updatesTheFourStarterRows(qc76UpSource.replace(/GET DIAGNOSTICS/g, 'SELECT 1 --'))).toBe(
      false,
    )
    expect(
      createsAndDeletesNoUnits(`${qc76UpSource}\nINSERT INTO "units" ("name") VALUES ('unidad');`),
    ).toBe(false)
    expect(
      createsAndDeletesNoUnits(`${qc76UpSource}\nDELETE FROM "units" WHERE "id" IS NOT NULL;`),
    ).toBe(false)
  })

  it('el UPDATE va entre el parentesis NO FORCE / FORCE y el archivo termina en ENABLE + FORCE', () => {
    // R30 y `design.md > 3.2`: `units` ya esta `FORCE ROW LEVEL SECURITY` SIN NINGUNA POLICY
    // desde QC-32, y `FORCE` deniega tambien al dueno de la tabla, que es con quien se conecta
    // Prisma. Sin abrir el parentesis, el UPDATE de R28 afectaria a CERO filas en silencio.
    const ejecutable = stripSqlComments(qc76UpSource)
    const noForce = ejecutable.search(/ALTER TABLE "units" NO FORCE ROW LEVEL SECURITY/i)
    const update = ejecutable.search(/UPDATE "units"/i)
    const enable = ejecutable.search(/ALTER TABLE "units" ENABLE ROW LEVEL SECURITY/i)
    expect(noForce).toBeGreaterThan(-1)
    expect(noForce).toBeLessThan(update)
    expect(update).toBeLessThan(enable)

    // Y el archivo CIERRA con las dos: la tabla no se queda sin forzar (R30).
    expect(endsWithRlsEnabledAndForced(qc76UpSource)).toBe(true)
    expect(hasRlsEnabledAndForced(qc76UpSource, 'units')).toBe(true)
    // Sin policies: deny-by-default. La RLS es defensa en profundidad, NO la frontera de
    // autorizacion (`docs/architecture.md > Acceso a datos y autorizacion`).
    expect(ejecutable).not.toMatch(/CREATE POLICY/i)
  })

  it('el predicado de RLS cae si falta el FORCE o si deja de ser lo ultimo del archivo', () => {
    expect(
      endsWithRlsEnabledAndForced(
        qc76UpSource.replace('ALTER TABLE "units" FORCE ROW LEVEL SECURITY;', ''),
      ),
    ).toBe(false)
    expect(
      endsWithRlsEnabledAndForced(
        `${qc76UpSource}\nALTER TABLE "units" ADD COLUMN "system" BOOLEAN;`,
      ),
    ).toBe(false)
  })

  it('todos los identificadores que crea la migracion estan en ingles', () => {
    // R31, heredado de QC-4. Lista cerrada de vocabulario: un identificador en espanol no
    // encuentra sus piezas y cae.
    const identificadores = createdIdentifiersWithRoutines(qc76UpSource)
    expect(identificadores.length).toBeGreaterThan(0)
    for (const identificador of identificadores) {
      expect(
        isEnglishSnakeCaseQC76(identificador),
        `identificador no ingles: ${identificador}`,
      ).toBe(true)
    }
    // Y estan los que tienen que estar, sin sobrar ninguno.
    expect([...identificadores].sort()).toEqual(
      [
        'company_id',
        'factor',
        'unit_id',
        'units_check_derivation',
        'units_check_derivation_trigger',
        'units_company_id_fkey',
        'units_company_id_idx',
        'units_company_name_unique',
        'units_company_symbol_unique',
        'units_derivation_pair_check',
        'units_factor_positive_check',
        'units_no_self_derivation_check',
        'units_system_name_unique',
        'units_system_symbol_unique',
        'units_unit_id_fkey',
        'units_unit_id_idx',
      ].sort(),
    )
  })

  it('la guardia de idioma cae con un identificador en espanol', () => {
    expect(isEnglishSnakeCaseQC76('units_empresa_idx')).toBe(false)
    expect(isEnglishSnakeCaseQC76('unidades_factor_check')).toBe(false)
    expect(isEnglishSnakeCaseQC76('units_simbolo_unique')).toBe(false)
    expect(isEnglishSnakeCaseQC76('units_company_name_unique')).toBe(true)
  })
})

describe('QC-76 down.sql — existe, guarda el dato y revierte al esquema anterior', () => {
  it('el DOWN empieza con su guardia de datos, antes de cualquier DROP', () => {
    // R34. Fallar antes que perder el dato: si hay una unidad con empresa o una derivada que
    // no dejo el propio UP, la reversion se detiene ENTERA y no descarta nada en silencio.
    expect(downStartsWithDataGuard(qc76DownSource)).toBe(true)
    // Las dos unicas derivaciones que este DOWN acepta descartar son las de R28.
    expect(qc76DownSource).toMatch(/litro/)
    expect(qc76DownSource).toMatch(/kilogramo/)
  })

  it('el predicado de la guardia cae si se quita el bloque, su RAISE o si un DROP se le adelanta', () => {
    const sinGuardia = qc76DownSource.replace(/DO \$\$[\s\S]*?\$\$;/, '')
    expect(downStartsWithDataGuard(sinGuardia)).toBe(false)
    const sinRaise = qc76DownSource.replace(/RAISE\s+EXCEPTION/g, 'RAISE NOTICE')
    expect(downStartsWithDataGuard(sinRaise)).toBe(false)
    const guardiaTarde = `DROP TRIGGER "units_check_derivation_trigger" ON "units";\n${qc76DownSource}`
    expect(downStartsWithDataGuard(guardiaTarde)).toBe(false)
  })

  it('revierte exactamente el UP y recrea el indice unico global de QC-32', () => {
    // R33: sin columna, indice, restriccion ni disparador residual, con
    // `units_name_normalized_key` restaurado. Sin el, el catalogo quedaria sin NINGUNA
    // garantia de unicidad, que no es «el esquema anterior» sino uno peor.
    expect(downRestoresThePreviousSchema(qc76DownSource)).toBe(true)
    // Y NO borra ninguna fila: las cuatro unidades siguen ahi (R33).
    expect(createsAndDeletesNoUnits(qc76DownSource)).toBe(true)
    expect(qc76Down.filter((statement) => /^DROP TABLE/i.test(statement))).toHaveLength(0)
    // Ni toca ninguna tabla ajena.
    for (const ajena of [
      'users',
      'roles',
      'companies',
      'products',
      'recipe_lines',
      'presentations',
    ]) {
      expect(droppedTables(qc76Down), `el DOWN no debe dropear ${ajena}`).not.toContain(ajena)
    }
    // La RLS se queda activada y forzada, que es como estaba antes del UP (R33, R30).
    expect(endsWithRlsEnabledAndForced(qc76DownSource)).toBe(true)
  })

  it('el predicado de reversion cae si se olvida el indice global, una columna o el disparador', () => {
    expect(
      downRestoresThePreviousSchema(
        qc76DownSource.replace(
          'CREATE UNIQUE INDEX "units_name_normalized_key" ON "units"("name_normalized");',
          '',
        ),
      ),
    ).toBe(false)
    expect(downRestoresThePreviousSchema(qc76DownSource.replace('DROP COLUMN "factor",', ''))).toBe(
      false,
    )
    expect(
      downRestoresThePreviousSchema(
        qc76DownSource.replace('DROP FUNCTION units_check_derivation()', ''),
      ),
    ).toBe(false)
  })
})
