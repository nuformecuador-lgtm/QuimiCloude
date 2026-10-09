// La migracion `db/migrations/*_whatsapp_connections/` contra Postgres REAL.
//
// Aislamiento: cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
// `RollbackSignal`, asi que ninguna fila ni ningun DDL sobrevive. El SQL se lee del archivo.
// Las violaciones esperadas van dentro de un SAVEPOINT para no abortar la transaccion. El mensaje
// de Postgres sale en el idioma del servidor: se reconoce por SQLSTATE y por la columna de la clave.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
    dir = parent
  }
}

const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
const carpetas = readdirSync(migrationsDir).filter((name) => /_whatsapp_connections$/.test(name))
const migrationDir = join(migrationsDir, carpetas[0] ?? '__falta__')

function statementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

const TABLE = 'whatsapp_connections'

/** Todo lo que la migracion define, leido del catalogo y en orden estable. */
async function tableSnapshot(tx: Prisma.TransactionClient) {
  const columns = await tx.$queryRaw<
    {
      column_name: string
      data_type: string
      udt_name: string
      is_nullable: string
      column_default: string | null
      character_maximum_length: number | null
    }[]
  >`
    SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${TABLE}
    ORDER BY ordinal_position`
  const indexes = await tx.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${TABLE}
    ORDER BY indexname`
  const constraints = await tx.$queryRaw<{ conname: string; def: string }[]>`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = ${TABLE}
    ORDER BY c.conname`
  const rls = await tx.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
    SELECT relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE relname = ${TABLE} AND relnamespace = 'public'::regnamespace`
  const enums = await tx.$queryRaw<{ typname: string; labels: string[] }[]>`
    SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('whatsapp_connection_origin', 'whatsapp_connection_status')
    GROUP BY t.typname
    ORDER BY t.typname`
  return { columns, indexes, constraints, rls, enums }
}

async function publicTables(tx: Prisma.TransactionClient): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  return rows.map((row) => row.tablename)
}

/** Corre `statement` en un SAVEPOINT y devuelve el error de Postgres, o null si no fallo. */
async function failureOf(tx: Prisma.TransactionClient, statement: string, ...values: unknown[]) {
  await tx.$executeRawUnsafe('SAVEPOINT intento')
  try {
    await tx.$executeRawUnsafe(statement, ...values)
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT intento')
    return null
  } catch (error) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT intento')
    return String(error instanceof Error ? error.message : error)
  }
}

const INSERT_CONNECTION =
  `INSERT INTO "${TABLE}" ("id", "company_id", "display_name", "meta_app_id", "waba_id", ` +
  `"phone_number_id", "access_token_enc", "app_secret_enc", "verify_token_hash", "created_by", ` +
  `"updated_at") VALUES (gen_random_uuid(), $1::uuid, 'Conexion', 'app', 'waba', $2, 'v1:a', ` +
  `'v1:b', 'hash', $3::uuid, CURRENT_TIMESTAMP)`

