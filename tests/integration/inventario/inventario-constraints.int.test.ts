/**
 * Tests de integracion de QC-14 (modelo-producto) contra una base Postgres REAL, con la
 * migracion `20260902005510_products_and_presentations` aplicada.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila
 * escrita por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un
 * cliente `pg` aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app
 * (Prisma es el unico camino) y porque `$executeRaw` dentro de la misma transaccion
 * reutiliza la conexion, asi que el SQL crudo comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en
 * total»: cada test mira solo las filas que el mismo sembro, localizadas por su `id`. Una
 * base con catalogo cargado, o un test futuro que siembre datos, no puede volverlos rojos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * requisitos exigen comprobar el estado DESPUES del rechazo («conserva la presentacion y
 * su producto sin modificar», R14). Por eso toda operacion que se espera que falle se
 * envuelve en un `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que deja la
 * transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — las altas que se espera que fallen se hacen con `$executeRaw` a proposito:
 * (1) omitir una columna obligatoria no se puede expresar con la API tipada de Prisma (no
 * compilaria), y (2) el raw propaga el SQLSTATE en `meta.code`. Se afirma sobre el
 * SQLSTATE y NUNCA sobre el texto del mensaje: el Postgres de esta maquina responde en
 * espanol. Los caminos felices y las lecturas van con la API tipada.
 *
 * COSTO — `cost` se maneja siempre como `Prisma.Decimal` y se compara con `.toString()` o
 * `.equals()`. Convertirlo a `number` reintroduciria justo la coma flotante binaria que
 * `docs/architecture.md > Dominio` n.o 4 prohibe, y el test dejaria de demostrar R8.
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
const CHECK_VIOLATION = '23514'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test afirma
 * sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el efecto, y
 * cada caso se construye para que solo una restriccion pueda dispararlo. Los nombres de
 * los CHECK y de la FK los vigilan los tests estaticos sobre el SQL de la migracion.
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

/**
 * Crea una presentacion. El nombre NO es unico (decision cerrada del humano), asi que no
 * hace falta aleatorizarlo como se hacia con `roles.name` en `identity`.
 */
async function createPresentation(
  tx: Prisma.TransactionClient,
  name = 'Bidon 20 L',
): Promise<string> {
  const presentation = await tx.presentation.create({ data: { name }, select: { id: true } })
  return presentation.id
}

/** Columnas de `products` que un alta cruda puede escribir (todas menos las marcas). */
type ProductColumn =
  | 'name'
  | 'stock'
  | 'cost'
  | 'min_purchase'
  | 'delivery_time'
  | 'qty_alert'
  | 'unit'

/**
 * `INSERT INTO products` crudo. `columns` decide que se escribe: omitir una entrada es
 * exactamente el caso «falta un dato obligatorio». `presentationId === null` omite la
 * columna de la FK. `updated_at` se da siempre porque es NOT NULL sin DEFAULT (lo rellena
 * el cliente Prisma via `@updatedAt`, no la base).
 */
