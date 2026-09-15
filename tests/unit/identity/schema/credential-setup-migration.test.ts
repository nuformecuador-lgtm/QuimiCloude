// T4 — Contrato estatico del SQL de la migracion del enlace de credencial (QC-79).
//
// Cubre R35 (RLS activada Y forzada, sin ninguna policy, e identificadores en ingles
// snake_case), R36 (el `down.sql` es el inverso exacto del UP y no toca ningun otro objeto) y
// R37 (la tabla no lleva columna de empresa, y la migracion NO anade, quita ni modifica nada
// de `users` ni ninguno de los tres indices unicos de QC-47).
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca:
//
//   1. EL INDICE UNICO PARCIAL `credential_setup_tokens_one_live_per_user` (R11,
//      `design.md > 3.2`). ES el requisito: es lo unico que hace que dos emisiones simultaneas
//      para la misma persona acaben con UN solo enlace vivo. Prisma no modela indices
//      parciales, asi que solo existe en este `migration.sql`. Quitarle el `WHERE` lo vuelve
//      TOTAL —y entonces el reenvio de R16 falla siempre, porque el enlace sustituido sigue
//      ocupando la ranura—; quitarlo entero deja la carrera abierta. Ninguna de las dos cosas
//      rompe el typecheck ni ninguna otra prueba.
//   2. LOS DOS `ALTER ... ROW LEVEL SECURITY` (R35). Sin `FORCE`, el dueno de la tabla —que es
//      con quien se conecta Prisma— ignora la RLS entera y la defensa en profundidad no
//      defiende de nada.
//   3. QUE EL UP NO TOQUE `users` (R37). `prisma migrate dev --create-only` emitio veintiun
//      `DROP CONSTRAINT` y nueve `DROP INDEX` por el drift ya conocido del repo —entre ellos
//      `users_account_status_changed_by_fkey`— y se borraron a mano, igual que en QC-65. Si
//      uno se colara, el esquema seguiria validando, el cliente compilaria y la suite seguiria
//      verde: solo se entera este archivo.
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y
// devuelve el veredicto, y se aplica dos veces: al SQL real y a una copia MUTADA EN MEMORIA.
// El archivo en disco NO se toca. Un test que no puede fallar no vigila nada; es el mismo
// patron de `tests/unit/identity/schema/work-groups-migration.test.ts`.

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
const credentialSetupDirs = readdirSync(migrationsDir).filter((name) =>
  /_credential_setup_tokens$/.test(name),
)
expect(
  credentialSetupDirs,
  'debe existir exactamente una migracion del enlace de credencial',
).toHaveLength(1)
const migrationDir = join(migrationsDir, credentialSetupDirs[0] as string)

// --- Lectura y troceado del SQL ------------------------------------------------------------

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. La
 * cabecera de esta migracion nombra a proposito `users` y los tres indices de QC-47 —para
 * dejar escrito que NO se tocan—, asi que mirar el texto crudo daria falsos positivos en todas
 * las afirmaciones en negativo de mas abajo.
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

// --- Predicados puros: el indice parcial que ES R11 -----------------------------------------

/** Las dos propiedades de `credential_setup_tokens_one_live_per_user`, por separado. */
export interface IndiceDeEnlaceVivo {
  /** R11: es UNICO sobre `user_id`, asi que la base rechaza el segundo enlace con 23505. */
  readonly unicoPorUsuario: boolean
  /**
   * R11: es PARCIAL, y su predicado es exactamente «ni consumido ni sustituido». Sin el, la
   * unicidad seria TOTAL y nadie podria tener nunca un segundo enlace, ni siquiera despues de
   * consumir el primero: el reenvio de R16 fallaria SIEMPRE.
   */
  readonly parcialSoloVivos: boolean
}

/**
 * R11. Las dos propiedades del indice, leidas del SQL. Se devuelven por separado a proposito:
 * un unico booleano no distinguiria cual de las dos se perdio, y cada una muere de una forma
 * distinta y en silencio.
 */
