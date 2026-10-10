// Contrato estatico del SQL de la migracion del permiso de anulacion de entregas.
//
// Es una migracion de DATOS, escrita entera a mano. El permiso, su descripcion y el rol que lo
// recibe se escriben dos veces -en el dominio y en el SQL-; aqui nada se copia: todo se IMPORTA
// del barril de `identity` y se compara con lo que el SQL dice.
//
// Cada afirmacion es un PREDICADO PURO EXPORTADO que recibe el texto SQL y devuelve el veredicto,
// aplicado al SQL real y a una copia MUTADA EN MEMORIA (mismo patron que
// `packer-role-migration.test.ts`). El archivo en disco no se toca.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ADMIN_EXCLUDED_PERMISSIONS,
  PERMISSIONS,
  ROLE_ACONDICIONAMIENTO,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
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

const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
const carpetas = readdirSync(migrationsDir).filter((name) => /^\d{14}_delivery_void_permission$/.test(name))
expect(carpetas, 'debe existir exactamente una migracion del permiso de anulacion de entregas').toHaveLength(1)
const migrationDir = join(migrationsDir, carpetas[0] as string)

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

const ANULAR = 'entregas.anular'
const ANULAR_ENTRY = PERMISSIONS.find((permission) => permission.code === ANULAR)
const OTROS_ROLES = [ROLE_OPERADOR, ROLE_EMPACADOR, ROLE_MAESTRO, ROLE_ACONDICIONAMIENTO] as const

// --- Predicados puros ----------------------------------------------------------------------

/** ¿El UP son EXACTAMENTE dos `INSERT`, en `permissions` y en `role_permissions`, y nada mas? */
export function upIsExactlyTwoInserts(sql: string): boolean {
  const todas = statements(sql)
  if (todas.length !== 2) return false
  const tablas = todas.map((statement) => /^INSERT INTO "(\w+)"/i.exec(statement)?.[1])
  return tablas[0] === 'permissions' && tablas[1] === 'role_permissions'
}

/** ¿Los dos `INSERT` llevan `ON CONFLICT ... DO NOTHING`? */
export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 2) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

/** La fila del permiso que escribe el primer `INSERT`, o `null`. */
export function permissionRowInUp(
  sql: string,
): { code: string; module: string; action: string; description: string; updatedAt: boolean } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return null
  const cuerpo = /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const campos = [...cuerpo.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] as string).replace(/''/g, "'"))
  if (campos.length !== 4) return null
  return {
    code: campos[0] as string,
    module: campos[1] as string,
    action: campos[2] as string,
    description: campos[3] as string,
    updatedAt: /CURRENT_TIMESTAMP/i.test(cuerpo),
  }
}

/** ¿El permiso insertado es EXACTAMENTE la entrada `entregas.anular` de `PERMISSIONS`? */
export function permissionRowMatchesTheDomain(sql: string): boolean {
  const fila = permissionRowInUp(sql)
  if (fila === null || ANULAR_ENTRY === undefined) return false
  return (
    fila.code === ANULAR_ENTRY.code &&
    fila.module === ANULAR_ENTRY.module &&
    fila.action === ANULAR_ENTRY.action &&
    fila.description === ANULAR_ENTRY.description &&
    fila.updatedAt
  )
}

