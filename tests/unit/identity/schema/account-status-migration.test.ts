// Contrato estatico del SQL de la migracion del estado de cuenta (QC-65).
//
// Cubre R2, R4, R6, R9, R11, R12 y R17. Lo que se vigila aqui NO esta en `db/schema.prisma` y
// Prisma no lo regenera nunca: el BACKFILL y su sitio, la FK auto-referencial escrita a mano
// —`accountStatusChangedBy` es un ESCALAR sin `@relation` a proposito (`design.md > 1.3`), asi
// que la FK es DRIFT y solo existe en este archivo— y el orden del DOWN.
//
// Los dos puntos mas fragiles de la ficha:
//
//   1. `prisma migrate dev --create-only` emitio DIECINUEVE `DROP CONSTRAINT` y NUEVE
//      `DROP INDEX` por drift sobre `orders`, `products`, `recipe_lines`, `recipes`,
//      `supplier_catalog_lines`, `suppliers`, `units` y `presentations` (`design.md > 8`,
//      riesgo 2). Se borraron a mano. Si uno se colara, el esquema seguiria validando, el
//      cliente compilaria y la suite pasaria: no se enteraria nadie salvo este test.
//
//   2. Los cuatro valores del `CREATE TYPE` son un DUPLICADO de `USER_ACCOUNT_STATUSES`
//      (`lib/modules/identity/domain/account-status.ts`), porque el SQL no puede importar
//      TypeScript. Aqui se importa la constante REAL y se compara con los literales extraidos
//      del SQL: los cuatro valores NO se escriben a mano en este archivo (mismo patron que
//      `companies-migration.test.ts` con `INITIAL_COMPANY_NAME`).
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una copia MUTADA EN MEMORIA.
// El archivo en disco NO se toca. Un test que no puede fallar no vigila nada.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  INITIAL_USER_ACCOUNT_STATUS,
  SEED_ADMIN_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUSES,
} from '@/lib/modules/identity'

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
 * La carpeta se localiza por PATRON, no por su timestamp escrito a pelo: si la migracion se
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella.
 */
const accountStatusDirs = readdirSync(migrationsDir).filter((name) =>
  /_user_account_status$/.test(name),
)
expect(accountStatusDirs, 'debe existir exactamente una migracion del estado de cuenta').toHaveLength(
  1,
)
const migrationDir = join(migrationsDir, accountStatusDirs[0] as string)

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

// --- Predicados puros ----------------------------------------------------------------------

/**
 * R2, R4. Los valores del `CREATE TYPE "UserAccountStatus"`, EN SU ORDEN, tal como estan
 * escritos en el SQL; `null` si no hay `CREATE TYPE` o si no es un `ENUM`.
 */
export function createTypeValues(sql: string): readonly string[] | null {
  const match = /CREATE\s+TYPE\s+"UserAccountStatus"\s+AS\s+ENUM\s*\(([^)]*)\)/i.exec(
    stripSqlComments(sql),
  )
  if (match === null || match[1] === undefined) return null
  const valores = match[1].split(',').map((valor) => valor.trim())
  const literales = valores.map((valor) => /^'([^']*)'$/.exec(valor)?.[1])
  if (literales.some((literal) => literal === undefined)) return null
  return literales as readonly string[]
}

/**
 * R2, R3, R4. ¿El tipo de Postgres declara EXACTAMENTE los cuatro valores de la UNICA
 * definicion del conjunto, en el mismo orden y con la misma grafia? La lista esperada se
 * IMPORTA de `@/lib/modules/identity`; no se copia aqui.
 */
export function createTypeMatchesTheOnlyDefinition(sql: string): boolean {
  const valores = createTypeValues(sql)
  if (valores === null) return false
  return valores.join(',') === [...USER_ACCOUNT_STATUSES].join(',')
}

/** El `UPDATE` del backfill tal como esta escrito, o `null` si no hay ninguno sobre `users`. */
export function backfillStatement(sql: string): string | null {
  const match = /UPDATE\s+"users"\s+SET\s+"account_status"\s*=[^;]*/i.exec(stripSqlComments(sql))
  if (match === null) return null
  return match[0].replace(/\s+/g, ' ').trim()
}

