// T3 — Contrato estatico del SQL de la migracion del registro de sesiones (QC-23).
//
// Cubre R41 (identificadores en ingles snake_case), R42 (RLS activada Y forzada, sin ninguna
// policy), R43 (el `down.sql` revierte EXACTAMENTE lo que crea el UP y nada mas), R44 (la tabla
// no lleva columna de empresa), R45 (`created_at` si, `updated_at` y `deleted_at` no) y R7 (el
// sello nace NOT NULL con DEFAULT, que es lo que rellena las filas que ya existen).
//
// Lo que se vigila aqui NO lo regenera Prisma nunca y NO lo ve ninguna otra prueba:
//
//   1. LOS DOS `ALTER ... ROW LEVEL SECURITY` (R42). Prisma no modela RLS. Sin `FORCE`, el
//      dueno de la tabla —que es con quien se conecta Prisma— ignora la RLS entera y la
//      defensa en profundidad no defiende de nada.
//   2. QUE ESTA MIGRACION NO SE LLEVE POR DELANTE NADA DE `users`. Es el riesgo real de esta
//      ficha y no lo era de QC-79: esta migracion SI TOCA `users` —le anade la columna del
//      sello—, asi que `prisma migrate dev --create-only` emite ademas los `DROP CONSTRAINT` y
//      `DROP INDEX` del drift ya conocido del repo (los tres indices unicos FUNCIONALES de
//      QC-4/QC-47, la FK de auditoria de QC-65, el indice PARCIAL de QC-79). Un
//      `DROP INDEX "users_email_unique"` colado aqui pasaria el typecheck, pasaria la suite y
//      se llevaria la unicidad del correo EN SILENCIO. Solo se entera este archivo.
//   3. QUE EL DOWN CUBRA TODO LO QUE EL UP CREA (R43). Un DOWN incompleto no falla: deja la
//      base con restos y el rollback termina en verde.
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una copia MUTADA EN MEMORIA.
// Sin la segunda mitad, media docena de estas afirmaciones serian `expect(false)` disfrazados
// sobre un archivo que nunca dijo esa palabra.

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
const sessionRevocationDirs = readdirSync(migrationsDir).filter((name) =>
  /_session_revocation$/.test(name),
)
expect(
  sessionRevocationDirs,
  'debe existir exactamente una migracion del registro de sesiones',
).toHaveLength(1)
const migrationDir = join(migrationsDir, sessionRevocationDirs[0] as string)

// --- Lectura y troceado del SQL ------------------------------------------------------------

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. La
 * cabecera de esta migracion nombra a proposito `users_email_unique` y compania —para dejar
 * escrito que NO se tocan—, asi que mirar el texto crudo daria falsos positivos en TODAS las
 * afirmaciones en negativo de mas abajo.
 */
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

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8')
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n')
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
}

// --- Predicados puros: columnas y clave foranea ---------------------------------------------

/**
 * Las columnas declaradas por un `CREATE TABLE`, con su definicion literal. El troceado
 * respeta los parentesis: `TIMESTAMPTZ(6)` y `PRIMARY KEY ("a","b")` llevan comas y parentesis
 * dentro, y partir por comas a secas los rompe.
 */
