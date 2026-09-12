// T10 (QC-49, aislamiento-por-empresa-en-inventario) — Contrato ESTATICO del SQL de
// `20260911130000_inventory_company_scope`.
//
// NADA DE LO QUE SE VIGILA AQUI LO REGENERA PRISMA, y esa es la unica razon de que este
// archivo exista. La migracion esta ESCRITA ENTERA A MANO (`design.md > 3`) y lleva dentro
// seis cosas que `db/schema.prisma` NO declara y que ningun tipo ni cliente generado
// detectaria si una migracion futura se las lleva por delante:
//
//   1. las TRES FK a `companies` --`companyId` se declara ESCALAR SIN `@relation` a proposito,
//      asi que este SQL es el UNICO sitio donde las FK existen, y para Prisma son DRIFT--;
//   2. el bloque `DO $$` del backfill, con su resolucion UNIVOCA de «QuimiCloud» por nombre
//      normalizado y sus tres comprobaciones de `ROW_COUNT` (R3);
//   3. el parentesis `NO FORCE` / `ENABLE`+`FORCE` de CUATRO tablas --las tres que se escriben
//      y `companies`, que solo se LEE--, que es la mina de la ficha (R5);
//   4. el INTERCAMBIO del indice unico de `presentations`: cae el GLOBAL de QC-20 y nace el
//      compuesto por empresa, EN ESE ORDEN (R20);
//   5. los DOS disparadores de coherencia con su `ERRCODE` y su mensaje propio (R22, R23); y
//   6. la AUSENCIA de todo `INSERT` y todo `DELETE` (R4): asignar NO es limpiar, y limpiar el
//      residuo de tests es QC-77 (R30).
//
// PATRON, el de `presentation-unit-migration.test.ts` (QC-80) y `unidades-migration.test.ts`
// (QC-76): cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL
// y devuelve el veredicto, y se aplica DOS VECES --al SQL real y a una version MUTADA EN
// MEMORIA--. El archivo en disco NO se toca nunca. Un test que no puede fallar no vigila nada.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que las restricciones MUERDAN en la base. Eso es
// `tests/integration/inventario/company-scope.int.test.ts` (T11). Aqui se prueba que estan
// ESCRITAS, que es la mitad que una migracion futura puede perder en silencio.
//
// Cubre R4 (parte), R5, R6 (parte), R8, R9, R10 y R30.

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
 * La carpeta se localiza por PATRON y no por el timestamp escrito a pelo: si la migracion se
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella y no romperse
 * por una razon que no es la suya.
 */
const scopeDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_inventory_company_scope'),
)
expect(
  scopeDirs,
  'debe existir exactamente una migracion *_inventory_company_scope',
).toHaveLength(1)
const migrationDir = join(migrationsDir, scopeDirs[0] as string)

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/**
 * Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas.
 *
 * Parte por `;`, igual que los precedentes de QC-32, QC-76 y QC-80. Los bloques `DO $$ ... $$`
 * llevan `;` dentro y salen partidos en trozos, pero ninguno de esos trozos empieza por
 * `CREATE`, `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion anclada con `^`. Lo que
 * se afirma SOBRE UN BLOQUE se comprueba contra el texto completo, no contra esta lista.
 */
export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

/** Las TRES tablas de inventario que ganan empresa. Ninguna mas (R28 lo dice en su ficha). */
const INVENTORY_TABLES = ['products', 'presentations', 'product_batches'] as const

// --- Predicados puros ----------------------------------------------------------------------

/**
 * R1. ¿Las TRES columnas nacen ANULABLES, se aprietan a `NOT NULL` despues y NINGUNA lleva
 * `DEFAULT`?
 *
 * Nacer `NOT NULL` fallaria sobre las filas que ya existen --no hay valor que poner-- y un
 * `DEFAULT` convertiria «no dijo empresa» en «dijo esta» para toda fila FUTURA, que es
 * exactamente el agujero que esta ficha cierra. El orden importa: `ADD COLUMN` antes del
 * `SET NOT NULL`, y el backfill entre los dos.
 */
export function addsThreeNullableColumnsThenNotNull(sql: string): boolean {
  const source = statements(sql)
  return INVENTORY_TABLES.every((table) => {
    const add = source.find((statement) =>
      new RegExp(`^ALTER TABLE "?${table}"? ADD COLUMN "?company_id"?`, 'i').test(statement),
    )
    const tighten = source.findIndex((statement) =>
      new RegExp(`^ALTER TABLE "?${table}"? ALTER COLUMN "?company_id"? SET NOT NULL$`, 'i').test(
        statement,
      ),
    )
    if (add === undefined || tighten === -1) return false
    const naceAnulable = new RegExp(
      `^ALTER TABLE "?${table}"? ADD COLUMN "?company_id"? UUID$`,
      'i',
    ).test(add)
    // Y el `ADD COLUMN` va ANTES que el `SET NOT NULL` de SU MISMA tabla.
    return naceAnulable && source.indexOf(add) < tighten
  })
}

/** ¿Todo `ADD COLUMN` y todo `SET NOT NULL` de la columna llegan en ese orden en el texto? */
export function tightensAfterFilling(sql: string): boolean {
  const texto = stripSqlComments(sql).replace(/\s+/g, ' ')
  const ultimoAdd = texto.lastIndexOf('ADD COLUMN "company_id"')
  const primerNotNull = texto.indexOf('ALTER COLUMN "company_id" SET NOT NULL')
  const backfill = texto.indexOf('UPDATE "products" SET "company_id"')
  if (ultimoAdd === -1 || primerNotNull === -1 || backfill === -1) return false
  return ultimoAdd < backfill && backfill < primerNotNull
}

/** ¿La columna de empresa no lleva `DEFAULT` en ningun sitio del archivo? */
export function companyColumnHasNoDefault(sql: string): boolean {
  const texto = stripSqlComments(sql)
  return !/"?company_id"?[^;]*\bDEFAULT\b/i.test(texto)
}

/** ¿La clave foranea restringe el borrado del padre en vez de propagarlo o anularlo? */
export function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/**
 * R1. ¿Las TRES FK existen, una sola vez cada una, desde `<tabla>(company_id)` hacia
 * `companies(id)`, con `ON DELETE RESTRICT` y `ON UPDATE CASCADE`?
 *
 * `SET NULL` seria incoherente hasta para la base --la columna es `NOT NULL`-- y `CASCADE` al
 * borrar convertiria una baja de empresa en un borrado de inventario, justo lo que R25 prohibe.
 */
