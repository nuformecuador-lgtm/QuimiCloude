// QC-60 T16 — El rechazo cruzado EN EL SERVICE, con dobles (R16, R20, R21, R22, R27, R28).
//
// `docs/architecture.md > Acceso a datos y autorizacion`: Prisma conecta como dueno de las tablas
// y no setea claims, asi que ninguna policy de RLS filtra nada. La frontera es el caso de uso. Este
// archivo prueba esa frontera SIN base: la integracion contra Postgres (T13) prueba que el `where`
// filtra de verdad; aqui se prueba lo que el caso de uso DECIDE y lo que PASA al puerto.
//
// DOS CLASES DE DOBLE, a proposito:
//
//   - Un ALMACEN EN MEMORIA con pedidos de DOS empresas, que se comporta como el adaptador promete
//     (`null` / `'not_found'` para lo ajeno) y que registra lo que se escribe. «No modifica ninguna
//     fila» (R21) solo se demuestra mirando lo que QUEDA, no contando llamadas.
//   - Espias sobre cada metodo, porque la otra mitad -que el ambito que llega al puerto es el DEL
//     ACTOR y no uno sacado de la entrada (R16)- solo se ve en los argumentos.
//
// NUNCA `unauthorized` ante lo ajeno (`design.md > 9`). Distinguir «no puedes» de «no existe» sobre
// datos de otra empresa es un ORACULO DE EXISTENCIA: quien sondea identificadores aprenderia que
// pedidos tienen las demas. Por eso no basta con `toBeInstanceOf(OrderNotFoundError)`: se compara
// el error del pedido ajeno con el de un identificador que NO EXISTE y se exige que sean
// indistinguibles -misma clase, mismo `code`, mismo mensaje-.
//
// Todas las afirmaciones de error van sobre la CLASE y el `code` estable, nunca sobre el texto.

import { describe, expect, it, vi } from 'vitest'

import { createCancelOrder } from '@/lib/modules/pedidos/domain/cancel-order'
import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import {
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import { createAssignResponsibles } from '@/lib/modules/asignaciones/domain/assign-responsibles'
import { OrderNotFoundError as AsignacionesOrderNotFoundError } from '@/lib/modules/asignaciones/domain/errors'
import { createListOrderResponsibles } from '@/lib/modules/asignaciones/domain/list-order-responsibles'
import { createRemoveWorkGroupFromOrder } from '@/lib/modules/asignaciones/domain/remove-work-group-from-order'
import { createUnassignResponsible } from '@/lib/modules/asignaciones/domain/unassign-responsible'

import type { Actor as AsignacionesActor } from '@/lib/modules/asignaciones/domain/actor'
import type { OrderAssignmentRepository } from '@/lib/modules/asignaciones/ports/order-assignment-repository'
import type { PeopleDirectory, WorkGroupDirectory } from '@/lib/modules/identity'
import type { OrderAssignmentTarget, OrderCatalog } from '@/lib/modules/pedidos'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderScope } from '@/lib/modules/pedidos/domain/order-scope'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderTransactionScope, OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

