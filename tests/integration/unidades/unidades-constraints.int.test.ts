/**
 * Tests de integracion de QC-32 (modelo-unidades) contra una base Postgres REAL, con la
 * migracion `20260903121404_units_catalog` aplicada.
 *
 * Los helpers de aislamiento son copia literal de
 * `tests/integration/recetas/recetas-constraints.int.test.ts` (QC-24), como manda
 * `tasks.md > T11`. Las razones son las mismas y se repiten aqui para que este archivo se
 * lea solo:
 *
 * AISLAMIENTO — cada `it` corre dentro de `prisma.$transaction` interactiva y termina
 * lanzando `RollbackSignal`, lo que hace que Prisma emita `ROLLBACK`: ninguna fila escrita
 * por un test sobrevive. Se usa la transaccion interactiva de Prisma (y no un cliente `pg`
 * aparte) porque asi se ejercita EXACTAMENTE el camino de datos de la app, y porque
 * `$executeRaw` dentro de la misma transaccion reutiliza la conexion, asi que el SQL crudo
 * comparte el aislamiento.
 *
 * NINGUNA AFIRMACION GLOBAL — no se afirma «la tabla esta vacia» ni «hay N filas en
 * total». Cada test mira solo las filas que el mismo sembro, localizadas por su `id` o por
 * un marcador irrepetible. La base local ya tiene el catalogo arrancador sembrado (cinco
 * unidades) y otras sesiones corren contra la MISMA base: un test que dependiera del seed
 * o de un conteo global cambiaria de color segun quien pase antes.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — `products.unit_id` -> `units` y
 * `recipe_lines.unit_id` -> `units` son FK REALES aunque el esquema Prisma las declare como
 * escalares sin `@relation` (`design.md` seccion 4.3, R18). Por eso cada caso crea dentro
 * de su propia transaccion la unidad, la presentacion, el producto y la receta que
 * necesita, con nombres marcados: NO se depende del seed ni del orden de los archivos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * casos exigen comprobar el estado DESPUES del rechazo («no crear ninguna fila»). Por eso
 * toda operacion que se espera que falle se envuelve en un `SAVEPOINT` y se deshace con
 * `ROLLBACK TO SAVEPOINT`, que deja la transaccion viva y permite seguir consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con `$executeRaw`,
 * por dos motivos: (1) omitir una columna obligatoria no se puede expresar con la API
 * tipada (no compilaria), y (2) solo el raw propaga el SQLSTATE de Postgres en `meta.code`.
 * La API tipada lo traduce a su propio codigo (`P2002`, `P2003`…) y el SQLSTATE se pierde
 * (`design.md` seccion 9, QC-24 seccion 10.1). Se afirma sobre el SQLSTATE y NUNCA sobre
 * el texto del mensaje: en esta maquina Postgres responde en espanol. Los caminos felices y
 * las lecturas si van con la API tipada, que es el camino real de la app.
 *
 * NOMBRE NORMALIZADO — `name_normalized` se escribe LITERAL en cada caso, sin llamar a
 * `normalizeUnitName`. Lo que aqui se prueba es el indice unico de la base (R5); el
 * algoritmo lo prueba `tests/unit/unidades/domain/unit-name.test.ts`. Si este archivo
 * importara la funcion, un fallo del algoritmo podria dejarlo verde.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase, porque
 * Prisma se conecta como dueno de las tablas (`design.md` seccion 9, `docs/architecture.md
 * > Acceso a datos y autorizacion`). R21 se cierra con el test estatico sobre el SQL y con
 * `tests/guards/guard-rls-force.test.ts`, no aqui: escribirlo seria un falso verde.
 *
 * Requisitos cubiertos: R1, R2, R3, R5, R6, R7, R9, R10, R11, R12, R13, R14 y R18 DE QC-32,
 * y R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R13, R14, R15 y R16 DE QC-76 (bloque final).
 *
 * AMPLIADO EL 2026-09-07 POR QC-76 (T5). Tres casos de QC-32 afirmaban lo que esta feature
 * deroga y se han REESCRITO, cada uno con su nota: el del simbolo compartido (ahora es unico
 * POR AMBITO, R15), la lista de columnas de `units` (seis -> nueve, R1/R3/R11) y la lista
 * exacta de FK que apuntan al catalogo (cuatro -> cinco, con `units_unit_id_fkey`, R8). El
 * helper `createUnit` dejo de usar `'kg'` como simbolo por defecto por lo mismo. Ninguna
 * asercion se ha debilitado.
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
/** QC-76: violacion de CHECK. Tambien lo levantan los `RAISE` del disparador de derivacion,
 *  con `ERRCODE = '23514'` a proposito (`design.md > 2.4`). */
const CHECK_VIOLATION = '23514'

/**
 * SQLSTATE del error. Se lee de `meta.code` y no del texto: el mensaje de Postgres esta
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test afirma
 * sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el efecto, y cada
 * caso se construye para que solo una restriccion pueda dispararlo.
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
// Datos de apoyo — las FK son reales, asi que cada caso siembra los suyos
// ---------------------------------------------------------------------------

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Simbolo irrepetible derivado de un marcador.
 *
 * NUEVO EL 2026-09-07 (QC-76 R15, decision cerrada 28): el simbolo pasa a ser UNICO dentro de
 * su ambito, y el catalogo arrancador ya ocupa `kg`, `g`, `L` y `mL` como unidades DE SISTEMA.
 * Un literal fijo en un caso de sistema —que es lo que este archivo escribia hasta hoy—
 * chocaria ahora contra el arrancador o contra otro caso, y el test se pondria rojo por una
 * razon que no es la suya. Los casos que SI prueban el choque de simbolos lo escriben a
 * proposito y a la vista.
 */
function symbolFor(marker: string): string {
  return `u${marker.slice(0, 8)}`
}

/**
 * Crea una unidad con la API tipada. El nombre lleva SIEMPRE un marcador irrepetible: los
 * indices unicos de nombre son por ambito (QC-76 R14), y todas las unidades que crea este
 * helper son DE SISTEMA salvo que se le pase empresa, asi que un nombre fijo chocaria contra
 * el catalogo arrancador ya sembrado o contra otro caso de este archivo.
 * `nameNormalized` se pasa a mano, sin llamar a `normalizeUnitName` (ver cabecera).
 *
 * AMPLIADO EL 2026-09-07 POR QC-76: el simbolo por defecto ya no es `'kg'` —chocaria con el
 * `kilogramo` de sistema del arrancador (R15)— sino uno derivado del marcador; y el helper
 * acepta `companyId`, `baseUnitId` y `factor` para que los casos nuevos siembren unidades de
 * empresa y derivadas sin escribir SQL crudo en el camino feliz.
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  marker: string,
  symbol: string | null = symbolFor(marker),
  extra: {
    readonly companyId?: string | null
    readonly baseUnitId?: string | null
    readonly factor?: string | null
  } = {},
): Promise<string> {
  const unit = await tx.unit.create({
    data: {
      name: `Unidad ${marker}`,
      nameNormalized: `unidad${marker}`,
      symbol,
      companyId: extra.companyId ?? null,
      baseUnitId: extra.baseUnitId ?? null,
      factor: extra.factor === undefined || extra.factor === null ? null : new Prisma.Decimal(extra.factor),
    },
    select: { id: true },
  })
  return unit.id
}

/**
 * Crea una empresa propia del caso. `companies` tiene borrado logico (QC-47) y su indice unico
 * de nombre es parcial sobre las vivas, asi que el marcador evita cualquier choque.
 */
