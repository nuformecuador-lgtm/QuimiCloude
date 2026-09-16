// Lo que se vigila aqui no esta en `db/schema.prisma` y Prisma no lo regenera: el indice unico
// parcial del enlace vivo, la RLS forzada y que la migracion no toque `users`. Si desaparece,
// ninguna de las tres cosas rompe el typecheck ni otra prueba, y por eso cada predicado se aplica
// tambien a una copia mutada en memoria.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

// Por patron y no por timestamp: si la migracion se regenera con otra marca de tiempo, el test
// la sigue encontrando.
const credentialSetupDirs = readdirSync(migrationsDir).filter((name) =>
  /_credential_setup_tokens$/.test(name),
)
expect(
  credentialSetupDirs,
  'debe existir exactamente una migracion del enlace de credencial',
).toHaveLength(1)
const migrationDir = join(migrationsDir, credentialSetupDirs[0] as string)

/**
 * Se afirma sobre SQL ejecutable: la cabecera de la migracion nombra `users` y sus indices unicos
 * para dejar escrito que no los toca, y el texto crudo daria falsos positivos.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

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

export interface IndiceDeEnlaceVivo {
  readonly unicoPorUsuario: boolean
  /** Sin el predicado la unicidad seria total, y el reenvio de un enlace fallaria siempre. */
  readonly parcialSoloVivos: boolean
}

/** Por separado: un solo booleano no diria cual de las dos propiedades se perdio. */
export function liveLinkIndex(sql: string): IndiceDeEnlaceVivo | null {
  const encontrados = statements(sql).filter((statement) =>
    /^CREATE UNIQUE INDEX "credential_setup_tokens_one_live_per_user"/i.test(statement),
  )
  if (encontrados.length !== 1) return null
  const indice = encontrados[0] as string
  // Se recorta el `WHERE` en vez de leer parentesis para que las dos propiedades sean
  // independientes: si no, quitar el `WHERE` tumbaria tambien `unicoPorUsuario`.
  const sinWhere = indice.replace(/ WHERE .*$/i, '')
  return {
    unicoPorUsuario: /ON "credential_setup_tokens" \("user_id"\)$/i.test(sinWhere),
    parcialSoloVivos: /WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL$/i.test(indice),
  }
}

export interface ClaveForanea {
  readonly tabla: string
  readonly columnas: readonly string[]
  readonly tablaReferenciada: string
  readonly columnasReferenciadas: readonly string[]
  readonly onDelete: string | null
  readonly onUpdate: string | null
}

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

/** Trocea respetando parentesis: `TIMESTAMPTZ(6)` y `PRIMARY KEY ("a","b")` llevan comas dentro. */
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

/** Sin `FORCE`, el dueno de la tabla, que es con quien conecta Prisma, ignora la RLS. */
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
 * `FORCE` sin policies deniega tambien al dueno cuando no es superusuario: una escritura colocada
 * detras de los `ALTER` podria no escribir nada, en silencio.
 */
export function rowLevelSecurityGoesLast(sql: string): boolean {
  const source = statements(sql)
  const esRls = (statement: string): boolean => /ROW LEVEL SECURITY$/i.test(statement)
  const primera = source.findIndex(esRls)
  if (primera === -1) return false
  return source.slice(primera).every(esRls)
}

/**
 * Una policy no filtra nada en esta app, porque Prisma conecta como dueno y no setea `auth.uid()`,
 * y daria la falsa impresion de que la autorizacion vive en la base.
 */
export function policyStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /\bPOLICY\b/i.test(statement))
}

export function ddlStatementsOn(sql: string, table: string): readonly string[] {
  const patron = new RegExp(
    `^(ALTER TABLE|DROP TABLE|CREATE TABLE|TRUNCATE)\\s+(IF EXISTS )?(ONLY )?"?${table}"?\\b|` +
      `^(CREATE|DROP)( UNIQUE)? INDEX .*\\bON "?${table}"?\\b`,
    'i',
  )
  return statements(sql).filter((statement) => patron.test(statement))
}

export function statementsMentioning(sql: string, needle: string): readonly string[] {
  return statements(sql).filter((statement) => new RegExp(needle, 'i').test(statement))
}

