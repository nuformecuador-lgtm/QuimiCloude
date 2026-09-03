/**
 * Tests de integracion de QC-42 (modelo-proveedores) contra una base Postgres REAL, con la
 * migracion `20260903131417_suppliers_and_supplier_catalog_lines` aplicada.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila
 * escrita por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un
 * cliente `pg` aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app
 * (Prisma es el unico camino) y porque `$executeRaw` dentro de la misma transaccion
 * reutiliza la conexion, asi que el SQL crudo comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en
 * total»: cada test mira solo las filas que el mismo sembro, localizadas por su `id` o
 * por un marcador irrepetible.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — las cuatro referencias que cruzan de modulo
 * (`supplier_catalog_lines.product_id` -> `products`, `suppliers.created_by` /
 * `updated_by` -> `users`) son FK REALES aunque el esquema Prisma las declare como
 * escalares sin `@relation` (`design.md` seccion 4.1, R22, R24). Por eso cada caso crea
 * dentro de su propia transaccion el tipo de documento, el rol, el usuario y el producto
 * que necesita: no se depende del seed ni del orden de los archivos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * requisitos exigen comprobar el estado DESPUES del rechazo («no crear ninguna fila»).
 * Por eso toda operacion que se espera que falle se envuelve en un `SAVEPOINT` y se
 * deshace con `ROLLBACK TO SAVEPOINT`, que deja la transaccion viva y permite seguir
 * consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con
 * `$executeRaw`, por dos motivos: (1) omitir una columna obligatoria no se puede
 * expresar con la API tipada de Prisma (no compilaria), y (2) solo el raw propaga el
 * SQLSTATE de Postgres en `meta.code`. La API tipada lo traduce a su propio codigo
 * (`P2002`, `P2003`…) y el SQLSTATE se pierde. Se afirma sobre el SQLSTATE y NUNCA sobre
 * el texto: en esta maquina Postgres responde en espanol. Los caminos felices y las
 * lecturas si van con la API tipada, que es el camino real de la app.
 *
 * DECIMALES — `cost` y `minPurchase` se manejan siempre como `Prisma.Decimal` y se
 * comparan con `.toString()` / `.equals()`, o contra el texto de la propia base.
 * Convertirlos a `number` reintroduciria la coma flotante binaria que
 * `docs/architecture.md > Dominio` n.o 4 prohibe.
 *
 * NOMBRE NORMALIZADO — `name_normalized` se escribe LITERAL en cada caso, sin llamar a
 * `normalizeSupplierName`. Lo que aqui se prueba es el indice unico parcial de la base
 * (R7, R9); el algoritmo lo prueba `tests/unit/proveedores/domain/supplier-name.test.ts`.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase,
 * porque Prisma se conecta como dueno de las tablas. R33 se cierra con la guardia
 * estatica sobre el SQL, no aqui.
 *
 * Requisitos cubiertos: R1, R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15,
 * R16, R17, R22, R24, R26, R27, R28, R29, R30, R31.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'

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
const CHECK_VIOLATION = '23514'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test
 * afirma sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el
 * efecto, y cada caso se construye para que solo una restriccion pueda dispararlo.
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
// Datos de apoyo — las FK son reales, asi que cada caso siembra las suyas
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Crea un usuario completo con su tipo de documento y su rol propios. Los nombres y
 * codigos se aleatorizan porque `roles.name` es unico global y `users` tiene indices
 * unicos parciales sobre correo, nombre de usuario y documento (QC-4).
 */
async function createUser(tx: Prisma.TransactionClient): Promise<string> {
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
    },
    select: { id: true },
  })
  return user.id
}

/** Crea un producto con su presentacion propia. `products.name` no es unico (QC-14). */
async function createProduct(
  tx: Prisma.TransactionClient,
  name = 'Acido citrico monohidratado',
): Promise<string> {
  // `presentations.name_normalized` es NOT NULL con INDICE UNICO (QC-20). Se marca con
  // `token()` porque este helper se llama varias veces dentro de la misma transaccion.
  const marca = token()
  const presentation = await tx.presentation.create({
    data: { name: `Bidon 20 L ${marca}`, nameNormalized: `bidon20l${marca}` },
    select: { id: true },
  })
  const product = await tx.product.create({
    data: { name, presentationId: presentation.id },
    select: { id: true },
  })
  return product.id
}

