// T4 — Contrato estatico de `db/schema.prisma` (QC-14: modelo-producto).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/identity/schema/identity-schema.test.ts`: lo que se vigila aqui es la
// DECLARACION, no el cliente generado. Un tipo de Prisma no distingue un campo obligatorio
// de uno con default, no dice si la relacion es `Restrict`, no dice si `cost` es decimal o
// coma flotante, y no ve los comentarios `/// @module`.
//
// Varios casos afirman una AUSENCIA en positivo (`Presentation` sin `deletedAt`,
// `products.name` sin indice unico, ninguna columna de «bajo de existencias»). Son
// decisiones deliberadas del humano (decisiones cerradas 6 y 10, `design.md > 9`): el test
// existe para que nadie las «arregle» sin darse cuenta.
//
// Cubre R1, R3, R4, R5, R6, R7, R8, R10, R11, R12, R13, R14, R16, R17, R18, R19, R20, R23.

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

/** Texto crudo, con los `///`: lo necesita R20, que afirma sobre los comentarios. */
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

// ---------------------------------------------------------------------------------------
// ACOTADO EL 2026-09-03 POR QC-33 (`specs/QC-33-modelo-pedidos/`).
//
// El caso de la unidad afirmaba `expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)`:
// NINGUN `enum` en TODO el esquema. Esa mitad CADUCA. El repo no tenia ni uno el dia que se
// escribio, pero lo que se garantiza es que EL CATALOGO DE UNIDADES sea una tabla ampliable
// sin desplegar (QC-32 `design.md > 8.5`), no que el repositorio entero carezca de enums.
// QC-33 declara `OrderStatus` y `OrderPriority` por decision cerrada 4 del humano,
// apartandose a conciencia del precedente porque su conjunto NO tiene que crecer sin
// migrar. Una feature no puede cumplir la afirmacion de alcance de otra.
//
// Lo que se vigilaba y SIGUE VIGENTE se conserva entero en `expectUnitCatalogIsNotAnEnum`:
// ningun `enum` del esquema es el catalogo de unidades, ni por nombre (`Unit`, `UnitCode`,
// `Unidad`, `UoM`...) ni por contenido (sus valores no pueden ser las unidades que hoy
// viven en la tabla). Muere igual que antes si alguien convierte el catalogo en enum.
//
// Las unidades NO se escriben aqui a mano: se leen de los `INSERT INTO "units"` de las
// migraciones (hoy, el conjunto arrancador de `20260903121404_units_catalog`). Si no
// aparece ninguno, el helper LANZA en vez de quedarse en verde sin sujeto.
// ---------------------------------------------------------------------------------------

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

/** Los datos de negocio del producto, con su columna en la base (R19).
 *
 *  2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. El octavo dato SIGUE
 *  SIENDO la unidad de medida —R3 no se toca—; lo que cambia es su forma: `unit`/`unit`
 *  (texto libre) pasa a `unitId`/`unit_id` (referencia a `units`).
 *
 *  2026-09-04, QC-52 (R1): de los ocho de QC-14 R3 quedan CINCO. `cost`, `minPurchase` y
 *  `deliveryTime` son terminos comerciales y se fueron al catalogo del proveedor. Y entra
 *  `imagePath` (R4), que existia en la base desde `20260903200000_product_image_path` pero
 *  que el modelo no declaraba: eso era drift, y era justo lo que iba a hacer que
 *  `prisma migrate dev` propusiera `DROP COLUMN "image_path"` mezclado entre los tres
 *  `DROP COLUMN` legitimos de esta ficha.
 *
 *  2026-09-11, QC-80 (R7, R21): SALE `unitId`/`unit_id`. El producto DEJA DE DECLARAR
 *  UNIDAD —la columna, su indice `products_unit_id_idx` y su FK `products_unit_id_fkey` se
 *  van en `20260911120000_presentation_unit`—. La unidad de un producto pasa a DERIVARSE de
 *  la presentacion de su lote mas reciente (R22), y quien la declara ahora es la
 *  PRESENTACION, obligatoria (R1). De los ocho datos de QC-14 R3 quedan CUATRO. */
const PRODUCT_BUSINESS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['name', 'name'],
  ['stock', 'stock'],
  ['qtyAlert', 'qty_alert'],
  ['imagePath', 'image_path'],
]

/** Las dos columnas que R7 exige enteras tras QC-52 (`minPurchase` y `deliveryTime` se fueron). */
const INTEGER_FIELDS = ['stock', 'qtyAlert'] as const

/** Las columnas que R5 exige opcionales.
 *
 *  2026-09-03, QC-32 decision cerrada 13: la unidad pasa a catalogo. Se conserva intacto lo
 *  que R5 vigila —la unidad del producto SIGUE SIENDO OPCIONAL (QC-32 R10)—; solo cambia el
 *  nombre del campo que lo cumple.
 *
 *  2026-09-04, QC-52: salen `cost` y `deliveryTime` (ya no son del producto) y entra
 *  `imagePath`, que R4 exige declarada Y opcional.
 *
 *  2026-09-11, QC-80 (R7, R21): sale `unitId`. La mitad de R5 que hablaba de la unidad
 *  —«la unidad del producto es OPCIONAL»— CADUCA ENTERA, no cambia de forma: el producto ya
 *  no declara unidad, ni opcional ni obligatoria. La obligatoriedad se mudo a
 *  `Presentation.unitId`, que es `NOT NULL` y sin `@default` (R1), y la vigila su propio
 *  caso mas abajo. Lo que R5 sigue protegiendo —ausencia de valor, nunca cero ni cadena
 *  vacia— se conserva intacto para los TRES campos que quedan. */
const OPTIONAL_FIELDS = ['stock', 'qtyAlert', 'imagePath'] as const

