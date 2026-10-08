// Contrato estatico del SQL de la migracion del permiso de integraciones.
//
// Es una migracion de DATOS escrita a mano: Prisma no la regenera. Los literales del SQL no se
// copian aqui; se comparan con `PERMISSIONS` y `ROLE_ADMINISTRADOR` importados del barril.
//
// Cada predicado se aplica al SQL real y a una copia MUTADA EN MEMORIA: un test que no puede
// fallar no vigila nada. El archivo en disco no se toca.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_ADMINISTRADOR } from '@/lib/modules/identity'

import {
  findPermissionWriteOffenses,
  findPermissionWritesInSource,
} from '../../../guards/guard-permisos-no-administrables.test'

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

const CODIGO = 'integraciones.modificar'

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const migrationsDir = join(repoRoot, 'db', 'migrations')

const integrationsPermissionDirs = readdirSync(migrationsDir).filter((name) =>
  /_integrations_permission$/.test(name),
)
expect(
  integrationsPermissionDirs,
  'debe existir exactamente una migracion del permiso de integraciones',
).toHaveLength(1)
const migrationDirName = integrationsPermissionDirs[0] as string
const migrationDir = join(migrationsDir, migrationDirName)

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

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8').replace(/\r\n/g, '\n')

const ENTRADA = PERMISSIONS.find((permission) => permission.code === CODIGO)

// --- Predicados puros ----------------------------------------------------------------------

/** El UP son exactamente dos `INSERT`: el primero sobre `permissions` y el segundo sobre `role_permissions`. */
export function upIsTwoInsertsInOrder(sql: string): boolean {
  const todas = statements(sql)
  return (
    todas.length === 2 &&
    /^INSERT INTO "permissions"/i.test(todas[0] as string) &&
    /^INSERT INTO "role_permissions"/i.test(todas[1] as string)
  )
}

export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 2) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

/** La fila que el primer `INSERT` escribe, o `null` si no hay exactamente una. */
export function permissionRowInUp(
  sql: string,
): { code: string; module: string; action: string; description: string; updatedAt: string } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return null
  const cuerpo = /VALUES\s*(.*?)\s*ON CONFLICT/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const filas = [...cuerpo.matchAll(/\(([^()]*)\)/g)].map((match) => match[1] as string)
  if (filas.length !== 1) return null
  const fila = filas[0] as string
  const campos = [...fila.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    (match[1] as string).replace(/''/g, "'"),
  )
  return {
    code: campos[0] ?? '',
    module: campos[1] ?? '',
    action: campos[2] ?? '',
    description: campos[3] ?? '',
    updatedAt: /CURRENT_TIMESTAMP/i.test(fila) ? 'CURRENT_TIMESTAMP' : '',
  }
}

export function permissionRowMatchesTheDomain(sql: string): boolean {
  const fila = permissionRowInUp(sql)
  if (fila === null || ENTRADA === undefined) return false
  return (
    fila.code === ENTRADA.code &&
    fila.module === ENTRADA.module &&
    fila.action === ENTRADA.action &&
    fila.description === ENTRADA.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  )
}

/** El `INSERT` de `role_permissions` da el codigo solo al rol Administrador, resuelto por nombre y sin heredar. */
export function onlyTheAdministratorGetsTheCode(sql: string): boolean {
  const insert = statements(sql).find((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  if (insert === undefined) return false
  const nombres = [...insert.matchAll(/"r"\."name"\s*=\s*'([^']*)'/gi)].map((match) => match[1])
  return (
    nombres.length === 1 &&
    nombres[0] === ROLE_ADMINISTRADOR &&
    insert.includes(`'${CODIGO}'`) &&
    !/"role_permissions" AS/i.test(insert) &&
    !/\bJOIN\b/i.test(insert)
  )
}

export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /(^(ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX|TABLE|TYPE|POLICY|FUNCTION|TRIGGER)\b)|(\bADD (CONSTRAINT|COLUMN)\b)|(\bROW LEVEL SECURITY\b)/i.test(
      statement,
    ),
  )
}

/** Sentencias que escriben en `roles`: la migracion solo puede leerla. */
export function writesToRoles(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /^(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+"?roles"?\b/i.test(statement),
  )
}