import { fakeFinishedGoodsIntake, fakeOrderUnitOfWork, fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

const EMPRESA_A = '33333333-3333-4333-8333-333333333333'
const EMPRESA_B = '44444444-4444-4444-8444-444444444444'

const PEDIDO_DE_A = '11111111-1111-4111-8111-111111111111'
const PEDIDO_DE_B = '12121212-1212-4212-8212-121212121212'
/** Un identificador que no existe en NINGUNA empresa: la referencia contra la que se mide que lo
 *  ajeno sea indistinguible de lo inexistente. */
const PEDIDO_INEXISTENTE = '19999999-9999-4999-8999-999999999999'

const RECETA = '22222222-2222-4222-8222-222222222222'
const USUARIO = '55555555-5555-4555-8555-555555555555'
const GRUPO = '66666666-6666-4666-8666-666666666666'

const TODOS_LOS_PERMISOS = ['pedidos.consultar', 'pedidos.modificar']

/** Actor de la empresa A con los dos permisos de `pedidos`. */
const ACTOR_A: Actor = { id: 'u-a', companyId: EMPRESA_A, permissions: TODOS_LOS_PERMISOS }

const PRESENTACION = '77777777-7777-4777-8777-777777777777'

const ENTRADA_ALTA = { recipeId: RECETA, quantity: '10.0000', presentationId: PRESENTACION }
const ENTRADA_EDICION = { ...ENTRADA_ALTA, status: 'EN_CURSO' }

function fila(id: string): OrderRow {
  return {
    id,
    number: { year: 2026, sequence: 7 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'u-0',
    updatedBy: 'u-0',
    presentationId: null,
    presentationContent: null,
  }
}

type Guardado = {
  readonly row: OrderRow
  readonly companyId: string
  status: OrderRow['status']
  deleted: boolean
  touchedBy: string | null
}

/**
 * Almacen con UN pedido de A y UNO de B. Cada metodo hace lo que el adaptador promete: lo que no es
 * de la empresa del ambito vuelve como `null` / `'not_found'` y NO se toca.
 */
function almacen() {
  const filas = new Map<string, Guardado>([
    [PEDIDO_DE_A, { row: fila(PEDIDO_DE_A), companyId: EMPRESA_A, status: 'PENDIENTE', deleted: false, touchedBy: null }],
    [PEDIDO_DE_B, { row: fila(PEDIDO_DE_B), companyId: EMPRESA_B, status: 'PENDIENTE', deleted: false, touchedBy: null }],
  ])
  const altas: { companyId: string }[] = []

  const visible = (id: string, scope: OrderScope): Guardado | null => {
    const guardado = filas.get(id)
    if (guardado === undefined || guardado.deleted) return null
    return guardado.companyId === scope.companyId ? guardado : null
  }

  // Lectura (`OrderRepository`): sale FUERA de la unidad de trabajo.
  const findAliveById = vi.fn(async (id: string, scope: OrderScope) => {
    const guardado = visible(id, scope)
    return guardado === null ? null : { ...guardado.row, status: guardado.status }
  })
  // La aridad refleja la del puerto: el ambito se lee del ultimo argumento.
  const listAlive = vi.fn(async (_query: unknown, _recipeIds: readonly string[] | null, scope: OrderScope) => {
    const items = [...filas.values()]
      .filter((g) => !g.deleted && g.companyId === scope.companyId)
      .map((g) => g.row)
    return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1 }
  })
  const orders = { findAliveById, listAlive }

  // Escritura (`OrderWriteRepository`): solo dentro de `unitOfWork.run`.
  const lockAliveById = vi.fn(async (id: string, scope: OrderScope) => {
    const guardado = visible(id, scope)
    return guardado === null ? null : { ...guardado.row, status: guardado.status }
  })
  const create = vi.fn(async (_data: unknown, _year: number, _actorId: string, _now: Date, _ingredientsCost: string | null, scope: OrderScope) => {
    altas.push({ companyId: scope.companyId })
    return fila('13131313-1313-4313-8313-131313131313')
  })
  const updateAlive = vi.fn(async (id: string, _data: unknown, actorId: string, _now: Date, _ingredientsCost: string | null, scope: OrderScope) => {
    const guardado = visible(id, scope)
    if (guardado === null) return 'not_found' as const
    guardado.touchedBy = actorId
    return 'ok' as const
  })
  const cancelAlive = vi.fn(async (id: string, _reason: string, actorId: string, _now: Date, scope: OrderScope) => {
    const guardado = visible(id, scope)
    if (guardado === null) return 'not_found' as const
    guardado.status = 'CANCELADO'
    guardado.touchedBy = actorId
    return 'ok' as const
  })
  const softDeleteAlive = vi.fn(async (id: string, actorId: string, _now: Date, scope: OrderScope) => {
    const guardado = visible(id, scope)
    if (guardado === null) return 'not_found' as const
    guardado.deleted = true
    guardado.touchedBy = actorId
    return 'ok' as const
  })
  const setReservedAt = vi.fn(async () => undefined)
  const writeOrders = { lockAliveById, create, updateAlive, cancelAlive, softDeleteAlive, setReservedAt }

  // Reservas de `inventario`: no forman parte de lo que este archivo mide -el ambito de ESE
  // puerto es otro archivo-, asi que aparta y libera sin tocar el almacen de pedidos.
  const syncForOrder = vi.fn(async () => ({ kind: 'reserved' as const }))
  const releaseForOrder = vi.fn(async () => undefined)
  const consumeForOrder = vi.fn(async () => ({ kind: 'consumed' as const }))
  const reservations = { syncForOrder, releaseForOrder, consumeForOrder }

  const recipes = {
    findRefsIncludingDeleted: vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => ({ id, name: 'Acido citrico 50%', isDeleted: false })),
    ),
    // Receta SIN lineas: este archivo prueba el ambito, no el calculo del importe.
    findExecutionContentById: vi.fn(async (id: string) => ({
      id,
      name: 'Acido citrico 50%',
      isDeleted: false,
      steps: [],
      lines: [],
    })),
  }

  const unitOfWork = fakeOrderUnitOfWork({
    orders: writeOrders as unknown as OrderTransactionScope['orders'],
    reservations: reservations as unknown as OrderTransactionScope['reservations'],
    recipes: recipes as unknown as OrderTransactionScope['recipes'],
    // Ningun caso de este archivo llega a ENTREGADO: ninguno espera que se llame.
    finishedGoods: fakeFinishedGoodsIntake(),
  })
  const products = { findRefs: vi.fn(async () => []), findCostingBatches: vi.fn(async () => []) }
  const units = {
    findRefs: vi.fn(async () => []),
    findRefsSharingBaseInCompany: vi.fn(async () => []),
  }
  const presentations = {
    findRefs: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id, name: 'Bidon' }))),
  }
  const log = { ignoredFields: vi.fn() }

  /** Lo que se puede afirmar despues: el estado de cada fila, tal cual quedo. */
  const foto = () =>
    [...filas.entries()].map(([id, g]) => ({
      id,
      companyId: g.companyId,
      status: g.status,
      deleted: g.deleted,
      touchedBy: g.touchedBy,
    }))

  return {
    orders: orders as unknown as OrderRepository,
    unitOfWork,
    // Los espias del puerto DE PEDIDOS -lectura y escritura-, con nombre, para que
    // `llamadasAlPuerto` los recorra igual que antes. Los de `reservations` quedan fuera: su
    // ambito -otro puerto, otro modulo- no es lo que este archivo mide aqui.
    espias: { findAliveById, listAlive, ...writeOrders },
    recipes: recipes as unknown as RecipeCatalog,
    products: products as unknown as ProductCatalog,
    units: units as unknown as UnitCatalog,
    presentations: presentations as unknown as PresentationCatalog,
    log,
    altas,
    foto,
  }
}

