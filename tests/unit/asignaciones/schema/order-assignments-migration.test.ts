// T8 — Contrato estatico del esquema y de la migracion de la asignacion de pedidos (QC-86).
//
// Lo que se vigila aqui NO lo regenera Prisma nunca y NO se ve en el cliente generado
// (`design.md > 1.1`, `> 2.1`, `> 2.2` y `> 2.3`): las TRES claves foraneas escritas a mano —dos
// de ellas COMPUESTAS con `company_id` dentro—, el modo de coincidencia que NO llevan, el CHECK
// de la congelacion, el sitio de los `ALTER ... ROW LEVEL SECURITY`, las filas de permisos y un
// `down.sql` que solo borra lo que el UP escribio.
//
// Los puntos mas fragiles de la ficha, y por que un test es lo unico que se entera:
//
//   1. LAS DOS FK COMPUESTAS HACIA `identity` (riesgo n.o 1, R11). Si alguien las escribe simples
//      —`FOREIGN KEY ("user_id") REFERENCES "users"("id")`— el esquema sigue validando, el
//      cliente sigue compilando y toda la suite sigue verde: la decision cerrada 6 deja de
//      existir en silencio hasta que QC-88 liste pedidos de otra empresa.
//   2. EL MODO DE COINCIDENCIA ESTRICTO (riesgo n.o 2, R13). Anadirlo a una FK compuesta con una
//      columna NOT NULL (`company_id`) mata la asignacion SUELTA en el acto, y no hay ningun
//      error de sintaxis que lo denuncie: solo filas rechazadas en produccion.
//   3. EL CHECK DE LA CONGELACION (R7). Prisma no modela CHECKs: vive solo en el `migration.sql`.
//      Quitarle UNA rama deja pasar la fila imposible que esa rama prohibia, sin ruido.
//   4. LOS TRES `ON DELETE RESTRICT` (R10, R20, R22). Un `CASCADE` convierte un borrado fisico
//      anomalo en una perdida silenciosa de responsables de un pedido en ejecucion.
//   5. UN `deleted_at` EN LA ASIGNACION (riesgo 4, R15). Es justo lo que la decision cerrada 5
//      descarto, y ademas rompe la PK `(order_id, user_id)`.
//   6. LAS FILAS DE PERMISOS (R28). Divergir del catalogo de `identity` —un codigo, un modulo,
//      una accion o una DESCRIPCION— no rompe nada hasta que alguien compara dos instalaciones a
//      mano. Por eso se comparan contra `PERMISSIONS` IMPORTADO del barril.
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto (el SQL o el
// `.prisma`) y devuelve el veredicto, y se aplica DOS VECES: al archivo real y a una version
// MUTADA EN MEMORIA — el archivo en disco NO se toca. Un test que no puede fallar no vigila
// nada; es el mismo patron de `tests/unit/identity/schema/work-groups-migration.test.ts`.
//
// Este test NO se conecta a la base: lee archivos. Los `SQLSTATE` de verdad los demuestra
// `tests/integration/asignaciones/order-assignments-constraints.int.test.ts` (T10).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PERMISSIONS } from '@/lib/modules/identity'

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
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella y no romperse por
 * una razon que no es la suya.
 */
const assignmentDirs = readdirSync(migrationsDir).filter((name) => /_order_assignments$/.test(name))
expect(assignmentDirs, 'debe existir exactamente una migracion de las asignaciones').toHaveLength(1)
const migrationDir = join(migrationsDir, assignmentDirs[0] as string)

/** La tabla que crea esta ficha. Se escribe una vez para no repetirla en veinte aserciones. */
const TABLA = 'order_assignments'

// --- Lectura y troceado del SQL ------------------------------------------------------------

/**
 * Quita comentarios de linea y de bloque: lo que se afirma es SQL EJECUTABLE, no prosa. La
 * cabecera de esta migracion nombra a proposito `orders`, `users`, `work_groups` y las FK que se
 * borraron a mano —para dejar escrito que NO se tocan—, asi que mirar el texto crudo daria falsos
 * positivos en todas las afirmaciones en negativo de mas abajo.
 */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** Sentencias ejecutables, con los espacios normalizados para poder afirmar sobre ellas. */
export function statements(sql: string): readonly string[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement.length > 0)
}