function rawInsertProduct(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<ProductColumn, Prisma.Sql>>,
  presentationId: string | null,
): Promise<number> {
  const entries = Object.entries(columns) as [ProductColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  if (presentationId !== null) {
    names.push(Prisma.raw('"presentation_id"'))
    values.push(Prisma.sql`CAST(${presentationId} AS uuid)`)
  }
  names.push(Prisma.raw('"updated_at"'))
  values.push(Prisma.sql`CURRENT_TIMESTAMP`)

  return tx.$executeRaw`INSERT INTO "products" (${Prisma.join(names)}) VALUES (${Prisma.join(values)})`
}

interface ColumnType {
  readonly column_name: string
  readonly data_type: string
  readonly numeric_precision: number | bigint | null
  readonly numeric_scale: number | bigint | null
}

/** Tipo REAL de una columna segun `information_schema`, no segun el esquema Prisma. */
function columnTypes(
  tx: Prisma.TransactionClient,
  table: string,
  columns: readonly string[],
): Promise<ColumnType[]> {
  return tx.$queryRaw<ColumnType[]>`
    SELECT column_name, data_type, numeric_precision, numeric_scale
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
    WHERE schemaname = 'public' AND tablename IN ('products', 'presentations')`
  if (tables.length !== 2) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-14 (products y presentations). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('estructura de la presentacion', () => {
  it('crea una presentacion y su identificador no cambia al renombrarla', async () => {
    await inRolledBackTransaction(async (tx) => {
      const created = await tx.presentation.create({ data: { name: 'Bidon 20 L' } })
      // R1: identificador propio, estable y no derivado de los datos de negocio.
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u)
      expect(created.name).toBe('Bidon 20 L')

      const renamed = await tx.presentation.update({
        where: { id: created.id },
        data: { name: 'Bidon de 20 litros' },
      })
      expect(renamed.id).toBe(created.id)

      // Y la fila se sigue encontrando por ese mismo id: si el identificador se derivase
      // del nombre, este `findUnique` no traeria nada despues del renombrado.
      const reread = await tx.presentation.findUniqueOrThrow({ where: { id: created.id } })
      expect(reread.name).toBe('Bidon de 20 litros')
    })
  })

  it('rechaza una presentacion sin nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      // SQL crudo a proposito: `tx.presentation.create({ data: {} })` no compilaria, asi
      // que la unica forma de omitir `name` es el INSERT literal. La unica columna que
      // falta es `name`, asi que el 23502 solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`INSERT INTO "presentations" ("updated_at") VALUES (CURRENT_TIMESTAMP)`,
        'presentacion sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: no se afirma sobre el total de la tabla (eso seria
      // fragil), sino que ninguna presentacion sin nombre pudo quedar escrita.
      const nameless = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "presentations" WHERE "name" IS NULL`
      expect(nameless).toEqual([])
    })
  })
})

describe('estructura del producto', () => {
  it('crea un producto con todos sus datos y los relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id } = await tx.product.create({
        data: {
          name: 'Acido citrico monohidratado',
          presentationId,
          stock: 120,
          cost: new Prisma.Decimal('15340.7500'),
          minPurchase: 5,
          deliveryTime: 12,
          qtyAlert: 20,
          unit: 'kg',
        },
        select: { id: true },
      })

      // R3: los ocho datos viven en la MISMA fila de la MISMA tabla; no hay entidad
      // separada de «elemento de inventario» que haya que juntar con un join.
      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(product.name).toBe('Acido citrico monohidratado')
      expect(product.presentationId).toBe(presentationId)
      expect(product.stock).toBe(120)
      expect(product.cost?.toString()).toBe('15340.75')
      expect(product.minPurchase).toBe(5)
      expect(product.deliveryTime).toBe(12)
      expect(product.qtyAlert).toBe(20)
      expect(product.unit).toBe('kg')
      expect(product.deletedAt).toBeNull()
      expect(product.id).toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('rechaza el alta si falta el nombre o la presentacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)

      // Sin nombre: la unica columna obligatoria omitida es `name`.
      const withoutName = await expectRejectedByDatabase(
        tx,
        () => rawInsertProduct(tx, { unit: Prisma.sql`${'kg-sin-nombre'}` }, presentationId),
        'alta de producto sin nombre',
      )
      expect(withoutName).toBe(NOT_NULL_VIOLATION)

      // Sin presentacion: la unica columna obligatoria omitida es `presentation_id`.
      const withoutPresentation = await expectRejectedByDatabase(
        tx,
        () => rawInsertProduct(tx, { name: Prisma.sql`${'Sin presentacion'}` }, null),
        'alta de producto sin presentacion',
      )
      expect(withoutPresentation).toBe(NOT_NULL_VIOLATION)

      // R4 «no crear ninguna fila»: se busca lo que cada intento habria escrito, no el
      // total de la tabla.
      const survivors = await tx.product.findMany({
        where: { OR: [{ unit: 'kg-sin-nombre' }, { name: 'Sin presentacion' }] },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta un producto sin existencia, costo, tiempo de entrega, cantidad de alerta ni unidad, y los devuelve como ausencia de valor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id } = await tx.product.create({
        data: { name: 'Ficha recien abierta', presentationId },
        select: { id: true },
      })

      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      // R5: ausencia de valor, NO cero y NO cadena vacia. `toBeNull` distingue las tres
      // cosas; un `toBeFalsy` las confundiria y el test no valdria nada.
      expect(product.stock).toBeNull()
      expect(product.cost).toBeNull()
      expect(product.deliveryTime).toBeNull()
      expect(product.qtyAlert).toBeNull()
      expect(product.unit).toBeNull()
      expect(product.stock).not.toBe(0)
      expect(product.qtyAlert).not.toBe(0)
      expect(product.unit).not.toBe('')
    })
  })

  it('un producto dado de alta sin compra minima queda con compra minima 0', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id } = await tx.product.create({
        data: { name: 'Sin compra minima', presentationId },
        select: { id: true },
      })

      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      // R6: el DEFAULT actua y la columna NO es anulable, asi que «compra minima 0» y
      // «compra minima desconocida» no pueden convivir (design.md > 2.2).
      expect(product.minPurchase).toBe(0)
      expect(product.minPurchase).not.toBeNull()
    })
  })

  it('las cuatro columnas enteras son integer en information_schema', async () => {
    await inRolledBackTransaction(async (tx) => {
      const types = await columnTypes(tx, 'products', [
        'stock',
        'min_purchase',
        'qty_alert',
        'delivery_time',
      ])
      // R7: el tipo REAL en la base, no el declarado en el esquema. `numeric` o
      // `double precision` harian caer esta lista.
      expect(types.map((type) => [type.column_name, type.data_type])).toEqual([
        ['delivery_time', 'integer'],
        ['min_purchase', 'integer'],
        ['qty_alert', 'integer'],
        ['stock', 'integer'],
      ])

      // Y en la practica: lo que se guarda no conserva parte decimal. Se escribe con SQL
      // crudo porque la API tipada de Prisma exige un `number` entero y no dejaria
      // expresar el caso.
      const presentationId = await createPresentation(tx)
      await rawInsertProduct(
        tx,
        { name: Prisma.sql`${'Con parte decimal'}`, stock: Prisma.sql`${'7.4'}::numeric` },
        presentationId,
      )
      const stored = await tx.product.findFirstOrThrow({
        where: { name: 'Con parte decimal', presentationId },
        select: { stock: true },
      })
      expect(stored.stock).not.toBeNull()
      expect(Number.isInteger(stored.stock)).toBe(true)
    })
  })

  it('el costo conserva cuatro decimales exactos y su columna es numeric(14,4)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const [cost] = await columnTypes(tx, 'products', ['cost'])
      // R8: `numeric(14,4)`. Si alguien lo cambiase a `double precision`, `data_type`
      // diria «double precision» y la precision declarada desapareceria.
      expect(cost?.data_type).toBe('numeric')
      expect(Number(cost?.numeric_precision)).toBe(14)
      expect(Number(cost?.numeric_scale)).toBe(4)

      const presentationId = await createPresentation(tx)
      const exact = new Prisma.Decimal('1234567890.1234')
      const { id } = await tx.product.create({
        data: { name: 'Costo exacto', presentationId, cost: exact },
        select: { id: true },
      })

      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      // Se compara como Decimal o como texto, NUNCA convirtiendo a `number`: esa
      // conversion es justamente la perdida que R8 prohibe.
      expect(product.cost).toBeInstanceOf(Prisma.Decimal)
      expect(product.cost?.toString()).toBe('1234567890.1234')
      expect(product.cost?.equals(exact)).toBe(true)

      // El cuarto decimal sobrevive incluso cuando es lo unico que distingue dos valores.
      const { id: otherId } = await tx.product.create({
        data: {
          name: 'Costo exacto',
          presentationId,
          cost: new Prisma.Decimal('1234567890.1235'),
        },
        select: { id: true },
      })
      const other = await tx.product.findUniqueOrThrow({ where: { id: otherId } })
      expect(other.cost?.toString()).toBe('1234567890.1235')
      expect(other.cost?.equals(exact)).toBe(false)
    })
  })

  it('rechaza existencia, compra minima, cantidad de alerta y costo negativos con SQLSTATE 23514', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const negatives: readonly [ProductColumn, Prisma.Sql][] = [
        ['stock', Prisma.sql`${-1}`],
        ['min_purchase', Prisma.sql`${-1}`],
        ['qty_alert', Prisma.sql`${-1}`],
        ['cost', Prisma.sql`${'-0.0001'}::numeric`],
      ]

      for (const [column, value] of negatives) {
        const columns: Partial<Record<ProductColumn, Prisma.Sql>> = {
          name: Prisma.sql`${`negativo en ${column}`}`,
        }
        columns[column] = value

        // Un SAVEPOINT por caso: el 23514 aborta la transaccion entera y sin el no se
        // podrian probar los tres siguientes. Cada alta pone UN solo valor negativo, asi
        // que el CHECK que salta es el de esa columna y no otro.
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertProduct(tx, columns, presentationId),
          `alta de producto con ${column} negativo`,
        )
        expect(sqlState, `columna "${column}"`).toBe(CHECK_VIOLATION)
      }

      // R9 «no crear ni modificar ninguna fila»: ninguno de los cuatro intentos escribio.
      const survivors = await tx.product.findMany({
        where: { name: { startsWith: 'negativo en ' } },
        select: { id: true },
      })
      expect(survivors).toEqual([])

      // El CHECK rechaza el negativo, no el cero ni el valor ausente: R5 y R6 conviven
      // con R9 porque en SQL un CHECK que evalua a NULL se cumple.
      const { id } = await tx.product.create({
        data: { name: 'Ceros y nulos', presentationId, stock: 0, minPurchase: 0, qtyAlert: 0 },
        select: { id: true },
      })
      const zeroed = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(zeroed.stock).toBe(0)
      expect(zeroed.minPurchase).toBe(0)
      expect(zeroed.qtyAlert).toBe(0)
      expect(zeroed.cost).toBeNull()
    })
  })

  it('acepta cualquier texto como unidad y tambien un producto sin unidad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      // Texto libre de verdad: sin catalogo, sin enum, sin normalizacion (R10).
      const units = ['kg', 'KG', 'Litros', 'bidon de 20 L', 'ug/mL', 'unidad-que-nadie-espera']

      const ids: string[] = []
      for (const unit of units) {
        const { id } = await tx.product.create({
          data: { name: `Producto en ${unit}`, presentationId, unit },
          select: { id: true },
        })
        ids.push(id)
      }
      const stored = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, unit: true },
      })
      // Cada texto vuelve TAL CUAL: ni recortado, ni en minusculas, ni sustituido.
      expect(ids.map((id) => stored.find((row) => row.id === id)?.unit)).toEqual(units)

      const { id: withoutUnit } = await tx.product.create({
        data: { name: 'Sin unidad', presentationId },
        select: { id: true },
      })
      const bare = await tx.product.findUniqueOrThrow({ where: { id: withoutUnit } })
      expect(bare.unit).toBeNull()
    })
  })

  it('guardar una cantidad de alerta por debajo de la existencia no cambia ninguna otra columna', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id } = await tx.product.create({
        data: {
          name: 'Producto vigilado',
          presentationId,
          stock: 3,
          cost: new Prisma.Decimal('10.0000'),
          minPurchase: 1,
          deliveryTime: 7,
          qtyAlert: 50,
          unit: 'kg',
        },
        select: { id: true },
      })
      const before = await tx.product.findUniqueOrThrow({ where: { id } })

      // La alerta (10) queda muy por encima de la existencia (3): si algo derivase un
      // estado de «bajo de existencias», este UPDATE lo dispararia.
      await tx.product.update({ where: { id }, data: { qtyAlert: 10 } })

      const after = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(after.qtyAlert).toBe(10)
      expect(after.stock).toBe(3)
      expect(after.deletedAt).toBeNull()
      // R11: la fila entera es identica salvo la propia alerta y la marca de
      // modificacion. Nada se derivo, nada se recalculo, nada se marco.
      expect({ ...after, qtyAlert: before.qtyAlert, updatedAt: before.updatedAt }).toEqual(before)
    })
  })
})

describe('relacion producto - presentacion', () => {
  it('rechaza un producto sin presentacion o con una presentacion inexistente', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Sin presentacion: `presentation_id` omitido, `name` presente.
      const withoutPresentation = await expectRejectedByDatabase(
        tx,
        () => rawInsertProduct(tx, { name: Prisma.sql`${'Huerfano'}` }, null),
        'alta de producto sin presentacion',
      )
      expect(withoutPresentation).toBe(NOT_NULL_VIOLATION)

      // Con una presentacion inexistente: la unica FK de la tabla es la de presentacion,
      // asi que el 23503 solo puede venir de ella.
      const missingPresentation = await expectRejectedByDatabase(
        tx,
        () => rawInsertProduct(tx, { name: Prisma.sql`${'Huerfano'}` }, randomUUID()),
        'alta de producto con una presentacion inexistente',
      )
      expect(missingPresentation).toBe(FOREIGN_KEY_VIOLATION)

      const survivors = await tx.product.findMany({
        where: { name: 'Huerfano' },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta varios productos con la misma presentacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx, 'Tambor 200 L')
      const ids: string[] = []
      for (const n of [1, 2, 3, 4, 5]) {
        const { id } = await tx.product.create({
          data: { name: `Producto ${String(n)}`, presentationId },
          select: { id: true },
        })
        ids.push(id)
      }

      // R13: la presentacion es compartida; `presentation_id` no lleva unicidad.
      const shared = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, presentationId: true },
      })
      expect(shared).toHaveLength(5)
      expect(shared.every((row) => row.presentationId === presentationId)).toBe(true)
    })
  })

  it('rechaza borrar una presentacion con productos asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id: productId } = await tx.product.create({
        data: { name: 'Producto asignado', presentationId, stock: 4 },
        select: { id: true },
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`,
        'borrado de una presentacion con productos asignados',
      )
      // `ON DELETE RESTRICT` de `products_presentation_id_fkey`.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // R14: se conservan la presentacion y su producto, sin modificar.
      expect(await tx.presentation.findUnique({ where: { id: presentationId } })).not.toBeNull()
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } })
      expect(product.presentationId).toBe(presentationId)
      expect(product.stock).toBe(4)
      expect(product.deletedAt).toBeNull()
    })
  })

  it('rechaza borrar una presentacion cuyo unico producto esta borrado logicamente', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id: productId } = await tx.product.create({
        data: { name: 'Producto retirado', presentationId, stock: 4 },
        select: { id: true },
      })
      const deleted = await tx.product.update({
        where: { id: productId },
        data: { deletedAt: new Date() },
      })
      expect(deleted.deletedAt).not.toBeNull()

      const presentationBefore = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
      })
      const productBefore = await tx.product.findUniqueOrThrow({ where: { id: productId } })

      // La FK no sabe nada de `deleted_at`: un producto borrado logicamente SIGUE
      // contando como asignado, y eso es deliberado (R14 lo dice con todas las letras).
      // Es tambien el motivo por el que `presentations` no lleva `deleted_at`
      // (design.md > 2.1): a un UPDATE no lo puede frenar ninguna FK.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`DELETE FROM "presentations" WHERE "id" = CAST(${presentationId} AS uuid)`,
        'borrado de una presentacion cuyo unico producto esta borrado logicamente',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // Despues del rechazo, las dos filas siguen ahi y ninguna cambio.
      const presentationAfter = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
      })
      expect(presentationAfter).toEqual(presentationBefore)
      const productAfter = await tx.product.findUniqueOrThrow({ where: { id: productId } })
      expect(productAfter).toEqual(productBefore)
      expect(productAfter.deletedAt).not.toBeNull()
    })
  })

  it('permite borrar una presentacion sin productos asignados', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx, 'Presentacion huerfana')
      expect(await tx.product.count({ where: { presentationId } })).toBe(0)

      await tx.presentation.delete({ where: { id: presentationId } })

      // R15: se afirma sobre ESA fila por su id, no sobre el total de la tabla.
      expect(await tx.presentation.findUnique({ where: { id: presentationId } })).toBeNull()
    })
  })
})