/**
 * R6. ¿El backfill deja `active` a TODAS las filas que ya existian, sin `WHERE`? El valor
 * esperado NO se escribe a mano: sale de `SEED_ADMIN_ACCOUNT_STATUS`, que por la decision
 * cerrada 4 es el mismo estado con el que quedan las filas preexistentes —entre ellas, el
 * administrador del seed de QC-6, que tiene que seguir entrando—.
 *
 * Un `WHERE "deleted_at" IS NULL` colado aqui dejaria fuera a los usuarios dados de baja, que
 * es justo lo que R6 prohibe con todas las letras.
 */
export function backfillSetsEveryRowActive(sql: string): boolean {
  const update = backfillStatement(sql)
  if (update === null) return false
  if (/\bWHERE\b/i.test(update)) return false
  const valor = /=\s*'([^']*)'/.exec(update)?.[1]
  if (valor === undefined) return false
  return valor === SEED_ADMIN_ACCOUNT_STATUS && valor !== INITIAL_USER_ACCOUNT_STATUS
}

/**
 * `design.md > 3.1`, paso 3: el backfill va DESPUES del `ADD COLUMN`, porque la columna tiene
 * que existir. Si fuera antes, la migracion entera reventaria.
 */
export function backfillComesAfterAddColumn(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const addColumn = ejecutable.search(/ADD\s+COLUMN\s+"account_status"/i)
  const backfill = ejecutable.search(/UPDATE\s+"users"\s+SET\s+"account_status"/i)
  if (addColumn === -1 || backfill === -1) return false
  return addColumn < backfill
}

/**
 * R11, R12. ¿La FK del autor existe, apunta a la propia `users("id")` y es `RESTRICT`? Con
 * `CASCADE` o `SET NULL`, borrar fisicamente al autor arrastraria o vaciaria el rastro EN
 * SILENCIO, que es exactamente lo contrario de lo que R12 pide.
 */
export function authorForeignKeyIsRestrict(sql: string): boolean {
  const fk = statements(sql).find((statement) =>
    /ADD CONSTRAINT "users_account_status_changed_by_fkey"/i.test(statement),
  )
  if (fk === undefined) return false
  return (
    /FOREIGN KEY \("account_status_changed_by"\) REFERENCES "users"\("id"\)/i.test(fk) &&
    /ON DELETE RESTRICT ON UPDATE CASCADE$/i.test(fk) &&
    !/ON DELETE (CASCADE|SET NULL|SET DEFAULT)/i.test(fk)
  )
}

/** Las tablas sobre las que el SQL ejecuta DDL, en minuscula y sin repetir. */
export function tablesTouched(sql: string): readonly string[] {
  const tocadas = new Set<string>()
  for (const statement of statements(sql)) {
    const alterOrTable =
      /^(?:ALTER|DROP|CREATE|TRUNCATE)\s+TABLE\s+(?:IF (?:NOT )?EXISTS\s+)?"?(\w+)"?/i.exec(
        statement,
      )
    if (alterOrTable !== null) tocadas.add((alterOrTable[1] as string).toLowerCase())
    const sobreIndice = /^(?:CREATE|DROP)(?: UNIQUE)? INDEX\s+.*?\bON "?(\w+)"?/i.exec(statement)
    if (sobreIndice !== null) tocadas.add((sobreIndice[1] as string).toLowerCase())
    const update = /^(?:UPDATE|INSERT INTO|DELETE FROM)\s+"?(\w+)"?/i.exec(statement)
    if (update !== null) tocadas.add((update[1] as string).toLowerCase())
  }
  return [...tocadas].sort()
}

/**
 * R17. Las sentencias del SQL que BORRAN algo: un `DROP` suelto o un `DROP` escondido dentro de
 * un `ALTER TABLE`. La migracion de esta ficha es ADITIVA y esta lista tiene que estar vacia;
 * es lo que caza los nueve `DROP INDEX` de drift, que no nombran ninguna tabla y por eso se le
 * escapan a `tablesTouched`.
 */
export function dropStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /(^DROP\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX)\b)/i.test(statement))
}

/**
 * R17, R18. ¿El SQL toca en alguna linea EJECUTABLE algo de lo que esta ficha tiene PROHIBIDO
 * tocar: el borrado logico, las columnas del bloqueo de QC-19, los tres indices unicos de
 * `users` o el RLS? Los comentarios los nombran a proposito —para decir que no se tocan—, asi
 * que se quitan antes de mirar.
 */
