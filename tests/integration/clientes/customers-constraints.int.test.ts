/**
 * Tests de integracion de QC-153 (modelo-de-clientes) contra una base Postgres REAL, con la
 * migracion `20260924120000_customers` aplicada.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina lanzando
 * `RollbackSignal`, que hace que Prisma emita `ROLLBACK`. Toda operacion que se espera que falle
 * se envuelve en un `SAVEPOINT`, mismo patron que `tests/integration/proveedores/proveedores-constraints.int.test.ts`.
 *
 * NINGUNA AFIRMACION GLOBAL — cada test mira solo las filas que el mismo sembro.
 *
 * SQL CRUDO — toda operacion que se espera que la base rechace, o que omite una columna
 * obligatoria, va con `$executeRaw`: la API tipada no deja ni compilar una omision, y solo el
 * crudo propaga el SQLSTATE en `meta.code`.
 *
 * Cubre R2, R3, R5-R17.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

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

const NOT_NULL_VIOLATION = '23502'
const FOREIGN_KEY_VIOLATION = '23503'

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

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<string> {
  savepointSeq += 1
  const savepoint = `qc153_sp_${String(savepointSeq)}`
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

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

async function createCompany(tx: Prisma.TransactionClient): Promise<string> {
  const name = `Empresa ${token()}`
  const company = await tx.company.create({
    data: { name, nameNormalized: normalizeCompanyName(name) },
    select: { id: true },
  })
  return company.id
}

async function createUser(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const marker = token()
  const documentType = await tx.documentType.create({
    data: { code: `DOC${marker.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
    select: { code: true },
  })
  const role = await tx.role.create({
    data: { name: `rol-${marker}`, description: 'Rol de prueba' },
    select: { id: true },
  })
  const user = await tx.user.create({
    data: {
      firstNames: 'Ana Maria',
      lastNames: 'Perez Gomez',
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      email: `ana.${marker}@quimicloude.test`,
      phone: '+57 300 111 2233',
      documentTypeCode: documentType.code,
      documentNumber: marker.slice(0, 12),
      username: `ana.${marker}`,
      passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
      roleId: role.id,
      companyId,
    },
    select: { id: true },
  })
  return user.id
}

function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

type CustomerColumn =
  | 'first_names'
  | 'last_names'
  | 'city'
  | 'phone'
  | 'email'
  | 'address'
  | 'company_id'
  | 'created_by'
  | 'updated_by'

function rawInsertCustomer(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<CustomerColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [CustomerColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)
  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)
  return tx.$executeRaw`INSERT INTO "customers" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

interface ColumnInfo {
  readonly column_name: string
  readonly data_type: string
  readonly is_nullable: string
}

function columnInfo(
  tx: Prisma.TransactionClient,
  table: string,
  columns: readonly string[],
): Promise<ColumnInfo[]> {
  return tx.$queryRaw<ColumnInfo[]>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name IN (${Prisma.join([...columns])})
    ORDER BY column_name`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion 20260924120000_customers. ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('datos del cliente (R1-R6)', () => {
  it('crea un cliente con los seis datos de R1 y lo relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const marker = token()

      const created = await tx.customer.create({
        data: {
          firstNames: 'Maria Jose',
          lastNames: `Rodriguez ${marker}`,
          city: 'Bogota',
          phone: '+57 300 111 2233',
          email: `maria.${marker}@cliente.test`,
          address: 'Calle 10 # 5-20',
          companyId,
        },
        select: { id: true },
      })
      expect(created.id).toMatch(UUID_SHAPE)

      const customer = await tx.customer.findUniqueOrThrow({ where: { id: created.id } })
      expect(customer.firstNames).toBe('Maria Jose')
      expect(customer.lastNames).toBe(`Rodriguez ${marker}`)
      expect(customer.city).toBe('Bogota')
      expect(customer.phone).toBe('+57 300 111 2233')
      expect(customer.email).toBe(`maria.${marker}@cliente.test`)
      expect(customer.address).toBe('Calle 10 # 5-20')
      expect(customer.deletedAt).toBeNull()
    })
  })

  it('rechaza con 23502 un cliente sin nombres, sin apellidos o sin ciudad, en INSERT y en UPDATE a NULL (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)

      for (const omitida of ['first_names', 'last_names', 'city'] as const) {
        const columnas: Partial<Record<CustomerColumn, Prisma.Sql>> = {
          first_names: Prisma.sql`'Ana'`,
          last_names: Prisma.sql`'Perez'`,
          city: Prisma.sql`'Cali'`,
          company_id: asUuid(companyId),
        }
        delete columnas[omitida]
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertCustomer(tx, columnas),
          `cliente sin ${omitida}`,
        )
        expect(sqlState, `cliente sin ${omitida} deberia caer`).toBe(NOT_NULL_VIOLATION)
      }

      // Y el UPDATE que deja un obligatorio en NULL tambien se rechaza.
      const { id } = await tx.customer.create({
        data: { firstNames: 'Ana', lastNames: 'Perez', city: 'Cali', companyId },
        select: { id: true },
      })
      const sqlStateUpdate = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "customers" SET "city" = NULL WHERE "id" = ${asUuid(id)}`,
        'update que deja la ciudad en NULL',
      )
      expect(sqlStateUpdate).toBe(NOT_NULL_VIOLATION)
      const afterReject = await tx.customer.findUniqueOrThrow({ where: { id }, select: { city: true } })
      expect(afterReject.city).toBe('Cali')

      expect(await tx.customer.count({ where: { companyId } })).toBe(1)
    })
  })

  it('acepta cualquier combinacion de telefono, correo y direccion ausentes, incluidos los tres (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)

      const sinNinguno = await tx.customer.create({
        data: { firstNames: 'Sin', lastNames: 'Contacto', city: 'Medellin', companyId },
        select: { id: true },
      })
      const leido = await tx.customer.findUniqueOrThrow({ where: { id: sinNinguno.id } })
      expect(leido.phone).toBeNull()
      expect(leido.email).toBeNull()
      expect(leido.address).toBeNull()

      const conTelefonoSolo = await tx.customer.create({
        data: {
          firstNames: 'Con',
          lastNames: 'Telefono',
          city: 'Medellin',
          phone: '+57 300 555 6677',
          companyId,
        },
        select: { id: true },
      })
      const leido2 = await tx.customer.findUniqueOrThrow({ where: { id: conTelefonoSolo.id } })
      expect(leido2.phone).toBe('+57 300 555 6677')
      expect(leido2.email).toBeNull()
      expect(leido2.address).toBeNull()
    })
  })

  it('acepta textos de 10000 caracteres sin rechazo por longitud (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const largo = 'a'.repeat(10_000)

      const { id } = await tx.customer.create({
        data: { firstNames: largo, lastNames: largo, city: largo, phone: largo, email: largo, address: largo, companyId },
        select: { id: true },
      })
      const customer = await tx.customer.findUniqueOrThrow({ where: { id } })
      expect(customer.firstNames).toHaveLength(10_000)
      expect(customer.address).toHaveLength(10_000)

      const columns = await columnInfo(tx, 'customers', ['first_names', 'email'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['email', 'text'],
        ['first_names', 'text'],
      ])
    })
  })

  it('acepta un correo sin forma de correo y un telefono con cualquier texto (R6)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const { id } = await tx.customer.create({
        data: {
          firstNames: 'Correo',
          lastNames: 'Raro',
          city: 'Cali',
          email: 'no-es-un-correo',
          phone: 'abc',
          companyId,
        },
        select: { id: true },
      })
      const customer = await tx.customer.findUniqueOrThrow({ where: { id } })
      expect(customer.email).toBe('no-es-un-correo')
      expect(customer.phone).toBe('abc')
    })
  })
})

describe('duplicados (R7)', () => {
  it('acepta dos clientes vivos de la misma empresa con exactamente los mismos seis datos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const data = {
        firstNames: 'Juan',
        lastNames: 'Gomez',
        city: 'Bogota',
        phone: '+57 300 999 0000',
        email: 'juan.gomez@cliente.test',
        address: 'Av Siempre Viva 123',
        companyId,
      }
      const first = await tx.customer.create({ data, select: { id: true } })
      const second = await tx.customer.create({ data, select: { id: true } })
      expect(first.id).not.toBe(second.id)
      expect(await tx.customer.count({ where: { companyId } })).toBe(2)
    })
  })
})

describe('empresa (R8, R9, R10)', () => {
  it('rechaza un cliente sin empresa (23502) y con una empresa inexistente (23503)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const sinEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertCustomer(tx, {
            first_names: Prisma.sql`'Sin'`,
            last_names: Prisma.sql`'Empresa'`,
            city: Prisma.sql`'Cali'`,
          }),
        'cliente sin empresa',
      )
      expect(sinEmpresa).toBe(NOT_NULL_VIOLATION)

      const empresaFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertCustomer(tx, {
            first_names: Prisma.sql`'Con'`,
            last_names: Prisma.sql`'Fantasma'`,
            city: Prisma.sql`'Cali'`,
            company_id: asUuid(randomUUID()),
          }),
        'cliente con empresa inexistente',
      )
      expect(empresaFantasma).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('rechaza el borrado fisico de una empresa que tiene al menos un cliente, incluso dado de baja (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const { id } = await tx.customer.create({
        data: { firstNames: 'Con', lastNames: 'Baja', city: 'Cali', companyId },
        select: { id: true },
      })
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "companies" WHERE "id" = ${asUuid(companyId)}`,
        'borrado de una empresa con un cliente dado de baja',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('la clave candidata (company_id, id) rechaza a un hijo que declara otra empresa (R10)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyA = await createCompany(tx)
      const companyB = await createCompany(tx)
      const { id: customerId } = await tx.customer.create({
        data: { firstNames: 'De', lastNames: 'CompanyA', city: 'Cali', companyId: companyA },
        select: { id: true },
      })

      // Postgres no permite que una tabla TEMPORAL declare una FK hacia una tabla permanente
      // (`42P16`), asi que se crea una tabla normal: al vivir DENTRO de esta transaccion
      // revertida, el `CREATE TABLE` se deshace igual que cualquier otro DDL con el ROLLBACK.
      await tx.$executeRawUnsafe(`
        CREATE TABLE qc153_customer_child (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID NOT NULL,
          customer_id UUID NOT NULL,
          FOREIGN KEY (company_id, customer_id) REFERENCES customers(company_id, id)
        )`)

      // Misma empresa: entra sin problema.
      await tx.$executeRaw`
        INSERT INTO qc153_customer_child (company_id, customer_id)
        VALUES (${asUuid(companyA)}, ${asUuid(customerId)})`

      // Empresa distinta de la del cliente: rechazada por la clave candidata.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`
            INSERT INTO qc153_customer_child (company_id, customer_id)
            VALUES (${asUuid(companyB)}, ${asUuid(customerId)})`,
        'hijo con empresa distinta de la del cliente',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('escalares sin @relation, pero con FK reales (R11)', () => {
  it('las tres FK existen en pg_constraint, y el cliente Prisma no expone relacion navegable', async () => {
    await inRolledBackTransaction(async (tx) => {
      const constraints = await tx.$queryRaw<{ conname: string; confrelid: string }[]>`
        SELECT c.conname, t.relname AS confrelid
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.confrelid
        WHERE c.conrelid = 'customers'::regclass AND c.contype = 'f'
        ORDER BY c.conname`
      expect(constraints).toEqual([
        { conname: 'customers_company_id_fkey', confrelid: 'companies' },
        { conname: 'customers_created_by_fkey', confrelid: 'users' },
        { conname: 'customers_updated_by_fkey', confrelid: 'users' },
      ])

      const companyId = await createCompany(tx)
      const created = await tx.customer.create({
        data: { firstNames: 'Sin', lastNames: 'Relacion', city: 'Cali', companyId },
      })
      // El objeto leido no expone ninguna propiedad "company" ni "createdByUser" navegable:
      // solo el escalar `companyId`.
      expect('company' in created).toBe(false)
      expect('createdByUser' in created).toBe(false)
    })
  })
})

describe('auditoria (R12, R13)', () => {
  it('acepta un cliente sin autor, registra autor y editor, y rechaza un autor inexistente (23503)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const autor = await createUser(tx, companyId)
      const editor = await createUser(tx, companyId)

      const sinAutor = await tx.customer.create({
        data: { firstNames: 'Sin', lastNames: 'Autor', city: 'Cali', companyId },
        select: { id: true },
      })
      const sinAutorRow = await tx.customer.findUniqueOrThrow({
        where: { id: sinAutor.id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(sinAutorRow.createdBy).toBeNull()
      expect(sinAutorRow.updatedBy).toBeNull()

      const conAutor = await tx.customer.create({
        data: { firstNames: 'Con', lastNames: 'Autor', city: 'Cali', companyId, createdBy: autor, updatedBy: autor },
        select: { id: true },
      })
      await tx.customer.update({ where: { id: conAutor.id }, data: { updatedBy: editor } })
      const conAutorRow = await tx.customer.findUniqueOrThrow({
        where: { id: conAutor.id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(conAutorRow.createdBy).toBe(autor)
      expect(conAutorRow.updatedBy).toBe(editor)

      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertCustomer(tx, {
            first_names: Prisma.sql`'Con'`,
            last_names: Prisma.sql`'Fantasma'`,
            city: Prisma.sql`'Cali'`,
            company_id: asUuid(companyId),
            created_by: asUuid(randomUUID()),
          }),
        'cliente con autor inexistente',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('rechaza el borrado fisico de un usuario que figura como creador o editor de un cliente (R13)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const autor = await createUser(tx, companyId)
      await tx.customer.create({
        data: { firstNames: 'Con', lastNames: 'Autor', city: 'Cali', companyId, createdBy: autor },
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "users" WHERE "id" = ${asUuid(autor)}`,
        'borrado de un usuario que figura como autor de un cliente',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // Y la autoria sigue intacta: no se convirtio en NULL.
      const customer = await tx.customer.findFirstOrThrow({
        where: { companyId },
        select: { createdBy: true },
      })
      expect(customer.createdBy).toBe(autor)
    })
  })
})

describe('baja, marcas de tiempo y forma de la tabla (R14, R15, R16, R17)', () => {
  it('la baja conserva la fila completa y marca deleted_at, sin ninguna otra columna de estado (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const { id } = await tx.customer.create({
        data: {
          firstNames: 'A',
          lastNames: 'Dar de baja',
          city: 'Cali',
          phone: '+57 300 000 1111',
          email: 'baja@cliente.test',
          address: 'Calle Baja 1',
          companyId,
        },
        select: { id: true },
      })
      const antes = new Date()
      await tx.customer.update({ where: { id }, data: { deletedAt: new Date() } })

      const customer = await tx.customer.findUniqueOrThrow({ where: { id } })
      expect(customer.deletedAt).toBeInstanceOf(Date)
      expect(customer.deletedAt?.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000)
      expect(customer.firstNames).toBe('A')
      expect(customer.lastNames).toBe('Dar de baja')
      expect(customer.city).toBe('Cali')
      expect(customer.phone).toBe('+57 300 000 1111')
      expect(customer.email).toBe('baja@cliente.test')
      expect(customer.address).toBe('Calle Baja 1')

      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
          AND column_name IN ('is_active', 'active', 'status', 'state', 'enabled')`
      expect(columnas).toEqual([])
    })
  })

  it('updated_at crece tras un update, y created_at no cambia (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const companyId = await createCompany(tx)
      const { id } = await tx.customer.create({
        data: { firstNames: 'Marca', lastNames: 'Tiempo', city: 'Cali', companyId },
        select: { id: true },
      })
      const antes = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      await sleep(20)
      await tx.customer.update({ where: { id }, data: { city: 'Medellin' } })
      const despues = await tx.customer.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(despues.createdAt.getTime()).toBe(antes.createdAt.getTime())
      expect(despues.updatedAt.getTime()).toBeGreaterThan(antes.updatedAt.getTime())
    })
  })

  it('la tabla y sus columnas estan en snake_case ingles (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const columnas = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customers'
        ORDER BY column_name`
      expect(columnas.map((c) => c.column_name)).toEqual([
        'address',
        'city',
        'company_id',
        'created_at',
        'created_by',
        'deleted_at',
        'email',
        'first_names',
        'id',
        'last_names',
        'phone',
        'updated_at',
        'updated_by',
      ])
    })
  })

  it('RLS activada y forzada, sin ninguna policy (R17)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const rls = await tx.$queryRaw<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'customers'`
      expect(rls).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }])

      const policies = await tx.$queryRaw<{ policyname: string }[]>`
        SELECT policyname FROM pg_policies WHERE tablename = 'customers'`
      expect(policies).toEqual([])
    })
  })
})
