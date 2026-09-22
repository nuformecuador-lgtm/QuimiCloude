/**
 * Cada caso corre en una transaccion que termina en ROLLBACK. Los rechazos van por SQL crudo:
 * omitir una columna obligatoria no compila con la API tipada, y solo el raw propaga el SQLSTATE.
 *
 * Se afirma el SQLSTATE y la etiqueta con que empieza el `RAISE` de cada disparador, nunca la prosa
 * (viene localizada): un 23514 a secas dejaria pasar un rechazo por el motivo equivocado.
 *
 * Sin tests de RLS: Prisma se conecta como dueno de las tablas y saldrian verdes pase lo que pase.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/shared/db/prisma'

/** No es un fallo: es como se fuerza el ROLLBACK de la transaccion del test. */
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
const UNIQUE_VIOLATION = '23505'
/** Tambien es el codigo que usan los disparadores de empresa. */
const CHECK_VIOLATION = '23514'

type Rechazo = { readonly sqlState: string; readonly texto: string }

/**
 * El texto junta mensaje y `meta` porque Prisma deja el mensaje de Postgres en uno u otro segun la
 * via; en el solo se busca la etiqueta del disparador, que no se traduce.
 */
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

/**
 * El SAVEPOINT deja la transaccion utilizable: un error de restriccion la aborta entera, y varios
 * casos consultan despues del rechazo.
 */
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

/** Solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/** El marcador evita choques con el indice unico de nombre de empresa. */
async function crearEmpresa(tx: Prisma.TransactionClient, marcador: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marcador}`, nameNormalized: `empresa${marcador}` },
    select: { id: true },
  })
  return company.id
}

/** `company_id` nulo: vale para cualquier empresa. */
async function crearUnidadDeSistema(
  tx: Prisma.TransactionClient,
  marcador: string,
): Promise<string> {
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

/** La que `presentations_check_unit_scope` acota. */
async function crearUnidadDeEmpresa(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marcador}`,
      nameNormalized: `unidad${marcador}`,
      symbol: `u${marcador.slice(0, 8)}`,
      companyId,
    },
    select: { id: true },
  })
  return unit.id
}

async function crearProducto(
  tx: Prisma.TransactionClient,
  marcador: string,
  companyId: string,
  name = `Producto ${marcador}`,
  unitId: string | null = null,
): Promise<string> {
  const product = await tx.product.create({
    data: { name, nameNormalized: `producto${marcador}`, companyId, unitId },
    select: { id: true },
  })
  return product.id
}

/** `nameNormalized` literal y sin `normalizePresentationName`: se prueba el indice, y un fallo del
 *  algoritmo podria dejar esto en verde. */
async function crearPresentacion(
  tx: Prisma.TransactionClient,
  nameNormalized: string,
  companyId: string,
  unitId: string,
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name: `Presentacion ${nameNormalized}`, nameNormalized, companyId, unitId },
    select: { id: true },
  })
  return presentation.id
}

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
const scopeDirs = readdirSync(migrationsDir).filter((name) =>
  name.endsWith('_inventory_company_scope'),
)
expect(scopeDirs, 'debe existir exactamente una migracion *_inventory_company_scope').toHaveLength(
  1,
)
const migrationDir = join(migrationsDir, scopeDirs[0] as string)

/**
 * Leido del disco: una copia a mano seguiria verde aunque el original cambiara.
 */
function bloqueDoDe(archivo: string): string {
  // Los comentarios no se quitan: `migration.sql` lleva `--` dentro del mensaje de un `RAISE`, y
  // barrer `--.*$` corta el literal.
  const sql = readFileSync(join(migrationDir, archivo), 'utf8')
  const match = /DO\s+\$\$[\s\S]*?\$\$;/.exec(sql)
  if (match === null) throw new Error(`${archivo} no tiene ningun bloque DO $$`)
  return match[0]
}

const BACKFILL = bloqueDoDe('migration.sql')
const GUARDIA_DEL_DOWN = bloqueDoDe('down.sql')

afterAll(async () => {
  await prisma.$disconnect()
})

