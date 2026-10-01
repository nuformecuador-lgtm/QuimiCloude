/**
 * Tests de integracion de la feature 1 (modelo-usuarios-y-roles) contra una base
 * Postgres REAL, con la migracion `20260806122638_users_and_roles` aplicada.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila
 * escrita por un test sobrevive. Por eso los tests son repetibles e independientes del
 * orden. Se eligio la transaccion interactiva de Prisma (y no un cliente `pg` aparte)
 * porque asi se ejercita EXACTAMENTE el camino de datos de la app (`design.md > 7`:
 * Prisma es el unico camino) y porque `$executeRaw` dentro de la misma transaccion
 * sigue usando la misma conexion, asi que el SQL crudo comparte el aislamiento.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y
 * varios requisitos exigen comprobar el estado DESPUES del rechazo ("conserva el
 * usuario existente sin modificar"). Por eso toda operacion que se espera que falle se
 * envuelve en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que deja la
 * transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — las altas que se espera que fallen se hacen con `$executeRaw` a
 * proposito: (1) omitir una columna obligatoria no se puede expresar con la API tipada
 * de Prisma (no compilaria), y (2) el mensaje de Postgres llega literal (SQLSTATE +
 * nombre del indice o de la FK), asi que el test afirma sobre la restriccion concreta
 * y no sobre "algo fallo". Los caminos felices y las lecturas van con la API tipada.
 *
 * CONTRASENA — solo se rellena `password_hash` con una cadena cualquiera. El hashing es
 * la feature 2 (`design.md > 6`); aqui la unica propiedad que importa es que la columna
 * acepta texto de longitud arbitraria (R12).
 *
 * QC-47 (T16, T19) — LA EMPRESA. `users.company_id` es obligatoria, asi que ningun usuario
 * se puede crear sin ella. Cada transaccion de test fabrica su PROPIA empresa efimera
 * (`defaultCompanyId`), con nombre irrepetible: nunca se usa la empresa de instalacion que
 * siembra QC-6, porque `companies_name_unique` es GLOBAL y el alta chocaria con ella. Como
 * todo ocurre dentro de la transaccion que termina en ROLLBACK, ninguna de esas empresas
 * sobrevive al test y no hace falta barrer nada en `afterAll`.
 *
 * Los tres indices unicos del usuario ya NO son globales: son
 * `(company_id, lower(email))`, `(company_id, lower(username))` y
 * `(company_id, document_type_code, document_number)`, los tres
 * `WHERE deleted_at IS NULL` (R16, R17, R18, R19). Los casos de QC-4 que ya estaban aqui
 * siguen valiendo tal cual porque todos sus usuarios caen en la MISMA empresa; lo que la
 * ficha añade es la otra mitad, la que solo pasa con la empresa dentro del indice: el mismo
 * correo, el mismo `username` y el mismo documento SI se aceptan en empresas distintas.
 *
 * QC-161 — el nombre de usuario vuelve a ser unico en todo el sistema
 * (`lower(username) WHERE deleted_at IS NULL`); correo y documento siguen por empresa.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'
import {
  DOCUMENT_TYPE_CC,
  INITIAL_USER_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUSES,
  normalizeCompanyName,
} from '@/lib/modules/identity'

// ---------------------------------------------------------------------------
// Utilidades de aislamiento
// ---------------------------------------------------------------------------

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** Ejecuta el cuerpo del test en una transaccion que SIEMPRE termina en ROLLBACK. */
async function inRolledBackTransaction(
  body: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        // La empresa por defecto del test se crea AQUI, antes del cuerpo, y no perezosamente
        // dentro de un `SAVEPOINT`: si naciera dentro de uno que luego se deshace, su fila
        // desapareceria mientras su id seguiria cacheado, y el siguiente usuario fallaria con
        // un 23503 que no tiene nada que ver con lo que el caso quiere medir.
        await defaultCompanyId(tx)
        await body(tx)
        throw new RollbackSignal()
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error
  }
}

let savepointSeq = 0

/** SQLSTATE de Postgres relevantes aqui. Son estables y NO dependen del idioma. */
const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'
const UNIQUE_VIOLATION = '23505'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres
 * esta traducido al idioma del servidor (en esta maquina, espanol) y ademas Prisma solo
 * propaga el DETAIL, sin el nombre de la restriccion. Por eso NINGUN test afirma sobre
 * el nombre del indice: se afirma sobre el SQLSTATE y sobre el efecto, y el caso se
 * construye de forma que solo una restriccion pueda dispararlo (un unico valor en
 * conflicto por caso, o una unica columna omitida por iteracion). Los nombres de los
 * indices los vigila `tests/unit/schema/identity-migration.test.ts` sobre el SQL.
 */
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

/**
 * Corre `run` esperando que la base lo rechace. Devuelve el SQLSTATE para que el test
 * afirme sobre el tipo exacto de violacion, y deja la transaccion utilizable.
 */