async function someUserId(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM users LIMIT 1`
  expect(rows, 'la base efimera deberia tener al menos un usuario sembrado').toHaveLength(1)
  return (rows[0] as { id: string }).id
}

async function newCompanyId(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO companies (name, name_normalized, updated_at)
    VALUES (${name}, ${name.toLowerCase()}, CURRENT_TIMESTAMP)
    RETURNING id::text AS id`
  return (rows[0] as { id: string }).id
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('migracion whatsapp_connections contra Postgres real', () => {
  it('existe exactamente una carpeta de la migracion, con su down.sql', () => {
    expect(carpetas).toHaveLength(1)
    expect(existsSync(join(migrationDir, 'down.sql'))).toBe(true)
  })

  it('R5: la tabla tiene company_id obligatorio y RLS activada y forzada', async () => {
    await inRolledBackTransaction(async (tx) => {
      const snapshot = await tableSnapshot(tx)
      const companyId = snapshot.columns.find((column) => column.column_name === 'company_id')
      expect(companyId).toMatchObject({ udt_name: 'uuid', is_nullable: 'NO' })
      expect(snapshot.rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])
      expect(snapshot.constraints.map((c) => c.def)).toEqual(
        expect.arrayContaining([
          'FOREIGN KEY (company_id) REFERENCES companies(id) ON UPDATE CASCADE ON DELETE RESTRICT',
          'FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT',
        ]),
      )
    })
  })

  it('R5: los IDs de Meta son text sin limite, el id no tiene default y no hay columna de version de clave', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { columns } = await tableSnapshot(tx)
      for (const name of ['meta_app_id', 'waba_id', 'phone_number_id']) {
        expect(columns.find((column) => column.column_name === name), name).toMatchObject({
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'NO',
        })
      }
      expect(columns.find((column) => column.column_name === 'id')?.column_default).toBeNull()
      expect(columns.map((column) => column.column_name).filter((name) => /version/i.test(name))).toEqual(
        [],
      )
    })
  })

  it('R6, R7: los dos indices unicos son parciales sobre las filas vivas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { indexes } = await tableSnapshot(tx)
      const def = (name: string) => indexes.find((index) => index.indexname === name)?.indexdef
      expect(def('whatsapp_connections_company_live_key')).toBe(
        'CREATE UNIQUE INDEX whatsapp_connections_company_live_key ON public.whatsapp_connections ' +
          'USING btree (company_id) WHERE (deleted_at IS NULL)',
      )
      expect(def('whatsapp_connections_phone_number_id_live_key')).toBe(
        'CREATE UNIQUE INDEX whatsapp_connections_phone_number_id_live_key ON public.whatsapp_connections ' +
          'USING btree (phone_number_id) WHERE (deleted_at IS NULL)',
      )
    })
  })

  it('R6: una segunda conexion viva en la misma empresa choca; con la primera borrada, entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const userId = await someUserId(tx)
      const companyId = await newCompanyId(tx, 'qc_mig_wa_a')

      expect(await failureOf(tx, INSERT_CONNECTION, companyId, 'tel-1', userId)).toBeNull()
      expect(await failureOf(tx, INSERT_CONNECTION, companyId, 'tel-2', userId)).toMatch(
        /23505[\s\S]*\(company_id\)=/,
      )

      await tx.$executeRawUnsafe(
        `UPDATE "${TABLE}" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "company_id" = $1::uuid`,
        companyId,
      )
      expect(await failureOf(tx, INSERT_CONNECTION, companyId, 'tel-1', userId)).toBeNull()
    })
  })

  it('R7: el mismo phone_number_id vivo en otra empresa choca; borrado, entra', async () => {
    await inRolledBackTransaction(async (tx) => {
      const userId = await someUserId(tx)
      const companyA = await newCompanyId(tx, 'qc_mig_wa_b')
      const companyB = await newCompanyId(tx, 'qc_mig_wa_c')

      expect(await failureOf(tx, INSERT_CONNECTION, companyA, 'tel-compartido', userId)).toBeNull()
      expect(await failureOf(tx, INSERT_CONNECTION, companyB, 'tel-compartido', userId)).toMatch(
        /23505[\s\S]*\(phone_number_id\)=/,
      )

      await tx.$executeRawUnsafe(
        `UPDATE "${TABLE}" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "company_id" = $1::uuid`,
        companyA,
      )
      expect(await failureOf(tx, INSERT_CONNECTION, companyB, 'tel-compartido', userId)).toBeNull()
    })
  })

  it('R5: el DOWN quita la tabla y los dos tipos, y el resto de tablas queda igual', async () => {
    await inRolledBackTransaction(async (tx) => {
      const tablasAntes = await publicTables(tx)
      expect(tablasAntes).toContain(TABLE)

      await applyStatements(tx, DOWN_STATEMENTS)

      const snapshot = await tableSnapshot(tx)
      expect(snapshot.columns).toEqual([])
      expect(snapshot.enums).toEqual([])
      expect(await publicTables(tx)).toEqual(tablasAntes.filter((name) => name !== TABLE))
    })
  })

  it('R5: ida, vuelta e ida dejan exactamente el mismo esquema', async () => {
    await inRolledBackTransaction(async (tx) => {
      const antes = await tableSnapshot(tx)
      expect(antes.columns.length).toBeGreaterThan(0)

      await applyStatements(tx, DOWN_STATEMENTS)
      await applyStatements(tx, UP_STATEMENTS)

      expect(await tableSnapshot(tx)).toEqual(antes)
    })
  })

  it('R5 (sensibilidad): un UP sin el FORCE deja la RLS sin forzar y el snapshot lo detecta', async () => {
    const upSinForce = UP_STATEMENTS.filter((statement) => !/FORCE ROW LEVEL SECURITY/i.test(statement))
    expect(upSinForce, 'la mutacion no quito ninguna sentencia').toHaveLength(UP_STATEMENTS.length - 1)

    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, DOWN_STATEMENTS)
      await applyStatements(tx, upSinForce)
      expect((await tableSnapshot(tx)).rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: false }])
    })
  })
})