export function threeCompanyForeignKeysAreRestrict(sql: string): boolean {
  const source = statements(sql)
  return INVENTORY_TABLES.every((table) => {
    const found = source.filter((statement) =>
      new RegExp(`ADD CONSTRAINT "?${table}_company_id_fkey"?`, 'i').test(statement),
    )
    if (found.length !== 1) return false
    const statement = found[0] as string
    return (
      new RegExp(`^ALTER TABLE "?${table}"?`, 'i').test(statement) &&
      /FOREIGN KEY \(\s*"?company_id"?\s*\)/i.test(statement) &&
      /REFERENCES "?companies"?\s*\(\s*"?id"?\s*\)/i.test(statement) &&
      isRestrictOnDelete(statement) &&
      /ON\s+UPDATE\s+CASCADE/i.test(statement)
    )
  })
}

/**
 * R10. ¿La columna de empresa de las TRES tablas queda indexada, y ninguno de esos indices es
 * PARCIAL?
 *
 * `products` y `product_batches` con indice propio; `presentations` con el unico compuesto, que
 * la lleva DE CABEZA y sirve igual para la verificacion del `RESTRICT`. Parcial NO: esa
 * verificacion tiene que ver tambien los productos con borrado logico.
 */
export function indexesEveryCompanyColumn(sql: string): boolean {
  const source = statements(sql)
  const propio = (table: string): boolean =>
    source.some((statement) =>
      new RegExp(
        `^CREATE INDEX "?${table}_company_id_idx"? ON "?${table}"?\\s*\\(\\s*"?company_id"?\\s*\\)$`,
        'i',
      ).test(statement),
    )
  const deCabeza = source.some((statement) =>
    /^CREATE UNIQUE INDEX "?presentations_company_name_unique"? ON "?presentations"? \(\s*"?company_id"?\s*,\s*"?name_normalized"?\s*\)$/i.test(
      statement,
    ),
  )
  const sinParciales = !source.some(
    (statement) => /^CREATE (UNIQUE )?INDEX/i.test(statement) && /\bWHERE\b/i.test(statement),
  )
  return propio('products') && propio('product_batches') && deCabeza && sinParciales
}

/**
 * R20. ¿El indice unico GLOBAL de nombre de presentacion CAE y el compuesto por empresa NACE,
 * en ESE orden?
 *
 * Si el global se dejara, dos empresas no podrian tener cada una su «Garrafa 20 L». Y el orden
 * importa de verdad: crear el compuesto sin quitar el global deja la unicidad global en pie y
 * el test tiene que verlo.
 */
export function swapsPresentationUniqueIndex(sql: string): boolean {
  const source = statements(sql)
  const cae = source.findIndex((statement) =>
    /^DROP INDEX (?:IF EXISTS )?"?presentations_name_normalized_key"?$/i.test(statement),
  )
  const nace = source.findIndex((statement) =>
    /^CREATE UNIQUE INDEX "?presentations_company_name_unique"? ON "?presentations"? \(\s*"?company_id"?\s*,\s*"?name_normalized"?\s*\)$/i.test(
      statement,
    ),
  )
  if (cae === -1 || nace === -1) return false
  return cae < nace
}

/**
 * R21. ¿La migracion NO introduce NINGUNA unicidad sobre `products`?
 *
 * Que dos productos puedan llamarse igual es decision cerrada de QC-20 (D14) y esta ficha no la
 * reabre. Un `CREATE UNIQUE INDEX ... ON "products"` aqui seria una regla de negocio nueva
 * colada por la puerta de atras.
 */
export function addsNoProductUniqueness(sql: string): boolean {
  return !statements(sql).some((statement) =>
    /^CREATE UNIQUE INDEX[^;]*ON "?products"?/i.test(statement),
  )
}

/** El bloque `DO $$ ... $$` numero `index` del texto, o `null` si no lo hay. */
function doBlock(sql: string, index = 0): string | null {
  const blocks = stripSqlComments(sql).match(/DO\s+\$\$[\s\S]*?\$\$/g)
  if (blocks === null) return null
  return blocks[index] ?? null
}

/**
 * R3. ¿El backfill resuelve «QuimiCloud» POR NOMBRE NORMALIZADO --nunca por un uuid literal--,
 * aborta si la empresa es ambigua o no hay una sola candidata, escribe en las TRES tablas y
 * comprueba el `ROW_COUNT` de cada una?
 *
 * Buscar por id seria el error que este predicado existe para impedir: los uuid los genera
 * `gen_random_uuid()` y son DISTINTOS en cada base, asi que un literal funcionaria en la del
 * que lo escribio y en ninguna otra.
 */
export function backfillsFromNormalizedCompanyName(sql: string): boolean {
  const block = doBlock(sql)
  if (block === null) return false
  const porNombre = /"?name_normalized"?\s*=\s*'quimicloud'/i.test(block)
  const leeCompanies = /FROM\s+"?companies"?/i.test(block)
  const escribeLasTres = INVENTORY_TABLES.every((table) =>
    new RegExp(`UPDATE\\s+"?${table}"?\\s+SET\\s+"?company_id"?`, 'i').test(block),
  )
  // Una guardia de resolucion ambigua, otra de resolucion imposible y una por tabla: cinco.
  const cincoGuardias = (block.match(/RAISE\s+EXCEPTION/gi) ?? []).length >= 5
  const cuentaFilas = (block.match(/GET DIAGNOSTICS\s+\w+\s*=\s*ROW_COUNT/gi) ?? []).length === 3
  const sinUuidLiteral = !/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(
    block,
  )
  return (
    porNombre && leeCompanies && escribeLasTres && cincoGuardias && cuentaFilas && sinUuidLiteral
  )
}

/**
 * R4 (y R30). ¿El SQL no inserta ni borra NINGUNA fila de ninguna de las cuatro tablas?
 *
 * Es la mitad de R4 que se puede afirmar sin base de datos, y la mitad de R30 que importa: si
 * aqui apareciera un `DELETE FROM "companies"`, esta migracion estaria haciendo QC-77 de
 * contrabando --borrar las 36 empresas y las presentaciones de residuo de tests--.
 */
export function insertsAndDeletesNothing(sql: string): boolean {
  const texto = stripSqlComments(sql)
  const inserta = /INSERT\s+INTO\s+"?(products|presentations|product_batches|companies|units)"?/i.test(
    texto,
  )
  const borra = /DELETE\s+FROM\s+"?(products|presentations|product_batches|companies|units)"?/i.test(
    texto,
  )
  // Ni `TRUNCATE`, que seria un borrado con otro nombre.
  const trunca = /\bTRUNCATE\b/i.test(texto)
  return !inserta && !borra && !trunca
}

