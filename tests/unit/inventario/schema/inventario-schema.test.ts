// Lee el schema como texto: el cliente generado no dice si un campo es obligatorio o tiene
// default, ni muestra `onDelete`, el tipo nativo de un decimal ni los `/// @module`.
//
// Varias ausencias se afirman en positivo para que nadie las «arregle» sin darse cuenta.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
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

/** Texto crudo, con los `///`: el caso de `@module` afirma sobre los comentarios. */
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

/** Quita comentarios `//` y `///`: el schema los usa para explicar, no para declarar. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n')
}

const schema = stripComments(rawSchema)

interface PrismaField {
  readonly name: string
  readonly type: string
  readonly attributes: string
  readonly isOptional: boolean
  readonly isList: boolean
}

interface PrismaModel {
  readonly body: string
  readonly fields: readonly PrismaField[]
}

function parseModel(name: string): PrismaModel {
  const match = new RegExp(`^model\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) throw new Error(`no existe el modelo ${name}`)
  const body = match[1]
  const fields = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('@@'))
    .map((line): PrismaField | null => {
      const field = /^(\w+)\s+(\S+)\s*(.*)$/.exec(line)
      if (field === null || field[1] === undefined || field[2] === undefined) return null
      const rawType = field[2]
      return {
        name: field[1],
        type: rawType.replace(/[?[\]]/g, ''),
        attributes: field[3] ?? '',
        isOptional: rawType.endsWith('?'),
        isList: rawType.endsWith('[]'),
      }
    })
    .filter((field): field is PrismaField => field !== null)
  return { body, fields }
}

const presentation = parseModel('Presentation')
const product = parseModel('Product')
const productBatch = parseModel('ProductBatch')

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

// Otros `enum` del esquema son legitimos. Lo que se veta es que alguno suplante, por nombre o
// por contenido, al catalogo de unidades, que es una tabla para poder ampliarse sin desplegar.

/** Un bloque `enum` del esquema: su nombre y sus valores. */
interface PrismaEnum {
  readonly name: string
  readonly values: readonly string[]
}

function parseEnums(source: string): readonly PrismaEnum[] {
  return [...source.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map((match): PrismaEnum | null => {
      const [, name, body] = match
      if (name === undefined || body === undefined) return null
      return {
        name,
        values: body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('@')),
      }
    })
    .filter((candidate): candidate is PrismaEnum => candidate !== null)
}

const schemaEnums = parseEnums(schema)

/** Nombres y simbolos del catalogo de unidades, leidos de las migraciones que lo siembran. */
function unitCatalogWords(): readonly string[] {
  const migrationsDir = join(repoRoot, 'db', 'migrations')
  const words = new Set<string>()
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let sql: string
    try {
      sql = readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8')
    } catch {
      continue
    }
    for (const insert of sql.matchAll(/INSERT\s+INTO\s+"units"\s*\([^)]*\)\s*VALUES([\s\S]*?);/gi)) {
      for (const literal of (insert[1] ?? '').matchAll(/'([^']+)'/g)) {
        const value = literal[1]
        if (value !== undefined) words.add(value.toUpperCase())
      }
    }
  }
  if (words.size === 0) {
    throw new Error(
      'no hay ningun INSERT INTO "units" en db/migrations: el acotado se quedaria sin sujeto',
    )
  }
  return [...words]
}

const UNIT_CATALOG_WORDS = unitCatalogWords()

/** El catalogo de unidades es una TABLA: ningun `enum` del esquema lo suplanta. */
function expectUnitCatalogIsNotAnEnum(): void {
  for (const declared of schemaEnums) {
    expect(declared.name, `el enum ${declared.name} no puede ser el catalogo de unidades`).not.toMatch(
      /unit|unidad|uom|medida|measure/i,
    )
    const upperValues = declared.values.map((value) => value.toUpperCase())
    for (const word of UNIT_CATALOG_WORDS) {
      expect(
        upperValues,
        `el enum ${declared.name} no puede declarar la unidad ${word}`,
      ).not.toContain(word)
    }
  }
}

/** Los datos de negocio del producto, con su columna en la base. */
const PRODUCT_BUSINESS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['name', 'name'],
  ['qtyAlert', 'qty_alert'],
  ['imagePath', 'image_path'],
]

const INTEGER_FIELDS = ['qtyAlert'] as const

/** Opcionales: la ausencia de valor no puede convertirse en cero ni en cadena vacia. */
const OPTIONAL_FIELDS = ['qtyAlert', 'imagePath'] as const