async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return sqlStateOf(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

// ---------------------------------------------------------------------------
// Datos de apoyo
// ---------------------------------------------------------------------------

/** Nombre de rol irrepetible: la unicidad de `roles.name` es global y sensible a caso. */
function uniqueRoleName(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

async function createRole(tx: Prisma.TransactionClient, prefix = 'rol'): Promise<string> {
  const role = await tx.role.create({
    data: { name: uniqueRoleName(prefix), description: 'Rol de prueba' },
  })
  return role.id
}

/**
 * Nombre de empresa irrepetible (QC-47). `companies_name_unique` es GLOBAL —no esta acotado
 * a nada— asi que dos tests que usaran el mismo nombre chocarian entre si, y usar el nombre
 * de la empresa de instalacion chocaria con la fila que ya sembro QC-6.
 */
function uniqueCompanyName(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

/** Crea una empresa viva con nombre irrepetible y devuelve su id (QC-47 R3). */
async function createCompany(
  tx: Prisma.TransactionClient,
  prefix = 'empresa',
): Promise<string> {
  const name = uniqueCompanyName(prefix)
  const company = await tx.company.create({
    // El normalizado sale de la UNICA definicion publicada por el contrato del modulo (R3):
    // el test no reimplementa la normalizacion, la importa.
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

/**
 * Empresa por defecto de ESTA transaccion, creada una sola vez y compartida por todos los
 * usuarios del caso. Es lo que permite que los casos heredados de QC-4 sigan midiendo lo que
 * median —dos usuarios en la MISMA empresa— sin tocar ni una linea de su cuerpo.
 * `WeakMap` porque la clave es el propio `tx`, que muere con la transaccion.
 */
const defaultCompanyByTransaction = new WeakMap<Prisma.TransactionClient, Promise<string>>()

function defaultCompanyId(tx: Prisma.TransactionClient): Promise<string> {
  const cached = defaultCompanyByTransaction.get(tx)
  if (cached !== undefined) return cached
  const created = createCompany(tx, 'empresa-del-caso')
  defaultCompanyByTransaction.set(tx, created)
  return created
}

interface UserSeed {
  readonly email: string
  readonly username: string
  readonly documentNumber: string
  readonly documentTypeCode?: string
  readonly passwordHash?: string
  /** QC-47 R9: si no se dice otra cosa, el usuario nace en la empresa por defecto del caso. */
  readonly companyId?: string
}

async function createUser(
  tx: Prisma.TransactionClient,
  roleId: string,
  seed: UserSeed,
): Promise<{ id: string }> {
  return tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: seed.email,
      phone: '+57 300 111 2233',
      documentTypeCode: seed.documentTypeCode ?? DOCUMENT_TYPE_CC,
      documentNumber: seed.documentNumber,
      username: seed.username,
      passwordHash: seed.passwordHash ?? 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId,
      companyId: seed.companyId ?? (await defaultCompanyId(tx)),
    },
    select: { id: true },
  })
}

/** Las nueve columnas de negocio de R1 (todas obligatorias por R2). */
const REQUIRED_USER_COLUMNS = [
  'first_names',
  'last_names',
  'birth_date',
  'email',
  'phone',
  'document_type_code',
  'document_number',
  'username',
  'password_hash',
] as const

type RequiredUserColumn = (typeof REQUIRED_USER_COLUMNS)[number]

/**
 * Valores SQL de un usuario completo. Se usan fragmentos `Prisma.Sql` (no valores
 * sueltos) para poder poner los casts explicitos que necesitan `date` y `uuid`.
 */
function userSqlValues(seed: {
  email: string
  username: string
  documentNumber: string
  documentTypeCode?: string
}): Record<RequiredUserColumn, Prisma.Sql> {
  return {
    first_names: Prisma.sql`${'Ana Maria'}`,
    last_names: Prisma.sql`${'Perez Gomez'}`,
    birth_date: Prisma.sql`DATE '1990-05-17'`,
    email: Prisma.sql`${seed.email}`,
    phone: Prisma.sql`${'+57 300 111 2233'}`,
    document_type_code: Prisma.sql`${seed.documentTypeCode ?? DOCUMENT_TYPE_CC}`,
    document_number: Prisma.sql`${seed.documentNumber}`,
    username: Prisma.sql`${seed.username}`,
    password_hash: Prisma.sql`${'hash-de-prueba-no-es-un-algoritmo-real'}`,
  }
}

/**
 * `INSERT INTO users` crudo. `columns` decide que se escribe: omitir una entrada es
 * exactamente el caso "falta un dato obligatorio". `updated_at` se da siempre porque es
 * NOT NULL sin DEFAULT (lo rellena el cliente Prisma via `@updatedAt`, no la base).
 */
async function rawInsertUser(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<RequiredUserColumn, Prisma.Sql>>,
  roleId: string | null,
  // QC-47: `undefined` = la empresa por defecto del caso; una cadena = esa empresa (aunque no
  // exista, que es como se prueba R10); `null` = la columna NO se escribe, que es el unico
  // modo de expresar "usuario sin empresa" (R9) contra una columna NOT NULL.
  companyId?: string | null,
): Promise<number> {
  const entries = Object.entries(columns) as [RequiredUserColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  if (roleId !== null) {
    names.push(Prisma.raw('"role_id"'))
    values.push(Prisma.sql`CAST(${roleId} AS uuid)`)
  }
  const company = companyId === undefined ? await defaultCompanyId(tx) : companyId
  if (company !== null) {
    names.push(Prisma.raw('"company_id"'))
    values.push(Prisma.sql`CAST(${company} AS uuid)`)
  }
  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  return tx.$executeRaw`INSERT INTO "users" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/**
 * `INSERT INTO companies` crudo. Va crudo por lo mismo que el de `users`: omitir el nombre no
 * se puede expresar con la API tipada, y el SQLSTATE llega literal.
 */
function rawInsertCompany(
  tx: Prisma.TransactionClient,
  values: { name?: string; nameNormalized: string; deletedAt?: Date },
): Promise<number> {
  const names: Prisma.Sql[] = [Prisma.raw('"name_normalized"'), Prisma.raw('"updated_at"')]
  const data: Prisma.Sql[] = [Prisma.sql`${values.nameNormalized}`, Prisma.sql`CURRENT_TIMESTAMP`]

  if (values.name !== undefined) {
    names.push(Prisma.raw('"name"'))
    data.push(Prisma.sql`${values.name}`)
  }
  if (values.deletedAt !== undefined) {
    names.push(Prisma.raw('"deleted_at"'))
    data.push(Prisma.sql`${values.deletedAt}`)
  }

  return tx.$executeRaw`INSERT INTO "companies" (${Prisma.join(names)}) VALUES (${Prisma.join(data)})`
}

/** Marca un usuario como borrado logicamente y devuelve la fila resultante. */
async function softDelete(tx: Prisma.TransactionClient, id: string): Promise<Date> {
  const updated = await tx.user.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: { deletedAt: true },
  })
  if (updated.deletedAt === null) throw new Error('el borrado logico no marco deleted_at')
  return updated.deletedAt
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('users', 'roles', 'document_types', 'companies')`
  if (tables.length !== 4) {
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de identity (QC-4 + QC-47). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('estructura del usuario', () => {
  it('crea un usuario con todos sus datos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '01023456789',
      })

      const user = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(user.firstNames).toBe('Ana Maria')
      expect(user.lastNames).toBe('Perez Gomez')
      expect(user.birthDate.toISOString()).toBe('1990-05-17T00:00:00.000Z')
      expect(user.email).toBe('Ana.Perez@Example.com')
      expect(user.phone).toBe('+57 300 111 2233')
      expect(user.documentTypeCode).toBe(DOCUMENT_TYPE_CC)
      // Texto, no numero: el cero a la izquierda se conserva.
      expect(user.documentNumber).toBe('01023456789')
      expect(user.username).toBe('anaperez')
      expect(user.passwordHash).toBe('hash-de-prueba-no-es-un-algoritmo-real')
      expect(user.roleId).toBe(roleId)
      expect(user.deletedAt).toBeNull()
      // R3: identificador propio, no derivado de los datos de negocio.
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/u)

      // R12: la columna no impone longitud maxima. 10.000 caracteres entran enteros,
      // asi que la feature 2 puede elegir bcrypt (~60), argon2id (~100) o lo que sea.
      const longHash = 'x'.repeat(10_000)
      const { id: otherId } = await createUser(tx, roleId, {
        email: 'largo@example.com',
        username: 'largo',
        documentNumber: '999000111',
        passwordHash: longHash,
      })
      const withLongHash = await tx.user.findUniqueOrThrow({ where: { id: otherId } })
      expect(withLongHash.passwordHash).toHaveLength(10_000)
      expect(withLongHash.passwordHash).toBe(longHash)
    })
  })

  it('cambiar los datos de negocio del usuario no cambia su identificador', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id: originalId } = await createUser(tx, roleId, {
        email: 'ana.perez@example.com',
        username: 'anaperez',
        documentNumber: '77000111222',
      })

      await tx.user.update({
        where: { id: originalId },
        data: { email: 'otro.correo@example.com', phone: '+57 301 000 0000' },
      })

      // Se busca por un dato que NO se toco (el documento), no por el id: si el
      // identificador se derivase del correo o del telefono, esta fila traeria otro.
      // R3.
      const rows = await tx.user.findMany({
        where: { documentNumber: '77000111222' },
        select: { id: true, email: true, phone: true },
      })
      expect(rows).toHaveLength(1)
      const [found] = rows
      expect(found?.email).toBe('otro.correo@example.com')
      expect(found?.phone).toBe('+57 301 000 0000')
      expect(found?.id).toBe(originalId)
    })
  })

  it('rechaza el alta si falta un campo obligatorio', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const complete = userSqlValues({
        email: 'falta@example.com',
        username: 'falta',
        documentNumber: '555000111',
      })

      for (const omitted of REQUIRED_USER_COLUMNS) {
        const partial: Partial<Record<RequiredUserColumn, Prisma.Sql>> = { ...complete }
        delete partial[omitted]

        // La columna que falta la sabemos por construccion: cada vuelta omite una y
        // solo una, incluidas `phone` y `birth_date`, que el humano cerro como
        // obligatorias el 2026-08-06.
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertUser(tx, partial, roleId),
          `alta de usuario sin "${omitted}"`,
        )
        expect(sqlState, `omitiendo "${omitted}"`).toBe(NOT_NULL_VIOLATION)
        // "no crear ninguna fila": tras cada rechazo no queda ninguna fila DE ESTE CASO
        // (acotado por roleId: la tabla `users` puede tener otras filas, p. ej. el
        // usuario inicial que siembra QC-6 en el build).
        expect(await tx.user.count({ where: { roleId } })).toBe(0)
      }
    })
  })
})

