// T6 — Contrato estatico del esquema y de la migracion del grupo de trabajo (QC-83).
//
// Lo que se vigila aqui NO lo regenera Prisma nunca y NO se ve en el cliente generado
// (`design.md > 2.2` y `> 3.1`): el indice unico del nombre —COMPUESTO con la empresa,
// FUNCIONAL y PARCIAL—, las DOS FK COMPUESTAS de la pertenencia con `company_id` dentro, el
// sitio de los `ALTER ... ROW LEVEL SECURITY`, y un `down.sql` que no escribe ni una fila.
//
// Los cuatro puntos mas fragiles de la ficha, y por que un test es lo unico que se entera:
//
//   1. LAS DOS FK COMPUESTAS (riesgo n.o 1, R14). Si alguien las escribe simples
//      —`FOREIGN KEY ("user_id") REFERENCES "users"("id")`— el esquema sigue validando, el
//      cliente sigue compilando y toda la suite sigue verde: la decision cerrada 1 deja de
//      existir en silencio hasta que QC-88 liste pedidos ajenos.
//   2. EL INDICE UNICO DEL NOMBRE (R4, R5, R6). Es COMPUESTO, FUNCIONAL y PARCIAL, y Prisma no
//      modela ninguna de las tres cosas: solo existe en este `migration.sql`. Quitarle el
//      `WHERE` mata R6 sin ningun error; quitarle `company_id` mata R5 igual de callado.
//   3. UN `@@unique` DE NOMBRE EN `WorkGroup` (riesgo 3). Convertiria la unicidad en TOTAL sin
//      que nadie se entere y un grupo dado de baja quemaria su nombre para siempre.
//   4. UN `deleted_at` EN LA PERTENENCIA (riesgo 4, R18). Es justo lo que la decision cerrada 4
//      descarto, y ademas rompe la PK.
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto (el SQL o el
// `.prisma`) y devuelve el veredicto, y se aplica DOS VECES: al archivo real y a una version
// MUTADA EN MEMORIA — el archivo en disco NO se toca. Un test que no puede fallar no vigila
// nada; es el mismo patron de `tests/unit/identity/schema/companies-migration.test.ts`.

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
const workGroupDirs = readdirSync(migrationsDir).filter((name) => /_work_groups_and_/.test(name))
expect(workGroupDirs, 'debe existir exactamente una migracion de los grupos').toHaveLength(1)
const migrationDir = join(migrationsDir, workGroupDirs[0] as string)

// --- Lectura y troceado del SQL ------------------------------------------------------------

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. La
 * cabecera de esta migracion nombra a proposito `orders`, `products`, `users` y las FK que se
 * borraron a mano —para decir que no se tocan—, asi que mirar el texto crudo daria falsos
 * positivos en todas las afirmaciones en negativo de mas abajo.
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

// --- Predicados puros: el indice unico del nombre (R4, R5, R6) -----------------------------

/** Las tres propiedades de `work_groups_name_unique`, por separado para poder mutarlas. */
export interface IndiceDeNombre {
  /** R5: lleva `company_id` dentro, asi que dos empresas pueden tener cada una su «Turno noche». */
  readonly compuesto: boolean
  /** R4: es FUNCIONAL (`lower(...)`), asi que la unicidad no depende del llamante. */
  readonly funcional: boolean
  /** R6: es PARCIAL, asi que un grupo dado de baja libera su nombre. */
  readonly parcial: boolean
}

/**
 * R4, R5, R6. Las tres propiedades del indice unico del nombre, leidas del SQL. Se devuelven
 * por separado a proposito: un unico booleano no distinguiria cual de las tres se perdio, y
 * cada una muere de una forma distinta y en silencio.
 */
export function workGroupNameIndex(sql: string): IndiceDeNombre | null {
  const encontrados = statements(sql).filter((statement) =>
    /^CREATE UNIQUE INDEX "work_groups_name_unique"/i.test(statement),
  )
  if (encontrados.length !== 1) return null
  const indice = encontrados[0] as string
  // Las columnas son todo lo que va detras de la tabla y delante del `WHERE`. Se recorta asi
  // —y no con un patron de parentesis— para que las tres propiedades sean INDEPENDIENTES: si
  // se leyeran juntas, quitar el `lower(...)` tumbaria tambien `compuesto` y la mutacion no
  // demostraria lo que dice demostrar.
  const sinWhere = indice.replace(/ WHERE .*$/i, '')
  const columnas = sinWhere.slice(sinWhere.indexOf('ON "work_groups"'))
  return {
    compuesto: /"company_id"\s*,/i.test(columnas),
    funcional: /lower\(\s*"name_normalized"\s*\)/i.test(columnas),
    parcial: /WHERE "deleted_at" IS NULL$/i.test(indice),
  }
}

// --- Predicados puros: las claves foraneas -------------------------------------------------

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
    const found = new RegExp(`ON ${evento} (CASCADE|RESTRICT|SET NULL|SET DEFAULT|NO ACTION)`, 'i')
      .exec(cola)
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

/**
 * R14, riesgo n.o 1. ¿La clave foranea es COMPUESTA y lleva `company_id` en las DOS columnas,
 * la referenciante y la referenciada? Es lo unico que separa la garantia de la base de una
 * comprobacion que alguien puede olvidarse de llamar.
 */
export function carriesCompanyOnBothSides(fk: ClaveForanea | null): boolean {
  if (fk === null) return false
  return (
    fk.columnas.length === 2 &&
    fk.columnasReferenciadas.length === 2 &&
    fk.columnas.includes('company_id') &&
    fk.columnasReferenciadas.includes('company_id')
  )
}

// --- Predicados puros: columnas, orden, RLS y DDL ajeno ------------------------------------

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

/**
 * `design.md > 3.1` paso 4. ¿Los dos indices unicos auxiliares se crean ANTES que las FK
 * compuestas que apuntan a ellos? Sin restriccion unica sobre exactamente esas columnas en el
 * padre, Postgres responde `42830` y la migracion no aplica.
 */
export function auxiliaryUniqueIndexesComeFirst(sql: string): boolean {
  const source = statements(sql)
  const posicion = (pattern: RegExp): number => source.findIndex((s) => pattern.test(s))
  const dianas = [
    posicion(/^CREATE UNIQUE INDEX "work_groups_id_company_id_key"/i),
    posicion(/^CREATE UNIQUE INDEX "users_id_company_id_key"/i),
  ]
  const primeraFkCompuesta = source.findIndex((statement) =>
    /ADD CONSTRAINT "work_group_members_\w+_fkey" FOREIGN KEY \("\w+", "company_id"\)/i.test(
      statement,
    ),
  )
  if (primeraFkCompuesta === -1 || dianas.includes(-1)) return false
  return dianas.every((diana) => diana < primeraFkCompuesta)
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

/**
 * R24 y `design.md > 3.1` paso 8. ¿Los `ALTER ... ROW LEVEL SECURITY` son el ULTIMO bloque del
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
 * R26. ¿El SQL escribe alguna fila? `ON DELETE` no cuenta: es parte de la definicion de una
 * clave foranea, no una escritura.
 */
export function writesRows(sql: string): boolean {
  const ejecutable = stripSqlComments(sql).replace(/\s+/g, ' ')
  // `ON DELETE` y `ON UPDATE` son parte de la definicion de una clave foranea, no escrituras.
  return /(?<!ON )\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(ejecutable)
}

/** Las tablas que un `DROP TABLE` se lleva, en el orden en que caen. */
export function droppedTables(sql: string): readonly string[] {
  return statements(sql)
    .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** `design.md > 3.3` paso 1: ningun `DROP TABLE` lleva `CASCADE`. El fallo debe ser ruidoso. */
export function dropsWithCascade(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /^DROP TABLE .*\bCASCADE\b/i.test(statement))
}

// --- Predicados puros: el idioma de los identificadores (R12) -------------------------------

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
 * Vocabulario ingles admitido para los identificadores de esta feature (R12). Cada
 * identificador se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista cerrada a proposito, con el precedente de
 * `tests/unit/inventario/schema/inventario-migration.test.ts`: una columna nueva obliga a pasar
 * por aqui, y una en espanol (`grupo`, `pertenencia`, `empresa`) no encuentra sus piezas y cae.
 * Un patron `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'at',
  'company',
  'created',
  'deleted',
  'fkey',
  'group',
  'groups',
  'id',
  'idx',
  'key',
  'members',
  'name',
  'normalized',
  'pkey',
  'unique',
  'updated',
  'user',
  'users',
  'work',
])

/** R12. ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? */
export function isEnglishSnakeCase(identifier: string): boolean {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) return false
  return identifier.split('_').every((pieza) => VOCABULARIO_INGLES.has(pieza))
}

// --- Predicados puros: el esquema de Prisma ------------------------------------------------

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
 * R22. El modulo declarado JUSTO ENCIMA del modelo, o `null` si no lo tiene. Se lee del texto
 * CRUDO: `/// @module` ES un comentario, y es justo lo que se vigila. Un modelo sin dueno —o
 * con otro— es ademas un hallazgo de `tests/guards/guard-arquitectura-modulos.test.ts`.
 */
export function moduleOwnerOf(schema: string, model: string): string | null {
  const match = new RegExp(`/// @module (\\w+)\\nmodel ${model} \\{`).exec(schema)
  return match === null ? null : (match[1] as string)
}

/**
 * Riesgo 3. Toda declaracion de unicidad del modelo que nombre el NOMBRE del grupo, sea
 * `@@unique([companyId, nameNormalized])` o un `@unique` en la propia columna. Tiene que
 * quedar vacia: la unicidad del nombre es COMPUESTA, FUNCIONAL y PARCIAL, y solo existe en el
 * `migration.sql`. Un `@@unique` aqui la volveria TOTAL sin ningun error y R6 moriria callado.
 */
export function nameUniquesIn(schema: string, model: string): readonly string[] {
  const body = modelBody(schema, model)
  if (body === null) return []
  const compuestos = [...body.matchAll(/@@unique\(([^\n]*)\)/g)]
    .map((match) => (match[1] as string).trim())
    .filter((args) => /name/i.test(args))
  const enColumna = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^name\w*\s/i.test(line) && /@unique/.test(line))
  return [...compuestos, ...enColumna]
}

/** Todas las declaraciones `@@unique(...)` del modelo, tal como estan escritas. */
export function uniqueDeclarationsIn(schema: string, model: string): readonly string[] {
  const body = modelBody(schema, model)
  if (body === null) return []
  return [...body.matchAll(/@@unique\(([^\n]*)\)/g)].map((match) => (match[1] as string).trim())
}

/** R18, riesgo 4. ¿El modelo declara marca de baja logica? En la pertenencia NO puede. */
export function modelDeclaresDeletedAt(schema: string, model: string): boolean {
  const body = modelBody(schema, model)
  if (body === null) return false
  return /\bdeletedAt\b/.test(body) || /deleted_at/.test(body)
}

/**
 * Mutacion EN MEMORIA acotada a UN modelo del esquema. Sin esto, un `replace` a secas sobre el
 * texto del `.prisma` cae en el primer modelo que comparta la linea —`Company` declara el mismo
 * `nameNormalized`, y media docena de modelos el mismo `updatedAt`— y la mutacion no tocaria el
 * modelo que se pretende romper: el test seguiria verde por la razon equivocada.
 */
function mutateModel(schema: string, model: string, from: string, to: string): string {
  const inicio = schema.indexOf(`model ${model} {`)
  if (inicio === -1) return schema
  const fin = schema.indexOf('\n}', inicio)
  if (fin === -1) return schema
  const bloque = schema.slice(inicio, fin)
  return schema.slice(0, inicio) + bloque.replace(from, to) + schema.slice(fin)
}

// === El UP: el indice unico del nombre =====================================================

describe('migration.sql — el nombre del grupo es unico dentro de la empresa, y solo entre los vivos', () => {
  it('el indice del nombre es compuesto con la empresa, funcional y parcial a la vez', () => {
    // R4, R5 y R6. Prisma no modela ninguna de las tres cosas: este indice solo existe aqui.
    expect(workGroupNameIndex(upSource)).toEqual({
      compuesto: true,
      funcional: true,
      parcial: true,
    })
    expect(findStatement(up, /^CREATE UNIQUE INDEX "work_groups_name_unique"/i)).toBe(
      'CREATE UNIQUE INDEX "work_groups_name_unique" ON "work_groups" ' +
        '("company_id", lower("name_normalized")) WHERE "deleted_at" IS NULL',
    )
  })

  it('quitarle la empresa lo tumba: dos empresas dejarian de poder tener su Turno noche (R5)', () => {
    // Mutacion EN MEMORIA; el archivo en disco no se toca.
    const sinEmpresa = upSource.replace(
      'ON "work_groups" ("company_id", lower("name_normalized"))',
      'ON "work_groups" (lower("name_normalized"))',
    )
    expect(sinEmpresa, 'la mutacion no quito company_id').not.toBe(upSource)
    expect(workGroupNameIndex(sinEmpresa)?.compuesto).toBe(false)
    expect(workGroupNameIndex(sinEmpresa)?.funcional).toBe(true)
    expect(workGroupNameIndex(sinEmpresa)?.parcial).toBe(true)
  })

  it('quitarle el lower(...) lo tumba: la unicidad dependeria del llamante (R4)', () => {
    const sinLower = upSource.replace(
      'ON "work_groups" ("company_id", lower("name_normalized")) WHERE',
      'ON "work_groups" ("company_id", "name_normalized") WHERE',
    )
    expect(sinLower, 'la mutacion no quito el lower').not.toBe(upSource)
    expect(workGroupNameIndex(sinLower)?.funcional).toBe(false)
    // Y las otras dos propiedades siguen en pie: la mutacion es quirurgica y cada propiedad se
    // vigila por separado.
    expect(workGroupNameIndex(sinLower)?.compuesto).toBe(true)
    expect(workGroupNameIndex(sinLower)?.parcial).toBe(true)
  })

  it('quitarle el WHERE lo tumba: un grupo de baja quemaria su nombre para siempre (R6)', () => {
    const total = upSource.replace(
      'ON "work_groups" ("company_id", lower("name_normalized")) WHERE "deleted_at" IS NULL;',
      'ON "work_groups" ("company_id", lower("name_normalized"));',
    )
    expect(total, 'la mutacion no quito el WHERE').not.toBe(upSource)
    expect(workGroupNameIndex(total)?.parcial).toBe(false)
    expect(workGroupNameIndex(total)?.compuesto).toBe(true)
    expect(workGroupNameIndex(total)?.funcional).toBe(true)

    // Y si desaparece entero, tampoco pasa: un indice ausente y uno relajado son la misma cosa
    // para un assert distraido.
    const sinIndice = upSource.replace(/CREATE UNIQUE INDEX "work_groups_name_unique"[^;]*;/, '')
    expect(sinIndice, 'la mutacion no quito el indice').not.toBe(upSource)
    expect(workGroupNameIndex(sinIndice)).toBeNull()
  })
})

// === El UP: las dos FK compuestas, el corazon de la ficha ==================================

describe('migration.sql — la base impide que alguien de la empresa A entre en un grupo de la B', () => {
  it('las dos claves foraneas de la pertenencia llevan company_id en los dos lados (R14)', () => {
    const haciaElGrupo = foreignKey(upSource, 'work_group_members_work_group_id_fkey')
    const haciaLaPersona = foreignKey(upSource, 'work_group_members_user_id_fkey')

    expect(carriesCompanyOnBothSides(haciaElGrupo), 'la FK del grupo no es compuesta').toBe(true)
    expect(carriesCompanyOnBothSides(haciaLaPersona), 'la FK de la persona no es compuesta').toBe(
      true,
    )
    expect(haciaElGrupo?.columnas).toEqual(['work_group_id', 'company_id'])
    expect(haciaElGrupo?.tablaReferenciada).toBe('work_groups')
    expect(haciaElGrupo?.columnasReferenciadas).toEqual(['id', 'company_id'])
    expect(haciaLaPersona?.columnas).toEqual(['user_id', 'company_id'])
    expect(haciaLaPersona?.tablaReferenciada).toBe('users')
    expect(haciaLaPersona?.columnasReferenciadas).toEqual(['id', 'company_id'])
  })

  it('simplificarlas a dos FK simples las tumba, que es el riesgo n.o 1 de la ficha', () => {
    // Es la mutacion mas silenciosa que existe en esta ficha: el esquema sigue validando, el
    // cliente sigue compilando y la decision cerrada 1 deja de existir. Este test es lo unico
    // que se pone rojo.
    const simple = upSource.replace(
      /ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_user_id_fkey"[^;]*;/,
      'ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_user_id_fkey" ' +
        'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    )
    expect(simple, 'la mutacion no simplifico la FK de la persona').not.toBe(upSource)
    expect(carriesCompanyOnBothSides(foreignKey(simple, 'work_group_members_user_id_fkey'))).toBe(
      false,
    )

    const simpleGrupo = upSource.replace(
      /ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_work_group_id_fkey"[^;]*;/,
      'ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_work_group_id_fkey" ' +
        'FOREIGN KEY ("work_group_id") REFERENCES "work_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    )
    expect(simpleGrupo, 'la mutacion no simplifico la FK del grupo').not.toBe(upSource)
    expect(
      carriesCompanyOnBothSides(foreignKey(simpleGrupo, 'work_group_members_work_group_id_fkey')),
    ).toBe(false)

    // Y dejar `company_id` solo en el lado referenciante tampoco vale: la garantia es la
    // igualdad de las DOS columnas, no la presencia de una.
    const mediaFk = upSource.replace(
      'FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")',
      'FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "id")',
    )
    expect(mediaFk, 'la mutacion no toco el lado referenciado').not.toBe(upSource)
    expect(carriesCompanyOnBothSides(foreignKey(mediaFk, 'work_group_members_user_id_fkey'))).toBe(
      false,
    )
  })

  it('borrar el grupo arrastra sus pertenencias y borrar a la persona hace ruido', () => {
    // `design.md > 2.1`: CASCADE hacia el grupo —la pertenencia es PARTE del grupo— y RESTRICT
    // hacia la persona —un DELETE sobre `users` es ya una anomalia en este ERP—. El
    // `ON UPDATE CASCADE` de las dos es lo que cierra R15.
    const haciaElGrupo = foreignKey(upSource, 'work_group_members_work_group_id_fkey')
    const haciaLaPersona = foreignKey(upSource, 'work_group_members_user_id_fkey')
    expect(haciaElGrupo?.onDelete).toBe('CASCADE')
    expect(haciaElGrupo?.onUpdate).toBe('CASCADE')
    expect(haciaLaPersona?.onDelete).toBe('RESTRICT')
    expect(haciaLaPersona?.onUpdate).toBe('CASCADE')

    // Sensibilidad: intercambiarlos cae. Con RESTRICT hacia el grupo, un borrado fisico dejaria
    // pertenencias huerfanas; con CASCADE hacia la persona, borrar a alguien se llevaria sus
    // pertenencias sin hacer ruido.
    const intercambiados = upSource
      .replace(
        'REFERENCES "work_groups"("id", "company_id") ON DELETE CASCADE',
        'REFERENCES "work_groups"("id", "company_id") ON DELETE RESTRICT',
      )
      .replace(
        'REFERENCES "users"("id", "company_id") ON DELETE RESTRICT',
        'REFERENCES "users"("id", "company_id") ON DELETE CASCADE',
      )
    expect(intercambiados, 'la mutacion no intercambio los ON DELETE').not.toBe(upSource)
    expect(foreignKey(intercambiados, 'work_group_members_work_group_id_fkey')?.onDelete).toBe(
      'RESTRICT',
    )
    expect(foreignKey(intercambiados, 'work_group_members_user_id_fkey')?.onDelete).toBe('CASCADE')
  })

  it('el grupo apunta a su empresa con RESTRICT, y no se puede borrar una empresa con grupos', () => {
    // R8, R9, R10. Esta si la genera Prisma, pero el `ON DELETE` es lo que hace que borrar una
    // empresa con grupos —vivos o de baja— falle con 23503 en vez de llevarselos por delante.
    const fk = foreignKey(upSource, 'work_groups_company_id_fkey')
    expect(fk?.tabla).toBe('work_groups')
    expect(fk?.columnas).toEqual(['company_id'])
    expect(fk?.tablaReferenciada).toBe('companies')
    expect(fk?.onDelete).toBe('RESTRICT')
    expect(fk?.onUpdate).toBe('CASCADE')

    const conCascade = upSource.replace(
      'REFERENCES "companies"("id") ON DELETE RESTRICT',
      'REFERENCES "companies"("id") ON DELETE CASCADE',
    )
    expect(conCascade, 'la mutacion no cambio el ON DELETE').not.toBe(upSource)
    expect(foreignKey(conCascade, 'work_groups_company_id_fkey')?.onDelete).toBe('CASCADE')
  })

  it('los dos indices unicos auxiliares se crean antes que las FK compuestas', () => {
    // `design.md > 3.1` paso 4: sin ellos, una FK compuesta falla con 42830 y la migracion no
    // aplica. El orden no es cosmetico.
    expect(auxiliaryUniqueIndexesComeFirst(upSource)).toBe(true)
    findStatement(
      up,
      /^CREATE UNIQUE INDEX "work_groups_id_company_id_key" ON "work_groups"\("id", "company_id"\)$/i,
    )

    // Sensibilidad: colar las dos FK compuestas por delante de todo tumba el predicado.
    const fksDelante =
      'ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_user_id_fkey" ' +
      'FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id");\n'
    expect(auxiliaryUniqueIndexesComeFirst(`${fksDelante}${upSource}`)).toBe(false)

    // Y quitar una diana tambien: la FK se queda sin restriccion unica a la que apuntar.
    const sinDiana = upSource.replace(
      /CREATE UNIQUE INDEX "users_id_company_id_key"[^;]*;/,
      '',
    )
    expect(sinDiana, 'la mutacion no quito la diana').not.toBe(upSource)
    expect(auxiliaryUniqueIndexesComeFirst(sinDiana)).toBe(false)
  })
})

// === El UP: las columnas de las dos tablas =================================================

describe('migration.sql — las columnas que crean las dos tablas nuevas', () => {
  it('el nombre del grupo es TEXT obligatorio y sin tope de longitud en la columna (R2)', () => {
    // Decision cerrada 9: el tope vive en el `zod` de QC-84, no en el tipo, para que cambiarlo
    // no sea una migracion.
    const columnas = tableColumns(upSource, 'work_groups')
    expect(columnas.get('name')).toBe('"name" TEXT NOT NULL')
    expect(columnas.get('name_normalized')).toBe('"name_normalized" TEXT NOT NULL')

    // Sensibilidad: un `VARCHAR(n)` mete el tope en la columna y cae.
    const conTope = upSource.replace('"name" TEXT NOT NULL', '"name" VARCHAR(120) NOT NULL')
    expect(conTope, 'la mutacion no puso el varchar').not.toBe(upSource)
    expect(tableColumns(conTope, 'work_groups').get('name')).toBe('"name" VARCHAR(120) NOT NULL')

    // Y un nombre anulable tampoco: R2 es que lo rechace LA BASE.
    const anulable = upSource.replace('"name" TEXT NOT NULL', '"name" TEXT')
    expect(anulable, 'la mutacion no quito el NOT NULL').not.toBe(upSource)
    expect(tableColumns(anulable, 'work_groups').get('name')).not.toMatch(/NOT NULL/i)
  })

  it('la empresa del grupo es obligatoria en la propia base (R8)', () => {
    expect(tableColumns(upSource, 'work_groups').get('company_id')).toBe(
      '"company_id" UUID NOT NULL',
    )
    const anulable = upSource.replace(
      '"company_id" UUID NOT NULL,\n    "created_at"',
      '"company_id" UUID,\n    "created_at"',
    )
    expect(anulable, 'la mutacion no quito el NOT NULL de la empresa').not.toBe(upSource)
    expect(tableColumns(anulable, 'work_groups').get('company_id')).toBe('"company_id" UUID')
  })

  it('el grupo nace con id uuid generado por la base y con su marca de baja vacia (R1, R7)', () => {
    const columnas = tableColumns(upSource, 'work_groups')
    expect(columnas.get('id')).toBe('"id" UUID NOT NULL DEFAULT gen_random_uuid()')
    // Anulable a proposito: nace vacia y nadie la escribe en esta ficha.
    expect(columnas.get('deleted_at')).toBe('"deleted_at" TIMESTAMPTZ(6)')
  })

  it('las tres columnas de referencia de la pertenencia son obligatorias (R13)', () => {
    const columnas = tableColumns(upSource, 'work_group_members')
    for (const columna of ['work_group_id', 'user_id', 'company_id']) {
      expect(columnas.get(columna), `falta ${columna}`).toBe(`"${columna}" UUID NOT NULL`)
    }

    // Sensibilidad: una columna de empresa anulable deja pasar la fila sin empresa y la
    // garantia de R14 se evapora para esa fila.
    const anulable = upSource.replace(
      '"company_id" UUID NOT NULL,\n    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "updated_at" TIMESTAMPTZ(6) NOT NULL,\n\n    CONSTRAINT "work_group_members_pkey"',
      '"company_id" UUID,\n    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "updated_at" TIMESTAMPTZ(6) NOT NULL,\n\n    CONSTRAINT "work_group_members_pkey"',
    )
    expect(anulable, 'la mutacion no quito el NOT NULL de la pertenencia').not.toBe(upSource)
    expect(tableColumns(anulable, 'work_group_members').get('company_id')).toBe(
      '"company_id" UUID',
    )
  })

  it('las dos tablas nuevas registran cuando se creo la fila y cuando se modifico (R11)', () => {
    for (const tabla of ['work_groups', 'work_group_members']) {
      const columnas = tableColumns(upSource, tabla)
      expect(columnas.get('created_at'), `${tabla}.created_at`).toBe(
        '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      )
      // `updated_at` es NOT NULL SIN default de base: lo rellena `@updatedAt` del cliente.
      expect(columnas.get('updated_at'), `${tabla}.updated_at`).toBe(
        '"updated_at" TIMESTAMPTZ(6) NOT NULL',
      )
    }

    // Sensibilidad: quitar una de las cuatro cae, y el predicado la localiza por tabla.
    const sinMarca = upSource.replace(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    "updated_at" TIMESTAMPTZ(6) NOT NULL,\n\n    CONSTRAINT "work_group_members_pkey"',
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n    CONSTRAINT "work_group_members_pkey"',
    )
    expect(sinMarca, 'la mutacion no quito el updated_at').not.toBe(upSource)
    expect(tableColumns(sinMarca, 'work_group_members').has('updated_at')).toBe(false)
    // Y la del grupo sigue estando: la mutacion es quirurgica, no un borrado a lo bruto.
    expect(tableColumns(sinMarca, 'work_groups').has('updated_at')).toBe(true)
  })

  it('la pertenencia no declara ninguna marca de baja logica (R18)', () => {
    // Decision cerrada 4: sacar a alguien BORRA la fila. Es la excepcion explicita al borrado
    // logico de QC-4, y anadirla aqui romperia ademas la PK.
    const columnas = tableColumns(upSource, 'work_group_members')
    expect([...columnas.keys()]).toEqual([
      'work_group_id',
      'user_id',
      'company_id',
      'created_at',
      'updated_at',
    ])
    expect(columnas.has('deleted_at')).toBe(false)

    // Sensibilidad: anadirla cae. El grupo SI la tiene, asi que la afirmacion no es un
    // `expect(false)` disfrazado sobre un archivo que no la menciona en ninguna parte.
    const conBaja = upSource.replace(
      '"updated_at" TIMESTAMPTZ(6) NOT NULL,\n\n    CONSTRAINT "work_group_members_pkey"',
      '"updated_at" TIMESTAMPTZ(6) NOT NULL,\n    "deleted_at" TIMESTAMPTZ(6),\n\n    CONSTRAINT "work_group_members_pkey"',
    )
    expect(conBaja, 'la mutacion no anadio el deleted_at').not.toBe(upSource)
    expect(tableColumns(conBaja, 'work_group_members').has('deleted_at')).toBe(true)
    expect(tableColumns(upSource, 'work_groups').has('deleted_at')).toBe(true)
  })

  it('la misma persona no puede estar dos veces en el mismo grupo (R16)', () => {
    // La PK compuesta es la garantia, y su indice cubre ademas «quienes estan en este grupo».
    expect(findStatement(up, /^CREATE TABLE "work_group_members"/i)).toMatch(
      /CONSTRAINT "work_group_members_pkey" PRIMARY KEY \("work_group_id","user_id"\)/i,
    )
  })
})

// === El UP: la RLS y lo que NO toca ========================================================

describe('migration.sql — las dos tablas nuevas nacen con RLS activada y forzada', () => {
  it('las dos quedan con ENABLE y con FORCE (R24)', () => {
    for (const tabla of ['work_groups', 'work_group_members']) {
      expect(hasRlsEnabledAndForced(upSource, tabla), `${tabla} sin ENABLE + FORCE`).toBe(true)
    }

    // Sensibilidad: sin `FORCE`, el dueno de la tabla —que es con quien se conecta Prisma— la
    // ignora entera y la defensa en profundidad no defiende de nada.
    const sinForce = upSource.replace(
      'ALTER TABLE "work_group_members" FORCE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, 'work_group_members')).toBe(false)
    expect(hasRlsEnabledAndForced(sinForce, 'work_groups')).toBe(true)

    const sinEnable = upSource.replace('ALTER TABLE "work_groups" ENABLE ROW LEVEL SECURITY;', '')
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, 'work_groups')).toBe(false)
  })

  it('los ALTER de RLS son el ultimo bloque del archivo, y subirlos lo tumba', () => {
    // `design.md > 3.1` paso 8: `FORCE` sin policies deniega tambien al dueno cuando no es
    // superusuario, asi que una escritura futura colocada detras podria no escribir nada EN
    // SILENCIO. Por eso van los ultimos aunque esta migracion no escriba ni una fila.
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)

    const rlsArriba = `ALTER TABLE "work_groups" ENABLE ROW LEVEL SECURITY;\n${upSource}`
    expect(rowLevelSecurityGoesLast(rlsArriba), 'un RLS al principio deberia caer').toBe(false)

    // Y cualquier DDL colado detras de los ALTER tambien: es el caso real que esto vigila.
    const ddlDetras = `${upSource}\nCREATE INDEX "work_groups_name_idx" ON "work_groups"("name");`
    expect(rowLevelSecurityGoesLast(ddlDetras)).toBe(false)
  })
})

describe('migration.sql — lo que esta migracion NO toca', () => {
  it('no ejecuta DDL sobre ninguna tabla de otro modulo (R23)', () => {
    // La cabecera del archivo NOMBRA estas tablas a proposito, para dejar escrito que sus
    // `DROP CONSTRAINT` se borraron a mano; por eso se afirma sobre el SQL ejecutable, con los
    // comentarios ya quitados.
    const ajenas = [
      'orders',
      'order_lines',
      'products',
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
    ]
    for (const tabla of ajenas) {
      expect(ddlStatementsOn(upSource, tabla), `no debe tocar ${tabla}`).toEqual([])
    }

    // Sensibilidad: un `DROP CONSTRAINT` por drift, escondido al final, cae...
    const conDrift = `${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_recipe_id_fkey";`
    expect(ddlStatementsOn(conDrift, 'orders')).toHaveLength(1)
    // ...y un `DROP INDEX` sobre una tabla ajena tambien.
    const sinIndiceAjeno = `${upSource}\nDROP INDEX "units_name_unique" ON "units";`
    expect(ddlStatementsOn(sinIndiceAjeno, 'units')).toHaveLength(1)
    // Pero nombrarlas en un comentario NO cae: hablar de ellas para decir que no se tocan vale.
    expect(ddlStatementsOn(`${upSource}\n-- ALTER TABLE "orders" ...`, 'orders')).toEqual([])
  })

  it('solo toca users para crear el indice unico que habilita la FK compuesta (R23)', () => {
    // La UNICA modificacion admitida sobre una tabla preexistente. No cambia ninguna columna,
    // no puede rechazar ninguna fila que hoy se acepte —`id` ya es la PK— y ninguna consulta
    // existente necesita cambiar para usarlo.
    expect(ddlStatementsOn(upSource, 'users')).toEqual([
      'CREATE UNIQUE INDEX "users_id_company_id_key" ON "users"("id", "company_id")',
    ])

    // Sensibilidad: cualquier otra linea sobre `users` cae, aunque sea inocente.
    const conColumna = `${upSource}\nALTER TABLE "users" ADD COLUMN "work_group_id" UUID;`
    expect(ddlStatementsOn(conColumna, 'users')).toHaveLength(2)
    const conRls = `${upSource}\nALTER TABLE "users" FORCE ROW LEVEL SECURITY;`
    expect(ddlStatementsOn(conRls, 'users')).toHaveLength(2)
  })

  it('no escribe ni una fila: las dos tablas nacen vacias (design.md > 3.2)', () => {
    expect(writesRows(upSource)).toBe(false)
    // Sensibilidad: el predicado no confunde el `ON DELETE`/`ON UPDATE` de una clave foranea
    // con una escritura...
    expect(
      writesRows(
        'ALTER TABLE "t" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "u"("a") ' +
          'ON DELETE CASCADE ON UPDATE CASCADE;',
      ),
    ).toBe(false)
    // ...pero si ve un seed colado al final.
    expect(writesRows(`${upSource}\nINSERT INTO "work_groups" ("name") VALUES ('Turno noche');`))
      .toBe(true)
  })

  it('crea exactamente las dos tablas de la ficha y ninguna mas', () => {
    const creadas = up
      .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => match[1] as string)
    expect(creadas).toEqual(['work_groups', 'work_group_members'])
    // Y no declara ninguna extension: `pgcrypto` ya existe y medio repo depende de ella.
    expect(up.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })

  it('nombra en ingles y en snake_case todo lo que crea (R12)', () => {
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(15)
    expect(identificadores).toContain('work_groups')
    expect(identificadores).toContain('work_group_members')
    expect(identificadores).toContain('name_normalized')
    expect(identificadores).toContain('work_group_members_user_id_fkey')
    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase', () => {
    // Sensibilidad de R12: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of [
      'grupos_de_trabajo',
      'pertenencia',
      'nombre_normalizado',
      'empresa_id',
      'miembros',
    ]) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('work_gróups')).toBe(false)
    expect(isEnglishSnakeCase('workGroups')).toBe(false)
    expect(isEnglishSnakeCase('WORK_GROUPS')).toBe(false)
    expect(isEnglishSnakeCase('work groups')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('work_group_members')).toBe(true)
    expect(isEnglishSnakeCase('name_normalized')).toBe(true)
  })
})

