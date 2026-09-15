// T3 (QC-81, lote-y-fecha-de-compra) — Contrato ESTATICO del SQL de
// `20260913120000_product_batch_lot_and_purchase_date`.
//
// POR QUE EXISTE: la migracion esta ESCRITA ENTERA A MANO (`design.md > 2`) y lo que la hace
// correcta es el ORDEN y unas pocas lineas que Prisma no modela ni regenera: el parentesis de RLS,
// la guardia de duplicados, los dos rellenos antes de los `SET NOT NULL`, los dos CHECK y el indice
// unico despues del relleno, y un `down.sql` que no vacia ningun lote. Una edicion futura puede
// perder cualquiera de esas cosas en silencio y ningun tipo generado se enteraria.
//
// PATRON, el de `inventory-company-scope-migration.test.ts` (QC-49): cada afirmacion es un
// PREDICADO PURO EXPORTADO que recibe el texto SQL, y se aplica DOS VECES --al SQL real y a una
// version MUTADA EN MEMORIA--. El archivo en disco no se toca nunca, y cada mutacion comprueba con
// `not.toBe(...)` que muto de verdad: un test que no puede fallar no vigila nada.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que el relleno numere bien ni que las restricciones MUERDAN en la
// base. Eso es integracion contra base real (T8, `tests/integration/inventario/product-batch-lot.int.test.ts`).
// Aqui se prueba que estan ESCRITAS y en su sitio.
//
// Cubre R17, R22, R23 y R26 (y la mitad escrita de R19 y R21).

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

/** Se localiza por PATRON, no por el timestamp: renombrar la marca de tiempo no debe romperlo. */
const lotDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_product_batch_lot_and_purchase_date'),
)
const migrationDir = join(migrationsDir, lotDirs[0] ?? '__no_existe__')

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** El SQL ejecutable en una sola linea, con los espacios normalizados, para medir POSICIONES. */
export function executable(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ')
}

/**
 * Sentencias ejecutables normalizadas. Parte por `;`, igual que los precedentes: los bloques
 * `DO $$ ... $$` salen partidos, pero ningun trozo suyo empieza por `ALTER`, `CREATE` ni `DROP`,
 * asi que no ensucian las afirmaciones ancladas con `^`. Lo que se afirma SOBRE UN BLOQUE se mide
 * contra el texto completo.
 */
export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

/** Los bloques `DO $$ ... $$` del texto, en orden. */
export function doBlocks(sql: string): readonly string[] {
  return executable(sql).match(/DO \$\$[\s\S]*?\$\$/g) ?? []
}

const NO_FORCE = /^ALTER TABLE "product_batches" NO FORCE ROW LEVEL SECURITY$/
const ENABLE = /^ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY$/
const FORCE = /^ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY$/

// --- Predicados del UP ----------------------------------------------------------------------

/**
 * R22 (y la mina de QC-49). ¿El parentesis de RLS se ABRE en la primera sentencia y se CIERRA
 * --`ENABLE` y luego `FORCE`-- en las dos ultimas?
 *
 * Bajo `FORCE` y sin ninguna policy, Postgres deniega al dueno de la tabla tambien el `SELECT`: la
 * guardia leeria cero duplicados y los `UPDATE` tocarian cero filas. Abrirlo tarde deja lecturas
 * fuera; cerrarlo pronto, o no cerrarlo, deja la tabla menos protegida que antes de migrar.
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
 * R21. ¿La guardia de duplicados es un bloque `DO $$` que va ANTES de cualquier cambio de esquema,
 * agrupa por `(company_id, lot)` excluyendo los lotes en blanco, y aborta con un mensaje que dice
 * CUANTOS son y QUE HACER?
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
 * R1, R26. ¿`purchase_date` nace como `DATE` ANULABLE y SIN `DEFAULT`, y ninguna sentencia usa la
 * fecha del reloj?
 *
 * Un `DEFAULT CURRENT_DATE` afirmaria para todas las filas viejas una fecha de compra falsa (D8), y
 * un `TIMESTAMPTZ` o un `TEXT` no es la fecha civil que R26 exige.
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
 * R19. ¿La fecha de compra se rellena con la fecha civil EN UTC de `created_at` de cada fila?
 *
 * Sin el `AT TIME ZONE 'UTC'` explicito, la conversion usaria la zona de la sesion y la misma base
 * migrada en dos maquinas daria dos dias distintos para la misma fila.
 */
export function fillsPurchaseDateFromCreatedAtInUtc(sql: string): boolean {
  return /UPDATE "product_batches" SET "purchase_date" = \("created_at" AT TIME ZONE 'UTC'\)::date;/i.test(
    executable(sql),
  )
}

/**
 * R18. ¿El relleno de lote toma SOLO las filas en blanco, las numera por empresa y por orden de
 * creacion con el `id` de desempate, y continua desde el maximo numerico acotado a `bigint`?
 */
export function fillsLotBySeriesPerCompany(sql: string): boolean {
  const text = executable(sql)
  return (
    /max\(\("lot"\)::bigint\)/i.test(text) &&
    text.includes(`WHERE "lot" ~ '^[0-9]{1,18}$'`) &&
    /row_number\(\) OVER \(PARTITION BY "company_id" ORDER BY "created_at", "id"\)/i.test(text) &&
    /WHERE "lot" IS NULL OR btrim\("lot"\) = ''/i.test(text) &&
    /SET "lot" = \(COALESCE\(base\.top, 0\) \+ pendientes\.rn\)::text/i.test(text)
  )
}