async function createCompany(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const company = await tx.company.create({
    data: { name: `Empresa ${marker}`, nameNormalized: `empresa${marker}` },
    select: { id: true },
  })
  return company.id
}


/** Copia local de `normalizeProductName` (QC-57). NO se importa el original a proposito: lo
 *  que aqui se prueba es otra cosa, y si el algoritmo real se rompiera este archivo no debe
 *  quedar verde por arrastre. El algoritmo lo prueba
 *  `tests/unit/inventario/product-name.test.ts`. */
function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

/** Crea un producto con su presentacion propia. `products.name` no es unico (QC-14).
 *  `nameNormalized` (QC-57) es NOT NULL desde `<ts>_list_query_indexes`. */
async function createProduct(
  tx: Prisma.TransactionClient,
  unitId: string | null = null,
  name = 'Acido citrico monohidratado',
): Promise<string> {
  const product = await tx.product.create({
    data: { name, nameNormalized: normalizeProductNameForTest(name), unitId },
    select: { id: true },
  })
  return product.id
}

/** Crea una receta viva. `nameNormalized` se pasa a mano (ver cabecera). */
async function createRecipe(tx: Prisma.TransactionClient, marker: string): Promise<string> {
  const recipe = await tx.recipe.create({
    data: { name: `Receta ${marker}`, nameNormalized: `receta${marker}` },
    select: { id: true },
  })
  return recipe.id
}

/** Crea una linea con la API tipada. Devuelve el id para poder releerla por el. */
async function createLine(
  tx: Prisma.TransactionClient,
  recipeId: string,
  productId: string,
  unitId: string,
  quantity = '1.0000',
): Promise<string> {
  const line = await tx.recipeLine.create({
    data: { recipeId, productId, unitId, quantity: new Prisma.Decimal(quantity) },
    select: { id: true },
  })
  return line.id
}

/** Columnas que un alta cruda puede escribir en las tablas que toca esta feature. */
type WritableColumn =
  | 'id'
  | 'name'
  | 'name_normalized'
  | 'symbol'
  | 'unit_id'
  | 'recipe_id'
  | 'product_id'
  | 'quantity'
  // QC-76: las tres columnas nuevas de `units`. `factor` y `unit_id` van juntos o ninguno
  // (R2) y eso solo se puede intentar romper escribiendo una de las dos a pelo.
  | 'company_id'
  | 'factor'

/**
 * `INSERT` crudo. `columns` decide que se escribe: omitir una entrada es exactamente el
 * caso «falta un dato obligatorio», que la API tipada de Prisma no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL sin DEFAULT en las tres tablas (lo rellena
 * el cliente Prisma via `@updatedAt`, no la base). Desde QC-57,
 * `products.name_normalized` esta en el mismo caso y se rellena igual: si no, el rechazo que
 * cada caso busca llegaria antes como 23502 sobre ESA columna y el test dejaria de probar la
 * FK de unidad que dice probar. Se escribe vacia a proposito -aqui el producto es andamiaje-
 * y no choca con nada: esa columna NO tiene indice unico (QC-14 decision cerrada 6).
 */
function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'units' | 'products' | 'recipe_lines',
  columns: Partial<Record<WritableColumn, Prisma.Sql>>,
): Promise<number> {
  const entries = Object.entries(columns) as [WritableColumn, Prisma.Sql][]
  const names = entries.map(([name]) => Prisma.raw(`"${name}"`))
  const values = entries.map(([, value]) => value)

  if (table === 'products') {
    names.push(Prisma.raw('"name_normalized"'))
    values.push(Prisma.sql`${''}`)
  }
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
}

