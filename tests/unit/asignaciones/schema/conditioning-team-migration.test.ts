// Contrato estatico del SQL de la migracion `order_conditioning_team_members`.
//
// Lo que se vigila aqui no lo expresa `db/schema.prisma`: los dos CHECK, las tres FK compuestas, la
// RLS y la reversion exacta del `down.sql`. Cada afirmacion es un PREDICADO que se aplica al SQL real
// y a una version MUTADA EN MEMORIA, que tiene que reprobarlo.

import { readdirSync, readFileSync, statSync } from 'node:fs'
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

const MIGRATION_NAME = '20261008150000_order_conditioning_team'
const TABLE = 'order_conditioning_team_members'
const COLUMNS = [
  'order_id',
  'user_id',
  'company_id',
  'work_group_id',
  'work_group_name',
  'position',
  'created_at',
] as const

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsRoot = join(repoRoot, 'db', 'migrations')
const migrationDir = join(migrationsRoot, MIGRATION_NAME)

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\r\n/g, '\n')
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

function createTableOf(source: readonly string[]): string {
  const found = source.filter((statement) => new RegExp(`^CREATE TABLE "${TABLE}"`, 'i').test(statement))
  expect(found).toHaveLength(1)
  return found[0] as string
}

function tableBody(createTable: string): readonly string[] {
  const body = createTable.slice(createTable.indexOf('(') + 1, createTable.lastIndexOf(')'))
  return body
    .split(/,(?![^(]*\))/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function columnNames(createTable: string): readonly string[] {
  return tableBody(createTable)
    .filter((part) => !/^CONSTRAINT\b/i.test(part))
    .map((part) => /^"([^"]+)"/.exec(part)?.[1] ?? part)
}

function columnDefinition(createTable: string, column: string): string {
  return tableBody(createTable).find((part) => part.startsWith(`"${column}" `)) ?? ''
}

function primaryKey(createTable: string): string {
  return tableBody(createTable).find((part) => /PRIMARY KEY/i.test(part))?.replace(/\s+/g, '') ?? ''
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
    /ON UPDATE CASCADE/i.test(statement) &&
    !/MATCH FULL/i.test(statement) &&
    !/ON DELETE (CASCADE|SET NULL|SET DEFAULT|NO ACTION)/i.test(statement)
  )
}

function rlsIsLast(source: readonly string[]): boolean {
  const lastTwo = source.slice(-2)
  return (
    lastTwo.some((s) => new RegExp(`^ALTER TABLE "${TABLE}" ENABLE ROW LEVEL SECURITY$`, 'i').test(s)) &&
    lastTwo.some((s) => new RegExp(`^ALTER TABLE "${TABLE}" FORCE ROW LEVEL SECURITY$`, 'i').test(s))
  )
}

/** Sentencias que actuan sobre algo que no es la tabla nueva. */
function foreignStatements(source: readonly string[]): readonly string[] {
  return source.filter((statement) => {
    if (new RegExp(`^CREATE TABLE "${TABLE}"`, 'i').test(statement)) return false
    if (new RegExp(`^CREATE (UNIQUE )?INDEX "[a-z_]+" ON "${TABLE}"`, 'i').test(statement)) return false
    if (new RegExp(`^ALTER TABLE "${TABLE}" `, 'i').test(statement)) return false
    return true
  })
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

describe('migration.sql — columnas y claves (R13, R23)', () => {
  it('R13: la lista exacta de columnas, sin updated_at ni deleted_at', () => {
    expect(columnNames(createTableOf(up))).toEqual(COLUMNS)

    const conUpdatedAt = mutate(
      up,
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6),',
    )
    expect(columnNames(createTableOf(conUpdatedAt))).not.toEqual(COLUMNS)
  })

  it('R13/R23: pedido, persona, empresa y posicion NOT NULL; grupo y nombre admiten nulo', () => {
    const createTable = createTableOf(up)
    for (const column of ['order_id', 'user_id', 'company_id']) {
      expect(columnDefinition(createTable, column)).toBe(`"${column}" UUID NOT NULL`)
    }
    expect(columnDefinition(createTable, 'position')).toBe('"position" INTEGER NOT NULL')
    expect(columnDefinition(createTable, 'work_group_id')).toBe('"work_group_id" UUID')
    expect(columnDefinition(createTable, 'work_group_name')).toBe('"work_group_name" TEXT')

    const empresaOpcional = mutate(up, '"company_id" UUID NOT NULL', '"company_id" UUID')
    expect(columnDefinition(createTableOf(empresaOpcional), 'company_id')).not.toBe('"company_id" UUID NOT NULL')
  })

  it('R23: la PK es (order_id, user_id): una persona, una vez por pedido', () => {
    const PK = 'CONSTRAINT"order_conditioning_team_members_pkey"PRIMARYKEY("order_id","user_id")'
    expect(primaryKey(createTableOf(up))).toBe(PK)

    const soloPedido = mutate(up, 'PRIMARY KEY ("order_id","user_id")', 'PRIMARY KEY ("order_id","position")')
    expect(primaryKey(createTableOf(soloPedido))).not.toBe(PK)
  })

  it('R13: indices por persona y por grupo, y la posicion unica dentro del pedido', () => {
    const indexes = up.filter((statement) => /^CREATE (UNIQUE )?INDEX/i.test(statement))
    expect(indexes).toEqual([
      `CREATE INDEX "order_conditioning_team_members_user_id_idx" ON "${TABLE}"("user_id")`,
      `CREATE INDEX "order_conditioning_team_members_work_group_id_idx" ON "${TABLE}"("work_group_id")`,
      `CREATE UNIQUE INDEX "order_conditioning_team_members_order_id_position_key" ON "${TABLE}"("order_id", "position")`,
    ])
  })
})