type Almacen = ReturnType<typeof almacen>

/** Los seis casos de uso cableados contra un almacen. */
function casosDeUso(a: Almacen) {
  const now = () => new Date('2026-09-15T10:00:00.000Z')
  return {
    createOrder: createCreateOrder({ recipes: a.recipes, products: a.products, units: a.units, presentations: a.presentations, unitOfWork: a.unitOfWork, now }),
    getOrder: createGetOrder({ orders: a.orders, recipes: a.recipes, presentations: a.presentations }),
    listOrders: createListOrders({ orders: a.orders, recipes: a.recipes, presentations: a.presentations, log: a.log }),
    updateOrder: createUpdateOrder({ orders: a.orders, recipes: a.recipes, products: a.products, units: a.units, presentations: a.presentations, unitOfWork: a.unitOfWork, now }),
    cancelOrder: createCancelOrder({ orders: a.orders, unitOfWork: a.unitOfWork, now }),
    deleteOrder: createDeleteOrder({ orders: a.orders, unitOfWork: a.unitOfWork, now }),
  }
}

/** Todas las llamadas de todos los metodos del puerto, con el nombre del metodo. */
function llamadasAlPuerto(a: Almacen): readonly (readonly [string, readonly unknown[]])[] {
  return Object.entries(a.espias).flatMap(([metodo, espia]) =>
    espia.mock.calls.map((args) => [metodo, args as readonly unknown[]] as const),
  )
}

async function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => null,
    (error: unknown) => error,
  )
}

/** Las cuatro operaciones que apuntan a UN pedido por su identificador. */
const SOBRE_UN_PEDIDO = [
  ['getOrder', (c: ReturnType<typeof casosDeUso>, id: string, actor: Actor) => c.getOrder(id, actor)],
  [
    'updateOrder',
    (c: ReturnType<typeof casosDeUso>, id: string, actor: Actor) =>
      c.updateOrder(id, ENTRADA_EDICION, actor),
  ],
  [
    'cancelOrder',
    (c: ReturnType<typeof casosDeUso>, id: string, actor: Actor) =>
      c.cancelOrder(id, { reason: 'sin stock' }, actor),
  ],
  ['deleteOrder', (c: ReturnType<typeof casosDeUso>, id: string, actor: Actor) => c.deleteOrder(id, actor)],
] as const

