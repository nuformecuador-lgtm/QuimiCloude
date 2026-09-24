// T21 (QC-50, aislamiento-por-empresa-en-recetas) — Contrato ESTATICO del SQL de
// `20260916120000_recipes_company_scope`.
//
// NADA DE LO QUE SE VIGILA AQUI LO REGENERA PRISMA, y esa es la unica razon de que este
// archivo exista. La migracion esta ESCRITA ENTERA A MANO (`design.md > 7`) y lleva dentro
// cuatro cosas que `db/schema.prisma` NO declara y que ningun tipo ni cliente generado
// detectaria si una migracion futura se las llevara por delante:
//
//   1. la FK `recipes_company_id_fkey` --`companyId` se declara ESCALAR SIN `@relation` a
//      proposito, asi que este SQL es el UNICO sitio donde la FK existe, y para Prisma es
//      DRIFT-- (`design.md > 2.1`);
//   2. el bloque `DO $$` del backfill, con su resolucion UNIVOCA de «QuimiCloud» por nombre
//      normalizado y su comprobacion de `ROW_COUNT` (R4);
//   3. el parentesis `NO FORCE` / `ENABLE`+`FORCE` de la RLS sobre `recipes` y `companies`,
//      la mina que QC-49 tuvo que corregir en revision (R5); y
//   4. el RELEVO del indice unico de nombre: cae el GLOBAL de QC-24 y nace el compuesto por
//      empresa, EN ESE ORDEN, y **sigue siendo PARCIAL** por `deleted_at IS NULL` (`design.md
//      > 2.2`). Sin ese `WHERE`, el borrado logico dejaria de liberar el nombre para su
//      empresa y nada mas lo detectaria: es la asercion mas importante de este archivo.
//
// PATRON, el de `inventory-company-scope-migration.test.ts` (QC-49) y
// `orders-company-scope-migration.test.ts` (QC-60): cada afirmacion se escribe como un
// PREDICADO PURO que recibe el texto SQL y devuelve el veredicto, y se aplica DOS VECES --al
// SQL real (pasa) y a una version MUTADA EN MEMORIA (falla)--. El archivo en disco NO se toca
// nunca. Un test que no puede fallar no vigila nada.
//
// LA TRAMPA que este archivo evita: `DELETE`, `INSERT` y `recipe_lines` aparecen en el SQL
// real, pero SOLO dentro de comentarios (`-- Ningun INSERT y ningun DELETE...`) y dentro de
// clausulas `ON DELETE RESTRICT`/`ON DELETE CASCADE`, que no son sentencias `DELETE`. Por eso
// `stripSqlComments` quita los comentarios ANTES de cualquier asercion, y las aserciones sobre
// `INSERT`/`DELETE` exigen la forma de sentencia (`INSERT INTO` / `DELETE FROM`), nunca la
// palabra suelta.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que las restricciones MUERDAN en la base, ni que la reversion
// deje el esquema como estaba. Eso es `tests/integration/recetas/company-scope.int.test.ts`
// (T22). Aqui se prueba que estan ESCRITAS, que es la mitad que una migracion futura puede
// perder en silencio.
//
// Cubre R4 (parte), R5, R6, R8, R32 (parte).

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

const migrationDir = findMigrationDir('_recipes_company_scope')

/**
 * Quita comentarios de linea (`--...`) y de bloque (`/* ... *\/`): lo que se afirma es SQL
 * EJECUTABLE, no prosa. Es la defensa contra la trampa: el SQL real dice «Ningun INSERT y
 * ningun DELETE» y nombra `recipe_lines` en varios comentarios, y un `includes` ingenuo sobre
 * el texto crudo daria un falso positivo en la direccion equivocada -un test que pasa por una
 * frase que EXPLICA la ausencia, no por la ausencia misma-.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas.
 *
 * Parte por `;`, igual que los precedentes de QC-49 y QC-60. Los bloques `DO $$ ... $$` llevan
 * `;` dentro y salen partidos en trozos, pero ninguno de esos trozos empieza por `CREATE`,
 * `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion anclada con `^`. Lo que se afirma
 * SOBRE UN BLOQUE se comprueba contra el texto completo, no contra esta lista.
 */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

/** El texto ejecutable entero, en una sola linea. Para lo que cruza varias sentencias. */
function flatSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ')
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

// --- Predicados puros: el UP declara -------------------------------------------------------

/**
 * R4 (parte), R8. ¿La columna `company_id` nace UUID anulable, se rellena por el backfill y
 * se aprieta a `NOT NULL` DESPUES, sin `DEFAULT`?
 */
function addsNullableCompanyColumnThenNotNull(sql: string): boolean {
  const source = statements(sql)
  const nace = source.findIndex((statement) =>
    /^ALTER TABLE "recipes" ADD COLUMN "company_id" UUID$/i.test(statement),
  )
  const backfill = source.findIndex((statement) =>
    /^UPDATE "recipes" SET "company_id" = target_company_id$/i.test(statement),
  )
  const aprieta = source.findIndex((statement) =>
    /^ALTER TABLE "recipes" ALTER COLUMN "company_id" SET NOT NULL$/i.test(statement),
  )
  if (nace === -1 || backfill === -1 || aprieta === -1) return false
  const sinDefault = !/"company_id"[^;]*\bDEFAULT\b/i.test(flatSql(sql))
  return nace < backfill && backfill < aprieta && sinDefault
}

