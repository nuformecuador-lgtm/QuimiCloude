/**
 * Tests de integracion del modelo de identidad contra una base Postgres REAL, con las
 * migraciones `20260806122638_users_and_roles` (QC-4) y
 * `20260904180600_companies_and_memberships` (QC-47) aplicadas.
 *
 * QC-47 — `users.role_id` YA NO EXISTE (R14). El rol de una persona vive en la
 * PERTENENCIA, y es el rol que tiene EN ESA EMPRESA (R7, R8). Por eso aqui:
 *   - la siembra crea usuario y, cuando el caso lo necesita, empresa + pertenencia;
 *   - lo que este archivo comprobaba sobre `users.role_id` (alta sin rol, alta con rol
 *     inexistente, borrado de un rol "con usuarios asignados") pasa a comprobarse sobre
 *     `memberships`, que es donde vive ahora esa garantia;
 *   - los casos que antes acotaban sus consultas por `roleId` las acotan ahora por el
 *     numero de documento, que es el dato irrepetible que SI escribe el `INSERT` crudo.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila
 * escrita por un test sobrevive. Por eso los tests son repetibles e independientes del
 * orden. Se eligio la transaccion interactiva de Prisma (y no un cliente `pg` aparte)
 * porque asi se ejercita EXACTAMENTE el camino de datos de la app (`design.md > 7`:
 * Prisma es el unico camino) y porque `$executeRaw` dentro de la misma transaccion
 * sigue usando la misma conexion, asi que el SQL crudo comparte el aislamiento.
 *
 * ORDEN DE BORRADO — las tres FK de `memberships` son `ON DELETE RESTRICT`, asi que
 * ningun caso puede borrar un usuario, una empresa o un rol sin borrar antes sus
 * pertenencias. Los pocos casos que borran de verdad (un rol sin pertenencias) lo hacen
 * en ese orden a proposito; los que esperan el rechazo NO borran nada, y por eso pueden
 * afirmar que las filas quedan intactas (R11).
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y
 * varios requisitos exigen comprobar el estado DESPUES del rechazo ("conserva el
 * usuario existente sin modificar"). Por eso toda operacion que se espera que falle se
 * envuelve en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que deja la
 * transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — las altas que se espera que fallen se hacen con `$executeRaw` a
 * proposito: (1) omitir una columna obligatoria o apuntar a una FK inexistente no se
 * puede expresar con la API tipada de Prisma (no compilaria), y (2) el mensaje de
 * Postgres llega literal (SQLSTATE + nombre del indice o de la FK), asi que el test
 * afirma sobre la restriccion concreta y no sobre "algo fallo". Los caminos felices y
 * las lecturas van con la API tipada.
 *
 * CONTRASENA — solo se rellena `password_hash` con una cadena cualquiera. El hashing es
 * la feature 2 (`design.md > 6`); aqui la unica propiedad que importa es que la columna
 * acepta texto de longitud arbitraria (R12 de QC-4).
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'
import { DOCUMENT_TYPE_CC, normalizeCompanyName } from '@/lib/modules/identity'

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
 * indices los vigilan los tests de esquema sobre el SQL de las migraciones.
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
 * Sufijo irrepetible para nombres de empresa. Se usa el uuid SIN guiones porque
 * `normalizeCompanyName` elimina todo lo que no sea `[a-z0-9]`: asi el sufijo sobrevive
 * entero a la normalizacion y dos empresas distintas normalizan distinto, salvo cuando
 * el caso lo busca a proposito.
 */
function uniqueCompanySuffix(): string {
  return randomUUID().replace(/-/gu, '')
}

/** Crea una empresa viva con su nombre normalizado calculado por el dominio (R3). */
function createCompany(
  tx: Prisma.TransactionClient,
  name = `Empresa ${uniqueCompanySuffix()}`,
): Promise<{ id: string; name: string }> {
  return tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true, name: true },
  })
}

interface UserSeed {
  readonly email: string
  readonly username: string
  readonly documentNumber: string
  readonly documentTypeCode?: string
  readonly passwordHash?: string
}

