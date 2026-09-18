// Contrato ESTATICO del SQL de `20260917120000_suppliers_company_scope`.
//
// NADA DE LO QUE SE VIGILA AQUI LO REGENERA PRISMA, y esa es la unica razon de que este
// archivo exista. La migracion esta ESCRITA ENTERA A MANO y lleva dentro seis cosas que
// `db/schema.prisma` no declara -o declara a medias- y que ningun tipo ni cliente generado
// detectaria si una migracion futura se las llevara por delante:
//
//   1. las dos FK a `companies` --`companyId` se declara ESCALAR SIN `@relation` a proposito,
//      asi que este SQL es el UNICO sitio donde esas FK existen, y para Prisma son DRIFT--;
//   2. las DOS FK COMPUESTAS -`(company_id, supplier_id)` y `(company_id, presentation_id)`-,
//      que son el corazon de la ficha: son las que hacen IMPOSIBLE que una linea contradiga la
//      empresa de su proveedor o la de su presentacion. Prisma no modela ninguna de las dos;
//   3. las dos claves candidatas `(company_id, id)` que esas FK necesitan para existir;
//   4. los dos bloques `DO $$` de backfill, con su resolucion univoca de «QuimiCloud» por
//      nombre normalizado y su comprobacion de `ROW_COUNT`;
//   5. el parentesis `NO FORCE` / `ENABLE`+`FORCE` de la RLS sobre las CUATRO tablas que el
//      archivo lee o escribe; y
//   6. el RELEVO del indice unico de nombre: cae el GLOBAL y nace el compuesto por empresa, EN
//      ESE ORDEN, y **sigue siendo PARCIAL** por `deleted_at IS NULL`. Sin ese `WHERE`, dar de
//      baja un proveedor dejaria su nombre ocupado para siempre y nada mas lo detectaria: es la
//      asercion mas importante de este archivo.
//
// PATRON, el de `recipes-company-scope-migration.test.ts` y `orders-company-scope-migration
// .test.ts`: cada afirmacion se escribe como un PREDICADO PURO que recibe el texto SQL y
// devuelve el veredicto, y se aplica DOS VECES --al SQL real (pasa) y a una version MUTADA EN
// MEMORIA (falla)--. El archivo en disco NO se toca nunca. Un test que no puede fallar no
// vigila nada.
//
// LA TRAMPA que este archivo evita: `DELETE`, `INSERT` y `presentations` aparecen en el SQL
// real, pero solo dentro de comentarios y dentro de clausulas `ON DELETE RESTRICT`/`CASCADE`,
// que no son sentencias `DELETE`. Por eso `stripSqlComments` quita los comentarios ANTES de
// cualquier asercion, y las aserciones sobre `INSERT`/`DELETE` exigen la forma de sentencia
// (`INSERT INTO` / `DELETE FROM`), nunca la palabra suelta.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que las restricciones MUERDAN en la base, ni que la reversion
// deje el esquema como estaba. Eso es `tests/integration/proveedores/company-scope.int.test.ts`.
// Aqui se prueba que estan ESCRITAS, que es la mitad que una migracion futura puede perder en
// silencio.
//
// Cubre R8 (parte), R9, R10, R12, R15 (angulo 1) y R38 (parte).

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

const MIGRACION = '_suppliers_company_scope'
const migrationDir = findMigrationDir(MIGRACION)

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. Es la
 * defensa contra la trampa: el SQL real dice «Ningun INSERT y ningun DELETE» y nombra
 * `presentations` en varios comentarios, y un `includes` ingenuo sobre el texto crudo daria un
 * falso positivo en la direccion equivocada -un test que pasa por una frase que EXPLICA la
 * ausencia, no por la ausencia misma-.
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
 * Parte por `;`. Los bloques `DO $$ ... $$` llevan `;` dentro y salen partidos en trozos, pero
 * ninguno de esos trozos empieza por `CREATE`, `ALTER` ni `DROP`, asi que no ensucian ninguna
 * afirmacion anclada con `^`. Lo que se afirma SOBRE UN BLOQUE se comprueba contra el texto
 * completo, no contra esta lista.
 */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

/**
 * Vacia los literales de texto. Los mensajes de las guardias nombran tablas y columnas dentro
 * de un literal -para decirle a quien migra que consulta correr-, y ademas llevan `;` dentro,
 * asi que el troceo por `;` los parte y ningun vaciado hecho sentencia a sentencia funcionaria.
 * Un literal es prosa, igual que un comentario: o se vacia antes de trocear, o una afirmacion
 * sobre el SQL acabaria decidiendose por una frase.
 */
function stripSqlStrings(sql: string): string {
  return sql.replace(/'(?:''|[^'])*'/g, "''")
}

