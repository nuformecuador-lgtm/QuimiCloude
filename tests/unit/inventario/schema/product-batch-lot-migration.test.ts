// La migracion esta escrita a mano y su correccion depende del orden y de lineas que Prisma no
// modela ni regenera: una edicion futura puede perderlas sin que ningun tipo generado se entere.
// Cada predicado se aplica al SQL real y a una version mutada en memoria, y cada mutacion comprueba
// con `not.toBe(...)` que muto de verdad: un test que no puede fallar no vigila nada. Que las
// restricciones muerdan en la base lo prueba la integracion, no este archivo.

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

/** Por patron y no por timestamp: renombrar la marca de tiempo no debe romperlo. */
const lotDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_product_batch_lot_and_purchase_date'),
)
const migrationDir = join(migrationsDir, lotDirs[0] ?? '__no_existe__')

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

/** En una sola linea y con espacios normalizados, para medir posiciones. */
export function executable(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ')
}

/**
 * Partir por `;` rompe los bloques `DO $$ ... $$`, pero ningun trozo suyo empieza por `ALTER`,
 * `CREATE` ni `DROP` y no ensucia las afirmaciones ancladas con `^`. Lo que se afirma sobre un
 * bloque se mide contra el texto completo.
 */
export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

export function doBlocks(sql: string): readonly string[] {
  return executable(sql).match(/DO \$\$[\s\S]*?\$\$/g) ?? []
}

const NO_FORCE = /^ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY$/
const ENABLE = /^ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY$/
const FORCE = /^ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY$/

// --- Predicados del UP ----------------------------------------------------------------------

/**
 * ¿El parentesis de RLS se abre en la primera sentencia y se cierra --`ENABLE` y luego `FORCE`--
 * en las dos ultimas?
 *
 * Bajo `FORCE` y sin policies la RLS deniega tambien al dueno: la guardia leeria cero duplicados y
 * los `UPDATE` tocarian cero filas. No cerrarlo deja la tabla menos protegida que antes de migrar.
 */
export function wrapsInRlsParenthesis(sql: string): boolean {
  const source = statements(sql)
  const first = source[0] ?? ''
  const penultimate = source.at(-2) ?? ''
  const last = source.at(-1) ?? ''
  const opens = source.filter((statement) => NO_FORCE.test(statement)).length
  return NO_FORCE.test(first) && opens === 1 && ENABLE.test(penultimate) && FORCE.test(last)
}

/**
 * ¿La guardia de duplicados es un bloque `DO $$` que va antes de cualquier cambio de esquema,
 * agrupa por `(company_id, lot)` excluyendo los lotes en blanco, y aborta diciendo cuantos son y
 * que hacer?
 */
export function guardsDuplicateLotsBeforeAnySchemaChange(sql: string): boolean {
  const text = executable(sql)
  const guard = doBlocks(sql)[0]
  if (guard === undefined) return false
  const groupsByCompanyAndLot = /GROUP BY "company_id", "lot" HAVING count\(\*\) > 1/i.test(guard)
  const ignoresBlankLots = /WHERE "lot" IS NOT NULL AND btrim\("lot"\) <> ''/i.test(guard)
  const raises = /RAISE EXCEPTION '[^']*%[^']*%/i.test(guard)
  const saysWhatToDo =
    guard.includes('product_batches_company_lot_unique') && /renombra/i.test(guard)
  const firstSchemaChange = text.search(
    /ADD COLUMN|SET NOT NULL|ADD CONSTRAINT|CREATE UNIQUE INDEX|UPDATE "product_batches"/i,
  )
  const guardAt = text.indexOf(guard)
  return (
    groupsByCompanyAndLot &&
    ignoresBlankLots &&
    raises &&
    saysWhatToDo &&
    firstSchemaChange !== -1 &&
    guardAt < firstSchemaChange
  )
}

/**
 * ¿`purchase_date` nace `DATE` anulable y sin `DEFAULT`, y ninguna sentencia usa el reloj?
 *
 * Un `DEFAULT CURRENT_DATE` daria a las filas viejas una fecha de compra falsa, y un `TIMESTAMPTZ`
 * no es una fecha civil.
 */
