// T10 — Contrato estatico del SQL de la migracion `companies_and_memberships`
// (QC-47: modelo-empresa-y-membresias).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`specs/QC-47-modelo-empresa-y-membresias/design.md` seccion 4): el indice unico FUNCIONAL y
// PARCIAL del nombre de empresa, el BACKFILL que muda el rol de `users.role_id` a la
// pertenencia y su SITIO —antes del `FORCE ROW LEVEL SECURITY` y antes del `DROP COLUMN`—, los
// cuatro ALTER de RLS, la GUARDIA del DOWN y la recreacion A MANO de la FK y el indice de
// `role_id` que Postgres se llevo con la columna.
//
// Vigila ademas los dos puntos MAS FRAGILES de la ficha:
//
//   1. El nombre de la empresa inicial se escribe LITERAL en el SQL porque no hay forma de
//      llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript) desde una
//      migracion. Este archivo importa la constante y la funcion REALES del contrato de
//      `identity` y las compara con los literales extraidos del `INSERT` (R20). Este test es
//      lo unico en todo el repo que se entera si las dos copias divergen — y por eso el
//      literal `'QuimiCloud'` NO se escribe aqui: el bloque A dejo como invariante que solo
//      `lib/modules/identity/domain/companies.ts` lo escribe.
//
//   2. `prisma migrate dev --create-only` emite `DROP` de todo lo que Prisma no conoce
//      (`design.md` seccion 4.4). Si un `DROP` sobre `users_email_unique`,
//      `users_username_unique` o `users_document_unique` se cuela en este `migration.sql`, la
//      unicidad del correo y del nombre de usuario DESAPARECE, el esquema sigue validando y el
//      cliente sigue compilando: no se entera nadie (R27).
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una version MUTADA EN MEMORIA
// (el archivo en disco NO se toca). Un test que no puede fallar no vigila nada; es el mismo
// patron de `tests/unit/unidades/schema/unidades-migration.test.ts`.
//
// R23, R24, R25 y R26 se cierran DE VERDAD contra la base real (bitacora de T8 y T9): aqui
// solo se lee texto.
//
// Cubre R4 (su parte de SQL), R5, R6, R7, R9, R10, R11, R12, R14, R20, R21, R23, R24 (su parte
// de SQL), R25, R26 y R27.

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
 * por una razon que no es la suya.
 */
const companiesDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_companies_and_memberships'),
)
expect(
  companiesDirs,
  'debe existir exactamente una migracion *_companies_and_memberships',
).toHaveLength(1)
const migrationDir = join(migrationsDir, companiesDirs[0] as string)

/** La migracion de QC-4, de donde salen los textos EXACTOS de la FK y el indice de `role_id`. */
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
 * `ALTER` ni `DROP`, asi que no ensucian ninguna afirmacion de abajo. El backfill y la guardia
 * se comprueban sobre el TEXTO COMPLETO, no sobre esta lista.
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
 * R20 y R24. La fila que el backfill inserta en `companies`, o `null` si no hay `INSERT` o si
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
 * R20. ¿El literal del SQL es EXACTAMENTE la unica definicion del nombre de la empresa inicial
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
 * R24. ¿El backfill copia el rol LITERAL de cada fila de `users` a su pertenencia, sin filtrar
 * a los usuarios dados de baja?
 *
 * El `WHERE deleted_at IS NULL` los dejaria sin pertenencia, y entonces el `down.sql` no
 * podria devolverles su `role_id` —que es NOT NULL— y R25 seria imposible de cumplir.
 */
export function backfillCopiesEveryUserRole(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const insert = /INSERT\s+INTO\s+"memberships"\s*\(([^)]*)\)\s*SELECT([\s\S]*?);/i.exec(
    ejecutable,
  )
  if (insert === null) return false
  const columnas = [...(insert[1] as string).matchAll(/"(\w+)"/g)].map((match) => match[1])
  if (columnas.join(',') !== 'user_id,company_id,role_id,updated_at') return false
  const seleccion = (insert[2] as string).replace(/\s+/g, ' ')
  const copiaElRol = /u\."role_id"/i.test(seleccion)
  const leeTodosLosUsuarios = /FROM "users" u$/i.test(seleccion.trim())
  return copiaElRol && leeTodosLosUsuarios
}

