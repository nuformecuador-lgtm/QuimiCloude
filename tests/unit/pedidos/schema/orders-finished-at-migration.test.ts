// Contrato ESTATICO del SQL de `orders_finished_at`.
//
// La migracion es deliberadamente minima -`ADD COLUMN`, un `CHECK` y un indice parcial, sin
// backfill ni `UPDATE`-, y eso es justo lo que este archivo vigila: que la columna nazca
// anulable, sin `DEFAULT`, que el `CHECK` exija `ENTREGADO`, que el indice sea el parcial de
// `finished_at DESC NULLS LAST, order_year DESC, order_sequence DESC`, y que el `down.sql`
// exista y revierta exactamente los tres objetos que el `migration.sql` declara. Ademas, que
// el SQL entero no nombre `order_assignments`: esta migracion no toca esa tabla.
//
// PATRON: predicados puros sobre el texto SQL, aplicados dos veces -al archivo real (pasa) y a
// una version mutada en memoria (falla)-. El archivo en disco no se toca nunca. Mismo patron
// que `orders-presentation-migration.test.ts`.

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

/** El timestamp (prefijo) de la migracion localizada por sufijo. */
function timestampOf(suffix: string): string {
  const dirName = findMigrationDir(suffix).split(/[\\/]/).pop() ?? ''
  const ts = dirName.split('_')[0]
  if (ts === undefined || ts.length === 0) {
    throw new Error(`no se pudo extraer el timestamp de "${dirName}"`)
  }
  return ts
}

const migrationDir = findMigrationDir('_orders_finished_at')
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
function addsNullableTimestampColumn(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^ALTER TABLE "orders" ADD COLUMN "finished_at" TIMESTAMPTZ\(6\)$/i.test(statement),
  )
}

/** ¿No hay ni un `UPDATE` en el UP? Sin relleno: los pedidos existentes quedan en NULL. */
function fillsNothing(sql: string): boolean {
  return !/\bUPDATE\s+"?orders"?\b/i.test(stripSqlComments(sql))
}

/** ¿El CHECK exige que solo pueda tener fecha un pedido ENTREGADO? */
function addsDeliveredCheck(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^ALTER TABLE "orders" ADD CONSTRAINT "orders_finished_at_requires_delivered" CHECK \("finished_at" IS NULL OR "status" = 'ENTREGADO'\)$/i.test(
      statement,
    ),
  )
}

/** ¿El indice parcial ordena por fecha DESC NULLS LAST, ano DESC, secuencia DESC, solo
 *  sobre los vivos y entregados? */
function createsPartialFinishedIndex(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^CREATE INDEX "orders_company_finished_idx" ON "orders" \("company_id", "finished_at" DESC NULLS LAST, "order_year" DESC, "order_sequence" DESC\) WHERE "deleted_at" IS NULL AND "status" = 'ENTREGADO'$/i.test(
      statement,
    ),
  )
}

/** ¿El UP es EXACTAMENTE tres sentencias: columna, CHECK, indice, en ese orden? */
function isThreeStatementsInOrder(sql: string): boolean {
  const parsed = statements(sql)
  if (parsed.length !== 3) return false
  return (
    addsNullableTimestampColumn(parsed[0] as string) &&
    addsDeliveredCheck(parsed[1] as string) &&
    createsPartialFinishedIndex(parsed[2] as string)
  )
}

/** ¿El DOWN quita, en orden inverso, exactamente el indice, el CHECK y la columna que el UP
 *  anadio? */
function dropsExactlyTheThreeObjectsInReverseOrder(sql: string): boolean {
  const source = statements(sql)
  if (source.length !== 3) return false
  return (
    /^DROP INDEX "orders_company_finished_idx"$/i.test(source[0] as string) &&
    /^ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered"$/i.test(
      source[1] as string,
    ) &&
    /^ALTER TABLE "orders" DROP COLUMN "finished_at"$/i.test(source[2] as string)
  )
}

describe('el nombre de la migracion es posterior a la que necesita para aplicar', () => {
  it('R2: <ts>_orders_finished_at es estrictamente mayor que recipe_lines_percentage', () => {
    const ts = migrationDirName.split('_')[0] ?? ''
    expect(ts.length).toBeGreaterThan(0)

    const recipeLinesPercentage = timestampOf('_recipe_lines_percentage')
    expect(
      ts > recipeLinesPercentage,
      `${ts} debe ser mayor que ${recipeLinesPercentage}`,
    ).toBe(true)
  })
})

