// Contrato estatico del SQL de la migracion `order_execution_entries`.
//
// Lo que se vigila aqui no lo expresa `db/schema.prisma`: los tres CHECK, las dos FK compuestas,
// la RLS y la reversion exacta del `down.sql`. Cada afirmacion es un PREDICADO que se aplica al SQL
// real y a una version MUTADA EN MEMORIA, que tiene que reprobarlo.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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

const MIGRATION_NAME = '20261006180000_order_execution_entries'
const TABLE = 'order_execution_entries'
const ENUM_TYPE = 'OrderExecutionAction'
const ACTIONS = [
  'START',
  'RESUME',
  'ADVANCE',
  'GO_BACK',
  'CANCEL',
  'FINISH',
  'PACK_START',
  'PACK_FINISH',
] as const
const COLUMNS = [
  'id',
  'company_id',
  'order_id',
  'user_id',
  'action',
  'step_position',
  'reason',
  'occurred_at',
] as const

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsRoot = join(repoRoot, 'db', 'migrations')
const migrationDir = join(migrationsRoot, MIGRATION_NAME)

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

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
  expect(found, `no hay exactamente una sentencia que coincida con ${pattern}`).toHaveLength(1)
  return found[0] as string
}

function createTableOf(source: readonly string[]): string {
  return findStatement(source, new RegExp(`^CREATE TABLE "${TABLE}"`, 'i'))
}

function enumValues(source: readonly string[]): readonly string[] {
  const createType = source.find((statement) =>
    new RegExp(`^CREATE TYPE "${ENUM_TYPE}" AS ENUM`, 'i').test(statement),
  )
  if (createType === undefined) return []
  const body = /AS ENUM \((.*)\)$/i.exec(createType)?.[1] ?? ''
  return [...body.matchAll(/'([^']*)'/g)].map((match) => match[1] as string)
}

/** Nombres de las columnas declaradas en el CREATE TABLE, en orden. */
function columnNames(createTable: string): readonly string[] {
  const body = createTable.slice(createTable.indexOf('(') + 1, createTable.lastIndexOf(')'))
  return body
    .split(',')
    .map((part) => part.trim())
    .filter((part) => !/^CONSTRAINT\b/i.test(part))
    .map((part) => /^"([^"]+)"/.exec(part)?.[1] ?? part)
}

function columnDefinition(createTable: string, column: string): string {
  const body = createTable.slice(createTable.indexOf('(') + 1, createTable.lastIndexOf(')'))
  return (
    body
      .split(',')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`"${column}" `)) ?? ''
  )
}

function timeColumns(createTable: string): readonly string[] {
  return columnNames(createTable).filter((column) =>
    /TIMESTAMP|\bDATE\b|\bTIME\b|INTERVAL/i.test(columnDefinition(createTable, column)),
  )
}

function checkBody(source: readonly string[], constraint: string): string | undefined {
  const statement = source.find((s) => new RegExp(`ADD CONSTRAINT "${constraint}" CHECK`, 'i').test(s))
  if (statement === undefined) return undefined
  return statement.slice(statement.search(/CHECK/i)).replace(/\s+/g, '')
}

function compositeFk(
  source: readonly string[],
  constraint: string,
  column: string,
  target: string,
): boolean {
  const statement = source.find((s) => new RegExp(`ADD CONSTRAINT "${constraint}"`, 'i').test(s))
  if (statement === undefined) return false
  return (
    new RegExp(`^ALTER TABLE "${TABLE}" ADD CONSTRAINT`, 'i').test(statement) &&
    new RegExp(`FOREIGN KEY \\("${column}", "company_id"\\)`, 'i').test(statement) &&
    new RegExp(`REFERENCES "${target}"\\("id", "company_id"\\)`, 'i').test(statement) &&
    /ON DELETE RESTRICT/i.test(statement) &&
    !/ON DELETE (CASCADE|SET NULL|SET DEFAULT|NO ACTION)/i.test(statement)
  )
}

/** RLS: ENABLE y FORCE son las dos ultimas sentencias del UP. */
function rlsIsLast(source: readonly string[]): boolean {
  const lastTwo = source.slice(-2)
  return (
    lastTwo.some((s) => new RegExp(`^ALTER TABLE "${TABLE}" ENABLE ROW LEVEL SECURITY$`, 'i').test(s)) &&
    lastTwo.some((s) => new RegExp(`^ALTER TABLE "${TABLE}" FORCE ROW LEVEL SECURITY$`, 'i').test(s))
  )
}