export function tableColumns(sql: string, table: string): ReadonlyMap<string, string> {
  const columnas = new Map<string, string>()
  const create = statements(sql).find((statement) =>
    new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?"?${table}"?\\s*\\(`, 'i').test(statement),
  )
  if (create === undefined) return columnas
  const cuerpo = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'))
  const partes: string[] = []
  let profundidad = 0
  let actual = ''
  for (const caracter of cuerpo) {
    if (caracter === '(') profundidad += 1
    if (caracter === ')') profundidad -= 1
    if (caracter === ',' && profundidad === 0) {
      partes.push(actual)
      actual = ''
      continue
    }
    actual += caracter
  }
  partes.push(actual)
  for (const parte of partes) {
    const definicion = parte.trim()
    const nombre = /^"([^"]+)"/.exec(definicion)
    // Las lineas de `CONSTRAINT ... PRIMARY KEY (...)` no empiezan por comilla: no son columnas.
    if (nombre !== null) columnas.set(nombre[1] as string, definicion)
  }
  return columnas
}

/** Una `ADD CONSTRAINT ... FOREIGN KEY` tal como esta ESCRITA en el SQL. */
export interface ClaveForanea {
  readonly tabla: string
  readonly columnas: readonly string[]
  readonly tablaReferenciada: string
  readonly columnasReferenciadas: readonly string[]
  readonly onDelete: string | null
  readonly onUpdate: string | null
}

/** Lee del SQL la clave foranea con ese nombre, o `null` si no esta declarada. */
export function foreignKey(sql: string, name: string): ClaveForanea | null {
  const patron = new RegExp(
    `^ALTER TABLE "?(\\w+)"? ADD CONSTRAINT "${name}" FOREIGN KEY \\(([^)]*)\\) ` +
      `REFERENCES "?(\\w+)"?\\s*\\(([^)]*)\\)(.*)$`,
    'i',
  )
  const encontrados = statements(sql)
    .map((statement) => patron.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
  if (encontrados.length !== 1) return null
  const match = encontrados[0] as RegExpExecArray
  const identificadores = (lista: string): readonly string[] =>
    [...lista.matchAll(/"(\w+)"/g)].map((columna) => columna[1] as string)
  const cola = match[5] as string
  const accion = (evento: string): string | null => {
    const found = new RegExp(
      `ON ${evento} (CASCADE|RESTRICT|SET NULL|SET DEFAULT|NO ACTION)`,
      'i',
    ).exec(cola)
    return found === null ? null : (found[1] as string).toUpperCase()
  }
  return {
    tabla: match[1] as string,
    columnas: identificadores(match[2] as string),
    tablaReferenciada: match[3] as string,
    columnasReferenciadas: identificadores(match[4] as string),
    onDelete: accion('DELETE'),
    onUpdate: accion('UPDATE'),
  }
}

// --- Predicados puros: RLS, policies y DDL ajeno --------------------------------------------

/** R42. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
export function hasRlsEnabledAndForced(sql: string, table: string): boolean {
  const source = statements(sql)
  const enable = new RegExp(`^ALTER TABLE "?${table}"? ENABLE ROW LEVEL SECURITY$`, 'i')
  const force = new RegExp(`^ALTER TABLE "?${table}"? FORCE ROW LEVEL SECURITY$`, 'i')
  return (
    source.some((statement) => enable.test(statement)) &&
    source.some((statement) => force.test(statement))
  )
}

/**
 * R42. ¿Los `ALTER ... ROW LEVEL SECURITY` son el ULTIMO bloque del archivo? NO es cosmetico:
 * `FORCE` sin policies deniega tambien al dueno de la tabla cuando ese dueno no es
 * superusuario, asi que cualquier escritura futura colocada detras de ellos podria no escribir
 * nada EN SILENCIO (leccion de QC-32 y QC-74).
 */
export function rowLevelSecurityGoesLast(sql: string): boolean {
  const source = statements(sql)
  const esRls = (statement: string): boolean => /ROW LEVEL SECURITY$/i.test(statement)
  const primera = source.findIndex(esRls)
  if (primera === -1) return false
  return source.slice(primera).every(esRls)
}

/**
 * R42. Toda sentencia que declare una POLICY. Tiene que quedar vacia: una policy no cuenta
 * como permiso implementado —Prisma se conecta como dueno y no setea `auth.uid()`— y tenerla
 * aqui daria la falsa impresion de que la autorizacion vive en la base y no en el service.
 */
export function policyStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /\bPOLICY\b/i.test(statement))
}

/** DDL cuyo SUJETO es esa tabla: `ALTER/CREATE/DROP TABLE`, `TRUNCATE` o un indice sobre ella. */
export function ddlStatementsOn(sql: string, table: string): readonly string[] {
  const patron = new RegExp(
    `^(ALTER TABLE|DROP TABLE|CREATE TABLE|TRUNCATE)\\s+(IF EXISTS )?(ONLY )?"?${table}"?\\b|` +
      `^(CREATE|DROP)( UNIQUE)? INDEX .*\\bON "?${table}"?\\b`,
    'i',
  )
  return statements(sql).filter((statement) => patron.test(statement))
}

/** Sentencias EJECUTABLES que nombran ese identificador, sea como sujeto o dentro de otro nombre. */
export function statementsMentioning(sql: string, needle: string): readonly string[] {
  return statements(sql).filter((statement) => new RegExp(needle, 'i').test(statement))
}

/**
 * Toda sentencia que DESTRUYE algo: `DROP INDEX`, `DROP CONSTRAINT`, `DROP TABLE`,
 * `DROP COLUMN`. En el UP tiene que quedar vacia: esta migracion solo anade. Es exactamente la
 * forma del ruido de drift que `migrate dev --create-only` emite al tocar `users`.
 */
export function destructiveStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /\bDROP\s+(INDEX|CONSTRAINT|TABLE|COLUMN)\b/i.test(statement),
  )
}

/**
 * R43. ¿El SQL escribe alguna fila? `ON DELETE`/`ON UPDATE` no cuentan: son parte de la
 * definicion de una clave foranea, no escrituras.
 */
export function writesRows(sql: string): boolean {
  const ejecutable = stripSqlComments(sql).replace(/\s+/g, ' ')
  return /(?<!ON )\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(ejecutable)
}

/** Identificadores que CREA la migracion: tablas, columnas, indices y restricciones. */
export function createdIdentifiers(source: readonly string[]): readonly string[] {
  const nombres = new Set<string>()
  for (const statement of source) {
    if (/^CREATE TABLE/i.test(statement)) {
      for (const match of statement.matchAll(/"([^"]+)"/g)) nombres.add(match[1] as string)
      continue
    }
    const columna = /^ALTER TABLE "?\w+"? ADD COLUMN "([^"]+)"/i.exec(statement)
    if (columna !== null) nombres.add(columna[1] as string)
    const constraint = /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    if (constraint !== null) nombres.add(constraint[1] as string)
    const index = /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement)
    if (index !== null) nombres.add(index[1] as string)
  }
  return [...nombres]
}

// --- Predicado puro: el DOWN cubre todo lo que el UP crea (R43) ------------------------------

/** Una columna anadida a una tabla que YA existia, o quitada de ella. */
export interface ColumnaDeTablaAjena {
  readonly tabla: string
  readonly columna: string
}

/** `CREATE TABLE "x"` → `x`. */
export function tablesCreatedBy(sql: string): readonly string[] {
  return statements(sql)
    .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** `DROP TABLE [IF EXISTS] "x"` → `x`. */
export function tablesDroppedBy(sql: string): readonly string[] {
  return statements(sql)
    .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

function columnasPorAccion(sql: string, accion: 'ADD' | 'DROP'): readonly ColumnaDeTablaAjena[] {
  const patron = new RegExp(
    `^ALTER TABLE "?(\\w+)"? ${accion} COLUMN (?:IF (?:NOT )?EXISTS )?"([^"]+)"`,
    'i',
  )
  return statements(sql)
    .map((statement) => patron.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ tabla: match[1] as string, columna: match[2] as string }))
}