export function liveLinkIndex(sql: string): IndiceDeEnlaceVivo | null {
  const encontrados = statements(sql).filter((statement) =>
    /^CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"/i.test(statement),
  )
  if (encontrados.length !== 1) return null
  const indice = encontrados[0] as string
  // Las columnas son todo lo que va delante del `WHERE`. Se recorta asi —y no con un patron de
  // parentesis— para que las dos propiedades sean INDEPENDIENTES: leidas juntas, quitar el
  // `WHERE` tumbaria tambien `unicoPorUsuario` y la mutacion no demostraria lo que dice.
  const sinWhere = indice.replace(/ WHERE .*$/i, '')
  return {
    unicoPorUsuario: /ON "credential_setup_tokens" \("user_id"\)$/i.test(sinWhere),
    parcialSoloVivos: /WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL$/i.test(indice),
  }
}

// --- Predicados puros: las claves foraneas --------------------------------------------------

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

// --- Predicados puros: columnas, RLS y DDL ajeno --------------------------------------------

/**
 * Las columnas declaradas por un `CREATE TABLE`, con su definicion literal. El troceado
 * respeta los parentesis: `TIMESTAMPTZ(6)` y `PRIMARY KEY ("a","b")` llevan comas y parentesis
 * dentro y partir por comas a secas los rompe.
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
    // Las lineas de `CONSTRAINT ... PRIMARY KEY (...)` no empiezan por comilla y no son columnas.
    if (nombre !== null) columnas.set(nombre[1] as string, definicion)
  }
  return columnas
}

/** R35. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
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
 * R35 y `design.md > 3.3`. ¿Los `ALTER ... ROW LEVEL SECURITY` son el ULTIMO bloque del
 * archivo? NO es cosmetico: `FORCE` sin policies deniega tambien al dueno de la tabla cuando
 * ese dueno no es superusuario, asi que cualquier escritura futura colocada detras de ellos
 * podria no escribir nada EN SILENCIO (leccion de QC-32 y QC-74).
 */
export function rowLevelSecurityGoesLast(sql: string): boolean {
  const source = statements(sql)
  const esRls = (statement: string): boolean => /ROW LEVEL SECURITY$/i.test(statement)
  const primera = source.findIndex(esRls)
  if (primera === -1) return false
  return source.slice(primera).every(esRls)
}

/**
 * R35. Toda sentencia que declare una POLICY. Tiene que quedar vacia: una policy no cuenta
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
 * R36. ¿El SQL escribe alguna fila? `ON DELETE`/`ON UPDATE` no cuentan: son parte de la
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
    const constraint = /ADD CONSTRAINT "([^"]+)"/i.exec(statement)
    if (constraint !== null) nombres.add(constraint[1] as string)
    const index = /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement)
    if (index !== null) nombres.add(index[1] as string)
  }
  return [...nombres]
}

/**
 * Vocabulario ingles admitido para los identificadores de esta feature (R35). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista. Es una lista
 * cerrada a proposito, con el precedente de `work-groups-migration.test.ts`: una columna nueva
 * obliga a pasar por aqui, y una en espanol (`enlace`, `huella`, `caduca`) no encuentra sus
 * piezas y cae. Un patron `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'consumed',
  'created',
  'credential',
  'digest',
  'expires',
  'fkey',
  'id',
  'idx',
  'key',
  'live',
  'one',
  'per',
  'pkey',
  'setup',
  'superseded',
  'token',
  'tokens',
  'user',
])

/** R35. ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? */
export function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

// --- Predicados puros: el esquema de Prisma -------------------------------------------------

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

/**
 * R11, el riesgo silencioso del esquema. Toda declaracion de unicidad del modelo que nombre
 * `userId`. Tiene que quedar vacia: la unicidad del enlace vivo es PARCIAL y solo existe en el
 * `migration.sql`. Un `@@unique([userId])` aqui la volveria TOTAL sin ningun error, y el
 * reenvio de R16 empezaria a fallar siempre.
 */
