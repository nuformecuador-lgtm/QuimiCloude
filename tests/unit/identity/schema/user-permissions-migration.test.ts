// Contrato estatico del SQL de la migracion del catalogo de permisos (QC-66).
//
// Cubre R8, R11, R43 y R44. Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo
// regenera nunca: esta es una migracion de DATOS, escrita entera a mano.
//
// Por que existe este archivo, dicho sin rodeos: el catalogo queda escrito DOS veces —en
// `PERMISSIONS` y en el SQL—, y `design.md > 3.1` acepta ese precio a condicion de mitigarlo
// AQUI. Asi que los dos codigos y sus descripciones NO se escriben en este archivo: se
// IMPORTAN de `@/lib/modules/identity/domain/permissions` y se comparan con lo que el SQL dice.
// El nombre del rol, igual: sale de `ROLE_ADMINISTRADOR` importado (R24 habla del codigo
// TypeScript; un `.sql` no puede importar una constante, y esta es la unica forma de que los dos
// no divergan en silencio).
//
// Cada afirmacion se escribe como un PREDICADO PURO EXPORTADO que recibe el texto SQL y devuelve
// el veredicto, y se aplica dos veces: al SQL real y a una copia MUTADA EN MEMORIA. El archivo
// en disco NO se toca. Un test que no puede fallar no vigila nada (mismo patron que
// `account-status-migration.test.ts`, QC-65).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_ADMINISTRADOR, SEED_ROLE_PERMISSIONS } from '@/lib/modules/identity'

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
 * La carpeta se localiza por PATRON, no por su timestamp escrito a pelo: si la migracion se
 * regenera con otra marca de tiempo, el test tiene que seguir apuntando a ella.
 */
const catalogDirs = readdirSync(migrationsDir).filter((name) =>
  /_user_permissions_catalog$/.test(name),
)
expect(
  catalogDirs,
  'debe existir exactamente una migracion del catalogo de permisos de usuarios',
).toHaveLength(1)
const migrationDir = join(migrationsDir, catalogDirs[0] as string)

/** Quita comentarios de linea y de bloque: lo que se afirma es SQL ejecutable, no prosa. */
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
const up = statements(upSource)
const down = statements(downSource)

/** Los dos permisos de `usuarios` del catalogo REAL, en su orden. No se copian aqui. */
const PERMISOS_DE_USUARIOS = PERMISSIONS.filter((permission) => permission.module === 'usuarios')

/** Los codigos de `usuarios` que el seed asigna al Administrador, del dominio REAL. */
const CODIGOS_SEMBRADOS_AL_ADMIN = (SEED_ROLE_PERMISSIONS[ROLE_ADMINISTRADOR] ?? []).filter(
  (code) => code.startsWith('usuarios.'),
)

// --- Predicados puros ----------------------------------------------------------------------

/**
 * Parte un texto por las comas de PRIMER NIVEL, respetando las cadenas con comillas simples: la
 * descripcion de `usuarios.modificar` lleva comas dentro («Crear, editar, borrar y...»), asi que
 * un `split(',')` a pelo la trocearia y el test compararia basura.
 */
function splitTopLevel(text: string): readonly string[] {
  const partes: string[] = []
  let actual = ''
  let enCadena = false
  for (const caracter of text) {
    if (caracter === "'") enCadena = !enCadena
    if (caracter === ',' && !enCadena) {
      partes.push(actual.trim())
      actual = ''
      continue
    }
    actual += caracter
  }
  partes.push(actual.trim())
  return partes.filter((parte) => parte.length > 0)
}

type FilaDeCatalogo = {
  readonly code: string
  readonly module: string
  readonly action: string
  readonly description: string
  readonly updatedAt: string
}

/**
 * R8, R43. Las filas del `INSERT INTO "permissions"`, tal como las escribe el SQL; `null` si no
 * hay ningun INSERT sobre `permissions` o si su forma no es la esperada.
 */