/** Columnas que el SQL AÑADE a una tabla que ya existia. */
export function columnsAddedBy(sql: string): readonly ColumnaDeTablaAjena[] {
  return columnasPorAccion(sql, 'ADD')
}

/** Columnas que el SQL QUITA de una tabla que sigue existiendo. */
export function columnsDroppedBy(sql: string): readonly ColumnaDeTablaAjena[] {
  return columnasPorAccion(sql, 'DROP')
}

/**
 * R43. Lo que el UP crea y el DOWN NO deshace. Tiene que salir VACIO.
 *
 * Los indices, la clave primaria y la FK de una tabla que el DOWN borra SI cuentan como
 * cubiertos: se caen con ella, y escribirlos explicitamente falla —un `DROP INDEX` sobre una
 * tabla que ya no existe revienta—. Lo que no se cubre solo es lo que cuelga de una tabla
 * PREEXISTENTE, que aqui es exactamente la columna del sello sobre `users`.
 */
export function upObjectsNotCoveredByDown(upSql: string, downSql: string): readonly string[] {
  const tablasCreadas = tablesCreatedBy(upSql)
  const tablasBorradas = new Set(tablesDroppedBy(downSql))
  const columnasQuitadas = new Set(
    columnsDroppedBy(downSql).map(({ tabla, columna }) => `${tabla}.${columna}`),
  )
  const pendientes: string[] = []
  for (const tabla of tablasCreadas) {
    if (!tablasBorradas.has(tabla)) pendientes.push(`tabla ${tabla}`)
  }
  for (const { tabla, columna } of columnsAddedBy(upSql)) {
    if (tablasBorradas.has(tabla)) continue
    if (!columnasQuitadas.has(`${tabla}.${columna}`)) pendientes.push(`columna ${tabla}.${columna}`)
  }
  // Indices y restricciones: cubiertos si cuelgan de una tabla que el DOWN borra, o si el DOWN
  // los borra por su nombre.
  const nombradosEnDown = new Set(
    statements(downSql).flatMap((statement) =>
      [...statement.matchAll(/"([^"]+)"/g)].map((match) => match[1] as string),
    ),
  )
  for (const statement of statements(upSql)) {
    const nombre =
      /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement) ??
      /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    if (nombre === null) continue
    const sujeto = /\bON "?(\w+)"?\s*\(|^ALTER TABLE "?(\w+)"?/i.exec(statement)
    const tabla = sujeto === null ? '' : ((sujeto[1] ?? sujeto[2]) as string)
    if (tablasBorradas.has(tabla)) continue
    if (!nombradosEnDown.has(nombre[1] as string)) pendientes.push(`objeto ${nombre[1] as string}`)
  }
  return pendientes
}

// --- Predicado puro: el idioma de los identificadores (R41) ----------------------------------

/**
 * Vocabulario ingles admitido para los identificadores de esta feature (R41). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista. Es una lista
 * cerrada a proposito, con el precedente de `credential-setup-migration.test.ts`: una columna
 * nueva obliga a pasar por aqui, y una en espanol (`sesiones`, `sello`, `valido`) no encuentra
 * sus piezas y cae. Un patron `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'created',
  'expires',
  'from',
  'id',
  'idx',
  'key',
  'pkey',
  'revoked',
  'session',
  'sessions',
  'user',
  'valid',
  'fkey',
])

/** R41. ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? */
export function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

// --- Predicados puros: el esquema de Prisma --------------------------------------------------

/** El cuerpo de un `model` del esquema, sin sus comentarios `//`, o `null` si no existe. */
export function modelBody(schema: string, model: string): string | null {
  const match = new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) return null
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * El modulo declarado JUSTO ENCIMA del modelo, o `null` si no lo tiene. Se lee del texto
 * CRUDO: `/// @module` ES un comentario, y es justo lo que se vigila.
 */
export function moduleOwnerOf(schema: string, model: string): string | null {
  const match = new RegExp(`/// @module (\\w+)\\n(?:///[^\\n]*\\n)*model ${model} \\{`).exec(schema)
  return match === null ? null : (match[1] as string)
}

// === El UP: el sello sobre `users` ==========================================================

