// T10 — Guardia: toda tabla creada por una migracion lleva RLS activado Y forzado (R19).
//
// Recorre el ARBOL DE ARCHIVOS (`db/migrations/**/migration.sql`), no el grafo de imports:
// esta guardia tiene que valer para las migraciones FUTURAS, no solo para la de esta
// feature, asi que descubre las tablas leyendo el SQL en vez de llevarlas escritas.
//
// `ENABLE` sin `FORCE` no sirve de nada aqui: Prisma se conecta como dueno de las tablas y
// Postgres no aplica RLS al dueno salvo `FORCE ROW LEVEL SECURITY`
// (`docs/architecture.md > Acceso a datos y autorizacion`).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
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
const migrationsDir = join(repoRoot, 'db', 'migrations')

/** Todos los `migration.sql` bajo `db/migrations/**`, sea cual sea su profundidad. */
function findMigrationFiles(dir: string): readonly string[] {
  let entries: readonly string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return findMigrationFiles(full)
    return entry === 'migration.sql' ? [full] : []
  })
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Tablas creadas por el SQL, descubiertas del propio texto (nunca hardcodeadas). */
export function tablesCreatedBy(sql: string): readonly string[] {
  const matches = stripSqlComments(sql).matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\s*\.\s*)?"?(\w+)"?/gi,
  )
  return [...new Set([...matches].map((match) => match[1] as string))]
}

/** ¿El SQL declara esa sentencia de RLS para esa tabla? */
function declaresRowLevelSecurity(sql: string, table: string, mode: 'ENABLE' | 'FORCE'): boolean {
  return new RegExp(
    `ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:"?\\w+"?\\s*\\.\\s*)?"?${table}"?\\s+${mode}\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  ).test(stripSqlComments(sql))
}

/** Tablas sin `ENABLE` o sin `FORCE`: el resultado vacio es el unico aceptable. */
export function tablesMissingRls(sql: string): readonly string[] {
  return tablesCreatedBy(sql).flatMap((table) => {
    const enable = declaresRowLevelSecurity(sql, table, 'ENABLE')
    const force = declaresRowLevelSecurity(sql, table, 'FORCE')
    if (enable && force) return []
    const falta = [enable ? null : 'ENABLE', force ? null : 'FORCE'].filter(
      (item): item is string => item !== null,
    )
    return [`${table} (falta ${falta.join(' y ')} ROW LEVEL SECURITY)`]
  })
}

const migrationFiles = findMigrationFiles(migrationsDir)

describe('guardia — RLS activado y forzado', () => {
  it('toda tabla creada tiene RLS activado y forzado', () => {
    expect(migrationFiles.length, 'no se encontro ningun migration.sql que revisar').toBeGreaterThan(0)

    const hallazgos = migrationFiles.flatMap((file) => {
      const sql = readFileSync(file, 'utf8')
      const tablas = tablesCreatedBy(sql)
      expect(tablas.length, `${file} no crea ninguna tabla`).toBeGreaterThanOrEqual(0)
      return tablesMissingRls(sql).map(
        (falta) => `${relative(repoRoot, file).split(sep).join('/')}: ${falta}`,
      )
    })

    expect(hallazgos).toEqual([])
  })

  it('la guardia descubre las tablas del SQL y no una lista fija', () => {
    const sql = 'CREATE TABLE "alfa" ("id" UUID);\nCREATE TABLE IF NOT EXISTS public."beta" ("id" UUID);'
    expect(tablesCreatedBy(sql)).toEqual(['alfa', 'beta'])
  })

  it('la guardia cae si a una tabla le falta el FORCE ROW LEVEL SECURITY', () => {
    const soloEnable = 'CREATE TABLE "alfa" ("id" UUID);\nALTER TABLE "alfa" ENABLE ROW LEVEL SECURITY;'
    expect(tablesMissingRls(soloEnable)).toEqual(['alfa (falta FORCE ROW LEVEL SECURITY)'])

    const sinNada = 'CREATE TABLE "beta" ("id" UUID);'
    expect(tablesMissingRls(sinNada)).toEqual(['beta (falta ENABLE y FORCE ROW LEVEL SECURITY)'])

    const completo =
      'CREATE TABLE "gama" ("id" UUID);\nALTER TABLE "gama" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "gama" FORCE ROW LEVEL SECURITY;'
    expect(tablesMissingRls(completo)).toEqual([])
  })

  it('la guardia no se conforma con un RLS que solo esta en un comentario', () => {
    const comentado =
      'CREATE TABLE "alfa" ("id" UUID);\n-- ALTER TABLE "alfa" ENABLE ROW LEVEL SECURITY;\n-- ALTER TABLE "alfa" FORCE ROW LEVEL SECURITY;'
    expect(tablesMissingRls(comentado)).toEqual(['alfa (falta ENABLE y FORCE ROW LEVEL SECURITY)'])
  })
})