describe('db/schema.prisma — modelo de producto y presentacion', () => {
  it('Presentation declara id uuid propio y name obligatorio', () => {
    // R1: identificador propio, estable y no derivado de ningun dato de negocio.
    const id = field(presentation, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    // Ni `name` ni ningun otro dato de negocio forma parte de la clave.
    expect(presentation.body).not.toMatch(/@@id\(/)

    const name = field(presentation, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)

    // La forma completa del catalogo: id + name + las dos marcas de tiempo, mas
    // `nameNormalized` que anade QC-20 (design.md > 2.2, R17). Sin `deletedAt`, y es
    // deliberado (design.md > 9, pregunta 2): con la columna, borrar seria un UPDATE y la
    // FK no podria bloquearlo, con lo que R14 se quedaria sin ninguna garantia real.
    //
    // 2026-09-11, QC-80 R1: entra `unitId`, y es la SEXTA.
    // 2026-09-11, QC-49 R1: entra `companyId`, y es la SEPTIMA y ultima. La igualdad exacta se
    // conserva a proposito: una octava columna seria una migracion que nadie declaro.
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

    // QC-49 R1: la empresa es OBLIGATORIA y uuid, y es escalar SIN `@relation` a proposito
    // (`Company` es de `identity`): con relacion, el cliente ofreceria `include: { company: true }`
    // desde `inventario` y ninguna guardia lo veria.
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

    // QC-49 R20: la unicidad de nombre normalizado deja de ser GLOBAL y pasa a ser POR EMPRESA,
    // con la empresa de cabeza. Se afirma la forma exacta Y se veta la vieja: un
    // `@@unique([nameNormalized])` suelto volveria a impedir que dos empresas usen el mismo
    // nombre, que es justo lo que esta ficha abrio.
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
    // R3: una sola entidad de producto. Ninguna tabla separada de «elemento de inventario».
    //
    // ACOTADO EL 2026-09-09: la presentacion y la autoria se mudaron de `products` a
    // `product_batches`, que es un TERCER modelo de `inventario`. Lo que R3 protegia —que la
    // entidad separada «elemento de inventario» no exista— sigue intacto.
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
      .sort()

    // Los modelos que declara `inventario`, leidos de su `/// @module` (mismo criterio que
    // el caso de R20). Son TRES: la entidad de producto, su catalogo de presentacion y el lote.
    const inventarioModels = [
      ...rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g),
    ]
      .filter(([, moduleName]) => moduleName === 'inventario')
      .map(([, , modelName]) => modelName)
      .sort()
    expect(inventarioModels).toEqual(['Presentation', 'Product', 'ProductBatch'])
    expect(inventarioModels).toHaveLength(3)

    // Los tres de `identity` siguen existiendo: esta feature no los toco ni los absorbio.
    for (const owned of ['DocumentType', 'Role', 'User']) {
      expect(modelNames, `el modelo ${owned} no debe desaparecer`).toContain(owned)
    }

    // Nada que huela a la entidad separada que la decision cerrada 1 fusiono.
    for (const forbidden of ['InventoryItem', 'Inventory', 'StockItem', 'Item']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
    expect(schema).not.toMatch(/@@map\("(inventory|inventory_items|stock_items|items)"\)/)
  })

  it('R7: Product declara sus datos de negocio en una sola tabla, y ya no declara unidad', () => {
    // R3 de QC-14, acotado por QC-52 R1 y R2 y por QC-80 R7/R21: nombre, existencia,
    // cantidad de alerta y ruta de imagen. Sin presentacion ni autoria, que se mudaron a
    // `product_batches` el 2026-09-09; y SIN UNIDAD desde el 2026-09-11.
    for (const [name] of PRODUCT_BUSINESS_FIELDS) {
      expect(has(product, name), `falta el campo Product.${name}`).toBe(true)
    }
    expect(PRODUCT_BUSINESS_FIELDS).toHaveLength(4)

    // QC-52 R1: los tres no pueden volver al modelo por descuido. Se afirma en negativo y
    // por separado del censo de abajo, para que el motivo quede escrito.
    for (const name of ['cost', 'minPurchase', 'deliveryTime']) {
      expect(has(product, name), `Product.${name} tenia que haber desaparecido (QC-52 R1)`).toBe(
        false,
      )
    }

    // La presentacion y la autoria tampoco pueden volver: se mudaron al lote (R25).
    for (const name of ['presentationId', 'presentation', 'createdBy', 'updatedBy']) {
      expect(has(product, name), `Product.${name} se mudo a ProductBatch`).toBe(false)
    }

    // La lista completa de columnas: si alguien anade o quita una, este test lo dice.
    const scalarNames = product.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'Presentation')
      .map((candidate) => candidate.name)
      .sort()
    // `nameNormalized` (QC-57 R19, R23) NO entra en `PRODUCT_BUSINESS_FIELDS` a proposito: no
    // es un dato de negocio de R3 sino la forma canonica de `name`, derivada y escrita por el
    // adaptador en toda escritura. Se declara aparte y en positivo para que el censo siga
    // siendo una igualdad exacta —una columna de mas seguiria poniendo esto rojo—.
    //
    // `companyId` (QC-49 R1) tampoco entra en `PRODUCT_BUSINESS_FIELDS`: no es un dato de
    // negocio del producto sino a QUIEN pertenece la fila, y el adaptador la escribe desde el
    // unico punto que define el ambito. Se declara aparte, en positivo, por el mismo motivo.
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

    // QC-49 R1: obligatoria, uuid y ESCALAR sin `@relation` (`Company` es de `identity`).
    const productCompanyId = field(product, 'companyId')
    expect(productCompanyId.type).toBe('String')
    expect(productCompanyId.isOptional, 'products.company_id es NOT NULL (R1)').toBe(false)
    expect(productCompanyId.attributes).toContain('@map("company_id")')
    expect(productCompanyId.attributes).toContain('@db.Uuid')
    expect(product.body, 'companyId es escalar, sin @relation (R1)').not.toMatch(
      /companyId\s+String[^\n]*@relation/,
    )
    // QC-49 R10: la columna queda indexada, y el indice NO es parcial —por el pasa la
    // verificacion del `RESTRICT` de la FK, que ve tambien los productos con borrado logico—.
    expect(product.body).toMatch(/@@index\(\[companyId\],\s*map:\s*"products_company_id_idx"\)/)
    // QC-49 R21: sigue SIN unicidad de nombre, ni global ni por empresa.
    expect(product.body, 'products no gana unicidad de nombre (R21)').not.toMatch(
      /@@unique\([^)]*nameNormalized/,
    )
  })

  it('ProductBatch declara la presentacion, el stock, el coste y la autoria mudados desde products', () => {
    // La presentacion, la autoria, el stock y el coste viven ahora en el LOTE, no en el
    // producto (2026-09-09). Lo que se comprueba es la FORMA del modelo nuevo.
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

    // QC-81 R7 (INVERTIDO): `lot` era OPCIONAL por QC-90 R12 y la decision cerrada D7 de QC-81 lo
    // hace OBLIGATORIO. El porque completo esta en la cabecera del bloque «QC-80 R25/R28», que es
    // donde vive la guardia de columnas de `ProductBatch`.
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

    // Ninguna relacion Prisma hacia `User` en todo el modelo: la FK real vive escrita a
    // mano en el SQL de la migracion, no en el esquema.
    expect(productBatch.body).not.toMatch(/\bUser\b/)

    // La relacion con Product y Presentation SI lleva @relation (ambas son de inventario).
    expect(productBatch.body).toMatch(/product\s+Product\s+@relation\(/)
    expect(productBatch.body).toMatch(/presentation\s+Presentation\s+@relation\(/)

    expect(productBatch.body).toContain('@@map("product_batches")')
    expect(productBatch.body).toMatch(/@@index\(\[productId\],\s*map:\s*"product_batches_product_id_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[presentationId\],\s*map:\s*"product_batches_presentation_id_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"product_batches_created_by_idx"\)/)
    expect(productBatch.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"product_batches_updated_by_idx"\)/)
  })

  it('name es obligatorio y sin default', () => {
    // R4: sin nombre no hay fila. Obligatorio de verdad: un `@default` rellenaria el hueco
    // en silencio y el rechazo no ocurriria nunca.
    const candidate = field(product, 'name')
    expect(candidate.isOptional, 'Product.name no puede ser opcional').toBe(false)
    expect(candidate.attributes, 'Product.name no debe tener @default').not.toMatch(/@default\(/)
    expect(candidate.type).toBe('String')
  })

  it('R7: stock, qtyAlert e imagePath son opcionales, y unitId ya no esta entre ellos', () => {
    // R5 de QC-14: ausencia de valor, no cero ni cadena vacia. Un `@default` convertiria la
    // ausencia en un valor y R5 dejaria de cumplirse sin que nadie lo note.
    for (const name of OPTIONAL_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.isOptional, `Product.${name} debe ser opcional`).toBe(true)
      expect(candidate.attributes, `Product.${name} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
    expect(OPTIONAL_FIELDS).toHaveLength(3)
    // QC-80 R7: `unitId` no esta en la lista porque no esta en el modelo. Se afirma aparte
    // para que un dia no vuelva como «opcional» sin que nadie lo discuta.
    expect(OPTIONAL_FIELDS as readonly string[]).not.toContain('unitId')
  })

  it('imagePath esta declarado en el modelo, es opcional y mapea a image_path', () => {
    // QC-52 R4 (cierra la pregunta abierta P4). La columna ya existia en la base; lo que
    // faltaba era la DECLARACION. Sin ella, cada `prisma migrate dev` sobre `products`
    // vuelve a proponer `DROP COLUMN "image_path"`, y en una migracion que ya borra tres
    // columnas de esa misma tabla un cuarto `DROP COLUMN` no destaca.
    //
    // `String?` sin `@default` y sin `@db.`: es `TEXT` anulable, exactamente como la creo
    // `20260903200000_product_image_path`. Un `@default("")` convertiria «sin imagen» en
    // una cadena vacia y cambiaria la base, que es justo lo que R4 prohibe.
    const imagePath = field(product, 'imagePath')
    expect(imagePath.type).toBe('String')
    expect(imagePath.isOptional).toBe(true)
    expect(imagePath.attributes).toContain('@map("image_path")')
    expect(imagePath.attributes).not.toMatch(/@default\(/)
    expect(imagePath.attributes).not.toMatch(/@db\./)
  })

  // QC-52 (R1) deroga QC-14 R6: `minPurchase` no es campo del producto, asi que no hay
  // `NOT NULL DEFAULT 0` que defender. Su ausencia la afirma el censo de campos de arriba.

  it('stock y qtyAlert son Int', () => {
    // R7: enteros, sin parte decimal.
    for (const name of INTEGER_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.type, `Product.${name} debe ser Int`).toBe('Int')
      expect(candidate.attributes, `Product.${name} no debe declarar tipo nativo`).not.toMatch(
        /@db\.(Decimal|Money|Real|DoublePrecision)/,
      )
    }
    expect(INTEGER_FIELDS).toHaveLength(2)
  })

  it('en el esquema no hay ningun Float, y el producto ya no declara ningun importe', () => {
    // QC-52 (R1) deroga la primera mitad de QC-14 R8: `Product.cost` no existe, asi que no
    // hay `Decimal(14,4)` que comprobar aqui —ese assert se mudo con el importe, al modelo
    // `SupplierCatalogLine`—. La SEGUNDA mitad de R8 sigue viva y es la que importa: la coma
    // flotante binaria es un anti-patron bloqueante (`docs/architecture.md > Dominio` n.o 4)
    // y no puede aparecer en NINGUN modelo del esquema.
    expect(has(product, 'cost')).toBe(false)

    for (const candidate of [...product.fields, ...presentation.fields]) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
    }
    // Ningun campo de coma flotante en todo el esquema, ni por tipo ni por tipo nativo.
    expect(schema).not.toMatch(/^\s*\w+\s+Float\??\s/m)
    expect(schema).not.toMatch(/@db\.(Real|DoublePrecision)/)
  })

  it('R7: Product no declara ninguna unidad, ni por referencia ni como texto', () => {
    // ---------------------------------------------------------------------------------
    // INVERTIDO EL 2026-09-11 POR QC-80 (R7, R21, decision cerrada 2 de la ficha).
    //
    // Este caso afirmaba «unitId es uuid OPCIONAL, escalar sin @relation». Esa afirmacion
    // CADUCA ENTERA: `20260911120000_presentation_unit` borra `products.unit_id`, su indice
    // y su FK, y el producto deja de declarar unidad en ningun punto del camino. La columna
    // estaba VACIA en las 7 filas vivas —comprobado contra la base el 2026-09-11—, asi que
    // no se perdio ningun dato.
    //
    // Lo que aquel caso vigilaba y SIGUE VIGENTE se conserva, pero cambia de sujeto:
    //   - la unidad se declara por REFERENCIA a `units`, no como texto libre: lo afirma el
    //     caso de `Presentation` de aqui abajo, que ademas la hace OBLIGATORIA (R1);
    //   - el catalogo sigue siendo una TABLA y ningun `enum` lo suplanta: se sigue
    //     comprobando aqui, porque esa afirmacion no era del producto sino del catalogo;
    //   - ninguna columna `unit` de texto libre resucita en `products` (QC-32 R10).
    //
    // Se afirma la AUSENCIA en positivo, igual que las otras ausencias deliberadas de este
    // archivo: sin este caso, devolverle la unidad al producto pasaria sin ruido y
    // reabriria la doble verdad que R22 cierra (la unidad se DERIVA del lote mas reciente).
    // ---------------------------------------------------------------------------------
    expect(has(product, 'unitId'), 'Product.unitId tenia que haber desaparecido (QC-80 R7)').toBe(
      false,
    )
    expect(has(product, 'unit'), 'Product.unit no puede resucitar (QC-32 R10)').toBe(false)
    expect(product.body).not.toMatch(/unit_id/)
    expect(product.body).not.toMatch(/^\s*unit\s+String/m)
    // Ni la relacion Prisma hacia el catalogo, que nunca existio y menos ahora.
    expect(product.body).not.toMatch(/\bUnit\b/)

    // El catalogo sigue siendo una TABLA, no un conjunto cerrado compilado en el esquema
    // (QC-32 `design.md > 8.5`, acotado por QC-33 al sujeto propio de esta afirmacion).
    expectUnitCatalogIsNotAnEnum()
  })

  it('R1: Presentation declara unitId uuid OBLIGATORIO, sin default y escalar sin @relation', () => {
    // El simetrico del caso de arriba, y el corazon de la ficha: la unidad se muda del
    // producto a la PRESENTACION, y alli es obligatoria. Sin `@default`, porque un valor por
    // defecto convertiria «no dijo unidad» en «dijo kilogramo» en silencio —justo lo que el
    // relleno de la migracion hace UNA vez, a proposito y solo para las filas que ya
    // existian—.
    const unitId = field(presentation, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional, 'Presentation.unitId es NOT NULL (R1)').toBe(false)
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes, 'un @default convertiria la ausencia en un valor').not.toMatch(
      /@default\(/,
    )
    // Escalar SIN `@relation` (mismo criterio que tenia `products.unit_id`, QC-32 R18): la
    // FK real vive escrita a mano en el SQL. Con `@relation`, el cliente dejaria a
    // `inventario` atravesar hasta `units` —modulo `unidades`— con un `include`, un cruce de
    // modulos que ninguna guardia detecta porque no es un import.
    expect(unitId.attributes).not.toMatch(/@relation/)
    expect(presentation.body).not.toMatch(/\bUnit\b/)

    // Y su indice, el del lado hijo de la FK: Postgres no lo crea solo y por ahi pasa la
    // verificacion del RESTRICT en cada intento de borrar una unidad (R3). No es unico:
    // muchas presentaciones comparten unidad.
    expect(presentation.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"presentations_unit_id_idx"\)/)
    expect(presentation.body).not.toMatch(/@@unique\([^)]*unitId/)
    expect(unitId.attributes).not.toMatch(/@unique/)
  })

  it('no hay ninguna columna derivada de bajo de existencias ni relacion entre qtyAlert y stock', () => {
    // R11 y decision cerrada 10: `qtyAlert` SOLO se almacena. Nada de columna calculada,
    // estado ni notificacion. Se afirma la ausencia en positivo, a proposito.
    const qtyAlert = field(product, 'qtyAlert')
    expect(qtyAlert.type).toBe('Int')
    expect(qtyAlert.isOptional).toBe(true)
    expect(qtyAlert.attributes).not.toMatch(/@default\(/)
    // Nada de `dbgenerated`: una columna generada seria exactamente el derivado prohibido.
    expect(qtyAlert.attributes).not.toMatch(/dbgenerated/)

    const FORBIDDEN = ['isLowStock', 'lowStock', 'isBelowAlert', 'belowAlert', 'needsRestock']
    for (const forbidden of FORBIDDEN) {
      expect(has(product, forbidden), `Product.${forbidden} no debe existir`).toBe(false)
    }
    expect(product.body).not.toMatch(/low_stock|below_alert|needs_restock/)

    // Ninguna declaracion de bloque (`@@index`, `@@unique`, ...) relaciona las dos columnas.
    const blockLines = product.body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('@@'))
    for (const line of blockLines) {
      expect(line, 'ningun bloque debe relacionar qtyAlert con stock').not.toMatch(
        /qtyAlert|qty_alert/,
      )
    }
    // El unico `dbgenerated` del modelo es el uuid de la clave primaria.
    const generated = product.fields.filter((candidate) => /dbgenerated/.test(candidate.attributes))
    expect(generated.map((candidate) => candidate.name)).toEqual(['id'])
  })

  it('la relacion ProductBatch-Presentation es obligatoria', () => {
    // La presentacion es del LOTE desde el 2026-09-09: exactamente una por lote, y la FK
    // garantiza que existe.
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
    // Una presentacion la comparten lotes ilimitados. Un `@unique` aqui convertiria la
    // relacion en 1-1 y romperia la comparticion en silencio.
    expect(field(productBatch, 'presentationId').attributes).not.toMatch(/@unique/)
    expect(productBatch.body).not.toMatch(/@@unique\([^)]*presentationId/)
    expect(field(presentation, 'batches').isList).toBe(true)
    expect(field(presentation, 'batches').type).toBe('ProductBatch')
    // El indice del lado hijo existe, pero NO es unico: Postgres no lo crea solo.
    expect(productBatch.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"product_batches_presentation_id_idx"\)/,
    )
  })

  it('la relacion ProductBatch-Presentation declara onDelete Restrict', () => {
    // Borrar una presentacion con lotes asignados se rechaza en la base. `Cascade` o
    // `SetNull` la incumplirian sin ruido.
    const relation = field(productBatch, 'presentation')
    expect(relation.attributes).toMatch(/onDelete:\s*Restrict/)
    expect(relation.attributes).not.toMatch(/onDelete:\s*(Cascade|SetNull|SetDefault|NoAction)/)
    expect(relation.attributes).toMatch(/onUpdate:\s*Cascade/)
    expect(has(presentation, 'deletedAt')).toBe(false)
  })

  it('products.name no tiene @unique ni @@unique', () => {
    // R16 y decision cerrada 6: dos productos pueden llamarse igual, coincida el texto
    // exacto o solo salvo mayusculas. Se aparta a proposito del precedente de `users`.
    expect(field(product, 'name').attributes).not.toMatch(/@unique/)
    expect(product.body).not.toMatch(/@@unique\(/)
    // Tampoco un indice normal disfrazado de unico ni nada sobre `name`.
    expect(product.body).not.toMatch(/@@index\([^)]*name/)
  })

  it('Product declara deletedAt opcional', () => {
    // R17: borrar conserva la fila completa y registra el instante.
    const deletedAt = field(product, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)
  })

  it('Product y Presentation declaran createdAt y updatedAt', () => {
    // R18: instante de creacion y de ultima modificacion, y el segundo se actualiza solo.
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
    // R19: tablas, columnas e indices en ingles y `snake_case`.
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
      // Todo campo escalar en `camelCase` con mayuscula dentro tiene que declarar su
      // `@map`, o la columna real saldria en `camelCase` y R19 se incumpliria sin aviso.
      for (const candidate of model.fields) {
        if (!/[A-Z]/.test(candidate.name)) continue
        if (candidate.isList || candidate.type === 'Presentation') continue
        expect(candidate.attributes, `falta @map en ${modelName}.${candidate.name}`).toMatch(
          /@map\("/,
        )
      }
    }

    // Cada columna del producto, con el nombre en ingles que le toca.
    for (const [name, column] of PRODUCT_BUSINESS_FIELDS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(product, name).attributes)
      expect(mapped?.[1] ?? name, `Product.${name} debe mapear a ${column}`).toBe(column)
    }

    // Los indices que crea esta feature, tambien en ingles.
    const indexMaps = [...product.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    // 2026-09-09: la presentacion se mudo a `product_batches`, asi que `products` conservaba
    // SOLO el indice de la FK de unidad (`products_unit_id_idx`, QC-32 R20).
    // 2026-09-11, QC-80 R7: ese indice TAMBIEN se va, con la columna y la FK. `products` no
    // declaraba ya ningun `@@index`: el unico que le quedaba era el de la unidad.
    // 2026-09-11, QC-49 R10: NACE `products_company_id_idx`, y vuelve a ser el unico. La
    // igualdad exacta se conserva: un indice de mas es una migracion que nadie declaro.
    expect(indexMaps).toEqual(['products_company_id_idx'])
    for (const name of indexMaps) {
      expect(name ?? '', `el indice ${name ?? ''} debe ir en snake_case ingles`).toMatch(SNAKE_CASE)
    }
    expect(product.body, 'products_unit_id_idx se fue con la columna (R7)').not.toMatch(
      /products_unit_id_idx/,
    )

    // Y el de la presentacion, que es el que NACE en esta ficha (R3), en ingles igual.
    const presentationIndexMaps = [
      ...presentation.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g),
    ].map((match) => match[1])
    expect(presentationIndexMaps).toEqual(['presentations_unit_id_idx'])
    for (const name of presentationIndexMaps) {
      expect(name ?? '', `el indice ${name} debe ir en snake_case`).toMatch(SNAKE_CASE)
    }
  })

  it('los tres modelos declaran /// @module inventario', () => {
    // R20: modulo propietario declarado en el esquema. Se lee el texto CRUDO porque
    // `stripComments` se lleva justamente lo que aqui hay que comprobar.
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
    // Los modelos de `identity` siguen siendo de `identity`: esta feature no los adopta.
    expect(owners.get('User')).toBe('identity')
    expect(owners.get('Role')).toBe('identity')
    expect(owners.get('DocumentType')).toBe('identity')
  })

  it('la feature no anade ninguna ruta HTTP de productos ni presentaciones bajo app/api', () => {
    // R23: esta ficha es esquema y migracion. Ningun alta, consulta, edicion ni borrado, y
    // por tanto ningun flujo navegable. Se comprueba sobre el arbol de archivos.
    //
    // Esta prueba PERDIO tres clausulas que tenia antes (adaptadores driving vacios, domain
    // vacio y contrato `export {};` sin re-exports): afirmaban que el modulo `inventario`
    // seguia siendo el slot vacio que sembro QC-15, pero QC-20 es precisamente la ficha que
    // le da contenido — Server Actions en `adapters/driving/`, logica en `domain/` y
    // re-exports en el contrato (R23... y sobre todo R31/R34 de QC-20). Esas tres
    // afirmaciones ahora viven, adaptadas, en `tests/unit/inventario/scope.test.ts`.
    //
    // ACOTADO EL 2026-09-02 POR QC-24 (`specs/QC-24-modelo-recetas/design.md > 5.2`). Aqui
    // habia dos aserciones mas: que `domain/` estuviera VACIA y que el barrel fuera
    // literalmente `export {};`. Ninguna de las dos esta en R23, que enumera «operacion de
    // alta, consulta, edicion o borrado, adaptador driving, ruta, Server Action o pantalla»
    // — y un contrato de SOLO TIPOS no es ninguna de esas cosas: desaparece al compilar y no
    // ejecuta nada. Eran un retrato del repo del dia que se escribio el test, no un
    // requisito, y QC-24 tuvo que publicar `ProductCatalog` desde `inventario/domain/` justo
    // para que `recetas` pudiera apuntar a un producto SIN tocar su tabla (R18 de QC-24).
    // Lo que R23 si vigila se conserva y se hace explicito: el contrato de `inventario` no
    // expone ninguna operacion ejecutable.
    const moduleDir = join(repoRoot, 'lib', 'modules', 'inventario')
    const contract = stripComments(readFileSync(join(moduleDir, 'index.ts'), 'utf8'))
    // Nada de servidor: el barrel no puede ser un Server Action ni arrastrarlo.
    expect(contract).not.toMatch(/['"]use server['"]/)
    // El barrel solo reexporta de `./domain`; nunca un adaptador, que es por donde entraria
    // una operacion de alta/consulta/edicion/borrado (`docs/architecture.md > Modulos`).
    for (const reexport of contract.matchAll(/export\s[^;]*?\sfrom\s+'([^']+)'/g)) {
      expect(reexport[1], 'el contrato de inventario solo reexporta de ./domain').toMatch(
        /^\.\/domain\//,
      )
    }

    // La asercion original de QC-24 exigia que TODO export del contrato fuera `export type`.
    // QC-20 publica nueve factories (R31/R34) desde ese mismo barrel, asi que tal cual es
    // imposible de cumplir. Lo que QC-24 protegia no era la FORMA del contrato: era que
    // NINGUN OTRO MODULO dependiera del runtime de `inventario` — que `recetas` pueda
    // referirse a un producto sin arrastrarse la implementacion. Eso sigue importando, y esta
    // version lo vigila de forma directa: **ningun archivo fuera de `lib/composition/` puede
    // importar del BARREL `@/lib/modules/inventario` una FACTORIA DE CASO DE USO** -o sea
    // desde otro modulo, desde `app/`, desde `components/` o desde `hooks/`-.
    //
    // Por que el ambito llega hasta la UI y no se queda en `lib/modules/**` (matiz aportado
    // por la sesion de QC-24): la guardia hexagonal NO tapa este hueco por dos sitios a la vez.
    // Su bloque 5 permite expresamente importar el barrel de otro modulo, runtime incluido; y
    // su R13 impide que `app/`, `components/` y `hooks/` importen `domain`, `ports` o `driven`
    // de un modulo, pero **les permite el contrato**. Sin esta asercion, un Server Component
    // podria importar una factoria de `inventario` del barrel y saltarse `lib/composition`,
    // que es el punto UNICO de cableado (`tests/guards/guard-arquitectura-modulos.test.ts`,
    // linea ~618 y bloque 8).
    //
    // Una exencion deliberada, mas un motivo estructural que no necesita exencion:
    //   1. las SUBRUTAS del modulo. El patron exige comilla de cierre justo tras
    //      `inventario`, asi que compara el especificador EXACTO y no por prefijo: un
    //      `@/lib/modules/inventario/adapters/driving/...` es una Server Action y la UI la
    //      importa en runtime a proposito (`docs/architecture.md > Server Actions vs Route
    //      Handlers`). Marcarla seria prohibir justo el patron que el arnes prescribe.
    //   2. `lib/composition/**` NO necesita exencion: no esta entre `raicesVigiladas` (que
    //      son solo `lib/modules`, `app`, `components` y `hooks`), asi que el barrido nunca
    //      llega a leer sus archivos. Es justamente por eso que ese es el unico sitio
    //      legitimo que puede importar las factories en runtime para atar puerto a adaptador.
    //
    // ---------------------------------------------------------------------------------
    // ACOTADO EL 2026-09-03 (QC-22, pantalla-de-productos), por decision humana.
    // ---------------------------------------------------------------------------------
    //
    // Hasta hoy la regla era «todo import del barrel fuera de `lib/composition` debe ser
    // `import type`», o sea acotaba por la FORMA del import. Eso prohibia de paso algo que
    // nadie quiso prohibir: que un formulario de cliente se traiga un ESQUEMA ZOD del
    // contrato para validar con la MISMA regla que valida el servidor. Un esquema no cablea
    // nada, no arrastra persistencia y no se puede importar como tipo, porque se evalua.
    //
    // La regla pasa a acotar por LO QUE SE IMPORTA, que es lo que su propio comentario decia
    // defender: «un Server Component podria importar una FACTORIA de `inventario` del barrel
    // y saltarse `lib/composition`, que es el punto UNICO de cableado». Eso sigue cazandose,
    // entero. Tipos, esquemas zod y constantes del contrato pasan.
    //
    // Dos apoyos que no son opinion de esta ficha:
    //   1. La cabecera del propio barrel de QC-20 (`lib/modules/inventario/index.ts`) dice
    //      literalmente que «debe poder importarse desde un componente de cliente sin
    //      arrastrar servidor (R31, `design.md > 3`) —QC-22 lo hara—». QC-20 previo este
    //      import y a la vez escribio un guard que lo prohibia: es una contradiccion interna
    //      suya, y se resuelve a favor de lo que el barrel PROMETE.
    //   2. `docs/architecture.md > La regla de dependencias` ya permite a `components/**`,
    //      `hooks/**` y a los archivos `'use client'` importar `@/lib/modules/M` (el barrel),
    //      sin exigir en ningun sitio que sea solo tipo.
    //
    // El caso concreto que lo destapo: `app/(private)/inventario/components/presentation-select.tsx`
    // importa `createPresentationSchema` para prevalidar el nombre antes de llamar a la Server
    // Action. Ese import PASA. `createCreatePresentation` —la factoria del caso de uso— desde
    // el mismo archivo seguiria poniendo esto en rojo.
    //
    // Las dos exenciones anteriores se conservan intactas:
    //   1. las SUBRUTAS del modulo. El especificador se compara EXACTO, no por prefijo: un
    //      `@/lib/modules/inventario/adapters/driving/...` es una Server Action y la UI la
    //      importa en runtime a proposito (`docs/architecture.md > Server Actions vs Route
    //      Handlers`). Marcarla seria prohibir justo el patron que el arnes prescribe.
    //   2. `lib/composition/**` NO necesita exencion: no esta entre `raicesVigiladas` (que
    //      son solo `lib/modules`, `app`, `components` y `hooks`), asi que el barrido nunca
    //      llega a leer sus archivos. Es justamente por eso que ese es el unico sitio
    //      legitimo que puede importar las factories en runtime para atar puerto a adaptador.
    //
    // La lista de factorias NO se escribe a mano: se DERIVA del propio barrel. Cada caso de
    // uso se exporta junto a su tipo `...Deps` en la misma sentencia
    // (`export { createListProducts, type ListProductsDeps } from './domain/list-products'`),
    // y esa es la firma estructural que las distingue de `createProductSchema`, que tambien
    // empieza por «create» y no es una factoria. Asi, una decima factoria queda vigilada el
    // dia que se publique, sin que nadie tenga que acordarse de anadirla aqui.
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

    // Las nueve factorias de caso de uso, derivadas del barrel por su tipo `...Deps` hermano.
    const FACTORIAS_DE_CASO_DE_USO = new Set<string>()
    for (const sentencia of contract.matchAll(/export\s*\{([^}]*)\}\s*from\s*'[^']+'/g)) {
      const bindings = (sentencia[1] as string)
        .split(',')
        .map((binding) => binding.trim())
        .filter((binding) => binding.length > 0)
      // La firma: la sentencia publica ademas un tipo `...Deps`. Es lo que tiene un caso de
      // uso y no tiene un esquema, un tipo de vista ni una constante.
      if (!bindings.some((binding) => /^type\s+\w*Deps$/.test(binding))) continue
      for (const binding of bindings) {
        if (binding.startsWith('type ')) continue
        FACTORIAS_DE_CASO_DE_USO.add(binding.split(/\s+as\s+/)[0] as string)
      }
    }
    // Centinela del propio derivador: si el barrel cambia de forma y el parseo deja de
    // encontrar nada, esta asercion no vigilaria NADA y pasaria en verde. Las nueve de
    // `design.md > 3`; sube el numero el dia que se publique una decima, a conciencia.
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

    // Ninguna ruta HTTP ni Server Action de productos o presentaciones.
    for (const route of [
      join(repoRoot, 'app', 'api', 'products'),
      join(repoRoot, 'app', 'api', 'presentations'),
      join(repoRoot, 'app', 'api', 'inventario'),
    ]) {
      expect(existsSync(route), `${route} no debe existir en esta feature`).toBe(false)
    }
  })
})

// =======================================================================================
// T0 (QC-80, unidad-desde-la-presentacion) — R25: LA PRESENTACION SIGUE VIVIENDO SOLO EN
// `product_batches`.
//
// POR QUE SE RETIRO LA GUARDIA DE ALCANCE DE QC-90. Este bloque tenia ademas dos casos que
// censaban `db/migrations/` contra el merge-base con `origin/dev` y exigian que la rama no
// agregara ninguna carpeta: eran la guardia de ALCANCE de QC-90 (R29), una ficha que escribia
// sobre `product_batches` sin migrar y que YA ESTA MERGEADA — su trabajo termino ahi. QC-80 si
// anade una migracion, y a proposito (`20260911120000_presentation_unit`, `design.md > 2` y
// `> 10`), asi que aquellos dos casos se pondrian rojos por hacer justo lo que esta ficha tiene
// que hacer. Una feature no puede cumplir la afirmacion de alcance de otra. Con ellos se fueron
// sus cuatro ayudantes de censo por git y el import de `node:child_process`, que quedaron sin uso.
//
// Lo que SIGUE VIGENTE se conserva entero y pasa a ser la guardia de R25: `product_batches` no
// pierde ni gana ninguna columna en esta ficha —la presentacion es del LOTE y ahi se queda—, y
// la migracion que lo creo conserva sus dos CHECK y su RLS ENABLE+FORCE sin policies.
//
// Cubre R25.
//
// ACTUALIZADO EL 2026-09-15 POR QC-81 (lote-y-fecha-de-compra, `design.md > 0.3`), con la
// aprobacion del humano en F1.4 y por el mismo motivo que QC-80 retiro arriba la guardia de
// alcance de QC-90: una feature no puede cumplir la afirmacion de alcance de otra. Este bloque
// exigia TRES cosas que QC-81 tiene que cambiar a proposito, y se habria puesto rojo por hacer
// justo lo que esa ficha pide:
//   1. la lista EXACTA de escalares de `ProductBatch` --QC-81 anade `purchaseDate`
//      (`purchase_date`, fecha civil obligatoria, R1/R26)--;
//   2. `lot.isOptional === true` --QC-81 lo pasa a OBLIGATORIO por decision cerrada D7, que
//      cambia lo que QC-90 R12 dejo opcional a proposito--; y
//   3. la AUSENCIA de `@@unique` sobre `lot` («QC-49 R30: la unicidad (empresa, lote) es QC-81»)
//      --QC-81 es justo la ficha que la pone, R11--.
// DOS DE ESAS INVERSIONES VAN MAS ALLA DEL TEXTO LITERAL DE F1.4 Y LAS APROBO EXPLICITAMENTE EL
// HUMANO EL 2026-09-15 (hallazgo m2 de la revision de QC-81). Con la numeracion de la revision:
//   - `:433` -> `expect(lot.isOptional, 'lot es NOT NULL desde QC-81 (R7)').toBe(false)` en el caso
//     «ProductBatch declara la presentacion, el stock, el coste y la autoria mudados desde
//     products», FUERA de este bloque: la misma afirmacion que el punto 2, repetida alli;
//   - `:1111` -> el `@@unique([companyId, lot], map: "product_batches_company_lot_unique")` del caso
//     «R25, R28: ProductBatch conserva las columnas...» de abajo, que antes afirmaba su AUSENCIA
//     (punto 3).
// Si las lineas se mueven, valen las afirmaciones, no los numeros.
// Las tres se INVIERTEN aqui en vez de borrarse: pasan a vigilar la forma que QC-81 fija. El resto
// del bloque --la presentacion vive solo en el lote, `companyId` obligatorio y sin `@relation`, la
// forma de `unitCost` y de `expiryDate`-- sigue vigente y NO se toca. Lo que la base garantiza
// (NOT NULL, CHECK, indice, relleno) lo vigila
// `tests/unit/inventario/schema/product-batch-lot-migration.test.ts`.
// =======================================================================================

/**
 * Las columnas escalares de `ProductBatch`, con su nombre en la base: las que le dio
 * `20260909120000_product_batches`, la de empresa de QC-49 y la fecha de compra de QC-81.
 */
const PRODUCT_BATCH_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['productId', 'product_id'],
  ['presentationId', 'presentation_id'],
  ['stock', 'stock'],
  ['unitCost', 'unit_cost'],
  ['lot', 'lot'],
  // QC-81 R1/R26: la fecha de COMPRA del lote, fecha civil obligatoria. Vive en el LOTE y no en
  // el producto (D4): cada entrada de mercancia tiene la suya.
  ['purchaseDate', 'purchase_date'],
  ['expiryDate', 'expiry_date'],
  // QC-49 R2: el lote declara su empresa en COLUMNA PROPIA y no la deduce de su producto —sin
  // columna, QC-81 no podria construir la unicidad `(empresa, lote)`—.
  ['companyId', 'company_id'],
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
]

describe('QC-80 R25/R28 — la presentacion sigue viviendo solo en product_batches', () => {
  it('R25, R28: ProductBatch conserva las columnas que le dio 20260909120000_product_batches', () => {
    // R25 en positivo: el modelo no pierde nada Y no gana nada —la presentacion sigue siendo
    // del LOTE, y `products` no recupera ninguna `presentation_id`—. La forma detallada de cada
    // columna la comprueba el caso «ProductBatch declara la presentacion, el stock, el coste y
    // la autoria mudados desde products»; aqui se vigila el CONJUNTO, que es lo que una
    // migracion cambiaria.
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
    // QC-81 R7 (INVERTIDO, ver la cabecera del bloque): hasta QC-81 esta linea exigia `lot`
    // ANULABLE, como lo dejo QC-90 R12. La decision cerrada D7 de QC-81 lo hace OBLIGATORIO y la
    // migracion `20260913120000_product_batch_lot_and_purchase_date` rellena las filas sin lote
    // antes de apretar la columna. Sigue siendo TEXTO (D5): «ACME-2026-07» se puede teclear.
    const lot = field(productBatch, 'lot')
    expect(lot.isOptional, 'lot es NOT NULL desde QC-81 (R7)').toBe(false)
    expect(lot.type, 'lot sigue siendo texto, no entero (QC-81 D5)').toBe('String')
    expect(lot.attributes).not.toMatch(/@default\(/)
    // QC-81 R1/R26: la fecha de compra es fecha CIVIL obligatoria y sin `@default` --el «hoy» lo
    // pone el caso de uso con su reloj, no la base--.
    const purchaseDate = field(productBatch, 'purchaseDate')
    expect(purchaseDate.type).toBe('DateTime')
    expect(purchaseDate.isOptional, 'purchase_date es NOT NULL (QC-81 R1)').toBe(false)
    expect(purchaseDate.attributes).toContain('@db.Date')
    expect(purchaseDate.attributes).not.toMatch(/@default\(/)
    expect(field(productBatch, 'expiryDate').isOptional, 'expiry_date sigue anulable').toBe(true)
    expect(field(productBatch, 'expiryDate').attributes).toContain('@db.Date')

    // Igualdad EXACTA de escalares: una columna DE MAS es una migracion. Si una ficha la anade a
    // proposito, se anota en `PRODUCT_BATCH_COLUMNS` con su motivo (como hizo QC-81).
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

    // QC-49 R2 y R10: la empresa del lote es obligatoria, uuid, escalar sin `@relation`, y
    // esta indexada. Si fuera anulable, un lote podria quedarse sin dueno y el disparador de
    // coherencia con su producto no tendria nada que comparar.
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
    // QC-81 R11/R12 (INVERTIDO, ver la cabecera del bloque): esta linea afirmaba la AUSENCIA de
    // la unicidad `(empresa, lote)` porque QC-49 R30 la dejaba para QC-81. QC-81 la pone: un
    // unico compuesto, no parcial, con el nombre que tiene en la base. Por empresa y no global:
    // dos empresas pueden repetir valor de lote (R12), una empresa no (R11).
    expect(productBatch.body, 'la unicidad (empresa, lote) la declara QC-81 (R11)').toMatch(
      /@@unique\(\[companyId,\s*lot\],\s*map:\s*"product_batches_company_lot_unique"\)/,
    )
    expect(productBatch.body, 'ninguna unicidad GLOBAL de lote (R12)').not.toMatch(
      /@@unique\(\[lot\]/,
    )
    expect(productBatch.body).not.toMatch(/\blot\b[^\n]*@unique/)
  })

  it('R25, R28: la migracion de product_batches conserva sus dos CHECK y su RLS ENABLE+FORCE sin policies', () => {
    // La tabla donde vive la presentacion queda «tal como la dejo 20260909120000_product_batches,
    // con su RLS activado y forzado y sin policies». Se lee el SQL: Prisma no modela ni CHECK ni RLS, asi que si alguien los
    // toca no hay tipo ni cliente generado que se entere.
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
    // Sin policies: deny-by-default. La autorizacion real vive en el caso de uso
    // (`docs/architecture.md > Acceso a datos y autorizacion`), la RLS es defensa en
    // profundidad -y una policy aqui seria mover la presentacion de sitio, que es lo que R25 veta-.
    expect(sql, 'la migracion de product_batches no declara ninguna policy').not.toMatch(
      /CREATE POLICY/i,
    )
  })

  it('R25: products no recupera ninguna presentation_id en el esquema', () => {
    // La mitad de R25 que vive en `db/schema.prisma` (la del SQL la cierra
    // `presentation-unit-migration.test.ts`). QC-90 mudo la presentacion de `products` a
    // `product_batches`; esta ficha NO la devuelve. Devolversela reabriria lo que QC-90
    // cerro y crearia dos verdades sobre la presentacion de un producto.
    expect(has(product, 'presentationId'), 'products no recupera presentation_id (R25)').toBe(false)
    expect(product.body).not.toMatch(/presentation_id/)
    // Ni por relacion: el unico campo de Product hacia el lote es la lista `batches`.
    const relaciones = product.fields
      .filter((candidate) => /@relation/.test(candidate.attributes) || candidate.isList)
      .map((candidate) => candidate.name)
    expect(relaciones).toEqual(['batches'])
    // Y `Presentation` sigue apuntando SOLO a los lotes, no a los productos.
    expect(field(presentation, 'batches').type).toBe('ProductBatch')
    expect(presentation.body).not.toMatch(/\bProduct\b\[?\]?\s/)
  })

  it('R28: ProductBatch conserva stock y unitCost con su forma, y esta ficha no los toca', () => {
    // R28 en el esquema: esta ficha no mueve ninguna existencia ni toca ningun importe. El
    // censo de columnas de arriba ya lo vigila en conjunto; aqui se fija la FORMA de las dos
    // que guardan valor, que es lo que un cambio de tipo estropearia sin cambiar el censo.
    const stock = field(productBatch, 'stock')
    expect(stock.type, 'stock sigue siendo Int (entero, sin parte decimal)').toBe('Int')
    expect(stock.isOptional).toBe(false)

    const unitCost = field(productBatch, 'unitCost')
    expect(unitCost.type, 'unit_cost sigue siendo Decimal, nunca Float').toBe('Decimal')
    expect(unitCost.isOptional).toBe(false)
    expect(unitCost.attributes).toMatch(/@db\.Decimal\(14,\s*4\)/)
    expect(unitCost.attributes).not.toMatch(/@db\.(Real|DoublePrecision|Money)/)

    // Y el lote NO gana unidad propia: la unidad la declara la PRESENTACION del lote (R1),
    // que es de donde R22 la deriva. Una `unit_id` aqui seria una tercera verdad.
    expect(has(productBatch, 'unitId'), 'el lote no declara unidad: la declara su presentacion').toBe(
      false,
    )
    expect(productBatch.body).not.toMatch(/unit_id/)

    // La migracion de esta ficha no escribe una sola linea sobre `product_batches`.
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
    // Limite de la ficha. QC-52 separo a conciencia la unidad de la linea de catalogo del
    // proveedor: lo del proveedor son TERMINOS COMERCIALES —«me lo venden en garrafas»—, no
    // propiedades de la cosa. Hacerla obligatoria «por coherencia» con la presentacion seria
    // salirse del alcance y romper filas que hoy no la declaran.
    const supplierLine = parseModel('SupplierCatalogLine')
    const unitId = field(supplierLine, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional, 'la unidad de la linea de proveedor sigue siendo OPCIONAL').toBe(true)
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).not.toMatch(/@default\(/)
    expect(unitId.attributes).not.toMatch(/@relation/)
    // Y su presentacion propia tampoco cambia de forma: obligatoria, como la dejo QC-52.
    const presentationId = field(supplierLine, 'presentationId')
    expect(presentationId.isOptional).toBe(false)
    expect(presentationId.attributes).toContain('@map("presentation_id")')
    // Sus dos indices siguen ahi: la ficha no borra ninguno de los que NO son de `products`.
    expect(supplierLine.body).toMatch(
      /@@index\(\[unitId\],\s*map:\s*"supplier_catalog_lines_unit_id_idx"\)/,
    )
    expect(supplierLine.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"supplier_catalog_lines_presentation_id_idx"\)/,
    )
  })

  it('R9: Presentation no gana borrado logico y conserva sus marcas en ingles', () => {
    // Decision heredada y no reabierta (QC-4 y QC-14 decision cerrada 2): identificadores de
    // base EN INGLES y `created_at`/`updated_at`. `presentations` NO tiene borrado logico, y
    // esta ficha —que le anade una columna— no es la excusa para metérselo: con `deleted_at`,
    // borrar seria un UPDATE y la FK `product_batches_presentation_id_fkey` no podria
    // bloquearlo. La forma completa del modelo la vigila el primer caso del archivo; aqui se
    // afirma la AUSENCIA en positivo y el idioma de las dos marcas.
    expect(has(presentation, 'deletedAt'), 'presentations sigue sin borrado logico (R9)').toBe(false)
    expect(presentation.body).not.toMatch(/deleted_at/)
    expect(presentation.body).not.toMatch(/borrado|eliminado|fecha_/i)

    expect(field(presentation, 'createdAt').attributes).toContain('@map("created_at")')
    expect(field(presentation, 'updatedAt').attributes).toContain('@map("updated_at")')
    expect(presentation.body).toContain('@@map("presentations")')

    // Y la columna nueva tambien llega en ingles: `unit_id`, no `unidad_id`.
    expect(field(presentation, 'unitId').attributes).toContain('@map("unit_id")')

    // El SQL de la migracion tampoco anade ninguna columna de borrado ni nada en espanol.
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