/**
 * Alta de usuario. QC-47: NO recibe rol — `users` ya no tiene columna de rol (R14). Quien
 * necesite un rol para esa persona crea ademas empresa y pertenencia (`createMembership`).
 */
function createUser(tx: Prisma.TransactionClient, seed: UserSeed): Promise<{ id: string }> {
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
    },
    select: { id: true },
  })
}

interface MembershipSeed {
  readonly userId: string
  readonly companyId: string
  readonly roleId: string
}

/** Pertenencia: la persona, la empresa y el rol QUE TIENE EN ESA EMPRESA (R7). */
function createMembership(
  tx: Prisma.TransactionClient,
  seed: MembershipSeed,
): Promise<{ id: string }> {
  return tx.membership.create({ data: { ...seed }, select: { id: true } })
}

/** Las nueve columnas de negocio de R1 de QC-4 (todas obligatorias por su R2). */
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
 * QC-47: ya no hay `role_id` que escribir aqui (R14).
 */
function rawInsertUser(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<RequiredUserColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [RequiredUserColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  return tx.$executeRaw`INSERT INTO "users" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/**
 * `INSERT INTO companies` crudo: el choque contra `companies_name_unique` llega asi con su
 * SQLSTATE literal. `name_normalized` lo calcula SIEMPRE `normalizeCompanyName`, que es la
 * unica definicion de la normalizacion (R3).
 */
function rawInsertCompany(tx: Prisma.TransactionClient, name: string): Promise<number> {
  return tx.$executeRaw`INSERT INTO "companies" ("name", "name_normalized", "updated_at")
                        VALUES (${name}, ${normalizeCompanyName(name)}, CURRENT_TIMESTAMP)`
}

/**
 * `INSERT INTO memberships` crudo. Permite apuntar a un usuario, una empresa o un rol que
 * NO existen —imposible de expresar con la API tipada— y por eso es el camino de R10.
 */
function rawInsertMembership(tx: Prisma.TransactionClient, seed: MembershipSeed): Promise<number> {
  return tx.$executeRaw`INSERT INTO "memberships" ("user_id", "company_id", "role_id", "updated_at")
                        VALUES (CAST(${seed.userId} AS uuid),
                                CAST(${seed.companyId} AS uuid),
                                CAST(${seed.roleId} AS uuid),
                                CURRENT_TIMESTAMP)`
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
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'roles', 'document_types', 'companies', 'memberships')`
  if (tables.length !== 5) {
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de identidad (QC-4 + QC-47). ' +
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
      const { id } = await createUser(tx, {
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
      expect(user.deletedAt).toBeNull()
      // R3 de QC-4: identificador propio, no derivado de los datos de negocio.
      expect(user.id).toMatch(/^[0-9a-f-]{36}$/u)
      // QC-47 R14: la ficha de la persona ya no tiene rol. El alta de arriba se hizo sin
      // ninguno y es valida; ademas la fila no trae ninguna columna de rol.
      expect(Object.keys(user)).not.toContain('roleId')

      // R12 de QC-4: la columna no impone longitud maxima. 10.000 caracteres entran
      // enteros, asi que la feature 2 puede elegir bcrypt (~60), argon2id (~100) o lo
      // que sea.
      const longHash = 'x'.repeat(10_000)
      const { id: otherId } = await createUser(tx, {
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
      const { id: originalId } = await createUser(tx, {
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
      const documentNumber = '555000111'
      const complete = userSqlValues({
        email: 'falta@example.com',
        username: 'falta',
        documentNumber,
      })

      for (const omitted of REQUIRED_USER_COLUMNS) {
        const partial: Partial<Record<RequiredUserColumn, Prisma.Sql>> = { ...complete }
        delete partial[omitted]

        // La columna que falta la sabemos por construccion: cada vuelta omite una y
        // solo una, incluidas `phone` y `birth_date`, que el humano cerro como
        // obligatorias el 2026-08-06.
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertUser(tx, partial),
          `alta de usuario sin "${omitted}"`,
        )
        expect(sqlState, `omitiendo "${omitted}"`).toBe(NOT_NULL_VIOLATION)
        // "no crear ninguna fila": tras cada rechazo no queda ninguna fila DE ESTE CASO.
        // Se acota por el documento —irrepetible dentro del test y escrito por el INSERT
        // crudo— porque `roleId`, que era el acotador de QC-4, ya no existe (R14).
        expect(await tx.user.count({ where: { documentNumber } })).toBe(0)
      }
    })
  })
})

describe('unicidad de correo, nombre de usuario y documento', () => {
  it('rechaza un correo repetido exacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
          ),
        'segundo usuario con el mismo correo',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({
        where: { documentNumber: { in: ['111000111', '222000222'] } },
        select: { id: true, email: true },
      })
      expect(survivors).toEqual([{ id, email: 'ana.perez@example.com' }])
    })
  })

  it('rechaza un correo repetido aunque cambie el uso de mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
          ),
        'segundo usuario con el mismo correo en otras mayusculas',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // El usuario existente se conserva SIN MODIFICAR, con su correo tal como se tecleo.
      const survivors = await tx.user.findMany({
        where: { documentNumber: { in: ['111000111', '222000222'] } },
        select: { id: true, email: true },
      })
      expect(survivors).toEqual([{ id, email: 'Ana.Perez@Example.com' }])
    })
  })

  it('rechaza un nombre de usuario repetido exacto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
          ),
        'segundo usuario con el mismo nombre de usuario',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({
        where: { documentNumber: { in: ['111000111', '222000222'] } },
        select: { id: true, username: true },
      })
      expect(survivors).toEqual([{ id, username: 'anaperez' }])
    })
  })

  it('rechaza un nombre de usuario repetido aunque cambie el uso de mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
          ),
        'segundo usuario con el mismo nombre de usuario en otras mayusculas',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({
        where: { documentNumber: { in: ['111000111', '222000222'] } },
        select: { id: true, username: true },
      })
      expect(survivors).toEqual([{ id, username: 'AnaPerez' }])
    })
  })

  it('rechaza el mismo tipo y numero de documento repetidos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
          ),
        'segundo usuario con el mismo tipo y numero de documento',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const survivors = await tx.user.findMany({
        where: { documentNumber: '1030555777' },
        select: { id: true, documentTypeCode: true, documentNumber: true },
      })
      expect(survivors).toEqual([
        { id, documentTypeCode: DOCUMENT_TYPE_CC, documentNumber: '1030555777' },
      ])
    })
  })

  it('acepta el mismo numero de documento con tipo distinto', async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.documentType.create({ data: { code: 'TI', name: 'Tarjeta de identidad' } })

      await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      })
      await createUser(tx, {
        email: 'otra@example.com',
        username: 'otra',
        documentNumber: '1030555777',
        documentTypeCode: 'TI',
      })

      const users = await tx.user.findMany({
        where: { documentNumber: '1030555777' },
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
      const documentNumber = '111000111'

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertUser(
            tx,
            userSqlValues({
              email: 'ana@example.com',
              username: 'anaperez',
              documentNumber,
              documentTypeCode: 'PASAPORTE_MARCIANO',
            }),
          ),
        'alta con un tipo de documento que no esta en el catalogo',
      )
      // 23503 = foreign_key_violation: la FK es quien cierra el conjunto (design.md > 3).
      // Desde QC-47 el tipo de documento es la UNICA FK de `users`, asi que no hay ninguna
      // otra que pueda disparar este codigo.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(await tx.user.count({ where: { documentNumber } })).toBe(0)
    })
  })

  it('el catalogo arranca solo con CC', async () => {
    await inRolledBackTransaction(async (tx) => {
      const types = await tx.documentType.findMany({ orderBy: { code: 'asc' } })
      expect(types.map((type) => type.code)).toEqual([DOCUMENT_TYPE_CC])
      expect(types[0]?.name).toBe('Cedula de ciudadania')
      expect(types[0]?.isActive).toBe(true)
    })
  })

  it('anadir un tipo nuevo deja intactos los usuarios ya guardados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
      const { id: newId } = await createUser(tx, {
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

  it('acepta varias personas con el mismo rol en la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const company = await createCompany(tx)
      for (const n of [1, 2, 3, 4, 5]) {
        const { id: userId } = await createUser(tx, {
          email: `usuario${String(n)}@example.com`,
          username: `usuario${String(n)}`,
          documentNumber: `10000000${String(n)}`,
        })
        await createMembership(tx, { userId, companyId: company.id, roleId })
      }

      // El rol ya no cuelga de `users`: a las personas de un rol se llega por la
      // pertenencia (R14, R15).
      const role = await tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: {
          memberships: {
            select: { user: { select: { username: true } } },
            orderBy: { user: { username: 'asc' } },
          },
        },
      })
      expect(role.memberships).toHaveLength(5)
      expect(role.memberships.every((row) => row.user.username.startsWith('usuario'))).toBe(true)
    })
  })

  it('permite borrar un rol sin pertenencias', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx, 'rol-huerfano')
      expect(await tx.membership.count({ where: { roleId } })).toBe(0)

      await tx.role.delete({ where: { id: roleId } })

      expect(await tx.role.findUnique({ where: { id: roleId } })).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// QC-47 — la empresa
