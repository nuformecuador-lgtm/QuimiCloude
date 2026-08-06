/**
 * db:rollback — revierte la ultima migracion aplicada.
 *
 * Prisma Migrate NO tiene down migrations (ver `docs/architecture.md > Migraciones
 * up/down`): el `down.sql` y este script son convencion propia del repo.
 *
 * Dos pasos, y el segundo no es opcional:
 *   1. aplicar el `down.sql` de la ultima migracion contra la base;
 *   2. `prisma migrate resolve --rolled-back <migracion>`, o `_prisma_migrations`
 *      queda mintiendo y la siguiente migracion se aplica sobre un estado que
 *      Prisma cree que es otro.
 *
 * Se usa `pg` y no `psql` a proposito: `psql` obliga a tener los binarios cliente de
 * Postgres instalados en cada maquina y en CI; `pg` ya es una dependencia de Node.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

import { runPnpmExec } from './run-pnpm'

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations')

/** `<timestamp>_<nombre>`, tal como los genera Prisma Migrate. */
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-zA-Z0-9_-]+$/

function fail(message: string): never {
  console.error(`db:rollback: ${message}`)
  process.exit(1)
}

/**
 * `tsx` no carga `.env` (el CLI de Prisma si lo hace por su cuenta). Se carga aqui
 * para que la conexion de `pg` vea las mismas variables que vera `prisma migrate
 * resolve` despues.
 */
function loadDotEnv(): void {
  if (!existsSync(join(process.cwd(), '.env'))) return
  process.loadEnvFile()
}

function readConnectionString(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    fail(
      'falta DATABASE_URL. Copia `.env.example` a `.env` y rellena DATABASE_URL y DIRECT_URL ' +
        'antes de correr una migracion o un rollback.',
    )
  }

  // El down.sql es DDL: va por la conexion directa, igual que Prisma Migrate. Si no
  // hay DIRECT_URL se cae a DATABASE_URL (en local ambas apuntan al mismo sitio).
  const directUrl = process.env.DIRECT_URL
  return directUrl !== undefined && directUrl.trim() !== '' ? directUrl : databaseUrl
}

function findLastMigration(): string {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail(`no existe ${MIGRATIONS_DIR}. No hay ninguna migracion que revertir.`)
  }

  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => MIGRATION_NAME_PATTERN.test(name))
    .sort()

  const last = migrations.at(-1)
  if (last === undefined) {
    fail(`no hay ninguna migracion en ${MIGRATIONS_DIR}.`)
  }

  return last
}

function readDownSql(migration: string): string {
  const downPath = join(MIGRATIONS_DIR, migration, 'down.sql')
  if (!existsSync(downPath)) {
    fail(
      `la migracion ${migration} no tiene down.sql. Es obligatorio en este repo ` +
        '(docs/architecture.md > Migraciones up/down): escribelo antes de revertir.',
    )
  }

  const sql = readFileSync(downPath, 'utf8').trim()
  if (sql === '') {
    fail(`el down.sql de ${migration} esta vacio.`)
  }

  return sql
}

async function applyDownSql(connectionString: string, sql: string): Promise<void> {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  loadDotEnv()
  const connectionString = readConnectionString()
  const migration = findLastMigration()
  const sql = readDownSql(migration)

  console.log(`db:rollback: aplicando down.sql de ${migration}`)
  try {
    await applyDownSql(connectionString, sql)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    fail(`el down.sql de ${migration} fallo y no se aplico nada: ${detail}`)
  }

  console.log(`db:rollback: marcando ${migration} como rolled-back en _prisma_migrations`)
  const status = runPnpmExec(['prisma', 'migrate', 'resolve', '--rolled-back', migration])
  if (status !== 0) {
    fail(
      `el down.sql se aplico pero 'prisma migrate resolve --rolled-back ${migration}' fallo. ` +
        '_prisma_migrations ha quedado incoherente: corrigelo antes de aplicar nada mas.',
    )
  }

  console.log(`db:rollback: ${migration} revertida.`)
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error)
  fail(detail)
})
