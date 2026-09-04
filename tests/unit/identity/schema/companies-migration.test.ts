// Contrato estatico del SQL de la migracion de la empresa (QC-47).
//
// ESTADO: REDUCIDO. La primera vuelta de QC-47 modelaba una relacion de muchos a muchos con
// tabla intermedia y con el rol mudado fuera de `users`. El humano reacoto la ficha
// (`specs/QC-47-modelo-empresa-y-membresias/requirements.md`): un usuario pertenece a UNA
// empresa, tiene UN rol y `users.role_id` NO se toca (R13, R14). La tanda A borro de aqui todo
// lo que afirmaba algo sobre aquel modelo muerto. Lo que queda es lo que sigue siendo verdad;
// **T11 reescribe este archivo entero** con las afirmaciones del modelo nuevo (los seis
// `CREATE UNIQUE INDEX` de `design.md > 2.2` y `> 2.3`, el UP que no menciona `role_id`, y la
// guardia de R26 del DOWN).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`design.md > 2` y `> 3`): el indice unico FUNCIONAL y PARCIAL del nombre de empresa, el
// BACKFILL y su SITIO —antes del `FORCE ROW LEVEL SECURITY`—, y los ALTER de RLS.
//
// Vigila ademas los dos puntos MAS FRAGILES de la ficha:
//
//   1. El nombre de la empresa inicial se escribe LITERAL en el SQL porque no hay forma de
//      llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript) desde una
//      migracion. Este archivo importa la constante y la funcion REALES del contrato de
//      `identity` y las compara con los literales extraidos del `INSERT` (R21). Este test es
//      lo unico en todo el repo que se entera si las dos copias divergen — y por eso el
//      literal `'QuimiCloud'` NO se escribe aqui: solo
//      `lib/modules/identity/domain/companies.ts` lo escribe.
//
//   2. `prisma migrate dev --create-only` emite `DROP` de todo lo que Prisma no conoce
//      (`design.md > 3.1`). Si un `DROP` se cuela sobre una tabla de otro modulo, el esquema
//      sigue validando y el cliente sigue compilando: no se entera nadie.
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una version MUTADA EN MEMORIA
// (el archivo en disco NO se toca). Un test que no puede fallar no vigila nada; es el mismo
// patron de `tests/unit/unidades/schema/unidades-migration.test.ts`.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { INITIAL_COMPANY_NAME, normalizeCompanyName } from '@/lib/modules/identity'

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
 * por una razon que no es la suya. T9 renombra la carpeta y T11 actualiza este patron.
 */
const companiesDirs = readdirSync(migrationsDir).filter((name) => /_companies_and_/.test(name))
expect(companiesDirs, 'debe existir exactamente una migracion de la empresa').toHaveLength(1)
const migrationDir = join(migrationsDir, companiesDirs[0] as string)

