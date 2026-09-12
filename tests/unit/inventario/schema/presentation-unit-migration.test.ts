// T3 (QC-80, unidad-desde-la-presentacion) — Contrato estatico del SQL de
// `20260911120000_presentation_unit`.
//
// NADA DE LO QUE SE VIGILA AQUI LO REGENERA PRISMA, y esa es la razon de que este archivo
// exista. La migracion esta ESCRITA ENTERA A MANO (`design.md > 2`) y lleva dentro cuatro
// cosas que `db/schema.prisma` no declara y que ningun tipo ni cliente generado detectaria si
// alguien se las lleva por delante:
//
//   1. la FK `presentations_unit_id_fkey` con su `ON DELETE RESTRICT` —`unitId` se declara
//      ESCALAR SIN `@relation` a proposito, asi que este SQL es el UNICO sitio donde la FK
//      existe, y para Prisma es DRIFT—;
//   2. el bloque `DO $$` que rellena las 114 filas con `kilogramo` y ABORTA si la unidad no
//      esta o si queda un nulo;
//   3. el parentesis `NO FORCE` / `ENABLE`+`FORCE` de LAS DOS tablas —`presentations`, que se
//      escribe, y `units`, que se LEE—, que es la mina de la ficha: sin soltar `units`, el
//      `SELECT` del relleno devolveria cero filas y la migracion abortaria culpando al
//      catalogo de no tener la unidad que si tiene; y
//   4. la ausencia de todo `INSERT` y todo `DELETE`: rellenar NO es limpiar, el borrado del
//      residuo es QC-77 y hacerlo aqui seria QC-77 de contrabando (R5).
//
// PATRON, el de `tests/unit/unidades/schema/unidades-migration.test.ts`: cada afirmacion se
// escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y devuelve el veredicto, y
// se aplica DOS VECES —al SQL real y a una version MUTADA EN MEMORIA—. El archivo en disco NO
// se toca nunca. Las mutaciones obligatorias son `RESTRICT` -> `CASCADE` en la FK, quitar el
// bloque `DO $$` del relleno y quitar UNO de los dos `NO FORCE` (el de `units`, que es
// justamente el que un lector distraido consideraria de mas). Un test que no puede fallar no
// vigila nada.
//
// LO QUE ESTE ARCHIVO NO PRUEBA: que la restriccion MUERDA en la base. Eso es
// `tests/integration/inventario/presentation-unit.int.test.ts` (T13). Aqui se prueba que la
// restriccion ESTA ESCRITA, que es la mitad que una migracion futura puede perder en silencio.
//
// Cubre R1, R2, R3, R4, R5, R6, R7, R8, R9 y R25 en su mitad de SQL.

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
 * La carpeta se localiza por PATRON, no por el timestamp escrito a pelo: si la migracion se
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella y no romperse
 * por una razon que no es la suya.
 */
const presentationUnitDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_presentation_unit'),
)
expect(
  presentationUnitDirs,
  'debe existir exactamente una migracion *_presentation_unit',
).toHaveLength(1)
const migrationDir = join(migrationsDir, presentationUnitDirs[0] as string)

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
 * Parte por `;`, igual que el precedente de QC-32. El bloque `DO $$ ... $$` lleva `;` dentro y
 * sale partido en trozos, pero ninguno de esos trozos empieza por `CREATE`, `ALTER` ni `DROP`,
 * asi que no ensucia ninguna afirmacion anclada con `^`. Lo que se afirma SOBRE EL BLOQUE se
 * comprueba contra el texto completo, no contra esta lista.
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

// --- Predicados puros: los mismos que usan los tests de sensibilidad ----------------------

/**
 * R1. ¿La columna nace ANULABLE, se apRIETA a `NOT NULL` despues y NUNCA lleva `DEFAULT`?
 *
 * Nacer `NOT NULL` fallaria sobre las 114 filas que ya existen —no hay valor que poner— y un
 * `DEFAULT` convertiria «no dijo unidad» en «dijo kilogramo» para toda presentacion FUTURA,
 * que es justo lo que R1 prohibe. El orden importa: `ADD COLUMN` antes del `SET NOT NULL`, y
 * el relleno entre los dos.
 */