const upSource = readFileSync(join(migrationDir, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n')
const downSource = readFileSync(join(migrationDir, 'down.sql'), 'utf8').replace(/\r\n/g, '\n')
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n')
const up = statements(upSource)
const down = statements(downSource)

function findStatement(source: readonly string[], pattern: RegExp): string {
  const found = source.filter((statement) => pattern.test(statement))
  expect(found, `ninguna sentencia coincide con ${String(pattern)}`).toHaveLength(1)
  return found[0] as string
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

/**
 * R11, riesgo n.o 1. ¿La clave foranea es COMPUESTA y lleva `company_id` en los DOS lados, el
 * referenciante y el referenciado? Es lo unico que separa la garantia de la BASE de una
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

/**
 * R13, riesgo n.o 2. ¿Alguna linea del SQL —ejecutable O comentada— declara el modo de
 * coincidencia ESTRICTO de las FK compuestas? Se busca en CRUDO a proposito: la cadena no puede
 * aparecer ni en un comentario, porque asi el dia que alguien la copie desde ahi a una sentencia
 * este predicado ya estara rojo. Con el modo estricto, una FK compuesta exige que TODAS sus
 * columnas sean NULL a la vez para no evaluarse, y `company_id` es NOT NULL: la asignacion suelta
 * (`work_group_id IS NULL`) pasaria a ser imposible y R13 moriria sin un solo error de sintaxis.
 */
export function usesStrictMatch(sql: string): boolean {
  return /\bMATCH\s+FULL\b/i.test(sql)
}

// --- Predicados puros: el CHECK de la congelacion (R7) --------------------------------------

/** Las dos ramas del CHECK `order_assignments_work_group_name_matches_group`, por separado. */
export interface CheckDeCongelacion {
  /** La rama de la asignacion SUELTA: ni grupo ni nombre. */
  readonly ramaSinGrupo: boolean
  /** La rama de la asignacion POR GRUPO: grupo Y nombre congelado. */
  readonly ramaConGrupo: boolean
  /** Las dos ramas van unidas por `OR`: son alternativas, no una conjuncion. */
  readonly alternativa: boolean
}

/**
 * R7. Lee el CHECK del SQL y devuelve sus dos ramas POR SEPARADO. Un unico booleano no
 * distinguiria cual de las dos se perdio, y cada una deja pasar una fila imposible distinta: sin
 * la rama del grupo cabe una fila que dice venir de un grupo y no sabe como se llamaba; sin la
 * rama suelta, una que guarda el nombre de un grupo del que no vino.
 */
export function workGroupNameCheck(sql: string): CheckDeCongelacion | null {
  const encontrados = statements(sql).filter((statement) =>
    /ADD CONSTRAINT "order_assignments_work_group_name_matches_group" CHECK/i.test(statement),
  )
  if (encontrados.length !== 1) return null
  const check = encontrados[0] as string
  return {
    ramaSinGrupo: /\(\s*"work_group_id" IS NULL\s+AND\s+"work_group_name" IS NULL\s*\)/i.test(check),
    ramaConGrupo: /\(\s*"work_group_id" IS NOT NULL\s+AND\s+"work_group_name" IS NOT NULL\s*\)/i.test(
      check,
    ),
    alternativa: /\)\s*OR\s*\(/i.test(check),
  }
}

// --- Predicados puros: columnas, indices, orden, RLS y DDL ajeno ----------------------------

/**
 * Las columnas declaradas por un `CREATE TABLE`, con su definicion literal. El troceado respeta
 * los parentesis: `TIMESTAMPTZ(6)` y `PRIMARY KEY ("a","b")` llevan comas dentro y partir por
 * comas a secas los rompe.
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

/** R17. Los indices que el SQL crea sobre esa tabla, por nombre y en orden. */
export function indexesOn(sql: string, table: string): readonly string[] {
  return statements(sql)
    .map((statement) =>
      new RegExp(`^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "?${table}"?\\b`, 'i').exec(statement),
    )
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** R33. ¿La tabla queda con RLS activada Y forzada? Sin `FORCE`, el dueno la ignora entera. */
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
 * R33 y `design.md > 5.1` paso 6. ¿Los `ALTER ... ROW LEVEL SECURITY` son el ULTIMO bloque del
 * archivo? NO es cosmetico: `FORCE` sin policies deniega tambien al dueno de la tabla cuando ese
 * dueno no es superusuario, asi que cualquier escritura futura colocada detras de ellos podria no
 * escribir nada EN SILENCIO (leccion de QC-32, QC-74 y QC-83).
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

/** Una escritura de filas, con el verbo y la tabla que toca. */
export interface Escritura {
  readonly verbo: string
  readonly tabla: string
}

/**
 * R32. Las sentencias que ESCRIBEN filas. `ON DELETE`/`ON UPDATE` no cuentan: son parte de la
 * definicion de una clave foranea, no una escritura.
 */
export function writeStatements(sql: string): readonly Escritura[] {
  return statements(sql)
    .map((statement) => /^(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      verbo: (match[1] as string).toUpperCase().split(' ')[0] as string,
      tabla: match[2] as string,
    }))
}

/** Las tablas que un `CREATE TABLE` crea, en orden. */
export function createdTables(sql: string): readonly string[] {
  return statements(sql)
    .map((statement) => /^CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

// --- Predicados puros: las filas de permisos (R28) ------------------------------------------

/** Una fila del catalogo tal como el `INSERT` la escribe. */
export interface FilaDePermiso {
  readonly code: string
  readonly module: string
  readonly action: string
  readonly description: string
}

/**
 * R28. Las filas que el `INSERT INTO "permissions"` escribe, leidas del SQL. Se comparan contra
 * `PERMISSIONS` IMPORTADO del barril `@/lib/modules/identity`, nunca contra una copia escrita en
 * este test: si el catalogo y la migracion divergen —un codigo, un modulo, una accion o una
 * DESCRIPCION—, la comparacion es lo unico que lo denuncia.
 */
export function permissionRowsIn(sql: string): readonly FilaDePermiso[] {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return []
  return [
    ...insert.matchAll(/\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*[^)]*\)/g),
  ].map((match) => ({
    code: match[1] as string,
    module: match[2] as string,
    action: match[3] as string,
    description: match[4] as string,
  }))
}

/** R28. ¿Todos los `INSERT` llevan `ON CONFLICT ... DO NOTHING`? */
export function everyWriteIsIdempotent(sql: string): boolean {
  const escrituras = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (escrituras.length === 0) return false
  return escrituras.every((statement) => /ON CONFLICT[^;]*DO NOTHING$/i.test(statement))
}

/**
 * R28. Los nombres de rol por los que el SQL resuelve el `role_id`. Con un subselect por NOMBRE,
 * la migracion funciona en cualquier instalacion; `roles.id` es `gen_random_uuid()` y es DISTINTO
 * en cada una.
 */
export function rolesResolvedByName(sql: string): readonly string[] {
  return [...stripSqlComments(sql).matchAll(/"r"\."name"\s*=\s*'([^']+)'/g)].map(
    (match) => match[1] as string,
  )
}

/** R28. ¿Alguna linea ejecutable lleva un uuid escrito a mano? Serviria para UNA instalacion. */
export function literalUuidsIn(sql: string): readonly string[] {
  return [
    ...stripSqlComments(sql).matchAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ),
  ].map((match) => match[0])
}

// --- Predicados puros: el DOWN --------------------------------------------------------------

/** Un `DELETE` del `down.sql`, con la tabla y los codigos que lo acotan. */
export interface BorradoAcotado {
  readonly tabla: string
  readonly columna: string
  readonly codigos: readonly string[]
}

/**
 * R35. Los `DELETE` del DOWN, con su acotacion. Un `DELETE` sin `WHERE` —o acotado por otra cosa
 * que no sean los dos codigos de la ficha— se lleva filas que ya existian antes del UP.
 */
export function boundedDeletesIn(sql: string): readonly BorradoAcotado[] {
  return statements(sql)
    .map((statement) => /^DELETE FROM "?(\w+)"? WHERE "?(\w+)"? IN \(([^)]*)\)/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      tabla: match[1] as string,
      columna: match[2] as string,
      codigos: [...(match[3] as string).matchAll(/'([^']+)'/g)].map((code) => code[1] as string),
    }))
}

/** R35. Las sentencias del DOWN que modifican filas ajenas o esquema ajeno: ninguna cabe. */
export function forbiddenDownStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /^(INSERT|UPDATE|ALTER TABLE)\b/i.test(statement))
}

/** Las tablas que un `DROP TABLE` se lleva, en el orden en que caen. */
export function droppedTables(sql: string): readonly string[] {
  return statements(sql)
    .map((statement) => /^DROP TABLE (?:IF EXISTS )?"?(\w+)"?/i.exec(statement))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1] as string)
}

/** R35. Ninguna sentencia lleva `CASCADE`: el fallo al revertir debe ser RUIDOSO. */
export function cascadesIn(sql: string): readonly string[] {
  return statements(sql).filter((statement) => /\bCASCADE\b/i.test(statement))
}

// --- Predicados puros: el idioma de los identificadores (R24) -------------------------------

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
 * Vocabulario ingles admitido para los identificadores de esta feature (R24). Cada identificador
 * se parte por `_` y cada pieza tiene que estar en esta lista.
 *
 * Es una lista cerrada a proposito, con el precedente de
 * `tests/unit/identity/schema/work-groups-migration.test.ts`: una columna nueva obliga a pasar
 * por aqui, y una en espanol (`pedido`, `asignacion`, `responsable`) no encuentra sus piezas y
 * cae. Un patron `^[a-z_]+$` no distinguiria el idioma, solo la forma.
 */
const VOCABULARIO_INGLES = new Set([
  'assignments',
  'at',
  'company',
  'created',
  'fkey',
  'group',
  'id',
  'idx',
  'matches',
  'name',
  'order',
  'pkey',
  'updated',
  'user',
  'work',
])

/** R24. ¿El identificador es snake_case ASCII y todas sus piezas son palabras inglesas? */
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
 * R30. El modulo declarado JUSTO ENCIMA del modelo, o `null` si no lo tiene. Se lee del texto
 * CRUDO: `/// @module` ES un comentario, y es justo lo que se vigila. Un modelo sin dueno —o con
 * otro— es ademas un hallazgo de `tests/guards/guard-arquitectura-modulos.test.ts`.
 */