/** El DOWN son exactamente los dos `DELETE` acotados, las asignaciones antes que el permiso. */
export function downDeletesAssignmentsBeforeCatalog(sql: string): boolean {
  const sentencias = statements(sql)
  return (
    sentencias.length === 2 &&
    sentencias[0] === `DELETE FROM "role_permissions" WHERE "permission_code" = '${CODIGO}'` &&
    sentencias[1] === `DELETE FROM "permissions" WHERE "code" = '${CODIGO}'`
  )
}

export function downHasOnlyBareDeletes(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  if (/CASCADE/i.test(ejecutable)) return false
  return statements(sql).every(
    (statement) => /^DELETE FROM/i.test(statement) && !/^(INSERT|UPDATE|ALTER)\b/i.test(statement),
  )
}

export function everyDeleteIsScopedToTheCode(sql: string): boolean {
  return statements(sql).every((statement) => statement.endsWith(`= '${CODIGO}'`))
}

function withReversedStatements(sql: string): string {
  return statements(sql)
    .slice()
    .reverse()
    .map((statement) => `${statement};`)
    .join('\n')
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listFiles(full) : [full]
  })
}

// --- Solo migracion y seed --------------------------------------------------------------------

describe('el permiso solo llega por esta migracion y por el seed', () => {
  it('R4: ninguna otra migracion nombra integraciones.modificar', () => {
    const queLoNombran = readdirSync(migrationsDir)
      .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
      .filter((name) =>
        ['migration.sql', 'down.sql'].some((file) => {
          const path = join(migrationsDir, name, file)
          try {
            return readFileSync(path, 'utf8').includes(CODIGO)
          } catch {
            return false
          }
        }),
      )

    expect(queLoNombran).toEqual([migrationDirName])
  })

  it('R4: ningun archivo de produccion escribe permisos salvo el adaptador del seed, y el detector caza una escritura sintetica', () => {
    expect(findPermissionWriteOffenses(repoRoot).map((offense) => offense.file)).toEqual([
      'lib/modules/identity/adapters/driven/persistence/initial-access-repository-prisma.ts',
    ])

    const moduloIntegraciones = join(repoRoot, 'lib', 'modules', 'integraciones')
    for (const file of listFiles(moduloIntegraciones).filter((f) => /\.tsx?$/.test(f))) {
      expect(findPermissionWritesInSource(readFileSync(file, 'utf8')), file).toEqual([])
    }

    const sintetico = `'use server'\nexport async function grant() {\n  await prisma.rolePermission.create({ data: { roleId: 'x', permissionCode: '${CODIGO}' } })\n}\n`
    expect(findPermissionWritesInSource(sintetico).length).toBeGreaterThan(0)
  })
})

// --- El UP ------------------------------------------------------------------------------------