/** Forma REAL de unas columnas segun `information_schema`, no segun el esquema Prisma. */
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

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'units'`
  if (tables.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene aplicada la migracion de QC-32 (tabla `units`). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('la unidad como entidad del catalogo', () => {
  it('crea una unidad con nombre y simbolo y la relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const created = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: `kilogramo${marker}`,
          // QC-76 R15: el simbolo es unico por ambito y el arrancador ya ocupa `kg` como
          // unidad DE SISTEMA, que es el ambito de esta. Se marca; lo que el caso afirma
          // -que el simbolo se relee sin perdida- no cambia.
          symbol: symbolFor(marker),
        },
        select: { id: true },
      })

      // R1: identificador propio, estable y no derivado de los datos de negocio.
      expect(created.id).toMatch(UUID_SHAPE)

      const unit = await tx.unit.findUniqueOrThrow({ where: { id: created.id } })
      expect(unit.name).toBe(`Kilogramo ${marker}`)
      expect(unit.nameNormalized).toBe(`kilogramo${marker}`)
      expect(unit.symbol).toBe(symbolFor(marker))

      // «No derivado de sus datos de negocio»: renombrarla no cambia el identificador.
      const renamed = await tx.unit.update({
        where: { id: created.id },
        data: { name: `Kilo ${marker}`, symbol: `${symbolFor(marker)}b` },
        select: { id: true },
      })
      expect(renamed.id).toBe(created.id)

      const reread = await tx.unit.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true, symbol: true },
      })
      expect(reread).toEqual({ name: `Kilo ${marker}`, symbol: `${symbolFor(marker)}b` })
    })
  })

  it('rechaza una unidad sin nombre con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // SQL crudo a proposito: `tx.unit.create({ data: { nameNormalized } })` no
      // compilaria. La unica columna obligatoria que falta es `name`, asi que el 23502
      // solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsert(tx, 'units', { name_normalized: Prisma.sql`${marker}` }),
        'unidad sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: se busca lo que ese intento habria escrito, no el total.
      const survivors = await tx.unit.findMany({
        where: { nameNormalized: marker },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta una unidad sin simbolo y la relee con ausencia de valor, no con cadena vacia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const { id } = await tx.unit.create({
        data: { name: `Unidad ${marker}`, nameNormalized: `unidad${marker}` },
        select: { id: true },
      })

      // R3: la ausencia es ausencia. Ni cadena vacia ni relleno.
      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.symbol).toBeNull()
      expect(unit.symbol).not.toBe('')

      // Y lo que hay en la base es un NULL de verdad, no una cadena vacia disfrazada.
      const shape = await tx.$queryRaw<{ sin_simbolo: boolean; vacio: boolean }[]>`
        SELECT ("symbol" IS NULL) AS sin_simbolo,
               ("symbol" IS NOT DISTINCT FROM '') AS vacio
        FROM "units" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ sin_simbolo: true, vacio: false }])

      // La razon por la que entra: la columna es TEXT anulable, sin NOT NULL ni DEFAULT.
      const columns = await columnInfo(tx, 'units', ['symbol'])
      expect(columns).toEqual([
        { column_name: 'symbol', data_type: 'text', is_nullable: 'YES' },
      ])
    })
  })

  it('rechaza una segunda unidad con el mismo nombre normalizado con SQLSTATE 23505', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `mililitro${marker}`

      const { id: firstId } = await tx.unit.create({
        // El simbolo tambien lleva marcador (QC-76 R15): si las dos filas compartieran
        // simbolo, el 23505 podria venir del indice del SIMBOLO y no del NOMBRE, que es lo
        // que este caso prueba.
        data: { name: `mililitro ${marker}`, nameNormalized: normalized, symbol: symbolFor(marker) },
        select: { id: true },
      })

      // El nombre original es distinto («MILI-LITRO …» frente a «mililitro …»); lo que
      // choca es la clave normalizada, que es justo lo que R5 exige.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`MILI-LITRO ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            symbol: Prisma.sql`${`${symbolFor(marker)}b`}`,
          }),
        'segunda unidad con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // «No crear ni modificar ninguna fila»: solo sobrevive la primera, intacta.
      const rows = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, name: true, symbol: true },
      })
      expect(rows).toEqual([{ id: firstId, name: `mililitro ${marker}`, symbol: symbolFor(marker) }])
    })
  })

  it('acepta un nombre de 500 caracteres', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      expect(name).toHaveLength(500)

      const { id } = await tx.unit.create({
        data: { name, nameNormalized: name, symbol: symbolFor(marker) },
        select: { id: true },
      })

      const unit = await tx.unit.findUniqueOrThrow({ where: { id } })
      expect(unit.name).toBe(name)
      expect(unit.name).toHaveLength(500)

      // R6, la razon por la que entra: las dos columnas de texto son TEXT sin longitud
      // declarada. Cualquier limite de forma es validacion de aplicacion, no de columna.
      const columns = await columnInfo(tx, 'units', ['name', 'symbol'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['name', 'text'],
        ['symbol', 'text'],
      ])
    })
  })

  it('acepta dos unidades con el mismo simbolo en AMBITOS distintos, y ninguna @unique de Prisma', async () => {
    // REESCRITO EL 2026-09-07 POR QC-76, Y CAMBIA DE SENTIDO. ANTES afirmaba que dos
    // unidades CUALESQUIERA podian compartir simbolo: QC-32 (su R7 y su pregunta abierta 1)
    // dejo el simbolo deliberadamente SIN indice unico. LO DEROGA **R15** (decision cerrada
    // 28, que cierra esa pregunta abierta): el simbolo es UNICO cuando existe, con el MISMO
    // AMBITO que el nombre. Lo que SIGUE siendo cierto —y es lo que este caso conserva— es
    // que el mismo simbolo vale en DOS AMBITOS DISTINTOS: medirlo global haria que el «kg»
    // de sistema bloqueara el «kg» de una empresa que si puede tener su propio kilogramo.
    // El choque DENTRO del ambito lo prueba el bloque de QC-76 al final del archivo.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const symbol = `u${marker.slice(0, 6)}`
      const companyId = await createCompany(tx, marker)

      // Una de sistema y una de la empresa, con EL MISMO simbolo: dos ambitos distintos.
      const { id: deSistema } = await tx.unit.create({
        data: { name: `Primera ${marker}`, nameNormalized: `primera${marker}`, symbol },
        select: { id: true },
      })
      const { id: deEmpresa } = await tx.unit.create({
        data: { name: `Segunda ${marker}`, nameNormalized: `segunda${marker}`, symbol, companyId },
        select: { id: true },
      })

      const rows = await tx.unit.findMany({ where: { symbol }, select: { id: true } })
      expect(rows.map((row) => row.id).sort()).toEqual([deSistema, deEmpresa].sort())

      // El porque, ACTUALIZADO: los indices unicos que incluyen `symbol` son los DOS
      // PARCIALES de R15, cada uno con su mitad del ambito. Ninguno es total, y por eso las
      // dos filas de arriba conviven. Si alguien los sustituyera por un unico indice global
      // —o pusiera un `@unique` en el esquema Prisma, que es lo mismo pero peor porque
      // ademas no se ve en el SQL—, este caso se pondria rojo.
      const symbolUniqueIndexes = await tx.$queryRaw<{ indexname: string; indexdef: string }[]>`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'units'
          AND indexdef LIKE '%symbol%' AND indexdef LIKE '%UNIQUE%'
        ORDER BY indexname`
      expect(symbolUniqueIndexes.map((index) => index.indexname)).toEqual([
        'units_company_symbol_unique',
        'units_system_symbol_unique',
      ])
      // Los dos son PARCIALES: sin su `WHERE`, la unicidad dejaria de ser por ambito.
      for (const index of symbolUniqueIndexes) {
        expect(index.indexdef, `${index.indexname} debe ser parcial`).toMatch(/WHERE/i)
        expect(index.indexdef).toMatch(/symbol.*IS NOT NULL/i)
      }
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createUnit(tx, marker)

      const antes = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(antes.createdAt).toBeInstanceOf(Date)
      expect(antes.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.unit.update({ where: { id }, data: { symbol: `${symbolFor(marker)}b` } })

      const despues = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { createdAt: true, updatedAt: true },
      })
      expect(despues.createdAt.getTime()).toBe(antes.createdAt.getTime())
      expect(despues.updatedAt.getTime()).toBeGreaterThan(antes.updatedAt.getTime())
    })
  })
})

