// T9 — Contrato estatico del SQL de la migracion `users_and_roles`.
//
// Las tres unicidades de `users` NO existen en `db/schema.prisma`: son indices unicos
// funcionales (`lower(...)`) y parciales (`WHERE deleted_at IS NULL`), que Prisma no
// modela, y viven escritos a mano aqui. Este archivo es la unica vigilancia que tienen:
// si una migracion futura los borra por drift, tiene que caer aqui.
//
// Cubre R4, R5, R6, R7, R9, R12, R14, R17 (parcial), R20, R22, R23.

import { readFileSync } from 'node:fs'
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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260806122638_users_and_roles')

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

const up = statements(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const down = statements(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${pattern}`).toHaveLength(1)
  return found[0] as string
}

/** Nombres de tabla creadas, en el orden en que aparecen. */
function createdTables(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** Nombres de tabla dropeadas, en el orden en que aparecen. */
function droppedTables(source: readonly string[]): readonly string[] {
  return source
    .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

// --- Predicados reutilizables: los mismos que usan los tests de sensibilidad de abajo ---

/** ¿El indice se define sobre `lower(columna)` y no sobre la columna cruda? (R4, R5) */
function isCaseInsensitiveIndex(statement: string, column: string): boolean {
  return new RegExp(`\\(\\s*lower\\(\\s*"?${column}"?\\s*\\)\\s*\\)`, 'i').test(statement)
}

/** ¿El indice es parcial, acotado a las filas vivas? (R22, R23) */
function isPartialOnLiveRows(statement: string): boolean {
  return /WHERE\s+"?deleted_at"?\s+IS\s+NULL\s*$/i.test(statement)
}

function uniqueIndexOnUsers(name: string): string {
  return findStatement(up, new RegExp(`^CREATE UNIQUE INDEX "?${name}"? ON "?users"?`, 'i'))
}

describe('migration.sql — indices unicos de users', () => {
  it('el indice unico de correo es sobre lower(email)', () => {
    const statement = uniqueIndexOnUsers('users_email_unique')
    expect(isCaseInsensitiveIndex(statement, 'email')).toBe(true)
    // Sin `lower(...)` la unicidad seria sensible a mayusculas y R4 quedaria sin garantia.
    expect(statement).not.toMatch(/\(\s*"?email"?\s*\)\s*(WHERE|$)/i)
  })

  it('el indice unico de username es sobre lower(username)', () => {
    const statement = uniqueIndexOnUsers('users_username_unique')
    expect(isCaseInsensitiveIndex(statement, 'username')).toBe(true)
    expect(statement).not.toMatch(/\(\s*"?username"?\s*\)\s*(WHERE|$)/i)
  })

  it('el indice unico de documento es compuesto por tipo y numero', () => {
    const statement = uniqueIndexOnUsers('users_document_unique')
    expect(statement).toMatch(/\(\s*"?document_type_code"?\s*,\s*"?document_number"?\s*\)/i)
    // Compuesto, no solo sobre el numero: por eso el mismo numero con otro tipo entra (R7).
    expect(statement).not.toMatch(/\(\s*"?document_number"?\s*\)/i)
  })

  it('los tres indices unicos son parciales con WHERE deleted_at IS NULL', () => {
    for (const name of ['users_email_unique', 'users_username_unique', 'users_document_unique']) {
      const statement = uniqueIndexOnUsers(name)
      expect(isPartialOnLiveRows(statement), `${name} debe ser parcial`).toBe(true)
    }
  })

  it('el test del indice de correo cae si alguien quita el lower(...)', () => {
    const mutado = uniqueIndexOnUsers('users_email_unique').replace(/lower\(\s*"?email"?\s*\)/i, '"email"')
    expect(isCaseInsensitiveIndex(mutado, 'email')).toBe(false)
  })

  it('el test de los indices parciales cae si alguien quita el WHERE deleted_at IS NULL', () => {
    for (const name of ['users_email_unique', 'users_username_unique', 'users_document_unique']) {
      const mutado = uniqueIndexOnUsers(name).replace(/\s*WHERE\s+"?deleted_at"?\s+IS\s+NULL\s*$/i, '')
      expect(isPartialOnLiveRows(mutado), `${name} mutado no deberia parecer parcial`).toBe(false)
    }
  })
})

describe('migration.sql — catalogo, contrasena, claves foraneas y roles', () => {
  it('la migracion inserta CC como unico tipo de documento', () => {
    const inserts = up.filter((statement) => /^INSERT INTO "?document_types"?/i.test(statement))
    expect(inserts).toHaveLength(1)
    const insert = inserts[0] as string
    expect(insert).toMatch(/VALUES\s*\(\s*'CC'\s*,/i)
    // Una sola fila: ningun segundo tuple detras del primero.
    expect(insert.match(/\(\s*'/g) ?? []).toHaveLength(1)
    expect(insert).not.toMatch(/'(TI|CE|NIT|PA|PP)'/i)
  })

  it('password_hash es TEXT sin longitud', () => {
    const createUsers = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?users"?/i)
    expect(createUsers).toMatch(/"password_hash" TEXT NOT NULL/i)
    expect(createUsers).not.toMatch(/"password_hash"\s+(VAR)?CHAR\s*\(/i)
    expect(createUsers).not.toMatch(/"password_hash"[^,]*\(\s*\d+\s*\)/i)
  })

  it('las dos claves foraneas de users son ON DELETE RESTRICT', () => {
    const foreignKeys = up.filter((statement) => /FOREIGN KEY/i.test(statement))
    expect(foreignKeys).toHaveLength(2)
    for (const foreignKey of foreignKeys) {
      expect(foreignKey, `FK sin RESTRICT: ${foreignKey}`).toMatch(/ON DELETE RESTRICT/i)
    }
    expect(foreignKeys.some((fk) => /REFERENCES "?roles"?\s*\(\s*"?id"?\s*\)/i.test(fk))).toBe(true)
    expect(
      foreignKeys.some((fk) => /REFERENCES "?document_types"?\s*\(\s*"?code"?\s*\)/i.test(fk)),
    ).toBe(true)
  })

  it('roles tiene un indice unico sobre name', () => {
    const statement = findStatement(up, /^CREATE UNIQUE INDEX "?\w+"? ON "?roles"?/i)
    expect(statement).toMatch(/\(\s*"?name"?\s*\)/i)
    // Total, no parcial: el nombre de un rol es unico siempre (roles no tiene borrado logico).
    expect(statement).not.toMatch(/WHERE/i)
  })
})

describe('scripts/db-rollback.ts — convencion de rollback', () => {
  const rollbackScript = readFileSync(join(repoRoot, 'scripts', 'db-rollback.ts'), 'utf8')

  it('el rollback aplica el down.sql y ademas deja _prisma_migrations sin la fila de la migracion', () => {
    // Sin esto, el esquema vuelve atras pero el registro de Prisma sigue diciendo
    // "aplicada", y la siguiente migracion corre sobre un estado que Prisma cree que
    // es otro. Es el bloqueo que rechazo esta feature la primera vez.
    expect(rollbackScript).toMatch(/down\.sql/)
    expect(rollbackScript).toMatch(
      /DELETE\s+FROM\s+"?_prisma_migrations"?\s+WHERE\s+migration_name\s*=\s*\$1/i,
    )
  })

  it('el rollback ya no depende de prisma migrate resolve --rolled-back, que devuelve P3012', () => {
    // Ese comando solo admite migraciones en estado fallido: sobre una aplicada con
    // exito no escribe nada. Si alguien lo reintroduce como paso ejecutable, este
    // test cae. (Se ignoran los comentarios: la cabecera explica por que se descarto.)
    const codigo = stripSqlComments(rollbackScript.replace(/^\s*\*.*$/gm, ''))
    expect(codigo).not.toMatch(/migrate['",\s]+['"]?resolve/i)
    expect(codigo).not.toMatch(/--rolled-back/)
  })
})

describe('down.sql — reversion exacta', () => {
  it('down.sql revierte exactamente lo que crea migration.sql', () => {
    const creadas = createdTables(up)
    const dropeadas = droppedTables(down)
    expect(creadas).toEqual(['document_types', 'roles', 'users'])
    expect(dropeadas).toEqual([...creadas].reverse())
    // El DOWN no hace nada mas que dropear esas tablas...
    expect(down).toHaveLength(dropeadas.length)
    // ...y en particular no toca `pgcrypto`, que puede haber creado otra migracion.
    expect(stripSqlComments(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))).not.toMatch(
      /pgcrypto/i,
    )
    expect(up.some((statement) => /CREATE EXTENSION IF NOT EXISTS pgcrypto/i.test(statement))).toBe(
      true,
    )
  })
})