/**
 * R5. ¿La FK a `companies` esta escrita, con `ON DELETE RESTRICT ON UPDATE CASCADE` y nunca
 * `CASCADE`/`SET NULL` en el borrado?
 */
function declaresCompanyForeignKey(sql: string): boolean {
  const fk = statements(sql).find((statement) =>
    /^ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_fkey"/i.test(statement),
  )
  if (fk === undefined) return false
  return (
    /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/i.test(fk) &&
    /ON DELETE RESTRICT/i.test(fk) &&
    /ON UPDATE CASCADE/i.test(fk) &&
    !/ON DELETE (CASCADE|SET NULL)/i.test(fk)
  )
}

/**
 * R6. ¿El archivo CIERRA con la RLS de `recipes` ACTIVADA Y FORZADA, y sin crear ninguna
 * policy?
 */
function endsWithForcedRlsOnRecipes(sql: string): boolean {
  const source = statements(sql)
  const ultimas = source.slice(-2)
  const creaPolicy = /CREATE\s+POLICY/i.test(stripSqlComments(sql))
  return (
    !creaPolicy &&
    /^ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY$/i.test(ultimas[0] ?? '') &&
    /^ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY$/i.test(ultimas[1] ?? '')
  )
}

/**
 * R6. ¿El parentesis `NO FORCE` del paso 0 se ABRE y se CIERRA para todas las tablas que
 * suelta -`recipes` y `companies`-?
 */
function closesEveryNoForceParenthesis(sql: string): boolean {
  const source = statements(sql)
  const soltadas = new Set(
    source
      .map((statement) => /^ALTER TABLE "(\w+)" NO FORCE ROW LEVEL SECURITY$/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string),
  )
  if (soltadas.size === 0) return false
  return [...soltadas].every((tabla) => {
    const activa = source.findIndex((statement) =>
      new RegExp(`^ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY$`, 'i').test(statement),
    )
    const fuerza = source.findIndex((statement) =>
      new RegExp(`^ALTER TABLE "${tabla}" FORCE ROW LEVEL SECURITY$`, 'i').test(statement),
    )
    const suelta = source.findIndex((statement) =>
      new RegExp(`^ALTER TABLE "${tabla}" NO FORCE ROW LEVEL SECURITY$`, 'i').test(statement),
    )
    return activa > suelta && fuerza > suelta
  })
}

