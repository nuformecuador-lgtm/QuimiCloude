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
 * QC-80 (R1): `presentations.unit_id` es NOT NULL con FK a `units`, asi que toda
 * presentacion de apoyo necesita una unidad REAL. Se resuelve la unidad de sistema
 * `kilogramo` POR SU NOMBRE NORMALIZADO -nunca por un uuid escrito a mano: los
 * identificadores los genera `gen_random_uuid()` y son distintos en cada base-, que es
 * exactamente como la busca el relleno de la migracion. Ningun test de este archivo
 * afirma nada sobre la unidad de la presentacion: es solo lo que la columna exige.
 */
async function unidadDeSistema(db: Prisma.TransactionClient): Promise<string> {
  const unit = await db.unit.findFirstOrThrow({
    where: { nameNormalized: 'kilogramo', companyId: null },
    select: { id: true },
  })
  return unit.id
}

/**
 * Empresa del ANDAMIAJE (QC-49 R1).
 *
 * Las tres tablas de inventario ganaron `company_id` NOT NULL en
 * `<ts>_inventory_company_scope`, asi que sembrar un producto o una presentacion exige una
 * empresa. Se REUTILIZA una que ya existe en la base -`db:seed` deja la de instalacion- por el
 * mismo motivo por el que `unidadDeSistema` resuelve `kilogramo` por su nombre normalizado: no
 * se escribe ningun uuid a mano y no se deja residuo.
 *
 * Aqui la empresa es ANDAMIAJE y nada mas: ningun caso de este archivo afirma nada sobre ella.
 * El aislamiento por empresa lo prueba `company-scope.int.test.ts` (QC-49 T11).
 */
async function empresaDeAndamiaje(db: Prisma.TransactionClient): Promise<string> {
  const company = await db.company.findFirstOrThrow({ select: { id: true } })
  return company.id
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
  symbol?: string | null,
): Promise<string> {
  const name = `unidad de prueba ${randomUUID()}`
  const unit = await tx.unit.create({
    // ACTUALIZADO EL 2026-09-08 POR QC-76 (R15, decision cerrada 28): el simbolo pasa a ser
    // UNICO dentro del ambito cuando existe, y estas unidades se siembran SIN empresa —o sea DE
    // SISTEMA—. El defecto era el literal `'kg'`, que choca con `23505` contra el `kilogramo`
    // del catalogo arrancador Y contra si mismo en cuanto el helper se llama dos veces. Ahora
    // el defecto DERIVA DEL NOMBRE, que ya es irrepetible; quien pasa un simbolo explicito
    // —incluido `null`— sigue mandando. Ningun aserto de este archivo lee el valor del simbolo.
    data: {
      name,
      nameNormalized: normalizeForTest(name),
      symbol: symbol === undefined ? name : symbol,
    },
    select: { id: true },
  })
  return unit.id
}

/** Columnas de `products` que un alta cruda puede escribir (todas menos las marcas).
 *
 *  ACTUALIZADO EL 2026-09-11 POR QC-80 (R7, R21): `unit_id` sale de la lista porque sale de
 *  la TABLA -columna, indice y FK-. El producto ya no declara unidad: la declara la
 *  presentacion (R1) y la del producto se DERIVA del lote mas reciente (R22). `unit` (TEXT)
 *  se habia ido antes, en QC-32. `stock` sale con la migracion que quita la columna. */
type ProductColumn = 'name' | 'qty_alert'

/**
 * `INSERT INTO products` crudo. `columns` decide que se escribe: omitir una entrada es
 * exactamente el caso «falta un dato obligatorio». `updated_at` se da siempre porque es
 * NOT NULL sin DEFAULT (lo rellena el cliente Prisma via `@updatedAt`, no la base).
 * `name_normalized` se da siempre por lo mismo (QC-57): es NOT NULL y sin DEFAULT.
 */
