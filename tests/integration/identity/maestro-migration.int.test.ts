/**
 * La migracion `db/migrations/*_platform_maestro_role/` contra Postgres REAL.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`: Prisma emite `ROLLBACK` y nada de lo escrito sobrevive, DDL incluido (el DDL
 * de Postgres es transaccional). La corrida va contra la base efimera del global setup.
 *
 * EL SQL SE LEE DEL ARCHIVO, no se copia (patron de `packer-role-migration.int.test.ts`). El UP
 * lleva bloques `$tag$ ... $tag$` con `;` dentro, asi que se trocea respetandolos.
 *
 * "LA BASE ANTES DE LA MIGRACION" se reconstruye DENTRO del `tx`: se borran los usuarios Maestro
 * que haya (el seed puede haber creado uno) y se aplica el DOWN leido del archivo. Asi el caso no
 * depende de si la base de la corrida ya trae la migracion aplicada (la trae) ni del seed.
 *
 * SAVEPOINTS — todo lo que se espera que la base rechace va envuelto en `SAVEPOINT`, para poder
 * seguir consultando y comprobar que no quedo nada a medias.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import {
  DOCUMENT_TYPE_CC,
  PERMISSIONS,
  ROLE_ADMINISTRADOR,
  ROLE_EMPACADOR,
  ROLE_MAESTRO,
  ROLE_OPERADOR,
  SEED_ROLE_PERMISSIONS,
  SEED_ROLES,
  normalizeCompanyName,
} from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

// ---------------------------------------------------------------------------
// Aislamiento
// ---------------------------------------------------------------------------

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

async function inRolledBackTransaction(body: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

const NOT_NULL_VIOLATION = '23502'
const UNIQUE_VIOLATION = '23505'
const CHECK_VIOLATION = '23514'

function sqlStateOf(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null && 'code' in meta) {
      const code: unknown = (meta as { code: unknown }).code
      if (typeof code === 'string') return code
    }
    return error.code
  }
  return error instanceof Error ? error.message : String(error)
}

let savepointSeq = 0

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<{ readonly sqlState: string; readonly message: string }> {
  savepointSeq += 1
  const savepoint = `qc161_sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return { sqlState: sqlStateOf(error), message: error instanceof Error ? error.message : String(error) }
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

// ---------------------------------------------------------------------------
// El SQL, leido del archivo
// ---------------------------------------------------------------------------

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

function locateMigrationDir(): string {
  const migrationsDir = join(findRepoRoot(dirname(fileURLToPath(import.meta.url))), 'db', 'migrations')
  const carpetas = readdirSync(migrationsDir).filter((name) => /_platform_maestro_role$/.test(name))
  expect(carpetas, 'debe existir exactamente una migracion del rol Maestro').toHaveLength(1)
  return join(migrationsDir, carpetas[0] as string)
}

/** Trocea en sentencias sin comentarios `--`, respetando literales y bloques `$tag$`. */
function statementsOf(sql: string): readonly string[] {
  const limpio = sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      let enLiteral = false
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === "'") enLiteral = !enLiteral
        if (!enLiteral && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
  const out: string[] = []
  let actual = ''
  let dolar: string | null = null
  let enLiteral = false
  for (let i = 0; i < limpio.length; i += 1) {
    const ch = limpio[i] as string
    if (dolar === null && !enLiteral && ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(limpio.slice(i))?.[0]
      if (tag !== undefined) {
        dolar = tag
        actual += tag
        i += tag.length - 1
        continue
      }
    } else if (dolar !== null && limpio.startsWith(dolar, i)) {
      actual += dolar
      i += dolar.length - 1
      dolar = null
      continue
    }
    if (dolar === null && ch === "'") enLiteral = !enLiteral
    if (dolar === null && !enLiteral && ch === ';') {
      out.push(actual.trim())
      actual = ''
      continue
    }
    actual += ch
  }
  out.push(actual.trim())
  return out.filter((s) => s.length > 0)
}