/** El texto ejecutable entero, en una sola linea. Para lo que cruza varias sentencias. */
function flatSql(sql: string): string {
  return stripSqlComments(sql).replace(/\s+/g, ' ')
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

/** Posicion de la primera sentencia que cumple el patron, o -1. */
function indiceDe(source: readonly string[], patron: RegExp): number {
  return source.findIndex((statement) => patron.test(statement))
}

// --- Predicados puros: el UP declara -------------------------------------------------------

const TABLAS_CON_COLUMNA = ['suppliers', 'supplier_catalog_lines'] as const

/**
 * R8 (parte). ¿Las DOS columnas `company_id` nacen UUID anulables, se rellenan por su backfill
 * y se aprietan a `NOT NULL` DESPUES, sin `DEFAULT`?
 */
function addsBothNullableCompanyColumnsThenNotNull(sql: string): boolean {
  const source = statements(sql)
  const sinDefault = !/"company_id"[^;]*\bDEFAULT\b/i.test(flatSql(sql))
  if (!sinDefault) return false

  // El troceo por `;` parte los bloques `DO $$` y deja el `BEGIN` pegado a la primera
  // sentencia del bloque: por eso el prefijo es opcional, y no porque el anclaje se relaje.
  const backfillProveedores = indiceDe(
    source,
    /^(?:BEGIN )?UPDATE "suppliers" SET "company_id" = target_company_id$/i,
  )
  const backfillLineas = indiceDe(
    source,
    /^(?:BEGIN )?UPDATE "supplier_catalog_lines" AS l SET "company_id" = s\."company_id" FROM "suppliers" AS s WHERE s\."id" = l\."supplier_id"$/i,
  )
  if (backfillProveedores === -1 || backfillLineas === -1) return false

  return TABLAS_CON_COLUMNA.every((tabla) => {
    const nace = indiceDe(source, new RegExp(`^ALTER TABLE "${tabla}" ADD COLUMN "company_id" UUID$`, 'i'))
    const aprieta = indiceDe(
      source,
      new RegExp(`^ALTER TABLE "${tabla}" ALTER COLUMN "company_id" SET NOT NULL$`, 'i'),
    )
    const backfill = tabla === 'suppliers' ? backfillProveedores : backfillLineas
    return nace !== -1 && aprieta !== -1 && nace < backfill && backfill < aprieta
  })
}

/**
 * R8 (parte). ¿La linea deriva su empresa DE SU PROVEEDOR y no repite la resolucion por nombre?
 * Es lo que garantiza que no existe ni un instante con una linea cuya empresa discrepe de la de
 * su proveedor.
 */
function fillsLinesFromTheirSupplier(sql: string): boolean {
  const derivaDelProveedor =
    /UPDATE "supplier_catalog_lines" AS l SET "company_id" = s\."company_id" FROM "suppliers" AS s WHERE s\."id" = l\."supplier_id"/i.test(
      flatSql(sql),
    )
  // Y ninguna escritura de la linea vuelve a resolver la empresa por nombre: repetir esa
  // resolucion es lo que abriria la ventana en la que una linea puede discrepar de su proveedor.
  const escriturasDeLinea = statements(sql).filter((statement) =>
    /\bUPDATE "supplier_catalog_lines"/i.test(statement),
  )
  const ningunaPorNombre =
    escriturasDeLinea.length > 0 && escriturasDeLinea.every((statement) => !/quimicloud/i.test(statement))
  return derivaDelProveedor && ningunaPorNombre
}

/** R8 (parte). ¿Lo unico que escribe un `UPDATE` de este archivo es la columna que el mismo anade? */
function onlyWritesItsOwnColumn(sql: string): boolean {
  const updates = statements(sql).filter((statement) => /\bUPDATE\s+"\w+"/i.test(statement))
  if (updates.length === 0) return false
  return updates.every((statement) => {
    const columnas = [...statement.matchAll(/SET\s+("[\w]+")\s*=/gi)].map((match) => match[1])
    return columnas.length > 0 && columnas.every((columna) => columna === '"company_id"')
  })
}

/** Las dos FK SIMPLES a `companies`, con `ON DELETE RESTRICT ON UPDATE CASCADE`. */
function declaresBothCompanyForeignKeys(sql: string): boolean {
  const source = statements(sql)
  return TABLAS_CON_COLUMNA.every((tabla) => {
    const fk = source.find((statement) =>
      new RegExp(`^ALTER TABLE "${tabla}" ADD CONSTRAINT "${tabla}_company_id_fkey"`, 'i').test(statement),
    )
    if (fk === undefined) return false
    return (
      /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/i.test(fk) &&
      /ON DELETE RESTRICT/i.test(fk) &&
      /ON UPDATE CASCADE/i.test(fk) &&
      !/ON DELETE (CASCADE|SET NULL)/i.test(fk)
    )
  })
}

/** Las DOS claves candidatas `UNIQUE ("company_id", "id")`, con `company_id` de CABEZA. */
function declaresBothCandidateKeys(sql: string): boolean {
  const source = statements(sql)
  return (['suppliers', 'presentations'] as const).every((tabla) =>
    source.some((statement) =>
      new RegExp(
        `^ALTER TABLE "${tabla}" ADD CONSTRAINT "${tabla}_company_id_id_key" UNIQUE \\("company_id", "id"\\)$`,
        'i',
      ).test(statement),
    ),
  )
}

/** Las DOS FK COMPUESTAS, cada una con su tabla destino y su regla de borrado. */
function declaresBothCompositeForeignKeys(sql: string): boolean {
  const source = statements(sql)

  const haciaProveedor = source.find((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"/i.test(
      statement,
    ),
  )
  const haciaPresentacion = source.find((statement) =>
    /^ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"/i.test(
      statement,
    ),
  )
  if (haciaProveedor === undefined || haciaPresentacion === undefined) return false

  const proveedorOk =
    /FOREIGN KEY \("company_id", "supplier_id"\) REFERENCES "suppliers"\("company_id", "id"\)/i.test(
      haciaProveedor,
    ) &&
    /ON DELETE CASCADE/i.test(haciaProveedor) &&
    /ON UPDATE CASCADE/i.test(haciaProveedor)

  const presentacionOk =
    /FOREIGN KEY \("company_id", "presentation_id"\) REFERENCES "presentations"\("company_id", "id"\)/i.test(
      haciaPresentacion,
    ) &&
    /ON DELETE RESTRICT/i.test(haciaPresentacion) &&
    /ON UPDATE CASCADE/i.test(haciaPresentacion)

  return proveedorOk && presentacionOk
}

/**
 * Las claves candidatas van ANTES que las FK compuestas que las referencian: al reves Postgres
 * responde `there is no unique constraint matching given keys`.
 */
