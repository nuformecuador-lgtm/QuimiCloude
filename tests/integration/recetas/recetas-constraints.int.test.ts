/**
 * La base es compartida: ningun caso afirma conteos globales y cada uno siembra sus propias filas
 * con marcadores irrepetibles.
 * `quantity` nunca pasa a `number`: la coma flotante binaria es justo lo que la columna evita.
 * Sin tests de RLS: Prisma conecta como dueno de las tablas y saldrian verdes siempre.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { prisma } from '@/lib/shared/db/prisma'

/** Senal de rollback: no es un fallo, es como se deshace la transaccion del test. */
class RollbackSignal extends Error {
  constructor() {
    super('rollback de aislamiento del test')
    this.name = 'RollbackSignal'
  }
}

/** `$executeRaw` dentro de la transaccion reutiliza su conexion: el SQL crudo tambien se deshace. */
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
const CHECK_VIOLATION = '23514'

/**
 * Solo el SQL crudo deja el SQLSTATE en `meta.code`; la API tipada lo traduce a `P20xx`. No se
 * mira el texto porque sale en el idioma del servidor, asi que cada caso se monta para que solo
 * una restriccion pueda dar ese SQLSTATE.
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
 * Va dentro de un SAVEPOINT porque un error de constraint aborta la transaccion entera, y los
 * casos necesitan seguir consultando despues del rechazo.
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

const UUID_SHAPE = /^[0-9a-f-]{36}$/u

/** Marcador irrepetible de solo letras y digitos: sobrevive a cualquier normalizacion. */
function token(): string {
  return randomUUID().replace(/-/gu, '')
}

/**
 * Nombres y codigos aleatorios: `roles.name` es unico global y `users` tiene indices unicos
 * sobre correo, nombre de usuario y documento.
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
  // Empresa efimera y no la de instalacion: el nombre chocaria con la que siembra `db:seed`.
  const companyName = `Empresa ${marker}`
  const company = await tx.company.create({
    data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
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
      companyId: company.id,
    },
    select: { id: true },
  })
  return user.id
}

/** Copia local de `normalizeProductName` a proposito: si el algoritmo real se rompiera, este
 *  archivo no debe quedar verde por arrastre. */
function normalizeProductNameForTest(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '')
}

/**
 * Una empresa por transaccion: `product_batches_check_company` exige que el lote, su producto y
 * su presentacion compartan empresa. Ningun aserto de este archivo depende de cual sea.
 */
const empresasDeInventario = new WeakMap<object, Promise<string>>()

function inventoryCompanyOf(tx: Prisma.TransactionClient): Promise<string> {
  const enCurso = empresasDeInventario.get(tx)
  if (enCurso !== undefined) return enCurso
  const creando = (async (): Promise<string> => {
    const companyName = `Empresa inventario ${token()}`
    const company = await tx.company.create({
      data: { name: companyName, nameNormalized: normalizeCompanyName(companyName) },
      select: { id: true },
    })
    return company.id
  })()
  empresasDeInventario.set(tx, creando)
  return creando
}