describe('QC-60 R16 — los seis casos de uso pasan al puerto el ambito DEL ACTOR', () => {
  it('cada llamada al puerto de los seis lleva exactamente `{ companyId: actor.companyId }` como ultimo argumento', async () => {
    const a = almacen()
    const c = casosDeUso(a)

    await c.createOrder(ENTRADA_ALTA, ACTOR_A)
    await c.getOrder(PEDIDO_DE_A, ACTOR_A)
    await c.listOrders({ page: 1 }, ACTOR_A)
    await c.updateOrder(PEDIDO_DE_A, ENTRADA_EDICION, ACTOR_A)
    await c.cancelOrder(PEDIDO_DE_A, { reason: 'sin stock' }, ACTOR_A)
    // El pedido de A esta cancelado tras la linea anterior y no se podria borrar: se borra el
    // mismo pedido desde un almacen nuevo, que es lo que importa aqui (la firma de la llamada).
    const b = almacen()
    await casosDeUso(b).deleteOrder(PEDIDO_DE_A, ACTOR_A)

    const llamadas = [...llamadasAlPuerto(a), ...llamadasAlPuerto(b)]
    // Los ocho metodos se ejercitaron: sin esto, un metodo que nadie llamo pasaria el bucle.
    // `lockAliveById` y `setReservedAt` son nuevos -la escritura vive dentro de
    // `unitOfWork.run`-, y el ambito les llega igual que a los seis de siempre.
    expect(new Set(llamadas.map(([metodo]) => metodo))).toEqual(
      new Set([
        'create',
        'findAliveById',
        'listAlive',
        'lockAliveById',
        'updateAlive',
        'cancelAlive',
        'softDeleteAlive',
        'setReservedAt',
      ]),
    )
    for (const [metodo, args] of llamadas) {
      // `toStrictEqual`: ni una clave mas. Un ambito con campos de sobra seria un ambito que
      // alguien empezo a construir con cosas de la entrada.
      expect(args[args.length - 1], `${metodo}: el ambito es el del actor`).toStrictEqual({
        companyId: EMPRESA_A,
      })
    }
  })

  it('el alta con la empresa de OTRA en la entrada resuelve, escribe en la empresa del actor y no pasa la empresa de la entrada al puerto', async () => {
    // La empresa que se escribe es la del actor. La que traiga la entrada se descarta como
    // cualquier clave desconocida del alta: ni se escribe, ni se tiene en cuenta, ni provoca un
    // rechazo.
    const a = almacen()
    const c = casosDeUso(a)

    await expect(
      c.createOrder({ ...ENTRADA_ALTA, companyId: EMPRESA_B, company_id: EMPRESA_B }, ACTOR_A),
    ).resolves.toBeDefined()

    expect(a.espias.create).toHaveBeenCalledTimes(1)
    const args = a.espias.create.mock.calls[0] as unknown as readonly unknown[]
    expect(args[args.length - 1], 'ambito que llega a create').toStrictEqual({ companyId: EMPRESA_A })

    const datos = args[0]
    expect(typeof datos === 'object' && datos !== null, 'los datos del alta son un objeto').toBe(true)
    expect(datos, 'los datos del alta no llevan companyId').not.toHaveProperty('companyId')
    expect(datos, 'los datos del alta no llevan company_id').not.toHaveProperty('company_id')
    expect(JSON.stringify(args), 'la empresa de la entrada llego al puerto').not.toContain(EMPRESA_B)

    expect(a.altas, 'la fila dada de alta es de la empresa del actor').toEqual([{ companyId: EMPRESA_A }])
  })

  it('la empresa que llega en la entrada de la edicion o del listado no cambia el ambito ni viaja al puerto', async () => {
    const a = almacen()
    const c = casosDeUso(a)

    const conEmpresa = { companyId: EMPRESA_B, company_id: EMPRESA_B }
    const resultados = await Promise.all([
      capturar(c.updateOrder(PEDIDO_DE_A, { ...ENTRADA_EDICION, ...conEmpresa }, ACTOR_A)),
      capturar(
        c.listOrders(
          { page: 1, ...conEmpresa, filters: { companyId: { kind: 'select', values: [EMPRESA_B] } } },
          ACTOR_A,
        ),
      ),
    ])

    const [errorDeEdicion, errorDeListado] = resultados
    expect(errorDeEdicion, 'la edicion resuelve').toBeNull()
    // El listado rechaza un filtro por una columna que no ofrece; si lo acepta, el ambito sigue
    // siendo el del actor.
    if (errorDeListado !== null) expect(errorDeListado).toBeInstanceOf(ValidationError)
    expect(JSON.stringify(llamadasAlPuerto(a)), 'la empresa de la entrada llego al puerto').not.toContain(
      EMPRESA_B,
    )
    for (const [metodo, args] of llamadasAlPuerto(a)) {
      expect(args[args.length - 1], metodo).toStrictEqual({ companyId: EMPRESA_A })
    }
  })
})