/**
 * R23 y `design.md` seccion 4.1 paso 8: el backfill va ANTES de los `FORCE ROW LEVEL
 * SECURITY`. NO es cosmetico: `FORCE` sin policies deniega TAMBIEN al dueno de la tabla, que es
 * con quien se conecta Prisma, asi que un INSERT colocado despues no insertaria nada y la
 * migracion terminaria en verde habiendo perdido el rol de todo el mundo.
 *
 * Se mide contra el PRIMER `FORCE` del archivo: da igual cual de las dos tablas sea, los dos
 * INSERT tienen que quedar por delante de los dos.
 */
export function backfillSitsBeforeForceRls(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const insertEmpresa = ejecutable.search(/INSERT\s+INTO\s+"companies"/i)
  const insertPertenencia = ejecutable.search(/INSERT\s+INTO\s+"memberships"/i)
  const primerForce = ejecutable.search(/FORCE\s+ROW\s+LEVEL\s+SECURITY/i)
  if (insertEmpresa === -1 || insertPertenencia === -1 || primerForce === -1) return false
  return insertEmpresa < primerForce && insertPertenencia < primerForce
}

/**
 * R14 y `design.md` seccion 4.1 paso 7: el `DROP COLUMN "role_id"` va DESPUES del backfill,
 * que es quien lo lee. Si va antes, el backfill no tiene de donde sacar el rol.
 */
export function dropsRoleColumnAfterBackfill(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const insertPertenencia = ejecutable.search(/INSERT\s+INTO\s+"memberships"/i)
  const dropColumn = ejecutable.search(/ALTER\s+TABLE\s+"users"\s+DROP\s+COLUMN\s+"role_id"/i)
  if (insertPertenencia === -1 || dropColumn === -1) return false
  return insertPertenencia < dropColumn
}

/** R23. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
export function hasRlsEnabledAndForced(sql: string, table: string): boolean {
  const source = statements(sql)
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/** Los tres indices unicos funcionales y parciales de `users` que escribio QC-4 (R27). */
const INDICES_DE_QC4 = ['users_email_unique', 'users_username_unique', 'users_document_unique']

/**
 * R27. ¿El SQL se abstiene de TOCAR los tres indices unicos de `users`?
 *
 * No basta con vigilar `DROP INDEX`: un `ALTER INDEX ... RENAME` o un `DROP ... IF EXISTS`
 * colado por drift tendrian el mismo efecto. Se afirma lo fuerte: esos tres nombres no
 * aparecen en NINGUNA sentencia ejecutable de esta migracion. En los comentarios si aparecen,
 * y deben —explican por que no se tocan—, por eso se mide sobre el SQL sin comentarios.
 */
export function leavesQc4UniqueIndexesUntouched(sql: string): boolean {
  const source = statements(sql)
  return INDICES_DE_QC4.every(
    (indice) => !source.some((statement) => statement.includes(indice)),
  )
}

/**
 * Sentencia de QC-4, normalizada, que declara el identificador pedido. Se LEE del archivo de
 * QC-4 en vez de copiarse como literal: si QC-4 cambiara, el `down.sql` tendria que cambiar
 * con el, y un literal aqui dejaria pasar la divergencia.
 */
export function qc4Statement(pattern: RegExp): string | null {
  const found = statements(qc4Source).filter((statement) => pattern.test(statement))
  return found.length === 1 ? (found[0] as string) : null
}

/**
 * R25. ¿El `down.sql` recrea la FK y el indice de `role_id` con EXACTAMENTE el mismo texto con
 * que los escribio QC-4?
 *
 * Postgres se los llevo CON la columna en el `DROP COLUMN` del UP y NO vuelven solos con el
 * `ADD COLUMN` (misma trampa que QC-52 documento con los CHECK de `products`). Si el texto no
 * coincide, el esquema de vuelta se parece al anterior pero no es el anterior.
 */
