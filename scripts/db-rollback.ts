/**
 * db:rollback — revierte la ultima migracion aplicada.
 *
 * Prisma Migrate NO tiene down migrations (ver `docs/architecture.md > Migraciones
 * up/down`): el `down.sql` y este script son convencion propia del repo.
 *
 * Dos pasos, y el segundo no es opcional:
 *   1. aplicar el `down.sql` de la ultima migracion contra la base;
 *   2. borrar su fila de `_prisma_migrations`, o el registro queda mintiendo y la
 *      siguiente migracion se aplica sobre un estado que Prisma cree que es otro.
 *
 * Por que un DELETE y no `prisma migrate resolve --rolled-back <migracion>`, que es lo
 * que decia antes esta cabecera: ese comando **solo admite migraciones en estado
 * fallido**. Sobre una migracion aplicada con exito —que es justo el caso de un
 * rollback— responde `P3012` y no escribe nada, asi que no puede cerrar el ciclo.
 * Coste aceptado de la decision (humano, 2026-08-06): se pierde el rastro historico de
 * que esa migracion llego a aplicarse; a cambio, `migrate deploy` la reaplica limpia.
 *
 * Los dos pasos van en **una sola transaccion**: el DDL de Postgres es transaccional,
 * asi que o se revierte todo (esquema y registro) o no se revierte nada. Hacerlos por
 * separado es lo que dejaba la base a medias cuando el segundo fallaba.
 *
 * Se usa `pg` y no `psql` a proposito: `psql` obliga a tener los binarios cliente de
 * Postgres instalados en cada maquina y en CI; `pg` ya es una dependencia de Node.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations')

/** `<timestamp>_<nombre>`, tal como los genera Prisma Migrate. */
const MIGRATION_NAME_PATTERN = /^\d{14}_[a-zA-Z0-9_-]+$/

function fail(message: string): never {
  console.error(`db:rollback: ${message}`)
  process.exit(1)
}

/**
 * `tsx` no carga `.env` (el CLI de Prisma si lo hace por su cuenta). Se carga aqui
 * para que la conexion de `pg` vea las mismas variables que ve el CLI de Prisma.
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

/**
 * Aplica el `down.sql` y borra la fila de `_prisma_migrations` en la MISMA
 * transaccion. Devuelve cuantas filas de registro se borraron (0 es posible: la
 * migracion podia no estar registrada).
 */
async function revertMigration(
  connectionString: string,
  migration: string,
  sql: string,
): Promise<number> {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    // Parametrizado: el nombre de la migracion nunca se concatena en el SQL.
    const deleted = await client.query('DELETE FROM "_prisma_migrations" WHERE migration_name = $1', [
      migration,
    ])
    await client.query('COMMIT')
    return deleted.rowCount ?? 0
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

  console.log(`db:rollback: aplicando down.sql de ${migration} y borrando su fila de _prisma_migrations`)
  let deletedRows: number
  try {
    deletedRows = await revertMigration(connectionString, migration, sql)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    fail(`la reversion de ${migration} fallo y no se aplico nada (transaccion deshecha): ${detail}`)
  }

  if (deletedRows === 0) {
    console.warn(
      `db:rollback: aviso — ${migration} no tenia fila en _prisma_migrations, no se borro ninguna. ` +
        'El esquema se revirtio igualmente. Comprueba con `pnpm exec prisma migrate status`.',
    )
  }

  console.log(`db:rollback: ${migration} revertida.`)
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error)
  fail(detail)
})