export function touchesForbiddenGround(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  return (
    /deleted_at/i.test(ejecutable) ||
    /failed_login_attempts|lock_level|locked_until/i.test(ejecutable) ||
    /users_email_unique|users_username_unique|users_document_unique/i.test(ejecutable) ||
    /ROW\s+LEVEL\s+SECURITY/i.test(ejecutable)
  )
}

/**
 * R17. ¿El DOWN va en orden inverso al UP —indice, FK, columnas, tipo— con el `DROP TYPE` EL
 * ULTIMO? Postgres rechaza borrar el tipo mientras una columna dependa de el, asi que un DOWN
 * con el `DROP TYPE` adelantado no revierte nada: falla entero.
 */
export function downDropsTypeLast(sql: string): boolean {
  const sentencias = statements(sql)
  const posicion = (pattern: RegExp): number => sentencias.findIndex((s) => pattern.test(s))
  const indice = posicion(/^DROP INDEX (IF EXISTS )?"users_account_status_changed_by_idx"$/i)
  const fk = posicion(/DROP CONSTRAINT (IF EXISTS )?"users_account_status_changed_by_fkey"/i)
  const columnas = posicion(/DROP COLUMN (IF EXISTS )?"account_status"/i)
  const tipo = posicion(/^DROP TYPE (IF EXISTS )?"UserAccountStatus"$/i)
  if ([indice, fk, columnas, tipo].includes(-1)) return false
  return indice < fk && fk < columnas && columnas < tipo && tipo === sentencias.length - 1
}

/** R17. ¿El DOWN quita las TRES columnas? Dejarse una deja el esquema revertido a medias. */
export function downDropsAllThreeColumns(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  return [
    'account_status',
    'account_status_changed_at',
    'account_status_changed_by',
  ].every((columna) => new RegExp(`DROP COLUMN (IF EXISTS )?"${columna}"`, 'i').test(ejecutable))
}

// --- El UP: el tipo ------------------------------------------------------------------------

describe('migration.sql — el conjunto cerrado lo impone la BASE (R2, R4)', () => {
  it('el CREATE TYPE declara EXACTAMENTE los cuatro valores del dominio, y cae si divergen', () => {
    // R2: la garantia es de la base. Con el tipo, un valor fuera del conjunto se rechaza con
    // 22P02 antes de llegar a la fila, sin ninguna comprobacion previa en codigo.
    expect(createTypeMatchesTheOnlyDefinition(upSource)).toBe(true)
    expect(createTypeValues(upSource)).toEqual([...USER_ACCOUNT_STATUSES])

    // --- Sensibilidad (mutacion EN MEMORIA; el archivo en disco no se toca):
    // cambiar un literal del SQL sin cambiar la constante CAE. Es la desincronizacion
    // silenciosa que este test existe para detectar.
    const renombrado = upSource.replace(
      `'${USER_ACCOUNT_STATUSES[2]}'`,
      "'disabled'",
    )
    expect(renombrado, 'la mutacion no renombro ningun valor').not.toBe(upSource)
    expect(createTypeMatchesTheOnlyDefinition(renombrado)).toBe(false)

    // Reordenarlos, tambien: en Postgres el orden de un enum no es cosmetico.
    const reordenado = upSource.replace(
      /AS ENUM \([^)]*\)/,
      `AS ENUM (${[...USER_ACCOUNT_STATUSES].reverse().map((valor) => `'${valor}'`).join(', ')})`,
    )
    expect(reordenado, 'la mutacion no reordeno los valores').not.toBe(upSource)
    expect(createTypeMatchesTheOnlyDefinition(reordenado)).toBe(false)

    // Y cambiar el tipo por un `TEXT` con `CHECK` —la alternativa A, descartada— tampoco pasa.
    // El `^` con la bandera `m` es OBLIGATORIO: la cabecera del archivo NOMBRA el
    // `CREATE TYPE` en un comentario, y sin anclar al principio de linea la mutacion se
    // comeria la prosa y dejaria intacta la sentencia real.
    const sinTipo = upSource.replace(/^CREATE TYPE[^;]*;/m, '')
    expect(sinTipo, 'la mutacion no quito el CREATE TYPE').not.toBe(upSource)
    expect(createTypeMatchesTheOnlyDefinition(sinTipo)).toBe(false)
  })
})