export function addsPurchaseDateAsNullableDateWithoutDefault(sql: string): boolean {
  const source = statements(sql)
  const adds = source.filter((statement) => /ADD COLUMN "purchase_date"/i.test(statement))
  const text = executable(sql)
  const usesClock = /\b(CURRENT_DATE|CURRENT_TIMESTAMP|LOCALTIMESTAMP)\b|\bnow\s*\(/i.test(text)
  return (
    adds.length === 1 &&
    /^ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE$/.test(adds[0] as string) &&
    !usesClock
  )
}

/**
 * Sin el `AT TIME ZONE 'UTC'` la conversion usaria la zona de la sesion, y la misma base migrada
 * en dos maquinas daria dos dias distintos para la misma fila.
 */
export function fillsPurchaseDateFromCreatedAtInUtc(sql: string): boolean {
  return /UPDATE "product_batches" SET "purchase_date" = \("created_at" AT TIME ZONE 'UTC'\)::date;/i.test(
    executable(sql),
  )
}

/**
 * ¿El relleno de lote toma solo las filas en blanco, las numera por empresa y orden de creacion con
 * el `id` de desempate, y continua desde el maximo numerico sin techo?
 *
 * Con `::bigint` y la cota `{1,18}` que lo protege, un lote de 19 digitos quedaria fuera del
 * maximo. Se exige que no quede ningun `::bigint` para que una vuelta atras a medias no pase.
 */
export function fillsLotBySeriesPerCompany(sql: string): boolean {
  const text = executable(sql)
  return (
    /max\(\("lot"\)::numeric\)/i.test(text) &&
    !/\("lot"\)::bigint/i.test(text) &&
    text.includes(`WHERE "lot" ~ '^[0-9]+$'`) &&
    !/'\^\[0-9\]\{\d+,\d+\}\$'/.test(text) &&
    /row_number\(\) OVER \(PARTITION BY "company_id" ORDER BY "created_at", "id"\)/i.test(text) &&
    /WHERE "lot" IS NULL OR btrim\("lot"\) = ''/i.test(text) &&
    /SET "lot" = \(COALESCE\(base\.top, 0\) \+ pendientes\.rn\)::text/i.test(text)
  )
}

/**
 * ¿Cada relleno comprueba su `ROW_COUNT` y aborta si no cuadra?
 *
 * El de la fecha contra el total de la tabla; el del lote contra las filas sin lote contadas justo
 * antes, porque las que ya tienen lote lo conservan.
 */
export function checksRowCountOfBothFills(sql: string): boolean {
  const fill = doBlocks(sql).find((block) => block.includes('SET "purchase_date"'))
  if (fill === undefined) return false
  const diagnostics = (fill.match(/GET DIAGNOSTICS updated_rows = ROW_COUNT/gi) ?? []).length
  return (
    diagnostics === 2 &&
    /IF updated_rows <> total_rows THEN RAISE EXCEPTION/i.test(fill) &&
    /IF updated_rows <> pending_rows THEN RAISE EXCEPTION/i.test(fill) &&
    /SELECT count\(\*\) INTO total_rows FROM "product_batches"/i.test(fill)
  )
}

function positionOf(sql: string, pattern: RegExp): number {
  return executable(sql).search(pattern)
}

export function fillsBeforeNotNull(sql: string): boolean {
  const addColumn = positionOf(sql, /ADD COLUMN "purchase_date"/)
  const fillDate = positionOf(sql, /SET "purchase_date" =/)
  const fillLot = positionOf(sql, /SET "lot" =/)
  const dateNotNull = positionOf(sql, /ALTER COLUMN "purchase_date" SET NOT NULL/)
  const lotNotNull = positionOf(sql, /ALTER COLUMN "lot" SET NOT NULL/)
  if ([addColumn, fillDate, fillLot, dateNotNull, lotNotNull].includes(-1)) return false
  return addColumn < fillDate && fillDate < dateNotNull && fillLot < lotNotNull
}

/** El indice no puede ser parcial ni funcional, y va despues de los rellenos. */
export function constraintsAfterFill(sql: string): boolean {
  const source = statements(sql)
  const notBlank = source.includes(
    `ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_not_blank" CHECK (btrim("lot") <> '')`,
  )
  const length = source.includes(
    `ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_length" CHECK (char_length("lot") <= 60)`,
  )
  const unique = source.includes(
    `CREATE UNIQUE INDEX "product_batches_company_lot_unique" ON "product_batches" ("company_id", "lot")`,
  )
  const lastFill = Math.max(
    positionOf(sql, /SET "purchase_date" =/),
    positionOf(sql, /SET "lot" =/),
    positionOf(sql, /ALTER COLUMN "lot" SET NOT NULL/),
    positionOf(sql, /ALTER COLUMN "purchase_date" SET NOT NULL/),
  )
  const firstConstraint = Math.min(
    positionOf(sql, /ADD CONSTRAINT "product_batches_lot_not_blank"/),
    positionOf(sql, /ADD CONSTRAINT "product_batches_lot_length"/),
    positionOf(sql, /CREATE UNIQUE INDEX "product_batches_company_lot_unique"/),
  )
  return notBlank && length && unique && firstConstraint !== -1 && lastFill < firstConstraint
}

/**
 * Un `COMMIT` a mitad dejaria confirmada la columna nueva aunque un `RAISE EXCEPTION` posterior
 * abortara.
 */
export function opensNoTransactionOfItsOwn(sql: string): boolean {
  const text = executable(sql)
  const ownTransaction = statements(sql).some((statement) =>
    /^(BEGIN|START TRANSACTION|COMMIT|ROLLBACK|END)$/i.test(statement),
  )
  return !ownTransaction && !/\b(COMMIT|ROLLBACK)\b/i.test(text)
}

export function staysInScopeAndInEnglish(sql: string): boolean {
  const text = executable(sql)
  const touchesDeletion = /deleted_at/i.test(text)
  const rewritesTimestamps = /"(created_at|updated_at)"\s*=/i.test(text)
  const insertsOrDeletes = /\b(INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/i.test(text)
  const otherTables = [...text.matchAll(/(?:ALTER TABLE|UPDATE|ON|FROM)\s+"(\w+)"/gi)]
    .map((match) => match[1] as string)
    .filter((table) => table !== 'product_batches')
  const vocabulary = new Set([
    'product',
    'batches',
    'purchase',
    'date',
    'lot',
    'not',
    'blank',
    'length',
    'company',
    'unique',
  ])
  const created = [
    ...text.matchAll(/(?:ADD COLUMN|CREATE UNIQUE INDEX|CREATE INDEX|ADD CONSTRAINT)\s+"(\w+)"/gi),
  ].map((match) => match[1] as string)
  const english =
    created.length === 4 &&
    created.every(
      (name) =>
        /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name) &&
        name.split('_').every((piece) => vocabulary.has(piece)),
    )
  return (
    !touchesDeletion &&
    !rewritesTimestamps &&
    !insertsOrDeletes &&
    otherTables.length === 0 &&
    english &&
    !/CREATE\s+POLICY/i.test(text)
  )
}

// --- Predicados del DOWN --------------------------------------------------------------------

export function downRevertsEveryAddition(sql: string): boolean {
  const source = statements(sql)
  const at = (pattern: RegExp): number => source.findIndex((statement) => pattern.test(statement))
  const dropIndex = at(/^DROP INDEX (?:IF EXISTS )?"product_batches_company_lot_unique"$/)
  const dropLength = at(
    /^ALTER TABLE "product_batches" DROP CONSTRAINT (?:IF EXISTS )?"product_batches_lot_length"$/,
  )
  const dropNotBlank = at(
    /^ALTER TABLE "product_batches" DROP CONSTRAINT (?:IF EXISTS )?"product_batches_lot_not_blank"$/,
  )
  const lotNullable = at(/^ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL$/)
  const dropDate = at(/^ALTER TABLE "product_batches" DROP COLUMN (?:IF EXISTS )?"purchase_date"$/)
  if ([dropIndex, dropLength, dropNotBlank, lotNullable, dropDate].includes(-1)) return false
  return Math.max(dropIndex, dropLength, dropNotBlank) < Math.min(lotNullable, dropDate)
}

/**
 * Los lotes del relleno y los escritos a mano no se distinguen: vaciar cualquiera tiraria dato
 * ajeno, asi que el down no admite ningun `UPDATE`.
 */
export function downNeverEmptiesLot(sql: string): boolean {
  const text = executable(sql)
  return (
    !/\bUPDATE\b/i.test(text) &&
    !/\b(DELETE\s+FROM|TRUNCATE)\b/i.test(text) &&
    !/DROP COLUMN (?:IF EXISTS )?"lot"/i.test(text)
  )
}

export function downHeaderStatesItsLimits(sql: string): boolean {
  return (
    /NO VACIA NINGUN `lot`/.test(sql) &&
    /\(R23\)/.test(sql) &&
    /SI PIERDE/.test(sql) &&
    /purchase_date/.test(sql)
  )
}

// --- Casos ----------------------------------------------------------------------------------

describe('QC-81 migration.sql — orden, relleno y restricciones', () => {
  it('R17: existe exactamente UNA migracion de QC-81 con su migration.sql y su down.sql', () => {
    expect(lotDirs, 'una sola carpeta *_product_batch_lot_and_purchase_date').toHaveLength(1)
    expect(upSource.trim().length).toBeGreaterThan(0)
    expect(downSource.trim().length).toBeGreaterThan(0)
  })

  it('R22: el parentesis de RLS se abre lo primero y se cierra ENABLE+FORCE lo ultimo', () => {
    expect(wrapsInRlsParenthesis(upSource)).toBe(true)

    const sinAbrir = upSource.replace('ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;', '')
    expect(sinAbrir, 'la mutacion no quito el NO FORCE').not.toBe(upSource)
    expect(wrapsInRlsParenthesis(sinAbrir)).toBe(false)

    const sinCerrar = upSource.replace(/ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;\s*$/, '')
    expect(sinCerrar, 'la mutacion no quito el FORCE final').not.toBe(upSource)
    expect(wrapsInRlsParenthesis(sinCerrar)).toBe(false)

    // Abrirlo despues de la guardia deja la guardia leyendo bajo FORCE.
    const abiertoTarde = upSource
      .replace('ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;', '')
      .replace(
        'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
        'ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY;\nALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
      )
    expect(abiertoTarde).not.toBe(upSource)
    expect(wrapsInRlsParenthesis(abiertoTarde)).toBe(false)
  })

  it('R21: la guardia de duplicados por empresa va antes de todo cambio y dice cuantos y que hacer', () => {
    expect(guardsDuplicateLotsBeforeAnySchemaChange(upSource)).toBe(true)

    const guard = /DO \$\$[\s\S]*?\$\$;/.exec(upSource)
    if (guard === null) throw new Error('el migration.sql no tiene bloque DO $$')

    // Sin guardia: el indice unico fallaria con un 23505 suelto.
    const sinGuardia = upSource.replace(guard[0], '')
    expect(sinGuardia).not.toBe(upSource)
    expect(guardsDuplicateLotsBeforeAnySchemaChange(sinGuardia)).toBe(false)

    // Reemplazo en funcion: el bloque lleva `$$`, que como cadena de reemplazo se colapsa a `$`.
    const guardBlock = guard[0]
    const guardiaTarde = upSource
      .replace(guardBlock, () => '')
      .replace(
        'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
        () => `ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;\n${guardBlock}`,
      )
    expect(doBlocks(guardiaTarde), 'la mutacion conserva los dos bloques DO intactos').toHaveLength(2)
    expect(guardiaTarde).not.toBe(upSource)
    expect(guardsDuplicateLotsBeforeAnySchemaChange(guardiaTarde)).toBe(false)

    // Agrupando global y no por empresa, dos empresas con el mismo lote abortarian.
    const global = upSource.replace('GROUP BY "company_id", "lot"', 'GROUP BY "lot"')
    expect(global).not.toBe(upSource)
    expect(guardsDuplicateLotsBeforeAnySchemaChange(global)).toBe(false)
  })

  it('R19 y R26: purchase_date nace DATE anulable sin DEFAULT y se rellena con created_at en UTC', () => {
    expect(addsPurchaseDateAsNullableDateWithoutDefault(upSource)).toBe(true)
    expect(fillsPurchaseDateFromCreatedAtInUtc(upSource)).toBe(true)

    const conDefault = upSource.replace(
      'ADD COLUMN "purchase_date" DATE;',
      'ADD COLUMN "purchase_date" DATE DEFAULT CURRENT_DATE;',
    )
    expect(conDefault).not.toBe(upSource)
    expect(addsPurchaseDateAsNullableDateWithoutDefault(conDefault)).toBe(false)

    const comoInstante = upSource.replace('ADD COLUMN "purchase_date" DATE;', 'ADD COLUMN "purchase_date" TIMESTAMPTZ(6);')
    expect(comoInstante).not.toBe(upSource)
    expect(addsPurchaseDateAsNullableDateWithoutDefault(comoInstante)).toBe(false)

    const sinUtc = upSource.replace(`("created_at" AT TIME ZONE 'UTC')::date`, `"created_at"::date`)
    expect(sinUtc, 'la mutacion no quito el AT TIME ZONE').not.toBe(upSource)
    expect(fillsPurchaseDateFromCreatedAtInUtc(sinUtc)).toBe(false)

    const conHoy = upSource.replace(`("created_at" AT TIME ZONE 'UTC')::date`, 'CURRENT_DATE')
    expect(conHoy).not.toBe(upSource)
    expect(fillsPurchaseDateFromCreatedAtInUtc(conHoy)).toBe(false)
    expect(addsPurchaseDateAsNullableDateWithoutDefault(conHoy)).toBe(false)
  })

  it('R18: el relleno de lote numera por empresa y orden de creacion desde el maximo numerico', () => {
    expect(fillsLotBySeriesPerCompany(upSource)).toBe(true)

    const sinDesempate = upSource.replace('ORDER BY "created_at", "id"', 'ORDER BY "created_at"')
    expect(sinDesempate).not.toBe(upSource)
    expect(fillsLotBySeriesPerCompany(sinDesempate)).toBe(false)

    // `replaceAll`: el literal tambien aparece en un comentario del SQL, y un `replace` simple
    // mutaria la prosa. En funcion: como cadena, el `$'` de `'^[0-9]+$'` reinserta el resto del
    // texto, con el literal original dentro, y la mutacion no mutaria nada.
    const conCota = upSource.replaceAll(`'^[0-9]+$'`, () => `'^[0-9]{1,18}$'`)
    expect(conCota, 'la mutacion no reintrodujo la cota {1,18}').not.toBe(upSource)
    expect(fillsLotBySeriesPerCompany(conCota)).toBe(false)

    const conBigint = upSource.replaceAll(`max(("lot")::numeric)`, () => `max(("lot")::bigint)`)
    expect(conBigint, 'la mutacion no volvio a ::bigint').not.toBe(upSource)
    expect(fillsLotBySeriesPerCompany(conBigint)).toBe(false)

    const serieGlobal = upSource.replace('PARTITION BY "company_id" ', '')
    expect(serieGlobal).not.toBe(upSource)
    expect(fillsLotBySeriesPerCompany(serieGlobal)).toBe(false)
  })

  it('R22: cada relleno comprueba su ROW_COUNT', () => {
    expect(checksRowCountOfBothFills(upSource)).toBe(true)

    const sinUnaComprobacion = upSource.replace(
      /GET DIAGNOSTICS updated_rows = ROW_COUNT;\s*IF updated_rows <> pending_rows/,
      'IF updated_rows <> pending_rows',
    )
    expect(sinUnaComprobacion).not.toBe(upSource)
    expect(checksRowCountOfBothFills(sinUnaComprobacion)).toBe(false)
  })

  it('R22: los rellenos van ANTES de los SET NOT NULL', () => {
    expect(fillsBeforeNotNull(upSource)).toBe(true)

    const notNulls =
      'ALTER TABLE "product_batches" ALTER COLUMN "purchase_date" SET NOT NULL;\nALTER TABLE "product_batches" ALTER COLUMN "lot" SET NOT NULL;'
    expect(upSource).toContain(notNulls)
    const apretadoAntes = upSource
      .replace(notNulls, '')
      .replace(
        'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
        `ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;\n${notNulls}`,
      )
    expect(apretadoAntes).not.toBe(upSource)
    expect(fillsBeforeNotNull(apretadoAntes)).toBe(false)
  })

  it('R7, R11 y R22: los dos CHECK y el indice unico (company_id, lot) van DESPUES del relleno', () => {
    expect(constraintsAfterFill(upSource)).toBe(true)

    const indice = /CREATE UNIQUE INDEX "product_batches_company_lot_unique"[\s\S]*?;/.exec(upSource)
    if (indice === null) throw new Error('el migration.sql no crea el indice unico')
    const indiceAntes = upSource
      .replace(indice[0], '')
      .replace(
        'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
        `ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;\n${indice[0]}`,
      )
    expect(indiceAntes).not.toBe(upSource)
    expect(constraintsAfterFill(indiceAntes)).toBe(false)

    // Unicidad global de lote en vez de por empresa.
    const soloLote = upSource.replace('ON "product_batches" ("company_id", "lot")', 'ON "product_batches" ("lot")')
    expect(soloLote).not.toBe(upSource)
    expect(constraintsAfterFill(soloLote)).toBe(false)

    // Sin el CHECK de lote en blanco, `''` pasaria como lote.
    const sinNoBlank = upSource.replace(
      /ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_lot_not_blank"[\s\S]*?;/,
      '',
    )
    expect(sinNoBlank).not.toBe(upSource)
    expect(constraintsAfterFill(sinNoBlank)).toBe(false)
  })

  it('R22: el archivo no abre ni confirma transacciones propias', () => {
    expect(opensNoTransactionOfItsOwn(upSource)).toBe(true)
    expect(opensNoTransactionOfItsOwn(downSource)).toBe(true)

    const conCommit = upSource.replace(
      'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;',
      'ALTER TABLE "product_batches" ADD COLUMN "purchase_date" DATE;\nCOMMIT;',
    )
    expect(conCommit).not.toBe(upSource)
    expect(opensNoTransactionOfItsOwn(conCommit)).toBe(false)
  })

  it('R26: sin borrado, sin marcas de tiempo, sin otras tablas e identificadores en ingles', () => {
    expect(staysInScopeAndInEnglish(upSource)).toBe(true)

    const enCastellano = upSource.replace(/"product_batches_lot_not_blank"/g, '"product_batches_lote_no_vacio"')
    expect(enCastellano).not.toBe(upSource)
    expect(staysInScopeAndInEnglish(enCastellano)).toBe(false)

    const conBorrado = `${upSource}\nALTER TABLE "product_batches" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);`
    expect(staysInScopeAndInEnglish(conBorrado)).toBe(false)

    const tocaMarcas = upSource.replace(
      `SET "purchase_date" = ("created_at" AT TIME ZONE 'UTC')::date`,
      `SET "purchase_date" = ("created_at" AT TIME ZONE 'UTC')::date, "updated_at" = "updated_at"`,
    )
    expect(tocaMarcas).not.toBe(upSource)
    expect(staysInScopeAndInEnglish(tocaMarcas)).toBe(false)

    const otraTabla = `${upSource}\nALTER TABLE "products" ADD COLUMN "lot" TEXT;`
    expect(staysInScopeAndInEnglish(otraTabla)).toBe(false)
  })
})

describe('QC-81 down.sql — revierte lo anadido y no vacia ningun lote', () => {
  it('R17: el down quita indice, CHECK, NOT NULL de lot y purchase_date, en orden inverso', () => {
    expect(downRevertsEveryAddition(downSource)).toBe(true)
    expect(wrapsInRlsParenthesis(downSource)).toBe(true)

    const sinSoltarLot = downSource.replace(
      'ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL;',
      '',
    )
    expect(sinSoltarLot, 'la mutacion no quito el DROP NOT NULL').not.toBe(downSource)
    expect(downRevertsEveryAddition(sinSoltarLot)).toBe(false)

    const sinIndice = downSource.replace('DROP INDEX "product_batches_company_lot_unique";', '')
    expect(sinIndice).not.toBe(downSource)
    expect(downRevertsEveryAddition(sinIndice)).toBe(false)

    const columnaAntes = downSource
      .replace('ALTER TABLE "product_batches" DROP COLUMN "purchase_date";', '')
      .replace(
        'DROP INDEX "product_batches_company_lot_unique";',
        'ALTER TABLE "product_batches" DROP COLUMN "purchase_date";\nDROP INDEX "product_batches_company_lot_unique";',
      )
    expect(columnaAntes).not.toBe(downSource)
    expect(downRevertsEveryAddition(columnaAntes)).toBe(false)

    const sinCerrar = downSource.replace(/ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;\s*$/, '')
    expect(sinCerrar).not.toBe(downSource)
    expect(wrapsInRlsParenthesis(sinCerrar)).toBe(false)
  })

  it('R23: el down no contiene ningun UPDATE que vacie lot, y su cabecera dice lo que pierde', () => {
    expect(downNeverEmptiesLot(downSource)).toBe(true)
    expect(downHeaderStatesItsLimits(downSource)).toBe(true)

    const vaciaLotes = downSource.replace(
      'ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL;',
      () =>
        'ALTER TABLE "product_batches" ALTER COLUMN "lot" DROP NOT NULL;\nUPDATE "product_batches" SET "lot" = NULL WHERE "lot" ~ \'^[0-9]+$\';',
    )
    expect(vaciaLotes, 'la mutacion no anadio el UPDATE').not.toBe(downSource)
    expect(downNeverEmptiesLot(vaciaLotes)).toBe(false)

    const tiraColumna = `${downSource}\nALTER TABLE "product_batches" DROP COLUMN "lot";`
    expect(downNeverEmptiesLot(tiraColumna)).toBe(false)

    const sinCabecera = downSource.replace(/NO VACIA NINGUN `lot`/, 'no toca lot')
    expect(sinCabecera).not.toBe(downSource)
    expect(downHeaderStatesItsLimits(sinCabecera)).toBe(false)
  })
})
