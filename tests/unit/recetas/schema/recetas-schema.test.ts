// T7 — Contrato estatico de `db/schema.prisma` (QC-24: modelo-recetas).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/inventario/schema/inventario-schema.test.ts`: lo que se vigila aqui es la
// DECLARACION, no el cliente generado. Un tipo de Prisma no distingue un campo obligatorio
// de uno con default, no dice si `quantity` es decimal exacto o coma flotante, no dice si
// una columna lleva `@relation` y no ve los comentarios `/// @module`.
//
// Varios casos afirman una AUSENCIA en positivo, y las dos que mas importan son deliberadas
// (`design.md` secciones 2.1, 4.1 y 4.3): NINGUN `@relation` de `RecipeLine` a `Product` ni
// de `Recipe` a `User` —la FK es real pero vive escrita a mano en la migracion, para que el
// cliente Prisma no pueda atravesar de modulo con un `include`— y NINGUN `@unique` sobre el
// nombre —la unicidad es un indice PARCIAL que Prisma no modela—. El test existe para que
// nadie las «arregle» sin darse cuenta. Se suman `RecipeLine` sin `deletedAt` (decision
// cerrada 5) y la ausencia de cualquier enum o catalogo de unidades (decision cerrada 9).
//
// Cubre R1, R2, R3, R4, R5, R6, R8, R10, R13, R15, R17, R19, R21, R22, R23, R24, R28, R33.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

/** Texto crudo, con los `///`: lo necesita R17, que afirma sobre los comentarios. */
const rawSchema = readFileSync(join(repoRoot, 'db', 'schema.prisma'), 'utf8')

/** Quita comentarios `//` y `///`: el schema los usa para explicar, no para declarar. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
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

const recipe = parseModel('Recipe')
const recipeLine = parseModel('RecipeLine')

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
// El caso de la unidad de la linea afirmaba `expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)`:
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

/** Campos escalares del modelo: sin listas y sin el lado objeto de una relacion. */
function scalarNames(model: PrismaModel, relationTypes: readonly string[]): readonly string[] {
  return model.fields
    .filter((candidate) => !candidate.isList && !relationTypes.includes(candidate.type))
    .map((candidate) => candidate.name)
    .sort()
}

/** Cada campo de `Recipe`, con la columna en ingles que le toca (R28). */
const RECIPE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['name', 'name'],
  ['nameNormalized', 'name_normalized'],
  ['description', 'description'],
  ['steps', 'steps'],
  ['imagePath', 'image_path'],
  // 2026-09-16, QC-50 (aislamiento-por-empresa-en-recetas): Recipe gana `companyId` por el
  // mismo motivo que ya lo tienen `Product`/`Presentation`/`ProductBatch` desde QC-49 y
  // `Order` desde QC-60: sin ella, filtrar recetas por empresa dependeria de un `join`
  // implicito con otra tabla en vez de una columna propia. Es `String @map("company_id")
  // @db.Uuid` SIN `@relation` -la FK esta escrita a mano en la migracion, es drift
  // deliberado, igual que `createdBy`/`updatedBy` de esta misma tabla- y sin `@@unique` ni
  // `@@index` propios en el modelo porque el unico indice de empresa es PARCIAL (filtra por
  // `deleted_at IS NULL`) y por eso vive solo en el `migration.sql`, no en el esquema.
  ['companyId', 'company_id'],
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['deletedAt', 'deleted_at'],
  ['parentRecipeId', 'parent_recipe_id'],
]

/** Cada campo escalar de `RecipeLine`, con su columna (R28).
 *
 *  La linea ya no lleva unidad propia: expresa su parte como porcentaje de la receta. */
const RECIPE_LINE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['recipeId', 'recipe_id'],
  ['productId', 'product_id'],
  ['percentage', 'percentage'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
]

/** Los escalares que cruzan de modulo y por eso NO llevan `@relation` (R19). */
const CROSS_MODULE_SCALARS: ReadonlyArray<readonly [PrismaModel, string, string]> = [
  [recipeLine, 'productId', 'product_id'],
  [recipe, 'createdBy', 'created_by'],
  [recipe, 'updatedBy', 'updated_by'],
]