export function addsColumnNullableThenNotNullWithoutDefault(sql: string): boolean {
  const source = statements(sql)
  const add = source.find((statement) =>
    /^ALTER TABLE "?presentations"? ADD COLUMN "?unit_id"?/i.test(statement),
  )
  const tighten = source.find((statement) =>
    /^ALTER TABLE "?presentations"? ALTER COLUMN "?unit_id"? SET NOT NULL$/i.test(statement),
  )
  if (add === undefined || tighten === undefined) return false
  const naceAnulable = /^ALTER TABLE "?presentations"? ADD COLUMN "?unit_id"? UUID$/i.test(add)
  // Ningun `DEFAULT` sobre esa columna en TODO el archivo, ni al crearla ni despues.
  const sinDefault = !source.some((statement) =>
    /"?unit_id"?[\s\S]*\bSET DEFAULT\b|ADD COLUMN "?unit_id"?[\s\S]*\bDEFAULT\b/i.test(statement),
  )
  const enOrden = sql.indexOf('ADD COLUMN "unit_id"') < sql.indexOf('SET NOT NULL')
  return naceAnulable && sinDefault && enOrden
}

/** ¿La clave foranea rechaza el borrado del padre en vez de propagarlo o anularlo? (R2) */
export function isRestrictOnDelete(statement: string): boolean {
  const restringe = /ON\s+DELETE\s+RESTRICT/i.test(statement)
  const propaga = /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION)/i.test(statement)
  return restringe && !propaga
}

/**
 * R2. ¿Existe `presentations_unit_id_fkey`, una sola vez, desde `presentations(unit_id)` hacia
 * `units(id)`, con `ON DELETE RESTRICT` y `ON UPDATE CASCADE`?
 *
 * `SET NULL` seria incoherente hasta para la base —la columna es `NOT NULL`— y convertiria
 * «esta unidad se borro» en «esta presentacion no declara unidad». `CASCADE` al borrar se
 * llevaria por delante las presentaciones que usan la unidad.
 */
export function presentationUnitForeignKeyIsRestrict(sql: string): boolean {
  const found = statements(sql).filter((statement) =>
    /ADD CONSTRAINT "?presentations_unit_id_fkey"?/i.test(statement),
  )
  if (found.length !== 1) return false
  const statement = found[0] as string
  return (
    /^ALTER TABLE "?presentations"?/i.test(statement) &&
    /FOREIGN KEY \(\s*"?unit_id"?\s*\)/i.test(statement) &&
    /REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i.test(statement) &&
    isRestrictOnDelete(statement) &&
    /ON\s+UPDATE\s+CASCADE/i.test(statement)
  )
}

/** R3. ¿Existe el indice del lado hijo de la FK, y NO es unico? */
export function hasPresentationUnitIndex(sql: string): boolean {
  const source = statements(sql)
  const existe = source.some((statement) =>
    /^CREATE INDEX "?presentations_unit_id_idx"? ON "?presentations"?\s*\(\s*"?unit_id"?\s*\)$/i.test(
      statement,
    ),
  )
  // Unico seria falso: muchas presentaciones comparten la misma unidad.
  const noEsUnico = !source.some((statement) =>
    /^CREATE UNIQUE INDEX[\s\S]*"?presentations"?\s*\(\s*"?unit_id"?\s*\)/i.test(statement),
  )
  return existe && noEsUnico
}

/** El primer bloque `DO $$ ... $$` del texto, o `null` si no hay ninguno. */
function fillBlock(sql: string): string | null {
  const match = /DO\s+\$\$[\s\S]*?\$\$/.exec(stripSqlComments(sql))
  return match === null ? null : match[0]
}

/**
 * R4. ¿El relleno resuelve `kilogramo` POR NOMBRE NORMALIZADO —y de SISTEMA, `company_id`
 * nulo—, nunca por un uuid literal, y aborta con `RAISE EXCEPTION` por sus dos motivos?
 *
 * Buscar por id seria el error que este predicado existe para impedir: los uuid los genero
 * `gen_random_uuid()` en la migracion de QC-32 y son DISTINTOS en cada base, asi que un
 * literal funcionaria en la del que lo escribio y en ninguna otra.
 */
export function fillsFromNormalizedSystemKilogram(sql: string): boolean {
  const block = fillBlock(sql)
  if (block === null) return false
  const porNombre = /"?name_normalized"?\s*=\s*'kilogramo'/i.test(block)
  const deSistema = /"?company_id"?\s+IS\s+NULL/i.test(block)
  const leeUnits = /FROM\s+"?units"?/i.test(block)
  const escribePresentaciones = /UPDATE\s+"?presentations"?\s+SET\s+"?unit_id"?/i.test(block)
  // Las DOS guardias: la unidad que no esta y el nulo que sobrevive al UPDATE.
  const dosGuardias = (block.match(/RAISE\s+EXCEPTION/gi) ?? []).length >= 2
  const cuentaNulos = /count\(\*\)[\s\S]*"?unit_id"?\s+IS\s+NULL/i.test(block)
  // Y NUNCA un uuid escrito a pelo.
  const sinUuidLiteral = !/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i.test(
    block,
  )
  return (
    porNombre &&
    deSistema &&
    leeUnits &&
    escribePresentaciones &&
    dosGuardias &&
    cuentaNulos &&
    sinUuidLiteral
  )
}

