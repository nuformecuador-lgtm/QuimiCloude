// Contrato estatico del SQL de la migracion del permiso propio de documentos.
//
// Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo regenera nunca: esta es una
// migracion de DATOS, escrita entera a mano.
//
// Los dos codigos, sus modulos, acciones y descripciones se escriben DOS veces -en el dominio y
// en el SQL-, y eso se acepta a condicion de mitigarlo AQUI: nada se copia en este archivo, todo
// se IMPORTA del barril de `identity` y se compara con lo que el SQL dice.
//
// Cada afirmacion es un PREDICADO PURO EXPORTADO que recibe el texto SQL y devuelve el veredicto,
// aplicado dos veces: al SQL real y a una copia MUTADA EN MEMORIA. El archivo en disco no se
// toca. Un test que no puede fallar no vigila nada (mismo patron que `packer-role-migration.test.ts`).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_ADMINISTRADOR } from '@/lib/modules/identity'

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

/** La carpeta se localiza por PATRON, no por su timestamp: si se regenera, el test la sigue viendo. */
const documentsPermissionsDirs = readdirSync(migrationsDir).filter((name) => /_documents_permissions$/.test(name))
expect(documentsPermissionsDirs, 'debe existir exactamente una migracion de permisos de documentos').toHaveLength(1)
const migrationDir = join(migrationsDir, documentsPermissionsDirs[0] as string)

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

/** Las dos entradas REALES del catalogo, del dominio. No se copian aqui. */
const DOCUMENTOS_CONSULTAR = PERMISSIONS.find((permission) => permission.code === 'documentos.consultar')
const DOCUMENTOS_MODIFICAR = PERMISSIONS.find((permission) => permission.code === 'documentos.modificar')

// --- Predicados puros ----------------------------------------------------------------------

/** ¿El UP son EXACTAMENTE tres `INSERT` y nada mas (R11)? */
export function upIsExactlyThreeInserts(sql: string): boolean {
  const todas = statements(sql)
  if (todas.length !== 3) return false
  return todas.every((statement) => /^INSERT INTO/i.test(statement))
}

/** ¿Los TRES `INSERT` llevan `ON CONFLICT ... DO NOTHING`? Es lo que hace idempotente el UP (R9). */
export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 3) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

/** Las filas de permiso que el primer `INSERT` escribe, en el orden del archivo. */
export function permissionRowsInUp(
  sql: string,
): readonly { code: string; module: string; action: string; description: string; updatedAt: string }[] | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return null
  const cuerpo = /VALUES\s*(.*?)\s*ON CONFLICT/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const filas = [...cuerpo.matchAll(/\(([^()]*)\)/g)].map((match) => match[1] as string)
  return filas.map((fila) => {
    const campos = [...fila.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] as string).replace(/''/g, "'"))
    const updatedAt = /CURRENT_TIMESTAMP/i.test(fila) ? 'CURRENT_TIMESTAMP' : ''
    return {
      code: campos[0] ?? '',
      module: campos[1] ?? '',
      action: campos[2] ?? '',
      description: campos[3] ?? '',
      updatedAt,
    }
  })
}

/** ¿Las dos filas que el UP inserta son EXACTAMENTE `documentos.consultar` y `documentos.modificar` de `PERMISSIONS`? */
export function permissionRowsMatchTheDomain(sql: string): boolean {
  const filas = permissionRowsInUp(sql)
  if (filas === null || filas.length !== 2) return false
  if (DOCUMENTOS_CONSULTAR === undefined || DOCUMENTOS_MODIFICAR === undefined) return false
  const [primera, segunda] = filas
  const coincideCon = (
    fila: { code: string; module: string; action: string; description: string; updatedAt: string } | undefined,
    entrada: { code: string; module: string; action: string; description: string },
  ): boolean =>
    fila !== undefined &&
    fila.code === entrada.code &&
    fila.module === entrada.module &&
    fila.action === entrada.action &&
    fila.description === entrada.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  return coincideCon(primera, DOCUMENTOS_CONSULTAR) && coincideCon(segunda, DOCUMENTOS_MODIFICAR)
}