export function moduleOwnerOf(schema: string, model: string): string | null {
  const match = new RegExp(`/// @module (\\w+)\\nmodel ${model} \\{`).exec(schema)
  return match === null ? null : (match[1] as string)
}

/** Un campo del modelo tal como esta declarado: su tipo y si es anulable. */
export interface CampoDeModelo {
  readonly tipo: string
  readonly anulable: boolean
}

/** Los campos escalares del modelo, por nombre. Las lineas `@@...` no son campos. */
export function modelFields(schema: string, model: string): ReadonlyMap<string, CampoDeModelo> {
  const campos = new Map<string, CampoDeModelo>()
  const body = modelBody(schema, model)
  if (body === null) return campos
  for (const linea of body.split('\n')) {
    const match = /^\s{2,}(\w+)\s+(\w+)(\?)?\s/.exec(linea)
    if (match === null) continue
    campos.set(match[1] as string, { tipo: match[2] as string, anulable: match[3] === '?' })
  }
  return campos
}

/** R15, riesgo 4. ¿El modelo declara marca de baja logica? En la asignacion NO puede. */
export function modelDeclaresDeletedAt(schema: string, model: string): boolean {
  const body = modelBody(schema, model)
  if (body === null) return false
  return /\bdeletedAt\b/.test(body) || /deleted_at/.test(body)
}

/** R31. Las `@relation` declaradas por el modelo. En este modelo tienen que ser CERO. */
export function relationsIn(schema: string, model: string): readonly string[] {
  const body = modelBody(schema, model)
  if (body === null) return []
  return [...body.matchAll(/@relation\([^\n]*\)/g)].map((match) => match[0])
}

/**
 * Mutacion EN MEMORIA acotada a UN modelo del esquema. Sin esto, un `replace` a secas sobre el
 * texto del `.prisma` cae en el primer modelo que comparta la linea —media docena declaran el
 * mismo `updatedAt`— y la mutacion no tocaria el modelo que se pretende romper: el test seguiria
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

/** Las dos entradas del catalogo que estrena esta ficha, LEIDAS del barril (R28). */
// `asignaciones.ejecutar` lo trae una migracion posterior, no esta.
const PERMISOS_DE_LA_FICHA = PERMISSIONS.filter(
  (permiso) => permiso.module === 'asignaciones' && permiso.code !== 'asignaciones.ejecutar',
).map(
  ({ code, module, action, description }) => ({ code, module, action, description }),
)

const CODIGOS_DE_LA_FICHA = PERMISOS_DE_LA_FICHA.map((permiso) => permiso.code)

// === El UP: las tres claves foraneas, el corazon de la ficha ===============================

describe('migration.sql — la base impide que una persona de la empresa A acabe con un grupo de la B', () => {
  it('las dos claves foraneas hacia identity llevan company_id en los dos lados (R11)', () => {
    const haciaLaPersona = foreignKey(upSource, 'order_assignments_user_id_fkey')
    const haciaElGrupo = foreignKey(upSource, 'order_assignments_work_group_id_fkey')

    expect(carriesCompanyOnBothSides(haciaLaPersona), 'la FK de la persona no es compuesta').toBe(
      true,
    )
    expect(carriesCompanyOnBothSides(haciaElGrupo), 'la FK del grupo no es compuesta').toBe(true)
    expect(haciaLaPersona?.tabla).toBe(TABLA)
    expect(haciaLaPersona?.columnas).toEqual(['user_id', 'company_id'])
    expect(haciaLaPersona?.tablaReferenciada).toBe('users')
    expect(haciaLaPersona?.columnasReferenciadas).toEqual(['id', 'company_id'])
    expect(haciaElGrupo?.tabla).toBe(TABLA)
    expect(haciaElGrupo?.columnas).toEqual(['work_group_id', 'company_id'])
    expect(haciaElGrupo?.tablaReferenciada).toBe('work_groups')
    expect(haciaElGrupo?.columnasReferenciadas).toEqual(['id', 'company_id'])
  })

  it('la clave foranea del pedido es simple y el UP no le anade empresa a orders (R14)', () => {
    // `orders` no tiene `company_id` (epica QC-46): el triangulo no se cierra en esta ficha, y es
    // un LIMITE ESCRITO, no una carencia disimulada. Nadie puede «arreglarlo» desde aqui.
    const haciaElPedido = foreignKey(upSource, 'order_assignments_order_id_fkey')
    expect(haciaElPedido?.columnas).toEqual(['order_id'])
    expect(haciaElPedido?.tablaReferenciada).toBe('orders')
    expect(haciaElPedido?.columnasReferenciadas).toEqual(['id'])
    expect(carriesCompanyOnBothSides(haciaElPedido)).toBe(false)

    // Y ninguna sentencia ejecutable cruza `orders` con la empresa.
    const sobreOrders = statementsMentioning(upSource, '"orders"').filter((statement) =>
      /company_id/i.test(statement),
    )
    expect(sobreOrders, 'ninguna sentencia debe cruzar orders con company_id').toEqual([])
  })

  it('las tres claves foraneas son ON DELETE RESTRICT y ON UPDATE CASCADE (R10, R20, R22)', () => {
    // Pedido y persona tienen borrado LOGICO en este ERP, asi que un `DELETE` fisico sobre ellos
    // es ya una anomalia y tiene que ser RUIDOSA; y borrar un grupo no se lleva por delante a los
    // responsables de un pedido en ejecucion (decision cerrada 7). El `ON UPDATE CASCADE` es lo
    // que cierra R12.
    for (const nombre of [
      'order_assignments_order_id_fkey',
      'order_assignments_user_id_fkey',
      'order_assignments_work_group_id_fkey',
    ]) {
      const fk = foreignKey(upSource, nombre)
      expect(fk?.onDelete, `${nombre} sin RESTRICT`).toBe('RESTRICT')
      expect(fk?.onUpdate, `${nombre} sin ON UPDATE CASCADE`).toBe('CASCADE')
    }
  })

  it('ninguna clave foranea declara el modo de coincidencia estricto (R13)', () => {
    // Con el modo estricto, la FK compuesta del grupo exigiria que `work_group_id` y `company_id`
    // fueran NULL a la vez para no evaluarse, y `company_id` es NOT NULL: la asignacion SUELTA
    // pasaria a ser imposible. Se busca en el texto CRUDO, comentarios incluidos.
    expect(usesStrictMatch(upSource), 'el SQL declara el modo de coincidencia estricto').toBe(false)
    expect(usesStrictMatch(downSource)).toBe(false)
  })
})

// === El UP: el CHECK de la congelacion =====================================================

describe('migration.sql — el grupo y su nombre congelado existen el uno por el otro', () => {
  it('el CHECK de la congelacion existe con sus dos ramas unidas por OR (R7)', () => {
    // Sin el caben dos filas imposibles: una que dice que vino de un grupo y no sabe como se
    // llamaba, y otra que guarda el nombre de un grupo del que no vino. Prisma no modela CHECKs.
    expect(workGroupNameCheck(upSource)).toEqual({
      ramaSinGrupo: true,
      ramaConGrupo: true,
      alternativa: true,
    })
  })
})

// === El UP: las columnas de la tabla nueva =================================================

