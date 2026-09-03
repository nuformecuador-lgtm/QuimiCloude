// T7 — Contrato estatico de `db/schema.prisma` (QC-32: modelo-unidades).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/recetas/schema/recetas-schema.test.ts` y
// `tests/unit/inventario/schema/inventario-schema.test.ts`: lo que se vigila aqui es la
// DECLARACION, no el cliente generado. Un tipo de Prisma no distingue un campo obligatorio de
// uno con default, no dice si una columna lleva `@relation`, no dice si `symbol` es `TEXT` o
// `VARCHAR(n)` y no ve los comentarios `/// @module`.
//
// Casi la mitad de los casos afirma una AUSENCIA en positivo, y todas son deliberadas
// (`specs/QC-32-modelo-unidades/design.md` secciones 2.1, 2.2, 2.3 y 4.3): `Unit` SIN
// `deletedAt` (decision cerrada 11, R8), SIN `@unique` ni indice sobre `symbol` (R7, pregunta
// abierta 1), SIN campos de vuelta hacia `Product` ni `RecipeLine` y SIN ningun factor de
// conversion (decision cerrada 12, R14); las dos `unitId` como escalares uuid SIN `@relation`
// —la FK es real pero vive escrita a mano en la migracion, para que el cliente Prisma no pueda
// atravesar de `inventario` ni de `recetas` a `unidades` con un `include`— (R18); y NINGUNA
// columna `unit` de texto en las dos tablas ajenas (R10, R11). El test existe para que nadie
// las «arregle» sin darse cuenta.
//
// Cubre R1, R2, R3, R4 (la columna persistida; la funcion la cubre `unit-name.test.ts`), R5
// (el `@@unique` del esquema; el indice unico real lo cubre `unidades-migration.test.ts`), R6,
// R7, R8, R9, R10, R11, R14, R15, R18 y R20.

import { readFileSync } from 'node:fs'
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

/** Texto crudo, con los `///`: lo necesita R15, que afirma sobre los comentarios. */
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

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

const unit = parseModel('Unit')
const product = parseModel('Product')
const recipeLine = parseModel('RecipeLine')

/** Cada campo de `Unit`, con la columna en ingles que le toca (R20). */
const UNIT_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['name', 'name'],
  ['nameNormalized', 'name_normalized'],
  ['symbol', 'symbol'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
]

/** Las dos referencias al catalogo que cruzan de modulo y por eso NO llevan `@relation` (R18). */
const CROSS_MODULE_UNIT_SCALARS: ReadonlyArray<readonly [string, PrismaModel, boolean]> = [
  ['Product', product, true],
  ['RecipeLine', recipeLine, false],
]