describe('unicidad de correo, nombre de usuario y documento', () => {
  it('rechaza un correo repetido exacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana.perez@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      // Solo el correo coincide (username y documento son distintos), asi que la unica
      // restriccion que puede disparar 23505 es `users_email_unique`.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ana.perez@example.com',
              username: 'otro',
              documentNumber: '222000222',
            }),
            roleId,
          ),
        'segundo usuario con el mismo correo',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({ where: { roleId }, select: { id: true, email: true } })
      expect(survivors).toEqual([{ id, email: 'ana.perez@example.com' }])
    })
  })

  it('rechaza un correo repetido aunque cambie el uso de mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      // El correo solo difiere en mayusculas; username y documento son distintos. Que
      // esto sea 23505 es exactamente la unicidad sobre `lower(email)`.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ANA.perez@EXAMPLE.COM',
              username: 'otro',
              documentNumber: '222000222',
            }),
            roleId,
          ),
        'segundo usuario con el mismo correo en otras mayusculas',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // El usuario existente se conserva SIN MODIFICAR, con su correo tal como se tecleo.
      const survivors = await tx.user.findMany({ where: { roleId }, select: { id: true, email: true } })
      expect(survivors).toEqual([{ id, email: 'Ana.Perez@Example.com' }])
    })
  })

  it('rechaza un nombre de usuario repetido exacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      // Solo el nombre de usuario coincide.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otra@example.com',
              username: 'anaperez',
              documentNumber: '222000222',
            }),
            roleId,
          ),
        'segundo usuario con el mismo nombre de usuario',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({ where: { roleId }, select: { id: true, username: true } })
      expect(survivors).toEqual([{ id, username: 'anaperez' }])
    })
  })

  it('rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'AnaPerez',
        documentNumber: '111000111',
      })

      // El nombre de usuario solo difiere en mayusculas: unicidad sobre `lower(username)`.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otra@example.com',
              username: 'anaPEREZ',
              documentNumber: '222000222',
            }),
            roleId,
          ),
        'segundo usuario con el mismo nombre de usuario en otras mayusculas',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({ where: { roleId }, select: { id: true, username: true } })
      expect(survivors).toEqual([{ id, username: 'AnaPerez' }])
    })
  })

  it('rechaza el mismo tipo y numero de documento repetidos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      })

      // Solo coincide la pareja (tipo, numero): correo y username son distintos.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otra@example.com',
              username: 'otra',
              documentNumber: '1030555777',
            }),
            roleId,
          ),
        'segundo usuario con el mismo tipo y numero de documento',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({
        where: { roleId },
        select: { id: true, documentTypeCode: true, documentNumber: true },
      })
      expect(survivors).toEqual([
        { id, documentTypeCode: DOCUMENT_TYPE_CC, documentNumber: '1030555777' },
      ])
    })
  })

  it('acepta el mismo numero de documento con tipo distinto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      await tx.documentType.create({ data: { code: 'TI', name: 'Tarjeta de identidad' } })

      await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      })
      await createUser(tx, roleId, {
        email: 'otra@example.com',
        username: 'otra',
        documentNumber: '1030555777',
        documentTypeCode: 'TI',
      })

      const users = await tx.user.findMany({
        where: { roleId },
        select: { documentTypeCode: true, documentNumber: true },
        orderBy: { documentTypeCode: 'asc' },
      })
      expect(users).toEqual([
        { documentTypeCode: 'CC', documentNumber: '1030555777' },
        { documentTypeCode: 'TI', documentNumber: '1030555777' },
      ])
    })
  })
})

describe('conjunto cerrado de tipos de documento', () => {
  it('rechaza un tipo de documento fuera del catalogo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ana@example.com',
              username: 'anaperez',
              documentNumber: '111000111',
              documentTypeCode: 'PASAPORTE_MARCIANO',
            }),
            roleId,
          ),
        'alta con un tipo de documento que no esta en el catalogo',
      )
      // 23503 = foreign_key_violation: la FK es quien cierra el conjunto (design.md > 3).
      // El rol si existe, asi que la unica FK que puede fallar es la del tipo.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.count({ where: { roleId } })).toBe(0)
    })
  })

  it('el catalogo arranca SOLO con CC, activo y con su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Se lista el catalogo ENTERO y se compara por IGUALDAD, no por "contiene" ni "al menos":
      // lo que la feature promete es exclusividad —aqui solo esta CC—, y una asercion que solo
      // comprobara la existencia de CC no vigilaria eso.
      //
      // Esta asercion estuvo RELAJADA (se consultaba CC en concreto) mientras los tests de
      // integracion compartian la base de desarrollo: las suites de inventario, pedidos y
      // proveedores insertan tipos `DOC<marcador>` con escrituras COMMITEADAS, el catalogo global
      // crecia con cada corrida y la comparacion completa solo era verde sobre una base recien
      // reseteada. **QC-77 elimino esa causa de raiz**: cada corrida de integracion va contra su
      // propia base efimera, copia de una plantilla recien migrada y sembrada, asi que el
      // invariante vuelve a ser cierto y comprobable. La relajacion se retira aqui.
      const catalogo = await tx.documentType.findMany({ orderBy: { code: 'asc' } })
      expect(catalogo.map((tipo) => tipo.code)).toEqual([DOCUMENT_TYPE_CC])
      const [cc] = catalogo
      expect(cc.name).toBe('Cedula de ciudadania')
      expect(cc.isActive).toBe(true)
    })
  })

  it('anadir un tipo nuevo deja intactos los usuarios ya guardados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const before = await tx.user.findUniqueOrThrow({ where: { id } })

      // Anadir un tipo es DML, no DDL: un INSERT en el catalogo. Ninguna fila de
      // `users` se toca y ninguna columna cambia de tipo.
      await tx.documentType.create({ data: { code: 'CE', name: 'Cedula de extranjeria' } })

      const after = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(after).toEqual(before)

      // Y el tipo nuevo es utilizable de inmediato, sin migracion.
      const { id: newId } = await createUser(tx, roleId, {
        email: 'nuevo@example.com',
        username: 'nuevo',
        documentNumber: '222000222',
        documentTypeCode: 'CE',
      })
      const created = await tx.user.findUniqueOrThrow({ where: { id: newId } })
      expect(created.documentTypeCode).toBe('CE')
    })
  })
})

