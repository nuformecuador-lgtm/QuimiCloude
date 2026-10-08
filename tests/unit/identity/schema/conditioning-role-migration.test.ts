// Contrato estatico del SQL de la migracion del rol Administrador de acondicionamiento.
//
// Es una migracion de DATOS escrita a mano: Prisma no la regenera y `db/schema.prisma` no la
// describe. El rol, el permiso y sus descripciones se escriben dos veces -en el dominio y en el
// SQL-; aqui nada se copia: todo se importa del barril de `identity` y se compara con el SQL.
//
// Cada afirmacion es un predicado puro aplicado al SQL real y a una copia mutada en memoria, para
// que el test pueda fallar. El archivo en disco no se toca.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  SEED_ROLES,
} from '@/lib/modules/identity'

const CODIGO = 'acondicionamiento.modificar'

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

// Por patron y no por timestamp: si la migracion se regenera con otra marca, el test la sigue.
const conditioningRoleDirs = readdirSync(migrationsDir).filter((name) => /_conditioning_role$/.test(name))
expect(conditioningRoleDirs, 'debe existir exactamente una migracion del rol de acondicionamiento').toHaveLength(1)
const migrationDir = join(migrationsDir, conditioningRoleDirs[0] as string)

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

const ROL_SEED_ROW = SEED_ROLES.find((role) => role.name === ROLE_ACONDICIONAMIENTO)
const PERMISO = PERMISSIONS.find((permission) => permission.code === CODIGO)
const CODIGOS_DEL_ROL = SEED_ROLE_PERMISSIONS[ROLE_ACONDICIONAMIENTO] ?? []

const OTROS_ROLES = [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO] as const

function quotedLiterals(fragment: string): string[] {
  return [...fragment.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] as string).replace(/''/g, "'"))
}

// --- Predicados puros ----------------------------------------------------------------------

/** ¿El UP son exactamente tres `INSERT`, sobre `roles`, `permissions` y `role_permissions`, en ese orden? */
export function upIsExactlyThreeInserts(sql: string): boolean {
  const todas = statements(sql)
  if (todas.length !== 3) return false
  const tablas = todas.map((statement) => /^INSERT INTO "(\w+)"/i.exec(statement)?.[1])
  return tablas[0] === 'roles' && tablas[1] === 'permissions' && tablas[2] === 'role_permissions'
}

/** ¿Todos los `INSERT` (y al menos tres) terminan en `ON CONFLICT (...) DO NOTHING`? */
export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length < 3) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

export function roleRowInUp(sql: string): { name: string; description: string; updatedAt: string } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "roles"/i.test(statement))
  const cuerpo = insert === undefined ? undefined : /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const campos = quotedLiterals(cuerpo)
  if (campos.length !== 2) return null
  return {
    name: campos[0] as string,
    description: campos[1] as string,
    updatedAt: /CURRENT_TIMESTAMP/i.test(cuerpo) ? 'CURRENT_TIMESTAMP' : '',
  }
}

export function roleRowMatchesTheDomain(sql: string): boolean {
  const fila = roleRowInUp(sql)
  if (fila === null || ROL_SEED_ROW === undefined) return false
  return (
    fila.name === ROL_SEED_ROW.name &&
    fila.description === ROL_SEED_ROW.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  )
}

export function permissionRowInUp(
  sql: string,
): { code: string; module: string; action: string; description: string; updatedAt: string } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  const cuerpo = insert === undefined ? undefined : /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const campos = quotedLiterals(cuerpo)
  if (campos.length !== 4) return null
  return {
    code: campos[0] as string,
    module: campos[1] as string,
    action: campos[2] as string,
    description: campos[3] as string,
    updatedAt: /CURRENT_TIMESTAMP/i.test(cuerpo) ? 'CURRENT_TIMESTAMP' : '',
  }
}

export function permissionRowMatchesTheDomain(sql: string): boolean {
  const fila = permissionRowInUp(sql)
  if (fila === null || PERMISO === undefined) return false
  return (
    fila.code === PERMISO.code &&
    fila.module === PERMISO.module &&
    fila.action === PERMISO.action &&
    fila.description === PERMISO.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  )
}

/** Rol y codigos del unico `INSERT INTO "role_permissions"`, leidos del `WHERE` y del `CROSS JOIN (VALUES ...)`. */
export function assignmentInUp(sql: string): { role: string; codes: readonly string[] } | null {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  if (inserts.length !== 1) return null
  const insert = inserts[0] as string
  const role = /WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.exec(insert)?.[1]
  const cuerpo = /CROSS JOIN \(VALUES\s*([\s\S]*?)\)\s*AS/i.exec(insert)?.[1]
  if (role === undefined || cuerpo === undefined) return null
  return { role, codes: quotedLiterals(cuerpo) }
}

export function assignmentMatchesTheSeed(sql: string): boolean {
  const asignacion = assignmentInUp(sql)
  if (asignacion === null) return false
  return asignacion.role === ROLE_ACONDICIONAMIENTO && asignacion.codes.join(',') === CODIGOS_DEL_ROL.join(',')
}