describe('migration.sql — el sello nace obligatorio y con valor para las filas que ya existen', () => {
  it('anade `users.sessions_valid_from` NOT NULL con DEFAULT, y eso ES el backfill (R7)', () => {
    // `design.md > 2.1`: una columna NOT NULL sobre una tabla con filas necesita un DEFAULT o
    // la migracion no aplica. Ese DEFAULT rellena las existentes con el instante del
    // despliegue, que es el efecto aceptado por escrito (consecuencia declarada 1).
    expect(findStatement(up, /ADD COLUMN "sessions_valid_from"/i)).toBe(
      'ALTER TABLE "users" ADD COLUMN "sessions_valid_from" TIMESTAMPTZ(6) NOT NULL ' +
        'DEFAULT CURRENT_TIMESTAMP',
    )
  })

  it('SENSIBILIDAD — sin el NOT NULL o sin el DEFAULT, el sello deja de ser una garantia', () => {
    // Una columna anulable convierte «toda fila de usuario tiene sello» (R7) en «casi toda», y
    // el corte del dominio tendria que decidir que hacer con un NULL: el agujero se abre en el
    // esquema, no en el codigo.
    const anulable = upSource.replace(
      '"sessions_valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      '"sessions_valid_from" TIMESTAMPTZ(6)',
    )
    expect(anulable, 'la mutacion no quito el NOT NULL').not.toBe(upSource)
    expect(columnsAddedBy(anulable)).toEqual([{ tabla: 'users', columna: 'sessions_valid_from' }])
    expect(
      statements(anulable).filter((s) =>
        /ADD COLUMN "sessions_valid_from" TIMESTAMPTZ\(6\) NOT NULL/i.test(s),
      ),
    ).toEqual([])

    // Y borrar la linea entera tambien: sin columna no hay sello y R7 muere en silencio.
    const sinColumna = upSource.replace(/ALTER TABLE "users" ADD COLUMN[^;]*;/, '')
    expect(sinColumna, 'la mutacion no quito el ADD COLUMN').not.toBe(upSource)
    expect(columnsAddedBy(sinColumna)).toEqual([])
  })

  it('el UP toca `users` en UNA sola sentencia, y es esa (R7)', () => {
    // Todo lo demas que `migrate dev` sabe emitir sobre `users` es ruido de drift.
    expect(ddlStatementsOn(upSource, 'users')).toEqual([
      'ALTER TABLE "users" ADD COLUMN "sessions_valid_from" TIMESTAMPTZ(6) NOT NULL ' +
        'DEFAULT CURRENT_TIMESTAMP',
    ])
  })

  it('no crea ningun indice sobre el sello: nunca se filtra por esa columna (design.md > 2.1)', () => {
    expect(statementsMentioning(upSource, 'sessions_valid_from').filter((s) => /INDEX/i.test(s))).toEqual(
      [],
    )
    // Sensibilidad: un indice colado cae.
    const conIndice = `${upSource}\nCREATE INDEX "users_sessions_valid_from_idx" ON "users"("sessions_valid_from");`
    expect(
      statementsMentioning(conIndice, 'sessions_valid_from').filter((s) => /INDEX/i.test(s)),
    ).toHaveLength(1)
  })
})

// === El UP: la tabla del registro y sus columnas ============================================