/** La migracion de QC-4, de donde salen los textos EXACTOS de los tres indices unicos. */
const qc4Dir = join(migrationsDir, '20260806122638_users_and_roles')

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
 * Parte por `;`, igual que el precedente de QC-32. Los bloques `DO $$ ... $$` llevan `;`
 * dentro y salen partidos en trozos, pero ninguno de esos trozos empieza por `CREATE`,
 * `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion de abajo. El backfill se comprueba
 * sobre el TEXTO COMPLETO, no sobre esta lista.
 */
function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const qc4Source = readFileSync(join(qc4Dir, 'migration.sql'), 'utf8')
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
}

// --- Predicados puros ----------------------------------------------------------------------

/** Una fila del `INSERT INTO "companies"` del backfill, tal como esta ESCRITA en el SQL. */
export type FilaEmpresa = {
  readonly name: string
  readonly nameNormalized: string
}

/**
 * R21 y R23. La fila que el backfill inserta en `companies`, o `null` si no hay `INSERT` o si
 * no rellena exactamente las tres columnas esperadas.
 *
 * Devolver `null` en vez de un objeto vacio cuando el INSERT falta es deliberado: un backfill
 * ausente y uno vacio son la misma cosa para un assert distraido, y esa es justo una de las
 * mutaciones de sensibilidad de abajo.
 */
export function backfillCompanyRow(sql: string): FilaEmpresa | null {
  const ejecutable = stripSqlComments(sql)
  const insert = /INSERT\s+INTO\s+"companies"\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i.exec(
    ejecutable,
  )
  if (insert === null) return null
  const columnas = [...(insert[1] as string).matchAll(/"(\w+)"/g)].map((match) => match[1])
  if (columnas.join(',') !== 'name,name_normalized,updated_at') return null

  const valores = (insert[2] as string).split(',')
  if (valores.length !== 3) return null
  const literal = (valor: string): string | null => {
    const match = /^'([^']*)'$/.exec(valor.trim())
    return match === null ? null : (match[1] as string)
  }
  const name = literal(valores[0] as string)
  const nameNormalized = literal(valores[1] as string)
  if (name === null || nameNormalized === null) return null
  // `updated_at` es NOT NULL SIN default (lo pone `@updatedAt` del cliente, no la base), asi
  // que el INSERT crudo tiene que darlo explicito o falla.
  if (!/^CURRENT_TIMESTAMP$/i.test((valores[2] as string).trim())) return null
  return { name, nameNormalized }
}

/**
 * R21. ¿El literal del SQL es EXACTAMENTE la unica definicion del nombre de la empresa inicial
 * —`INITIAL_COMPANY_NAME`, importada de verdad— y su normalizado el que produce sobre el la
 * unica definicion de la normalizacion —`normalizeCompanyName`, importada de verdad—?
 *
 * Aqui no se escribe ningun literal de nombre de empresa a proposito: si alguien cambia la
 * constante y no el SQL, o el SQL y no la constante, este predicado cae.
 */
export function backfillLiteralsMatchTheOnlyDefinitions(sql: string): boolean {
  const fila = backfillCompanyRow(sql)
  if (fila === null) return false
  return (
    fila.name === INITIAL_COMPANY_NAME &&
    fila.nameNormalized === normalizeCompanyName(INITIAL_COMPANY_NAME)
  )
}

/**
 * R23 y `design.md > 3.1` paso 10: el backfill va ANTES de los `FORCE ROW LEVEL SECURITY`. NO
 * es cosmetico: `FORCE` sin policies deniega TAMBIEN al dueno de la tabla, que es con quien se
 * conecta Prisma, asi que un INSERT colocado despues no insertaria nada y la migracion
 * terminaria en verde sin haber metido a nadie en ninguna empresa.
 */
export function backfillSitsBeforeForceRls(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const insertEmpresa = ejecutable.search(/INSERT\s+INTO\s+"companies"/i)
  const primerForce = ejecutable.search(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i)
  if (insertEmpresa === -1 || primerForce === -1) return false
  return insertEmpresa < primerForce
}

/** R24. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
export function hasRlsEnabledAndForced(sql: string, table: string): boolean {
  const source = statements(sql)
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/** Los tres indices unicos funcionales y parciales de `users` que escribio QC-4 (R25). */
const INDICES_DE_QC4 = ['users_email_unique', 'users_username_unique', 'users_document_unique']

/**
 * Sentencia de QC-4, normalizada, que declara el identificador pedido. Se LEE del archivo de
 * QC-4 en vez de copiarse como literal: copiarla seria tener DOS verdades que se desincronizan
 * en silencio. Es el mecanismo con el que T11 comparara, uno a uno, los tres
 * `CREATE UNIQUE INDEX` que el `down.sql` tiene que devolver con el texto literal de QC-4
 * (R25, `design.md > 2.3`).
 */
export function qc4Statement(pattern: RegExp): string | null {
  const found = statements(qc4Source).filter((statement) => pattern.test(statement))
  return found.length === 1 ? (found[0] as string) : null
}

// --- El UP ---------------------------------------------------------------------------------

describe('migration.sql — el backfill de la empresa', () => {
  it('el literal de la empresa sale de la UNICA definicion, y el test cae si divergen', () => {
    // R21. El SQL no puede importar TypeScript, asi que el nombre y su normalizado son un
    // DUPLICADO de `lib/modules/identity/domain/companies.ts` y de `company-name.ts`. Este
    // test importa las dos definiciones REALES: es lo unico que se entera si divergen.
    expect(backfillLiteralsMatchTheOnlyDefinitions(upSource)).toBe(true)

    const fila = backfillCompanyRow(upSource)
    expect(fila).not.toBeNull()
    expect((fila as FilaEmpresa).name).toBe(INITIAL_COMPANY_NAME)
    expect((fila as FilaEmpresa).nameNormalized).toBe(normalizeCompanyName(INITIAL_COMPANY_NAME))

    // --- Sensibilidad: cambiar el literal del SQL sin cambiar la constante CAE. La mutacion
    // es EN MEMORIA; el archivo en disco no se toca.
    const otroNombre = upSource.replace(`'${INITIAL_COMPANY_NAME}'`, "'Otra Empresa'")
    expect(otroNombre, 'la mutacion no cambio el nombre').not.toBe(upSource)
    expect(backfillLiteralsMatchTheOnlyDefinitions(otroNombre)).toBe(false)

    // Y cambiar solo el normalizado tambien: es la desincronizacion silenciosa de R21.
    const otroNormalizado = upSource.replace(
      `'${normalizeCompanyName(INITIAL_COMPANY_NAME)}',`,
      "'otra',",
    )
    expect(otroNormalizado, 'la mutacion no cambio el normalizado').not.toBe(upSource)
    expect(backfillLiteralsMatchTheOnlyDefinitions(otroNormalizado)).toBe(false)

    // Sin backfill no hay nada que comprobar, y eso tampoco pasa.
    const sinInsert = upSource.replace(/INSERT\s+INTO\s+"companies"/i, 'SELECT 1 FROM "companies"')
    expect(sinInsert, 'la mutacion no quito el INSERT').not.toBe(upSource)
    expect(backfillLiteralsMatchTheOnlyDefinitions(sinInsert)).toBe(false)
  })

  it('el backfill va ANTES del FORCE ROW LEVEL SECURITY, y el test cae si se mueve detras', () => {
    // `design.md > 3.1` paso 10: `FORCE` sin policies deniega TAMBIEN al dueno de la tabla,
    // que es con quien se conecta Prisma. Un INSERT colocado detras no insertaria nada y la
    // migracion terminaria EN VERDE sin haber creado la empresa.
    expect(backfillSitsBeforeForceRls(upSource)).toBe(true)

    // --- Sensibilidad: un FORCE colado por delante de todo tumba el predicado.
    const rlsDelante = `ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;\n${upSource}`
    expect(rlsDelante, 'la mutacion no anadio el FORCE').not.toBe(upSource)
    expect(
      backfillSitsBeforeForceRls(rlsDelante),
      'un backfill detras del FORCE no deberia pasar',
    ).toBe(false)
  })
})

describe('migration.sql — la tabla nueva', () => {
  it('companies queda con RLS activada Y forzada', () => {
    // R24. Sin `FORCE`, el dueno de la tabla —que es con quien se conecta Prisma— ignora la
    // RLS entera y la defensa en profundidad no defiende de nada.
    expect(hasRlsEnabledAndForced(upSource, 'companies'), 'companies sin ENABLE + FORCE').toBe(
      true,
    )

    // Sensibilidad: quitar el FORCE ya no pasa.
    const sinForce = upSource.replace(/ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;/, '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'companies')).toBe(false)
  })

  it('la empresa lleva el indice unico FUNCIONAL y PARCIAL de su nombre normalizado', () => {
    // R4 y R5: parcial, para que una empresa dada de baja libere su nombre. Prisma no modela
    // ni `lower(...)` ni `WHERE`, asi que este indice solo existe aqui.
    const indice = findStatement(up, /^CREATE UNIQUE INDEX "companies_name_unique"/i)
    expect(indice).toMatch(/ON "companies" \(lower\("name_normalized"\)\)/i)
    expect(indice).toMatch(/WHERE "deleted_at" IS NULL$/i)
  })

  it('la empresa nace con deleted_at, con sus marcas de tiempo y sin varchar(n)', () => {
    // R6 (la baja logica nace con la tabla), R7 (las dos marcas de tiempo) y R8: todo texto es
    // `TEXT`, nunca un `varchar(n)` arbitrario.
    const creaEmpresas = findStatement(up, /^CREATE TABLE "companies"/i)
    expect(creaEmpresas).toMatch(/"deleted_at" TIMESTAMPTZ\(6\)/i)
    expect(creaEmpresas).toMatch(/"name" TEXT NOT NULL/i)
    expect(creaEmpresas).toMatch(/"name_normalized" TEXT NOT NULL/i)
    expect(creaEmpresas).toMatch(
      /"created_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/i,
    )
    expect(creaEmpresas).toMatch(/"updated_at" TIMESTAMPTZ\(6\) NOT NULL/i)
    expect(creaEmpresas).not.toMatch(/VARCHAR\s*\(/i)
  })
})

describe('migration.sql — lo que esta migracion NO toca', () => {
  it('los tres indices unicos de users siguen declarados en la migracion de QC-4', () => {
    // El mecanismo que T11 usa para comparar el `down.sql` contra el texto LITERAL de QC-4
    // (R25): los tres se LEEN de su migracion, nunca se copian aqui como literal.
    for (const indice of INDICES_DE_QC4) {
      expect(qc4Statement(new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i'))).not.toBeNull()
    }
  })

  it('no se toca ninguna FK, CHECK ni RLS de las tablas de otros modulos', () => {
    // `design.md > 3.1`: Prisma genera `DROP CONSTRAINT` sobre las FK escritas a mano de
    // `orders`, `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines` y `suppliers`.
    // Se borran a mano. Aqui se afirma que no volvieron.
    const ajenas = [
      'orders',
      'products',
      'recipe_lines',
      'recipes',
      'supplier_catalog_lines',
      'suppliers',
      'presentations',
      'units',
      'document_types',
    ]
    for (const tabla of ajenas) {
      expect(
        up.filter((statement) => new RegExp(`^ALTER TABLE "?${tabla}"?\\b`, 'i').test(statement)),
        `esta migracion no debe tocar ${tabla}`,
      ).toEqual([])
    }
    // Y `pgcrypto` se declara autocontenida, sin borrar la de nadie.
    expect(findStatement(up, /^CREATE EXTENSION/i)).toBe('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  })
})

// --- El DOWN -------------------------------------------------------------------------------

describe('down.sql — la reversion', () => {
  it('borra la empresa la ultima y no toca pgcrypto', () => {
    // R25: no queda tabla, columna, indice ni restriccion residual. Los indices, la FK y la
    // RLS de la tabla caen CON ella, por eso no se dropean uno a uno.
    const dropped = down
      .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(dropped.at(-1)).toBe('companies')

    // `pgcrypto` NO se toca: el UP no la crea en exclusiva y otros modulos dependen de ella.
    expect(down.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })
})
