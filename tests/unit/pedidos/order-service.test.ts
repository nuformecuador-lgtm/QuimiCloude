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
  InvalidTransitionError,
  DuplicateOrderNumberError,
  OrderNotFoundError,
  RecipeNotFoundError,
  ValidationError,
  type PedidosError,
} from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

// QC-74: el actor lleva PERMISOS, no el nombre del rol (R18). Los dos codigos de `pedidos`,
// porque este archivo ejercita lecturas y escrituras con el mismo fixture.
// QC-60 (R16): el `Actor` de `pedidos` lleva la EMPRESA desde esta ficha.
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: '33333333-3333-4333-8333-333333333333',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}

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
const PRESENTATION_ID = '66666666-6666-4666-8666-666666666666'

const ENTRADA_ALTA = {
  recipeId: RECIPE_ID,
  quantity: '10.0000',
  presentationId: PRESENTATION_ID,
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
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationId: PRESENTATION_ID,
    ...overrides,
  }
}

type Dobles = {
  readonly orders: OrderRepository
  readonly recipes: RecipeCatalog
  readonly products: ProductCatalog
  readonly units: UnitCatalog
  readonly presentations: PresentationCatalog
  readonly unitOfWork: ReturnType<typeof fakeUnitOfWork>['unitOfWork']
  readonly now: () => Date
}