describe('migration.sql — el UP crea `revoked_sessions` y ninguna otra tabla', () => {
  it('crea exactamente una tabla y no declara ninguna extension', () => {
    expect(tablesCreatedBy(upSource)).toEqual(['revoked_sessions'])
    // `pgcrypto` ya existe y medio repo depende de ella: declararla aqui seria ruido.
    expect(up.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })

  it('declara exactamente las seis columnas del diseno, sin empresa y sin updated_at (R44, R45)', () => {
    const columnas = tableColumns(upSource, 'revoked_sessions')
    expect([...columnas.keys()]).toEqual([
      'id',
      'session_id',
      'user_id',
      'expires_at',
      'revoked_at',
      'created_at',
    ])
    // R44: la empresa de una sesion cerrada es, por definicion, la de su persona.
    expect(columnas.has('company_id')).toBe(false)
    // R45: la fila es un hecho inmutable; la unica escritura posterior es el borrado FISICO de
    // la purga, asi que un `deleted_at` seria una mentira y un `updated_at` no cambiaria nunca.
    expect(columnas.has('updated_at')).toBe(false)
    expect(columnas.has('deleted_at')).toBe(false)

    // Sensibilidad: anadir la columna de empresa cae. La afirmacion de arriba no es un
    // `expect(false)` disfrazado sobre un archivo que nunca menciona `company_id`.
    const conEmpresa = upSource.replace(
      '"user_id" UUID NOT NULL,',
      '"user_id" UUID NOT NULL,\n    "company_id" UUID NOT NULL,',
    )
    expect(conEmpresa, 'la mutacion no anadio company_id').not.toBe(upSource)
    expect(tableColumns(conEmpresa, 'revoked_sessions').has('company_id')).toBe(true)
  })

  it('las cinco columnas de negocio son obligatorias y los dos identificadores son UUID', () => {
    // `session_id` es UUID y no TEXT porque el `sid` del token se valida con `z.string().uuid()`
    // (R6) y acaba comparandose contra esta columna: los dos lados tienen que ser el mismo tipo.
    const columnas = tableColumns(upSource, 'revoked_sessions')
    expect(columnas.get('id')).toBe('"id" UUID NOT NULL DEFAULT gen_random_uuid()')
    expect(columnas.get('session_id')).toBe('"session_id" UUID NOT NULL')
    expect(columnas.get('user_id')).toBe('"user_id" UUID NOT NULL')
    // La caducidad NATURAL del token cerrado: es lo que hace posible la purga de R39.
    expect(columnas.get('expires_at')).toBe('"expires_at" TIMESTAMPTZ(6) NOT NULL')
    expect(columnas.get('revoked_at')).toBe('"revoked_at" TIMESTAMPTZ(6) NOT NULL')
    expect(columnas.get('created_at')).toBe(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    )

    // Sensibilidad: una caducidad anulable deja una fila que la purga no puede borrar nunca...
    const caducidadAnulable = upSource.replace(
      '"expires_at" TIMESTAMPTZ(6) NOT NULL,',
      '"expires_at" TIMESTAMPTZ(6),',
    )
    expect(caducidadAnulable, 'la mutacion no quito el NOT NULL').not.toBe(upSource)
    expect(tableColumns(caducidadAnulable, 'revoked_sessions').get('expires_at')).toBe(
      '"expires_at" TIMESTAMPTZ(6)',
    )
    // ...y un `session_id` TEXT rompe la comparacion contra el `sid` del token.
    const sidTexto = upSource.replace('"session_id" UUID NOT NULL,', '"session_id" TEXT NOT NULL,')
    expect(sidTexto, 'la mutacion no cambio el tipo').not.toBe(upSource)
    expect(tableColumns(sidTexto, 'revoked_sessions').get('session_id')).toMatch(/TEXT/)
  })

  it('no escribe ni una fila: la tabla nace vacia (R40)', () => {
    expect(writesRows(upSource)).toBe(false)
    // Sensibilidad: el predicado no confunde el `ON DELETE`/`ON UPDATE` de una FK con una
    // escritura...
    expect(
      writesRows(
        'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "u"("a") ' +
          'ON DELETE RESTRICT ON UPDATE CASCADE;',
      ),
    ).toBe(false)
    // ...pero si ve un backfill colado al final.
    expect(
      writesRows(`${upSource}\nINSERT INTO "revoked_sessions" ("user_id") VALUES ('x');`),
    ).toBe(true)
  })
})

// === El UP: los dos indices, que SON los requisitos =========================================

describe('migration.sql — los dos indices con su nombre exacto (R11, R12, R39)', () => {
  it('el unico de `session_id` ES R11 y R12', () => {
    // La comprobacion por peticion es UNA busqueda por indice unico (design.md > 4), y
    // registrar dos veces el mismo cierre choca con 23505 y se traduce a «ya estaba».
    expect(findStatement(up, /^CREATE UNIQUE INDEX "revoked_sessions_session_id_key"/i)).toBe(
      'CREATE UNIQUE INDEX "revoked_sessions_session_id_key" ON "revoked_sessions"("session_id")',
    )
  })

  it('el compuesto `(user_id, expires_at)` ES R39', () => {
    // La purga es un `DELETE ... WHERE user_id = ? AND expires_at <= ?` acotado a UNA persona:
    // sin este indice recorreria la tabla entera en cada cierre de sesion.
    expect(findStatement(up, /^CREATE INDEX "revoked_sessions_user_id_expires_at_idx"/i)).toBe(
      'CREATE INDEX "revoked_sessions_user_id_expires_at_idx" ON "revoked_sessions"' +
        '("user_id", "expires_at")',
    )
  })

  it('el UP crea exactamente esos dos indices, en ese orden', () => {
    const indices = up
      .map((statement) => /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(indices).toEqual([
      'revoked_sessions_session_id_key',
      'revoked_sessions_user_id_expires_at_idx',
    ])
  })

  it('SENSIBILIDAD — quitarle el UNIQUE al de `session_id` deja R12 sin base', () => {
    // Sin la unicidad, el segundo cierre del mismo `sid` inserta una SEGUNDA fila en vez de
    // chocar con 23505: R12 muere y nada mas en el repo se entera.
    const noUnico = upSource.replace(
      'CREATE UNIQUE INDEX "revoked_sessions_session_id_key"',
      'CREATE INDEX "revoked_sessions_session_id_key"',
    )
    expect(noUnico, 'la mutacion no quito el UNIQUE').not.toBe(upSource)
    expect(
      statements(noUnico).filter((s) =>
        /^CREATE UNIQUE INDEX "revoked_sessions_session_id_key"/i.test(s),
      ),
    ).toEqual([])

    // Y borrar cualquiera de los dos indices enteros tambien cae.
    for (const indice of [
      'revoked_sessions_session_id_key',
      'revoked_sessions_user_id_expires_at_idx',
    ]) {
      const sinIndice = upSource.replace(
        new RegExp(`CREATE (?:UNIQUE )?INDEX "${indice}"[^;]*;`),
        '',
      )
      expect(sinIndice, `la mutacion no quito ${indice}`).not.toBe(upSource)
      expect(statementsMentioning(sinIndice, indice)).toEqual([])
    }
  })
})

// === El UP: la clave foranea ================================================================

describe('migration.sql — la sesion cerrada cuelga del usuario, y borrarlo a lo bruto hace ruido', () => {
  it('la FK apunta a users con RESTRICT en el borrado y CASCADE en la actualizacion', () => {
    // `design.md > 2.2`: el borrado de usuario es LOGICO (QC-66 R37), asi que en operacion
    // normal no se dispara; un borrado fisico con filas colgando tiene que ser ruidoso.
    const fk = foreignKey(upSource, 'revoked_sessions_user_id_fkey')
    expect(fk?.tabla).toBe('revoked_sessions')
    expect(fk?.columnas).toEqual(['user_id'])
    expect(fk?.tablaReferenciada).toBe('users')
    expect(fk?.columnasReferenciadas).toEqual(['id'])
    expect(fk?.onDelete).toBe('RESTRICT')
    expect(fk?.onUpdate).toBe('CASCADE')
  })

  it('SENSIBILIDAD — cambiar el RESTRICT por CASCADE, o quitar la FK, lo tumba', () => {
    const conCascade = upSource.replace(
      'REFERENCES "users"("id") ON DELETE RESTRICT',
      'REFERENCES "users"("id") ON DELETE CASCADE',
    )
    expect(conCascade, 'la mutacion no cambio el ON DELETE').not.toBe(upSource)
    expect(foreignKey(conCascade, 'revoked_sessions_user_id_fkey')?.onDelete).toBe('CASCADE')

    const sinFk = upSource.replace(
      /ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_user_id_fkey"[^;]*;/,
      '',
    )
    expect(sinFk, 'la mutacion no quito la FK').not.toBe(upSource)
    expect(foreignKey(sinFk, 'revoked_sessions_user_id_fkey')).toBeNull()
  })
})

// === El UP: la RLS (R42) ====================================================================

describe('migration.sql — la tabla nace con RLS activada y forzada, y sin ninguna policy', () => {
  it('queda con ENABLE y con FORCE (R42)', () => {
    expect(hasRlsEnabledAndForced(upSource, 'revoked_sessions')).toBe(true)
  })

  it('SENSIBILIDAD — sin el FORCE, el dueno de la tabla ignora la RLS entera', () => {
    // Prisma se conecta como dueno y Postgres NO le aplica RLS salvo `FORCE`
    // (`docs/architecture.md > Acceso a datos y autorizacion`). Quitarlo deja la defensa en
    // profundidad sin defender nada, y ningun otro test del repo se entera.
    const sinForce = upSource.replace(
      'ALTER TABLE "revoked_sessions" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'revoked_sessions')).toBe(false)

    // Y quitar el ENABLE tambien: son las dos mitades de la misma cosa.
    const sinEnable = upSource.replace(
      'ALTER TABLE "revoked_sessions" ENABLE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'revoked_sessions')).toBe(false)
  })

  it('no declara ninguna policy: la autorizacion vive en el service (R42, R27)', () => {
    expect(policyStatements(upSource)).toEqual([])
    expect(policyStatements(downSource)).toEqual([])
    // Sensibilidad: una policy colada al final cae. Una policy NO cuenta como permiso
    // implementado y tenerla aqui daria la falsa impresion de que si.
    const conPolicy = `${upSource}\nCREATE POLICY "p" ON "revoked_sessions" USING (true);`
    expect(policyStatements(conPolicy)).toHaveLength(1)
  })

  it('los ALTER de RLS son el ultimo bloque del archivo, y mover cualquier DDL detras lo tumba', () => {
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)

    const rlsArriba = `ALTER TABLE "revoked_sessions" ENABLE ROW LEVEL SECURITY;\n${upSource}`
    expect(rowLevelSecurityGoesLast(rlsArriba), 'un RLS al principio deberia caer').toBe(false)

    const ddlDetras = `${upSource}\nCREATE INDEX "revoked_sessions_revoked_at_idx" ON "revoked_sessions"("revoked_at");`
    expect(rowLevelSecurityGoesLast(ddlDetras)).toBe(false)
  })
})

// === El UP: lo que NO se lleva por delante ==================================================

describe('migration.sql — esta migracion toca users, y no destruye NADA suyo', () => {
  it('el UP no contiene ni un solo DROP: solo anade', () => {
    // Es exactamente la forma del ruido que `prisma migrate dev --create-only` emite por el
    // drift del repo. Un `DROP` aqui pasaria el typecheck y la suite entera.
    expect(destructiveStatements(upSource)).toEqual([])

    // Sensibilidad: los tres casos reales que este test existe para cazar.
    expect(
      destructiveStatements(`${upSource}\nDROP INDEX "users_email_unique";`),
    ).toHaveLength(1)
    expect(
      destructiveStatements(
        `${upSource}\nALTER TABLE "users" DROP CONSTRAINT "users_account_status_changed_by_fkey";`,
      ),
    ).toHaveLength(1)
    expect(
      destructiveStatements(`${upSource}\nALTER TABLE "users" DROP COLUMN "password_hash";`),
    ).toHaveLength(1)
  })

  it('no menciona ninguno de los indices que solo existen escritos a mano', () => {
    // Los tres unicos de `users` son FUNCIONALES (`lower(...)`) y PARCIALES, y el de QC-79 es
    // parcial: los cuatro son DRIFT para Prisma. Un `DROP INDEX` por drift colado aqui borraria
    // la unicidad del correo, del nombre de usuario y del documento EN SILENCIO.
    for (const objeto of [
      'users_email_unique',
      'users_username_unique',
      'users_document_unique',
      'users_account_status_changed_by_fkey',
      'credential_setup_tokens_one_live_per_user',
    ]) {
      expect(statementsMentioning(upSource, objeto), `no debe mencionar ${objeto}`).toEqual([])
      expect(statementsMentioning(downSource, objeto), `el DOWN no debe mencionar ${objeto}`).toEqual(
        [],
      )
    }

    // Sensibilidad: los `DROP INDEX` que `migrate dev` sabe emitir por drift caen, y tambien un
    // "recreado" bienintencionado con una definicion distinta de la original.
    const conDrop = `${upSource}\nDROP INDEX "users_email_unique";`
    expect(statementsMentioning(conDrop, 'users_email_unique')).toHaveLength(1)
    const recreado = `${upSource}\nCREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username"));`
    expect(statementsMentioning(recreado, 'users_username_unique')).toHaveLength(1)

    // Y nombrarlos en un COMENTARIO no cae: la cabecera los nombra a proposito para dejar
    // escrito que no se tocan.
    expect(statementsMentioning(`${upSource}\n-- DROP INDEX "users_email_unique";`, 'users_email_unique')).toEqual(
      [],
    )
  })

  it('no ejecuta DDL sobre ninguna tabla de otro modulo', () => {
    const ajenas = [
      'orders',
      'order_lines',
      'products',
      'product_batches',
      'recipe_lines',
      'recipes',
      'supplier_catalog_lines',
      'suppliers',
      'presentations',
      'units',
      'document_types',
      'roles',
      'permissions',
      'role_permissions',
      'companies',
      'work_groups',
      'work_group_members',
      'credential_setup_tokens',
    ]
    for (const tabla of ajenas) {
      expect(ddlStatementsOn(upSource, tabla), `no debe tocar ${tabla}`).toEqual([])
      expect(ddlStatementsOn(downSource, tabla), `el DOWN no debe tocar ${tabla}`).toEqual([])
    }

    // Sensibilidad: un `DROP CONSTRAINT` por drift, escondido al final, cae.
    const conDrift = `${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_recipe_id_fkey";`
    expect(ddlStatementsOn(conDrift, 'orders')).toHaveLength(1)
  })

  it('nombra en ingles y en snake_case todo lo que crea (R41)', () => {
    const identificadores = createdIdentifiers(up)
    expect(identificadores).toContain('revoked_sessions')
    expect(identificadores).toContain('session_id')
    expect(identificadores).toContain('sessions_valid_from')
    expect(identificadores).toContain('revoked_sessions_session_id_key')
    expect(identificadores).toContain('revoked_sessions_user_id_expires_at_idx')
    expect(identificadores).toContain('revoked_sessions_user_id_fkey')
    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase', () => {
    for (const enEspanol of [
      'sesiones_revocadas',
      'sesion_id',
      'usuario_id',
      'valido_desde',
      'caduca_en',
    ]) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('revoked_sessións')).toBe(false)
    expect(isEnglishSnakeCase('revokedSessions')).toBe(false)
    expect(isEnglishSnakeCase('REVOKED_SESSIONS')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('revoked_sessions')).toBe(true)
    expect(isEnglishSnakeCase('sessions_valid_from')).toBe(true)
  })
})

// === El DOWN (R43) ==========================================================================

describe('down.sql — revertir deja el esquema exactamente como estaba', () => {
  it('borra la tabla y la columna del sello, y nada mas: dos sentencias', () => {
    expect(down).toEqual([
      'DROP TABLE IF EXISTS "revoked_sessions"',
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "sessions_valid_from"',
    ])
  })

  it('cubre TODO lo que el UP crea, y quitarle cualquiera de las dos lineas lo tumba (R43)', () => {
    // Un DOWN incompleto no falla al ejecutarse: deja restos y el rollback termina en verde.
    expect(upObjectsNotCoveredByDown(upSource, downSource)).toEqual([])

    // Sensibilidad: sin el `DROP TABLE`, la tabla y sus dos indices sobreviven al rollback...
    const sinTabla = downSource.replace('DROP TABLE IF EXISTS "revoked_sessions";', '')
    expect(sinTabla, 'la mutacion no quito el DROP TABLE').not.toBe(downSource)
    expect(upObjectsNotCoveredByDown(upSource, sinTabla)).toContain('tabla revoked_sessions')

    // ...y sin el `DROP COLUMN`, `users` se queda con una columna que ya no esta en el esquema:
    // la siguiente migracion se aplicaria sobre un estado que Prisma cree que es otro.
    const sinColumna = downSource.replace(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "sessions_valid_from";',
      '',
    )
    expect(sinColumna, 'la mutacion no quito el DROP COLUMN').not.toBe(downSource)
    expect(upObjectsNotCoveredByDown(upSource, sinColumna)).toEqual([
      'columna users.sessions_valid_from',
    ])

    // Y el predicado NO da por bueno un DOWN vacio: detecta las dos cosas a la vez.
    expect(upObjectsNotCoveredByDown(upSource, '')).toEqual([
      'tabla revoked_sessions',
      'columna users.sessions_valid_from',
      'objeto revoked_sessions_session_id_key',
      'objeto revoked_sessions_user_id_expires_at_idx',
      'objeto revoked_sessions_user_id_fkey',
    ])
  })

  it('ningun DROP lleva CASCADE, y no deja ningun ALTER de RLS suelto', () => {
    // Un `CASCADE` convertiria un fallo ruidoso —algo depende de esta tabla o de esta columna—
    // en un borrado silencioso. Y un `ALTER ... ROW LEVEL SECURITY` sobre una tabla ya borrada
    // falla, por eso los dos del UP no se repiten aqui: se caen con la tabla.
    expect(down.filter((statement) => /\bCASCADE\b/i.test(statement))).toEqual([])
    expect(down.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toEqual([])

    const conCascade = downSource.replace(
      'DROP TABLE IF EXISTS "revoked_sessions";',
      'DROP TABLE "revoked_sessions" CASCADE;',
    )
    expect(conCascade, 'la mutacion no metio el CASCADE').not.toBe(downSource)
    expect(statements(conCascade).filter((s) => /\bCASCADE\b/i.test(s))).toHaveLength(1)
  })

  it('de `users` quita SOLO la columna del sello: ni un indice, ni una restriccion, ni una fila', () => {
    expect(ddlStatementsOn(downSource, 'users')).toEqual([
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "sessions_valid_from"',
    ])
    expect(writesRows(downSource)).toBe(false)

    // Sensibilidad: un `DROP INDEX` de mas en el DOWN se llevaria la unicidad del correo, y el
    // rollback terminaria en verde...
    const conDrop = `${downSource}\nDROP INDEX "users_email_unique";`
    expect(ddlStatementsOn(conDrop, 'users')).toHaveLength(1)
    // ...y una escritura de filas tambien cae.
    for (const escritura of [
      'DELETE FROM "users" WHERE "account_status" = \'pending\';',
      'UPDATE "users" SET "account_status" = \'active\';',
    ]) {
      expect(writesRows(`${downSource}\n${escritura}`), `${escritura} deberia caer`).toBe(true)
    }
  })
})

// === El esquema de Prisma ===================================================================

describe('db/schema.prisma — el modelo nuevo es de identity y no arrastra columnas de mas', () => {
  it('RevokedSession declara su dueno (`/// @module identity`)', () => {
    expect(moduleOwnerOf(rawSchema, 'RevokedSession')).toBe('identity')

    // Sensibilidad: un modelo sin dueno cae —y es ademas un hallazgo de
    // `tests/guards/guard-arquitectura-modulos.test.ts`—.
    const sinDueno = rawSchema.replace(
      '/// @module identity\n/// QC-23. Las sesiones cerradas',
      '/// QC-23. Las sesiones cerradas',
    )
    expect(sinDueno, 'la mutacion no quito el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(sinDueno, 'RevokedSession')).toBeNull()
  })

  it('el modelo no declara empresa, ni updated_at, ni deleted_at (R44, R45)', () => {
    const body = modelBody(rawSchema, 'RevokedSession')
    expect(body).not.toBeNull()
    expect(body as string).not.toMatch(/companyId/)
    expect(body as string).not.toMatch(/company_id/)
    expect(body as string).not.toMatch(/updatedAt/)
    expect(body as string).not.toMatch(/deletedAt/)
    // Y `User` si declara las tres: la afirmacion de arriba no es un `expect(false)` disfrazado.
    const usuario = modelBody(rawSchema, 'User') as string
    expect(usuario).toMatch(/companyId/)
    expect(usuario).toMatch(/updatedAt/)
    expect(usuario).toMatch(/deletedAt/)
  })

  it('el sello vive en `User`, es obligatorio y no tiene indice (R7, design.md > 2.1)', () => {
    const usuario = modelBody(rawSchema, 'User') as string
    expect(usuario).toMatch(
      /sessionsValidFrom\s+DateTime\s+@default\(now\(\)\)\s+@map\("sessions_valid_from"\)\s+@db\.Timestamptz\(6\)/,
    )
    // Obligatorio: `DateTime?` lo volveria anulable y R7 dejaria de ser «toda fila de usuario».
    expect(usuario).not.toMatch(/sessionsValidFrom\s+DateTime\?/)
    // Sin indice: ningun `@@index` ni `@unique` lo nombra.
    expect(usuario.match(/@@index\(\[[^\]]*sessionsValidFrom[^\]]*\]/g)).toBeNull()
    expect(usuario).not.toMatch(/sessionsValidFrom[^\n]*@unique/)
  })
})