function declaresCandidateKeysBeforeCompositeForeignKeys(sql: string): boolean {
  const source = statements(sql)
  const candidataProveedor = indiceDe(source, /ADD CONSTRAINT "suppliers_company_id_id_key"/i)
  const candidataPresentacion = indiceDe(source, /ADD CONSTRAINT "presentations_company_id_id_key"/i)
  const fkProveedor = indiceDe(source, /ADD CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"/i)
  const fkPresentacion = indiceDe(
    source,
    /ADD CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"/i,
  )
  if ([candidataProveedor, candidataPresentacion, fkProveedor, fkPresentacion].includes(-1)) return false
  return candidataProveedor < fkProveedor && candidataPresentacion < fkPresentacion
}

/** Las dos FK SIMPLES que ya existian hacia `suppliers` y `presentations` no se sustituyen. */
function keepsThePreviousSimpleForeignKeys(sql: string): boolean {
  const texto = flatSql(sql)
  return (
    !/DROP CONSTRAINT (?:IF EXISTS )?"supplier_catalog_lines_supplier_id_fkey"/i.test(texto) &&
    !/DROP CONSTRAINT (?:IF EXISTS )?"supplier_catalog_lines_presentation_id_fkey"/i.test(texto)
  )
}

/** R9. Las CUATRO tablas que el archivo suelta, y ninguna mas. */
const TABLAS_DEL_PARENTESIS = ['companies', 'presentations', 'supplier_catalog_lines', 'suppliers'] as const

function releasesExactlyTheFourTables(sql: string): boolean {
  const soltadas = statements(sql)
    .map((statement) => /^ALTER TABLE "(\w+)" NO FORCE ROW LEVEL SECURITY$/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
    .sort()
  return JSON.stringify(soltadas) === JSON.stringify([...TABLAS_DEL_PARENTESIS].sort())
}

/** R9. ¿Toda tabla que se suelta vuelve a quedar ACTIVADA Y FORZADA, y sin ninguna policy? */
function closesEveryNoForceParenthesis(sql: string): boolean {
  const source = statements(sql)
  if (/CREATE\s+POLICY/i.test(stripSqlComments(sql))) return false

  const soltadas = new Set(
    source
      .map((statement) => /^ALTER TABLE "(\w+)" NO FORCE ROW LEVEL SECURITY$/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string),
  )
  if (soltadas.size === 0) return false

  return [...soltadas].every((tabla) => {
    const suelta = indiceDe(source, new RegExp(`^ALTER TABLE "${tabla}" NO FORCE ROW LEVEL SECURITY$`, 'i'))
    const activa = indiceDe(source, new RegExp(`^ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY$`, 'i'))
    const fuerza = indiceDe(source, new RegExp(`^ALTER TABLE "${tabla}" FORCE ROW LEVEL SECURITY$`, 'i'))
    return activa > suelta && fuerza > suelta
  })
}

/**
 * R15, ANGULO 1. ¿Cae el unico GLOBAL `suppliers_name_unique` y nace el compuesto
 * `suppliers_company_name_unique` sobre `(company_id, name_normalized)` **con su
 * `WHERE "deleted_at" IS NULL`**, en ese orden?
 *
 * Es la asercion MAS IMPORTANTE del archivo. El molde de `presentations` era TOTAL -esa tabla no
 * tiene borrado logico- y copiarlo aqui dejaria el nombre de un proveedor dado de baja ocupado
 * para siempre, sin un solo test en rojo.
 */
function swapsSupplierNameUniqueIndexKeepingPartialWhere(sql: string): boolean {
  const source = statements(sql)
  const caeElGlobal = indiceDe(source, /^DROP INDEX "suppliers_name_unique"$/i)
  const naceElCompuesto = indiceDe(source, /^CREATE UNIQUE INDEX "suppliers_company_name_unique"/i)
  if (caeElGlobal === -1 || naceElCompuesto === -1) return false

  const compuesto = source[naceElCompuesto] as string
  const columnas = /ON "suppliers" \("company_id", "name_normalized"\)/i.test(compuesto)
  const esParcial = /WHERE "deleted_at" IS NULL$/i.test(compuesto)
  return caeElGlobal < naceElCompuesto && columnas && esParcial
}

/** R13 en el texto: el indice de la linea lleva `company_id` de CABEZA. */
function indexesTheLineCompanyColumnFirst(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^CREATE INDEX "supplier_catalog_lines_company_id_supplier_id_idx" ON "supplier_catalog_lines" \("company_id", "supplier_id"\)$/i.test(
      statement,
    ),
  )
}

// --- Predicados puros: el UP NO hace -------------------------------------------------------

/**
 * ¿Ni un `INSERT INTO`, ni un `DELETE FROM`, ni un `TRUNCATE`, en ningun sitio del texto SIN
 * comentarios?
 *
 * Se anclan a la FORMA de sentencia y no a la palabra suelta, precisamente para no confundir la
 * sentencia con la clausula `ON DELETE RESTRICT`/`CASCADE` de una FK, que contiene la palabra
 * `DELETE` sin ser un borrado.
 */
function insertsAndDeletesNothing(sql: string): boolean {
  const texto = flatSql(sql)
  return (
    !/\bINSERT\s+INTO\b/i.test(texto) && !/\bDELETE\s+FROM\b/i.test(texto) && !/\bTRUNCATE\b/i.test(texto)
  )
}

/**
 * R38. ¿`presentations` -tabla de OTRO modulo- solo aparece por su clave candidata, por el
 * parentesis de RLS, como destino de la FK compuesta y como LECTURA de la guardia?
 *
 * No gana ninguna columna, ningun indice y ninguna otra restriccion: ese es el limite exacto que
 * la ficha se puso sobre el aislamiento de `inventario`.
 */
function touchesPresentationsOnlyForItsCandidateKeyAndRls(sql: string): boolean {
  for (const statement of statements(stripSqlStrings(stripSqlComments(sql)))) {
    if (!/\bpresentations\b/i.test(statement)) continue
    if (/^ALTER TABLE "presentations" (?:NO FORCE|ENABLE|FORCE) ROW LEVEL SECURITY$/i.test(statement)) continue
    if (
      /^ALTER TABLE "presentations" (?:ADD|DROP) CONSTRAINT "presentations_company_id_id_key"/i.test(statement)
    ) {
      continue
    }
    if (
      /^ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"/i.test(
        statement,
      )
    ) {
      continue
    }
    // La guardia del paso 4 LEE `presentations` para contar las lineas cruzadas. Leer si, tocar no.
    if (/^(?:BEGIN )?SELECT count\(\*\)/i.test(statement)) continue
    return false
  }
  return !/ALTER TABLE "presentations" ADD COLUMN/i.test(flatSql(sql))
}

/** Las tablas de las otras fichas, que esta migracion no puede nombrar (R38). */
const TABLAS_AJENAS = [
  'orders',
  'order_assignments',
  'products',
  'product_batches',
  'units',
  'recipes',
  'recipe_lines',
  'users',
] as const

/**
 * R38. ¿La migracion se queda en su alcance? `companies` solo puede aparecer en el parentesis de
 * RLS y en la LECTURA del backfill y de las guardias.
 */
function staysOutOfOtherTables(sql: string): boolean {
  const texto = flatSql(sql)
  const tocaTablaAjena = TABLAS_AJENAS.some((tabla) => new RegExp(`\\b${tabla}\\b`, 'i').test(texto))
  const alteraCompanies = /ALTER TABLE "companies" (?!NO FORCE|ENABLE|FORCE)/i.test(texto)
  const escribeCompanies = /(INSERT INTO|UPDATE)\s+"companies"/i.test(texto)
  const creaSobreCompanies = /(CREATE|DROP)\s+(TABLE|INDEX|TRIGGER|FUNCTION)[^;]*"companies"/i.test(texto)
  return !tocaTablaAjena && !alteraCompanies && !escribeCompanies && !creaSobreCompanies
}