/** R5. ¿El SQL no inserta ni borra NINGUNA fila de `presentations` ni de `units`? */
export function insertsAndDeletesNothing(sql: string): boolean {
  const texto = stripSqlComments(sql)
  const inserta = /INSERT\s+INTO\s+"?(presentations|units)"?/i.test(texto)
  const borra = /DELETE\s+FROM\s+"?(presentations|units)"?/i.test(texto)
  // Ni `TRUNCATE`, que seria un borrado con otro nombre.
  const trunca = /TRUNCATE/i.test(texto)
  return !inserta && !borra && !trunca
}

/** R6. ¿La tabla SUELTA el `FORCE` y lo RESTITUYE (`ENABLE` + `FORCE`) en el mismo archivo? */
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

/** R6. ¿LAS DOS tablas —la que se escribe y la que se LEE— sueltan y restituyen el FORCE? */
export function releasesAndRestoresForceOfBothTables(sql: string): boolean {
  return ['presentations', 'units'].every((table) => releasesAndRestoresForce(sql, table))
}

/** R6. ¿El archivo deja las tablas SIN NINGUNA POLICY? Deny-by-default, como estaban. */
export function createsNoPolicy(sql: string): boolean {
  return !/CREATE\s+POLICY/i.test(stripSqlComments(sql))
}

/** R7. ¿`products` pierde el indice, la FK y la columna, y en ese orden? */
export function dropsProductUnit(sql: string): boolean {
  const source = statements(sql)
  const indice = source.findIndex((statement) =>
    /^DROP INDEX (?:IF EXISTS )?"?products_unit_id_idx"?$/i.test(statement),
  )
  const fk = source.findIndex((statement) =>
    /^ALTER TABLE "?products"? DROP CONSTRAINT (?:IF EXISTS )?"?products_unit_id_fkey"?$/i.test(
      statement,
    ),
  )
  const columna = source.findIndex((statement) =>
    /^ALTER TABLE "?products"? DROP COLUMN (?:IF EXISTS )?"?unit_id"?$/i.test(statement),
  )
  if (indice === -1 || fk === -1 || columna === -1) return false
  // El unico orden posible: lo que cuelga de la columna, antes que la columna.
  return indice < columna && fk < columna
}

/**
 * R8. ¿El DOWN revierte CADA sentencia del UP?
 *
 * `products.unit_id` vuelve ANULABLE —como era desde QC-32— con la MISMA FK (mismo nombre y
 * mismas acciones referenciales) y el mismo indice: un down que devuelve la columna pero no su
 * integridad no devuelve el esquema anterior, sino uno mas flojo. Y `presentations` pierde
 * indice, FK y columna, dropeados EXPLICITAMENTE en vez de dejar que caigan con la columna.
 */
export function downRevertsTheUp(sql: string): boolean {
  const source = statements(sql)
  const addProducto = source.find((statement) =>
    /^ALTER TABLE "?products"? ADD COLUMN "?unit_id"?/i.test(statement),
  )
  if (addProducto === undefined) return false
  const anulable = /^ALTER TABLE "?products"? ADD COLUMN "?unit_id"? UUID$/i.test(addProducto)

  const fkProducto = source.filter((statement) =>
    /ADD CONSTRAINT "?products_unit_id_fkey"?/i.test(statement),
  )
  if (fkProducto.length !== 1) return false
  const fk = fkProducto[0] as string
  const fkIgual =
    /FOREIGN KEY \(\s*"?unit_id"?\s*\)/i.test(fk) &&
    /REFERENCES "?units"?\s*\(\s*"?id"?\s*\)/i.test(fk) &&
    isRestrictOnDelete(fk) &&
    /ON\s+UPDATE\s+CASCADE/i.test(fk)

  const indiceProducto = source.some((statement) =>
    /^CREATE INDEX "?products_unit_id_idx"? ON "?products"?\s*\(\s*"?unit_id"?\s*\)$/i.test(
      statement,
    ),
  )

  const dropIndice = source.findIndex((statement) =>
    /^DROP INDEX (?:IF EXISTS )?"?presentations_unit_id_idx"?$/i.test(statement),
  )
  const dropFk = source.findIndex((statement) =>
    /^ALTER TABLE "?presentations"? DROP CONSTRAINT (?:IF EXISTS )?"?presentations_unit_id_fkey"?$/i.test(
      statement,
    ),
  )
  const dropColumna = source.findIndex((statement) =>
    /^ALTER TABLE "?presentations"? DROP COLUMN (?:IF EXISTS )?"?unit_id"?$/i.test(statement),
  )
  if (dropIndice === -1 || dropFk === -1 || dropColumna === -1) return false

  return (
    anulable &&
    fkIgual &&
    indiceProducto &&
    dropIndice < dropColumna &&
    dropFk < dropColumna &&
    // El orden global es el inverso del UP: primero `products`, despues `presentations`.
    source.indexOf(addProducto) < dropColumna
  )
}