describe('migration.sql — dos INSERT, solo datos', () => {
  it('R16: el UP son dos INSERT, sobre permissions y role_permissions en ese orden, y cae si se invierten', () => {
    expect(upIsTwoInsertsInOrder(upSource)).toBe(true)

    const invertido = withReversedStatements(upSource)
    expect(invertido).not.toBe(upSource)
    expect(upIsTwoInsertsInOrder(invertido)).toBe(false)
    expect(upIsTwoInsertsInOrder(`${upSource}\nDELETE FROM "permissions" WHERE "code" = 'x';`)).toBe(
      false,
    )
  })

  it('R16: la fila insertada es exactamente la entrada de PERMISSIONS, con updated_at explicito', () => {
    expect(ENTRADA).toBeDefined()
    expect(permissionRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace(ENTRADA!.description, 'Otra cosa.')
    expect(otraDescripcion).not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otroModulo = upSource.replace(`'integraciones', 'modificar'`, `'documentos', 'modificar'`)
    expect(otroModulo).not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otroModulo)).toBe(false)

    const sinUpdatedAt = upSource.replace('CURRENT_TIMESTAMP)', 'DEFAULT)')
    expect(sinUpdatedAt).not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(sinUpdatedAt)).toBe(false)
  })

  it('R16: la asignacion va solo al Administrador, por nombre y sin heredar de otro permiso', () => {
    expect(onlyTheAdministratorGetsTheCode(upSource)).toBe(true)

    const otroRol = upSource.replace(`= '${ROLE_ADMINISTRADOR}'`, `= 'Operador'`)
    expect(otroRol).not.toBe(upSource)
    expect(onlyTheAdministratorGetsTheCode(otroRol)).toBe(false)

    const heredando = upSource.replace(
      `FROM "roles" AS "r"`,
      `FROM "roles" AS "r" JOIN "role_permissions" AS "rp" ON "rp"."role_id" = "r"."id"`,
    )
    expect(heredando).not.toBe(upSource)
    expect(onlyTheAdministratorGetsTheCode(heredando)).toBe(false)
  })

  it('R17: los dos INSERT llevan ON CONFLICT ... DO NOTHING, y cae si se quita uno o pasa a DO UPDATE', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    const sinConflictoDelCatalogo = upSource.replace(/\s*ON CONFLICT \("code"\) DO NOTHING/i, '')
    expect(sinConflictoDelCatalogo).not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDelCatalogo)).toBe(false)

    const sinConflictoDeAsignacion = upSource.replace(
      /\s*ON CONFLICT \("role_id", "permission_code"\) DO NOTHING/i,
      '',
    )
    expect(sinConflictoDeAsignacion).not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDeAsignacion)).toBe(false)

    const conDoUpdate = upSource.replace(
      /ON CONFLICT \("code"\) DO NOTHING/i,
      'ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"',
    )
    expect(conDoUpdate).not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(conDoUpdate)).toBe(false)
  })

  it('R19: el UP no toca el esquema ni escribe en roles, y cae si se cuela una de las dos cosas', () => {
    expect(schemaStatements(upSource)).toEqual([])
    expect(writesToRoles(upSource)).toEqual([])

    expect(schemaStatements(`${upSource}\nALTER TABLE "permissions" ADD COLUMN "x" TEXT;`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nCREATE INDEX "x_idx" ON "permissions"("module");`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nDROP INDEX "roles_name_key";`)).toHaveLength(1)
    expect(
      schemaStatements(`${upSource}\nALTER TABLE "permissions" NO FORCE ROW LEVEL SECURITY;`),
    ).toHaveLength(1)
    expect(
      writesToRoles(`${upSource}\nUPDATE "roles" SET "description" = 'x' WHERE "name" = 'Administrador';`),
    ).toHaveLength(1)
    expect(
      writesToRoles(`${upSource}\nINSERT INTO "roles" ("name") VALUES ('Integrador');`),
    ).toHaveLength(1)
  })
})

// --- El DOWN ----------------------------------------------------------------------------------

describe('down.sql — dos DELETE acotados', () => {
  it('R20: borra primero las asignaciones y despues el permiso, y cae si se invierte', () => {
    expect(downDeletesAssignmentsBeforeCatalog(downSource)).toBe(true)

    const invertido = withReversedStatements(downSource)
    expect(invertido).not.toBe(downSource)
    expect(downDeletesAssignmentsBeforeCatalog(invertido)).toBe(false)
  })

  it('R20: cada DELETE va acotado al codigo, y cae si se le quita el WHERE a uno', () => {
    expect(everyDeleteIsScopedToTheCode(downSource)).toBe(true)

    const sinWhere = downSource.replace(
      `DELETE FROM "role_permissions" WHERE "permission_code" = '${CODIGO}';`,
      `DELETE FROM "role_permissions";`,
    )
    expect(sinWhere).not.toBe(downSource)
    expect(everyDeleteIsScopedToTheCode(sinWhere)).toBe(false)
    expect(downDeletesAssignmentsBeforeCatalog(sinWhere)).toBe(false)
  })

  it('R20: no lleva CASCADE, INSERT, UPDATE ni ALTER, ni toca el esquema', () => {
    expect(downHasOnlyBareDeletes(downSource)).toBe(true)
    expect(schemaStatements(downSource)).toEqual([])

    const conCascade = downSource.replace(`= '${CODIGO}';\n`, `= '${CODIGO}' CASCADE;\n`)
    expect(conCascade).not.toBe(downSource)
    expect(downHasOnlyBareDeletes(conCascade)).toBe(false)

    expect(
      downHasOnlyBareDeletes(`${downSource}\nUPDATE "permissions" SET "description" = 'x';`),
    ).toBe(false)
  })
})