describe('db/schema.prisma — el catalogo de unidades', () => {
  it('Unit declara id uuid propio, nombre y simbolo', () => {
    // R1: identificador propio, estable y NO derivado de sus datos de negocio (el nombre no
    // forma parte de la clave), mas el nombre y el simbolo de la unidad.
    const id = field(unit, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    expect(unit.body).not.toMatch(/@@id\(/)

    expect(field(unit, 'name').type).toBe('String')
    expect(field(unit, 'symbol').type).toBe('String')

    // La forma completa de la tabla: si alguien anade o quita una columna, este test lo dice.
    expect([...unit.fields].map((candidate) => candidate.name).sort()).toEqual(
      UNIT_COLUMNS.map(([name]) => name).sort(),
    )
    expect(unit.body).toContain('@@map("units")')
  })

  it('name es obligatorio y sin default', () => {
    // R2: sin nombre no hay fila, y lo rechaza la BASE (el `NOT NULL` de la columna). Un
    // `@default` rellenaria el hueco en silencio y el rechazo no ocurriria nunca.
    const name = field(unit, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)
    expect(name.attributes).not.toMatch(/dbgenerated/)
  })

  it('symbol es opcional y no tiene default', () => {
    // R3 y decision cerrada 4: una unidad puede no tener simbolo, y esa ausencia se conserva
    // como AUSENCIA DE VALOR. Un `@default("")` la convertiria en cadena vacia y un
    // `@default` cualquiera en un valor inventado; en los dos casos «sin simbolo» y «con
    // simbolo vacio» dejarian de distinguirse (`design.md` seccion 2.1).
    const symbol = field(unit, 'symbol')
    expect(symbol.type).toBe('String')
    expect(symbol.isOptional).toBe(true)
    expect(symbol.attributes).not.toMatch(/@default\(/)
    expect(symbol.attributes).not.toMatch(/dbgenerated/)
    // Y no se copia del nombre por ningun mecanismo declarativo.
    expect(symbol.attributes).not.toMatch(/@map\("name"\)/)
  })

  it('Unit declara name_normalized obligatorio junto al nombre original, con su @@unique', () => {
    // R4 y R5 en su parte de esquema (decision cerrada 5): el nombre normalizado se PERSISTE
    // en su propia COLUMNA, al lado del original, y la unicidad es un `@@unique` sobre esa
    // columna —no una comparacion previa al vuelo, que seria una carrera—. La unica
    // definicion de la normalizacion la publica el contrato del modulo (`normalizeUnitName`)
    // y eso lo comprueba `module-contract.test.ts`; el indice unico REAL en el SQL lo
    // comprueba `unidades-migration.test.ts`.
    const nameNormalized = field(unit, 'nameNormalized')
    expect(nameNormalized.type).toBe('String')
    expect(nameNormalized.isOptional).toBe(false)
    expect(nameNormalized.attributes).toContain('@map("name_normalized")')
    expect(nameNormalized.attributes).not.toMatch(/@default\(/)
    // No es columna generada por la base: la escribe la aplicacion (`design.md` seccion 3),
    // porque quitar acentos en SQL no es `IMMUTABLE`.
    expect(nameNormalized.attributes).not.toMatch(/dbgenerated/)
    expect(has(unit, 'name')).toBe(true)

    // El `@@unique` es TOTAL, no parcial: sin `deleted_at` (R8) no hay filas muertas que
    // liberen el nombre, asi que Prisma si puede modelarlo aqui (a diferencia de `recipes`).
    expect(unit.body).toMatch(
      /@@unique\(\[nameNormalized\],\s*map:\s*"units_name_normalized_key"\)/,
    )
  })

  it('name y symbol son TEXT, sin varchar ni limite declarado', () => {
    // R6: los limites de longitud, si los hay, son validacion de aplicacion y pertenecen a
    // QC-38. Un `@db.VarChar(n)` los bajaria a la columna, obligaria a una migracion para
    // cambiarlos y haria que la BASE rechazara una unidad por longitud, que es justo lo que
    // R6 prohibe.
    for (const fieldName of ['name', 'nameNormalized', 'symbol'] as const) {
      const candidate = field(unit, fieldName)
      expect(candidate.type, `Unit.${fieldName} debe ser String`).toBe('String')
      expect(candidate.attributes, `Unit.${fieldName} no debe declarar varchar`).not.toMatch(
        /@db\.(VarChar|Char)\s*\(/,
      )
      expect(candidate.attributes, `Unit.${fieldName} no debe declarar tipo nativo`).not.toMatch(
        /@db\.\w+/,
      )
    }
    // Ni ningun limite disfrazado de otra cosa dentro del modelo.
    expect(unit.body).not.toMatch(/length/i)
  })

  it('no hay @unique ni indice sobre symbol', () => {
    // R7 y pregunta abierta 1, en su forma de AUSENCIA deliberada: la identidad de la unidad
    // es su NOMBRE. Dos unidades distintas pueden compartir simbolo. Anadir el indice despues
    // es aditivo y barato (el catalogo son cinco a veinte filas); quitarlo, no.
    expect(field(unit, 'symbol').attributes).not.toMatch(/@unique/)
    expect(unit.body).not.toMatch(/@@unique\([^)]*symbol/)
    expect(unit.body).not.toMatch(/@@index\([^)]*symbol/)
    // El unico `@@unique` del modelo es el del nombre normalizado, y no hay ningun `@@index`.
    expect([...unit.body.matchAll(/@@unique\(/g)]).toHaveLength(1)
    expect([...unit.body.matchAll(/@@index\(/g)]).toHaveLength(0)
    // Ningun otro campo lleva `@unique` suelto: la identidad no se reparte.
    for (const candidate of unit.fields) {
      expect(candidate.attributes, `Unit.${candidate.name} no debe llevar @unique`).not.toMatch(
        /@unique/,
      )
    }
  })

  it('Unit no declara deletedAt', () => {
    // R8 y decision cerrada 11, afirmado en positivo para que nadie anada la columna «por
    // simetria» con `Product` o con `Recipe`: el borrado logico es un UPDATE y NINGUNA FK
    // reacciona a un UPDATE, asi que `deleted_at` neutralizaria en silencio el
    // `ON DELETE RESTRICT` que es la unica garantia real de R13.
    expect(has(unit, 'deletedAt')).toBe(false)
    expect(unit.body).not.toMatch(/deletedAt/)
    expect(unit.body).not.toMatch(/deleted_at/)
    for (const forbidden of ['deleted', 'archivedAt', 'isActive', 'active', 'disabledAt']) {
      expect(has(unit, forbidden), `Unit.${forbidden} no debe existir`).toBe(false)
    }
    // `Product` si lo lleva: las dos decisiones conviven a proposito.
    expect(has(product, 'deletedAt')).toBe(true)
  })

  it('Unit declara createdAt y updatedAt', () => {
    // R9: instante de creacion e instante de la ultima modificacion, y el segundo se
    // actualiza SOLO en cada cambio (`@updatedAt`), no a mano en cada llamada.
    const createdAt = field(unit, 'createdAt')
    expect(createdAt.type).toBe('DateTime')
    expect(createdAt.isOptional).toBe(false)
    expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
    expect(createdAt.attributes).toContain('@map("created_at")')
    expect(createdAt.attributes).toContain('@db.Timestamptz(6)')

    const updatedAt = field(unit, 'updatedAt')
    expect(updatedAt.type).toBe('DateTime')
    expect(updatedAt.isOptional).toBe(false)
    expect(updatedAt.attributes).toContain('@updatedAt')
    expect(updatedAt.attributes).toContain('@map("updated_at")')
    expect(updatedAt.attributes).toContain('@db.Timestamptz(6)')
  })

  it('Unit no declara factor, base ni equivalencia', () => {
    // R14 y decision cerrada 12: NO hay conversion entre unidades y no la va a haber. La
    // unidad es puramente anotativa. Una columna de factor o de unidad base invitaria a
    // derivar cantidades, que es exactamente lo que este ERP no hace.
    for (const forbidden of [
      'factor',
      'base',
      'baseUnit',
      'baseUnitId',
      'conversion',
      'conversionFactor',
      'ratio',
      'multiplier',
      'equivalence',
      'precision',
      'decimals',
    ]) {
      expect(has(unit, forbidden), `Unit.${forbidden} no debe existir`).toBe(false)
    }
    // Ninguna columna numerica: las seis son texto, uuid y marcas de tiempo.
    for (const candidate of unit.fields) {
      for (const numerico of ['Decimal', 'Float', 'Int', 'BigInt'] as const) {
        expect(candidate.type, `Unit.${candidate.name} no puede ser ${numerico}`).not.toBe(numerico)
      }
    }
    // Y ningun modelo de conversion en todo el esquema.
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['UnitConversion', 'Conversion', 'UnitEquivalence']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
  })

  it('Unit declara /// @module unidades', () => {
    // R15: modulo propietario declarado en el esquema, y la guardia de modulos lo exige para
    // TODO modelo. Se lee el texto CRUDO porque `stripComments` se lleva justamente lo que
    // aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Unit')).toBe('unidades')

    // `unidades` es dueno de UN solo modelo: esta feature no adopta modelos ajenos, y los
    // otros dos siguen siendo de su modulo aunque esta migracion altere sus columnas.
    const unidadesModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'unidades')
      .map(([modelName]) => modelName)
      .sort()
    expect(unidadesModels).toEqual(['Unit'])
    expect(owners.get('Product')).toBe('inventario')
    expect(owners.get('RecipeLine')).toBe('recetas')
  })
})

describe('db/schema.prisma — la unidad del producto y la de la linea de receta', () => {
  it('Product declara unitId uuid OPCIONAL y ninguna columna unit de texto', () => {
    // R10 y decision cerrada 7: la unidad del producto pasa a ser una REFERENCIA al catalogo
    // y sigue siendo opcional, como fijo QC-14. Y el texto libre desaparece: si la columna
    // `unit` sobreviviera al lado de `unit_id`, habria dos verdades sobre la misma cosa.
    const unitId = field(product, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional).toBe(true)
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).toContain('@db.Uuid')
    expect(unitId.attributes).not.toMatch(/@default\(/)
    // Con su indice: Postgres no indexa el lado hijo de una FK, y por ahi pasa el RESTRICT.
    expect(product.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"products_unit_id_idx"\)/)

    // Ausencia en positivo: ni `unit` ni ningun alias de texto para la unidad.
    expect(has(product, 'unit')).toBe(false)
    expect(product.body).not.toMatch(/@map\("unit"\)/)
    for (const forbidden of ['unit', 'unitName', 'unitText', 'unidad', 'measure', 'uom']) {
      expect(has(product, forbidden), `Product.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('RecipeLine declara unitId uuid OBLIGATORIO y ninguna columna unit de texto', () => {
    // R11 y decision cerrada 8: la unidad de la linea sigue siendo OBLIGATORIA, como fijo
    // QC-24. Lo que cambia es la forma —referencia en vez de texto—, no la regla.
    const unitId = field(recipeLine, 'unitId')
    expect(unitId.type).toBe('String')
    expect(unitId.isOptional).toBe(false)
    expect(unitId.attributes).toContain('@map("unit_id")')
    expect(unitId.attributes).toContain('@db.Uuid')
    // Sin `@default`: un default sembraria referencias inventadas y «sin unidad» dejaria de
    // rechazarse.
    expect(unitId.attributes).not.toMatch(/@default\(/)
    expect(recipeLine.body).toMatch(/@@index\(\[unitId\],\s*map:\s*"recipe_lines_unit_id_idx"\)/)

    expect(has(recipeLine, 'unit')).toBe(false)
    expect(recipeLine.body).not.toMatch(/@map\("unit"\)/)
    for (const forbidden of ['unit', 'unitName', 'unitText', 'unidad', 'measure', 'uom']) {
      expect(has(recipeLine, forbidden), `RecipeLine.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('las dos unitId son escalares uuid SIN @relation y Unit no tiene campos de vuelta', () => {
    // R18 y decision cerrada 13: la FK es REAL, pero vive escrita a mano en `migration.sql`
    // (`design.md` secciones 4.3 y 8.1). Declararla con `@relation` regalaria
    // `include: { unit: true }` desde `inventario` y desde `recetas`, y NINGUNA guardia lo
    // detectaria porque un `include` no es un import; ademas obligaria a declarar
    // `products Product[]` y `lines RecipeLine[]` DENTRO de `Unit`, que es de otro modulo.
    for (const [modelName, model, isOptional] of CROSS_MODULE_UNIT_SCALARS) {
      const candidate = field(model, 'unitId')
      expect(candidate.type, `${modelName}.unitId debe ser String`).toBe('String')
      expect(candidate.attributes, `${modelName}.unitId debe ser uuid`).toContain('@db.Uuid')
      expect(candidate.attributes, `${modelName}.unitId debe mapear a unit_id`).toContain(
        '@map("unit_id")',
      )
      expect(candidate.attributes, `${modelName}.unitId NO puede llevar @relation`).not.toMatch(
        /@relation/,
      )
      expect(candidate.isOptional, `${modelName}.unitId opcional=${String(isOptional)}`).toBe(
        isOptional,
      )
      // Ningun campo de esos modelos apunta a `Unit` como objeto: no hay por donde atravesar.
      for (const other of model.fields) {
        expect(other.type, `${modelName}.${other.name} no puede apuntar a Unit`).not.toBe('Unit')
      }
    }

    // Y `Unit` no gana ninguna coleccion del otro lado: ni `products` ni `lines`.
    expect(has(unit, 'products')).toBe(false)
    expect(has(unit, 'lines')).toBe(false)
    expect(has(unit, 'recipeLines')).toBe(false)
    expect(unit.fields.some((candidate) => candidate.isList)).toBe(false)
    for (const candidate of unit.fields) {
      for (const ajeno of ['Product', 'RecipeLine', 'Recipe', 'User'] as const) {
        expect(candidate.type, `Unit.${candidate.name} no puede apuntar a ${ajeno}`).not.toBe(ajeno)
      }
    }
    // `Unit` no declara NINGUN `@relation`: no participa en ninguna relacion de Prisma.
    expect(unit.body).not.toMatch(/@relation/)
  })

  it('la tabla y sus columnas mapean a snake_case en ingles', () => {
    // R20 y decision cerrada 16: tabla, columnas e indices en ingles y `snake_case`.
    expect(unit.body).toContain('@@map("units")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [name, column] of UNIT_COLUMNS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(unit, name).attributes)
      expect(mapped?.[1] ?? name, `Unit.${name} debe mapear a ${column}`).toBe(column)
      expect(column, `Unit.${name} -> ${column}`).toMatch(SNAKE_CASE)
    }
    // Todo campo en `camelCase` con mayuscula dentro tiene que declarar su `@map`, o la
    // columna real saldria en `camelCase` y R20 se incumpliria sin aviso.
    for (const candidate of unit.fields) {
      if (!/[A-Z]/.test(candidate.name)) continue
      expect(candidate.attributes, `falta @map en Unit.${candidate.name}`).toMatch(/@map\("/)
    }

    // El indice unico y los dos indices de FK que crea esta feature, tambien en ingles.
    const indexNames = [
      ...unit.body.matchAll(/@@unique\([^)]*map:\s*"([^"]+)"/g),
      ...product.body.matchAll(/@@index\(\[unitId\][^)]*map:\s*"([^"]+)"/g),
      ...recipeLine.body.matchAll(/@@index\(\[unitId\][^)]*map:\s*"([^"]+)"/g),
    ]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    expect(indexNames).toEqual([
      'units_name_normalized_key',
      'products_unit_id_idx',
      'recipe_lines_unit_id_idx',
    ])
    for (const name of indexNames) expect(name).toMatch(SNAKE_CASE)
  })
})