/**
 * R12. Vocabulario INGLES admitido en los identificadores que ESTA migracion crea, renombra o
 * borra. Lista blanca, no lista negra: una lista de palabras prohibidas solo atrapa las que a
 * alguien se le ocurrieron.
 */
const VOCABULARIO_INGLES = new Set([
  'catalog',
  'company',
  'fkey',
  'id',
  'idx',
  'key',
  'lines',
  'name',
  'presentation',
  'presentations',
  'supplier',
  'suppliers',
  'unique',
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

/** R12. ¿Todo lo que el archivo crea, renombra o borra esta nombrado en ingles? */
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

/** R12. Las marcas de tiempo y el borrado logico no se tocan: ninguna es identificador tocado. */
function leavesTimestampsAndSoftDeleteAlone(sql: string): boolean {
  const tocados = new Set(touchedIdentifiers(sql))
  return !['created_at', 'updated_at', 'deleted_at'].some((columna) => tocados.has(columna))
}

// --- Predicados puros: el DOWN ---------------------------------------------------------------

/**
 * R10, R11. ¿El DOWN abre con el parentesis `NO FORCE` de RLS y sus TRES guardias de datos
 * -empresa del UP ambigua, fila de otra empresa en CUALQUIERA de las dos tablas, y dos
 * proveedores vivos de empresas distintas con el mismo nombre normalizado-, ANTES de restaurar
 * nada del esquema?
 */
function opensWithNoForceAndThreeDataGuards(sql: string): boolean {
  const texto = flatSql(sql)
  const guardias = [
    /IF named_company_rows = 1 THEN[\s\S]*ELSIF named_company_rows = 0 THEN/i,
    /FROM "suppliers" WHERE "company_id" <> target_company_id/i,
    /FROM "supplier_catalog_lines" WHERE "company_id" <> target_company_id/i,
    /GROUP BY "name_normalized"\s*HAVING count\(DISTINCT "company_id"\) > 1/i,
  ]
  if (!guardias.every((guardia) => guardia.test(texto))) return false

  const abortos = texto.match(/RAISE EXCEPTION/gi) ?? []
  if (abortos.length < 3) return false

  const primerNoForce = texto.search(/ALTER TABLE "\w+" NO FORCE ROW LEVEL SECURITY/i)
  const primerBloque = texto.search(/DO\s+\$\$/i)
  if (primerNoForce === -1 || primerBloque === -1 || primerNoForce > primerBloque) return false

  const ultimaGuardia = texto.search(/GROUP BY "name_normalized"\s*HAVING count\(DISTINCT "company_id"\) > 1/i)
  const primeraRestauracion = texto.search(/ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT/i)
  return primeraRestauracion > ultimaGuardia
}

/**
 * R10. ¿El DOWN quita las FK ANTES que las claves candidatas que esas FK referencian? Al reves,
 * Postgres se niega a soltar una clave unica mientras una FK la referencie.
 */
function dropsForeignKeysBeforeCandidateKeys(sql: string): boolean {
  const source = statements(sql)
  const fkCompuestaProveedor = indiceDe(
    source,
    /^ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey"$/i,
  )
  const fkCompuestaPresentacion = indiceDe(
    source,
    /^ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey"$/i,
  )
  const candidataProveedor = indiceDe(
    source,
    /^ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_company_id_id_key"$/i,
  )
  const candidataPresentacion = indiceDe(
    source,
    /^ALTER TABLE "presentations" DROP CONSTRAINT "presentations_company_id_id_key"$/i,
  )
  if (
    [fkCompuestaProveedor, fkCompuestaPresentacion, candidataProveedor, candidataPresentacion].includes(-1)
  ) {
    return false
  }
  return (
    fkCompuestaProveedor < candidataProveedor &&
    fkCompuestaPresentacion < candidataPresentacion &&
    fkCompuestaProveedor < candidataPresentacion &&
    fkCompuestaPresentacion < candidataProveedor
  )
}

/**
 * R10, R15. ¿El DOWN restaura el unico GLOBAL **Y PARCIAL** `suppliers_name_unique`, DESPUES de
 * quitar el compuesto por empresa?
 */
function restoresGlobalPartialUniqueIndex(sql: string): boolean {
  const source = statements(sql)
  const caeElCompuesto = indiceDe(source, /^DROP INDEX "suppliers_company_name_unique"$/i)
  const naceElGlobal = indiceDe(
    source,
    /^CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"\("name_normalized"\) WHERE "deleted_at" IS NULL$/i,
  )
  if (caeElCompuesto === -1 || naceElGlobal === -1) return false
  return caeElCompuesto < naceElGlobal
}

/** R10. ¿Las dos columnas caen DESPUES de las FK que dependen de ellas, y el archivo cierra forzando la RLS? */
function dropsBothColumnsAfterTheirConstraints(sql: string): boolean {
  const source = statements(sql)
  const ultimaFk = Math.max(
    indiceDe(source, /DROP CONSTRAINT "suppliers_company_id_fkey"$/i),
    indiceDe(source, /DROP CONSTRAINT "supplier_catalog_lines_company_id_fkey"$/i),
  )
  const columnas = TABLAS_CON_COLUMNA.map((tabla) =>
    indiceDe(source, new RegExp(`^ALTER TABLE "${tabla}" DROP COLUMN "company_id"$`, 'i')),
  )
  if (ultimaFk === -1 || columnas.includes(-1)) return false
  return columnas.every((indice) => indice > ultimaFk) && closesEveryNoForceParenthesis(sql)
}

// --- Lo que ya estaba escrito y esta migracion NO puede tocar --------------------------------

/**
 * Restricciones VIVAS de una tabla justo antes de esta migracion, calculadas recorriendo TODAS
 * las migraciones anteriores en orden y aplicando sus `ADD`/`DROP CONSTRAINT`. Se calcula en vez
 * de escribirse a mano: una lista literal envejeceria en silencio.
 */
function constraintsBefore(tabla: string, exclude: string): ReadonlyMap<string, string> {
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
      const add = new RegExp(`^ALTER TABLE "?${tabla}"? ADD CONSTRAINT "?(\\w+)"?`, 'i').exec(statement)
      if (add !== null) {
        vivas.set(add[1] as string, statement)
        continue
      }
      const drop = new RegExp(
        `^ALTER TABLE "?${tabla}"? DROP CONSTRAINT (?:IF EXISTS )?"?(\\w+)"?`,
        'i',
      ).exec(statement)
      if (drop !== null) vivas.delete(drop[1] as string)
    }
  }
  return vivas
}