describe('el uso de la unidad desde inventario y recetas', () => {
  it('acepta un producto sin unidad y otro con unidad', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unitId = await createUnit(tx, marker)

      const sinUnidad = await createProduct(tx, null, 'Producto sin unidad declarada')
      const conUnidad = await createProduct(tx, unitId, 'Producto con unidad declarada')

      // R10: la unidad del producto es OPCIONAL, y la ausencia se guarda como ausencia.
      const sin = await tx.product.findUniqueOrThrow({
        where: { id: sinUnidad },
        select: { unitId: true },
      })
      const con = await tx.product.findUniqueOrThrow({
        where: { id: conUnidad },
        select: { unitId: true },
      })
      expect(sin.unitId).toBeNull()
      expect(con.unitId).toBe(unitId)

      // Y la columna lo permite: uuid anulable, y ninguna columna `unit` de texto.
      const columns = await columnInfo(tx, 'products', ['unit_id', 'unit'])
      expect(columns).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'YES' },
      ])
    })
  })

  it('rechaza una linea de receta sin unidad con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      // SQL crudo a proposito: omitir `unitId` en la API tipada no compilaria.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
          }),
        'linea de receta sin unidad',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: la receta se queda sin ninguna linea.
      const survivors = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(survivors).toEqual([])

      // R11, la razon: la columna es uuid OBLIGATORIO, al reves que la del producto.
      const columns = await columnInfo(tx, 'recipe_lines', ['unit_id', 'unit'])
      expect(columns).toEqual([
        { column_name: 'unit_id', data_type: 'uuid', is_nullable: 'NO' },
      ])
    })
  })

  it('rechaza un producto y una linea con unit_id inexistente con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const unitId = await createUnit(tx, marker)
      const productId = await createProduct(tx, unitId)
      const inventada = randomUUID()

      // R12 en el alta de producto. Crudo: por la API tipada Prisma traduciria el
      // SQLSTATE a su propio `P2003` y no se podria afirmar sobre `23503`.
      const productoConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'products', {
            name: Prisma.sql`${`Producto con unidad fantasma ${marker}`}`,
            unit_id: asUuid(inventada),
          }),
        'producto con unit_id inexistente',
      )
      expect(productoConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // R12 en el alta de linea.
      const lineaConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(inventada),
          }),
        'linea con unit_id inexistente',
      )
      expect(lineaConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // R12 tambien al EDITAR, no solo al dar de alta.
      const edicionConUnidadFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "products" SET "unit_id" = ${asUuid(inventada)} WHERE "id" = ${asUuid(productId)}`,
        'edicion de producto apuntando a una unidad inexistente',
      )
      expect(edicionConUnidadFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // «No crear ni modificar ninguna fila»: ninguno de los tres intentos dejo rastro.
      const productosDelIntento = await tx.product.findMany({
        where: { name: `Producto con unidad fantasma ${marker}` },
        select: { id: true },
      })
      expect(productosDelIntento).toEqual([])
      expect(await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })).toEqual([])
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unitId)
    })
  })

  it('rechaza el borrado de una unidad usada por un producto y por una linea con SQLSTATE 23503, y permite el de una unidad libre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDeProducto = await createUnit(tx, `p${marker}`)
      const unidadDeLinea = await createUnit(tx, `l${marker}`)
      const unidadLibre = await createUnit(tx, `x${marker}`, null)

      const productId = await createProduct(tx, unidadDeProducto)
      const recipeId = await createRecipe(tx, marker)
      const productoDeLaLinea = await createProduct(tx, null, 'Insumo de la linea')
      const lineId = await createLine(tx, recipeId, productoDeLaLinea, unidadDeLinea)

      // R13 — ON DELETE RESTRICT: la unidad en uso no se puede borrar. Crudo, para poder
      // afirmar sobre el SQLSTATE y no sobre el `P2003` que devolveria la API tipada.
      const usadaPorProducto = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDeProducto)}`,
        'borrado de una unidad usada por un producto',
      )
      expect(usadaPorProducto).toBe(FOREIGN_KEY_VIOLATION)

      const usadaPorLinea = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(unidadDeLinea)}`,
        'borrado de una unidad usada por una linea de receta',
      )
      expect(usadaPorLinea).toBe(FOREIGN_KEY_VIOLATION)

      // Nada se movio: ni las unidades, ni el producto, ni la linea.
      expect(await tx.unit.findUnique({ where: { id: unidadDeProducto } })).not.toBeNull()
      expect(await tx.unit.findUnique({ where: { id: unidadDeLinea } })).not.toBeNull()
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unidadDeProducto)
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true },
      })
      expect(linea.unitId).toBe(unidadDeLinea)

      // La otra mitad de R13: la que NO esta en uso si se borra. Sin esto, el test
      // pasaria igual con una tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: unidadLibre } })
      expect(await tx.unit.findUnique({ where: { id: unidadLibre } })).toBeNull()
    })
  })

  it('una linea puede usar una unidad distinta de la de su producto', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const unidadDelProducto = await createUnit(tx, `kg${marker}`)
      const unidadDeLaLinea = await createUnit(tx, `g${marker}`)

      const productId = await createProduct(tx, unidadDelProducto, 'Colorante azul')
      const recipeId = await createRecipe(tx, marker)
      const lineId = await createLine(tx, recipeId, productId, unidadDeLaLinea, '0.0100')

      // R14: la unidad es ANOTATIVA. La base no relaciona la de la linea con la del
      // producto, no convierte nada y no exige que coincidan.
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(unidadDelProducto)
      expect(linea.unitId).toBe(unidadDeLaLinea)
      expect(linea.unitId).not.toBe(producto.unitId)
      // La cantidad se guarda tal cual: nadie la convirtio de gramos a kilogramos.
      expect(linea.quantity.toString()).toBe('0.01')

      // ACTUALIZADO EL 2026-09-07 POR QC-76. ANTES este bloque afirmaba que la tabla tenia
      // exactamente SEIS columnas y que NO existia «ninguna columna de factor, base ni
      // equivalencia con la que convertir» (QC-32 R14, decision cerrada 12). LO DEROGAN R1,
      // R3 y R11: ahora son NUEVE, y tres de ellas son justamente la equivalencia y el
      // ambito. Lo que este caso prueba NO cambia: la unidad de la linea y la del producto
      // siguen sin relacionarse y la cantidad se guarda TAL CUAL, sin convertir (R26: nadie
      // llama todavia a la conversion). La lista sigue siendo EXACTA.
      const columns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'units'
        ORDER BY column_name`
      expect(columns.map((column) => column.column_name)).toEqual([
        'company_id',
        'created_at',
        'factor',
        'id',
        'name',
        'name_normalized',
        'symbol',
        'unit_id',
        'updated_at',
      ])
    })
  })
})

