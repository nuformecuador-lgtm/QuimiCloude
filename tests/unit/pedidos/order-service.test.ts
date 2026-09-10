// T12 (QC-34) — Alta, ficha y edicion (R6, R8, R9, R10, R14, R15, R16, R20, R21, R22, R24,
// R25, R29, R33, R42, R43, R46).
//
// Dobles del puerto y de los DOS catalogos. Aqui los dobles si responden -esto no es el test
// de autorizacion-, pero lo que se afirma es lo que el caso de uso LES PASA y lo que NO llega
// a llamarse cuando algo se rechaza: un alta rechazada no puede haber tocado el repositorio
// (R15, R16), y una edicion rechazada no puede haber modificado ninguna fila (R21, R22).
//
// Todas las afirmaciones de error van sobre el `code` ESTABLE de la clase, nunca sobre el
// texto del mensaje (R56): el mensaje puede cambiar de idioma sin romper a QC-35.

import { describe, expect, it, vi } from 'vitest'

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import {
  DuplicateOrderNumberError,
  InvalidTransitionError,
  OrderNotFoundError,
  RecipeNotFoundError,
  ValidationError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderStatus } from '@/lib/modules/pedidos/domain/order-classification'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'

// QC-74: el actor lleva PERMISOS, no el nombre del rol (R18). Los dos codigos de `pedidos`,
// porque este archivo ejercita lecturas y escrituras con el mismo fixture.
const ADMIN: Actor = { id: 'admin-1', permissions: ['pedidos.consultar', 'pedidos.modificar'] }

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const OTRA_RECETA = '44444444-4444-4444-8444-444444444444'

/** Un instante FIJO, con su ano en UTC: el correlativo y `created_at` tienen que salir del
 *  MISMO reloj (R10), y con un reloj real el test no podria afirmarlo. */
const AHORA = new Date('2026-09-04T12:00:00.000Z')

const RECETA_VIVA: RecipeRef = { id: RECIPE_ID, name: 'Acido citrico 50%', isDeleted: false }
const RECETA_DE_BAJA: RecipeRef = { id: RECIPE_ID, name: 'Formula retirada', isDeleted: true }
const OTRA_VIVA: RecipeRef = { id: OTRA_RECETA, name: 'Detergente neutro', isDeleted: false }
const OTRA_DE_BAJA: RecipeRef = { id: OTRA_RECETA, name: 'Formula vieja', isDeleted: true }
const ENTRADA_ALTA = {
  recipeId: RECIPE_ID,
  quantity: '10.0000',
}

function fila(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: ORDER_ID,
    number: { year: 2026, sequence: 7 },
    recipeId: RECIPE_ID,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    ...overrides,
  }
}

type Dobles = {
  readonly orders: OrderRepository
  readonly recipes: RecipeCatalog
  readonly now: () => Date
}

