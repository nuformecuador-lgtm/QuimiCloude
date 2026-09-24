// T12 — La migracion `db/migrations/20260924120000_customers/` contra Postgres REAL.
//
// AISLAMIENTO — mismo patron que `identity/packer-role-migration.int.test.ts`: cada `it` corre
// dentro de `prisma.$transaction` interactiva y termina lanzando `RollbackSignal`.
//
// EL SQL SE LEE DEL ARCHIVO, no se copia a mano.
//
// SAVEPOINTS — ninguna operacion de este archivo se espera que falle salvo el caso sintetico de
// `down.sql` roto, que va aparte y sin transaccion contra la base porque muta el SQL EN MEMORIA,
// no la base.
//
// Cubre R18, R23, R24.
import { readdirSync, readFileSync } from 'node:fs'
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

function locateCustomersMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) => /_customers$/.test(name))
  expect(carpetas, 'debe existir exactamente una migracion de customers').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

const migrationDir = locateCustomersMigrationDir()

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

const UP_SOURCE = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const DOWN_SOURCE = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const UP_STATEMENTS = statementsOf(UP_SOURCE)
const DOWN_STATEMENTS = statementsOf(DOWN_SOURCE)

async function applyStatements(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

const CLIENTES_CONSULTAR = 'clientes.consultar'
const CLIENTES_MODIFICAR = 'clientes.modificar'
const CODIGOS_CLIENTES = [CLIENTES_CONSULTAR, CLIENTES_MODIFICAR]

async function permissionsSnapshot(tx: Prisma.TransactionClient) {
  return tx.permission.findMany({
    where: { code: { notIn: CODIGOS_CLIENTES } },
    orderBy: { code: 'asc' },
  })
}

async function rolePermissionsSnapshot(tx: Prisma.TransactionClient) {
  return tx.rolePermission.findMany({
    where: { permissionCode: { notIn: CODIGOS_CLIENTES } },
    orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
  })
}

async function customersTableExists(tx: Prisma.TransactionClient): Promise<boolean> {
  const rows = await tx.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers'`
  return rows.length === 1
}

async function rolesWithClientesPermission(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<readonly string[]> {
  const rows = await tx.rolePermission.findMany({
    where: { permissionCode: code },
    select: { role: { select: { name: true } } },
  })
  return rows.map((row) => row.role.name).sort()
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('migracion customers contra Postgres real', () => {
  it('R18: el DOWN deja sin tabla, sin los dos permisos ni sus asignaciones, y el resto del catalogo intacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      // La base efimera ya tiene esta migracion aplicada (globalSetup): se parte de ahi.
      expect(await customersTableExists(tx)).toBe(true)

      const permissionsAntes = await permissionsSnapshot(tx)
      const rolePermissionsAntes = await rolePermissionsSnapshot(tx)

      await applyStatements(tx, DOWN_STATEMENTS)

      expect(await customersTableExists(tx)).toBe(false)
      expect(await tx.permission.findMany({ where: { code: { in: CODIGOS_CLIENTES } } })).toEqual([])
      expect(
        await tx.rolePermission.findMany({ where: { permissionCode: { in: CODIGOS_CLIENTES } } }),
      ).toEqual([])

      expect(await permissionsSnapshot(tx)).toEqual(permissionsAntes)
      expect(await rolePermissionsSnapshot(tx)).toEqual(rolePermissionsAntes)
    })
  })

  it('R23: DOWN y luego UP recrean la tabla y los dos permisos, asignados SOLO al Administrador, y el resto identico', async () => {
    await inRolledBackTransaction(async (tx) => {
      const permissionsAntes = await permissionsSnapshot(tx)
      const rolePermissionsAntes = await rolePermissionsSnapshot(tx)

      await applyStatements(tx, DOWN_STATEMENTS)
      await applyStatements(tx, UP_STATEMENTS)

      expect(await customersTableExists(tx)).toBe(true)

      for (const code of CODIGOS_CLIENTES) {
        expect(await tx.permission.findUnique({ where: { code } })).not.toBeNull()
        expect(await rolesWithClientesPermission(tx, code)).toEqual(['Administrador'])
      }

      expect(await permissionsSnapshot(tx)).toEqual(permissionsAntes)
      expect(await rolePermissionsSnapshot(tx)).toEqual(rolePermissionsAntes)
    })
  })

  it('R24: si el seed ya creo los dos permisos y su asignacion, el UP no falla, no duplica y no reescribe updated_at', async () => {
    await inRolledBackTransaction(async (tx) => {
      await applyStatements(tx, DOWN_STATEMENTS)

      // Simula que el seed ya dejo los dos permisos y su asignacion al Administrador ANTES de
      // aplicar esta migracion.
      const administrador = await tx.role.findFirstOrThrow({
        where: { name: 'Administrador' },
        select: { id: true },
      })
      for (const [index, code] of CODIGOS_CLIENTES.entries()) {
        await tx.permission.create({
          data: {
            code,
            module: 'clientes',
            action: index === 0 ? 'consultar' : 'modificar',
            description: 'Descripcion sembrada antes de la migracion',
          },
        })
        await tx.rolePermission.create({
          data: { roleId: administrador.id, permissionCode: code },
        })
      }

      const permisosAntes = await tx.permission.findMany({
        where: { code: { in: CODIGOS_CLIENTES } },
        orderBy: { code: 'asc' },
      })
      const asignacionesAntes = await tx.rolePermission.findMany({
        where: { permissionCode: { in: CODIGOS_CLIENTES } },
        orderBy: { permissionCode: 'asc' },
      })

      // La tabla no existe todavia porque el DOWN se aplico; el UP tiene que crearla ademas de
      // reconciliar los permisos ya sembrados sin fallar.
      await applyStatements(tx, UP_STATEMENTS)

      const permisosDespues = await tx.permission.findMany({
        where: { code: { in: CODIGOS_CLIENTES } },
        orderBy: { code: 'asc' },
      })
      const asignacionesDespues = await tx.rolePermission.findMany({
        where: { permissionCode: { in: CODIGOS_CLIENTES } },
        orderBy: { permissionCode: 'asc' },
      })

      // Comparacion campo a campo, updated_at incluido: un INSERT que reescribiera se veria aqui.
      expect(permisosDespues).toEqual(permisosAntes)
      expect(asignacionesDespues).toEqual(asignacionesAntes)
      expect(permisosDespues).toHaveLength(2)
      expect(asignacionesDespues).toHaveLength(2)
      expect(await customersTableExists(tx)).toBe(true)
    })
  })

  it('R18 (sensibilidad): un down.sql sintetico sin el DELETE de role_permissions cae por la FK RESTRICT', async () => {
    // No se toca el archivo en disco: se muta el SQL EN MEMORIA quitando el primer DELETE, y se
    // corre CONTRA LA BASE dentro de su propia transaccion revertida, para demostrar que el
    // detector muerde de verdad y no solo en el texto.
    const downSinDeleteDeRolePermissions = DOWN_STATEMENTS.filter(
      (statement) => !/^DELETE FROM "?role_permissions"?/i.test(statement),
    )
    expect(downSinDeleteDeRolePermissions, 'la mutacion no quito ninguna sentencia').toHaveLength(
      DOWN_STATEMENTS.length - 1,
    )

    await inRolledBackTransaction(async (tx) => {
      let fallo: unknown = null
      try {
        await applyStatements(tx, downSinDeleteDeRolePermissions)
      } catch (error) {
        fallo = error
      }
      expect(
        fallo,
        'un down.sql sin el DELETE de role_permissions deberia fallar por la FK RESTRICT de ' +
          'role_permissions_permission_code_fkey al intentar borrar un permiso todavia referenciado',
      ).not.toBeNull()
    })
  })
})