describe('frontera con unidades: FK reales sin relacion de Prisma', () => {
  it('la base rechaza un unit_id inexistente aunque Prisma no declare la relacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, marker)
      const productId = await createProduct(tx)

      const unidadFantasmaEnProducto = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'products', {
            name: Prisma.sql`${`Producto ${marker}`}`,
            unit_id: asUuid(randomUUID()),
          }),
        'producto con unit_id inventado',
      )
      expect(unidadFantasmaEnProducto).toBe(FOREIGN_KEY_VIOLATION)

      const unidadFantasmaEnLinea = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(randomUUID()),
          }),
        'linea con unit_id inventado',
      )
      expect(unidadFantasmaEnLinea).toBe(FOREIGN_KEY_VIOLATION)

      // El porque: las dos FK existen en la base —con ON DELETE RESTRICT (`confdeltype`
      // = 'r') y ON UPDATE CASCADE (`confupdtype` = 'c')— aunque el esquema Prisma
      // declare `unit_id` como escalar sin `@relation`. La integridad la da Postgres; el
      // ORM no puede atravesar la frontera con un `include` (R18, `design.md` 4.3).
      // El JOIN con `pg_namespace` acota la consulta al esquema `public` y NO es adorno:
      // `pg_constraint` es global a la BASE, no al esquema. La base de pruebas es
      // compartida y llego a tener un esquema espejo (`public_shadow_qc52`) con las
      // mismas tablas; sin este filtro cada FK aparecia DOS veces. No sirve confiar en
      // el `search_path` ni en `::regclass`, que solo cualifica cuando la tabla NO esta
      // en el path: por eso el sintoma era tan confuso.
      // Aqui se acota el esquema de las DOS puntas (`n` la tabla que declara la FK, `fn` la
      // referenciada) porque el predicado del caso es sobre la referenciada: son las FK de
      // `public` hacia `public.units`, no hacia cualquier tabla llamada `units`.
      const foreignKeys = await tx.$queryRaw<
        { conname: string; referencia: string; confdeltype: string; confupdtype: string }[]
      >`
        SELECT c.conname, ft.relname AS referencia, c.confdeltype::text, c.confupdtype::text
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_namespace fn ON fn.oid = ft.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND fn.nspname = 'public'
          AND ft.relname = 'units'
        ORDER BY c.conname`
      // ACTUALIZADO EL 2026-09-07: la decision humana de quitar la unidad del pedido dropeo
      // `orders_unit_id_fkey` con su columna, asi que la lista vuelve a TRES. Sigue siendo
      // EXACTA y con las mismas dos reglas —RESTRICT al borrar ('r'), CASCADE al actualizar
      // ('c')— que R13 de QC-32 exige de CUALQUIER referencia al catalogo.
      //
      // ACTUALIZADO EL 2026-09-04 POR QC-52
      // (`specs/QC-52-separar-producto-de-catalogo-de-proveedor/`). La lista era de TRES
      // —dos originales mas `orders_unit_id_fkey`, que sumo QC-33 el 2026-09-03— y sigue
      // siendo EXACTA: ahora son CUATRO. La nueva la trae QC-52, que da unidad propia a la
      // linea de catalogo del proveedor (`supplier_catalog_lines.unit_id`, R8 y R10) y por
      // eso anade `supplier_catalog_lines_unit_id_fkey`, con las mismas dos reglas que las
      // otras tres —RESTRICT al borrar ('r'), CASCADE al actualizar ('c')—, que es
      // justamente lo que R13 de QC-32 exige de CUALQUIER referencia al catalogo. Que la
      // columna sea anulable no afloja nada: la FK solo se verifica cuando hay valor. Va la
      // ultima porque la consulta ordena por `conname`. No se convierte en `toContain`: si
      // manana alguien anade una FK a `units` sin RESTRICT, o se pierde una de las cuatro en
      // un drift de `migrate dev`, este caso tiene que seguir siendo quien lo diga.
      //
      // ACTUALIZADO EL 2026-09-08 POR QC-76, Y ESTA VEZ LA LISTA SE ENCOGE Y CRECE A LA VEZ:
      //   - SALE `orders_unit_id_fkey`. La quito la feature de `pedidos` que retiro del pedido
      //     la unidad y el precio unitario (commit `dee47c1`, migracion
      //     `20260907120000_orders_drop_unit_and_unit_price`), **ya mergeada en `origin/dev`**.
      //     No es un drift ni un descuido de QC-76: `orders` ya no tiene `unit_id`, asi que
      //     esperarla seria esperar una FK que el dominio ya no quiere. Este caso hizo
      //     exactamente su trabajo -fue quien lo dijo- cuando la rama de QC-76, que nace de un
      //     `dev` anterior, se corrio contra la base de desarrollo ya adelantada.
      //   - ENTRA `units_unit_id_fkey`, la auto-referencia que trae esta ficha: la unidad de la
      //     que deriva otra (R8). Lleva las mismas dos reglas que las demas -RESTRICT al
      //     borrar, CASCADE al actualizar-, que es lo que hace cierto que no se pueda borrar
      //     una unidad de la que otra deriva.
      // Siguen siendo CUATRO, y sigue siendo una lista EXACTA.
      expect(foreignKeys).toEqual([
        {
          conname: 'products_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        {
          conname: 'recipe_lines_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        {
          conname: 'supplier_catalog_lines_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
        // La de QC-76, y es la primera que sale de la PROPIA tabla —`units.unit_id` ->
        // `units.id`, la unidad de la que deriva (R1)—. El RESTRICT es aqui la unica garantia
        // de R8: no se borra una unidad de la que otra deriva. Va la ultima porque la consulta
        // ordena por `conname`.
        {
          conname: 'units_unit_id_fkey',
          referencia: 'units',
          confdeltype: 'r',
          confupdtype: 'c',
        },
      ])
    })
  })
})

// ===========================================================================================
// QC-76 — equivalencia entre unidades y ambito por empresa
//
// AÑADIDO EL 2026-09-07 (`specs/QC-76-equivalencia-y-ambito-de-unidades/`, T5). Mismo patron
// que todo lo de arriba, sin inventar otro: transaccion que termina en ROLLBACK, savepoints
// para poder consultar DESPUES de un rechazo, SQL crudo para lo que la base tiene que
// rechazar —es lo unico que propaga el SQLSTATE—, marcadores irrepetibles y CERO afirmaciones
// globales sobre la tabla.
//
// Cada caso afirma el SQLSTATE EXACTO y no «lanza algo»:
//   23514 — violacion de CHECK. Incluye los `RAISE` del disparador `units_check_derivation`,
//           que lo levantan a proposito (`design.md > 2.4`) para que un rechazo de derivacion
//           se lea igual que un CHECK, que es lo que es.
//   23505 — violacion de indice unico (los cuatro parciales por ambito).
//   23503 — violacion de FK (`units_company_id_fkey`, `units_unit_id_fkey`).
//
// DOS TRAMPAS CONOCIDAS, y por que los casos estan escritos como estan:
//
//  1. La AUTO-DERIVACION de una unidad QUE YA ES PADRE no la rechaza
//     `units_no_self_derivation_check` sino el disparador, con
//     `units_derivation_parent_cannot_derive`: el `BEFORE` corre ANTES que el CHECK. Los dos
//     dan 23514, pero el caso de R7 usa una unidad HOJA para que el unico rechazo posible sea
//     el CHECK que dice probar.
//  2. Borrar una unidad DEL CATALOGO ARRANCADOR salta por `recipe_lines_unit_id_fkey` antes
//     que por `units_unit_id_fkey`, porque la base local tiene recetas que la usan. Por eso el
//     caso de R8 siembra SUS PROPIAS unidades y no toca `gramo` ni ninguna otra del seed.
//
// Cubre R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R13, R14, R15 y R16.
// ===========================================================================================

