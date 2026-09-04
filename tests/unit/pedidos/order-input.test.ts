// T5 — Los esquemas `zod` del borde de `pedidos` (QC-34 R9, R17, R18, R19, R24, R27, R36, R55).
//
// Lo que se vigila aqui es que lo invalido MUERA EN EL BORDE, antes del caso de uso y antes de
// cualquier puerto. No hay dobles ni repositorio: si algo de esto pasara, llegaria a la base a
// que un `CHECK` lo rechazara con un `23514` que el usuario lee como error del sistema.
//
// Y se vigila lo que el esquema NO declara, que es la otra mitad: `z.object` descarta las
// claves desconocidas, asi que un cliente que envie `status`, `createdBy` o el correlativo en
// el alta no consigue nada (R6, R9).

import { describe, expect, it } from 'vitest'

import { ORDER_PRIORITY_VALUES, ORDER_STATUS_VALUES } from '@/lib/modules/pedidos'
import {
  EDITABLE_STATUS_VALUES,
  cancelOrderSchema,
  createOrderSchema,
  listOrdersSchema,
  updateOrderSchema,
} from '@/lib/modules/pedidos/domain/order-input'

const RECIPE_ID = '11111111-1111-4111-8111-111111111111'
const UNIT_ID = '22222222-2222-4222-8222-222222222222'

/** Un alta valida, para mutarla campo a campo en cada caso. */
function altaValida(): Record<string, unknown> {
  return {
    recipeId: RECIPE_ID,
    quantity: '12.5000',
    unitId: UNIT_ID,
    unitPrice: '3.7500',
  }
}

describe('pedidos — createOrderSchema (alta)', () => {
  it('acepta un alta valida y devuelve los importes como CADENA, no como number', () => {
    // R8 y `design.md > 7.1`: 14 digitos con 4 decimales no caben en un `number` sin riesgo de
    // redondeo, asi que viajan como texto y el adaptador los convierte a `Prisma.Decimal`.
    const parsed = createOrderSchema.parse(altaValida())
    expect(parsed.quantity).toBe('12.5000')
    expect(parsed.unitPrice).toBe('3.7500')
    expect(typeof parsed.quantity).toBe('string')
    expect(typeof parsed.unitPrice).toBe('string')
  })

  it('rechaza la cantidad ausente, cero o negativa', () => {
    // R17. El cero es el caso que un patron decimal deja pasar solo: "0" y "0.0000" tienen
    // forma valida y lo que los rechaza es el `> 0`.
    for (const quantity of [undefined, '0', '0.0000', '-1', '-0.0001', '', 'abc']) {
      const entrada = { ...altaValida(), quantity }
      expect(createOrderSchema.safeParse(entrada).success, `quantity=${String(quantity)}`).toBe(
        false,
      )
    }
    expect(createOrderSchema.safeParse({ ...altaValida(), quantity: '0.0001' }).success).toBe(true)
  })

  it('acepta el precio unitario CERO y rechaza el negativo y el ausente', () => {
    // R18 y QC-33 R9: el cero SI vale -un pedido puede registrar una entrega sin cargo-. Es la
    // asimetria con la cantidad y la parte que mas facil se copia mal.
    expect(createOrderSchema.safeParse({ ...altaValida(), unitPrice: '0' }).success).toBe(true)
    expect(createOrderSchema.safeParse({ ...altaValida(), unitPrice: '0.0000' }).success).toBe(true)
    for (const unitPrice of [undefined, '-1', '-0.0001', '', 'abc']) {
      const entrada = { ...altaValida(), unitPrice }
      expect(createOrderSchema.safeParse(entrada).success, `unitPrice=${String(unitPrice)}`).toBe(
        false,
      )
    }
  })

  it('rechaza receta y unidad ausentes o con forma que no es un uuid', () => {
    // R15, R16 en su mitad de BORDE: aqui solo se valida la forma; la existencia y la vigencia
    // las comprueba el caso de uso por los contratos publicos de `recetas` y `unidades`.
    for (const campo of ['recipeId', 'unitId'] as const) {
      expect(createOrderSchema.safeParse({ ...altaValida(), [campo]: undefined }).success).toBe(
        false,
      )
      expect(createOrderSchema.safeParse({ ...altaValida(), [campo]: 'no-es-uuid' }).success).toBe(
        false,
      )
    }
  })

  it('la prioridad es opcional y su ausencia significa BAJA; fuera del conjunto se rechaza', () => {
    // R9 y R19. El defecto es el del dominio, no un literal repetido, y el conjunto es cerrado.
    expect(createOrderSchema.parse(altaValida()).priority).toBe('BAJA')
    for (const priority of ORDER_PRIORITY_VALUES) {
      const parsed = createOrderSchema.parse({ ...altaValida(), priority })
      expect(parsed.priority).toBe(priority)
    }
    for (const priority of ['URGENTE', 'baja', '', 'CRITICA ', 1]) {
      expect(
        createOrderSchema.safeParse({ ...altaValida(), priority }).success,
        `priority=${String(priority)}`,
      ).toBe(false)
    }
  })

  it('descarta status, cancellationReason, el correlativo, las fechas y los dos autores', () => {
    // R6, R9: lo que el esquema no declara NO PUEDE LLEGAR. Se envia todo lo prohibido a la vez
    // y se comprueba que la salida tiene exactamente las cinco claves del alta.
    const parsed = createOrderSchema.parse({
      ...altaValida(),
      status: 'ENTREGADO',
      cancellationReason: 'porque si',
      orderYear: 1999,
      orderSequence: 42,
      createdAt: new Date(0),
      createdBy: '33333333-3333-4333-8333-333333333333',
      updatedBy: '33333333-3333-4333-8333-333333333333',
    })
    expect(Object.keys(parsed).sort()).toEqual([
      'priority',
      'quantity',
      'recipeId',
      'unitId',
      'unitPrice',
    ])
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('cancellationReason')
    expect(parsed).not.toHaveProperty('orderYear')
    expect(parsed).not.toHaveProperty('orderSequence')
    expect(parsed).not.toHaveProperty('createdBy')
    expect(parsed).not.toHaveProperty('updatedBy')
  })
})