/** `products.name` no es unico: el nombre por defecto se puede repetir en una transaccion. */
async function createProduct(
  tx: Prisma.TransactionClient,
  name = 'Acido citrico monohidratado',
): Promise<string> {
  const product = await tx.product.create({
    data: {
      name,
      nameNormalized: normalizeProductNameForTest(name),
      companyId: await inventoryCompanyOf(tx),
    },
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
 * `nameNormalized` va literal, sin `normalizeRecipeName`, para que un fallo del algoritmo no
 * deje verde este archivo.
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
 * Nombre y simbolo llevan marcador: sin empresa la unidad es de sistema, donde ya estan las del
 * arrancador, y los dos son unicos dentro del ambito.
 */
async function createUnit(
  tx: Prisma.TransactionClient,
  symbol?: string | null,
): Promise<string> {
  const marca = token()
  const unit = await tx.unit.create({
    data: {
      name: `unidad ${marca}`,
      nameNormalized: `unidad${marca}`,
      symbol: symbol === undefined ? `unidad ${marca}` : symbol,
    },
    select: { id: true },
  })
  return unit.id
}

/** Si no se pasa unidad se crea una: la linea no puede quedarse sin ella. */
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
  | 'unit_id'

/**
 * Omitir una entrada de `columns` es el caso «falta un dato obligatorio», que la API tipada no
 * deja ni compilar. `updated_at` va siempre: es NOT NULL sin DEFAULT porque la rellena Prisma con
 * `@updatedAt`, no la base.
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

beforeAll(async () => {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename IN ('recipes', 'recipe_lines', 'units')`
  if (tables.length !== 3) {
    throw new Error(
      'la base de pruebas no tiene aplicadas las migraciones de QC-24 (recipes y ' +
        'recipe_lines) y QC-32 (units). Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

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

      // Si el identificador saliera de los datos de negocio, renombrarla lo cambiaria.
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

      // La unica columna obligatoria que falta es `name`: el 23502 solo puede venir de ella.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => rawInsert(tx, 'recipes', { name_normalized: Prisma.sql`${marker}` }),
        'receta sin nombre',
      )
      expect(sqlState).toBe(NOT_NULL_VIOLATION)

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

      // El limite de longitud es validacion de aplicacion, no de la columna.
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.name).toBe(name)
      expect(recipe.description).toBe(description)
      expect(recipe.description).toHaveLength(5000)

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

      // jsonb reordena las claves de un objeto, no los elementos de un array.
      const positions = await tx.$queryRaw<{ primero: string; tercero: string }[]>`
        SELECT "steps"->>0 AS primero, "steps"->>2 AS tercero
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(positions).toHaveLength(1)
      expect(positions[0]?.primero).toBe('1. Pesar')
      expect(positions[0]?.tercero).toBe('3. Reposar 24 h')

      const raro = { nota: 'esto no es una lista', repeticiones: 3, anidado: { a: [1, 2] } }
      const { id: rareId } = await tx.recipe.create({
        data: { name: `Raro ${marker}`, nameNormalized: `raro${marker}`, steps: raro },
        select: { id: true },
      })
      const rareRecipe = await tx.recipe.findUniqueOrThrow({ where: { id: rareId } })
      expect(rareRecipe.steps).toEqual(raro)

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

      const shape = await tx.$queryRaw<{ tipo: string; nulo: boolean }[]>`
        SELECT jsonb_typeof("steps") AS tipo, ("steps" IS NULL) AS nulo
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ tipo: 'array', nulo: false }])

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

      // El nombre original es distinto: lo que choca es la clave normalizada.
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
      const unitId = await createUnit(tx)

      const lineId = await createLine(tx, recipeId, productId, '2.5000', unitId)

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

      // Unidades distintas: el unico `(recipe_id, product_id)` no depende de la unidad.
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

      await createLine(tx, recipeA, product1, '10.0000')
      await createLine(tx, recipeA, product2, '0.5000')
      await createLine(tx, recipeA, product3, '0.0100')
      await createLine(tx, recipeB, product1, '4.0000')

      const linesOfA = await tx.recipeLine.findMany({
        where: { recipeId: recipeA },
        select: { productId: true },
      })
      expect(linesOfA.map((line) => line.productId).sort()).toEqual(
        [product1, product2, product3].sort(),
      )

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

      // Sin pasar por el cliente: si la columna fuera de coma flotante, aqui se veria la deriva.
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
      // Unidad valida en los tres intentos: la unica razon posible del rechazo es la cantidad.
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

      // Ausente la rechaza el NOT NULL, no el CHECK.
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

      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(lines).toEqual([])
    })
  })

  it('acepta cualquier unidad del catalogo, sin restriccion por producto, y rechaza la linea sin unidad', async () => {
    // Cada producto recibe una unidad distinta de la de su linea: la base no deduce una de la
    // otra. Y el catalogo es una tabla, no un `enum`, para poder ampliarlo sin desplegar.
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })

      // Cada simbolo lleva marcador porque es unico dentro del ambito y `kg` ya esta en el
      // arrancador. `null` puede repetirse: el indice es parcial.
      const symbols = [
        `kg ${marker}`,
        `gotas por litro ${marker}`,
        `ug/mL ${marker}`,
        `cucharadas soperas ${marker}`,
        null,
      ]
      for (const symbol of symbols) {
        const unidadDeLaLinea = await createUnit(tx, symbol)
        const unidadDelProducto = await createUnit(tx)
        // El producto no declara unidad: la toma de la presentacion de su lote mas reciente.
        const productId = await createProduct(tx, `Insumo ${symbol ?? 'sin simbolo'}`)
        const marcaPresentacion = token()
        const presentation = await tx.presentation.create({
          data: {
            name: `Presentacion ${marcaPresentacion}`,
            nameNormalized: `presentacion${marcaPresentacion}`,
            unitId: unidadDelProducto,
            companyId: await inventoryCompanyOf(tx),
          },
          select: { id: true },
        })
        await tx.productBatch.create({
          data: {
            productId,
            presentationId: presentation.id,
            stock: 1,
            unitCost: new Prisma.Decimal('1.0000'),
            // `lot` es unico por empresa.
            lot: `L-${randomUUID()}`,
            purchaseDate: new Date('2026-09-01T00:00:00Z'),
            companyId: await inventoryCompanyOf(tx),
          },
          select: { id: true },
        })
        const lineId = await createLine(tx, recipeId, productId, '1.0000', unidadDeLaLinea)
        const line = await tx.recipeLine.findUniqueOrThrow({
          where: { id: lineId },
          select: { unitId: true },
        })
        expect(line.unitId).toBe(unidadDeLaLinea)
        expect(line.unitId).not.toBe(unidadDelProducto)
      }

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

      // Otros modulos si tienen enums: se filtran los que parecen de unidades, por nombre o por
      // etiquetas, y no por los nombres de los ajenos, que ataria este archivo a ellos.
      const enumTypes = await tx.$queryRaw<{ typname: string; labels: string[] }[]>`
        SELECT t.typname,
               array_remove(array_agg(e.enumlabel::text ORDER BY e.enumsortorder), NULL) AS labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        GROUP BY t.typname`
      const unitWords = new Set(
        (await tx.unit.findMany({ select: { name: true, symbol: true } })).flatMap((unit) =>
          [unit.name, unit.symbol ?? ''].filter((word) => word.length > 0).map((word) => word.toUpperCase()),
        ),
      )
      expect(unitWords.size, 'sin unidades en el catalogo el filtro se quedaria sin sujeto').toBeGreaterThan(0)
      const unitTypes = enumTypes.filter(
        (candidate) =>
          /unit|unidad|uom|medida|measure/i.test(candidate.typname) ||
          candidate.labels.some((label) => unitWords.has(label.toUpperCase())),
      )
      expect(unitTypes).toEqual([])
    })
  })

  it('rechaza una linea sin receta, sin producto, o con receta o producto inexistentes (23502 / 23503)', async () => {
    await inRolledBackTransaction(async (tx) => {
      const marker = token()
      const recipeId = await createRecipe(tx, { name: `Receta ${marker}`, nameNormalized: marker })
      const productId = await createProduct(tx)
      // La unidad propia del caso marca las filas que los cuatro intentos habrian escrito.
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
      // Unidad valida a proposito: en la linea, la unica FK que puede dispararse es la del
      // producto.
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

      // Prisma declara estas columnas sin `@relation`: la integridad la da Postgres. Lista
      // cerrada, para que una FK perdida por drift o anadida a escondidas ponga rojo el caso.
      // `pg_constraint` abarca toda la base, no un esquema: sin acotar `public`, un esquema
      // espejo con las mismas tablas duplicaria cada FK. `search_path` y `::regclass` no bastan.
      const foreignKeys = await tx.$queryRaw<{ conname: string; referencia: string }[]>`
        SELECT c.conname, ft.relname AS referencia
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_class ft ON ft.oid = c.confrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
          AND t.relname IN ('recipes', 'recipe_lines')
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

      // `NULL` significa que no la creo una persona: una importacion, un seed.
      const recipe = await tx.recipe.findUniqueOrThrow({ where: { id } })
      expect(recipe.createdBy).toBeNull()
      expect(recipe.updatedBy).toBeNull()
      expect(recipe.createdBy).not.toBe('')
      expect(recipe.updatedBy).not.toBe('')

      const shape = await tx.$queryRaw<{ sin_autor: boolean; sin_editor: boolean }[]>`
        SELECT ("created_by" IS NULL) AS sin_autor, ("updated_by" IS NULL) AS sin_editor
        FROM "recipes" WHERE "id" = ${asUuid(id)}`
      expect(shape).toEqual([{ sin_autor: true, sin_editor: true }])

      // Que sea anulable no afloja la integridad: la FK verifica toda fila con valor.
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

      expect(await tx.recipeLine.findUnique({ where: { id: lineaQueSale } })).toBeNull()
      const lines = await tx.recipeLine.findMany({ where: { recipeId }, select: { id: true } })
      expect(lines).toEqual([{ id: lineaQueQueda }])

      expect(await tx.recipe.findUnique({ where: { id: recipeId } })).not.toBeNull()
      expect(await tx.product.findUnique({ where: { id: productoQueSale } })).not.toBeNull()

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

      // Solo un borrado fisico (una purga, un script) dispara el CASCADE: el normal es logico y
      // ninguna FK reacciona a un UPDATE.
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

      // Ordenar por `unit_id` solo sirve para comparar las dos lecturas fila a fila.
      const line1 = await createLine(tx, recipeId, product1, '10.5000', await createUnit(tx))
      const line2 = await createLine(tx, recipeId, product2, '0.2500', await createUnit(tx, 'L'))
      const antes = await tx.recipeLine.findMany({
        where: { recipeId },
        orderBy: { unitId: 'asc' },
      })

      await tx.recipe.update({ where: { id: recipeId }, data: { deletedAt: new Date() } })

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

      // El borrado de producto es logico: un UPDATE, no un DELETE.
      await tx.product.update({ where: { id: productId }, data: { deletedAt: new Date() } })

      const line = await tx.recipeLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
      expect(line.quantity.toString()).toBe('3')
      expect(line.unitId).toBe(unitId)

      // Que la fila del producto siga existiendo es lo que evita que la linea apunte al vacio.
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

      // El RESTRICT existe para que un borrado fisico por consola o script no deje lineas
      // apuntando al vacio.
      const sqlState = await expectRejectedByDatabase(
        tx,
        () => tx.$executeRaw`DELETE FROM "products" WHERE "id" = ${asUuid(productId)}`,
        'borrado fisico de un producto usado por una linea',
      )
      expect(sqlState).toBe(FOREIGN_KEY_VIOLATION)

      expect(await tx.product.findUnique({ where: { id: productId } })).not.toBeNull()
      const line = await tx.recipeLine.findUniqueOrThrow({ where: { id: lineId } })
      expect(line.productId).toBe(productId)
    })
  })
})