describe('db/schema.prisma — modelo de producto y presentacion', () => {
  it('Presentation declara id uuid propio y name obligatorio', () => {
    const id = field(presentation, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    expect(presentation.body).not.toMatch(/@@id\(/)

    const name = field(presentation, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)

    // Sin `deletedAt` a proposito: con la columna, borrar seria un UPDATE y la FK no podria
    // bloquearlo. Igualdad exacta: una columna de mas seria una migracion que nadie declaro.
    const scalarNames = presentation.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'Product')
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual([
      'companyId',
      'createdAt',
      'id',
      'name',
      'nameNormalized',
      'unitId',
      'updatedAt',
    ])
    expect(has(presentation, 'deletedAt')).toBe(false)
    expect(presentation.body).not.toMatch(/deleted_at/)

    // Escalar sin `@relation` porque `Company` es de `identity`: con relacion, el cliente ofreceria
    // `include: { company: true }` desde `inventario` y ninguna guardia lo veria.
    const presentationCompanyId = field(presentation, 'companyId')
    expect(presentationCompanyId.type).toBe('String')
    expect(presentationCompanyId.isOptional, 'presentations.company_id es NOT NULL (R1)').toBe(
      false,
    )
    expect(presentationCompanyId.attributes).toContain('@map("company_id")')
    expect(presentationCompanyId.attributes).toContain('@db.Uuid')
    expect(presentation.body, 'companyId es escalar, sin @relation (R1)').not.toMatch(
      /companyId\s+String[^\n]*@relation/,
    )

    // Unicidad por empresa, y se veta la global: impediria que dos empresas usen el mismo nombre.
    expect(presentation.body).toMatch(
      /@@unique\(\[companyId,\s*nameNormalized\],\s*map:\s*"presentations_company_name_unique"\)/,
    )
    expect(
      presentation.body,
      'la unicidad global de nombre normalizado no puede volver (R20)',
    ).not.toMatch(/@@unique\(\[\s*nameNormalized\s*\]/)
    expect(field(presentation, 'nameNormalized').attributes).not.toMatch(/@unique/)
  })

  it('el esquema declara exactamente dos modelos nuevos: Presentation y Product', () => {
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
      .sort()

    const inventarioModels = [
      ...rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g),
    ]
      .filter(([, moduleName]) => moduleName === 'inventario')
      .map(([, , modelName]) => modelName)
      .sort()
    expect(inventarioModels).toEqual(['Presentation', 'Product', 'ProductBatch'])
    expect(inventarioModels).toHaveLength(3)

    for (const owned of ['DocumentType', 'Role', 'User']) {
      expect(modelNames, `el modelo ${owned} no debe desaparecer`).toContain(owned)
    }

    for (const forbidden of ['InventoryItem', 'Inventory', 'StockItem', 'Item']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
    expect(schema).not.toMatch(/@@map\("(inventory|inventory_items|stock_items|items)"\)/)
  })

  it('R2, R11: Product ya no declara stock', () => {
    expect(has(product, 'stock'), 'Product.stock se quito con la migracion (R2, R11)').toBe(false)
    expect(product.body).not.toMatch(/^\s*stock\s+Int/m)
    expect(product.body).not.toMatch(/products_stock_idx|products_stock_non_negative/)
  })

  it('R7: Product declara sus datos de negocio en una sola tabla, y ya no declara unidad', () => {
    for (const [name] of PRODUCT_BUSINESS_FIELDS) {
      expect(has(product, name), `falta el campo Product.${name}`).toBe(true)
    }
    expect(PRODUCT_BUSINESS_FIELDS).toHaveLength(3)

    // Son terminos comerciales del proveedor: se vetan aparte para que no vuelvan por descuido.
    for (const name of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(has(product, name), `Product.${name} tenia que haber desaparecido (QC-52 R1)`).toBe(
        false,
      )
    }

    for (const name of ['presentationId', 'presentation', 'createdBy', 'updatedBy']) {
      expect(has(product, name), `Product.${name} se mudo a ProductBatch`).toBe(false)
    }

    const scalarNames = product.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'Presentation')
      .map((candidate) => candidate.name)
      .sort()
    // `nameNormalized` (forma canonica de `name`) y `companyId` (dueno de la fila) no son datos de
    // negocio: van aparte para que el censo siga siendo una igualdad exacta.
    expect(scalarNames).toEqual(
      [
        'id',
        ...PRODUCT_BUSINESS_FIELDS.map(([name]) => name),
        'nameNormalized',
        'companyId',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ].sort(),
    )
    expect(product.body).toContain('@@map("products")')

    const productCompanyId = field(product, 'companyId')
    expect(productCompanyId.type).toBe('String')
    expect(productCompanyId.isOptional, 'products.company_id es NOT NULL (R1)').toBe(false)
    expect(productCompanyId.attributes).toContain('@map("company_id")')
    expect(productCompanyId.attributes).toContain('@db.Uuid')
    expect(product.body, 'companyId es escalar, sin @relation (R1)').not.toMatch(
      /companyId\s+String[^\n]*@relation/,
    )
    // Indice no parcial: por el pasa la verificacion del `RESTRICT` de la FK, que tambien ve los
    // productos con borrado logico.
    expect(product.body).toMatch(/@@index\(\[companyId\],\s*map:\s*"products_company_id_idx"\)/)
    expect(product.body, 'products no gana unicidad de nombre (R21)').not.toMatch(
      /@@unique\([^)]*nameNormalized/,
    )
  })

  it('ProductBatch declara la presentacion, el stock, el coste y la autoria mudados desde products', () => {
    const productId = field(productBatch, 'productId')
    expect(productId.type).toBe('String')
    expect(productId.isOptional).toBe(false)
    expect(productId.attributes).toContain('@db.Uuid')

    const presentationId = field(productBatch, 'presentationId')
    expect(presentationId.type).toBe('String')
    expect(presentationId.isOptional).toBe(false)
    expect(presentationId.attributes).toContain('@db.Uuid')
    expect(presentationId.attributes).toContain('@map("presentation_id")')

    const stock = field(productBatch, 'stock')
    expect(stock.type).toBe('Int')
    expect(stock.isOptional).toBe(false)

    const unitCost = field(productBatch, 'unitCost')
    expect(unitCost.type).toBe('Decimal')
    expect(unitCost.isOptional).toBe(false)
    expect(unitCost.attributes).toContain('@map("unit_cost")')
    expect(unitCost.attributes).toMatch(/@db\.Decimal\(14,\s*4\)/)

    const lot = field(productBatch, 'lot')
    expect(lot.type).toBe('String')
    expect(lot.isOptional, 'lot es NOT NULL desde QC-81 (R7)').toBe(false)
    expect(lot.attributes).toContain('@map("lot")')

    const expiryDate = field(productBatch, 'expiryDate')
    expect(expiryDate.type).toBe('DateTime')
    expect(expiryDate.isOptional).toBe(true)
    expect(expiryDate.attributes).toContain('@map("expiry_date")')
    expect(expiryDate.attributes).toContain('@db.Date')

    for (const name of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(productBatch, name)
      expect(candidate.type, `ProductBatch.${name} debe ser String`).toBe('String')
      expect(candidate.isOptional, `ProductBatch.${name} debe ser anulable`).toBe(true)
      expect(candidate.attributes).toContain('@db.Uuid')
      expect(candidate.attributes).not.toMatch(/@default\(/)
    }
    expect(field(productBatch, 'createdBy').attributes).toContain('@map("created_by")')
    expect(field(productBatch, 'updatedBy').attributes).toContain('@map("updated_by")')

    // Sin relacion Prisma hacia `User`: la FK vive escrita a mano en el SQL de la migracion.
    expect(productBatch.body).not.toMatch(/\bUser\b/)

    // Con Product y Presentation si hay @relation: los tres modelos son de inventario.
    expect(productBatch.body).toMatch(/product\s+Product\s+@relation\(/)
    expect(productBatch.body).toMatch(/presentation\s+Presentation\s+@relation\(/)

    expect(productBatch.body).toContain('@@map("product_batches")')
    expect(productBatch.body).toMatch(/@@index\(\[productId\],\s*map:\s*"product_batches_product_id_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[presentationId\],\s*map:\s*"product_batches_presentation_id_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"product_batches_created_by_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"product_batches_updated_by_idx"\)/)
  })

  it('name es obligatorio y sin default', () => {
    // Sin `@default`: rellenaria el hueco en silencio y el rechazo no ocurriria nunca.
    const candidate = field(product, 'name')
    expect(candidate.isOptional, 'Product.name no puede ser opcional').toBe(false)
    expect(candidate.attributes, 'Product.name no debe tener @default').not.toMatch(/@default\(/)
    expect(candidate.type).toBe('String')
  })

  it('R7: qtyAlert e imagePath son opcionales, y unitId ya no esta entre ellos', () => {
    // Un `@default` convertiria la ausencia en un valor sin que nadie lo note.
    for (const name of OPTIONAL_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.isOptional, `Product.${name} debe ser opcional`).toBe(true)
      expect(candidate.attributes, `Product.${name} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
    expect(OPTIONAL_FIELDS).toHaveLength(2)
    // `unitId` se afirma aparte para que no vuelva como opcional sin discutirlo.
    expect(OPTIONAL_FIELDS as readonly string[]).not.toContain('unitId')
  })

  it('imagePath esta declarado en el modelo, es opcional y mapea a image_path', () => {
    // La columna ya existia en la base: sin declararla, cada `prisma migrate dev` propone
    // `DROP COLUMN "image_path"`. `TEXT` anulable sin default, como la creo su migracion.
    const imagePath = field(product, 'imagePath')
    expect(imagePath.type).toBe('String')
    expect(imagePath.isOptional).toBe(true)
    expect(imagePath.attributes).toContain('@map("image_path")')
    expect(imagePath.attributes).not.toMatch(/@default\(/)
    expect(imagePath.attributes).not.toMatch(/@db\./)
  })

  it('qtyAlert es Int', () => {
    for (const name of INTEGER_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.type, `Product.${name} debe ser Int`).toBe('Int')
      expect(candidate.attributes, `Product.${name} no debe declarar tipo nativo`).not.toMatch(
        /@db\.(Decimal|Money|Real|DoublePrecision)/,
      )
    }
    expect(INTEGER_FIELDS).toHaveLength(1)
  })

  it('en el esquema no hay ningun Float, y el producto ya no declara ningun importe', () => {
    // La coma flotante binaria no representa importes exactos: no puede aparecer en ningun modelo.
    expect(has(product, 'cost')).toBe(false)

    for (const candidate of [...product.fields, ...presentation.fields]) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
    }
    expect(schema).not.toMatch(/^\s*\w+\s+Float\??\s/m)
    expect(schema).not.toMatch(/@db\.(Real|DoublePrecision)/)
  })

  it('R7: Product no declara ninguna unidad, ni por referencia ni como texto', () => {
    // Ausencia afirmada en positivo: la unidad de un producto se deriva de la presentacion de su
    // lote mas reciente, y declararla aqui abriria una segunda verdad.
    expect(has(product, 'unitId'), 'Product.unitId tenia que haber desaparecido (QC-80 R7)').toBe(
      false,
    )
    expect(has(product, 'unit'), 'Product.unit no puede resucitar (QC-32 R10)').toBe(false)
    expect(product.body).not.toMatch(/unit_id/)
    expect(product.body).not.toMatch(/^\s*unit\s+String/m)
    expect(product.body).not.toMatch(/\bUnit\b/)

    expectUnitCatalogIsNotAnEnum()
  })

  it('R1: Presentation declara unitId uuid OBLIGATORIO, sin default y escalar sin @relation', () => {
    // Sin `@default`: convertiria «no dijo unidad» en una unidad concreta en silencio.
    const unitId = field(presentation, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional, 'Presentation.unitId es NOT NULL (R1)').toBe(false)
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes, 'un @default convertiria la ausencia en un valor').not.toMatch(
      /@default\(/,
    )
    // Sin `@relation`: con ella, `inventario` llegaria a `units` (modulo `unidades`) con un
    // `include`, un cruce de modulos que ninguna guardia ve porque no es un import.
    expect(unitId.attributes).not.toMatch(/@relation/)
    expect(presentation.body).not.toMatch(/\bUnit\b/)

    // Postgres no crea el indice del lado hijo de la FK, y por el pasa el RESTRICT al borrar una
    // unidad. No es unico: muchas presentaciones comparten unidad.
    expect(presentation.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"presentations_unit_id_idx"\)/)
    expect(presentation.body).not.toMatch(/@@unique\([^)]*unitId/)
    expect(unitId.attributes).not.toMatch(/@unique/)
  })

  it('no hay ninguna columna derivada de bajo de existencias ni relacion entre qtyAlert y stock', () => {
    // `qtyAlert` solo se almacena: nada de columna calculada ni estado derivado.
    const qtyAlert = field(product, 'qtyAlert')
    expect(qtyAlert.type).toBe('Int')
    expect(qtyAlert.isOptional).toBe(true)
    expect(qtyAlert.attributes).not.toMatch(/@default\(/)
    // Una columna generada seria justo el derivado prohibido.
    expect(qtyAlert.attributes).not.toMatch(/dbgenerated/)

    const FORBIDDEN = ['isLowStock', 'lowStock', 'isBelowAlert', 'belowAlert', 'needsRestock']
    for (const forbidden of FORBIDDEN) {
      expect(has(product, forbidden), `Product.${forbidden} no debe existir`).toBe(false)
    }
    expect(product.body).not.toMatch(/low_stock|below_alert|needs_restock/)

    const blockLines = product.body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@@'))
    for (const line of blockLines) {
      expect(line, 'ningun bloque debe relacionar qtyAlert con stock').not.toMatch(
        /qtyAlert|qty_alert/,
      )
    }
    const generated = product.fields.filter((candidate) => /dbgenerated/.test(candidate.attributes))
    expect(generated.map((candidate) => candidate.name)).toEqual(['id'])
  })

  it('la relacion ProductBatch-Presentation es obligatoria', () => {
    const presentationId = field(productBatch, 'presentationId')
    expect(presentationId.isOptional).toBe(false)
    expect(presentationId.attributes).toContain('@db.Uuid')
    expect(presentationId.attributes).toContain('@map("presentation_id")')

    const relation = field(productBatch, 'presentation')
    expect(relation.type).toBe('Presentation')
    expect(relation.isOptional).toBe(false)
    expect(relation.isList).toBe(false)
    expect(relation.attributes).toMatch(/@relation\(/)
    expect(relation.attributes).toMatch(/fields:\s*\[presentationId\]/)
    expect(relation.attributes).toMatch(/references:\s*\[id\]/)
  })

  it('presentationId no tiene restriccion de unicidad', () => {
    // Un `@unique` convertiria la relacion en 1-1 y romperia la comparticion en silencio.
    expect(field(productBatch, 'presentationId').attributes).not.toMatch(/@unique/)
    expect(productBatch.body).not.toMatch(/@@unique\([^)]*presentationId/)
    expect(field(presentation, 'batches').isList).toBe(true)
    expect(field(presentation, 'batches').type).toBe('ProductBatch')
    // Postgres no crea solo el indice del lado hijo de la FK.
    expect(productBatch.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"product_batches_presentation_id_idx"\)/,
    )
  })

  it('la relacion ProductBatch-Presentation declara onDelete Restrict', () => {
    // `Cascade` o `SetNull` dejarian borrar una presentacion con lotes sin ruido.
    const relation = field(productBatch, 'presentation')
    expect(relation.attributes).toMatch(/onDelete:\s*Restrict/)
    expect(relation.attributes).not.toMatch(/onDelete:\s*(Cascade|SetNull|SetDefault|NoAction)/)
    expect(relation.attributes).toMatch(/onUpdate:\s*Cascade/)
    expect(has(presentation, 'deletedAt')).toBe(false)
  })

  it('products.name no tiene @unique ni @@unique', () => {
    // Dos productos pueden llamarse igual: se aparta a proposito del precedente de `users`.
    expect(field(product, 'name').attributes).not.toMatch(/@unique/)
    expect(product.body).not.toMatch(/@@unique\(/)
    expect(product.body).not.toMatch(/@@index\([^)]*name/)
  })

  it('Product declara deletedAt opcional', () => {
    const deletedAt = field(product, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)
  })

  it('Product y Presentation declaran createdAt y updatedAt', () => {
    for (const [modelName, model] of [
      ['Product', product],
      ['Presentation', presentation],
    ] as const) {
      const createdAt = field(model, 'createdAt')
      const updatedAt = field(model, 'updatedAt')
      expect(createdAt.type, `${modelName}.createdAt`).toBe('DateTime')
      expect(createdAt.isOptional).toBe(false)
      expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
      expect(createdAt.attributes).toContain('@map("created_at")')
      expect(createdAt.attributes).toContain('@db.Timestamptz(6)')
      expect(updatedAt.type, `${modelName}.updatedAt`).toBe('DateTime')
      expect(updatedAt.isOptional).toBe(false)
      expect(updatedAt.attributes).toContain('@updatedAt')
      expect(updatedAt.attributes).toContain('@map("updated_at")')
      expect(updatedAt.attributes).toContain('@db.Timestamptz(6)')
    }
  })

  it('las dos tablas mapean a snake_case en ingles', () => {
    expect(presentation.body).toContain('@@map("presentations")')
    expect(product.body).toContain('@@map("products")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [modelName, model] of [
      ['Product', product],
      ['Presentation', presentation],
    ] as const) {
      for (const candidate of model.fields) {
        const mapped = /@map\("([^"]+)"\)/.exec(candidate.attributes)
        const column = mapped?.[1] ?? candidate.name
        expect(column, `${modelName}.${candidate.name} -> ${column}`).toMatch(SNAKE_CASE)
      }
      // Sin `@map`, la columna real saldria en camelCase sin aviso.
      for (const candidate of model.fields) {
        if (!/[A-Z]/.test(candidate.name)) continue
        if (candidate.isList || candidate.type === 'Presentation') continue
        expect(candidate.attributes, `falta @map en ${modelName}.${candidate.name}`).toMatch(
          /@map\("/,
        )
      }
    }

    for (const [name, column] of PRODUCT_BUSINESS_FIELDS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(product, name).attributes)
      expect(mapped?.[1] ?? name, `Product.${name} debe mapear a ${column}`).toBe(column)
    }

    const indexMaps = [...product.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    // Igualdad exacta: un indice de mas es una migracion que nadie declaro.
    expect(indexMaps).toEqual(['products_company_id_idx'])
    for (const name of indexMaps) {
      expect(name ?? '', `el indice ${name ?? ''} debe ir en snake_case ingles`).toMatch(SNAKE_CASE)
    }
    expect(product.body, 'products_unit_id_idx se fue con la columna (R7)').not.toMatch(
      /products_unit_id_idx/,
    )

    const presentationIndexMaps = [
      ...presentation.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g),
    ].map((match) => match[1])
    expect(presentationIndexMaps).toEqual(['presentations_unit_id_idx'])
    for (const name of presentationIndexMaps) {
      expect(name ?? '', `el indice ${name} debe ir en snake_case`).toMatch(SNAKE_CASE)
    }
  })

  it('los tres modelos declaran /// @module inventario', () => {
    // Texto crudo: `stripComments` se lleva justo lo que aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Presentation')).toBe('inventario')
    expect(owners.get('Product')).toBe('inventario')
    expect(owners.get('ProductBatch')).toBe('inventario')

    const inventarioModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'inventario')
      .map(([modelName]) => modelName)
      .sort()
    expect(inventarioModels).toEqual(['Presentation', 'Product', 'ProductBatch'])
    expect(owners.get('User')).toBe('identity')
    expect(owners.get('Role')).toBe('identity')
    expect(owners.get('DocumentType')).toBe('identity')
  })

  it('la feature no anade ninguna ruta HTTP de productos ni presentaciones bajo app/api', () => {
    const moduleDir = join(repoRoot, 'lib', 'modules', 'inventario')
    const contract = stripComments(readFileSync(join(moduleDir, 'index.ts'), 'utf8'))
    expect(contract).not.toMatch(/['"]use server['"]/)
    // Solo `./domain`: por un adaptador entraria una operacion de alta, consulta, edicion o borrado.
    for (const reexport of contract.matchAll(/export\s[^;]*?\sfrom\s+'([^']+)'/g)) {
      expect(reexport[1], 'el contrato de inventario solo reexporta de ./domain').toMatch(
        /^\.\/domain\//,
      )
    }

    // Fuera de `lib/composition`, nadie importa del barrel una factoria de caso de uso: la regla de
    // modulos permite importar el contrato, y sin esto la UI podria saltarse el cableado. Tipos,
    // esquemas zod y constantes si pasan. El especificador se compara exacto porque la UI importa
    // a proposito Server Actions de `adapters/driving`.
    function allTypeScriptFiles(dir: string): readonly string[] {
      if (!existsSync(dir)) return []
      const files: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) files.push(...allTypeScriptFiles(full))
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(full)
      }
      return files
    }

    const modulesDir = join(repoRoot, 'lib', 'modules')
    const inventarioDir = join(modulesDir, 'inventario') + sep

    // Cada factoria se publica junto a su tipo `...Deps`, que la distingue de un esquema como
    // `createProductSchema`.
    const FACTORIAS_DE_CASO_DE_USO = new Set<string>()
    for (const sentencia of contract.matchAll(/export\s*\{([^}]*)\}\s*from\s*'[^']+'/g)) {
      const bindings = (sentencia[1] as string)
        .split(',')
        .map((binding) => binding.trim())
        .filter((binding) => binding.length > 0)
      if (!bindings.some((binding) => /^type\s+\w*Deps$/.test(binding))) continue
      for (const binding of bindings) {
        if (binding.startsWith('type ')) continue
        FACTORIAS_DE_CASO_DE_USO.add(binding.split(/\s+as\s+/)[0] as string)
      }
    }
    // Si el parseo deja de encontrar factorias, esta guardia no vigilaria nada. La lista se sube a
    // mano cuando se publique una nueva.
    expect(
      [...FACTORIAS_DE_CASO_DE_USO].sort(),
      'no se pudieron derivar las factorias de caso de uso del barrel: sin ellas esta guardia no mira nada',
    ).toEqual([
      'createCreatePresentation',
      'createCreateProduct',
      'createDeletePresentation',
      'createDeleteProduct',
      'createGetProduct',
      'createListPresentations',
      'createListProducts',
      'createUpdatePresentation',
      'createUpdateProduct',
    ])

    /** Especificador EXACTO del barrel: las subrutas (`.../inventario/adapters/...`) NO casan. */
    function esBarrelDeInventario(specifier: string): boolean {
      return (
        specifier === '@/lib/modules/inventario' ||
        /^(\.\.?\/)+([\w.-]+\/)*modules\/inventario$/.test(specifier)
      )
    }

    /**
     * Bindings de VALOR de una clausula de import. `import type { ... }` devuelve vacio, y
     * los `type X` sueltos dentro de las llaves se descartan uno a uno: los tipos pasan.
     * Un `import * as X` devuelve `*`, que nunca es una factoria pero se marca aparte abajo.
     */
    function bindingsDeValor(clausula: string): readonly string[] {
      const limpia = clausula.trim()
      if (/^type\b/.test(limpia)) return []
      const dentroDeLlaves = /\{([\s\S]*)\}/.exec(limpia)
      const cuerpo = dentroDeLlaves === null ? limpia : (dentroDeLlaves[1] as string)
      return cuerpo
        .split(',')
        .map((binding) => binding.trim())
        .filter((binding) => binding.length > 0 && !binding.startsWith('type '))
        .map((binding) => (binding.split(/\s+as\s+/)[0] as string).trim())
    }

    // Sentencia entera, no linea suelta: un import de varias lineas es lo normal y mirarlo
    // linea a linea perderia justo el binding que importa.
    const SENTENCIA_IMPORT = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g

    // `lib/composition` NO esta aqui a proposito: no se barre, no hace falta exencion.
    const raicesVigiladas = [
      modulesDir,
      join(repoRoot, 'app'),
      join(repoRoot, 'components'),
      join(repoRoot, 'hooks'),
    ]
    const archivosVigilados = raicesVigiladas.flatMap((raiz) => allTypeScriptFiles(raiz))
    expect(
      archivosVigilados.length,
      'el barrido quedo vacio: sin archivos, esta asercion no vigila nada',
    ).toBeGreaterThan(0)
    for (const filePath of archivosVigilados) {
      if (filePath.startsWith(inventarioDir)) continue
      const source = stripComments(readFileSync(filePath, 'utf8'))
      for (const [, clausula, specifier] of source.matchAll(SENTENCIA_IMPORT)) {
        if (!esBarrelDeInventario(specifier as string)) continue
        const bindings = bindingsDeValor(clausula as string)

        // Un import de espacio de nombres se trae el modulo ENTERO, factorias incluidas, y
        // ningun nombre concreto que comparar: se marca por si mismo.
        expect(
          bindings.includes('*'),
          `${filePath}: no se puede importar el barrel de inventario como espacio de nombres fuera de lib/composition`,
        ).toBe(false)

        const factoriasImportadas = bindings.filter((binding) =>
          FACTORIAS_DE_CASO_DE_USO.has(binding),
        )
        expect(
          factoriasImportadas,
          `${filePath}: importa del barrel de inventario factorias de caso de uso (${factoriasImportadas.join(', ')}); el cableado vive solo en lib/composition`,
        ).toEqual([])
      }
    }

    for (const route of [
      join(repoRoot, 'app', 'api', 'products'),
      join(repoRoot, 'app', 'api', 'presentations'),
      join(repoRoot, 'app', 'api', 'inventario'),
    ]) {
      expect(existsSync(route), `${route} no debe existir en esta feature`).toBe(false)
    }
  })
})

/** Las columnas escalares de `ProductBatch`, con su nombre en la base. */
const PRODUCT_BATCH_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['productId', 'product_id'],
  ['presentationId', 'presentation_id'],
  ['stock', 'stock'],
  ['unitCost', 'unit_cost'],
  ['lot', 'lot'],
  // La fecha de compra vive en el lote: cada entrada de mercancia tiene la suya.
  ['purchaseDate', 'purchase_date'],
  ['expiryDate', 'expiry_date'],
  // Columna propia y no deducida del producto: sin ella no hay unicidad (empresa, lote).
  ['companyId', 'company_id'],
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
]

describe('QC-80 R25/R28 — la presentacion sigue viviendo solo en product_batches', () => {
  it('R25, R28: ProductBatch conserva las columnas que le dio 20260909120000_product_batches', () => {
    // Se vigila el conjunto, que es lo que una migracion cambiaria.
    for (const [nombre, columna] of PRODUCT_BATCH_COLUMNS) {
      const candidate = field(productBatch, nombre)
      expect(candidate, `ProductBatch.${nombre} debe seguir declarado`).toBeDefined()
      if (nombre !== columna) {
        expect(candidate.attributes, `ProductBatch.${nombre} mapea a ${columna}`).toContain(
          `@map("${columna}")`,
        )
      }
    }
    expect(field(productBatch, 'unitCost').attributes).toMatch(/@db\.Decimal\(14,\s*4\)/)
    // Sigue siendo texto: un lote como «ACME-2026-07» se puede teclear.
    const lot = field(productBatch, 'lot')
    expect(lot.isOptional, 'lot es NOT NULL desde QC-81 (R7)').toBe(false)
    expect(lot.type, 'lot sigue siendo texto, no entero (QC-81 D5)').toBe('String')
    expect(lot.attributes).not.toMatch(/@default\(/)
    // Sin `@default`: el «hoy» lo pone el caso de uso con su reloj, no la base.
    const purchaseDate = field(productBatch, 'purchaseDate')
    expect(purchaseDate.type).toBe('DateTime')
    expect(purchaseDate.isOptional, 'purchase_date es NOT NULL (QC-81 R1)').toBe(false)
    expect(purchaseDate.attributes).toContain('@db.Date')
    expect(purchaseDate.attributes).not.toMatch(/@default\(/)
    expect(field(productBatch, 'expiryDate').isOptional, 'expiry_date sigue anulable').toBe(true)
    expect(field(productBatch, 'expiryDate').attributes).toContain('@db.Date')

    // Igualdad exacta: una columna de mas es una migracion; si es a proposito, se anota arriba.
    const escalares = productBatch.fields
      .filter((candidate) => !['Product', 'Presentation'].includes(candidate.type))
      .map((candidate) => candidate.name)
      .sort()
    expect(
      escalares,
      'ProductBatch gano o perdio columnas: la presentacion vive solo aqui y no se mueve (R25)',
    ).toEqual(
      ['id', ...PRODUCT_BATCH_COLUMNS.map(([nombre]) => nombre), 'createdAt', 'updatedAt'].sort(),
    )

    // Si fuera anulable, un lote podria quedarse sin dueno y el disparador de coherencia con su
    // producto no tendria nada que comparar.
    const batchCompanyId = field(productBatch, 'companyId')
    expect(batchCompanyId.type).toBe('String')
    expect(batchCompanyId.isOptional, 'product_batches.company_id es NOT NULL (R2)').toBe(false)
    expect(batchCompanyId.attributes).toContain('@db.Uuid')
    expect(productBatch.body, 'companyId es escalar, sin @relation (R2)').not.toMatch(
      /companyId\s+String[^\n]*@relation/,
    )
    expect(productBatch.body).toMatch(
      /@@index\(\[companyId\],\s*map:\s*"product_batches_company_id_idx"\)/,
    )
    // Por empresa y no global: dos empresas pueden repetir lote, una misma empresa no.
    expect(productBatch.body, 'la unicidad (empresa, lote) la declara QC-81 (R11)').toMatch(
      /@@unique\(\[companyId,\s*lot\],\s*map:\s*"product_batches_company_lot_unique"\)/,
    )
    expect(productBatch.body, 'ninguna unicidad GLOBAL de lote (R12)').not.toMatch(
      /@@unique\(\[lot\]/,
    )
    expect(productBatch.body).not.toMatch(/\blot\b[^\n]*@unique/)
  })

  it('R25, R28: la migracion de product_batches conserva sus dos CHECK y su RLS ENABLE+FORCE sin policies', () => {
    // Se lee el SQL: Prisma no modela ni CHECK ni RLS.
    const sql = readFileSync(
      join(repoRoot, 'db', 'migrations', '20260909120000_product_batches', 'migration.sql'),
      'utf8',
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT "product_batches_stock_non_negative" CHECK \("stock" >= 0\)/,
    )
    expect(sql).toMatch(
      /ADD CONSTRAINT "product_batches_unit_cost_positive" CHECK \("unit_cost" > 0\)/,
    )
    expect(sql).toMatch(/ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/ALTER TABLE "product_batches" FORCE ROW LEVEL SECURITY/)
    // Sin policies: deny-by-default. La autorizacion real vive en el caso de uso.
    expect(sql, 'la migracion de product_batches no declara ninguna policy').not.toMatch(
      /CREATE POLICY/i,
    )
  })

  it('R25: products no recupera ninguna presentation_id en el esquema', () => {
    // Con `presentation_id` tambien en `products` habria dos verdades sobre la presentacion.
    expect(has(product, 'presentationId'), 'products no recupera presentation_id (R25)').toBe(false)
    expect(product.body).not.toMatch(/presentation_id/)
    const relaciones = product.fields
      .filter((candidate) => /@relation/.test(candidate.attributes) || candidate.isList)
      .map((candidate) => candidate.name)
    expect(relaciones).toEqual(['batches'])
    expect(field(presentation, 'batches').type).toBe('ProductBatch')
    expect(presentation.body).not.toMatch(/\bProduct\b\[?\]?\s/)
  })

  it('R28: ProductBatch conserva stock y unitCost con su forma, y esta ficha no los toca', () => {
    // Se fija la forma de las columnas que guardan valor: un cambio de tipo no altera el censo.
    const stock = field(productBatch, 'stock')
    expect(stock.type, 'stock sigue siendo Int (entero, sin parte decimal)').toBe('Int')
    expect(stock.isOptional).toBe(false)

    const unitCost = field(productBatch, 'unitCost')
    expect(unitCost.type, 'unit_cost sigue siendo Decimal, nunca Float').toBe('Decimal')
    expect(unitCost.isOptional).toBe(false)
    expect(unitCost.attributes).toMatch(/@db\.Decimal\(14,\s*4\)/)
    expect(unitCost.attributes).not.toMatch(/@db\.(Real|DoublePrecision|Money)/)

    // La unidad del lote la declara su presentacion: una `unit_id` aqui seria otra verdad.
    expect(has(productBatch, 'unitId'), 'el lote no declara unidad: la declara su presentacion').toBe(
      false,
    )
    expect(productBatch.body).not.toMatch(/unit_id/)

    const up = readFileSync(
      join(repoRoot, 'db', 'migrations', '20260911120000_presentation_unit', 'migration.sql'),
      'utf8',
    )
    const down = readFileSync(
      join(repoRoot, 'db', 'migrations', '20260911120000_presentation_unit', 'down.sql'),
      'utf8',
    )
    for (const [nombre, sql] of [
      ['migration.sql', up],
      ['down.sql', down],
    ] as const) {
      const ejecutable = sql
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
      expect(ejecutable, `${nombre} no toca product_batches (R28)`).not.toMatch(/product_batches/i)
      expect(ejecutable, `${nombre} no toca ningun importe (R28)`).not.toMatch(
        /unit_cost|"orders"|"order_lines"/i,
      )
    }
  })

  it('R26: SupplierCatalogLine conserva su unidad propia y OPCIONAL, con la forma de hoy', () => {
    // Lo del proveedor son terminos comerciales, no propiedades de la cosa: hacer obligatoria su
    // unidad romperia filas que hoy no la declaran.
    const supplierLine = parseModel('SupplierCatalogLine')
    const unitId = field(supplierLine, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional, 'la unidad de la linea de proveedor sigue siendo OPCIONAL').toBe(true)
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).not.toMatch(/@default\(/)
    expect(unitId.attributes).not.toMatch(/@relation/)
    const presentationId = field(supplierLine, 'presentationId')
    expect(presentationId.isOptional).toBe(false)
    expect(presentationId.attributes).toContain('@map("presentation_id")')
    expect(supplierLine.body).toMatch(
      /@@index\(\[unitId\],\s*map:\s*"supplier_catalog_lines_unit_id_idx"\)/,
    )
    expect(supplierLine.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"supplier_catalog_lines_presentation_id_idx"\)/,
    )
  })

  it('R9: Presentation no gana borrado logico y conserva sus marcas en ingles', () => {
    // Sin borrado logico: con `deleted_at`, borrar seria un UPDATE y la FK
    // `product_batches_presentation_id_fkey` no podria bloquearlo.
    expect(has(presentation, 'deletedAt'), 'presentations sigue sin borrado logico (R9)').toBe(false)
    expect(presentation.body).not.toMatch(/deleted_at/)
    expect(presentation.body).not.toMatch(/borrado|eliminado|fecha_/i)

    expect(field(presentation, 'createdAt').attributes).toContain('@map("created_at")')
    expect(field(presentation, 'updatedAt').attributes).toContain('@map("updated_at")')
    expect(presentation.body).toContain('@@map("presentations")')

    expect(field(presentation, 'unitId').attributes).toContain('@map("unit_id")')

    const up = readFileSync(
      join(repoRoot, 'db', 'migrations', '20260911120000_presentation_unit', 'migration.sql'),
      'utf8',
    )
    const ejecutable = up
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n')
    expect(ejecutable, 'la migracion no anade deleted_at a presentations (R9)').not.toMatch(
      /deleted_at/i,
    )
    for (const identificador of ejecutable.matchAll(/(?:ADD COLUMN|CREATE INDEX)\s+"(\w+)"/gi)) {
      expect(identificador[1] ?? '', 'identificador en ingles y snake_case').toMatch(
        /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
      )
    }
  })
})
