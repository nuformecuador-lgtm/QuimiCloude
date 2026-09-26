// Contrato estatico del SQL de las dos migraciones que anaden `BLOQUEADO` a `OrderStatus`.
//
// Prisma Migrate no genera `down.sql` y el `ADD VALUE` de un enum no produce ningun artefacto
// regenerable: lo que si se puede volver a leer del disco es el SQL. Este archivo es la unica
// guardia de las dos migraciones, y mira tres cosas:
//
// 1. El `up` de la migracion 1 es UN SOLO `ADD VALUE`, al final, y no toca ninguna columna, ni
//   ningun CHECK, ni ningun indice. El valor nuevo no aparece en ninguna de esas piezas porque
//    ninguna lo nombra: los cuatro CHECK miran `CANCELADO` o `ENTREGADO`.
// 2. El `down` de la migracion 1 es una reversion EXACTA: primero la guardia de datos que aborta
//    si hay pedidos en `BLOQUEADO`, despues caen los CHECK y los indices que nombran `status`,
//    se recrea el tipo sin el valor, y por ultimo se vuelven a crear esos CHECK e indices con el
//    texto LITERAL de la migracion que los declaro. El tipo recreado se compara contra el
//    `enum` de `db/schema.prisma` sin el valor nuevo, para que la lista no sea una copia a mano.
// 3. El indice parcial va en OTRA migracion y con su predicado entero, porque un valor recien
//    anadido a un enum no se puede usar como valor del enum en la misma transaccion que lo anade.
//
// Cubre R35 y R36, y el apoyo de R16 y R18 que es el indice de la revision.

import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
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
const migrationsRoot = join(repoRoot, 'db', 'migrations')