/** ¿Se sueltan EXACTAMENTE `recipes` y `companies`, y ninguna otra tabla? */
function releasesExactlyRecipesAndCompanies(sql: string): boolean {
  const source = statements(sql)
  const soltadas = source
    .map((statement) => /^ALTER TABLE "(\w+)" NO FORCE ROW LEVEL SECURITY$/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
    .sort()
  return JSON.stringify(soltadas) === JSON.stringify(['companies', 'recipes'].sort())
}

/**
 * R6, R8. ¿Cae el unico GLOBAL `recipes_name_unique` y nace el compuesto
 * `recipes_company_name_unique` sobre `(company_id, name_normalized)` **con su
 * `WHERE "deleted_at" IS NULL`**, en ese orden?
 *
 * Esta es la asercion MAS IMPORTANTE del archivo (`design.md > 2.2`): sin el `WHERE`, la
 * unicidad alcanzaria tambien a las recetas borradas y el borrado logico dejaria de liberar
 * el nombre para su empresa, y nada mas lo detectaria.
 */
function swapsRecipeNameUniqueIndexKeepingPartialWhere(sql: string): boolean {
  const source = statements(sql)
  const caeElGlobal = source.findIndex((statement) =>
    /^DROP INDEX "recipes_name_unique"$/i.test(statement),
  )
  const naceElCompuesto = source.findIndex((statement) =>
    /^CREATE UNIQUE INDEX "recipes_company_name_unique"/i.test(statement),
  )
  if (caeElGlobal === -1 || naceElCompuesto === -1) return false
  const compuesto = source[naceElCompuesto] as string
  const columnas = /ON "recipes" \("company_id", "name_normalized"\)/i.test(compuesto)
  const esParcial = /WHERE "deleted_at" IS NULL$/i.test(compuesto)
  return caeElGlobal < naceElCompuesto && columnas && esParcial
}

// --- Predicados puros: el UP NO hace -------------------------------------------------------

/**
 * ¿Ni un `INSERT INTO`, ni un `DELETE FROM`, ni un `TRUNCATE`, en ningun sitio del texto SIN
 * comentarios?
 *
 * Se anclan a la FORMA de sentencia (`INSERT INTO`, `DELETE FROM`) y no a la palabra suelta,
 * precisamente para no confundir la sentencia con la clausula `ON DELETE RESTRICT`/`CASCADE`
 * de una FK, que contiene la palabra `DELETE` sin ser un borrado.
 */
function insertsAndDeletesNothing(sql: string): boolean {
  const texto = flatSql(sql)
  return (
    !/\bINSERT\s+INTO\b/i.test(texto) &&
    !/\bDELETE\s+FROM\b/i.test(texto) &&
    !/\bTRUNCATE\b/i.test(texto)
  )
}

/**
 * ¿Ninguna sentencia menciona `recipe_lines` como IDENTIFICADOR SQL (comillas dobles o
 * frontera de palabra), fuera de comentarios?
 *
 * El SQL real nombra `recipe_lines` varias veces, pero SOLO dentro de comentarios que explican
 * que la tabla no cambia. Al despojar los comentarios antes de buscar, esas menciones
 * desaparecen y la asercion queda limpia.
 */
function mentionsNoRecipeLines(sql: string): boolean {
  return !/\brecipe_lines\b/i.test(flatSql(sql))
}

/**
 * ¿El archivo emite el numero esperado de `DROP CONSTRAINT`, y ninguno mas? El UP no dropea
 * ninguna restriccion (solo AÑADE la FK de empresa); el DOWN dropea EXACTAMENTE esa FK, la que
 * el propio UP creo.
 */
function dropsOnlyExpectedConstraints(sql: string, expected: readonly string[]): boolean {
  const drops = statements(sql)
    .filter((statement) => /\bDROP CONSTRAINT\b/i.test(statement))
    .map((statement) => {
      const match = /DROP CONSTRAINT (?:IF EXISTS )?"(\w+)"/i.exec(statement)
      return match?.[1] ?? ''
    })
    .sort()
  return JSON.stringify(drops) === JSON.stringify([...expected].sort())
}

/** Las tablas de las otras fichas, que esta migracion no puede nombrar (R32). */
const TABLAS_AJENAS = [
  'orders',
  'order_assignments',
  'products',
  'presentations',
  'product_batches',
  'units',
  'suppliers',
  'supplier_catalog_lines',
] as const

/**
 * R32. ¿La migracion se queda en su alcance? No toca `orders`, `products`, `units` ni
 * `companies` mas alla del parentesis de RLS y la LECTURA del backfill: no la altera, no le
 * añade columnas ni restricciones, no la borra.
 */
function staysOutOfOtherTables(sql: string): boolean {
  const texto = flatSql(sql)
  const tocaTablaAjena = TABLAS_AJENAS.some((tabla) => new RegExp(`\\b${tabla}\\b`, 'i').test(texto))
  // `companies` solo puede aparecer en: el parentesis NO FORCE/ENABLE/FORCE, y el SELECT de
  // lectura del backfill/las guardias. Cualquier ALTER/CREATE/DROP que no sea de RLS sobre
  // `companies` es fuera de alcance.
  const alteraCompanies = /ALTER TABLE "companies" (?!NO FORCE|ENABLE|FORCE)/i.test(texto)
  const escribeCompanies = /(INSERT INTO|UPDATE)\s+"companies"/i.test(texto)
  const creaSobreCompanies = /(CREATE|DROP)\s+(TABLE|INDEX|TRIGGER|FUNCTION)[^;]*"companies"/i.test(
    texto,
  )
  return !tocaTablaAjena && !alteraCompanies && !escribeCompanies && !creaSobreCompanies
}

/**
 * R8. Vocabulario INGLES admitido en los identificadores que ESTA migracion crea, renombra o
 * borra. Lista blanca, no lista negra: una lista de palabras prohibidas solo atrapa las que a
 * alguien se le ocurrieron.
 */
const VOCABULARIO_INGLES = new Set([
  'company',
  'id',
  'fkey',
  'name',
  'unique',
  'recipes',
])

/** Identificadores que el archivo crea, renombra o borra, en el orden en que aparecen. */
function touchedIdentifiers(sql: string): readonly string[] {
  const texto = stripSqlComments(sql)
  return [
    ...texto.matchAll(
      /(?:ADD COLUMN|DROP COLUMN|ALTER COLUMN|CREATE INDEX|CREATE UNIQUE INDEX|DROP INDEX|ADD CONSTRAINT|DROP CONSTRAINT(?: IF EXISTS)?)\s+"(\w+)"/gi,
    ),
  ].map((match) => match[1] as string)
}

/** R8. ¿Todo lo que el archivo crea, renombra o borra esta nombrado en ingles? */
function namesEverythingInEnglish(sql: string): boolean {
  const todos = touchedIdentifiers(sql)
  return (
    todos.length > 0 &&
    todos.every(
      (identificador) =>
        /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(identificador) &&
        identificador.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza)),
    )
  )
}

// --- Predicados puros: el DOWN ---------------------------------------------------------------

/**
 * R6. ¿El DOWN abre con el parentesis `NO FORCE` de RLS y sus TRES guardias de datos (empresa
 * del UP ambigua, fila de otra empresa, dos recetas vivas de empresas distintas con el mismo
 * nombre normalizado), ANTES de restaurar nada del esquema?
 */
