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
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'
import { DOCUMENT_TYPE_CC } from '@/lib/modules/identity'

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

interface UserSeed {
  readonly email: string
  readonly username: string
  readonly documentNumber: string
  readonly documentTypeCode?: string
  readonly passwordHash?: string
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
function rawInsertUser(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<RequiredUserColumn, Prisma.Sql>>,
  roleId: string | null,
): Promise<number> {
  const entries = Object.entries(columns) as [RequiredUserColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  if (roleId !== null) {
    names.push(Prisma.raw('"role_id"'))
    values.push(Prisma.sql`CAST(${roleId} AS uuid)`)
  }
  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  return tx.$executeRaw`INSERT INTO "users" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
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
    WHERE schemaname = 'public' AND tablename IN ('users', 'roles', 'document_types')`
  if (tables.length !== 3) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de la feature 1. ' +
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
