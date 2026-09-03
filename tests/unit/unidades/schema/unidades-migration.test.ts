// T8 — Contrato estatico del SQL de la migracion `units_catalog` (QC-32: modelo-unidades).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`specs/QC-32-modelo-unidades/design.md` seccion 4): la GUARDIA DE DATOS del UP y la
// simetrica del DOWN —las dos escritas a mano, las dos existen para fallar antes que perder el
// texto de unidad de una fila—, las DOS FK que cruzan de modulo (`products_unit_id_fkey` y
// `recipe_lines_unit_id_fkey`, `ON DELETE RESTRICT`), el indice unico del nombre normalizado,
// los dos `DROP COLUMN "unit"` y los dos ALTER de RLS. Si una migracion futura de `products` o
// de `recipe_lines` se los lleva por drift, el esquema sigue validando y el cliente sigue
// compilando: tiene que caer aqui, que es la unica guardia que tienen.
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
// Cubre R5, R8, R10 y R11 (su parte de SQL), R12, R13, R18, R20, R21, R22, R23 y R24.

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
