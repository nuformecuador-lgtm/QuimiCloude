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
 * COSTO — QC-52 (R1) se llevo `cost`, `min_purchase` y `delivery_time` de `products`: son
 * terminos comerciales y viven en el catalogo del proveedor. Lo que este archivo hacia con
 * el costo -tratarlo como `Prisma.Decimal` y no como `number`- se hace ahora en
 * `tests/integration/proveedores/`, sobre la linea de catalogo. Aqui, en su lugar, hay un
 * CENSO del estado nuevo de `products` (R1, R2, R3): que las columnas que quedan son
 * exactamente esas, que `image_path` sigue ahi (R4), que sobreviven las cuatro FK y los dos
 * CHECK, que RLS sigue habilitada y forzada, y que no queda ninguna restriccion que
 * mencione una columna eliminada.
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
 * Normalizacion minima para satisfacer `presentations.name_normalized` (QC-20, NOT NULL
 * + indice unico) en estos tests de QC-14, que no verifican la normalizacion en si —eso
 * lo cierra `tests/unit/inventario/presentation-name.test.ts`—. Replica los mismos cuatro
 * pasos que `domain/presentation-name.ts` y el backfill SQL de la migracion de QC-20.
 */
function normalizeForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

/**
 * Crea una presentacion. El nombre NO es unico (decision cerrada del humano), asi que no
 * hace falta aleatorizarlo como se hacia con `roles.name` en `identity`.
 */
async function createPresentation(
  tx: Prisma.TransactionClient,
  name = 'Bidon 20 L',
): Promise<string> {
  const presentation = await tx.presentation.create({
    data: { name, nameNormalized: normalizeForTest(name) },
    select: { id: true },
  })
  return presentation.id
}

/**
 * Crea una unidad REAL dentro de la transaccion del test y devuelve su identificador.
 *
 * 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Donde estos tests
 * escribian `unit: 'kg'` (texto libre) ahora hay una FK de verdad
 * (`products_unit_id_fkey`), asi que un uuid inventado lo rechazaria la base con 23503: la
 * unidad hay que crearla. El nombre se aleatoriza porque `units.name_normalized` tiene
 * indice unico y la base local ya trae las unidades del seed arrancador.
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  symbol: string | null = 'kg',
): Promise<string> {
  const name = `unidad de prueba ${randomUUID()}`
  const unit = await tx.unit.create({
    data: { name, nameNormalized: normalizeForTest(name), symbol },
    select: { id: true },
  })
  return unit.id
}

/** Columnas de `products` que un alta cruda puede escribir (todas menos las marcas).
 *
 *  2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. `unit` (TEXT) ya no
 *  existe como columna; su sitio lo ocupa `unit_id` (UUID con FK). */