/** R25. ¿Ni el UP ni el DOWN le devuelven al producto una presentacion propia? */
export function returnsNoPresentationToProducts(sql: string): boolean {
  return !/presentation_id/i.test(stripSqlComments(sql))
}

/**
 * Vocabulario ingles admitido en los identificadores que ESTA migracion crea. Se escribe en
 * positivo —lista blanca, no lista negra— por el mismo motivo que en la migracion de QC-32:
 * una lista de palabras prohibidas solo atrapa las que a alguien se le ocurrieron.
 */
const VOCABULARIO_INGLES = new Set([
  'unit',
  'id',
  'presentations',
  'products',
  'fkey',
  'idx',
  'key',
])

/** R9. ¿El archivo no anade borrado logico y escribe sus identificadores en ingles? */
export function addsNoSoftDeleteAndKeepsEnglish(sql: string): boolean {
  const texto = stripSqlComments(sql)
  if (/deleted_at/i.test(texto)) return false
  const creados = [...texto.matchAll(/(?:ADD COLUMN|CREATE INDEX|ADD CONSTRAINT)\s+"(\w+)"/gi)].map(
    (match) => match[1] as string,
  )
  return (
    creados.length > 0 &&
    creados.every(
      (identificador) =>
        /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(identificador) &&
        identificador.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza)),
    )
  )
}

// --- Las tres mutaciones obligatorias, EN MEMORIA -----------------------------------------
//
// El archivo en disco NO se toca: cada una devuelve una COPIA del texto y el propio test
// comprueba con un `not.toBe(upSource)` que la mutacion se aplico de verdad. Una mutacion que
// no muta dejaria el caso en verde sin haber probado nada, que es el fallo exacto que este
// patron existe para evitar.

/** `RESTRICT` -> `CASCADE`: la FK deja de proteger a la unidad en uso. */
export function mutateRestrictToCascade(sql: string): string {
  return sql.replace(/ON DELETE RESTRICT/gi, 'ON DELETE CASCADE')
}

/** Se borra el bloque `DO $$` entero: la columna se quedaria sin rellenar y sin guardias. */
export function mutateWithoutFillBlock(sql: string): string {
  return sql.replace(/DO \$\$[\s\S]*?\$\$;/, '')
}

/**
 * Se quita UNO de los dos `NO FORCE`, el de `units`. ES LA MINA DE LA FICHA: `units` no se
 * escribe, solo se LEE, y por eso es la que un lector distraido borraria por «innecesaria».
 * Con `FORCE` puesto y sin ninguna policy, ese `SELECT` devuelve CERO filas y la migracion
 * aborta culpando al catalogo de no tener el `kilogramo` que si tiene.
 */
export function mutateWithoutUnitsNoForce(sql: string): string {
  return sql.replace(/ALTER TABLE "units"\s+NO FORCE ROW LEVEL SECURITY;/i, '')
}

// --- Casos ---------------------------------------------------------------------------------

