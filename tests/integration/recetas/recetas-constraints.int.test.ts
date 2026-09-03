/**
 * Tests de integracion de QC-24 (modelo-recetas) contra una base Postgres REAL, con la
 * migracion `20260902163256_recipes_and_recipe_lines` aplicada.
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
 * por un marcador irrepetible. Una base con catalogo cargado, o un test futuro que
 * siembre datos, no puede volverlos rojos.
 *
 * CADA CASO SIEMBRA SUS PROPIAS FK — las tres referencias que cruzan de modulo
 * (`recipe_lines.product_id` -> `products`, `recipes.created_by` / `updated_by` ->
 * `users`) son FK REALES aunque el esquema Prisma las declare como escalares sin
 * `@relation` (`design.md` seccion 4.1, R19). Por eso cada caso crea dentro de su propia
 * transaccion el tipo de documento, el rol, el usuario, la presentacion y el producto que
 * necesita: no se depende del seed ni del orden de los archivos.
 *
 * SAVEPOINTS — un error de constraint aborta la transaccion de Postgres entera, y varios
 * requisitos exigen comprobar el estado DESPUES del rechazo («no crear ninguna fila»:
 * R2, R14, R16). Por eso toda operacion que se espera que falle se envuelve en un
 * `SAVEPOINT` y se deshace con `ROLLBACK TO SAVEPOINT`, que deja la transaccion viva y
 * permite seguir consultando.
 *
 * SQL CRUDO — TODA operacion que se espera que la base rechace se hace con `$executeRaw`,
 * por dos motivos: (1) omitir una columna obligatoria no se puede expresar con la API
 * tipada de Prisma (no compilaria), y (2) solo el raw propaga el SQLSTATE de Postgres en
 * `meta.code`. La API tipada lo traduce a su propio codigo (`P2002`, `P2003`, `P2011`…) y
 * el SQLSTATE se pierde: un test escrito contra ella no podria afirmar sobre `23505` sin
 * caer en el texto del mensaje, que en esta maquina esta en espanol. Se afirma sobre el
 * SQLSTATE y NUNCA sobre el texto. Los caminos felices y las lecturas si van con la API
 * tipada, que es el camino real de la app.
 *
 * CANTIDAD — `quantity` se maneja siempre como `Prisma.Decimal` y se compara con
 * `.toString()` / `.equals()`, o contra `quantity::text` de la propia base. Convertirla a
 * `number` reintroduciria justo la coma flotante binaria que `docs/architecture.md >
 * Dominio` n.o 4 prohibe, y el test dejaria de demostrar R13.
 *
 * NOMBRE NORMALIZADO — `name_normalized` se escribe LITERAL en cada caso, sin llamar a
 * `normalizeRecipeName`. Lo que aqui se prueba es el indice unico parcial de la base
 * (R7, R9); el algoritmo lo prueba `tests/unit/recetas/domain/recipe-name.test.ts`. Si
 * este archivo importara la funcion, un fallo del algoritmo podria dejarlo verde.
 *
 * SIN TESTS DE RLS — un test de RLS escrito con Prisma sale verde pase lo que pase,
 * porque Prisma se conecta como dueno de las tablas (`design.md` seccion 10). R29 se
 * cierra con la guardia estatica sobre el SQL, no aqui.
 *
 * Requisitos cubiertos: R1, R2, R3, R4, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15,
 * R16, R19, R21, R22, R23, R24, R25, R26, R27 y R33.
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
 * traducido al idioma del servidor (en esta maquina, espanol). Por eso NINGUN test afirma
 * sobre el nombre de la restriccion: se afirma sobre el SQLSTATE y sobre el efecto, y
 * cada caso se construye para que solo una restriccion pueda dispararlo. Los nombres de
 * los CHECK, de los indices y de las FK los vigilan los tests estaticos sobre el SQL.
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
  // QC-20 anadio `presentations.name_normalized` NOT NULL con INDICE UNICO (su R17, R20).
  // Dos consecuencias para este helper, las dos de andamiaje y ninguna de significado:
  //   1. hay que escribir `nameNormalized` junto a `name`, porque la columna es NOT NULL;
  //   2. el nombre FIJO 'Bidon 20 L' ya no vale: este helper se llama VARIAS VECES en la
  //      misma transaccion (p. ej. tres seguidas en «una receta con tres lineas»), y la
  //      segunda chocaria contra el indice unico. Se marca con `token()`, que es
  //      irrepetible y de solo letras y digitos, asi que sobrevive a la normalizacion.
  // Se mantiene lo que el helper prometia: cada producto con su presentacion propia.
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

interface RecipeSeed {
  readonly name: string
  readonly nameNormalized: string
  readonly createdBy?: string | null
}

/**
 * Crea una receta viva. `nameNormalized` se pasa siempre a mano (ver cabecera): aqui se
 * prueba el indice de la base, no el algoritmo de normalizacion.
 */
async function createRecipe(tx: Prisma.TransactionClient, seed: RecipeSeed): Promise<string> {
  const recipe = await tx.recipe.create({
    data: {
      name: seed.name,
      nameNormalized: seed.nameNormalized,
      createdBy: seed.createdBy ?? null,
    },
    select: { id: true },
  })
  return recipe.id
}