export function catalogRowsInUp(sql: string): readonly FilaDeCatalogo[] | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return null
  const columnas = /^INSERT INTO "permissions" \(([^)]*)\)/i.exec(insert)?.[1]
  if (columnas === undefined) return null
  const nombres = splitTopLevel(columnas).map((nombre) => nombre.replace(/"/g, ''))
  if (
    nombres.join(',') !== ['code', 'module', 'action', 'description', 'updated_at'].join(',')
  ) {
    return null
  }
  const cuerpo = /VALUES\s*([\s\S]*?)(?:ON CONFLICT|$)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const tuplas = cuerpo.match(/\([^()]*\)/g)
  if (tuplas === null) return null
  const filas: FilaDeCatalogo[] = []
  for (const tupla of tuplas) {
    const campos = splitTopLevel(tupla.slice(1, -1))
    if (campos.length !== 5) return null
    const literales = campos
      .slice(0, 4)
      .map((campo) => /^'([\s\S]*)'$/.exec(campo)?.[1])
    if (literales.some((literal) => literal === undefined)) return null
    filas.push({
      code: literales[0] as string,
      module: literales[1] as string,
      action: literales[2] as string,
      description: literales[3] as string,
      updatedAt: campos[4] as string,
    })
  }
  return filas
}

/**
 * R8. ¿El SQL inserta EXACTAMENTE los permisos de `usuarios` del catalogo —codigo, modulo,
 * accion y descripcion—, con la misma grafia? La lista esperada se IMPORTA de
 * `PERMISSIONS`; no se copia aqui, que es el punto entero de este archivo.
 */
export function catalogRowsMatchTheOnlyCatalog(sql: string): boolean {
  const filas = catalogRowsInUp(sql)
  if (filas === null) return false
  if (filas.length !== PERMISOS_DE_USUARIOS.length) return false
  return filas.every((fila, indice) => {
    const esperado = PERMISOS_DE_USUARIOS[indice]
    if (esperado === undefined) return false
    return (
      fila.code === esperado.code &&
      fila.module === esperado.module &&
      fila.action === esperado.action &&
      fila.description === esperado.description
    )
  })
}

/**
 * `design.md > 3.2`. `permissions.updated_at` es `NOT NULL` y NO tiene default: si el INSERT no
 * lo escribe, la migracion revienta con 23502 en el despliegue y no aqui.
 */
export function updatedAtIsWrittenExplicitly(sql: string): boolean {
  const filas = catalogRowsInUp(sql)
  if (filas === null) return false
  return filas.length > 0 && filas.every((fila) => /^CURRENT_TIMESTAMP$/i.test(fila.updatedAt))
}

/**
 * R11. ¿TODAS las sentencias que insertan llevan `ON CONFLICT ... DO NOTHING`? Es lo unico que
 * hace la migracion idempotente: sin esto, aplicarla sobre una base donde el seed ya sembro los
 * dos codigos falla con 23505 y deja el despliegue a medias.
 */
export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 2) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

/** El literal del nombre de rol con el que el UP resuelve el rol, o `null` si no hay ninguno. */
export function adminRoleNameInUp(sql: string): string | null {
  const match = /WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.exec(stripSqlComments(sql))
  return match?.[1] ?? null
}

/**
 * R9, R24. ¿El rol se resuelve POR NOMBRE, con el mismo nombre que `ROLE_ADMINISTRADOR`
 * importado, y SIN ningun uuid escrito a mano? `roles.id` es `gen_random_uuid()` y es distinto
 * en cada instalacion: un uuid literal aqui no asignaria nada en produccion.
 */
export function rolesResolvedByNameNotByUuid(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  const nombre = adminRoleNameInUp(sql)
  if (nombre !== ROLE_ADMINISTRADOR) return false
  if (!/FROM\s+"roles"\s+AS\s+"r"/i.test(ejecutable)) return false
  return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ejecutable)
}

/**
 * R9, R11. Los codigos que el UP asigna al rol, leidos del `CROSS JOIN (VALUES ...)`. Escritos
 * UNO A UNO en el SQL (decision 1: `modificar` NO implica `consultar`), nunca derivados de
 * `permissions` con un `SELECT *`, que seria un comodin por la puerta de atras.
 */
