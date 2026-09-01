// T9 — Contrato estatico del SQL de la migracion `users_and_roles`.
//
// Las tres unicidades de `users` NO existen en `db/schema.prisma`: son indices unicos
// funcionales (`lower(...)`) y parciales (`WHERE deleted_at IS NULL`), que Prisma no
// modela, y viven escritos a mano aqui. Este archivo es la unica vigilancia que tienen:
// si una migracion futura los borra por drift, tiene que caer aqui.
//
// Cubre R4, R5, R6, R7, R9, R12, R14, R17 (parcial), R20, R22, R23.

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260806122638_users_and_roles')

/** Quita comentarios `--` y `/* *\/`: lo que se afirma es SQL ejecutable, no prosa. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Quita comentarios de TypeScript: bloques y comentarios de linea `//`.
 *
 * No sirve `stripSqlComments` para un archivo `.ts`: ese borra todo lo que sigue a un
 * `--`, con lo que la bandera `--rolled-back` que se vigila mas abajo jamas podria
 * sobrevivir al filtro y el assert seria vacuo.
 *
 * Caso ambiguo asumido a proposito: un `//` dentro de una cadena (p. ej. una URL)
 * se comeria el resto de esa linea. `scripts/db-rollback.ts` no tiene ninguno, y el
 * efecto solo puede hacer la guardia mas laxa en esa linea, nunca inventar una
 * deteccion. Un parser de TypeScript aqui seria desproporcionado.
 */
function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
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

/**
 * ¿El script de rollback invoca `prisma migrate resolve --rolled-back` como codigo
 * ejecutable? Se mira solo el codigo: la cabecera del script menciona el comando en
 * prosa para documentar por que se descarto, y esa mencion es legitima.
 */
