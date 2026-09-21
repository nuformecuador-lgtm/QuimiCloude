// Contrato ESTATICO del SQL de `orders_add_ingredients_cost`.
//
// La migracion es deliberadamente minima -un `ALTER TABLE ... ADD COLUMN` sin `UPDATE`-, y eso
// es justo lo que este archivo vigila: que no gane un backfill, que la columna nazca anulable, y
// que el `down.sql` exista y revierta exactamente lo que el `migration.sql` declara.
//
// PATRON: predicados puros sobre el texto SQL, aplicados dos veces -al archivo real (pasa) y a
// una version mutada en memoria (falla)-. El archivo en disco no se toca nunca.

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

const migrationDir = findMigrationDir('_orders_add_ingredients_cost')

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

/** ¿El UP nace anulable y en `Decimal(14,4)`, sin `NOT NULL` ni `DEFAULT`? */
function addsNullableDecimalColumn(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^ALTER TABLE "orders" ADD COLUMN "ingredients_cost" DECIMAL\(14,\s*4\)$/i.test(statement),
  )
}

/** ¿No hay ni un `UPDATE` en el UP? Sin relleno: los pedidos existentes quedan en NULL. */
function fillsNothing(sql: string): boolean {
  return !/\bUPDATE\s+"?orders"?\b/i.test(stripSqlComments(sql))
}

/** ¿El UP es EXACTAMENTE una sentencia? */
function isSingleStatement(sql: string): boolean {
  return statements(sql).length === 1
}

/** ¿El DOWN quita exactamente la columna que el UP anadio? */
function dropsExactlyTheColumn(sql: string): boolean {
  const source = statements(sql)
  return (
    source.length === 1 &&
    /^ALTER TABLE "orders" DROP COLUMN "ingredients_cost"$/i.test(source[0] as string)
  )
}

describe('migration.sql de orders_add_ingredients_cost — la columna nace opcional y la migracion no rellena ninguna fila (R13)', () => {
  it('la columna nace opcional y la migracion no rellena ninguna fila (R13)', () => {
    expect(addsNullableDecimalColumn(upSource)).toBe(true)
    expect(fillsNothing(upSource)).toBe(true)
    expect(isSingleStatement(upSource)).toBe(true)

    // Sensibilidad 1: `NOT NULL` volveria obligatorio el importe de los pedidos ya existentes,
    // que no tienen con que rellenarse.
    const obligatoria = upSource.replace(
      'ADD COLUMN "ingredients_cost" DECIMAL(14,4);',
      'ADD COLUMN "ingredients_cost" DECIMAL(14,4) NOT NULL;',
    )
    expect(obligatoria, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsNullableDecimalColumn(obligatoria)).toBe(false)

    // Sensibilidad 2: un `UPDATE` de relleno -aunque sea a NULL o a 0- es exactamente lo que R13
    // prohibe: un pedido viejo no tiene lotes que costear en el instante en que se escribio.
    const conRelleno = `${upSource}\nUPDATE "orders" SET "ingredients_cost" = 0;`
    expect(conRelleno).not.toBe(upSource)
    expect(fillsNothing(conRelleno)).toBe(false)

    // Sensibilidad 3: un `DEFAULT` convertiria «no se pudo calcular» en «vale 0» para toda fila
    // futura que no lo indique explicitamente.
    const conDefault = upSource.replace(
      'ADD COLUMN "ingredients_cost" DECIMAL(14,4);',
      'ADD COLUMN "ingredients_cost" DECIMAL(14,4) DEFAULT 0;',
    )
    expect(conDefault).not.toBe(upSource)
    expect(addsNullableDecimalColumn(conDefault)).toBe(false)
  })
})

describe('down.sql de orders_add_ingredients_cost — tiene su down y revierte exactamente (R20)', () => {
  it('la migracion tiene su down.sql y revierte exactamente (R20)', () => {
    expect(downSource.trim().length).toBeGreaterThan(0)
    expect(dropsExactlyTheColumn(downSource)).toBe(true)

    // Sensibilidad 1: dropear otra columna no revierte esta migracion.
    const columnaEquivocada = downSource.replace('"ingredients_cost"', '"quantity"')
    expect(columnaEquivocada, 'la mutacion no se aplico').not.toBe(downSource)
    expect(dropsExactlyTheColumn(columnaEquivocada)).toBe(false)

    // Sensibilidad 2: un DOWN que ademas toca otra cosa deja de ser el reverso EXACTO del UP.
    const conExtra = `${downSource}\nALTER TABLE "orders" DROP COLUMN "priority";`
    expect(conExtra).not.toBe(downSource)
    expect(dropsExactlyTheColumn(conExtra)).toBe(false)
  })
})