function findMigrationDir(suffix: string): string {
  const pattern = new RegExp(`^\\d{14}${suffix}$`)
  const candidates = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(candidates.length)}`,
    )
  }
  return join(migrationsRoot, candidates[0] as string)
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Como el troceador de los otros archivos de `schema/`: ignora `;` dentro de un bloque `$$`,
 *  que aqui usa la guardia de datos del DOWN. */
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

function statements(sql: string): readonly string[] {
  return splitTopLevelStatements(stripSqlComments(sql))
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
}

const enumDir = findMigrationDir('_order_status_blocked')
const indexDir = findMigrationDir('_orders_blocked_index')
const enumUp = statements(readFileSync(join(enumDir, 'migration.sql'), 'utf8'))
const enumDown = statements(readFileSync(join(enumDir, 'down.sql'), 'utf8'))
const indexUp = statements(readFileSync(join(indexDir, 'migration.sql'), 'utf8'))
const indexDown = statements(readFileSync(join(indexDir, 'down.sql'), 'utf8'))

/** El texto EXACTO -normalizado de espacios- de una sentencia de OTRA migracion, la que la
 *  declaro por primera vez o la que la dejo en su texto vigente. Comparar contra la FUENTE y no
 *  contra una copia a mano es lo que hace que "recrea la definicion literal" sea verificable. */
function literalFrom(migrationSuffix: string, file: 'migration.sql' | 'down.sql', pattern: RegExp): string {
  const source = statements(readFileSync(join(findMigrationDir(migrationSuffix), file), 'utf8'))
  return findStatement(source, pattern)
}

/** El `enum OrderStatus` que declara el esquema, valor a valor y en orden. */
function valoresDelEsquema(): readonly string[] {
  const esquema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
  const bloque = /enum\s+OrderStatus\s*\{([^}]*)\}/.exec(esquema)
  if (bloque === null) throw new Error('db/schema.prisma no declara enum OrderStatus')
  return (bloque[1] as string)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('///'))
}

describe('migration.sql del enum — un solo ADD VALUE, y al final', () => {
  it('R35: anade BLOQUEADO, y es la UNICA sentencia de la migracion', () => {
    // Una sola sentencia por una razon concreta: Postgres no deja insertar el valor recien anadido
    // dentro de la transaccion que lo anade (55P04, `unsafe use of new value`), asi que la
    // migracion no puede hacer nada mas en esa misma transaccion.
    expect(enumUp).toEqual([`ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'BLOQUEADO'`])
  })

  it('R35: BLOQUEADO es el ULTIMO valor del esquema, y el unico que sigue al de empaque', () => {
    const valores = valoresDelEsquema()
    expect(valores.at(-1)).toBe('BLOQUEADO')
    expect(valores.indexOf('BLOQUEADO')).toBe(valores.length - 1)
    // El valor anterior no se reordena: `ADD VALUE` solo sabe anadir al final.
    expect(valores.indexOf('EN_EMPAQUE')).toBe(valores.length - 2)
  })

  it('R35: el ADD VALUE no repite valor ni reordena los que ya estaban', () => {
    const sentencia = enumUp[0] as string
    expect(sentencia).toMatch(/ADD VALUE IF NOT EXISTS 'BLOQUEADO'$/)
    // Un `BEFORE`/`AFTER` seria un REORDEN, que es justo lo que esta migracion no puede hacer.
    expect(sentencia).not.toMatch(/\bBEFORE\b|\bAFTER\b/i)
    // Y el `IF NOT EXISTS` tiene que seguir ahi: es lo que hace el archivo idempotente.
    expect(sentencia).toMatch(/IF NOT EXISTS/i)
  })

  it('R35: la migracion no anade columna, ni CHECK, ni indice', () => {
    // Ninguno de los cuatro CHECK nombra el valor nuevo, asi que ninguno cambia: `ADD VALUE` y
    // nada mas. Si alguno apareciera aqui, seria una pieza que el `down` tendria que revertir
    // tambien, y no lo hace.
    const sinSql = enumUp.join('\n')
    for (const pieza of [
      /ADD\s+COLUMN/i,
      /ADD\s+CONSTRAINT/i,
      /CREATE\s+(UNIQUE\s+)?INDEX/i,
      /DROP\s+CONSTRAINT/i,
      /CREATE\s+TYPE/i,
      /ALTER\s+TABLE/i,
    ]) {
      expect(sinSql, `la migracion no deberia traer ${String(pieza)}`).not.toMatch(pieza)
    }
  })
})

describe('down.sql del enum — guardia de datos, y reversion exacta', () => {
  it('R36: la primera sentencia aborta si hay pedidos en BLOQUEADO, y no toca nada antes', () => {
    const guardia = enumDown[0] as string
    expect(guardia).toMatch(/^DO \$\$/i)
    expect(guardia).toMatch(/RAISE EXCEPTION/i)
    expect(guardia).toMatch(/RAISE EXCEPTION 'ROLLBACK ABORTADO/)
    expect(guardia).toMatch(/"status"::text = 'BLOQUEADO'/)
    // `RAISE EXCEPTION` sin ninguna condicion podria no abortar nunca: se afirma que compara.
    expect(guardia).toMatch(/IF\s+bloqueados\s*>\s*0\s+THEN/i)
    // Es la PRIMERA: nada se toca antes de comprobar que la reversion es posible.
    expect(enumDown[0]).toBe(guardia)
  })

  it('R36: la reversion no inventa a que estado pasaria un pedido bloqueado', () => {
    // Convertirlos a PENDIENTE en un script seria decidir un hecho de negocio desde un archivo de
    // esquema. La unica salida es negarse a revertir.
    const guardia = enumDown[0] as string
    expect(guardia).not.toMatch(/\bUPDATE\b/i)
    expect(enumDown.join('\n')).not.toMatch(/\bUPDATE\s+"?orders"?/i)
  })

  it('R36: dropea los CHECK y los indices que nombran "status" ANTES del ALTER COLUMN TYPE', () => {
    const cambioDeTipo = enumDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    expect(cambioDeTipo).toBeGreaterThan(-1)

    for (const nombre of [
      'orders_packed_by_matches_status',
      'orders_delivered_not_deleted',
      'orders_cancellation_reason_matches_status',
      'orders_finished_at_requires_delivered',
    ]) {
      const drop = enumDown.findIndex((statement) =>
        new RegExp(`^ALTER TABLE "orders" DROP CONSTRAINT "${nombre}"$`, 'i').test(statement),
      )
      expect(drop, `falta el DROP CONSTRAINT de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(cambioDeTipo)
    }

    for (const nombre of ['orders_status_idx', 'orders_expirable_idx', 'orders_company_finished_idx']) {
      const drop = enumDown.findIndex((statement) =>
        new RegExp(`^DROP INDEX "${nombre}"$`, 'i').test(statement),
      )
      expect(drop, `falta el DROP INDEX de ${nombre}`).toBeGreaterThan(-1)
      expect(drop, `${nombre} debe caer antes del ALTER COLUMN TYPE`).toBeLessThan(cambioDeTipo)
    }
  })

  it('R36: recrea OrderStatus con TODOS los valores de menos el nuevo, sin ningun DROP VALUE', () => {
    // La lista no se copia a mano: sale del `enum` del esquema sin el valor anadido, que es
    // exactamente "los valores que habia antes de esta migracion".
    const esperados = valoresDelEsquema().filter((valor) => valor !== 'BLOQUEADO')
    const esperado = `CREATE TYPE "OrderStatus" AS ENUM (${esperados.map((v) => `'${v}'`).join(', ')})`
    expect(enumDown).toContain(esperado)
    expect(esperados.at(-1)).toBe('EN_EMPAQUE')

    expect(enumDown).toContain('ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old"')
    expect(enumDown).toContain('DROP TYPE "OrderStatus_old"')
    // `ALTER TYPE ... DROP VALUE` no existe en Postgres, en ninguna version.
    expect(enumDown.some((statement) => /DROP VALUE/i.test(statement))).toBe(false)
  })

  it('R36: el DEFAULT se quita antes del recasteo y se vuelve a poner despues', () => {
    // Postgres no sabe recastear un default de un tipo que esta cambiando, asi que el orden es
    // parte del contrato y no un detalle de redaccion.
    const quit = enumDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT$/i.test(statement),
    )
    const cambio = enumDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus"/i.test(statement),
    )
    const puesto = enumDown.findIndex((statement) =>
      /^ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE'$/i.test(statement),
    )
    expect(quit).toBeGreaterThan(-1)
    expect(cambio).toBeGreaterThan(-1)
    expect(puesto).toBeGreaterThan(-1)
    expect(quit).toBeLessThan(cambio)
    expect(puesto).toBeGreaterThan(cambio)
  })

  it('R36: recrea los cuatro CHECK con el texto LITERAL de la migracion que los dejo vigentes', () => {
    // La fuente es la migracion que dejo el texto ACTUAL, no la que lo creo: los CHECK de empaque
    // reescribieron dos de los de cancelacion para anadir sus estados.
    const casos: ReadonlyArray<readonly [string, string, RegExp]> = [
      [
        'orders_cancellation_reason_matches_status',
        '_order_cancellation',
        /ADD CONSTRAINT "orders_cancellation_reason_matches_status"/i,
      ],
      ['orders_finished_at_requires_delivered', '_orders_finished_at', /ADD CONSTRAINT "orders_finished_at_requires_delivered"/i],
      ['orders_delivered_not_deleted', '_order_packing_states', /ADD CONSTRAINT "orders_delivered_not_deleted"/i],
      ['orders_packed_by_matches_status', '_order_packing_states', /ADD CONSTRAINT "orders_packed_by_matches_status"/i],
    ]

    for (const [nombre, fuente, patron] of casos) {
      const original = literalFrom(fuente, 'migration.sql', patron)
      const recreado = findStatement(enumDown, new RegExp(`ADD CONSTRAINT "${nombre}"`, 'i'))
      expect(recreado, nombre).toBe(original)
    }
  })

  it('R36: recrea los tres indices con el texto LITERAL de la migracion que los declaro', () => {
    const statusIdxOriginal = literalFrom('_list_query_indexes', 'migration.sql', /^CREATE INDEX "orders_status_idx"/i)
    expect(findStatement(enumDown, /^CREATE INDEX "orders_status_idx"/i)).toBe(statusIdxOriginal)

    const expirableOriginal = literalFrom(
      '_reservations_and_decimal_stock',
      'migration.sql',
      /^CREATE INDEX "orders_expirable_idx"/i,
    )
    expect(findStatement(enumDown, /^CREATE INDEX "orders_expirable_idx"/i)).toBe(expirableOriginal)

    const finishedOriginal = literalFrom(
      '_orders_finished_at',
      'migration.sql',
      /^CREATE INDEX "orders_company_finished_idx"/i,
    )
    expect(findStatement(enumDown, /^CREATE INDEX "orders_company_finished_idx"/i)).toBe(
      finishedOriginal,
    )
  })

  it('R36: ninguna pieza recreada del DOWN nombra BLOQUEADO', () => {
    // Sensibilidad de la reversion: si un CHECK o un indice recreado siguiera nombrando el
    // valor nuevo, el esquema NO habria vuelto al de antes de esta migracion.
    const recreadas = enumDown.filter((statement) =>
      /^(ALTER TABLE|CREATE (UNIQUE )?INDEX)/i.test(statement),
    )
    expect(recreadas.length).toBeGreaterThan(0)
    for (const statement of recreadas) {
      expect(statement).not.toContain('BLOQUEADO')
    }
  })
})