export function assignedCodesInUp(sql: string): readonly string[] | null {
  const cuerpo = /CROSS JOIN \(VALUES\s*([\s\S]*?)\)\s*AS/i.exec(stripSqlComments(sql))?.[1]
  if (cuerpo === undefined) return null
  const literales = [...cuerpo.matchAll(/'([^']*)'/g)].map((match) => match[1] as string)
  return literales.length === 0 ? null : literales
}

/** R9. ¿Los codigos asignados son exactamente los que el seed le da al Administrador? */
export function assignedCodesMatchTheSeed(sql: string): boolean {
  const codigos = assignedCodesInUp(sql)
  if (codigos === null) return false
  return codigos.join(',') === [...CODIGOS_SEMBRADOS_AL_ADMIN].join(',')
}

/**
 * R43. Las sentencias de ESQUEMA del SQL: esta migracion solo inserta FILAS, asi que un `ALTER`,
 * un `CREATE` o un `DROP` —de tabla, de indice, de restriccion o de tipo— no tienen nada que
 * hacer aqui. Se mira sobre el SQL ejecutable: la cabecera los NOMBRA a proposito, para decir
 * que no se tocan.
 */
export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /(^(ALTER|CREATE|DROP|TRUNCATE)\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX|TABLE|TYPE)\b)|(\bADD (CONSTRAINT|COLUMN)\b)/i.test(
      statement,
    ),
  )
}

/** Las tablas que el SQL escribe, en minuscula y sin repetir. */
export function tablesWritten(sql: string): readonly string[] {
  const tocadas = new Set<string>()
  for (const statement of statements(sql)) {
    const match = /^(?:UPDATE|INSERT INTO|DELETE FROM)\s+"?(\w+)"?/i.exec(statement)
    if (match !== null) tocadas.add((match[1] as string).toLowerCase())
  }
  return [...tocadas].sort()
}

/**
 * R38, R45. ¿El SQL ejecutable pisa algo que esta ficha tiene PROHIBIDO tocar: los tres indices
 * unicos de `users` (QC-47), el borrado logico, el contador de intentos de QC-19 o el RLS?
 */
export function touchesForbiddenGround(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  return (
    /users_email_unique|users_username_unique|users_document_unique/i.test(ejecutable) ||
    /deleted_at/i.test(ejecutable) ||
    /failed_login_attempts|lock_level|locked_until/i.test(ejecutable) ||
    /ROW\s+LEVEL\s+SECURITY/i.test(ejecutable)
  )
}

/**
 * R44. ¿El DOWN borra las ASIGNACIONES antes que el PERMISO? La FK
 * `role_permissions_permission_code_fkey` es `RESTRICT`: al reves, el `DELETE FROM "permissions"`
 * falla con 23503 y el rollback no revierte nada. El orden se mide por POSICION en el texto.
 */
export function downDeletesAssignmentsFirst(sql: string): boolean {
  const sentencias = statements(sql)
  const posicion = (pattern: RegExp): number => sentencias.findIndex((s) => pattern.test(s))
  const asignaciones = posicion(/^DELETE FROM "role_permissions"/i)
  const permisos = posicion(/^DELETE FROM "permissions"/i)
  if (asignaciones === -1 || permisos === -1) return false
  return asignaciones < permisos
}

/**
 * R44. ¿Los dos `DELETE` van acotados POR CODIGO a los dos codigos nuevos? Sin el `WHERE`, el
 * DOWN vaciaria el catalogo entero y todas sus asignaciones.
 */
export function downDeletesOnlyTheNewCodes(sql: string): boolean {
  const sentencias = statements(sql).filter((statement) => /^DELETE FROM/i.test(statement))
  if (sentencias.length !== 2) return false
  const esperados = PERMISOS_DE_USUARIOS.map((permission) => permission.code)
  return sentencias.every((sentencia) => {
    const lista = /\bIN \(([^)]*)\)/i.exec(sentencia)?.[1]
    if (lista === undefined) return false
    const codigos = [...lista.matchAll(/'([^']*)'/g)].map((match) => match[1] as string)
    return codigos.join(',') === esperados.join(',')
  })
}

/** Invierte el orden de las sentencias de un SQL, derivandolo del real: no se copia nada. */
function withReversedStatements(sql: string): string {
  return statements(sql)
    .slice()
    .reverse()
    .map((statement) => `${statement};`)
    .join('\n')
}

