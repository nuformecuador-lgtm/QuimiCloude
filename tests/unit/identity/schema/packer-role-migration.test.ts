// Contrato estatico del SQL de la migracion del rol Empacador (QC-144).
//
// Cubre R7, R17, R18, R20, R21. Lo que se vigila aqui NO esta en `db/schema.prisma` y Prisma no lo
// regenera nunca: esta es una migracion de DATOS, escrita entera a mano.
//
// El rol, el permiso, las descripciones y las claves de `SEED_ROLE_PERMISSIONS` se escriben DOS
// veces -en el dominio y en el SQL-, y `design.md > 3.1` acepta ese precio a condicion de
// mitigarlo AQUI: nada se copia en este archivo, todo se IMPORTA del barril de `identity` y se
// compara con lo que el SQL dice.
//
// Cada afirmacion es un PREDICADO PURO EXPORTADO que recibe el texto SQL y devuelve el veredicto,
// aplicado dos veces: al SQL real y a una copia MUTADA EN MEMORIA. El archivo en disco no se
// toca. Un test que no puede fallar no vigila nada (mismo patron que
// `user-permissions-migration.test.ts`, QC-66).

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  SEED_ROLE_PERMISSIONS,
  SEED_ROLES,
} from '@/lib/modules/identity'

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
const packerRoleDirs = readdirSync(migrationsDir).filter((name) => /_packer_role$/.test(name))
expect(packerRoleDirs, 'debe existir exactamente una migracion del rol Empacador').toHaveLength(1)
const migrationDir = join(migrationsDir, packerRoleDirs[0] as string)

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

/** La fila del rol Empacador, del dominio REAL. No se copia aqui. */
const EMPACADOR_SEED_ROW = SEED_ROLES.find((role) => role.name === ROLE_EMPACADOR)

/** La entrada `terminados.consultar` del catalogo REAL. No se copia aqui. */
const TERMINADOS_CONSULTAR = PERMISSIONS.find((permission) => permission.code === 'terminados.consultar')

/** Los codigos que el seed asigna al Empacador, del dominio REAL, en su orden. */
const CODIGOS_DEL_EMPACADOR = SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR] ?? []

// --- Predicados puros ----------------------------------------------------------------------

/** R7, R17. ¿El UP son EXACTAMENTE cuatro `INSERT`, uno sobre cada tabla que le toca, y nada mas? */
export function upIsExactlyFourInserts(sql: string): boolean {
  const todas = statements(sql)
  if (todas.length !== 4) return false
  const inserts = todas.filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 4) return false
  const tablas = inserts.map((insert) => /^INSERT INTO "(\w+)"/i.exec(insert)?.[1])
  return (
    tablas[0] === 'roles' &&
    tablas[1] === 'permissions' &&
    tablas[2] === 'role_permissions' &&
    tablas[3] === 'role_permissions'
  )
}

/** R18. ¿Los CUATRO `INSERT` llevan `ON CONFLICT ... DO NOTHING`? Es lo que hace idempotente el UP. */
export function everyInsertIgnoresConflicts(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO/i.test(statement))
  if (inserts.length !== 4) return false
  return inserts.every((insert) => /ON CONFLICT \([^)]*\) DO NOTHING$/i.test(insert))
}

/** El literal del nombre y la descripcion del rol que el primer `INSERT` escribe, o `null`. */
export function roleRowInUp(sql: string): { name: string; description: string; updatedAt: string } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "roles"/i.test(statement))
  if (insert === undefined) return null
  const cuerpo = /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const campos = [...cuerpo.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] as string).replace(/''/g, "'"))
  if (campos.length !== 2) return null
  const updatedAt = /CURRENT_TIMESTAMP/i.test(cuerpo) ? 'CURRENT_TIMESTAMP' : ''
  return { name: campos[0] as string, description: campos[1] as string, updatedAt }
}