describe('roles', () => {
  it('crea un rol con nombre y descripcion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const name = uniqueRoleName('almacenista')
      const role = await tx.role.create({ data: { name, description: 'Gestiona el almacen' } })
      expect(role.name).toBe(name)
      expect(role.description).toBe('Gestiona el almacen')

      // Ambos son obligatorios: la unica columna omitida es `description`.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "roles" ("name", "updated_at")
                         VALUES (${uniqueRoleName('sin-descripcion')}, CURRENT_TIMESTAMP)`,
        'rol sin descripcion',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)
    })
  })

  it('rechaza un segundo rol con el mismo nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const name = uniqueRoleName('supervisor')
      const role = await tx.role.create({ data: { name, description: 'Descripcion original' } })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`INSERT INTO "roles" ("name", "description", "updated_at")
                         VALUES (${name}, ${'Otra descripcion'}, CURRENT_TIMESTAMP)`,
        'segundo rol con el mismo nombre',
      )
      // `roles_name_key` es el unico indice unico de la tabla aparte de la PK.
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // El rol existente se conserva sin modificar.
      const kept = await tx.role.findUniqueOrThrow({ where: { name } })
      expect(kept.id).toBe(role.id)
      expect(kept.description).toBe('Descripcion original')
    })
  })

  it('rechaza un usuario sin rol o con rol inexistente', async () => {
    await inRolledBackTransaction(async (tx) => {
      // No hay `roleId` util en este caso (a proposito: el rol es nulo o inexistente),
      // asi que se acota por este documento, irrepetible dentro del test.
      const documentNumber = '111000111'
      const values = userSqlValues({
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber,
      })

      // Sin rol: la unica columna omitida es `role_id`.
      const withoutRole = await expectRejectedByDatabase(
        tx,
        () => rawInsertUser(tx, values, null),
        'alta de usuario sin rol',
      )
      expect(withoutRole).toBe(NOT_NULL_VIOLATION)
      expect(await tx.user.count({ where: { documentNumber } })).toBe(0)

      // Con un rol inexistente: el tipo de documento si existe, asi que la FK que falla
      // solo puede ser la del rol.
      const missingRole = await expectRejectedByDatabase(
        tx,
        () => rawInsertUser(tx, values, randomUUID()),
        'alta de usuario con un rol inexistente',
      )
      expect(missingRole).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.count({ where: { documentNumber } })).toBe(0)
    })
  })

  it('acepta varios usuarios con el mismo rol', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      for (const n of [1, 2, 3, 4, 5]) {
        await createUser(tx, roleId, {
          email: `usuario${String(n)}@example.com`,
          username: `usuario${String(n)}`,
          documentNumber: `10000000${String(n)}`,
        })
      }

      const role = await tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: { users: { select: { username: true }, orderBy: { username: 'asc' } } },
      })
      expect(role.users).toHaveLength(5)
      expect(role.users.every((user) => user.username.startsWith('usuario'))).toBe(true)
    })
  })

  it('rechaza borrar un rol con usuarios asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id: userId } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "roles" WHERE "id" = CAST(${roleId} AS uuid)`,
        'borrado de un rol con usuarios asignados',
      )
      // `ON DELETE RESTRICT` de `users_role_id_fkey`.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // Se conservan tanto el rol como su usuario, sin modificar.
      expect(await tx.role.findUnique({ where: { id: roleId } })).not.toBeNull()
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      expect(user.roleId).toBe(roleId)
      expect(user.deletedAt).toBeNull()
    })
  })

  it('rechaza borrar un rol cuyo unico usuario esta borrado logicamente', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id: userId } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      await softDelete(tx, userId)

      // La FK no sabe nada de `deleted_at`: un usuario borrado logicamente SIGUE
      // contando como asignado, y eso es deliberado (design.md > 2.4).
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "roles" WHERE "id" = CAST(${roleId} AS uuid)`,
        'borrado de un rol cuyo unico usuario esta borrado logicamente',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.role.findUnique({ where: { id: roleId } })).not.toBeNull()
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      expect(user.roleId).toBe(roleId)
      expect(user.deletedAt).not.toBeNull()
    })
  })

  it('permite borrar un rol sin usuarios asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx, 'rol-huerfano')
      expect(await tx.user.count({ where: { roleId } })).toBe(0)

      await tx.role.delete({ where: { id: roleId } })

      expect(await tx.role.findUnique({ where: { id: roleId } })).toBeNull()
    })
  })
})

describe('borrado logico y marcas de tiempo', () => {
  it('el borrado logico conserva la fila y marca deleted_at', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const before = await tx.user.findUniqueOrThrow({ where: { id } })

      const deletedAt = await softDelete(tx, id)

      const after = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(after.deletedAt).toEqual(deletedAt)
      // Ningun dato se pierde: la fila entera sigue ahi, solo cambian las marcas.
      expect({ ...after, deletedAt: null, updatedAt: before.updatedAt }).toEqual(before)
    })
  })

  it('permite re-alta con el correo, username y documento de un usuario borrado', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const seed = {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      }
      const { id: oldId } = await createUser(tx, roleId, seed)
      await softDelete(tx, oldId)

      const { id: newId } = await createUser(tx, roleId, seed)
      expect(newId).not.toBe(oldId)

      const rows = await tx.user.findMany({
        where: { documentNumber: seed.documentNumber },
        select: { id: true, email: true, username: true, deletedAt: true },
        orderBy: { createdAt: 'asc' },
      })
      expect(rows).toHaveLength(2)
      // El historico se conserva y la persona vuelve a existir con sus mismos datos.
      expect(rows.filter((row) => row.deletedAt === null).map((row) => row.id)).toEqual([newId])
      expect(rows.every((row) => row.email === seed.email)).toBe(true)
      expect(rows.every((row) => row.username === seed.username)).toBe(true)
    })
  })

  it('admite dos usuarios borrados que comparten correo y documento', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const seed = {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      }

      const { id: first } = await createUser(tx, roleId, seed)
      await softDelete(tx, first)
      const { id: second } = await createUser(tx, roleId, seed)
      await softDelete(tx, second)
      // Y todavia se puede dar de alta un tercero vivo con los mismos valores.
      const { id: third } = await createUser(tx, roleId, seed)

      const rows = await tx.user.findMany({
        where: { documentNumber: seed.documentNumber },
        select: { id: true, deletedAt: true },
      })
      expect(rows).toHaveLength(3)
      expect(rows.filter((row) => row.deletedAt !== null).map((row) => row.id).sort()).toEqual(
        [first, second].sort(),
      )
      expect(rows.filter((row) => row.deletedAt === null).map((row) => row.id)).toEqual([third])
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Nunca se pasan `createdAt` ni `updatedAt`: los rellenan el DEFAULT de la base y
      // el `@updatedAt` de Prisma.
      const role = await tx.role.create({
        data: { name: uniqueRoleName('rol'), description: 'Rol de prueba' },
      })
      expect(role.createdAt).toBeInstanceOf(Date)
      expect(role.updatedAt).toBeInstanceOf(Date)

      const { id } = await createUser(tx, role.id, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const created = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(created.createdAt).toBeInstanceOf(Date)
      expect(created.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.user.update({ where: { id }, data: { phone: '+57 300 999 8877' } })

      const modified = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(modified.phone).toBe('+57 300 999 8877')
      expect(modified.createdAt.getTime()).toBe(created.createdAt.getTime())
      expect(modified.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime())

      await sleep(20)
      const updatedRole = await tx.role.update({
        where: { id: role.id },
        data: { description: 'Descripcion nueva' },
      })
      expect(updatedRole.createdAt.getTime()).toBe(role.createdAt.getTime())
      expect(updatedRole.updatedAt.getTime()).toBeGreaterThan(role.updatedAt.getTime())
    })
  })
})

// ===========================================================================
// QC-47 — LA EMPRESA DEL USUARIO (T16)
//
// Todo lo de aqui abajo es de QC-47 y sigue el mismo patron que lo anterior: cada `it`
// dentro de una transaccion que termina en ROLLBACK, las altas que deben fallar por SQL
// crudo dentro de un SAVEPOINT, y la afirmacion sobre el SQLSTATE y sobre el efecto, nunca
// sobre el texto del mensaje.
// ===========================================================================

describe('la empresa', () => {
  it('el id de la empresa lo genera la base y no es correlativo', async () => {
    // R1 — identificador propio, estable, NO correlativo y NO derivado de los datos de
    // negocio, generado por la base. Nunca se pasa `id` en el `create`.
    await inRolledBackTransaction(async (tx) => {
      const ids: string[] = []
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
        ids.push(await createCompany(tx, `empresa-r1-${String(n)}`))
      }

      // Forma de UUID v4 aleatorio (`gen_random_uuid()`), no un entero ni un hash del nombre.
      for (const id of ids) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        )
      }
      expect(new Set(ids).size).toBe(8)

      // "No correlativo": ocho altas seguidas no salen ordenadas. Que ocho valores al azar
      // caigan justo en orden tiene probabilidad 1/8! (~2,5e-5) por sentido, asi que esto no
      // es un test intermitente; con un contador o un serial seria rojo SIEMPRE.
      const ascendente = [...ids].sort()
      expect(ids).not.toEqual(ascendente)
      expect(ids).not.toEqual([...ascendente].reverse())

      // "No derivado de sus datos de negocio": cambiar el nombre no cambia el id.
      const [primero] = ids
      if (primero === undefined) throw new Error('inalcanzable')
      const renombrada = uniqueCompanyName('empresa-renombrada')
      const despues = await tx.company.update({
        where: { id: primero },
        data: { name: renombrada, nameNormalized: normalizeCompanyName(renombrada) },
        select: { id: true, name: true },
      })
      expect(despues.name).toBe(renombrada)
      expect(despues.id).toBe(primero)
    })
  })

  it('rechaza una empresa sin nombre y no limita la longitud del nombre', async () => {
    // R2 — la obligatoriedad la impone la BASE, no el llamante; y la columna es `text`.
    await inRolledBackTransaction(async (tx) => {
      const nameNormalized = normalizeCompanyName(uniqueCompanyName('empresa-sin-nombre'))

      // La unica columna omitida es `name`: el SQLSTATE no puede venir de otra cosa.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertCompany(tx, { nameNormalized }),
        'alta de empresa sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)
      expect(await tx.company.count({ where: { nameNormalized } })).toBe(0)

      // Y un nombre larguisimo entra entero: `text` sin `varchar(n)` (R2, R8).
      const nombreLargo = `${'x'.repeat(10_000)}-${randomUUID()}`
      const creada = await tx.company.create({
        data: { name: nombreLargo, nameNormalized: normalizeCompanyName(nombreLargo) },
        select: { name: true },
      })
      expect(creada.name).toHaveLength(nombreLargo.length)
      expect(creada.name).toBe(nombreLargo)
    })
  })

  it('rechaza una segunda empresa con el mismo nombre en otras mayusculas y con acentos', async () => {
    // R4 — contra el INDICE UNICO, no contra un SELECT previo. El rechazo tiene que llegar
    // como 23505 desde Postgres.
    await inRolledBackTransaction(async (tx) => {
      const nombre = `Química Cloud ${randomUUID()}`
      const variante = nombre.toUpperCase()
      // Lo que hace comparables a las dos es la UNICA definicion del contrato (R3).
      expect(normalizeCompanyName(variante)).toBe(normalizeCompanyName(nombre))

      const { id } = await tx.company.create({
        data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
        select: { id: true },
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertCompany(tx, {
            name: variante,
            nameNormalized: normalizeCompanyName(variante),
          }),
        'segunda empresa con el mismo nombre en otras mayusculas y con acentos',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // Y tambien si quien escribe no normalizo la caja: el indice va sobre
      // `lower("name_normalized")`, asi que la unicidad no depende del llamante.
      const enOtraCaja = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertCompany(tx, {
            name: variante,
            nameNormalized: normalizeCompanyName(nombre).toUpperCase(),
          }),
        'segunda empresa con el nombre normalizado escrito en mayusculas',
      )
      expect(enOtraCaja).toBe(UNIQUE_VIOLATION)

      // "no crear ni modificar ninguna fila": queda solo la primera, tal como se tecleo.
      const filas = await tx.company.findMany({
        where: { nameNormalized: normalizeCompanyName(nombre) },
        select: { id: true, name: true },
      })
      expect(filas).toEqual([{ id, name: nombre }])
    })
  })

  it('el nombre de una empresa dada de baja se puede reutilizar', async () => {
    // R5 — indice unico PARCIAL (`WHERE deleted_at IS NULL`).
    await inRolledBackTransaction(async (tx) => {
      const nombre = uniqueCompanyName('empresa-que-se-da-de-baja')
      const nameNormalized = normalizeCompanyName(nombre)

      const { id: muerta } = await tx.company.create({
        data: { name: nombre, nameNormalized, deletedAt: new Date() },
        select: { id: true },
      })

      // Misma clave normalizada, y la base la ACEPTA porque la otra no cuenta.
      const { id: viva } = await tx.company.create({
        data: { name: nombre, nameNormalized },
        select: { id: true },
      })
      expect(viva).not.toBe(muerta)

      const filas = await tx.company.findMany({
        where: { nameNormalized },
        select: { id: true, deletedAt: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.filter((fila) => fila.deletedAt === null).map((fila) => fila.id)).toEqual([viva])

      // Pero dos VIVAS con ese nombre siguen sin poder convivir.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertCompany(tx, { name: nombre, nameNormalized }),
        'tercera empresa viva con el nombre ya reutilizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)
    })
  })

  it('created_at y updated_at de la empresa se rellenan solos y updated_at cambia al modificar', async () => {
    // R7 — nunca se pasan: los ponen el DEFAULT de la base y el `@updatedAt` de Prisma.
    await inRolledBackTransaction(async (tx) => {
      const nombre = uniqueCompanyName('empresa-con-marcas')
      const creada = await tx.company.create({
        data: { name: nombre, nameNormalized: normalizeCompanyName(nombre) },
      })
      expect(creada.createdAt).toBeInstanceOf(Date)
      expect(creada.updatedAt).toBeInstanceOf(Date)
      // R6: la marca de baja nace VACIA.
      expect(creada.deletedAt).toBeNull()

      await sleep(20)
      const otroNombre = uniqueCompanyName('empresa-con-marcas-modificada')
      const modificada = await tx.company.update({
        where: { id: creada.id },
        data: { name: otroNombre, nameNormalized: normalizeCompanyName(otroNombre) },
      })

      expect(modificada.createdAt.getTime()).toBe(creada.createdAt.getTime())
      expect(modificada.updatedAt.getTime()).toBeGreaterThan(creada.updatedAt.getTime())
    })
  })

  it('companies tiene ROW LEVEL SECURITY activada y forzada', async () => {
    // R24 — defensa en profundidad, no la frontera de autorizacion. Se lee del catalogo de
    // Postgres, que es donde vive la verdad, y no del texto de la migracion.
    const filas = await prisma.$queryRaw<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'companies'`
    expect(filas).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])
  })
})

