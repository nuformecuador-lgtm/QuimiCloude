// Contrato estatico del SQL de la migracion del rol Maestro (`*_platform_maestro_role`).
//
// Los literales del rol, los permisos y sus asignaciones se escriben dos veces -en el dominio y en
// el SQL-; aqui no se copia ninguno: se importan del barril de `identity` y se comparan con lo que
// dice el SQL. Los indices del nombre de usuario se comparan con el texto LEIDO de las migraciones
// de usuarios y roles y de empresas, no con una copia.
//
// Cada afirmacion es un predicado puro aplicado al SQL real y a una copia mutada en memoria: un
// test que no puede fallar no vigila nada (patron de `packer-role-migration.test.ts`).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  SEED_ROLES,
} from '@/lib/modules/identity'

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
const todasLasMigraciones = readdirSync(migrationsDir).filter((name) => /^\d{14}_/.test(name))

/** Localiza una carpeta por patron, no por su timestamp: si se regenera, el test la sigue. */
function migrationDirMatching(pattern: RegExp): string {
  const dirs = todasLasMigraciones.filter((name) => pattern.test(name))
  expect(dirs, `debe existir exactamente una migracion que case con ${pattern}`).toHaveLength(1)
  return join(migrationsDir, dirs[0] as string)
}

const maestroDir = migrationDirMatching(/_platform_maestro_role$/)
const usersAndRolesDir = migrationDirMatching(/_users_and_roles$/)
const companiesDir = migrationDirMatching(/_companies_and_user_company$/)

const upSource = readFileSync(join(maestroDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(maestroDir, 'down.sql'), 'utf8')
const usersAndRolesUp = readFileSync(join(usersAndRolesDir, 'migration.sql'), 'utf8')
const companiesUp = readFileSync(join(companiesDir, 'migration.sql'), 'utf8')

// --- Parser minimo ----------------------------------------------------------------------------

/** Quita comentarios `--` fuera de literales; el SQL de estas migraciones no usa `/* *\/`. */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let enLiteral = false
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (ch === "'") enLiteral = !enLiteral
        if (!enLiteral && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

/**
 * Sentencias ejecutables, con espacios normalizados. Respeta los bloques `$tag$ ... $tag$` (el
 * `DO` de la guardia y el cuerpo del disparador llevan `;` dentro) y los literales entre comillas.
 */
export function statements(sql: string): readonly string[] {
  const limpio = stripSqlComments(sql)
  const out: string[] = []
  let actual = ''
  let dolar: string | null = null
  let enLiteral = false
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i] as string
    if (dolar === null && !enLiteral && ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(limpio.slice(i))?.[0]
      if (tag !== undefined) {
        dolar = tag
        actual += tag
        i += tag.length - 1
        continue
      }
    } else if (dolar !== null && limpio.startsWith(dolar, i)) {
      actual += dolar
      i += dolar.length - 1
      dolar = null
      continue
    }
    if (dolar === null && ch === "'") enLiteral = !enLiteral
    if (dolar === null && !enLiteral && ch === ';') {
      out.push(actual)
      actual = ''
      continue
    }
    actual += ch
  }
  out.push(actual)
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 0)
}

/** Que hace cada sentencia, en una etiqueta corta: el orden se afirma sobre esto. */
export function kindOf(statement: string): string {
  if (/^DO \$\$/i.test(statement)) return 'guardia'
  if (/^ALTER TABLE "users" ALTER COLUMN "company_id" DROP NOT NULL$/i.test(statement)) return 'drop-not-null'
  if (/^ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL$/i.test(statement)) return 'set-not-null'
  const insert = /^INSERT INTO "(\w+)"/i.exec(statement)
  if (insert) return `insert:${insert[1]}`
  const del = /^DELETE FROM "(\w+)"/i.exec(statement)
  if (del) return `delete:${del[1]}`
  if (/^CREATE OR REPLACE FUNCTION users_check_company_by_role\(\)/i.test(statement)) return 'funcion'
  if (/^CREATE TRIGGER "users_check_company_by_role_trigger"/i.test(statement)) return 'trigger'
  if (/^DROP TRIGGER "users_check_company_by_role_trigger" ON "users"$/i.test(statement)) return 'drop-trigger'
  if (/^DROP FUNCTION users_check_company_by_role\(\)$/i.test(statement)) return 'drop-funcion'
  const createIndex = /^CREATE UNIQUE INDEX "(\w+)"/i.exec(statement)
  if (createIndex) return `create-index:${createIndex[1]}`
  const dropIndex = /^DROP INDEX "(\w+)"$/i.exec(statement)
  if (dropIndex) return `drop-index:${dropIndex[1]}`
  return `otra:${statement.slice(0, 40)}`
}