describe('QC-76 — la equivalencia entre unidades', () => {
  it('acepta una unidad BASE, sin unidad de la que derive y sin factor (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createUnit(tx, marker)

      // R1: los dos son OPCIONALES y una unidad que no declara ninguno es una unidad BASE.
      // Es el estado en el que quedan `mililitro` y `gramo` tras la migracion (R28).
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id },
        select: { baseUnitId: true, factor: true, companyId: true },
      })
      expect(unit.baseUnitId).toBeNull()
      expect(unit.factor).toBeNull()
      // Y sin empresa: la ausencia de valor —y nada mas— significa «de sistema» (R11).
      expect(unit.companyId).toBeNull()
    })
  })

  it('acepta una unidad derivada con la pareja completa y la relee sin perdida (R1)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1000.0000',
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: derivada },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(base)
      expect(unit.factor?.toString()).toBe('1000')
    })
  })

  it('rechaza la pareja incompleta en las DOS direcciones con SQLSTATE 23514 (R2)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)

      // Direccion 1: dice de que unidad deriva, pero no por cuanto. Media equivalencia no
      // convierte nada. El padre es valido, HOJA y del mismo ambito, asi que el disparador
      // pasa de largo y el unico rechazo posible es `units_derivation_pair_check`.
      const sinFactor = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sin factor ${marker}`}`,
            name_normalized: Prisma.sql`${`sinfactor${marker}`}`,
            unit_id: asUuid(base),
          }),
        'unidad con unidad base y sin factor',
      )
      expect(sinFactor).toBe(CHECK_VIOLATION)

      // Direccion 2: dice el factor, pero no de que unidad deriva. Aqui el disparador ni se
      // asoma (`NEW.unit_id` es NULL), asi que el rechazo solo puede venir del mismo CHECK.
      const sinBase = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sin base ${marker}`}`,
            name_normalized: Prisma.sql`${`sinbase${marker}`}`,
            factor: Prisma.sql`1000.0000`,
          }),
        'unidad con factor y sin unidad base',
      )
      expect(sinBase).toBe(CHECK_VIOLATION)

      // «No crear ni modificar ninguna fila».
      expect(
        await tx.unit.findMany({
          where: { nameNormalized: { in: [`sinfactor${marker}`, `sinbase${marker}`] } },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('conserva sin perdida un factor de CUATRO decimales (R3)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1234.5678',
      })

      // R3: decimal EXACTO, no coma flotante. `1234.5678` no es representable en binario: con
      // un `double precision` esta relectura devolveria `1234.5677999999999`.
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: derivada },
        select: { factor: true },
      })
      expect(unit.factor?.toString()).toBe('1234.5678')

      // Y el crudo dice lo mismo: no es el cliente quien lo esta arreglando al leer.
      const crudo = await tx.$queryRaw<{ factor: string }[]>`
        SELECT "factor"::text AS factor FROM "units" WHERE "id" = ${asUuid(derivada)}`
      expect(crudo).toEqual([{ factor: '1234.5678' }])

      // El porque: la columna es `numeric(14,4)`, la misma precision que el dinero de QC-33.
      const tipo = await tx.$queryRaw<
        { data_type: string; numeric_precision: number; numeric_scale: number }[]
      >`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'factor'`
      expect(tipo).toEqual([{ data_type: 'numeric', numeric_precision: 14, numeric_scale: 4 }])
    })
  })

  it('rechaza el factor 0 y el factor -1 con SQLSTATE 23514 (R4)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)

      // R4: con factor cero la conversion inversa seria una division por cero; con factor
      // negativo, una cantidad positiva se convertiria en negativa.
      for (const [etiqueta, factor] of [
        ['cero', '0.0000'],
        ['negativo', '-1.0000'],
      ] as const) {
        const sqlState = await expectRejectedByDatabase(
          tx,
          () =>
            rawInsert(tx, 'units', {
              name: Prisma.sql`${`Factor ${etiqueta} ${marker}`}`,
              name_normalized: Prisma.sql`${`factor${etiqueta}${marker}`}`,
              unit_id: asUuid(base),
              factor: Prisma.sql`CAST(${factor} AS numeric)`,
            }),
          `unidad con factor ${etiqueta}`,
        )
        expect(sqlState, `factor ${factor}`).toBe(CHECK_VIOLATION)
        expect(
          await tx.unit.findMany({
            where: { nameNormalized: `factor${etiqueta}${marker}` },
            select: { id: true },
          }),
        ).toEqual([])
      }
    })
  })

  it('acepta un factor MENOR que 1, sin normalizarlo (R5)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // La «media garrafa» de la decision cerrada 5: la unidad base NO tiene por que ser la
      // mas pequena de su familia, y nadie da la vuelta al factor por su cuenta.
      const garrafa = await createUnit(tx, `garrafa${marker}`)
      const media = await createUnit(tx, `media${marker}`, symbolFor(`m${marker}`), {
        baseUnitId: garrafa,
        factor: '0.5000',
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: media },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(garrafa)
      expect(unit.factor?.toString()).toBe('0.5')
      // Sin normalizar: la base sigue siendo la garrafa, no al reves.
      const base = await tx.unit.findUniqueOrThrow({
        where: { id: garrafa },
        select: { baseUnitId: true, factor: true },
      })
      expect(base).toEqual({ baseUnitId: null, factor: null })
    })
  })

  it('rechaza que una unidad HOJA derive de si misma con SQLSTATE 23514 (R7)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // HOJA a proposito: si la unidad ya fuera PADRE de otra, el rechazo llegaria antes por
      // el disparador (`units_derivation_parent_cannot_derive`, R6) y este caso dejaria de
      // probar `units_no_self_derivation_check`, que es lo que dice probar. El `BEFORE` corre
      // antes que el CHECK.
      const sola = await createUnit(tx, marker)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "units" SET "unit_id" = ${asUuid(sola)}, "factor" = 2.0000 WHERE "id" = ${asUuid(sola)}`,
        'unidad que deriva de si misma',
      )
      expect(sqlState).toBe(CHECK_VIOLATION)

      // «No modificar ninguna fila»: sigue siendo base.
      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: sola },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit).toEqual({ baseUnitId: null, factor: null })
    })
  })

  it('rechaza el segundo nivel de derivacion en las DOS direcciones con SQLSTATE 23514 (R6)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const base = await createUnit(tx, `base${marker}`)
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        baseUnitId: base,
        factor: '1000.0000',
      })
      const otraBase = await createUnit(tx, `otra${marker}`)

      // Direccion 1 — al declarar la unidad derivada: la nueva quiere derivar de `derivada`,
      // que ya deriva de `base`. Tonelada se declara como 1.000.000 de gramos, no como 1000
      // kilogramos (decision cerrada 6).
      const nieta = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Nieta ${marker}`}`,
            name_normalized: Prisma.sql`${`nieta${marker}`}`,
            unit_id: asUuid(derivada),
            factor: Prisma.sql`10.0000`,
          }),
        'unidad que deriva de una unidad ya derivada',
      )
      expect(nieta).toBe(CHECK_VIOLATION)
      expect(
        await tx.unit.findMany({ where: { nameNormalized: `nieta${marker}` }, select: { id: true } }),
      ).toEqual([])

      // Direccion 2 — al convertir en derivada una unidad de la que YA deriva alguna: `base`
      // es padre de `derivada`, asi que no puede pasar a derivar de `otraBase`. R6 nombra
      // explicitamente esta mitad, y sin ella la cadena de dos niveles entraria por la puerta
      // de atras con un UPDATE.
      const padreDerivado = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "units" SET "unit_id" = ${asUuid(otraBase)}, "factor" = 5.0000 WHERE "id" = ${asUuid(base)}`,
        'unidad padre que pasa a derivar de otra',
      )
      expect(padreDerivado).toBe(CHECK_VIOLATION)

      // Nada se movio: `base` sigue siendo base y `derivada` sigue colgando de ella.
      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: base },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: null, factor: null })
      expect(
        await tx.unit.findUniqueOrThrow({ where: { id: derivada }, select: { baseUnitId: true } }),
      ).toEqual({ baseUnitId: base })
    })
  })

  it('rechaza el borrado de una unidad de la que deriva otra con SQLSTATE 23503, y permite el de la hija (R8)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      // UNIDADES PROPIAS, nunca las del catalogo: borrar `gramo` en la base local salta por
      // `recipe_lines_unit_id_fkey` —hay recetas que lo usan— antes que por
      // `units_unit_id_fkey`, y el caso probaria la FK equivocada.
      const madre = await createUnit(tx, `madre${marker}`)
      const hija = await createUnit(tx, `hija${marker}`, symbolFor(`h${marker}`), {
        baseUnitId: madre,
        factor: '1000.0000',
      })

      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "units" WHERE "id" = ${asUuid(madre)}`,
        'borrado de una unidad de la que deriva otra',
      )
      // 23503 y no 23514: lo garantiza el `ON DELETE RESTRICT` de `units_unit_id_fkey`, no una
      // comprobacion previa al vuelo (decision cerrada 8, que extiende QC-32 D10).
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // «Conservar intactas las dos unidades y la referencia entre ellas».
      expect(await tx.unit.findUnique({ where: { id: madre }, select: { id: true } })).not.toBeNull()
      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: hija },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: madre, factor: new Prisma.Decimal('1000.0000') })

      // La otra mitad: sin hija, la madre se borra. Sin esto, el caso pasaria igual con una
      // tabla que no deja borrar nada nunca.
      await tx.unit.delete({ where: { id: hija } })
      await tx.unit.delete({ where: { id: madre } })
      expect(await tx.unit.findUnique({ where: { id: madre }, select: { id: true } })).toBeNull()
    })
  })
})

describe('QC-76 — el ambito por empresa', () => {
  it('acepta que una unidad de empresa derive de una suya o de una de sistema (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)

      const deSistema = await createUnit(tx, `sis${marker}`)
      const propia = await createUnit(tx, `pro${marker}`, symbolFor(`p${marker}`), { companyId })

      const desdeLaSuya = await createUnit(tx, `a${marker}`, symbolFor(`a${marker}`), {
        companyId,
        baseUnitId: propia,
        factor: '10.0000',
      })
      const desdeSistema = await createUnit(tx, `b${marker}`, symbolFor(`b${marker}`), {
        companyId,
        baseUnitId: deSistema,
        factor: '1000.0000',
      })

      const filas = await tx.unit.findMany({
        where: { id: { in: [desdeLaSuya, desdeSistema] } },
        select: { id: true, companyId: true, baseUnitId: true },
        orderBy: { nameNormalized: 'asc' },
      })
      expect(filas).toEqual([
        { id: desdeLaSuya, companyId, baseUnitId: propia },
        { id: desdeSistema, companyId, baseUnitId: deSistema },
      ])
    })
  })

  it('rechaza derivar de una unidad de OTRA empresa, y que una de sistema derive de una de empresa, con SQLSTATE 23514 (R9)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const deLaB = await createUnit(tx, `b${marker}`, symbolFor(`b${marker}`), {
        companyId: empresaB,
      })

      // Derivar de una unidad de OTRA empresa romperia el aislamiento: borrar algo en una
      // empresa afectaria a otra (decision cerrada 9).
      const ajena = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Ajena ${marker}`}`,
            name_normalized: Prisma.sql`${`ajena${marker}`}`,
            company_id: asUuid(empresaA),
            unit_id: asUuid(deLaB),
            factor: Prisma.sql`2.0000`,
          }),
        'unidad de una empresa que deriva de una unidad de otra',
      )
      expect(ajena).toBe(CHECK_VIOLATION)

      // La lectura literal de la misma decision: una unidad que vale para TODAS las empresas
      // no puede depender de la unidad privada de una de ellas.
      const sistemaDesdeEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sistema ${marker}`}`,
            name_normalized: Prisma.sql`${`sistema${marker}`}`,
            unit_id: asUuid(deLaB),
            factor: Prisma.sql`2.0000`,
          }),
        'unidad de sistema que deriva de una unidad de empresa',
      )
      expect(sistemaDesdeEmpresa).toBe(CHECK_VIOLATION)

      expect(
        await tx.unit.findMany({
          where: { nameNormalized: { in: [`ajena${marker}`, `sistema${marker}`] } },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('rechaza una unidad cuya empresa no existe con SQLSTATE 23503 (R13)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaFantasma = randomUUID()

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Fantasma ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasma${marker}`}`,
            company_id: asUuid(empresaFantasma),
          }),
        'unidad con una empresa inexistente',
      )
      // 23503: lo dice `units_company_id_fkey`. El escalar sin `@relation` del esquema Prisma
      // no impide nada por si mismo; la integridad la garantiza la FK real de la migracion.
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
      expect(
        await tx.unit.findMany({
          where: { nameNormalized: `fantasma${marker}` },
          select: { id: true },
        }),
      ).toEqual([])
    })
  })

  it('rechaza el mismo nombre normalizado DENTRO del ambito con SQLSTATE 23505 (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const normalized = `kilogramo${marker}`

      const { id: primera } = await tx.unit.create({
        data: { name: `Kilogramo ${marker}`, nameNormalized: normalized, companyId, symbol: null },
        select: { id: true },
      })

      // Dentro de la MISMA empresa: choca contra `units_company_name_unique`.
      const enLaEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`KILO-GRAMO ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
            company_id: asUuid(companyId),
          }),
        'segunda unidad con el mismo nombre normalizado en la misma empresa',
      )
      expect(enLaEmpresa).toBe(UNIQUE_VIOLATION)

      // Y entre las de SISTEMA: choca contra `units_system_name_unique`. El indice unico es
      // la unica garantia, no una comprobacion previa al vuelo —seria una carrera— (R14).
      const deSistema = `sistema${marker}`
      await tx.unit.create({
        data: { name: `Sistema ${marker}`, nameNormalized: deSistema, symbol: null },
        select: { id: true },
      })
      const entreSistema = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`SIS-TEMA ${marker}`}`,
            name_normalized: Prisma.sql`${deSistema}`,
          }),
        'segunda unidad de sistema con el mismo nombre normalizado',
      )
      expect(entreSistema).toBe(UNIQUE_VIOLATION)

      // «No crear ni modificar ninguna fila»: de la empresa sobrevive solo la primera.
      const filas = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, name: true },
      })
      expect(filas).toEqual([{ id: primera, name: `Kilogramo ${marker}` }])
    })
  })

  it('acepta el mismo nombre normalizado en DOS empresas y en una empresa frente a sistema (R14)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const normalized = `kilogramo${marker}`

      // Dos empresas pueden tener cada una su «kilogramo», y una empresa puede crear el suyo
      // aunque exista el de sistema (decision cerrada 14). Esto es lo que el indice GLOBAL de
      // QC-32 impedia y lo que su `DROP INDEX` abre.
      const deSistema = await tx.unit.create({
        data: { name: `Kilogramo ${marker}`, nameNormalized: normalized, symbol: null },
        select: { id: true },
      })
      const deLaA = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: normalized,
          companyId: empresaA,
          symbol: null,
        },
        select: { id: true },
      })
      const deLaB = await tx.unit.create({
        data: {
          name: `Kilogramo ${marker}`,
          nameNormalized: normalized,
          companyId: empresaB,
          symbol: null,
        },
        select: { id: true },
      })

      const filas = await tx.unit.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, companyId: true },
      })
      expect(filas.map((fila) => fila.id).sort()).toEqual(
        [deSistema.id, deLaA.id, deLaB.id].sort(),
      )
      expect(filas.filter((fila) => fila.companyId === null)).toHaveLength(1)
    })
  })

  it('rechaza el mismo simbolo DENTRO del ambito con SQLSTATE 23505 (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const symbol = `s${marker.slice(0, 6)}`

      await tx.unit.create({
        data: { name: `Primera ${marker}`, nameNormalized: `primera${marker}`, symbol, companyId },
        select: { id: true },
      })

      // Mismo simbolo, misma empresa: `units_company_symbol_unique`. El nombre es distinto a
      // proposito, para que el 23505 solo pueda venir del indice del SIMBOLO.
      const enLaEmpresa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Segunda ${marker}`}`,
            name_normalized: Prisma.sql`${`segunda${marker}`}`,
            symbol: Prisma.sql`${symbol}`,
            company_id: asUuid(companyId),
          }),
        'segunda unidad con el mismo simbolo en la misma empresa',
      )
      expect(enLaEmpresa).toBe(UNIQUE_VIOLATION)

      // Y entre las de sistema: `units_system_symbol_unique`.
      const symbolSistema = `t${marker.slice(0, 6)}`
      await tx.unit.create({
        data: {
          name: `Sistema uno ${marker}`,
          nameNormalized: `sistemauno${marker}`,
          symbol: symbolSistema,
        },
        select: { id: true },
      })
      const entreSistema = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'units', {
            name: Prisma.sql`${`Sistema dos ${marker}`}`,
            name_normalized: Prisma.sql`${`sistemados${marker}`}`,
            symbol: Prisma.sql`${symbolSistema}`,
          }),
        'segunda unidad de sistema con el mismo simbolo',
      )
      expect(entreSistema).toBe(UNIQUE_VIOLATION)
    })
  })

  it('acepta VARIAS unidades sin simbolo en el mismo ambito (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)

      // «Unico CUANDO EXISTE»: el `WHERE "symbol" IS NOT NULL` de los dos indices deja tantas
      // unidades sin simbolo como haga falta, en el mismo ambito. Sin el, la segunda de cada
      // par chocaria y una empresa solo podria tener UNA unidad sin simbolo.
      const sinSimboloEmpresa = [
        await createUnit(tx, `e1${marker}`, null, { companyId }),
        await createUnit(tx, `e2${marker}`, null, { companyId }),
        await createUnit(tx, `e3${marker}`, null, { companyId }),
      ]
      const sinSimboloSistema = [
        await createUnit(tx, `s1${marker}`, null),
        await createUnit(tx, `s2${marker}`, null),
      ]

      const filas = await tx.unit.findMany({
        where: { id: { in: [...sinSimboloEmpresa, ...sinSimboloSistema] } },
        select: { id: true, symbol: true },
      })
      expect(filas).toHaveLength(5)
      for (const fila of filas) expect(fila.symbol).toBeNull()
    })
  })

  it('acepta el MISMO simbolo en dos empresas distintas (R15)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const empresaA = await createCompany(tx, `a${marker}`)
      const empresaB = await createCompany(tx, `b${marker}`)
      const symbol = `s${marker.slice(0, 6)}`

      const deLaA = await createUnit(tx, `a${marker}`, symbol, { companyId: empresaA })
      const deLaB = await createUnit(tx, `b${marker}`, symbol, { companyId: empresaB })

      const filas = await tx.unit.findMany({ where: { symbol }, select: { id: true } })
      expect(filas.map((fila) => fila.id).sort()).toEqual([deLaA, deLaB].sort())
    })
  })

  it('marcar la empresa como borrada NO toca ninguna de sus unidades (R16)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const companyId = await createCompany(tx, marker)
      const base = await createUnit(tx, `base${marker}`, symbolFor(`b${marker}`), { companyId })
      const derivada = await createUnit(tx, `der${marker}`, symbolFor(`d${marker}`), {
        companyId,
        baseUnitId: base,
        factor: '1000.0000',
      })

      const antes = await tx.unit.findMany({
        where: { companyId },
        select: { id: true, companyId: true, baseUnitId: true, factor: true },
        orderBy: { nameNormalized: 'asc' },
      })

      // `companies` tiene borrado LOGICO (QC-47): ninguna fila desaparece de verdad, asi que
      // el `ON DELETE RESTRICT` de `units_company_id_fkey` no llega a intervenir. Justamente
      // por eso R16 hay que probarlo: nada impide que un dia alguien anada un `ON UPDATE` o
      // un disparador que vacie las unidades al marcar la empresa.
      await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } })

      const despues = await tx.unit.findMany({
        where: { companyId },
        select: { id: true, companyId: true, baseUnitId: true, factor: true },
        orderBy: { nameNormalized: 'asc' },
      })
      expect(despues).toEqual(antes)
      expect(despues.map((fila) => fila.id).sort()).toEqual([base, derivada].sort())
    })
  })
})

describe('QC-76 — cambiar la equivalencia de una unidad en uso', () => {
  it('permite cambiar factor y base con un producto y una linea de receta apuntando, sin invalidar nada (R10)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const enUso = await createUnit(tx, `uso${marker}`)
      const primeraBase = await createUnit(tx, `b1${marker}`)
      const segundaBase = await createUnit(tx, `b2${marker}`)

      const productId = await createProduct(tx, enUso, 'Colorante azul')
      const recipeId = await createRecipe(tx, marker)
      const lineId = await createLine(tx, recipeId, productId, enUso, '0.0100')

      // Primera equivalencia...
      await tx.unit.update({
        where: { id: enUso },
        data: { baseUnitId: primeraBase, factor: new Prisma.Decimal('1000.0000') },
      })
      // ...y se cambia el factor Y la base, con la unidad ya referenciada por los dos.
      await tx.unit.update({
        where: { id: enUso },
        data: { baseUnitId: segundaBase, factor: new Prisma.Decimal('0.2500') },
      })

      const unit = await tx.unit.findUniqueOrThrow({
        where: { id: enUso },
        select: { baseUnitId: true, factor: true },
      })
      expect(unit.baseUnitId).toBe(segundaBase)
      expect(unit.factor?.toString()).toBe('0.25')

      // R10: «ese cambio NO DEBE modificar ninguna cantidad ya guardada ni invalidar ninguna
      // fila existente». El producto y la linea guardan una REFERENCIA a la unidad, no una
      // cantidad ya convertida (decision cerrada 27, mismo criterio que QC-33 con el total del
      // pedido): no hay nada que invalidar y la cantidad sale tal cual se escribio.
      const producto = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { unitId: true },
      })
      expect(producto.unitId).toBe(enUso)
      const linea = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { unitId: true, quantity: true },
      })
      expect(linea.unitId).toBe(enUso)
      expect(linea.quantity.toString()).toBe('0.01')

      // Y se puede volver a dejar como unidad BASE: quitar la equivalencia entera tambien es
      // un cambio legal, siempre que los dos campos se quiten JUNTOS (R2).
      await tx.unit.update({ where: { id: enUso }, data: { baseUnitId: null, factor: null } })
      expect(
        await tx.unit.findUniqueOrThrow({
          where: { id: enUso },
          select: { baseUnitId: true, factor: true },
        }),
      ).toEqual({ baseUnitId: null, factor: null })
    })
  })
})