/** R5. ¿La tabla SUELTA el `FORCE` y lo RESTITUYE (`ENABLE` + `FORCE`) en el mismo archivo? */
export function releasesAndRestoresForce(sql: string, table: string): boolean {
  const source = statements(sql)
  const suelta = new RegExp(`^ALTER TABLE "?${table}"? NO FORCE ROW LEVEL SECURITY$`, 'i')
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => suelta.test(statement)) &&
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/**
 * R5. ¿LAS CUATRO tablas --las tres que se ESCRIBEN y `companies`, que solo se LEE-- sueltan y
 * restituyen el `FORCE`?
 *
 * `companies` es la mina: con `FORCE` puesto y sin ninguna policy, el `SELECT` que resuelve
 * «QuimiCloud» devuelve CERO filas y la migracion aborta culpando al catalogo de empresas de no
 * tener la que si tiene. Precedente literal: QC-80 solto `units` por LEERLA.
 */
export function releasesAndRestoresForceOfAllFourTables(sql: string): boolean {
  return [...INVENTORY_TABLES, 'companies'].every((table) => releasesAndRestoresForce(sql, table))
}

/** R5. ¿Las tres tablas terminan `ENABLE` + `FORCE`? */
export function endsWithForcedRls(sql: string): boolean {
  const source = statements(sql)
  return INVENTORY_TABLES.every(
    (table) =>
      source.some((statement) =>
        new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i').test(statement),
      ) &&
      source.some((statement) =>
        new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i').test(statement),
      ),
  )
}

/** R5. ¿El archivo deja las tablas SIN NINGUNA POLICY? Deny-by-default, como estaban. */
export function createsNoPolicy(sql: string): boolean {
  return !/CREATE\s+POLICY/i.test(stripSqlComments(sql))
}

/**
 * R22/R23. ¿Existen los DOS disparadores, `BEFORE INSERT OR UPDATE`, con su funcion, su
 * `ERRCODE = '23514'` y un mensaje DISTINGUIBLE por caso?
 *
 * Los tres mensajes --producto, presentacion y unidad-- tienen que empezar por una etiqueta
 * propia, porque el test de integracion afirma CUAL salto y no solo «lanza algo»: un mensaje
 * compartido dejaria pasar un disparador que rechaza siempre por el motivo equivocado.
 * `USING ERRCODE` va COMPROBADO aparte: sin el, el `RAISE` sale como `P0001` y el adaptador no
 * lo puede traducir.
 */
export function declaresBothCoherenceTriggers(sql: string): boolean {
  const source = statements(sql)
  const texto = stripSqlComments(sql)
  const pares: readonly (readonly [string, string])[] = [
    ['product_batches_check_company', 'product_batches'],
    ['presentations_check_unit_scope', 'presentations'],
  ]
  const declarados = pares.every(([fn, table]) => {
    const funcion = new RegExp(
      `CREATE (?:OR REPLACE )?FUNCTION ${fn}\\(\\)\\s+RETURNS TRIGGER`,
      'i',
    ).test(texto)
    const disparador = source.some((statement) =>
      new RegExp(
        `^CREATE TRIGGER "?${fn}_trigger"? BEFORE INSERT OR UPDATE ON "?${table}"? FOR EACH ROW EXECUTE FUNCTION ${fn}\\(\\)$`,
        'i',
      ).test(statement),
    )
    return funcion && disparador
  })
  const errcodes = (texto.match(/USING ERRCODE = '23514'/gi) ?? []).length
  const etiquetas = [
    'product_batches_company_differs_from_product:',
    'product_batches_company_differs_from_presentation:',
    'presentations_unit_foreign_company:',
  ].every((etiqueta) => texto.includes(etiqueta))
  // Ninguna de las dos es SECURITY DEFINER: una comprobacion no debe mirar por debajo lo que
  // la consulta no puede ver (mismo criterio que el disparador de QC-76).
  const sinDefiner = !/SECURITY\s+DEFINER/i.test(texto)
  return declarados && errcodes === 3 && etiquetas && sinDefiner
}

/**
 * R23. ¿El disparador de la unidad acepta explicitamente la unidad DE SISTEMA
 * (`units.company_id IS NULL`) en vez de confiar en que `<>` con un nulo no sea cierto?
 */
export function acceptsSystemUnits(sql: string): boolean {
  return /unit_company_id\s+IS\s+NOT\s+NULL/i.test(stripSqlComments(sql))
}

/**
 * R9. ¿El archivo NO toca el regimen de borrado de ninguna de las tres tablas ni reescribe sus
 * marcas de tiempo?
 *
 * `products` conserva su borrado logico, `presentations` y `product_batches` siguen SIN marca:
 * esta ficha no anade ni quita ninguna. Y `updated_at` no se escribe: el listado de QC-57 ordena
 * por ella y tocarla reordenaria el inventario sin que ninguna decision lo pida (R8).
 */
export function keepsDeletionRegimeAndTimestamps(sql: string): boolean {
  const source = statements(sql)
  const tocaBorrado = source.some((statement) =>
    /(ADD|DROP)\s+COLUMN\s+"?deleted_at"?/i.test(statement),
  )
  const reescribeMarcas = source.some((statement) =>
    /\bSET\b[^;]*"?(created_at|updated_at)"?\s*=/i.test(statement),
  )
  return !tocaBorrado && !reescribeMarcas
}

/**
 * Vocabulario INGLES admitido en los identificadores que ESTA migracion crea o renombra. Se
 * escribe en positivo --lista blanca, no lista negra-- por el mismo motivo que en QC-32 y
 * QC-80: una lista de palabras prohibidas solo atrapa las que a alguien se le ocurrieron.
 */
const VOCABULARIO_INGLES = new Set([
  'company',
  'id',
  'products',
  'presentations',
  'product',
  'batches',
  'name',
  'normalized',
  'unique',
  'fkey',
  'idx',
  'key',
  'check',
  'unit',
  'scope',
  'trigger',
])

