// Contrato ESTATICO de `20260917130000_recipes_search_index_including_deleted` (QC-68, R13).
//
// R13 exige que la migracion traiga su `down.sql` y que ese `down.sql` revierta EXACTAMENTE lo
// que crea el `migration.sql`. Nada de esto lo comprueba Prisma ni el cliente generado: un
// `down.sql` que no revierte el `up` no rompe nada el dia que se ESCRIBE -el `up` se aplica y la
// busqueda funciona igual-, sino el dia que alguien intenta echar atras la migracion y el
// `DROP INDEX` no encuentra el nombre que el `up` de verdad creo, o encuentra uno EQUIVOCADO
// porque alguien lo renombro en un lado y se olvido del otro.
//
// Por eso el nombre del indice NO se repite a mano en los dos asertos: se EXTRAE del
// `CREATE INDEX` del `migration.sql` y se comprueba que ese mismo nombre -y no una copia escrita
// aqui- es el que aparece en el `DROP INDEX` del `down.sql`. Si alguien renombra el indice en el
// `up` y se olvida del `down`, este test cae por el motivo real, no por una comparacion contra un
// literal que envejeceria en silencio junto con el bug.
//
// Este test NO se conecta a la base: lee archivos. Mismo patron que
// `tests/unit/recetas/schema/recipes-company-scope-migration.test.ts`.

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
const migrationsDir = join(repoRoot, 'db', 'migrations')

/**
 * La carpeta se localiza por SUFIJO y no por el timestamp escrito a pelo: si la migracion se
 * renombra, este test tiene que caer por lo que vigila y no por la ruta.
 */
function findMigrationDir(suffix: string): string {
  const candidates = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort()
  if (candidates.length !== 1) {
    throw new Error(
      `se esperaba exactamente una migracion terminada en "${suffix}"; hay ${String(
        candidates.length,
      )}: ${candidates.join(', ')}`,
    )
  }
  return join(migrationsDir, candidates[0] as string)
}

const migrationDir = findMigrationDir('_recipes_search_index_including_deleted')

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. */
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

/**
 * El indice de busqueda tal como el `CREATE INDEX` lo declara: su nombre, la tabla, si es GIN
 * con `gin_trgm_ops`, la columna y si lleva `WHERE`. `null` si no hay ninguna sentencia asi.
 */
interface IndiceDeBusqueda {
  readonly nombre: string
  readonly tabla: string
  readonly columna: string
  readonly esGinTrgm: boolean
  readonly llevaWhere: boolean
}

function searchIndexCreatedBy(sql: string): IndiceDeBusqueda | null {
  const encontrados = statements(sql)
    .map((statement) =>
      /^CREATE INDEX "([^"]+)"\s+ON "(\w+)" USING gin \("(\w+)" gin_trgm_ops\)(.*)$/i.exec(
        statement,
      ),
    )
    .filter((match): match is RegExpExecArray => match !== null)
  if (encontrados.length !== 1) return null
  const match = encontrados[0] as RegExpExecArray
  return {
    nombre: match[1] as string,
    tabla: match[2] as string,
    columna: match[3] as string,
    esGinTrgm: true,
    llevaWhere: /\bWHERE\b/i.test(match[4] as string),
  }
}

/** El nombre que un `DROP INDEX [IF EXISTS] "..."` tira, o `null` si no hay ninguno asi. */
function droppedIndexName(sql: string): string | null {
  const encontrados = statements(sql)
    .map((statement) => /^DROP INDEX (?:IF EXISTS )?"([^"]+)"$/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
  if (encontrados.length !== 1) return null
  return encontrados[0]?.[1] as string
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')

describe('QC-68 — migracion del indice de busqueda de recetas trae UP y DOWN (R13)', () => {
  it('la carpeta de la migracion existe con migration.sql y down.sql (R13)', () => {
    const archivos = readdirSync(migrationDir).sort()
    expect(archivos).toEqual(['down.sql', 'migration.sql'])
  })

  it('el migration.sql crea el indice GIN de trigramas sobre name_normalized, SIN WHERE (R13)', () => {
    const indice = searchIndexCreatedBy(upSource)
    expect(indice, 'no se encontro el CREATE INDEX esperado').not.toBeNull()
    expect(indice).toEqual({
      nombre: 'recipes_name_normalized_all_trgm_idx',
      tabla: 'recipes',
      columna: 'name_normalized',
      esGinTrgm: true,
      llevaWhere: false,
    })

    // Falsabilidad: el parcial de QC-57 SI lleva WHERE, y es justo lo que distingue a este
    // indice -sin el, la busqueda no veria las recetas dadas de baja-. Si alguien le añade un
    // WHERE a este `CREATE INDEX`, el predicado tiene que dejar de reconocerlo como "sin WHERE".
    const conWhere = upSource.replace(
      '("name_normalized" gin_trgm_ops);',
      '("name_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;',
    )
    expect(conWhere, 'la mutacion no anadio el WHERE').not.toBe(upSource)
    expect(searchIndexCreatedBy(conWhere)?.llevaWhere).toBe(true)
  })

  it('el down.sql tira EXACTAMENTE el indice que crea el migration.sql, no un nombre copiado a mano (R13)', () => {
    const indice = searchIndexCreatedBy(upSource)
    const nombreTirado = droppedIndexName(downSource)
    expect(indice, 'no se encontro el CREATE INDEX del up').not.toBeNull()
    expect(nombreTirado, 'no se encontro el DROP INDEX del down').not.toBeNull()
    // El nombre viene del PROPIO up, extraido por el predicado: si alguien renombra el indice en
    // el up y se olvida del down, `nombreTirado` sigue siendo el viejo y esta comparacion cae.
    expect(nombreTirado).toBe(indice?.nombre)

    // Falsabilidad: si el up se renombrara y el down se quedara atras, el caso tiene que caer.
    const upRenombrado = upSource.replace(
      'recipes_name_normalized_all_trgm_idx',
      'recipes_name_normalized_all_trgm_idx_v2',
    )
    expect(upRenombrado, 'la mutacion no renombro el indice').not.toBe(upSource)
    const indiceRenombrado = searchIndexCreatedBy(upRenombrado)
    expect(indiceRenombrado?.nombre).not.toBe(nombreTirado)
  })

  it('el down.sql NO hace DROP EXTENSION pg_trgm: la extension es compartida por otras seis tablas (R13)', () => {
    // Tirar la extension dejaria sin indice de busqueda a las otras tablas que tambien dependen
    // de `pg_trgm` (mismo criterio que `db/migrations/20260904160000_list_query_indexes/down.sql`).
    expect(statements(downSource).filter((statement) => /DROP EXTENSION/i.test(statement))).toEqual(
      [],
    )
    expect(downSource).not.toMatch(/DROP EXTENSION/i)

    // Falsabilidad: si alguien anadiera el DROP EXTENSION, el caso tiene que dispararse.
    const conDropExtension = `${downSource}\nDROP EXTENSION IF EXISTS pg_trgm;`
    expect(conDropExtension).not.toBe(downSource)
    expect(
      statements(conDropExtension).filter((statement) => /DROP EXTENSION/i.test(statement)),
    ).not.toEqual([])
  })
})