const UP_ORDER = [
  'guardia',
  'drop-not-null',
  'insert:roles',
  'insert:permissions',
  'insert:role_permissions',
  'funcion',
  'trigger',
  'drop-index:users_username_unique',
  'create-index:users_username_unique',
  'create-index:users_email_without_company_unique',
  'create-index:users_document_without_company_unique',
]

const DOWN_ORDER = [
  'drop-index:users_document_without_company_unique',
  'drop-index:users_email_without_company_unique',
  'drop-index:users_username_unique',
  'create-index:users_username_unique',
  'drop-trigger',
  'drop-funcion',
  'set-not-null',
  'delete:role_permissions',
  'delete:role_permissions',
  'delete:permissions',
  'delete:roles',
]

export function kinds(sql: string): readonly string[] {
  return statements(sql).map(kindOf)
}

/** La sentencia `CREATE UNIQUE INDEX "users_username_unique" ...` de un SQL, normalizada. */
export function usernameIndexOf(sql: string): string | undefined {
  return statements(sql).find((s) => /^CREATE UNIQUE INDEX "users_username_unique"/i.test(s))
}

// --- Predicados de la guardia ------------------------------------------------------------------

/** ¿La PRIMERA sentencia es la guardia de nombres repetidos, con la condicion del indice global? */
export function guardIsFirstAndChecksDuplicates(sql: string): boolean {
  const primera = statements(sql)[0]
  if (primera === undefined || kindOf(primera) !== 'guardia') return false
  return (
    /GROUP BY lower\("username"\) HAVING count\(\*\) > 1/i.test(primera) &&
    /FROM "users" WHERE "deleted_at" IS NULL/i.test(primera) &&
    /RAISE EXCEPTION/i.test(primera) &&
    /USING ERRCODE = '23505'/i.test(primera)
  )
}

/** ¿El mensaje de la guardia nombra cada repetido con su numero de usuarios vivos? */
export function guardListsNamesAndCounts(sql: string): boolean {
  const primera = statements(sql)[0] ?? ''
  return (
    /string_agg\(format\('%s \(%s usuarios\)', nombre, total\)/i.test(primera) &&
    /'users_username_global: nombres de usuario repetidos entre usuarios vivos: %\. '/.test(primera)
  )
}

/** ¿Alguna sentencia del SQL escribe filas de `users` (UPDATE o DELETE)? */
export function writesUserRows(sql: string): boolean {
  return statements(sql).some((s) => /^(UPDATE "users"|DELETE FROM "users")(\s|$)/i.test(s))
}

// --- Predicados de los literales ---------------------------------------------------------------

const MAESTRO_ROW = SEED_ROLES.find((role) => role.name === ROLE_MAESTRO)
const EMPRESAS_PERMISSIONS = PERMISSIONS.filter((permission) => permission.module === 'empresas')
const CODIGOS_DEL_MAESTRO = SEED_ROLE_PERMISSIONS[ROLE_MAESTRO] ?? []

function literalsOf(fragment: string): string[] {
  return [...fragment.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] as string).replace(/''/g, "'"))
}