/**
 * Crea una unidad REAL dentro de la transaccion del test y devuelve su identificador.
 *
 * 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Donde estos tests
 * escribian el texto 'kg' ahora hay una FK de verdad (`recipe_lines_unit_id_fkey`), asi que
 * un uuid inventado lo rechazaria la base con 23503: la unidad hay que crearla. El nombre
 * lleva `token()` porque `units.name_normalized` tiene indice unico y la base local ya trae
 * las unidades del seed arrancador.
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  symbol: string | null = 'kg',
): Promise<string> {
  const marca = token()
  const unit = await tx.unit.create({
    data: { name: `unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol },
    select: { id: true },
  })
  return unit.id
}

/** Crea una linea con la API tipada. Devuelve el id para poder releerla por el.
 *
 *  2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. El quinto parametro era
 *  el TEXTO de la unidad con `'kg'` por defecto; ahora es el ID de una unidad del catalogo, y
 *  si no se pasa se crea una para esa linea. La unidad SIGUE SIENDO OBLIGATORIA en toda linea
 *  (QC-32 R11): por eso el helper nunca puede dejarla sin poner. */
async function createLine(
  tx: Prisma.TransactionClient,
  recipeId: string,
  productId: string,
  quantity: string,
  unitId?: string,
): Promise<string> {
  const line = await tx.recipeLine.create({
    data: {
      recipeId,
      productId,
      quantity: new Prisma.Decimal(quantity),
      unitId: unitId ?? (await createUnit(tx)),
    },
    select: { id: true },
  })
  return line.id
}

/** Columnas que un alta cruda puede escribir en una de las dos tablas de la feature. */
type WritableColumn =
  | 'name'
  | 'name_normalized'
  | 'description'
  | 'steps'
  | 'image_path'
  | 'created_by'
  | 'updated_by'
  | 'recipe_id'
  | 'product_id'
  | 'quantity'
  // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La columna `unit`
  // (TEXT) ya no existe; su sitio lo ocupa `unit_id` (UUID con FK hacia `units`).
  | 'unit_id'

/**
 * `INSERT` crudo. `columns` decide que se escribe: omitir una entrada es exactamente el
 * caso «falta un dato obligatorio», que la API tipada de Prisma no deja ni compilar.
 * `updated_at` se da siempre porque es NOT NULL sin DEFAULT (lo rellena el cliente Prisma
 * via `@updatedAt`, no la base).
 */