describe('migration.sql — las columnas de la asignacion', () => {
  it('las tres columnas de referencia y las dos marcas de tiempo son obligatorias (R1, R23)', () => {
    const columnas = tableColumns(upSource, TABLA)
    for (const columna of ['order_id', 'user_id', 'company_id']) {
      expect(columnas.get(columna), `falta ${columna}`).toBe(`"${columna}" UUID NOT NULL`)
    }
    expect(columnas.get('created_at')).toBe(
      '"created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    )
    // `updated_at` es NOT NULL SIN default de base: lo rellena `@updatedAt` del cliente.
    expect(columnas.get('updated_at')).toBe('"updated_at" TIMESTAMPTZ(6) NOT NULL')
  })

  it('el grupo y su nombre congelado son las dos unicas columnas anulables (R6)', () => {
    const columnas = tableColumns(upSource, TABLA)
    expect(columnas.get('work_group_id')).toBe('"work_group_id" UUID')
    // TEXT SIN longitud: es una COPIA de `work_groups.name`, que tampoco la tiene (QC-83 R2). Un
    // tope aqui convertiria un renombrado legitimo del origen en un error de asignacion.
    expect(columnas.get('work_group_name')).toBe('"work_group_name" TEXT')
    const anulables = [...columnas.entries()]
      .filter(([, definicion]) => !/NOT NULL/i.test(definicion))
      .map(([nombre]) => nombre)
    expect(anulables).toEqual(['work_group_id', 'work_group_name'])
  })

  it('ni el SQL ni el esquema declaran deleted_at en la tabla (R15)', () => {
    // Decision cerrada 5: sacar a alguien de un pedido BORRA la fila. Anadir `deleted_at`
    // degradaria la PK a un indice unico PARCIAL y obligaria a TODA lectura de responsables, para
    // siempre, a acordarse de filtrar.
    expect(tableColumns(upSource, TABLA).has('deleted_at')).toBe(false)
    expect(modelDeclaresDeletedAt(rawSchema, 'OrderAssignment')).toBe(false)
    // Y no es un `expect(false)` disfrazado: otros modelos del mismo esquema SI la declaran, asi
    // que el predicado sabe verla cuando esta.
    expect(modelDeclaresDeletedAt(rawSchema, 'Order')).toBe(true)
  })

  it('no hay ninguna columna que guarde un segundo origen de la misma persona (R5)', () => {
    // La PK `(order_id, user_id)` hace imposible la segunda fila —gana el primero que la trajo,
    // decision cerrada 3— y la marca de «vino de un grupo» NO es una columna aparte: es
    // `work_group_id IS NOT NULL`. Ninguna lectura necesita deduplicar responsables.
    const columnas = [...tableColumns(upSource, TABLA).keys()]
    expect(columnas).toEqual([
      'order_id',
      'user_id',
      'company_id',
      'work_group_id',
      'work_group_name',
      'created_at',
      'updated_at',
    ])
    expect(findStatement(up, new RegExp(`^CREATE TABLE "${TABLA}"`, 'i'))).toMatch(
      /CONSTRAINT "order_assignments_pkey" PRIMARY KEY \("order_id","user_id"\)/i,
    )
    // Ni columna de origen, ni tabla auxiliar donde esconder el segundo.
    for (const sospechosa of ['source', 'origin', 'origen', 'second_source', 'assigned_via']) {
      expect(columnas, `no debe existir ${sospechosa}`).not.toContain(sospechosa)
    }
    expect(createdTables(upSource)).toEqual([TABLA])
    expect(modelFields(rawSchema, 'OrderAssignment').has('source')).toBe(false)
  })

  it('existen los dos indices que la PK no cubre, y ninguno mas (R17)', () => {
    // `order_assignments_user_id_idx` sirve «que pedidos tengo asignados» y la verificacion del
    // RESTRICT al borrar una persona; `order_assignments_work_group_id_idx`, la del grupo y el
    // «quitar este grupo de este pedido» de QC-87. NO hay indice por `company_id`, y es
    // deliberado.
    expect(indexesOn(upSource, TABLA)).toEqual([
      'order_assignments_user_id_idx',
      'order_assignments_work_group_id_idx',
    ])
  })
})

// === El UP: la RLS y lo que NO toca ========================================================

describe('migration.sql — la tabla nueva nace con RLS activada y forzada', () => {
  it('queda con ENABLE y con FORCE, y los dos ALTER son el ultimo bloque del archivo (R33)', () => {
    // Sin `FORCE`, el dueno de la tabla —que es con quien se conecta Prisma— la ignora entera y
    // la defensa en profundidad no defiende de nada. Y van los ultimos porque `FORCE` sin
    // policies deniega tambien al dueno: una escritura colocada detras podria no escribir nada EN
    // SILENCIO.
    expect(hasRlsEnabledAndForced(upSource, TABLA)).toBe(true)
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)
  })
})

describe('migration.sql — lo que esta migracion NO toca', () => {
  it('no ejecuta ningun DDL sobre ninguna tabla preexistente (R32)', () => {
    // La cabecera del archivo NOMBRA estas tablas a proposito, para dejar escrito que sus
    // `DROP CONSTRAINT` por drift se borraron a mano; por eso se afirma sobre el SQL EJECUTABLE,
    // con los comentarios ya quitados.
    const preexistentes = [
      'orders',
      'order_lines',
      'users',
      'work_groups',
      'work_group_members',
      'companies',
      'permissions',
      'role_permissions',
      'roles',
      'document_types',
      'products',
      'product_batches',
      'presentations',
      'units',
      'recipes',
      'recipe_lines',
      'suppliers',
      'supplier_catalog_lines',
    ]
    for (const tabla of preexistentes) {
      expect(ddlStatementsOn(upSource, tabla), `no debe tocar ${tabla}`).toEqual([])
    }
    // Lo unico que crea es la tabla de la ficha, y no declara ninguna extension: `pgcrypto` ya
    // existe y medio repo depende de ella.
    expect(createdTables(upSource)).toEqual([TABLA])
    expect(up.filter((statement) => /EXTENSION/i.test(statement))).toEqual([])
  })

  it('lo unico que escribe sobre tablas preexistentes son los INSERT de permisos (R32)', () => {
    // Aditivos e idempotentes. No hay backfill: la tabla nace VACIA y los pedidos que ya existen
    // quedan sin responsables (decision cerrada 10, R18).
    expect(writeStatements(upSource)).toEqual([
      { verbo: 'INSERT', tabla: 'permissions' },
      { verbo: 'INSERT', tabla: 'role_permissions' },
      { verbo: 'INSERT', tabla: 'role_permissions' },
    ])
  })

  it('nombra en ingles y en snake_case todo lo que crea (R24)', () => {
    const identificadores = createdIdentifiers(up)
    expect(identificadores.length).toBeGreaterThan(10)
    expect(identificadores).toContain(TABLA)
    expect(identificadores).toContain('work_group_name')
    expect(identificadores).toContain('order_assignments_work_group_name_matches_group')
    expect(identificadores).toContain('order_assignments_user_id_fkey')
    for (const identificador of identificadores) {
      expect(isEnglishSnakeCase(identificador), `identificador no ingles: ${identificador}`).toBe(
        true,
      )
    }
  })

  it('la guardia de idioma cae con un identificador en espanol, con acentos o en camelCase (R24)', () => {
    // Sensibilidad de R24: si el predicado aceptara esto, no vigilaria nada.
    for (const enEspanol of [
      'asignaciones',
      'pedido_id',
      'responsable_id',
      'grupo_de_trabajo',
      'empresa_id',
    ]) {
      expect(isEnglishSnakeCase(enEspanol), `${enEspanol} no deberia pasar`).toBe(false)
    }
    expect(isEnglishSnakeCase('order_assígnments')).toBe(false)
    expect(isEnglishSnakeCase('orderAssignments')).toBe(false)
    expect(isEnglishSnakeCase('ORDER_ASSIGNMENTS')).toBe(false)
    expect(isEnglishSnakeCase('order assignments')).toBe(false)
    // Y sigue aceptando los que si son ingleses: no es un `expect(false)` disfrazado.
    expect(isEnglishSnakeCase('order_assignments')).toBe(true)
    expect(isEnglishSnakeCase('work_group_name')).toBe(true)
  })
})

