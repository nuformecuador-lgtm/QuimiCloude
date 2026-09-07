// Contrato estatico del SQL de la migracion de la empresa (QC-47).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca
// (`design.md > 2` y `> 3`): los SEIS indices unicos FUNCIONALES y PARCIALES de `users` —los
// tres que el UP recrea con la empresa dentro y los tres que el DOWN devuelve a su forma
// global—, el indice unico del nombre de empresa, el BACKFILL y su SITIO, y los ALTER de RLS.
//
// Vigila ademas los tres puntos MAS FRAGILES de la ficha:
//
//   1. LOS TRES INDICES UNICOS DE QC-4 (riesgo n.o 1). Si alguien los deja como estaban, nada
//      se pone rojo: el esquema valida, el cliente compila y la suite pasa, y la unicidad
//      sigue siendo global hasta que exista una segunda empresa. Y en el otro sentido, si el
//      `down.sql` los recrea CON `company_id`, el esquema revertido NO es el anterior (R25) y
//      el rollback termina en verde igual. Por eso los textos de referencia se LEEN del
//      `migration.sql` de QC-4 y no se copian aqui: copiarlos seria tener dos verdades que se
//      desincronizan en silencio.
//
//   2. El nombre de la empresa inicial se escribe LITERAL en el SQL porque no hay forma de
//      llamar a `INITIAL_COMPANY_NAME` ni a `normalizeCompanyName` (TypeScript) desde una
//      migracion. Este archivo importa la constante y la funcion REALES del contrato de
//      `identity` y las compara con los literales extraidos del `INSERT` (R21). Es lo unico en
//      todo el repo que se entera si las dos copias divergen — y por eso el literal
//      `QuimiCloud` NO se escribe aqui: solo `lib/modules/identity/domain/companies.ts`.
//
//   3. `prisma migrate dev --create-only` emite `DROP` de todo lo que Prisma no conoce
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
 * por una razon que no es la suya.
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
const schemaSource = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')
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
 * R23 y `design.md > 3.1` paso 10: el backfill va ANTES de los `ALTER ... ROW LEVEL SECURITY`.
 * NO es cosmetico: `FORCE` sin policies deniega TAMBIEN al dueno de la tabla cuando ese dueno
 * no es superusuario, asi que una escritura colocada despues no escribiria nada y la migracion
 * terminaria en verde sin haber metido a nadie en ninguna empresa.
 */
export function backfillSitsBeforeRowLevelSecurity(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const backfill = ejecutable.search(/INSERT\s+INTO\s+"companies"/i)
  const primerRls = ejecutable.search(/ALTER\s+TABLE\s+"?\w+"?\s+(ENABLE|FORCE)\s+ROW\s+LEVEL/i)
  if (backfill === -1 || primerRls === -1) return false
  return backfill < primerRls
}

/**
 * `design.md > 3.1` paso 6: el backfill va ANTES del `SET NOT NULL` de `company_id`. Si fuera
 * despues, el `SET NOT NULL` reventaria con 23502 sobre cualquier base con usuarios.
 */
export function backfillSitsBeforeSetNotNull(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const backfill = ejecutable.search(/UPDATE\s+"users"\s+SET\s+"company_id"/i)
  const notNull = ejecutable.search(
    /ALTER\s+TABLE\s+"users"\s+ALTER\s+COLUMN\s+"company_id"\s+SET\s+NOT\s+NULL/i,
  )
  if (backfill === -1 || notNull === -1) return false
  return backfill < notNull
}

/**
 * `design.md > 3.1` paso 9: los tres unicos nuevos van DESPUES del `SET NOT NULL`. Un indice
 * sobre una columna que todavia admite NULL trataria cada NULL como distinto y la particion
 * por empresa no significaria nada.
 */