/** `ON DELETE`/`ON UPDATE` de una FK no cuentan como escritura. */
export function writesRows(sql: string): boolean {
  const ejecutable = stripSqlComments(sql).replace(/\s+/g, ' ')
  return /(?<!ON )\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(ejecutable)
}

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

// Lista cerrada: un identificador en espanol no encuentra sus piezas y cae. Un patron
// `^[a-z_]+$` solo miraria la forma, no el idioma.
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

export function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

export function modelBody(schema: string, model: string): string | null {
  const match = new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) return null
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Se lee del texto crudo porque `/// @module` es un comentario. */
export function moduleOwnerOf(schema: string, model: string): string | null {
  const match = new RegExp(`/// @module (\\w+)\\n(?:///[^\\n]*\\n)*model ${model} \\{`).exec(schema)
  return match === null ? null : (match[1] as string)
}

/**
 * La unicidad del enlace vivo es parcial y solo existe en `migration.sql`: un `@@unique([userId])`
 * la volveria total sin ningun error.
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
 * Acotada a un modelo: varios declaran la misma linea `userId`, y un `replace` a secas mutaria el
 * primero que la tenga y no el que se pretende romper.
 */
function mutateModel(schema: string, model: string, from: string, to: string): string {
  const inicio = schema.indexOf(`model ${model} {`)
  if (inicio === -1) return schema
  const fin = schema.indexOf('\n}', inicio)
  if (fin === -1) return schema
  const bloque = schema.slice(inicio, fin)
  return schema.slice(0, inicio) + bloque.replace(from, to) + schema.slice(fin)
}