/** R1, R17. ¿El rol que el UP inserta es EXACTAMENTE el `ROLE_EMPACADOR` de `SEED_ROLES`? */
export function roleRowMatchesTheDomain(sql: string): boolean {
  const fila = roleRowInUp(sql)
  if (fila === null || EMPACADOR_SEED_ROW === undefined) return false
  return (
    fila.name === EMPACADOR_SEED_ROW.name &&
    fila.description === EMPACADOR_SEED_ROW.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  )
}

/** La fila del permiso que el segundo `INSERT` escribe, o `null`. */
export function permissionRowInUp(
  sql: string,
): { code: string; module: string; action: string; description: string; updatedAt: string } | null {
  const insert = statements(sql).find((statement) => /^INSERT INTO "permissions"/i.test(statement))
  if (insert === undefined) return null
  const cuerpo = /VALUES\s*\(([^)]*)\)/i.exec(insert)?.[1]
  if (cuerpo === undefined) return null
  const campos = [...cuerpo.matchAll(/'((?:[^']|'')*)'/g)].map((match) => (match[1] as string).replace(/''/g, "'"))
  if (campos.length !== 4) return null
  const updatedAt = /CURRENT_TIMESTAMP/i.test(cuerpo) ? 'CURRENT_TIMESTAMP' : ''
  return {
    code: campos[0] as string,
    module: campos[1] as string,
    action: campos[2] as string,
    description: campos[3] as string,
    updatedAt,
  }
}

/** R4, R17. ¿El permiso que el UP inserta es EXACTAMENTE la entrada `terminados.consultar` de `PERMISSIONS`? */
export function permissionRowMatchesTheDomain(sql: string): boolean {
  const fila = permissionRowInUp(sql)
  if (fila === null || TERMINADOS_CONSULTAR === undefined) return false
  return (
    fila.code === TERMINADOS_CONSULTAR.code &&
    fila.module === TERMINADOS_CONSULTAR.module &&
    fila.action === TERMINADOS_CONSULTAR.action &&
    fila.description === TERMINADOS_CONSULTAR.description &&
    fila.updatedAt === 'CURRENT_TIMESTAMP'
  )
}

/** Los nombres de rol por los que resuelve el subselect de cada `INSERT INTO "role_permissions"`. */
export function roleNamesInRolePermissionInserts(sql: string): readonly string[] {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  return inserts.map((insert) => /WHERE\s+"r"\."name"\s*=\s*'([^']*)'/i.exec(insert)?.[1] ?? '')
}

/** R17. ¿El tercer `INSERT` asigna `terminados.consultar` al Administrador, por nombre? */
export function administratorGetsTheNewPermission(sql: string): boolean {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  const admin = inserts[0]
  if (admin === undefined) return false
  const nombres = roleNamesInRolePermissionInserts(sql)
  if (nombres[0] !== ROLE_ADMINISTRADOR) return false
  return /'terminados\.consultar'/i.test(admin) && !/CROSS JOIN/i.test(admin)
}

/** R8, R17. Los codigos que el cuarto `INSERT` asigna al Empacador, leidos del `CROSS JOIN (VALUES ...)`. */
export function empacadorAssignedCodesInUp(sql: string): readonly string[] | null {
  const inserts = statements(sql).filter((statement) => /^INSERT INTO "role_permissions"/i.test(statement))
  const empacador = inserts[1]
  if (empacador === undefined) return null
  const nombres = roleNamesInRolePermissionInserts(sql)
  if (nombres[1] !== ROLE_EMPACADOR) return null
  const cuerpo = /CROSS JOIN \(VALUES\s*([\s\S]*?)\)\s*AS/i.exec(empacador)?.[1]
  if (cuerpo === undefined) return null
  const literales = [...cuerpo.matchAll(/'([^']*)'/g)].map((match) => match[1] as string)
  return literales.length === 0 ? null : literales
}

/** R8. ¿Los codigos asignados al Empacador son EXACTAMENTE los de `SEED_ROLE_PERMISSIONS[ROLE_EMPACADOR]`, uno a uno? */
export function empacadorAssignedCodesMatchTheSeed(sql: string): boolean {
  const codigos = empacadorAssignedCodesInUp(sql)
  if (codigos === null) return false
  return codigos.join(',') === [...CODIGOS_DEL_EMPACADOR].join(',')
}