function rawInsert(
  tx: Prisma.TransactionClient,
  table: 'recipes' | 'recipe_lines',
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
    WHERE schemaname = 'public' AND tablename IN ('recipes', 'recipe_lines', 'units')`
  if (tables.length !== 3) {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva la
    // comprobacion previa -sin la migracion de QC-24 estos tests no pueden correr- y se le
    // suma `units`, sin la cual ninguna linea de receta se puede escribir.
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de QC-24 (recipes y ' +
        'recipe_lines) y QC-32 (units). Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('estructura de la receta', () => {
  it('crea una receta con todos sus datos y los relee sin perdida', async () => {
    await inRolledBackTransaction(async (tx) => {
      const authorId = await createUser(tx)
      const marker = token()
      const steps = ['Pesar el tensioactivo', 'Diluir en agua', 'Ajustar el pH', 'Envasar']

      const created = await tx.recipe.create({
        data: {
          name: `Desengrasante industrial ${marker}`,
          nameNormalized: `desengrasanteindustrial${marker}`,
          description: 'Formula para limpieza de pisos de planta',
          steps,
          imagePath: 'recetas/desengrasante.png',
          createdBy: authorId,
          updatedBy: authorId,
        },
        select: { id: true },
      })

      // R1: identificador propio, estable y no derivado de los datos de negocio.
      expect(created.id).toMatch(UUID_SHAPE)

      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id: created.id } })
      expect(recipe.name).toBe(`Desengrasante industrial ${marker}`)
      expect(recipe.nameNormalized).toBe(`desengrasanteindustrial${marker}`)
      expect(recipe.description).toBe('Formula para limpieza de pisos de planta')
      expect(recipe.steps).toEqual(steps)
      expect(recipe.imagePath).toBe('recetas/desengrasante.png')
      expect(recipe.createdBy).toBe(authorId)
      expect(recipe.updatedBy).toBe(authorId)
      expect(recipe.deletedAt).toBeNull()

      // «No derivado de sus datos de negocio»: renombrarla no cambia el identificador, y
      // la fila se sigue encontrando por el mismo id despues del renombrado.
      const renamed = await tx.recipe.update({
        where: { id: created.id },
        data: { name: `Otro nombre ${marker}`, nameNormalized: `otronombre${marker}` },
        select: { id: true },
      })
      expect(renamed.id).toBe(created.id)

      const reread = await tx.recipe.findUniqueOrThrow({
        where: { id: created.id },
        select: { name: true },
      })
      expect(reread.name).toBe(`Otro nombre ${marker}`)
    })
  })

  it('rechaza una receta sin nombre con SQLSTATE 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      // SQL crudo a proposito: `tx.recipe.create({ data: { nameNormalized } })` no
      // compilaria. La unica columna obligatoria que falta es `name`, asi que el 23502
      // solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsert(tx, 'recipes', { name_normalized: Prisma.sql`${marker}` }),
        'receta sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      // «No crear ninguna fila»: se busca lo que ese intento habria escrito, no el total.
      const survivors = await tx.recipe.findMany({
        where: { nameNormalized: marker },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })

  it('acepta un nombre de 500 caracteres y una descripcion de 5000', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const name = marker + 'a'.repeat(500 - marker.length)
      const description = 'b'.repeat(5000)
      expect(name).toHaveLength(500)

      const { id } = await tx.recipe.create({
        data: { name, nameNormalized: name, description },
        select: { id: true },
      })

      // R3: el limite de 120/500 es validacion de aplicacion (QC-25), no de la columna.
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.name).toBe(name)
      expect(recipe.description).toBe(description)
      expect(recipe.description).toHaveLength(5000)

      // Y la razon por la que entra: las dos columnas son TEXT sin longitud declarada.
      const columns = await columnInfo(tx, 'recipes', ['name', 'description'])
      expect(columns.map((column) => [column.column_name, column.data_type])).toEqual([
        ['description', 'text'],
        ['name', 'text'],
      ])
    })
  })

  it('guarda un documento JSON arbitrario tal cual y devuelve la lista en el mismo orden', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const steps = ['1. Pesar', '2. Mezclar', '3. Reposar 24 h', '4. Envasar']

      const { id } = await tx.recipe.create({
        data: { name: `Lista ${marker}`, nameNormalized: `lista${marker}`, steps },
        select: { id: true },
      })

      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.steps).toEqual(steps)

      // El orden es el de la lista y lo conserva la propia base: jsonb reordena las
      // CLAVES de un objeto, no los elementos de un array (`design.md` seccion 2.1).
      const positions = await tx.$queryRaw<{ primero: string; tercero: string }[]>`
        SELECT "steps"->>0 AS primero, "steps"->>2 AS tercero
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(positions).toHaveLength(1)
      expect(positions[0]?.primero).toBe('1. Pesar')
      expect(positions[0]?.tercero).toBe('3. Reposar 24 h')

      // R4 en positivo: la base NO juzga la forma del documento (decision cerrada 10).
      // Un objeto que no es una lista de textos tambien se guarda tal cual.
      const raro = { nota: 'esto no es una lista', repeticiones: 3, anidado: { a: [1, 2] } }
      const { id: rareId } = await tx.recipe.create({
        data: { name: `Raro ${marker}`, nameNormalized: `raro${marker}`, steps: raro },
        select: { id: true },
      })
      const rareRecipe = await tx.recipe.findUniqueOrThrow({ where: { id: rareId } })
      expect(rareRecipe.steps).toEqual(raro)

      // Y no existe ninguna tabla separada de «paso» con la que juntarlos.
      const stepTables = await tx.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE '%step%'`
      expect(stepTables).toEqual([])
    })
  })

  it('una receta dada de alta sin pasos queda con lista vacia, no con ausencia de valor', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createRecipe(tx, { name: `Sin pasos ${marker}`, nameNormalized: marker })

      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.steps).toEqual([])
      expect(recipe.steps).not.toBeNull()

      // Lo que hay en la base es un array vacio, no un NULL disfrazado.
      const shape = await tx.$queryRaw<{ tipo: string; nulo: boolean }[]>`
        SELECT jsonb_typeof("steps") AS tipo, ("steps" IS NULL) AS nulo
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ tipo: 'array', nulo: false }])

      // Y la ausencia de valor no se puede escribir ni a proposito: la columna es NOT NULL.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`UPDATE "recipes" SET "steps" = NULL WHERE "id" = ${asUuid(id)}`,
        'dejar los pasos en ausencia de valor',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)
    })
  })

  it('acepta una receta sin imagen y otra con una direccion cualquiera', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()

      const sinImagen = await createRecipe(tx, {
        name: `Sin imagen ${marker}`,
        nameNormalized: `sinimagen${marker}`,
      })
      const { id: conImagen } = await tx.recipe.create({
        data: {
          name: `Con imagen ${marker}`,
          nameNormalized: `conimagen${marker}`,
          imagePath: 'https://storage.example.test/recetas/foto%20final.jpg',
        },
        select: { id: true },
      })

      expect((await tx.recipe.findUniqueOrThrow({ where: { id: sinImagen } })).imagePath).toBeNull()
      expect(
        (await tx.recipe.findUniqueOrThrow({ where: { id: conImagen } })).imagePath,
      ).toBe('https://storage.example.test/recetas/foto%20final.jpg')

      // R6: UNA sola columna de texto opcional, y ninguna otra columna de imagen. El
      // contenido del archivo no vive aqui.
      const imageColumns = await tx.$queryRaw<{ column_name: string; data_type: string }[]>`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recipes'
          AND (column_name LIKE '%image%' OR column_name LIKE '%imagen%')`
      expect(imageColumns).toEqual([{ column_name: 'image_path', data_type: 'text' }])
    })
  })
})

