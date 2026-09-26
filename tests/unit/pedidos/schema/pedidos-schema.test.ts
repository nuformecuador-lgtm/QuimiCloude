// T5 — Contrato estatico de `db/schema.prisma` (QC-33: modelo-pedidos).
//
// Lee el schema como TEXTO a proposito, igual que
// `tests/unit/recetas/schema/recetas-schema.test.ts` y
// `tests/unit/unidades/schema/unidades-schema.test.ts`, y reutiliza sus helpers (`parseModel`,
// `field`, `has`): lo que se vigila aqui es la DECLARACION, no el cliente generado. Un tipo de
// Prisma no distingue un campo obligatorio de uno con default, no dice si `quantity` es decimal
// exacto o coma flotante, no dice si una columna lleva `@relation` y no ve los comentarios
// `/// @module`.
//
// Ocho casos afirman una AUSENCIA en positivo, y las ocho son deliberadas
// (`specs/QC-33-modelo-pedidos/design.md` seccion 2.2): `Order` SIN `total` ni `subtotal`
// (decision cerrada 5, R10), SIN impuestos ni descuentos (decision cerrada 23, R11), SIN cliente
// ni destinatario (decision cerrada 8, R3), SIN fecha de solicitud aparte de `createdAt`
// (decision cerrada 10, R4), SIN el numero visible ya formateado (R24), SIN ninguna entidad de
// linea o item (decision cerrada 1, R2), las cuatro referencias SIN `@relation` (decision cerrada
// 17, R33) y SIN campos de vuelta `orders Order[]` en `Recipe`, `Unit` ni `User` (R5, R33). Una
// columna que NO esta no salta a la vista: el test existe para que nadie las «arregle» sin darse
// cuenta.
//
// Cubre R1, R2, R3, R4, R5, R6, R8, R10, R11, R12, R14, R16, R17, R18, R20, R24, R25, R26, R27,
// R28, R31, R33 y R36.

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

/** Texto crudo, con los `///`: lo necesita R31, que afirma sobre los comentarios. */
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
      const parsed = /^(\w+)\s+(\S+)\s*(.*)$/.exec(line)
      if (parsed === null || parsed[1] === undefined || parsed[2] === undefined) return null
      const rawType = parsed[2]
      return {
        name: parsed[1],
        type: rawType.replace(/[?[\]]/g, ''),
        attributes: parsed[3] ?? '',
        isOptional: rawType.endsWith('?'),
        isList: rawType.endsWith('[]'),
      }
    })
    .filter((parsed): parsed is PrismaField => parsed !== null)
  return { body, fields }
}