describe('pedidos — updateOrderSchema (edicion)', () => {
  const edicionValida = { ...altaValida(), priority: 'ALTA', status: 'EN_CURSO' }

  it('EDITABLE_STATUS se DERIVA del conjunto cerrado quitando CANCELADO, no se escribe a mano', () => {
    // R24 y `design.md > 7.2`: el dia que aparezca un quinto estado, quien lo anada tiene que
    // decidir explicitamente si es editable. Se comprueba la derivacion, no la lista literal.
    expect([...EDITABLE_STATUS_VALUES]).toEqual(
      ORDER_STATUS_VALUES.filter((status) => status !== 'CANCELADO'),
    )
    expect(EDITABLE_STATUS_VALUES).toHaveLength(ORDER_STATUS_VALUES.length - 1)
    expect(EDITABLE_STATUS_VALUES).not.toContain('CANCELADO')
  })

  it('acepta los tres estados editables y la edicion completa', () => {
    // R20: reemplazo COMPLETO del conjunto de datos de negocio, estado incluido.
    for (const status of EDITABLE_STATUS_VALUES) {
      const parsed = updateOrderSchema.parse({ ...edicionValida, status })
      expect(parsed.status).toBe(status)
    }
    expect(Object.keys(updateOrderSchema.parse(edicionValida)).sort()).toEqual([
      'priority',
      'quantity',
      'recipeId',
      'status',
      'unitId',
      'unitPrice',
    ])
  })

  it('rechaza status CANCELADO y no admite ningun motivo de cancelacion', () => {
    // R24 y decision cerrada 7: la edicion NO puede cancelar. Muere aqui, en el borde, sin
    // llegar al caso de uso ni al repositorio; y `reason` ni siquiera existe en este esquema,
    // asi que se descarta silenciosamente en vez de convertirse en un motivo escrito.
    expect(updateOrderSchema.safeParse({ ...edicionValida, status: 'CANCELADO' }).success).toBe(
      false,
    )
    const parsed = updateOrderSchema.parse({
      ...edicionValida,
      reason: 'me arrepenti',
      cancellationReason: 'me arrepenti',
    })
    expect(parsed).not.toHaveProperty('reason')
    expect(parsed).not.toHaveProperty('cancellationReason')
  })

  it('el estado es obligatorio y rechaza cualquier valor fuera del conjunto', () => {
    // R19: el conjunto es cerrado y el valor no puede llegar al repositorio.
    for (const status of [undefined, '', 'entregado', 'ANULADO', 3]) {
      expect(
        updateOrderSchema.safeParse({ ...edicionValida, status }).success,
        `status=${String(status)}`,
      ).toBe(false)
    }
  })

  it('hereda del alta las reglas de cantidad y precio', () => {
    // R17, R18: no hay dos verdades sobre la cantidad segun se cree o se edite.
    expect(updateOrderSchema.safeParse({ ...edicionValida, quantity: '0' }).success).toBe(false)
    expect(updateOrderSchema.safeParse({ ...edicionValida, unitPrice: '0' }).success).toBe(true)
    expect(updateOrderSchema.safeParse({ ...edicionValida, unitPrice: '-1' }).success).toBe(false)
  })
})