describe('unicidad del nombre de la receta', () => {
  it('rechaza una segunda receta con el mismo nombre normalizado con SQLSTATE 23505', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `desengrasante5${marker}`

      const firstId = await createRecipe(tx, {
        name: `Desengrasante 5 % ${marker}`,
        nameNormalized: normalized,
      })

      // El nombre original es distinto («desengrasante-5%-…» frente a «Desengrasante 5 %
      // …»); lo que choca es la clave normalizada, que es justo lo que R7 exige.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipes', {
            name: Prisma.sql`${`desengrasante-5%-${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
          }),
        'segunda receta con el mismo nombre normalizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // «No crear ni modificar ninguna fila»: solo sobrevive la primera.
      const rows = await tx.recipe.findMany({
        where: { nameNormalized: normalized },
        select: { id: true },
      })
      expect(rows).toEqual([{ id: firstId }])
    })
  })

  it('tras borrar logicamente una receta, otra puede usar su mismo nombre', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const normalized = `jabonliquido${marker}`

      const firstId = await createRecipe(tx, {
        name: `Jabon liquido ${marker}`,
        nameNormalized: normalized,
      })
      await tx.recipe.update({ where: { id: firstId }, data: { deletedAt: new Date() } })

      // El indice unico es PARCIAL (`WHERE deleted_at IS NULL`): borrar libera el nombre.
      const secondId = await createRecipe(tx, {
        name: `Jabon liquido ${marker}`,
        nameNormalized: normalized,
      })

      const rows = await tx.recipe.findMany({
        where: { nameNormalized: normalized },
        select: { id: true, deletedAt: true },
      })
      expect(rows).toHaveLength(2)
      expect(rows.filter((row) => row.deletedAt === null).map((row) => row.id)).toEqual([secondId])

      // Y la garantia sigue viva para la que quedo: una tercera choca contra la segunda.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipes', {
            name: Prisma.sql`${`Jabon liquido ${marker}`}`,
            name_normalized: Prisma.sql`${normalized}`,
          }),
        'tercera receta viva con el nombre ya reutilizado',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)
    })
  })
})