/** Sentencias que actuan sobre algo que no es la tabla ni el tipo nuevos. */
function foreignStatements(source: readonly string[]): readonly string[] {
  return source.filter((statement) => {
    if (new RegExp(`^CREATE TYPE "${ENUM_TYPE}"`, 'i').test(statement)) return false
    if (new RegExp(`^CREATE TABLE "${TABLE}"`, 'i').test(statement)) return false
    if (new RegExp(`^CREATE INDEX "[a-z_]+" ON "${TABLE}"`, 'i').test(statement)) return false
    if (new RegExp(`^ALTER TABLE "${TABLE}" `, 'i').test(statement)) return false
    return true
  })
}

/** Todo identificador entre comillas dobles que la migracion puede nombrar, en ingles. */
const ENGLISH_IDENTIFIERS = new Set<string>([
  TABLE,
  ENUM_TYPE,
  ...COLUMNS,
  'order_execution_entries_pkey',
  'order_execution_entries_order_id_occurred_at_idx',
  'order_execution_entries_user_id_idx',
  'order_execution_entries_reason_matches_action',
  'order_execution_entries_step_position_positive',
  'order_execution_entries_packing_has_no_step',
  'order_execution_entries_order_id_company_id_fkey',
  'order_execution_entries_user_id_company_id_fkey',
  'orders',
  'users',
])

function unknownIdentifiers(source: readonly string[]): readonly string[] {
  const found = new Set<string>()
  for (const statement of source) {
    for (const match of statement.matchAll(/"([^"]+)"/g)) found.add(match[1] as string)
  }
  return [...found].filter((identifier) => !ENGLISH_IDENTIFIERS.has(identifier))
}

function mutate(source: readonly string[], from: string | RegExp, to: string): readonly string[] {
  const mutated = source.map((statement) => statement.replace(from, to))
  expect(mutated, 'la mutacion no se aplico').not.toEqual(source)
  return mutated
}

describe('migration.sql — cabecera sin citas', () => {
  it('ni migration.sql ni down.sql citan ficha, requisito ni decision', () => {
    for (const source of [upSource, downSource]) {
      expect(source).not.toMatch(/QC-\d+/)
      expect(source).not.toMatch(/\bR\d+(bis)?\b/)
      expect(source).not.toMatch(/\bD\d+\b/)
      expect(source).not.toMatch(/design\.md/i)
      expect(source).not.toMatch(/decisi[oó]n cerrada/i)
    }
  })
})

describe('migration.sql — la accion (R1)', () => {
  it('R1: el tipo tiene exactamente los ocho valores y ninguno mas, y la columna lo usa', () => {
    expect(enumValues(up)).toEqual(ACTIONS)
    expect(columnDefinition(createTableOf(up), 'action')).toBe(`"action" "${ENUM_TYPE}" NOT NULL`)

    const conUnoDeMas = mutate(up, "'PACK_FINISH')", "'PACK_FINISH', 'PAUSE')")
    expect(enumValues(conUnoDeMas)).not.toEqual(ACTIONS)
    const sinUno = mutate(up, "'GO_BACK', ", '')
    expect(enumValues(sinUno)).not.toEqual(ACTIONS)
  })
})