export function userUniquesIn(schema: string, model: string): readonly string[] {
  const body = modelBody(schema, model)
  if (body === null) return []
  const compuestos = [...body.matchAll(/@@unique\(([^\n]*)\)/g)]
    .map((match) => (match[1] as string).trim())
    .filter((args) => /userid/i.test(args))
  const enColumna = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^userId\s/.test(line) && /@unique/.test(line))
  return [...compuestos, ...enColumna]
}

/**
 * Mutacion EN MEMORIA acotada a UN modelo del esquema. Sin esto, un `replace` a secas sobre el
 * texto del `.prisma` cae en el primer modelo que comparta la linea —media docena declaran el
 * mismo `userId`— y la mutacion no tocaria el modelo que se pretende romper: el test seguiria
 * verde por la razon equivocada.
 */
function mutateModel(schema: string, model: string, from: string, to: string): string {
  const inicio = schema.indexOf(`model ${model} {`)
  if (inicio === -1) return schema
  const fin = schema.indexOf('\n}', inicio)
  if (fin === -1) return schema
  const bloque = schema.slice(inicio, fin)
  return schema.slice(0, inicio) + bloque.replace(from, to) + schema.slice(fin)
}

// === El UP: la tabla y sus columnas ========================================================

describe('migration.sql — el UP crea la tabla del enlace y solo esa', () => {
  it('crea `credential_setup_tokens` y ninguna otra tabla', () => {
    const creadas = up
      .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(creadas).toEqual(['credential_setup_tokens'])
    // Y no declara ninguna extension: `pgcrypto` ya existe y medio repo depende de ella.
    expect(up.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })

  it('declara exactamente las siete columnas del diseno, sin empresa y sin updated_at (R37)', () => {
    // `design.md > 3.1`: sin `company_id` —la empresa es la del usuario al que apunta— y sin
    // `updated_at` —una fila tiene tres transiciones y cada una tiene su propio instante—.
    const columnas = tableColumns(upSource, 'credential_setup_tokens')
    expect([...columnas.keys()]).toEqual([
      'id',
      'user_id',
      'token_digest',
      'expires_at',
      'consumed_at',
      'superseded_at',
      'created_at',
    ])
    expect(columnas.has('company_id')).toBe(false)
    expect(columnas.has('updated_at')).toBe(false)

    // Sensibilidad: anadir la columna de empresa cae. La afirmacion de arriba no es un
    // `expect(false)` disfrazado sobre un archivo que nunca menciona `company_id`.
    const conEmpresa = upSource.replace(
      '"user_id" UUID NOT NULL,',
      '"user_id" UUID NOT NULL,\n    "company_id" UUID NOT NULL,',
    )
    expect(conEmpresa, 'la mutacion no anadio company_id').not.toBe(upSource)
    expect(tableColumns(conEmpresa, 'credential_setup_tokens').has('company_id')).toBe(true)
  })

  it('la huella y la caducidad son obligatorias, y los dos instantes de muerte nacen vacios', () => {
    // R9: en la base queda la HUELLA (`token_digest`), nunca el secreto; es NOT NULL porque una
    // fila sin huella no es comprobable por nadie. R12: `consumed_at`/`superseded_at` son
    // anulables porque NULL es precisamente «el enlace sigue vivo», que es lo que lee el indice
    // parcial de abajo.
    const columnas = tableColumns(upSource, 'credential_setup_tokens')
    expect(columnas.get('id')).toBe('"id" UUID NOT NULL DEFAULT gen_random_uuid()')
    expect(columnas.get('user_id')).toBe('"user_id" UUID NOT NULL')
    expect(columnas.get('token_digest')).toBe('"token_digest" TEXT NOT NULL')
    expect(columnas.get('expires_at')).toBe('"expires_at" TIMESTAMPTZ(6) NOT NULL')
    expect(columnas.get('consumed_at')).toBe('"consumed_at" TIMESTAMPTZ(6)')
    expect(columnas.get('superseded_at')).toBe('"superseded_at" TIMESTAMPTZ(6)')
    expect(columnas.get('created_at')).toBe(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    )

    // Sensibilidad: un `consumed_at` NOT NULL hace imposible insertar un enlace vivo...
    const consumoObligatorio = upSource.replace(
      '"consumed_at" TIMESTAMPTZ(6),',
      '"consumed_at" TIMESTAMPTZ(6) NOT NULL,',
    )
    expect(consumoObligatorio, 'la mutacion no puso el NOT NULL').not.toBe(upSource)
    expect(tableColumns(consumoObligatorio, 'credential_setup_tokens').get('consumed_at')).toMatch(
      /NOT NULL/i,
    )
    // ...y una huella anulable deja entrar una fila que nadie puede comprobar.
    const huellaAnulable = upSource.replace(
      '"token_digest" TEXT NOT NULL,',
      '"token_digest" TEXT,',
    )
    expect(huellaAnulable, 'la mutacion no quito el NOT NULL de la huella').not.toBe(upSource)
    expect(tableColumns(huellaAnulable, 'credential_setup_tokens').get('token_digest')).toBe(
      '"token_digest" TEXT',
    )
  })

  it('no escribe ni una fila: la tabla nace vacia', () => {
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
      writesRows(`${upSource}\nINSERT INTO "credential_setup_tokens" ("user_id") VALUES ('x');`),
    ).toBe(true)
  })
})