// --- El UP: las tres columnas --------------------------------------------------------------

describe('migration.sql — las tres columnas (R1, R5, R8, R9, R10)', () => {
  it('las anade en un solo ALTER TABLE, con sus defaults y su opcionalidad', () => {
    const alter = findStatement(up, /^ALTER TABLE "users" ADD COLUMN\s+"account_status"/i)
    // R1 y R5: el estado nunca esta ausente y una fila nueva nace en el estado inicial.
    expect(alter).toMatch(
      new RegExp(
        `"account_status" "UserAccountStatus" NOT NULL DEFAULT '${INITIAL_USER_ACCOUNT_STATUS}'`,
        'i',
      ),
    )
    // R8 y R9: el instante nunca esta ausente y lo rellena la BASE, tanto en el alta como en
    // esta misma migracion sobre las filas que ya existen.
    expect(alter).toMatch(
      /"account_status_changed_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/i,
    )
    // R10: el autor es OPCIONAL —NULL = lo cambio el sistema— y no tiene default.
    expect(alter).toMatch(/"account_status_changed_by" UUID(?!\s+NOT NULL)/i)
    expect(alter).not.toMatch(/"account_status_changed_by" UUID[^,]*DEFAULT/i)
  })

  it('las tres columnas van en ingles y snake_case (R4)', () => {
    const ejecutable = stripSqlComments(upSource)
    for (const columna of [
      'account_status',
      'account_status_changed_at',
      'account_status_changed_by',
    ]) {
      expect(ejecutable, `falta la columna ${columna}`).toContain(`"${columna}"`)
      expect(columna).toMatch(/^[a-z_]+$/)
    }
  })
})

// --- El UP: el backfill --------------------------------------------------------------------

describe('migration.sql — el backfill deja `active` a lo que ya existia (R6)', () => {
  it('actualiza TODAS las filas, sin WHERE, y cae si alguien acota el barrido', () => {
    expect(backfillSetsEveryRowActive(upSource)).toBe(true)
    expect(backfillComesAfterAddColumn(upSource)).toBe(true)
    // El autor se queda NULL: la migracion es «el sistema», no una persona (R10).
    expect(backfillStatement(upSource)).not.toMatch(/account_status_changed_by/i)

    // --- Sensibilidad: un `WHERE deleted_at IS NULL` dejaria fuera a los usuarios dados de
    // baja, que es LITERALMENTE lo que R6 prohibe. Cae.
    const conWhere = upSource.replace(
      /UPDATE "users" SET "account_status" = '([^']*)';/,
      'UPDATE "users" SET "account_status" = \'$1\' WHERE "deleted_at" IS NULL;',
    )
    expect(conWhere, 'la mutacion no anadio el WHERE').not.toBe(upSource)
    expect(backfillSetsEveryRowActive(conWhere)).toBe(false)

    // Dejar las filas viejas en el estado de las NUEVAS cerraria el sistema sobre si mismo en
    // cuanto QC-78 corte el login por estado (decision cerrada 4). Cae.
    // Anclado con `^` y bandera `m` por lo mismo: el comentario de cabecera escribe el
    // `UPDATE` entero para explicarlo, y mutar la prosa no probaria nada.
    const enInicial = upSource.replace(
      /^(UPDATE "users" SET "account_status" = )'[^']*'/m,
      `$1'${INITIAL_USER_ACCOUNT_STATUS}'`,
    )
    expect(enInicial, 'la mutacion no cambio el valor del backfill').not.toBe(upSource)
    expect(backfillSetsEveryRowActive(enInicial)).toBe(false)

    // Y sin backfill no hay nada que comprobar: eso tampoco pasa.
    // Anclado igual que las dos mutaciones de arriba: se quita la SENTENCIA, no la prosa.
    const sinBackfill = upSource.replace(/^UPDATE "users" SET "account_status"[^;]*;/m, '')
    expect(sinBackfill, 'la mutacion no quito el backfill').not.toBe(upSource)
    expect(backfillSetsEveryRowActive(sinBackfill)).toBe(false)

    // Colocado ANTES del ADD COLUMN, la migracion reventaria: el predicado del orden cae.
    const adelantado = `UPDATE "users" SET "account_status" = '${SEED_ADMIN_ACCOUNT_STATUS}';\n${upSource}`
    expect(backfillComesAfterAddColumn(adelantado)).toBe(false)
  })
})

