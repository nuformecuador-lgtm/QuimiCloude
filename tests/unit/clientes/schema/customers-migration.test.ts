// Contrato estatico del SQL de la migracion `customers`.
//
// Lo que se vigila aqui NO esta en `db/schema.prisma`: las tres FK escritas a mano, el CHECK
// que no debe existir, la asignacion de permisos SOLO al Administrador y la reversion exacta del
// `down.sql`. Cada afirmacion se escribe como PREDICADO y se aplica dos veces: al SQL real y a
// una version MUTADA EN MEMORIA (el archivo en disco no se toca).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/modules/identity'

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
const migrationDir = join(repoRoot, 'db', 'migrations', '20260924120000_customers')

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
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${pattern}`).toHaveLength(1)
  return found[0] as string
}

const createCustomers = findStatement(up, /^CREATE TABLE (?:IF NOT EXISTS )?"?customers"?/i)

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R8, R9, R12, R13) */
function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/** ¿La tabla queda con RLS activada Y forzada? (R17) */
function hasRlsEnabledAndForced(source: readonly string[], table: string): boolean {
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

describe('migration.sql — cabecera sin citas', () => {
  it('la cabecera de migration.sql y de down.sql no cita ninguna ficha ni requisito', () => {
    for (const fuente of [upSource, downSource]) {
      expect(fuente).not.toMatch(/QC-\d+/)
      expect(fuente).not.toMatch(/\bR\d+\b/)
      expect(fuente).not.toMatch(/design\.md/i)
      expect(fuente).not.toMatch(/decisi[oó]n cerrada/i)
    }
  })
})

/** El predicado real que R5 exige para una columna: TEXT y sin longitud declarada. */
function esColumnaTextoLibre(ddl: string, columna: string): boolean {
  return (
    new RegExp(`"${columna}" TEXT`, 'i').test(ddl) &&
    !new RegExp(`"${columna}"\\s+VARCHAR`, 'i').test(ddl) &&
    !new RegExp(`"${columna}"\\s+CHARACTER\\s+VARYING`, 'i').test(ddl)
  )
}

describe('migration.sql — columnas y tipos (R1-R5)', () => {
  it('las columnas de texto son TEXT sin longitud, y solo los tres obligatorios mas company_id son NOT NULL', () => {
    for (const columna of ['first_names', 'last_names', 'city', 'phone', 'email', 'address']) {
      expect(esColumnaTextoLibre(createCustomers, columna), `${columna} debe ser TEXT sin longitud`).toBe(
        true,
      )
    }
    for (const obligatoria of ['first_names', 'last_names', 'city']) {
      expect(createCustomers).toMatch(new RegExp(`"${obligatoria}" TEXT NOT NULL`, 'i'))
    }
    for (const opcional of ['phone', 'email', 'address']) {
      expect(createCustomers).not.toMatch(new RegExp(`"${opcional}" TEXT NOT NULL`, 'i'))
    }
    expect(createCustomers).toMatch(/"company_id" UUID NOT NULL/i)

    // Sensibilidad: el MISMO predicado tiene que reprobar un VARCHAR(80) en vez de TEXT.
    const mutado = createCustomers.replace('"first_names" TEXT NOT NULL', '"first_names" VARCHAR(80) NOT NULL')
    expect(mutado, 'la mutacion no se aplico').not.toBe(createCustomers)
    expect(esColumnaTextoLibre(mutado, 'first_names')).toBe(false)
  })
})

describe('migration.sql — sin ningun CHECK (R3, R6)', () => {
  it('la migracion no declara ningun CHECK', () => {
    expect(up.filter((statement) => /CHECK\s*\(/i.test(statement))).toHaveLength(0)
    expect(createCustomers).not.toMatch(/CHECK\s*\(/i)
  })
})

describe('migration.sql — unicidad (R7, R10)', () => {
  it('el unico indice unico es la clave candidata (company_id, id)', () => {
    const uniqueIndexes = up.filter((statement) => /^CREATE UNIQUE INDEX/i.test(statement))
    expect(uniqueIndexes).toHaveLength(1)
    expect(uniqueIndexes[0]).toMatch(
      /ON "?customers"?\s*\(\s*"?company_id"?\s*,\s*"?id"?\s*\)/i,
    )
    expect(uniqueIndexes[0]).toMatch(/"customers_company_id_id_key"/)

    // Sensibilidad OBLIGATORIA: un segundo indice unico -p. ej. de nombre- tiene que aumentar el
    // censo y tumbar el `toHaveLength(1)`.
    const conIndiceDeMas = [...up, 'CREATE UNIQUE INDEX "customers_first_names_key" ON "customers"("first_names")']
    expect(conIndiceDeMas.filter((statement) => /^CREATE UNIQUE INDEX/i.test(statement))).toHaveLength(2)
  })
})

describe('migration.sql — las tres FK con ON DELETE RESTRICT (R8, R9, R12, R13)', () => {
  const fkCompany = findStatement(up, /ADD CONSTRAINT "?customers_company_id_fkey"?/i)
  const fkCreatedBy = findStatement(up, /ADD CONSTRAINT "?customers_created_by_fkey"?/i)
  const fkUpdatedBy = findStatement(up, /ADD CONSTRAINT "?customers_updated_by_fkey"?/i)

  it('las tres FK son RESTRICT y ninguna es SET NULL', () => {
    for (const [statement, column, target] of [
      [fkCompany, 'company_id', 'companies'],
      [fkCreatedBy, 'created_by', 'users'],
      [fkUpdatedBy, 'updated_by', 'users'],
    ] as const) {
      expect(statement).toMatch(/ALTER TABLE "?customers"?/i)
      expect(statement).toMatch(new RegExp(`FOREIGN KEY \\(\\s*"?${column}"?\\s*\\)`, 'i'))
      expect(statement).toMatch(new RegExp(`REFERENCES "?${target}"?\\s*\\(\\s*"?id"?\\s*\\)`, 'i'))
      expect(statement).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)
      expect(isRestrictOnDelete(statement), `${column} debe ser RESTRICT`).toBe(true)
    }
    expect(up.filter((statement) => /FOREIGN KEY/i.test(statement))).toHaveLength(3)

    // Sensibilidad OBLIGATORIA: RESTRICT -> SET NULL tiene que tumbar el predicado.
    const mutado = fkCreatedBy.replace(/ON DELETE RESTRICT/i, 'ON DELETE SET NULL')
    expect(mutado, 'la mutacion no se aplico').not.toBe(fkCreatedBy)
    expect(isRestrictOnDelete(mutado)).toBe(false)
  })
})

describe('migration.sql — RLS activada y forzada, sin ninguna policy (R17)', () => {
  it('customers queda con ENABLE y FORCE, y no hay ningun CREATE POLICY', () => {
    expect(hasRlsEnabledAndForced(up, 'customers')).toBe(true)
    expect(up.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toHaveLength(2)
    expect(up.some((statement) => /^CREATE POLICY/i.test(statement))).toBe(false)

    // Sensibilidad OBLIGATORIA: quitar el FORCE tiene que tumbar el predicado.
    const sinForce = up.filter(
      (statement) => !/^ALTER TABLE "?customers"? FORCE ROW LEVEL SECURITY$/i.test(statement),
    )
    expect(sinForce.length, 'la mutacion no quito ninguna sentencia').toBe(up.length - 1)
    expect(hasRlsEnabledAndForced(sinForce, 'customers')).toBe(false)
  })
})

describe('migration.sql — los permisos solo al Administrador (R22-R24)', () => {
  const CLIENTES_CODES = ['clientes.consultar', 'clientes.modificar'] as const

  it('los literales de permiso son iguales a las entradas de PERMISSIONS importadas', () => {
    for (const code of CLIENTES_CODES) {
      const entry = PERMISSIONS.find((permission) => permission.code === code)
      expect(entry, `PERMISSIONS no declara ${code}`).toBeDefined()
      expect(upSource).toContain(`'${code}'`)
      if (entry !== undefined) {
        expect(upSource).toContain(`'${entry.module}'`)
        expect(upSource).toContain(`'${entry.action}'`)
        expect(upSource).toContain(entry.description)
      }
    }
  })

  /** El predicado real que R22-R24 exigen: ni Operador ni Empacador aparecen en la sentencia. */
  function mencionaOtroRol(sql: string): boolean {
    return /Operador/.test(sql) || /Empacador/.test(sql)
  }

  it('la asignacion es solo al Administrador, con ON CONFLICT DO NOTHING, y no menciona Operador ni Empacador', () => {
    const insertPermissions = findStatement(up, /^INSERT INTO "?permissions"?/i)
    expect(insertPermissions).toMatch(/ON CONFLICT \("?code"?\) DO NOTHING/i)

    const insertRolePermissions = findStatement(up, /^INSERT INTO "?role_permissions"?/i)
    expect(insertRolePermissions).toMatch(/WHERE\s+"?r"?\."?name"?\s*=\s*'Administrador'/i)
    expect(insertRolePermissions).toMatch(/ON CONFLICT \("?role_id"?,\s*"?permission_code"?\) DO NOTHING/i)
    expect(mencionaOtroRol(insertRolePermissions)).toBe(false)

    // Sensibilidad: el MISMO predicado tiene que reprobar 'Administrador' -> 'Operador'.
    const mutado = insertRolePermissions.replace("'Administrador'", "'Operador'")
    expect(mutado, 'la mutacion no se aplico').not.toBe(insertRolePermissions)
    expect(mencionaOtroRol(mutado)).toBe(true)
  })
})

describe('migration.sql — no toca ninguna otra tabla (R27)', () => {
  it('no hay ningun ALTER/DROP/CREATE INDEX sobre otra tabla ni mencion de orders', () => {
    expect(up.some((statement) => /^ALTER TABLE "?orders"?\b/i.test(statement))).toBe(false)
    expect(upSource).not.toMatch(/\borders\b/i)

    const alteresAjenos = up.filter(
      (statement) =>
        /^ALTER TABLE/i.test(statement) && !/^ALTER TABLE "?customers"?\b/i.test(statement),
    )
    expect(alteresAjenos).toEqual([])

    const indicesAjenos = up.filter(
      (statement) =>
        /^CREATE (?:UNIQUE )?INDEX/i.test(statement) && !/ON "?customers"?/i.test(statement),
    )
    expect(indicesAjenos).toEqual([])

    // Sensibilidad OBLIGATORIA: un ALTER TABLE "orders" fabricado tiene que aparecer en la lista.
    const conAlterAjeno = [...up, 'ALTER TABLE "orders" ADD COLUMN "customer_id" UUID']
    expect(
      conAlterAjeno.filter(
        (statement) => /^ALTER TABLE/i.test(statement) && !/^ALTER TABLE "?customers"?\b/i.test(statement),
      ),
    ).toHaveLength(1)
  })
})

/** El predicado real que R18 exige para el DROP: nada de CASCADE. */
function llevaCascade(sql: string): boolean {
  return /CASCADE/i.test(sql)
}

describe('down.sql — reversion exacta (R18)', () => {
  it('dos DELETE acotados a los dos codigos, en ese orden, y un unico DROP TABLE sin CASCADE', () => {
    expect(down).toHaveLength(3)

    const deleteRolePermissions = down[0] as string
    const deletePermissions = down[1] as string
    const dropTable = down[2] as string

    expect(deleteRolePermissions).toMatch(/^DELETE FROM "?role_permissions"?/i)
    expect(deleteRolePermissions).toMatch(/'clientes\.consultar'/)
    expect(deleteRolePermissions).toMatch(/'clientes\.modificar'/)

    expect(deletePermissions).toMatch(/^DELETE FROM "?permissions"?/i)
    expect(deletePermissions).toMatch(/'clientes\.consultar'/)
    expect(deletePermissions).toMatch(/'clientes\.modificar'/)

    expect(dropTable).toMatch(/^DROP TABLE "?customers"?$/i)
    expect(llevaCascade(dropTable)).toBe(false)

    // El orden importa: role_permissions ANTES que permissions, por el RESTRICT de su FK.
    expect(downSource.indexOf('role_permissions')).toBeLessThan(downSource.indexOf('"permissions"'))

    // Sensibilidad: el MISMO predicado tiene que reprobar un CASCADE anadido al DROP.
    const mutado = dropTable.replace(/$/, ' CASCADE')
    expect(mutado, 'la mutacion no se aplico').not.toBe(dropTable)
    expect(llevaCascade(mutado)).toBe(true)
  })
})