/**
 * R22. ¿Cada relleno comprueba su `ROW_COUNT` y aborta si no cuadra?
 *
 * El de la fecha contra el TOTAL de la tabla (escribe todas las filas, literal QC-49); el del lote
 * contra las filas SIN LOTE contadas justo antes (las que ya tienen lote lo conservan, R18).
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

/** Posicion del primer match en el SQL ejecutable, o -1. */
function positionOf(sql: string, pattern: RegExp): number {
  return executable(sql).search(pattern)
}

/**
 * R22. ¿Los DOS rellenos van ANTES de sus `SET NOT NULL`, y la columna nueva antes que su relleno?
 */
export function fillsBeforeNotNull(sql: string): boolean {
  const addColumn = positionOf(sql, /ADD COLUMN "purchase_date"/)
  const fillDate = positionOf(sql, /SET "purchase_date" =/)
  const fillLot = positionOf(sql, /SET "lot" =/)
  const dateNotNull = positionOf(sql, /ALTER COLUMN "purchase_date" SET NOT NULL/)
  const lotNotNull = positionOf(sql, /ALTER COLUMN "lot" SET NOT NULL/)
  if ([addColumn, fillDate, fillLot, dateNotNull, lotNotNull].includes(-1)) return false
  return addColumn < fillDate && fillDate < dateNotNull && fillLot < lotNotNull
}

/**
 * R7, R11, R22. ¿Los dos CHECK y el indice unico existen con su forma exacta, el indice NO es
 * parcial ni funcional, y los tres van DESPUES de los dos rellenos y de los `SET NOT NULL`?
 */
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
 * R22. ¿El archivo NO abre ni cierra transacciones propias?
 *
 * Prisma lo ejecuta dentro de UNA transaccion; un `COMMIT` a mitad dejaria confirmada la columna
 * nueva aunque un `RAISE EXCEPTION` posterior abortara, que es justo la «columna a medias» que R21
 * y R22 prohiben.
 */
export function opensNoTransactionOfItsOwn(sql: string): boolean {
  const text = executable(sql)
  const ownTransaction = statements(sql).some((statement) =>
    /^(BEGIN|START TRANSACTION|COMMIT|ROLLBACK|END)$/i.test(statement),
  )
  return !ownTransaction && !/\b(COMMIT|ROLLBACK)\b/i.test(text)
}

/**
 * R26. ¿Nada de borrado, ni de marcas de tiempo, ni de otras tablas, e identificadores nuevos en
 * ingles y `snake_case`?
 */
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

/**
 * R17. ¿El DOWN quita CADA cosa que anadio el UP --indice, dos CHECK, `NOT NULL` de `lot` y la
 * columna `purchase_date`-- y lo que cuelga de `lot` cae ANTES de soltar su `NOT NULL`?
 */
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
 * R23. ¿El DOWN NO vacia ningun lote, ni quita la columna `lot`, ni borra filas?
 *
 * Los lotes que escribio el relleno y los que escribio una persona no se pueden distinguir: vaciar
 * cualquiera tiraria dato ajeno. Por eso el DOWN no tiene NINGUN `UPDATE`.
 */
export function downNeverEmptiesLot(sql: string): boolean {
  const text = executable(sql)
  return (
    !/\bUPDATE\b/i.test(text) &&
    !/\b(DELETE\s+FROM|TRUNCATE)\b/i.test(text) &&
    !/DROP COLUMN (?:IF EXISTS )?"lot"/i.test(text)
  )
}

/** R23. ¿La cabecera del DOWN dice lo que NO hace y lo que SI pierde? */
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

    // Abrirlo TARDE --despues de la guardia-- deja la guardia leyendo bajo FORCE.
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

    // Guardia DESPUES de anadir la columna: ya habria esquema a medias cuando aborta... salvo por
    // la transaccion, pero el orden de design.md > 2.1 es parte del contrato.
    // Reemplazo en FUNCION: el bloque lleva `$$`, que como cadena de reemplazo se colapsa a `$`.
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

    // Agrupando GLOBAL y no por empresa, dos empresas con el mismo lote abortarian (contra R12).
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

    // `replaceAll`: el literal aparece antes en un COMENTARIO del archivo, y un `replace` simple
    // mutaria la prosa y dejaria el SQL intacto. Y el reemplazo va en FUNCION: como cadena, el `$'`
    // de `'^[0-9]+$'` es un patron especial de `replace` que reinserta el resto del texto --con el
    // literal original dentro-- y la mutacion no mutaria nada.
    const sinCota = upSource.replaceAll(`'^[0-9]{1,18}$'`, () => `'^[0-9]+$'`)
    expect(sinCota).not.toBe(upSource)
    expect(fillsLotBySeriesPerCompany(sinCota)).toBe(false)

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

    // Unicidad GLOBAL de lote en vez de por empresa: rompe R12.
    const soloLote = upSource.replace('ON "product_batches" ("company_id", "lot")', 'ON "product_batches" ("lot")')
    expect(soloLote).not.toBe(upSource)
    expect(constraintsAfterFill(soloLote)).toBe(false)

    // Sin el CHECK de lote en blanco, R7 se esquiva con ''.
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