describe('R1 — la empresa es obligatoria y tiene que existir, en las tres tablas', () => {
  it('rechaza con 23502 un producto, una presentacion y un lote SIN empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      // Con la unidad del producto: sin ella, `product_batches_check_unit` rechazaria el lote
      // antes de que el 23502 de `company_id` tuviera ocasion de saltar.
      const productId = await crearProducto(tx, marcador, companyId, undefined, unitId)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, companyId, unitId)

      // En cada INSERT la unica columna obligatoria que falta es `company_id`, asi que el 23502
      // solo puede venir de ella.
      const producto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "products" ("name", "name_normalized", "updated_at")
          VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, CURRENT_TIMESTAMP)`,
        'producto sin empresa',
      )
      expect(producto.sqlState).toBe(NOT_NULL_VIOLATION)

      const presentacion = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "updated_at")
          VALUES (${`Sin empresa ${marcador}`}, ${`sinempresa${marcador}`}, CAST(${unitId} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion sin empresa',
      )
      expect(presentacion.sqlState).toBe(NOT_NULL_VIOLATION)

      // Se rechaza aunque su producto declare empresa: el lote tiene la suya propia. `lot` y
      // `purchase_date` van con valor porque tambien son NOT NULL y el 23502 podria salir por ellas.
      const lote = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "lot", "purchase_date", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, ${`L-${randomUUID()}`}, DATE '2026-09-01', CURRENT_TIMESTAMP)`,
        'lote sin empresa, con un producto que si la declara',
      )
      expect(lote.sqlState).toBe(NOT_NULL_VIOLATION)

      expect(
        await tx.product.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0)
      expect(
        await tx.presentation.count({ where: { nameNormalized: `sinempresa${marcador}` } }),
      ).toBe(0)
      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('rechaza con 23503 una empresa que no corresponde a ninguna existente, en las tres', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const companyId = await crearEmpresa(tx, marcador)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const productId = await crearProducto(tx, marcador, companyId)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, companyId, unitId)
      // Uuid valido sin fila detras: solo la FK puede rechazarlo.
      const inventada = randomUUID()

      // Crudo aunque la API tipada podria: por ella llegaria `P2003`, el codigo de Prisma, y no
      // el SQLSTATE.
      const producto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "products" ("name", "name_normalized", "company_id", "updated_at")
          VALUES (${`Empresa inventada ${marcador}`}, ${`inventada${marcador}`}, CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'producto con una empresa inexistente',
      )
      expect(producto.sqlState).toBe(FOREIGN_KEY_VIOLATION)

      const presentacion = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`Empresa inventada ${marcador}`}, ${`inventadapres${marcador}`}, CAST(${unitId} AS uuid), CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion con una empresa inexistente',
      )
      expect(presentacion.sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // Aqui pueden parar la fila el disparador `BEFORE` o la FK: importa que no se escriba, no
      // cual la para.
      const lote = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${inventada} AS uuid), CURRENT_TIMESTAMP)`,
        'lote con una empresa inexistente',
      )
      expect([FOREIGN_KEY_VIOLATION, CHECK_VIOLATION]).toContain(lote.sqlState)

      expect(await tx.product.count({ where: { companyId: inventada } })).toBe(0)
      expect(await tx.presentation.count({ where: { companyId: inventada } })).toBe(0)
      expect(await tx.productBatch.count({ where: { companyId: inventada } })).toBe(0)
    })
  })
})

describe('R22 — la empresa del lote tiene que ser la de su producto Y la de su presentacion', () => {
  it('rechaza el lote cuya empresa NO es la de su producto, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      // Una sola discrepancia, con el producto, para poder afirmar cual de los dos mensajes salio.
      const productId = await crearProducto(tx, `a${marcador}`, empresaA)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaB, unitId)

      // Crudo: solo el raw propaga el texto del `RAISE`, donde viaja la etiqueta.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${empresaB} AS uuid), CURRENT_TIMESTAMP)`,
        'lote de la empresa B colgado de un producto de la empresa A',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_product')
      // Si los dos mensajes fueran iguales, no se sabria cual salto.
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from_presentation')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('rechaza el lote cuya empresa NO es la de su presentacion, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      const productId = await crearProducto(tx, `a${marcador}`, empresaA)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaB, unitId)

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "product_batches" ("product_id", "presentation_id", "stock", "unit_cost", "company_id", "updated_at")
          VALUES (CAST(${productId} AS uuid), CAST(${presentationId} AS uuid), 1, 1.0000, CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'lote de la empresa A con una presentacion de la empresa B',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_presentation')
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from_product:')

      expect(await tx.productBatch.count({ where: { productId } })).toBe(0)
    })
  })

  it('acepta el lote cuando las tres empresas coinciden, y tambien rechaza el UPDATE que las separa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      // La misma unidad que la presentacion: sin ella, `product_batches_check_unit` rechazaria
      // el lote antes de llegar a lo que este caso mide.
      const productId = await crearProducto(tx, `a${marcador}`, empresaA, undefined, unitId)
      const presentationId = await crearPresentacion(tx, `p${marcador}`, empresaA, unitId)

      // Sin esta mitad, un disparador que rechazara siempre pasaria los casos anteriores.
      const batch = await tx.productBatch.create({
        data: {
          productId,
          presentationId,
          stock: 1,
          unitCost: new Prisma.Decimal('1.0000'),
          lot: `L-${randomUUID()}`,
          purchaseDate: new Date('2026-09-01T00:00:00Z'),
          companyId: empresaA,
        },
        select: { id: true },
      })
      expect(batch.id).toMatch(/^[0-9a-f-]{36}$/u)

      // Sin cubrir UPDATE, mover el lote de empresa seria la puerta de atras.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          UPDATE "product_batches" SET "company_id" = CAST(${empresaB} AS uuid)
           WHERE "id" = CAST(${batch.id} AS uuid)`,
        'mover un lote a otra empresa dejando su producto donde estaba',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('product_batches_company_differs_from_product')

      const releido = await tx.productBatch.findUniqueOrThrow({
        where: { id: batch.id },
        select: { companyId: true },
      })
      expect(releido.companyId).toBe(empresaA)
    })
  })
})

describe('R23 — la unidad de una presentacion es de su empresa o de sistema', () => {
  it('rechaza la presentacion cuya unidad pertenece a OTRA empresa, y lo dice por su nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unidadDeB = await crearUnidadDeEmpresa(tx, `b${marcador}`, empresaB)

      // La FK no mira de quien es la unidad, y la unidad existe: solo el disparador puede rechazar.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`Ajena ${marcador}`}, ${`ajena${marcador}`}, CAST(${unidadDeB} AS uuid), CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'presentacion de la empresa A con una unidad de la empresa B',
      )
      expect(rechazo.sqlState).toBe(CHECK_VIOLATION)
      expect(rechazo.texto).toContain('presentations_unit_foreign_company')
      expect(rechazo.texto).not.toContain('product_batches_company_differs_from')

      expect(await tx.presentation.count({ where: { nameNormalized: `ajena${marcador}` } })).toBe(0)
    })
  })

  it('acepta la unidad de SU empresa y la unidad DE SISTEMA', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const unidadDeA = await crearUnidadDeEmpresa(tx, `propia${marcador}`, empresaA)
      const unidadDeSistema = await crearUnidadDeSistema(tx, `sistema${marcador}`)

      // Sin esto, el caso anterior pasaria con un disparador que rechazara toda presentacion.
      const propia = await crearPresentacion(tx, `propia${marcador}`, empresaA, unidadDeA)
      const sistema = await crearPresentacion(tx, `sistema${marcador}`, empresaA, unidadDeSistema)

      const filas = await tx.presentation.findMany({
        where: { id: { in: [propia, sistema] } },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.every((fila) => fila.companyId === empresaA)).toBe(true)
    })
  })
})

describe('R20 — el nombre de presentacion es unico POR EMPRESA, no en todo el catalogo', () => {
  it('ACEPTA el mismo nombre normalizado en dos empresas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const empresaB = await crearEmpresa(tx, `b${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)

      const compartido = `garrafa20l${marcador}`
      const deA = await crearPresentacion(tx, compartido, empresaA, unitId)
      const deB = await crearPresentacion(tx, compartido, empresaB, unitId)

      const filas = await tx.presentation.findMany({
        where: { nameNormalized: compartido },
        select: { id: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(new Set(filas.map((fila) => fila.companyId))).toEqual(new Set([empresaA, empresaB]))
      expect(new Set([deA, deB]).size).toBe(2)
    })
  })

  it('RECHAZA con 23505 el mismo nombre normalizado dentro de la MISMA empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const unitId = await crearUnidadDeSistema(tx, marcador)
      const compartido = `garrafa20l${marcador}`
      const primera = await crearPresentacion(tx, compartido, empresaA, unitId)

      // Nombre original distinto y misma clave: choca el indice unico, no una comprobacion previa.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "unit_id", "company_id", "updated_at")
          VALUES (${`GARRAFA-20L ${marcador}`}, ${compartido}, CAST(${unitId} AS uuid), CAST(${empresaA} AS uuid), CURRENT_TIMESTAMP)`,
        'segunda presentacion con el mismo nombre normalizado en la misma empresa',
      )
      expect(rechazo.sqlState).toBe(UNIQUE_VIOLATION)

      const filas = await tx.presentation.findMany({
        where: { nameNormalized: compartido },
        select: { id: true },
      })
      expect(filas).toEqual([{ id: primera }])
    })
  })
})

describe('R21 — el nombre de producto no gana ninguna unicidad', () => {
  it('acepta dos productos con el mismo nombre DENTRO de la misma empresa', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const empresaA = await crearEmpresa(tx, `a${marcador}`)
      const nombre = `Sosa caustica ${marcador}`

      // Si alguien anadiera `UNIQUE (company_id, name_normalized)` a `products` por simetria con
      // `presentations`, este caso lo caza.
      const primero = await crearProducto(tx, marcador, empresaA, nombre)
      const segundo = await tx.product.create({
        data: { name: nombre, nameNormalized: `producto${marcador}`, companyId: empresaA },
        select: { id: true },
      })

      expect(new Set([primero, segundo.id]).size).toBe(2)
      const filas = await tx.product.findMany({
        where: { id: { in: [primero, segundo.id] } },
        select: { id: true, name: true, companyId: true },
      })
      expect(filas).toHaveLength(2)
      expect(filas.every((fila) => fila.name === nombre && fila.companyId === empresaA)).toBe(true)
    })
  })
})

describe('R3 — el backfill asigna TODAS las filas que ya existian a «QuimiCloud»', () => {
  it('rellena productos vivos, productos borrados, presentaciones y lotes, y no pierde ninguna fila', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()

      // Estado previo a la migracion dentro de la transaccion, para no desaplicarla en una base
      // compartida: en Postgres el DDL es transaccional y el ROLLBACK lo deshace.
      for (const tabla of ['products', 'presentations', 'product_batches']) {
        await tx.$executeRawUnsafe(
          `ALTER TABLE "${tabla}" ALTER COLUMN "company_id" DROP NOT NULL`,
        )
      }

      const unitId = await crearUnidadDeSistema(tx, marcador)
      const vivo = randomUUID()
      const borrado = randomUUID()
      const presentacion = randomUUID()
      const lote = randomUUID()

      // El borrado logico sigue siendo fila: un backfill que lo saltara impediria el `SET NOT NULL`.
      // La unidad va desde ya: sin ella, `product_batches_check_unit` rechazaria el lote de mas
      // abajo antes de llegar a lo que este caso mide (el backfill de empresa).
      await tx.$executeRawUnsafe(
        `INSERT INTO "products" ("id","name","name_normalized","unit_id","updated_at")
         VALUES ($1::uuid, $2, $3, $4::uuid, CURRENT_TIMESTAMP)`,
        vivo,
        `Vivo ${marcador}`,
        `vivo${marcador}`,
        unitId,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "products" ("id","name","name_normalized","deleted_at","updated_at")
         VALUES ($1::uuid, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        borrado,
        `Borrado ${marcador}`,
        `borrado${marcador}`,
      )
      await tx.$executeRawUnsafe(
        `INSERT INTO "presentations" ("id","name","name_normalized","unit_id","updated_at")
         VALUES ($1::uuid, $2, $3, $4::uuid, CURRENT_TIMESTAMP)`,
        presentacion,
        `Presentacion ${marcador}`,
        `presentacion${marcador}`,
        unitId,
      )
      // `lot` y `purchase_date` son NOT NULL y este caso solo afloja `company_id`.
      await tx.$executeRawUnsafe(
        `INSERT INTO "product_batches" ("id","product_id","presentation_id","stock","unit_cost","lot","purchase_date","updated_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 1.0000, $4, DATE '2026-09-01', CURRENT_TIMESTAMP)`,
        lote,
        vivo,
        presentacion,
        `L-${randomUUID()}`,
      )

      const antes = {
        productos: await tx.product.count(),
        presentaciones: await tx.presentation.count(),
        lotes: await tx.productBatch.count(),
        empresas: await tx.company.count(),
      }

      await tx.$executeRawUnsafe(BACKFILL)

      const quimicloud = await tx.company.findFirstOrThrow({
        where: { nameNormalized: 'quimicloud' },
        select: { id: true },
      })

      const productos = await tx.product.findMany({
        where: { id: { in: [vivo, borrado] } },
        select: { id: true, companyId: true, deletedAt: true },
      })
      expect(productos).toHaveLength(2)
      expect(productos.every((fila) => fila.companyId === quimicloud.id)).toBe(true)
      expect(productos.filter((fila) => fila.deletedAt !== null)).toHaveLength(1)

      const filaPresentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentacion },
        select: { companyId: true },
      })
      expect(filaPresentacion.companyId).toBe(quimicloud.id)

      const filaLote = await tx.productBatch.findUniqueOrThrow({
        where: { id: lote },
        select: { companyId: true },
      })
      expect(filaLote.companyId).toBe(quimicloud.id)

      expect({
        productos: await tx.product.count(),
        presentaciones: await tx.presentation.count(),
        lotes: await tx.productBatch.count(),
        empresas: await tx.company.count(),
      }).toEqual(antes)

      // Es la condicion que necesita el `SET NOT NULL` posterior.
      const nulos = await tx.$queryRaw<{ pendientes: bigint }[]>`
        SELECT (SELECT count(*) FROM "products"        WHERE "company_id" IS NULL)
             + (SELECT count(*) FROM "presentations"   WHERE "company_id" IS NULL)
             + (SELECT count(*) FROM "product_batches" WHERE "company_id" IS NULL) AS "pendientes"`
      expect(Number(nulos[0]?.pendientes ?? -1)).toBe(0)
    })
  })
})