const migrationDir = locateMigrationDir()
const UP = statementsOf(readFileSync(join(migrationDir, 'migration.sql'), 'utf8'))
const DOWN = statementsOf(readFileSync(join(migrationDir, 'down.sql'), 'utf8'))

const GUARDIA = UP[0] as string
expect(GUARDIA.startsWith('DO $$'), 'la primera sentencia del UP es la guardia de repetidos').toBe(true)

/** El tramo del DOWN que devuelve `users_username_unique` a su forma por empresa. */
const USERNAME_POR_EMPRESA = DOWN.filter((s) => /"users_username_unique"/.test(s))
expect(USERNAME_POR_EMPRESA, 'el DOWN tira y recrea users_username_unique').toHaveLength(2)

async function apply(tx: Prisma.TransactionClient, statements: readonly string[]): Promise<void> {
  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement)
  }
}

/** El mensaje con el que falla la guardia, relanzado como P0001 para que Prisma lo conserve. */
async function textoDeLaGuardia(tx: Prisma.TransactionClient): Promise<string> {
  expect(GUARDIA).not.toContain('$guardia$')
  const sonda = `DO $sonda$
BEGIN
  EXECUTE $guardia$${GUARDIA}$guardia$;
  RAISE EXCEPTION 'sonda: la guardia no fallo';
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'sonda: %', SQLERRM;
END $sonda$`
  const { sqlState, message } = await expectRejectedByDatabase(tx, () => tx.$executeRawUnsafe(sonda), 'sonda de la guardia')
  expect(sqlState).toBe('P0001')
  expect(message).not.toContain('la guardia no fallo')
  return message
}

/** Deja la base como antes de la migracion: sin usuarios Maestro y con el DOWN aplicado. */
async function volverAntesDeLaMigracion(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`DELETE FROM "users" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = ${ROLE_MAESTRO})`
  await apply(tx, DOWN)
}

// ---------------------------------------------------------------------------
// Fotos del estado
// ---------------------------------------------------------------------------

async function esquemaDeUsers(tx: Prisma.TransactionClient) {
  const indices = await tx.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname::text, indexdef::text FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'users' ORDER BY indexname`
  const triggers = await tx.$queryRaw<{ tgname: string }[]>`
    SELECT tgname::text FROM pg_trigger WHERE tgrelid = '"users"'::regclass AND NOT tgisinternal ORDER BY tgname`
  const funciones = await tx.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM pg_proc WHERE proname = 'users_check_company_by_role'`
  const columna = await tx.$queryRaw<{ is_nullable: string }[]>`
    SELECT is_nullable::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'company_id'`
  return { indices, triggers, funciones: funciones[0]?.total, nullable: columna[0]?.is_nullable }
}

async function catalogo(tx: Prisma.TransactionClient) {
  return {
    roles: await tx.role.findMany({ orderBy: { name: 'asc' } }),
    permissions: await tx.permission.findMany({ orderBy: { code: 'asc' } }),
    rolePermissions: await tx.rolePermission.findMany({ orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }] }),
  }
}

async function codigosDe(tx: Prisma.TransactionClient, roleName: string): Promise<readonly string[]> {
  const filas = await tx.rolePermission.findMany({
    where: { role: { name: roleName } },
    select: { permissionCode: true },
    orderBy: { permissionCode: 'asc' },
  })
  return filas.map((fila) => fila.permissionCode)
}

async function filasDeRoles(tx: Prisma.TransactionClient, roleNames: readonly string[]) {
  return tx.rolePermission.findMany({
    where: { role: { name: { in: [...roleNames] } } },
    orderBy: [{ roleId: 'asc' }, { permissionCode: 'asc' }],
  })
}

async function indiceDelNombreDeUsuario(tx: Prisma.TransactionClient): Promise<string | undefined> {
  const filas = await tx.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_username_unique'`
  return filas[0]?.indexdef
}

