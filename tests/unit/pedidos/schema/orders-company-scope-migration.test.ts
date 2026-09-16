// T11 (QC-60, aislamiento-por-empresa-en-pedidos) — Contrato ESTATICO del SQL de
// `20260915120000_orders_company_scope`.
//
// NADA DE LO QUE SE VIGILA AQUI LO REGENERA PRISMA, y esa es la unica razon de que este archivo
// exista. La migracion esta ESCRITA ENTERA A MANO (`design.md > 7`) y lleva dentro siete cosas
// que `db/schema.prisma` NO declara y que ningun tipo ni cliente generado detectaria si una
// migracion futura se las llevara por delante:
//
//   1. la FK `orders_company_id_fkey` --`companyId` se declara ESCALAR SIN `@relation` a
//      proposito, asi que este SQL es el UNICO sitio donde la FK existe, y para Prisma es DRIFT--;
//   2. el bloque `DO $$` del backfill, con su resolucion UNIVOCA de «QuimiCloud» por nombre
//      normalizado y su comprobacion de `ROW_COUNT` (R2, R3);
//   3. el parentesis `NO FORCE` / `ENABLE`+`FORCE` de la RLS, la mina que QC-49 tuvo que
//      corregir en revision (R4);
//   4. el INTERCAMBIO del indice unico del correlativo: cae el GLOBAL de QC-33 y nace el
//      compuesto con `company_id` DE CABEZA, EN ESE ORDEN (R10, R11);
//   5. la clave candidata `orders_id_company_id_key` y la FK COMPUESTA de `order_assignments`,
//      con la clave ANTES que la FK que la referencia (R25);
//   6. la muerte de `next_order_sequence(integer)` sin llevarse por delante las secuencias
//      `orders_sequence_<ano>`, que el DOWN necesita para su `setval` (R5, R7); y
//   7. las AUSENCIAS, que son la mitad del trabajo de esta ficha: ningun `INSERT`, ningun
//      `DELETE`, ningun `UPDATE` de `order_year` ni de `order_sequence` (no se renumera), ningun
//      `MATCH FULL`, ningun `DROP SEQUENCE` y ningun `DROP CONSTRAINT` salvo exactamente uno
//      (R3, R13, R26).
//
// PATRON, el de `inventory-company-scope-migration.test.ts` (QC-49) y `pedidos-migration.test.ts`
// (QC-33): cada afirmacion se escribe como un PREDICADO PURO que recibe el texto SQL y devuelve
// el veredicto, y se aplica DOS VECES --al SQL real (pasa) y a una version MUTADA EN MEMORIA
// (falla)--. El archivo en disco NO se toca nunca. Un test que no puede fallar no vigila nada.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que las restricciones MUERDAN en la base, ni que la reversion
// deje el esquema como estaba. Eso es `tests/integration/pedidos/company-scope.int.test.ts`
// (T12). Aqui se prueba que estan ESCRITAS, que es la mitad que una migracion futura puede
// perder en silencio.
//
// Cubre R3 (parte), R4, R5, R8, R9, R10, R26, R32 y R33.

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