// ---------------------------------------------------------------------------

describe('unicidad del nombre de empresa', () => {
  it('rechaza una segunda empresa con el mismo nombre en otras mayusculas y con acentos', async () => {
    await inRolledBackTransaction(async (tx) => {
      // El literal del nombre de la empresa INICIAL no se escribe aqui a proposito: el
      // unico sitio del repo que lo escribe es `identity/domain/companies.ts` (R20). Este
      // caso usa un nombre inventado e irrepetible, que es lo que R4 necesita.
      const suffix = uniqueCompanySuffix()
      const original = `Química Andína ${suffix}`
      // El mismo nombre "para la base": cambian mayusculas, acentos y separadores, y los
      // tres los borra `normalizeCompanyName`. Se comprueba PRIMERO que normalizan igual;
      // si no lo hicieran, el 23505 de abajo estaria probando otra cosa.
      const repeated = `QUIMICA-ANDINA_${suffix.toUpperCase()}`
      expect(normalizeCompanyName(repeated)).toBe(normalizeCompanyName(original))

      const company = await createCompany(tx, original)
      const stored = await tx.company.findUniqueOrThrow({ where: { id: company.id } })
      expect(stored.name).toBe(original)
      expect(stored.nameNormalized).toBe(normalizeCompanyName(original))
      expect(stored.deletedAt).toBeNull()

      // Solo el nombre normalizado coincide, asi que la unica restriccion que puede
      // disparar 23505 es `companies_name_unique` —funcional sobre
      // `lower(name_normalized)` y parcial (`WHERE deleted_at IS NULL`)—, escrito a mano
      // en la migracion. Es la UNICA garantia de R4: no hay `SELECT` previo por igualdad,
      // que seria una carrera.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertCompany(tx, repeated),
        'segunda empresa con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // "no crear ni modificar ninguna fila": queda solo la primera, con su nombre tal
      // como se tecleo, acentos y mayusculas incluidos.
      const survivors = await tx.company.findMany({
        where: { nameNormalized: normalizeCompanyName(original) },
        select: { id: true, name: true },
      })
      expect(survivors).toEqual([{ id: company.id, name: original }])
    })
  })
})