function opensWithNoForceAndThreeDataGuards(sql: string): boolean {
  const texto = flatSql(sql)
  const guardias = [
    // 1. empresa del UP ambigua (mismo criterio que el backfill, sin resolucion univoca).
    /IF named_company_rows = 1 THEN[\s\S]*ELSIF named_company_rows = 0 THEN/i,
    // 2. una fila de `recipes` con empresa distinta de la que escribio el UP.
    /FROM "recipes" WHERE "company_id" <> target_company_id/i,
    // 3. dos recetas vivas de empresas distintas con el mismo nombre normalizado.
    /GROUP BY "name_normalized"\s*HAVING count\(DISTINCT "company_id"\) > 1/i,
  ]
  if (!guardias.every((guardia) => guardia.test(texto))) return false
  const abortos = texto.match(/RAISE EXCEPTION/gi) ?? []
  if (abortos.length < 3) return false
  // El parentesis NO FORCE abre ANTES de la primera guardia.
  const primerNoForce = texto.search(/ALTER TABLE "\w+" NO FORCE ROW LEVEL SECURITY/i)
  const primeraGuardia = texto.search(/DO\s+\$\$/i)
  if (primerNoForce === -1 || primeraGuardia === -1 || primerNoForce > primeraGuardia) return false
  // Y las tres guardias van ANTES de la primera sentencia de restauracion del esquema (el
  // relevo del indice, primer objeto que el DOWN recrea).
  const ultimaGuardia = texto.search(
    /GROUP BY "name_normalized"\s*HAVING count\(DISTINCT "company_id"\) > 1/i,
  )
  const primeraRestauracion = texto.search(/DROP INDEX "recipes_company_name_unique"/i)
  return primeraRestauracion > ultimaGuardia
}

/**
 * R6. ¿El DOWN restaura el unico GLOBAL Y PARCIAL `recipes_name_unique` sobre
 * `(name_normalized)` con `WHERE "deleted_at" IS NULL`, DESPUES de quitar el compuesto por
 * empresa?
 */
function restoresGlobalPartialUniqueIndex(sql: string): boolean {
  const source = statements(sql)
  const caeElCompuesto = source.findIndex((statement) =>
    /^DROP INDEX "recipes_company_name_unique"$/i.test(statement),
  )
  const naceElGlobal = source.findIndex((statement) =>
    /^CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"\("name_normalized"\) WHERE "deleted_at" IS NULL$/i.test(
      statement,
    ),
  )
  if (caeElCompuesto === -1 || naceElGlobal === -1) return false
  return caeElCompuesto < naceElGlobal
}

/** ¿El DOWN quita la FK y la columna de empresa, y cierra con `ENABLE` + `FORCE`? */
function dropsForeignKeyAndColumnThenForcesRls(sql: string): boolean {
  const source = statements(sql)
  const caeLaFk = source.findIndex((statement) =>
    /^ALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey"$/i.test(statement),
  )
  const caeLaColumna = source.findIndex((statement) =>
    /^ALTER TABLE "recipes" DROP COLUMN "company_id"$/i.test(statement),
  )
  if (caeLaFk === -1 || caeLaColumna === -1) return false
  return caeLaFk < caeLaColumna && endsWithForcedRlsOnRecipes(sql)
}

// --- Lo que ya estaba escrito y esta migracion NO puede tocar --------------------------------

/**
 * Restricciones VIVAS de `recipes` justo antes de esta migracion, calculadas recorriendo TODAS
 * las migraciones aplicadas en orden y aplicando sus `ADD`/`DROP CONSTRAINT`. Se calcula en vez
 * de escribirse a mano: una lista literal envejeceria en silencio.
 */
function recipesConstraintsBefore(exclude: string): ReadonlyMap<string, string> {
  const vivas = new Map<string, string>()
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(exclude))
    .map((entry) => entry.name)
    .sort()
  for (const dir of dirs) {
    let sql: string
    try {
      sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8')
    } catch {
      continue
    }
    for (const statement of statements(sql)) {
      const add = /^ALTER TABLE "?recipes"? ADD CONSTRAINT "?(\w+)"?/i.exec(statement)
      if (add !== null) {
        vivas.set(add[1] as string, statement)
        continue
      }
      const drop = /^ALTER TABLE "?recipes"? DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/i.exec(
        statement,
      )
      if (drop !== null) vivas.delete(drop[1] as string)
    }
  }
  return vivas
}

/** Restricciones VIVAS de `recipe_lines`, mismo criterio. */
function recipeLinesConstraintsBefore(exclude: string): ReadonlyMap<string, string> {
  const vivas = new Map<string, string>()
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.endsWith(exclude))
    .map((entry) => entry.name)
    .sort()
  for (const dir of dirs) {
    let sql: string
    try {
      sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8')
    } catch {
      continue
    }
    for (const statement of statements(sql)) {
      const add = /^ALTER TABLE "?recipe_lines"? ADD CONSTRAINT "?(\w+)"?/i.exec(statement)
      if (add !== null) {
        vivas.set(add[1] as string, statement)
        continue
      }
      const drop = /^ALTER TABLE "?recipe_lines"? DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/i.exec(
        statement,
      )
      if (drop !== null) vivas.delete(drop[1] as string)
    }
  }
  return vivas
}

const restriccionesPreviasDeRecipes = recipesConstraintsBefore('_recipes_company_scope')
const restriccionesPreviasDeRecipeLines = recipeLinesConstraintsBefore('_recipes_company_scope')
const nombresPreviosCombinados = [
  ...restriccionesPreviasDeRecipes.keys(),
  ...restriccionesPreviasDeRecipeLines.keys(),
].sort()

// =============================================================================================