// --- El UP: la FK y el indice --------------------------------------------------------------

describe('migration.sql — el autor del cambio existe y no se puede borrar (R11, R12)', () => {
  it('la FK auto-referencial va con RESTRICT, y cae si alguien la afloja', () => {
    expect(authorForeignKeyIsRestrict(upSource)).toBe(true)

    // --- Sensibilidad: `SET NULL` vaciaria el rastro al borrar fisicamente al autor, en
    // silencio y sin que nadie se entere. Cae.
    const conSetNull = upSource.replace(/ON DELETE RESTRICT/i, 'ON DELETE SET NULL')
    expect(conSetNull, 'la mutacion no cambio el ON DELETE').not.toBe(upSource)
    expect(authorForeignKeyIsRestrict(conSetNull)).toBe(false)

    // Y `CASCADE` borraria al autor Y a todos los usuarios cuyo estado cambio. Peor todavia.
    const conCascade = upSource.replace(/ON DELETE RESTRICT/i, 'ON DELETE CASCADE')
    expect(authorForeignKeyIsRestrict(conCascade)).toBe(false)

    // Sin FK, R11 se queda sin ninguna garantia: un uuid inventado entraria sin protestar.
    const sinFk = upSource.replace(/ALTER TABLE "users" ADD CONSTRAINT[^;]*;/i, '')
    expect(sinFk, 'la mutacion no quito la FK').not.toBe(upSource)
    expect(authorForeignKeyIsRestrict(sinFk)).toBe(false)
  })

  it('crea el indice del lado hijo de la FK y NINGUNO sobre el estado (R19)', () => {
    findStatement(
      up,
      /^CREATE INDEX "users_account_status_changed_by_idx" ON "users"\("account_status_changed_by"\)$/i,
    )
    // Nadie consulta por estado todavia: un indice aqui seria infraestructura «por si acaso».
    expect(
      up.filter((statement) => /INDEX .*\("account_status"\)/i.test(statement)),
      'no debe haber indice sobre account_status (R19)',
    ).toEqual([])
  })
})

// --- El UP: lo que NO toca -----------------------------------------------------------------