describe('pedidos — cancelOrderSchema (cancelacion)', () => {
  it('recorta el motivo y acepta hasta 500 caracteres una vez recortado', () => {
    // R27. El tope vive AQUI, en la validacion de aplicacion, no en el tipo de la columna.
    expect(cancelOrderSchema.parse({ reason: '  el cliente rectifico  ' }).reason).toBe(
      'el cliente rectifico',
    )
    expect(cancelOrderSchema.safeParse({ reason: 'x'.repeat(500) }).success).toBe(true)
    // 500 con espacios alrededor pasa: el `trim()` va ANTES del `max`.
    expect(cancelOrderSchema.safeParse({ reason: `   ${'x'.repeat(500)}   ` }).success).toBe(true)
  })

  it('rechaza el motivo ausente, vacio, de solo espacios y de 501 caracteres tras recortar', () => {
    // R27, los cuatro casos. El de solo espacios es el que un `min(1)` sin `trim()` previo
    // dejaria pasar.
    for (const reason of [undefined, null, '', '   ', '\t\n ', 'x'.repeat(501)]) {
      expect(cancelOrderSchema.safeParse({ reason }).success, `reason=${String(reason)}`).toBe(
        false,
      )
    }
    expect(cancelOrderSchema.safeParse({ reason: `  ${'x'.repeat(501)}  ` }).success).toBe(false)
  })

  it('no admite estado: cancelar no elige a donde va el pedido', () => {
    // R26: `cancelOrder` es el unico camino hacia CANCELADO y no recibe estado de nadie.
    const parsed = cancelOrderSchema.parse({ reason: 'motivo', status: 'PENDIENTE' })
    expect(Object.keys(parsed)).toEqual(['reason'])
  })
})

describe('pedidos — listOrdersSchema (consulta)', () => {
  it('rechaza pagina y tamano que no sean enteros mayores o iguales a 1', () => {
    // R36: se rechaza en el borde y no se lee del repositorio. El defecto de 10 y el tope de 25
    // NO estan aqui: los aplica `lib/shared/pagination` en el adaptador (R35, R37).
    for (const page of [0, -1, 1.5, Number.NaN]) {
      expect(listOrdersSchema.safeParse({ page }).success, `page=${String(page)}`).toBe(false)
    }
    for (const pageSize of [0, -1, 2.5]) {
      expect(listOrdersSchema.safeParse({ pageSize }).success, `pageSize=${String(pageSize)}`).toBe(
        false,
      )
    }
    expect(listOrdersSchema.parse({}).page).toBe(1)
    expect(listOrdersSchema.parse({}).pageSize).toBeUndefined()
    expect(listOrdersSchema.parse({ page: 3, pageSize: 25 })).toMatchObject({
      page: 3,
      pageSize: 25,
    })
  })

  it('admite los dos filtros, opcionales y combinables, y CANCELADO como filtro de estado', () => {
    // R38 y R40: los cancelados SI se consultan -para eso tienen estado propio en vez de
    // desaparecer-; los borrados no salen nunca y eso es del puerto, no de este esquema.
    expect(listOrdersSchema.parse({})).toMatchObject({ page: 1 })
    expect(listOrdersSchema.parse({ status: 'CANCELADO' }).status).toBe('CANCELADO')
    expect(listOrdersSchema.parse({ priority: 'CRITICA' }).priority).toBe('CRITICA')
    const ambos = listOrdersSchema.parse({ status: 'EN_CURSO', priority: 'ALTA', page: 2 })
    expect(ambos).toMatchObject({ status: 'EN_CURSO', priority: 'ALTA', page: 2 })
    for (const status of ORDER_STATUS_VALUES) {
      expect(listOrdersSchema.safeParse({ status }).success, `status=${status}`).toBe(true)
    }
  })

  it('rechaza un estado o una prioridad fuera del conjunto y descarta la busqueda por texto', () => {
    // R19 y R39: sin busqueda por texto y sin filtro por numero correlativo.
    expect(listOrdersSchema.safeParse({ status: 'ANULADO' }).success).toBe(false)
    expect(listOrdersSchema.safeParse({ priority: 'URGENTE' }).success).toBe(false)
    const parsed = listOrdersSchema.parse({ q: 'acido', search: 'acido', number: '2026-0000001' })
    expect(Object.keys(parsed).sort()).toEqual(['page'])
  })
})