const restriccionesPreviasDeSuppliers = constraintsBefore('suppliers', MIGRACION)
const restriccionesPreviasDeLineas = constraintsBefore('supplier_catalog_lines', MIGRACION)
const nombresPreviosCombinados = [
  ...restriccionesPreviasDeSuppliers.keys(),
  ...restriccionesPreviasDeLineas.keys(),
].sort()

function checksDe(vivas: ReadonlyMap<string, string>): readonly string[] {
  return [...vivas.entries()]
    .filter(([, statement]) => /\bCHECK\s*\(/i.test(statement))
    .map(([nombre]) => nombre)
    .sort()
}

// =============================================================================================

describe('QC-59 migration.sql — lo que la migracion DECLARA', () => {
  it('R8 (parte), R12: las DOS columnas nacen anulables, se rellenan y se aprietan a NOT NULL', () => {
    expect(addsBothNullableCompanyColumnsThenNotNull(upSource)).toBe(true)

    // Sensibilidad 1: nacer `NOT NULL` fallaria sobre las filas que ya existen.
    const nacePorObligacion = upSource.replace(
      /ALTER TABLE "suppliers"(\s+)ADD COLUMN "company_id" UUID;/,
      'ALTER TABLE "suppliers"$1ADD COLUMN "company_id" UUID NOT NULL;',
    )
    expect(nacePorObligacion, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsBothNullableCompanyColumnsThenNotNull(nacePorObligacion)).toBe(false)

    // Sensibilidad 2: un `DEFAULT` convertiria «no dijo empresa» en «dijo esta» para siempre.
    const conDefault = upSource.replace(
      /ALTER TABLE "supplier_catalog_lines"(\s+)ADD COLUMN "company_id" UUID;/,
      'ALTER TABLE "supplier_catalog_lines"$1ADD COLUMN "company_id" UUID DEFAULT gen_random_uuid();',
    )
    expect(conDefault, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsBothNullableCompanyColumnsThenNotNull(conDefault)).toBe(false)

    // Sensibilidad 3: sin el `SET NOT NULL` de la LINEA, la columna de la linea queda opcional y
    // la FK compuesta dejaria pasar filas sin empresa.
    const sinApretarLaLinea = upSource.replace(
      /ALTER TABLE "supplier_catalog_lines"\s+ALTER COLUMN "company_id" SET NOT NULL;/,
      '',
    )
    expect(sinApretarLaLinea, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsBothNullableCompanyColumnsThenNotNull(sinApretarLaLinea)).toBe(false)
  })

  it('R8 (parte): la linea hereda la empresa DE SU PROVEEDOR, y el UP solo escribe esa columna', () => {
    expect(fillsLinesFromTheirSupplier(upSource)).toBe(true)
    expect(onlyWritesItsOwnColumn(upSource)).toBe(true)

    // Sensibilidad 1: repetir la resolucion por nombre para la linea abriria la ventana en la que
    // una linea puede discrepar de su proveedor.
    const resolviendoDosVeces = upSource.replace(
      'UPDATE "supplier_catalog_lines" AS l\n     SET "company_id" = s."company_id"\n    FROM "suppliers" AS s\n   WHERE s."id" = l."supplier_id";',
      'UPDATE "supplier_catalog_lines" SET "company_id" = (SELECT "id" FROM "companies" WHERE "name_normalized" = \'quimicloud\');',
    )
    expect(resolviendoDosVeces, 'la mutacion no se aplico').not.toBe(upSource)
    expect(fillsLinesFromTheirSupplier(resolviendoDosVeces)).toBe(false)

    // Sensibilidad 2: escribir cualquier otra columna seria tocar dato que no es de esta ficha.
    const escribiendoDeMas = `${upSource}\nUPDATE "suppliers" SET "name" = 'x';`
    expect(onlyWritesItsOwnColumn(escribiendoDeMas)).toBe(false)
  })

  it('R12: las dos FK simples a companies existen y RESTRINGEN el borrado del padre', () => {
    expect(declaresBothCompanyForeignKeys(upSource)).toBe(true)

    // Sensibilidad 1: `CASCADE` borraria los proveedores de una empresa con la empresa.
    const enCascada = upSource.replace(
      'ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey"\n  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
      'ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey"\n  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    expect(enCascada, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresBothCompanyForeignKeys(enCascada)).toBe(false)

    // Sensibilidad 2: sin la FK de la LINEA, su `company_id` seria un uuid cualquiera.
    const sinLaDeLaLinea = upSource.replace(
      /ALTER TABLE "supplier_catalog_lines" ADD CONSTRAINT "supplier_catalog_lines_company_id_fkey"[\s\S]*?;/,
      '',
    )
    expect(sinLaDeLaLinea, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresBothCompanyForeignKeys(sinLaDeLaLinea)).toBe(false)
  })

  it('R12: las DOS claves candidatas y las DOS FK compuestas, en el orden que Postgres exige', () => {
    expect(declaresBothCandidateKeys(upSource)).toBe(true)
    expect(declaresBothCompositeForeignKeys(upSource)).toBe(true)
    expect(declaresCandidateKeysBeforeCompositeForeignKeys(upSource)).toBe(true)
    expect(keepsThePreviousSimpleForeignKeys(upSource)).toBe(true)

    // Sensibilidad 1: sin la clave candidata de `presentations`, su FK compuesta ni siquiera se
    // puede crear -Postgres responde 42830-, y el texto tiene que delatarlo antes.
    const sinCandidataDePresentaciones = upSource.replace(
      /ALTER TABLE "presentations" ADD CONSTRAINT "presentations_company_id_id_key"[^;]*;/,
      '',
    )
    expect(sinCandidataDePresentaciones, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresBothCandidateKeys(sinCandidataDePresentaciones)).toBe(false)

    // Sensibilidad 2: el orden invertido -las FK antes que las candidatas- es exactamente el
    // fallo que Postgres rechaza en ejecucion.
    const alReves = upSource.replace(
      /(ALTER TABLE "suppliers"     ADD CONSTRAINT "suppliers_company_id_id_key"[^;]*;\n)(ALTER TABLE "presentations" ADD CONSTRAINT "presentations_company_id_id_key"[^;]*;\n)/,
      '',
    )
    expect(alReves, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresCandidateKeysBeforeCompositeForeignKeys(alReves)).toBe(false)

    // Sensibilidad 3: la FK compuesta hacia `presentations` con `CASCADE` cambiaria el
    // comportamiento de la simple que se conserva.
    const presentacionEnCascada = upSource.replace(
      'FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")\n  ON DELETE RESTRICT ON UPDATE CASCADE;',
      'FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations"("company_id", "id")\n  ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    expect(presentacionEnCascada, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresBothCompositeForeignKeys(presentacionEnCascada)).toBe(false)

    // Sensibilidad 4: sustituir la FK simple del proveedor por la compuesta rompe el `include`
    // que el adaptador usa; conservarla no es redundancia inutil.
    const sustituyendoLaSimple = `${upSource}\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_supplier_id_fkey";`
    expect(keepsThePreviousSimpleForeignKeys(sustituyendoLaSimple)).toBe(false)
  })

  it('R9: el parentesis NO FORCE se abre sobre las CUATRO tablas y se cierra en todas', () => {
    expect(releasesExactlyTheFourTables(upSource)).toBe(true)
    expect(closesEveryNoForceParenthesis(upSource)).toBe(true)
    expect(releasesExactlyTheFourTables(downSource)).toBe(true)
    expect(closesEveryNoForceParenthesis(downSource)).toBe(true)

    // Sensibilidad 1: `ENABLE` sin `FORCE` no somete al dueno de la tabla, con quien conecta
    // Prisma. En local -superusuario- esto no se distingue nunca.
    const sinForzar = upSource.replace(/ALTER TABLE "suppliers"\s+FORCE ROW LEVEL SECURITY;/, '')
    expect(sinForzar, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(closesEveryNoForceParenthesis(sinForzar)).toBe(false)

    // Sensibilidad 2: dejar `presentations` sin volver a forzar afloja el blindaje de otra ficha.
    const presentacionesSueltas = upSource.replace(
      /ALTER TABLE "presentations"\s+FORCE ROW LEVEL SECURITY;/,
      '',
    )
    expect(presentacionesSueltas, 'la mutacion no se aplico').not.toBe(upSource)
    expect(closesEveryNoForceParenthesis(presentacionesSueltas)).toBe(false)

    // Sensibilidad 3: soltar una tabla de mas ensancharia el parentesis fuera del alcance.
    const soltandoDeMas = `${upSource}\nALTER TABLE "units" NO FORCE ROW LEVEL SECURITY;`
    expect(releasesExactlyTheFourTables(soltandoDeMas)).toBe(false)

    // Sensibilidad 4: una policy cambiaria el regimen de deny-by-default de la tabla.
    const conPolicy = `${upSource}\nCREATE POLICY "suppliers_all" ON "suppliers" USING (true);`
    expect(closesEveryNoForceParenthesis(conPolicy)).toBe(false)
  })

  it('R15 (angulo 1): cae el unico GLOBAL y nace el compuesto CON su WHERE — la asercion mas importante del archivo', () => {
    expect(swapsSupplierNameUniqueIndexKeepingPartialWhere(upSource)).toBe(true)
    expect(up).toContain('DROP INDEX "suppliers_name_unique"')
    expect(indexesTheLineCompanyColumnFirst(upSource)).toBe(true)

    // --- FALSABILIDAD (R15, angulo 1): el predicado se evalua sobre el archivo REAL -verdadero-
    // y sobre una copia EN MEMORIA sin el `WHERE` -falso-. Es la prueba de que la asercion
    // detectaria de verdad el defecto que preocupa: sin el `WHERE`, dar de baja un proveedor
    // dejaria su nombre ocupado para siempre y ningun otro test lo notaria.
    const sinElWhere = upSource.replace(
      /(CREATE UNIQUE INDEX "suppliers_company_name_unique"\s*\n\s*ON "suppliers" \("company_id", "name_normalized"\))\s*\n\s*WHERE "deleted_at" IS NULL;/,
      '$1;',
    )
    expect(sinElWhere, 'la mutacion no quito el WHERE').not.toBe(upSource)
    expect(sinElWhere).toContain('CREATE UNIQUE INDEX "suppliers_company_name_unique"')
    expect(swapsSupplierNameUniqueIndexKeepingPartialWhere(sinElWhere)).toBe(false)

    // Sensibilidad 1: dejar el global en pie es el fallo que no rompe nada visible -hasta que
    // dos empresas quieren el mismo nombre-.
    const conElGlobal = upSource.replace('DROP INDEX "suppliers_name_unique";', '')
    expect(conElGlobal, 'la mutacion no quito el DROP INDEX').not.toBe(upSource)
    expect(swapsSupplierNameUniqueIndexKeepingPartialWhere(conElGlobal)).toBe(false)

    // Sensibilidad 2: `company_id` en la cola sigue siendo unico, pero deja de servir como
    // indice de empresa y `suppliers` se queda sin ninguno.
    const empresaEnLaCola = upSource.replace(
      'ON "suppliers" ("company_id", "name_normalized")',
      'ON "suppliers" ("name_normalized", "company_id")',
    )
    expect(empresaEnLaCola, 'la mutacion no se aplico').not.toBe(upSource)
    expect(swapsSupplierNameUniqueIndexKeepingPartialWhere(empresaEnLaCola)).toBe(false)

    // Sensibilidad 3: lo mismo en el indice de la linea.
    const lineaConLaEmpresaEnLaCola = upSource.replace(
      'ON "supplier_catalog_lines" ("company_id", "supplier_id")',
      'ON "supplier_catalog_lines" ("supplier_id", "company_id")',
    )
    expect(lineaConLaEmpresaEnLaCola, 'la mutacion no se aplico').not.toBe(upSource)
    expect(indexesTheLineCompanyColumnFirst(lineaConLaEmpresaEnLaCola)).toBe(false)
  })
})

describe('QC-59 migration.sql — lo que la migracion NO hace', () => {
  it('R8 (parte): no contiene ninguna sentencia INSERT ni DELETE, en el UP ni en el DOWN', () => {
    expect(insertsAndDeletesNothing(upSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)

    // El texto CRUDO (con comentarios) SI contiene las palabras «INSERT» y «DELETE» -la trampa
    // del enunciado-, pero ninguna como sentencia ejecutable.
    expect(upSource).toMatch(/INSERT/i)
    expect(upSource).toMatch(/DELETE/i)

    expect(insertsAndDeletesNothing(`${upSource}\nDELETE FROM "suppliers" WHERE "deleted_at" IS NOT NULL;`)).toBe(
      false,
    )
    expect(
      insertsAndDeletesNothing(
        `${upSource}\nINSERT INTO "companies" ("name","name_normalized") VALUES ('X','x');`,
      ),
    ).toBe(false)
    expect(insertsAndDeletesNothing(`${upSource}\nTRUNCATE "supplier_catalog_lines";`)).toBe(false)
  })

  it('R38: no toca presentations mas alla de su clave candidata y del parentesis de RLS', () => {
    expect(touchesPresentationsOnlyForItsCandidateKeyAndRls(upSource)).toBe(true)
    expect(touchesPresentationsOnlyForItsCandidateKeyAndRls(downSource)).toBe(true)

    // Sensibilidad 1: darle una columna seria aislar `inventario` de contrabando.
    const conColumna = `${upSource}\nALTER TABLE "presentations" ADD COLUMN "supplier_id" UUID;`
    expect(touchesPresentationsOnlyForItsCandidateKeyAndRls(conColumna)).toBe(false)

    // Sensibilidad 2: un indice mas tampoco es alcance de esta ficha.
    const conIndice = `${upSource}\nCREATE INDEX "presentations_extra_idx" ON "presentations"("company_id");`
    expect(touchesPresentationsOnlyForItsCandidateKeyAndRls(conIndice)).toBe(false)

    // Sensibilidad 3: escribirla -no solo leerla- seria tocar dato de otro modulo.
    const escribiendola = `${upSource}\nUPDATE "presentations" SET "company_id" = "company_id";`
    expect(touchesPresentationsOnlyForItsCandidateKeyAndRls(escribiendola)).toBe(false)
  })

  it('R38: no nombra ninguna otra tabla, y companies solo se lee', () => {
    expect(staysOutOfOtherTables(upSource)).toBe(true)
    expect(staysOutOfOtherTables(downSource)).toBe(true)

    const conProductos = `${upSource}\nALTER TABLE "products" ADD COLUMN "foo" UUID;`
    expect(staysOutOfOtherTables(conProductos)).toBe(false)

    const escribiendoCompanies = `${upSource}\nUPDATE "companies" SET "name_normalized" = 'quimicloud';`
    expect(staysOutOfOtherTables(escribiendoCompanies)).toBe(false)

    const creandoSobreCompanies = `${upSource}\nCREATE INDEX "companies_extra_idx" ON "companies"("id");`
    expect(staysOutOfOtherTables(creandoSobreCompanies)).toBe(false)
  })

  it('R12: identificadores en ingles, y las marcas de tiempo y el borrado logico intactos', () => {
    const tocados = touchedIdentifiers(upSource)
    expect(tocados).toContain('company_id')
    expect(tocados).toContain('suppliers_company_id_fkey')
    expect(tocados).toContain('supplier_catalog_lines_company_id_fkey')
    expect(tocados).toContain('suppliers_company_id_id_key')
    expect(tocados).toContain('presentations_company_id_id_key')
    expect(tocados).toContain('supplier_catalog_lines_company_id_supplier_id_fkey')
    expect(tocados).toContain('supplier_catalog_lines_company_id_presentation_id_fkey')
    expect(tocados).toContain('suppliers_name_unique')
    expect(tocados).toContain('suppliers_company_name_unique')
    expect(tocados).toContain('supplier_catalog_lines_company_id_supplier_id_idx')

    expect(namesEverythingInEnglish(upSource)).toBe(true)
    expect(namesEverythingInEnglish(downSource)).toBe(true)
    expect(leavesTimestampsAndSoftDeleteAlone(upSource)).toBe(true)
    expect(leavesTimestampsAndSoftDeleteAlone(downSource)).toBe(true)

    // Sensibilidad 1: un identificador en castellano no pasa.
    const enCastellano = upSource.replace(
      /"suppliers_company_name_unique"/g,
      '"suppliers_empresa_nombre_unique"',
    )
    expect(enCastellano, 'la mutacion no se aplico').not.toBe(upSource)
    expect(namesEverythingInEnglish(enCastellano)).toBe(false)

    // Sensibilidad 2: tocar una marca de tiempo cambiaria el regimen de auditoria de la tabla.
    const tocandoLaMarca = `${upSource}\nALTER TABLE "suppliers" ALTER COLUMN "updated_at" SET DEFAULT now();`
    expect(leavesTimestampsAndSoftDeleteAlone(tocandoLaMarca)).toBe(false)

    // Sensibilidad 3: quitar el borrado logico seria cambiar el regimen de borrado.
    const quitandoElBorradoLogico = `${upSource}\nALTER TABLE "suppliers" DROP COLUMN "deleted_at";`
    expect(leavesTimestampsAndSoftDeleteAlone(quitandoElBorradoLogico)).toBe(false)
  })
})

describe('QC-59 down.sql — las tres guardias, el orden obligatorio y la restauracion', () => {
  it('R10, R11: abre con su parentesis NO FORCE y sus tres guardias, antes de restaurar nada', () => {
    expect(opensWithNoForceAndThreeDataGuards(downSource)).toBe(true)

    // Sensibilidad 1: sin la guardia de empresa ambigua, revertir con dos empresas llamadas
    // «QuimiCloud» elegiria una al azar como duena de todo lo que escribio el UP.
    const sinLaPrimera = downSource.replace(
      /IF named_company_rows = 1 THEN[\s\S]*?-- 1\.2\./,
      '-- 1.2.',
    )
    expect(sinLaPrimera, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaPrimera)).toBe(false)

    // Sensibilidad 2: sin la guardia de fila ajena EN LA LINEA, quitar `company_id` mezclaria
    // las lineas de varias empresas en un unico monton indistinguible. Las dos tablas se
    // cuentan por separado, y las dos importan.
    const sinLaDeLasLineas = downSource.replace(
      'FROM "supplier_catalog_lines" WHERE "company_id" <> target_company_id;',
      'FROM "supplier_catalog_lines" WHERE FALSE;',
    )
    expect(sinLaDeLasLineas, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaDeLasLineas)).toBe(false)

    // Sensibilidad 3: sin la guardia de nombre repetido, restaurar el unico GLOBAL chocaria con
    // un 23505 suelto en vez de con un mensaje que dice que hacer.
    const sinLaTercera = downSource.replace(
      /GROUP BY "name_normalized"\s*\n\s*HAVING count\(DISTINCT "company_id"\) > 1/,
      'GROUP BY "name_normalized"\n      HAVING FALSE',
    )
    expect(sinLaTercera, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(sinLaTercera)).toBe(false)

    // Sensibilidad 4: un aviso en vez de un `RAISE EXCEPTION` no aborta nada.
    const soloAvisa = downSource.replace(/RAISE EXCEPTION/g, 'RAISE NOTICE')
    expect(soloAvisa, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithNoForceAndThreeDataGuards(soloAvisa)).toBe(false)
  })

  it('R10: las FK caen ANTES que las claves candidatas, y las columnas despues de las dos', () => {
    expect(dropsForeignKeysBeforeCandidateKeys(downSource)).toBe(true)
    expect(dropsBothColumnsAfterTheirConstraints(downSource)).toBe(true)

    // Sensibilidad: con las candidatas primero, Postgres se niega -no deja soltar una clave
    // unica mientras una FK la referencie- y la reversion muere a medias.
    const candidatasPrimero = downSource.replace(
      /ALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey";\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey";\n\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_fkey";\nALTER TABLE "suppliers"              DROP CONSTRAINT "suppliers_company_id_fkey";\n\nALTER TABLE "presentations" DROP CONSTRAINT "presentations_company_id_id_key";\nALTER TABLE "suppliers"     DROP CONSTRAINT "suppliers_company_id_id_key";/,
      'ALTER TABLE "presentations" DROP CONSTRAINT "presentations_company_id_id_key";\nALTER TABLE "suppliers"     DROP CONSTRAINT "suppliers_company_id_id_key";\n\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_presentation_id_fkey";\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_supplier_id_fkey";\n\nALTER TABLE "supplier_catalog_lines" DROP CONSTRAINT "supplier_catalog_lines_company_id_fkey";\nALTER TABLE "suppliers"              DROP CONSTRAINT "suppliers_company_id_fkey";',
    )
    expect(candidatasPrimero, 'la mutacion no reordeno las sentencias').not.toBe(downSource)
    expect(dropsForeignKeysBeforeCandidateKeys(candidatasPrimero)).toBe(false)
  })

  it('R10, R15: restaura el unico GLOBAL y PARCIAL, y no borra ninguna fila', () => {
    expect(restoresGlobalPartialUniqueIndex(downSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)

    // Sensibilidad 1: restaurarlo SIN el `WHERE` alcanzaria tambien a los proveedores borrados.
    const sinWhereEnElDown = downSource.replace(
      'CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;',
      'CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized");',
    )
    expect(sinWhereEnElDown, 'la mutacion no quito el WHERE').not.toBe(downSource)
    expect(restoresGlobalPartialUniqueIndex(sinWhereEnElDown)).toBe(false)

    // Sensibilidad 2: crear el global antes de tirar el compuesto los deja convivir.
    const alReves = downSource.replace(
      'DROP INDEX "suppliers_company_name_unique";\n\nCREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;',
      'CREATE UNIQUE INDEX "suppliers_name_unique" ON "suppliers"("name_normalized") WHERE "deleted_at" IS NULL;\n\nDROP INDEX "suppliers_company_name_unique";',
    )
    expect(alReves, 'la mutacion no reordeno las sentencias').not.toBe(downSource)
    expect(restoresGlobalPartialUniqueIndex(alReves)).toBe(false)

    // Sensibilidad 3: revertir el esquema no es tirar el dato.
    const conBorrado = `${downSource}\nDELETE FROM "suppliers" WHERE "company_id" IS NULL;`
    expect(insertsAndDeletesNothing(conBorrado)).toBe(false)
  })
})

describe('QC-59 — lo que ya estaba escrito y esta migracion no toca', () => {
  it('los cuatro CHECK y las FK previas de las dos tablas siguen escritos donde estaban', () => {
    // El censo se CALCULA recorriendo todas las migraciones anteriores, no se escribe a mano:
    // una lista literal envejeceria en silencio cada vez que otra ficha tocara alguna.
    expect([...checksDe(restriccionesPreviasDeSuppliers), ...checksDe(restriccionesPreviasDeLineas)]).toEqual([
      'suppliers_contact_required',
      'supplier_catalog_lines_cost_positive',
      'supplier_catalog_lines_delivery_time_non_negative',
      'supplier_catalog_lines_min_purchase_non_negative',
    ])

    expect([...restriccionesPreviasDeSuppliers.keys()].sort()).toEqual([
      'suppliers_contact_required',
      'suppliers_created_by_fkey',
      'suppliers_updated_by_fkey',
    ])
    expect([...restriccionesPreviasDeLineas.keys()].sort()).toEqual([
      'supplier_catalog_lines_cost_positive',
      'supplier_catalog_lines_created_by_fkey',
      'supplier_catalog_lines_delivery_time_non_negative',
      'supplier_catalog_lines_min_purchase_non_negative',
      'supplier_catalog_lines_presentation_id_fkey',
      'supplier_catalog_lines_supplier_id_fkey',
      'supplier_catalog_lines_unit_id_fkey',
      'supplier_catalog_lines_updated_by_fkey',
    ])
  })

  it('ni el UP ni el DOWN de esta ficha nombran ninguna de esas restricciones previas', () => {
    const suyas = new Set([
      'suppliers_company_id_fkey',
      'supplier_catalog_lines_company_id_fkey',
      'suppliers_company_id_id_key',
      'presentations_company_id_id_key',
      'supplier_catalog_lines_company_id_supplier_id_fkey',
      'supplier_catalog_lines_company_id_presentation_id_fkey',
    ])

    for (const nombre of nombresPreviosCombinados) {
      expect(suyas.has(nombre), `${nombre} no es de esta ficha`).toBe(false)
      for (const [etiqueta, source] of [
        ['UP', up],
        ['DOWN', down],
      ] as const) {
        expect(
          source.filter((statement) =>
            new RegExp(`(ADD|DROP) CONSTRAINT (?:IF EXISTS )?"${nombre}"`, 'i').test(statement),
          ),
          `el ${etiqueta} de esta ficha no debe tocar ${nombre}`,
        ).toHaveLength(0)
      }
    }
  })
})