/** ¿El segundo `INSERT` asigna las dos entradas al Administrador, resuelto por NOMBRE? */
export function administratorGetsBothPermissions(sql: string): boolean {
  const insert = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))[0]
  if (insert === undefined) return false
  if (!/WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.test(insert)) return false
  const nombre = /WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.exec(insert)?.[1]
  if (nombre !== ROLE_ADMINISTRADOR) return false
  return /'documentos\.consultar'/i.test(insert) && /'documentos\.modificar'/i.test(insert) && /CROSS JOIN/i.test(insert)
}

/** ¿El tercer `INSERT` filtra por `proveedores.modificar` e inserta solo `documentos.modificar`? */
export function inheritanceInsertsOnlyModificar(sql: string): boolean {
  const insert = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))[1]
  if (insert === undefined) return false
  const filtraPorProveedoresModificar = /WHERE\s+"rp"\."permission_code"\s*=\s*'proveedores\.modificar'/i.test(insert)
  const insertaSoloModificar = /'documentos\.modificar'/i.test(insert) && !/'documentos\.consultar'/i.test(insert)
  return filtraPorProveedoresModificar && insertaSoloModificar
}

/** ¿De los DOS `INSERT` de `role_permissions`, solo el del Administrador menciona `documentos.consultar`? */
export function onlyTheAdministratorInsertMentionsConsultar(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  if (inserts.length !== 2) return false
  const [administrador, herencia] = inserts
  return /'documentos\.consultar'/i.test(administrador as string) && !/'documentos\.consultar'/i.test(herencia as string)
}

/**
 * Las sentencias de ESQUEMA del SQL: esta migracion solo inserta FILAS, asi que un `ALTER`, un
 * `CREATE` o un `DROP` -de tabla, de indice, de restriccion o de tipo- no tienen nada que hacer
 * aqui (R11).
 */
export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /(^(ALTER|CREATE|DROP|TRUNCATE)\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX|TABLE|TYPE)\b)|(\bADD (CONSTRAINT|COLUMN)\b)/i.test(
      statement,
    ),
  )
}

/** ¿El DOWN son EXACTAMENTE dos `DELETE`, las asignaciones antes que el catalogo (R10)? */
export function downDeletesAssignmentsBeforeCatalog(sql: string): boolean {
  const sentencias = statements(sql)
  if (sentencias.length !== 2) return false
  return (
    /^DELETE FROM "role_permissions" WHERE "permission_code" IN \('documentos\.consultar', ?'documentos\.modificar'\)$/i.test(
      sentencias[0] as string,
    ) &&
    /^DELETE FROM "permissions" WHERE "code" IN \('documentos\.consultar', ?'documentos\.modificar'\)$/i.test(
      sentencias[1] as string,
    )
  )
}

/** ¿El DOWN acota los dos `DELETE` a los dos codigos, sin borrar por rol ni sin condicion? */
export function downIsScopedToTheTwoCodes(sql: string): boolean {
  return statements(sql).every(
    (statement) => /'documentos\.consultar'/i.test(statement) && /'documentos\.modificar'/i.test(statement),
  )
}

/** ¿El DOWN no lleva `CASCADE`, `INSERT`, `UPDATE` ni `ALTER` en ninguna linea ejecutable? */
export function downHasOnlyBareDeletes(sql: string): boolean {
  const ejecutable = stripSqlComments(sql)
  if (/CASCADE/i.test(ejecutable)) return false
  if (statements(sql).some((statement) => /^(INSERT|UPDATE|ALTER)\b/i.test(statement))) return false
  return statements(sql).every((statement) => /^DELETE FROM/i.test(statement))
}

/** Invierte el orden de las sentencias de un SQL, derivandolo del real: no se copia nada. */
function withReversedStatements(sql: string): string {
  return statements(sql)
    .slice()
    .reverse()
    .map((statement) => `${statement};`)
    .join('\n')
}

// --- El UP: forma general -------------------------------------------------------------------

describe('migration.sql — es EXACTAMENTE tres INSERT y nada mas (R11)', () => {
  it('las tres sentencias son INSERT, y cae si se cuela otra', () => {
    expect(upIsExactlyThreeInserts(upSource)).toBe(true)
    expect(up).toHaveLength(3)

    const conUnaCuarta = `${upSource}\nUPDATE "roles" SET "description" = 'x' WHERE "name" = 'Administrador';`
    expect(upIsExactlyThreeInserts(conUnaCuarta)).toBe(false)
  })

  it('el UP no toca el esquema: ni ALTER, ni CREATE ni DROP, y cae si se cuela uno (R11)', () => {
    expect(schemaStatements(upSource)).toEqual([])

    expect(schemaStatements(`${upSource}\nALTER TABLE "roles" ADD COLUMN "nickname" TEXT;`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nCREATE INDEX "roles_name_idx" ON "roles"("name");`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nDROP INDEX "roles_name_key";`)).toHaveLength(1)
  })
})