const MAESTRO_ROW = SEED_ROLES.find((role) => role.name === ROLE_MAESTRO)
if (MAESTRO_ROW === undefined) throw new Error('SEED_ROLES no declara al Maestro')
const EMPRESAS = PERMISSIONS.filter((permission) => permission.module === 'empresas')
const CODIGOS_DEL_MAESTRO = [...(SEED_ROLE_PERMISSIONS[ROLE_MAESTRO] ?? [])].sort()
const ROLES_DE_EMPRESA = [ROLE_ADMINISTRADOR, ROLE_OPERADOR, ROLE_EMPACADOR] as const

// ---------------------------------------------------------------------------
// Usuarios de prueba (SQL crudo: el SQLSTATE llega literal)
// ---------------------------------------------------------------------------

function tag(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}

async function crearEmpresa(tx: Prisma.TransactionClient): Promise<string> {
  const name = `qc161-${randomUUID()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function rolId(tx: Prisma.TransactionClient, name: string): Promise<string> {
  return (await tx.role.findUniqueOrThrow({ where: { name }, select: { id: true } })).id
}

interface NuevoUsuario {
  readonly roleId: string
  readonly companyId: string | null
  readonly username?: string
  readonly email?: string
  readonly documentNumber?: string
  readonly deletedAt?: Date
}

async function insertarUsuario(tx: Prisma.TransactionClient, u: NuevoUsuario): Promise<string> {
  const marca = tag()
  const filas = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "users" ("first_names", "last_names", "birth_date", "email", "phone",
      "document_type_code", "document_number", "username", "password_hash", "role_id",
      "company_id", "account_status", "updated_at", "deleted_at")
    VALUES ('Ana', 'Perez', DATE '1990-05-17', ${u.email ?? `${marca}@example.com`}, '+57 300 111 2233',
      ${DOCUMENT_TYPE_CC}, ${u.documentNumber ?? marca}, ${u.username ?? `qc161.${marca}`},
      'hash-de-prueba-no-es-un-algoritmo-real', CAST(${u.roleId} AS uuid),
      CAST(${u.companyId} AS uuid), 'active', CURRENT_TIMESTAMP, CAST(${u.deletedAt ?? null} AS timestamptz))
    RETURNING "id"::text AS id`
  const id = filas[0]?.id
  if (id === undefined) throw new Error('el INSERT no devolvio el id')
  return id
}

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('migracion platform_maestro_role: UP y DOWN contra Postgres real', () => {
  it('R21: el UP sobre una base sembrada crea el rol Maestro, los dos permisos y exactamente sus dos asignaciones, sin tocar las de los demas roles', async () => {
    await inRolledBackTransaction(async (tx) => {
      await volverAntesDeLaMigracion(tx)
      expect(await tx.role.findUnique({ where: { name: ROLE_MAESTRO } })).toBeNull()
      expect(await tx.permission.count({ where: { module: 'empresas' } })).toBe(0)
      const demasAntes = await filasDeRoles(tx, ROLES_DE_EMPRESA)
      expect(demasAntes.length).toBeGreaterThan(0)

      await apply(tx, UP)

      const rol = await tx.role.findUniqueOrThrow({ where: { name: ROLE_MAESTRO } })
      expect(rol.description).toBe(MAESTRO_ROW.description)
      const permisos = await tx.permission.findMany({ where: { module: 'empresas' }, orderBy: { code: 'asc' } })
      expect(permisos.map(({ code, module, action, description }) => ({ code, module, action, description }))).toEqual(
        EMPRESAS.map(({ code, module, action, description }) => ({ code, module, action, description })).sort((a, b) =>
          a.code.localeCompare(b.code),
        ),
      )
      expect(await codigosDe(tx, ROLE_MAESTRO)).toEqual(CODIGOS_DEL_MAESTRO)
      expect(await filasDeRoles(tx, ROLES_DE_EMPRESA)).toEqual(demasAntes)
    })
  })

  it('R21: el UP sobre una base donde el seed ya creo esas filas no falla, no las duplica ni las reescribe', async () => {
    await inRolledBackTransaction(async (tx) => {
      await volverAntesDeLaMigracion(tx)

      // Lo que habria escrito el seed con el codigo nuevo antes de que corriera la migracion.
      const rol = await tx.role.create({ data: { name: MAESTRO_ROW.name, description: MAESTRO_ROW.description } })
      for (const permiso of EMPRESAS) {
        await tx.permission.create({ data: { ...permiso } })
      }
      for (const code of CODIGOS_DEL_MAESTRO) {
        await tx.rolePermission.create({ data: { roleId: rol.id, permissionCode: code } })
      }
      const antes = await catalogo(tx)

      await apply(tx, UP)

      expect(await catalogo(tx)).toEqual(antes)
      expect(await tx.role.count({ where: { name: ROLE_MAESTRO } })).toBe(1)
      expect(await codigosDe(tx, ROLE_MAESTRO)).toEqual(CODIGOS_DEL_MAESTRO)
    })
  })

  it('R21: dos ciclos DOWN -> UP seguidos dejan los mismos conteos', async () => {
    await inRolledBackTransaction(async (tx) => {
      await volverAntesDeLaMigracion(tx)
      await apply(tx, UP)
      const primero = {
        roles: await tx.role.count(),
        permissions: await tx.permission.count(),
        rolePermissions: await tx.rolePermission.count(),
      }
      await apply(tx, DOWN)
      await apply(tx, UP)
      expect({
        roles: await tx.role.count(),
        permissions: await tx.permission.count(),
        rolePermissions: await tx.rolePermission.count(),
      }).toEqual(primero)
    })
  })

  it('R38: el UP sobre una base sin nombres de usuario repetidos no cambia ninguna fila de users', async () => {
    await inRolledBackTransaction(async (tx) => {
      await volverAntesDeLaMigracion(tx)
      const empresa = await crearEmpresa(tx)
      await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_OPERADOR), companyId: empresa })
      const antes = await tx.user.findMany({ orderBy: { id: 'asc' } })
      expect(antes.length).toBeGreaterThan(1)

      await apply(tx, UP)

      expect(await tx.user.findMany({ orderBy: { id: 'asc' } })).toEqual(antes)
      expect(await indiceDelNombreDeUsuario(tx)).toMatch(/\(lower\(\(?username\)?(::text)?\)\) WHERE \(deleted_at IS NULL\)$/)
      expect(await indiceDelNombreDeUsuario(tx)).not.toMatch(/company_id/)
    })
  })

  it('R22: el DOWN sin ningun Maestro deja la base como antes del UP, con users_username_unique otra vez por empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      await volverAntesDeLaMigracion(tx)
      const esquemaAntes = await esquemaDeUsers(tx)
      const catalogoAntes = await catalogo(tx)
      expect(esquemaAntes.nullable).toBe('NO')
      expect(esquemaAntes.triggers).toEqual([])
      expect(await indiceDelNombreDeUsuario(tx)).toMatch(/\(company_id, lower/)

      await apply(tx, UP)
      expect((await esquemaDeUsers(tx)).nullable).toBe('YES')
      await apply(tx, DOWN)

      expect(await esquemaDeUsers(tx)).toEqual(esquemaAntes)
      expect(await catalogo(tx)).toEqual(catalogoAntes)
    })
  })

  for (const dadoDeBaja of [false, true]) {
    it(`R22: el DOWN con un Maestro ${dadoDeBaja ? 'dado de baja' : 'vivo'} falla con 23502 y no borra ni reasigna nada`, async () => {
      await inRolledBackTransaction(async (tx) => {
        const maestroId = await insertarUsuario(tx, {
          roleId: await rolId(tx, ROLE_MAESTRO),
          companyId: null,
          ...(dadoDeBaja ? { deletedAt: new Date() } : {}),
        })
        const esquemaAntes = await esquemaDeUsers(tx)
        const catalogoAntes = await catalogo(tx)
        const maestroAntes = await tx.user.findUniqueOrThrow({ where: { id: maestroId } })

        const { sqlState } = await expectRejectedByDatabase(tx, () => apply(tx, DOWN), 'DOWN con un Maestro')
        expect(sqlState).toBe(NOT_NULL_VIOLATION)

        expect(await esquemaDeUsers(tx)).toEqual(esquemaAntes)
        expect(await catalogo(tx)).toEqual(catalogoAntes)
        expect(await tx.user.findUniqueOrThrow({ where: { id: maestroId } })).toEqual(maestroAntes)
      })
    })
  }

  it('R39: con dos usuarios vivos de empresas distintas con el mismo nombre en otras mayusculas, la guardia falla, nombra el repetido con su numero y no cambia ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Solo el tramo del indice: es lo unico que hace falta para que la base admita el repetido.
      await apply(tx, USERNAME_POR_EMPRESA)
      const operador = await rolId(tx, ROLE_OPERADOR)
      const nombre = `qc161.repetido.${tag()}`
      await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre })
      await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre.toUpperCase() })
      const antes = await tx.user.findMany({ orderBy: { id: 'asc' } })

      const { sqlState } = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA),
        'guardia del UP con un nombre de usuario repetido',
      )

      expect(sqlState).toBe(UNIQUE_VIOLATION)
      expect(await tx.user.findMany({ orderBy: { id: 'asc' } })).toEqual(antes)

      // Prisma resume todo 23505 como «Unique constraint failed» y pierde el texto: se lee
      // ejecutando la misma guardia dentro de un bloque que la relanza con otro codigo.
      const texto = await textoDeLaGuardia(tx)
      expect(texto).toContain(`${nombre} (2 usuarios)`)
      expect(texto).toContain('users_username_global')
      expect(await tx.user.findMany({ orderBy: { id: 'asc' } })).toEqual(antes)
    })
  })

  it('R39: el caso simetrico: sin repetidos, o con el repetido dado de baja, la guardia pasa', async () => {
    await inRolledBackTransaction(async (tx) => {
      await apply(tx, USERNAME_POR_EMPRESA)
      await tx.$executeRawUnsafe(GUARDIA)

      const operador = await rolId(tx, ROLE_OPERADOR)
      const nombre = `qc161.repetido.${tag()}`
      await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre })
      await insertarUsuario(tx, {
        roleId: operador,
        companyId: await crearEmpresa(tx),
        username: nombre,
        deletedAt: new Date(),
      })
      await tx.$executeRawUnsafe(GUARDIA)
    })
  })
})