describe('QC-138 R38 — bloquear al crear o editar solo toca la empresa de quien escribe', () => {
  function conReservaInsuficiente(a: Almacen) {
    const setStatus = vi.fn(async (...args: unknown[]) => {
      void args
      return 'ok' as const
    })
    const setIngredientsCost = vi.fn(async (...args: unknown[]) => {
      void args
      return 'ok' as const
    })
    const { unitOfWork } = fakeUnitOfWork({
      orders: {
        lockAliveById: a.espias.lockAliveById,
        create: a.espias.create,
        updateAlive: a.espias.updateAlive,
        setReservedAt: a.espias.setReservedAt,
        setStatus,
        setIngredientsCost,
      } as never,
      reservations: { syncForOrder: vi.fn(async () => ({ kind: 'insufficient' as const, productIds: ['p'] })) },
    })
    const now = () => new Date('2026-09-15T10:00:00.000Z')
    const deps = {
      orders: a.orders,
      recipes: a.recipes,
      products: a.products,
      units: a.units,
      presentations: a.presentations,
      unitOfWork,
      now,
    }
    return { createOrder: createCreateOrder(deps), updateOrder: createUpdateOrder(deps), setStatus }
  }

  it('R38: crear y editar bloqueado pasan el ambito del actor a setStatus', async () => {
    const a = almacen()
    const c = conReservaInsuficiente(a)

    await c.createOrder({ ...ENTRADA_ALTA, confirmBlocked: true, companyId: EMPRESA_B }, ACTOR_A)
    await c.updateOrder(PEDIDO_DE_A, { ...ENTRADA_ALTA, confirmBlocked: true, companyId: EMPRESA_B }, ACTOR_A)

    expect(c.setStatus).toHaveBeenCalledTimes(2)
    for (const args of c.setStatus.mock.calls) {
      expect(args[args.length - 1]).toStrictEqual({ companyId: EMPRESA_A })
    }
  })

  it('R38: editar con confirmacion un pedido de OTRA empresa -> order_not_found y no se bloquea', async () => {
    const a = almacen()
    const c = conReservaInsuficiente(a)

    const error = await capturar(c.updateOrder(PEDIDO_DE_B, { ...ENTRADA_ALTA, confirmBlocked: true }, ACTOR_A))

    expect(error).toBeInstanceOf(OrderNotFoundError)
    expect(c.setStatus).not.toHaveBeenCalled()
    expect(a.foto().find((f) => f.id === PEDIDO_DE_B)?.status).toBe('PENDIENTE')
  })
})