// --- El UP: idempotencia --------------------------------------------------------------------

describe('migration.sql — se puede aplicar dos veces (R9)', () => {
  it('los TRES INSERT llevan ON CONFLICT ... DO NOTHING, y cae si falta uno', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    const sinConflictoDelCatalogo = upSource.replace(/\s*ON CONFLICT \("code"\) DO NOTHING/i, '')
    expect(sinConflictoDelCatalogo, 'la mutacion no quito el ON CONFLICT del catalogo').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDelCatalogo)).toBe(false)

    const sinUnConflictoDeAsignacion = upSource.replace(
      /\s*ON CONFLICT \("role_id", "permission_code"\) DO NOTHING/i,
      '',
    )
    expect(sinUnConflictoDeAsignacion, 'la mutacion no quito ningun ON CONFLICT de role_permissions').not.toBe(
      upSource,
    )
    expect(everyInsertIgnoresConflicts(sinUnConflictoDeAsignacion)).toBe(false)

    const conDoUpdate = upSource.replace(
      /ON CONFLICT \("code"\) DO NOTHING/i,
      'ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description"',
    )
    expect(conDoUpdate, 'la mutacion no cambio el DO NOTHING').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(conDoUpdate)).toBe(false)
  })
})

// --- El UP: los literales salen del dominio, no de una copia ---------------------------------

describe('migration.sql — las dos entradas salen de PERMISSIONS (R4)', () => {
  it('las dos filas insertadas son EXACTAMENTE documentos.consultar y documentos.modificar del catalogo', () => {
    expect(DOCUMENTOS_CONSULTAR).toBeDefined()
    expect(DOCUMENTOS_MODIFICAR).toBeDefined()
    expect(permissionRowsMatchTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace(
      (DOCUMENTOS_CONSULTAR as { description: string }).description,
      'Otra cosa.',
    )
    expect(otraDescripcion, 'la mutacion no cambio la descripcion').not.toBe(upSource)
    expect(permissionRowsMatchTheDomain(otraDescripcion)).toBe(false)

    const otroModulo = upSource.replace(`'documentos', 'modificar'`, `'proveedores', 'modificar'`)
    expect(otroModulo, 'la mutacion no cambio el modulo').not.toBe(upSource)
    expect(permissionRowsMatchTheDomain(otroModulo)).toBe(false)
  })

  it('updated_at va explicito en las dos filas: la tabla no tiene default', () => {
    const filas = permissionRowsInUp(upSource)
    expect(filas?.every((fila) => fila.updatedAt === 'CURRENT_TIMESTAMP')).toBe(true)

    const sinUpdatedAt = upSource.replace(
      /'Subir documentos PDF y encolar su procesamiento\.', CURRENT_TIMESTAMP\)/,
      `'Subir documentos PDF y encolar su procesamiento.', DEFAULT)`,
    )
    expect(sinUpdatedAt, 'la mutacion no quito CURRENT_TIMESTAMP').not.toBe(upSource)
    expect(permissionRowsInUp(sinUpdatedAt)?.[1]?.updatedAt).toBe('')
  })
})

describe('migration.sql — el Administrador se resuelve por NOMBRE y gana las dos entradas (R5)', () => {
  it('el Administrador gana documentos.consultar y documentos.modificar', () => {
    expect(administratorGetsBothPermissions(upSource)).toBe(true)

    const sinNombreDeAdmin = upSource.replace(`WHERE "r"."name" = '${ROLE_ADMINISTRADOR}'`, `WHERE "r"."name" = 'Admin'`)
    expect(sinNombreDeAdmin, 'la mutacion no cambio el nombre del Administrador').not.toBe(upSource)
    expect(administratorGetsBothPermissions(sinNombreDeAdmin)).toBe(false)

    const sinConsultar = upSource.replace(
      `CROSS JOIN (VALUES ('documentos.consultar'), ('documentos.modificar'))`,
      `CROSS JOIN (VALUES ('documentos.modificar'))`,
    )
    expect(sinConsultar, 'la mutacion no quito documentos.consultar del Administrador').not.toBe(upSource)
    expect(administratorGetsBothPermissions(sinConsultar)).toBe(false)
  })
})