function dobles(opciones: {
  fila?: OrderRow | null
  recetas?: readonly RecipeRef[]
  alta?: OrderRow
  edicion?: 'ok' | 'not_found'
  presentaciones?: readonly { readonly id: string; readonly name: string }[]
}): Dobles & {
  readonly create: ReturnType<typeof vi.fn>
  readonly findAliveById: ReturnType<typeof vi.fn>
  readonly lockAliveById: ReturnType<typeof vi.fn>
  readonly updateAlive: ReturnType<typeof vi.fn>
  readonly findRefsIncludingDeleted: ReturnType<typeof vi.fn>
  readonly findPresentationRefs: ReturnType<typeof vi.fn>
} {
  const create = vi.fn(async () => opciones.alta ?? fila())
  const filaVista = opciones.fila === undefined ? null : opciones.fila
  const findAliveById = vi.fn(async () => filaVista)
  const lockAliveById = vi.fn(async () => (filaVista === null ? null : { ...filaVista, reservedAt: null }))
  const updateAlive = vi.fn(async () => opciones.edicion ?? 'ok')
  const findRefsIncludingDeleted = vi.fn(async () => opciones.recetas ?? [RECETA_VIVA])
  const findPresentationRefs = vi.fn(
    async (ids: readonly string[]) =>
      opciones.presentaciones ??
      (ids.includes(PRESENTATION_ID) ? [{ id: PRESENTATION_ID, name: 'Bidon 20L' }] : []),
  )
  // Receta SIN lineas: este archivo no ejercita el calculo del importe, y sin lineas el
  // resultado siempre es `null` sin necesidad de mas dobles.
  const findExecutionContentById = vi.fn(async () => ({
    id: RECIPE_ID,
    name: 'Acido citrico 50%',
    isDeleted: false,
    steps: [],
    lines: [],
  }))

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse en este caso`)
    })

  const orders = {
    findAliveById,
    listAlive: explota('orders.listAlive'),
  } as unknown as OrderRepository

  const setReservedAt = vi.fn(async () => undefined)
  const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }))
  const { unitOfWork } = fakeUnitOfWork({
    orders: { lockAliveById, create, updateAlive, setReservedAt },
    reservations: { syncForOrder },
  })

  return {
    orders,
    recipes: { findRefsIncludingDeleted, findExecutionContentById } as unknown as RecipeCatalog,
    products: { findRefs: vi.fn(async () => []), findCostingBatches: vi.fn(async () => []) } as unknown as ProductCatalog,
    units: {
      findRefs: vi.fn(async () => []),
      findRefsSharingBaseInCompany: vi.fn(async () => []),
    } as unknown as UnitCatalog,
    presentations: { findRefs: findPresentationRefs } as unknown as PresentationCatalog,
    unitOfWork,
    now: () => AHORA,
    create,
    findAliveById,
    lockAliveById,
    updateAlive,
    findRefsIncludingDeleted,
    findPresentationRefs,
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
      presentationId: PRESENTATION_ID,
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
    expect(Object.keys(data).sort()).toEqual(['presentationId', 'priority', 'quantity', 'recipeId', 'status'])
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

  // El `23505` del correlativo ya NO se traduce aqui. `OrderWriteRepository.create` lo deja
  // SUBIR, y quien reintenta con una transaccion nueva es `OrderUnitOfWork`; agotados los tres
  // intentos, la excepcion de Prisma sube sin traducir. Lo prueba
  // `tests/integration/pedidos/order-unit-of-work.int.test.ts`, contra Postgres real.
})

describe('getOrder — ficha (R42, R43, R46, R29, R33)', () => {
  it('R23: la ficha devuelve id y nombre de la presentacion, con los nombres resueltos por los contratos (R42, R43)', async () => {
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
      ingredientsCost: null,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
      // R46: los dos autores salen como IDENTIFICADORES; resolver sus nombres es de QC-35.
      createdBy: 'admin-0',
      updatedBy: 'admin-0',
      // R23: la ficha devuelve id y nombre de la presentacion, resueltos por el contrato.
      presentationId: PRESENTATION_ID,
      presentationName: 'Bidon 20L',
    })
  })

  it('R23: un pedido sin presentacion devuelve su ausencia, sin consultar el catalogo', async () => {
    const d = dobles({ fila: fila({ presentationId: null }) })

    const vista = await createGetOrder(d)(ORDER_ID, ADMIN)

    expect(vista.presentationId).toBeNull()
    expect(vista.presentationName).toBeNull()
    expect(d.findPresentationRefs).not.toHaveBeenCalled()
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

// QC-123 T7 — la ficha y el listado devuelven el importe TAL COMO ESTA GUARDADO (R14): ninguno
// de los dos lo calcula, solo lo leen de la fila que ya trajo el puerto.
describe('lecturas — el importe se devuelve a quien tiene pedidos.consultar (R14)', () => {
  it('la ficha y el listado devuelven el importe a quien tiene pedidos.consultar (R14)', async () => {
    const CON_IMPORTE = fila({ ingredientsCost: '1234.5600' })

    const dFicha = dobles({ fila: CON_IMPORTE })
    const vista = await createGetOrder(dFicha)(ORDER_ID, ADMIN)
    expect(vista.ingredientsCost).toBe('1234.5600')

    // El listado se monta con dobles propios: `dobles()` de este archivo hace explotar
    // `orders.listAlive` a proposito porque no es el caso de uso que ejercita este fichero.
    const listAlive = vi.fn(async () => ({
      items: [CON_IMPORTE],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }))
    const orders = {
      findAliveById: vi.fn(),
      listAlive,
    } as unknown as OrderRepository
    const findRefsIncludingDeleted = vi.fn(async () => [RECETA_VIVA])
    const findIdsMatchingName = vi.fn(async (): Promise<readonly string[] | null> => null)
    const log = { ignoredFields: vi.fn() }

    const pagina = await createListOrders({
      orders,
      recipes: { findRefsIncludingDeleted, findIdsMatchingName } as unknown as RecipeCatalog,
      presentations: { findRefs: vi.fn(async () => []) } as unknown as PresentationCatalog,
      log,
    })({ page: 1 }, ADMIN)

    expect(pagina.items[0]?.ingredientsCost).toBe('1234.5600')
  })
})

describe('updateOrder — edicion (R6, R8, R9, R20, R21, R22, R24, R25, R33)', () => {
  const EDICION = { ...ENTRADA_ALTA, priority: 'ALTA' }

  // ENMIENDA. Antes, la edicion escribia el `status` de la entrada y `assertTransition` comparaba
  // `row.status` contra `data.status`: una edicion podia mover el pedido hacia delante. Ahora la
  // edicion NUNCA mueve el estado: `updateOrderSchema` ya no declara `status` -lo descarta como
  // cualquier clave desconocida- y la guardia compara `row.status` contra si mismo, asi que solo
  // importa si el pedido YA es final.

  it('reemplaza el conjunto completo y registra al actor como autor de la modificacion (R20); un `status` en la entrada se descarta (R6)', async () => {
    const d = dobles({ fila: fila() })

    await createUpdateOrder(d)(ORDER_ID, { ...EDICION, status: 'EN_CURSO' }, ADMIN)

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
      presentationId: PRESENTATION_ID,
    })
    expect(actorId).toBe(ADMIN.id)
    expect(instante).toBe(AHORA)
    // El autor de la CREACION no viaja en la edicion: no esta en `data` y el puerto solo
    // recibe un `actorId`, que el adaptador escribe en `updated_by` (R6).
    expect(Object.keys(data)).not.toContain('createdBy')
    expect(Object.keys(data)).not.toContain('status')
  })

  it('un pedido ENTREGADO no admite NINGUNA edicion, ni la que solo cambia la prioridad (R8, R21)', async () => {
    const d = dobles({ fila: fila({ status: 'ENTREGADO' }) })

    // Misma receta, misma cantidad: solo sube la prioridad. Igual se rechaza.
    const codigo = await codigoDelFallo(() =>
      createUpdateOrder(d)(ORDER_ID, { ...ENTRADA_ALTA, priority: 'CRITICA' }, ADMIN),
    )

    expect(codigo).toBe('invalid_transition')
    expect(d.updateAlive).not.toHaveBeenCalled()
    // Y ni siquiera se pregunto a los catalogos: la edicion muere en la tabla de transiciones.
    expect(d.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })

  it('un pedido CANCELADO tampoco admite edicion (R8, R21)', async () => {
    const d = dobles({ fila: fila({ status: 'CANCELADO', cancellationReason: 'anulado' }) })

    expect(await codigoDelFallo(() => createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN))).toBe(
      'invalid_transition',
    )
    expect(d.updateAlive).not.toHaveBeenCalled()
  })

  it('un pedido PENDIENTE o EN_CURSO admite la edicion, y su estado no cambia (R9, R22)', async () => {
    for (const desde of ['PENDIENTE', 'EN_CURSO'] as const) {
      const d = dobles({ fila: fila({ status: desde }) })
      await createUpdateOrder(d)(ORDER_ID, EDICION, ADMIN)
      expect(d.updateAlive, desde).toHaveBeenCalledTimes(1)
      const [, data] = d.updateAlive.mock.calls[0] as [string, Record<string, unknown>]
      expect(data, desde).not.toHaveProperty('status')
    }
  })

  it('un `status` en la entrada nunca decide el resultado: solo importa el estado que YA tenia la fila (R6)', async () => {
    for (const statusPedido of ['PENDIENTE', 'EN_CURSO', 'ENTREGADO', 'CANCELADO']) {
      const d = dobles({ fila: fila({ status: 'PENDIENTE' }) })
      await createUpdateOrder(d)(ORDER_ID, { ...EDICION, status: statusPedido }, ADMIN)
      expect(d.updateAlive, `status pedido=${statusPedido}`).toHaveBeenCalledTimes(1)
    }
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

    // QC-50 (T11): `findRefsIncludingDeleted` gana la empresa del actor como
    // segundo argumento, para que el catalogo de recetas nunca busque fuera del ambito de quien
    // pide el cambio. Se compara contra `ADMIN.companyId`, la empresa del propio actor de este
    // test, no una constante suelta: lo que se prueba es que el ambito llega hasta la costura.
    expect(d.findRefsIncludingDeleted).toHaveBeenCalledWith([OTRA_RECETA], ADMIN.companyId)
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