function dobles(opciones: {
  fila?: OrderRow | null
  recetas?: readonly RecipeRef[]
  alta?: OrderRow | 'duplicate_number'
  edicion?: 'ok' | 'not_found'
}): Dobles & {
  readonly create: ReturnType<typeof vi.fn>
  readonly findAliveById: ReturnType<typeof vi.fn>
  readonly updateAlive: ReturnType<typeof vi.fn>
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>
} {
  const create = vi.fn(async () => opciones.alta ?? fila())
  const findAliveById = vi.fn(async () => opciones.fila ?? null)
  const updateAlive = vi.fn(async () => opciones.edicion ?? 'ok')
  const findRefsIncludingDeleted = vi.fn(async () => opciones.recetas ?? [RECETA_VIVA])

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`)
    })

  const orders = {
    create,
    findAliveById,
    listAlive: explota('orders.listAlive'),
    updateAlive,
    cancelAlive: explota('orders.cancelAlive'),
    softDeleteAlive: explota('orders.softDeleteAlive'),
  } as unknown as OrderRepository

  return {
    orders,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    now: () => AHORA,
    create,
    findAliveById,
    updateAlive,
    findRefsIncludingDeleted,
  }
}

/** Ejecuta y devuelve el `code` del error de dominio. Falla si la operacion NO falla. */
async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('createOrder — alta (R8, R9, R10, R6, R15, R16)', () => {
  it('persiste el pedido y devuelve su identificador y su correlativo (R8, R14)', async () => {
    const d = dobles({ alta: fila({ number: { year: 2026, sequence: 42 } }) })

    const creado = await createCreateOrder(d)(ENTRADA_ALTA, ADMIN)

    expect(creado.id).toBe(ORDER_ID)
    expect(creado.number).toEqual({ year: 2026, sequence: 42 })
    // R14: el texto lo compone `formatOrderNumber`, la UNICA definicion del formato.
    expect(creado.numberText).toBe('2026-0000042')
  })

  it('nace en PENDIENTE y con prioridad BAJA si la entrada no la indica (R9)', async () => {
    const d = dobles({})

    await createCreateOrder(d)(ENTRADA_ALTA, ADMIN)

    expect(d.create).toHaveBeenCalledTimes(1)
    expect(d.create.mock.calls[0]?.[0]).toEqual({
      recipeId: RECIPE_ID,
      quantity: '10.0000',
      priority: 'BAJA',
      status: 'PENDIENTE',
    })
  })

  it('el ano del correlativo y el instante de creacion salen del MISMO reloj (R10)', async () => {
    const d = dobles({})

    await createCreateOrder(d)(ENTRADA_ALTA, ADMIN)

    const [, year, , instante] = d.create.mock.calls[0] as [unknown, number, string, Date]
    expect(year).toBe(AHORA.getUTCFullYear())
    expect(instante).toBe(AHORA)
    // Si el ano saliera de otro reloj, un alta del 31 de diciembre a las 23:59:59.999 UTC
    // chocaria contra el CHECK `orders_order_year_matches_created_at` de QC-33 R41.
    expect(year).toBe(new Date(instante).getUTCFullYear())
  })

  it('los DOS autores salen del actor y NUNCA de la entrada (R6, R9)', async () => {
    const d = dobles({})

    await createCreateOrder(d)(
      // Un cliente malicioso envia los autores, el estado y el correlativo: el esquema no los
      // declara, asi que `z.object` los descarta y no llegan al puerto.
      {
        ...ENTRADA_ALTA,
        createdBy: 'intruso',
        updatedBy: 'intruso',
        status: 'ENTREGADO',
        cancellationReason: 'colado',
        orderYear: 1999,
        orderSequence: 1,
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
      },
      ADMIN,
    )

    const [data, , actorId] = d.create.mock.calls[0] as [Record<string, unknown>, number, string]
    expect(actorId).toBe(ADMIN.id)
    expect(Object.keys(data).sort()).toEqual(['priority', 'quantity', 'recipeId', 'status'])
    expect(data.status).toBe('PENDIENTE')
  })

  it('rechaza una receta inexistente ANTES de llegar al repositorio (R15)', async () => {
    const d = dobles({ recetas: [] })

    expect(await codigoDelFallo(() => createCreateOrder(d)(ENTRADA_ALTA, ADMIN))).toBe(
      'recipe_not_found',
    )
    expect(d.create).not.toHaveBeenCalled()
    await expect(createCreateOrder(d)(ENTRADA_ALTA, ADMIN)).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    )
  })

  it('rechaza una receta DADA DE BAJA en el alta (R15)', async () => {
    const d = dobles({ recetas: [RECETA_DE_BAJA] })

    expect(await codigoDelFallo(() => createCreateOrder(d)(ENTRADA_ALTA, ADMIN))).toBe(
      'recipe_not_found',
    )
    expect(d.create).not.toHaveBeenCalled()
  })

  // QC-35bis (2026-09-07): aqui vivia «rechaza una unidad inexistente ANTES de llegar al
  // repositorio (R16)». No se ha relajado ninguna comprobacion: la unidad SALIO del pedido -del
  // esquema, del tipo y de la tabla-, asi que ya no hay entrada que rechazar ni catalogo que
  // consultar. R16 se quedo sin sujeto.

  it('una entrada invalida muere en zod, sin tocar los catalogos ni el repositorio', async () => {
    // R17: cantidad cero. La validacion va DESPUES de `requireAdmin` y ANTES de todo lo demas.
    const d = dobles({})

    expect(
      await codigoDelFallo(() =>
        createCreateOrder(d)({ ...ENTRADA_ALTA, quantity: '0.0000' }, ADMIN),
      ),
    ).toBe('invalid_input')
    expect(d.findRefsIncludingDeleted).not.toHaveBeenCalled()
    expect(d.create).not.toHaveBeenCalled()
    await expect(
      createCreateOrder(d)({ ...ENTRADA_ALTA, quantity: '0.0000' }, ADMIN),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('traduce el duplicado del correlativo a su error de dominio propio', async () => {
    // El `23505` del indice unico llega como resultado DISCRIMINADO, no como excepcion de
    // Prisma (`design.md > 4.2`).
    const d = dobles({ alta: 'duplicate_number' })

    expect(await codigoDelFallo(() => createCreateOrder(d)(ENTRADA_ALTA, ADMIN))).toBe(
      'duplicate_number',
    )
    await expect(createCreateOrder(d)(ENTRADA_ALTA, ADMIN)).rejects.toBeInstanceOf(
      DuplicateOrderNumberError,
    )
  })
})

describe('getOrder — ficha (R42, R43, R46, R29, R33)', () => {
  it('devuelve la ficha completa, con los nombres resueltos por los contratos (R42, R43)', async () => {
    const d = dobles({ fila: fila() })

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista).toEqual({
      id: ORDER_ID,
      number: { year: 2026, sequence: 7 },
      numberText: '2026-0000007',
      recipeId: RECIPE_ID,
      recipeName: 'Acido citrico 50%',
      quantity: '10.0000',
      priority: 'BAJA',
      status: 'PENDIENTE',
      cancellationReason: null,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
      // R46: los dos autores salen como IDENTIFICADORES; resolver sus nombres es de QC-35.
      createdBy: 'admin-0',
      updatedBy: 'admin-0',
    })
  })

  it('devuelve el motivo de un pedido cancelado (R29, R40)', async () => {
    const d = dobles({
      fila: fila({ status: 'CANCELADO', cancellationReason: 'El cliente anulo el pedido' }),
    })

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista.status).toBe('CANCELADO')
    expect(vista.cancellationReason).toBe('El cliente anulo el pedido')
  })

  it('un pedido inexistente o ya borrado responde order_not_found (R33, R40)', async () => {
    const d = dobles({ fila: null })

    expect(await codigoDelFallo(() => createGetOrder(d)(ORDER_ID, ADMIN))).toBe(
      'order_not_found',
    )
    await expect(createGetOrder(d)(ORDER_ID, ADMIN)).rejects.toBeInstanceOf(OrderNotFoundError)
  })
})

describe('updateOrder — edicion (R20, R21, R22, R24, R25, R33)', () => {
  const EDICION = { ...ENTRADA_ALTA, priority: 'ALTA', status: 'EN_CURSO' }

  it('reemplaza el conjunto completo y registra al actor como autor de la modificacion (R20, R6)', async () => {
    const d = dobles({ fila: fila() })

    await createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN)

    expect(d.updateAlive).toHaveBeenCalledTimes(1)
    const [id, data, actorId, instante] = d.updateAlive.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
      Date,
    ]
    expect(id).toBe(ORDER_ID)
    expect(data).toEqual({
      recipeId: RECIPE_ID,
      quantity: '10.0000',
      priority: 'ALTA',
      status: 'EN_CURSO',
    })
    expect(actorId).toBe(ADMIN.id)
    expect(instante).toBe(AHORA)
    // El autor de la CREACION no viaja en la edicion: no esta en `data` y el puerto solo
    // recibe un `actorId`, que el adaptador escribe en `updated_by` (R6).
    expect(Object.keys(data)).not.toContain('createdBy')
  })

  it('un pedido ENTREGADO no admite NINGUNA edicion, ni la que solo cambia la prioridad (R21)', async () => {
    const d = dobles({ fila: fila({ status: 'ENTREGADO' }) })

    // Misma receta, misma cantidad, mismo estado: solo sube la prioridad. Igual se rechaza.
    const codigo = await codigoDelFallo(() =>
      createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, priority: 'CRITICA', status: 'ENTREGADO' }, ADMIN),
    )

    expect(codigo).toBe('invalid_transition')
    expect(d.updateAlive).not.toHaveBeenCalled()
    // Y ni siquiera se pregunto a los catalogos: la edicion muere en la tabla de transiciones.
    expect(d.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })

  it('un pedido CANCELADO tampoco admite edicion (R21)', async () => {
    const d = dobles({ fila: fila({ status: 'CANCELADO', cancellationReason: 'anulado' }) })

    expect(await codigoDelFallo(() => createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN))).toBe(
      'invalid_transition',
    )
    expect(d.updateAlive).not.toHaveBeenCalled()
  })

  it('acepta las tres transiciones hacia delante y quedarse igual (R22)', async () => {
    const validas: readonly (readonly [OrderStatus, string])[] = [
      ['PENDIENTE', 'PENDIENTE'],
      ['PENDIENTE', 'EN_CURSO'],
      ['PENDIENTE', 'ENTREGADO'],
      ['EN_CURSO', 'EN_CURSO'],
      ['EN_CURSO', 'ENTREGADO'],
    ]

    for (const [desde, hacia] of validas) {
      const d = dobles({ fila: fila({ status: desde }) })
      await createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, status: hacia }, ADMIN)
      expect(d.updateAlive, `${desde} -> ${hacia}`).toHaveBeenCalledTimes(1)
    }
  })

  it('rechaza el retroceso sin modificar ninguna fila (R22)', async () => {
    const d = dobles({ fila: fila({ status: 'EN_CURSO' }) })

    expect(
      await codigoDelFallo(() =>
        createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, status: 'PENDIENTE' }, ADMIN),
      ),
    ).toBe('invalid_transition')
    expect(d.updateAlive).not.toHaveBeenCalled()
    await expect(
      createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, status: 'PENDIENTE' }, ADMIN),
    ).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('la edicion no puede cancelar: CANCELADO muere en el borde (R24)', async () => {
    const d = dobles({ fila: fila() })

    expect(
      await codigoDelFallo(() =>
        createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, status: 'CANCELADO' }, ADMIN),
      ),
    ).toBe('invalid_input')
    // Ni siquiera se leyo la fila: el esquema lo rechazo antes.
    expect(d.findAliveById).not.toHaveBeenCalled()
    expect(d.updateAlive).not.toHaveBeenCalled()
  })

  it('la edicion tampoco acepta un motivo: el campo no existe en su esquema (R24, R26)', async () => {
    const d = dobles({ fila: fila() })

    await createUpdateOrder(d)(ORDER_ID, { ...EDICION, reason: 'me lo invento' }, ADMIN)

    const [, data] = d.updateAlive.mock.calls[0] as [string, Record<string, unknown>]
    expect(Object.keys(data)).not.toContain('reason')
    expect(Object.keys(data)).not.toContain('cancellationReason')
  })

  it('acepta editar un pedido cuya receta esta dada de baja SI no la cambia (R25)', async () => {
    // La receta que el pedido ya tenia se admite tal cual: corregir la cantidad de un pedido
    // viejo no puede obligar a cambiarle la formula. Y ni se pregunta por ella.
    const d = dobles({ fila: fila({ recipeId: RECIPE_ID }), recetas: [RECETA_DE_BAJA] })

    await createUpdateOrder(d)(ORDER_ID, { ...EDICION, recipeId: RECIPE_ID }, ADMIN)

    expect(d.updateAlive).toHaveBeenCalledTimes(1)
    expect(d.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })

  it('rechaza CAMBIAR la receta a una dada de baja, igual que en el alta (R25, R15)', async () => {
    const d = dobles({ fila: fila({ recipeId: RECIPE_ID }), recetas: [OTRA_DE_BAJA] })

    expect(
      await codigoDelFallo(() =>
        createUpdateOrder(d)(ORDER_ID, { ...EDICION, recipeId: OTRA_RECETA }, ADMIN),
      ),
    ).toBe('recipe_not_found')
    expect(d.updateAlive).not.toHaveBeenCalled()
  })

  it('acepta cambiar la receta a otra VIVA (R25)', async () => {
    const d = dobles({ fila: fila({ recipeId: RECIPE_ID }), recetas: [OTRA_VIVA] })

    await createUpdateOrder(d)(ORDER_ID, { ...EDICION, recipeId: OTRA_RECETA }, ADMIN)

    expect(d.findRefsIncludingDeleted).toHaveBeenCalledWith([OTRA_RECETA])
    expect(d.updateAlive).toHaveBeenCalledTimes(1)
  })

  // QC-35bis (2026-09-07): aqui vivia «la unidad se exige SIEMPRE, aunque no cambie (R16)»,
  // la contraparte en la EDICION del caso del alta. Cayo por lo mismo: no hay unidad en el
  // pedido, y la excepcion de R25 -la receta de baja se acepta si no cambia- sigue con su test
  // intacto justo encima.

  it('editar un pedido inexistente o ya borrado responde order_not_found (R33)', async () => {
    const d = dobles({ fila: null })

    expect(await codigoDelFallo(() => createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN))).toBe(
      'order_not_found',
    )
    expect(d.updateAlive).not.toHaveBeenCalled()
  })

  it('si la fila desaparece entre la lectura y la escritura, tambien responde order_not_found (R33)', async () => {
    const d = dobles({ fila: fila(), edicion: 'not_found' })

    expect(await codigoDelFallo(() => createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN))).toBe(
      'order_not_found',
    )
  })
})