/**
 * R20. Las sentencias de ESQUEMA del SQL: esta migracion solo inserta FILAS, asi que un `ALTER`,
 * un `CREATE` o un `DROP` -de tabla, de indice, de restriccion o de tipo- no tienen nada que hacer
 * aqui.
 */
export function schemaStatements(sql: string): readonly string[] {
  return statements(sql).filter((statement) =>
    /(^(ALTER|CREATE|DROP|TRUNCATE)\b)|(\bDROP (CONSTRAINT|COLUMN|INDEX|TABLE|TYPE)\b)|(\bADD (CONSTRAINT|COLUMN)\b)/i.test(
      statement,
    ),
  )
}

/** R7, R17. ¿Aparece el literal `Operador` en alguna linea EJECUTABLE del SQL? */
export function mentionsOperador(sql: string): boolean {
  return /Operador/.test(stripSqlComments(sql))
}

/**
 * R21. ¿El DOWN borra en el orden de `design.md > 3.3`: el permiso de cualquier rol, las
 * asignaciones que le queden al Empacador, el permiso del catalogo y por ultimo el rol?
 */
export function downDeletesInDesignOrder(sql: string): boolean {
  const sentencias = statements(sql)
  if (sentencias.length !== 4) return false
  return (
    /^DELETE FROM "role_permissions" WHERE "permission_code" = 'terminados\.consultar'$/i.test(
      sentencias[0] as string,
    ) &&
    /^DELETE FROM "role_permissions" WHERE "role_id" IN \(SELECT "id" FROM "roles" WHERE "name" = 'Empacador'\)$/i.test(
      sentencias[1] as string,
    ) &&
    /^DELETE FROM "permissions" WHERE "code" = 'terminados\.consultar'$/i.test(sentencias[2] as string) &&
    /^DELETE FROM "roles" WHERE "name" = 'Empacador'$/i.test(sentencias[3] as string)
  )
}

/** R21. ¿El DOWN no lleva `CASCADE`, `INSERT`, `UPDATE` ni `ALTER` en ninguna linea ejecutable? */
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

