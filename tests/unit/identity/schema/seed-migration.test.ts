// T5 — Contrato estatico de la columna `must_change_credential` (QC-6).
//
// Cubre R10 (la columna existe con su `@map`, su `@default(false)` y su
// `NOT NULL DEFAULT false`, y toda fila existente queda en "no obligado") y R11 (la
// migracion que la anade es aditiva, no toca nada mas, y trae su `down.sql` que la
// elimina y solo a ella).

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

/** Quita comentarios `--` y `/* *\/`: lo que se afirma es SQL ejecutable, no prosa. */
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

const schemaPrisma = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

describe('db/schema.prisma — campo mustChangeCredential (R10)', () => {
  it('declara mustChangeCredential con @default(false) y @map("must_change_credential")', () => {
    expect(schemaPrisma).toMatch(
      /mustChangeCredential\s+Boolean\s+@default\(false\)\s+@map\("must_change_credential"\)/,
    )
  })

  it('no contiene ningun identificador mustChangePassword ni must_change_password', () => {
    expect(schemaPrisma).not.toMatch(/mustChangePassword/i)
    expect(schemaPrisma).not.toMatch(/must_change_password/i)
  })
})

const migrationsRoot = join(repoRoot, 'db', 'migrations')

/** La carpeta de la migracion nueva, localizada por su sufijo de nombre. */
function findMigrationDir(suffix: string): string {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
  expect(matches, `se esperaba una sola carpeta *${suffix}`).toHaveLength(1)
  return join(migrationsRoot, matches[0] as string)
}

describe('migracion user_must_change_credential — localizacion (R11)', () => {
  it('existe exactamente una carpeta de migracion terminada en _user_must_change_credential', () => {
    const dir = findMigrationDir('_user_must_change_credential')
    expect(dir).toMatch(/_user_must_change_credential$/)
  })
})

const migrationDir = findMigrationDir('_user_must_change_credential')
const migrationSql = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const up = statements(migrationSql)

describe('migration.sql — aditiva y nada mas (R11)', () => {
  it('contiene el ADD COLUMN must_change_credential BOOLEAN NOT NULL DEFAULT false', () => {
    expect(up.some((statement) => /^ALTER TABLE\s+"?users"?\s+ADD COLUMN\s+"?must_change_credential"?\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+false$/i.test(statement))).toBe(true)
  })

  it('no contiene ningun DROP ni ningun CREATE TABLE', () => {
    expect(up.some((statement) => /\bDROP\b/i.test(statement))).toBe(false)
    expect(up.some((statement) => /^CREATE TABLE/i.test(statement))).toBe(false)
  })
})

const downSql = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const down = statements(downSql)

describe('down.sql — elimina solo esa columna (R11)', () => {
  it('existe y elimina must_change_credential', () => {
    expect(down.some((statement) => /DROP COLUMN\s+(?:IF EXISTS\s+)?"?must_change_credential"?/i.test(statement))).toBe(true)
  })

  it('no contiene ningun DROP TABLE ni DROP INDEX', () => {
    expect(down.some((statement) => /DROP TABLE/i.test(statement))).toBe(false)
    expect(down.some((statement) => /DROP INDEX/i.test(statement))).toBe(false)
  })

  it('su unica sentencia (ignorando comentarios) es el DROP COLUMN', () => {
    expect(down).toHaveLength(1)
    expect(down[0]).toMatch(/^ALTER TABLE\s+"?users"?\s+DROP COLUMN\s+(?:IF EXISTS\s+)?"?must_change_credential"?$/i)
  })
})

describe('migration.sql de 20260806122638_users_and_roles — conserva sus tres indices (control)', () => {
  it('sigue conteniendo los tres CREATE UNIQUE INDEX de users', () => {
    const original = readFileSync(
      join(migrationsRoot, '20260806122638_users_and_roles', 'migration.sql'),
      'utf8',
    )
    const originalStatements = statements(original)
    for (const name of ['users_email_unique', 'users_username_unique', 'users_document_unique']) {
      expect(
        originalStatements.some((statement) =>
          new RegExp(`^CREATE UNIQUE INDEX "?${name}"? ON "?users"?`, 'i').test(statement),
        ),
        `falta ${name}`,
      ).toBe(true)
    }
  })
})