// ---------------------------------------------------------------------------
// QC-47 — la pertenencia
// ---------------------------------------------------------------------------

describe('pertenencia de una persona a una empresa', () => {
  it('rechaza una segunda pertenencia de la misma persona a la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const otherRoleId = await createRole(tx, 'otro-rol')
      const company = await createCompany(tx)
      const { id: userId } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const membership = await createMembership(tx, { userId, companyId: company.id, roleId })

      // Lo unico que coincide es la pareja (usuario, empresa); el rol es OTRO, para que el
      // caso demuestre que quien decide es la pareja y no el rol. La unica restriccion que
      // puede disparar 23505 es `memberships_user_id_company_id_key` (R9).
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsertMembership(tx, { userId, companyId: company.id, roleId: otherRoleId }),
        'segunda pertenencia de la misma persona a la misma empresa',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // "no crear ni modificar ninguna fila": sigue habiendo una sola, con su rol original.
      const survivors = await tx.membership.findMany({
        where: { userId },
        select: { id: true, companyId: true, roleId: true },
      })
      expect(survivors).toEqual([{ id: membership.id, companyId: company.id, roleId }])
    })
  })

  it('acepta que la misma persona pertenezca a dos empresas con un rol distinto en cada una', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Contracara de R9 y prueba de que el unico no es demasiado estricto: es de la
      // PAREJA, no del usuario. Si fuera del usuario, R8 seria imposible desde el dia uno.
      const almacenista = await createRole(tx, 'almacenista')
      const supervisor = await createRole(tx, 'supervisor')
      const primera = await createCompany(tx)
      const segunda = await createCompany(tx)
      const { id: userId } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      await createMembership(tx, { userId, companyId: primera.id, roleId: almacenista })
      await createMembership(tx, { userId, companyId: segunda.id, roleId: supervisor })

      const rows = await tx.membership.findMany({
        where: { userId },
        select: { companyId: true, roleId: true },
      })
      expect(rows).toHaveLength(2)
      // Cada empresa aporta exactamente un rol, y son distintos entre si.
      expect(new Map(rows.map((row) => [row.companyId, row.roleId]))).toEqual(
        new Map([
          [primera.id, almacenista],
          [segunda.id, supervisor],
        ]),
      )
    })
  })

  it('rechaza una pertenencia con persona, empresa o rol inexistentes', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const company = await createCompany(tx)
      const { id: userId } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })

      // Los tres casos de R10. En cada uno solo UNA de las tres referencias es inventada y
      // las otras dos existen, asi que la FK que falla se sabe por construccion:
      // `memberships_user_id_fkey`, `memberships_company_id_fkey` y
      // `memberships_role_id_fkey`, respectivamente.
      const casos = [
        { que: 'persona', seed: { userId: randomUUID(), companyId: company.id, roleId } },
        { que: 'empresa', seed: { userId, companyId: randomUUID(), roleId } },
        { que: 'rol', seed: { userId, companyId: company.id, roleId: randomUUID() } },
      ] as const

      for (const caso of casos) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertMembership(tx, caso.seed),
          `pertenencia con ${caso.que} inexistente`,
        )
        expect(sqlState, `con ${caso.que} inexistente`).toBe(FOREIGN_KEY_VIOLATION)
        // "no crear ni modificar ninguna fila": ni una pertenencia en toda la escena.
        expect(
          await tx.membership.count({
            where: { OR: [{ userId }, { companyId: company.id }, { roleId }] },
          }),
        ).toBe(0)
      }
    })
  })

  it('rechaza borrar la empresa, el rol o la persona de una pertenencia, y las filas quedan intactas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const company = await createCompany(tx)
      const { id: userId } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const membership = await createMembership(tx, { userId, companyId: company.id, roleId })
      const before = await tx.membership.findUniqueOrThrow({ where: { id: membership.id } })

      // R11 — `ON DELETE RESTRICT` de `memberships_company_id_fkey`. Se borra con SQL
      // crudo y NO se borra antes la pertenencia: el orden que imponen las FK es justo lo
      // que este caso comprueba que la base hace cumplir.
      const borrandoEmpresa = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "companies" WHERE "id" = CAST(${company.id} AS uuid)`,
        'borrado de una empresa con pertenencias',
      )
      expect(borrandoEmpresa).toBe(FOREIGN_KEY_VIOLATION)

      // R11 — `ON DELETE RESTRICT` de `memberships_role_id_fkey`.
      const borrandoRol = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "roles" WHERE "id" = CAST(${roleId} AS uuid)`,
        'borrado de un rol con pertenencias',
      )
      expect(borrandoRol).toBe(FOREIGN_KEY_VIOLATION)

      // R11 — y la tercera: `memberships_user_id_fkey`. Borrar a la persona tampoco.
      const borrandoPersona = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "users" WHERE "id" = CAST(${userId} AS uuid)`,
        'borrado de una persona con pertenencias',
      )
      expect(borrandoPersona).toBe(FOREIGN_KEY_VIOLATION)

      // "conservar las tres filas intactas": las tres siguen ahi y la pertenencia no
      // cambio en nada, ni siquiera en `updated_at`.
      expect(await tx.company.findUnique({ where: { id: company.id } })).not.toBeNull()
      expect(await tx.role.findUnique({ where: { id: roleId } })).not.toBeNull()
      expect(await tx.user.findUnique({ where: { id: userId } })).not.toBeNull()
      expect(await tx.membership.findUniqueOrThrow({ where: { id: membership.id } })).toEqual(before)
    })
  })

  it('rechaza borrar un rol cuya unica persona esta borrada logicamente', async () => {
    await inRolledBackTransaction(async (tx) => {
      const roleId = await createRole(tx)
      const company = await createCompany(tx)
      const { id: userId } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      await createMembership(tx, { userId, companyId: company.id, roleId })
      await softDelete(tx, userId)

      // La FK no sabe nada de `deleted_at`: la pertenencia de una persona borrada
      // logicamente SIGUE contando, y es deliberado (design.md > 2.4 de QC-4). Es tambien
      // la razon por la que el backfill de QC-47 mete a los usuarios de baja: sin su
      // pertenencia, el `down.sql` no podria devolverles el `role_id`, que es NOT NULL.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "roles" WHERE "id" = CAST(${roleId} AS uuid)`,
        'borrado de un rol cuya unica persona esta borrada logicamente',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.role.findUnique({ where: { id: roleId } })).not.toBeNull()
      const kept = await tx.membership.findFirstOrThrow({ where: { userId } })
      expect(kept.roleId).toBe(roleId)
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      expect(user.deletedAt).not.toBeNull()
    })
  })
})