// === El UP: las filas de permisos ==========================================================

describe('migration.sql — los dos permisos nuevos son los del catalogo, no una copia', () => {
  it('codigos, modulos, acciones y descripciones coinciden con PERMISSIONS del barril (R28)', () => {
    // `PERMISSIONS` viene IMPORTADO de `@/lib/modules/identity`: si alguien cambia una
    // descripcion en el catalogo y no en el SQL —o al reves—, este test es lo unico que se pone
    // rojo antes de que dos instalaciones queden distintas.
    expect(PERMISOS_DE_LA_FICHA).toHaveLength(2)
    expect(permissionRowsIn(upSource)).toEqual(PERMISOS_DE_LA_FICHA)
  })

  it('los INSERT son idempotentes y resuelven el rol por nombre, sin ningun uuid literal (R28)', () => {
    // `ON CONFLICT DO NOTHING` es R28 entero: aplicar la migracion sobre una base donde el seed ya
    // sembro los codigos no falla y no reescribe nada. Y `roles.id` es `gen_random_uuid()`: un
    // uuid escrito a mano funcionaria en UNA instalacion y en ninguna otra.
    expect(everyWriteIsIdempotent(upSource)).toBe(true)
    expect(rolesResolvedByName(upSource)).toEqual(['Administrador', 'Operador'])
    expect(literalUuidsIn(upSource)).toEqual([])

    // El Administrador recibe los DOS codigos y el Operador solo `consultar` (decision cerrada 8),
    // escritos UNA A UNA: `modificar` NO implica `consultar`.
    const [administrador, operador] = statements(upSource).filter((statement) =>
      /^INSERT INTO "role_permissions"/i.test(statement),
    )
    for (const codigo of CODIGOS_DE_LA_FICHA) {
      expect(administrador, `el Administrador no recibe ${codigo}`).toContain(`'${codigo}'`)
    }
    expect(operador).toContain("'asignaciones.consultar'")
    expect(operador).not.toContain("'asignaciones.modificar'")
  })
})

// === El DOWN ===============================================================================

describe('down.sql — revertir deja la base exactamente como estaba antes del UP', () => {
  it('no lleva ningun INSERT, UPDATE ni ALTER TABLE (R35)', () => {
    expect(forbiddenDownStatements(downSource)).toEqual([])
    // Solo tres sentencias: los dos DELETE acotados y el DROP TABLE.
    expect(down).toHaveLength(3)
    expect(down.filter((statement) => /ROW LEVEL SECURITY/i.test(statement))).toEqual([])
  })

  it('los dos DELETE van acotados por los dos codigos, y las asignaciones caen primero (R35)', () => {
    // Las asignaciones de rol PRIMERO: `role_permissions_permission_code_fkey` es RESTRICT, asi
    // que borrar antes la entrada del catalogo fallaria con 23503.
    expect(boundedDeletesIn(downSource)).toEqual([
      { tabla: 'role_permissions', columna: 'permission_code', codigos: CODIGOS_DE_LA_FICHA },
      { tabla: 'permissions', columna: 'code', codigos: CODIGOS_DE_LA_FICHA },
    ])
    // Y no hay ningun otro `DELETE`: los acotados son TODOS los que el archivo ejecuta.
    expect(down.filter((statement) => /^DELETE/i.test(statement))).toHaveLength(2)
  })

  it('el DROP TABLE se lleva solo la tabla de la ficha y no lleva CASCADE (R34, R35)', () => {
    // Sin `CASCADE` a proposito: si algun objeto futuro dependiera de esta tabla, el fallo debe
    // ser RUIDOSO y abortar la reversion entera, no arrastrarlo en silencio.
    expect(droppedTables(downSource)).toEqual([TABLA])
    expect(cascadesIn(downSource)).toEqual([])
  })

  it('no nombra orders, users, work_groups ni companies en ninguna linea ejecutable (R35)', () => {
    for (const ajena of ['orders', 'users', 'work_groups', 'companies', 'pgcrypto']) {
      expect(statementsMentioning(downSource, ajena), `el down nombra ${ajena}`).toEqual([])
    }
  })

  it('revertir devuelve el catalogo persistido al de QC-66 (R34)', () => {
    // El DOWN borra EXACTAMENTE los codigos que el UP escribio, ni uno mas: el catalogo vuelve al
    // de QC-66. La cuenta no esta escrita a mano contra el SQL: sale de `PERMISSIONS` menos lo que
    // el DOWN se lleva y menos lo que sumaron las fichas posteriores, comparada contra la lista de
    // codigos de QC-66.
    const CODIGOS_DE_FICHAS_POSTERIORES = [
      'asignaciones.ejecutar',
      'terminados.consultar',
      'clientes.consultar',
      'clientes.modificar',
      'documentos.consultar',
      'documentos.modificar',
      'empaque.modificar',
      'empresas.consultar',
      'empresas.modificar',
      'acondicionamiento.modificar',
      'integraciones.modificar',
      // QC-223 2026-10-08
      'entregas.modificar',
      // QC-224 2026-10-09
      'entregas.anular',
    ]
    const CODIGOS_QC66 = [
      'dashboard.consultar',
      'inventario.consultar',
      'inventario.modificar',
      'recetas.consultar',
      'recetas.modificar',
      'unidades.consultar',
      'unidades.modificar',
      'proveedores.consultar',
      'proveedores.modificar',
      'pedidos.consultar',
      'pedidos.modificar',
      'usuarios.consultar',
      'usuarios.modificar',
    ]
    const borrados = boundedDeletesIn(downSource).map((borrado) => borrado.codigos)
    expect(borrados[0]).toEqual(CODIGOS_DE_LA_FICHA)
    expect(
      PERMISSIONS.length - CODIGOS_DE_LA_FICHA.length - CODIGOS_DE_FICHAS_POSTERIORES.length,
    ).toBe(CODIGOS_QC66.length)
  })
})

// === El esquema de Prisma ==================================================================