describe('db/schema.prisma — modelo de receta y linea de receta', () => {
  it('Recipe declara id uuid propio, nombre, descripcion, pasos y direccion de imagen', () => {
    // R1: identificador propio, estable y no derivado de ningun dato de negocio, mas los
    // datos de la receta.
    const id = field(recipe, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    // Ni el nombre ni ningun otro dato de negocio forma parte de la clave.
    expect(recipe.body).not.toMatch(/@@id\(/)

    expect(field(recipe, 'name').type).toBe('String')
    expect(field(recipe, 'description').type).toBe('String')
    expect(field(recipe, 'description').isOptional).toBe(true)
    expect(field(recipe, 'steps').type).toBe('Json')
    expect(field(recipe, 'imagePath').type).toBe('String')

    // La forma completa de la tabla: si alguien anade o quita una columna, este test lo dice.
    expect(scalarNames(recipe, ['RecipeLine', 'Recipe'])).toEqual(RECIPE_COLUMNS.map(([name]) => name).sort())
    expect(recipe.body).toContain('@@map("recipes")')
  })

  it('name es obligatorio y sin default', () => {
    // R2: sin nombre no hay fila. Obligatorio de verdad: un `@default` rellenaria el hueco
    // en silencio y el rechazo no ocurriria nunca.
    const name = field(recipe, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)
    expect(name.attributes).not.toMatch(/dbgenerated/)
  })

  it('name y description son TEXT, sin varchar ni limite declarado', () => {
    // R3: los 120 / 500 caracteres son validacion de aplicacion (QC-25), no de la columna.
    // Un `@db.VarChar(n)` los bajaria a la base y obligaria a una migracion para cambiarlos.
    for (const fieldName of ['name', 'nameNormalized', 'description'] as const) {
      const candidate = field(recipe, fieldName)
      expect(candidate.type, `Recipe.${fieldName} debe ser String`).toBe('String')
      expect(candidate.attributes, `Recipe.${fieldName} no debe declarar varchar`).not.toMatch(
        /@db\.(VarChar|Char)\s*\(/,
      )
      expect(candidate.attributes, `Recipe.${fieldName} no debe declarar tipo nativo`).not.toMatch(
        /@db\.\w+/,
      )
    }
  })

  it('steps es un unico campo Json y no existe ningun modelo de paso', () => {
    // R4 y decision cerrada 10: un solo documento JSON en una sola columna. Sin tabla de
    // pasos, sin columna de orden: el orden es el de la lista dentro del documento.
    const jsonFields = recipe.fields.filter((candidate) => candidate.type === 'Json')
    expect(jsonFields.map((candidate) => candidate.name)).toEqual(['steps'])
    expect(recipeLine.fields.some((candidate) => candidate.type === 'Json')).toBe(false)

    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['RecipeStep', 'Step', 'RecipeInstruction', 'Instruction']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
    expect(schema).not.toMatch(/@@map\("(steps|recipe_steps|instructions)"\)/)

    // Ninguna columna de orden derivada, ni en la receta ni en la linea.
    for (const forbidden of ['order', 'position', 'sortOrder', 'stepOrder', 'sequence']) {
      expect(has(recipe, forbidden), `Recipe.${forbidden} no debe existir`).toBe(false)
      expect(has(recipeLine, forbidden), `RecipeLine.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('steps no es opcional y declara default lista vacia', () => {
    // R5: «sin pasos» es una lista vacia, no ausencia de valor. Si fuera anulable
    // convivirian «receta sin pasos» y «pasos desconocidos» sin poder distinguirse, y cada
    // consumidor pondria su propio `?? []` (`design.md` seccion 2.1).
    const steps = field(recipe, 'steps')
    expect(steps.type).toBe('Json')
    expect(steps.isOptional).toBe(false)
    expect(steps.attributes).toMatch(/@default\("\[\]"\)/)
  })

  it('image_path es la unica columna de imagen y es opcional', () => {
    // R6 y decision cerrada 11: una sola columna de texto con la direccion. El modelo no
    // guarda el contenido del archivo ni sabe donde vive.
    const imagePath = field(recipe, 'imagePath')
    expect(imagePath.type).toBe('String')
    expect(imagePath.isOptional).toBe(true)
    expect(imagePath.attributes).toContain('@map("image_path")')
    expect(imagePath.attributes).not.toMatch(/@default\(/)

    const imageish = [...recipe.fields, ...recipeLine.fields]
      .filter((candidate) => /image|photo|picture|file|attachment/i.test(candidate.name))
      .map((candidate) => candidate.name)
    expect(imageish).toEqual(['imagePath'])
    // Nada de bytes en la base: la columna es texto, no binario.
    expect(imagePath.type).not.toBe('Bytes')
    expect(recipe.body).not.toMatch(/Bytes/)
  })

  it('Recipe declara name_normalized obligatorio', () => {
    // R8: el nombre normalizado se PERSISTE en su propia columna, junto al original. La
    // unica definicion de la normalizacion la publica el contrato del modulo
    // (`normalizeRecipeName`), y eso lo comprueba `module-contract.test.ts`.
    const nameNormalized = field(recipe, 'nameNormalized')
    expect(nameNormalized.type).toBe('String')
    expect(nameNormalized.isOptional).toBe(false)
    expect(nameNormalized.attributes).toContain('@map("name_normalized")')
    expect(nameNormalized.attributes).not.toMatch(/@default\(/)
    // No es columna generada por la base: la escribe la aplicacion (`design.md` seccion 3,
    // alternativa 8.5) porque quitar acentos en SQL no es `IMMUTABLE`.
    expect(nameNormalized.attributes).not.toMatch(/dbgenerated/)
    // Y sigue existiendo el nombre original al lado.
    expect(has(recipe, 'name')).toBe(true)
  })

  it('name y name_normalized no llevan @unique: la unicidad es un indice PARCIAL de la migracion', () => {
    // R7 / R9 en su forma de AUSENCIA deliberada (`design.md` secciones 2.1 «OJO 2» y 4.3).
    // Un `@unique` aqui alcanzaria tambien a las recetas borradas logicamente y R9 dejaria
    // de cumplirse en silencio. La garantia vive en `recipes_name_unique`, que es parcial.
    expect(field(recipe, 'name').attributes).not.toMatch(/@unique/)
    expect(field(recipe, 'nameNormalized').attributes).not.toMatch(/@unique/)
    expect(recipe.body).not.toMatch(/@@unique\(/)
    // El unico `@@unique` de esta feature es el de la linea, y es por pareja.
    expect(recipeLine.body).toMatch(/@@unique\(\[recipeId,\s*productId\]/)
  })

  it('RecipeLine declara receta, producto y porcentaje como entidad propia con id', () => {
    // R10: entidad propia, no tabla de union sin datos. Tiene clave primaria propia y un
    // dato propio (el porcentaje).
    const id = field(recipeLine, 'id')
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(recipeLine.body).not.toMatch(/@@id\(/)

    for (const fieldName of ['recipeId', 'productId', 'percentage'] as const) {
      const candidate = field(recipeLine, fieldName)
      expect(candidate.isOptional, `RecipeLine.${fieldName} no puede ser opcional`).toBe(false)
    }
    expect(scalarNames(recipeLine, ['Recipe'])).toEqual(
      RECIPE_LINE_COLUMNS.map(([name]) => name).sort(),
    )
    expect(recipeLine.body).toContain('@@map("recipe_lines")')

    // La relacion intra-modulo con la receta si lleva `@relation`, y es la que da el CASCADE.
    const relation = field(recipeLine, 'recipe')
    expect(relation.type).toBe('Recipe')
    expect(relation.isOptional).toBe(false)
    expect(relation.attributes).toMatch(/fields:\s*\[recipeId\]/)
    expect(relation.attributes).toMatch(/onDelete:\s*Cascade/)
    // Y `Recipe` ve sus lineas: la coleccion existe del otro lado.
    expect(field(recipe, 'lines').isList).toBe(true)
    expect(field(recipe, 'lines').type).toBe('RecipeLine')
  })

  it('percentage es Decimal(5,2) obligatorio y en los dos modelos no hay ningun Float', () => {
    // R1, R6: decimal exacto, hasta 2 decimales. La coma flotante binaria es un anti-patron
    // bloqueante (`docs/architecture.md > Dominio` n.o 4).
    const percentage = field(recipeLine, 'percentage')
    expect(percentage.type).toBe('Decimal')
    expect(percentage.isOptional).toBe(false)
    expect(percentage.attributes).toMatch(/@db\.Decimal\(\s*5\s*,\s*2\s*\)/)
    expect(percentage.attributes).not.toMatch(/@default\(/)

    for (const candidate of [...recipe.fields, ...recipeLine.fields]) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
      expect(candidate.attributes, `${candidate.name} no puede ser coma flotante`).not.toMatch(
        /@db\.(Real|DoublePrecision|Money)/,
      )
    }
  })

  it('la linea de receta ya no lleva ninguna unidad propia', () => {
    // R1: la linea expresa la parte del insumo como porcentaje, sin unidad de medida propia.
    expectUnitCatalogIsNotAnEnum()
    expect(has(recipeLine, 'unitId')).toBe(false)
    expect(has(recipeLine, 'unit')).toBe(false)
    expect(recipeLine.body).not.toMatch(/unit_id/)
    expect(recipeLine.body).not.toMatch(/^\s*unit\s+String/m)
    // Ninguna columna de conversion entre unidades, ni en la linea ni en el catalogo.
    for (const forbidden of ['factor', 'conversion', 'ratio', 'baseUnit']) {
      expect(has(recipeLine, forbidden), `RecipeLine.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('los dos modelos declaran /// @module recetas', () => {
    // R17: modulo propietario declarado en el esquema. Se lee el texto CRUDO porque
    // `stripComments` se lleva justamente lo que aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Recipe')).toBe('recetas')
    expect(owners.get('RecipeLine')).toBe('recetas')

    const recetasModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'recetas')
      .map(([modelName]) => modelName)
      .sort()
    expect(recetasModels).toEqual(['Recipe', 'RecipeLine'])
    // Esta feature no adopta modelos ajenos: siguen siendo de su modulo.
    expect(owners.get('Product')).toBe('inventario')
    expect(owners.get('Presentation')).toBe('inventario')
    expect(owners.get('User')).toBe('identity')
  })

  it('product_id, created_by y updated_by son escalares uuid SIN @relation', () => {
    // R19 y decision cerrada 3: la FK es REAL, pero vive escrita a mano en `migration.sql`.
    // Declararla con `@relation` regalaria `include: { product: true }` desde `recetas`, y
    // ninguna guardia lo detectaria porque no es un import (`design.md` secciones 4.1, 8.1).
    for (const [model, fieldName, column] of CROSS_MODULE_SCALARS) {
      const candidate = field(model, fieldName)
      expect(candidate.type, `${fieldName} debe ser String`).toBe('String')
      expect(candidate.attributes, `${fieldName} debe ser uuid`).toContain('@db.Uuid')
      expect(candidate.attributes, `${fieldName} debe mapear a ${column}`).toContain(
        `@map("${column}")`,
      )
      expect(candidate.attributes, `${fieldName} NO puede llevar @relation`).not.toMatch(/@relation/)
    }

    // Ningun campo de los dos modelos apunta a `Product` ni a `User` como objeto: no hay
    // por donde atravesar con un `include`.
    for (const model of [recipe, recipeLine]) {
      for (const candidate of model.fields) {
        expect(candidate.type, `${candidate.name} no puede apuntar a otro modulo`).not.toBe(
          'Product',
        )
        expect(candidate.type, `${candidate.name} no puede apuntar a otro modulo`).not.toBe('User')
      }
    }
    // Los unicos `@relation` son intra-modulo: version <-> original y linea -> receta.
    const relations = [...recipe.fields, ...recipeLine.fields].filter((candidate) =>
      /@relation/.test(candidate.attributes),
    )
    expect(relations.map((candidate) => candidate.name)).toEqual(['parent', 'versions', 'recipe'])
    // Y `User` no gana ninguna coleccion de recetas del otro lado, ni `Product` de lineas.
    const user = parseModel('User')
    expect(user.fields.some((candidate) => candidate.type === 'Recipe')).toBe(false)
    const product = parseModel('Product')
    expect(product.fields.some((candidate) => candidate.type === 'RecipeLine')).toBe(false)
  })

  it('created_by y updated_by existen como escalares uuid', () => {
    // R21: se registra quien creo la receta y quien la modifico por ultima vez. La FK real
    // (que rechaza un usuario inexistente) la comprueba `recetas-migration.test.ts`.
    for (const fieldName of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(recipe, fieldName)
      expect(candidate.type).toBe('String')
      expect(candidate.attributes).toContain('@db.Uuid')
    }
    // Con su indice: Postgres no indexa el lado hijo de una FK y por ahi pasa el RESTRICT.
    expect(recipe.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"recipes_created_by_idx"\)/)
    expect(recipe.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"recipes_updated_by_idx"\)/)
    // La linea NO lleva auditoria propia: quien edita una formula edita la receta.
    expect(has(recipeLine, 'createdBy')).toBe(false)
    expect(has(recipeLine, 'updatedBy')).toBe(false)
  })

  it('created_by y updated_by son opcionales', () => {
    // R33 y decision cerrada 22: NULL significa «no la creo una persona» —una importacion,
    // un seed—, no «se perdio el dato». Un `@default` convertiria la ausencia en un valor.
    for (const fieldName of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(recipe, fieldName)
      expect(candidate.isOptional, `Recipe.${fieldName} debe ser opcional`).toBe(true)
      expect(candidate.attributes, `Recipe.${fieldName} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
  })

  it('Recipe declara deletedAt opcional', () => {
    // R22: borrar conserva la fila completa y registra el instante.
    const deletedAt = field(recipe, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)
  })

  it('Recipe y RecipeLine declaran createdAt y updatedAt', () => {
    // R23: instante de creacion y de ultima modificacion, y el segundo se actualiza solo.
    for (const [modelName, model] of [
      ['Recipe', recipe],
      ['RecipeLine', recipeLine],
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

  it('RecipeLine no declara deletedAt', () => {
    // R24 y decision cerrada 5: quitar un producto de una receta ELIMINA la fila. La linea
    // es parte de la receta, no un hecho historico. Ausencia afirmada en positivo para que
    // nadie anada la columna «por simetria» con `Recipe`.
    expect(has(recipeLine, 'deletedAt')).toBe(false)
    expect(recipeLine.body).not.toMatch(/deleted_at/)
    expect(recipeLine.body).not.toMatch(/deletedAt/)
    // La receta si la lleva: las dos decisiones conviven a proposito.
    expect(has(recipe, 'deletedAt')).toBe(true)
  })

  it('las dos tablas y sus columnas mapean a snake_case en ingles', () => {
    // R28: tablas, columnas e indices en ingles y `snake_case`.
    expect(recipe.body).toContain('@@map("recipes")')
    expect(recipeLine.body).toContain('@@map("recipe_lines")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [modelName, model, columns, relationTypes] of [
      ['Recipe', recipe, RECIPE_COLUMNS, ['RecipeLine']],
      ['RecipeLine', recipeLine, RECIPE_LINE_COLUMNS, ['Recipe']],
    ] as const) {
      for (const [name, column] of columns) {
        const mapped = /@map\("([^"]+)"\)/.exec(field(model, name).attributes)
        expect(mapped?.[1] ?? name, `${modelName}.${name} debe mapear a ${column}`).toBe(column)
        expect(column, `${modelName}.${name} -> ${column}`).toMatch(SNAKE_CASE)
      }
      // Todo campo escalar en `camelCase` con mayuscula dentro tiene que declarar su
      // `@map`, o la columna real saldria en `camelCase` y R28 se incumpliria sin aviso.
      const tiposDeRelacion: readonly string[] = relationTypes
      for (const candidate of model.fields) {
        if (!/[A-Z]/.test(candidate.name)) continue
        if (candidate.isList || tiposDeRelacion.includes(candidate.type)) continue
        expect(candidate.attributes, `falta @map en ${modelName}.${candidate.name}`).toMatch(
          /@map\("/,
        )
      }
    }

    // Los indices que crea esta feature, tambien en ingles.
    const indexMaps = [...recipe.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)]
      .concat([...recipeLine.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)])
      .map((match) => match[1])
    // Lo que este caso vigila: TODO indice de los dos modelos esta en ingles y la lista es
    // cerrada, para que anadir uno a escondidas ponga el test rojo.
    expect(indexMaps).toEqual([
      'recipes_created_by_idx',
      'recipes_updated_by_idx',
      'recipe_lines_product_id_idx',
    ])
    expect(recipeLine.body).toMatch(/map:\s*"recipe_lines_recipe_id_product_id_key"/)
  })
})
