// Contrato ESTATICO del SQL de `orders_presentation`.
//
// La migracion es deliberadamente minima -`ADD COLUMN`, `CREATE INDEX` y una FK COMPUESTA, sin
// backfill ni `UPDATE`-, y eso es justo lo que este archivo vigila: que la columna nazca
// anulable, sin `DEFAULT`, que la FK sea compuesta con `RESTRICT`, y que el `down.sql` exista y
// revierta exactamente los tres objetos que el `migration.sql` declara.
//
// PATRON: predicados puros sobre el texto SQL, aplicados dos veces -al archivo real (pasa) y a
// una version mutada en memoria (falla)-. El archivo en disco no se toca nunca. Mismo patron
// que `orders-ingredients-cost-migration.test.ts`.

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

/** La carpeta se localiza por SUFIJO: si se renombra, el test cae por lo que vigila. */
function findMigrationDir(suffix: string): string {
  const candidates = readdirSync(migrationsDir, { withFileTypes: true })
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
  return join(migrationsDir, candidates[0] as string)
}

/** Las migraciones ordenan por su prefijo de timestamp: `<ts>_orders_presentation` debe ser
 *  estrictamente mayor que cualquier otra ya existente en el momento de esta lectura. */
function latestTimestampBefore(dirName: string): string {
  const timestamps = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== dirName)
    .map((entry) => entry.name.split('_')[0])
    .filter((ts): ts is string => ts !== undefined)
    .sort()
  return timestamps[timestamps.length - 1] ?? ''
}

const migrationDir = findMigrationDir('_orders_presentation')
const migrationDirName = migrationDir.split(/[\\/]/).pop() ?? ''

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados. */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

/** ¿El UP anade la columna anulable, sin `NOT NULL` ni `DEFAULT`? */
function addsNullableUuidColumn(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^ALTER TABLE "orders" ADD COLUMN "presentation_id" UUID$/i.test(statement),
  )
}

/** ¿No hay ni un `UPDATE` en el UP? Sin relleno: los pedidos existentes quedan en NULL (R2). */
function fillsNothing(sql: string): boolean {
  return !/\bUPDATE\s+"?orders"?\b/i.test(stripSqlComments(sql))
}

/** ¿Nace el indice del lado hijo de la FK, sobre la columna nueva? */
function createsIndex(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^CREATE INDEX "orders_presentation_id_idx" ON "orders" \("presentation_id"\)$/i.test(
      statement,
    ),
  )
}

/** ¿La FK es COMPUESTA `(company_id, presentation_id)` contra `presentations(company_id, id)`,
 *  con `ON DELETE RESTRICT ON UPDATE CASCADE`? */
function addsCompositeRestrictFk(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_presentation_id_fkey" FOREIGN KEY \("company_id", "presentation_id"\) REFERENCES "presentations" \("company_id", "id"\) ON DELETE RESTRICT ON UPDATE CASCADE$/i.test(
      statement,
    ),
  )
}

/** ¿El UP es EXACTAMENTE tres sentencias: columna, indice, FK, en ese orden? */
function isThreeStatementsInOrder(sql: string): boolean {
  const parsed = statements(sql)
  if (parsed.length !== 3) return false
  return (
    addsNullableUuidColumn(parsed[0] as string) &&
    createsIndex(parsed[1] as string) &&
    addsCompositeRestrictFk(parsed[2] as string)
  )
}

/** ¿El DOWN quita, en orden inverso, exactamente la FK, el indice y la columna que el UP anadio? */
function dropsExactlyTheThreeObjectsInReverseOrder(sql: string): boolean {
  const source = statements(sql)
  if (source.length !== 3) return false
  return (
    /^ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_presentation_id_fkey"$/i.test(
      source[0] as string,
    ) &&
    /^DROP INDEX "orders_presentation_id_idx"$/i.test(source[1] as string) &&
    /^ALTER TABLE "orders" DROP COLUMN "presentation_id"$/i.test(source[2] as string)
  )
}

describe('el nombre de la migracion es posterior a todas las demas', () => {
  it('R2: <ts>_orders_presentation es estrictamente mayor que el ultimo timestamp existente', () => {
    const ts = migrationDirName.split('_')[0] ?? ''
    const previous = latestTimestampBefore(migrationDirName)
    expect(ts.length).toBeGreaterThan(0)
    expect(ts > previous, `${ts} debe ser mayor que ${previous}`).toBe(true)
  })
})