describe('QC-80 migration.sql — la columna de unidad de la presentacion', () => {
  it('R1: unit_id nace anulable, se aprieta a NOT NULL y no lleva ningun DEFAULT', () => {
    expect(addsColumnNullableThenNotNullWithoutDefault(upSource)).toBe(true)
    expect(up).toContain('ALTER TABLE "presentations" ALTER COLUMN "unit_id" SET NOT NULL')
    // Ningun `DEFAULT` en todo el archivo: R1 lo prohibe explicitamente.
    expect(stripSqlComments(upSource)).not.toMatch(/\bDEFAULT\b/i)

    // Sensibilidad: si la columna naciera con default, el predicado cae.
    const conDefault = upSource.replace(
      'ALTER TABLE "presentations" ADD COLUMN "unit_id" UUID;',
      'ALTER TABLE "presentations" ADD COLUMN "unit_id" UUID DEFAULT gen_random_uuid();',
    )
    expect(conDefault, 'la mutacion no cambio el ADD COLUMN').not.toBe(upSource)
    expect(addsColumnNullableThenNotNullWithoutDefault(conDefault)).toBe(false)

    // Y si el `SET NOT NULL` se perdiera, tambien: la columna quedaria opcional en la base
    // aunque el esquema Prisma la declare obligatoria, que es drift silencioso.
    const sinApretar = upSource.replace(
      'ALTER TABLE "presentations" ALTER COLUMN "unit_id" SET NOT NULL;',
      '',
    )
    expect(sinApretar, 'la mutacion no quito el SET NOT NULL').not.toBe(upSource)
    expect(addsColumnNullableThenNotNullWithoutDefault(sinApretar)).toBe(false)
  })

  it('R2: la FK presentations_unit_id_fkey es RESTRICT/CASCADE, y el test cae si se afloja', () => {
    expect(presentationUnitForeignKeyIsRestrict(upSource)).toBe(true)
    // En positivo y por separado: el SQL NO dice `SET NULL` para esta FK en ningun sitio.
    expect(stripSqlComments(upSource)).not.toMatch(/ON\s+DELETE\s+SET\s+NULL/i)

    // --- Mutacion obligatoria 1: `RESTRICT` -> `CASCADE`, EN MEMORIA.
    const enCascada = mutateRestrictToCascade(upSource)
    expect(enCascada, 'la mutacion no cambio ningun RESTRICT').not.toBe(upSource)
    expect(
      presentationUnitForeignKeyIsRestrict(enCascada),
      'ON DELETE CASCADE no deberia pasar',
    ).toBe(false)

    // Cualquier otro aflojamiento tampoco pasa, `SET NULL` incluido —que ademas seria
    // incoherente con la columna NOT NULL del bloque 5—.
    for (const accion of ['CASCADE', 'SET NULL', 'SET DEFAULT', 'NO ACTION']) {
      // El reemplazo va con `g` A PROPOSITO: la cabecera del archivo NOMBRA la accion en un
      // comentario, asi que un `replace` sin `g` mutaria la PROSA y dejaria la FK real
      // intacta -y el caso en verde sin haber probado nada-. Ese fallo ocurrio al escribir
      // este test, y por eso se comprueba ademas que la sentencia EJECUTABLE mutó.
      const aflojada = upSource.replace(/ON DELETE RESTRICT/gi, `ON DELETE ${accion}`)
      expect(aflojada).not.toBe(upSource)
      expect(statements(aflojada).join(' '), 'la FK real tiene que haber mutado').toMatch(
        new RegExp(`ON DELETE ${accion}`, 'i'),
      )
      expect(
        presentationUnitForeignKeyIsRestrict(aflojada),
        `ON DELETE ${accion} no deberia pasar`,
      ).toBe(false)
    }

    // Y si se pierde el `ON UPDATE CASCADE`, tambien cae.
    const sinUpdate = upSource.replace(/ ON UPDATE CASCADE;/i, ';')
    expect(sinUpdate).not.toBe(upSource)
    expect(presentationUnitForeignKeyIsRestrict(sinUpdate)).toBe(false)
  })

  it('R3: existe el indice presentations_unit_id_idx, y no es unico', () => {
    // Postgres NO indexa el lado hijo de una FK, y por ahi pasa la verificacion del RESTRICT
    // en cada intento de borrar una unidad.
    expect(hasPresentationUnitIndex(upSource)).toBe(true)

    const sinIndice = upSource.replace(
      'CREATE INDEX "presentations_unit_id_idx" ON "presentations"("unit_id");',
      '',
    )
    expect(sinIndice, 'la mutacion no quito el indice').not.toBe(upSource)
    expect(hasPresentationUnitIndex(sinIndice)).toBe(false)

    // Un indice UNICO no vale: dejaria una sola presentacion por unidad.
    const unico = upSource.replace(
      'CREATE INDEX "presentations_unit_id_idx"',
      'CREATE UNIQUE INDEX "presentations_unit_id_idx"',
    )
    expect(unico).not.toBe(upSource)
    expect(hasPresentationUnitIndex(unico)).toBe(false)
  })
})