// --- El UP: el catalogo, comparado contra su UNICO dueño -------------------------------------

describe('migration.sql — los dos codigos salen del catalogo, no de una copia (R8)', () => {
  it('inserta EXACTAMENTE los permisos de `usuarios` de PERMISSIONS, y cae si divergen', () => {
    expect(PERMISOS_DE_USUARIOS.map((permission) => permission.code)).toEqual([
      'usuarios.consultar',
      'usuarios.modificar',
    ])
    expect(catalogRowsMatchTheOnlyCatalog(upSource)).toBe(true)
    expect(catalogRowsInUp(upSource)?.map((fila) => fila.code)).toEqual(
      PERMISOS_DE_USUARIOS.map((permission) => permission.code),
    )

    // --- Sensibilidad (mutacion EN MEMORIA; el archivo en disco no se toca): cambiar el codigo
    // en el SQL sin cambiar el catalogo CAE. Es la desincronizacion silenciosa que este archivo
    // existe para detectar (`design.md > 3.1`: hay dos escrituras del mismo dato).
    const renombrado = upSource.replace(
      `'${PERMISOS_DE_USUARIOS[0]?.code}'`,
      "'usuarios.ver'",
    )
    expect(renombrado, 'la mutacion no renombro ningun codigo').not.toBe(upSource)
    expect(catalogRowsMatchTheOnlyCatalog(renombrado)).toBe(false)

    // Retocar la DESCRIPCION tambien cae: la base quedaria describiendo otra cosa que el codigo.
    const redescrito = upSource.replace(
      PERMISOS_DE_USUARIOS[0]?.description as string,
      'Otra cosa.',
    )
    expect(redescrito, 'la mutacion no cambio ninguna descripcion').not.toBe(upSource)
    expect(catalogRowsMatchTheOnlyCatalog(redescrito)).toBe(false)

    // Y sin el INSERT no hay catalogo que comparar: eso tampoco pasa.
    const sinInsert = upSource.replace(/^INSERT INTO "permissions"[\s\S]*?;/m, '')
    expect(sinInsert, 'la mutacion no quito el INSERT').not.toBe(upSource)
    expect(catalogRowsMatchTheOnlyCatalog(sinInsert)).toBe(false)
  })

  it('escribe `updated_at` explicito, porque `permissions` no tiene default', () => {
    expect(updatedAtIsWrittenExplicitly(upSource)).toBe(true)

    // --- Sensibilidad: quitar la columna de la lista deja el INSERT con una forma que el
    // predicado ya no reconoce —y la base lo rechazaria con 23502 en el despliegue—.
    const sinUpdatedAt = upSource.replace('", "updated_at")', '")')
    expect(sinUpdatedAt, 'la mutacion no quito updated_at').not.toBe(upSource)
    expect(updatedAtIsWrittenExplicitly(sinUpdatedAt)).toBe(false)
  })
})

// --- El UP: idempotencia --------------------------------------------------------------------

describe('migration.sql — se puede aplicar dos veces (R11)', () => {
  it('las DOS sentencias que insertan llevan ON CONFLICT ... DO NOTHING, y cae si falta una', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    // --- Sensibilidad: quitar el `ON CONFLICT` del catalogo. Sobre una base donde el seed ya
    // sembro los dos codigos, la migracion fallaria con 23505 — en el despliegue, no aqui.
    const sinConflictoDelCatalogo = upSource.replace(/\s*ON CONFLICT \("code"\) DO NOTHING/i, '')
    expect(sinConflictoDelCatalogo, 'la mutacion no quito el primer ON CONFLICT').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDelCatalogo)).toBe(false)

    // Y quitarlo de las ASIGNACIONES cae igual: la PK de `role_permissions` es compuesta y la
    // segunda corrida chocaria contra ella.
    const sinConflictoDeLasAsignaciones = upSource.replace(
      /\s*ON CONFLICT \("role_id", "permission_code"\) DO NOTHING/i,
      '',
    )
    expect(
      sinConflictoDeLasAsignaciones,
      'la mutacion no quito el segundo ON CONFLICT',
    ).not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDeLasAsignaciones)).toBe(false)

    // `DO UPDATE` tampoco vale: R11 pide «sin reescribir ninguna fila existente», no «sin
    // fallar». Un `DO UPDATE SET` pisaria la descripcion que ya hubiera en la base.
    const conDoUpdate = upSource.replace(
      /ON CONFLICT \("code"\) DO NOTHING/i,
      'ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"',
    )
    expect(conDoUpdate, 'la mutacion no cambio el DO NOTHING').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(conDoUpdate)).toBe(false)
  })
})