describe('migration.sql de orders_finished_at — la columna nace opcional, con CHECK y su indice parcial (R1, R2, R4, R20)', () => {
  it('anade la columna anulable sin rellenar ninguna fila', () => {
    expect(addsNullableTimestampColumn(upSource)).toBe(true)
    expect(fillsNothing(upSource)).toBe(true)

    // Sensibilidad 1: `NOT NULL` volveria obligatoria la fecha de los pedidos ya existentes, que
    // no tienen con que rellenarse.
    const obligatoria = upSource.replace(
      'ADD COLUMN "finished_at" TIMESTAMPTZ(6);',
      'ADD COLUMN "finished_at" TIMESTAMPTZ(6) NOT NULL;',
    )
    expect(obligatoria, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsNullableTimestampColumn(obligatoria)).toBe(false)

    // Sensibilidad 2: un `UPDATE` de relleno dejaria pedidos entregados antes de la migracion con
    // una fecha que nunca se midio.
    const conRelleno = `${upSource}\nUPDATE "orders" SET "finished_at" = now() WHERE "status" = 'ENTREGADO';`
    expect(conRelleno).not.toBe(upSource)
    expect(fillsNothing(conRelleno)).toBe(false)
  })

  it('el CHECK exige ENTREGADO para poder tener fecha de terminado (R4)', () => {
    expect(addsDeliveredCheck(upSource)).toBe(true)

    // Sensibilidad 1: sin el `IS NULL OR`, ningun pedido podria quedar sin fecha.
    const sinNulo = upSource.replace('"finished_at" IS NULL OR ', '')
    expect(sinNulo, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsDeliveredCheck(sinNulo)).toBe(false)

    // Sensibilidad 2: otro estado dejaria escribir la fecha en un pedido que no es ENTREGADO.
    const otroEstado = upSource.replace("'ENTREGADO'", "'EN_CURSO'")
    expect(otroEstado, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsDeliveredCheck(otroEstado)).toBe(false)
  })

  it('crea el indice parcial de "Terminados": fecha DESC NULLS LAST, ano y secuencia DESC (R20, D14)', () => {
    expect(createsPartialFinishedIndex(upSource)).toBe(true)

    // Sensibilidad 1: sin `NULLS LAST` explicito, Postgres pondria los nulos PRIMERO en
    // descendente, justo lo contrario del orden esperado.
    const sinNullsLast = upSource.replace('"finished_at" DESC NULLS LAST', '"finished_at" DESC')
    expect(sinNullsLast, 'la mutacion no se aplico').not.toBe(upSource)
    expect(createsPartialFinishedIndex(sinNullsLast)).toBe(false)

    // Sensibilidad 2: el numero de pedido ASCENDENTE para los "sin fecha" seria el orden
    // contrario al que se busca.
    const secuenciaAscendente = upSource.replace(
      '"order_sequence" DESC',
      '"order_sequence" ASC',
    )
    expect(secuenciaAscendente, 'la mutacion no se aplico').not.toBe(upSource)
    expect(createsPartialFinishedIndex(secuenciaAscendente)).toBe(false)

    // Sensibilidad 3: sin el filtro `WHERE`, el indice cubriria pedidos borrados o no
    // entregados, mas ancho que lo que "Terminados" necesita.
    const sinFiltro = upSource.replace(
      ' WHERE "deleted_at" IS NULL AND "status" = \'ENTREGADO\'',
      '',
    )
    expect(sinFiltro, 'la mutacion no se aplico').not.toBe(upSource)
    expect(createsPartialFinishedIndex(sinFiltro)).toBe(false)
  })

  it('el UP es exactamente tres sentencias, en orden: columna, CHECK e indice', () => {
    expect(isThreeStatementsInOrder(upSource)).toBe(true)
  })

  it('el SQL entero no nombra order_assignments: la migracion no toca esa tabla (R37)', () => {
    expect(upSource).not.toMatch(/order_assignments/i)
    expect(downSource).not.toMatch(/order_assignments/i)
  })
})

describe('down.sql de orders_finished_at — tiene su down y revierte exactamente, en orden inverso (R2)', () => {
  it('el down.sql existe y revierte el indice, el CHECK y la columna, en orden inverso al UP', () => {
    expect(downSource.trim().length).toBeGreaterThan(0)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(downSource)).toBe(true)

    // Sensibilidad 1: dropear otra columna no revierte esta migracion.
    const columnaEquivocada = downSource.replace('"finished_at"', '"presentation_id"')
    expect(columnaEquivocada, 'la mutacion no se aplico').not.toBe(downSource)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(columnaEquivocada)).toBe(false)

    // Sensibilidad 2: el orden importa -Postgres se niega a dropear la columna mientras el CHECK
    // siga vivo-, asi que invertirlo tiene que dejar de pasar el predicado.
    const ordenInvertido = [
      'ALTER TABLE "orders" DROP COLUMN "finished_at";',
      'ALTER TABLE "orders" DROP CONSTRAINT "orders_finished_at_requires_delivered";',
      'DROP INDEX "orders_company_finished_idx";',
    ].join('\n')
    expect(dropsExactlyTheThreeObjectsInReverseOrder(ordenInvertido)).toBe(false)

    // Sensibilidad 3: un DOWN que ademas toca otra cosa deja de ser el reverso EXACTO del UP.
    const conExtra = `${downSource}\nALTER TABLE "orders" DROP COLUMN "priority";`
    expect(conExtra).not.toBe(downSource)
    expect(dropsExactlyTheThreeObjectsInReverseOrder(conExtra)).toBe(false)
  })
})