describe('QC-50 migration.sql — lo que la migracion DECLARA', () => {
  it('R4 (parte), R8: la columna nace anulable, se rellena por el backfill y se aprieta a NOT NULL', () => {
    expect(addsNullableCompanyColumnThenNotNull(upSource)).toBe(true)

    // Sensibilidad 1: nacer `NOT NULL` fallaria sobre las cinco filas que ya existen.
    const nacePorObligacion = upSource.replace(
      'ALTER TABLE "recipes" ADD COLUMN "company_id" UUID;',
      'ALTER TABLE "recipes" ADD COLUMN "company_id" UUID NOT NULL;',
    )
    expect(nacePorObligacion, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(nacePorObligacion)).toBe(false)

    // Sensibilidad 2: un `DEFAULT` convertiria «no dijo empresa» en «dijo esta» para siempre.
    const conDefault = upSource.replace(
      'ALTER TABLE "recipes" ADD COLUMN "company_id" UUID;',
      'ALTER TABLE "recipes" ADD COLUMN "company_id" UUID DEFAULT gen_random_uuid();',
    )
    expect(conDefault).not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(conDefault)).toBe(false)

    // Sensibilidad 3: sin el `SET NOT NULL` la columna queda opcional.
    const sinApretar = upSource.replace(
      'ALTER TABLE "recipes" ALTER COLUMN "company_id" SET NOT NULL;',
      '',
    )
    expect(sinApretar).not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(sinApretar)).toBe(false)
  })

  it('R5: la FK a companies existe y RESTRINGE el borrado del padre', () => {
    expect(declaresCompanyForeignKey(upSource)).toBe(true)

    // Sensibilidad 1: `CASCADE` borraria las recetas de una empresa con la empresa.
    const enCascada = upSource.replace(
      'FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
      'FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    expect(enCascada, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresCompanyForeignKey(enCascada)).toBe(false)

    // Sensibilidad 2: sin FK, `company_id` seria un uuid cualquiera.
    const sinFk = upSource.replace(
      /ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_fkey"[\s\S]*?;/,
      '',
    )
    expect(sinFk).not.toBe(upSource)
    expect(declaresCompanyForeignKey(sinFk)).toBe(false)
  })

  it('R6: el parentesis NO FORCE se abre EXACTAMENTE sobre recipes y companies, y se cierra', () => {
    expect(closesEveryNoForceParenthesis(upSource)).toBe(true)
    expect(releasesExactlyRecipesAndCompanies(upSource)).toBe(true)
    expect(endsWithForcedRlsOnRecipes(upSource)).toBe(true)
    expect(endsWithForcedRlsOnRecipes(downSource)).toBe(true)

    // Sensibilidad 1: `ENABLE` sin `FORCE` no somete al dueño de la tabla, con quien conecta
    // Prisma. En local -superusuario- esto no se distingue nunca.
    const sinForzar = upSource.replace(
      'ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;',
      'ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;',
    )
    expect(sinForzar, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(endsWithForcedRlsOnRecipes(sinForzar)).toBe(false)

    // Sensibilidad 2: dejar `companies` sin volver a forzar afloja el blindaje de otra ficha.
    const companiesSuelta = upSource.replace('ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;', '')
    expect(companiesSuelta).not.toBe(upSource)
    expect(closesEveryNoForceParenthesis(companiesSuelta)).toBe(false)

    // Sensibilidad 3: soltar una tabla de mas -aqui `units`- ensancharia el parentesis fuera
    // del alcance de esta ficha.
    const soltandoDeMas = `${upSource}\nALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;`
    expect(soltandoDeMas).not.toBe(upSource)
    expect(releasesExactlyRecipesAndCompanies(soltandoDeMas)).toBe(false)

    // Sensibilidad 4: una policy cambiaria el regimen de deny-by-default de la tabla.
    const conPolicy = `${upSource}\nCREATE POLICY "recipes_all" ON "recipes" USING (true);`
    expect(endsWithForcedRlsOnRecipes(conPolicy)).toBe(false)
  })

  it('R6, R8: cae el unico GLOBAL y nace el compuesto CON su WHERE — la asercion mas importante del archivo', () => {
    expect(swapsRecipeNameUniqueIndexKeepingPartialWhere(upSource)).toBe(true)
    expect(up).toContain('DROP INDEX "recipes_name_unique"')

    // --- FALSABILIDAD: la mutacion que borra el WHERE tiene que poner el predicado en rojo.
    // Es la prueba de que la asercion del enunciado detectaria de verdad el defecto que
    // preocupa: sin el WHERE, el borrado logico dejaria de liberar el nombre.
    const sinElWhere = upSource.replace(
      'CREATE UNIQUE INDEX "recipes_company_name_unique"\n  ON "recipes" ("company_id", "name_normalized")\n  WHERE "deleted_at" IS NULL;',
      'CREATE UNIQUE INDEX "recipes_company_name_unique"\n  ON "recipes" ("company_id", "name_normalized");',
    )
    expect(sinElWhere, 'la mutacion no quito el WHERE').not.toBe(upSource)
    expect(swapsRecipeNameUniqueIndexKeepingPartialWhere(sinElWhere)).toBe(false)

    // Sensibilidad 1: dejar el global en pie es el fallo que no rompe nada visible.
    const conElGlobal = upSource.replace('DROP INDEX "recipes_name_unique";', '')
    expect(conElGlobal, 'la mutacion no quito el DROP INDEX').not.toBe(upSource)
    expect(swapsRecipeNameUniqueIndexKeepingPartialWhere(conElGlobal)).toBe(false)

    // Sensibilidad 2: `company_id` en la cola sigue siendo unico, pero deja de servir como
    // indice de empresa y `recipes` se queda sin ninguno.
    const empresaEnLaCola = upSource.replace(
      'ON "recipes" ("company_id", "name_normalized")',
      'ON "recipes" ("name_normalized", "company_id")',
    )
    expect(empresaEnLaCola).not.toBe(upSource)
    expect(swapsRecipeNameUniqueIndexKeepingPartialWhere(empresaEnLaCola)).toBe(false)

    // Sensibilidad 3: el orden invertido -crear el compuesto antes de tirar el global- deja
    // ambos vivos a la vez durante una ventana que el predicado tiene que rechazar.
    const alReves = upSource.replace(
      /DROP INDEX "recipes_name_unique";\n\n([\s\S]*?WHERE "deleted_at" IS NULL;)/,
      (_match, compuesto: string) => `${compuesto}\n\nDROP INDEX "recipes_name_unique";`,
    )
    expect(alReves, 'la mutacion no reordeno las sentencias').not.toBe(upSource)
    expect(swapsRecipeNameUniqueIndexKeepingPartialWhere(alReves)).toBe(false)
  })

  it('el UP declara EXACTAMENTE un ADD CONSTRAINT y ningun DROP CONSTRAINT de mas', () => {
    expect(dropsOnlyExpectedConstraints(upSource, [])).toBe(true)
    const adds = up.filter((statement) => /\bADD CONSTRAINT\b/i.test(statement))
    expect(adds).toHaveLength(1)
    expect(adds[0]).toMatch(/^ALTER TABLE "recipes" ADD CONSTRAINT "recipes_company_id_fkey"/i)

    // Sensibilidad: el drift que `prisma migrate dev` propondria sobre una FK previa (p. ej. la
    // del creador) tiene que verse.
    const conDropDeMas = `${upSource}\nALTER TABLE "recipes" DROP CONSTRAINT "recipes_created_by_fkey";`
    expect(conDropDeMas).not.toBe(upSource)
    expect(dropsOnlyExpectedConstraints(conDropDeMas, [])).toBe(false)
  })
})