/** ¿El rol insertado es exactamente la fila del Maestro de `SEED_ROLES`, con `ON CONFLICT`? */
export function roleRowMatchesTheDomain(sql: string): boolean {
  const insert = statements(sql).find((s) => kindOf(s) === 'insert:roles')
  if (insert === undefined || MAESTRO_ROW === undefined) return false
  const values = /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1] ?? ''
  const campos = literalsOf(values)
  return (
    campos.length === 2 &&
    campos[0] === MAESTRO_ROW.name &&
    campos[1] === MAESTRO_ROW.description &&
    /CURRENT_TIMESTAMP/i.test(values) &&
    /ON CONFLICT \("name"\) DO NOTHING$/i.test(insert)
  )
}

/** Las filas de permisos insertadas, en orden, como `code|module|action|description`. */
export function permissionRowsInUp(sql: string): readonly string[] {
  const insert = statements(sql).find((s) => kindOf(s) === 'insert:permissions')
  if (insert === undefined || !/ON CONFLICT \("code"\) DO NOTHING$/i.test(insert)) return []
  return [...insert.matchAll(/\(\s*('(?:[^']|'')*'(?:\s*,\s*'(?:[^']|'')*'){3})\s*,\s*CURRENT_TIMESTAMP\s*\)/gi)].map(
    (m) => literalsOf(m[1] as string).join('|'),
  )
}

const PERMISOS_ESPERADOS = EMPRESAS_PERMISSIONS.map((p) => [p.code, p.module, p.action, p.description].join('|'))

/** Los roles por los que resuelve cada `INSERT INTO "role_permissions"`. */
export function roleNamesInRolePermissionInserts(sql: string): readonly string[] {
  return statements(sql)
    .filter((s) => kindOf(s) === 'insert:role_permissions')
    .map((s) => /WHERE "r"\."name" = '([^']*)'/i.exec(s)?.[1] ?? '')
}

/** Los codigos que se asignan al Maestro, leidos del `CROSS JOIN (VALUES ...)`. */
export function maestroAssignedCodes(sql: string): readonly string[] {
  const insert = statements(sql).find((s) => kindOf(s) === 'insert:role_permissions')
  if (insert === undefined || !/ON CONFLICT \("role_id", "permission_code"\) DO NOTHING$/i.test(insert)) return []
  return literalsOf(/CROSS JOIN \(VALUES\s*([\s\S]*?)\)\s*AS/i.exec(insert)?.[1] ?? '')
}

/** ¿Alguna linea ejecutable nombra a un rol de empresa? */
export function mentionsCompanyRole(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  return [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR].some((rol) => ejecutable.includes(`'${rol}'`))
}

// --- Predicados del disparador ------------------------------------------------------------------

/** El codigo de error de cada rama del disparador, leido del cuerpo de la funcion. */
export function triggerErrorCodes(sql: string): { maestroConEmpresa?: string; otroSinEmpresa?: string } {
  const funcion = statements(sql).find((s) => kindOf(s) === 'funcion') ?? ''
  const maestro = new RegExp(
    `IF role_name = '${ROLE_MAESTRO}' AND NEW\\."company_id" IS NOT NULL THEN RAISE EXCEPTION '[^']*' USING ERRCODE = '([0-9A-Z]{5})'`,
    'i',
  ).exec(funcion)?.[1]
  const otro = new RegExp(
    `IF role_name <> '${ROLE_MAESTRO}' AND NEW\\."company_id" IS NULL THEN RAISE EXCEPTION '[^']*' USING ERRCODE = '([0-9A-Z]{5})'`,
    'i',
  ).exec(funcion)?.[1]
  return { maestroConEmpresa: maestro, otroSinEmpresa: otro }
}

/** ¿El disparador es `BEFORE INSERT OR UPDATE OF "company_id", "role_id"`, por fila? */
export function triggerFiresOnCompanyAndRole(sql: string): boolean {
  const trigger = statements(sql).find((s) => kindOf(s) === 'trigger') ?? ''
  return /BEFORE INSERT OR UPDATE OF "company_id", "role_id" ON "users" FOR EACH ROW EXECUTE FUNCTION users_check_company_by_role\(\)$/i.test(
    trigger,
  )
}

// --- Predicados de los indices -------------------------------------------------------------------

