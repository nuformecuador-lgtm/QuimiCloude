// T6 — Contrato estatico de `db/schema.prisma` (QC-42: modelo-proveedores).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/recetas/schema/recetas-schema.test.ts`: lo que se vigila aqui es la
// DECLARACION, no el cliente generado. Un tipo de Prisma no distingue un campo
// obligatorio de uno con default, no dice si `cost` es decimal exacto o coma flotante,
// no dice si una columna lleva `@relation` y no ve los comentarios `/// @module`.
//
// Varios casos afirman una AUSENCIA en positivo, y las dos que mas importan son
// deliberadas (`design.md` secciones 2.1, 2.2, 4.1 y 4.3): NINGUN `@relation` de
// `SupplierCatalogLine` a `Product` ni de `Supplier` a `User` —la FK es real pero vive
// escrita a mano en la migracion, para que el cliente Prisma no pueda atravesar de
// modulo con un `include`— y NINGUN `@unique`/`@@unique` sobre el nombre —la unicidad
// es un indice PARCIAL que Prisma no modela—. Se suman `SupplierCatalogLine` sin
// `deletedAt` (decision cerrada 11, R28) y que `minPurchase` no lleva `@default`
// (decision cerrada 4, R13).
//
// ACTUALIZADO POR QC-43 T3 (2026-09-03): `SupplierCatalogLine` SI declara ahora
// `createdBy`/`updatedBy` con sus dos `@@index`. Es un cambio DECIDIDO POR EL HUMANO en
// QC-43 (su decision cerrada 3, R31/R32), que se aparta expresamente de la decision
// cerrada 14 de QC-42 —«subir el costo es un hecho comercial propio»—. El caso que aqui
// afirmaba la ausencia pasa a afirmar la PRESENCIA con la misma exigencia: escalares uuid
// anulables, SIN `@relation` y sin `@default`.
//
// No se afirma el censo global de modelos del esquema ni el numero de migraciones del
// repo: rompe con features paralelas (QC-32 esta tocando el mismo `db/schema.prisma`,
// `design.md > 10`).
//
// Cubre R1, R3, R5, R10, R13, R14, R15, R16, R18, R19, R20, R22, R25, R26, R27, R32.

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

/** Texto crudo, con los `///`: lo necesita R20, que afirma sobre los comentarios. */
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

const supplier = parseModel('Supplier')
const supplierCatalogLine = parseModel('SupplierCatalogLine')

function field(model: PrismaModel, name: string): PrismaField {
  const found = model.fields.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`no existe el campo ${name}`)
  return found
}

function has(model: PrismaModel, name: string): boolean {
  return model.fields.some((candidate) => candidate.name === name)
}

/** Campos escalares del modelo: sin listas y sin el lado objeto de una relacion. */
function scalarNames(model: PrismaModel, relationTypes: readonly string[]): readonly string[] {
  return model.fields
    .filter((candidate) => !candidate.isList && !relationTypes.includes(candidate.type))
    .map((candidate) => candidate.name)
    .sort()
}

/** Cada campo de `Supplier`, con la columna en ingles que le toca (R32). */
const SUPPLIER_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['name', 'name'],
  ['nameNormalized', 'name_normalized'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['deletedAt', 'deleted_at'],
]

/** Cada campo escalar de `SupplierCatalogLine`, con su columna (R32). */
const SUPPLIER_CATALOG_LINE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['supplierId', 'supplier_id'],
  ['productId', 'product_id'],
  ['cost', 'cost'],
  ['minPurchase', 'min_purchase'],
  ['deliveryTime', 'delivery_time'],
  // QC-43 (su decision cerrada 3, R31/R32): la linea gana autor propio.
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
]

/** Los cinco escalares que cruzan de modulo y por eso NO llevan `@relation` (R22). */
const CROSS_MODULE_SCALARS: ReadonlyArray<readonly [PrismaModel, string, string]> = [
  [supplierCatalogLine, 'productId', 'product_id'],
  [supplier, 'createdBy', 'created_by'],
  [supplier, 'updatedBy', 'updated_by'],
  [supplierCatalogLine, 'createdBy', 'created_by'],
  [supplierCatalogLine, 'updatedBy', 'updated_by'],
]