describe('estructura de la linea de receta', () => {
  it('crea una linea con cantidad y unidad propias y las relee', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La linea sigue
      // teniendo unidad PROPIA -es lo que R10 vigila-; hoy esa unidad es una referencia.
      const unitId = await createUnit(tx)

      const lineId = await createLine(tx, recipeId, productId, '2.5000', unitId)

      // R10: la pareja receta-producto es ENTIDAD PROPIA — tiene id propio, cantidad y
      // unidad propias y sus marcas de tiempo. No es una tabla de union sin datos.
      const line = await tx.recipeLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.id).toMatch(UUID_SHAPE)
      expect(line.recipeId).toBe(recipeId)
      expect(line.productId).toBe(productId)
      expect(line.quantity.equals(new Prisma.Decimal('2.5'))).toBe(true)
      expect(line.quantity.toString()).toBe('2.5')
      expect(line.unitId).toBe(unitId)
      expect(line.createdAt).toBeInstanceOf(Date)
      expect(line.updatedAt).toBeInstanceOf(Date)
    })
  })

  it('rechaza dos lineas del mismo producto en la misma receta con SQLSTATE 23505', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)

      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Dos unidades
      // DISTINTAS, igual que antes eran dos textos distintos ('kg' y 'L'): lo que este caso
      // demuestra es que el `@@unique(recipe_id, product_id)` no depende de la unidad.
      const unitId = await createUnit(tx)
      const otraUnidad = await createUnit(tx, 'L')
      const firstLine = await createLine(tx, recipeId, productId, '1.0000', unitId)

      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`3.0000`,
            unit_id: asUuid(otraUnidad),
          }),
        'segunda linea del mismo producto en la misma receta',
      )
      expect(sqlState).toBe(UNIQUE_VIOLATION)

      // «No crear ninguna fila»: la receta se queda con la linea que ya tenia.
      const lines = await tx.recipeLine.findMany({
        where: { recipeId },
        select: { id: true, unitId: true },
      })
      expect(lines).toEqual([{ id: firstLine, unitId }])
    })
  })

  it('acepta muchas lineas por receta y el mismo producto en dos recetas distintas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeA = await createRecipe(tx, { name: `Receta A ${marker}`, nameNormalized: `a${marker}` })
      const recipeB = await createRecipe(tx, { name: `Receta B ${marker}`, nameNormalized: `b${marker}` })

      const product1 = await createProduct(tx, 'Tensioactivo anionico')
      const product2 = await createProduct(tx, 'Hidroxido de sodio')
      const product3 = await createProduct(tx, 'Colorante azul')

      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este caso no habla
      // de la unidad: cada linea toma la suya del catalogo por el helper.
      await createLine(tx, recipeA, product1, '10.0000')
      await createLine(tx, recipeA, product2, '0.5000')
      await createLine(tx, recipeA, product3, '0.0100')
      await createLine(tx, recipeB, product1, '4.0000')

      // Sin limite de lineas por receta: se cuentan SOLO las de esta receta.
      const linesOfA = await tx.recipeLine.findMany({
        where: { recipeId: recipeA },
        select: { productId: true },
      })
      expect(linesOfA.map((line) => line.productId).sort()).toEqual(
        [product1, product2, product3].sort(),
      )

      // Y el mismo producto aparece en las dos recetas sin estorbarse.
      const usesOfProduct1 = await tx.recipeLine.findMany({
        where: { productId: product1 },
        select: { recipeId: true },
      })
      expect(usesOfProduct1.map((line) => line.recipeId).sort()).toEqual([recipeA, recipeB].sort())
    })
  })

  it('la cantidad conserva cuatro decimales exactos y su columna es numeric(14,4)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productoGrande = await createProduct(tx, 'Agua desmineralizada')
      const productoMinimo = await createProduct(tx, 'Catalizador')

      // 14 digitos de precision: 10 enteros + 4 decimales, el maximo que cabe.
      const grande = await createLine(tx, recipeId, productoGrande, '1234567890.1234')
      const minimo = await createLine(tx, recipeId, productoMinimo, '0.0001')

      const lines = await tx.recipeLine.findMany({
        where: { id: { in: [grande, minimo] } },
        select: { id: true, quantity: true },
      })
      const byId = new Map(lines.map((line) => [line.id, line.quantity]))
      expect(byId.get(grande)?.toString()).toBe('1234567890.1234')
      expect(byId.get(minimo)?.toString()).toBe('0.0001')

      // La misma comprobacion contra el texto que devuelve Postgres, sin pasar por el
      // cliente: si la columna fuera de coma flotante, aqui se veria la deriva.
      const asText = await tx.$queryRaw<{ id: string; cantidad: string }[]>`
        SELECT "id"::text AS id, "quantity"::text AS cantidad
        FROM "recipe_lines" WHERE "id" IN (${asUuid(grande)}, ${asUuid(minimo)})
        ORDER BY "quantity" DESC`
      expect(asText.map((row) => row.cantidad)).toEqual(['1234567890.1234', '0.0001'])

      const columns = await columnInfo(tx, 'recipe_lines', ['quantity'])
      expect(columns).toHaveLength(1)
      expect(columns[0]?.data_type).toBe('numeric')
      expect(Number(columns[0]?.numeric_precision)).toBe(14)
      expect(Number(columns[0]?.numeric_scale)).toBe(4)
    })
  })

  it('rechaza cantidad cero y negativa con SQLSTATE 23514, y cantidad ausente con 23502', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La unidad se pone
      // en los tres intentos, igual que antes se ponia 'kg', para que la UNICA razon posible
      // del rechazo sea la cantidad y no una unidad que falta.
      const unitId = await createUnit(tx)

      const cero = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`0.0000`,
            unit_id: asUuid(unitId),
          }),
        'linea con cantidad cero',
      )
      expect(cero).toBe(CHECK_VIOLATION)

      const negativa = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            quantity: Prisma.sql`-1.5000`,
            unit_id: asUuid(unitId),
          }),
        'linea con cantidad negativa',
      )
      expect(negativa).toBe(CHECK_VIOLATION)

      // Ausente: la columna es NOT NULL, asi que esto lo rechaza el NOT NULL (23502), no
      // el CHECK. Solo se puede expresar con SQL crudo.
      const ausente = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productId),
            unit_id: asUuid(unitId),
          }),
        'linea sin cantidad',
      )
      expect(ausente).toBe(NOT_NULL_VIOLATION)

      // «No crear ni modificar ninguna fila»: la receta se queda sin ninguna linea.
      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(lines).toEqual([])
    })
  })

  it('acepta cualquier unidad del catalogo, sin restriccion por producto, y rechaza la linea sin unidad', async () => {
    // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Este caso cubria R15
    // de QC-24, que decia «texto libre» porque el catalogo no existia. Esa mitad caduca. Lo
    // que R15 vigilaba y SIGUE VIGENTE se conserva entero aqui:
    //   - la unidad de la linea es OBLIGATORIA (QC-32 R11): sin ella, 23502;
    //   - es ANOTATIVA (QC-32 R14): la base acepta CUALQUIER unidad del catalogo en
    //     cualquier linea, no la deduce de la unidad del producto y no exige que coincidan
    //     -por eso cada producto se crea con una unidad distinta de la de su linea-;
    //   - y no hay ningun `enum` de Postgres del que tomarla: el catalogo es una tabla, que
    //     se puede ampliar sin desplegar (QC-32 `design.md > 8.5`).
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })

      const symbols = ['kg', 'gotas por litro', 'ug/mL', 'cucharadas soperas', null]
      for (const symbol of symbols) {
        const unidadDeLaLinea = await createUnit(tx, symbol)
        const unidadDelProducto = await createUnit(tx, 'kg')
        // El producto declara una unidad DISTINTA de la de su linea: nada las relaciona.
        const productId = await createProduct(tx, `Insumo ${symbol ?? 'sin simbolo'}`)
        await tx.product.update({
          where: { id: productId },
          data: { unitId: unidadDelProducto },
        })
        const lineId = await createLine(tx, recipeId, productId, '1.0000', unidadDeLaLinea)
        const line = await tx.recipeLine.findUniqueOrThrow({
          where: { id: lineId },
          select: { unitId: true },
        })
        expect(line.unitId).toBe(unidadDeLaLinea)
        expect(line.unitId).not.toBe(unidadDelProducto)
      }

      // Pero es OBLIGATORIA, a diferencia de la unidad del producto (QC-32 R10).
      const productoSinUnidad = await createProduct(tx, 'Insumo sin unidad de linea')
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(productoSinUnidad),
            quantity: Prisma.sql`1.0000`,
          }),
        'linea sin unidad',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

      const survivors = await tx.recipeLine.findMany({
        where: { productId: productoSinUnidad },
        select: { id: true },
      })
      expect(survivors).toEqual([])

      // Y el catalogo es una TABLA: no hay ningun tipo `enum` de Postgres de unidades.
      const unitTypes = await tx.$queryRaw<{ typname: string }[]>`
        SELECT t.typname FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'`
      expect(unitTypes).toEqual([])
    })
  })

  it('rechaza una linea sin receta, sin producto, o con receta o producto inexistentes (23502 / 23503)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. `trace` era un
      // TEXTO de unidad inventado que servia de MARCA para reconocer despues las filas que
      // los cuatro intentos habrian escrito. La marca sigue siendo la unidad -misma idea-,
      // pero ahora es el id de una unidad creada para este test, porque `unit_id` tiene FK.
      const trace = await createUnit(tx)

      const sinReceta = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(trace),
          }),
        'linea sin receta',
      )
      expect(sinReceta).toBe(NOT_NULL_VIOLATION)

      const sinProducto = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(trace),
          }),
        'linea sin producto',
      )
      expect(sinProducto).toBe(NOT_NULL_VIOLATION)

      const recetaInexistente = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(randomUUID()),
            product_id: asUuid(productId),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(trace),
          }),
        'linea con receta inexistente',
      )
      expect(recetaInexistente).toBe(FOREIGN_KEY_VIOLATION)

      const productoInexistente = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(randomUUID()),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(trace),
          }),
        'linea con producto inexistente',
      )
      expect(productoInexistente).toBe(FOREIGN_KEY_VIOLATION)

      // «No crear ninguna fila»: ninguno de los cuatro intentos dejo rastro.
      const survivors = await tx.recipeLine.findMany({
        where: { unitId: trace },
        select: { id: true },
      })
      expect(survivors).toEqual([])
    })
  })
})