interface SupplierSeed {
  readonly name: string
  readonly nameNormalized: string
  readonly phone?: string | null
  readonly email?: string | null
  readonly createdBy?: string | null
  readonly updatedBy?: string | null
}

/**
 * Crea un proveedor vivo. `nameNormalized` se pasa siempre a mano (ver cabecera): aqui
 * se prueba el indice de la base, no el algoritmo de normalizacion. Por defecto trae
 * telefono para satisfacer el CHECK de contacto sin que cada caso tenga que repetirlo.
 */
async function createSupplier(tx: Prisma.TransactionClient, seed: SupplierSeed): Promise<string> {
  const supplier = await tx.supplier.create({
    data: {
      name: seed.name,
      nameNormalized: seed.nameNormalized,
      phone: seed.phone === undefined ? '+57 300 555 0000' : seed.phone,
      email: seed.email ?? null,
      createdBy: seed.createdBy ?? null,
      updatedBy: seed.updatedBy ?? null,
    },
    select: { id: true },
  })
  return supplier.id
}

/** Crea una linea de catalogo con la API tipada. Devuelve el id para poder releerla. */
async function createLine(
  tx: Prisma.TransactionClient,
  supplierId: string,
  productId: string,
  cost: string,
  extra: { minPurchase?: string; deliveryTime?: number } = {},
): Promise<string> {
  const line = await tx.supplierCatalogLine.create({
    data: {
      supplierId,
      productId,
      cost: new Prisma.Decimal(cost),
      minPurchase: extra.minPurchase === undefined ? null : new Prisma.Decimal(extra.minPurchase),
      deliveryTime: extra.deliveryTime ?? null,
    },
    select: { id: true },
  })
  return line.id
}

/** Columnas que un alta cruda puede escribir en una de las dos tablas de la feature. */
type WritableColumn =
  | 'name'
  | 'name_normalized'
  | 'phone'
  | 'email'
  | 'created_by'
  | 'updated_by'
  | 'supplier_id'
  | 'product_id'
  | 'cost'
  | 'min_purchase'
  | 'delivery_time'

/**
 * `INSERT` crudo. `columns` decide que se escribe: omitir una entrada es exactamente el
 * caso «falta un dato obligatorio», que la API tipada de Prisma no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL sin DEFAULT (lo rellena el cliente
 * Prisma via `@updatedAt`, no la base).
 */
