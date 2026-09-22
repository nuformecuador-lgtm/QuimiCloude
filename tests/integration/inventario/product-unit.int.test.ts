/**
 * Los dos disparadores nuevos de `*_product_unit_and_stored_stock` contra una base Postgres REAL.
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina en
 * ROLLBACK; los intentos que se espera que la base rechace van con `SAVEPOINT`, que deja la
 * transaccion utilizable para seguir consultando despues del rechazo.
 *
 * Se afirma el SQLSTATE y la etiqueta con la que empieza el `RAISE` de cada disparador, nunca la
 * prosa completa (viene localizada): un 23514 a secas dejaria pasar un rechazo por otro motivo.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

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

const CHECK_VIOLATION = '23514'

type Rechazo = { readonly sqlState: string; readonly texto: string }

function rechazoDe(error: unknown): Rechazo {
  let sqlState = ''
  const partes: string[] = []
  if (error instanceof Error) partes.push(error.message)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    sqlState = error.code
    const meta: unknown = error.meta
    if (typeof meta === 'object' && meta !== null) {
      partes.push(JSON.stringify(meta))
      if ('code' in meta) {
        const code: unknown = (meta as { code: unknown }).code
        if (typeof code === 'string') sqlState = code
      }
    }
  }
  return { sqlState, texto: partes.join(' | ') }
}

async function expectRejectedByDatabase(
  tx: Prisma.TransactionClient,
  run: () => Promise<unknown>,
  what: string,
): Promise<Rechazo> {
  savepointSeq += 1
  const savepoint = `sp_${String(savepointSeq)}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  try {
    await run()
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    return rechazoDe(error)
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
  throw new Error(`se esperaba que la base rechazara la operacion, pero la acepto: ${what}`)
}

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marcador}`, nameNormalized: `empresa${marcador}` },
    select: { id: true },
  })
  return company.id
}

async function crearUnidad(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marcador}`,
      nameNormalized: `unidad${marcador}`,
      symbol: `u${marcador.slice(0, 8)}`,
      companyId: null,
    },
    select: { id: true },
  })
  return unit.id
}

async function crearProducto(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
  unitId: string | null,
): Promise<string> {
  const product = await tx.product.create({
    data: { name: `Producto ${marcador}`, nameNormalized: `producto${marcador}`, companyId, unitId },
    select: { id: true },
  })
  return product.id
}

async function crearPresentacion(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
  unitId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name: `Presentacion ${marcador}`, nameNormalized: `presentacion${marcador}`, companyId, unitId },
    select: { id: true },
  })
  return presentation.id
}

/** `INSERT INTO product_batches` crudo: la unica via que puede omitir columnas obligatorias. */
function insertarLote(
  tx: Prisma.TransactionClient,
  productId: string,
  presentationId: string,
  companyId: string,
): Promise<unknown> {
  return tx.$executeRaw`
    INSERT INTO "product_batches"
      ("product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date", "company_id", "updated_at")
    VALUES
      (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, ${`L-${randomUUID()}`}, DATE '2026-09-01', CAST(${companyId} AS uuid), CURRENT_TIMESTAMP)`
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('product_batches_check_unit — el lote solo se escribe en la unidad de su producto', () => {
  it('rechaza con 23514 product_batches_unit_differs_from_product un lote en la unidad de otra presentacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidadDelProducto = await crearUnidad(tx, `p${marcador}`)
      const unidadDeLaPresentacion = await crearUnidad(tx, `q${marcador}`)
      const productId = await crearProducto(tx, marcador, companyId, unidadDelProducto)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidadDeLaPresentacion)

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLote(tx, productId, presentationId, companyId),
        'lote cuya presentacion esta en una unidad distinta de la del producto',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_unit_differs_from_product')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('rechaza un lote sobre un producto sin unidad, llegue por la aplicacion o por SQL directo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidadDeLaPresentacion = await crearUnidad(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId, null)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidadDeLaPresentacion)

      // Sin API tipada de por medio: el mismo INSERT que ejecutaria cualquier camino de escritura.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => insertarLote(tx, productId, presentationId, companyId),
        'lote sobre un producto sin unidad',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_unit_differs_from_product')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('acepta un lote cuya presentacion esta en la misma unidad que el producto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidad = await crearUnidad(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId, unidad)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidad)

      await insertarLote(tx, productId, presentationId, companyId)

      expect(await tx.productBatch.count({ where: { productId } })).toBe(1)
    })
  })
})

describe('presentations_check_unit_locked — una presentacion con lotes no cambia de unidad', () => {
  it('rechaza con 23514 presentations_unit_locked_by_batches el cambio de unidad con lotes ya escritos', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidadOriginal = await crearUnidad(tx, `a${marcador}`)
      const otraUnidad = await crearUnidad(tx, `b${marcador}`)
      const productId = await crearProducto(tx, marcador, companyId, unidadOriginal)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidadOriginal)
      await insertarLote(tx, productId, presentationId, companyId)

      const rechazo = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "presentations" SET "unit_id" = CAST(${otraUnidad} AS uuid) WHERE "id" = CAST(${presentationId} AS uuid)`,
        'cambio de unidad de una presentacion con lotes',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('presentations_unit_locked_by_batches')

      const sinCambio = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { unitId: true },
      })
      expect(sinCambio.unitId).toBe(unidadOriginal)
    })
  })

  it('acepta el cambio de unidad de una presentacion sin lotes', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidadOriginal = await crearUnidad(tx, `a${marcador}`)
      const otraUnidad = await crearUnidad(tx, `b${marcador}`)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidadOriginal)

      const updated = await tx.presentation.update({
        where: { id: presentationId },
        data: { unitId: otraUnidad },
        select: { unitId: true },
      })
      expect(updated.unitId).toBe(otraUnidad)
    })
  })

  it('acepta actualizar una presentacion con lotes cuando la unidad no cambia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unidad = await crearUnidad(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId, unidad)
      const presentationId = await crearPresentacion(tx, marcador, companyId, unidad)
      await insertarLote(tx, productId, presentationId, companyId)

      const updated = await tx.presentation.update({
        where: { id: presentationId },
        data: { name: `Presentacion renombrada ${marcador}` },
        select: { name: true, unitId: true },
      })
      expect(updated.name).toBe(`Presentacion renombrada ${marcador}`)
      expect(updated.unitId).toBe(unidad)
    })
  })
})