describe('la empresa a la que pertenece el usuario', () => {
  it('rechaza un usuario sin empresa o con una empresa inexistente', async () => {
    // R9 (obligatoria en la propia base) y R10 (la empresa referenciada tiene que existir).
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const documentNumber = '444000111'
      const values = userSqlValues({
        email: 'sin.empresa@example.com',
        username: 'sinempresa',
        documentNumber,
      })

      // Sin empresa: la unica columna omitida es `company_id`.
      const sinEmpresa = await expectRejectedByDatabase(
        tx,
        () => rawInsertUser(tx, values, roleId, null),
        'alta de usuario sin empresa',
      )
      expect(sinEmpresa).toBe(NOT_NULL_VIOLATION)
      expect(await tx.user.count({ where: { documentNumber } })).toBe(0)

      // Con una empresa inexistente: el rol y el tipo de documento SI existen, asi que la
      // unica FK que puede fallar es `users_company_id_fkey`.
      const empresaFantasma = await expectRejectedByDatabase(
        tx,
        () => rawInsertUser(tx, values, roleId, randomUUID()),
        'alta de usuario con una empresa inexistente',
      )
      expect(empresaFantasma).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.count({ where: { documentNumber } })).toBe(0)
    })
  })

  it('rechaza borrar una empresa con un usuario vivo dentro', async () => {
    // R11 — `ON DELETE RESTRICT` de `users_company_id_fkey`.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const companyId = await createCompany(tx, 'empresa-con-gente')
      const { id: userId } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
        companyId,
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "companies" WHERE "id" = CAST(${companyId} AS uuid)`,
        'borrado de una empresa con un usuario vivo',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // La empresa y su usuario quedan intactos.
      expect(await tx.company.findUnique({ where: { id: companyId } })).not.toBeNull()
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      expect(user.companyId).toBe(companyId)
      expect(user.deletedAt).toBeNull()
    })
  })

  it('rechaza borrar una empresa cuyo unico usuario esta dado de baja', async () => {
    // R11 en su mitad olvidada: la FK no sabe nada de `deleted_at`, y eso es deliberado. Un
    // usuario de baja SIGUE contando como "esta empresa tiene gente".
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const companyId = await createCompany(tx, 'empresa-con-gente-de-baja')
      const { id: userId } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
        companyId,
      })
      await softDelete(tx, userId)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "companies" WHERE "id" = CAST(${companyId} AS uuid)`,
        'borrado de una empresa cuyo unico usuario esta dado de baja',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.company.findUnique({ where: { id: companyId } })).not.toBeNull()
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      expect(user.companyId).toBe(companyId)
      expect(user.deletedAt).not.toBeNull()
    })
  })

  it('permite borrar una empresa sin ningun usuario', async () => {
    // La otra cara de R11: el RESTRICT no es un candado permanente.
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx, 'empresa-vacia')
      expect(await tx.user.count({ where: { companyId } })).toBe(0)

      await tx.company.delete({ where: { id: companyId } })

      expect(await tx.company.findUnique({ where: { id: companyId } })).toBeNull()
    })
  })

  it('el usuario se crea con su rol y su empresa como columnas propias de su fila', async () => {
    // R13 (el rol sigue en `users.role_id`, sin tabla intermedia) + R9 + R12.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const companyId = await createCompany(tx, 'empresa-del-usuario')
      const { id } = await createUser(tx, roleId, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
        companyId,
      })

      // Una sola lectura de `users` trae las dos cosas: no hay ninguna tabla en medio (R12).
      const fila = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { roleId: true, companyId: true },
      })
      expect(fila).toEqual({ roleId, companyId })

      // Y borrar el rol que esta en uso sigue rechazandose, con empresa o sin ella (R13).
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "roles" WHERE "id" = CAST(${roleId} AS uuid)`,
        'borrado de un rol en uso por un usuario de una empresa',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
        roleId,
        companyId,
      })
    })
  })

  it('dos usuarios de empresas distintas comparten el mismo rol del mismo catalogo', async () => {
    // R15 — los roles son del sistema: ni el catalogo de roles ni el de tipos de documento
    // ganan columna de empresa, y "Administrador" significa lo mismo en todas.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx, 'rol-compartido')
      const empresaA = await createCompany(tx, 'empresa-a')
      const empresaB = await createCompany(tx, 'empresa-b')

      const { id: enA } = await createUser(tx, roleId, {
        email: 'ana@empresa-a.example.com',
        username: 'ana.a',
        documentNumber: '111000111',
        companyId: empresaA,
      })
      const { id: enB } = await createUser(tx, roleId, {
        email: 'ana@empresa-b.example.com',
        username: 'ana.b',
        documentNumber: '222000222',
        companyId: empresaB,
      })

      const filas = await tx.user.findMany({
        where: { id: { in: [enA, enB] } },
        select: { id: true, roleId: true, companyId: true },
        orderBy: { username: 'asc' },
      })
      expect(filas).toEqual([
        { id: enA, roleId, companyId: empresaA },
        { id: enB, roleId, companyId: empresaB },
      ])

      // Y las columnas por las que se separaria el catalogo NO existen: R15 al pie de la letra.
      const columnas = await tx.$queryRaw<{ table_name: string }[]>`
        SELECT table_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('roles', 'document_types')
          AND column_name = 'company_id'`
      expect(columnas).toEqual([])
    })
  })
})

// ---------------------------------------------------------------------------
// EL CORAZON DE LA FICHA (R16, R17, R18, R19).
//
// QC-161: el nombre de usuario dejo de ser por empresa (R36); su caso ya rechaza tambien en otra
// empresa. Correo y documento siguen como abajo (R37).
//
// Cada uno de los tres va en los DOS sentidos: dentro de la misma empresa la base rechaza
// con 23505, y en empresas distintas la base ACEPTA. La mitad que rechaza ya pasaba con los
// indices globales de QC-4; la que acepta es la que solo puede pasar con `company_id` dentro
// del indice, y es la que se pone roja si alguien devuelve los tres indices a su forma
// anterior. Se comprobo recreandolos de verdad sobre la base y volviendo a correr el archivo.
// ---------------------------------------------------------------------------

describe('unicidad DENTRO de la empresa', () => {
  it('rechaza el mismo correo en la misma empresa y lo acepta en otra', async () => {
    // R16.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const empresaA = await createCompany(tx, 'empresa-correo-a')
      const empresaB = await createCompany(tx, 'empresa-correo-b')
      const email = 'Ana.Perez@Example.com'

      const { id: enA } = await createUser(tx, roleId, {
        email,
        username: 'ana.a',
        documentNumber: '111000111',
        companyId: empresaA,
      })

      // Mismo correo, misma empresa: solo el correo coincide, asi que el 23505 solo puede
      // venir de `users_email_unique`. Y en otras mayusculas, porque el indice lleva `lower`.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ANA.perez@EXAMPLE.COM',
              username: 'otra.a',
              documentNumber: '222000222',
            }),
            roleId,
            empresaA,
          ),
        'segundo usuario con el mismo correo en la misma empresa',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // Mismo correo, OTRA empresa: aceptado. Esto es lo nuevo de QC-47.
      const { id: enB } = await createUser(tx, roleId, {
        email,
        username: 'ana.b',
        documentNumber: '333000333',
        companyId: empresaB,
      })

      // Acotado a las dos empresas del caso: `users` tiene tambien las filas de la
      // instalacion, y el correo ya no es una clave global.
      const filas = await tx.user.findMany({
        where: { email, companyId: { in: [empresaA, empresaB] } },
        select: { id: true, companyId: true },
      })
      expect(filas.map((fila) => fila.id).sort()).toEqual([enA, enB].sort())
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]))
    })
  })

  it('QC-161 R36: rechaza el mismo nombre de usuario en la misma empresa y en otra, en otras mayusculas', async () => {
    // Antes (QC-47 R17) el mismo nombre se aceptaba en otra empresa. Ahora el nombre de usuario
    // es unico en todo el sistema. Nombre propio del caso: `admin` puede ser el del
    // Administrador de la instalacion y el choque no mediria lo que el caso quiere.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const empresaA = await createCompany(tx, 'empresa-usuario-a')
      const empresaB = await createCompany(tx, 'empresa-usuario-b')
      const username = 'ana.global'

      const { id: enA } = await createUser(tx, roleId, {
        email: 'ana@empresa-a.example.com',
        username,
        documentNumber: '111000111',
        companyId: empresaA,
      })

      // Correo y documento distintos: el 23505 solo puede venir del nombre de usuario.
      const mismaEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otro@empresa-a.example.com',
              username: 'ANA.GLOBAL',
              documentNumber: '222000222',
            }),
            roleId,
            empresaA,
          ),
        'segundo usuario con el mismo nombre de usuario en la misma empresa',
      )
      expect(mismaEmpresa).toBe(UNIQUE_VIOLATION)

      const otraEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ana@empresa-b.example.com',
              username: 'Ana.Global',
              documentNumber: '333000333',
            }),
            roleId,
            empresaB,
          ),
        'usuario de otra empresa con el mismo nombre de usuario',
      )
      expect(otraEmpresa).toBe(UNIQUE_VIOLATION)

      const filas = await tx.user.findMany({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: { id: true },
      })
      expect(filas.map((fila) => fila.id)).toEqual([enA])
      expect(await tx.user.count({ where: { companyId: empresaB } })).toBe(0)
    })
  })

  it('rechaza el mismo documento en la misma empresa y lo acepta en otra', async () => {
    // R18 — la pareja (tipo, numero).
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const empresaA = await createCompany(tx, 'empresa-documento-a')
      const empresaB = await createCompany(tx, 'empresa-documento-b')
      const documentNumber = '1030555777'

      const { id: enA } = await createUser(tx, roleId, {
        email: 'ana@empresa-a.example.com',
        username: 'ana.a',
        documentNumber,
        companyId: empresaA,
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otra@empresa-a.example.com',
              username: 'otra.a',
              documentNumber,
            }),
            roleId,
            empresaA,
          ),
        'segundo usuario con el mismo documento en la misma empresa',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const { id: enB } = await createUser(tx, roleId, {
        email: 'ana@empresa-b.example.com',
        username: 'ana.b',
        documentNumber,
        companyId: empresaB,
      })

      // Acotado a las dos empresas del caso, por lo mismo que en R16 y R17.
      const filas = await tx.user.findMany({
        where: {
          documentTypeCode: DOCUMENT_TYPE_CC,
          documentNumber,
          companyId: { in: [empresaA, empresaB] },
        },
        select: { id: true, companyId: true },
      })
      expect(filas.map((fila) => fila.id).sort()).toEqual([enA, enB].sort())
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]))
    })
  })

  it('dar de baja a un usuario libera su correo, su username y su documento dentro de su empresa', async () => {
    // R19 — las tres unicidades siguen midiendose SOLO entre usuarios vivos: los indices
    // conservan su `WHERE deleted_at IS NULL` ademas de ganar la empresa.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const companyId = await createCompany(tx, 'empresa-que-libera')
      const seed = {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
        companyId,
      }

      const { id: viejo } = await createUser(tx, roleId, seed)

      // Vivo: el correo esta ocupado EN ESTA empresa.
      const ocupado = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: seed.email,
              username: 'otro.username',
              documentNumber: '999000999',
            }),
            roleId,
            companyId,
          ),
        'correo ocupado por un usuario vivo de la misma empresa',
      )
      expect(ocupado).toBe(UNIQUE_VIOLATION)

      await softDelete(tx, viejo)

      // Dado de baja: los tres valores quedan libres a la vez, en la MISMA empresa.
      const { id: nuevo } = await createUser(tx, roleId, seed)
      expect(nuevo).not.toBe(viejo)

      const filas = await tx.user.findMany({
        where: { companyId },
        select: { id: true, deletedAt: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.filter((fila) => fila.deletedAt === null).map((fila) => fila.id)).toEqual([nuevo])
    })
  })
})

// ---------------------------------------------------------------------------
// QC-65 (T13) — EL ESTADO DE CUENTA, contra Postgres real.
// ---------------------------------------------------------------------------
//
// Mismo aislamiento que todo el archivo: cada caso dentro de una transaccion que termina en
// ROLLBACK, y toda operacion que se espera que la base rechace envuelta en un SAVEPOINT para
// poder seguir consultando despues del error.
//
// Los tests unitarios de `tests/unit/identity/schema/*` leen el ESQUEMA y el SQL. Estos leen
// la BASE: R2 y R11 son garantias de Postgres, no comprobaciones de codigo (R2 lo dice con
// todas las letras), y afirmar sobre el texto de una migracion no demuestra que el tipo y la
// FK existan de verdad en la base sobre la que corre la app.

/** SQLSTATE `invalid_text_representation`: el valor no pertenece al tipo enumerado (R2). */
const INVALID_TEXT_REPRESENTATION = '22P02'