describe('QC-60 R20, R21 — lo AJENO responde igual que lo INEXISTENTE, y no se toca', () => {
  for (const [nombre, invocar] of SOBRE_UN_PEDIDO) {
    it(`${nombre}: un pedido de OTRA empresa -> OrderNotFoundError, NUNCA UnauthorizedError, e indistinguible de un id que no existe`, async () => {
      const ajeno = almacen()
      const antes = ajeno.foto()
      const errorAjeno = await capturar(invocar(casosDeUso(ajeno), PEDIDO_DE_B, ACTOR_A))

      expect(errorAjeno, nombre).toBeInstanceOf(OrderNotFoundError)
      expect(errorAjeno, `${nombre}: oraculo de existencia`).not.toBeInstanceOf(UnauthorizedError)
      expect((errorAjeno as OrderNotFoundError).code).toBe('order_not_found')

      // INDISTINGUIBLE de lo que no existe: misma clase, mismo `code`, mismo mensaje.
      const inexistente = almacen()
      const errorInexistente = await capturar(
        invocar(casosDeUso(inexistente), PEDIDO_INEXISTENTE, ACTOR_A),
      )
      expect(errorInexistente).toBeInstanceOf(OrderNotFoundError)
      expect({
        clase: (errorAjeno as Error).constructor.name,
        code: (errorAjeno as OrderNotFoundError).code,
        message: (errorAjeno as Error).message,
      }).toEqual({
        clase: (errorInexistente as Error).constructor.name,
        code: (errorInexistente as OrderNotFoundError).code,
        message: (errorInexistente as Error).message,
      })

      // R21: NINGUNA fila cambio, ni la de B ni la de A.
      expect(ajeno.foto()).toEqual(antes)
      // Y no se llego a ninguna ESCRITURA: el rechazo es sobre la lectura, en el service.
      expect(ajeno.espias.updateAlive).not.toHaveBeenCalled()
      expect(ajeno.espias.cancelAlive).not.toHaveBeenCalled()
      expect(ajeno.espias.softDeleteAlive).not.toHaveBeenCalled()
      expect(ajeno.espias.create).not.toHaveBeenCalled()
    })

    it(`${nombre}: CONTROL POSITIVO -con el MISMO almacen, el pedido propio si se alcanza`, async () => {
      // Sin esto, un almacen que respondiera `null` a todo pondria verde el caso de arriba.
      const a = almacen()
      expect(await capturar(invocar(casosDeUso(a), PEDIDO_DE_A, ACTOR_A))).toBeNull()
    })
  }

  it('R20: la ficha de un pedido ajeno no devuelve NI UN dato de la fila', async () => {
    const a = almacen()
    const error = await capturar(casosDeUso(a).getOrder(PEDIDO_DE_B, ACTOR_A))
    const serializado = JSON.stringify({ ...(error as object), message: (error as Error).message })
    expect(serializado).not.toContain(PEDIDO_DE_B)
    expect(serializado).not.toContain('2026-0000007')
    expect(serializado).not.toContain('PENDIENTE')
    // Ni se pregunto por la receta de una fila que no se debia ver.
    expect(a.recipes.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })

  it('R19 (lado service): el listado de A no trae el pedido de B', async () => {
    const a = almacen()
    const page = await casosDeUso(a).listOrders({ page: 1 }, ACTOR_A)
    expect(page.items.map((item) => item.id)).toEqual([PEDIDO_DE_A])
    expect(page.total).toBe(1)
  })
})

describe('QC-60 R16, R28 — el PERMISO se exige ANTES que el ambito', () => {
  /** Dobles que EXPLOTAN: con permiso denegado no se puede tocar nada. */
  function explosivos() {
    const explota = (nombre: string) =>
      vi.fn(() => {
        throw new Error(`${nombre} no debe llamarse sin permiso`)
      })
    const orders = {
      findAliveById: explota('findAliveById'),
      listAlive: explota('listAlive'),
    }
    const unitOfWork = { run: explota('unitOfWork.run') }
    const recipes = {
      findRefsIncludingDeleted: explota('findRefsIncludingDeleted'),
      findExecutionContentById: explota('findExecutionContentById'),
    }
    const products = {
      findRefs: explota('products.findRefs'),
      findCostingBatches: explota('products.findCostingBatches'),
    }
    const units = {
      findRefs: explota('units.findRefs'),
      findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
    }
    const presentations = { findRefs: explota('presentations.findRefs') }
    const log = { ignoredFields: explota('ignoredFields') }
    const deps = {
      orders: orders as unknown as OrderRepository,
      unitOfWork: unitOfWork as unknown as OrderUnitOfWork,
      recipes: recipes as unknown as RecipeCatalog,
      products: products as unknown as ProductCatalog,
      units: units as unknown as UnitCatalog,
      presentations: presentations as unknown as PresentationCatalog,
      log,
    }
    return {
      deps,
      espias: [
        ...Object.values(orders),
        unitOfWork.run,
        ...Object.values(recipes),
        ...Object.values(products),
        ...Object.values(units),
        ...Object.values(presentations),
        log.ignoredFields,
      ],
    }
  }

  const SEIS = [
    ['createOrder', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createCreateOrder(d)(ENTRADA_ALTA, actor)],
    ['getOrder', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createGetOrder(d)(PEDIDO_DE_A, actor)],
    ['listOrders', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createListOrders(d)({ page: 1 }, actor)],
    ['updateOrder', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createUpdateOrder(d)(PEDIDO_DE_A, ENTRADA_EDICION, actor)],
    ['cancelOrder', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createCancelOrder(d)(PEDIDO_DE_A, { reason: 'x' }, actor)],
    ['deleteOrder', (d: ReturnType<typeof explosivos>['deps'], actor: Actor) => createDeleteOrder(d)(PEDIDO_DE_A, actor)],
  ] as const

  for (const [nombre, invocar] of SEIS) {
    it(`${nombre}: actor SIN permiso Y de OTRA empresa -> UnauthorizedError sin tocar ningun puerto`, async () => {
      // Si el ambito se evaluara primero, este actor recibiria `order_not_found` y el orden de las
      // comprobaciones quedaria al reves de lo que R16 exige. El error de permiso gana.
      const { deps, espias } = explosivos()
      const intruso: Actor = { id: 'u-b', companyId: EMPRESA_B, permissions: ['otro.permiso'] }
      const error = await capturar(invocar(deps, intruso))
      expect(error, nombre).toBeInstanceOf(UnauthorizedError)
      expect((error as UnauthorizedError).code).toBe('unauthorized')
      for (const espia of espias) expect(espia, nombre).not.toHaveBeenCalled()
    })
  }

  it('la empresa NO AUTORIZA por si sola: ser de la empresa del pedido sin el permiso no abre nada', async () => {
    const { deps, espias } = explosivos()
    const mismaEmpresaSinPermiso: Actor = { id: 'u-a2', companyId: EMPRESA_A, permissions: [] }
    for (const [nombre, invocar] of SEIS) {
      const error = await capturar(invocar(deps, mismaEmpresaSinPermiso))
      expect(error, nombre).toBeInstanceOf(UnauthorizedError)
    }
    for (const espia of espias) expect(espia).not.toHaveBeenCalled()
  })
})

describe('R8: una presentación de otra empresa se rechaza como inexistente', () => {
  /** Catalogo que solo devuelve la presentacion cuando la empresa pedida coincide con la suya,
   *  igual que el contrato real de `inventario`. */
  function presentacionesDe(companyId: string) {
    return {
      findRefs: vi.fn(async (ids: readonly string[], solicitante: string) =>
        solicitante === companyId ? ids.map((id) => ({ id, name: 'Bidon' })) : [],
      ),
    } as unknown as PresentationCatalog
  }

  it('createOrder: la presentación es de la empresa B y el actor es de A -> presentation_not_found, sin crear', async () => {
    const a = almacen()
    const presentations = presentacionesDe(EMPRESA_B)
    const createOrder = createCreateOrder({
      recipes: a.recipes,
      products: a.products,
      units: a.units,
      presentations,
      unitOfWork: a.unitOfWork,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    })

    const error = await capturar(createOrder(ENTRADA_ALTA, ACTOR_A))
    expect((error as Error).constructor.name).toBe('PresentationNotFoundError')
    expect((error as { code: string }).code).toBe('presentation_not_found')
    expect(a.espias.create).not.toHaveBeenCalled()
  })

  it('updateOrder: la presentación es de la empresa B y el actor es de A -> presentation_not_found, sin modificar', async () => {
    const a = almacen()
    const presentations = presentacionesDe(EMPRESA_B)
    const updateOrder = createUpdateOrder({
      orders: a.orders,
      recipes: a.recipes,
      products: a.products,
      units: a.units,
      presentations,
      unitOfWork: a.unitOfWork,
      now: () => new Date('2026-09-15T10:00:00.000Z'),
    })

    const error = await capturar(updateOrder(PEDIDO_DE_A, ENTRADA_EDICION, ACTOR_A))
    expect((error as Error).constructor.name).toBe('PresentationNotFoundError')
    expect((error as { code: string }).code).toBe('presentation_not_found')
    expect(a.espias.updateAlive).not.toHaveBeenCalled()
  })
})

describe('QC-60 R27 — `OrderCatalog` consultado desde `asignaciones` se acota a la empresa de quien pregunta', () => {
  const ASIG_ACTOR_B: AsignacionesActor = {
    id: 'u-b',
    companyId: EMPRESA_B,
    permissions: ['pedidos.consultar', 'asignaciones.modificar'],
  }

  /** Catalogo que cumple el contrato de `pedidos`: `null` para lo que no es de ESA empresa. */
  function catalogo() {
    const pedidos = new Map<string, { companyId: string; target: OrderAssignmentTarget }>([
      [PEDIDO_DE_A, { companyId: EMPRESA_A, target: { id: PEDIDO_DE_A, status: 'PENDIENTE' } }],
    ])
    const findAliveById = vi.fn(async (id: string, companyId: string) => {
      const pedido = pedidos.get(id)
      return pedido !== undefined && pedido.companyId === companyId ? pedido.target : null
    })
    const listAliveSummariesByIds = vi.fn(async () => {
      throw new Error('QC-88: este caso no ejercita el listado en lote')
    })
    return {
      orders: { findAliveById, listAliveSummariesByIds } as unknown as OrderCatalog,
      findAliveById,
    }
  }

  function explota(nombre: string) {
    return vi.fn(() => {
      throw new Error(`${nombre} no debe llamarse para un pedido ajeno`)
    })
  }

  function puertosQueNoSeTocan() {
    const assignments = {
      insertMissing: explota('insertMissing'),
      listByOrderInCompany: explota('listByOrderInCompany'),
      listByOrdersInCompany: explota('listByOrdersInCompany'),
      deleteOne: explota('deleteOne'),
      deleteByWorkGroup: explota('deleteByWorkGroup'),
    }
    const people = {
      findAliveRefsInCompany: explota('findAliveRefsInCompany'),
      findRefsIncludingDeletedInCompany: explota('findRefsIncludingDeletedInCompany'),
    }
    const groups = { findSnapshotAliveInCompany: explota('findSnapshotAliveInCompany') }
    return {
      assignments: assignments as unknown as OrderAssignmentRepository,
      people: people as unknown as PeopleDirectory,
      groups: groups as unknown as WorkGroupDirectory,
      espias: [...Object.values(assignments), ...Object.values(people), ...Object.values(groups)],
    }
  }

  const CUATRO = [
    [
      'listOrderResponsibles',
      (orders: OrderCatalog, p: ReturnType<typeof puertosQueNoSeTocan>, id: string) =>
        createListOrderResponsibles({ orders, assignments: p.assignments, people: p.people })(
          ASIG_ACTOR_B,
          id,
        ),
    ],
    [
      'assignResponsibles',
      (orders: OrderCatalog, p: ReturnType<typeof puertosQueNoSeTocan>, id: string) =>
        createAssignResponsibles({
          orders,
          assignments: p.assignments,
          people: p.people,
          groups: p.groups,
        })(ASIG_ACTOR_B, { orderId: id, userIds: [USUARIO], workGroupIds: [] }, new Date()),
    ],
    [
      'unassignResponsible',
      (orders: OrderCatalog, p: ReturnType<typeof puertosQueNoSeTocan>, id: string) =>
        createUnassignResponsible({ orders, assignments: p.assignments })(ASIG_ACTOR_B, {
          orderId: id,
          userId: USUARIO,
        }),
    ],
    [
      'removeWorkGroupFromOrder',
      (orders: OrderCatalog, p: ReturnType<typeof puertosQueNoSeTocan>, id: string) =>
        createRemoveWorkGroupFromOrder({ orders, assignments: p.assignments })(ASIG_ACTOR_B, {
          orderId: id,
          workGroupId: GRUPO,
        }),
    ],
  ] as const

  for (const [nombre, invocar] of CUATRO) {
    it(`${nombre}: el catalogo recibe la empresa DEL ACTOR y un pedido de otra empresa responde como inexistente, sin tocar nada mas`, async () => {
      const cat = catalogo()
      const p = puertosQueNoSeTocan()
      const errorAjeno = await capturar(invocar(cat.orders, p, PEDIDO_DE_A))

      expect(cat.findAliveById).toHaveBeenCalledWith(PEDIDO_DE_A, EMPRESA_B)
      expect(errorAjeno, nombre).toBeInstanceOf(AsignacionesOrderNotFoundError)
      expect((errorAjeno as AsignacionesOrderNotFoundError).code).toBe('order_not_found')
      for (const espia of p.espias) expect(espia, nombre).not.toHaveBeenCalled()

      // Igual que uno que no existe.
      const errorInexistente = await capturar(invocar(catalogo().orders, puertosQueNoSeTocan(), PEDIDO_INEXISTENTE))
      expect((errorInexistente as Error).constructor.name).toBe((errorAjeno as Error).constructor.name)
      expect((errorInexistente as AsignacionesOrderNotFoundError).code).toBe(
        (errorAjeno as AsignacionesOrderNotFoundError).code,
      )
      expect((errorInexistente as Error).message).toBe((errorAjeno as Error).message)
    })
  }
})