type ProductColumn = 'name' | 'stock' | 'qty_alert' | 'unit_id'

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
    WHERE schemaname = 'public' AND tablename IN ('products', 'presentations', 'units')`
  if (tables.length !== 3) {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva la
    // comprobacion previa —sin la migracion de QC-14 estos tests no pueden correr— y se le
    // suma `units`, de la que ahora dependen las altas de producto con unidad.
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de QC-14 (products y ' +
        'presentations) y QC-32 (units). Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('estructura de la presentacion', () => {
  it('crea una presentacion y su identificador no cambia al renombrarla', async () => {
    await inRolledBackTransaction(async (tx) => {
      const created = await tx.presentation.create({
        data: { name: 'Bidon 20 L', nameNormalized: normalizeForTest('Bidon 20 L') },
      })
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
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. El octavo dato
      // sigue siendo la unidad de medida (R3 de QC-14 intacto); lo que cambia es que hoy
      // es una referencia a `units` y hay que crear la unidad de verdad.
      const unitId = await createUnit(tx)
      const { id } = await tx.product.create({
        data: {
          name: 'Acido citrico monohidratado',
          presentationId,
          stock: 120,
          qtyAlert: 20,
          unitId,
        },
        select: { id: true },
      })

      // R3: los ocho datos viven en la MISMA fila de la MISMA tabla; no hay entidad
      // separada de «elemento de inventario» que haya que juntar con un join.
      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(product.name).toBe('Acido citrico monohidratado')
      expect(product.presentationId).toBe(presentationId)
      expect(product.stock).toBe(120)
      expect(product.qtyAlert).toBe(20)
      expect(product.unitId).toBe(unitId)
      expect(product.deletedAt).toBeNull()
      expect(product.id).toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('rechaza el alta si falta el nombre o la presentacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La unidad se usa
      // aqui, igual que antes, solo como MARCA para reconocer despues la fila que el alta
      // rechazada habria escrito. Antes la marca era el texto 'kg-sin-nombre'; ahora es el
      // id de una unidad creada para este test, porque `unit_id` tiene FK real.
      const unitId = await createUnit(tx)

      // Sin nombre: la unica columna obligatoria omitida es `name`.
      const withoutName = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsertProduct(
            tx,
            { unit_id: Prisma.sql`CAST(${unitId} AS uuid)` },
            presentationId,
          ),
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
        where: { OR: [{ unitId }, { name: 'Sin presentacion' }] },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta un producto sin existencia, cantidad de alerta ni unidad, y los devuelve como ausencia de valor', async () => {
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
      expect(product.qtyAlert).toBeNull()
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva
      // exactamente lo que R5 vigila —la unidad ausente vuelve como AUSENCIA de valor, no
      // como cero ni como cadena vacia (QC-32 R10)—, ahora sobre `unit_id`.
      expect(product.unitId).toBeNull()
      expect(product.stock).not.toBe(0)
      expect(product.qtyAlert).not.toBe(0)
      expect(product.unitId).not.toBe('')
    })
  })

  // QC-52 (R1) deroga QC-14 R6: `min_purchase` ya no es columna de `products`, asi que su
  // DEFAULT 0 no tiene nada que defender aqui. El caso no se relaja, se muda: el minimo de
  // compra vive hoy en la linea del catalogo del proveedor y alli tiene sus propias reglas.

  it('las dos columnas enteras que quedan son integer en information_schema', async () => {
    await inRolledBackTransaction(async (tx) => {
      // QC-52 (R1, R2): de las cuatro de QC-14 R7 quedan dos. `min_purchase` y
      // `delivery_time` se fueron con la migracion; `stock` y `qty_alert` conservan su tipo
      // exacto, que es lo que R2 exige (la misma forma y la misma opcionalidad).
      const types = await columnTypes(tx, 'products', ['stock', 'qty_alert'])
      // R7: el tipo REAL en la base, no el declarado en el esquema. `numeric` o
      // `double precision` harian caer esta lista.
      expect(types.map((type) => [type.column_name, type.data_type])).toEqual([
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

  // QC-52 (R1) deroga QC-14 R8 sobre `products`: no hay columna `cost` que pueda ser
  // `numeric(14,4)` ni cuatro decimales que conservar. La garantia no se pierde -el importe
  // se mudo a `supplier_catalog_lines.cost`, con el mismo `DECIMAL(14,4)`- y su test vive
  // ahora en `tests/integration/proveedores/`. Que la columna YA NO ESTE lo afirma el censo
  // del describe de QC-52 que cierra este archivo.

  it('rechaza existencia y cantidad de alerta negativas con SQLSTATE 23514', async () => {
    // QC-52 (R3): de los cuatro CHECK de no negatividad de QC-14 R9, los de `cost` y
    // `min_purchase` se fueron CON su columna -Postgres se lleva el CHECK que solo menciona
    // la columna borrada- y los dos que quedan tienen que seguir mordiendo igual.
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const negatives: readonly [ProductColumn, Prisma.Sql][] = [
        ['stock', Prisma.sql`${-1}`],
        ['qty_alert', Prisma.sql`${-1}`],
      ]

      for (const [column, value] of negatives) {
        const columns: Partial<Record<ProductColumn, Prisma.Sql>> = {
          name: Prisma.sql`${`negativo en ${column}`}`,
        }
        columns[column] = value

        // Un SAVEPOINT por caso: el 23514 aborta la transaccion entera y sin el no se
        // podria probar el siguiente. Cada alta pone UN solo valor negativo, asi que el
        // CHECK que salta es el de esa columna y no otro.
        const sqlState = await expectRejectedByDatabase(
          tx,
          () => rawInsertProduct(tx, columns, presentationId),
          `alta de producto con ${column} negativo`,
        )
        expect(sqlState, `columna "${column}"`).toBe(CHECK_VIOLATION)
      }

      // R9 «no crear ni modificar ninguna fila»: ninguno de los dos intentos escribio.
      const survivors = await tx.product.findMany({
        where: { name: { startsWith: 'negativo en ' } },
        select: { id: true },
      })
      expect(survivors).toEqual([])

      // El CHECK rechaza el negativo, no el cero ni el valor ausente: R5 y R6 conviven
      // con R9 porque en SQL un CHECK que evalua a NULL se cumple.
      const { id } = await tx.product.create({
        data: { name: 'Ceros y nulos', presentationId, stock: 0, qtyAlert: 0 },
        select: { id: true },
      })
      const zeroed = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(zeroed.stock).toBe(0)
      expect(zeroed.qtyAlert).toBe(0)
    })
  })

  it('acepta cualquier unidad del catalogo, sin restriccion por producto, y tambien un producto sin unidad', async () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este caso decia
    // «acepta cualquier TEXTO como unidad»; esa mitad de R10 de QC-14 —«texto libre»— es la
    // que el humano cambio. Lo que R10 vigilaba y SIGUE VIGENTE se conserva entero aqui:
    //   - NADA restringe que unidad puede usar cada producto (QC-32 R14): seis productos
    //     distintos, seis unidades cualesquiera del catalogo, y la base no opina;
    //   - la unidad NO se normaliza ni se sustituye al guardarla en el producto: vuelve
    //     TAL CUAL la que se asigno (la normalizacion vive en `units.name_normalized`, que
    //     es identidad del CATALOGO, no del producto);
    //   - un producto puede no declarar unidad (QC-32 R10).
    // Lo unico que ya no se puede probar es «cualquier texto»: hoy la columna es una FK y
    // un texto suelto ni siquiera es un uuid.
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      const symbols = ['kg', 'KG', 'Litros', 'bidon de 20 L', 'ug/mL', null]

      const unitIds: string[] = []
      const ids: string[] = []
      for (const symbol of symbols) {
        const unitId = await createUnit(tx, symbol)
        unitIds.push(unitId)
        const { id } = await tx.product.create({
          data: { name: `Producto en ${symbol ?? 'unidad sin simbolo'}`, presentationId, unitId },
          select: { id: true },
        })
        ids.push(id)
      }
      const stored = await tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, unitId: true },
      })
      // Cada producto conserva EXACTAMENTE la unidad que se le asigno: ni sustituida, ni
      // deducida de la presentacion, ni unificada con la de otro producto.
      expect(ids.map((id) => stored.find((row) => row.id === id)?.unitId)).toEqual(unitIds)
      expect(new Set(unitIds).size).toBe(symbols.length)

      const { id: withoutUnit } = await tx.product.create({
        data: { name: 'Sin unidad', presentationId },
        select: { id: true },
      })
      const bare = await tx.product.findUniqueOrThrow({ where: { id: withoutUnit } })
      expect(bare.unitId).toBeNull()
    })
  })

  it('guardar una cantidad de alerta por debajo de la existencia no cambia ninguna otra columna', async () => {
    await inRolledBackTransaction(async (tx) => {
      const presentationId = await createPresentation(tx)
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La fila sigue
      // teniendo TODAS sus columnas rellenas, que es lo que este caso necesita para poder
      // afirmar despues que ninguna cambio; solo cambia la forma de la unidad.
      const unitId = await createUnit(tx)
      const { id } = await tx.product.create({
        data: {
          name: 'Producto vigilado',
          presentationId,
          stock: 3,
          qtyAlert: 50,
          unitId,
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
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Igual que arriba:
      // la fila nace completa para que R17 pueda comprobar que el borrado logico no pierde
      // NINGUN dato, la unidad incluida.
      const unitId = await createUnit(tx, 'L')
      const { id } = await tx.product.create({
        data: {
          name: 'Producto que se retira',
          presentationId,
          stock: 9,
          qtyAlert: 1,
          unitId,
        },
        select: { id: true },
      })
      const before = await tx.product.findUniqueOrThrow({ where: { id } })

      const deletedAt = new Date()
      await tx.product.update({ where: { id }, data: { deletedAt } })

      const after = await tx.product.findUniqueOrThrow({ where: { id } })
      // R17: la fila sigue ahi ENTERA. Ningun dato se pierde; solo cambian las marcas.
      expect(after.deletedAt).toEqual(deletedAt)
      // QC-52 (R2): la fila conserva ENTERO lo que le queda -incluida `image_path`, que la
      // migracion no toca (R4)-. El `toEqual` sobre la fila completa es lo que lo cierra.
      expect(after.imagePath).toBeNull()
      expect({ ...after, deletedAt: null, updatedAt: before.updatedAt }).toEqual(before)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Nunca se pasan `createdAt` ni `updatedAt`: los rellenan el DEFAULT de la base y
      // el `@updatedAt` de Prisma.
      const presentation = await tx.presentation.create({
        data: { name: 'Caneca 5 L', nameNormalized: normalizeForTest('Caneca 5 L') },
      })
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


/**
 * QC-52 — censo del estado NUEVO de `products` contra Postgres real (R1, R2, R3, R4, R26).
 *
 * Los casos de arriba prueban COMPORTAMIENTO; este describe prueba ESTRUCTURA, que es lo
 * unico capaz de detectar que la migracion se llevo por delante algo que no debia. Todo se
 * lee de los catalogos del sistema (`information_schema`, `pg_constraint`, `pg_class`), no
 * del esquema Prisma: lo que importa es lo que hay EN LA BASE.
 *
 * Estos casos NO abren transaccion ni escriben nada: solo leen catalogo.
 */
describe('QC-52 — censo de products tras la migracion', () => {
  /** Columnas exactas que `products` debe tener despues de la migracion (R1, R2, R4). */
  const COLUMNAS_ESPERADAS = [
    'created_at',
    'created_by',
    'deleted_at',
    'id',
    'image_path',
    'name',
    'presentation_id',
    'qty_alert',
    'stock',
    'unit_id',
    'updated_at',
    'updated_by',
  ] as const

  /** Las tres que la migracion se llevo y que no pueden volver por ninguna via (R1). */
  const COLUMNAS_ELIMINADAS = ['cost', 'min_purchase', 'delivery_time'] as const

  async function nombresDeColumna(): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
      ORDER BY column_name`
    return rows.map((row) => row.column_name)
  }

  it('tiene exactamente las columnas que R1 y R2 dejan, ni una mas ni una menos', async () => {
    // R1 (las tres se fueron) y R2 (todo lo demas se queda, con su misma forma). Es una
    // igualdad, no un `toContain`: una columna de mas -o de menos- pone esto rojo.
    expect(await nombresDeColumna()).toEqual([...COLUMNAS_ESPERADAS])
    for (const columna of COLUMNAS_ELIMINADAS) {
      expect(await nombresDeColumna(), columna).not.toContain(columna)
    }
  })

  it('image_path sigue existiendo, es TEXT y sigue siendo anulable', async () => {
    // R4: la migracion no toca esa columna. Estaba desde
    // `20260903200000_product_image_path` y tiene que seguir exactamente igual -si el
    // drift del modelo Prisma hubiera colado un `DROP COLUMN "image_path"` entre los tres
    // que si queriamos, esto seria lo que lo delataria-.
    const [row] = await prisma.$queryRaw<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_path'`
    expect(row?.data_type).toBe('text')
    expect(row?.is_nullable).toBe('YES')
    expect(row?.column_default).toBeNull()
  })

  it('conserva las cuatro claves foraneas: presentacion, unidad y las dos de autoria', async () => {
    // R3. Son las que `prisma migrate dev` propone borrar en CADA generacion, porque
    // `unit_id`, `created_by` y `updated_by` son escalares sin `@relation` y el esquema no
    // las conoce. Si una auditoria del SQL bajara la guardia, este caso lo dice.
    const rows = await prisma.$queryRaw<{ conname: string; confrelid: string }[]>`
      SELECT c.conname, c.confrelid::regclass::text AS confrelid
      FROM pg_constraint c
      WHERE c.conrelid = 'public.products'::regclass AND c.contype = 'f'
      ORDER BY c.conname`
    expect(rows.map((row) => [row.conname, row.confrelid])).toEqual([
      ['products_created_by_fkey', 'users'],
      ['products_presentation_id_fkey', 'presentations'],
      ['products_unit_id_fkey', 'units'],
      ['products_updated_by_fkey', 'users'],
    ])
  })

  it('conserva los dos CHECK de no negatividad que quedan, y solo esos dos', async () => {
    // R3. Los de `cost` y `min_purchase` se fueron CON su columna, sin sentencia propia:
    // Postgres borra el CHECK que solo menciona la columna eliminada. Los de `stock` y
    // `qty_alert` no mencionan ninguna, asi que tienen que seguir enteros.
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass AND contype = 'c'
      ORDER BY conname`
    expect(rows.map((row) => row.conname)).toEqual([
      'products_qty_alert_non_negative',
      'products_stock_non_negative',
    ])
  })

  it('no queda ninguna restriccion que mencione una columna eliminada', async () => {
    // R3, segunda mitad, y es la que de verdad muerde: una restriccion residual que
    // nombrara `cost` habria dejado el esquema en un estado que ni la lista de columnas ni
    // la de CHECK detectan por si solas (p. ej. un indice, o un CHECK multicolumna). Se
    // mira el TEXTO de cada restriccion de la tabla y el de cada indice.
    const restricciones = await prisma.$queryRaw<{ conname: string; definicion: string }[]>`
      SELECT conname, pg_get_constraintdef(oid) AS definicion
      FROM pg_constraint WHERE conrelid = 'public.products'::regclass`
    const indices = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'products'`

    const textos = [
      ...restricciones.map((row) => [row.conname, row.definicion] as const),
      ...indices.map((row) => [row.indexname, row.indexdef] as const),
    ]
    // Ancla: si la consulta no devolviera nada, los `not.toContain` de abajo pasarian por
    // vacio y este caso seria un placebo.
    expect(textos.length).toBeGreaterThan(0)

    for (const [nombre, texto] of textos) {
      for (const columna of COLUMNAS_ELIMINADAS) {
        expect(`${nombre} :: ${texto}`, `${nombre} menciona "${columna}"`).not.toContain(columna)
      }
    }
  })

  it('RLS sigue habilitada Y forzada en products', async () => {
    // R26. `relforcerowsecurity` es la mitad que de verdad importa aqui: Prisma se conecta
    // como DUENO de la tabla, y a un dueno Postgres no le aplica RLS salvo con FORCE. La
    // migracion de esta ficha no contiene ninguna sentencia de RLS, asi que las dos banderas
    // tienen que seguir como las dejo QC-14.
    const [row] = await prisma.$queryRaw<
      { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE oid = 'public.products'::regclass`
    expect(row?.relrowsecurity).toBe(true)
    expect(row?.relforcerowsecurity).toBe(true)
  })
})