describe('QC-80 migration.sql — el relleno y la RLS', () => {
  it('R4: el relleno busca kilogramo por name_normalized, nunca por uuid, y aborta si falta', () => {
    expect(fillsFromNormalizedSystemKilogram(upSource)).toBe(true)

    // --- Mutacion obligatoria 2: quitar el bloque `DO $$` entero, EN MEMORIA.
    const sinRelleno = mutateWithoutFillBlock(upSource)
    expect(sinRelleno, 'la mutacion no quito el bloque DO $$').not.toBe(upSource)
    expect(fillBlock(sinRelleno), 'no debe quedar ningun bloque DO $$').toBeNull()
    expect(fillsFromNormalizedSystemKilogram(sinRelleno)).toBe(false)

    // Buscar la unidad POR ID es el error que este predicado existe para impedir: los uuid
    // los genero `gen_random_uuid()` en QC-32 y son distintos en cada base.
    const porId = upSource.replace(
      /"name_normalized" = 'kilogramo'\s*\n\s*AND "company_id" IS NULL/,
      `"id" = '00000000-0000-4000-8000-000000000001'`,
    )
    expect(porId, 'la mutacion no cambio la busqueda por nombre').not.toBe(upSource)
    expect(fillsFromNormalizedSystemKilogram(porId), 'buscar por uuid no deberia pasar').toBe(false)

    // Sin la guardia del nulo restante, el `SET NOT NULL` fallaria con un 23502 pelado que no
    // dice ni que ficha lo puso ni por que.
    const sinSegundaGuardia = upSource.replace(
      /IF remaining_null <> 0 THEN[\s\S]*?END IF;/,
      '',
    )
    expect(sinSegundaGuardia).not.toBe(upSource)
    expect(fillsFromNormalizedSystemKilogram(sinSegundaGuardia)).toBe(false)
  })

  it('R5: el SQL no inserta ni borra ninguna fila de presentations ni de units', () => {
    // Rellenar NO es limpiar. Las 113 presentaciones y las 2 unidades de residuo siguen ahi
    // despues de aplicarla: borrarlas es QC-77, y hacerlo aqui seria QC-77 de contrabando.
    expect(insertsAndDeletesNothing(upSource)).toBe(true)
    expect(insertsAndDeletesNothing(downSource)).toBe(true)
    // El unico verbo de datos del archivo es UPDATE, y esta dentro del bloque guardado. Se
    // cuenta sobre el SQL sin comentarios Y SIN LITERALES: el `ON DELETE`/`ON UPDATE` de la
    // FK son acciones referenciales —no escrituras— y los mensajes de `RAISE EXCEPTION`
    // NOMBRAN el UPDATE del relleno para explicar por que aborta. Contarlos haria imposible
    // de cumplir un requisito que el archivo si cumple.
    const escrituras = stripSqlComments(upSource)
      .replace(/'[^']*'/g, "''")
      .match(/(?<!\bON\s)\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/gi)
    expect(escrituras?.map((verbo) => verbo.toUpperCase())).toEqual(['UPDATE'])

    // Sensibilidad: el predicado cae con un solo DELETE de limpieza colado al final.
    const conLimpieza = `${upSource}\nDELETE FROM "presentations" WHERE "name" LIKE 'test%';\n`
    expect(insertsAndDeletesNothing(conLimpieza), 'un DELETE no deberia pasar').toBe(false)
    const conInsert = `${upSource}\nINSERT INTO "units" ("name") VALUES ('tonelada');\n`
    expect(insertsAndDeletesNothing(conInsert), 'un INSERT no deberia pasar').toBe(false)
  })

  it('R6: suelta y restituye el FORCE de LAS DOS tablas, y no crea ninguna policy', () => {
    // AQUI ESTA LA MINA. `presentations` se suelta porque el relleno ESCRIBE en ella; `units`
    // porque el relleno la LEE para resolver `kilogramo`. Con `FORCE` puesto y sin ninguna
    // policy, la RLS deniega TODO al dueno de la tabla —que es con quien se conecta Prisma—,
    // tambien el `SELECT`.
    expect(releasesAndRestoresForceOfBothTables(upSource)).toBe(true)
    expect(createsNoPolicy(upSource)).toBe(true)
    expect(createsNoPolicy(downSource)).toBe(true)
    // El parentesis se cierra DENTRO del archivo: el `NO FORCE` va antes del `FORCE`.
    for (const table of ['presentations', 'units']) {
      expect(upSource.indexOf(`ALTER TABLE "${table}"`)).toBeGreaterThanOrEqual(0)
      const suelta = new RegExp(`ALTER TABLE "${table}"\\s+NO FORCE ROW LEVEL SECURITY;`).exec(
        upSource,
      )
      const restituye = new RegExp(`ALTER TABLE "${table}"\\s+FORCE  ?ROW LEVEL SECURITY;`).exec(
        upSource,
      )
      expect(suelta, `falta el NO FORCE de ${table}`).not.toBeNull()
      expect(restituye, `falta el FORCE de ${table}`).not.toBeNull()
      expect((suelta as RegExpExecArray).index).toBeLessThan((restituye as RegExpExecArray).index)
    }
    // Y el DOWN las deja igual: activadas y forzadas las dos.
    for (const table of ['presentations', 'units']) {
      expect(downSource).toMatch(
        new RegExp(`ALTER TABLE "${table}"\\s+FORCE  ?ROW LEVEL SECURITY;`),
      )
    }

    // --- Mutacion obligatoria 3: quitar UNO de los dos `NO FORCE`, el de `units`.
    const sinSoltarUnits = mutateWithoutUnitsNoForce(upSource)
    expect(sinSoltarUnits, 'la mutacion no quito el NO FORCE de units').not.toBe(upSource)
    expect(
      releasesAndRestoresForceOfBothTables(sinSoltarUnits),
      'sin soltar units, el SELECT del relleno devolveria cero filas',
    ).toBe(false)
    // Y el de `presentations`, que es el evidente, tambien lo vigila.
    const sinSoltarPresentations = upSource.replace(
      /ALTER TABLE "presentations"\s+NO FORCE ROW LEVEL SECURITY;/i,
      '',
    )
    expect(sinSoltarPresentations).not.toBe(upSource)
    expect(releasesAndRestoresForceOfBothTables(sinSoltarPresentations)).toBe(false)

    // Si alguien no restituyera el FORCE, tambien cae: la tabla se quedaria abierta.
    const sinRestituir = upSource.replace(
      /ALTER TABLE "units"\s+FORCE  ROW LEVEL SECURITY;/i,
      '',
    )
    expect(sinRestituir).not.toBe(upSource)
    expect(releasesAndRestoresForceOfBothTables(sinRestituir)).toBe(false)

    // Y una policy tampoco: deny-by-default, como estaban. La frontera de autorizacion vive
    // en el caso de uso (`docs/architecture.md > Acceso a datos y autorizacion`).
    const conPolicy = `${upSource}\nCREATE POLICY "todo" ON "presentations" USING (true);\n`
    expect(createsNoPolicy(conPolicy), 'una policy no deberia pasar').toBe(false)
  })
})