/** Valores de un `enum` del esquema, EN SU ORDEN DE DECLARACION (R16). */
function parseEnum(name: string): readonly string[] {
  const match = new RegExp(`^enum\\s+${name}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(schema)
  if (match === null || match[1] === undefined) throw new Error(`no existe el enum ${name}`)
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

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

const order = parseModel('Order')
const recipe = parseModel('Recipe')
const unit = parseModel('Unit')
const user = parseModel('User')

/** Los VEINTE campos de `Order`, con la columna en ingles que le toca. Fueron catorce y
 *  quince con `cancellationReason`; el 2026-09-07 la decision humana quito `unit_id` y
 *  `unit_price` de la tabla
 *  (`db/migrations/20260907120000_orders_drop_unit_and_unit_price`) y quedaron trece. Despues
 *  se anade `company_id`, obligatoria, y vuelven a ser catorce. `ingredientsCost` opcional las
 *  lleva a quince, `reservedAt` a dieciseis, `presentationId` a diecisiete, `finishedAt` a
 *  dieciocho, `presentationContent` a diecinueve y `packedBy` a veinte. La lista sigue siendo
 *  cerrada: anadir o quitar cualquier otra columna pone este test rojo. */
const ORDER_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['id', 'id'],
  ['orderYear', 'order_year'],
  ['orderSequence', 'order_sequence'],
  ['recipeId', 'recipe_id'],
  ['quantity', 'quantity'],
  ['priority', 'priority'],
  ['status', 'status'],
  ['cancellationReason', 'cancellation_reason'], // QC-34 R48, decision cerrada 4
  ['companyId', 'company_id'], // QC-60 R1: la empresa del pedido, obligatoria
  ['createdBy', 'created_by'],
  ['updatedBy', 'updated_by'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
  ['deletedAt', 'deleted_at'],
  ['ingredientsCost', 'ingredients_cost'],
  ['reservedAt', 'reserved_at'],
  ['presentationId', 'presentation_id'], // el envase en que se entrega, opcional
  ['finishedAt', 'finished_at'], // instante en que paso a ENTREGADO por Finalizar, opcional
  ['presentationContent', 'presentation_content'], // copia del contenido de la presentacion, opcional
  ['packedBy', 'packed_by'], // quien tiene el pedido en empaque, opcional
]

/** Las CUATRO referencias que cruzan de modulo y por eso NO llevan `@relation` (R33). Fueron cuatro
 *  hasta el 2026-09-07, cuando `unitId` se fue con la unidad -y con ella la frontera hacia
 *  `unidades`- y quedaron tres. QC-60 anade `companyId` (FK a `companies`, de `identity`),
 *  OBLIGATORIA y tambien sin `@relation`: con ella, `pedidos` podria hacer
 *  `include: { company: true }` (`design.md > 2.1`). */
const CROSS_MODULE_SCALARS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['recipeId', 'recipe_id', false],
  ['companyId', 'company_id', false],
  ['createdBy', 'created_by', true],
  ['updatedBy', 'updated_by', true],
]

describe('db/schema.prisma — modelo de pedido', () => {
  it('Order declara id uuid propio, receta, cantidad, prioridad y estado', () => {
    // R1: identificador propio, estable y NO derivado de ningun dato de negocio -en particular
    // no lo es el correlativo, que es dato de negocio y vive en otras dos columnas-, mas los
    // datos del pedido.
    const id = field(order, 'id')
    expect(id.type).toBe('String')
    expect(id.isOptional).toBe(false)
    expect(id.attributes).toContain('@id')
    expect(id.attributes).toContain('@db.Uuid')
    expect(id.attributes).toMatch(/@default\(dbgenerated\("gen_random_uuid\(\)"\)\)/)
    // Ni el correlativo ni ningun otro dato de negocio forma parte de la clave primaria.
    expect(order.body).not.toMatch(/@@id\(/)

    for (const nombre of ['recipeId', 'quantity', 'priority', 'status']) {
      expect(has(order, nombre), `falta Order.${nombre}`).toBe(true)
      expect(field(order, nombre).isOptional, `Order.${nombre} no puede ser opcional`).toBe(false)
    }

    // La forma completa de la tabla: si alguien anade o quita una columna, este test lo dice.
    expect(scalarNames(order, [])).toEqual(ORDER_COLUMNS.map(([name]) => name).sort())
    expect(order.body).toContain('@@map("orders")')
  })

  it('no existe ningun modelo de linea o item de pedido, y Order no tiene coleccion de lineas', () => {
    // R2 y decision cerrada 1: el pedido es UNA sola fila. Sin cabecera, sin items, y sin poder
    // apuntar a mas de una receta.
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['OrderLine', 'OrderItem', 'OrderDetail', 'Item', 'Line']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
    expect(schema).not.toMatch(/@@map\("(order_lines|order_items|order_details|orders_lines)"\)/)

    // Ninguna lista en `Order`: ni de lineas, ni de recetas, ni de nada.
    expect(order.fields.filter((candidate) => candidate.isList)).toEqual([])
    // Y la receta es UNA: un escalar, no una coleccion.
    expect(field(order, 'recipeId').isList).toBe(false)
    expect(field(order, 'recipeId').type).toBe('String')
    for (const forbidden of ['recipeIds', 'recipes', 'lines', 'items']) {
      expect(has(order, forbidden), `Order.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('Order no declara cliente, destinatario ni ninguna columna equivalente', () => {
    // R3 y decision cerrada 8: no hay cliente ni destinatario en Order, y es DELIBERADO;
    // sigue vigente hasta QC-156. La prohibicion de un catalogo de clientes que este mismo
    // caso incluia queda derogada solo para Customer/customers por el modulo Clientes
    // (QC-152/QC-153, 2026-09-24); el resto de nombres de catalogo sigue prohibido.
    const CLIENTE = /client|customer|cliente|recipient|destinatar|buyer|receiver|contact|party/i
    const sospechosos = order.fields
      .filter((candidate) => CLIENTE.test(candidate.name))
      .map((candidate) => candidate.name)
    expect(sospechosos).toEqual([])

    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['Client', 'Recipient', 'Buyer']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
    expect(schema).not.toMatch(/@@map\("(clients|recipients)"\)/)
  })

  it('Order no declara ninguna fecha de solicitud aparte de createdAt', () => {
    // R4 y decision cerrada 10: la fecha de solicitud ES `created_at`. La pone el sistema y no
    // se edita; una segunda columna con el mismo dato solo puede divergir.
    const fechas = order.fields
      .filter((candidate) => candidate.type === 'DateTime')
      .map((candidate) => candidate.name)
      .sort()
    expect(fechas).toEqual(['createdAt', 'deletedAt', 'finishedAt', 'reservedAt', 'updatedAt'])

    for (const forbidden of [
      'requestedAt',
      'requestDate',
      'orderDate',
      'orderedAt',
      'placedAt',
      'dueDate',
      'deliveredAt',
    ]) {
      expect(has(order, forbidden), `Order.${forbidden} no debe existir`).toBe(false)
    }
  })

  it('Recipe queda exactamente como la dejo QC-24: sin precio y sin campo de vuelta hacia Order', () => {
    // R5: esta feature NO modifica el modelo de receta, y en particular no le anade ninguna
    // columna de precio (decision cerrada 2: el precio de venta se escribe a mano en el pedido).
    const PRECIO = /price|cost|amount|precio|costo|tarif|rate/i
    expect(recipe.fields.filter((candidate) => PRECIO.test(candidate.name))).toEqual([])

    // Y ningun modelo ajeno gana campo de vuelta hacia `Order`: sin coleccion `orders Order[]`
    // en `Recipe`, `Unit` ni `User`, no hay por donde atravesar con un `include` (R33).
    for (const [nombre, modelo] of [
      ['Recipe', recipe],
      ['Unit', unit],
      ['User', user],
    ] as const) {
      expect(
        modelo.fields.filter((candidate) => candidate.type === 'Order').map((c) => c.name),
        `${nombre} no debe tener campo de vuelta hacia Order`,
      ).toEqual([])
      expect(has(modelo, 'orders'), `${nombre}.orders no debe existir`).toBe(false)
    }
  })

  it('quantity es Decimal(14,4) y no hay ningun Float en Order', () => {
    // R6 y decision cerrada 7: decimal exacto, nunca coma flotante binaria
    // (`docs/architecture.md > Dominio` n.o 4). Sin `@default`: la cantidad se declara siempre.
    const quantity = field(order, 'quantity')
    expect(quantity.type).toBe('Decimal')
    expect(quantity.isOptional).toBe(false)
    expect(quantity.attributes).toMatch(/@db\.Decimal\(\s*14\s*,\s*4\s*\)/)
    expect(quantity.attributes).not.toMatch(/@default\(/)

    for (const candidate of order.fields) {
      expect(candidate.type, `${candidate.name} no puede ser Float`).not.toBe('Float')
      expect(candidate.attributes, `${candidate.name} no puede ser coma flotante`).not.toMatch(
        /@db\.(Real|DoublePrecision|Money)/,
      )
    }
  })

  it('el precio unitario YA NO EXISTE en el modelo (2026-09-07)', () => {
    // Decision humana: `unit_price` salio de `orders`. Se afirma en NEGATIVO -y no se borra el
    // caso- para que reintroducir la columna sin decidirlo de nuevo ponga el test rojo.
    expect(has(order, 'unitPrice')).toBe(false)
    expect(order.body).not.toContain('unit_price')

    // Los TRES unicos decimales del modelo: la cantidad, el importe de ingredientes y la copia
    // del contenido de la presentacion.
    expect(
      order.fields.filter((candidate) => candidate.type === 'Decimal').map((c) => c.name).sort(),
    ).toEqual(['ingredientsCost', 'presentationContent', 'quantity'])
  })

  it('Order no declara total, subtotal ni ninguna columna derivada', () => {
    // R10 y decision cerrada 5: el total es `quantity * unitPrice`, se calcula al leer y NO se
    // guarda, para que no pueda contradecir a sus factores. Ausencia afirmada en positivo.
    const TOTAL = /total|subtotal|grand|importe|monto/i
    expect(order.fields.filter((candidate) => TOTAL.test(candidate.name))).toEqual([])
    for (const forbidden of ['total', 'subTotal', 'totalPrice', 'lineTotal', 'totalAmount']) {
      expect(has(order, forbidden), `Order.${forbidden} no debe existir`).toBe(false)
    }
    // Y ninguna columna GENERADA por la base: `dbgenerated` solo lo usa el uuid de la PK.
    const generados = order.fields
      .filter((candidate) => /dbgenerated/.test(candidate.attributes))
      .map((candidate) => candidate.name)
    expect(generados).toEqual(['id'])
  })

  it('Order no declara impuesto, descuento ni dato de facturacion', () => {
    // R11 y decision cerrada 23: este ERP no factura ni liquida impuestos. Nada de IVA,
    // descuentos, retenciones ni documentos tributarios colgando del pedido.
    const FISCAL = /tax|vat|iva|discount|descuento|invoice|factura|billing|retention|tribut/i
    expect(order.fields.filter((candidate) => FISCAL.test(candidate.name))).toEqual([])

    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    for (const forbidden of ['Invoice', 'Tax', 'Discount', 'Billing']) {
      expect(modelNames, `el modelo ${forbidden} no debe existir`).not.toContain(forbidden)
    }
  })

  it('la unidad YA NO EXISTE en el modelo, ni como referencia ni como texto (2026-09-07)', () => {
    // Decision humana: `unit_id` salio de `orders`, y con ella la FK `orders_unit_id_fkey`, su
    // indice y la frontera de este modulo con `unidades`. En NEGATIVO a proposito: si alguien
    // devuelve la columna -o la cuela como texto libre-, este caso lo dice.
    expect(has(order, 'unitId')).toBe(false)
    expect(has(order, 'unit')).toBe(false)
    expect(order.body).not.toContain('unit_id')
    expect(order.body).not.toMatch(/@@index\(\[unitId\]/)
  })

  it('recipeId es uuid OBLIGATORIO y sin @relation', () => {
    // R14 y decision cerrada 16: la receta es referencia y es obligatoria; si se da de baja
    // logicamente, el pedido conserva su referencia. Escalar sin `@relation` para que el cliente
    // Prisma no pueda atravesar de `pedidos` a `recetas` con un `include` (R33).
    const recipeId = field(order, 'recipeId')
    expect(recipeId.type).toBe('String')
    expect(recipeId.isOptional).toBe(false)
    expect(recipeId.attributes).toContain('@db.Uuid')
    expect(recipeId.attributes).toContain('@map("recipe_id")')
    expect(recipeId.attributes).not.toMatch(/@default\(/)
    expect(recipeId.attributes).not.toMatch(/@relation/)
    expect(order.body).toMatch(/@@index\(\[recipeId\],\s*map:\s*"orders_recipe_id_idx"\)/)
  })

  it('OrderStatus declara PENDIENTE, EN_CURSO, ENTREGADO, CANCELADO, POR_EMPACAR, EN_EMPAQUE, BLOQUEADO y OrderPriority BAJA, MEDIA, ALTA, CRITICA, en ese orden y sin ningun valor mas (R1)', () => {
    // R16 y decision cerrada 4: dos conjuntos CERRADOS del propio esquema, con esos valores
    // exactos. EL ORDEN DE DECLARACION DE LA PRIORIDAD ES SU ORDEN, de menor a mayor: Postgres
    // ordena un enum por declaracion, no alfabeticamente, asi que reordenar cambia el dato.
    //
    // `POR_EMPACAR` y `EN_EMPAQUE` van al FINAL y eso NO es indiferente: `ALTER TYPE ... ADD
    // VALUE` anade al final, y ponerlos en otra posicion obligaria a recrear el tipo. La lista
    // sigue siendo cerrada: un septimo valor pone este test rojo.
    expect(parseEnum('OrderStatus')).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'ENTREGADO',
      'CANCELADO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'BLOQUEADO',
    ])
    expect(parseEnum('OrderPriority')).toEqual(['BAJA', 'MEDIA', 'ALTA', 'CRITICA'])

    // Los dos unicos enum DE PEDIDOS son los que crea esta feature.
    //
    // Antes esto afirmaba sobre la lista GLOBAL de enums del esquema
    // (`expect(enumNames).toEqual(['OrderStatus', 'OrderPriority'])`), y ese sujeto era mas ancho
    // que el requisito: R16 habla del conjunto cerrado de estado y prioridad DEL PEDIDO, no de
    // que pedidos sea el unico modulo del ERP autorizado a declarar un enum. El primer enum
    // legitimo de otro modulo la ponia roja sin que nada de pedidos hubiera cambiado -paso el
    // 2026-09-08 con `UserAccountStatus` (QC-65, modulo identity)- y el siguiente la volveria a
    // poner. Anadir el enum ajeno a la lista era peor: deja la guardia igual de fragil y encima
    // midiendo algo que no es suyo.
    //
    // COMO SE DERIVA el conjunto, sin lista escrita a mano: un enum es «de pedidos» si algun
    // campo de un modelo cuyo dueno es `/// @module pedidos` lo declara como TIPO. Es la misma
    // fuente de verdad que usa el caso de R31 y la que exige `docs/architecture.md` (todo modelo
    // nuevo lleva su `@module`), asi que no hay nada que mantener a mano: si pedidos gana un
    // modelo, entra solo; si otro modulo declara un enum, no entra nunca. Un enum declarado y no
    // usado por ningun campo de pedidos no es de pedidos —no tipa ninguna columna suya—, y en
    // cambio un tercer enum que SI tipe un campo de `Order` pone este caso rojo, que es
    // exactamente lo que R16 quiere impedir.
    const enumNames = new Set(
      [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined),
    )
    expect(enumNames.size, 'el esquema no declara ningun enum: el parseo esta roto').toBeGreaterThan(0)

    const pedidosModels = [...rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)]
      .filter((match) => match[1] === 'pedidos')
      .map((match) => match[2])
      .filter((modelName): modelName is string => modelName !== undefined)
    expect(pedidosModels, 'ningun modelo declara /// @module pedidos').not.toEqual([])

    const enumsDePedidos = [
      ...new Set(
        pedidosModels
          .flatMap((modelName) => parseModel(modelName).fields)
          .map((candidate) => candidate.type)
          .filter((type) => enumNames.has(type)),
      ),
    ].sort()
    expect(enumsDePedidos).toEqual(['OrderPriority', 'OrderStatus'])

    // Y las dos columnas los usan: el conjunto cerrado esta en el TIPO, no en un CHECK ni en un
    // catalogo de filas (se aparta a proposito de `DocumentType`, QC-4).
    expect(field(order, 'status').type).toBe('OrderStatus')
    expect(field(order, 'priority').type).toBe('OrderPriority')
  })

  it('cancellationReason es TEXT anulable, sin longitud en la columna y sin default', () => {
    // QC-34 R27, R30 y decision cerrada 4. Tres cosas, y las tres importan:
    //   - ANULABLE, porque el motivo solo existe en un pedido cancelado. Que exista si y solo
    //     si `status = 'CANCELADO'` lo garantiza el CHECK de la migracion, no el esquema.
    //   - SIN `@db.VarChar(n)`: el tope de 500 vive en `zod` (validacion de aplicacion), no en
    //     el tipo de la columna. Cambiar el tope no puede ser una migracion.
    //   - SIN `@default`: la ausencia de motivo es ausencia, no una cadena vacia.
    const reason = field(order, 'cancellationReason')
    expect(reason.type).toBe('String')
    expect(reason.isOptional).toBe(true)
    expect(reason.attributes).toContain('@map("cancellation_reason")')
    expect(reason.attributes, 'el tope de 500 vive en zod, no en la columna').not.toMatch(
      /@db\.(VarChar|Char)\(/,
    )
    expect(reason.attributes).not.toMatch(/@default\(/)
  })

  it('status es obligatorio y su default es PENDIENTE', () => {
    // R17 y decision cerrada 12: el estado es obligatorio y un pedido nace PENDIENTE.
    const status = field(order, 'status')
    expect(status.type).toBe('OrderStatus')
    expect(status.isOptional).toBe(false)
    expect(status.attributes).toMatch(/@default\(PENDIENTE\)/)
    expect(status.attributes).not.toMatch(/@map\("/)
  })

  it('priority es NOT NULL con default BAJA, no anulable', () => {
    // R18 y decision cerrada 13: la prioridad es opcional EN LA ENTRADA -no indicarla significa
    // BAJA-, pero la columna NO es anulable: la ausencia no se persiste como ausencia. Si fuera
    // `OrderPriority?` convivirian «prioridad baja» y «prioridad desconocida».
    const priority = field(order, 'priority')
    expect(priority.type).toBe('OrderPriority')
    expect(priority.isOptional).toBe(false)
    expect(priority.attributes).toMatch(/@default\(BAJA\)/)
  })

  it('orderYear y orderSequence son enteros obligatorios', () => {
    // R20 y decision cerrada 9: el correlativo son DOS columnas -ano y posicion dentro del ano-,
    // enteras y obligatorias. Que la posicion sea POSITIVA lo garantiza el CHECK
    // `orders_order_sequence_positive`, que vive en la migracion.
    for (const [nombre, columna] of [
      ['orderYear', 'order_year'],
      ['orderSequence', 'order_sequence'],
    ] as const) {
      const candidate = field(order, nombre)
      expect(candidate.type, `Order.${nombre} debe ser Int`).toBe('Int')
      expect(candidate.isOptional, `Order.${nombre} no puede ser opcional`).toBe(false)
      expect(candidate.attributes).toContain(`@map("${columna}")`)
      // Sin `@default` ni autoincremento: la posicion la calcula QC-34, no la base. Un
      // `@default(autoincrement())` seria una secuencia global y romperia el reinicio anual.
      expect(candidate.attributes, `Order.${nombre} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
      expect(candidate.attributes).not.toMatch(/autoincrement/)
    }
    // La clave unica del correlativo, declarada y con su nombre. QC-60 (R10, R11): la unicidad
    // pasa a medirse DENTRO de la empresa, con `companyId` DE CABEZA, y el unico global de QC-33
    // desaparece -si siguiera declarado, dos empresas no podrian tener cada una su pedido 1-.
    expect(order.body).toMatch(
      /@@unique\(\[companyId,\s*orderYear,\s*orderSequence\],\s*map:\s*"orders_company_year_sequence_key"\)/,
    )
    expect(order.body).not.toMatch(/@@unique\(\[orderYear,\s*orderSequence\]/)
    expect(order.body).not.toMatch(/orders_order_year_order_sequence_key/)
    // Y la clave candidata `(id, company_id)` que hace posible la FK compuesta de
    // `order_assignments` (QC-60 R25). Son DOS unicos y ninguno mas: la lista sigue cerrada.
    expect(order.body).toMatch(
      /@@unique\(\[id,\s*companyId\],\s*map:\s*"orders_id_company_id_key"\)/,
    )
    expect([...order.body.matchAll(/@@unique\(/g)]).toHaveLength(2)
  })

  it('Order no declara ninguna columna con el numero formateado', () => {
    // R24: el `2026-0000001` NO se persiste. La UNICA definicion del formato la publica
    // `formatOrderNumber` en el contrato del modulo, y eso lo comprueba `module-contract`. Una
    // columna con el numero ya compuesto seria un segundo sitio donde el formato puede divergir.
    const NUMERO = /number|numero|code|codigo|folio|display|formatted|label|serial|reference/i
    expect(order.fields.filter((candidate) => NUMERO.test(candidate.name))).toEqual([])
    // Lo que si existe son sus dos factores, y son numeros, no texto.
    expect(field(order, 'orderYear').type).toBe('Int')
    expect(field(order, 'orderSequence').type).toBe('Int')
    expect(order.body).not.toMatch(/order_number|order_code/)
  })

  it('createdBy y updatedBy son uuid sin @relation', () => {
    // R25 y decision cerrada 17: se registra quien creo el pedido y quien lo modifico por ultima
    // vez. La FK a `users` es REAL, pero vive escrita a mano en `migration.sql`: declararla con
    // `@relation` regalaria `include: { createdByUser: true }` desde `pedidos`, y ninguna guardia
    // lo detectaria porque no es un import.
    for (const nombre of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(order, nombre)
      expect(candidate.type).toBe('String')
      expect(candidate.attributes).toContain('@db.Uuid')
      expect(candidate.attributes).not.toMatch(/@relation/)
    }
    // Con su indice del lado hijo: Postgres no indexa el hijo de una FK y por ahi pasa el
    // RESTRICT.
    expect(order.body).toMatch(/@@index\(\[createdBy\],\s*map:\s*"orders_created_by_idx"\)/)
    expect(order.body).toMatch(/@@index\(\[updatedBy\],\s*map:\s*"orders_updated_by_idx"\)/)
  })

  it('createdBy y updatedBy son anulables', () => {
    // R26 y decision cerrada 18: NULL significa «no lo creo una persona» —una importacion, un
    // seed—, no «se perdio el dato». Un `@default` convertiria la ausencia en un valor.
    for (const nombre of ['createdBy', 'updatedBy'] as const) {
      const candidate = field(order, nombre)
      expect(candidate.isOptional, `Order.${nombre} debe ser anulable`).toBe(true)
      expect(candidate.attributes, `Order.${nombre} no debe tener @default`).not.toMatch(
        /@default\(/,
      )
    }
  })

  it('Order declara deletedAt anulable', () => {
    // R27 y decision cerrada 19: borrar conserva la fila COMPLETA y registra el instante. El
    // correlativo no se libera, y eso lo garantiza que el indice unico sea TOTAL (R22, en la
    // migracion).
    const deletedAt = field(order, 'deletedAt')
    expect(deletedAt.type).toBe('DateTime')
    expect(deletedAt.isOptional).toBe(true)
    expect(deletedAt.attributes).toContain('@map("deleted_at")')
    expect(deletedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(deletedAt.attributes).not.toMatch(/@default\(/)
  })

  it('Order declara createdAt y updatedAt', () => {
    // R28: instante de creacion y de ultima modificacion, y el segundo se actualiza SOLO
    // (`@updatedAt`). `createdAt` es ademas la fecha de solicitud (R4).
    const createdAt = field(order, 'createdAt')
    expect(createdAt.type).toBe('DateTime')
    expect(createdAt.isOptional).toBe(false)
    expect(createdAt.attributes).toMatch(/@default\(now\(\)\)/)
    expect(createdAt.attributes).toContain('@map("created_at")')
    expect(createdAt.attributes).toContain('@db.Timestamptz(6)')

    const updatedAt = field(order, 'updatedAt')
    expect(updatedAt.type).toBe('DateTime')
    expect(updatedAt.isOptional).toBe(false)
    expect(updatedAt.attributes).toContain('@updatedAt')
    expect(updatedAt.attributes).toContain('@map("updated_at")')
    expect(updatedAt.attributes).toContain('@db.Timestamptz(6)')
  })

  it('Order declara /// @module pedidos', () => {
    // R31: modulo propietario declarado en el esquema. Se lee el texto CRUDO porque
    // `stripComments` se lleva justamente lo que aqui hay que comprobar.
    const owners = new Map<string, string>()
    for (const match of rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)) {
      const [, moduleName, modelName] = match
      if (moduleName === undefined || modelName === undefined) continue
      owners.set(modelName, moduleName)
    }
    expect(owners.get('Order')).toBe('pedidos')

    // `pedidos` es dueno de UN solo modelo: esta feature no adopta ninguno ajeno.
    const pedidosModels = [...owners.entries()]
      .filter(([, moduleName]) => moduleName === 'pedidos')
      .map(([modelName]) => modelName)
      .sort()
    expect(pedidosModels).toEqual(['Order'])
    expect(owners.get('Recipe')).toBe('recetas')
    expect(owners.get('Unit')).toBe('unidades')
    expect(owners.get('User')).toBe('identity')
  })

  it('las cuatro referencias son escalares uuid SIN @relation y Recipe/Unit/User no tienen campos de vuelta', () => {
    // R33 y decision cerrada 17: las FK son REALES pero viven escritas a mano en el SQL. Sin
    // `@relation` en ninguno de los dos lados, NO hay `include` que atraviese de `pedidos` a
    // `recetas` ni a `identity` (`design.md > 8.1`). Eran cuatro hasta el 2026-09-07; `Unit`
    // sigue comprobandose abajo -no puede ganar un campo de vuelta aunque ya nadie lo apunte-.
    for (const [nombre, columna, anulable] of CROSS_MODULE_SCALARS) {
      const candidate = field(order, nombre)
      expect(candidate.type, `${nombre} debe ser String`).toBe('String')
      expect(candidate.attributes, `${nombre} debe ser uuid`).toContain('@db.Uuid')
      expect(candidate.attributes, `${nombre} debe mapear a ${columna}`).toContain(
        `@map("${columna}")`,
      )
      expect(candidate.attributes, `${nombre} NO puede llevar @relation`).not.toMatch(/@relation/)
      expect(candidate.isOptional, `${nombre} anulable=${String(anulable)}`).toBe(anulable)
    }

    // `Order` no tiene NI UN `@relation`: no hay relacion intra-modulo tampoco, porque el modulo
    // tiene un solo modelo.
    expect(order.fields.filter((candidate) => /@relation/.test(candidate.attributes))).toEqual([])
    // Y ningun campo de `Order` apunta a otro modelo como objeto.
    for (const candidate of order.fields) {
      for (const ajeno of ['Recipe', 'Unit', 'User', 'Product', 'RecipeLine']) {
        expect(candidate.type, `${candidate.name} no puede apuntar a ${ajeno}`).not.toBe(ajeno)
      }
    }
    // Ni el otro lado gana coleccion: sin `orders Order[]` en `Recipe`, `Unit` ni `User`.
    for (const [nombre, modelo] of [
      ['Recipe', recipe],
      ['Unit', unit],
      ['User', user],
    ] as const) {
      expect(
        modelo.fields.some((candidate) => candidate.type === 'Order'),
        `${nombre} no debe declarar ningun campo de tipo Order`,
      ).toBe(false)
      expect(modelo.body, `${nombre} no debe nombrar Order[]`).not.toMatch(/Order\[\]/)
    }
  })

  it('la tabla y sus columnas mapean a snake_case en ingles', () => {
    // R36: tabla, columnas e indices en ingles y `snake_case`. Los VALORES de los dos enum van
    // en castellano a proposito (R16): la regla del idioma alcanza a los identificadores.
    expect(order.body).toContain('@@map("orders")')

    const SNAKE_CASE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
    for (const [nombre, columna] of ORDER_COLUMNS) {
      const mapped = /@map\("([^"]+)"\)/.exec(field(order, nombre).attributes)
      expect(mapped?.[1] ?? nombre, `Order.${nombre} debe mapear a ${columna}`).toBe(columna)
      expect(columna, `Order.${nombre} -> ${columna}`).toMatch(SNAKE_CASE)
    }
    // Todo campo en `camelCase` con mayuscula dentro tiene que declarar su `@map`, o la columna
    // real saldria en `camelCase` y R36 se incumpliria sin aviso.
    for (const candidate of order.fields) {
      if (!/[A-Z]/.test(candidate.name)) continue
      expect(candidate.attributes, `falta @map en Order.${candidate.name}`).toMatch(/@map\("/)
    }

    // Los indices que crea esta feature, tambien en ingles, y la lista es CERRADA: anadir uno a
    // escondidas pone el test rojo.
    const indexMaps = [...order.body.matchAll(/@@index\([^)]*map:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(indexMaps).toEqual([
      'orders_recipe_id_idx',
      'orders_created_by_idx',
      'orders_updated_by_idx',
      'orders_presentation_id_idx',
      'orders_packed_by_idx',
    ])
    // `finished_at` no gana `@@index` en el esquema: su indice parcial vive solo en la
    // migracion, como los de `list_query_indexes`.
    // Los dos unicos, tambien en ingles y `snake_case` (QC-60 sustituye el de QC-33).
    const uniqueMaps = [...order.body.matchAll(/@@unique\([^)]*map:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(uniqueMaps).toEqual(['orders_company_year_sequence_key', 'orders_id_company_id_key'])
    for (const nombre of uniqueMaps) expect(nombre).toMatch(SNAKE_CASE)
  })

  it('orders gana una columna decimal(14,4) opcional en snake_case y ninguna tabla nueva (R20)', () => {
    const ingredientsCost = field(order, 'ingredientsCost')
    expect(ingredientsCost.type).toBe('Decimal')
    expect(ingredientsCost.isOptional).toBe(true)
    expect(ingredientsCost.attributes).toContain('@map("ingredients_cost")')
    expect(ingredientsCost.attributes).toMatch(/@db\.Decimal\(\s*14\s*,\s*4\s*\)/)
    expect(ingredientsCost.attributes).not.toMatch(/@default\(/)

    // Sigue siendo un solo modelo, dueno de `pedidos`: ninguna tabla nueva nace con la feature.
    const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
    const pedidosModels = [...rawSchema.matchAll(/\/\/\/\s*@module\s+(\S+)\s*\n\s*model\s+(\w+)\s*\{/g)]
      .filter((match) => match[1] === 'pedidos')
      .map((match) => match[2])
      .filter((modelName): modelName is string => modelName !== undefined)
    expect(pedidosModels).toEqual(['Order'])
    expect(modelNames.filter((name) => /cost|price|import/i.test(name))).toEqual([])
  })

  it('presentationId es uuid anulable, sin @relation y con su indice (R1, R2, R5)', () => {
    const presentationId = field(order, 'presentationId')
    expect(presentationId.type).toBe('String')
    expect(presentationId.isOptional).toBe(true)
    expect(presentationId.attributes).toContain('@db.Uuid')
    expect(presentationId.attributes).toContain('@map("presentation_id")')
    expect(presentationId.attributes).not.toMatch(/@default\(/)
    expect(presentationId.attributes).not.toMatch(/@relation/)
    expect(order.body).toMatch(
      /@@index\(\[presentationId\],\s*map:\s*"orders_presentation_id_idx"\)/,
    )
  })

  it('finishedAt es timestamptz anulable, sin default y sin indice en el esquema (R1)', () => {
    const finishedAt = field(order, 'finishedAt')
    expect(finishedAt.type).toBe('DateTime')
    expect(finishedAt.isOptional).toBe(true)
    expect(finishedAt.attributes).toContain('@map("finished_at")')
    expect(finishedAt.attributes).toContain('@db.Timestamptz(6)')
    expect(finishedAt.attributes).not.toMatch(/@default\(/)
    expect(order.body).not.toMatch(/@@index\(\[finishedAt\]/)
  })

  it('packedBy es uuid anulable, sin @relation y con su indice (R1, R46)', () => {
    const packedBy = field(order, 'packedBy')
    expect(packedBy.type).toBe('String')
    expect(packedBy.isOptional).toBe(true)
    expect(packedBy.attributes).toContain('@db.Uuid')
    expect(packedBy.attributes).toContain('@map("packed_by")')
    expect(packedBy.attributes).not.toMatch(/@default\(/)
    expect(packedBy.attributes).not.toMatch(/@relation/)
    expect(order.body).toMatch(/@@index\(\[packedBy\],\s*map:\s*"orders_packed_by_idx"\)/)
  })

  it('no nace ninguna columna de moneda (R16)', () => {
    const MONEDA = /currency|moneda|divisa|iso4217/i
    expect(order.fields.filter((candidate) => MONEDA.test(candidate.name))).toEqual([])
    expect(schema).not.toMatch(/currency|moneda|divisa/i)
    for (const forbidden of ['currency', 'currencyCode', 'ingredientsCostCurrency']) {
      expect(has(order, forbidden), `Order.${forbidden} no debe existir`).toBe(false)
    }
  })
})