function dependeDeMigrateResolve(script: string): boolean {
  const codigo = stripTsComments(script)
  return /migrate['",\s]+['"]?resolve/i.test(codigo) || /--rolled-back/.test(codigo)
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
    expect(dependeDeMigrateResolve(rollbackScript)).toBe(false)
  })

  it('la guardia del rollback cae si alguien reintroduce migrate resolve --rolled-back como codigo', () => {
    // Mutacion en memoria: el archivo en disco no se toca.
    const mutado = rollbackScript.replace(
      "    await client.query('COMMIT')",
      "    runPnpmExec(['prisma', 'migrate', 'resolve', '--rolled-back', migration])\n" +
        "    await client.query('COMMIT')",
    )
    expect(mutado, 'la mutacion no se aplico: cambio el texto del script').not.toBe(rollbackScript)
    expect(dependeDeMigrateResolve(mutado)).toBe(true)

    // Las dos mitades del predicado, cada una por separado. Se comprueba sobre el
    // codigo sin comentarios: la cabecera del script nombra las dos cosas en prosa.
    const soloResolve = mutado.replace("'--rolled-back', ", '')
    expect(stripTsComments(soloResolve)).not.toMatch(/--rolled-back/)
    expect(dependeDeMigrateResolve(soloResolve)).toBe(true)

    const soloBandera = mutado.replace("'migrate', 'resolve', ", '')
    expect(stripTsComments(soloBandera)).not.toMatch(/migrate['",\s]+['"]?resolve/i)
    expect(dependeDeMigrateResolve(soloBandera)).toBe(true)
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

// --- QC-7 / R30 — migracion del bloqueo temporal de cuenta ---------------------------
//
// Tres columnas nuevas en `users` (`design.md > 5.6`). No hay tabla nueva ni indice, asi
// que lo unico que hay que vigilar es que el UP anada exactamente esas tres y que el DOWN
// las quite exactamente, en orden inverso: un `down.sql` que no revierte el UP es peor que
// no tenerlo, porque da confianza falsa.

const migrationsRoot = join(repoRoot, 'db', 'migrations')

/** La carpeta de la migracion del bloqueo, localizada por su sufijo de nombre. */
function findMigrationDir(suffix: string): string {
  const matches = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
  expect(matches, `se esperaba una sola carpeta *${suffix}`).toHaveLength(1)
  return join(migrationsRoot, matches[0] as string)
}

const lockoutDir = findMigrationDir('_user_login_lockout')
const lockoutUp = statements(readFileSync(join(lockoutDir, 'migration.sql'), 'utf8'))
const lockoutDown = statements(readFileSync(join(lockoutDir, 'down.sql'), 'utf8'))

/** Columnas anadidas por un `ALTER TABLE ... ADD COLUMN`, en orden de aparicion. */
function addedColumns(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) =>
    [...statement.matchAll(/ADD COLUMN\s+"?(\w+)"?/gi)].map((match) => match[1] as string),
  )
}

/** Columnas eliminadas por un `ALTER TABLE ... DROP COLUMN`, en orden de aparicion. */
function droppedColumns(source: readonly string[]): readonly string[] {
  return source.flatMap((statement) =>
    [...statement.matchAll(/DROP COLUMN\s+(?:IF EXISTS\s+)?"?(\w+)"?/gi)].map(
      (match) => match[1] as string,
    ),
  )
}

const LOCKOUT_COLUMNS = ['failed_login_attempts', 'lock_level', 'locked_until'] as const

describe('user_login_lockout — migration.sql (R30)', () => {
  it('el UP anade las tres columnas de bloqueo a users y nada mas', () => {
    expect(addedColumns(lockoutUp)).toEqual([...LOCKOUT_COLUMNS])
    // Todas las sentencias son ALTER TABLE sobre `users`: ni tabla nueva, ni indice, ni
    // drift de otro modelo colado por Prisma.
    for (const statement of lockoutUp) {
      expect(statement, `sentencia inesperada: ${statement}`).toMatch(
        /^ALTER TABLE "?users"? /i,
      )
    }
    expect(lockoutUp.some((statement) => /CREATE (TABLE|INDEX|UNIQUE)/i.test(statement))).toBe(false)
  })

  it('los dos contadores entran NOT NULL con DEFAULT 0 y el fin de bloqueo es timestamptz nulable', () => {
    const up = lockoutUp.join(' ')
    // Sin DEFAULT, un NOT NULL sobre una tabla con filas no aplica: la migracion tiene que
    // poder correr sobre datos existentes sin backfill (`design.md > 5.6`).
    expect(up).toMatch(/"failed_login_attempts" INTEGER NOT NULL DEFAULT 0/i)
    expect(up).toMatch(/"lock_level" INTEGER NOT NULL DEFAULT 0/i)
    expect(up).toMatch(/"locked_until" TIMESTAMPTZ\(6\)/i)
    // Nulable a proposito: NULL = sin bloqueo vigente.
    expect(up).not.toMatch(/"locked_until"[^,]*NOT NULL/i)
    // `timestamptz`, no `timestamp` a secas: un bloqueo en hora local se descuadra dos
    // veces al ano.
    expect(up).not.toMatch(/"locked_until" TIMESTAMP\(/i)
  })
})

describe('user_login_lockout — down.sql (R30)', () => {
  it('el DOWN dropea las tres columnas y nada mas', () => {
    expect(droppedColumns(lockoutDown)).toHaveLength(3)
    expect([...droppedColumns(lockoutDown)].sort()).toEqual([...LOCKOUT_COLUMNS].sort())
    for (const statement of lockoutDown) {
      expect(statement, `sentencia inesperada en el DOWN: ${statement}`).toMatch(
        /^ALTER TABLE "?users"? DROP COLUMN /i,
      )
    }
    // No toca la tabla ni el RLS: revertir columnas no es revertir QC-4.
    expect(lockoutDown.some((statement) => /DROP TABLE|ROW LEVEL SECURITY/i.test(statement))).toBe(
      false,
    )
  })

  it('el DOWN revierte exactamente el UP, en orden inverso', () => {
    const anadidas = addedColumns(lockoutUp)
    expect(droppedColumns(lockoutDown)).toEqual([...anadidas].reverse())
    // Simetria de tamano: ninguna sentencia de mas en el DOWN.
    expect(lockoutDown).toHaveLength(anadidas.length)
  })

  it('la guardia de simetria cae si el DOWN se olvida de una columna', () => {
    // Mutacion en memoria: el archivo en disco no se toca.
    const mutado = lockoutDown.filter((statement) => !/locked_until/i.test(statement))
    expect(mutado.length, 'la mutacion no quito nada').toBeLessThan(lockoutDown.length)
    expect(droppedColumns(mutado)).not.toEqual([...addedColumns(lockoutUp)].reverse())
  })
})