// === El DOWN ===============================================================================

describe('down.sql — revertir deja el esquema anterior y no pierde ningun dato', () => {
  it('no escribe, no modifica y no borra ninguna fila (R26)', () => {
    expect(writesRows(downSource)).toBe(false)

    // Sensibilidad: las tres formas de perder un dato al revertir caen.
    for (const escritura of [
      'DELETE FROM "users" WHERE "company_id" IS NULL;',
      'UPDATE "users" SET "company_id" = NULL;',
      `INSERT INTO "companies" ("name") VALUES ('QuimiCloud');`,
    ]) {
      expect(writesRows(`${downSource}\n${escritura}`), `${escritura} deberia caer`).toBe(true)
    }
  })

  it('la pertenencia cae antes que el grupo, y ningun DROP TABLE lleva CASCADE', () => {
    // `design.md > 3.3` paso 1: con la hija en pie, el `DROP TABLE "work_groups"` falla por
    // dependencia; y el `CASCADE` convertiria ese fallo ruidoso en un borrado silencioso.
    expect(droppedTables(downSource)).toEqual(['work_group_members', 'work_groups'])
    expect(dropsWithCascade(downSource)).toEqual([])

    // Sensibilidad: invertir el orden cae...
    const alReves = downSource
      .replace('DROP TABLE "work_group_members";', 'DROP TABLE "__hija__";')
      .replace('DROP TABLE "work_groups";', 'DROP TABLE "work_group_members";')
      .replace('DROP TABLE "__hija__";', 'DROP TABLE "work_groups";')
    expect(alReves, 'la mutacion no invirtio el orden').not.toBe(downSource)
    expect(droppedTables(alReves)).toEqual(['work_groups', 'work_group_members'])

    // ...y meter un CASCADE tambien.
    const conCascade = downSource.replace(
      'DROP TABLE "work_group_members";',
      'DROP TABLE "work_group_members" CASCADE;',
    )
    expect(conCascade, 'la mutacion no metio el CASCADE').not.toBe(downSource)
    expect(dropsWithCascade(conCascade)).toHaveLength(1)
  })

  it('toca users en una sola linea, la del indice que anadio el UP (R25)', () => {
    expect(statementsMentioning(downSource, 'users')).toEqual([
      'DROP INDEX "users_id_company_id_key"',
    ])

    // Sensibilidad: cualquier otra linea sobre `users` deja de dejarlo con la definicion
    // literal que tenia antes de la ficha, y el rollback terminaria en verde igual.
    const conMas = `${downSource}\nDROP INDEX "users_company_id_idx";`
    expect(statementsMentioning(conMas, 'users')).toHaveLength(2)
    const sinIndice = downSource.replace('DROP INDEX "users_id_company_id_key";', '')
    expect(sinIndice, 'la mutacion no quito el DROP INDEX').not.toBe(downSource)
    expect(statementsMentioning(sinIndice, 'users')).toEqual([])
  })

  it('no menciona companies ni pgcrypto en ninguna linea ejecutable (R25, R26)', () => {
    // El UP no crea `pgcrypto` en exclusiva y medio repo depende de ella; y `companies` solo
    // deja de tener una hija, no se modifica.
    expect(statementsMentioning(downSource, 'companies')).toEqual([])
    expect(statementsMentioning(downSource, 'pgcrypto')).toEqual([])

    const conEmpresa = `${downSource}\nDROP TABLE "companies";`
    expect(statementsMentioning(conEmpresa, 'companies')).toHaveLength(1)
    const conExtension = `${downSource}\nDROP EXTENSION "pgcrypto";`
    expect(statementsMentioning(conExtension, 'pgcrypto')).toHaveLength(1)
  })

  it('no deja RLS ni indices residuales: caen con sus tablas', () => {
    // R25. Los indices, las FK y los `ENABLE`/`FORCE` de las dos tablas nuevas no se revierten
    // uno a uno porque el `DROP TABLE` se los lleva; lo que NO puede quedar es un ALTER de RLS
    // suelto sobre una tabla que ya no existe.
    expect(down.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toEqual([])
    expect(down).toHaveLength(3)
  })
})

// === El esquema de Prisma ==================================================================

describe('db/schema.prisma — los dos modelos nuevos son del modulo identity', () => {
  it('WorkGroup y WorkGroupMember declaran su dueno (R22)', () => {
    expect(moduleOwnerOf(rawSchema, 'WorkGroup')).toBe('identity')
    expect(moduleOwnerOf(rawSchema, 'WorkGroupMember')).toBe('identity')

    // Sensibilidad: un modelo sin dueno o con otro cae.
    const sinDueno = rawSchema.replace('/// @module identity\nmodel WorkGroup {', 'model WorkGroup {')
    expect(sinDueno, 'la mutacion no quito el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(sinDueno, 'WorkGroup')).toBeNull()

    const otroDueno = rawSchema.replace(
      '/// @module identity\nmodel WorkGroupMember {',
      '/// @module pedidos\nmodel WorkGroupMember {',
    )
    expect(otroDueno, 'la mutacion no cambio el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(otroDueno, 'WorkGroupMember')).toBe('pedidos')
  })
})

describe('db/schema.prisma — la unicidad del nombre del grupo NO vive en el esquema', () => {
  it('WorkGroup no declara ningun @@unique ni @unique del nombre (riesgo 3, R4, R5, R6)', () => {
    // Si alguien "arregla" el esquema con `@@unique([companyId, nameNormalized])`, la unicidad
    // pasa a ser TOTAL en silencio: un grupo dado de baja quema su nombre para siempre, R6
    // muere y no salta ningun error en ninguna parte.
    expect(nameUniquesIn(rawSchema, 'WorkGroup')).toEqual([])

    // La lista de `@@unique` se enumera ENTERA: cualquiera nuevo —con el `map` que sea— cae.
    // El unico admitido es la diana trivial de la FK compuesta, que no restringe nada porque
    // `id` ya es la PK.
    expect(uniqueDeclarationsIn(rawSchema, 'WorkGroup')).toEqual([
      '[id, companyId], map: "work_groups_id_company_id_key"',
    ])

    // Sensibilidad: el `@@unique` de nombre cae...
    const conUnique = rawSchema.replace(
      '  @@unique([id, companyId], map: "work_groups_id_company_id_key")',
      '  @@unique([id, companyId], map: "work_groups_id_company_id_key")\n  @@unique([companyId, nameNormalized])',
    )
    expect(conUnique, 'la mutacion no anadio el @@unique').not.toBe(rawSchema)
    expect(nameUniquesIn(conUnique, 'WorkGroup')).toEqual(['[companyId, nameNormalized]'])

    // ...y un `@unique` en la propia columna tambien, que es la otra forma de romperlo.
    const enColumna = mutateModel(
      rawSchema,
      'WorkGroup',
      'nameNormalized String    @map("name_normalized")',
      'nameNormalized String    @unique @map("name_normalized")',
    )
    expect(enColumna, 'la mutacion no anadio el @unique').not.toBe(rawSchema)
    expect(nameUniquesIn(enColumna, 'WorkGroup')).toHaveLength(1)
  })
})

describe('db/schema.prisma — la pertenencia no guarda rastro de quien estuvo en el grupo', () => {
  it('WorkGroupMember no declara deletedAt (R18, riesgo 4)', () => {
    expect(modelDeclaresDeletedAt(rawSchema, 'WorkGroupMember')).toBe(false)
    // El grupo SI la declara: la afirmacion de arriba no es un `expect(false)` disfrazado, y
    // esta es la pareja de la decision cerrada 5 —el `deleted_at` es del GRUPO—.
    expect(modelDeclaresDeletedAt(rawSchema, 'WorkGroup')).toBe(true)

    // Sensibilidad: anadirla «por coherencia con el resto del repo» cae. Ademas de matar R18,
    // rompe la PK: `(work_group_id, user_id)` deja de ser unico al haber filas muertas.
    const conBaja = mutateModel(
      rawSchema,
      'WorkGroupMember',
      '  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)\n',
      '  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)\n' +
        '  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(6)\n',
    )
    expect(conBaja, 'la mutacion no anadio el deletedAt').not.toBe(rawSchema)
    expect(modelDeclaresDeletedAt(conBaja, 'WorkGroupMember')).toBe(true)
  })

  it('WorkGroupMember no declara ninguna @relation: sus dos FK van a mano (design.md > 2.2)', () => {
    // Consecuencia buscada: sin `@relation`, ningun `include` puede atravesar de una
    // pertenencia a la ficha completa de una persona.
    const body = modelBody(rawSchema, 'WorkGroupMember')
    expect(body).not.toBeNull()
    expect(body as string).not.toMatch(/@relation\(/)
    // Y la del grupo hacia la empresa SI la lleva, que es lo que evita que esa sea drift.
    expect(modelBody(rawSchema, 'WorkGroup') as string).toMatch(/@relation\(/)
  })
})