describe('nombre del producto', () => {
  it('acepta dos productos con el mismo nombre, y tambien con distintas mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)

      // Exactamente el mismo texto: sin indice unico, ni total ni parcial (R16). Se
      // aparta a proposito del precedente de `users`, donde esto seria 23505.
      const { id: first } = await tx.product.create({
        data: { name: 'Sosa caustica', presentationId },
        select: { id: true },
      })
      const { id: second } = await tx.product.create({
        data: { name: 'Sosa caustica', presentationId },
        select: { id: true },
      })
      // Y solo cambiando las mayusculas: tampoco hay indice unico funcional sobre
      // `lower(name)`, al reves que en `users`.
      const { id: third } = await tx.product.create({
        data: { name: 'SOSA CAUSTICA', presentationId },
        select: { id: true },
      })

      expect(new Set([first, second, third]).size).toBe(3)
      const rows = await tx.product.findMany({
        where: { id: { in: [first, second, third] } },
        select: { id: true, name: true },
      })
      expect(rows).toHaveLength(3)
      // Cada nombre se conserva tal como se tecleo, sin normalizar.
      expect(rows.find((row) => row.id === first)?.name).toBe('Sosa caustica')
      expect(rows.find((row) => row.id === second)?.name).toBe('Sosa caustica')
      expect(rows.find((row) => row.id === third)?.name).toBe('SOSA CAUSTICA')
    })
  })
})