describe('la empresa segun el rol, con la migracion aplicada', () => {
  it('R26: un usuario sin empresa con un rol de empresa se rechaza con 23502 al insertar y al pasar su empresa a NULL', async () => {
    await inRolledBackTransaction(async (tx) => {
      for (const rol of ROLES_DE_EMPRESA) {
        const username = `qc161.sin.empresa.${tag()}`
        const { sqlState } = await expectRejectedByDatabase(
          tx,
          async () => insertarUsuario(tx, { roleId: await rolId(tx, rol), companyId: null, username }),
          `alta sin empresa con el rol ${rol}`,
        )
        expect(sqlState).toBe(NOT_NULL_VIOLATION)
        expect(await tx.user.count({ where: { username } })).toBe(0)
      }

      const empresa = await crearEmpresa(tx)
      const id = await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_OPERADOR), companyId: empresa })
      const { sqlState } = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "users" SET "company_id" = NULL WHERE "id" = CAST(${id} AS uuid)`,
        'quitar la empresa a un Operador',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)
      expect((await tx.user.findUniqueOrThrow({ where: { id } })).companyId).toBe(empresa)

      // Cambiar de Maestro a un rol de empresa sin darle empresa: tambien 23502.
      const maestro = await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_MAESTRO), companyId: null })
      const operador = await rolId(tx, ROLE_OPERADOR)
      const alCambiarRol = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "users" SET "role_id" = CAST(${operador} AS uuid) WHERE "id" = CAST(${maestro} AS uuid)`,
        'pasar un Maestro a Operador sin empresa',
      )
      expect(alCambiarRol.sqlState).toBe(NOT_NULL_VIOLATION)
    })
  })

  it('R27: un Maestro con empresa se rechaza con 23514 al insertar, al darle empresa y al pasar a Maestro a un usuario con empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const maestroRol = await rolId(tx, ROLE_MAESTRO)
      const empresa = await crearEmpresa(tx)
      const username = `qc161.maestro.empresa.${tag()}`

      const alta = await expectRejectedByDatabase(
        tx,
        () => insertarUsuario(tx, { roleId: maestroRol, companyId: empresa, username }),
        'alta de un Maestro con empresa',
      )
      expect(alta.sqlState).toBe(CHECK_VIOLATION)
      expect(await tx.user.count({ where: { username } })).toBe(0)

      const maestro = await insertarUsuario(tx, { roleId: maestroRol, companyId: null })
      const darEmpresa = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "users" SET "company_id" = CAST(${empresa} AS uuid) WHERE "id" = CAST(${maestro} AS uuid)`,
        'darle empresa a un Maestro',
      )
      expect(darEmpresa.sqlState).toBe(CHECK_VIOLATION)
      expect((await tx.user.findUniqueOrThrow({ where: { id: maestro } })).companyId).toBeNull()

      const administrador = await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_ADMINISTRADOR), companyId: empresa })
      const aMaestro = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "users" SET "role_id" = CAST(${maestroRol} AS uuid) WHERE "id" = CAST(${administrador} AS uuid)`,
        'convertir en Maestro a un Administrador con empresa',
      )
      expect(aMaestro.sqlState).toBe(CHECK_VIOLATION)
      expect((await tx.user.findUniqueOrThrow({ where: { id: administrador } })).roleId).toBe(
        await rolId(tx, ROLE_ADMINISTRADOR),
      )
    })
  })

  it('R26, R27: el caso simetrico: un Maestro sin empresa y un Operador con ella se aceptan', async () => {
    await inRolledBackTransaction(async (tx) => {
      const maestro = await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_MAESTRO), companyId: null })
      const empresa = await crearEmpresa(tx)
      const operador = await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_OPERADOR), companyId: empresa })
      expect((await tx.user.findUniqueOrThrow({ where: { id: maestro } })).companyId).toBeNull()
      expect((await tx.user.findUniqueOrThrow({ where: { id: operador } })).companyId).toBe(empresa)
    })
  })
})