export function newUniqueIndexesComeAfterSetNotNull(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const notNull = ejecutable.search(
    /ALTER\s+TABLE\s+"users"\s+ALTER\s+COLUMN\s+"company_id"\s+SET\s+NOT\s+NULL/i,
  )
  if (notNull === -1) return false
  return INDICES_DE_QC4.every((indice) => {
    const creacion = ejecutable.search(new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+"${indice}"`, 'i'))
    return creacion !== -1 && creacion > notNull
  })
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
 * en silencio.
 */
export function qc4Statement(pattern: RegExp): string | null {
  const found = statements(qc4Source).filter((statement) => pattern.test(statement))
  return found.length === 1 ? (found[0] as string) : null
}

/** El `CREATE UNIQUE INDEX` de QC-4 para uno de sus tres indices, leido de su archivo. */
export function qc4UniqueIndex(indice: string): string | null {
  return qc4Statement(new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i'))
}

/**
 * R16, R17, R18: la version «dentro de la empresa» del indice de QC-4. Se DERIVA del texto
 * real de QC-4 metiendole `company_id` como PRIMERA columna; no se escribe a mano. Asi, si
 * QC-4 cambiara su `lower(...)` o su `WHERE`, lo que se exige aqui cambia con el.
 */
export function expectedScopedIndex(indice: string): string | null {
  const original = qc4UniqueIndex(indice)
  if (original === null) return null
  const scoped = original.replace('ON "users" (', 'ON "users" ("company_id", ')
  return scoped === original ? null : scoped
}

/**
 * R13 y R23. ¿El SQL toca la columna del rol en alguna linea EJECUTABLE? Los comentarios
 * hablan de ella a proposito —para decir que no se toca—, asi que se quitan antes de mirar.
 */
export function touchesRoleColumn(sql: string): boolean {
  return /role_id/i.test(stripSqlComments(sql))
}

/**
 * R13. ¿El SQL nombra la FK o el indice del rol? Ni el UP ni el DOWN deben hacerlo NI SIQUIERA
 * en comentarios: que el DOWN de la primera vuelta tuviera que recrearlos a mano era el
 * sintoma del modelo equivocado.
 */
export function namesRoleConstraints(sql: string): boolean {
  return /users_role_id_fkey|users_role_id_idx/i.test(sql)
}

/**
 * R26. ¿La guardia va la PRIMERA, antes de tocar el esquema? Si va despues, su mensaje llega
 * detras del 23505 de Postgres y deja de servir para lo que existe.
 */
export function guardComesFirst(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const guardia = ejecutable.search(/DO\s+\$\$/i)
  if (guardia === -1) return false
  const ddl = ejecutable.search(/\b(ALTER|DROP|CREATE)\b/i)
  return ddl === -1 || guardia < ddl
}

/**
 * R26. ¿La guardia cuenta duplicados GLOBALES entre usuarios VIVOS de las tres claves y aborta
 * con `RAISE EXCEPTION`, sin borrar ni renombrar nada?
 */
export function guardCountsLiveDuplicatesAndRaises(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const bloque = /DO\s+\$\$([\s\S]*?)\$\$/i.exec(ejecutable)
  if (bloque === null) return false
  const cuerpo = bloque[1] as string
  const mira = [/lower\("email"\)/i, /lower\("username"\)/i, /"document_number"/i].every((clave) =>
    clave.test(cuerpo),
  )
  const soloVivos = /"deleted_at"\s+IS\s+NULL/i.test(cuerpo)
  const aborta = /RAISE\s+EXCEPTION/i.test(cuerpo) && /R26/.test(cuerpo)
  // Fallar antes que perder el dato: la guardia no puede arreglar la colision por su cuenta.
  const noEscribe = !/\b(DELETE|UPDATE|TRUNCATE)\b/i.test(cuerpo)
  return mira && soloVivos && aborta && noEscribe
}

// --- El UP: los tres indices unicos, que son el riesgo n.o 1 -------------------------------

describe('migration.sql — los tres indices unicos pasan a medirse dentro de la empresa', () => {
  it('los tres se borran y se recrean con company_id como primera columna (R16, R17, R18)', () => {
    for (const indice of INDICES_DE_QC4) {
      // El texto de referencia se LEE de QC-4, nunca se copia.
      const esperado = expectedScopedIndex(indice)
      expect(esperado, `no se pudo derivar el indice ${indice} del texto de QC-4`).not.toBeNull()
      expect(
        findStatement(up, new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i')),
        `${indice} tiene que quedar acotado a la empresa`,
      ).toBe(esperado)
      // Y antes hay que haber borrado el de QC-4: sin el DROP, el CREATE choca.
      expect(
        up.filter((statement) => new RegExp(`^DROP INDEX "${indice}"$`, 'i').test(statement)),
        `falta el DROP INDEX de ${indice}`,
      ).toHaveLength(1)
    }
    expect(INDICES_DE_QC4).toHaveLength(3)
  })

  it('conservan el lower(...) y el WHERE deleted_at IS NULL que QC-4 les dio (R19)', () => {
    // Las dos propiedades que Prisma no modela y que nadie ve desaparecer: sin `lower(...)`,
    // `Admin@x.com` convive con `admin@x.com`; sin el `WHERE`, un usuario dado de baja quema
    // su correo, su username y su documento para siempre.
    const correo = findStatement(up, /^CREATE UNIQUE INDEX "users_email_unique"/i)
    const usuario = findStatement(up, /^CREATE UNIQUE INDEX "users_username_unique"/i)
    const documento = findStatement(up, /^CREATE UNIQUE INDEX "users_document_unique"/i)
    expect(correo).toMatch(/lower\("email"\)/i)
    expect(usuario).toMatch(/lower\("username"\)/i)
    for (const indice of [correo, usuario, documento]) {
      expect(indice).toMatch(/WHERE "deleted_at" IS NULL$/i)
    }
  })

  it('se crean DESPUES del SET NOT NULL de company_id, y el test cae si se adelantan', () => {
    expect(newUniqueIndexesComeAfterSetNotNull(upSource)).toBe(true)

    // --- Sensibilidad: colar los tres CREATE por delante de todo tumba el predicado.
    const adelantados = `${INDICES_DE_QC4.map(
      (indice) => `CREATE UNIQUE INDEX "${indice}" ON "users" ("company_id");`,
    ).join('\n')}\n${upSource}`
    expect(newUniqueIndexesComeAfterSetNotNull(adelantados)).toBe(false)
  })
})

// --- El UP: el backfill --------------------------------------------------------------------

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

  it('no crea ninguna empresa si no hay ningun usuario (R20)', () => {
    // La empresa de instalacion la deja el SEED. Una empresa vacia creada por una migracion
    // es una fila que nadie pidio y que el seed tendria que reutilizar por casualidad.
    const ejecutable = stripSqlComments(upSource)
    expect(ejecutable).toMatch(/SELECT\s+count\(\*\)\s+INTO\s+\w+\s+FROM\s+"users"/i)
    expect(ejecutable).toMatch(/IF\s+\w+\s*=\s*0\s+THEN\s+RETURN/i)
  })

  it('mete a TODOS los usuarios, incluidos los dados de baja (R23)', () => {
    // Un `WHERE deleted_at IS NULL` los dejaria fuera y el `SET NOT NULL` reventaria con
    // 23502. La empresa no autoriza por si sola y el login ya filtra por `deleted_at`.
    const ejecutable = stripSqlComments(upSource)
    const update = /UPDATE\s+"users"\s+SET\s+"company_id"\s*=\s*\w+\s*(WHERE[^;]*)?;/i.exec(
      ejecutable,
    )
    expect(update, 'falta el UPDATE del backfill').not.toBeNull()
    expect((update as RegExpExecArray)[0]).not.toMatch(/"deleted_at"/i)
  })

  it('va ANTES del ROW LEVEL SECURITY y ANTES del SET NOT NULL, y cae si se mueve', () => {
    // `design.md > 3.1` pasos 5, 6 y 10.
    expect(backfillSitsBeforeRowLevelSecurity(upSource)).toBe(true)
    expect(backfillSitsBeforeSetNotNull(upSource)).toBe(true)

    // --- Sensibilidad: un ENABLE/FORCE colado por delante de todo tumba el primer predicado.
    const rlsDelante = `ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;\n${upSource}`
    expect(
      backfillSitsBeforeRowLevelSecurity(rlsDelante),
      'un backfill detras del RLS no deberia pasar',
    ).toBe(false)

    // Y un `SET NOT NULL` adelantado tumba el segundo.
    const notNullDelante = `ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL;\n${upSource}`
    expect(
      backfillSitsBeforeSetNotNull(notNullDelante),
      'un backfill detras del SET NOT NULL no deberia pasar',
    ).toBe(false)
  })
})

// --- El UP: la tabla nueva -----------------------------------------------------------------

describe('migration.sql — la tabla nueva', () => {
  it('companies queda con RLS activada Y forzada', () => {
    // R24. Sin `FORCE`, el dueno de la tabla —que es con quien se conecta Prisma— ignora la
    // RLS entera y la defensa en profundidad no defiende de nada.
    expect(hasRlsEnabledAndForced(upSource, 'companies'), 'companies sin ENABLE + FORCE').toBe(true)

    // Sensibilidad: quitar el FORCE ya no pasa.
    const sinForce = upSource.replace(/ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;/, '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'companies')).toBe(false)

    // Y quitar el ENABLE tampoco.
    const sinEnable = upSource.replace(/ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;/, '')
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'companies')).toBe(false)
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

  it('la columna de empresa entra anulable, se endurece y queda con FK RESTRICT e indice', () => {
    // R9, R10, R11 y `design.md > 1.2`. La FK con RESTRICT es la unica garantia de que borrar
    // una empresa con usuarios —vivos o de baja— falle con 23503.
    expect(findStatement(up, /^ALTER TABLE "users" ADD COLUMN "company_id"/i)).toBe(
      'ALTER TABLE "users" ADD COLUMN "company_id" UUID',
    )
    findStatement(up, /^ALTER TABLE "users" ALTER COLUMN "company_id" SET NOT NULL$/i)
    const fk = findStatement(up, /^ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey"/i)
    expect(fk).toMatch(/REFERENCES "companies"\("id"\)/i)
    expect(fk).toMatch(/ON DELETE RESTRICT ON UPDATE CASCADE$/i)
    expect(fk).not.toMatch(/ON DELETE (CASCADE|SET NULL)/i)
    findStatement(up, /^CREATE INDEX "users_company_id_idx" ON "users"\("company_id"\)$/i)
  })
})

// --- El UP: lo que NO toca -----------------------------------------------------------------

describe('migration.sql — lo que esta migracion NO toca', () => {
  it('no menciona la columna del rol fuera de los comentarios (R13, R23)', () => {
    // R23 en negativo: el rol no se mueve, no se vacia y no se reasigna, asi que no hay NADA
    // que hacer con el y ninguna linea ejecutable lo nombra.
    expect(touchesRoleColumn(upSource), 'el UP no debe tocar la columna del rol').toBe(false)

    // --- Sensibilidad: cualquier DDL sobre esa columna cae, incluso escondido al final.
    const conRol = `${upSource}\nALTER TABLE "users" DROP COLUMN "role_id";`
    expect(touchesRoleColumn(conRol), 'un DROP COLUMN del rol deberia caer').toBe(true)
    // Y un comentario que la nombre NO cae: hablar de ella para decir que no se toca vale.
    expect(touchesRoleColumn(`${upSource}\n-- role_id no se toca`)).toBe(false)
  })

  it('ni el UP ni el DOWN nombran la FK ni el indice del rol (R13)', () => {
    for (const [nombre, sql] of [
      ['migration.sql', upSource],
      ['down.sql', downSource],
    ] as const) {
      expect(namesRoleConstraints(sql), `${nombre} no debe nombrar la FK ni el indice del rol`).toBe(
        false,
      )
    }
    // Sensibilidad: recrearlos a mano —el sintoma del modelo equivocado— cae.
    expect(
      namesRoleConstraints(`${downSource}\nCREATE INDEX "users_role_id_idx" ON "users"("role_id");`),
    ).toBe(true)
  })

  it('crea UNA sola tabla, y es la empresa: no hay tabla intermedia (R12)', () => {
    // R12 en positivo, que es la unica forma de afirmarlo sin dejar escrito en el repo el
    // nombre del modelo muerto: la primera vuelta de la ficha creaba una tabla intermedia
    // entre usuario y empresa; ahora la empresa es UNA COLUMNA del usuario y esta migracion
    // crea exactamente una tabla. Una segunda tabla aqui es el modelo de muchos a muchos
    // volviendo por la puerta de atras.
    const creadas = up
      .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(creadas, 'esta migracion crea exactamente la tabla de la empresa').toEqual(['companies'])

    // Y la unica FK que anade sale de `users` hacia `companies`: ninguna tercera tabla la usa.
    const fks = up.filter((statement) => /ADD CONSTRAINT .*FOREIGN KEY/i.test(statement))
    expect(fks).toHaveLength(1)
    expect(fks[0]).toMatch(/^ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey"/i)
  })

  it('no ejecuta DDL sobre ninguna tabla de otro modulo', () => {
    // `design.md > 3.1`: Prisma genera `DROP CONSTRAINT` sobre las FK escritas a mano de
    // `orders`, `products`, `recipe_lines`, `recipes`, `supplier_catalog_lines` y `suppliers`.
    // Se borran a mano. Aqui se afirma que no volvieron, y no solo como `ALTER TABLE`.
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
      'roles',
    ]
    for (const tabla of ajenas) {
      const ddl = up.filter((statement) =>
        new RegExp(
          `^(ALTER TABLE|DROP TABLE|CREATE TABLE|TRUNCATE)\\s+(IF EXISTS )?"?${tabla}"?\\b|` +
            `^(CREATE|DROP)( UNIQUE)? INDEX .*\\bON "?${tabla}"?\\b`,
          'i',
        ).test(statement),
      )
      expect(ddl, `esta migracion no debe tocar ${tabla}`).toEqual([])
    }
    // Y `pgcrypto` se declara autocontenida, sin borrar la de nadie.
    expect(findStatement(up, /^CREATE EXTENSION/i)).toBe('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  })

  it('los tres indices unicos de users siguen declarados en la migracion de QC-4', () => {
    // El mecanismo con el que se compara el `down.sql` contra el texto LITERAL de QC-4 (R25):
    // los tres se LEEN de su migracion, nunca se copian aqui como literal. Si QC-4 dejara de
    // declararlos, todo lo que se afirma abajo se quedaria sin referencia y hay que enterarse.
    for (const indice of INDICES_DE_QC4) {
      expect(qc4UniqueIndex(indice), `QC-4 ya no declara ${indice}`).not.toBeNull()
    }
  })
})

// --- El esquema ----------------------------------------------------------------------------

describe('db/schema.prisma — el dueno del modelo nuevo', () => {
  it('Company declara /// @module identity (R27)', () => {
    // Decision cerrada 16: la empresa cuelga del usuario y el usuario es de `identity`. Un
    // modelo sin dueno —o con otro— es un hallazgo de
    // `tests/guards/guard-arquitectura-modulos.test.ts`.
    expect(schemaSource.replace(/\r\n/g, '\n')).toContain('/// @module identity\nmodel Company {')
  })
})

// --- El DOWN -------------------------------------------------------------------------------

describe('down.sql — la reversion', () => {
  it('empieza por la guardia de R26, antes de tocar el esquema', () => {
    expect(guardComesFirst(downSource), 'la guardia de R26 tiene que ir la primera').toBe(true)
    expect(
      guardCountsLiveDuplicatesAndRaises(downSource),
      'la guardia tiene que contar duplicados vivos de las tres claves y abortar',
    ).toBe(true)

    // --- Sensibilidad: cualquier DDL por delante de la guardia la deja de ser la primera.
    const ddlDelante = `DROP INDEX "users_email_unique";\n${downSource}`
    expect(guardComesFirst(ddlDelante), 'un DDL por delante de la guardia deberia caer').toBe(false)

    // Y una guardia que «arregle» la colision borrando filas es justo lo que R26 prohibe.
    const queBorra = downSource.replace(
      /IF duplicados > 0 THEN/i,
      'IF duplicados > 0 THEN DELETE FROM "users";',
    )
    expect(queBorra, 'la mutacion no metio el DELETE').not.toBe(downSource)
    expect(guardCountsLiveDuplicatesAndRaises(queBorra)).toBe(false)
  })

  it('devuelve los tres indices unicos al TEXTO LITERAL de QC-4 (R25)', () => {
    for (const indice of INDICES_DE_QC4) {
      const original = qc4UniqueIndex(indice)
      expect(original, `QC-4 ya no declara ${indice}`).not.toBeNull()
      expect(
        findStatement(down, new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i')),
        `${indice} tiene que volver EXACTAMENTE como lo dejo QC-4`,
      ).toBe(original)
      expect(
        down.filter((statement) => new RegExp(`^DROP INDEX "${indice}"$`, 'i').test(statement)),
        `falta el DROP INDEX de ${indice}`,
      ).toHaveLength(1)
    }

    // El error silencioso que esto vigila: si el DOWN los recrea CON `company_id`, el esquema
    // revertido NO es el anterior y R25 es falso, pero el rollback termina en verde.
    for (const indice of INDICES_DE_QC4) {
      expect(
        findStatement(down, new RegExp(`^CREATE UNIQUE INDEX "${indice}"`, 'i')),
        `${indice} del DOWN no puede seguir acotado a la empresa`,
      ).not.toBe(expectedScopedIndex(indice))
    }
  })

  it('quita el indice, la FK y la columna de empresa, en ese orden', () => {
    // R25: no queda columna ni restriccion residual.
    findStatement(down, /^DROP INDEX "users_company_id_idx"$/i)
    findStatement(down, /^ALTER TABLE "users" DROP CONSTRAINT "users_company_id_fkey"$/i)
    findStatement(down, /^ALTER TABLE "users" DROP COLUMN "company_id"$/i)
    const posicion = (pattern: RegExp): number => down.findIndex((s) => pattern.test(s))
    expect(posicion(/^DROP INDEX "users_company_id_idx"$/i)).toBeLessThan(
      posicion(/^ALTER TABLE "users" DROP CONSTRAINT/i),
    )
    expect(posicion(/^ALTER TABLE "users" DROP CONSTRAINT/i)).toBeLessThan(
      posicion(/^ALTER TABLE "users" DROP COLUMN/i),
    )
  })

  it('borra la empresa la ultima y no toca pgcrypto', () => {
    // R25: no queda tabla, columna, indice ni restriccion residual. El indice unico del
    // nombre y la RLS de la tabla caen CON ella, por eso no se dropean uno a uno.
    const dropped = down
      .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(dropped).toEqual(['companies'])

    // `pgcrypto` NO se toca: el UP no la crea en exclusiva y otros modulos dependen de ella.
    expect(down.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })
})