const migrationDir = findMigrationDir('_orders_company_scope')

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
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
 * Parte por `;`, igual que los precedentes de QC-33, QC-76 y QC-49. Los bloques `DO $$ ... $$`
 * llevan `;` dentro y salen partidos en trozos, pero ninguno de esos trozos empieza por
 * `CREATE`, `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion anclada con `^`. Lo que se
 * afirma SOBRE UN BLOQUE se comprueba contra el texto completo, no contra esta lista.
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
 * R1. ¿La columna nace ANULABLE, se aprieta a `NOT NULL` DESPUES del backfill y no lleva
 * `DEFAULT`?
 *
 * Nacer `NOT NULL` fallaria sobre las tres filas que ya existen --no hay valor que poner-- y un
 * `DEFAULT` convertiria «no dijo empresa» en «dijo esta» para toda fila FUTURA, que es
 * exactamente el agujero que esta ficha cierra.
 */
function addsNullableCompanyColumnThenNotNull(sql: string): boolean {
  const source = statements(sql)
  // La sentencia se compara ENTERA: `... UUID NOT NULL` contiene a `... UUID` como prefijo, y un
  // predicado escrito con `includes` no distinguiria las dos cosas.
  const nace = source.findIndex((statement) =>
    /^ALTER TABLE "orders" ADD COLUMN "company_id" UUID$/i.test(statement),
  )
  const backfill = source.findIndex((statement) =>
    /^UPDATE "orders" SET "company_id" = target_company_id$/i.test(statement),
  )
  const aprieta = source.findIndex((statement) =>
    /^ALTER TABLE "orders" ALTER COLUMN "company_id" SET NOT NULL$/i.test(statement),
  )
  if (nace === -1 || backfill === -1 || aprieta === -1) return false
  const sinDefault = !/"company_id"[^;]*\bDEFAULT\b/i.test(flatSql(sql))
  return nace < backfill && backfill < aprieta && sinDefault
}

/**
 * R1, R4 (parte). ¿La FK a `companies` esta escrita, y RESTRINGE el borrado del padre en vez de
 * propagarlo o anularlo? `ON DELETE SET NULL` seria imposible: la columna es NOT NULL.
 */
function declaresCompanyForeignKey(sql: string): boolean {
  const fk = statements(sql).find((statement) =>
    /^ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey"/i.test(statement),
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
 * R10, R11. ¿Cae el unico GLOBAL de QC-33 y nace el compuesto, EN ESE ORDEN, con `company_id`
 * DE CABEZA y SIN `WHERE`?
 *
 * De cabeza porque asi el mismo indice sirve para el filtro del listado y para la verificacion
 * del `RESTRICT` de la FK, y `orders` no necesita ademas un `orders_company_id_idx` propio
 * (R10). Total y no parcial porque esa verificacion tiene que ver tambien los pedidos con
 * borrado logico, y un pedido borrado o cancelado CONSERVA su numero (R12).
 */
function swapsOrderNumberUniqueIndex(sql: string): boolean {
  const source = statements(sql)
  const caeElGlobal = source.findIndex((statement) =>
    /^DROP INDEX "orders_order_year_order_sequence_key"$/i.test(statement),
  )
  const naceElCompuesto = source.findIndex((statement) =>
    /^CREATE UNIQUE INDEX "orders_company_year_sequence_key"/i.test(statement),
  )
  if (caeElGlobal === -1 || naceElCompuesto === -1) return false
  const compuesto = source[naceElCompuesto] as string
  const columnas = /ON "orders" \("company_id", "order_year", "order_sequence"\)/i.test(compuesto)
  const total = !/\bWHERE\b/i.test(compuesto)
  return caeElGlobal < naceElCompuesto && columnas && total
}

/**
 * R25. ¿La clave candidata `(id, company_id)` se declara ANTES que la FK compuesta que la
 * referencia?
 *
 * Al reves Postgres responde `42830` («there is no unique constraint matching given keys») y la
 * migracion no aplica. Es el patron literal de `users_id_company_id_key` (QC-83).
 */
function declaresCandidateKeyBeforeCompositeForeignKey(sql: string): boolean {
  const source = statements(sql)
  const clave = source.findIndex((statement) =>
    /^ALTER TABLE "orders" ADD CONSTRAINT "orders_id_company_id_key" UNIQUE \("id", "company_id"\)$/i.test(
      statement,
    ),
  )
  const fk = source.findIndex((statement) =>
    /^ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_company_id_fkey"/i.test(
      statement,
    ),
  )
  if (clave === -1 || fk === -1) return false
  return clave < fk
}

/**
 * R25. ¿La FK del pedido pasa a ser COMPUESTA `(order_id, company_id)` hacia `orders(id,
 * company_id)`, con los MISMOS `ON DELETE RESTRICT ON UPDATE CASCADE` que tenia la simple?
 */
function declaresCompositeAssignmentForeignKey(sql: string): boolean {
  const fk = statements(sql).find((statement) =>
    /^ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_company_id_fkey"/i.test(
      statement,
    ),
  )
  if (fk === undefined) return false
  return (
    /FOREIGN KEY \("order_id", "company_id"\) REFERENCES "orders"\("id", "company_id"\)/i.test(
      fk,
    ) &&
    /ON DELETE RESTRICT/i.test(fk) &&
    /ON UPDATE CASCADE/i.test(fk)
  )
}

/** R5. ¿Muere `next_order_sequence(integer)` en el UP? Su firma ya no puede expresar la serie. */
function dropsNextOrderSequenceFunction(sql: string): boolean {
  return statements(sql).some((statement) =>
    /^DROP FUNCTION (?:IF EXISTS )?"next_order_sequence"\(integer\)$/i.test(statement),
  )
}

/**
 * R4. ¿El archivo CIERRA con la RLS de `orders` ACTIVADA Y FORZADA, y sin crear ninguna policy?
 *
 * `ENABLE` sin `FORCE` no aplica las policies al DUENO de la tabla, que es con quien conecta
 * Prisma: la mitad del blindaje se perderia en silencio.
 */
function endsWithForcedRlsOnOrders(sql: string): boolean {
  const source = statements(sql)
  const ultimas = source.slice(-2)
  const creaPolicy = /CREATE\s+POLICY/i.test(stripSqlComments(sql))
  return (
    !creaPolicy &&
    /^ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY$/i.test(ultimas[0] ?? '') &&
    /^ALTER TABLE "orders" FORCE ROW LEVEL SECURITY$/i.test(ultimas[1] ?? '')
  )
}

/**
 * R4. ¿El parentesis `NO FORCE` del paso 0 se CIERRA para todas las tablas que suelta?
 *
 * Dejar una tabla sin volver a forzar seria aflojar el blindaje de forma permanente, y en local
 * --donde se conecta como superusuario-- nadie lo notaria nunca.
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

// --- Predicados puros: el UP NO hace -------------------------------------------------------

/** R3. ¿Ni un `INSERT`, ni un `DELETE`, ni un `TRUNCATE` sobre ninguna tabla? */
function insertsAndDeletesNothing(sql: string): boolean {
  const texto = flatSql(sql)
  return (
    !/\bINSERT\s+INTO\b/i.test(texto) &&
    !/\bDELETE\s+FROM\b/i.test(texto) &&
    !/\bTRUNCATE\b/i.test(texto)
  )
}

/**
 * R13. ¿Ningun `UPDATE` toca `order_year` ni `order_sequence`?
 *
 * Los tres pedidos que ya existen CONSERVAN 37, 44 y 77 de 2026 y el siguiente sera el 78
 * (decision cerrada 3). Renumerar aqui cambiaria el numero de un pedido que el cliente ya vio.
 */
function renumbersNothing(sql: string): boolean {
  const texto = flatSql(sql)
  const asignaciones = [...texto.matchAll(/\bUPDATE\s+"?\w+"?\s+SET\s+([^;]*)/gi)].map(
    (match) => match[1] as string,
  )
  return asignaciones.every(
    (asignacion) =>
      !/"?order_year"?\s*=/i.test(asignacion) && !/"?order_sequence"?\s*=/i.test(asignacion),
  )
}

/**
 * R26. ¿Ninguna FK de este archivo lleva `MATCH FULL`?
 *
 * En la del pedido daria igual --las dos columnas son NOT NULL--, pero escribirlo «por
 * coherencia» en la del grupo mataria las asignaciones sueltas (`work_group_id IS NULL`), que
 * QC-86 R13 acepta a proposito.
 */
function usesNoMatchFull(sql: string): boolean {
  return !/\bMATCH\s+FULL\b/i.test(flatSql(sql))
}

/**
 * R7 (via el DOWN). ¿El UP deja vivas las secuencias `orders_sequence_<ano>`?
 *
 * Son el unico sitio donde vive el estado del contador GLOBAL y el `down.sql` las necesita para
 * su `setval` (`design.md > 3.2`, riesgo 2). Borrarlas aqui haria la reversion incorrecta EN
 * SILENCIO: la primera alta posterior chocaria contra el indice global recien restaurado.
 */
function dropsNoSequence(sql: string): boolean {
  return !/\bDROP\s+SEQUENCE\b/i.test(flatSql(sql))
}

/**
 * R26. ¿El UP emite EXACTAMENTE UN `DROP CONSTRAINT`, y es el de la FK SIMPLE del pedido?
 *
 * Las dos FK compuestas de `order_assignments` hacia `users` y `work_groups`, su `CHECK` del
 * nombre de grupo, su PK `(order_id, user_id)` y los CHECK de `orders` se conservan INTACTOS. Si
 * `prisma migrate dev` propone tirarlos por drift, se le borra a mano.
 */
function dropsOnlyTheSimpleAssignmentForeignKey(sql: string): boolean {
  const drops = statements(sql).filter((statement) => /\bDROP CONSTRAINT\b/i.test(statement))
  return (
    drops.length === 1 &&
    /^ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_fkey"$/i.test(
      drops[0] as string,
    )
  )
}

/** Las tablas de las OTRAS fichas, que esta migracion no puede nombrar (R32, R33). */
const TABLAS_AJENAS = [
  'recipes',
  'recipe_lines',
  'products',
  'presentations',
  'product_batches',
  'units',
  'suppliers',
  'supplier_catalog_lines',
] as const

/**
 * R32, R33. ¿La migracion se queda en SU alcance?
 *
 *   - QC-50: `recipes` y `recipe_lines` no se nombran. El hueco pedido->receta queda DECLARADO,
 *     no cerrado.
 *   - QC-61: la guardia de esquema que exige empresa en toda tabla de negocio. Una migracion no
 *     puede crear un test, pero si su equivalente en la base (`CREATE EVENT TRIGGER`).
 *   - QC-77: ninguna empresa se borra ni se fusiona. Aqui se asignan, no se limpian.
 *   - QC-49, QC-76, QC-59: ninguna tabla de inventario, unidades ni proveedores cambia.
 */
function staysOutOfOtherTickets(sql: string): boolean {
  const texto = flatSql(sql)
  const guardiaDeEsquema = /CREATE\s+EVENT\s+TRIGGER/i.test(texto)
  const borraEmpresas = /\bDELETE\s+FROM\s+"?companies"?/i.test(texto)
  const fusionaEmpresas = /\bUPDATE\s+"?companies"?\s+SET\b/i.test(texto)
  const tocaTablaAjena = TABLAS_AJENAS.some((tabla) =>
    new RegExp(`"${tabla}"|\\b${tabla}\\b`, 'i').test(texto),
  )
  return !guardiaDeEsquema && !borraEmpresas && !fusionaEmpresas && !tocaTablaAjena
}

/**
 * R8. Vocabulario INGLES admitido en los identificadores que ESTA migracion crea, renombra o
 * borra. Se escribe en positivo --lista blanca, no lista negra-- por el mismo motivo que en
 * QC-33, QC-49 y QC-80: una lista de palabras prohibidas solo atrapa las que a alguien se le
 * ocurrieron.
 */
const VOCABULARIO_INGLES = new Set([
  'assignments',
  'company',
  'fkey',
  'id',
  'key',
  'next',
  'order',
  'orders',
  'sequence',
  'year',
])

/** Identificadores que el archivo crea, renombra o borra, en el orden en que aparecen. */
function touchedIdentifiers(sql: string): readonly string[] {
  const texto = stripSqlComments(sql)
  const objetos = [
    ...texto.matchAll(
      /(?:ADD COLUMN|DROP COLUMN|ALTER COLUMN|CREATE INDEX|CREATE UNIQUE INDEX|DROP INDEX|ADD CONSTRAINT|DROP CONSTRAINT(?: IF EXISTS)?|CREATE TRIGGER)\s+"(\w+)"/gi,
    ),
  ].map((match) => match[1] as string)
  const funciones = [
    ...texto.matchAll(/(?:CREATE (?:OR REPLACE )?|DROP )FUNCTION\s+(?:IF EXISTS\s+)?"?(\w+)"?/gi),
  ].map((match) => match[1] as string)
  return [...objetos, ...funciones]
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

/**
 * R8, R9. ¿Se conserva el regimen de borrado de las dos tablas y NO se reescriben las marcas de
 * tiempo?
 *
 * `orders` conserva su borrado LOGICO y `order_assignments` sigue SIN marca de borrado: esta
 * ficha no anade ni quita ninguna. Y reescribir `updated_at` en el backfill reordenaria el
 * listado de pedidos sin que ninguna decision lo pida.
 */
function keepsDeletionRegimeAndTimestamps(sql: string): boolean {
  const source = statements(sql)
  const tocaBorrado = source.some((statement) =>
    /(ADD|DROP)\s+COLUMN\s+"?deleted_at"?/i.test(statement),
  )
  const reescribeMarcas = source.some((statement) =>
    /\bSET\b[^;]*"?(created_at|updated_at)"?\s*=/i.test(statement),
  )
  return !tocaBorrado && !reescribeMarcas
}

// --- Predicados puros: el DOWN ---------------------------------------------------------------

/**
 * R6. ¿El DOWN abre con sus TRES guardias de datos, ANTES de tocar nada del esquema?
 *
 * Sin ellas la reversion haria tres cosas irreparables en silencio: chocar contra el unico
 * global que dos empresas ya no pueden compartir, convertir los pedidos de varias empresas en un
 * monton indistinguible y dejar mintiendo para siempre a una asignacion cruzada. Las tres van
 * ANTES del primer `CREATE`/`ALTER`/`DROP` de restauracion.
 */
function opensWithThreeDataGuards(sql: string): boolean {
  const texto = flatSql(sql)
  const guardias = [
    // 1. dos empresas comparten la pareja (ano, secuencia).
    /GROUP BY "order_year", "order_sequence" HAVING count\(\*\) > 1/i,
    // 2. una fila con empresa distinta de la que escribio el UP.
    /FROM "orders" WHERE "company_id" <> target_company_id/i,
    // 3. una asignacion cuya empresa no es la de su pedido.
    /FROM "order_assignments" AS a JOIN "orders" AS o ON o\."id" = a\."order_id" WHERE a\."company_id" <> o\."company_id"/i,
  ]
  if (!guardias.every((guardia) => guardia.test(texto))) return false
  // Y las tres abortan la reversion ENTERA, con un `RAISE EXCEPTION` y no con un aviso.
  const abortos = texto.match(/RAISE EXCEPTION/gi) ?? []
  if (abortos.length < 3) return false
  // Van ANTES de la primera sentencia de restauracion: la funcion recreada es la primera de
  // todas (`down.sql`, bloque 2).
  const ultimaGuardia = texto.search(
    /FROM "order_assignments" AS a JOIN "orders" AS o ON o\."id" = a\."order_id"/i,
  )
  const primeraRestauracion = texto.search(/CREATE OR REPLACE FUNCTION "next_order_sequence"/i)
  return primeraRestauracion > ultimaGuardia
}

/** R5. ¿El DOWN recrea `next_order_sequence(integer)` con la firma y el cuerpo de QC-34? */
function recreatesNextOrderSequence(sql: string): boolean {
  const texto = flatSql(sql)
  return (
    /CREATE OR REPLACE FUNCTION "next_order_sequence"\(p_year integer\) RETURNS integer/i.test(
      texto,
    ) &&
    /format\('orders_sequence_%s', p_year\)/i.test(texto) &&
    /nextval\(seq_name::regclass\)::integer/i.test(texto)
  )
}

/**
 * R5. ¿El DOWN restaura la FK SIMPLE y el unico GLOBAL, y suelta la clave candidata DESPUES de
 * la FK compuesta que la referencia?
 */
function restoresSimpleForeignKeyAndGlobalUniqueIndex(sql: string): boolean {
  const source = statements(sql)
  const caeLaCompuesta = source.findIndex((statement) =>
    /^ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_company_id_fkey"$/i.test(
      statement,
    ),
  )
  const naceLaSimple = source.findIndex((statement) =>
    /^ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_order_id_fkey" FOREIGN KEY \("order_id"\) REFERENCES "orders"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE$/i.test(
      statement,
    ),
  )
  const caeLaClave = source.findIndex((statement) =>
    /^ALTER TABLE "orders" DROP CONSTRAINT "orders_id_company_id_key"$/i.test(statement),
  )
  const caeElCompuesto = source.findIndex((statement) =>
    /^DROP INDEX "orders_company_year_sequence_key"$/i.test(statement),
  )
  const naceElGlobal = source.findIndex((statement) =>
    /^CREATE UNIQUE INDEX "orders_order_year_order_sequence_key" ON "orders"\("order_year", "order_sequence"\)$/i.test(
      statement,
    ),
  )
  if (
    [caeLaCompuesta, naceLaSimple, caeLaClave, caeElCompuesto, naceElGlobal].includes(-1)
  ) {
    return false
  }
  return caeLaCompuesta < caeLaClave && caeElCompuesto < naceElGlobal
}

/**
 * R7. ¿El DOWN siembra el contador GLOBAL de cada ano con el maximo de sus filas, creando la
 * secuencia si no existe?
 *
 * Sin esto, revertir dejaria el contador apuntando a un numero YA USADO --o a 1, si la secuencia
 * del ano ni siquiera existe-- y la primera alta posterior chocaria contra el indice global que
 * acaba de recrearse.
 */
function seedsYearSequencesWithSetval(sql: string): boolean {
  const texto = flatSql(sql)
  if (!/max\("order_sequence"\) AS top FROM "orders" GROUP BY "order_year"/i.test(texto)) {
    return false
  }
  // El `CREATE SEQUENCE` tiene que estar DENTRO del bucle, no en cualquier sitio del archivo: la
  // funcion recreada arriba lleva uno identico en su rama de primera alta del ano, y un
  // predicado que mirara el texto entero lo confundiria con este.
  const bucle = /FOR fila IN([\s\S]*?)END LOOP/i.exec(texto)
  if (bucle === null) return false
  const cuerpo = bucle[1] as string
  return (
    /CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1/i.test(cuerpo) &&
    /setval\(seq_name::regclass, fila\.top\)/i.test(cuerpo)
  )
}

// --- Lo que ya estaba escrito y esta migracion NO puede tocar --------------------------------

/**
 * Restricciones VIVAS de `orders` justo antes de esta migracion, calculadas recorriendo TODAS
 * las migraciones aplicadas en orden y aplicando sus `ADD`/`DROP CONSTRAINT`.
 *
 * Se calcula en vez de escribirse a mano a proposito: una lista literal envejeceria en silencio
 * cada vez que otra ficha anadiera o quitara una restriccion, y este test dejaria de vigilar lo
 * que dice vigilar.
 */
function ordersConstraintsBefore(exclude: string): ReadonlyMap<string, string> {
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
      const add = /^ALTER TABLE "?orders"? ADD CONSTRAINT "?(\w+)"?/i.exec(statement)
      if (add !== null) {
        vivas.set(add[1] as string, statement)
        continue
      }
      const drop = /^ALTER TABLE "?orders"? DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/i.exec(
        statement,
      )
      if (drop !== null) vivas.delete(drop[1] as string)
    }
  }
  return vivas
}

const restriccionesPrevias = ordersConstraintsBefore('_orders_company_scope')
const checksPrevios = [...restriccionesPrevias.entries()]
  .filter(([, statement]) => /\bCHECK\s*\(/i.test(statement))
  .map(([nombre]) => nombre)
  .sort()
const fksPrevias = [...restriccionesPrevias.entries()]
  .filter(([, statement]) => /\bFOREIGN KEY\b/i.test(statement))
  .map(([nombre]) => nombre)
  .sort()

// =============================================================================================

describe('QC-60 migration.sql — lo que la migracion DECLARA', () => {
  it('R1: la columna nace anulable, se rellena y se aprieta a NOT NULL, y nunca lleva DEFAULT', () => {
    expect(addsNullableCompanyColumnThenNotNull(upSource)).toBe(true)

    // Sensibilidad 1: nacer `NOT NULL` fallaria sobre las filas que ya existen.
    const nacePorObligacion = upSource.replace(
      'ALTER TABLE "orders" ADD COLUMN "company_id" UUID;',
      'ALTER TABLE "orders" ADD COLUMN "company_id" UUID NOT NULL;',
    )
    expect(nacePorObligacion, 'la mutacion no se aplico').not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(nacePorObligacion)).toBe(false)

    // Sensibilidad 2: un `DEFAULT` convertiria «no dijo empresa» en «dijo esta» para siempre.
    const conDefault = upSource.replace(
      'ALTER TABLE "orders" ADD COLUMN "company_id" UUID;',
      `ALTER TABLE "orders" ADD COLUMN "company_id" UUID DEFAULT gen_random_uuid();`,
    )
    expect(conDefault).not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(conDefault)).toBe(false)

    // Sensibilidad 3: sin el `SET NOT NULL` la columna queda OPCIONAL, que es «pedido que ve
    // todo el mundo» --justo lo contrario de lo que la ficha cierra--.
    const sinApretar = upSource.replace(
      'ALTER TABLE "orders" ALTER COLUMN "company_id" SET NOT NULL;',
      '',
    )
    expect(sinApretar).not.toBe(upSource)
    expect(addsNullableCompanyColumnThenNotNull(sinApretar)).toBe(false)
  })

  it('R4: la FK a companies existe y RESTRINGE el borrado del padre', () => {
    expect(declaresCompanyForeignKey(upSource)).toBe(true)

    // Sensibilidad: `CASCADE` borraria los pedidos de una empresa con la empresa.
    const enCascada = upSource.replace(
      'FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
      'FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    expect(enCascada, 'la mutacion no se aplico').not.toBe(upSource)
    expect(declaresCompanyForeignKey(enCascada)).toBe(false)

    // Sensibilidad: sin FK, `company_id` seria un uuid cualquiera.
    const sinFk = upSource.replace(
      /ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey"[\s\S]*?;/,
      '',
    )
    expect(sinFk).not.toBe(upSource)
    expect(declaresCompanyForeignKey(sinFk)).toBe(false)
  })

  it('R10 y R11: cae el unico GLOBAL, nace el compuesto con company_id de cabeza y sin WHERE', () => {
    expect(swapsOrderNumberUniqueIndex(upSource)).toBe(true)

    // Sensibilidad 1: dejar el global en pie es el fallo que no rompe nada visible --la
    // migracion aplica-- y deja a dos empresas sin poder llevar cada una su serie.
    const conElGlobal = upSource.replace('DROP INDEX "orders_order_year_order_sequence_key";', '')
    expect(conElGlobal, 'la mutacion no quito el DROP INDEX').not.toBe(upSource)
    expect(swapsOrderNumberUniqueIndex(conElGlobal)).toBe(false)

    // Sensibilidad 2 (R10): con `company_id` en la COLA el indice sigue garantizando la
    // unicidad, pero ya no sirve de indice de empresa y `orders` se queda sin ninguno.
    const empresaEnLaCola = upSource.replace(
      'ON "orders" ("company_id", "order_year", "order_sequence");',
      'ON "orders" ("order_year", "order_sequence", "company_id");',
    )
    expect(empresaEnLaCola).not.toBe(upSource)
    expect(swapsOrderNumberUniqueIndex(empresaEnLaCola)).toBe(false)

    // Sensibilidad 3 (R12): un indice PARCIAL liberaria el numero de un pedido borrado.
    const parcial = upSource.replace(
      'ON "orders" ("company_id", "order_year", "order_sequence");',
      'ON "orders" ("company_id", "order_year", "order_sequence") WHERE "deleted_at" IS NULL;',
    )
    expect(parcial).not.toBe(upSource)
    expect(swapsOrderNumberUniqueIndex(parcial)).toBe(false)
  })

  it('R25: la clave candidata va ANTES que la FK compuesta, y la FK lleva las dos columnas', () => {
    expect(declaresCandidateKeyBeforeCompositeForeignKey(upSource)).toBe(true)
    expect(declaresCompositeAssignmentForeignKey(upSource)).toBe(true)

    // Sensibilidad 1: invertir el orden da `42830` al aplicar. El texto lo ve antes que la base.
    const clave = 'ALTER TABLE "orders" ADD CONSTRAINT "orders_id_company_id_key" UNIQUE ("id", "company_id");'
    const alReves = `${upSource.replace(clave, '')}\n${clave}`
    expect(alReves, 'la mutacion no movio la clave candidata').not.toBe(upSource)
    expect(declaresCandidateKeyBeforeCompositeForeignKey(alReves)).toBe(false)

    // Sensibilidad 2: una FK que solo mira el pedido deja de impedir la asignacion cruzada, que
    // es todo el efecto util del paso 6.
    const simple = upSource.replace(
      'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")',
      'FOREIGN KEY ("order_id") REFERENCES "orders"("id")',
    )
    expect(simple).not.toBe(upSource)
    expect(declaresCompositeAssignmentForeignKey(simple)).toBe(false)
  })

  it('R5: muere next_order_sequence(integer)', () => {
    expect(dropsNextOrderSequenceFunction(upSource)).toBe(true)
    // Y muere LA ULTIMA: mientras exista, nadie la llama ya (`design.md > 7.1`, paso 7).
    const posicion = up.findIndex((statement) => /^DROP FUNCTION/i.test(statement))
    const creaElIndice = up.findIndex((statement) =>
      /^CREATE UNIQUE INDEX "orders_company_year_sequence_key"/i.test(statement),
    )
    expect(posicion).toBeGreaterThan(creaElIndice)

    // Sensibilidad: dejarla viva seria una SEGUNDA definicion del correlativo esperando a que
    // alguien la llame --y esa reparte numeros GLOBALES, no por empresa--.
    const viva = upSource.replace('DROP FUNCTION "next_order_sequence"(integer);', '')
    expect(viva, 'la mutacion no quito el DROP FUNCTION').not.toBe(upSource)
    expect(dropsNextOrderSequenceFunction(viva)).toBe(false)
  })

  it('R4: el parentesis NO FORCE se cierra y el archivo termina con ENABLE + FORCE sobre orders', () => {
    expect(closesEveryNoForceParenthesis(upSource)).toBe(true)
    expect(endsWithForcedRlsOnOrders(upSource)).toBe(true)
    expect(endsWithForcedRlsOnOrders(downSource)).toBe(true)

    // Sensibilidad 1: `ENABLE` sin `FORCE` no somete al DUENO de la tabla, que es con quien
    // conecta Prisma. En local --superusuario-- esto no se distingue NUNCA.
    const sinForzar = upSource.replace(
      'ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "orders" FORCE ROW LEVEL SECURITY;',
      'ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;',
    )
    expect(sinForzar, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(endsWithForcedRlsOnOrders(sinForzar)).toBe(false)

    // Sensibilidad 2: dejar `companies` sin volver a forzar afloja el blindaje de otra ficha.
    const companiesSuelta = upSource.replace(
      'ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(companiesSuelta).not.toBe(upSource)
    expect(closesEveryNoForceParenthesis(companiesSuelta)).toBe(false)

    // Sensibilidad 3: una policy cambiaria el regimen de deny-by-default de la tabla.
    const conPolicy = `${upSource}\nCREATE POLICY "orders_all" ON "orders" USING (true);`
    expect(endsWithForcedRlsOnOrders(conPolicy)).toBe(false)
  })
})

describe('QC-60 migration.sql — lo que la migracion NO hace', () => {
  it('R3: ni un INSERT, ni un DELETE, ni un TRUNCATE, en el UP ni en el DOWN', () => {
    expect(insertsAndDeletesNothing(upSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)

    // Sensibilidad por las tres vias. Limpiar aqui las 47 empresas residuo seria QC-77 de
    // contrabando (R33) y cambiaria el numero de filas de las tres tablas (R3).
    expect(
      insertsAndDeletesNothing(`${upSource}\nDELETE FROM "companies" WHERE "name" LIKE 'Test %';`),
    ).toBe(false)
    expect(
      insertsAndDeletesNothing(
        `${upSource}\nINSERT INTO "companies" ("name","name_normalized") VALUES ('X','x');`,
      ),
    ).toBe(false)
    expect(insertsAndDeletesNothing(`${upSource}\nTRUNCATE "order_assignments";`)).toBe(false)
  })

  it('R13: ningun UPDATE toca order_year ni order_sequence — los pedidos no se renumeran', () => {
    expect(renumbersNothing(upSource)).toBe(true)
    expect(renumbersNothing(downSource)).toBe(true)

    // Sensibilidad: renumerar «para que la serie de cada empresa empiece en 1» cambiaria el
    // numero de un pedido que el cliente ya vio impreso. Decision cerrada 3: no se toca.
    const renumerando = upSource.replace(
      'UPDATE "orders" SET "company_id" = target_company_id;',
      `UPDATE "orders" SET "company_id" = target_company_id, "order_sequence" = 1;`,
    )
    expect(renumerando, 'la mutacion no se aplico').not.toBe(upSource)
    expect(renumbersNothing(renumerando)).toBe(false)

    const reanando = upSource.replace(
      'UPDATE "orders" SET "company_id" = target_company_id;',
      `UPDATE "orders" SET "company_id" = target_company_id, "order_year" = 2026;`,
    )
    expect(reanando).not.toBe(upSource)
    expect(renumbersNothing(reanando)).toBe(false)
  })

  it('R26: ninguna FK lleva MATCH FULL — las asignaciones sueltas siguen siendo legales', () => {
    expect(usesNoMatchFull(upSource)).toBe(true)
    expect(usesNoMatchFull(downSource)).toBe(true)

    // Sensibilidad: escribirlo «por coherencia» en la FK del grupo mataria las asignaciones
    // sueltas (`work_group_id IS NULL`), que QC-86 R13 acepta a proposito.
    const conMatchFull = upSource.replace(
      'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")',
      'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id") MATCH FULL',
    )
    expect(conMatchFull, 'la mutacion no se aplico').not.toBe(upSource)
    expect(usesNoMatchFull(conMatchFull)).toBe(false)
  })

  it('R5 y R7: el UP no borra ninguna secuencia — el DOWN las necesita para su setval', () => {
    expect(dropsNoSequence(upSource)).toBe(true)

    // Sensibilidad: «limpiar» `orders_sequence_2026` junto con la funcion que la creo parece
    // higiene y es la rotura de R7: sin ella el DOWN siembra desde cero y la primera alta
    // posterior choca contra el indice global recien restaurado.
    const limpiando = upSource.replace(
      'DROP FUNCTION "next_order_sequence"(integer);',
      'DROP FUNCTION "next_order_sequence"(integer);\nDROP SEQUENCE IF EXISTS "orders_sequence_2026";',
    )
    expect(limpiando, 'la mutacion no se aplico').not.toBe(upSource)
    expect(dropsNoSequence(limpiando)).toBe(false)
  })

  it('R26: el UP emite EXACTAMENTE UN DROP CONSTRAINT, y es el de la FK simple del pedido', () => {
    expect(dropsOnlyTheSimpleAssignmentForeignKey(upSource)).toBe(true)

    // Sensibilidad 1: el `DROP CONSTRAINT` que `prisma migrate dev` propone por drift sobre las
    // FK compuestas hacia `identity` (`design.md > 2.3`, OJO 1). Aplica sin ruido y deja a
    // `order_assignments` sin la mitad de sus garantias.
    const conElDrift = `${upSource}\nALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_user_id_company_id_fkey";`
    expect(dropsOnlyTheSimpleAssignmentForeignKey(conElDrift)).toBe(false)

    // Sensibilidad 2: tampoco el del CHECK del nombre de grupo.
    const sinElCheck = `${upSource}\nALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_work_group_name_matches_group";`
    expect(dropsOnlyTheSimpleAssignmentForeignKey(sinElCheck)).toBe(false)

    // Sensibilidad 3: si desapareciera el unico legitimo, la FK compuesta no podria nacer.
    const sinElLegitimo = upSource.replace(
      'ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_fkey";',
      '',
    )
    expect(sinElLegitimo).not.toBe(upSource)
    expect(dropsOnlyTheSimpleAssignmentForeignKey(sinElLegitimo)).toBe(false)
  })

  it('R32 y R33: no nombra recipes ni recipe_lines, no borra empresas y no toca las otras fichas', () => {
    expect(staysOutOfOtherTickets(upSource)).toBe(true)
    expect(staysOutOfOtherTickets(downSource)).toBe(true)

    // Sensibilidad 1 (R32): cerrar aqui la coherencia pedido->receta es QC-50. Esta ficha
    // DECLARA el hueco y no lo cierra: un pedido de A puede seguir apuntando a una receta de B.
    const conRecetas = `${upSource}\nALTER TABLE "recipes" ADD COLUMN "company_id" UUID;`
    expect(staysOutOfOtherTickets(conRecetas)).toBe(false)

    // Sensibilidad 2 (R33): la guardia de esquema es QC-61.
    const conGuardia = `${upSource}\nCREATE EVENT TRIGGER "require_company" ON ddl_command_end EXECUTE FUNCTION check_company();`
    expect(staysOutOfOtherTickets(conGuardia)).toBe(false)

    // Sensibilidad 3 (R33): fusionar las 48 empresas es QC-77. Aqui se asignan, no se limpian.
    const fusionando = `${upSource}\nUPDATE "companies" SET "name_normalized" = 'quimicloud';`
    expect(staysOutOfOtherTickets(fusionando)).toBe(false)

    // Sensibilidad 4 (R33): inventario ya lo aislo QC-49 y unidades QC-76.
    const tocandoInventario = `${upSource}\nALTER TABLE "product_batches" ALTER COLUMN "company_id" DROP NOT NULL;`
    expect(staysOutOfOtherTickets(tocandoInventario)).toBe(false)
  })

  it('R8 y R9: identificadores en ingles, sin tocar el borrado ni reescribir las marcas de tiempo', () => {
    // Lo que el archivo crea, renombra o borra: la columna, las dos restricciones de `orders`,
    // el intercambio de indices, las dos FK de `order_assignments` y la funcion.
    const tocados = touchedIdentifiers(upSource)
    expect(tocados).toContain('company_id')
    expect(tocados).toContain('orders_company_id_fkey')
    expect(tocados).toContain('orders_order_year_order_sequence_key')
    expect(tocados).toContain('orders_company_year_sequence_key')
    expect(tocados).toContain('orders_id_company_id_key')
    expect(tocados).toContain('order_assignments_order_id_fkey')
    expect(tocados).toContain('order_assignments_order_id_company_id_fkey')
    expect(tocados).toContain('next_order_sequence')

    expect(namesEverythingInEnglish(upSource)).toBe(true)
    expect(namesEverythingInEnglish(downSource)).toBe(true)
    expect(keepsDeletionRegimeAndTimestamps(upSource)).toBe(true)
    expect(keepsDeletionRegimeAndTimestamps(downSource)).toBe(true)

    // Sensibilidad 1 (R8): un identificador en castellano no pasa.
    const enCastellano = upSource.replace(
      /"orders_company_year_sequence_key"/g,
      '"orders_empresa_ano_secuencia_key"',
    )
    expect(enCastellano, 'la mutacion no se aplico').not.toBe(upSource)
    expect(namesEverythingInEnglish(enCastellano)).toBe(false)

    // Sensibilidad 2 (R9): anadir borrado logico a `order_assignments` no pasa.
    const conBorradoLogico = `${upSource}\nALTER TABLE "order_assignments" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);`
    expect(keepsDeletionRegimeAndTimestamps(conBorradoLogico)).toBe(false)

    // Sensibilidad 3 (R9): quitarselo a `orders` tampoco.
    const sinBorradoLogico = `${upSource}\nALTER TABLE "orders" DROP COLUMN "deleted_at";`
    expect(keepsDeletionRegimeAndTimestamps(sinBorradoLogico)).toBe(false)

    // Sensibilidad 4 (R8): reescribir `updated_at` en el backfill reordenaria el listado de
    // pedidos --que ordena por esa marca-- sin que ninguna decision lo pida.
    const tocandoMarcas = upSource.replace(
      'UPDATE "orders" SET "company_id" = target_company_id;',
      'UPDATE "orders" SET "company_id" = target_company_id, "updated_at" = now();',
    )
    expect(tocandoMarcas).not.toBe(upSource)
    expect(keepsDeletionRegimeAndTimestamps(tocandoMarcas)).toBe(false)
  })
})

