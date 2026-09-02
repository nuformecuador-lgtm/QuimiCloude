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

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

/** Los ocho datos del producto (R3), con su columna en la base (R19). */
const PRODUCT_BUSINESS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['name', 'name'],
  ['presentationId', 'presentation_id'],
  ['stock', 'stock'],
  ['cost', 'cost'],
  ['minPurchase', 'min_purchase'],
  ['deliveryTime', 'delivery_time'],
  ['qtyAlert', 'qty_alert'],
  ['unit', 'unit'],
]

/** Las cuatro columnas que R7 exige enteras. */
const INTEGER_FIELDS = ['stock', 'minPurchase', 'qtyAlert', 'deliveryTime'] as const

/** Las cinco columnas que R5 exige opcionales. */
const OPTIONAL_FIELDS = ['stock', 'cost', 'deliveryTime', 'qtyAlert', 'unit'] as const

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
    const scalarNames = presentation.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'Product')
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual(['createdAt', 'id', 'name', 'nameNormalized', 'updatedAt'])
    expect(has(presentation, 'deletedAt')).toBe(false)
    expect(presentation.body).not.toMatch(/deleted_at/)
  })

  it('el esquema declara exactamente dos modelos nuevos: Presentation y Product', () => {
    // R3: una sola entidad de producto. Ninguna tabla separada de «elemento de inventario».
    //
    // ACOTADO EL 2026-09-02 POR QC-24 (`specs/QC-24-modelo-recetas/`). Este caso enumeraba
    // los modelos del esquema ENTERO y exigia que fueran exactamente los cinco que habia el
    // dia que se escribio. Eso no es lo que R3 pide —R3 habla de la entidad de producto— y
    // convertia en rojo a cualquier feature posterior que anadiera un modelo: QC-24 anadio
    // `Recipe` y `RecipeLine`, que son de `recetas` y no tienen nada que ver con esta ficha.
    // Un test que se rompe cuando llega la feature siguiente estaba midiendo el repo, no su
    // feature. Se acota a lo que QC-14 garantiza SOBRE SI MISMA: cuantos modelos declara
    // `inventario`, que los de `identity` siguen ahi sin adoptar, y que la entidad separada
    // que la decision cerrada 1 fusiono no existe en ninguna parte del esquema. No se relaja
    // ninguna de esas tres: se relaja el censo global, que no era un requisito.
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
      .sort()

    // Los modelos que declara `inventario`, leidos de su `/// @module` (mismo criterio que
    // el caso de R20). Son DOS: la unica entidad de producto y su catalogo de presentacion.
    const inventarioModels = [
      ...rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g),
    ]
      .filter(([, moduleName]) => moduleName === 'inventario')
      .map(([, , modelName]) => modelName)
      .sort()
    expect(inventarioModels).toEqual(['Presentation', 'Product'])
    expect(inventarioModels).toHaveLength(2)

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

  it('Product declara los ocho datos del producto en una sola tabla', () => {
    // R3: nombre, presentacion, existencia, costo, compra minima, tiempo de entrega,
    // cantidad de alerta y unidad. Los ocho, en `products`.
    for (const [name] of PRODUCT_BUSINESS_FIELDS) {
      expect(has(product, name), `falta el campo Product.${name}`).toBe(true)
    }
    expect(PRODUCT_BUSINESS_FIELDS).toHaveLength(8)

    // La lista completa de columnas: si alguien anade o quita una, este test lo dice.
    // `createdBy`/`updatedBy` los anade QC-20 (design.md > 2.1, R6, R7): campos ESCALARES
    // a proposito, sin `@relation`, para que el ORM no pueda atravesar hacia `users`.
    const scalarNames = product.fields
      .filter((candidate) => !candidate.isList && candidate.type !== 'Presentation')
      .map((candidate) => candidate.name)
      .sort()
    expect(scalarNames).toEqual(
      [
        'id',
        ...PRODUCT_BUSINESS_FIELDS.map(([name]) => name),
        'createdAt',
        'updatedAt',
        'deletedAt',
        'createdBy',
        'updatedBy',
      ].sort(),
    )
    expect(product.body).toContain('@@map("products")')
  })

  it('createdBy y updatedBy (QC-20) son escalares, UUID, anulables y sin @relation', () => {
    // design.md > 2.1 a: SIN `@relation` de Prisma. Es lo que impide
    // `include: { createdByUser: true }` desde el adaptador de `inventario` -una lectura de
    // `users` desde otro modulo que la guardia de arquitectura no ve, porque busca la
    // cadena `prisma.user`-. design.md > 2.1 b: anulables, porque no hay backfill posible.
    for (const name of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(product, name)
      expect(candidate.type, `Product.${name} debe ser String`).toBe('String')
      expect(candidate.isOptional, `Product.${name} debe ser anulable`).toBe(true)
      expect(candidate.attributes).toContain('@db.Uuid')
      expect(candidate.attributes).not.toMatch(/@default\(/)
    }
    expect(field(product, 'createdBy').attributes).toContain('@map("created_by")')
    expect(field(product, 'updatedBy').attributes).toContain('@map("updated_by")')

    // Ninguna relacion Prisma hacia `User` en todo el modelo: la FK real vive escrita a
    // mano en el SQL de la migracion, no en el esquema.
    expect(product.body).not.toMatch(/@relation\([^)]*fields:\s*\[created_by\]/i)
    expect(product.body).not.toMatch(/@relation\([^)]*fields:\s*\[updated_by\]/i)
    expect(product.body).not.toMatch(/\bUser\b/)
  })

  it('name y presentationId son obligatorios y sin default', () => {
    // R4: sin nombre o sin presentacion no hay fila. Obligatorio de verdad: un `@default`
    // rellenaria el hueco en silencio y el rechazo no ocurriria nunca.
    for (const name of ['name', 'presentationId'] as const) {
      const candidate = field(product, name)
      expect(candidate.isOptional, `Product.${name} no puede ser opcional`).toBe(false)
      expect(candidate.attributes, `Product.${name} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
    expect(field(product, 'name').type).toBe('String')
    expect(field(product, 'presentationId').type).toBe('String')
    expect(field(product, 'presentationId').attributes).toContain('@db.Uuid')
  })

  it('stock, cost, deliveryTime, qtyAlert y unit son opcionales', () => {
    // R5: ausencia de valor, no cero ni cadena vacia. Un `@default` convertiria la
    // ausencia en un valor y R5 dejaria de cumplirse sin que nadie lo note.
    for (const name of OPTIONAL_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.isOptional, `Product.${name} debe ser opcional`).toBe(true)
      expect(candidate.attributes, `Product.${name} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
    expect(OPTIONAL_FIELDS).toHaveLength(5)
  })

  it('minPurchase no es opcional y declara default 0', () => {
    // R6 y `design.md > 8.1`: `NOT NULL DEFAULT 0`. Si fuera anulable, un NULL explicito
    // sobreviviria y «compra minima 0» y «compra minima desconocida» convivirian.
    const minPurchase = field(product, 'minPurchase')
    expect(minPurchase.type).toBe('Int')
    expect(minPurchase.isOptional).toBe(false)
    expect(minPurchase.attributes).toMatch(/@default\(0\)/)
    expect(minPurchase.attributes).toContain('@map("min_purchase")')
  })

  it('stock, minPurchase, qtyAlert y deliveryTime son Int', () => {
    // R7: enteros, sin parte decimal.
    for (const name of INTEGER_FIELDS) {
      const candidate = field(product, name)
      expect(candidate.type, `Product.${name} debe ser Int`).toBe('Int')
      expect(candidate.attributes, `Product.${name} no debe declarar tipo nativo`).not.toMatch(
        /@db\.(Decimal|Money|Real|DoublePrecision)/,
      )
    }
    expect(INTEGER_FIELDS).toHaveLength(4)
  })

  it('cost es Decimal(14,4) y en el esquema no hay ningun Float', () => {
    // R8: decimal exacto. La coma flotante binaria es un anti-patron bloqueante
    // (`docs/architecture.md > Dominio` n.o 4).
    const cost = field(product, 'cost')
    expect(cost.type).toBe('Decimal')
    expect(cost.isOptional).toBe(true)
    expect(cost.attributes).toMatch(/@db\.Decimal\(\s*14\s*,\s*4\s*\)/)

    for (const candidate of [...product.fields, ...presentation.fields]) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
    }
    // Ningun campo de coma flotante en todo el esquema, ni por tipo ni por tipo nativo.
    expect(schema).not.toMatch(/^\s*\w+\s+Float\??\s/m)
    expect(schema).not.toMatch(/@db\.(Real|DoublePrecision)/)
  })

  it('unit es String opcional y el esquema no declara ningun enum', () => {
    // R10: texto libre, sin conjunto cerrado de valores admitidos.
    const unit = field(product, 'unit')
    expect(unit.type).toBe('String')
    expect(unit.isOptional).toBe(true)
    expect(unit.attributes).not.toMatch(/@default\(/)
    // Sin `varchar(n)` arbitrario: la convencion del esquema es `text`.
    expect(unit.attributes).not.toMatch(/@db\.(VarChar|Char)\s*\(/)
    // Ni enum de Prisma ni relacion a un catalogo: `unit` es una columna escalar suelta.
    expect(schema).not.toMatch(/^\s*enum\s+\w+\s*\{/m)
    expect(has(product, 'unitId')).toBe(false)
    expect(product.body).not.toMatch(/unit_id/)
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

  it('la relacion Product-Presentation es obligatoria', () => {
    // R12: exactamente una presentacion por producto, y la FK garantiza que existe.
    const presentationId = field(product, 'presentationId')
    expect(presentationId.isOptional).toBe(false)
    expect(presentationId.attributes).toContain('@db.Uuid')
    expect(presentationId.attributes).toContain('@map("presentation_id")')

    const relation = field(product, 'presentation')
    expect(relation.type).toBe('Presentation')
    expect(relation.isOptional).toBe(false)
    expect(relation.isList).toBe(false)
    expect(relation.attributes).toMatch(/@relation\(/)
    expect(relation.attributes).toMatch(/fields:\s*\[presentationId\]/)
    expect(relation.attributes).toMatch(/references:\s*\[id\]/)
  })

  it('presentationId no tiene restriccion de unicidad', () => {
    // R13: una presentacion la comparten productos ilimitados. Un `@unique` aqui
    // convertiria la relacion en 1-1 y romperia R13 en silencio.
    expect(field(product, 'presentationId').attributes).not.toMatch(/@unique/)
    expect(product.body).not.toMatch(/@@unique\([^)]*presentationId/)
    expect(field(presentation, 'products').isList).toBe(true)
    expect(field(presentation, 'products').type).toBe('Product')
    // El indice del lado hijo existe, pero NO es unico: Postgres no lo crea solo.
    expect(product.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"products_presentation_id_idx"\)/,
    )
  })

  it('la relacion Product-Presentation declara onDelete Restrict', () => {
    // R14: borrar una presentacion con productos —vivos o borrados logicamente— se
    // rechaza en la base. `Cascade` o `SetNull` la incumplirian sin ruido.
    const relation = field(product, 'presentation')
    expect(relation.attributes).toMatch(/onDelete:\s*Restrict/)
    expect(relation.attributes).not.toMatch(/onDelete:\s*(Cascade|SetNull|SetDefault|NoAction)/)
    expect(relation.attributes).toMatch(/onUpdate:\s*Cascade/)
    // Lo que sostiene «incluidos los productos borrados logicamente»: el borrado logico
    // es un UPDATE, la fila sigue ahi y la FK sigue apuntando a la presentacion.
    expect(has(product, 'deletedAt')).toBe(true)
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
    expect(indexMaps).toEqual(['products_presentation_id_idx'])
  })

  it('los dos modelos declaran /// @module inventario', () => {
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

    const inventarioModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'inventario')
      .map(([modelName]) => modelName)
      .sort()
    expect(inventarioModels).toEqual(['Presentation', 'Product'])
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
    // version lo vigila de forma directa: **todo import del BARREL `@/lib/modules/inventario`
    // hecho desde fuera de `lib/composition/` debe ser `import type`** -o sea desde otro
    // modulo, desde `app/`, desde `components/` o desde `hooks/`-.
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
    // Comprobado el 2026-09-02: hoy NINGUN import del barrel exacto existe fuera de
    // `lib/composition/`, y los cuatro imports que la UI hace hacia modulos son o Server
    // Actions por subruta o ya `import type`. La regla codifica la practica real.
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
    // Especificador EXACTO del barrel: la comilla de cierre va pegada a `inventario`, asi que
    // las subrutas (`.../inventario/adapters/driving/...`) NO casan. Es deliberado.
    const INVENTARIO_IMPORT = /from\s+['"](@\/lib\/modules\/inventario|(\.\.?\/)+.*modules\/inventario)['"]/
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
      const source = readFileSync(filePath, 'utf8')
      for (const line of source.split('\n')) {
        if (!INVENTARIO_IMPORT.test(line)) continue
        expect(
          line,
          `${filePath}: todo import del barrel de inventario fuera de lib/composition debe ser 'import type' (${line.trim()})`,
        ).toMatch(/^\s*import\s+type\s/)
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