// --- El UP: el rol, por nombre y uno a uno --------------------------------------------------

describe('migration.sql — el rol se resuelve por NOMBRE y los codigos van uno a uno (R9)', () => {
  it('el nombre del rol del SQL es el de ROLE_ADMINISTRADOR importado, y no hay ningun uuid', () => {
    expect(adminRoleNameInUp(upSource)).toBe(ROLE_ADMINISTRADOR)
    expect(rolesResolvedByNameNotByUuid(upSource)).toBe(true)

    // --- Sensibilidad: el nombre del rol escrito de otra forma cae. Es el unico literal que el
    // SQL no puede importar, y el que divergeria sin que nadie se enterase.
    const otroRol = upSource.replace(`'${ROLE_ADMINISTRADOR}'`, "'Admin'")
    expect(otroRol, 'la mutacion no cambio el nombre del rol').not.toBe(upSource)
    expect(rolesResolvedByNameNotByUuid(otroRol)).toBe(false)

    // Y un uuid escrito a mano —distinto en cada instalacion— tambien cae.
    const conUuid = upSource.replace(
      /WHERE "r"\."name" = '[^']*'/i,
      `WHERE "r"."id" = '00000000-0000-4000-8000-000000000000'`,
    )
    expect(conUuid, 'la mutacion no metio el uuid').not.toBe(upSource)
    expect(rolesResolvedByNameNotByUuid(conUuid)).toBe(false)
  })

  it('asigna los dos codigos ESCRITOS uno a uno, los mismos que el seed', () => {
    expect(CODIGOS_SEMBRADOS_AL_ADMIN).toEqual(['usuarios.consultar', 'usuarios.modificar'])
    expect(assignedCodesInUp(upSource)).toEqual([...CODIGOS_SEMBRADOS_AL_ADMIN])
    expect(assignedCodesMatchTheSeed(upSource)).toBe(true)

    // --- Sensibilidad: asignar solo uno de los dos —el error de creer que `modificar` implica
    // `consultar`, que la decision 1 prohibe— cae.
    const soloUno = upSource.replace(`, ('${CODIGOS_SEMBRADOS_AL_ADMIN[1]}')`, '')
    expect(soloUno, 'la mutacion no quito ningun codigo').not.toBe(upSource)
    expect(assignedCodesMatchTheSeed(soloUno)).toBe(false)
  })
})

// --- El UP: cero esquema --------------------------------------------------------------------