/** ¿El `INSERT` de asignaciones da el permiso al Administrador, por nombre y con `=`, y a nadie mas? */
export function onlyTheAdministratorGetsIt(sql: string): boolean {
  const insert = statements(sql).find((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  if (insert === undefined) return false
  if (!new RegExp(`'${ANULAR.replace('.', '\\.')}'`).test(insert)) return false
  if (/CROSS JOIN|\bIN\s*\(/i.test(insert)) return false
  const nombre = /WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.exec(insert)?.[1]
  return nombre === ROLE_ADMINISTRADOR && !OTROS_ROLES.some((rol) => insert.includes(`'${rol}'`))
}

/** Sentencias de esquema: esta migracion solo escribe filas. */
export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /^(ALTER|CREATE|DROP|TRUNCATE)\b/i.test(statement))
}

/** ¿El DOWN borra primero las asignaciones del permiso y despues el permiso, sin nada mas? */
export function downDeletesAssignmentsThenPermission(sql: string): boolean {
  const sentencias = statements(sql)
  if (sentencias.length !== 2) return false
  if (/CASCADE/i.test(stripSqlComments(sql))) return false
  return (
    /^DELETE FROM "role_permissions" WHERE "permission_code" = 'entregas\.anular'$/i.test(sentencias[0] as string) &&
    /^DELETE FROM "permissions" WHERE "code" = 'entregas\.anular'$/i.test(sentencias[1] as string)
  )
}

// --- El UP -----------------------------------------------------------------------------------

describe('delivery_void_permission migration.sql', () => {
  it('R1: es EXACTAMENTE dos INSERT (permiso y asignacion), y cae si se cuela otra sentencia', () => {
    expect(upIsExactlyTwoInserts(upSource)).toBe(true)
    expect(upIsExactlyTwoInserts(`${upSource}\nUPDATE "permissions" SET "description" = 'x';`)).toBe(false)
  })

  it('R1: no toca el esquema, y cae si se cuela un ALTER', () => {
    expect(schemaStatements(upSource)).toEqual([])
    expect(schemaStatements(`${upSource}\nALTER TABLE "permissions" ADD COLUMN "x" TEXT;`)).toHaveLength(1)
  })

  it('R1: los dos INSERT son idempotentes por ON CONFLICT ... DO NOTHING, y cae si falta uno', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    const sinConflicto = upSource.replace(/\s*ON CONFLICT \("code"\) DO NOTHING/i, '')
    expect(sinConflicto, 'la mutacion no quito el ON CONFLICT').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflicto)).toBe(false)
  })

  it('R1: el permiso insertado es EXACTAMENTE la entrada de PERMISSIONS, con updated_at explicito', () => {
    expect(ANULAR_ENTRY).toBeDefined()
    expect(permissionRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace((ANULAR_ENTRY as { description: string }).description, 'Otra cosa.')
    expect(otraDescripcion, 'la mutacion no cambio la descripcion').not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otroModulo = upSource.replace(`'entregas', 'anular'`, `'pedidos', 'anular'`)
    expect(otroModulo, 'la mutacion no cambio el modulo').not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otroModulo)).toBe(false)
  })

  it('R1: solo el Administrador lo recibe, resuelto por nombre, y cae si se suma otro rol', () => {
    expect(onlyTheAdministratorGetsIt(upSource)).toBe(true)

    const conOperador = upSource.replace(
      `"r"."name" = '${ROLE_ADMINISTRADOR}'`,
      `"r"."name" IN ('${ROLE_ADMINISTRADOR}', '${ROLE_OPERADOR}')`,
    )
    expect(conOperador, 'la mutacion no sumo al Operador').not.toBe(upSource)
    expect(onlyTheAdministratorGetsIt(conOperador)).toBe(false)
  })

  it('R1: el seed del dominio coincide: el Administrador lo tiene, ningun otro rol, y no esta excluido', () => {
    expect(SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR]).toContain(ANULAR)
    for (const rol of OTROS_ROLES) {
      expect(SEED_ROLE_PERMISSIONS[rol] ?? [], rol).not.toContain(ANULAR)
    }
    expect(ADMIN_EXCLUDED_PERMISSIONS as readonly string[]).not.toContain(ANULAR)
  })
})

// --- El DOWN ---------------------------------------------------------------------------------

describe('delivery_void_permission down.sql', () => {
  it('R1: borra las asignaciones y luego el permiso, sin CASCADE, y cae si se invierte el orden', () => {
    expect(downDeletesAssignmentsThenPermission(downSource)).toBe(true)

    const invertido = statements(downSource).slice().reverse().map((s) => `${s};`).join('\n')
    expect(downDeletesAssignmentsThenPermission(invertido)).toBe(false)
    expect(downDeletesAssignmentsThenPermission(`${downSource}\nDELETE FROM "roles" CASCADE;`)).toBe(false)
  })

  it('R1: el DOWN no toca el esquema', () => {
    expect(schemaStatements(downSource)).toEqual([])
  })
})