describe('QC-60 down.sql — las tres guardias, la funcion y el setval', () => {
  it('R6: el DOWN abre con sus tres guardias de datos, antes de restaurar nada', () => {
    expect(opensWithThreeDataGuards(downSource)).toBe(true)

    // Sensibilidad 1: agrupar TAMBIEN por empresa --copiando el bloque del UP sin pensar-- es el
    // fallo silencioso de esta guardia: dejaria pasar exactamente el caso que la hace falta, dos
    // empresas con la misma pareja, y el `CREATE UNIQUE INDEX` global chocaria varias sentencias
    // mas abajo con un `23505` suelto.
    const porEmpresa = downSource.replace(
      'GROUP BY "order_year", "order_sequence"',
      'GROUP BY "company_id", "order_year", "order_sequence"',
    )
    expect(porEmpresa, 'la mutacion no se aplico').not.toBe(downSource)
    expect(opensWithThreeDataGuards(porEmpresa)).toBe(false)

    // Sensibilidad 2: sin la guardia 2, quitar `company_id` convierte los pedidos de varias
    // empresas en un monton indistinguible, EN SILENCIO.
    const sinLaSegunda = downSource.replace(
      'FROM "orders" WHERE "company_id" <> target_company_id;',
      'FROM "orders" WHERE FALSE;',
    )
    expect(sinLaSegunda).not.toBe(downSource)
    expect(opensWithThreeDataGuards(sinLaSegunda)).toBe(false)

    // Sensibilidad 3: sin la guardia 3, volver a la FK simple deja mintiendo para siempre a una
    // asignacion cruzada: ninguna restriccion la volveria a mirar.
    const sinLaTercera = downSource.replace(
      /SELECT count\(\*\) INTO crossed_assignments[\s\S]*?a\."company_id" <> o\."company_id";/,
      'crossed_assignments := 0;',
    )
    expect(sinLaTercera).not.toBe(downSource)
    expect(opensWithThreeDataGuards(sinLaTercera)).toBe(false)

    // Sensibilidad 4: un aviso en vez de un `RAISE EXCEPTION` no aborta nada.
    const soloAvisa = downSource.replace(/RAISE EXCEPTION/g, 'RAISE NOTICE')
    expect(soloAvisa).not.toBe(downSource)
    expect(opensWithThreeDataGuards(soloAvisa)).toBe(false)
  })

  it('R5: el DOWN recrea la funcion, la FK simple y el unico global, en el orden que Postgres admite', () => {
    expect(recreatesNextOrderSequence(downSource)).toBe(true)
    expect(restoresSimpleForeignKeyAndGlobalUniqueIndex(downSource)).toBe(true)
    // Y quita lo que puso el UP: la columna y su FK, explicitamente.
    expect(down).toContain('ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_fkey"')
    expect(down).toContain('ALTER TABLE "orders" DROP COLUMN "company_id"')

    // Sensibilidad 1: sin recrear la funcion, el esquema revertido NO es «el de antes»: el alta
    // de QC-34 la invocaba desde su `INSERT`.
    const sinFuncion = downSource.replace(
      /CREATE OR REPLACE FUNCTION "next_order_sequence"[\s\S]*?\$\$;/,
      '',
    )
    expect(sinFuncion, 'la mutacion no quito la funcion').not.toBe(downSource)
    expect(recreatesNextOrderSequence(sinFuncion)).toBe(false)

    // Sensibilidad 2: soltar la clave candidata ANTES que la FK que la referencia es un error de
    // Postgres, no una preferencia de estilo.
    const claveAntes = downSource.replace(
      'ALTER TABLE "order_assignments" DROP CONSTRAINT "order_assignments_order_id_company_id_fkey";',
      '',
    )
    expect(claveAntes).not.toBe(downSource)
    expect(restoresSimpleForeignKeyAndGlobalUniqueIndex(claveAntes)).toBe(false)

    // Sensibilidad 3: sin restaurar el unico global, la tabla queda sin NINGUNA garantia de
    // unicidad del correlativo, que no es «el esquema anterior» sino uno peor.
    const sinElGlobal = downSource.replace(
      /CREATE UNIQUE INDEX "orders_order_year_order_sequence_key"[\s\S]*?;/,
      '',
    )
    expect(sinElGlobal).not.toBe(downSource)
    expect(restoresSimpleForeignKeyAndGlobalUniqueIndex(sinElGlobal)).toBe(false)
  })

  it('R7: el DOWN siembra el contador global de cada ano con el maximo de sus filas', () => {
    expect(seedsYearSequencesWithSetval(downSource)).toBe(true)

    // Sensibilidad 1: sin el `setval`, el contador apunta a un numero YA USADO y la primera alta
    // posterior choca contra el indice global recien recreado.
    const sinSetval = downSource.replace(
      'PERFORM setval(seq_name::regclass, fila.top);',
      '',
    )
    expect(sinSetval, 'la mutacion no quito el setval').not.toBe(downSource)
    expect(seedsYearSequencesWithSetval(sinSetval)).toBe(false)

    // Sensibilidad 2: sin crear la secuencia que falta, la funcion recien recreada la crearia
    // empezando en 1 --exactamente el choque que R7 prohibe--.
    const sinCrearla = downSource.replace(
      `EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I AS integer MINVALUE 1 START WITH 1', seq_name);
    PERFORM setval(seq_name::regclass, fila.top);`,
      'PERFORM setval(seq_name::regclass, fila.top);',
    )
    expect(sinCrearla).not.toBe(downSource)
    expect(seedsYearSequencesWithSetval(sinCrearla)).toBe(false)
  })
})