describe('migration.sql — es una migracion de DATOS, y solo de datos (R43, R38)', () => {
  it('no hay un solo ALTER, CREATE ni DROP en todo el UP, y cae si se cuela uno', () => {
    expect(schemaStatements(upSource), 'el UP no puede tocar el esquema').toEqual([])

    // El UP son DOS sentencias y las dos insertan filas: nada mas cabe en esta migracion (R43).
    expect(up).toHaveLength(2)
    expect(up.filter((statement) => /^INSERT INTO/i.test(statement))).toHaveLength(2)

    // --- Sensibilidad, una por tipo de sentencia: las tres caen por separado.
    expect(
      schemaStatements(`${upSource}\nALTER TABLE "users" ADD COLUMN "nickname" TEXT;`),
    ).toHaveLength(1)
    expect(
      schemaStatements(`${upSource}\nCREATE INDEX "permissions_module_idx" ON "permissions"("module");`),
    ).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nDROP INDEX "users_email_unique";`)).toHaveLength(1)

    // Y nombrarlos en un COMENTARIO —para decir que NO se tocan— no cae: es lo que hace la
    // cabecera del archivo real.
    expect(schemaStatements(`${upSource}\n-- no se hace ningun ALTER TABLE ni DROP INDEX`)).toEqual(
      [],
    )
  })

  it('solo escribe en `permissions` y `role_permissions`: ninguna fila de `users` se toca', () => {
    expect(tablesWritten(upSource)).toEqual(['permissions', 'role_permissions'])
    expect(tablesWritten(downSource)).toEqual(['permissions', 'role_permissions'])

    // --- Sensibilidad: una escritura sobre `users` colada al final se ve.
    expect(
      tablesWritten(`${upSource}\nUPDATE "users" SET "account_status" = 'active';`),
    ).toEqual(['permissions', 'role_permissions', 'users'])
  })

  it('ni el UP ni el DOWN pisan los tres unicos de QC-47, el borrado logico, QC-19 ni el RLS', () => {
    for (const [nombre, sql] of [
      ['migration.sql', upSource],
      ['down.sql', downSource],
    ] as const) {
      expect(touchesForbiddenGround(sql), `${nombre} pisa terreno prohibido`).toBe(false)
    }

    // --- Sensibilidad, una a una: cada cosa prohibida cae por separado (R38, R45).
    expect(touchesForbiddenGround(`${upSource}\nDROP INDEX "users_document_unique";`)).toBe(true)
    expect(touchesForbiddenGround(`${upSource}\nUPDATE "users" SET "deleted_at" = NULL;`)).toBe(true)
    expect(
      touchesForbiddenGround(`${upSource}\nUPDATE "users" SET "failed_login_attempts" = 0;`),
    ).toBe(true)
    expect(
      touchesForbiddenGround(`${upSource}\nALTER TABLE "permissions" DISABLE ROW LEVEL SECURITY;`),
    ).toBe(true)
  })
})

// --- El DOWN --------------------------------------------------------------------------------

describe('down.sql — borra las asignaciones ANTES del permiso (R44)', () => {
  it('el orden es el inverso del UP, y cae si se invierte', () => {
    expect(downDeletesAssignmentsFirst(downSource)).toBe(true)
    expect(down).toHaveLength(2)

    // --- Sensibilidad: con el orden invertido, el `DELETE FROM "permissions"` choca contra el
    // RESTRICT de `role_permissions_permission_code_fkey` (23503) y el rollback no revierte
    // nada. El SQL invertido se DERIVA del real, no se copia.
    const invertido = withReversedStatements(downSource)
    expect(invertido, 'la mutacion no reordeno nada').not.toBe(downSource)
    expect(downDeletesAssignmentsFirst(invertido)).toBe(false)

    // Y un DOWN que solo borra el permiso, olvidandose de las asignaciones, falla igual.
    const sinAsignaciones = downSource.replace(/DELETE FROM "role_permissions"[\s\S]*?;/m, '')
    expect(sinAsignaciones, 'la mutacion no quito el DELETE de las asignaciones').not.toBe(
      downSource,
    )
    expect(downDeletesAssignmentsFirst(sinAsignaciones)).toBe(false)
  })

  it('los dos DELETE van acotados a los dos codigos nuevos, y no vacian el catalogo', () => {
    expect(downDeletesOnlyTheNewCodes(downSource)).toBe(true)

    // --- Sensibilidad: sin el `WHERE`, el DOWN se lleva las ONCE entradas anteriores y todas
    // sus asignaciones. Eso no es «el estado exacto anterior» (R44): cae.
    const sinWhere = downSource.replace(
      /DELETE FROM "permissions"\s*\nWHERE "code" IN \([^)]*\);/m,
      'DELETE FROM "permissions";',
    )
    expect(sinWhere, 'la mutacion no quito el WHERE').not.toBe(downSource)
    expect(downDeletesOnlyTheNewCodes(sinWhere)).toBe(false)
  })

  it('el DOWN no crea ni altera nada: el UP solo inserto filas', () => {
    expect(schemaStatements(downSource), 'el DOWN no puede tocar el esquema').toEqual([])
    expect(
      down.filter((statement) => /^(INSERT|UPDATE)\b/i.test(statement)),
      'el DOWN solo borra: el UP solo anadio filas',
    ).toEqual([])
  })
})