describe('migration.sql — la herencia filtra por proveedores.modificar y solo da documentos.modificar (R6, R7)', () => {
  it('el tercer INSERT filtra por proveedores.modificar y nunca menciona documentos.consultar', () => {
    expect(inheritanceInsertsOnlyModificar(upSource)).toBe(true)
    expect(onlyTheAdministratorInsertMentionsConsultar(upSource)).toBe(true)

    const filtraPorOtroPermiso = upSource.replace(
      `WHERE "rp"."permission_code" = 'proveedores.modificar'`,
      `WHERE "rp"."permission_code" = 'proveedores.consultar'`,
    )
    expect(filtraPorOtroPermiso, 'la mutacion no cambio el permiso del filtro').not.toBe(upSource)
    expect(inheritanceInsertsOnlyModificar(filtraPorOtroPermiso)).toBe(false)

    const tambienConsultar = upSource.replace(
      `SELECT DISTINCT "rp"."role_id", 'documentos.modificar' FROM "role_permissions" AS "rp"`,
      `SELECT DISTINCT "rp"."role_id", 'documentos.consultar' FROM "role_permissions" AS "rp"`,
    )
    expect(tambienConsultar, 'la mutacion no cambio el codigo heredado').not.toBe(upSource)
    expect(inheritanceInsertsOnlyModificar(tambienConsultar)).toBe(false)
    expect(onlyTheAdministratorInsertMentionsConsultar(tambienConsultar)).toBe(false)
  })
})

// --- El DOWN ----------------------------------------------------------------------------------

describe('down.sql — dos DELETE, las asignaciones antes que el catalogo (R10)', () => {
  it('el orden y la forma de cada DELETE son exactos, y cae si se invierte', () => {
    expect(downDeletesAssignmentsBeforeCatalog(downSource)).toBe(true)
    expect(down).toHaveLength(2)

    const invertido = withReversedStatements(downSource)
    expect(invertido, 'la mutacion no reordeno nada').not.toBe(downSource)
    expect(downDeletesAssignmentsBeforeCatalog(invertido)).toBe(false)

    const sinUnDelete = downSource.replace(
      /DELETE FROM "permissions" WHERE "code" IN \('documentos\.consultar', 'documentos\.modificar'\);\n?/,
      '',
    )
    expect(sinUnDelete, 'la mutacion no quito un DELETE').not.toBe(downSource)
    expect(downDeletesAssignmentsBeforeCatalog(sinUnDelete)).toBe(false)
  })

  it('los dos DELETE van acotados a los dos codigos, y cae si se le quita el filtro a uno', () => {
    expect(downIsScopedToTheTwoCodes(downSource)).toBe(true)

    const sinFiltro = downSource.replace(
      `DELETE FROM "role_permissions" WHERE "permission_code" IN ('documentos.consultar', 'documentos.modificar');`,
      `DELETE FROM "role_permissions";`,
    )
    expect(sinFiltro, 'la mutacion no quito el filtro').not.toBe(downSource)
    expect(downIsScopedToTheTwoCodes(sinFiltro)).toBe(false)
  })

  it('no lleva CASCADE, INSERT, UPDATE ni ALTER: el DOWN solo borra', () => {
    expect(downHasOnlyBareDeletes(downSource)).toBe(true)

    const conCascade = downSource.replace(
      `DELETE FROM "permissions" WHERE "code" IN ('documentos.consultar', 'documentos.modificar');`,
      `DELETE FROM "permissions" WHERE "code" IN ('documentos.consultar', 'documentos.modificar') CASCADE;`,
    )
    expect(conCascade, 'la mutacion no metio CASCADE').not.toBe(downSource)
    expect(downHasOnlyBareDeletes(conCascade)).toBe(false)

    const conInsert = `${downSource}\nINSERT INTO "permissions" ("code", "module", "action", "description", "updated_at") VALUES ('x.y', 'x', 'y', 'z', CURRENT_TIMESTAMP);`
    expect(downHasOnlyBareDeletes(conInsert)).toBe(false)
  })

  it('el DOWN no toca el esquema (R11)', () => {
    expect(schemaStatements(downSource)).toEqual([])
  })
})