describe('QC-80 migration.sql — el producto deja de declarar unidad', () => {
  it('R7: products pierde el indice, la FK y la columna unit_id, en ese orden', () => {
    expect(dropsProductUnit(upSource)).toBe(true)
    // Y no se lleva por delante ninguna otra columna ni ninguna tabla.
    expect(up.filter((statement) => /DROP COLUMN/i.test(statement))).toHaveLength(1)
    expect(up.filter((statement) => /^DROP TABLE/i.test(statement))).toHaveLength(0)

    for (const perdida of [
      'DROP INDEX IF EXISTS "products_unit_id_idx";',
      'ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_unit_id_fkey";',
      'ALTER TABLE "products" DROP COLUMN     IF EXISTS "unit_id";',
    ]) {
      const mutado = upSource.replace(perdida, '')
      expect(mutado, `la mutacion no quito ${perdida}`).not.toBe(upSource)
      expect(dropsProductUnit(mutado), `sin «${perdida}» no deberia pasar`).toBe(false)
    }
  })

  it('R25: ni el UP ni el DOWN le devuelven al producto una presentacion propia', () => {
    // La presentacion vive SOLO en `product_batches` desde QC-90. Devolversela a `products`
    // reabriria lo que aquella ficha cerro, y por eso R25 lo prohibe en las dos direcciones.
    expect(returnsNoPresentationToProducts(upSource)).toBe(true)
    expect(returnsNoPresentationToProducts(downSource)).toBe(true)

    const conPresentacion = `${upSource}\nALTER TABLE "products" ADD COLUMN "presentation_id" UUID;\n`
    expect(
      returnsNoPresentationToProducts(conPresentacion),
      'devolverle la presentacion al producto no deberia pasar',
    ).toBe(false)
  })

  it('R9: la migracion no anade deleted_at y escribe sus identificadores en ingles', () => {
    // Heredado y no reabierto (QC-4, QC-14 decision cerrada 2): identificadores de base en
    // ingles, `created_at`/`updated_at`, y `presentations` SIN borrado logico. Con
    // `deleted_at`, borrar seria un UPDATE y la FK no podria bloquearlo.
    expect(addsNoSoftDeleteAndKeepsEnglish(upSource)).toBe(true)
    expect(addsNoSoftDeleteAndKeepsEnglish(downSource)).toBe(true)
    // Las marcas que ya tenia la tabla no se renombran ni se traducen.
    expect(stripSqlComments(upSource)).not.toMatch(/RENAME COLUMN/i)
    // El idioma se afirma sobre los IDENTIFICADORES, no sobre el texto entero: los mensajes
    // de `RAISE EXCEPTION` estan en castellano a proposito -los lee una persona- y no son
    // nombres de nada.
    const identificadores = [
      ...stripSqlComments(upSource).matchAll(
        /(?:ADD COLUMN|CREATE INDEX|ADD CONSTRAINT)\s+"(\w+)"/gi,
      ),
    ].map((match) => match[1] as string)
    expect(identificadores).toEqual([
      'unit_id',
      'presentations_unit_id_fkey',
      'presentations_unit_id_idx',
    ])
    for (const identificador of identificadores) {
      expect(identificador, 'identificador en ingles').not.toMatch(
        /unidad|fecha|creado|actualizado|presentacion/i,
      )
    }

    const conBorrado = `${upSource}\nALTER TABLE "presentations" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);\n`
    expect(addsNoSoftDeleteAndKeepsEnglish(conBorrado), 'deleted_at no deberia pasar').toBe(false)
    const enEspanol = upSource.replace('"presentations_unit_id_idx"', '"presentaciones_unidad_idx"')
    expect(enEspanol, 'la mutacion no tradujo el identificador').not.toBe(upSource)
    expect(
      addsNoSoftDeleteAndKeepsEnglish(enEspanol),
      'un identificador en castellano no deberia pasar',
    ).toBe(false)
  })
})