describe('migration.sql del indice — parcial, con su predicado entero', () => {
  it('apoyo de R16, R18: crea el indice de la revision por empresa, antiguedad e identificador', () => {
    // El orden de la revision es `(created_at, id)`, desempatando por identificador, asi que las
    // columnas del indice son esas, con `company_id` delante para que la revision solo lea los
    // bloqueados de SU empresa.
    expect(indexUp).toEqual([
      `CREATE INDEX "orders_blocked_company_created_idx" ON "orders" ("company_id", "created_at", "id") WHERE "status" = 'BLOQUEADO' AND "deleted_at" IS NULL`,
    ])
  })

  it('el predicado excluye los borrados, no solo filtra por estado', () => {
    const indice = indexUp[0] as string
    expect(indice).toMatch(/"status" = 'BLOQUEADO'/)
    expect(indice).toMatch(/"deleted_at" IS NULL/)
    // Un indice de este tipo que no excluyera los borrados traeria filas que la revision no
    // debe tocar: el borrado es logico, la fila sigue ahi.
    expect(indice).not.toMatch(/"deleted_at" IS NOT NULL/)
  })

  it('el indice va en su PROPIA migracion, y no antes que el ADD VALUE', () => {
    // Postgres rechaza usar un valor recien anadido al enum como valor del enum en la misma
    // transaccion que lo anade (`unsafe use of new value`), y Prisma Migrate ejecuta cada
    // migracion en una. Juntas, la segunda sentencia fallaria.
    expect(enumDir).not.toBe(indexDir)
    const carpetaDelEnum = basename(enumDir)
    const carpetaDelIndice = basename(indexDir)
    expect(
      carpetaDelIndice > carpetaDelEnum,
      `el indice (${carpetaDelIndice}) tiene que ir DESPUES del ADD VALUE (${carpetaDelEnum})`,
    ).toBe(true)
    // Y el `down` de la migracion del enum no recrea este indice: es de la otra.
    expect(enumDown.join('\n')).not.toContain('orders_blocked_company_created_idx')
  })

  it('el DOWN del indice lo borra con IF EXISTS y no inventa otro en su lugar', () => {
    // El indice no se recrea al revertir: es nuevo de esta migracion, y su unica razon de existir
    // es el valor que la migracion anterior anade. `IF EXISTS` para que deshacer dos veces no
    // falle.
    expect(indexDown).toEqual(['DROP INDEX IF EXISTS "orders_blocked_company_created_idx"'])
    expect(indexDown.join('\n')).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i)
  })
})