/** Sentencias de esquema: esta migracion solo escribe filas. */
export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /(^(ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX|TABLE|TYPE|POLICY|FUNCTION|TRIGGER)\b)|(\bADD (CONSTRAINT|COLUMN)\b)/i.test(
      statement,
    ),
  )
}

/** Literales exactos de otro rol de semilla en lineas ejecutables (`'Administrador'`, no el prefijo del rol nuevo). */
export function otherRoleLiterals(sql: string): readonly string[] {
  const literales = quotedLiterals(stripSqlComments(sql))
  return OTROS_ROLES.filter((rol) => literales.includes(rol))
}

export function downDeletesInDesignOrder(sql: string): boolean {
  const sentencias = statements(sql)
  if (sentencias.length !== 4) return false
  return (
    sentencias[0] === `DELETE FROM "role_permissions" WHERE "permission_code" = '${CODIGO}'` &&
    sentencias[1] ===
      `DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = '${ROLE_ACONDICIONAMIENTO}')` &&
    sentencias[2] === `DELETE FROM "permissions" WHERE "code" = '${CODIGO}'` &&
    sentencias[3] === `DELETE FROM "roles" WHERE "name" = '${ROLE_ACONDICIONAMIENTO}'`
  )
}

export function downHasOnlyBareDeletes(sql: string): boolean {
  if (/CASCADE/i.test(stripSqlComments(sql))) return false
  return statements(sql).every((statement) => /^DELETE FROM/i.test(statement))
}

function withReversedStatements(sql: string): string {
  return statements(sql)
    .slice()
    .reverse()
    .map((statement) => `${statement};`)
    .join('\n')
}

// --- El UP -----------------------------------------------------------------------------------