// === El UP: la clave foranea ==============================================================

describe('migration.sql — el enlace cuelga del usuario, y borrarlo a lo bruto hace ruido', () => {
  it('la FK apunta a users con RESTRICT en el borrado y CASCADE en la actualizacion', () => {
    // `design.md > 3.1`: el borrado de usuario es LOGICO (QC-66 R37), asi que en operacion
    // normal no se dispara; un borrado fisico con enlaces colgando tiene que ser ruidoso, no
    // arrastrarlos en silencio. Mismo criterio que `product_batches_*_fkey`.
    const fk = foreignKey(upSource, 'credential_setup_tokens_user_id_fkey')
    expect(fk?.tabla).toBe('credential_setup_tokens')
    expect(fk?.columnas).toEqual(['user_id'])
    expect(fk?.tablaReferenciada).toBe('users')
    expect(fk?.columnasReferenciadas).toEqual(['id'])
    expect(fk?.onDelete).toBe('RESTRICT')
    expect(fk?.onUpdate).toBe('CASCADE')
  })

  it('cambiar el RESTRICT por CASCADE lo tumba: los enlaces se irian en silencio', () => {
    const conCascade = upSource.replace(
      'REFERENCES "users"("id") ON DELETE RESTRICT',
      'REFERENCES "users"("id") ON DELETE CASCADE',
    )
    expect(conCascade, 'la mutacion no cambio el ON DELETE').not.toBe(upSource)
    expect(foreignKey(conCascade, 'credential_setup_tokens_user_id_fkey')?.onDelete).toBe('CASCADE')

    // Y borrar la FK entera tambien: sin ella, un enlace podria apuntar a nadie.
    const sinFk = upSource.replace(
      /ALTER TABLE "credential_setup_tokens" ADD CONSTRAINT "credential_setup_tokens_user_id_fkey"[^;]*;/,
      '',
    )
    expect(sinFk, 'la mutacion no quito la FK').not.toBe(upSource)
    expect(foreignKey(sinFk, 'credential_setup_tokens_user_id_fkey')).toBeNull()
  })
})

// === El UP: los dos indices de Prisma =====================================================

describe('migration.sql — la huella es unica y el lado hijo de la FK esta indexado', () => {
  it('crea el indice unico de la huella y el indice de user_id', () => {
    // El unico de `token_digest` es lo que hace que comprobar un enlace sea UNA busqueda por
    // indice (`design.md > 4.3`) y no un recorrido de todas las filas vivas.
    expect(findStatement(up, /^CREATE UNIQUE INDEX "credential_setup_tokens_token_digest_key"/i)).toBe(
      'CREATE UNIQUE INDEX "credential_setup_tokens_token_digest_key" ON ' +
        '"credential_setup_tokens"("token_digest")',
    )
    expect(findStatement(up, /^CREATE INDEX "credential_setup_tokens_user_id_idx"/i)).toBe(
      'CREATE INDEX "credential_setup_tokens_user_id_idx" ON "credential_setup_tokens"("user_id")',
    )
  })

  it('el UP crea exactamente tres indices: la huella, el user_id y el parcial', () => {
    const indices = up
      .map((statement) => /^CREATE (?:UNIQUE )?INDEX "([^"]+)"/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(indices).toEqual([
      'credential_setup_tokens_user_id_idx',
      'credential_setup_tokens_token_digest_key',
      'credential_setup_tokens_one_live_per_user',
    ])
  })
})