describe('db/schema.prisma — modelo de proveedor y linea de catalogo', () => {
  it('Supplier declara id uuid propio, nombre, telefono y correo', () => {
    // R1: identificador propio, estable y no derivado de ningun dato de negocio, mas el
    // nombre, el telefono y el correo del proveedor.
    const id = field(supplier, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    expect(supplier.body).not.toMatch(/@@id\(/)

    expect(field(supplier, 'name').type).toBe('String')
    expect(field(supplier, 'phone').type).toBe('String')
    expect(field(supplier, 'email').type).toBe('String')

    // La forma completa de la tabla: si alguien anade o quita una columna, este test lo dice.
    expect(scalarNames(supplier, ['SupplierCatalogLine'])).toEqual(
      SUPPLIER_COLUMNS.map(([name]) => name).sort(),
    )
    expect(supplier.body).toContain('@@map("suppliers")')
  })

  it('name es obligatorio y sin default', () => {
    // R2: sin nombre no hay fila. Obligatorio de verdad: un `@default` rellenaria el hueco
    // en silencio y el rechazo no ocurriria nunca.
    const name = field(supplier, 'name')
    expect(name.type).toBe('String')
    expect(name.isOptional).toBe(false)
    expect(name.attributes).not.toMatch(/@default\(/)
    expect(name.attributes).not.toMatch(/dbgenerated/)
  })

  it('name, phone y email son TEXT, sin varchar ni limite declarado', () => {
    // R5: los largos maximos —120 para el nombre— son validacion de aplicacion (QC-43),
    // no de la columna. Un `@db.VarChar(n)` los bajaria a la base.
    for (const fieldName of ['name', 'nameNormalized', 'phone', 'email'] as const) {
      const candidate = field(supplier, fieldName)
      expect(candidate.type, `Supplier.${fieldName} debe ser String`).toBe('String')
      expect(candidate.attributes, `Supplier.${fieldName} no debe declarar varchar`).not.toMatch(
        /@db\.(VarChar|Char)\s*\(/,
      )
      expect(candidate.attributes, `Supplier.${fieldName} no debe declarar tipo nativo`).not.toMatch(
        /@db\.\w+/,
      )
    }
  })

  it('phone y email son opcionales por separado', () => {
    // R3: se acepta un proveedor con telefono y sin correo, y uno con correo y sin
    // telefono; los dos son opcionales independientemente el uno del otro.
    expect(field(supplier, 'phone').isOptional).toBe(true)
    expect(field(supplier, 'email').isOptional).toBe(true)
    // name es obligatorio, para que quede claro el contraste.
    expect(field(supplier, 'name').isOptional).toBe(false)
  })

  it('Supplier declara name_normalized obligatorio', () => {
    // R8: el nombre normalizado se PERSISTE en su propia columna, junto al original. La
    // unica definicion de la normalizacion la publica el contrato del modulo
    // (`normalizeSupplierName`).
    const nameNormalized = field(supplier, 'nameNormalized')
    expect(nameNormalized.type).toBe('String')
    expect(nameNormalized.isOptional).toBe(false)
    expect(nameNormalized.attributes).toContain('@map("name_normalized")')
    expect(nameNormalized.attributes).not.toMatch(/@default\(/)
    expect(nameNormalized.attributes).not.toMatch(/dbgenerated/)
    expect(has(supplier, 'name')).toBe(true)
  })

  it('name y name_normalized no llevan @unique: la unicidad es un indice PARCIAL de la migracion', () => {
    // Ausencia deliberada (`design.md` seccion 2.1 «OJO 2» y 4.3). Un `@unique` aqui
    // alcanzaria tambien a los proveedores borrados y R9 dejaria de cumplirse en silencio.
    expect(field(supplier, 'name').attributes).not.toMatch(/@unique/)
    expect(field(supplier, 'nameNormalized').attributes).not.toMatch(/@unique/)
    expect(supplier.body).not.toMatch(/@@unique\(/)
    // El unico `@@unique` de esta feature es el de la linea, y es por pareja.
    expect(supplierCatalogLine.body).toMatch(/@@unique\(\[supplierId,\s*productId\]/)
  })

  it('SupplierCatalogLine declara proveedor, producto, costo, minimo y plazo como entidad propia con id', () => {
    // R10 y decision cerrada 3: entidad propia, no tabla de union sin datos. Tiene clave
    // primaria propia y datos propios (costo, minimo, plazo).
    const id = field(supplierCatalogLine, 'id')
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(supplierCatalogLine.body).not.toMatch(/@@id\(/)

    for (const fieldName of ['supplierId', 'productId', 'cost'] as const) {
      const candidate = field(supplierCatalogLine, fieldName)
      expect(candidate.isOptional, `SupplierCatalogLine.${fieldName} no puede ser opcional`).toBe(
        false,
      )
    }
    expect(scalarNames(supplierCatalogLine, ['Supplier'])).toEqual(
      SUPPLIER_CATALOG_LINE_COLUMNS.map(([name]) => name).sort(),
    )
    expect(supplierCatalogLine.body).toContain('@@map("supplier_catalog_lines")')

    // La relacion intra-modulo con el proveedor si lleva `@relation`, y es la que da el CASCADE.
    const relation = field(supplierCatalogLine, 'supplier')
    expect(relation.type).toBe('Supplier')
    expect(relation.isOptional).toBe(false)
    expect(relation.attributes).toMatch(/fields:\s*\[supplierId\]/)
    expect(relation.attributes).toMatch(/onDelete:\s*Cascade/)
    // Y `Supplier` ve sus lineas: la coleccion existe del otro lado.
    expect(field(supplier, 'catalogLines').isList).toBe(true)
    expect(field(supplier, 'catalogLines').type).toBe('SupplierCatalogLine')
  })

  it('product_id y cost obligatorios; min_purchase y delivery_time opcionales y sin default', () => {
    // R13 y decision cerrada 4: la razon de existir de la linea es «este proveedor me
    // vende esto a este precio»; el plazo y el minimo se confirman despues.
    expect(field(supplierCatalogLine, 'productId').isOptional).toBe(false)
    expect(field(supplierCatalogLine, 'cost').isOptional).toBe(false)

    const minPurchase = field(supplierCatalogLine, 'minPurchase')
    expect(minPurchase.isOptional).toBe(true)
    // AUSENCIA deliberada: un `@default(0)` haria indistinguible «sin minimo pactado» de
    // «minimo cero», el error que `products.min_purchase` ya arrastra.
    expect(minPurchase.attributes).not.toMatch(/@default\(/)

    const deliveryTime = field(supplierCatalogLine, 'deliveryTime')
    expect(deliveryTime.isOptional).toBe(true)
    expect(deliveryTime.attributes).not.toMatch(/@default\(/)
  })

  it('cost y min_purchase son Decimal(14,4) y en los dos modelos no hay ningun Float', () => {
    // R14 y decision cerrada 5: decimal exacto. La coma flotante binaria es un
    // anti-patron bloqueante (`docs/architecture.md > Dominio` n.o 4).
    const cost = field(supplierCatalogLine, 'cost')
    expect(cost.type).toBe('Decimal')
    expect(cost.attributes).toMatch(/@db\.Decimal\(\s*14\s*,\s*4\s*\)/)
    expect(cost.attributes).not.toMatch(/@default\(/)

    const minPurchase = field(supplierCatalogLine, 'minPurchase')
    expect(minPurchase.type).toBe('Decimal')
    expect(minPurchase.attributes).toMatch(/@db\.Decimal\(\s*14\s*,\s*4\s*\)/)

    for (const candidate of [...supplier.fields, ...supplierCatalogLine.fields]) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
      expect(candidate.attributes, `${candidate.name} no puede ser coma flotante`).not.toMatch(
        /@db\.(Real|DoublePrecision|Money)/,
      )
    }
  })

  it('min_purchase es Decimal, no Int, a diferencia de products.min_purchase', () => {
    // R15 y decision cerrada 6: el minimo de compra admite fracciones. Se aparta a
    // proposito de `products.min_purchase`, que es `Int @default(0)`.
    const minPurchase = field(supplierCatalogLine, 'minPurchase')
    expect(minPurchase.type).toBe('Decimal')
    expect(minPurchase.type).not.toBe('Int')
  })

  it('delivery_time es Int opcional', () => {
    // R16 y decision cerrada 5: el plazo se guarda como numero entero de dias.
    const deliveryTime = field(supplierCatalogLine, 'deliveryTime')
    expect(deliveryTime.type).toBe('Int')
    expect(deliveryTime.isOptional).toBe(true)
    expect(deliveryTime.attributes).toContain('@map("delivery_time")')
  })

  it('no existe ninguna columna de moneda ni divisa en las dos tablas', () => {
    // R18 y decision cerrada 16: la moneda es implicita y unica para todo el ERP.
    for (const model of [supplier, supplierCatalogLine]) {
      for (const forbidden of ['currency', 'moneda', 'exchangeRate', 'fx']) {
        expect(has(model, forbidden), `${forbidden} no debe existir`).toBe(false)
      }
    }
    expect(schema).not.toMatch(/currency/i)
  })

  it('model Product no cambia y no gana ninguna relacion ni campo nuevo hacia proveedores', () => {
    // R19 y decision cerrada 2: QC-42 no toca `products`. Se comprueba el bloque
    // COMPLETO del modelo Product, no solo un campo suelto, para que ningun `@relation`
    // ni columna nueva se cuele sin que este test lo note.
    const product = parseModel('Product')
    expect(product.body).not.toMatch(/Supplier/)
    expect(product.body).not.toMatch(/supplier/)
    expect(product.fields.some((candidate) => candidate.type === 'Supplier')).toBe(false)
    expect(
      product.fields.some((candidate) => candidate.type === 'SupplierCatalogLine'),
    ).toBe(false)
  })

  it('los dos modelos declaran /// @module proveedores', () => {
    // R20: modulo propietario declarado en el esquema. Se lee el texto CRUDO porque
    // `stripComments` se lleva justamente lo que aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Supplier')).toBe('proveedores')
    expect(owners.get('SupplierCatalogLine')).toBe('proveedores')

    const proveedoresModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'proveedores')
      .map(([modelName]) => modelName)
      .sort()
    expect(proveedoresModels).toEqual(['Supplier', 'SupplierCatalogLine'])
    // Esta feature no adopta modelos ajenos: siguen siendo de su modulo. No se afirma el
    // censo global de modelos del esquema (rompe con features paralelas, `design.md > 10`).
    expect(owners.get('Product')).toBe('inventario')
    expect(owners.get('User')).toBe('identity')
  })

  it('product_id, created_by y updated_by son escalares uuid SIN @relation', () => {
    // R22 y decision cerrada 13/14: la FK es REAL, pero vive escrita a mano en
    // `migration.sql`. Declararla con `@relation` regalaria `include: { product: true }`
    // desde `proveedores`, y ninguna guardia lo detectaria porque no es un import.
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
    for (const model of [supplier, supplierCatalogLine]) {
      for (const candidate of model.fields) {
        expect(candidate.type, `${candidate.name} no puede apuntar a otro modulo`).not.toBe(
          'Product',
        )
        expect(candidate.type, `${candidate.name} no puede apuntar a otro modulo`).not.toBe('User')
      }
    }
    // El unico `@relation` de los dos modelos es el intra-modulo linea -> proveedor.
    const relations = [...supplier.fields, ...supplierCatalogLine.fields].filter((candidate) =>
      /@relation/.test(candidate.attributes),
    )
    expect(relations.map((candidate) => candidate.name)).toEqual(['supplier'])
    // Y `User` no gana ninguna coleccion de proveedores del otro lado, ni `Product` de lineas.
    const user = parseModel('User')
    expect(user.fields.some((candidate) => candidate.type === 'Supplier')).toBe(false)
    const product = parseModel('Product')
    expect(product.fields.some((candidate) => candidate.type === 'SupplierCatalogLine')).toBe(
      false,
    )
  })

  it('created_by y updated_by existen como escalares uuid opcionales', () => {
    // R24: se registra quien creo el proveedor y quien lo modifico por ultima vez. La FK
    // real (que rechaza un usuario inexistente) la comprueba `proveedores-migration.test.ts`.
    for (const fieldName of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(supplier, fieldName)
      expect(candidate.type).toBe('String')
      expect(candidate.attributes).toContain('@db.Uuid')
      // R24: anulables, NULL = «no lo creo una persona».
      expect(candidate.isOptional, `Supplier.${fieldName} debe ser opcional`).toBe(true)
      expect(candidate.attributes, `Supplier.${fieldName} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
    // Con su indice: Postgres no indexa el lado hijo de una FK y por ahi pasa el RESTRICT.
    expect(supplier.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"suppliers_created_by_idx"\)/)
    expect(supplier.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"suppliers_updated_by_idx"\)/)
  })

  it('SupplierCatalogLine declara createdBy y updatedBy como escalares uuid opcionales', () => {
    // QC-43, decision cerrada 3 (R31, R32): subir el costo es un hecho comercial propio y
    // tiene que dejar rastro EN LA LINEA. Deroga la decision cerrada 14 de QC-42, que
    // heredaba de `recipe_lines` la ausencia de auditoria.
    //
    // Anulables y sin `@default` (R32): NULL es «no lo creo una persona» —una importacion,
    // un seed—, no «se perdio el dato». Que toda escritura de la APLICACION lleve autor lo
    // garantiza el service, no el esquema.
    for (const fieldName of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(supplierCatalogLine, fieldName)
      expect(candidate.type).toBe('String')
      expect(candidate.attributes).toContain('@db.Uuid')
      expect(
        candidate.isOptional,
        `SupplierCatalogLine.${fieldName} debe ser opcional`,
      ).toBe(true)
      expect(
        candidate.attributes,
        `SupplierCatalogLine.${fieldName} no debe tener @default`,
      ).not.toMatch(/@default\(/)
      // La FK real vive escrita a mano en la migracion de QC-43: aqui NO puede haber
      // `@relation`, o el cliente Prisma podria atravesar de `proveedores` a `identity`.
      expect(
        candidate.attributes,
        `SupplierCatalogLine.${fieldName} NO puede llevar @relation`,
      ).not.toMatch(/@relation/)
    }
    // Con sus indices: Postgres no indexa el lado hijo de una FK y por ahi pasa el RESTRICT.
    expect(supplierCatalogLine.body).toMatch(
      /@@index\(\[createdBy\],\s*map:\s*"supplier_catalog_lines_created_by_idx"\)/,
    )
    expect(supplierCatalogLine.body).toMatch(
      /@@index\(\[updatedBy\],\s*map:\s*"supplier_catalog_lines_updated_by_idx"\)/,
    )
    // El proveedor sigue llevando las suyas: son cuatro columnas de autor, no dos.
    expect(has(supplier, 'createdBy')).toBe(true)
    expect(has(supplier, 'updatedBy')).toBe(true)
  })

  it('Supplier declara deletedAt opcional y ninguna columna de estado activo/inactivo', () => {
    // R26 y decision cerrada 10: borrar conserva la fila completa y registra el instante.
    // Sin estado activo/inactivo aparte: un segundo estado que nadie sabe distinguir del
    // primero es deuda, no informacion.
    const deletedAt = field(supplier, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)

    for (const forbidden of ['isActive', 'active', 'status', 'state', 'enabled']) {
      expect(has(supplier, forbidden), `Supplier.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('Supplier y SupplierCatalogLine declaran createdAt y updatedAt', () => {
    // R27: instante de creacion y de ultima modificacion, y el segundo se actualiza solo.
    for (const [modelName, model] of [
      ['Supplier', supplier],
      ['SupplierCatalogLine', supplierCatalogLine],
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

  it('SupplierCatalogLine no declara deletedAt', () => {
    // R28 y decision cerrada 11: quitar un producto del catalogo ELIMINA la fila. La
    // linea es parte del catalogo, no un hecho historico.
    expect(has(supplierCatalogLine, 'deletedAt')).toBe(false)
    expect(supplierCatalogLine.body).not.toMatch(/deleted_at/)
    expect(supplierCatalogLine.body).not.toMatch(/deletedAt/)
    // El proveedor si la lleva: las dos decisiones conviven a proposito.
    expect(has(supplier, 'deletedAt')).toBe(true)
  })

  it('las dos tablas y sus columnas mapean a snake_case en ingles', () => {
    // R32: tablas, columnas e indices en ingles y `snake_case`, y las dos tablas se
    // llaman `suppliers` y `supplier_catalog_lines`.
    expect(supplier.body).toContain('@@map("suppliers")')
    expect(supplierCatalogLine.body).toContain('@@map("supplier_catalog_lines")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [modelName, model, columns, relationTypes] of [
      ['Supplier', supplier, SUPPLIER_COLUMNS, ['SupplierCatalogLine']],
      ['SupplierCatalogLine', supplierCatalogLine, SUPPLIER_CATALOG_LINE_COLUMNS, ['Supplier']],
    ] as const) {
      for (const [name, column] of columns) {
        const mapped = /@map\("([^"]+)"\)/.exec(field(model, name).attributes)
        expect(mapped?.[1] ?? name, `${modelName}.${name} debe mapear a ${column}`).toBe(column)
        expect(column, `${modelName}.${name} -> ${column}`).toMatch(SNAKE_CASE)
      }
      // Todo campo escalar en `camelCase` con mayuscula dentro tiene que declarar su
      // `@map`, o la columna real saldria en `camelCase` y R32 se incumpliria sin aviso.
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
    const indexMaps = [...supplier.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)]
      .concat([...supplierCatalogLine.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)])
      .map((match) => match[1])
    expect(indexMaps).toEqual([
      'suppliers_created_by_idx',
      'suppliers_updated_by_idx',
      'supplier_catalog_lines_product_id_idx',
      // Los dos que anade QC-43 con las columnas de autor de la linea.
      'supplier_catalog_lines_created_by_idx',
      'supplier_catalog_lines_updated_by_idx',
    ])
    expect(supplierCatalogLine.body).toMatch(
      /map:\s*"supplier_catalog_lines_supplier_id_product_id_key"/,
    )
  })
})