describe('migration.sql — los dos CHECK (R23)', () => {
  const GROUP_NAME = `CHECK(("work_group_id"ISNULL)=("work_group_name"ISNULL))`
  const POSITION = `CHECK("position">=0)`

  it('la migracion declara exactamente dos CHECK', () => {
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(2)
  })

  it('R23: grupo y nombre, los dos o ninguno', () => {
    expect(checkBody(up, 'order_conditioning_team_members_work_group_name_matches_group')).toBe(GROUP_NAME)

    const implicacion = mutate(
      up,
      `("work_group_id" IS NULL) = ("work_group_name" IS NULL)`,
      `"work_group_id" IS NULL OR "work_group_name" IS NOT NULL`,
    )
    expect(checkBody(implicacion, 'order_conditioning_team_members_work_group_name_matches_group')).not.toBe(
      GROUP_NAME,
    )
  })

  it('R23: la posicion es mayor o igual que 0', () => {
    expect(checkBody(up, 'order_conditioning_team_members_position_non_negative')).toBe(POSITION)

    const desdeUno = mutate(up, '"position" >= 0', '"position" >= 1')
    expect(checkBody(desdeUno, 'order_conditioning_team_members_position_non_negative')).not.toBe(POSITION)
  })
})

describe('migration.sql — las tres FK compuestas (R23)', () => {
  it('R23: pedido, persona y grupo contra (id, company_id), RESTRICT al borrar y CASCADE al actualizar', () => {
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(3)
    expect(compositeFk(up, 'order_conditioning_team_members_order_id_company_id_fkey', 'order_id', 'orders')).toBe(
      true,
    )
    expect(compositeFk(up, 'order_conditioning_team_members_user_id_company_id_fkey', 'user_id', 'users')).toBe(
      true,
    )
    expect(
      compositeFk(up, 'order_conditioning_team_members_work_group_id_company_id_fkey', 'work_group_id', 'work_groups'),
    ).toBe(true)

    const simple = mutate(up, 'REFERENCES "work_groups"("id", "company_id")', 'REFERENCES "work_groups"("id")')
    expect(
      compositeFk(simple, 'order_conditioning_team_members_work_group_id_company_id_fkey', 'work_group_id', 'work_groups'),
    ).toBe(false)
    const cascada = mutate(up, /(REFERENCES "orders"\("id", "company_id"\) )ON DELETE RESTRICT/, '$1ON DELETE CASCADE')
    expect(compositeFk(cascada, 'order_conditioning_team_members_order_id_company_id_fkey', 'order_id', 'orders')).toBe(
      false,
    )
    const full = mutate(up, /(REFERENCES "work_groups"\("id", "company_id"\) )/, '$1MATCH FULL ')
    expect(
      compositeFk(full, 'order_conditioning_team_members_work_group_id_company_id_fkey', 'work_group_id', 'work_groups'),
    ).toBe(false)
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

describe('migration.sql — no toca nada preexistente (R32)', () => {
  it('R32: ninguna sentencia sobre otra tabla, ningun DROP, ningun INSERT ni UPDATE', () => {
    expect(foreignStatements(up)).toEqual([])
    expect(up.some((statement) => /^DROP\b/i.test(statement))).toBe(false)
    expect(upSource).not.toMatch(/\b(INSERT|UPDATE\s+")/i)

    const conDrift = [...up, 'ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_user_id_fkey"']
    expect(foreignStatements(conDrift)).toHaveLength(1)
  })
})

describe('down.sql — reversion exacta (R32)', () => {
  const EXPECTED_DOWN = [`DROP TABLE "${TABLE}"`]

  it('R32: DROP TABLE sin CASCADE, y nada mas', () => {
    expect(down).toEqual(EXPECTED_DOWN)
    expect(down.map((statement) => `${statement} CASCADE`)).not.toEqual(EXPECTED_DOWN)
  })

  it('R32: el UP crea exactamente una tabla y ningun tipo, la que el DOWN borra', () => {
    expect(up.filter((statement) => /^CREATE (TYPE|TABLE)\b/i.test(statement))).toEqual([
      expect.stringMatching(new RegExp(`^CREATE TABLE "${TABLE}"`)),
    ])
  })
})

describe('db/migrations — orden', () => {
  const folders = readdirSync(migrationsRoot)
    .filter((entry) => statSync(join(migrationsRoot, entry)).isDirectory())
    .sort()
  const timestampOf = (folder: string): string => folder.split('_')[0] ?? folder

  it('la carpeta existe y su timestamp es unico', () => {
    expect(folders).toContain(MIGRATION_NAME)
    expect(folders.filter((folder) => timestampOf(folder) === timestampOf(MIGRATION_NAME))).toHaveLength(1)
  })

  it('va despues de las migraciones que crean las claves unicas de sus FK', () => {
    const keys = ['orders_id_company_id_key', 'users_id_company_id_key', 'work_groups_id_company_id_key']
    for (const key of keys) {
      const definers = folders.filter((folder) => {
        const sql = stripSqlComments(readFileSync(join(migrationsRoot, folder, 'migration.sql'), 'utf8'))
        return (
          new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+"${key}"`, 'i').test(sql) ||
          new RegExp(`CONSTRAINT\\s+"${key}"\\s+UNIQUE`, 'i').test(sql)
        )
      })
      expect(definers, `migraciones que definen ${key}`).toHaveLength(1)
      expect((definers[0] as string) < MIGRATION_NAME, `${MIGRATION_NAME} debe ir despues de ${key}`).toBe(true)
    }
  })
})