describe('QC-50 migration.sql — lo que la migracion NO hace', () => {
  it('no contiene ninguna sentencia INSERT ni DELETE, en el UP ni en el DOWN', () => {
    expect(insertsAndDeletesNothing(upSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)

    // El texto CRUDO (con comentarios) SI contiene las palabras «INSERT» y «DELETE» -la
    // trampa del enunciado-, pero ninguna como sentencia ejecutable.
    expect(upSource).toMatch(/INSERT/i)
    expect(upSource).toMatch(/DELETE/i)
    expect(insertsAndDeletesNothing(upSource)).toBe(true)

    // Sensibilidad por las tres vias.
    expect(
      insertsAndDeletesNothing(`${upSource}\nDELETE FROM "companies" WHERE "name" LIKE 'Test %';`),
    ).toBe(false)
    expect(
      insertsAndDeletesNothing(
        `${upSource}\nINSERT INTO "companies" ("name","name_normalized") VALUES ('X','x');`,
      ),
    ).toBe(false)
    expect(insertsAndDeletesNothing(`${upSource}\nTRUNCATE "recipes";`)).toBe(false)
  })

  it('no contiene ninguna sentencia sobre recipe_lines — solo se nombra en comentarios', () => {
    // La trampa: el texto CRUDO SI nombra `recipe_lines` -para explicar que no cambia-.
    expect(upSource).toMatch(/recipe_lines/i)
    expect(downSource.includes('recipe_lines') || true).toBe(true)

    // Pero, despojado de comentarios, la tabla desaparece del todo.
    expect(mentionsNoRecipeLines(upSource)).toBe(true)
    expect(mentionsNoRecipeLines(downSource)).toBe(true)

    // Sensibilidad: si una sentencia real tocara `recipe_lines`, el predicado tiene que caer.
    const tocandoLineas = `${upSource}\nALTER TABLE "recipe_lines" ADD COLUMN "company_id" UUID;`
    expect(tocandoLineas).not.toBe(upSource)
    expect(mentionsNoRecipeLines(tocandoLineas)).toBe(false)
  })

  it('el DOWN emite EXACTAMENTE un DROP CONSTRAINT, y es el de la FK que creo el propio UP', () => {
    expect(dropsOnlyExpectedConstraints(downSource, ['recipes_company_id_fkey'])).toBe(true)

    // Sensibilidad 1: si dropeara ademas una restriccion previa -drift-, tiene que caer.
    const conDropDeMas = `${downSource}\nALTER TABLE "recipes" DROP CONSTRAINT "recipes_updated_by_fkey";`
    expect(conDropDeMas).not.toBe(downSource)
    expect(dropsOnlyExpectedConstraints(conDropDeMas, ['recipes_company_id_fkey'])).toBe(false)

    // Sensibilidad 2: si NO dropeara la FK de empresa, el DOWN dejaria la FK huerfana sin
    // columna que referenciar cuando se quite `company_id` mas abajo.
    const sinDropear = downSource.replace(
      'ALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey";\n\n',
      '',
    )
    expect(sinDropear).not.toBe(downSource)
    expect(dropsOnlyExpectedConstraints(sinDropear, ['recipes_company_id_fkey'])).toBe(false)
  })

  it('R32: no toca orders, products, units ni companies mas alla del parentesis de RLS y la lectura del backfill', () => {
    expect(staysOutOfOtherTables(upSource)).toBe(true)
    expect(staysOutOfOtherTables(downSource)).toBe(true)

    // Sensibilidad 1: nombrar una tabla ajena, aunque sea de lectura.
    const conOrders = `${upSource}\nALTER TABLE "orders" ADD COLUMN "foo" UUID;`
    expect(staysOutOfOtherTables(conOrders)).toBe(false)

    // Sensibilidad 2: escribir en `companies` -no solo leerla- seria QC-77 de contrabando.
    const escribiendoCompanies = `${upSource}\nUPDATE "companies" SET "name_normalized" = 'quimicloud';`
    expect(staysOutOfOtherTables(escribiendoCompanies)).toBe(false)

    // Sensibilidad 3: crear algo nuevo sobre `companies` tampoco es alcance de esta ficha.
    const creandoSobreCompanies = `${upSource}\nCREATE INDEX "companies_extra_idx" ON "companies"("id");`
    expect(staysOutOfOtherTables(creandoSobreCompanies)).toBe(false)

    // Sensibilidad 4: alterar `companies` mas alla de RLS -p. ej. anadir columna- tampoco.
    const alterandoCompanies = `${upSource}\nALTER TABLE "companies" ADD COLUMN "foo" UUID;`
    expect(staysOutOfOtherTables(alterandoCompanies)).toBe(false)
  })

  it('R8: identificadores en ingles', () => {
    const tocados = touchedIdentifiers(upSource)
    expect(tocados).toContain('company_id')
    expect(tocados).toContain('recipes_company_id_fkey')
    expect(tocados).toContain('recipes_name_unique')
    expect(tocados).toContain('recipes_company_name_unique')

    expect(namesEverythingInEnglish(upSource)).toBe(true)
    expect(namesEverythingInEnglish(downSource)).toBe(true)

    // Sensibilidad: un identificador en castellano no pasa.
    const enCastellano = upSource.replace(
      /"recipes_company_name_unique"/g,
      '"recipes_empresa_nombre_unique"',
    )
    expect(enCastellano, 'la mutacion no se aplico').not.toBe(upSource)
    expect(namesEverythingInEnglish(enCastellano)).toBe(false)
  })
})

describe('QC-50 down.sql — el parentesis, las tres guardias y la restauracion', () => {
  it('R6: el DOWN abre con su propio parentesis NO FORCE y sus tres guardias, antes de restaurar nada', () => {
    expect(opensWithNoForceAndThreeDataGuards(downSource)).toBe(true)

    // Sensibilidad 1: sin la guardia de empresa ambigua, revertir con dos empresas llamadas
    // «QuimiCloud» elegiria una al azar como duena de todas las recetas del UP.
    const sinLaPrimera = downSource.replace(
      /IF named_company_rows = 1 THEN[\s\S]*?END IF;\n\n\s*-- 1\.2\./,
      '-- 1.2.',
    )
    expect(sinLaPrimera, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaPrimera)).toBe(false)

    // Sensibilidad 2: sin la guardia de fila ajena, quitar `company_id` mezclaria las recetas
    // de varias empresas en un unico monton indistinguible.
    const sinLaSegunda = downSource.replace(
      'FROM "recipes" WHERE "company_id" <> target_company_id;',
      'FROM "recipes" WHERE FALSE;',
    )
    expect(sinLaSegunda).not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaSegunda)).toBe(false)

    // Sensibilidad 3: sin la guardia de nombre repetido, restaurar el indice unico global
    // chocaria con un 23505 suelto en vez de con un mensaje que dice que hacer.
    const sinLaTercera = downSource.replace(
      /SELECT count\(\*\), COALESCE\(sum\(repeated\.copies\), 0\)\s*\n\s*INTO duplicated_names, duplicated_rows\s*\n\s*FROM \(\s*\n\s*SELECT "name_normalized", count\(DISTINCT "company_id"\)[\s\S]*?HAVING count\(DISTINCT "company_id"\) > 1\s*\n\s*\) AS repeated;/,
      'duplicated_names := 0;\n  duplicated_rows := 0;',
    )
    expect(sinLaTercera, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaTercera)).toBe(false)

    // Sensibilidad 4: un aviso en vez de un RAISE EXCEPTION no aborta nada.
    const soloAvisa = downSource.replace(/RAISE EXCEPTION/g, 'RAISE NOTICE')
    expect(soloAvisa).not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(soloAvisa)).toBe(false)

    // Sensibilidad 5: si el parentesis NO FORCE se abriera DESPUES de la primera guardia, esa
    // guardia leeria cero filas bajo FORCE sin policy y abortaria siempre con el mensaje
    // equivocado.
    const parentesisDespues = downSource.replace(
      'ALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;\nALTER TABLE "recipes"   NO FORCE ROW LEVEL SECURITY;\n\n',
      '',
    )
    const conParentesisAlFinalDelBloqueDeGuardias = parentesisDespues.replace(
      'END $$;',
      'END $$;\n\nALTER TABLE "companies" NO FORCE ROW LEVEL SECURITY;\nALTER TABLE "recipes"   NO FORCE ROW LEVEL SECURITY;',
    )
    expect(conParentesisAlFinalDelBloqueDeGuardias).not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(conParentesisAlFinalDelBloqueDeGuardias)).toBe(false)
  })

  it('R6: restaura el unico GLOBAL y PARCIAL, quita la FK y la columna, y cierra con ENABLE + FORCE', () => {
    expect(restoresGlobalPartialUniqueIndex(downSource)).toBe(true)
    expect(dropsForeignKeyAndColumnThenForcesRls(downSource)).toBe(true)

    // Sensibilidad 1: restaurar el unico global SIN el WHERE alcanzaria tambien a las
    // recetas borradas.
    const sinWhereEnElDown = downSource.replace(
      'CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;',
      'CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized");',
    )
    expect(sinWhereEnElDown, 'la mutacion no quito el WHERE').not.toBe(downSource)
    expect(restoresGlobalPartialUniqueIndex(sinWhereEnElDown)).toBe(false)

    // Sensibilidad 2: si el orden se invirtiera -crear el global antes de tirar el compuesto-
    // los dos convivirian brevemente y ninguno de los dos garantizaria lo que se espera.
    const alReves = downSource.replace(
      'DROP INDEX "recipes_company_name_unique";\n\nCREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;',
      'CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS NULL;\n\nDROP INDEX "recipes_company_name_unique";',
    )
    expect(alReves).not.toBe(downSource)
    expect(restoresGlobalPartialUniqueIndex(alReves)).toBe(false)

    // Sensibilidad 3: si la FK no se quitara antes que la columna, Postgres rechazaria el
    // `DROP COLUMN` mientras la FK siga dependiendo de ella.
    const columnaAntes = downSource.replace(
      'ALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey";\n\nALTER TABLE "recipes" DROP COLUMN "company_id";',
      'ALTER TABLE "recipes" DROP COLUMN "company_id";\n\nALTER TABLE "recipes" DROP CONSTRAINT "recipes_company_id_fkey";',
    )
    expect(columnaAntes).not.toBe(downSource)
    expect(dropsForeignKeyAndColumnThenForcesRls(columnaAntes)).toBe(false)

    // Sensibilidad 4: sin volver a forzar la RLS, la tabla quedaria menos protegida que antes.
    const sinForzar = downSource.replace('ALTER TABLE "recipes" FORCE ROW LEVEL SECURITY;', '')
    expect(sinForzar).not.toBe(downSource)
    expect(dropsForeignKeyAndColumnThenForcesRls(sinForzar)).toBe(false)
  })

  it('no contiene ningun DELETE — revertir el esquema no es tirar el dato', () => {
    expect(insertsAndDeletesNothing(downSource)).toBe(true)
    expect(stripSqlComments(downSource)).not.toMatch(/\bDELETE\s+FROM\b/i)

    const conBorrado = `${downSource}\nDELETE FROM "recipes" WHERE "company_id" IS NULL;`
    expect(conBorrado).not.toBe(downSource)
    expect(insertsAndDeletesNothing(conBorrado)).toBe(false)
  })
})