describe('migration.sql de orders_presentation — la columna nace opcional, indexada y con FK compuesta (R2, R3, R4)', () => {
  it('anade la columna anulable sin rellenar ninguna fila', () => {
    expect(addsNullableUuidColumn(upSource)).toBe(true)
    expect(fillsNothing(upSource)).toBe(true)

    // Sensibilidad 1: `NOT NULL` volveria obligatoria la presentacion de los pedidos ya
    // existentes, que no tienen con que rellenarse.
    const obligatoria = upSource.replace(
      'ADD COLUMN "presentation_id" UUID;',
      'ADD COLUMN "presentation_id" UUID NOT NULL;',
    )
    expect(obligatoria, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsNullableUuidColumn(obligatoria)).toBe(false)

    // Sensibilidad 2: un `UPDATE` de relleno dejaria los pedidos viejos con una presentacion
    // que nadie eligio.
    const conRelleno = `${upSource}\nUPDATE "orders" SET "presentation_id" = gen_random_uuid();`
    expect(conRelleno).not.toBe(upSource)
    expect(fillsNothing(conRelleno)).toBe(false)
  })

  it('crea el indice del lado hijo de la FK (R4)', () => {
    expect(createsIndex(upSource)).toBe(true)

    const sinIndice = upSource.replace(
      'CREATE INDEX "orders_presentation_id_idx" ON "orders" ("presentation_id");\n\n',
      '',
    )
    expect(sinIndice, 'la mutacion no se aplico').not.toBe(upSource)
    expect(createsIndex(sinIndice)).toBe(false)
  })

  it('anade la FK COMPUESTA (company_id, presentation_id) con RESTRICT/CASCADE (R3, R4)', () => {
    expect(addsCompositeRestrictFk(upSource)).toBe(true)

    // Sensibilidad 1: una FK SIMPLE (solo presentation_id) dejaria pasar una presentacion de
    // otra empresa: imposible por construccion solo con el par completo.
    const fkSimple = upSource.replace(
      'FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations" ("company_id", "id")',
      'FOREIGN KEY ("presentation_id") REFERENCES "presentations" ("id")',
    )
    expect(fkSimple, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsCompositeRestrictFk(fkSimple)).toBe(false)

    // Sensibilidad 2: `ON DELETE CASCADE` en vez de `RESTRICT` dejaria borrar una presentacion
    // aunque un pedido siguiera apuntando a ella.
    const conCascade = upSource.replace('ON DELETE RESTRICT', 'ON DELETE CASCADE')
    expect(conCascade, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsCompositeRestrictFk(conCascade)).toBe(false)
  })

  it('el UP es exactamente tres sentencias, en orden: columna, indice y FK', () => {
    expect(isThreeStatementsInOrder(upSource)).toBe(true)
  })
})

describe('down.sql de orders_presentation — tiene su down y revierte exactamente, en orden inverso (R2)', () => {
  it('el down.sql existe y revierte la FK, el indice y la columna, en orden inverso al UP', () => {
    expect(downSource.trim().length).toBeGreaterThan(0)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(downSource)).toBe(true)

    // Sensibilidad 1: dropear otra columna no revierte esta migracion.
    const columnaEquivocada = downSource.replace('"presentation_id"', '"quantity"')
    expect(columnaEquivocada, 'la mutacion no se aplico').not.toBe(downSource)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(columnaEquivocada)).toBe(false)

    // Sensibilidad 2: el orden importa -Postgres se niega a dropear la columna mientras la FK
    // siga viva-, asi que invertirlo tiene que dejar de pasar el predicado.
    const ordenInvertido = [
      'ALTER TABLE "orders" DROP COLUMN "presentation_id";',
      'DROP INDEX "orders_presentation_id_idx";',
      'ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_presentation_id_fkey";',
    ].join('\n')
    expect(dropsExactlyTheThreeObjectsInReverseOrder(ordenInvertido)).toBe(false)

    // Sensibilidad 3: un DOWN que ademas toca otra cosa deja de ser el reverso EXACTO del UP.
    const conExtra = `${downSource}\nALTER TABLE "orders" DROP COLUMN "priority";`
    expect(conExtra).not.toBe(downSource)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(conExtra)).toBe(false)
  })
})