describe('db/schema.prisma — el modelo OrderAssignment', () => {
  it('declara que su dueno es el modulo asignaciones (R30)', () => {
    expect(moduleOwnerOf(rawSchema, 'OrderAssignment')).toBe('asignaciones')
  })

  it('no declara ninguna @relation: sus tres FK van a mano (R31)', () => {
    // Consecuencia buscada: sin `@relation`, ningun `include` puede atravesar de una asignacion a
    // la ficha completa de una persona o de un pedido —dos de los tres padres son de OTROS
    // modulos y ninguna guardia de imports lo veria—.
    expect(relationsIn(rawSchema, 'OrderAssignment')).toEqual([])
    // Y el predicado sabe verlas cuando estan: `WorkGroup` si lleva la suya hacia la empresa.
    expect(relationsIn(rawSchema, 'WorkGroup').length).toBeGreaterThan(0)
  })

  it('declara las tres referencias y las dos marcas de tiempo obligatorias (R1, R23)', () => {
    const campos = modelFields(rawSchema, 'OrderAssignment')
    for (const campo of ['orderId', 'userId', 'companyId']) {
      expect(campos.get(campo), `falta ${campo}`).toEqual({ tipo: 'String', anulable: false })
    }
    expect(campos.get('createdAt')).toEqual({ tipo: 'DateTime', anulable: false })
    expect(campos.get('updatedAt')).toEqual({ tipo: 'DateTime', anulable: false })
  })

  it('declara el grupo y su nombre congelado como anulables (R6)', () => {
    const campos = modelFields(rawSchema, 'OrderAssignment')
    expect(campos.get('workGroupId')).toEqual({ tipo: 'String', anulable: true })
    expect(campos.get('workGroupName')).toEqual({ tipo: 'String', anulable: true })
    // Y no hay ningun campo mas: un origen alternativo no cabe ni aqui (R5).
    expect([...campos.keys()]).toEqual([
      'orderId',
      'userId',
      'companyId',
      'workGroupId',
      'workGroupName',
      'createdAt',
      'updatedAt',
    ])
  })
})

// === Las mutaciones: cada asercion cae al mutar lo que vigila ==============================
//
// Un test que no puede fallar no vigila nada. Cada caso de aqui aplica una mutacion SINTETICA EN
// MEMORIA sobre el texto leido —el archivo en disco NO se toca—, comprueba que la mutacion de
// verdad cambio algo (`not.toBe(...)`), que el predicado correspondiente DISPARA, y que el caso
// SIMETRICO correcto NO dispara.