export function downRestoresRoleFkAndIndexLikeQc4(sql: string): boolean {
  const source = statements(sql)
  const esperados = [
    qc4Statement(/ADD CONSTRAINT "users_role_id_fkey"/i),
    qc4Statement(/^CREATE INDEX "users_role_id_idx"/i),
  ]
  if (esperados.some((esperado) => esperado === null)) return false
  return esperados.every((esperado) => source.includes(esperado as string))
}

/**
 * R26. ¿El DOWN arranca con la guardia que aborta si algun usuario tiene un numero de
 * pertenencias distinto de 1?
 *
 * Es R24 leida al reves: fallar antes que perder o inventar un rol. Sin ella, el DOWN o deja
 * usuarios sin rol —y el `SET NOT NULL` revienta con un error que no explica nada—, o elige
 * uno al azar entre dos pertenencias.
 */
export function downStartsWithMembershipGuard(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const guard = /DO\s+\$\$[\s\S]*?\$\$/.exec(ejecutable)
  if (guard === null) return false
  const cuerpo = guard[0]
  const aborta = /RAISE\s+EXCEPTION/i.test(cuerpo)
  const cuenta = /HAVING\s+count\(m\."id"\)\s*<>\s*1/i.test(cuerpo)
  const primerCambio = /\b(ALTER\s+TABLE|CREATE\s+INDEX|DROP\s+TABLE|UPDATE\s+"users")\b/i.exec(
    ejecutable,
  )
  const vaLaPrimera = primerCambio !== null && guard.index < primerCambio.index
  return aborta && cuenta && vaLaPrimera
}

// --- El UP ---------------------------------------------------------------------------------