function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'suppliers' | 'supplier_catalog_lines',
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  const target = Prisma.raw(`"${table}"`)
  return tx.$executeRaw`INSERT INTO ${target} (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

/** Valor SQL de un uuid: el parametro llega como texto y hay que castearlo. */
function asUuid(id: string): Prisma.Sql {
  return Prisma.sql`CAST(${id} AS uuid)`
}

interface ColumnInfo {
  readonly column_name: string
  readonly data_type: string
  readonly is_nullable: string
  readonly numeric_precision: number | bigint | null
  readonly numeric_scale: number | bigint | null
}

/** Forma REAL de unas columnas segun `information_schema`, no segun el esquema Prisma. */
function columnInfo(
  tx: Prisma.TransactionClient,
  table: string,
  columns: readonly string[],
): Promise<ColumnInfo[]> {
  return tx.$queryRaw<ColumnInfo[]>`
    SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name IN (${Prisma.join([...columns])})
    ORDER BY column_name`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('suppliers', 'supplier_catalog_lines')`
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-42 (suppliers y ' +
        'supplier_catalog_lines). Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('estructura del proveedor', () => {
  it('crea un proveedor con id, nombre, telefono y correo, y lo relee sin perdida (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const created = await tx.supplier.create({
        data: {
          name: `Quimicos del Pacifico ${marker}`,
          nameNormalized: `quimicosdelpacifico${marker}`,
          phone: '+57 300 111 2233',
          email: `contacto.${marker}@proveedor.test`,
        },
        select: { id: true },
      })
      expect(created.id).toMatch(UUID_SHAPE)

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: created.id } })
      expect(supplier.name).toBe(`Quimicos del Pacifico ${marker}`)
      expect(supplier.nameNormalized).toBe(`quimicosdelpacifico${marker}`)
      expect(supplier.phone).toBe('+57 300 111 2233')
      expect(supplier.email).toBe(`contacto.${marker}@proveedor.test`)
      expect(supplier.deletedAt).toBeNull()
    })
  })

  it('rechaza un proveedor sin nombre con SQLSTATE 23502 (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name_normalized: Prisma.sql`${marker}`,
            phone: Prisma.sql`${'+57 300 000 0000'}`,
          }),
        'proveedor sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      const survivors = await tx.supplier.findMany({
        where: { nameNormalized: marker },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta proveedor solo con telefono y proveedor solo con correo (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const soloTelefono = await tx.supplier.create({
        data: {
          name: `Solo telefono ${marker}`,
          nameNormalized: `solotelefono${marker}`,
          phone: '+57 300 222 3344',
          email: null,
        },
        select: { id: true },
      })
      const soloCorreo = await tx.supplier.create({
        data: {
          name: `Solo correo ${marker}`,
          nameNormalized: `solocorreo${marker}`,
          phone: null,
          email: `solo.${marker}@proveedor.test`,
        },
        select: { id: true },
      })

      const first = await tx.supplier.findUniqueOrThrow({ where: { id: soloTelefono.id } })
      expect(first.phone).toBe('+57 300 222 3344')
      expect(first.email).toBeNull()

      const second = await tx.supplier.findUniqueOrThrow({ where: { id: soloCorreo.id } })
      expect(second.phone).toBeNull()
      expect(second.email).toBe(`solo.${marker}@proveedor.test`)
    })
  })

  it('la regla cruzada «al menos telefono o correo», los cinco casos de R4', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // (a) con telefono sin correo -> acepta
      const conTelefono = await tx.supplier.create({
        data: {
          name: `Con telefono ${marker}`,
          nameNormalized: `contelefono${marker}`,
          phone: '+57 300 333 4455',
          email: null,
        },
        select: { id: true },
      })
      expect(conTelefono.id).toMatch(UUID_SHAPE)

      // (b) con correo sin telefono -> acepta
      const conCorreo = await tx.supplier.create({
        data: {
          name: `Con correo ${marker}`,
          nameNormalized: `concorreo${marker}`,
          phone: null,
          email: `con.${marker}@proveedor.test`,
        },
        select: { id: true },
      })
      expect(conCorreo.id).toMatch(UUID_SHAPE)

      // (c) con los dos -> acepta
      const conLosDos = await tx.supplier.create({
        data: {
          name: `Con los dos ${marker}`,
          nameNormalized: `conlosdos${marker}`,
          phone: '+57 300 444 5566',
          email: `dos.${marker}@proveedor.test`,
        },
        select: { id: true },
      })
      expect(conLosDos.id).toMatch(UUID_SHAPE)

      // (d) sin ninguno -> rechaza con 23514, en INSERT
      const insertSinNinguno = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Sin ninguno ${marker}`}`,
            name_normalized: Prisma.sql`${`sinninguno${marker}`}`,
          }),
        'proveedor sin telefono ni correo',
      )
      expect(insertSinNinguno).toBe(CHECK_VIOLATION)

      const survivors = await tx.supplier.findMany({
        where: { nameNormalized: `sinninguno${marker}` },
        select: { id: true },
      })
      expect(survivors).toEqual([])

      // (e) UPDATE que deja al proveedor sin ninguno de los dos -> rechaza con 23514
      const paraActualizar = await tx.supplier.create({
        data: {
          name: `Para actualizar ${marker}`,
          nameNormalized: `paraactualizar${marker}`,
          phone: '+57 300 555 6677',
          email: null,
        },
        select: { id: true },
      })
      const updateSinNinguno = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "suppliers" SET "phone" = NULL WHERE "id" = ${asUuid(paraActualizar.id)}`,
        'update que deja al proveedor sin telefono ni correo',
      )
      expect(updateSinNinguno).toBe(CHECK_VIOLATION)

      // Y la fila conserva el telefono que tenia antes del intento fallido.
      const afterReject = await tx.supplier.findUniqueOrThrow({
        where: { id: paraActualizar.id },
        select: { phone: true },
      })
      expect(afterReject.phone).toBe('+57 300 555 6677')
    })
  })

  it('acepta un nombre de 500 caracteres y un correo de 500 caracteres (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      const emailLocalPart = 'b'.repeat(500 - '@proveedor.test'.length - marker.length)
      const email = `${marker}${emailLocalPart}@proveedor.test`
      expect(name).toHaveLength(500)
      expect(email).toHaveLength(500)

      const { id } = await tx.supplier.create({
        data: { name, nameNormalized: name, phone: '+57 300 666 7788', email },
        select: { id: true },
      })

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id } })
      expect(supplier.name).toBe(name)
      expect(supplier.email).toBe(email)

      const columns = await columnInfo(tx, 'suppliers', ['name', 'email'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['email', 'text'],
        ['name', 'text'],
      ])
    })
  })

  it('dos proveedores vivos comparten el mismo telefono y correo, y un correo sin forma se acepta (R6)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const sharedPhone = '+57 300 777 8899'
      const sharedEmail = `compartido.${marker}@proveedor.test`

      const first = await tx.supplier.create({
        data: {
          name: `Primero ${marker}`,
          nameNormalized: `primero${marker}`,
          phone: sharedPhone,
          email: sharedEmail,
        },
        select: { id: true },
      })
      const second = await tx.supplier.create({
        data: {
          name: `Segundo ${marker}`,
          nameNormalized: `segundo${marker}`,
          phone: sharedPhone,
          email: sharedEmail,
        },
        select: { id: true },
      })
      expect(first.id).not.toBe(second.id)

      // No hay validacion de formato de correo en la base (decision 9).
      const conCorreoRaro = await tx.supplier.create({
        data: {
          name: `Correo raro ${marker}`,
          nameNormalized: `correoraro${marker}`,
          phone: null,
          email: `no-es-un-correo-${marker}`,
        },
        select: { id: true },
      })
      const raro = await tx.supplier.findUniqueOrThrow({ where: { id: conCorreoRaro.id } })
      expect(raro.email).toBe(`no-es-un-correo-${marker}`)

      // Y no hay indice unico sobre telefono ni correo.
      const uniqueIndexes = await tx.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'suppliers'
          AND (indexdef LIKE '%phone%' OR indexdef LIKE '%email%')`
      expect(uniqueIndexes).toEqual([])
    })
  })
})

