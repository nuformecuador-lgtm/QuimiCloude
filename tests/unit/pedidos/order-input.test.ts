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
  createListQuerySchema,
  sanitizeListQuery,
} from '@/lib/modules/pedidos/domain/list-query'
import {
  EDITABLE_STATUS_VALUES,
  cancelOrderSchema,
  createOrderSchema,
  updateOrderSchema,
} from '@/lib/modules/pedidos/domain/order-input'
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable'

const RECIPE_ID = '11111111-1111-4111-8111-111111111111'
const PRESENTATION_ID = '22222222-2222-4222-8222-222222222222'

/** Un alta valida, para mutarla campo a campo en cada caso. */
function altaValida(): Record<string, unknown> {
  return {
    recipeId: RECIPE_ID,
    quantity: '12.5000',
    presentationId: PRESENTATION_ID,
  }
}

describe('pedidos — createOrderSchema (alta)', () => {
  it('acepta un alta valida y devuelve la cantidad como CADENA, no como number', () => {
    // R8 y `design.md > 7.1`: 14 digitos con 4 decimales no caben en un `number` sin riesgo de
    // redondeo, asi que viaja como texto y el adaptador la convierte a `Prisma.Decimal`.
    const parsed = createOrderSchema.parse(altaValida())
    expect(parsed.quantity).toBe('12.5000')
    expect(typeof parsed.quantity).toBe('string')
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

  it('la unidad y el precio unitario ya no existen: se DESCARTAN sin dejar rastro', () => {
    // QC-35bis (2026-09-07). El esquema no los declara, asi que `z.object` los descarta como
    // cualquier clave desconocida: enviarlos NO rechaza el alta -eso convertiria a un cliente
    // desactualizado en un error de validacion- pero tampoco los cuela hacia el caso de uso.
    // Es la mitad que hace imposible reintroducirlos por descuido.
    const conCamposViejos = {
      ...altaValida(),
      unitId: '22222222-2222-4222-8222-222222222222',
      unitPrice: '3.7500',
    }

    const parsed = createOrderSchema.parse(conCamposViejos)

    expect(parsed).not.toHaveProperty('unitId')
    expect(parsed).not.toHaveProperty('unitPrice')
  })

  it('R6: rechaza la presentacion ausente o con forma que no es un uuid', () => {
    for (const presentationId of [undefined, '', 'no-es-uuid', null, 123]) {
      expect(
        createOrderSchema.safeParse({ ...altaValida(), presentationId }).success,
        `presentationId=${String(presentationId)}`,
      ).toBe(false)
    }
    expect(createOrderSchema.safeParse(altaValida()).success).toBe(true)
  })

  it('rechaza la receta ausente o con forma que no es un uuid', () => {
    // R15 en su mitad de BORDE: aqui solo se valida la forma; la existencia y la vigencia las
    // comprueba el caso de uso por el contrato publico de `recetas`.
    expect(createOrderSchema.safeParse({ ...altaValida(), recipeId: undefined }).success).toBe(
      false,
    )
    expect(createOrderSchema.safeParse({ ...altaValida(), recipeId: 'no-es-uuid' }).success).toBe(
      false,
    )
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
    expect(Object.keys(parsed).sort()).toEqual(['presentationId', 'priority', 'quantity', 'recipeId'])
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('cancellationReason')
    expect(parsed).not.toHaveProperty('orderYear')
    expect(parsed).not.toHaveProperty('orderSequence')
    expect(parsed).not.toHaveProperty('createdBy')
    expect(parsed).not.toHaveProperty('updatedBy')
  })
})

describe('pedidos — updateOrderSchema (edicion)', () => {
  const edicionValida = { ...altaValida(), priority: 'ALTA' }

  it('EDITABLE_STATUS se DERIVA del conjunto cerrado quitando CANCELADO, no se escribe a mano', () => {
    // R24 (QC-34) y `design.md > 7.2`: el dia que aparezca un quinto estado, quien lo anada
    // tiene que decidir explicitamente si es editable. Se comprueba la derivacion, no la lista
    // literal. Se sigue publicando para QC-145 T14 (el selector de estado del formulario), pero
    // `updateOrderSchema` ya no lo usa (R6).
    expect([...EDITABLE_STATUS_VALUES]).toEqual(
      ORDER_STATUS_VALUES.filter((status) => status !== 'CANCELADO'),
    )
    expect(EDITABLE_STATUS_VALUES).toHaveLength(ORDER_STATUS_VALUES.length - 1)
    expect(EDITABLE_STATUS_VALUES).not.toContain('CANCELADO')
  })

  it('R6: `updateOrderSchema` es EXACTAMENTE `createOrderSchema`, sin campo de estado', () => {
    expect(updateOrderSchema).toBe(createOrderSchema)
    expect(Object.keys(updateOrderSchema.parse(edicionValida)).sort()).toEqual([
      'presentationId',
      'priority',
      'quantity',
      'recipeId',
    ])
  })

  it('R6: un `status` en la entrada se DESCARTA, sea el que sea, y la edicion no falla por el', () => {
    // La edicion ya no puede ni EXPRESAR un cambio de estado: `z.object` descarta la clave
    // desconocida igual que con cualquier otro campo ajeno, no la rechaza como invalida.
    for (const status of ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO', 'ANULADO', 3]) {
      const parsed = updateOrderSchema.parse({ ...edicionValida, status })
      expect(parsed, `status=${String(status)}`).not.toHaveProperty('status')
    }
  })

  it('no admite ningun motivo de cancelacion: cancelar es `cancelOrder` y solo el', () => {
    // Decision cerrada 7: la edicion NO puede cancelar, y `reason` ni siquiera existe en este
    // esquema, asi que se descarta silenciosamente en vez de convertirse en un motivo escrito.
    const parsed = updateOrderSchema.parse({
      ...edicionValida,
      reason: 'me arrepenti',
      cancellationReason: 'me arrepenti',
    })
    expect(parsed).not.toHaveProperty('reason')
    expect(parsed).not.toHaveProperty('cancellationReason')
  })

  it('la edicion es valida SIN estado: ya no es un campo obligatorio', () => {
    expect(updateOrderSchema.safeParse(edicionValida).success).toBe(true)
  })

  it('R7: la edicion exige presentacion, con las mismas reglas que el alta', () => {
    for (const presentationId of [undefined, '', 'no-es-uuid', null]) {
      expect(
        updateOrderSchema.safeParse({ ...edicionValida, presentationId }).success,
        `presentationId=${String(presentationId)}`,
      ).toBe(false)
    }
    expect(updateOrderSchema.safeParse(edicionValida).success).toBe(true)
  })

  it('hereda del alta la regla de la cantidad', () => {
    // R17: no hay dos verdades sobre la cantidad segun se cree o se edite.
    expect(updateOrderSchema.safeParse({ ...edicionValida, quantity: '0' }).success).toBe(false)
    expect(updateOrderSchema.safeParse({ ...edicionValida, quantity: '-1' }).success).toBe(false)
    expect(updateOrderSchema.safeParse({ ...edicionValida, quantity: '0.0001' }).success).toBe(true)
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

// QC-57 (R25): `listOrdersSchema` DESAPARECIO y el listado pasa por el CONTRATO GENERICO. Lo
// que aquel esquema garantizaba se sigue garantizando, y se comprueba aqui mismo sobre el
// contrato nuevo -no se borra ningun aserto, se traslada a la forma nueva (R26)-.
describe('pedidos — la consulta del listado, ya con el contrato generico (QC-57 R25)', () => {
  const listQuerySchema = createListQuerySchema()

  /** La consulta ya saneada contra la lista blanca de pedidos, como la ve el repositorio. */
  function saneada(entrada: unknown): ReturnType<typeof sanitizeListQuery> {
    const parsed = listQuerySchema.safeParse(entrada)
    if (!parsed.success) throw new Error('la entrada no cumple la forma del contrato')
    return sanitizeListQuery(parsed.data, ORDER_QUERYABLE)
  }

  it('rechaza pagina y tamano que no sean enteros mayores o iguales a 1', () => {
    // R36 (heredado, QC-34): se rechaza en el borde y no se lee del repositorio. El defecto de
    // 10 y el tope de 25 NO estan aqui: los aplica `lib/shared/pagination` en el adaptador.
    for (const page of [0, -1, 1.5, Number.NaN]) {
      expect(listQuerySchema.safeParse({ page }).success, `page=${String(page)}`).toBe(false)
    }
    for (const pageSize of [0, -1, 2.5]) {
      expect(listQuerySchema.safeParse({ pageSize }).success, `pageSize=${String(pageSize)}`).toBe(
        false,
      )
    }
    expect(listQuerySchema.parse({}).page).toBe(1)
    expect(listQuerySchema.parse({}).pageSize).toBeUndefined()
    expect(listQuerySchema.parse({ page: 3, pageSize: 25 })).toMatchObject({
      page: 3,
      pageSize: 25,
    })
  })

  it('admite los dos filtros, opcionales y combinables, y CANCELADO como filtro de estado', () => {
    // R25 + R38/R40 heredados: estado y prioridad ahora son filtros `select` del contrato, y
    // siguen siendo opcionales y combinables. Los cancelados SI se consultan -para eso tienen
    // estado propio en vez de desaparecer-; los borrados no salen nunca y eso es del puerto.
    expect(saneada({}).query.filters).toEqual({})

    const soloEstado = saneada({ filters: { status: { kind: 'select', values: ['CANCELADO'] } } })
    expect(soloEstado.query.filters).toEqual({
      status: { kind: 'select', values: ['CANCELADO'] },
    })

    const soloPrioridad = saneada({
      filters: { priority: { kind: 'select', values: ['CRITICA'] } },
    })
    expect(soloPrioridad.query.filters).toEqual({
      priority: { kind: 'select', values: ['CRITICA'] },
    })

    const ambos = saneada({
      page: 2,
      filters: {
        status: { kind: 'select', values: ['EN_CURSO'] },
        priority: { kind: 'select', values: ['ALTA'] },
      },
    })
    expect(Object.keys(ambos.query.filters).sort()).toEqual(['priority', 'status'])
    expect(ambos.query.page).toBe(2)

    for (const status of ORDER_STATUS_VALUES) {
      const una = saneada({ filters: { status: { kind: 'select', values: [status] } } })
      expect(una.query.filters.status, `status=${status}`).toEqual({
        kind: 'select',
        values: [status],
      })
    }
  })

  it('la busqueda por texto SOBREVIVE a `sanitizeListQuery` (R11)', () => {
    // Nota fechada 2026-09-18: hasta QC-68 este caso probaba que la busqueda moria aqui, porque
    // `ORDER_QUERYABLE.searchable` era `false`. Ahora la lista blanca la declara `true` -el
    // termino se resuelve a ids de receta en `list-orders.ts`, no en este esquema- y el contrato
    // generico deja de podarla.
    const conBusqueda = saneada({ search: 'acido' })
    expect(conBusqueda.query.search).toBe('acido')
    expect(conBusqueda.ignored).not.toContain('search')
  })

  it('un filtro por el numero correlativo se OMITE y se anota: no esta declarado (R39)', () => {
    // Caso hermano del anterior, conservado: `orderNumber` no es un campo declarado en
    // `ORDER_QUERYABLE.filterable`, y eso si sigue omitiendose y anotandose. Sin este caso, esa
    // mitad del contrato generico dejaria de estar probada en pedidos.
    const porNumero = saneada({
      filters: { orderNumber: { kind: 'text', value: '2026-0000001' } },
    })
    expect(porNumero.query.filters).toEqual({})
    expect(porNumero.ignored).toEqual(['orderNumber'])
  })
})