describe('QC-80 down.sql — reversion exacta', () => {
  it('R8: el DOWN devuelve products.unit_id anulable con su FK y su indice, y limpia presentations', () => {
    expect(downRevertsTheUp(downSource)).toBe(true)
    // La columna vuelve ANULABLE: era opcional desde QC-32 (decision cerrada 7, R10). Vuelve
    // VACIA y eso es reversion completa: estaba vacia en las 7 filas vivas cuando el UP la
    // borro, asi que no hay ningun valor que restaurar.
    expect(down).toContain('ALTER TABLE "products" ADD COLUMN "unit_id" UUID')
    expect(stripSqlComments(downSource)).not.toMatch(/ADD COLUMN "unit_id" UUID NOT NULL/i)
    expect(stripSqlComments(downSource)).not.toMatch(/\bDEFAULT\b/i)

    // Cada sentencia del UP tiene su contraria en el DOWN.
    const contrarias: ReadonlyArray<readonly [RegExp, RegExp]> = [
      [/ADD COLUMN "unit_id" UUID/i, /ALTER TABLE "presentations" DROP COLUMN "unit_id"/i],
      [
        /ADD CONSTRAINT "presentations_unit_id_fkey"/i,
        /ALTER TABLE "presentations" DROP CONSTRAINT "presentations_unit_id_fkey"/i,
      ],
      [/CREATE INDEX "presentations_unit_id_idx"/i, /DROP INDEX "presentations_unit_id_idx"/i],
      [/DROP INDEX IF EXISTS "products_unit_id_idx"/i, /CREATE INDEX "products_unit_id_idx"/i],
      [
        /DROP CONSTRAINT IF EXISTS "products_unit_id_fkey"/i,
        /ADD CONSTRAINT "products_unit_id_fkey"/i,
      ],
      [/ALTER TABLE "products" DROP COLUMN\s+IF EXISTS "unit_id"/i, /ALTER TABLE "products" ADD COLUMN "unit_id"/i],
    ]
    for (const [enElUp, enElDown] of contrarias) {
      expect(upSource, `el UP debe contener ${String(enElUp)}`).toMatch(enElUp)
      expect(downSource, `al DOWN le falta la contraria de ${String(enElUp)}`).toMatch(enElDown)
    }
  })

  it('R8: el DOWN cae si pierde la FK del producto, su indice o un DROP de la presentacion', () => {
    // Un down que devuelve la columna pero no su integridad no devuelve el esquema anterior,
    // sino uno mas flojo. Cada pieza se quita por separado, EN MEMORIA.
    const piezas: ReadonlyArray<readonly [string, RegExp]> = [
      ['la FK del producto', /ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"[\s\S]*?;/],
      ['el indice del producto', /CREATE INDEX "products_unit_id_idx"[\s\S]*?;/],
      ['el DROP del indice de la presentacion', /DROP INDEX "presentations_unit_id_idx";/],
      [
        'el DROP de la FK de la presentacion',
        /ALTER TABLE "presentations" DROP CONSTRAINT "presentations_unit_id_fkey";/,
      ],
      ['el DROP de la columna', /ALTER TABLE "presentations" DROP COLUMN "unit_id";/],
    ]
    for (const [nombre, patron] of piezas) {
      const mutado = downSource.replace(patron, '')
      expect(mutado, `la mutacion no quito ${nombre}`).not.toBe(downSource)
      expect(downRevertsTheUp(mutado), `sin ${nombre} el down no revierte`).toBe(false)
    }

    // --- Mutacion obligatoria 1, tambien sobre el DOWN: `RESTRICT` -> `CASCADE`.
    const enCascada = mutateRestrictToCascade(downSource)
    expect(enCascada, 'la mutacion no cambio ningun RESTRICT').not.toBe(downSource)
    expect(downRevertsTheUp(enCascada), 'la FK restaurada no puede ser mas floja').toBe(false)

    // Y si la columna volviera NOT NULL, tampoco seria el esquema anterior.
    const obligatoria = downSource.replace(
      'ALTER TABLE "products" ADD COLUMN "unit_id" UUID;',
      'ALTER TABLE "products" ADD COLUMN "unit_id" UUID NOT NULL;',
    )
    expect(obligatoria).not.toBe(downSource)
    expect(downRevertsTheUp(obligatoria)).toBe(false)
  })
})