describe('migration.sql — el backfill del rol', () => {
  it('el literal de la empresa sale de la UNICA definicion, y el test cae si divergen', () => {
    // R20. El SQL no puede importar TypeScript, asi que el nombre y su normalizado son un
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

    // Y cambiar solo el normalizado tambien: es la desincronizacion silenciosa de R20.
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

  it('la pertenencia se crea con el rol LITERAL de cada usuario, bajas incluidas', () => {
    // R24: ni un rol se pierde ni se inventa. Y los usuarios dados de baja tambien entran, o
    // el `down.sql` no podria devolverles su `role_id` (R25).
    expect(backfillCopiesEveryUserRole(upSource)).toBe(true)

    // Sensibilidad: un rol calculado o filtrado deja de ser el rol de esa persona.
    const rolInventado = upSource.replace(/u\."role_id",/, "(SELECT id FROM roles LIMIT 1),")
    expect(rolInventado, 'la mutacion no cambio el rol copiado').not.toBe(upSource)
    expect(backfillCopiesEveryUserRole(rolInventado)).toBe(false)

    const soloVivos = upSource.replace(
      /FROM "users" u;/,
      'FROM "users" u WHERE u."deleted_at" IS NULL;',
    )
    expect(soloVivos, 'la mutacion no filtro a los usuarios de baja').not.toBe(upSource)
    expect(backfillCopiesEveryUserRole(soloVivos)).toBe(false)
  })

  it('el backfill va ANTES del FORCE ROW LEVEL SECURITY, y el test cae si se mueve detras', () => {
    // `design.md` seccion 4.1 paso 8: `FORCE` sin policies deniega TAMBIEN al dueno de la
    // tabla, que es con quien se conecta Prisma. Un INSERT colocado detras no insertaria nada
    // y la migracion terminaria EN VERDE habiendo perdido el rol de todo el mundo.
    expect(backfillSitsBeforeForceRls(upSource)).toBe(true)

    // --- Sensibilidad: se mueven los cuatro ALTER de RLS delante del bloque `DO $$`.
    const rls = /ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;[\s\S]*?"memberships" FORCE ROW LEVEL SECURITY;/.exec(
      upSource,
    )
    expect(rls, 'no se encontro el bloque de RLS del final').not.toBeNull()
    const bloqueRls = (rls as RegExpExecArray)[0]
    const rlsDelante = upSource
      .replace(bloqueRls, '')
      .replace(/DO \$\$/, `${bloqueRls}\nDO $$`)
    expect(rlsDelante, 'la mutacion no movio el bloque de RLS').not.toBe(upSource)
    expect(
      backfillSitsBeforeForceRls(rlsDelante),
      'un backfill detras del FORCE no deberia pasar',
    ).toBe(false)
  })

  it('el DROP COLUMN de role_id va DESPUES del backfill', () => {
    // R14 y `design.md` seccion 4.1 paso 7: el backfill lee `users.role_id`, asi que la
    // columna no puede haber desaparecido antes.
    expect(dropsRoleColumnAfterBackfill(upSource)).toBe(true)
    expect(findStatement(up, /^ALTER TABLE "users" DROP COLUMN "role_id"$/i)).toBeDefined()

    const dropDelante = upSource
      .replace(/ALTER TABLE "users" DROP COLUMN "role_id";\n/, '')
      .replace(/DO \$\$/, 'ALTER TABLE "users" DROP COLUMN "role_id";\nDO $$')
    expect(dropDelante, 'la mutacion no movio el DROP COLUMN').not.toBe(upSource)
    expect(dropsRoleColumnAfterBackfill(dropDelante)).toBe(false)
  })
})

describe('migration.sql — las dos tablas nuevas', () => {
  it('companies y memberships quedan con RLS activada Y forzada', () => {
    // R23. Sin `FORCE`, el dueno de las tablas —que es con quien se conecta Prisma— ignora la
    // RLS entera y la defensa en profundidad no defiende de nada.
    for (const tabla of ['companies', 'memberships']) {
      expect(hasRlsEnabledAndForced(upSource, tabla), `${tabla} sin ENABLE + FORCE`).toBe(true)
    }

    // Sensibilidad: quitar el FORCE de una sola de las dos ya no pasa.
    const sinForceEmpresas = upSource.replace(
      /ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;/,
      '',
    )
    expect(sinForceEmpresas, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForceEmpresas, 'companies')).toBe(false)
    expect(hasRlsEnabledAndForced(sinForceEmpresas, 'memberships')).toBe(true)
  })

  it('la empresa lleva el indice unico FUNCIONAL y PARCIAL de su nombre normalizado', () => {
    // R4 y la decision del humano sobre la pregunta abierta 5: parcial, para que una empresa
    // dada de baja libere su nombre. Prisma no modela ni `lower(...)` ni `WHERE`, asi que este
    // indice solo existe aqui.
    const indice = findStatement(up, /^CREATE UNIQUE INDEX "companies_name_unique"/i)
    expect(indice).toMatch(/ON "companies" \(lower\("name_normalized"\)\)/i)
    expect(indice).toMatch(/WHERE "deleted_at" IS NULL$/i)
  })

  it('la pertenencia lleva su unico compuesto y sus tres FK con RESTRICT', () => {
    // R9: la pareja persona + empresa es unica, TOTAL y no parcial (sin borrado logico no hay
    // filas muertas que liberen la pareja).
    const unico = findStatement(up, /^CREATE UNIQUE INDEX "memberships_user_id_company_id_key"/i)
    expect(unico).toMatch(/ON "memberships"\("user_id", "company_id"\)/i)
    expect(unico).not.toMatch(/WHERE/i)

    // R10 y R11: las tres referencias existen de verdad y ninguna se puede borrar mientras
    // haya una pertenencia que la use. RESTRICT y NUNCA CASCADE.
    const fks: ReadonlyArray<readonly [string, string]> = [
      ['memberships_user_id_fkey', 'users'],
      ['memberships_company_id_fkey', 'companies'],
      ['memberships_role_id_fkey', 'roles'],
    ]
    for (const [nombre, tabla] of fks) {
      const fk = findStatement(up, new RegExp(`ADD CONSTRAINT "${nombre}"`, 'i'))
      expect(fk).toMatch(new RegExp(`REFERENCES "${tabla}"\\("id"\\)`, 'i'))
      expect(fk, `${nombre} debe restringir el borrado`).toMatch(/ON DELETE RESTRICT/i)
      expect(fk, `${nombre} nunca propaga el borrado`).not.toMatch(
        /ON DELETE (CASCADE|SET NULL|SET DEFAULT|NO ACTION)/i,
      )
    }

    // R12: la pertenencia NO nace con ninguna marca de borrado logico.
    const creaPertenencias = findStatement(up, /^CREATE TABLE "memberships"/i)
    for (const prohibida of ['deleted_at', 'archived_at', 'disabled_at', 'is_active']) {
      expect(creaPertenencias, `memberships no debe crear ${prohibida}`).not.toMatch(
        new RegExp(`"${prohibida}"`, 'i'),
      )
    }
    // R5 y R6: la empresa si nace con `deleted_at`, y las dos con sus marcas de tiempo, sin
    // `varchar(n)` en ninguna columna (R21).
    const creaEmpresas = findStatement(up, /^CREATE TABLE "companies"/i)
    expect(creaEmpresas).toMatch(/"deleted_at" TIMESTAMPTZ\(6\)/i)
    expect(creaEmpresas).toMatch(/"name" TEXT NOT NULL/i)
    expect(creaEmpresas).toMatch(/"name_normalized" TEXT NOT NULL/i)
    for (const crea of [creaEmpresas, creaPertenencias]) {
      expect(crea).toMatch(/"created_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/i)
      expect(crea).toMatch(/"updated_at" TIMESTAMPTZ\(6\) NOT NULL/i)
      expect(crea).not.toMatch(/VARCHAR\s*\(/i)
    }
  })
})

describe('migration.sql — lo que esta migracion NO toca', () => {
  it('no hay ningun DROP sobre los tres indices unicos de users que escribio QC-4', () => {
    // R27 y `design.md` seccion 4.4, el RIESGO N.o 1 de la ficha: `prisma migrate dev
    // --create-only` emite `DROP` de todo lo que no conoce. Si uno de esos tres se cuela, la
    // unicidad del correo y del nombre de usuario desaparece y todo queda EN VERDE.
    expect(leavesQc4UniqueIndexesUntouched(upSource)).toBe(true)
    expect(leavesQc4UniqueIndexesUntouched(downSource)).toBe(true)

    // Los tres siguen existiendo donde siempre: en la migracion de QC-4.
    for (const indice of INDICES_DE_QC4) {
      expect(qc4Statement(new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i'))).not.toBeNull()
    }

    // --- Sensibilidad: un solo DROP colado por drift tumba el predicado.
    for (const indice of INDICES_DE_QC4) {
      const conDrift = `${upSource}\nDROP INDEX "${indice}";\n`
      expect(
        leavesQc4UniqueIndexesUntouched(conDrift),
        `un DROP INDEX sobre ${indice} no deberia pasar`,
      ).toBe(false)
    }
  })

  it('no se toca ninguna FK, CHECK ni RLS de las tablas de otros modulos', () => {
    // `design.md` seccion 4.4: Prisma genero `DROP CONSTRAINT` sobre las FK escritas a mano de
    // `orders`, `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines` y `suppliers`.
    // Se borraron a mano. Aqui se afirma que no volvieron.
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
    // De `users` solo se toca una cosa: la columna del rol se va (R14). Nada mas.
    expect(up.filter((statement) => /^ALTER TABLE "users"/i.test(statement))).toEqual([
      'ALTER TABLE "users" DROP COLUMN "role_id"',
    ])
    // Y `pgcrypto` se declara autocontenida, sin borrar la de nadie.
    expect(findStatement(up, /^CREATE EXTENSION/i)).toBe(
      'CREATE EXTENSION IF NOT EXISTS pgcrypto',
    )
  })
})

// --- El DOWN -------------------------------------------------------------------------------

describe('down.sql — la reversion', () => {
  it('empieza con la guardia que aborta si alguien no tiene exactamente una pertenencia', () => {
    // R26, que es R24 leida al reves: fallar antes que perder o inventar un rol. Se dispara con
    // un usuario con dos pertenencias (el modelo lo permite, R8) y con uno sin ninguna.
    expect(downStartsWithMembershipGuard(downSource)).toBe(true)

    // El mensaje dice QUE paso y POR QUE se para: un RAISE sin explicacion es una pared.
    const guard = /DO\s+\$\$[\s\S]*?\$\$/.exec(stripSqlComments(downSource))
    expect((guard as RegExpExecArray)[0]).toMatch(/R26/)

    // --- Sensibilidad: sin el bloque `DO $$`, el predicado CAE.
    const sinGuardia = downSource.replace(/DO\s+\$\$[\s\S]*?\$\$;/, '')
    expect(sinGuardia, 'la mutacion no quito el bloque DO $$').not.toBe(downSource)
    expect(downStartsWithMembershipGuard(sinGuardia)).toBe(false)

    // ...ni una guardia que avise sin abortar. Con `/g`: la cabecera lo nombra en prosa.
    const sinExcepcion = downSource.replace(/RAISE\s+EXCEPTION/g, 'RAISE NOTICE')
    expect(sinExcepcion, 'la mutacion no cambio el RAISE').not.toBe(downSource)
    expect(downStartsWithMembershipGuard(sinExcepcion), 'un aviso no es una guardia').toBe(false)
  })

  it('devuelve role_id a users OBLIGATORIA y con el rol que guardaba la pertenencia', () => {
    // R25: la columna vuelve primero anulable —no hay valor que darle todavia—, se rellena
    // desde la pertenencia y solo entonces se endurece, como la dejo QC-4.
    const add = findStatement(down, /^ALTER TABLE "users" ADD COLUMN "role_id"/i)
    expect(add).toBe('ALTER TABLE "users" ADD COLUMN "role_id" UUID')
    expect(add, 'un DEFAULT sembraria roles inventados').not.toMatch(/DEFAULT/i)

    const update = findStatement(down, /^UPDATE "users"/i)
    expect(update).toMatch(/SET "role_id" = m\."role_id" FROM "memberships" m/i)

    const notNull = findStatement(down, /ALTER COLUMN "role_id" SET NOT NULL/i)
    expect(notNull).toBe('ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL')

    // Y el orden importa: rellenar despues del `SET NOT NULL` reventaria.
    const indice = (pattern: RegExp): number => down.findIndex((s) => pattern.test(s))
    expect(indice(/ADD COLUMN "role_id"/i)).toBeLessThan(indice(/^UPDATE "users"/i))
    expect(indice(/^UPDATE "users"/i)).toBeLessThan(indice(/SET NOT NULL/i))
  })

  it('recrea la FK y el indice de role_id con EXACTAMENTE el texto de QC-4', () => {
    // R25 y `design.md` seccion 4.3 paso 5. Postgres se los llevo CON la columna en el UP y NO
    // vuelven solos con el `ADD COLUMN`: misma trampa que QC-52 con los CHECK de `products`.
    // Los dos textos se LEEN de la migracion de QC-4, no se copian como literal aqui.
    expect(downRestoresRoleFkAndIndexLikeQc4(downSource)).toBe(true)

    const fkDeQc4 = qc4Statement(/ADD CONSTRAINT "users_role_id_fkey"/i)
    const idxDeQc4 = qc4Statement(/^CREATE INDEX "users_role_id_idx"/i)
    expect(fkDeQc4).not.toBeNull()
    expect(idxDeQc4).not.toBeNull()
    expect(down).toContain(fkDeQc4 as string)
    expect(down).toContain(idxDeQc4 as string)

    // --- Sensibilidad: un texto PARECIDO al de QC-4 no es el de QC-4.
    const conCascade = downSource.replace(/ON DELETE RESTRICT ON UPDATE CASCADE;/, 'ON DELETE CASCADE ON UPDATE CASCADE;')
    expect(conCascade, 'la mutacion no cambio la FK').not.toBe(downSource)
    expect(downRestoresRoleFkAndIndexLikeQc4(conCascade)).toBe(false)

    const sinIndice = downSource.replace(/CREATE INDEX "users_role_id_idx" ON "users"\("role_id"\);/, '')
    expect(sinIndice, 'la mutacion no quito el indice').not.toBe(downSource)
    expect(downRestoresRoleFkAndIndexLikeQc4(sinIndice)).toBe(false)
  })

  it('borra las dos tablas nuevas en orden inverso a la FK y no toca pgcrypto', () => {
    // R25: no queda tabla, columna, indice ni restriccion residual. Los indices, las FK y la
    // RLS de las dos tablas caen CON ellas, por eso no se dropean uno a uno.
    const dropped = down
      .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(dropped).toEqual(['memberships', 'companies'])

    // `pgcrypto` NO se toca: el UP no la crea en exclusiva y otros modulos dependen de ella.
    expect(down.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })
})