describe('frontera con inventario e identity: FK reales sin relacion de Prisma', () => {
  it('la base rechaza un product_id y un created_by inexistentes con SQLSTATE 23503, aunque Prisma no declare la relacion', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. La unidad es
      // VALIDA a proposito, igual que antes se ponia 'kg': asi la unica FK que puede
      // dispararse es la del producto, que es lo que este caso demuestra.
      const unitId = await createUnit(tx)

      const productoFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipe_lines', {
            recipe_id: asUuid(recipeId),
            product_id: asUuid(randomUUID()),
            quantity: Prisma.sql`1.0000`,
            unit_id: asUuid(unitId),
          }),
        'linea con product_id inventado',
      )
      expect(productoFantasma).toBe(FOREIGN_KEY_VIOLATION)

      const autorFantasma = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipes', {
            name: Prisma.sql`${`Con autor fantasma ${marker}`}`,
            name_normalized: Prisma.sql`${`fantasma${marker}`}`,
            created_by: asUuid(randomUUID()),
          }),
        'receta con created_by inventado',
      )
      expect(autorFantasma).toBe(FOREIGN_KEY_VIOLATION)

      // El porque: las FK existen en la base aunque el esquema Prisma declare `product_id`,
      // `unit_id`, `created_by` y `updated_by` como escalares sin `@relation`. La integridad
      // la da Postgres; el ORM no puede atravesar la frontera con un `include`.
      //
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Eran cuatro FK y
      // son cinco. Se conserva entero lo que este caso vigila -la lista es CERRADA, asi que
      // si una migracion futura se lleva una FK por drift, o alguien anade una relacion a
      // escondidas, el test cae-, y la nueva `recipe_lines_unit_id_fkey` entra bajo el mismo
      // criterio: escalar sin `@relation` en Prisma, FK de verdad en Postgres (QC-32 R18).
      const foreignKeys = await tx.$queryRaw<{ conname: string; referencia: string }[]>`
        SELECT c.conname, ft.relname AS referencia
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        WHERE c.contype = 'f' AND t.relname IN ('recipes', 'recipe_lines')
        ORDER BY c.conname`
      expect(foreignKeys).toEqual([
        { conname: 'recipe_lines_product_id_fkey', referencia: 'products' },
        { conname: 'recipe_lines_recipe_id_fkey', referencia: 'recipes' },
        { conname: 'recipe_lines_unit_id_fkey', referencia: 'units' },
        { conname: 'recipes_created_by_fkey', referencia: 'users' },
        { conname: 'recipes_updated_by_fkey', referencia: 'users' },
      ])
    })
  })
})

