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
  orderPresentationAvailabilitySchema,
  presentationLinesSchema,
  quoteOrderCostSchema,
  updateOrderDistributionSchema,
  updateOrderSchema,
} from '@/lib/modules/pedidos/domain/order-input'
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable'

const RECIPE_ID = '11111111-1111-4111-8111-111111111111'
const PRESENTATION_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_PRESENTATION_ID = '55555555-5555-4555-8555-555555555555'
/** QC-170 [Q4]: la unidad del pedido, obligatoria. */
const UNIT_ID = '33333333-3333-4333-8333-333333333333'

/** Un alta valida, para mutarla campo a campo en cada caso. Sin reparto (`[]`, R9): quien
 *  ejercite el reparto en si mismo lo anade con `presentationLines`. */
function altaValida(): Record<string, unknown> {
  return {
    recipeId: RECIPE_ID,
    quantity: '12.5000',
    unitId: UNIT_ID,
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

  it('el precio unitario sigue sin existir: se DESCARTA sin dejar rastro; la unidad SI existe (QC-170 [Q4])', () => {
    // QC-35bis (2026-09-07) saco los dos del pedido. QC-170 [Q4] devuelve la UNIDAD -es
    // `altaValida().unitId`, obligatoria (R41)-; el precio sigue fuera, y `z.object` lo
    // descarta como cualquier clave desconocida: enviarlo NO rechaza el alta -eso convertiria
    // a un cliente desactualizado en un error de validacion- pero tampoco lo cuela hacia el
    // caso de uso.
    const conCampoViejo = {
      ...altaValida(),
      unitPrice: '3.7500',
    }

    const parsed = createOrderSchema.parse(conCampoViejo)

    expect(parsed.unitId).toBe(UNIT_ID)
    expect(parsed).not.toHaveProperty('unitPrice')
  })

  it('R41: rechaza la unidad ausente o con forma que no es un uuid', () => {
    for (const unitId of [undefined, '', 'no-es-uuid', null, 123]) {
      expect(
        createOrderSchema.safeParse({ ...altaValida(), unitId }).success,
        `unitId=${String(unitId)}`,
      ).toBe(false)
    }
    expect(createOrderSchema.safeParse(altaValida()).success).toBe(true)
  })

  it('R9: sin `presentationLines` en la entrada, el reparto por defecto es `[]`', () => {
    const parsed = createOrderSchema.parse(altaValida())
    expect(parsed.presentationLines).toEqual([])
  })

  it('R1: cada linea exige un uuid de presentacion y envases enteros positivos', () => {
    for (const packages of [0, -1, 1.5, undefined, 'x']) {
      expect(
        createOrderSchema.safeParse({
          ...altaValida(),
          presentationLines: [{ presentationId: PRESENTATION_ID, packages }],
        }).success,
        `packages=${String(packages)}`,
      ).toBe(false)
    }
    for (const presentationId of ['no-es-uuid', undefined, null]) {
      expect(
        createOrderSchema.safeParse({
          ...altaValida(),
          presentationLines: [{ presentationId, packages: 1 }],
        }).success,
        `presentationId=${String(presentationId)}`,
      ).toBe(false)
    }
    expect(
      createOrderSchema.safeParse({
        ...altaValida(),
        presentationLines: [{ presentationId: PRESENTATION_ID, packages: 3 }],
      }).success,
    ).toBe(true)
  })

  it('R2: una presentacion repetida en el reparto se rechaza en el BORDE', () => {
    const resultado = presentationLinesSchema.safeParse([
      { presentationId: PRESENTATION_ID, packages: 1 },
      { presentationId: PRESENTATION_ID, packages: 2 },
    ])
    expect(resultado.success).toBe(false)

    expect(
      presentationLinesSchema.safeParse([
        { presentationId: PRESENTATION_ID, packages: 1 },
        { presentationId: OTHER_PRESENTATION_ID, packages: 2 },
      ]).success,
    ).toBe(true)
  })

  it('R4: `presentationId` (la presentacion UNICA de QC-146) ya no existe en el esquema del pedido', () => {
    const parsed = createOrderSchema.parse({ ...altaValida(), presentationId: PRESENTATION_ID })
    expect(parsed).not.toHaveProperty('presentationId')
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
    expect(Object.keys(parsed).sort()).toEqual([
      'confirmBlocked',
      'presentationLines',
      'priority',
      'quantity',
      'recipeId',
      'recipeVersionId',
      'unitId',
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
  const edicionValida = { ...altaValida(), priority: 'ALTA' }

  it('EDITABLE_STATUS se DERIVA del conjunto cerrado quitando CANCELADO, no se escribe a mano', () => {
    // El dia que aparezca un quinto estado, quien lo anada tiene que decidir explicitamente si es
    // editable. Se comprueba la derivacion, no la lista literal. Se sigue publicando para el
    // selector de estado del formulario, pero `updateOrderSchema` ya no lo usa.
    expect([...EDITABLE_STATUS_VALUES]).toEqual(
      ORDER_STATUS_VALUES.filter((status) => status !== 'CANCELADO'),
    )
    expect(EDITABLE_STATUS_VALUES).toHaveLength(ORDER_STATUS_VALUES.length - 1)
    expect(EDITABLE_STATUS_VALUES).not.toContain('CANCELADO')
  })

  it('R6: `updateOrderSchema` es EXACTAMENTE `createOrderSchema`, sin campo de estado', () => {
    expect(updateOrderSchema).toBe(createOrderSchema)
    expect(Object.keys(updateOrderSchema.parse(edicionValida)).sort()).toEqual([
      'confirmBlocked',
      'presentationLines',
      'priority',
      'quantity',
      'recipeId',
      'recipeVersionId',
      'unitId',
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

  it('R41: la edicion exige unidad, con las mismas reglas que el alta', () => {
    for (const unitId of [undefined, '', 'no-es-uuid', null]) {
      expect(
        updateOrderSchema.safeParse({ ...edicionValida, unitId }).success,
        `unitId=${String(unitId)}`,
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

describe('QC-138 — confirmBlocked en el alta y la edicion', () => {
  it('R6: sin confirmBlocked, la entrada vale y no confirma', () => {
    expect(createOrderSchema.parse(altaValida()).confirmBlocked).toBe(false)
    expect(updateOrderSchema.parse(altaValida()).confirmBlocked).toBe(false)
  })

  it('R8: confirmBlocked=true se conserva; un valor que no es booleano se rechaza', () => {
    expect(createOrderSchema.parse({ ...altaValida(), confirmBlocked: true }).confirmBlocked).toBe(true)
    for (const confirmBlocked of ['true', 1, null, 'si']) {
      expect(
        createOrderSchema.safeParse({ ...altaValida(), confirmBlocked }).success,
        `confirmBlocked=${String(confirmBlocked)}`,
      ).toBe(false)
    }
  })

  it('R6: confirmar no permite elegir el estado: un status BLOQUEADO se descarta', () => {
    const parsed = createOrderSchema.parse({ ...altaValida(), confirmBlocked: true, status: 'BLOQUEADO' })
    expect(parsed).not.toHaveProperty('status')
  })

  it('la cotizacion no hereda confirmBlocked', () => {
    const parsed = quoteOrderCostSchema.parse({ ...altaValida(), confirmBlocked: true })
    expect(parsed).not.toHaveProperty('confirmBlocked')
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

// `quoteOrderCostSchema` es un `pick` de `createOrderSchema` y acepta/rechaza
// exactamente lo mismo que el alta en `recipeId`, `quantity` y `unitId`, sin declarar nada mas.
describe('pedidos — quoteOrderCostSchema (cotizacion)', () => {
  it('acepta y rechaza exactamente lo mismo que createOrderSchema en recipeId, quantity y unitId', () => {
    for (const quantity of [undefined, '0', '0.0000', '-1', '-0.0001', '', 'abc', '0.0001', '12.5000']) {
      const entrada = { recipeId: RECIPE_ID, quantity, unitId: UNIT_ID }
      expect(
        quoteOrderCostSchema.safeParse(entrada).success,
        `quantity=${String(quantity)}`,
      ).toBe(createOrderSchema.safeParse({ ...altaValida(), quantity }).success)
    }
    for (const recipeId of [undefined, '', 'no-es-uuid', RECIPE_ID]) {
      const entrada = { recipeId, quantity: '12.5000', unitId: UNIT_ID }
      expect(
        quoteOrderCostSchema.safeParse(entrada).success,
        `recipeId=${String(recipeId)}`,
      ).toBe(createOrderSchema.safeParse({ ...altaValida(), recipeId }).success)
    }
    for (const unitId of [undefined, '', 'no-es-uuid', UNIT_ID]) {
      const entrada = { recipeId: RECIPE_ID, quantity: '12.5000', unitId }
      expect(
        quoteOrderCostSchema.safeParse(entrada).success,
        `unitId=${String(unitId)}`,
      ).toBe(createOrderSchema.safeParse({ ...altaValida(), unitId }).success)
    }
  })

  it('descarta cualquier clave que no sea recipeId, quantity o unitId', () => {
    const parsed = quoteOrderCostSchema.parse({
      recipeId: RECIPE_ID,
      quantity: '12.5000',
      unitId: UNIT_ID,
      presentationId: PRESENTATION_ID,
      companyId: '44444444-4444-4444-8444-444444444444',
    })
    expect(Object.keys(parsed).sort()).toEqual(['quantity', 'recipeId', 'unitId'])
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

describe('pedidos — recipeVersionId en alta y edicion', () => {
  const VERSION_ID = '33333333-3333-4333-8333-333333333333'

  it('R31: sin el campo, la entrada de hoy sigue valiendo y la version es null', () => {
    expect(createOrderSchema.parse(altaValida()).recipeVersionId).toBeNull()
    expect(updateOrderSchema.parse(altaValida()).recipeVersionId).toBeNull()
  })

  it('R31: la cadena vacia que envia «Original» en el formulario se lee como null', () => {
    expect(createOrderSchema.parse({ ...altaValida(), recipeVersionId: '' }).recipeVersionId).toBeNull()
    expect(createOrderSchema.parse({ ...altaValida(), recipeVersionId: null }).recipeVersionId).toBeNull()
  })

  it('R30: un UUID de version se conserva tal cual', () => {
    expect(createOrderSchema.parse({ ...altaValida(), recipeVersionId: VERSION_ID }).recipeVersionId).toBe(
      VERSION_ID,
    )
  })

  it('R32: una version que no es UUID se rechaza en el borde', () => {
    for (const recipeVersionId of ['no-es-uuid', ' ', 42]) {
      expect(
        createOrderSchema.safeParse({ ...altaValida(), recipeVersionId }).success,
        `recipeVersionId=${String(recipeVersionId)}`,
      ).toBe(false)
    }
  })
})

describe('QC-195 — la linea del reparto nombra su envase', () => {
  const ENVASE_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
  const OTRO_ENVASE_ID = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'

  it('R11: una linea con envase se acepta y sale con el envase y los envases como numero', () => {
    expect(presentationLinesSchema.parse([{ packagingProductId: ENVASE_ID, packages: '40' }])).toEqual([
      { packagingProductId: ENVASE_ID, packages: 40 },
    ])
  })

  it('R35: una linea antigua por su presentacion sigue teniendo forma valida', () => {
    expect(presentationLinesSchema.parse([{ presentationId: PRESENTATION_ID, packages: 2 }])).toEqual([
      { presentationId: PRESENTATION_ID, packages: 2 },
    ])
  })

  it('R11: con los dos identificadores, o sin ninguno, la linea se rechaza', () => {
    expect(
      presentationLinesSchema.safeParse([{ packagingProductId: ENVASE_ID, presentationId: PRESENTATION_ID, packages: 1 }])
        .success,
    ).toBe(false)
    expect(presentationLinesSchema.safeParse([{ packages: 1 }]).success).toBe(false)
  })

  it('R11: un envase que no es UUID se rechaza en el borde', () => {
    expect(presentationLinesSchema.safeParse([{ packagingProductId: 'no-es-uuid', packages: 1 }]).success).toBe(false)
  })

  it('R7 (QC-170): los envases de una linea con envase son enteros positivos', () => {
    for (const packages of ['0', '-1', '1.5', 'x']) {
      expect(
        presentationLinesSchema.safeParse([{ packagingProductId: ENVASE_ID, packages }]).success,
        `packages=${packages}`,
      ).toBe(false)
    }
  })

  it('R12: el mismo envase dos veces se rechaza en el borde; dos envases distintos pasan', () => {
    expect(
      presentationLinesSchema.safeParse([
        { packagingProductId: ENVASE_ID, packages: 1 },
        { packagingProductId: ENVASE_ID, packages: 2 },
      ]).success,
    ).toBe(false)
    expect(
      presentationLinesSchema.safeParse([
        { packagingProductId: ENVASE_ID, packages: 1 },
        { packagingProductId: OTRO_ENVASE_ID, packages: 2 },
      ]).success,
    ).toBe(true)
  })

  it('R11: el alta, la edicion y el disponible aceptan lineas con envase con el mismo esquema', () => {
    const conEnvase = { ...altaValida(), presentationLines: [{ packagingProductId: ENVASE_ID, packages: 3 }] }
    expect(createOrderSchema.parse(conEnvase).presentationLines).toEqual([{ packagingProductId: ENVASE_ID, packages: 3 }])
    expect(updateOrderSchema.safeParse(conEnvase).success).toBe(true)
    expect(
      orderPresentationAvailabilitySchema.safeParse({
        quantity: '20',
        unitId: UNIT_ID,
        presentationLines: [{ packagingProductId: ENVASE_ID, packages: 40 }],
      }).success,
    ).toBe(true)
    expect(
      updateOrderDistributionSchema.safeParse({
        unitId: UNIT_ID,
        presentationLines: [{ packagingProductId: ENVASE_ID, packages: '30' }],
      }).success,
    ).toBe(true)
  })
})
