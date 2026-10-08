// La migracion `db/migrations/*_integrations_permission/` contra Postgres real.
//
// Cada caso corre dentro de una transaccion interactiva que termina en ROLLBACK. El SQL se lee de
// los archivos, no se copia: si alguien le quita un `ON CONFLICT` o reordena el `down.sql`, esto lo
// nota aplicando el SQL real. La «base anterior a la migracion» se simula dentro de la transaccion
// borrando el permiso y sus asignaciones.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
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

function locateMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) => /_integrations_permission$/.test(name))
  expect(carpetas, 'debe existir exactamente una migracion del permiso de integraciones').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

function statementsOf(sql: string): readonly string[] {
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

const migrationDir = locateMigrationDir()
const UP_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN_STATEMENTS = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

expect(UP_STATEMENTS, 'el UP son exactamente dos sentencias').toHaveLength(2)
expect(DOWN_STATEMENTS, 'el DOWN son exactamente dos sentencias').toHaveLength(2)

async function applyStatements(
  tx: Prisma.TransactionClient,
  statements: readonly string[],
): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

const CODIGO = 'integraciones.modificar'

const ENTRADA = PERMISSIONS.find((permission) => permission.code === CODIGO)
if (ENTRADA === undefined) {
  throw new Error(`PERMISSIONS no declara ${CODIGO}: este archivo no puede afirmar sobre su fila`)
}

async function eraseFeatureRows(tx: Prisma.TransactionClient): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { permissionCode: CODIGO } })
  await tx.permission.deleteMany({ where: { code: CODIGO } })
}

async function fullSnapshot(tx: Prisma.TransactionClient) {
  return {
    permissions: await tx.permission.findMany({ orderBy: { code: 'asc' } }),
    rolePermissions: await tx.rolePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
    }),
    roles: await tx.role.findMany({ orderBy: { id: 'asc' } }),
  }
}

/** Las asignaciones de todos los roles salvo el Administrador, en orden estable. */
async function assignmentsOfOtherRoles(tx: Prisma.TransactionClient) {
  return tx.rolePermission.findMany({
    where: { role: { name: { not: ROLE_ADMINISTRADOR } } },
    orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
  })
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('migracion integrations_permission contra Postgres real', () => {
  it('R16: sobre una base sembrada sin el permiso, el UP crea la fila del catalogo y una sola asignacion, al Administrador', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx)
      const antes = await fullSnapshot(tx)
      const otrosAntes = await assignmentsOfOtherRoles(tx)
      expect(otrosAntes.length).toBeGreaterThan(0)

      await applyStatements(tx, UP_STATEMENTS)

      const fila = await tx.permission.findUnique({ where: { code: CODIGO } })
      expect(fila).toMatchObject({
        code: ENTRADA.code,
        module: ENTRADA.module,
        action: ENTRADA.action,
        description: ENTRADA.description,
      })

      const asignaciones = await tx.rolePermission.findMany({
        where: { permissionCode: CODIGO },
        include: { role: { select: { name: true } } },
      })
      expect(asignaciones.map((asignacion) => asignacion.role.name)).toEqual([ROLE_ADMINISTRADOR])

      const despues = await fullSnapshot(tx)
      expect(despues.permissions.length).toBe(antes.permissions.length + 1)
      expect(despues.rolePermissions.length).toBe(antes.rolePermissions.length + 1)
      expect(despues.roles).toEqual(antes.roles)
      expect(await assignmentsOfOtherRoles(tx)).toEqual(otrosAntes)
    })
  })

  it('R17: aplicar el UP dos veces no falla, no duplica y no reescribe ninguna fila, updated_at incluido', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx)
      await applyStatements(tx, UP_STATEMENTS)
      const trasLaPrimera = await fullSnapshot(tx)

      await applyStatements(tx, UP_STATEMENTS)

      expect(await fullSnapshot(tx)).toEqual(trasLaPrimera)
    })
  })

  it('R17: sobre una base que ya tiene el permiso y su asignacion, el UP no cambia nada', async () => {
    await inRolledBackTransaction(async (tx) => {
      expect(await tx.permission.findUnique({ where: { code: CODIGO } })).not.toBeNull()
      const antes = await fullSnapshot(tx)

      await applyStatements(tx, UP_STATEMENTS)

      expect(await fullSnapshot(tx)).toEqual(antes)
    })
  })

  it('R20: el DOWN, leido del archivo, deja la base exactamente como antes del UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      await eraseFeatureRows(tx)
      const antesDelUp = await fullSnapshot(tx)

      await applyStatements(tx, UP_STATEMENTS)
      expect(await tx.permission.findUnique({ where: { code: CODIGO } })).not.toBeNull()

      await applyStatements(tx, DOWN_STATEMENTS)

      expect(await fullSnapshot(tx)).toEqual(antesDelUp)
      expect(await tx.rolePermission.count({ where: { permissionCode: CODIGO } })).toBe(0)
    })
  })
})