/** Nombre de columna admisible para interpolar cruda en un `INSERT`. */
const SAFE_COLUMN_NAME = /^[a-z_][a-z0-9_]*$/

/**
 * `INSERT INTO users` crudo CON columnas extra ademas de las nueve de negocio. Existe porque
 * `rawInsertUser` (arriba) solo sabe de `REQUIRED_USER_COLUMNS`, y los dos casos que miden una
 * garantia de la BASE necesitan escribir columnas de QC-65 con su cast explicito:
 *
 *   - un `account_status` fuera del conjunto no se puede expresar con la API tipada de Prisma
 *     (no compilaria, que es justo lo que R2 NO quiere probar: R2 es de la base);
 *   - y con SQL crudo el error de Postgres llega literal, con su SQLSTATE.
 *
 * No se toca `rawInsertUser` a proposito: lo usan los casos de QC-4 y QC-47 y su firma es suya.
 */
async function rawInsertUserWithColumns(
  tx: Prisma.TransactionClient,
  seed: UserSeed,
  roleId: string,
  extra: Readonly<Record<string, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(userSqlValues(seed)) as [string, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  names.push(Prisma.raw('"role_id"'))
  values.push(Prisma.sql`CAST(${roleId} AS uuid)`)
  names.push(Prisma.raw('"company_id"'))
  values.push(Prisma.sql`CAST(${seed.companyId ?? (await defaultCompanyId(tx))} AS uuid)`)
  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  for (const [name, value] of Object.entries(extra)) {
    if (!SAFE_COLUMN_NAME.test(name)) throw new Error(`nombre de columna inesperado: ${name}`)
    names.push(Prisma.raw(`"${name}"`))
    values.push(value)
  }

  return tx.$executeRaw`INSERT INTO "users" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/**
 * Holgura de la cota temporal de R9. La columna tiene `DEFAULT CURRENT_TIMESTAMP` en la base y
 * `@default(now())` en el esquema, y hoy quien lo rellena es el cliente Prisma: la cota se mide
 * contra el reloj de Node. La holgura existe para que el caso siga siendo honesto —y no
 * intermitente— si algun dia lo rellenara el reloj del SERVIDOR, que dentro de una transaccion
 * vale el instante en que esta empezo. Lo que el caso afirma sin holgura ninguna es lo que de
 * verdad importa: que el instante NO esta ausente y que es EL MISMO del alta.
 */
const TOLERANCIA_DE_RELOJ_MS = 60_000

describe('el estado de cuenta del usuario', () => {
  it('acepta los cuatro valores del conjunto y rechaza cualquier otro sin dejar la fila', async () => {
    // R1, R2 — la garantia es del TIPO de Postgres, no de una comprobacion previa en codigo.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)

      // Primero: los cuatro valores del dominio SI se aceptan, uno a uno. La lista no se
      // escribe aqui: se importa de `@/lib/modules/identity`, que es su unica definicion (R3).
      // Si el tipo de la base y la constante divergieran, este bucle se pondria rojo.
      expect(USER_ACCOUNT_STATUSES.length).toBeGreaterThan(0)
      for (const [posicion, estado] of USER_ACCOUNT_STATUSES.entries()) {
        const { id } = await createUser(tx, roleId, {
          email: `estado.${estado}@example.com`,
          username: `estado.${estado}`,
          documentNumber: `90000000${posicion}`,
        })
        const guardado = await tx.user.update({
          where: { id },
          data: { accountStatus: estado },
          select: { accountStatus: true },
        })
        expect(guardado.accountStatus).toBe(estado)
      }

      // Luego: un valor fuera del conjunto lo rechaza la BASE, con `22P02`.
      const valorInventado = 'suspendido'
      expect(USER_ACCOUNT_STATUSES as readonly string[]).not.toContain(valorInventado)
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUserWithColumns(
            tx,
            {
              email: 'suspendido@example.com',
              username: 'usuario.suspendido',
              documentNumber: '910000001',
            },
            roleId,
            { account_status: Prisma.sql`CAST(${valorInventado} AS "UserAccountStatus")` },
          ),
        'usuario con un estado de cuenta fuera del conjunto cerrado',
      )
      expect(sqlState).toBe(INVALID_TEXT_REPRESENTATION)

      // Y la fila NO quedo guardada.
      expect(await tx.user.findFirst({ where: { username: 'usuario.suspendido' } })).toBeNull()
    })
  })

  it('un alta que no dice nada del estado nace en el estado inicial y con el instante del alta', async () => {
    // R5, R8, R9, R10 — el `@default(pending)` y el `@default(now())` de las columnas.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)

      const antes = new Date()

      // El alta NO menciona ninguna de las tres columnas: es exactamente el caso de R5.
      const { id } = await createUser(tx, roleId, {
        email: 'nace.sin.estado@example.com',
        username: 'nace.sin.estado',
        documentNumber: '920000001',
      })

      const despues = new Date()

      const fila = await tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          accountStatus: true,
          accountStatusChangedAt: true,
          accountStatusChangedBy: true,
          createdAt: true,
        },
      })

      // R5: `pending`, y el valor esperado sale de la constante del dominio.
      expect(fila.accountStatus).toBe(INITIAL_USER_ACCOUNT_STATUS)
      // R8, R9: el instante nunca esta ausente y cae dentro del alta.
      expect(fila.accountStatusChangedAt.getTime()).toBeGreaterThanOrEqual(
        antes.getTime() - TOLERANCIA_DE_RELOJ_MS,
      )
      expect(fila.accountStatusChangedAt.getTime()).toBeLessThanOrEqual(
        despues.getTime() + TOLERANCIA_DE_RELOJ_MS,
      )
      expect(fila.accountStatusChangedAt.getTime()).toBe(fila.createdAt.getTime())
      // R10: sin autor. El sistema, no una persona.
      expect(fila.accountStatusChangedBy).toBeNull()
    })
  })

  it('rechaza un autor del cambio que no existe y solo acepta el id de un usuario real', async () => {
    // R11 — `users_account_status_changed_by_fkey`.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)

      const idInventado = randomUUID()
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUserWithColumns(
            tx,
            {
              email: 'autor.inventado@example.com',
              username: 'autor.inventado',
              documentNumber: '930000001',
            },
            roleId,
            { account_status_changed_by: Prisma.sql`CAST(${idInventado} AS uuid)` },
          ),
        'usuario cuyo autor del ultimo cambio de estado no existe',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.findFirst({ where: { username: 'autor.inventado' } })).toBeNull()

      // Y el camino feliz, para que el caso no pase en verde por una razon equivocada: con el
      // id de un usuario que SI existe, la misma escritura entra.
      const { id: autorReal } = await createUser(tx, roleId, {
        email: 'autor.real@example.com',
        username: 'autor.real',
        documentNumber: '930000002',
      })
      const { id: cambiado } = await createUser(tx, roleId, {
        email: 'cambiado@example.com',
        username: 'cambiado',
        documentNumber: '930000003',
      })
      const guardado = await tx.user.update({
        where: { id: cambiado },
        data: { accountStatus: 'inactive', accountStatusChangedBy: autorReal },
        select: { accountStatusChangedBy: true },
      })
      expect(guardado.accountStatusChangedBy).toBe(autorReal)
    })
  })

  it('impide el borrado FISICO de un usuario que figura como autor del ultimo cambio de estado', async () => {
    // R12 — la FK es `ON DELETE RESTRICT`, nunca CASCADE ni SET NULL: perder el rastro en
    // silencio al borrar seria peor que no tenerlo.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)

      const { id: autor } = await createUser(tx, roleId, {
        email: 'admin.que.cambia@example.com',
        username: 'admin.que.cambia',
        documentNumber: '940000001',
      })
      const { id: afectado } = await createUser(tx, roleId, {
        email: 'afectado@example.com',
        username: 'afectado',
        documentNumber: '940000002',
      })
      await tx.user.update({
        where: { id: afectado },
        data: { accountStatus: 'inactive', accountStatusChangedBy: autor },
      })

      // El `DELETE` va CRUDO por lo mismo que las altas que se espera que fallen (cabecera del
      // archivo): asi llega el SQLSTATE de Postgres. `tx.user.delete` lo envuelve en el `P2003`
      // de Prisma y el caso dejaria de afirmar sobre la violacion concreta.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "users" WHERE "id" = CAST(${autor} AS uuid)`,
        'borrado fisico del usuario que figura como autor de un cambio de estado',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // El autor sigue ahi, y el rastro del cambio tambien.
      expect(await tx.user.findUnique({ where: { id: autor }, select: { id: true } })).not.toBeNull()
      const rastro = await tx.user.findUniqueOrThrow({
        where: { id: afectado },
        select: { accountStatusChangedBy: true },
      })
      expect(rastro.accountStatusChangedBy).toBe(autor)

      // Y el borrado LOGICO del autor si se puede: R12 habla del fisico, y el borrado de este
      // repo es logico (QC-4). Sin esta mitad, el caso podria estar describiendo un candado
      // que no es el que se quiso poner.
      const marcado = await softDelete(tx, autor)
      expect(marcado).toBeInstanceOf(Date)
    })
  })

  it('admite cualquiera de los cuatro valores como siguiente de cualquier otro, blocked a active incluido', async () => {
    // R14 — el modelo NO restringe transiciones: ni maquina de estados, ni CHECK de
    // transicion, ni disparador que compare el valor viejo con el nuevo. Se recorren TODOS
    // los pares ordenados (dieciseis con los cuatro valores de hoy), no solo el par de la
    // decision cerrada 8: un CHECK que prohibiera cualquier otra transicion caeria aqui.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'transiciones@example.com',
        username: 'transiciones',
        documentNumber: '950000001',
      })

      const paresProbados: string[] = []
      for (const desde of USER_ACCOUNT_STATUSES) {
        for (const hasta of USER_ACCOUNT_STATUSES) {
          await tx.user.update({ where: { id }, data: { accountStatus: desde } })
          const despues = await tx.user.update({
            where: { id },
            data: { accountStatus: hasta },
            select: { accountStatus: true },
          })
          expect(despues.accountStatus).toBe(hasta)
          paresProbados.push(`${desde}->${hasta}`)
        }
      }

      // Se probaron TODOS los pares, no una muestra: el numero sale de la lista del dominio.
      expect(paresProbados).toHaveLength(USER_ACCOUNT_STATUSES.length ** 2)
      // Y el par que nombra la decision cerrada 8, dicho aparte para que se lea en el diff.
      expect(paresProbados).toContain('blocked->active')
    })
  })

  it('una cuenta inactive sigue ocupando su correo, su nombre de usuario y su documento en su empresa (y su nombre de usuario en todas, QC-161 R36, R37)', async () => {
    // R15 — el corazon de la decision cerrada 9. Los tres indices unicos NO cambian: siguen
    // midiendose dentro de la empresa y solo sobre las filas vivas, y el estado de cuenta NO
    // participa en ninguno. Si alguien metiera `account_status` en cualquiera de los tres,
    // los tres rechazos de abajo dejarian de ocurrir —el segundo usuario nace `pending`, o
    // sea con un estado DISTINTO del `inactive` del primero— y este caso caeria.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const empresaA = await createCompany(tx, 'empresa-estado-a')
      const empresaB = await createCompany(tx, 'empresa-estado-b')
      const seed = {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      }

      const { id: apagada } = await createUser(tx, roleId, { ...seed, companyId: empresaA })
      const filaApagada = await tx.user.update({
        where: { id: apagada },
        data: { accountStatus: 'inactive' },
        select: { accountStatus: true, deletedAt: true },
      })
      // La cuenta esta apagada y VIVA: deshabilitar no es borrar (R16).
      expect(filaApagada.accountStatus).toBe('inactive')
      expect(filaApagada.deletedAt).toBeNull()
      // Y el segundo usuario nacera con OTRO estado, que es lo que hace concluyente al caso.
      expect(INITIAL_USER_ACCOUNT_STATUS).not.toBe('inactive')

      // 1. El correo sigue ocupado en la MISMA empresa.
      const porCorreo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: seed.email,
              username: 'otro.username',
              documentNumber: '960000001',
            }),
            roleId,
            empresaA,
          ),
        'correo ocupado por una cuenta inactive de la misma empresa',
      )
      expect(porCorreo).toBe(UNIQUE_VIOLATION)

      // 2. El nombre de usuario, tambien.
      const porUsuario = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'otro.correo@example.com',
              username: seed.username,
              documentNumber: '960000002',
            }),
            roleId,
            empresaA,
          ),
        'nombre de usuario ocupado por una cuenta inactive de la misma empresa',
      )
      expect(porUsuario).toBe(UNIQUE_VIOLATION)

      // 3. Y el documento.
      const porDocumento = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'tercero@example.com',
              username: 'tercero',
              documentNumber: seed.documentNumber,
            }),
            roleId,
            empresaA,
          ),
        'documento ocupado por una cuenta inactive de la misma empresa',
      )
      expect(porDocumento).toBe(UNIQUE_VIOLATION)

      // QC-161 R36: el nombre de usuario de la cuenta apagada tambien esta ocupado en OTRA
      // empresa (es unico en todo el sistema); el estado no le quita nada.
      const porUsuarioEnB = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({ email: 'otra.empresa@example.com', username: seed.username, documentNumber: '960000003' }),
            roleId,
            empresaB,
          ),
        'nombre de usuario ocupado por una cuenta inactive de otra empresa',
      )
      expect(porUsuarioEnB).toBe(UNIQUE_VIOLATION)

      // QC-161 R37: en OTRA empresa el correo y el documento siguen libres: esos van por empresa
      // y el estado no les anade ni les quita nada.
      const { id: enB } = await createUser(tx, roleId, {
        ...seed,
        username: 'anaperez.b',
        companyId: empresaB,
      })
      expect(enB).not.toBe(apagada)

      const filas = await tx.user.findMany({
        where: { companyId: { in: [empresaA, empresaB] } },
        select: { id: true, companyId: true, accountStatus: true },
      })
      expect(filas.map((fila) => fila.id).sort()).toEqual([apagada, enB].sort())
      // La de la empresa B nacio con el estado inicial: nadie le contagio el `inactive`.
      expect(filas.find((fila) => fila.id === enB)?.accountStatus).toBe(INITIAL_USER_ACCOUNT_STATUS)
    })
  })

  it('el estado de cuenta y el borrado logico son independientes: ninguno mueve al otro', async () => {
    // R16 — `deleted_at` es de QC-4 y esta ficha no lo lee ni lo escribe; ningun valor del
    // estado implica ni excluye estar dado de baja.
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id } = await createUser(tx, roleId, {
        email: 'independientes@example.com',
        username: 'independientes',
        documentNumber: '970000001',
      })

      // Mitad 1: cambiar el estado NO toca `deleted_at`.
      const trasCambiarEstado = await tx.user.update({
        where: { id },
        data: { accountStatus: 'blocked' },
        select: { accountStatus: true, deletedAt: true },
      })
      expect(trasCambiarEstado.accountStatus).toBe('blocked')
      expect(trasCambiarEstado.deletedAt).toBeNull()

      // Mitad 2: dar de baja logicamente NO cambia el estado ni su rastro.
      const antesDeLaBaja = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { accountStatus: true, accountStatusChangedAt: true, accountStatusChangedBy: true },
      })
      await softDelete(tx, id)
      const trasLaBaja = await tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          accountStatus: true,
          accountStatusChangedAt: true,
          accountStatusChangedBy: true,
          deletedAt: true,
        },
      })
      expect(trasLaBaja.deletedAt).not.toBeNull()
      expect(trasLaBaja.accountStatus).toBe(antesDeLaBaja.accountStatus)
      expect(trasLaBaja.accountStatusChangedAt.getTime()).toBe(
        antesDeLaBaja.accountStatusChangedAt.getTime(),
      )
      expect(trasLaBaja.accountStatusChangedBy).toBe(antesDeLaBaja.accountStatusChangedBy)

      // Mitad 3: y sobre una fila YA dada de baja el estado se sigue pudiendo mover, sin que
      // la baja se levante. Son dos ejes que no se cruzan.
      const trasCambiarloBorrado = await tx.user.update({
        where: { id },
        data: { accountStatus: 'active' },
        select: { accountStatus: true, deletedAt: true },
      })
      expect(trasCambiarloBorrado.accountStatus).toBe('active')
      expect(trasCambiarloBorrado.deletedAt).toEqual(trasLaBaja.deletedAt)
    })
  })

  it('solo guarda el ULTIMO cambio: escribir un estado nuevo sustituye el rastro anterior', async () => {
    // R13 — no hay historial. Dos cambios seguidos dejan UNA fila con el ultimo rastro, y el
    // esquema no gana ninguna tabla que los acumule (eso lo vigila el test estatico del
    // esquema; aqui se comprueba el efecto sobre la fila).
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const { id: primerAutor } = await createUser(tx, roleId, {
        email: 'primer.autor@example.com',
        username: 'primer.autor',
        documentNumber: '980000001',
      })
      const { id: segundoAutor } = await createUser(tx, roleId, {
        email: 'segundo.autor@example.com',
        username: 'segundo.autor',
        documentNumber: '980000002',
      })
      const { id } = await createUser(tx, roleId, {
        email: 'con.dos.cambios@example.com',
        username: 'con.dos.cambios',
        documentNumber: '980000003',
      })

      await tx.user.update({
        where: { id },
        data: {
          accountStatus: 'inactive',
          accountStatusChangedBy: primerAutor,
          accountStatusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      })
      await tx.user.update({
        where: { id },
        data: {
          accountStatus: 'active',
          accountStatusChangedBy: segundoAutor,
          accountStatusChangedAt: new Date('2026-02-02T00:00:00.000Z'),
        },
      })

      const fila = await tx.user.findUniqueOrThrow({
        where: { id },
        select: {
          accountStatus: true,
          accountStatusChangedAt: true,
          accountStatusChangedBy: true,
        },
      })
      expect(fila.accountStatus).toBe('active')
      expect(fila.accountStatusChangedBy).toBe(segundoAutor)
      expect(fila.accountStatusChangedAt.toISOString()).toBe('2026-02-02T00:00:00.000Z')

      // Del primer cambio no queda nada en ninguna parte de la fila.
      expect(fila.accountStatusChangedBy).not.toBe(primerAutor)
    })
  })
})