// === El UP: el indice parcial, que ES el requisito R11 ====================================

describe('migration.sql — como maximo un enlace vivo por persona, y lo garantiza la base', () => {
  it('el indice es unico sobre user_id y parcial sobre los dos instantes de muerte (R11)', () => {
    // Prisma no modela indices parciales: este indice solo existe aqui. Es lo unico que hace
    // que dos emisiones simultaneas para la misma persona acaben con UN solo enlace vivo.
    expect(liveLinkIndex(upSource)).toEqual({
      unicoPorUsuario: true,
      parcialSoloVivos: true,
    })
    expect(findStatement(up, /^CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"/i)).toBe(
      'CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user" ON ' +
        '"credential_setup_tokens" ("user_id") WHERE "consumed_at" IS NULL AND ' +
        '"superseded_at" IS NULL',
    )
  })

  it('SENSIBILIDAD — quitarle el WHERE lo tumba: el reenvio de R16 fallaria siempre', () => {
    // Mutacion EN MEMORIA; el archivo en disco no se toca. Sin el `WHERE`, la unicidad pasa a
    // ser TOTAL: el enlace ya sustituido o ya consumido sigue ocupando la ranura y nadie puede
    // recibir un segundo enlace nunca. El esquema seguiria validando y la suite, verde.
    const total = upSource.replace(
      '  ON "credential_setup_tokens" ("user_id")\n' +
        '  WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;',
      '  ON "credential_setup_tokens" ("user_id");',
    )
    expect(total, 'la mutacion no quito el WHERE').not.toBe(upSource)
    expect(liveLinkIndex(total)?.parcialSoloVivos).toBe(false)
    // Y la otra propiedad sigue en pie: la mutacion es quirurgica y cada una se vigila aparte.
    expect(liveLinkIndex(total)?.unicoPorUsuario).toBe(true)

    // Relajarlo a una sola de las dos condiciones tampoco vale: un enlace consumido liberaria
    // la ranura pero uno sustituido no, o al reves, y la mitad de R11 moriria callada.
    const medioWhere = upSource.replace(
      'WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;',
      'WHERE "consumed_at" IS NULL;',
    )
    expect(medioWhere, 'la mutacion no recorto el WHERE').not.toBe(upSource)
    expect(liveLinkIndex(medioWhere)?.parcialSoloVivos).toBe(false)

    // Y si el indice desaparece entero, tampoco pasa: un indice ausente y uno relajado son la
    // misma cosa para un assert distraido.
    const sinIndice = upSource.replace(
      /CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"[^;]*;/,
      '',
    )
    expect(sinIndice, 'la mutacion no quito el indice').not.toBe(upSource)
    expect(liveLinkIndex(sinIndice)).toBeNull()
  })

  it('SENSIBILIDAD — quitarle el UNIQUE lo tumba: la carrera quedaria abierta', () => {
    const noUnico = upSource.replace(
      'CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"',
      'CREATE INDEX "credential_setup_tokens_one_live_per_user"',
    )
    expect(noUnico, 'la mutacion no quito el UNIQUE').not.toBe(upSource)
    expect(liveLinkIndex(noUnico)).toBeNull()

    // Y anadirle una segunda columna tambien: la unicidad dejaria de ser «por persona».
    const compuesto = upSource.replace(
      'ON "credential_setup_tokens" ("user_id")\n',
      'ON "credential_setup_tokens" ("user_id", "token_digest")\n',
    )
    expect(compuesto, 'la mutacion no anadio la segunda columna').not.toBe(upSource)
    expect(liveLinkIndex(compuesto)?.unicoPorUsuario).toBe(false)
    expect(liveLinkIndex(compuesto)?.parcialSoloVivos).toBe(true)
  })

  it('el predicado NO usa now(): un indice con una funcion no inmutable no existe', () => {
    // `design.md > 3.2`: definir «vivo» incluyendo `expires_at > now()` haria el indice no
    // inmutable y Postgres lo rechazaria. No es una concesion: es la razon por la que la
    // definicion correcta es la de arriba, y por la que un enlace caducado ocupa la ranura
    // hasta que el reenvio lo sustituye explicitamente.
    const parcial = findStatement(up, /"credential_setup_tokens_one_live_per_user"/)
    expect(parcial).not.toMatch(/now\(\)/i)
    expect(parcial).not.toMatch(/CURRENT_TIMESTAMP/i)
    expect(parcial).not.toMatch(/expires_at/i)
  })
})

// === El UP: la RLS ========================================================================

describe('migration.sql — la tabla nace con RLS activada y forzada, y sin ninguna policy', () => {
  it('queda con ENABLE y con FORCE (R35)', () => {
    expect(hasRlsEnabledAndForced(upSource, 'credential_setup_tokens')).toBe(true)
  })

  it('SENSIBILIDAD — sin el FORCE, el dueno de la tabla ignora la RLS entera', () => {
    // Prisma se conecta como dueno y Postgres NO le aplica RLS salvo `FORCE`
    // (`docs/architecture.md > Acceso a datos y autorizacion`). Quitarlo deja la defensa en
    // profundidad sin defender nada, y ningun otro test del repo se entera.
    const sinForce = upSource.replace(
      'ALTER TABLE "credential_setup_tokens" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'credential_setup_tokens')).toBe(false)

    // Y quitar el ENABLE tambien: son las dos mitades de la misma cosa.
    const sinEnable = upSource.replace(
      'ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'credential_setup_tokens')).toBe(false)
  })

  it('no declara ninguna policy: la autorizacion vive en el service (R35)', () => {
    expect(policyStatements(upSource)).toEqual([])
    // Sensibilidad: una policy colada al final cae. Una policy NO cuenta como permiso
    // implementado y tenerla aqui daria la falsa impresion de que si.
    const conPolicy = `${upSource}\nCREATE POLICY "p" ON "credential_setup_tokens" USING (true);`
    expect(policyStatements(conPolicy)).toHaveLength(1)
  })

  it('los ALTER de RLS son el ultimo bloque del archivo, y subirlos lo tumba', () => {
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)

    const rlsArriba = `ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;\n${upSource}`
    expect(rowLevelSecurityGoesLast(rlsArriba), 'un RLS al principio deberia caer').toBe(false)

    // Y cualquier DDL colado detras de los ALTER tambien: es el caso real que esto vigila.
    const ddlDetras = `${upSource}\nCREATE INDEX "credential_setup_tokens_expires_at_idx" ON "credential_setup_tokens"("expires_at");`
    expect(rowLevelSecurityGoesLast(ddlDetras)).toBe(false)
  })
})

// === El UP: lo que NO toca (R37) ==========================================================

describe('migration.sql — esta migracion no toca users ni ninguna tabla ajena (R37)', () => {
  it('no ejecuta ningun DDL cuyo sujeto sea `users`', () => {
    // La FK `credential_setup_tokens_user_id_fkey` NOMBRA `users` en su `REFERENCES`, pero su
    // sujeto es la tabla nueva: ese es exactamente el limite que este predicado distingue.
    expect(ddlStatementsOn(upSource, 'users')).toEqual([])

    // Sensibilidad: cualquier linea sobre `users` cae, aunque sea inocente.
    const conColumna = `${upSource}\nALTER TABLE "users" ADD COLUMN "credential_setup_token_id" UUID;`
    expect(ddlStatementsOn(conColumna, 'users')).toHaveLength(1)
    const conIndice = `${upSource}\nCREATE INDEX "users_account_status_idx" ON "users"("account_status");`
    expect(ddlStatementsOn(conIndice, 'users')).toHaveLength(1)
    // Y el `DROP CONSTRAINT` por drift que `migrate dev` emitio y se borro a mano: es el caso
    // real que este test vigila.
    const conDrift = `${upSource}\nALTER TABLE "users" DROP CONSTRAINT "users_account_status_changed_by_fkey";`
    expect(ddlStatementsOn(conDrift, 'users')).toHaveLength(1)
    // Pero nombrar `users` en un comentario NO cae: hablar de ella para decir que no se toca vale.
    expect(ddlStatementsOn(`${upSource}\n-- ALTER TABLE "users" ...`, 'users')).toEqual([])
  })

  it('no menciona ninguno de los tres indices unicos de QC-47 (R37)', () => {
    // Son FUNCIONALES y PARCIALES, solo existen escritos a mano en las migraciones de QC-4 y
    // QC-47, y son drift para Prisma: un `DROP INDEX` por drift colado aqui los borraria y la
    // unicidad del correo, del nombre de usuario y del documento desapareceria en silencio.
    for (const indice of ['users_email_unique', 'users_username_unique', 'users_document_unique']) {
      expect(statementsMentioning(upSource, indice), `no debe mencionar ${indice}`).toEqual([])
    }

    // Sensibilidad: los tres `DROP INDEX` que `migrate dev` sabe emitir por drift caen.
    const conDrop = `${upSource}\nDROP INDEX "users_email_unique";`
    expect(statementsMentioning(conDrop, 'users_email_unique')).toHaveLength(1)
    const recreado = `${upSource}\nCREATE UNIQUE INDEX "users_username_unique" ON "users" (lower("username"));`
    expect(statementsMentioning(recreado, 'users_username_unique')).toHaveLength(1)
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
    ]
    for (const tabla of ajenas) {
      expect(ddlStatementsOn(upSource, tabla), `no debe tocar ${tabla}`).toEqual([])
    }

    // Sensibilidad: un `DROP CONSTRAINT` por drift, escondido al final, cae.
    const conDrift = `${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_recipe_id_fkey";`
    expect(ddlStatementsOn(conDrift, 'orders')).toHaveLength(1)
  })

  it('nombra en ingles y en snake_case todo lo que crea (R35)', () => {
    const identificadores = createdIdentifiers(up)
    expect(identificadores).toContain('credential_setup_tokens')
    expect(identificadores).toContain('token_digest')
    expect(identificadores).toContain('credential_setup_tokens_one_live_per_user')
    expect(identificadores).toContain('credential_setup_tokens_user_id_fkey')
    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase', () => {
    for (const enEspanol of [
      'enlaces_de_credencial',
      'huella',
      'caduca_en',
      'usuario_id',
      'consumido_en',
    ]) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('credential_setup_tókens')).toBe(false)
    expect(isEnglishSnakeCase('credentialSetupTokens')).toBe(false)
    expect(isEnglishSnakeCase('CREDENTIAL_SETUP_TOKENS')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('credential_setup_tokens')).toBe(true)
    expect(isEnglishSnakeCase('superseded_at')).toBe(true)
  })
})