describe('migration.sql — columnas (R2, R3, R4)', () => {
  it('R2/R4: la lista exacta de columnas, sin texto ni identificador del paso', () => {
    const createTable = createTableOf(up)
    expect(columnNames(createTable)).toEqual(COLUMNS)
    expect(columnNames(createTable).filter((column) => /step/.test(column))).toEqual(['step_position'])
    expect(columnDefinition(createTable, 'step_position')).toBe('"step_position" INTEGER')

    const conTextoDelPaso = mutate(up, '"reason" TEXT,', '"reason" TEXT, "step_text" TEXT,')
    expect(columnNames(createTableOf(conTextoDelPaso))).not.toEqual(COLUMNS)
    const conIdDelPaso = mutate(up, '"step_position" INTEGER,', '"step_id" UUID,')
    expect(columnNames(createTableOf(conIdDelPaso))).not.toEqual(COLUMNS)
  })

  it('R2/R6/R7: pedido, persona, empresa, accion e instante son NOT NULL; posicion y motivo admiten nulo', () => {
    const createTable = createTableOf(up)
    for (const column of ['company_id', 'order_id', 'user_id']) {
      expect(columnDefinition(createTable, column)).toBe(`"${column}" UUID NOT NULL`)
    }
    expect(columnDefinition(createTable, 'reason')).toBe('"reason" TEXT')

    const pedidoOpcional = mutate(up, '"order_id" UUID NOT NULL', '"order_id" UUID')
    expect(columnDefinition(createTableOf(pedidoOpcional), 'order_id')).not.toBe('"order_id" UUID NOT NULL')
  })

  it('R3: una sola columna de tiempo, occurred_at, NOT NULL y sin default', () => {
    const createTable = createTableOf(up)
    expect(timeColumns(createTable)).toEqual(['occurred_at'])
    expect(columnDefinition(createTable, 'occurred_at')).toBe('"occurred_at" TIMESTAMPTZ(6) NOT NULL')

    const conCreatedAt = mutate(
      up,
      '"occurred_at" TIMESTAMPTZ(6) NOT NULL,',
      '"occurred_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    )
    expect(timeColumns(createTableOf(conCreatedAt))).not.toEqual(['occurred_at'])
    const conDefault = mutate(up, '"occurred_at" TIMESTAMPTZ(6) NOT NULL', '"occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()')
    expect(columnDefinition(createTableOf(conDefault), 'occurred_at')).not.toBe(
      '"occurred_at" TIMESTAMPTZ(6) NOT NULL',
    )
  })
})

describe('migration.sql — los tres CHECK (R5, R5bis, R8)', () => {
  const REASON = `CHECK(("action"::text='CANCEL')=("reason"ISNOTNULL))`
  const POSITION = `CHECK("step_position"ISNULLOR"step_position">=1)`
  const PACKING = `CHECK("action"::textNOTIN('PACK_START','PACK_FINISH')OR"step_position"ISNULL)`

  it('la migracion declara exactamente tres CHECK', () => {
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(3)
  })

  it('R8: el motivo existe si y solo si la accion es CANCEL, con la forma literal del CHECK de orders', () => {
    expect(checkBody(up, 'order_execution_entries_reason_matches_action')).toBe(REASON)

    const implicacion = mutate(up, `("action"::text = 'CANCEL') = ("reason" IS NOT NULL)`, `"action"::text <> 'CANCEL' OR "reason" IS NOT NULL`)
    expect(checkBody(implicacion, 'order_execution_entries_reason_matches_action')).not.toBe(REASON)
  })

  it('R5: la posicion es nula o mayor o igual que 1', () => {
    expect(checkBody(up, 'order_execution_entries_step_position_positive')).toBe(POSITION)

    const desdeCero = mutate(up, '"step_position" >= 1', '"step_position" >= 0')
    expect(checkBody(desdeCero, 'order_execution_entries_step_position_positive')).not.toBe(POSITION)
  })

  it('R5bis: PACK_START y PACK_FINISH van sin posicion; las demas acciones pueden llevarla o no', () => {
    expect(checkBody(up, 'order_execution_entries_packing_has_no_step')).toBe(PACKING)

    // La igualdad exigiria posicion a toda accion de receta, y una receta sin pasos no la tiene.
    const igualdad = mutate(
      up,
      `"action"::text NOT IN ('PACK_START','PACK_FINISH') OR "step_position" IS NULL`,
      `("action"::text IN ('PACK_START','PACK_FINISH')) = ("step_position" IS NULL)`,
    )
    expect(checkBody(igualdad, 'order_execution_entries_packing_has_no_step')).not.toBe(PACKING)
    const sinNot = mutate(up, `NOT IN ('PACK_START','PACK_FINISH')`, `IN ('PACK_START','PACK_FINISH')`)
    expect(checkBody(sinNot, 'order_execution_entries_packing_has_no_step')).not.toBe(PACKING)
    const sinFinish = mutate(up, `IN ('PACK_START','PACK_FINISH')`, `IN ('PACK_START')`)
    expect(checkBody(sinFinish, 'order_execution_entries_packing_has_no_step')).not.toBe(PACKING)
  })
})

describe('migration.sql — las dos FK compuestas (R6, R7)', () => {
  it('R6/R7: pedido contra orders(id, company_id) y persona contra users(id, company_id), RESTRICT', () => {
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(2)
    expect(
      compositeFk(up, 'order_execution_entries_order_id_company_id_fkey', 'order_id', 'orders'),
    ).toBe(true)
    expect(compositeFk(up, 'order_execution_entries_user_id_company_id_fkey', 'user_id', 'users')).toBe(
      true,
    )

    const simple = mutate(up, 'REFERENCES "orders"("id", "company_id")', 'REFERENCES "orders"("id")')
    expect(compositeFk(simple, 'order_execution_entries_order_id_company_id_fkey', 'order_id', 'orders')).toBe(
      false,
    )
    const cascada = mutate(
      up,
      /(REFERENCES "users"\("id", "company_id"\) )ON DELETE RESTRICT/,
      '$1ON DELETE CASCADE',
    )
    expect(compositeFk(cascada, 'order_execution_entries_user_id_company_id_fkey', 'user_id', 'users')).toBe(
      false,
    )
  })
})

describe('migration.sql — los dos indices', () => {
  it('(order_id, occurred_at DESC) y (user_id), y ningun indice por company_id', () => {
    const indexes = up.filter((statement) => /^CREATE (UNIQUE )?INDEX/i.test(statement))
    expect(indexes).toEqual([
      `CREATE INDEX "order_execution_entries_order_id_occurred_at_idx" ON "${TABLE}"("order_id", "occurred_at" DESC)`,
      `CREATE INDEX "order_execution_entries_user_id_idx" ON "${TABLE}"("user_id")`,
    ])
  })
})

describe('migration.sql — RLS al final (R32)', () => {
  it('R32: ENABLE y FORCE ROW LEVEL SECURITY son las dos ultimas sentencias, sin policies', () => {
    expect(rlsIsLast(up)).toBe(true)
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(2)
    expect(up.some((statement) => /^CREATE POLICY/i.test(statement))).toBe(false)

    const sinForce = up.filter((statement) => !/FORCE ROW LEVEL SECURITY$/i.test(statement))
    expect(rlsIsLast(sinForce)).toBe(false)
    const rlsAntes = [...up.slice(-2), ...up.slice(0, -2)]
    expect(rlsIsLast(rlsAntes)).toBe(false)
  })
})

describe('migration.sql — identificadores en ingles (R33)', () => {
  it('R33: todo identificador es de la lista en ingles, snake_case salvo el tipo, y los valores en mayusculas', () => {
    expect(unknownIdentifiers(up)).toEqual([])
    for (const identifier of ENGLISH_IDENTIFIERS) {
      if (identifier !== ENUM_TYPE) expect(identifier).toMatch(/^[a-z]+(_[a-z]+)*$/)
    }
    for (const value of enumValues(up)) expect(value).toMatch(/^[A-Z]+(_[A-Z]+)*$/)

    const enCastellano = mutate(up, '"reason"', '"motivo"')
    expect(unknownIdentifiers(enCastellano)).toEqual(['motivo'])
  })
})

describe('migration.sql — no toca nada preexistente (R30)', () => {
  it('R30: ninguna sentencia sobre otra tabla, ningun DROP y ningun INSERT de permisos', () => {
    expect(foreignStatements(up)).toEqual([])
    expect(up.some((statement) => /^DROP\b/i.test(statement))).toBe(false)
    expect(upSource).not.toMatch(/\bINSERT\b/i)
    expect(upSource).not.toMatch(/permissions/i)

    const conDrift = [...up, 'ALTER TABLE "orders" DROP CONSTRAINT "orders_cancellation_reason_matches_status"']
    expect(foreignStatements(conDrift)).toHaveLength(1)
    const conPermiso = [...up, `INSERT INTO "permissions" ("code") VALUES ('asignaciones.cancelar')`]
    expect(foreignStatements(conPermiso)).toHaveLength(1)
  })
})

describe('down.sql — reversion exacta (R34)', () => {
  const EXPECTED_DOWN = [`DROP TABLE "${TABLE}"`, `DROP TYPE "${ENUM_TYPE}"`]

  it('R34: DROP TABLE sin CASCADE y despues DROP TYPE, y nada mas', () => {
    expect(down).toEqual(EXPECTED_DOWN)

    expect(down.map((statement) => `${statement} CASCADE`)).not.toEqual(EXPECTED_DOWN)
    expect([...down].reverse()).not.toEqual(EXPECTED_DOWN)
  })

  it('R34: el UP crea exactamente un tipo y una tabla, los dos que el DOWN borra', () => {
    expect(up.filter((statement) => /^CREATE (TYPE|TABLE)\b/i.test(statement))).toEqual([
      expect.stringMatching(new RegExp(`^CREATE TYPE "${ENUM_TYPE}" AS ENUM`)),
      expect.stringMatching(new RegExp(`^CREATE TABLE "${TABLE}"`)),
    ])
  })
})

// 2026-10-07: antes se exigia que esta migracion fuera la ultima por orden de nombre. El merge
// con QC-216 trajo `20261006234105_conditioning_role`, posterior e independiente, y la asercion
// se puso roja sin que nada estuviera mal: "es la ultima" era fragil y no respondia a ningun
// R<n>. Lo que importa de verdad es que la carpeta exista, que su timestamp no colisione con
// otra y que corra DESPUES de las migraciones que crean las claves unicas que usan sus FK
// (R6, R7). Esas migraciones se localizan por contenido, no por nombre.

/** Claves unicas compuestas a las que apuntan las dos FK de esta migracion. */
const REFERENCED_KEYS = ['orders_id_company_id_key', 'users_id_company_id_key'] as const

function listMigrationFolders(): string[] {
  return readdirSync(migrationsRoot)
    .filter((entry) => statSync(join(migrationsRoot, entry)).isDirectory())
    .sort()
}

function timestampOf(folder: string): string {
  return folder.split('_')[0] ?? folder
}

/** La sentencia que DEFINE la clave (indice unico o constraint UNIQUE), sin contar comentarios. */
function definesKey(sql: string, key: string): boolean {
  const code = stripSqlComments(sql)
  return (
    new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+"${key}"`, 'i').test(code) ||
    new RegExp(`CONSTRAINT\\s+"${key}"\\s+UNIQUE`, 'i').test(code)
  )
}

function folderDefiningKey(folders: readonly string[], key: string): string[] {
  return folders.filter((folder) => {
    const file = join(migrationsRoot, folder, 'migration.sql')
    return existsSync(file) && definesKey(readFileSync(file, 'utf8'), key)
  })
}

/** El orden es valido si la migracion existe, su timestamp es unico y va tras sus dependencias. */
function orderIsValid(folders: readonly string[], name: string, deps: readonly string[]): boolean {
  if (!folders.includes(name)) return false
  const sameTimestamp = folders.filter((folder) => timestampOf(folder) === timestampOf(name))
  if (sameTimestamp.length !== 1) return false
  return deps.every((dep) => folders.includes(dep) && dep < name)
}

describe('db/migrations — orden', () => {
  const folders = listMigrationFolders()
  const definers = REFERENCED_KEYS.map((key) => ({ key, found: folderDefiningKey(folders, key) }))
  const deps = definers.flatMap(({ found }) => found)

  it('cada clave unica que usan sus FK la define exactamente una migracion', () => {
    for (const { key, found } of definers) {
      expect(found, `migraciones que definen ${key}`).toHaveLength(1)
    }
  })

  it('la carpeta de esta migracion existe en db/migrations', () => {
    expect(folders).toContain(MIGRATION_NAME)
  })

  it('su prefijo timestamp es unico entre las carpetas de migraciones', () => {
    const timestamps = folders.map(timestampOf)
    expect(timestamps.filter((ts) => ts === timestampOf(MIGRATION_NAME))).toHaveLength(1)
  })

  it('R6, R7: va despues de las migraciones que crean las claves unicas de sus FK', () => {
    for (const dep of deps) {
      expect(dep < MIGRATION_NAME, `${MIGRATION_NAME} debe ir despues de ${dep}`).toBe(true)
    }
    expect(orderIsValid(folders, MIGRATION_NAME, deps)).toBe(true)
  })

  it('control negativo: el criterio rechaza un orden roto', () => {
    // Una dependencia que sortea despues de esta migracion.
    expect(orderIsValid([...folders, '20991231000000_later'], MIGRATION_NAME, [
      ...deps,
      '20991231000000_later',
    ])).toBe(false)
    // Un timestamp duplicado.
    expect(
      orderIsValid([...folders, `${timestampOf(MIGRATION_NAME)}_dup`].sort(), MIGRATION_NAME, deps),
    ).toBe(false)
    // La carpeta no existe.
    expect(orderIsValid(folders.filter((f) => f !== MIGRATION_NAME), MIGRATION_NAME, deps)).toBe(
      false,
    )
    // Una migracion posterior e independiente NO rompe el orden (el caso de QC-216).
    expect(orderIsValid([...folders, '20991231000000_later'], MIGRATION_NAME, deps)).toBe(true)
  })
})