describe('R7 — revertir con inventario de otra empresa aborta la reversion entera', () => {
  it('la guardia del down.sql lanza si hay una sola fila de una empresa que no es la del UP', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const ajena = await crearEmpresa(tx, `ajena${marcador}`)
      await crearProducto(tx, marcador, ajena)

      // Solo la guardia: los `DROP` del resto tomarian ACCESS EXCLUSIVE y bloquearian a las demas
      // sesiones de la base compartida mientras dura la transaccion del test.
      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRawUnsafe(GUARDIA_DEL_DOWN),
        'reversion con inventario de otra empresa',
      )
      expect(rechazo.texto).toContain('QC-49 down')

      const fila = await tx.product.findFirstOrThrow({
        where: { companyId: ajena },
        select: { companyId: true },
      })
      expect(fila.companyId).toBe(ajena)
    })
  })

  it('sin la comprobacion de filas ajenas, la guardia deja pasar: el test no es un placebo', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marcador = token()
      const ajena = await crearEmpresa(tx, `ajena${marcador}`)
      await crearProducto(tx, marcador, ajena)

      // Si la guardia sin esa comprobacion tambien abortara, el caso anterior estaria abortando
      // por otra cosa.
      const mutada = GUARDIA_DEL_DOWN.replace(
        /SELECT \(SELECT count\(\*\) FROM "products"[\s\S]*?INTO filas_ajenas;/,
        'filas_ajenas := 0;',
      )
      expect(mutada, 'la mutacion no cambio la guardia').not.toBe(GUARDIA_DEL_DOWN)

      await expect(tx.$executeRawUnsafe(mutada)).resolves.not.toThrow()
    })
  })
})