describe('unicidad entre usuarios sin empresa y en todo el sistema', () => {
  it('R28: dos Maestros vivos con el mismo correo en otras mayusculas o el mismo documento se rechazan, al crear y al cambiar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const maestroRol = await rolId(tx, ROLE_MAESTRO)
      const marca = tag()
      const email = `Plataforma.${marca}@Example.com`
      const documentNumber = `9${marca.slice(0, 9)}`
      await insertarUsuario(tx, { roleId: maestroRol, companyId: null, email, documentNumber })

      const correo = await expectRejectedByDatabase(
        tx,
        () => insertarUsuario(tx, { roleId: maestroRol, companyId: null, email: email.toUpperCase() }),
        'segundo Maestro con el mismo correo',
      )
      expect(correo.sqlState).toBe(UNIQUE_VIOLATION)

      const documento = await expectRejectedByDatabase(
        tx,
        () => insertarUsuario(tx, { roleId: maestroRol, companyId: null, documentNumber }),
        'segundo Maestro con el mismo documento',
      )
      expect(documento.sqlState).toBe(UNIQUE_VIOLATION)

      const otro = await insertarUsuario(tx, { roleId: maestroRol, companyId: null })
      const alCambiar = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "users" SET "email" = ${email.toLowerCase()} WHERE "id" = CAST(${otro} AS uuid)`,
        'cambiar el correo de un Maestro al de otro',
      )
      expect(alCambiar.sqlState).toBe(UNIQUE_VIOLATION)
      expect(await tx.user.count({ where: { email: { equals: email, mode: 'insensitive' }, companyId: null } })).toBe(1)
    })
  })

  it('R28: un Maestro dado de baja no ocupa su correo ni su documento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const maestroRol = await rolId(tx, ROLE_MAESTRO)
      const marca = tag()
      const email = `baja.${marca}@example.com`
      const documentNumber = `8${marca.slice(0, 9)}`
      await insertarUsuario(tx, { roleId: maestroRol, companyId: null, email, documentNumber, deletedAt: new Date() })

      const nuevo = await insertarUsuario(tx, { roleId: maestroRol, companyId: null, email, documentNumber })
      expect((await tx.user.findUniqueOrThrow({ where: { id: nuevo } })).deletedAt).toBeNull()
    })
  })

  it('R36: el mismo nombre de usuario se rechaza entre dos empresas, entre una empresa y un Maestro, y al renombrar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const operador = await rolId(tx, ROLE_OPERADOR)
      const maestroRol = await rolId(tx, ROLE_MAESTRO)
      const nombre = `qc161.global.${tag()}`
      await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre })

      const otraEmpresa = await expectRejectedByDatabase(
        tx,
        async () => insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre.toUpperCase() }),
        'mismo nombre en otra empresa',
      )
      expect(otraEmpresa.sqlState).toBe(UNIQUE_VIOLATION)

      const conMaestro = await expectRejectedByDatabase(
        tx,
        () => insertarUsuario(tx, { roleId: maestroRol, companyId: null, username: nombre.toUpperCase() }),
        'un Maestro con el nombre de un usuario de empresa',
      )
      expect(conMaestro.sqlState).toBe(UNIQUE_VIOLATION)

      const otro = await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx) })
      const renombrar = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "users" SET "username" = ${nombre} WHERE "id" = CAST(${otro} AS uuid)`,
        'renombrar a un usuario al nombre de otro',
      )
      expect(renombrar.sqlState).toBe(UNIQUE_VIOLATION)

      expect(await tx.user.count({ where: { username: { equals: nombre, mode: 'insensitive' } } })).toBe(1)
    })
  })

  it('R36: un usuario dado de baja no ocupa su nombre de usuario, ni en otra empresa ni para un Maestro', async () => {
    await inRolledBackTransaction(async (tx) => {
      const operador = await rolId(tx, ROLE_OPERADOR)
      const nombre = `qc161.libre.${tag()}`
      await insertarUsuario(tx, { roleId: operador, companyId: await crearEmpresa(tx), username: nombre, deletedAt: new Date() })

      await insertarUsuario(tx, { roleId: await rolId(tx, ROLE_MAESTRO), companyId: null, username: nombre.toUpperCase() })
      expect(await tx.user.count({ where: { username: { equals: nombre, mode: 'insensitive' }, deletedAt: null } })).toBe(1)
    })
  })

  it('R37: el mismo correo y el mismo documento entre un usuario de empresa y un Maestro se aceptan', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marca = tag()
      const email = `compartido.${marca}@example.com`
      const documentNumber = `7${marca.slice(0, 9)}`
      const deEmpresa = await insertarUsuario(tx, {
        roleId: await rolId(tx, ROLE_OPERADOR),
        companyId: await crearEmpresa(tx),
        email,
        documentNumber,
      })
      const maestro = await insertarUsuario(tx, {
        roleId: await rolId(tx, ROLE_MAESTRO),
        companyId: null,
        email: email.toUpperCase(),
        documentNumber,
      })
      expect(deEmpresa).not.toBe(maestro)
      expect(await tx.user.count({ where: { documentNumber, deletedAt: null } })).toBe(2)
    })
  })
})