/** Los indices unicos nuevos que filtran por `company_id IS NULL`, con su definicion. */
export function withoutCompanyIndexes(sql: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of statements(sql)) {
    const m = /^CREATE UNIQUE INDEX "(\w+)" ON "users" \((.*)\) WHERE "company_id" IS NULL AND "deleted_at" IS NULL$/i.exec(s)
    if (m) out[m[1] as string] = m[2] as string
  }
  return out
}

// --- Predicados del DOWN -----------------------------------------------------------------------

/** ¿El `SET NOT NULL` va antes de cualquier `DELETE`? */
export function setNotNullBeforeAnyDelete(sql: string): boolean {
  const k = kinds(sql)
  const setNotNull = k.indexOf('set-not-null')
  const primerDelete = k.findIndex((kind) => kind.startsWith('delete:'))
  return setNotNull >= 0 && primerDelete >= 0 && setNotNull < primerDelete
}

/** ¿El SQL ejecutable lleva `CASCADE`, `CREATE TABLE`, `UPDATE` o `INSERT`? */
export function downHasForbiddenStatements(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  if (/\bCASCADE\b/i.test(ejecutable) || /\bCREATE TABLE\b/i.test(ejecutable)) return true
  return statements(sql).some((s) => /^(UPDATE|INSERT)\b/i.test(s))
}

// --- Tests --------------------------------------------------------------------------------------

describe('migration.sql — orden y forma (R20, R21)', () => {
  it('R20: es la unica carpeta de la migracion del Maestro y no crea ninguna tabla', () => {
    expect(todasLasMigraciones.filter((name) => /_platform_maestro_role$/.test(name))).toHaveLength(1)
    expect(/\bCREATE TABLE\b/i.test(stripSqlComments(upSource))).toBe(false)
    expect(/\bCREATE TABLE\b/i.test(stripSqlComments(`${upSource}\nCREATE TABLE "x" ("id" INT);`))).toBe(true)
  })

  it('R21, R26-R28, R36: las sentencias del UP van exactamente en este orden', () => {
    expect(kinds(upSource)).toEqual(UP_ORDER)

    const invertido = statements(upSource).slice().reverse().map((s) => `${s};`).join('\n')
    expect(kinds(invertido)).not.toEqual(UP_ORDER)
  })

  it('el parser respeta los bloques $tag$: la guardia y la funcion salen enteras', () => {
    const guardia = statements(upSource)[0] ?? ''
    expect(guardia.startsWith('DO $$')).toBe(true)
    expect(guardia.endsWith('END $$')).toBe(true)
    const funcion = statements(upSource).find((s) => kindOf(s) === 'funcion') ?? ''
    expect(funcion.endsWith('LANGUAGE plpgsql')).toBe(true)
  })
})

describe('migration.sql — la guardia de nombres de usuario repetidos (R38, R39)', () => {
  it('R39: la guardia es la PRIMERA sentencia y cuenta lower(username) entre usuarios vivos', () => {
    expect(guardIsFirstAndChecksDuplicates(upSource)).toBe(true)

    const guardiaAlFinal = statements(upSource).slice(1).concat(statements(upSource)[0] as string)
    expect(guardIsFirstAndChecksDuplicates(guardiaAlFinal.map((s) => `${s};`).join('\n'))).toBe(false)

    const sinDeletedAt = upSource.replace('FROM "users" WHERE "deleted_at" IS NULL', 'FROM "users"')
    expect(sinDeletedAt).not.toBe(upSource)
    expect(guardIsFirstAndChecksDuplicates(sinDeletedAt)).toBe(false)

    const sinLower = upSource.replace('GROUP BY lower("username")', 'GROUP BY "username"')
    expect(sinLower).not.toBe(upSource)
    expect(guardIsFirstAndChecksDuplicates(sinLower)).toBe(false)
  })

  it('R39: el mensaje lista cada nombre con su numero de usuarios vivos', () => {
    expect(guardListsNamesAndCounts(upSource)).toBe(true)

    const soloNumero = upSource.replace("format('%s (%s usuarios)', nombre, total)", 'count(*)::text')
    expect(soloNumero).not.toBe(upSource)
    expect(guardListsNamesAndCounts(soloNumero)).toBe(false)
  })

  it('R38, R39: el UP no escribe filas de users: ni UPDATE ni DELETE', () => {
    expect(writesUserRows(upSource)).toBe(false)
    expect(writesUserRows(`${upSource}\nUPDATE "users" SET "username" = "username" || '.x';`)).toBe(true)
    expect(writesUserRows(`${upSource}\nDELETE FROM "users" WHERE "deleted_at" IS NOT NULL;`)).toBe(true)
  })
})