describe('migration.sql — el UP crea la tabla del enlace y solo esa', () => {
  it('crea `credential_setup_tokens` y ninguna otra tabla', () => {
    const creadas = up
      .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(creadas).toEqual(['credential_setup_tokens'])
    // `pgcrypto` ya la crean migraciones anteriores.
    expect(up.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })

  it('declara exactamente las siete columnas del diseno, sin empresa y sin updated_at (R37)', () => {
    // Sin empresa, porque es la del usuario al que apunta, y sin `updated_at`, porque cada una de
    // las tres transiciones tiene su propia columna de instante.
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

    const conEmpresa = upSource.replace(
      '"user_id" UUID NOT NULL,',
      '"user_id" UUID NOT NULL,\n    "company_id" UUID NOT NULL,',
    )
    expect(conEmpresa, 'la mutacion no anadio company_id').not.toBe(upSource)
    expect(tableColumns(conEmpresa, 'credential_setup_tokens').has('company_id')).toBe(true)
  })

  it('la huella y la caducidad son obligatorias, y los dos instantes de muerte nacen vacios', () => {
    // En la base queda la huella, nunca el secreto. NULL en `consumed_at` y `superseded_at` es
    // precisamente «enlace vivo», que es lo que lee el indice parcial.
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

    // Un `consumed_at` NOT NULL haria imposible insertar un enlace vivo...
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
    expect(
      writesRows(
        'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "u"("a") ' +
          'ON DELETE RESTRICT ON UPDATE CASCADE;',
      ),
    ).toBe(false)
    expect(
      writesRows(`${upSource}\nINSERT INTO "credential_setup_tokens" ("user_id") VALUES ('x');`),
    ).toBe(true)
  })
})

describe('migration.sql — el enlace cuelga del usuario, y borrarlo a lo bruto hace ruido', () => {
  it('la FK apunta a users con RESTRICT en el borrado y CASCADE en la actualizacion', () => {
    // El borrado de usuario es logico: el RESTRICT solo salta en un borrado fisico, y ahi tiene que
    // ser ruidoso en vez de arrastrar los enlaces.
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

    // Sin la FK, un enlace podria apuntar a nadie.
    const sinFk = upSource.replace(
      /ALTER TABLE "credential_setup_tokens" ADD CONSTRAINT "credential_setup_tokens_user_id_fkey"[^;]*;/,
      '',
    )
    expect(sinFk, 'la mutacion no quito la FK').not.toBe(upSource)
    expect(foreignKey(sinFk, 'credential_setup_tokens_user_id_fkey')).toBeNull()
  })
})

describe('migration.sql — la huella es unica y el lado hijo de la FK esta indexado', () => {
  it('crea el indice unico de la huella y el indice de user_id', () => {
    // Unico en `token_digest`: comprobar un enlace es una busqueda por indice y no un recorrido.
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
    // Sin el `WHERE`, el enlace consumido o sustituido seguiria ocupando la ranura y nadie
    // recibiria un segundo enlace.
    const total = upSource.replace(
      '  ON "credential_setup_tokens" ("user_id")\n' +
        '  WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;',
      '  ON "credential_setup_tokens" ("user_id");',
    )
    expect(total, 'la mutacion no quito el WHERE').not.toBe(upSource)
    expect(liveLinkIndex(total)?.parcialSoloVivos).toBe(false)
    expect(liveLinkIndex(total)?.unicoPorUsuario).toBe(true)

    // Con una sola condicion, solo uno de los dos estados liberaria la ranura.
    const medioWhere = upSource.replace(
      'WHERE "consumed_at" IS NULL AND "superseded_at" IS NULL;',
      'WHERE "consumed_at" IS NULL;',
    )
    expect(medioWhere, 'la mutacion no recorto el WHERE').not.toBe(upSource)
    expect(liveLinkIndex(medioWhere)?.parcialSoloVivos).toBe(false)

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

    // Con una segunda columna, la unicidad dejaria de ser por persona.
    const compuesto = upSource.replace(
      'ON "credential_setup_tokens" ("user_id")\n',
      'ON "credential_setup_tokens" ("user_id", "token_digest")\n',
    )
    expect(compuesto, 'la mutacion no anadio la segunda columna').not.toBe(upSource)
    expect(liveLinkIndex(compuesto)?.unicoPorUsuario).toBe(false)
    expect(liveLinkIndex(compuesto)?.parcialSoloVivos).toBe(true)
  })

  it('el predicado NO usa now(): un indice con una funcion no inmutable no existe', () => {
    // Postgres rechaza en el predicado de un indice las funciones no inmutables como `now()`: por
    // eso un enlace caducado ocupa la ranura hasta que el reenvio lo sustituye.
    const parcial = findStatement(up, /"credential_setup_tokens_one_live_per_user"/)
    expect(parcial).not.toMatch(/now\(\)/i)
    expect(parcial).not.toMatch(/CURRENT_TIMESTAMP/i)
    expect(parcial).not.toMatch(/expires_at/i)
  })
})

describe('migration.sql — la tabla nace con RLS activada y forzada, y sin ninguna policy', () => {
  it('queda con ENABLE y con FORCE (R35)', () => {
    expect(hasRlsEnabledAndForced(upSource, 'credential_setup_tokens')).toBe(true)
  })

  it('SENSIBILIDAD — sin el FORCE, el dueno de la tabla ignora la RLS entera', () => {
    // Prisma conecta como dueno, y Postgres no le aplica la RLS salvo con `FORCE`.
    const sinForce = upSource.replace(
      'ALTER TABLE "credential_setup_tokens" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'credential_setup_tokens')).toBe(false)

    const sinEnable = upSource.replace(
      'ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'credential_setup_tokens')).toBe(false)
  })

  it('no declara ninguna policy: la autorizacion vive en el service (R35)', () => {
    expect(policyStatements(upSource)).toEqual([])
    const conPolicy = `${upSource}\nCREATE POLICY "p" ON "credential_setup_tokens" USING (true);`
    expect(policyStatements(conPolicy)).toHaveLength(1)
  })

  it('los ALTER de RLS son el ultimo bloque del archivo, y subirlos lo tumba', () => {
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)

    const rlsArriba = `ALTER TABLE "credential_setup_tokens" ENABLE ROW LEVEL SECURITY;\n${upSource}`
    expect(rowLevelSecurityGoesLast(rlsArriba), 'un RLS al principio deberia caer').toBe(false)

    const ddlDetras = `${upSource}\nCREATE INDEX "credential_setup_tokens_expires_at_idx" ON "credential_setup_tokens"("expires_at");`
    expect(rowLevelSecurityGoesLast(ddlDetras)).toBe(false)
  })
})

describe('migration.sql — esta migracion no toca users ni ninguna tabla ajena (R37)', () => {
  it('no ejecuta ningun DDL cuyo sujeto sea `users`', () => {
    // La FK nombra `users` en su `REFERENCES`, pero su sujeto es la tabla nueva: por eso se mira el
    // sujeto y no la mencion.
    expect(ddlStatementsOn(upSource, 'users')).toEqual([])

    const conColumna = `${upSource}\nALTER TABLE "users" ADD COLUMN "credential_setup_token_id" UUID;`
    expect(ddlStatementsOn(conColumna, 'users')).toHaveLength(1)
    const conIndice = `${upSource}\nCREATE INDEX "users_account_status_idx" ON "users"("account_status");`
    expect(ddlStatementsOn(conIndice, 'users')).toHaveLength(1)
    // `migrate dev` emite este `DROP` por el drift de `users`.
    const conDrift = `${upSource}\nALTER TABLE "users" DROP CONSTRAINT "users_account_status_changed_by_fkey";`
    expect(ddlStatementsOn(conDrift, 'users')).toHaveLength(1)
    expect(ddlStatementsOn(`${upSource}\n-- ALTER TABLE "users" ...`, 'users')).toEqual([])
  })

  it('no menciona ninguno de los tres indices unicos de QC-47 (R37)', () => {
    // Son parciales, escritos a mano y drift para Prisma: un `DROP INDEX` colado aqui se llevaria en
    // silencio la unicidad del correo, del nombre de usuario o del documento.
    for (const indice of ['users_email_unique', 'users_username_unique', 'users_document_unique']) {
      expect(statementsMentioning(upSource, indice), `no debe mencionar ${indice}`).toEqual([])
    }

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
    expect(isEnglishSnakeCase('credential_setup_tokens')).toBe(true)
    expect(isEnglishSnakeCase('superseded_at')).toBe(true)
  })
})

describe('down.sql — revertir deja el esquema exactamente como estaba', () => {
  it('borra el indice parcial y la tabla, y nada mas: dos sentencias', () => {
    expect(down).toEqual([
      'DROP INDEX IF EXISTS "credential_setup_tokens_one_live_per_user"',
      'DROP TABLE IF EXISTS "credential_setup_tokens"',
    ])
  })

  it('no toca `users` en ninguna linea ejecutable (R37)', () => {
    // El UP no toca `users`: cualquier linea aqui la dejaria distinta y el rollback terminaria en
    // verde.
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

describe('db/schema.prisma — el modelo nuevo es de identity y no se lleva la unicidad al esquema', () => {
  it('CredentialSetupToken declara su dueno (`/// @module identity`)', () => {
    expect(moduleOwnerOf(rawSchema, 'CredentialSetupToken')).toBe('identity')

    const sinDueno = rawSchema.replace(
      /\/\/\/ @module identity\n((?:\/\/\/[^\n]*\n)*model CredentialSetupToken \{)/,
      '$1',
    )
    expect(sinDueno, 'la mutacion no quito el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(sinDueno, 'CredentialSetupToken')).toBeNull()
  })

  it('no declara ningun @@unique ni @unique de userId (R11)', () => {
    expect(userUniquesIn(rawSchema, 'CredentialSetupToken')).toEqual([])

    const conUnique = mutateModel(
      rawSchema,
      'CredentialSetupToken',
      '  @@unique([tokenDigest], map: "credential_setup_tokens_token_digest_key")',
      '  @@unique([tokenDigest], map: "credential_setup_tokens_token_digest_key")\n  @@unique([userId])',
    )
    expect(conUnique, 'la mutacion no anadio el @@unique').not.toBe(rawSchema)
    expect(userUniquesIn(conUnique, 'CredentialSetupToken')).toEqual(['[userId]'])

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
    // `User` si la declara: asi el patron de arriba puede fallar.
    expect(modelBody(rawSchema, 'User') as string).toMatch(/companyId/)
  })
})
