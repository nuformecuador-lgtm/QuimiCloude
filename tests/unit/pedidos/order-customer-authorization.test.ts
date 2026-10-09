// QC-156 B4 — Autorizacion de las operaciones con cliente (R6, R7, R8).
//
// Matriz operacion x actor. TODOS los dobles fallan si se les llama: una operacion rechazada
// tiene que rechazarse sin haber leido ni escrito nada. Una operacion autorizada se reconoce
// porque llega a tocar un puerto (y el doble la hace fallar con su propio mensaje, nunca con
// `unauthorized`).

import { describe, expect, it, vi } from 'vitest'

import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { UnauthorizedError } from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createGetOrderCustomerFilterOption } from '@/lib/modules/pedidos/domain/get-order-customer-filter-option'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createSearchOrderCustomers } from '@/lib/modules/pedidos/domain/search-order-customer-options'
import { createSetOrderCustomer } from '@/lib/modules/pedidos/domain/set-order-customer'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { CustomerCatalog } from '@/lib/modules/clientes'
import type { PackagingCatalog, PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { ListQueryLog } from '@/lib/modules/pedidos/ports/list-query-log'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { OrderUnitOfWork } from '@/lib/modules/pedidos/ports/order-unit-of-work'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECETA = '22222222-2222-4222-8222-222222222222'
const UNIDAD = '77777777-7777-4777-8777-777777777777'
const CLIENTE = 'c0000000-0000-4000-8000-00000000000a'

const MENSAJE_DE_PUERTO = 'no debe llamarse sin autorizacion'

function dobles() {
  const espias: ReturnType<typeof vi.fn>[] = []
  const explota = (nombre: string) => {
    const espia = vi.fn(() => {
      throw new Error(`el puerto ${nombre} ${MENSAJE_DE_PUERTO}`)
    })
    espias.push(espia)
    return espia
  }
  const deps = {
    orders: { findAliveById: explota('orders.findAliveById'), listAlive: explota('orders.listAlive') } as unknown as OrderRepository,
    recipes: {
      findRefsIncludingDeleted: explota('recipes.findRefsIncludingDeleted'),
      findExecutionContentById: explota('recipes.findExecutionContentById'),
      findIdsMatchingName: explota('recipes.findIdsMatchingName'),
    } as unknown as RecipeCatalog,
    products: { findRefs: explota('products.findRefs'), findCostingBatches: explota('products.findCostingBatches') } as unknown as ProductCatalog,
    units: {
      findRefs: explota('units.findRefs'),
      findRefsSharingBaseInCompany: explota('units.findRefsSharingBaseInCompany'),
      findMassVolumeBridge: explota('units.findMassVolumeBridge'),
    } as unknown as UnitCatalog,
    presentations: { findRefs: explota('presentations.findRefs') } as unknown as PresentationCatalog,
    packaging: { findRefs: explota('packaging.findRefs'), findCostingBatches: explota('packaging.findCostingBatches') } as unknown as PackagingCatalog,
    unitOfWork: { run: explota('unitOfWork.run') } as unknown as OrderUnitOfWork,
    log: { ignoredFields: explota('log.ignoredFields') } as unknown as ListQueryLog,
    customerCatalog: {
      findRefsIncludingDeleted: explota('customerCatalog.findRefsIncludingDeleted'),
      findAliveRefById: explota('customerCatalog.findAliveRefById'),
      searchRefs: explota('customerCatalog.searchRefs'),
    } as unknown as CustomerCatalog,
  }
  return { deps, espias }
}

type Deps = ReturnType<typeof dobles>['deps']
type Operacion = (deps: Deps, actor: Actor | null) => Promise<unknown>

const ALTA = { recipeId: RECETA, quantity: '10', unitId: UNIDAD, customerId: CLIENTE }

const OPERACIONES: readonly (readonly [string, 'pedidos.modificar' | 'pedidos.consultar', Operacion])[] = [
  ['indicar cliente en el alta', 'pedidos.modificar', (d, a) => createCreateOrder(d)(ALTA, a)],
  ['indicar cliente en la edicion', 'pedidos.modificar', (d, a) => createUpdateOrder(d)(ORDER_ID, ALTA, a)],
  ['cambio de cliente', 'pedidos.modificar', (d, a) => createSetOrderCustomer(d)(ORDER_ID, { customerId: CLIENTE }, a)],
  ['opciones del selector', 'pedidos.modificar', (d, a) => createSearchOrderCustomers(d)({ search: '' }, 'assign', a)],
  ['listado sin filtro', 'pedidos.consultar', (d, a) => createListOrders(d)({ page: 1 }, a)],
  [
    'listado filtrado por cliente',
    'pedidos.consultar',
    (d, a) => createListOrders(d)({ page: 1, filters: { customerId: { kind: 'select', values: [CLIENTE] } } }, a),
  ],
  [
    'listado filtrado sin cliente',
    'pedidos.consultar',
    (d, a) => createListOrders(d)({ page: 1, filters: { customerPresence: { kind: 'select', values: ['none'] } } }, a),
  ],
  ['ficha', 'pedidos.consultar', (d, a) => createGetOrder(d)(ORDER_ID, a)],
  ['opciones del filtro', 'pedidos.consultar', (d, a) => createSearchOrderCustomers(d)({ search: '' }, 'filter', a)],
  ['opcion del filtro', 'pedidos.consultar', (d, a) => createGetOrderCustomerFilterOption(d)(CLIENTE, a)],
]

const ACTORES: readonly (readonly [string, Actor | null])[] = [
  ['sin actor', null],
  ['sin permisos', { id: 'u-0', companyId: EMPRESA, permissions: [] }],
  ['solo clientes.*', { id: 'u-1', companyId: EMPRESA, permissions: ['clientes.consultar', 'clientes.modificar'] }],
  ['solo pedidos.consultar', { id: 'u-2', companyId: EMPRESA, permissions: ['pedidos.consultar'] }],
  ['solo pedidos.modificar', { id: 'u-3', companyId: EMPRESA, permissions: ['pedidos.modificar'] }],
  ['ambos de pedidos, sin clientes.*', { id: 'u-4', companyId: EMPRESA, permissions: ['pedidos.consultar', 'pedidos.modificar'] }],
]

async function resultado(operacion: Operacion, deps: Deps, actor: Actor | null): Promise<unknown> {
  return operacion(deps, actor).then(
    () => null,
    (e: unknown) => e,
  )
}

describe('autorizacion de las operaciones con cliente (R6, R7, R8)', () => {
  for (const [nombre, permiso, operacion] of OPERACIONES) {
    for (const [quien, actor] of ACTORES) {
      const autorizado = actor !== null && actor.permissions.includes(permiso)
      const requisito = permiso === 'pedidos.modificar' ? 'R6' : 'R7'

      if (!autorizado) {
        it(`${requisito}: ${nombre} con ${quien} -> unauthorized sin tocar ningun puerto`, async () => {
          const { deps, espias } = dobles()

          const error = await resultado(operacion, deps, actor)

          expect(error).toBeInstanceOf(UnauthorizedError)
          expect(espias.filter((espia) => espia.mock.calls.length > 0)).toEqual([])
        })
      } else {
        it(`R8: ${nombre} con ${quien} -> autorizada sin ningun permiso de clientes`, async () => {
          const { deps, espias } = dobles()

          const error = await resultado(operacion, deps, actor)

          expect(error).not.toBeInstanceOf(UnauthorizedError)
          expect(String((error as Error | null)?.message)).toContain(MENSAJE_DE_PUERTO)
          expect(espias.some((espia) => espia.mock.calls.length > 0)).toBe(true)
        })
      }
    }
  }

  it('R8: ningun actor de la matriz que pasa necesita un permiso de clientes', () => {
    const autorizados = ACTORES.filter(([, actor]) => actor?.permissions.some((p) => p.startsWith('pedidos.')))
    for (const [, actor] of autorizados) {
      expect(actor?.permissions.some((p) => p.startsWith('clientes.'))).toBe(false)
    }
  })
})