describe('migration.sql — rol, permisos y asignaciones salen del dominio (R21)', () => {
  it('R21: el rol insertado es exactamente la fila de ROLE_MAESTRO en SEED_ROLES', () => {
    expect(MAESTRO_ROW).toBeDefined()
    expect(roleRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace((MAESTRO_ROW as { description: string }).description, 'Otra.')
    expect(otraDescripcion).not.toBe(upSource)
    expect(roleRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const sinConflicto = upSource.replace(/\s*ON CONFLICT \("name"\) DO NOTHING/, '')
    expect(roleRowMatchesTheDomain(sinConflicto)).toBe(false)
  })

  it('R21: los permisos insertados son exactamente los empresas.* de PERMISSIONS, en su orden', () => {
    expect(PERMISOS_ESPERADOS.length).toBeGreaterThan(0)
    expect(permissionRowsInUp(upSource)).toEqual(PERMISOS_ESPERADOS)

    const otraDescripcion = upSource.replace('Consultar las empresas de la plataforma.', 'Ver empresas.')
    expect(otraDescripcion).not.toBe(upSource)
    expect(permissionRowsInUp(otraDescripcion)).not.toEqual(PERMISOS_ESPERADOS)
  })

  it('R21: el Maestro recibe exactamente SEED_ROLE_PERMISSIONS[ROLE_MAESTRO], idempotente', () => {
    expect(maestroAssignedCodes(upSource)).toEqual([...CODIGOS_DEL_MAESTRO])
    expect(roleNamesInRolePermissionInserts(upSource)).toEqual([ROLE_MAESTRO])

    const soloUno = upSource.replace(", ('empresas.modificar')", '')
    expect(soloUno).not.toBe(upSource)
    expect(maestroAssignedCodes(soloUno)).not.toEqual([...CODIGOS_DEL_MAESTRO])
  })

  it('R21: ninguna sentencia ejecutable nombra a otro rol: sus asignaciones no cambian', () => {
    expect(mentionsCompanyRole(upSource)).toBe(false)
    const conAdmin = `${upSource}\nINSERT INTO "role_permissions" ("role_id", "permission_code") SELECT "r"."id", 'empresas.consultar' FROM "roles" AS "r" WHERE "r"."name" = '${ROLE_ADMINISTRADOR}';`
    expect(mentionsCompanyRole(conAdmin)).toBe(true)
    expect(roleNamesInRolePermissionInserts(conAdmin)).not.toEqual([ROLE_MAESTRO])
  })
})

describe('migration.sql — empresa segun rol (R26, R27)', () => {
  it('R26, R27: 23514 para el Maestro con empresa y 23502 para otro rol sin ella', () => {
    expect(triggerErrorCodes(upSource)).toEqual({ maestroConEmpresa: '23514', otroSinEmpresa: '23502' })

    const otroCodigo = upSource.replace("USING ERRCODE = '23502'", "USING ERRCODE = 'P0001'")
    expect(otroCodigo).not.toBe(upSource)
    expect(triggerErrorCodes(otroCodigo).otroSinEmpresa).toBe('P0001')
  })

  it('R26, R27: salta al insertar y al cambiar company_id o role_id, por fila', () => {
    expect(triggerFiresOnCompanyAndRole(upSource)).toBe(true)

    const soloInsert = upSource.replace('BEFORE INSERT OR UPDATE OF "company_id", "role_id"', 'BEFORE INSERT')
    expect(soloInsert).not.toBe(upSource)
    expect(triggerFiresOnCompanyAndRole(soloInsert)).toBe(false)

    const sinRol = upSource.replace('UPDATE OF "company_id", "role_id"', 'UPDATE OF "company_id"')
    expect(triggerFiresOnCompanyAndRole(sinRol)).toBe(false)
  })
})

describe('migration.sql — los indices (R28, R36, R37)', () => {
  it('R36: users_username_unique del UP es el texto leido de la migracion de usuarios y roles', () => {
    const deUsuariosYRoles = usernameIndexOf(usersAndRolesUp)
    expect(deUsuariosYRoles).toBeDefined()
    expect(usernameIndexOf(upSource)).toBe(deUsuariosYRoles)

    const porEmpresa = upSource.replace(
      'ON "users" (lower("username")) WHERE "deleted_at" IS NULL',
      'ON "users" ("company_id", lower("username")) WHERE "deleted_at" IS NULL',
    )
    expect(porEmpresa).not.toBe(upSource)
    expect(usernameIndexOf(porEmpresa)).not.toBe(deUsuariosYRoles)
  })

  it('R28: dos indices parciales sin empresa (correo y documento) y ninguno de nombre de usuario', () => {
    expect(withoutCompanyIndexes(upSource)).toEqual({
      users_email_without_company_unique: 'lower("email")',
      users_document_without_company_unique: '"document_type_code", "document_number"',
    })

    const conUsername = `${upSource}\nCREATE UNIQUE INDEX "users_username_without_company_unique" ON "users" (lower("username")) WHERE "company_id" IS NULL AND "deleted_at" IS NULL;`
    expect(Object.keys(withoutCompanyIndexes(conUsername))).toContain('users_username_without_company_unique')
  })

  it('R37: el UP no toca los indices por empresa de correo y documento', () => {
    const tocados = kinds(upSource).filter((k) => /users_(email|document)_unique$/.test(k))
    expect(tocados).toEqual([])
    expect(kinds(`${upSource}\nDROP INDEX "users_email_unique";`).filter((k) => /users_email_unique$/.test(k))).toHaveLength(1)
  })
})

describe('down.sql — reversion (R22)', () => {
  it('R22: las sentencias del DOWN van exactamente en orden inverso', () => {
    expect(kinds(downSource)).toEqual(DOWN_ORDER)
  })

  it('R22: users_username_unique del DOWN es el texto leido de la migracion de empresas', () => {
    const deEmpresas = usernameIndexOf(companiesUp)
    expect(deEmpresas).toBeDefined()
    expect(usernameIndexOf(downSource)).toBe(deEmpresas)
    expect(usernameIndexOf(downSource)).not.toBe(usernameIndexOf(upSource))
  })

  it('R22: el SET NOT NULL va antes de cualquier DELETE, y cae si se mueve detras', () => {
    expect(setNotNullBeforeAnyDelete(downSource)).toBe(true)

    const sentencias = statements(downSource)
    const sinSet = sentencias.filter((s) => kindOf(s) !== 'set-not-null')
    const alFinal = [...sinSet, 'ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL'].map((s) => `${s};`).join('\n')
    expect(setNotNullBeforeAnyDelete(alFinal)).toBe(false)
  })

  it('R22: sin CASCADE, sin CREATE TABLE, sin UPDATE ni INSERT', () => {
    expect(downHasForbiddenStatements(downSource)).toBe(false)
    expect(downHasForbiddenStatements(downSource.replace(`WHERE "name" = 'Maestro';`, `WHERE "name" = 'Maestro' CASCADE;`))).toBe(true)
    expect(downHasForbiddenStatements(`${downSource}\nUPDATE "users" SET "company_id" = NULL;`)).toBe(true)
  })

  it('R22: el DOWN borra solo el rol Maestro y los empresas.*', () => {
    const deletes = statements(downSource).filter((s) => s.startsWith('DELETE'))
    expect(deletes.every((s) => s.includes(`'${ROLE_MAESTRO}'`) || /'empresas\.(consultar|modificar)'/.test(s))).toBe(true)
    expect(mentionsCompanyRole(downSource)).toBe(false)
  })
})