describe('auditoria, borrado y marcas de tiempo', () => {
  it('registra autor y ultimo editor, y rechaza un autor inexistente con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)
      const editor = await createUser(tx)

      const { id } = await tx.recipe.create({
        data: {
          name: `Receta con autoria ${marker}`,
          nameNormalized: marker,
          createdBy: autor,
          updatedBy: autor,
        },
        select: { id: true },
      })

      await tx.recipe.update({ where: { id }, data: { updatedBy: editor } })

      const recipe = await tx.recipe.findUniqueOrThrow({
        where: { id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(recipe.createdBy).toBe(autor)
      expect(recipe.updatedBy).toBe(editor)

      // «SI se intenta registrar como autor un usuario inexistente, DEBE rechazar».
      const altaConAutorInventado = await expectRejectedByDatabase(
        tx,
        () =>
          rawInsert(tx, 'recipes', {
            name: Prisma.sql`${`Otra ${marker}`}`,
            name_normalized: Prisma.sql`${`otra${marker}`}`,
            created_by: asUuid(randomUUID()),
          }),
        'alta con autor inexistente',
      )
      expect(altaConAutorInventado).toBe(FOREIGN_KEY_VIOLATION)

      const edicionConEditorInventado = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "recipes" SET "updated_by" = ${asUuid(randomUUID())} WHERE "id" = ${asUuid(id)}`,
        'edicion con ultimo editor inexistente',
      )
      expect(edicionConEditorInventado).toBe(FOREIGN_KEY_VIOLATION)

      // Y la fila conserva la autoria buena despues de los dos rechazos.
      const afterRejects = await tx.recipe.findUniqueOrThrow({
        where: { id },
        select: { createdBy: true, updatedBy: true },
      })
      expect(afterRejects).toEqual({ createdBy: autor, updatedBy: editor })
    })
  })

  it('crea una receta sin autor y la relee con autor ausente, no con cero ni cadena vacia', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const id = await createRecipe(tx, { name: `Importada ${marker}`, nameNormalized: marker })

      // R33: `NULL` significa «no la creo una persona» (una importacion, un seed).
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.createdBy).toBeNull()
      expect(recipe.updatedBy).toBeNull()
      expect(recipe.createdBy).not.toBe('')
      expect(recipe.updatedBy).not.toBe('')

      // Ausencia de verdad en la propia base, no una cadena vacia ni un uuid de relleno.
      const shape = await tx.$queryRaw<{ sin_autor: boolean; sin_editor: boolean }[]>`
        SELECT ("created_by" IS NULL) AS sin_autor, ("updated_by" IS NULL) AS sin_editor
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ sin_autor: true, sin_editor: true }])

      // Que sea anulable NO afloja la integridad: una FK solo verifica las filas CON
      // valor, asi que un autor presente sigue teniendo que existir.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () =>
          tx.$executeRaw`UPDATE "recipes" SET "created_by" = ${asUuid(randomUUID())} WHERE "id" = ${asUuid(id)}`,
        'poner un autor inexistente sobre una receta sin autor',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)
    })
  })

  it('el borrado logico conserva la fila completa de la receta y marca deleted_at', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const autor = await createUser(tx)
      const steps = ['Pesar', 'Mezclar']

      const { id } = await tx.recipe.create({
        data: {
          name: `Receta a borrar ${marker}`,
          nameNormalized: marker,
          description: 'Descripcion que no se puede perder',
          steps,
          imagePath: 'recetas/borrada.png',
          createdBy: autor,
          updatedBy: autor,
        },
        select: { id: true },
      })

      const antes = new Date()
      await tx.recipe.update({ where: { id }, data: { deletedAt: new Date() } })

      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.deletedAt).toBeInstanceOf(Date)
      expect(recipe.deletedAt?.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 1000)
      // Ningun dato se destruye: la fila sigue entera.
      expect(recipe.name).toBe(`Receta a borrar ${marker}`)
      expect(recipe.nameNormalized).toBe(marker)
      expect(recipe.description).toBe('Descripcion que no se puede perder')
      expect(recipe.steps).toEqual(steps)
      expect(recipe.imagePath).toBe('recetas/borrada.png')
      expect(recipe.createdBy).toBe(autor)
      expect(recipe.updatedBy).toBe(autor)
    })
  })

  it('created_at y updated_at se rellenan solos y updated_at cambia al modificar, en las dos tablas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      const lineId = await createLine(tx, recipeId, productId, '1.0000')

      const recipeAntes = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineAntes = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })
      expect(recipeAntes.createdAt).toBeInstanceOf(Date)
      expect(recipeAntes.updatedAt).toBeInstanceOf(Date)
      expect(lineAntes.createdAt).toBeInstanceOf(Date)
      expect(lineAntes.updatedAt).toBeInstanceOf(Date)

      await sleep(20)
      await tx.recipe.update({ where: { id: recipeId }, data: { description: 'Cambiada' } })
      await tx.recipeLine.update({
        where: { id: lineId },
        data: { quantity: new Prisma.Decimal('2.0000') },
      })

      const recipeDespues = await tx.recipe.findUniqueOrThrow({
        where: { id: recipeId },
        select: { createdAt: true, updatedAt: true },
      })
      const lineDespues = await tx.recipeLine.findUniqueOrThrow({
        where: { id: lineId },
        select: { createdAt: true, updatedAt: true },
      })

      expect(recipeDespues.createdAt.getTime()).toBe(recipeAntes.createdAt.getTime())
      expect(recipeDespues.updatedAt.getTime()).toBeGreaterThan(recipeAntes.updatedAt.getTime())
      expect(lineDespues.createdAt.getTime()).toBe(lineAntes.createdAt.getTime())
      expect(lineDespues.updatedAt.getTime()).toBeGreaterThan(lineAntes.updatedAt.getTime())
    })
  })

  it('quitar un producto de una receta elimina la fila de la linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productoQueSale = await createProduct(tx, 'Producto que sale')
      const productoQueQueda = await createProduct(tx, 'Producto que queda')

      const lineaQueSale = await createLine(tx, recipeId, productoQueSale, '1.0000')
      const lineaQueQueda = await createLine(tx, recipeId, productoQueQueda, '2.0000')

      await tx.recipeLine.delete({ where: { id: lineaQueSale } })

      // R24: borrado FISICO de la linea, no una marca.
      expect(await tx.recipeLine.findUnique({ where: { id: lineaQueSale } })).toBeNull()
      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(lines).toEqual([{ id: lineaQueQueda }])

      // La receta y el producto siguen ahi: lo que se quito fue la linea.
      expect(await tx.recipe.findUnique({ where: { id: recipeId } })).not.toBeNull()
      expect(await tx.product.findUnique({ where: { id: productoQueSale } })).not.toBeNull()

      // Y no hay ninguna marca de borrado logico de lineas donde esconderla.
      const softDeleteColumns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recipe_lines'
          AND column_name = 'deleted_at'`
      expect(softDeleteColumns).toEqual([])
    })
  })

  it('borrar fisicamente una receta se lleva sus lineas y no deja huerfanas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const product1 = await createProduct(tx, 'Insumo 1')
      const product2 = await createProduct(tx, 'Insumo 2')

      const line1 = await createLine(tx, recipeId, product1, '1.0000')
      const line2 = await createLine(tx, recipeId, product2, '2.0000')

      // Borrado FISICO (una purga, un script, el `down.sql`): aqui si se dispara el
      // CASCADE. En operacion normal el borrado es logico y ninguna FK reacciona a un
      // UPDATE (`design.md` seccion 4.2).
      await tx.recipe.delete({ where: { id: recipeId } })

      const survivors = await tx.recipeLine.findMany({
        where: { id: { in: [line1, line2] } },
        select: { id: true },
      })
      expect(survivors).toEqual([])
      expect(await tx.recipe.findUnique({ where: { id: recipeId } })).toBeNull()
    })
  })

  it('el borrado logico de una receta deja sus lineas intactas y asociadas', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const product1 = await createProduct(tx, 'Insumo 1')
      const product2 = await createProduct(tx, 'Insumo 2')

      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Dos unidades
      // distintas, como antes eran 'kg' y 'L'; el orden por unidad se mantiene solo para que
      // las dos lecturas se comparen fila a fila, y hoy ordena por `unit_id`.
      const line1 = await createLine(tx, recipeId, product1, '10.5000', await createUnit(tx))
      const line2 = await createLine(tx, recipeId, product2, '0.2500', await createUnit(tx, 'L'))
      const antes = await tx.recipeLine.findMany({
        where: { recipeId },
        orderBy: { unitId: 'asc' },
      })

      await tx.recipe.update({ where: { id: recipeId }, data: { deletedAt: new Date() } })

      // R26: las lineas siguen existiendo, sin modificar y asociadas a su receta.
      const despues = await tx.recipeLine.findMany({
        where: { recipeId },
        orderBy: { unitId: 'asc' },
      })
      expect(despues.map((line) => line.id).sort()).toEqual([line1, line2].sort())
      expect(despues.map((line) => line.recipeId)).toEqual([recipeId, recipeId])
      expect(despues.map((line) => line.quantity.toString())).toEqual(
        antes.map((line) => line.quantity.toString()),
      )
      expect(despues.map((line) => line.updatedAt.getTime())).toEqual(
        antes.map((line) => line.updatedAt.getTime()),
      )
    })
  })

  it('un producto borrado logicamente conserva su linea', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx, 'Insumo descatalogado')
      const unitId = await createUnit(tx)
      const lineId = await createLine(tx, recipeId, productId, '3.0000', unitId)

      // El borrado de producto es LOGICO (QC-20 D5): un UPDATE, no un DELETE.
      await tx.product.update({ where: { id: productId }, data: { deletedAt: new Date() } })

      const line = await tx.recipeLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
      expect(line.quantity.toString()).toBe('3')
      // 2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva lo que
      // el caso vigila -borrar logicamente el producto no toca NINGUN dato de la linea, su
      // unidad incluida-, ahora sobre `unit_id`.
      expect(line.unitId).toBe(unitId)

      // Y la fila del producto sigue existiendo, que es lo que hace que la linea no
      // apunte al vacio (decision cerrada 13).
      const product = await tx.product.findUniqueOrThrow({ where: { id: productId } })
      expect(product.deletedAt).toBeInstanceOf(Date)
    })
  })

  it('rechaza el borrado fisico de un producto usado por una linea con SQLSTATE 23503', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx, 'Insumo en uso')
      const lineId = await createLine(tx, recipeId, productId, '1.0000')

      // ON DELETE RESTRICT: existe para que un borrado fisico por consola o por script no
      // deje lineas apuntando al vacio.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "products" WHERE "id" = ${asUuid(productId)}`,
        'borrado fisico de un producto usado por una linea',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      // Nada se movio: ni el producto ni la linea.
      expect(await tx.product.findUnique({ where: { id: productId } })).not.toBeNull()
      const line = await tx.recipeLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
    })
  })
})