// === El DOWN (R36) ========================================================================

describe('down.sql — revertir deja el esquema exactamente como estaba', () => {
  it('borra el indice parcial y la tabla, y nada mas: dos sentencias', () => {
    expect(down).toEqual([
      'DROP INDEX IF EXISTS "credential_setup_tokens_one_live_per_user"',
      'DROP TABLE IF EXISTS "credential_setup_tokens"',
    ])
  })

  it('no toca `users` en ninguna linea ejecutable (R37)', () => {
    // El UP no le toco nada, asi que el DOWN no tiene nada que restaurar. Cualquier linea aqui
    // sobre `users` dejaria la tabla distinta de como estaba y el rollback terminaria en verde.
    expect(statementsMentioning(downSource, 'users')).toEqual([])
    expect(ddlStatementsOn(downSource, 'users')).toEqual([])

    const conUsers = `${downSource}\nALTER TABLE "users" DROP COLUMN "password_hash";`
    expect(statementsMentioning(conUsers, 'users')).toHaveLength(1)
  })

  it('no escribe, no modifica y no borra ninguna fila', () => {
    expect(writesRows(downSource)).toBe(false)
    for (const escritura of [
      'DELETE FROM "users" WHERE "account_status" = \'pending\';',
      'UPDATE "users" SET "account_status" = \'active\';',
    ]) {
      expect(writesRows(`${downSource}\n${escritura}`), `${escritura} deberia caer`).toBe(true)
    }
  })

  it('ningun DROP lleva CASCADE, y no deja ningun ALTER de RLS suelto', () => {
    // Un `CASCADE` convertiria un fallo ruidoso —algo depende de esta tabla— en un borrado
    // silencioso. Y un `ALTER ... ROW LEVEL SECURITY` sobre una tabla ya borrada falla.
    expect(down.filter((statement) => /\bCASCADE\b/i.test(statement))).toEqual([])
    expect(down.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toEqual([])

    const conCascade = downSource.replace(
      'DROP TABLE IF EXISTS "credential_setup_tokens";',
      'DROP TABLE "credential_setup_tokens" CASCADE;',
    )
    expect(conCascade, 'la mutacion no metio el CASCADE').not.toBe(downSource)
    expect(statements(conCascade).filter((s) => /\bCASCADE\b/i.test(s))).toHaveLength(1)
  })
})

// === El esquema de Prisma =================================================================

describe('db/schema.prisma — el modelo nuevo es de identity y no se lleva la unicidad al esquema', () => {
  it('CredentialSetupToken declara su dueno (`/// @module identity`)', () => {
    expect(moduleOwnerOf(rawSchema, 'CredentialSetupToken')).toBe('identity')

    // Sensibilidad: un modelo sin dueno cae —y es ademas un hallazgo de
    // `tests/guards/guard-arquitectura-modulos.test.ts`—.
    const sinDueno = rawSchema.replace(
      /\/\/\/ @module identity\n((?:\/\/\/[^\n]*\n)*model CredentialSetupToken \{)/,
      '$1',
    )
    expect(sinDueno, 'la mutacion no quito el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(sinDueno, 'CredentialSetupToken')).toBeNull()
  })

  it('no declara ningun @@unique ni @unique de userId (R11)', () => {
    // Si alguien "arregla" el esquema con `@@unique([userId])`, la unicidad pasa a ser TOTAL en
    // silencio: nadie podria recibir un segundo enlace nunca y el reenvio de R16 fallaria
    // siempre, sin que salte ningun error en ninguna parte.
    expect(userUniquesIn(rawSchema, 'CredentialSetupToken')).toEqual([])

    // Sensibilidad: el `@@unique` compuesto cae...
    const conUnique = mutateModel(
      rawSchema,
      'CredentialSetupToken',
      '  @@unique([tokenDigest], map: "credential_setup_tokens_token_digest_key")',
      '  @@unique([tokenDigest], map: "credential_setup_tokens_token_digest_key")\n  @@unique([userId])',
    )
    expect(conUnique, 'la mutacion no anadio el @@unique').not.toBe(rawSchema)
    expect(userUniquesIn(conUnique, 'CredentialSetupToken')).toEqual(['[userId]'])

    // ...y un `@unique` en la propia columna tambien, que es la otra forma de romperlo.
    const enColumna = mutateModel(
      rawSchema,
      'CredentialSetupToken',
      'userId       String    @map("user_id") @db.Uuid',
      'userId       String    @unique @map("user_id") @db.Uuid',
    )
    expect(enColumna, 'la mutacion no anadio el @unique').not.toBe(rawSchema)
    expect(userUniquesIn(enColumna, 'CredentialSetupToken')).toHaveLength(1)
  })

  it('el modelo no declara ninguna columna de empresa (R37)', () => {
    const body = modelBody(rawSchema, 'CredentialSetupToken')
    expect(body).not.toBeNull()
    expect(body as string).not.toMatch(/companyId/)
    expect(body as string).not.toMatch(/company_id/)
    // Y `User` si la declara: la afirmacion de arriba no es un `expect(false)` disfrazado.
    expect(modelBody(rawSchema, 'User') as string).toMatch(/companyId/)
  })
})