describe('QC-60 — lo que ya estaba escrito y esta migracion no toca', () => {
  it('los CHECK y las FK previas de `orders` siguen escritos en las migraciones que los crearon', () => {
    // El recuento se CALCULA recorriendo todas las migraciones anteriores, no se escribe a mano.
    // Hoy son CINCO CHECK y TRES FK: `orders_unit_price_non_negative` y `orders_unit_id_fkey`
    // murieron con las columnas `unit_id`/`unit_price` en
    // `20260907120000_orders_drop_unit_and_unit_price`. (El `design.md` de esta ficha dice
    // «seis CHECK»: ese era el recuento de QC-34, ANTES de esa migracion.)
    expect(checksPrevios).toEqual([
      'orders_cancellation_reason_matches_status',
      'orders_delivered_not_deleted',
      'orders_order_sequence_positive',
      'orders_order_year_matches_created_at',
      'orders_quantity_positive',
    ])
    expect(fksPrevias).toEqual([
      'orders_created_by_fkey',
      'orders_recipe_id_fkey',
      'orders_updated_by_fkey',
    ])
  })

  it('R26: ni el UP ni el DOWN emiten ADD ni DROP CONSTRAINT sobre ninguno de los ocho', () => {
    const suyas = new Set(['orders_company_id_fkey', 'orders_id_company_id_key'])
    for (const nombre of [...checksPrevios, ...fksPrevias]) {
      expect(suyas.has(nombre), `${nombre} no es de esta ficha`).toBe(false)
      for (const [etiqueta, source] of [
        ['UP', up],
        ['DOWN', down],
      ] as const) {
        expect(
          source.filter((statement) =>
            new RegExp(`(ADD|DROP) CONSTRAINT (?:IF EXISTS )?"${nombre}"`, 'i').test(statement),
          ),
          `el ${etiqueta} de QC-60 no debe tocar ${nombre}`,
        ).toHaveLength(0)
      }
    }
  })

  it('R26: el CHECK y las dos FK compuestas de `order_assignments` tampoco se nombran', () => {
    for (const nombre of [
      'order_assignments_work_group_name_matches_group',
      'order_assignments_user_id_company_id_fkey',
      'order_assignments_work_group_id_company_id_fkey',
    ]) {
      expect(flatSql(upSource), `el UP no debe nombrar ${nombre}`).not.toContain(nombre)
      expect(flatSql(downSource), `el DOWN no debe nombrar ${nombre}`).not.toContain(nombre)
    }
  })
})