describe('migration.sql — es EXACTAMENTE cuatro INSERT, uno por tabla (R7, R17)', () => {
  it('inserta en roles, permissions y dos veces en role_permissions, y cae si se cuela otra sentencia', () => {
    expect(upIsExactlyFourInserts(upSource)).toBe(true)
    expect(up).toHaveLength(4)

    const conUnaQuinta = `${upSource}\nUPDATE "roles" SET "description" = 'x' WHERE "name" = 'Empacador';`
    expect(upIsExactlyFourInserts(conUnaQuinta)).toBe(false)
  })

  it('R20, R26: el UP no toca el esquema: ni ALTER, ni CREATE ni DROP, y cae si se cuela uno', () => {
    expect(schemaStatements(upSource)).toEqual([])

    expect(schemaStatements(`${upSource}\nALTER TABLE "roles" ADD COLUMN "nickname" TEXT;`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nCREATE INDEX "roles_name_idx" ON "roles"("name");`)).toHaveLength(1)
    expect(schemaStatements(`${upSource}\nDROP INDEX "roles_name_key";`)).toHaveLength(1)
  })

  it('ninguna sentencia EJECUTABLE nombra al Operador (R17): sus asignaciones no cambian', () => {
    expect(mentionsOperador(upSource)).toBe(false)

    const conOperador = `${upSource}\nINSERT INTO "role_permissions" ("role_id", "permission_code") SELECT "r"."id", 'x' FROM "roles" AS "r" WHERE "r"."name" = 'Operador';`
    expect(mentionsOperador(conOperador)).toBe(true)
  })
})

// --- El UP: idempotencia --------------------------------------------------------------------

describe('migration.sql — se puede aplicar dos veces (R18)', () => {
  it('los CUATRO INSERT llevan ON CONFLICT ... DO NOTHING, y cae si falta uno', () => {
    expect(everyInsertIgnoresConflicts(upSource)).toBe(true)

    const sinConflictoDelRol = upSource.replace(/\s*ON CONFLICT \("name"\) DO NOTHING/i, '')
    expect(sinConflictoDelRol, 'la mutacion no quito el ON CONFLICT del rol').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDelRol)).toBe(false)

    const sinConflictoDelPermiso = upSource.replace(/\s*ON CONFLICT \("code"\) DO NOTHING/i, '')
    expect(sinConflictoDelPermiso, 'la mutacion no quito el ON CONFLICT del permiso').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinConflictoDelPermiso)).toBe(false)

    const sinUnConflictoDeAsignacion = upSource.replace(
      /\s*ON CONFLICT \("role_id", "permission_code"\) DO NOTHING/i,
      '',
    )
    expect(
      sinUnConflictoDeAsignacion,
      'la mutacion no quito ningun ON CONFLICT de role_permissions',
    ).not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(sinUnConflictoDeAsignacion)).toBe(false)

    const conDoUpdate = upSource.replace(
      /ON CONFLICT \("name"\) DO NOTHING/i,
      'ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description"',
    )
    expect(conDoUpdate, 'la mutacion no cambio el DO NOTHING').not.toBe(upSource)
    expect(everyInsertIgnoresConflicts(conDoUpdate)).toBe(false)
  })
})

// --- El UP: los literales salen del dominio, no de una copia ---------------------------------

describe('migration.sql — el rol y el permiso salen de SEED_ROLES y PERMISSIONS (R1, R4, R17)', () => {
  it('el rol insertado es EXACTAMENTE ROLE_EMPACADOR con su descripcion de SEED_ROLES', () => {
    expect(EMPACADOR_SEED_ROW).toBeDefined()
    expect(roleRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace(
      (EMPACADOR_SEED_ROW as { description: string }).description,
      'Otra cosa.',
    )
    expect(otraDescripcion, 'la mutacion no cambio la descripcion del rol').not.toBe(upSource)
    expect(roleRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otroNombre = upSource.replace(`('${ROLE_EMPACADOR}',`, "('Preparador',")
    expect(otroNombre, 'la mutacion no cambio el nombre del rol').not.toBe(upSource)
    expect(roleRowMatchesTheDomain(otroNombre)).toBe(false)
  })

  it('el permiso insertado es EXACTAMENTE la entrada terminados.consultar de PERMISSIONS', () => {
    expect(TERMINADOS_CONSULTAR).toBeDefined()
    expect(permissionRowMatchesTheDomain(upSource)).toBe(true)

    const otraDescripcion = upSource.replace(
      (TERMINADOS_CONSULTAR as { description: string }).description,
      'Otra cosa.',
    )
    expect(otraDescripcion, 'la mutacion no cambio la descripcion del permiso').not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otraDescripcion)).toBe(false)

    const otroModulo = upSource.replace(`'terminados', 'consultar'`, `'pedidos', 'consultar'`)
    expect(otroModulo, 'la mutacion no cambio el modulo').not.toBe(upSource)
    expect(permissionRowMatchesTheDomain(otroModulo)).toBe(false)
  })

  it('updated_at va explicito en el rol y en el permiso: ninguna de las dos tablas tiene default', () => {
    expect(roleRowInUp(upSource)?.updatedAt).toBe('CURRENT_TIMESTAMP')
    expect(permissionRowInUp(upSource)?.updatedAt).toBe('CURRENT_TIMESTAMP')

    const sinUpdatedAtDelRol = upSource.replace(
      `('Empacador', '${(EMPACADOR_SEED_ROW as { description: string }).description}', CURRENT_TIMESTAMP)`,
      `('Empacador', '${(EMPACADOR_SEED_ROW as { description: string }).description}', DEFAULT)`,
    )
    expect(sinUpdatedAtDelRol, 'la mutacion no quito CURRENT_TIMESTAMP del rol').not.toBe(upSource)
    expect(roleRowInUp(sinUpdatedAtDelRol)?.updatedAt).toBe('')
  })
})

describe('migration.sql — el Administrador y el Empacador se resuelven por NOMBRE (R8, R17)', () => {
  it('el Administrador gana terminados.consultar, sin CROSS JOIN de comodin', () => {
    expect(administratorGetsTheNewPermission(upSource)).toBe(true)

    const sinNombreDeAdmin = upSource.replace(
      `WHERE "r"."name" = '${ROLE_ADMINISTRADOR}'\nON CONFLICT ("role_id", "permission_code") DO NOTHING;\n\n-- 3b.`,
      `WHERE "r"."name" = 'Admin'\nON CONFLICT ("role_id", "permission_code") DO NOTHING;\n\n-- 3b.`,
    )
    expect(sinNombreDeAdmin, 'la mutacion no cambio el nombre del Administrador').not.toBe(upSource)
    expect(administratorGetsTheNewPermission(sinNombreDeAdmin)).toBe(false)
  })

  it('el Empacador recibe EXACTAMENTE sus dos codigos, en el orden del seed', () => {
    expect(CODIGOS_DEL_EMPACADOR).toEqual(['asignaciones.consultar', 'terminados.consultar'])
    expect(empacadorAssignedCodesInUp(upSource)).toEqual([...CODIGOS_DEL_EMPACADOR])
    expect(empacadorAssignedCodesMatchTheSeed(upSource)).toBe(true)

    const soloUno = upSource.replace(`, ('${CODIGOS_DEL_EMPACADOR[1]}')`, '')
    expect(soloUno, 'la mutacion no quito ningun codigo del Empacador').not.toBe(upSource)
    expect(empacadorAssignedCodesMatchTheSeed(soloUno)).toBe(false)
  })
})

// --- El DOWN ----------------------------------------------------------------------------------

describe('down.sql — cuatro DELETE, en el orden de design.md > 3.3 (R21)', () => {
  it('el orden y la forma de cada DELETE son exactos, y cae si se invierte', () => {
    expect(downDeletesInDesignOrder(downSource)).toBe(true)
    expect(down).toHaveLength(4)

    const invertido = withReversedStatements(downSource)
    expect(invertido, 'la mutacion no reordeno nada').not.toBe(downSource)
    expect(downDeletesInDesignOrder(invertido)).toBe(false)

    const sinUnDelete = downSource.replace(
      /DELETE FROM "permissions" WHERE "code" = 'terminados\.consultar';\n/,
      '',
    )
    expect(sinUnDelete, 'la mutacion no quito un DELETE').not.toBe(downSource)
    expect(downDeletesInDesignOrder(sinUnDelete)).toBe(false)
  })

  it('el segundo DELETE va acotado con un WHERE, y cae si se le quita', () => {
    const sinWhere = downSource.replace(
      `DELETE FROM "role_permissions"\nWHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'Empacador');`,
      `DELETE FROM "role_permissions";`,
    )
    expect(sinWhere, 'la mutacion no quito el WHERE').not.toBe(downSource)
    expect(downDeletesInDesignOrder(sinWhere)).toBe(false)
  })

  it('no lleva CASCADE, INSERT, UPDATE ni ALTER: el DOWN solo borra', () => {
    expect(downHasOnlyBareDeletes(downSource)).toBe(true)

    const conCascade = downSource.replace(
      `DELETE FROM "roles" WHERE "name" = 'Empacador';`,
      `DELETE FROM "roles" WHERE "name" = 'Empacador' CASCADE;`,
    )
    expect(conCascade, 'la mutacion no metio CASCADE').not.toBe(downSource)
    expect(downHasOnlyBareDeletes(conCascade)).toBe(false)

    const conInsert = `${downSource}\nINSERT INTO "roles" ("name", "description", "updated_at") VALUES ('Empacador', 'x', CURRENT_TIMESTAMP);`
    expect(downHasOnlyBareDeletes(conInsert)).toBe(false)
  })

  it('el DOWN no toca el esquema', () => {
    expect(schemaStatements(downSource)).toEqual([])
  })
})