async function rawInsertProduct(
  tx: Prisma.TransactionClient,
  columns: Partial<Record<ProductColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [ProductColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  // QC-49 (R1): `company_id` es NOT NULL sin DEFAULT, asi que va SIEMPRE, por el mismo motivo
  // que `name_normalized`: sin ella cualquier rechazo que un caso busque -el CHECK de
  // qty_alert negativo, el 23502 del nombre- llegaria antes como 23502 sobre ESTA columna y
  // el caso dejaria de probar lo que dice probar.
  names.push(Prisma.raw('"company_id"'))
  values.push(Prisma.sql`CAST(${await empresaDeAndamiaje(tx)} AS uuid)`)

  // `name_normalized` (QC-57) es NOT NULL sin DEFAULT: va SIEMPRE, como `updated_at`, o
  // cualquier rechazo que este helper busque llegaria antes como 23502 sobre ESTA columna y
  // el caso dejaria de probar lo que dice probar. Se escribe vacia a proposito: la busqueda
  // por nombre no es lo que aqui se afirma, y `products.name_normalized` no tiene indice
  // unico (el nombre del producto no es unico, QC-14 decision cerrada 6).
  names.push(Prisma.raw('"name_normalized"'))
  values.push(Prisma.sql`${''}`)
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
        data: {
          name: 'Bidon 20 L',
          nameNormalized: normalizeForTest('Bidon 20 L'),
          unitId: await unidadDeSistema(tx),
          companyId: await empresaDeAndamiaje(tx),
        },
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
      // El producto declara `unit_id` (fija, la de la presentacion de su primer lote) y
      // `stock` (guardada, recalculada por la aplicacion). Sin lotes -como este caso- las dos
      // nacen en su valor de "todavia nada": `unit_id` en NULL y `stock` en 0.
      const { id } = await tx.product.create({
        data: {
          name: 'Acido citrico monohidratado',
          nameNormalized: normalizeForTest('Acido citrico monohidratado'),
          qtyAlert: 20,
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })

      // R3: los datos viven en la MISMA fila de la MISMA tabla; no hay entidad separada de
      // «elemento de inventario» que haya que juntar con un join.
      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(product.name).toBe('Acido citrico monohidratado')
      expect(product.qtyAlert?.toFixed(4)).toBe('20.0000')
      expect(product.deletedAt).toBeNull()
      // `unit_id` existe como columna real de la tabla (uuid), y esta fila -sin lotes- la
      // tiene en NULL.
      expect(await columnTypes(tx, 'products', ['unit_id'])).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', numeric_precision: null, numeric_scale: null },
      ])
      expect(product.unitId).toBeNull()
      // `stock` existe y, sin lotes, vale 0.
      expect(product.stock.toFixed(4)).toBe('0.0000')
      expect(product.id).toMatch(/^[0-9a-f-]{36}$/u)
    })
  })

  it('rechaza el alta si falta el nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      // ACTUALIZADO EL 2026-09-11 POR QC-80 (R7): la MARCA con la que este caso reconocia la
      // fila del intento rechazado era `unit_id`, columna que ya no existe. Se sustituye por la
      // misma marca que usa el caso gemelo de la presentacion unas lineas mas arriba: un alta
      // sin nombre solo puede haber dejado una fila con `name` NULL, y esa se busca directa.

      // Sin nombre: la unica columna obligatoria omitida es `name`.
      const withoutName = await expectRejectedByDatabase(
        tx,
        () => rawInsertProduct(tx, { qty_alert: Prisma.sql`0` }),
        'alta de producto sin nombre',
      )
      expect(withoutName).toBe(NOT_NULL_VIOLATION)

      // R4 «no crear ninguna fila»: se busca lo que el intento habria escrito, no el total
      // de la tabla.
      const survivors = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "products" WHERE "name" IS NULL`
      expect(survivors).toEqual([])
    })
  })

  it('acepta un producto sin cantidad de alerta, la devuelve como ausencia de valor, y sin lotes su unidad y su existencia son NULL y 0 (R2, QC-121 R1, R8, R23)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const { id } = await tx.product.create({
        data: {
          name: 'Ficha recien abierta',
          nameNormalized: normalizeForTest('Ficha recien abierta'),
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })

      const product = await tx.product.findUniqueOrThrow({ where: { id } })
      // R5: ausencia de valor, NO cero y NO cadena vacia. `toBeNull` distingue las tres
      // cosas; un `toBeFalsy` las confundiria y el test no valdria nada.
      expect(product.qtyAlert).toBeNull()
      expect(product.qtyAlert).not.toBe(0)
      // `unit_id` es NULL mientras el producto no tenga ningun lote: no hay unidad que sacar
      // de ninguna presentacion todavia.
      expect(await columnTypes(tx, 'products', ['unit_id'])).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', numeric_precision: null, numeric_scale: null },
      ])
      expect(product.unitId).toBeNull()
      // Sin lotes, la existencia GUARDADA es 0.
      expect(product.stock.toFixed(4)).toBe('0.0000')
    })
  })

  // QC-52 (R1) deroga QC-14 R6: `min_purchase` ya no es columna de `products`, asi que su
  // DEFAULT 0 no tiene nada que defender aqui. El caso no se relaja, se muda: el minimo de
  // compra vive hoy en la linea del catalogo del proveedor y alli tiene sus propias reglas.

  it('QC-141 (5b): qty_alert es numeric(14,4) en information_schema y conserva la parte decimal', async () => {
    await inRolledBackTransaction(async (tx) => {
      // `qty_alert` deja de ser entero para compararse contra la existencia decimal sin
      // convertir ninguna de las dos.
      const types = await columnTypes(tx, 'products', ['qty_alert'])
      expect(types.map((type) => [type.column_name, type.data_type])).toEqual([
        ['qty_alert', 'numeric'],
      ])

      await rawInsertProduct(
        tx,
        { name: Prisma.sql`${'Con parte decimal'}`, qty_alert: Prisma.sql`${'7.4'}::numeric` },
      )
      const stored = await tx.product.findFirstOrThrow({
        where: { name: 'Con parte decimal' },
        select: { qtyAlert: true },
      })
      expect(stored.qtyAlert).not.toBeNull()
      expect(stored.qtyAlert?.toFixed(4)).toBe('7.4000')
    })
  })

  // QC-52 (R1) deroga QC-14 R8 sobre `products`: no hay columna `cost` que pueda ser
  // `numeric(14,4)` ni cuatro decimales que conservar. La garantia no se pierde -el importe
  // se mudo a `supplier_catalog_lines.cost`, con el mismo `DECIMAL(14,4)`- y su test vive
  // ahora en `tests/integration/proveedores/`. Que la columna YA NO ESTE lo afirma el censo
  // del describe de QC-52 que cierra este archivo.

  it('R2: rechaza cantidad de alerta negativa con SQLSTATE 23514', async () => {
    // QC-52 (R3): de los cuatro CHECK de no negatividad de QC-14 R9, los de `cost` y
    // `min_purchase` se fueron CON su columna, y `stock` se fue con la suya en esta ficha;
    // el que queda, `qty_alert`, tiene que seguir mordiendo igual.
    await inRolledBackTransaction(async (tx) => {
      const negatives: readonly [ProductColumn, Prisma.Sql][] = [
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
          () => rawInsertProduct(tx, columns),
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
        data: {
          name: 'Ceros y nulos',
          nameNormalized: normalizeForTest('Ceros y nulos'),
          qtyAlert: 0,
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })
      const zeroed = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(zeroed.qtyAlert?.toFixed(4)).toBe('0.0000')
    })
  })

  it('acepta cualquier unidad del catalogo, sin restriccion por presentacion, y ninguna presentacion se queda sin unidad (R1)', async () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este caso decia
    // «acepta cualquier TEXTO como unidad»; esa mitad de R10 de QC-14 --«texto libre»-- es la
    // que el humano cambio.
    //
    // TRASLADADO EL 2026-09-11 POR QC-80 (R1, R21). El SUJETO cambio: `products.unit_id` ya
    // no existe y quien declara unidad es la PRESENTACION. Lo que el caso vigila se traslada
    // entero a su sujeto nuevo:
    //   - NADA restringe que unidad puede usar cada presentacion: seis presentaciones
    //     distintas, seis unidades cualesquiera del catalogo, y la base no opina;
    //   - la unidad NO se normaliza ni se sustituye al guardarla: vuelve TAL CUAL la que se
    //     asigno (la normalizacion vive en `units.name_normalized`, que es identidad del
    //     CATALOGO);
    //   - la mitad que decia «un producto puede no declarar unidad» se INVIERTE, porque la
    //     regla se invirtio: ninguna presentacion puede quedarse sin unidad (R1), y el
    //     producto ya no tiene donde declararla (R21).
    await inRolledBackTransaction(async (tx) => {
      // Las cinco formas de texto que este caso quiere cubrir --minusculas, MAYUSCULAS, con
      // espacios, con barra-- mas la ausencia. Desde QC-76 R15 el simbolo es unico dentro del
      // ambito, y `'kg'` a secas chocaria con el `kilogramo` del arrancador, asi que cada una
      // lleva un marcador irrepetible. Las FORMAS se conservan enteras, que es lo que el caso
      // mide; `null` sigue tal cual porque el indice es parcial y varias unidades sin simbolo
      // en el mismo ambito siguen siendo legales.
      const marcaSimbolo = randomUUID()
      const symbols = [
        `kg ${marcaSimbolo}`,
        `KG ${marcaSimbolo}`,
        `Litros ${marcaSimbolo}`,
        `bidon de 20 L ${marcaSimbolo}`,
        `ug/mL ${marcaSimbolo}`,
        null,
      ]

      const unitIds: string[] = []
      const ids: string[] = []
      for (const [indice, symbol] of symbols.entries()) {
        const unitId = await createUnit(tx, symbol)
        unitIds.push(unitId)
        // El indice va en el nombre porque `presentations.name_normalized` SI tiene indice
        // unico -al reves que `products.name_normalized`, que es el que este caso usaba hasta
        // hoy-, y `kg …` y `KG …` normalizan a la MISMA clave: sin el indice, la segunda
        // presentacion del bucle chocaria con 23505 y el caso moriria por donde no mira.
        const name = `Presentacion ${String(indice)} en ${symbol ?? 'unidad sin simbolo'}`
        const { id } = await tx.presentation.create({
          data: {
            name,
            nameNormalized: normalizeForTest(name),
            unitId,
            companyId: await empresaDeAndamiaje(tx),
          },
          select: { id: true },
        })
        ids.push(id)
      }
      const stored = await tx.presentation.findMany({
        where: { id: { in: ids } },
        select: { id: true, unitId: true },
      })
      // Cada presentacion conserva EXACTAMENTE la unidad que se le asigno: ni sustituida, ni
      // deducida de otra cosa, ni unificada con la de otra presentacion.
      expect(ids.map((id) => stored.find((row) => row.id === id)?.unitId)).toEqual(unitIds)
      expect(new Set(unitIds).size).toBe(symbols.length)

      // R1 -- y la otra mitad, la que se invirtio: una presentacion SIN unidad no entra. Crudo
      // a proposito: omitir `unitId` con la API tipada no compilaria. `name_normalized` va
      // rellena, para que el 23502 solo pueda venir de `unit_id`.
      const sinUnidad = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "presentations" ("name", "name_normalized", "updated_at")
          VALUES ('Presentacion sin unidad', ${`sinunidad${marcaSimbolo}`}, CURRENT_TIMESTAMP)`,
        'presentacion sin unidad',
      )
      expect(sinUnidad).toBe(NOT_NULL_VIOLATION)
      expect(
        await tx.presentation.findMany({
          where: { nameNormalized: `sinunidad${marcaSimbolo}` },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('rechaza con 23503 el borrado de una unidad referenciada por una presentacion, y la presentacion sigue ahi (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      // R2 -- `presentations_unit_id_fkey` es ON DELETE RESTRICT. Crudo, para poder afirmar
      // sobre el SQLSTATE y no sobre el `P2003` que devolveria la API tipada; y sobre el
      // SQLSTATE y NUNCA sobre el texto, que en esta maquina viene en espanol.
      const marcador = randomUUID()
      const enUso = await createUnit(tx)
      const libre = await createUnit(tx)
      const nombre = `Bolsa marcada ${marcador}`
      const { id: presentationId } = await tx.presentation.create({
        data: {
          name: nombre,
          nameNormalized: normalizeForTest(nombre),
          unitId: enUso,
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })

      const rechazo = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = CAST(${enUso} AS uuid)`,
        'borrado de una unidad referenciada por una presentacion',
      )
      expect(rechazo).toBe(FOREIGN_KEY_VIOLATION)

      // Ni la unidad ni la presentacion se movieron, y la presentacion sigue apuntando a ella.
      expect(await tx.unit.findUnique({ where: { id: enUso }, select: { id: true } })).not.toBeNull()
      const presentacion = await tx.presentation.findUniqueOrThrow({
        where: { id: presentationId },
        select: { name: true, unitId: true },
      })
      expect(presentacion).toEqual({ name: nombre, unitId: enUso })

      // La otra mitad: la unidad que NO esta referenciada si se borra. Sin esto, el caso
      // pasaria igual con una tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: libre } })
      expect(await tx.unit.findUnique({ where: { id: libre }, select: { id: true } })).toBeNull()
    })
  })

  it('R2: cambiar la cantidad de alerta no cambia ninguna otra columna, y el producto no tiene existencia que derivar', async () => {
    await inRolledBackTransaction(async (tx) => {
      // La fila sigue teniendo TODAS sus columnas rellenas, que es lo que este caso necesita
      // para poder afirmar despues que ninguna cambio. QC-80 (R7) se llevo `unit_id` y esta
      // ficha se lleva `stock`: el `toEqual` sobre la fila entera sigue siendo la asercion
      // que muerde.
      const { id } = await tx.product.create({
        data: {
          name: 'Producto vigilado',
          nameNormalized: normalizeForTest('Producto vigilado'),
          qtyAlert: 50,
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })
      const before = await tx.product.findUniqueOrThrow({ where: { id } })

      await tx.product.update({ where: { id }, data: { qtyAlert: 10 } })

      const after = await tx.product.findUniqueOrThrow({ where: { id } })
      expect(after.qtyAlert?.toFixed(4)).toBe('10.0000')
      expect(after.deletedAt).toBeNull()
      // R11: la fila entera es identica salvo la propia alerta y la marca de
      // modificacion. Nada se derivo, nada se recalculo, nada se marco.
      expect({ ...after, qtyAlert: before.qtyAlert, updatedAt: before.updatedAt }).toEqual(before)
    })
  })
})

// La relacion producto -> presentacion se MUDA a `product_batches` el 2026-09-09: los casos
// que antes ejercitaban `products_presentation_id_fkey` (R13, R14, R15) viven ahora en
// `presentation-uniqueness.int.test.ts`, contra `product_batches_presentation_id_fkey`.

describe('nombre del producto', () => {
  it('acepta dos productos con el mismo nombre, y tambien con distintas mayusculas', async () => {
    await inRolledBackTransaction(async (tx) => {
      // Exactamente el mismo texto: sin indice unico, ni total ni parcial (R16). Se
      // aparta a proposito del precedente de `users`, donde esto seria 23505.
      const { id: first } = await tx.product.create({
        data: {
          name: 'Sosa caustica',
          nameNormalized: normalizeForTest('Sosa caustica'),
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })
      const { id: second } = await tx.product.create({
        data: {
          name: 'Sosa caustica',
          nameNormalized: normalizeForTest('Sosa caustica'),
          companyId: await empresaDeAndamiaje(tx),
        },
        select: { id: true },
      })
      // Y solo cambiando las mayusculas: tampoco hay indice unico funcional sobre
      // `lower(name)`, al reves que en `users`.
      const { id: third } = await tx.product.create({
        data: {
          name: 'SOSA CAUSTICA',
          nameNormalized: normalizeForTest('SOSA CAUSTICA'),
          companyId: await empresaDeAndamiaje(tx),
        },
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
      // Igual que arriba: la fila nace completa para que R17 pueda comprobar que el borrado
      // logico no pierde NINGUN dato. QC-80 (R7) se llevo `unit_id`, que ya no es uno de ellos.
      const { id } = await tx.product.create({
        data: {
          name: 'Producto que se retira',
          nameNormalized: normalizeForTest('Producto que se retira'),
          qtyAlert: 1,
          companyId: await empresaDeAndamiaje(tx),
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
        data: {
          name: 'Caneca 5 L',
          nameNormalized: normalizeForTest('Caneca 5 L'),
          unitId: await unidadDeSistema(tx),
          companyId: await empresaDeAndamiaje(tx),
        },
      })
      expect(presentation.createdAt).toBeInstanceOf(Date)
      expect(presentation.updatedAt).toBeInstanceOf(Date)

      const created = await tx.product.create({
        data: {
          name: 'Producto con marcas',
          nameNormalized: normalizeForTest('Producto con marcas'),
          companyId: await empresaDeAndamiaje(tx),
        },
      })
      expect(created.createdAt).toBeInstanceOf(Date)
      expect(created.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      const modified = await tx.product.update({
        where: { id: created.id },
        data: { qtyAlert: 42 },
      })
      expect(modified.qtyAlert?.toFixed(4)).toBe('42.0000')
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
 * Censo del estado NUEVO de `products` contra Postgres real (QC-52 R1, R2, R3, R4, R26;
 * QC-91 R2, R11).
 *
 * Los casos de arriba prueban COMPORTAMIENTO; este describe prueba ESTRUCTURA, que es lo
 * unico capaz de detectar que la migracion se llevo por delante algo que no debia. Todo se
 * lee de los catalogos del sistema (`information_schema`, `pg_constraint`, `pg_class`), no
 * del esquema Prisma: lo que importa es lo que hay EN LA BASE.
 *
 * Estos casos NO abren transaccion ni escriben nada: solo leen catalogo.
 */
describe('QC-52/QC-91 — censo de products tras las migraciones', () => {
  /** Columnas exactas que `products` debe tener tras las migraciones (R1, R2, R4 de QC-52;
   * la mudanza a `product_batches` del 2026-09-09; R2 de QC-91; y QC-121, que devuelve
   * `unit_id` y `stock` como columnas guardadas de nuevo). */
  const COLUMNAS_ESPERADAS = [
    // QC-49 (R1): `company_id`, NOT NULL con FK a `companies`. Todo producto es de UNA empresa.
    // La lista es una igualdad exacta, asi que es ella quien vigila que no desaparezca.
    'company_id',
    'created_at',
    'deleted_at',
    'id',
    'image_path',
    'name',
    // QC-57 (R19, R23): la columna normalizada de la BUSQUEDA del listado. La anade
    // `20260904160000_list_query_indexes`, es NOT NULL y NO tiene indice unico -el nombre
    // del producto no es unico, QC-14 decision cerrada 6-.
    'name_normalized',
    // La receta y la presentacion que identifican el producto terminado: las dos van
    // siempre juntas (o ninguna), lo vigila el CHECK de identidad mas abajo.
    'presentation_id',
    'qty_alert',
    'recipe_id',
    // La existencia guardada, suma de los lotes, que la aplicacion recalcula.
    'stock',
    // El tipo de producto (PRODUCT/MACHINE/PACKAGING/FINISHED_PRODUCT), la anade bc902800.
    'type',
    // La unidad del producto, fija desde su primer lote. Esta lista es una igualdad exacta,
    // asi que es ella quien vigila que no vuelva a desaparecer.
    'unit_id',
    'updated_at',
  ] as const

  /** Las que la migracion de QC-52/QC-91 se llevo y que no pueden volver por ninguna via
   *  (QC-52 R1, QC-91 R2). `stock` ya no esta aqui: esta en `COLUMNAS_ESPERADAS`. */
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

  it('sus claves foraneas son la de la empresa y la de la unidad, y ninguna mas', async () => {
    // Igualdad exacta y no `toContain`: una FK de mas o de menos la pone roja.
    const rows = await prisma.$queryRaw<{ conname: string; confrelid: string }[]>`
      SELECT c.conname, c.confrelid::regclass::text AS confrelid
      FROM pg_constraint c
      WHERE c.conrelid = 'public.products'::regclass AND c.contype = 'f'
      ORDER BY c.conname`
    expect(rows.map((row) => [row.conname, row.confrelid])).toEqual([
      ['products_company_id_fkey', 'companies'],
      // La identidad del producto terminado suma estas dos: la presentacion (compuesta con
      // company_id, mismo patron que order_presentation_lines_company_id_presentation_id_fkey) y la receta.
      ['products_company_id_presentation_id_fkey', 'presentations'],
      ['products_recipe_id_fkey', 'recipes'],
      ['products_unit_id_fkey', 'units'],
    ])

    // Ancla: la consulta SI ve las FK de esta base. Sin esto, un error de escritura en el
    // `regclass` devolveria vacio y el caso seria un placebo.
    const deLosLotes = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT c.conname FROM pg_constraint c
      WHERE c.conrelid = 'public.product_batches'::regclass AND c.contype = 'f'`
    expect(deLosLotes.length).toBeGreaterThan(0)
  })

  it('R2: conserva los CHECK de no negatividad de qty_alert y, de nuevo, de stock', async () => {
    // Los de `cost` y `min_purchase` se fueron CON su columna, sin sentencia propia: Postgres
    // borra el CHECK que solo menciona la columna eliminada. El de `qty_alert` no menciono
    // nunca ninguna de las eliminadas, asi que sigue entero.
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.products'::regclass AND contype = 'c'
      ORDER BY conname`
    expect(rows.map((row) => row.conname)).toEqual([
      // Ata `type = FINISHED_PRODUCT` a que `recipe_id` y `presentation_id` esten las dos
      // presentes, y a la inversa: ningun producto terminado sin identidad ni identidad
      // colgando de un producto que no lo sea.
      'products_finished_identity_matches_type',
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