describe('borrado logico y marcas de tiempo', () => {
  it('el borrado logico conserva la fila del producto y marca deleted_at', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const { id } = await tx.product.create({
        data: {
          name: 'Producto que se retira',
          presentationId,
          stock: 9,
          cost: new Prisma.Decimal('99.9999'),
          minPurchase: 2,
          deliveryTime: 4,
          qtyAlert: 1,
          unit: 'L',
        },
        select: { id: true },
      })
      const before = await tx.product.findUniqueOrThrow({ where: { id } })

      const deletedAt = new Date()
      await tx.product.update({ where: { id }, data: { deletedAt } })

      const after = await tx.product.findUniqueOrThrow({ where: { id } })
      // R17: la fila sigue ahi ENTERA. Ningun dato se pierde; solo cambian las marcas.
      expect(after.deletedAt).toEqual(deletedAt)
      expect(after.cost?.toString()).toBe('99.9999')
      expect({ ...after, deletedAt: null, updatedAt: before.updatedAt }).toEqual(before)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Nunca se pasan `createdAt` ni `updatedAt`: los rellenan el DEFAULT de la base y
      // el `@updatedAt` de Prisma.
      const presentation = await tx.presentation.create({ data: { name: 'Caneca 5 L' } })
      expect(presentation.createdAt).toBeInstanceOf(Date)
      expect(presentation.updatedAt).toBeInstanceOf(Date)

      const created = await tx.product.create({
        data: { name: 'Producto con marcas', presentationId: presentation.id },
      })
      expect(created.createdAt).toBeInstanceOf(Date)
      expect(created.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      const modified = await tx.product.update({
        where: { id: created.id },
        data: { stock: 42 },
      })
      expect(modified.stock).toBe(42)
      expect(modified.createdAt.getTime()).toBe(created.createdAt.getTime())
      expect(modified.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime())

      await sleep(20)
      const renamed = await tx.presentation.update({
        where: { id: presentation.id },
        data: { name: 'Caneca de 5 litros' },
      })
      expect(renamed.createdAt.getTime()).toBe(presentation.createdAt.getTime())
      expect(renamed.updatedAt.getTime()).toBeGreaterThan(presentation.updatedAt.getTime())
    })
  })
})