describe('migration.sql — tres INSERT y solo datos', () => {
  it('R7, R21: inserta en roles, permissions y role_permissions, en ese orden; cae si se cuela otra sentencia', () => {
    expect(upIsExactlyThreeInserts(upSource)).toBe(true)

    const conUnaCuarta = `${upSource}\nUPDATE "roles" SET "description" = 'x' WHERE "name" = '${ROLE_ACONDICIONAMIENTO}';`
    expect(upIsExactlyThreeInserts(conUnaCuarta)).toBe(false)

    const invertido = withReversedStatements(upSource)
    expect(upIsExactlyThreeInserts(invertido)).toBe(false)
  })

  it('R24: el UP no toca el esquema, y cae si se cuela una DDL', () => {
    expect(schemaStatements(upSource)).toEqual([])

    expect(schemaStatements(`${upSource}\nALTER TABLE "roles" ADD COLUMN "nickname" TEXT;`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nCREATE INDEX "roles_name_idx" ON "roles"("name");`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_fkey";`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nDROP POLICY "x" ON "roles";`)).toHaveLength(1)
  })

  it('R21: ninguna linea ejecutable nombra a Administrador, Operador, Empacador ni Maestro como literal exacto', () => {
    expect(otherRoleLiterals(upSource)).toEqual([])

    for (const rol of OTROS_ROLES) {
      const conOtro = `${upSource}\nINSERT INTO "role_permissions" ("role_id", "permission_code") SELECT "r"."id", '${CODIGO}' FROM "roles" AS "r" WHERE "r"."name" = '${rol}' ON CONFLICT ("role_id", "permission_code") DO NOTHING;`
      expect(otherRoleLiterals(conOtro), `no detecta el literal de ${rol}`).toEqual([rol])
    }
  })

  it('R21: un literal de otro rol dentro de un comentario no cuenta (simetrico)', () => {
    const conComentario = `-- el '${ROLE_ADMINISTRADOR}' no recibe el permiso\n${upSource}`
    expect(otherRoleLiterals(conComentario)).toEqual([])
  })
})

describe('migration.sql — idempotente', () => {
  it('R22: los tres INSERT llevan ON CONFLICT ... DO NOTHING, y cae si falta uno o pasa a DO UPDATE', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    for (const clave of ['"name"', '"code"', '"role_id", "permission_code"']) {
      const sinConflicto = upSource.replace(`\nON CONFLICT (${clave}) DO NOTHING`, '')
      expect(sinConflicto, `la mutacion no quito el ON CONFLICT (${clave})`).not.toBe(upSource)
      expect(everyInsertIgnoresConflicts(sinConflicto)).toBe(false)
    }

    const conDoUpdate = upSource.replace(
      'ON CONFLICT ("name") DO NOTHING',
      'ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"',
    )
    expect(conDoUpdate, 'la mutacion no cambio el DO NOTHING').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(conDoUpdate)).toBe(false)
  })
})

describe('migration.sql — los literales coinciden con el dominio', () => {
  it('R21: el rol insertado es ROLE_ACONDICIONAMIENTO con su descripcion de SEED_ROLES', () => {
    expect(ROL_SEED_ROW).toBeDefined()
    expect(roleRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace((ROL_SEED_ROW as { description: string }).description, 'Otra cosa.')
    expect(otraDescripcion).not.toBe(upSource)
    expect(roleRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otroNombre = upSource.replace(`('${ROLE_ACONDICIONAMIENTO}',`, "('Acondicionador',")
    expect(otroNombre).not.toBe(upSource)
    expect(roleRowMatchesTheDomain(otroNombre)).toBe(false)

    const sinTimestamp = upSource.replace(
      `'${(ROL_SEED_ROW as { description: string }).description}', CURRENT_TIMESTAMP)`,
      `'${(ROL_SEED_ROW as { description: string }).description}', DEFAULT)`,
    )
    expect(sinTimestamp).not.toBe(upSource)
    expect(roleRowMatchesTheDomain(sinTimestamp)).toBe(false)
  })

  it('R21: el permiso insertado es la entrada acondicionamiento.modificar de PERMISSIONS', () => {
    expect(PERMISO).toBeDefined()
    expect(permissionRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace((PERMISO as { description: string }).description, 'Otra cosa.')
    expect(otraDescripcion).not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otraAccion = upSource.replace(`'acondicionamiento', 'modificar'`, `'acondicionamiento', 'consultar'`)
    expect(otraAccion).not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otraAccion)).toBe(false)
  })

  it('R21: el rol nuevo recibe exactamente los codigos de SEED_ROLE_PERMISSIONS, uno a uno y en orden', () => {
    expect(CODIGOS_DEL_ROL).toEqual(['asignaciones.consultar', CODIGO])
    expect(assignmentInUp(upSource)).toEqual({ role: ROLE_ACONDICIONAMIENTO, codes: [...CODIGOS_DEL_ROL] })
    expect(assignmentMatchesTheSeed(upSource)).toBe(true)

    const soloUno = upSource.replace(`, ('${CODIGO}')`, '')
    expect(soloUno).not.toBe(upSource)
    expect(assignmentMatchesTheSeed(soloUno)).toBe(false)

    const conUnTercero = upSource.replace(`, ('${CODIGO}')`, `, ('${CODIGO}'), ('pedidos.consultar')`)
    expect(conUnTercero).not.toBe(upSource)
    expect(assignmentMatchesTheSeed(conUnTercero)).toBe(false)

    const otroRol = upSource.replace(
      `WHERE "r"."name" = '${ROLE_ACONDICIONAMIENTO}'`,
      `WHERE "r"."name" = '${ROLE_EMPACADOR}'`,
    )
    expect(otroRol).not.toBe(upSource)
    expect(assignmentMatchesTheSeed(otroRol)).toBe(false)
  })
})

// --- El DOWN ---------------------------------------------------------------------------------

describe('down.sql — cuatro DELETE acotados, en orden', () => {
  it('R25: el orden y la forma de cada DELETE son exactos, y cae si se invierte o falta uno', () => {
    expect(downDeletesInDesignOrder(downSource)).toBe(true)

    const invertido = withReversedStatements(downSource)
    expect(invertido).not.toBe(downSource)
    expect(downDeletesInDesignOrder(invertido)).toBe(false)

    const sinUnDelete = downSource.replace(`DELETE FROM "permissions" WHERE "code" = '${CODIGO}';\n`, '')
    expect(sinUnDelete).not.toBe(downSource)
    expect(downDeletesInDesignOrder(sinUnDelete)).toBe(false)
  })

  it('R25: el segundo DELETE va acotado con un WHERE, y cae si se le quita', () => {
    const sinWhere = downSource.replace(
      `DELETE FROM "role_permissions"\nWHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = '${ROLE_ACONDICIONAMIENTO}');`,
      'DELETE FROM "role_permissions";',
    )
    expect(sinWhere).not.toBe(downSource)
    expect(downDeletesInDesignOrder(sinWhere)).toBe(false)
  })

  it('R25: el DOWN solo borra: sin CASCADE, INSERT, UPDATE ni ALTER', () => {
    expect(downHasOnlyBareDeletes(downSource)).toBe(true)

    const conCascade = downSource.replace(
      `DELETE FROM "roles" WHERE "name" = '${ROLE_ACONDICIONAMIENTO}';`,
      `DELETE FROM "roles" WHERE "name" = '${ROLE_ACONDICIONAMIENTO}' CASCADE;`,
    )
    expect(conCascade).not.toBe(downSource)
    expect(downHasOnlyBareDeletes(conCascade)).toBe(false)

    expect(downHasOnlyBareDeletes(`${downSource}\nUPDATE "roles" SET "name" = 'x';`)).toBe(false)
  })

  it('R24, R25: el DOWN no toca el esquema ni nombra a otro rol', () => {
    expect(schemaStatements(downSource)).toEqual([])
    expect(otherRoleLiterals(downSource)).toEqual([])
  })
})