describe('migration.sql — lo que esta migracion NO toca (R15, R16, R17, R18)', () => {
  it('solo hace DDL sobre users, y cae si vuelve el drift de otra tabla', () => {
    // `design.md > 8`, riesgo 2: `prisma migrate dev --create-only` emitio 19 `DROP CONSTRAINT`
    // y 9 `DROP INDEX` sobre otras tablas. Se borraron a mano. Si uno vuelve, el esquema sigue
    // validando y la suite pasa: este es el unico sitio que se entera.
    expect(tablesTouched(upSource)).toEqual(['users'])

    // --- Sensibilidad: uno solo de los `DROP CONSTRAINT` que Prisma genero, colado al final.
    const conDrift = `${upSource}\nALTER TABLE "products" DROP CONSTRAINT "products_created_by_fkey";`
    expect(tablesTouched(conDrift)).toEqual(['products', 'users'])

    // Un `DROP INDEX` suelto no nombra ninguna tabla, asi que `tablesTouched` no lo ve: lo
    // caza el predicado de abajo, que es el que cierra «la migracion es ADITIVA».
  })

  it('la migracion es ADITIVA: no hay un solo DROP en todo el UP (R17)', () => {
    // Los nueve `DROP INDEX` que Prisma emitio por drift (sobre `units` y `presentations`) no
    // nombran ninguna tabla y por eso se escapan de `tablesTouched`. Aqui se afirma lo que R17
    // pide de verdad: el UP SOLO anade. Cualquier `DROP`, de lo que sea, cae.
    expect(dropStatements(upSource), 'el UP no puede borrar nada').toEqual([])

    // --- Sensibilidad: uno solo de los `DROP INDEX` que Prisma genero, colado al final.
    const conDropIndex = `${upSource}\nDROP INDEX "units_name_idx";`
    expect(dropStatements(conDropIndex)).toEqual(['DROP INDEX "units_name_idx"'])

    // Y un `DROP CONSTRAINT`, que llega escondido dentro de un `ALTER TABLE`.
    const conDropConstraint = `${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_recipe_id_fkey";`
    expect(dropStatements(conDropConstraint)).toHaveLength(1)
  })

  it('ni el UP ni el DOWN tocan el borrado logico, el bloqueo de QC-19, los unicos ni el RLS', () => {
    // R16 (el estado y `deleted_at` son independientes), R18 (QC-19 intacta), R15 (los tres
    // indices unicos no cambian) y R17 (el RLS ya activo y forzado no se altera).
    for (const [nombre, sql] of [
      ['migration.sql', upSource],
      ['down.sql', downSource],
    ] as const) {
      expect(touchesForbiddenGround(sql), `${nombre} pisa terreno prohibido`).toBe(false)
    }

    // --- Sensibilidad, una a una: cada una de las cuatro cosas prohibidas cae por separado.
    expect(
      touchesForbiddenGround(`${upSource}\nUPDATE "users" SET "deleted_at" = NULL;`),
      'tocar deleted_at deberia caer',
    ).toBe(true)
    expect(
      touchesForbiddenGround(`${upSource}\nALTER TABLE "users" DROP COLUMN "lock_level";`),
      'tocar el bloqueo de QC-19 deberia caer',
    ).toBe(true)
    expect(
      touchesForbiddenGround(`${upSource}\nDROP INDEX "users_email_unique";`),
      'tocar los indices unicos deberia caer',
    ).toBe(true)
    expect(
      touchesForbiddenGround(`${upSource}\nALTER TABLE "users" DISABLE ROW LEVEL SECURITY;`),
      'tocar el RLS deberia caer',
    ).toBe(true)
    // Y nombrarlos en un COMENTARIO —para decir que no se tocan— no cae: es lo que hace la
    // cabecera de los dos archivos reales.
    expect(touchesForbiddenGround(`${upSource}\n-- deleted_at no se toca`)).toBe(false)
  })

  it('no crea ninguna tabla: no hay historial de cambios de estado (R13)', () => {
    expect(
      up.filter((statement) => /^CREATE TABLE/i.test(statement)),
      'esta migracion no crea ninguna tabla',
    ).toEqual([])
  })
})

// --- El DOWN -------------------------------------------------------------------------------

describe('down.sql — la reversion es exacta y en orden inverso (R17)', () => {
  it('quita indice, FK, las tres columnas y el tipo EL ULTIMO, y cae si se reordena', () => {
    expect(downDropsAllThreeColumns(downSource)).toBe(true)
    expect(downDropsTypeLast(downSource)).toBe(true)

    // --- Sensibilidad: el `DROP TYPE` adelantado. Postgres lo rechaza mientras una columna
    // dependa del tipo, asi que el DOWN fallaria entero — y el predicado cae antes.
    const tipoDelante = `DROP TYPE IF EXISTS "UserAccountStatus";\n${downSource}`
    expect(downDropsTypeLast(tipoDelante)).toBe(false)

    // La FK antes que el indice tambien rompe el orden inverso del UP.
    const fkPrimero = `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_account_status_changed_by_fkey";\n${downSource}`
    expect(downDropsTypeLast(fkPrimero)).toBe(false)

    // Y olvidarse una columna deja el esquema revertido a medias, con el rollback en verde.
    const sinUna = downSource.replace(/\s*DROP COLUMN IF EXISTS "account_status_changed_at",/, '')
    expect(sinUna, 'la mutacion no quito ninguna columna').not.toBe(downSource)
    expect(downDropsAllThreeColumns(sinUna)).toBe(false)
  })

  it('no deja el tipo huerfano ni recrea nada que el UP no hubiera creado', () => {
    // R17: «sin el tipo nuevo huerfano». El DOWN lo borra, y no crea NADA.
    findStatement(down, /^DROP TYPE (IF EXISTS )?"UserAccountStatus"$/i)
    expect(
      down.filter((statement) => /^CREATE\b/i.test(statement)),
      'el DOWN no crea nada: el UP solo anadio',
    ).toEqual([])
    // Y solo toca `users`, igual que el UP.
    expect(tablesTouched(downSource)).toEqual(['users'])
  })
})