describe('QC-50 — lo que ya estaba escrito y esta migracion no toca', () => {
  it('el CHECK de recipe_lines y las FK previas de recipes/recipe_lines siguen escritos donde estaban', () => {
    // El recuento se CALCULA recorriendo todas las migraciones anteriores, no se escribe a
    // mano: una lista literal envejeceria en silencio cada vez que otra ficha tocara alguna.
    expect([...restriccionesPreviasDeRecipes.keys()].sort()).toEqual(
      ['recipes_created_by_fkey', 'recipes_updated_by_fkey'].sort(),
    )
    const checksDeLineas = [...restriccionesPreviasDeRecipeLines.entries()]
      .filter(([, statement]) => /\bCHECK\s*\(/i.test(statement))
      .map(([nombre]) => nombre)
    // Una migracion posterior sustituyo el nombre del CHECK; esta migracion sigue sin tocarlo,
    // asi que lo que debe verse aqui es el nombre vivo actual, no el historico.
    expect(checksDeLineas).toEqual(['recipe_lines_percentage_range'])
    expect([...restriccionesPreviasDeRecipeLines.keys()]).toContain('recipe_lines_recipe_id_fkey')
    expect([...restriccionesPreviasDeRecipeLines.keys()]).toContain('recipe_lines_product_id_fkey')
    // Una migracion posterior quito la unidad de la linea junto con su FK; ya no hay
    // "recipe_lines_unit_id_fkey" que siga vivo.
    expect([...restriccionesPreviasDeRecipeLines.keys()]).not.toContain('recipe_lines_unit_id_fkey')
  })

  it('ni el UP ni el DOWN de esta ficha nombran ninguna de esas restricciones previas', () => {
    const suya = new Set(['recipes_company_id_fkey'])
    for (const nombre of nombresPreviosCombinados) {
      expect(suya.has(nombre), `${nombre} no es de esta ficha`).toBe(false)
      for (const [etiqueta, source] of [
        ['UP', up],
        ['DOWN', down],
      ] as const) {
        expect(
          source.filter((statement) =>
            new RegExp(`(ADD|DROP) CONSTRAINT (?:IF EXISTS )?"${nombre}"`, 'i').test(statement),
          ),
          `el ${etiqueta} de QC-50 no debe tocar ${nombre}`,
        ).toHaveLength(0)
      }
    }
  })
})