describe('borrado logico y marcas de tiempo', () => {
  it('el borrado logico conserva la fila y marca deleted_at', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await createUser(tx, {
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
      const seed = {
        email: 'Ana.Perez@Example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      }
      const { id: oldId } = await createUser(tx, seed)
      await softDelete(tx, oldId)

      const { id: newId } = await createUser(tx, seed)
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
      const seed = {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '1030555777',
      }

      const { id: first } = await createUser(tx, seed)
      await softDelete(tx, first)
      const { id: second } = await createUser(tx, seed)
      await softDelete(tx, second)
      // Y todavia se puede dar de alta un tercero vivo con los mismos valores.
      const { id: third } = await createUser(tx, seed)

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
      // el `@updatedAt` de Prisma. Vale igual para las dos tablas nuevas de QC-47 (R6):
      // la empresa y la pertenencia que se crean aqui tampoco los reciben.
      const role = await tx.role.create({
        data: { name: uniqueRoleName('rol'), description: 'Rol de prueba' },
      })
      expect(role.createdAt).toBeInstanceOf(Date)
      expect(role.updatedAt).toBeInstanceOf(Date)

      const { id } = await createUser(tx, {
        email: 'ana@example.com',
        username: 'anaperez',
        documentNumber: '111000111',
      })
      const created = await tx.user.findUniqueOrThrow({ where: { id } })
      expect(created.createdAt).toBeInstanceOf(Date)
      expect(created.updatedAt).toBeInstanceOf(Date)

      const company = await createCompany(tx)
      await createMembership(tx, { userId: id, companyId: company.id, roleId: role.id })
      const storedCompany = await tx.company.findUniqueOrThrow({ where: { id: company.id } })
      expect(storedCompany.createdAt).toBeInstanceOf(Date)
      expect(storedCompany.updatedAt).toBeInstanceOf(Date)
      const storedMembership = await tx.membership.findFirstOrThrow({ where: { userId: id } })
      expect(storedMembership.createdAt).toBeInstanceOf(Date)
      expect(storedMembership.updatedAt).toBeInstanceOf(Date)

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

      await sleep(20)
      const updatedCompany = await tx.company.update({
        where: { id: company.id },
        data: { name: `${storedCompany.name} S.A.` },
      })
      expect(updatedCompany.createdAt.getTime()).toBe(storedCompany.createdAt.getTime())
      expect(updatedCompany.updatedAt.getTime()).toBeGreaterThan(storedCompany.updatedAt.getTime())
    })
  })
})