describe('unicidad del nombre del proveedor', () => {
  it('rechaza un segundo proveedor con el mismo nombre normalizado que otro proveedor VIVO (R7)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `quimicosunidos${marker}`

      const firstId = await createSupplier(tx, {
        name: `Quimicos Unidos ${marker}`,
        nameNormalized: normalized,
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`quimicos-unidos-${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            phone: Prisma.sql`${'+57 300 888 9900'}`,
          }),
        'segundo proveedor con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const rows = await tx.supplier.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      })
      expect(rows).toEqual([{ id: firstId }])
    })
  })

  it('tras dar de baja un proveedor, otro puede usar su mismo nombre normalizado (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `disolventesandinos${marker}`

      const firstId = await createSupplier(tx, {
        name: `Disolventes Andinos ${marker}`,
        nameNormalized: normalized,
      })
      await tx.supplier.update({ where: { id: firstId }, data: { deletedAt: new Date() } })

      const secondId = await createSupplier(tx, {
        name: `Disolventes Andinos ${marker}`,
        nameNormalized: normalized,
      })

      const rows = await tx.supplier.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, deletedAt: true },
      })
      expect(rows).toHaveLength(2)
      expect(rows.filter((row) => row.deletedAt === null).map((row) => row.id)).toEqual([secondId])
    })
  })
})

describe('auditoria, baja y marcas de tiempo del proveedor', () => {
  it('la baja conserva la fila completa y marca deleted_at (R26)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)

      const { id } = await tx.supplier.create({
        data: {
          name: `Proveedor a dar de baja ${marker}`,
          nameNormalized: marker,
          phone: '+57 300 999 0011',
          email: `baja.${marker}@proveedor.test`,
          createdBy: autor,
          updatedBy: autor,
        },
        select: { id: true },
      })

      const antes = new Date()
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } })

      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id } })
      expect(supplier.deletedAt).toBeInstanceOf(Date)
      expect(supplier.deletedAt?.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000)
      expect(supplier.name).toBe(`Proveedor a dar de baja ${marker}`)
      expect(supplier.phone).toBe('+57 300 999 0011')
      expect(supplier.email).toBe(`baja.${marker}@proveedor.test`)
      expect(supplier.createdBy).toBe(autor)
      expect(supplier.updatedBy).toBe(autor)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas (R27)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      const lineId = await createLine(tx, supplierId, productId, '10.0000')

      const supplierAntes = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineAntes = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })
      expect(supplierAntes.createdAt).toBeInstanceOf(Date)
      expect(lineAntes.createdAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.supplier.update({ where: { id: supplierId }, data: { phone: '+57 300 111 2200' } })
      await tx.supplierCatalogLine.update({
        where: { id: lineId },
        data: { cost: new Prisma.Decimal('11.0000') },
      })

      const supplierDespues = await tx.supplier.findUniqueOrThrow({
        where: { id: supplierId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineDespues = await tx.supplierCatalogLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })

      expect(supplierDespues.createdAt.getTime()).toBe(supplierAntes.createdAt.getTime())
      expect(supplierDespues.updatedAt.getTime()).toBeGreaterThan(supplierAntes.updatedAt.getTime())
      expect(lineDespues.createdAt.getTime()).toBe(lineAntes.createdAt.getTime())
      expect(lineDespues.updatedAt.getTime()).toBeGreaterThan(lineAntes.updatedAt.getTime())
    })
  })

  it('registra autor y editor, acepta un proveedor sin autor, y rechaza un autor inexistente con 23503 (R24)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)
      const editor = await createUser(tx)

      const { id } = await tx.supplier.create({
        data: {
          name: `Con autoria ${marker}`,
          nameNormalized: `conautoria${marker}`,
          phone: '+57 300 222 3300',
          createdBy: autor,
          updatedBy: autor,
        },
        select: { id: true },
      })
      await tx.supplier.update({ where: { id }, data: { updatedBy: editor } })

      const supplier = await tx.supplier.findUniqueOrThrow({
        where: { id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(supplier.createdBy).toBe(autor)
      expect(supplier.updatedBy).toBe(editor)

      // Proveedor sin autor (createdBy/updatedBy NULL).
      const sinAutor = await createSupplier(tx, {
        name: `Sin autor ${marker}`,
        nameNormalized: `sinautor${marker}`,
      })
      const sinAutorRow = await tx.supplier.findUniqueOrThrow({
        where: { id: sinAutor },
        select: { createdBy: true, updatedBy: true },
      })
      expect(sinAutorRow.createdBy).toBeNull()
      expect(sinAutorRow.updatedBy).toBeNull()

      // Autor inexistente -> 23503.
      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Con autor fantasma ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasma${marker}`}`,
            phone: Prisma.sql`${'+57 300 333 4400'}`,
            created_by: asUuid(randomUUID()),
          }),
        'alta de proveedor con autor inexistente',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)
    })
  })
})

describe('estructura de la linea de catalogo', () => {
  it('crea una linea con costo, minimo y plazo propios y la relee (R10)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)

      const lineId = await createLine(tx, supplierId, productId, '125.5000', {
        minPurchase: '10.0000',
        deliveryTime: 5,
      })

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.id).toMatch(UUID_SHAPE)
      expect(line.supplierId).toBe(supplierId)
      expect(line.productId).toBe(productId)
      expect(line.cost.equals(new Prisma.Decimal('125.5'))).toBe(true)
      expect(line.minPurchase?.equals(new Prisma.Decimal('10'))).toBe(true)
      expect(line.deliveryTime).toBe(5)
      expect(line.createdAt).toBeInstanceOf(Date)
      expect(line.updatedAt).toBeInstanceOf(Date)
    })
  })

  it('rechaza una segunda linea del mismo producto para el mismo proveedor con SQLSTATE 23505 (R11)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)

      const firstLine = await createLine(tx, supplierId, productId, '50.0000')

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(productId),
            cost: Prisma.sql`60.0000`,
          }),
        'segunda linea del mismo producto para el mismo proveedor',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      const lines = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        select: { id: true },
      })
      expect(lines).toEqual([{ id: firstLine }])
    })
  })

  it('acepta muchas lineas por proveedor y el mismo producto en catalogos de dos proveedores con costos distintos (R12)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierA = await createSupplier(tx, { name: `Proveedor A ${marker}`, nameNormalized: `a${marker}` })
      const supplierB = await createSupplier(tx, { name: `Proveedor B ${marker}`, nameNormalized: `b${marker}` })

      const product1 = await createProduct(tx, 'Hidroxido de sodio')
      const product2 = await createProduct(tx, 'Acido sulfurico')
      const product3 = await createProduct(tx, 'Colorante azul')

      await createLine(tx, supplierA, product1, '10.0000')
      await createLine(tx, supplierA, product2, '20.0000')
      await createLine(tx, supplierA, product3, '5.0000')
      const lineB = await createLine(tx, supplierB, product1, '15.0000')

      const linesOfA = await tx.supplierCatalogLine.findMany({
        where: { supplierId: supplierA },
        select: { productId: true },
      })
      expect(linesOfA.map((line) => line.productId).sort()).toEqual(
        [product1, product2, product3].sort(),
      )

      const lineBRow = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineB } })
      expect(lineBRow.cost.toString()).toBe('15')

      const usesOfProduct1 = await tx.supplierCatalogLine.findMany({
        where: { productId: product1 },
        select: { supplierId: true },
      })
      expect(usesOfProduct1.map((line) => line.supplierId).sort()).toEqual([supplierA, supplierB].sort())
    })
  })

  it('una linea sin minimo y sin plazo queda con NULL, no con cero (R13)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)

      const lineId = await createLine(tx, supplierId, productId, '30.0000')

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.minPurchase).toBeNull()
      expect(line.deliveryTime).toBeNull()

      const shape = await tx.$queryRaw<{ sin_min: boolean; sin_plazo: boolean }[]>`
        SELECT ("min_purchase" IS NULL) AS sin_min, ("delivery_time" IS NULL) AS sin_plazo
        FROM "supplier_catalog_lines" WHERE "id" = ${asUuid(lineId)}`
      expect(shape).toEqual([{ sin_min: true, sin_plazo: true }])
    })
  })

  it('el costo y el minimo conservan cuatro decimales exactos, columna numeric(14,4) (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productoGrande = await createProduct(tx, 'Producto grande')
      const productoMinimo = await createProduct(tx, 'Producto minimo')

      const grande = await createLine(tx, supplierId, productoGrande, '1234567890.1234', {
        minPurchase: '1234567890.1234',
      })
      const minimo = await createLine(tx, supplierId, productoMinimo, '0.0001', { minPurchase: '0.0001' })

      const lines = await tx.supplierCatalogLine.findMany({
        where: { id: { in: [grande, minimo] } },
        select: { id: true, cost: true, minPurchase: true },
      })
      const byId = new Map(lines.map((line) => [line.id, line]))
      expect(byId.get(grande)?.cost.toString()).toBe('1234567890.1234')
      expect(byId.get(grande)?.minPurchase?.toString()).toBe('1234567890.1234')
      expect(byId.get(minimo)?.cost.toString()).toBe('0.0001')
      expect(byId.get(minimo)?.minPurchase?.toString()).toBe('0.0001')

      const asText = await tx.$queryRaw<{ id: string; costo: string }[]>`
        SELECT "id"::text AS id, "cost"::text AS costo
        FROM "supplier_catalog_lines" WHERE "id" IN (${asUuid(grande)}, ${asUuid(minimo)})
        ORDER BY "cost" DESC`
      expect(asText.map((row) => row.costo)).toEqual(['1234567890.1234', '0.0001'])

      const columns = await columnInfo(tx, 'supplier_catalog_lines', ['cost', 'min_purchase'])
      expect(columns).toHaveLength(2)
      for (const column of columns) {
        expect(column.data_type).toBe('numeric')
        expect(Number(column.numeric_precision)).toBe(14)
        expect(Number(column.numeric_scale)).toBe(4)
      }
    })
  })

  it('acepta un minimo de compra de 2,5 y lo devuelve sin redondear (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)

      const lineId = await createLine(tx, supplierId, productId, '40.0000', { minPurchase: '2.5000' })

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.minPurchase?.toString()).toBe('2.5')
    })
  })

  it('rechaza un plazo con parte fraccionaria y acepta uno entero (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productoFraccionario = await createProduct(tx, 'Producto plazo fraccionario')
      const productoEntero = await createProduct(tx, 'Producto plazo entero')

      // El plazo entero se acepta sin problema.
      const lineId = await createLine(tx, supplierId, productoEntero, '10.0000', { deliveryTime: 7 })
      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.deliveryTime).toBe(7)

      // Este expect NO prueba que la columna sea INTEGER: prueba que un parametro de
      // tipo texto no se liga (bind) contra NINGUNA columna de la familia numerica, sea
      // entera o decimal (una columna NUMERIC(14,4) daria el mismo 42804 ante el mismo
      // insert). Que `delivery_time` sea especificamente INTEGER lo verifica, aparte, el
      // test de mas abajo que lee `information_schema.columns`. Se documenta el SQLSTATE
      // exacto porque no es el generico de CHECK (23514).
      // Tiene que ir como PARAMETRO de texto (no como literal numerico sin comillas): un
      // literal `3.5` sin comillas es una constante NUMERIC y Postgres la redondearia via
      // el cast de asignacion numeric->integer en vez de rechazarla. Ligado como parametro
      // de tipo desconocido contra una columna de familia numerica, Postgres responde
      // `42804` (datatype_mismatch: «la columna es de tipo integer [o numeric] pero la
      // expresion es de tipo text»), no `22P02` (que seria el error si el propio texto no
      // fuera numerico, p. ej. 'abc').
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(productoFraccionario),
            cost: Prisma.sql`10.0000`,
            delivery_time: Prisma.sql`${'3.5'}`,
          }),
        'linea con plazo fraccionario',
      )
      expect(sqlState).toBe('42804')

      const survivors = await tx.supplierCatalogLine.findMany({
        where: { productId: productoFraccionario },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('el plazo de entrega es una columna integer de verdad, no numeric (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const columns = await columnInfo(tx, 'supplier_catalog_lines', ['delivery_time'])
      expect(columns).toHaveLength(1)
      expect(columns[0]?.data_type).toBe('integer')
    })
  })

  it('rechaza costo, minimo y plazo negativos por separado con SQLSTATE 23514, y acepta el cero (R17)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productoCosto = await createProduct(tx, 'Producto costo negativo')
      const productoMinimo = await createProduct(tx, 'Producto minimo negativo')
      const productoPlazo = await createProduct(tx, 'Producto plazo negativo')
      const productoCero = await createProduct(tx, 'Producto en cero')

      const costoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(productoCosto),
            cost: Prisma.sql`-1.0000`,
          }),
        'linea con costo negativo',
      )
      expect(costoNegativo).toBe(CHECK_VIOLATION)

      const minimoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(productoMinimo),
            cost: Prisma.sql`10.0000`,
            min_purchase: Prisma.sql`-5.0000`,
          }),
        'linea con minimo negativo',
      )
      expect(minimoNegativo).toBe(CHECK_VIOLATION)

      const plazoNegativo = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(productoPlazo),
            cost: Prisma.sql`10.0000`,
            delivery_time: Prisma.sql`-2`,
          }),
        'linea con plazo negativo',
      )
      expect(plazoNegativo).toBe(CHECK_VIOLATION)

      // Cero es valido en los tres campos.
      const cero = await createLine(tx, supplierId, productoCero, '0.0000', {
        minPurchase: '0.0000',
        deliveryTime: 0,
      })
      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: cero } })
      expect(line.cost.toString()).toBe('0')
      expect(line.minPurchase?.toString()).toBe('0')
      expect(line.deliveryTime).toBe(0)
    })
  })
})

describe('frontera con inventario e identity: FK reales sin relacion de Prisma', () => {
  it('rechaza un product_id y un created_by inexistentes con SQLSTATE 23503, aunque Prisma no declare la relacion (R22)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })

      const productoFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'supplier_catalog_lines', {
            supplier_id: asUuid(supplierId),
            product_id: asUuid(randomUUID()),
            cost: Prisma.sql`10.0000`,
          }),
        'linea con product_id inventado',
      )
      expect(productoFantasma).toBe(FOREIGN_KEY_VIOLATION)

      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'suppliers', {
            name: Prisma.sql`${`Con autor fantasma linea ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasmalinea${marker}`}`,
            phone: Prisma.sql`${'+57 300 444 5500'}`,
            created_by: asUuid(randomUUID()),
          }),
        'proveedor con created_by inventado',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // El porque: las cuatro FK existen en la base aunque el esquema Prisma declare
      // `product_id`, `created_by` y `updated_by` como escalares sin `@relation`.
      const foreignKeys = await tx.$queryRaw<{ conname: string; referencia: string }[]>`
        SELECT c.conname, ft.relname AS referencia
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        WHERE c.contype = 'f' AND t.relname IN ('suppliers', 'supplier_catalog_lines')
        ORDER BY c.conname`
      expect(foreignKeys).toEqual([
        { conname: 'supplier_catalog_lines_product_id_fkey', referencia: 'products' },
        { conname: 'supplier_catalog_lines_supplier_id_fkey', referencia: 'suppliers' },
        { conname: 'suppliers_created_by_fkey', referencia: 'users' },
        { conname: 'suppliers_updated_by_fkey', referencia: 'users' },
      ])
    })
  })
})

describe('baja, borrado fisico y CASCADE', () => {
  it('quitar un producto del catalogo elimina fisicamente la fila de la linea, sin deleted_at (R28)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productoQueSale = await createProduct(tx, 'Producto que sale')
      const productoQueQueda = await createProduct(tx, 'Producto que queda')

      const lineaQueSale = await createLine(tx, supplierId, productoQueSale, '5.0000')
      const lineaQueQueda = await createLine(tx, supplierId, productoQueQueda, '6.0000')

      await tx.supplierCatalogLine.delete({ where: { id: lineaQueSale } })

      expect(await tx.supplierCatalogLine.findUnique({ where: { id: lineaQueSale } })).toBeNull()
      const lines = await tx.supplierCatalogLine.findMany({ where: { supplierId }, select: { id: true } })
      expect(lines).toEqual([{ id: lineaQueQueda }])

      expect(await tx.supplier.findUnique({ where: { id: supplierId } })).not.toBeNull()
      // `select` explicito: `products` tiene drift de terreno compartido en esta base de
      // pruebas (columna `unit` vs `unit_id`, ajeno a esta feature — QC-42 no toca
      // `products`), y un `findUnique` sin `select` trae todas las columnas.
      expect(
        await tx.product.findUnique({ where: { id: productoQueSale }, select: { id: true } }),
      ).not.toBeNull()

      const softDeleteColumns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supplier_catalog_lines'
          AND column_name = 'deleted_at'`
      expect(softDeleteColumns).toEqual([])
    })
  })

  it('borrar fisicamente un proveedor se lleva sus lineas por CASCADE y no deja huerfanas (R29)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const product1 = await createProduct(tx, 'Insumo 1')
      const product2 = await createProduct(tx, 'Insumo 2')

      const line1 = await createLine(tx, supplierId, product1, '10.0000')
      const line2 = await createLine(tx, supplierId, product2, '20.0000')

      // Borrado FISICO (una purga, un script, el `down.sql`): aqui si se dispara el
      // CASCADE. En operacion normal el borrado es logico y ninguna FK reacciona a un
      // UPDATE.
      await tx.supplier.delete({ where: { id: supplierId } })

      const survivors = await tx.supplierCatalogLine.findMany({
        where: { id: { in: [line1, line2] } },
        select: { id: true },
      })
      expect(survivors).toEqual([])
      expect(await tx.supplier.findUnique({ where: { id: supplierId } })).toBeNull()
    })
  })

  it('la baja logica de un proveedor deja sus lineas intactas y asociadas (R30)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const product1 = await createProduct(tx, 'Insumo 1')
      const product2 = await createProduct(tx, 'Insumo 2')

      const line1 = await createLine(tx, supplierId, product1, '10.5000')
      const line2 = await createLine(tx, supplierId, product2, '0.2500')
      const antes = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        orderBy: { cost: 'asc' },
      })

      await tx.supplier.update({ where: { id: supplierId }, data: { deletedAt: new Date() } })

      const despues = await tx.supplierCatalogLine.findMany({
        where: { supplierId },
        orderBy: { cost: 'asc' },
      })
      expect(despues.map((line) => line.id).sort()).toEqual([line1, line2].sort())
      expect(despues.map((line) => line.supplierId)).toEqual([supplierId, supplierId])
      expect(despues.map((line) => line.cost.toString())).toEqual(
        antes.map((line) => line.cost.toString()),
      )
      expect(despues.map((line) => line.updatedAt.getTime())).toEqual(
        antes.map((line) => line.updatedAt.getTime()),
      )
    })
  })

  it('un producto borrado logicamente conserva la linea que lo referencia (R31, parte 1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx, 'Insumo descatalogado')
      const lineId = await createLine(tx, supplierId, productId, '30.0000')

      // El borrado de producto es LOGICO (QC-20): un UPDATE, no un DELETE.
      // `select` explicito por el mismo motivo de drift de terreno compartido de arriba.
      await tx.product.update({
        where: { id: productId },
        data: { deletedAt: new Date() },
        select: { id: true },
      })

      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
      expect(line.cost.toString()).toBe('30')

      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { deletedAt: true },
      })
      expect(product.deletedAt).toBeInstanceOf(Date)
    })
  })

  it('rechaza el borrado fisico de un producto usado por una linea con SQLSTATE 23503 (R31, parte 2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const supplierId = await createSupplier(tx, { name: `Proveedor ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx, 'Insumo en uso')
      const lineId = await createLine(tx, supplierId, productId, '10.0000')

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "products" WHERE "id" = ${asUuid(productId)}`,
        'borrado fisico de un producto usado por una linea de catalogo',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(
        await tx.product.findUnique({ where: { id: productId }, select: { id: true } }),
      ).not.toBeNull()
      const line = await tx.supplierCatalogLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
    })
  })
})