describe('mutaciones — el SQL del UP', () => {
  it('simplificar una FK compuesta a simple cae (R11, riesgo 1)', () => {
    // Es la mutacion mas silenciosa de la ficha: el esquema sigue validando, el cliente sigue
    // compilando y la decision cerrada 6 deja de existir hasta que QC-88 liste pedidos ajenos.
    const simple = upSource.replace(
      /ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_user_id_fkey"[^;]*;/,
      'ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_user_id_fkey" ' +
        'FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    )
    expect(simple, 'la mutacion no simplifico la FK de la persona').not.toBe(upSource)
    expect(carriesCompanyOnBothSides(foreignKey(simple, 'order_assignments_user_id_fkey'))).toBe(
      false,
    )
    // La del grupo sigue compuesta: la mutacion es quirurgica.
    expect(
      carriesCompanyOnBothSides(foreignKey(simple, 'order_assignments_work_group_id_fkey')),
    ).toBe(true)

    const simpleGrupo = upSource.replace(
      'FOREIGN KEY ("work_group_id", "company_id") REFERENCES "work_groups"("id", "company_id")',
      'FOREIGN KEY ("work_group_id") REFERENCES "work_groups"("id")',
    )
    expect(simpleGrupo, 'la mutacion no simplifico la FK del grupo').not.toBe(upSource)
    expect(
      carriesCompanyOnBothSides(foreignKey(simpleGrupo, 'order_assignments_work_group_id_fkey')),
    ).toBe(false)

    // Y dejar `company_id` solo en el lado referenciante tampoco vale: la garantia es la IGUALDAD
    // de las dos columnas, no la presencia de una.
    const mediaFk = upSource.replace(
      'FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")',
      'FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "id")',
    )
    expect(mediaFk, 'la mutacion no toco el lado referenciado').not.toBe(upSource)
    expect(carriesCompanyOnBothSides(foreignKey(mediaFk, 'order_assignments_user_id_fkey'))).toBe(
      false,
    )
  })

  it('meter el modo de coincidencia estricto cae, y el modo por defecto no (R13, riesgo 2)', () => {
    const estricto = upSource.replace(
      'REFERENCES "work_groups"("id", "company_id") ON DELETE RESTRICT',
      'REFERENCES "work_groups"("id", "company_id") MATCH FULL ON DELETE RESTRICT',
    )
    expect(estricto, 'la mutacion no metio el modo estricto').not.toBe(upSource)
    expect(usesStrictMatch(estricto)).toBe(true)
    // Caso simetrico: el archivo real —que si menciona el modo por defecto en sus comentarios— no
    // dispara. El predicado distingue el modo estricto del que Postgres usa por defecto.
    expect(usesStrictMatch(upSource)).toBe(false)
    expect(usesStrictMatch('FOREIGN KEY ("a") REFERENCES "b"("a") MATCH SIMPLE;')).toBe(false)
  })

  it('quitarle una rama al CHECK, o cambiar el OR, cae (R7)', () => {
    const sinRamaSuelta = upSource.replace(
      /ADD CONSTRAINT "order_assignments_work_group_name_matches_group" CHECK \([\s\S]*?\n\);/,
      'ADD CONSTRAINT "order_assignments_work_group_name_matches_group" CHECK (\n' +
        '    ("work_group_id" IS NOT NULL AND "work_group_name" IS NOT NULL)\n);',
    )
    expect(sinRamaSuelta, 'la mutacion no quito la rama suelta').not.toBe(upSource)
    expect(workGroupNameCheck(sinRamaSuelta)?.ramaSinGrupo).toBe(false)
    expect(workGroupNameCheck(sinRamaSuelta)?.alternativa).toBe(false)
    expect(workGroupNameCheck(sinRamaSuelta)?.ramaConGrupo).toBe(true)

    // Cambiar el `OR` por un `AND` tambien mata el CHECK: las dos ramas se excluyen entre si y
    // ninguna fila entraria.
    const conjuncion = upSource.replace(
      '("work_group_id" IS NULL     AND "work_group_name" IS NULL)\n    OR\n',
      '("work_group_id" IS NULL     AND "work_group_name" IS NULL)\n    AND\n',
    )
    expect(conjuncion, 'la mutacion no cambio el OR').not.toBe(upSource)
    expect(workGroupNameCheck(conjuncion)?.alternativa).toBe(false)

    // Y si el CHECK desaparece entero, tampoco pasa: uno ausente y uno relajado son la misma cosa
    // para un assert distraido.
    const sinCheck = upSource.replace(
      /ALTER TABLE "order_assignments" ADD CONSTRAINT "order_assignments_work_group_name_matches_group"[\s\S]*?\n\);/,
      '',
    )
    expect(sinCheck, 'la mutacion no quito el CHECK').not.toBe(upSource)
    expect(workGroupNameCheck(sinCheck)).toBeNull()
  })

  it('cambiar un RESTRICT por CASCADE, o quedarse sin ON DELETE, cae (R10, R20, R22)', () => {
    const arrastra = upSource.replace(
      'REFERENCES "work_groups"("id", "company_id") ON DELETE RESTRICT',
      'REFERENCES "work_groups"("id", "company_id") ON DELETE CASCADE',
    )
    expect(arrastra, 'la mutacion no cambio el ON DELETE del grupo').not.toBe(upSource)
    expect(foreignKey(arrastra, 'order_assignments_work_group_id_fkey')?.onDelete).toBe('CASCADE')
    // Las otras dos siguen en RESTRICT: la mutacion no es un borrado a lo bruto.
    expect(foreignKey(arrastra, 'order_assignments_order_id_fkey')?.onDelete).toBe('RESTRICT')
    expect(foreignKey(arrastra, 'order_assignments_user_id_fkey')?.onDelete).toBe('RESTRICT')

    const sinAccion = upSource.replace(
      'REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      'REFERENCES "orders"("id")',
    )
    expect(sinAccion, 'la mutacion no quito el ON DELETE del pedido').not.toBe(upSource)
    expect(foreignKey(sinAccion, 'order_assignments_order_id_fkey')?.onDelete).toBeNull()
  })

  it('anadirle company_id a la clave foranea del pedido cae (R14)', () => {
    const compuesta = upSource.replace(
      'FOREIGN KEY ("order_id") REFERENCES "orders"("id")',
      'FOREIGN KEY ("order_id", "company_id") REFERENCES "orders"("id", "company_id")',
    )
    expect(compuesta, 'la mutacion no compuso la FK del pedido').not.toBe(upSource)
    expect(carriesCompanyOnBothSides(foreignKey(compuesta, 'order_assignments_order_id_fkey'))).toBe(
      true,
    )
    expect(
      statementsMentioning(compuesta, '"orders"').filter((statement) =>
        /company_id/i.test(statement),
      ),
    ).toHaveLength(1)
  })

  it('meter un deleted_at en la tabla o en el modelo cae (R15, riesgo 4)', () => {
    const conBaja = upSource.replace(
      '"updated_at" TIMESTAMPTZ(6) NOT NULL,\n\n    CONSTRAINT "order_assignments_pkey"',
      '"updated_at" TIMESTAMPTZ(6) NOT NULL,\n    "deleted_at" TIMESTAMPTZ(6),\n\n    CONSTRAINT "order_assignments_pkey"',
    )
    expect(conBaja, 'la mutacion no anadio el deleted_at al SQL').not.toBe(upSource)
    expect(tableColumns(conBaja, TABLA).has('deleted_at')).toBe(true)

    const modeloConBaja = mutateModel(
      rawSchema,
      'OrderAssignment',
      '  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)\n',
      '  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)\n' +
        '  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz(6)\n',
    )
    expect(modeloConBaja, 'la mutacion no anadio el deletedAt al modelo').not.toBe(rawSchema)
    expect(modelDeclaresDeletedAt(modeloConBaja, 'OrderAssignment')).toBe(true)
  })

  it('quitar uno de los dos indices, o anadir uno de mas, cae (R17)', () => {
    const sinIndice = upSource.replace(/CREATE INDEX "order_assignments_work_group_id_idx"[^;]*;/, '')
    expect(sinIndice, 'la mutacion no quito el indice del grupo').not.toBe(upSource)
    expect(indexesOn(sinIndice, TABLA)).toEqual(['order_assignments_user_id_idx'])

    const conIndiceDeMas = `${upSource}\nCREATE INDEX "order_assignments_company_id_idx" ON "order_assignments"("company_id");`
    expect(indexesOn(conIndiceDeMas, TABLA)).toHaveLength(3)
  })

  it('quitar el FORCE, quitar el ENABLE o colar algo detras de ellos cae (R33)', () => {
    const sinForce = upSource.replace('ALTER TABLE "order_assignments" FORCE ROW LEVEL SECURITY;', '')
    expect(sinForce, 'la mutacion no quito el FORCE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinForce, TABLA)).toBe(false)

    const sinEnable = upSource.replace(
      'ALTER TABLE "order_assignments" ENABLE ROW LEVEL SECURITY;',
      '',
    )
    expect(sinEnable, 'la mutacion no quito el ENABLE').not.toBe(upSource)
    expect(hasRlsEnabledAndForced(sinEnable, TABLA)).toBe(false)

    // Cualquier cosa colada DETRAS de los ALTER es el caso real que esto vigila: con `FORCE` y sin
    // policies podria no escribir nada EN SILENCIO.
    const ddlDetras = `${upSource}\nCREATE INDEX "order_assignments_company_id_idx" ON "order_assignments"("company_id");`
    expect(rowLevelSecurityGoesLast(ddlDetras)).toBe(false)
    const escrituraDetras = `${upSource}\nINSERT INTO "permissions" ("code") VALUES ('x');`
    expect(rowLevelSecurityGoesLast(escrituraDetras)).toBe(false)
    // Caso simetrico: el archivo real termina en los dos ALTER.
    expect(rowLevelSecurityGoesLast(upSource)).toBe(true)
  })

  it('colar un ALTER TABLE sobre una tabla preexistente cae, y nombrarla en un comentario no (R32)', () => {
    const conDrift = `${upSource}\nALTER TABLE "orders" DROP CONSTRAINT "orders_recipe_id_fkey";`
    expect(ddlStatementsOn(conDrift, 'orders')).toHaveLength(1)
    const conColumna = `${upSource}\nALTER TABLE "users" ADD COLUMN "order_assignment_count" INTEGER;`
    expect(ddlStatementsOn(conColumna, 'users')).toHaveLength(1)
    const conIndiceAjeno = `${upSource}\nCREATE INDEX "work_groups_name_idx" ON "work_groups"("name");`
    expect(ddlStatementsOn(conIndiceAjeno, 'work_groups')).toHaveLength(1)
    // Caso simetrico: hablar de ellas en un comentario para decir que NO se tocan vale, y es
    // exactamente lo que hace la cabecera del archivo real.
    expect(ddlStatementsOn(`${upSource}\n-- ALTER TABLE "orders" ...`, 'orders')).toEqual([])

    // Y una escritura de mas sobre una tabla preexistente tambien cambia el veredicto.
    const conBackfill = `${upSource}\nUPDATE "orders" SET "status" = 'asignado';`
    expect(writeStatements(conBackfill)).toHaveLength(4)
  })

  it('meter un uuid literal, quitar el ON CONFLICT o resolver el rol por id cae (R28)', () => {
    const conUuid = upSource.replace(
      `WHERE "r"."name" = 'Operador'`,
      `WHERE "r"."id" = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'`,
    )
    expect(conUuid, 'la mutacion no metio el uuid').not.toBe(upSource)
    expect(literalUuidsIn(conUuid)).toHaveLength(1)
    expect(rolesResolvedByName(conUuid)).toEqual(['Administrador'])

    const sinOnConflict = upSource.replace('ON CONFLICT ("code") DO NOTHING', '')
    expect(sinOnConflict, 'la mutacion no quito el ON CONFLICT').not.toBe(upSource)
    expect(everyWriteIsIdempotent(sinOnConflict)).toBe(false)
    // Caso simetrico: el archivo real los lleva todos.
    expect(everyWriteIsIdempotent(upSource)).toBe(true)
    expect(literalUuidsIn(upSource)).toEqual([])
  })

  it('cambiar una descripcion del SQL lo separa del catalogo y cae (R28)', () => {
    const divergente = upSource.replace(
      "'Consultar los pedidos asignados.'",
      "'Consultar los pedidos que tengo asignados.'",
    )
    expect(divergente, 'la mutacion no cambio la descripcion').not.toBe(upSource)
    expect(permissionRowsIn(divergente)).not.toEqual(PERMISOS_DE_LA_FICHA)

    // Y cambiar el modulo o la accion tambien: la comparacion es de las CUATRO columnas.
    const otroModulo = upSource.replace(
      "('asignaciones.modificar', 'asignaciones', 'modificar',",
      "('asignaciones.modificar', 'pedidos', 'modificar',",
    )
    expect(otroModulo, 'la mutacion no cambio el modulo').not.toBe(upSource)
    expect(permissionRowsIn(otroModulo)).not.toEqual(PERMISOS_DE_LA_FICHA)

    // Caso simetrico: el archivo real coincide con el catalogo importado.
    expect(permissionRowsIn(upSource)).toEqual(PERMISOS_DE_LA_FICHA)
  })
})

describe('mutaciones — el SQL del DOWN', () => {
  it('meter un UPDATE, un INSERT o un ALTER TABLE cae (R35)', () => {
    for (const prohibida of [
      'UPDATE "users" SET "company_id" = NULL;',
      `INSERT INTO "permissions" ("code") VALUES ('asignaciones.consultar');`,
      'ALTER TABLE "orders" DROP COLUMN "status";',
    ]) {
      expect(
        forbiddenDownStatements(`${downSource}\n${prohibida}`),
        `${prohibida} deberia caer`,
      ).toHaveLength(1)
    }
    // Caso simetrico: las tres sentencias reales no disparan.
    expect(forbiddenDownStatements(downSource)).toEqual([])
  })

  it('desacotar un DELETE, cambiar un codigo o meter un CASCADE cae (R35)', () => {
    const sinAcotar = downSource.replace(
      'DELETE FROM "permissions"\nWHERE "code" IN (\'asignaciones.consultar\', \'asignaciones.modificar\');',
      'DELETE FROM "permissions";',
    )
    expect(sinAcotar, 'la mutacion no desacoto el DELETE').not.toBe(downSource)
    expect(boundedDeletesIn(sinAcotar)).toHaveLength(1)
    expect(statements(sinAcotar).filter((statement) => /^DELETE/i.test(statement))).toHaveLength(2)

    const otroCodigo = downSource.replace("'asignaciones.modificar'", "'pedidos.modificar'")
    expect(otroCodigo, 'la mutacion no cambio el codigo').not.toBe(downSource)
    expect(boundedDeletesIn(otroCodigo)[0]?.codigos).not.toEqual(CODIGOS_DE_LA_FICHA)

    const conCascade = downSource.replace(
      'DROP TABLE "order_assignments";',
      'DROP TABLE "order_assignments" CASCADE;',
    )
    expect(conCascade, 'la mutacion no metio el CASCADE').not.toBe(downSource)
    expect(cascadesIn(conCascade)).toHaveLength(1)
    // Caso simetrico: el archivo real no lleva ninguno.
    expect(cascadesIn(downSource)).toEqual([])
  })

  it('nombrar una tabla preexistente en el down cae (R35)', () => {
    for (const ajena of ['orders', 'users', 'work_groups', 'companies']) {
      const conAjena = `${downSource}\nDROP TABLE "${ajena}";`
      expect(statementsMentioning(conAjena, ajena), `${ajena} deberia caer`).toHaveLength(1)
      // Caso simetrico: el archivo real no la nombra.
      expect(statementsMentioning(downSource, ajena)).toEqual([])
    }
  })
})

describe('mutaciones — el esquema de Prisma', () => {
  it('quitar el /// @module o cambiarlo de dueno cae (R30)', () => {
    const sinDueno = rawSchema.replace(
      '/// @module asignaciones\nmodel OrderAssignment {',
      'model OrderAssignment {',
    )
    expect(sinDueno, 'la mutacion no quito el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(sinDueno, 'OrderAssignment')).toBeNull()

    const otroDueno = rawSchema.replace(
      '/// @module asignaciones\nmodel OrderAssignment {',
      '/// @module pedidos\nmodel OrderAssignment {',
    )
    expect(otroDueno, 'la mutacion no cambio el @module').not.toBe(rawSchema)
    expect(moduleOwnerOf(otroDueno, 'OrderAssignment')).toBe('pedidos')
  })

  it('meter una @relation cae (R31)', () => {
    const conRelacion = mutateModel(
      rawSchema,
      'OrderAssignment',
      '  workGroupName String?  @map("work_group_name")\n',
      '  workGroupName String?  @map("work_group_name")\n' +
        '  order         Order    @relation(fields: [orderId], references: [id])\n',
    )
    expect(conRelacion, 'la mutacion no anadio la @relation').not.toBe(rawSchema)
    expect(relationsIn(conRelacion, 'OrderAssignment')).toHaveLength(1)
  })

  it('volver obligatorio el grupo, anulable una referencia o quitar una marca cae (R1, R6, R23)', () => {
    const grupoObligatorio = mutateModel(
      rawSchema,
      'OrderAssignment',
      'workGroupId   String?  @map("work_group_id")',
      'workGroupId   String   @map("work_group_id")',
    )
    expect(grupoObligatorio, 'la mutacion no quito el ?').not.toBe(rawSchema)
    expect(modelFields(grupoObligatorio, 'OrderAssignment').get('workGroupId')?.anulable).toBe(false)

    const empresaAnulable = mutateModel(
      rawSchema,
      'OrderAssignment',
      'companyId     String   @map("company_id")',
      'companyId     String?  @map("company_id")',
    )
    expect(empresaAnulable, 'la mutacion no puso el ?').not.toBe(rawSchema)
    expect(modelFields(empresaAnulable, 'OrderAssignment').get('companyId')?.anulable).toBe(true)

    const sinMarca = mutateModel(
      rawSchema,
      'OrderAssignment',
      '  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)\n',
      '',
    )
    expect(sinMarca, 'la mutacion no quito el updatedAt').not.toBe(rawSchema)
    expect(modelFields(sinMarca, 'OrderAssignment').has('updatedAt')).toBe(false)
    // Caso simetrico: en el esquema real estan las siete columnas y solo dos son anulables.
    expect(modelFields(rawSchema, 'OrderAssignment').size).toBe(7)
  })

  it('anadir una columna que guarde un segundo origen cae (R5)', () => {
    const conOrigen = mutateModel(
      rawSchema,
      'OrderAssignment',
      '  workGroupName String?  @map("work_group_name")\n',
      '  workGroupName String?  @map("work_group_name")\n  source        String?  @map("source")\n',
    )
    expect(conOrigen, 'la mutacion no anadio la columna').not.toBe(rawSchema)
    expect(modelFields(conOrigen, 'OrderAssignment').has('source')).toBe(true)

    const sqlConOrigen = upSource.replace(
      '"work_group_name" TEXT,',
      '"work_group_name" TEXT,\n    "source" TEXT,',
    )
    expect(sqlConOrigen, 'la mutacion no anadio la columna al SQL').not.toBe(upSource)
    expect([...tableColumns(sqlConOrigen, TABLA).keys()]).toContain('source')

    // Y una tabla auxiliar donde esconder el segundo origen tambien cambia el veredicto.
    const conTablaAuxiliar = `${upSource}\nCREATE TABLE "order_assignment_sources" ("order_id" UUID NOT NULL);`
    expect(createdTables(conTablaAuxiliar)).toHaveLength(2)
  })
})