/** R8. ¿Todo identificador creado por la migracion esta en ingles y en `snake_case`? */
export function namesEverythingInEnglish(sql: string): boolean {
  const texto = stripSqlComments(sql)
  const creados = [
    ...texto.matchAll(
      /(?:ADD COLUMN|CREATE INDEX|CREATE UNIQUE INDEX|ADD CONSTRAINT|CREATE TRIGGER)\s+"(\w+)"/gi,
    ),
  ].map((match) => match[1] as string)
  const funciones = [
    ...texto.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+(\w+)\s*\(/gi),
  ].map((match) => match[1] as string)
  const todos = [...creados, ...funciones]
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
 * R30. ¿La migracion se queda en SU alcance y no adelanta trabajo de otras tres fichas?
 *
 *   - QC-61: la guardia de esquema que exige empresa en toda tabla de negocio. Una migracion no
 *     puede crear un test, pero si puede crear su equivalente en la base --un `CREATE EVENT
 *     TRIGGER` o una funcion de validacion de esquema--, y eso es lo que se vigila.
 *   - QC-77: la limpieza del residuo de tests. Lo cubre `insertsAndDeletesNothing`, y aqui se
 *     comprueba ademas que no hay ningun `UPDATE` sobre `companies`.
 *   - QC-81: el correlativo de lote unico por empresa. Ninguna restriccion ni indice sobre
 *     `lot` nace aqui: esta ficha solo DESBLOQUEA dejando la columna.
 */
export function staysOutOfOtherTickets(sql: string): boolean {
  const texto = stripSqlComments(sql)
  const guardiaDeEsquema = /CREATE\s+EVENT\s+TRIGGER/i.test(texto)
  const tocaCompanies = /UPDATE\s+"?companies"?\s+SET/i.test(texto)
  // La columna se nombra `"lot"` entrecomillada o `lot` suelta; la palabra castellana «lote»
  // aparece en los mensajes de los disparadores y NO cuenta, de ahi el limite de palabra.
  const correlativoDeLote = /"lot"|\blot\b/i.test(texto)
  return !guardiaDeEsquema && !tocaCompanies && !correlativoDeLote
}

/**
 * R28. ¿NINGUNA tabla de otro modulo gana columna de empresa aqui?
 *
 * `recipes`, `recipe_lines`, `suppliers`, `supplier_catalog_lines` y `orders` son QC-50, QC-59 y
 * QC-60. Se nombran una por una en vez de por «las que no son de inventario»: una lista
 * explicita se lee y se corrige; una regla implicita se olvida.
 */
export function touchesNoOtherModuleTable(sql: string): boolean {
  const texto = stripSqlComments(sql)
  return !['recipes', 'recipe_lines', 'suppliers', 'supplier_catalog_lines', 'orders'].some(
    (table) => new RegExp(`\\b"?${table}"?\\b`, 'i').test(texto),
  )
}

// --- Predicados del DOWN --------------------------------------------------------------------

/**
 * R7. ¿El `down.sql` ABRE con su guardia de datos, ANTES de tocar un solo objeto del esquema?
 *
 * Es lo que separa «no se puede revertir» de «se revirtio y el dato se perdio». El predicado
 * compara POSICIONES: la primera sentencia ejecutable del archivo tiene que ser el bloque
 * `DO $$` de la guardia, no un `DROP`.
 */
export function guardComesFirst(sql: string): boolean {
  // EL PARENTESIS `NO FORCE` SE DESCUENTA, y solo el. Desde el 2026-09-11 (bloqueante 3 de la
  // revision F2.2) el DOWN abre su propio parentesis ANTES de la guardia, y tiene que ser antes:
  // bajo `FORCE ROW LEVEL SECURITY` y sin ninguna policy, los `SELECT` de la guardia leerian CERO
  // filas y abortaria siempre con el mensaje equivocado. Esos `ALTER` no son destructivos --no
  // tocan ni una fila ni un objeto del esquema, y se deshacen solos si la guardia aborta--, asi
  // que se vacian del texto antes de medir. Lo que NO puede adelantarse a la guardia sigue siendo
  // cualquier `DROP` o cualquier `ALTER TABLE` que cambie el esquema.
  const texto = stripSqlComments(sql).replace(
    /ALTER TABLE\s+"?\w+"?\s+(?:NO FORCE|FORCE|ENABLE|DISABLE) ROW LEVEL SECURITY/gi,
    (match) => ' '.repeat(match.length),
  )
  const guardia = texto.search(/DO\s+\$\$/)
  if (guardia === -1) return false
  const primerDestructivo = texto.search(/\b(DROP|ALTER TABLE)\b/i)
  return primerDestructivo === -1 || guardia < primerDestructivo
}

/**
 * R7. ¿La guardia comprueba SUS DOS condiciones --inventario de otra empresa y nombre
 * normalizado de presentacion repetido-- y aborta con `RAISE EXCEPTION` en cada una?
 */
export function guardChecksBothConditions(sql: string): boolean {
  const block = doBlock(sql)
  if (block === null) return false
  const ajenas = INVENTORY_TABLES.every((table) =>
    new RegExp(`FROM "?${table}"?\\s+WHERE "?company_id"? <>`, 'i').test(block),
  )
  const repetidos = /GROUP BY "?name_normalized"?[\s\S]*HAVING count\(\*\) > 1/i.test(block)
  // La empresa del UP se resuelve IGUAL que en el UP y NUNCA por identificador.
  const mismaResolucion = /"?name_normalized"?\s*=\s*'quimicloud'/i.test(block)
  const sinUuidLiteral = !/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(
    block,
  )
  const aborta = (block.match(/RAISE\s+EXCEPTION/gi) ?? []).length >= 4
  return ajenas && repetidos && mismaResolucion && sinUuidLiteral && aborta
}

/**
 * R6. ¿El DOWN revierte CADA objeto que crea el UP, y en orden inverso?
 *
 * Objeto por objeto: los dos disparadores y sus dos funciones, el indice compuesto, el indice
 * unico GLOBAL restaurado, los dos indices de FK, las tres FK y las tres columnas. Lo que cuelga
 * de una columna cae ANTES que la columna.
 */
export function downRevertsEveryObject(sql: string): boolean {
  const source = statements(sql)
  const indexOf = (pattern: RegExp): number => source.findIndex((s) => pattern.test(s))

  const dropTriggerLote = indexOf(
    /^DROP TRIGGER (?:IF EXISTS )?"?product_batches_check_company_trigger"? ON "?product_batches"?$/i,
  )
  const dropFnLote = indexOf(/^DROP FUNCTION (?:IF EXISTS )?product_batches_check_company\(\)$/i)
  const dropTriggerUnidad = indexOf(
    /^DROP TRIGGER (?:IF EXISTS )?"?presentations_check_unit_scope_trigger"? ON "?presentations"?$/i,
  )
  const dropFnUnidad = indexOf(/^DROP FUNCTION (?:IF EXISTS )?presentations_check_unit_scope\(\)$/i)
  const dropCompuesto = indexOf(
    /^DROP INDEX (?:IF EXISTS )?"?presentations_company_name_unique"?$/i,
  )
  const creaGlobal = indexOf(
    /^CREATE UNIQUE INDEX "?presentations_name_normalized_key"? ON "?presentations"?\s*\(\s*"?name_normalized"?\s*\)$/i,
  )
  if (
    [
      dropTriggerLote,
      dropFnLote,
      dropTriggerUnidad,
      dropFnUnidad,
      dropCompuesto,
      creaGlobal,
    ].includes(-1)
  ) {
    return false
  }
  // El disparador cae ANTES que su funcion: una funcion en uso no se puede borrar.
  if (dropTriggerLote > dropFnLote || dropTriggerUnidad > dropFnUnidad) return false
  // El compuesto cae ANTES de recrear el global: si no, el global no se puede crear encima.
  if (dropCompuesto > creaGlobal) return false

  return INVENTORY_TABLES.every((table) => {
    const dropColumna = indexOf(
      new RegExp(`^ALTER TABLE "?${table}"? DROP COLUMN (?:IF EXISTS )?"?company_id"?$`, 'i'),
    )
    const dropFk = indexOf(
      new RegExp(
        `^ALTER TABLE "?${table}"? DROP CONSTRAINT (?:IF EXISTS )?"?${table}_company_id_fkey"?$`,
        'i',
      ),
    )
    if (dropColumna === -1 || dropFk === -1) return false
    if (dropFk > dropColumna) return false
    if (table === 'presentations') return dropCompuesto < dropColumna
    const dropIndice = indexOf(
      new RegExp(`^DROP INDEX (?:IF EXISTS )?"?${table}_company_id_idx"?$`, 'i'),
    )
    return dropIndice !== -1 && dropIndice < dropColumna
  })
}

// --- Mutaciones obligatorias, EN MEMORIA ----------------------------------------------------
//
// El archivo en disco NO se toca: cada una devuelve una COPIA del texto y el propio test
// comprueba con un `not.toBe(...)` que la mutacion se aplico de verdad. Una mutacion que no muta
// dejaria el caso en verde sin haber probado nada.

/** `RESTRICT` -> `CASCADE`: una baja de empresa arrastraria su inventario (contra R25). */
export function mutateRestrictToCascade(sql: string): string {
  return sql.replace(/ON DELETE RESTRICT/gi, 'ON DELETE CASCADE')
}

/** Se borra el bloque `DO $$` del backfill: las columnas quedarian sin rellenar. */
export function mutateWithoutBackfill(sql: string): string {
  return sql.replace(/DO \$\$[\s\S]*?\$\$;/, '')
}

/**
 * Se quita UNO de los cuatro `NO FORCE`, el de `companies`. ES LA MINA DE LA FICHA: `companies`
 * no se escribe, solo se LEE, y por eso es la que un lector distraido borraria por
 * «innecesaria». Con `FORCE` puesto y sin ninguna policy, ese `SELECT` devuelve CERO filas y la
 * migracion aborta culpando al catalogo de no tener la empresa que si tiene.
 */
export function mutateWithoutCompaniesNoForce(sql: string): string {
  return sql.replace(/ALTER TABLE "companies"\s+NO FORCE ROW LEVEL SECURITY;/i, '')
}

/** Se deja el indice unico GLOBAL en pie: dos empresas no podrian compartir nombre (R20). */
export function mutateKeepingGlobalUniqueIndex(sql: string): string {
  return sql.replace(/DROP INDEX "presentations_name_normalized_key";/i, '')
}

// --- Casos ----------------------------------------------------------------------------------

describe('QC-49 migration.sql — las tres columnas, las tres FK y los indices', () => {
  it('R1: las tres columnas nacen anulables, se aprietan a NOT NULL y no llevan DEFAULT', () => {
    expect(addsThreeNullableColumnsThenNotNull(upSource)).toBe(true)
    expect(companyColumnHasNoDefault(upSource)).toBe(true)
    for (const table of INVENTORY_TABLES) {
      expect(up).toContain(`ALTER TABLE "${table}" ALTER COLUMN "company_id" SET NOT NULL`)
      expect(up).toContain(`ALTER TABLE "${table}" ADD COLUMN "company_id" UUID`)
    }

    // Sensibilidad: si una naciera con DEFAULT, el predicado cae.
    const conDefault = upSource.replace(
      'ALTER TABLE "products"        ADD COLUMN "company_id" UUID;',
      'ALTER TABLE "products"        ADD COLUMN "company_id" UUID DEFAULT gen_random_uuid();',
    )
    expect(conDefault, 'la mutacion no cambio el ADD COLUMN').not.toBe(upSource)
    expect(addsThreeNullableColumnsThenNotNull(conDefault)).toBe(false)
    expect(companyColumnHasNoDefault(conDefault)).toBe(false)

    // Y si a una se le pierde el `SET NOT NULL`, tambien: quedaria opcional en la base aunque el
    // esquema Prisma la declare obligatoria, que es drift silencioso y una fuga abierta.
    const sinApretar = upSource.replace(
      'ALTER TABLE "presentations"   ALTER COLUMN "company_id" SET NOT NULL;',
      '',
    )
    expect(sinApretar, 'la mutacion no quito el SET NOT NULL').not.toBe(upSource)
    expect(addsThreeNullableColumnsThenNotNull(sinApretar)).toBe(false)
  })

  it('R1: el orden es ADD COLUMN -> backfill -> SET NOT NULL, y no otro', () => {
    expect(tightensAfterFilling(upSource)).toBe(true)

    // Sensibilidad: apretar ANTES de rellenar fallaria sobre las filas que ya existen.
    const alReves = upSource.replace(
      'ALTER TABLE "products"        ALTER COLUMN "company_id" SET NOT NULL;',
      '',
    )
    expect(alReves).not.toBe(upSource)
    // Con el primer SET NOT NULL fuera, el siguiente sigue estando despues del backfill, asi
    // que el predicado global no cae por aqui: lo que cae es la cobertura de la tabla, y eso lo
    // dice el caso anterior. Aqui se comprueba la mutacion que SI invierte el orden.
    const invertido = `ALTER TABLE "products" ALTER COLUMN "company_id" SET NOT NULL;\n${upSource}`
    expect(tightensAfterFilling(invertido)).toBe(false)
  })

  it('R1: las tres FK a companies son RESTRICT/CASCADE, y el test cae si se aflojan', () => {
    expect(threeCompanyForeignKeysAreRestrict(upSource)).toBe(true)
    expect(stripSqlComments(upSource)).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)

    // --- Mutacion obligatoria 1: `RESTRICT` -> `CASCADE`, EN MEMORIA.
    const enCascada = mutateRestrictToCascade(upSource)
    expect(enCascada, 'la mutacion no cambio ningun RESTRICT').not.toBe(upSource)
    expect(statements(enCascada).join(' '), 'la FK real tiene que haber mutado').toMatch(
      /ON DELETE CASCADE/i,
    )
    expect(threeCompanyForeignKeysAreRestrict(enCascada)).toBe(false)

    for (const accion of ['CASCADE', 'SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      const aflojada = upSource.replace(/ON DELETE RESTRICT/gi, `ON DELETE ${accion}`)
      expect(aflojada).not.toBe(upSource)
      expect(
        threeCompanyForeignKeysAreRestrict(aflojada),
        `ON DELETE ${accion} no deberia pasar`,
      ).toBe(false)
    }

    // Y si una de las tres FK desaparece, tambien cae: las tres o ninguna.
    const sinLaDelLote = upSource.replace(
      /ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_company_id_fkey"[\s\S]*?;/,
      '',
    )
    expect(sinLaDelLote).not.toBe(upSource)
    expect(threeCompanyForeignKeysAreRestrict(sinLaDelLote)).toBe(false)
  })

  it('R10: la columna de empresa de las tres tablas queda indexada, y ningun indice es parcial', () => {
    expect(indexesEveryCompanyColumn(upSource)).toBe(true)

    const sinIndiceDeProductos = upSource.replace(
      'CREATE INDEX "products_company_id_idx"        ON "products"("company_id");',
      '',
    )
    expect(sinIndiceDeProductos, 'la mutacion no quito el indice').not.toBe(upSource)
    expect(indexesEveryCompanyColumn(sinIndiceDeProductos)).toBe(false)

    const sinIndiceDeLotes = upSource.replace(
      'CREATE INDEX "product_batches_company_id_idx" ON "product_batches"("company_id");',
      '',
    )
    expect(sinIndiceDeLotes).not.toBe(upSource)
    expect(indexesEveryCompanyColumn(sinIndiceDeLotes)).toBe(false)

    // Parcial NO: la verificacion del RESTRICT tiene que ver tambien los productos con borrado
    // logico, igual que `work_groups_company_id_idx` (QC-83).
    const parcial = upSource.replace(
      'CREATE INDEX "products_company_id_idx"        ON "products"("company_id");',
      'CREATE INDEX "products_company_id_idx" ON "products"("company_id") WHERE "deleted_at" IS NULL;',
    )
    expect(parcial).not.toBe(upSource)
    expect(indexesEveryCompanyColumn(parcial)).toBe(false)
  })

  it('R20: el unico GLOBAL de nombre de presentacion cae y nace el compuesto por empresa', () => {
    expect(swapsPresentationUniqueIndex(upSource)).toBe(true)
    expect(up).toContain('DROP INDEX "presentations_name_normalized_key"')

    // --- Mutacion obligatoria 4: dejar el global en pie. Es el fallo que no rompe nada
    // visible: la migracion aplica, pero dos empresas siguen sin poder tener cada una su
    // «Garrafa 20 L» y R20 se queda sin cumplir con el compuesto ya creado encima.
    const conGlobal = mutateKeepingGlobalUniqueIndex(upSource)
    expect(conGlobal, 'la mutacion no quito el DROP INDEX').not.toBe(upSource)
    expect(swapsPresentationUniqueIndex(conGlobal)).toBe(false)

    // Y si el compuesto se creara sobre una sola columna, tampoco vale.
    const soloNombre = upSource.replace(
      'ON "presentations" ("company_id", "name_normalized");',
      'ON "presentations" ("name_normalized");',
    )
    expect(soloNombre).not.toBe(upSource)
    expect(swapsPresentationUniqueIndex(soloNombre)).toBe(false)
    expect(indexesEveryCompanyColumn(soloNombre)).toBe(false)
  })

  it('R21: la migracion no introduce ninguna unicidad de nombre de producto', () => {
    expect(addsNoProductUniqueness(upSource)).toBe(true)

    const conUnicidad = `${upSource}\nCREATE UNIQUE INDEX "products_company_name_unique" ON "products"("company_id","name_normalized");`
    expect(addsNoProductUniqueness(conUnicidad)).toBe(false)
  })
})

describe('QC-49 migration.sql — el backfill, la RLS y lo que NO hace', () => {
  it('R3: el backfill resuelve QuimiCloud por nombre normalizado, nunca por uuid, y aborta si no es unívoca', () => {
    expect(backfillsFromNormalizedCompanyName(upSource)).toBe(true)

    // --- Mutacion obligatoria 2: quitar el bloque `DO $$` entero, EN MEMORIA.
    const sinBackfill = mutateWithoutBackfill(upSource)
    expect(sinBackfill, 'la mutacion no quito el bloque DO $$').not.toBe(upSource)
    expect(doBlock(sinBackfill), 'no debe quedar ningun bloque DO $$').toBeNull()
    expect(backfillsFromNormalizedCompanyName(sinBackfill)).toBe(false)

    // Resolver por uuid literal funcionaria en la base del que lo escribio y en ninguna otra.
    const porUuid = upSource.replace(
      `SELECT count(*) INTO named_company_rows
    FROM "companies" WHERE "name_normalized" = 'quimicloud';`,
      `SELECT count(*) INTO named_company_rows
    FROM "companies" WHERE "id" = '00000000-1111-2222-3333-444444444444';`,
    )
    expect(porUuid, 'la mutacion no cambio la resolucion de la empresa').not.toBe(upSource)
    expect(backfillsFromNormalizedCompanyName(porUuid)).toBe(false)

    // Y si se cae UNA de las tres comprobaciones de ROW_COUNT, el predicado lo ve: un UPDATE
    // filtrado por RLS afectaria a cero filas EN SILENCIO.
    const sinUnaComprobacion = upSource.replace(
      'GET DIAGNOSTICS updated_rows = ROW_COUNT;\n  SELECT count(*) INTO total_rows FROM "product_batches";',
      'SELECT count(*) INTO total_rows FROM "product_batches";',
    )
    expect(sinUnaComprobacion).not.toBe(upSource)
    expect(backfillsFromNormalizedCompanyName(sinUnaComprobacion)).toBe(false)
  })

  it('R4: la migracion no contiene ningun INSERT, ningun DELETE y ningun TRUNCATE', () => {
    expect(insertsAndDeletesNothing(upSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)

    // Sensibilidad por las dos vias. Borrar aqui el residuo de tests seria QC-77 de
    // contrabando (R30) y cambiaria el numero de filas de las cuatro tablas (R4).
    const conBorrado = `${upSource}\nDELETE FROM "presentations" WHERE "name" LIKE 'Presentacion %';`
    expect(insertsAndDeletesNothing(conBorrado)).toBe(false)
    const conAlta = `${upSource}\nINSERT INTO "companies" ("name","name_normalized") VALUES ('X','x');`
    expect(insertsAndDeletesNothing(conAlta)).toBe(false)
    const conTruncado = `${upSource}\nTRUNCATE "product_batches";`
    expect(insertsAndDeletesNothing(conTruncado)).toBe(false)
  })

  it('R5: las cuatro tablas sueltan y restituyen el FORCE, y la de companies es la que importa', () => {
    expect(releasesAndRestoresForceOfAllFourTables(upSource)).toBe(true)
    expect(endsWithForcedRls(upSource)).toBe(true)
    expect(createsNoPolicy(upSource)).toBe(true)
    expect(createsNoPolicy(downSource)).toBe(true)

    // --- Mutacion obligatoria 3: quitar el `NO FORCE` de `companies`, que es la que solo se LEE
    // y la que un lector distraido borraria por «innecesaria».
    const sinSoltarCompanies = mutateWithoutCompaniesNoForce(upSource)
    expect(sinSoltarCompanies, 'la mutacion no quito el NO FORCE de companies').not.toBe(upSource)
    expect(releasesAndRestoresForceOfAllFourTables(sinSoltarCompanies)).toBe(false)

    // Y si una de las tres de inventario se quedara sin `FORCE` al final, tambien cae: `ENABLE`
    // sin `FORCE` no aplica las policies al dueno, que es con quien conecta Prisma.
    const sinForzarLotes = upSource.replace(
      'ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForzarLotes).not.toBe(upSource)
    expect(endsWithForcedRls(sinForzarLotes)).toBe(false)
    expect(endsWithForcedRls(downSource)).toBe(true)
  })

  it('R22 y R23: los dos disparadores estan escritos, con ERRCODE 23514 y tres mensajes distinguibles', () => {
    expect(declaresBothCoherenceTriggers(upSource)).toBe(true)
    expect(acceptsSystemUnits(upSource)).toBe(true)

    // Sensibilidad 1: sin `USING ERRCODE`, el `RAISE` sale como `P0001` y el test de
    // integracion no podria distinguir un rechazo de coherencia de un error cualquiera.
    const sinErrcode = upSource.replace(/\s+USING ERRCODE = '23514'/g, '')
    expect(sinErrcode, 'la mutacion no quito ningun ERRCODE').not.toBe(upSource)
    expect(declaresBothCoherenceTriggers(sinErrcode)).toBe(false)

    // Sensibilidad 2: si los dos casos del lote compartieran mensaje, el test de integracion no
    // podria afirmar CUAL salto --que es justo lo que T11 exige-- y un disparador que rechaza
    // siempre por el motivo equivocado pasaria desapercibido.
    const mensajeCompartido = upSource.replace(
      'product_batches_company_differs_from_presentation:',
      'product_batches_company_differs_from_product:',
    )
    expect(mensajeCompartido).not.toBe(upSource)
    expect(declaresBothCoherenceTriggers(mensajeCompartido)).toBe(false)

    // Sensibilidad 3: si el disparador fuera `AFTER`, la fila llegaria a escribirse.
    const despues = upSource.replace(/BEFORE INSERT OR UPDATE/g, 'AFTER INSERT OR UPDATE')
    expect(despues).not.toBe(upSource)
    expect(declaresBothCoherenceTriggers(despues)).toBe(false)

    // Sensibilidad 4: `SECURITY DEFINER` haria que la comprobacion mirara por debajo lo que la
    // consulta no puede ver.
    const conDefiner = upSource.replace(
      'RETURNS TRIGGER AS $product_batches_check_company$',
      'RETURNS TRIGGER SECURITY DEFINER AS $product_batches_check_company$',
    )
    expect(conDefiner).not.toBe(upSource)
    expect(declaresBothCoherenceTriggers(conDefiner)).toBe(false)
  })

  it('R8 y R9: identificadores en ingles, sin tocar el borrado ni reescribir las marcas de tiempo', () => {
    expect(namesEverythingInEnglish(upSource)).toBe(true)
    expect(namesEverythingInEnglish(downSource)).toBe(true)
    expect(keepsDeletionRegimeAndTimestamps(upSource)).toBe(true)
    expect(keepsDeletionRegimeAndTimestamps(downSource)).toBe(true)

    // Sensibilidad: un identificador en castellano no pasa.
    const enCastellano = upSource.replace(
      /"products_company_id_idx"/g,
      '"products_empresa_id_idx"',
    )
    expect(enCastellano).not.toBe(upSource)
    expect(namesEverythingInEnglish(enCastellano)).toBe(false)

    // Sensibilidad: anadir borrado logico a `presentations` no pasa (R9).
    const conBorradoLogico = `${upSource}\nALTER TABLE "presentations" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);`
    expect(keepsDeletionRegimeAndTimestamps(conBorradoLogico)).toBe(false)

    // Sensibilidad: quitarselo a `products` tampoco (R9).
    const sinBorradoLogico = `${upSource}\nALTER TABLE "products" DROP COLUMN "deleted_at";`
    expect(keepsDeletionRegimeAndTimestamps(sinBorradoLogico)).toBe(false)

    // Sensibilidad: reescribir `updated_at` reordenaria el inventario del listado de QC-57
    // sin que ninguna decision lo pida (R8).
    const tocandoMarcas = upSource.replace(
      'UPDATE "products" SET "company_id" = target_company_id;',
      'UPDATE "products" SET "company_id" = target_company_id, "updated_at" = now();',
    )
    expect(tocandoMarcas).not.toBe(upSource)
    expect(keepsDeletionRegimeAndTimestamps(tocandoMarcas)).toBe(false)
  })

  it('R30: la migracion no crea guardia de esquema, no borra residuo y no anade el correlativo de lote', () => {
    expect(staysOutOfOtherTickets(upSource)).toBe(true)
    expect(staysOutOfOtherTickets(downSource)).toBe(true)

    // QC-61: una guardia de esquema en la base seria un `CREATE EVENT TRIGGER`.
    const conGuardia = `${upSource}\nCREATE EVENT TRIGGER company_column_required ON ddl_command_end EXECUTE FUNCTION check_company();`
    expect(staysOutOfOtherTickets(conGuardia)).toBe(false)

    // QC-77: tocar `companies` --aunque sea con un UPDATE-- es la otra ficha.
    const tocandoCompanies = `${upSource}\nUPDATE "companies" SET "deleted_at" = now() WHERE "name_normalized" <> 'quimicloud';`
    expect(staysOutOfOtherTickets(tocandoCompanies)).toBe(false)

    // QC-81: el correlativo de lote por empresa. Esta ficha solo DESBLOQUEA dejando la columna;
    // la unicidad `(company_id, lot)` la pone la otra.
    const conCorrelativo = `${upSource}\nCREATE UNIQUE INDEX "product_batches_company_lot_unique" ON "product_batches"("company_id","lot");`
    expect(staysOutOfOtherTickets(conCorrelativo)).toBe(false)
  })

  it('R28: ninguna tabla de otro modulo aparece en la migracion', () => {
    expect(touchesNoOtherModuleTable(upSource)).toBe(true)
    expect(touchesNoOtherModuleTable(downSource)).toBe(true)

    const conRecetas = `${upSource}\nALTER TABLE "recipes" ADD COLUMN "company_id" UUID;`
    expect(touchesNoOtherModuleTable(conRecetas)).toBe(false)
  })
})

describe('QC-49 down.sql — la guardia primero y la reversion completa', () => {
  it('R7: la guardia de datos es lo PRIMERO del archivo, antes de cualquier DROP', () => {
    expect(guardComesFirst(downSource)).toBe(true)
    expect(guardChecksBothConditions(downSource)).toBe(true)

    // Sensibilidad: con la guardia al final, el DOWN ya habria borrado `company_id` cuando se
    // entera de que habia inventario de otra empresa. Ese es exactamente el dano irreparable
    // que R7 existe para impedir, y por eso el predicado mira POSICIONES y no presencia.
    const guardiaAlFinal = (() => {
      const block = /DO \$\$[\s\S]*?\$\$;/.exec(downSource)
      if (block === null) throw new Error('el down.sql no tiene bloque DO $$')
      return `${downSource.replace(block[0], '')}\n${block[0]}`
    })()
    expect(guardiaAlFinal).not.toBe(downSource)
    expect(guardComesFirst(guardiaAlFinal)).toBe(false)

    // Sensibilidad: sin la comprobacion de inventario ajeno, revertir convertiria el inventario
    // de varias empresas en un unico monton indistinguible.
    const sinAjenas = downSource.replace(
      /SELECT \(SELECT count\(\*\) FROM "products"[\s\S]*?INTO filas_ajenas;/,
      'filas_ajenas := 0;',
    )
    expect(sinAjenas, 'la mutacion no quito la comprobacion de filas ajenas').not.toBe(downSource)
    expect(guardChecksBothConditions(sinAjenas)).toBe(false)

    // Sensibilidad: sin la de nombres repetidos, recrear el indice unico GLOBAL fallaria con un
    // 23505 suelto tres sentencias mas abajo en vez de con un mensaje que dice que hacer.
    const sinRepetidos = downSource.replace(/GROUP BY "name_normalized"/, 'GROUP BY "id"')
    expect(sinRepetidos).not.toBe(downSource)
    expect(guardChecksBothConditions(sinRepetidos)).toBe(false)
  })

  it('R6: el down revierte cada objeto del up, en orden inverso y sin borrar ninguna fila', () => {
    expect(downRevertsEveryObject(downSource)).toBe(true)
    // Ni un solo `DELETE`: revertir el esquema no es tirar el dato.
    expect(stripSqlComments(downSource)).not.toMatch(/\bDELETE\s+FROM\b/i)
    // El indice unico GLOBAL de QC-20 vuelve TAL CUAL: unico, total, sobre `name_normalized`.
    expect(down).toContain(
      'CREATE UNIQUE INDEX "presentations_name_normalized_key" ON "presentations"("name_normalized")',
    )

    // Sensibilidad 1: si el down no recreara el indice global, la tabla quedaria SIN NINGUNA
    // garantia de unicidad, que no es «el esquema anterior» sino uno peor.
    const sinGlobal = downSource.replace(
      'CREATE UNIQUE INDEX "presentations_name_normalized_key" ON "presentations"("name_normalized");',
      '',
    )
    expect(sinGlobal, 'la mutacion no quito el indice global').not.toBe(downSource)
    expect(downRevertsEveryObject(sinGlobal)).toBe(false)

    // Sensibilidad 2: si se dejara un disparador vivo, la tabla revertida seguiria rechazando
    // escrituras por una regla de una migracion que ya no esta aplicada.
    const conDisparadorVivo = downSource.replace(
      'DROP TRIGGER "presentations_check_unit_scope_trigger" ON "presentations";',
      '',
    )
    expect(conDisparadorVivo).not.toBe(downSource)
    expect(downRevertsEveryObject(conDisparadorVivo)).toBe(false)

    // Sensibilidad 3: si se olvidara una columna, el esquema no volveria al anterior.
    const sinQuitarUnaColumna = downSource.replace(
      'ALTER TABLE "presentations"   DROP COLUMN "company_id";',
      '',
    )
    expect(sinQuitarUnaColumna).not.toBe(downSource)
    expect(downRevertsEveryObject(sinQuitarUnaColumna)).toBe(false)

    // Sensibilidad 4: la funcion no se puede borrar antes que el disparador que la usa.
    const funcionAntes = downSource.replace(
      `DROP TRIGGER "product_batches_check_company_trigger" ON "product_batches";
DROP FUNCTION product_batches_check_company();`,
      `DROP FUNCTION product_batches_check_company();
DROP TRIGGER "product_batches_check_company_trigger" ON "product_batches";`,
    )
    expect(funcionAntes).not.toBe(downSource)
    expect(downRevertsEveryObject(funcionAntes)).toBe(false)
  })

  it('R7: el down abre SU PROPIO parentesis NO FORCE sobre las cuatro tablas que LEE', () => {
    // Bloqueante 3 de F2.2: las dos mitades de esta migracion se contradecian. El UP dedica
    // treinta lineas a explicar que con `FORCE` y sin ninguna policy se deniega TAMBIEN el
    // `SELECT` al dueno --que es con quien conecta Prisma-- y el DOWN hacia exactamente esos
    // mismos `SELECT` sobre `companies` y las tres de inventario sin soltar ninguna: habria
    // abortado SIEMPRE con «hay 0 empresa(s)» y R6 habria dejado de ser cumplible.
    //
    // LO QUE ESTE TEST NO PRUEBA, y conviene que este escrito: que el parentesis SIRVA. El `.env`
    // de este repo conecta como `postgres`, superusuario en local, que se salta la RLS siempre;
    // con ese rol ni este parentesis ni el del UP son observables, y el test de R7 contra la base
    // corre en el unico escenario donde la pregunta no se plantea. Aqui se prueba que estan
    // ESCRITOS y bien cerrados, que es la mitad que una edicion futura puede perder en silencio.
    expect(releasesAndRestoresForceOfAllFourTables(downSource)).toBe(true)

    // Sensibilidad: quitar el `NO FORCE` de `companies` --la que solo se LEE, la mina de la
    // ficha-- deja el DOWN exactamente como estaba antes de la correccion.
    const sinSoltarCompanies = mutateWithoutCompaniesNoForce(downSource)
    expect(sinSoltarCompanies, 'la mutacion no quito el NO FORCE de companies').not.toBe(downSource)
    expect(releasesAndRestoresForceOfAllFourTables(sinSoltarCompanies)).toBe(false)

    // Sensibilidad: y si el parentesis se quedara ABIERTO --sin devolver `companies` a ENABLE +
    // FORCE--, la tabla acabaria la reversion menos protegida que antes de empezar.
    const sinCerrarCompanies = downSource.replace(
      'ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinCerrarCompanies).not.toBe(downSource)
    expect(releasesAndRestoresForceOfAllFourTables(sinCerrarCompanies)).toBe(false)
  })

  it('R6: el down deja la RLS activada y forzada en las tres tablas', () => {
    expect(endsWithForcedRls(downSource)).toBe(true)

    const sinForzar = downSource.replace(
      'ALTER TABLE "products"        FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForzar).not.toBe(downSource)
    expect(endsWithForcedRls(sinForzar)).toBe(false)
  })
})
