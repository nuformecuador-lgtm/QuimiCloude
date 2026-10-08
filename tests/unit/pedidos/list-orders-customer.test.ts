// QC-156 B5 — El cliente en el listado de pedidos (R19-R26).
//
// Se CUENTAN las llamadas al catalogo de clientes: una sola por pagina con los ids sin repetir, y
// ninguna si la pagina no tiene clientes. Como en `list-orders.test.ts`, lo que se traduce a SQL
// (el filtro en la base) lo prueba la integracion; aqui, lo que decide el caso de uso.

import { describe, expect, it, vi } from 'vitest'

import { createListOrders, type ListOrdersDeps } from '@/lib/modules/pedidos/domain/list-orders'
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable'
import { fakePackagingCatalog } from '@/tests/helpers/packaging-catalog-double'

import type { CustomerRef } from '@/lib/modules/clientes'
import type { PresentationCatalog } from '@/lib/modules/inventario'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { ListQuery } from '@/lib/modules/pedidos/domain/list-query'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { Page } from '@/lib/modules/pedidos/domain/page'
import type { ListQueryLog } from '@/lib/modules/pedidos/ports/list-query-log'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const ACTOR: Actor = { id: 'u-1', companyId: EMPRESA, permissions: ['pedidos.consultar'] }
const RECETA = '22222222-2222-4222-8222-222222222222'

const CLIENTE_A = 'c0000000-0000-4000-8000-00000000000a'
const CLIENTE_B = 'c0000000-0000-4000-8000-00000000000b'
const CLIENTE_DE_BAJA = 'c0000000-0000-4000-8000-0000000000dd'

/** Datos personales que el doble devuelve DE MAS: si alguno llegara a la salida, se veria. */
const PII = { city: 'Valparaiso', phone: '+56 9 1234 5678', email: 'ana@example.com', address: 'Calle 1' }

const CLIENTES: readonly CustomerRef[] = [
  { id: CLIENTE_A, firstNames: 'Ana', lastNames: 'Perez', isDeleted: false, ...PII } as CustomerRef,
  { id: CLIENTE_B, firstNames: 'Luis', lastNames: 'Rojas', isDeleted: false, ...PII } as CustomerRef,
  { id: CLIENTE_DE_BAJA, firstNames: 'Eva', lastNames: 'Baja', isDeleted: true, ...PII } as CustomerRef,
]

const REF_RECETA: RecipeRef = {
  id: RECETA,
  name: 'Crema',
  ownName: 'Crema',
  isDeleted: false,
  isUnderReview: false,
  original: null,
}

let secuencia = 0
function fila(customerId: string | null): OrderRow {
  secuencia += 1
  return {
    id: `o-${secuencia}`,
    number: { year: 2026, sequence: secuencia },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationLines: [],
    unitId: null,
    customerId,
  }
}

function dobles(filas: readonly OrderRow[] = [], idsQueCasan: readonly string[] | null = null) {
  const listAlive = vi.fn(async (query: ListQuery, recipeIds: readonly string[] | null): Promise<Page<OrderRow>> => {
    void query
    void recipeIds
    return { items: filas, total: filas.length, page: 1, pageSize: 10, totalPages: 1 }
  })
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[]) => [REF_RECETA].filter((r) => ids.includes(r.id)))
  const findIdsMatchingName = vi.fn(async (search: string, companyId: string) => {
    void search
    void companyId
    return idsQueCasan
  })
  const findCustomerRefs = vi.fn(async (ids: readonly string[], companyId: string) => {
    void companyId
    return CLIENTES.filter((ref) => ids.includes(ref.id))
  })
  const ignoredFields = vi.fn<ListQueryLog['ignoredFields']>()
  const deps: ListOrdersDeps = {
    orders: { listAlive, findAliveById: vi.fn() } as unknown as OrderRepository,
    recipes: { findRefsIncludingDeleted, findIdsMatchingName } as unknown as RecipeCatalog,
    presentations: { findRefs: vi.fn(async () => []) } as unknown as PresentationCatalog,
    packaging: fakePackagingCatalog(),
    units: { findRefs: vi.fn(async () => []) } as unknown as UnitCatalog,
    customerCatalog: { findRefsIncludingDeleted: findCustomerRefs },
    log: { ignoredFields },
  }
  return { deps, listAlive, findCustomerRefs, findIdsMatchingName, ignoredFields, listOrders: createListOrders(deps) }
}

function consultaRecibida(d: ReturnType<typeof dobles>): ListQuery {
  const llamada = d.listAlive.mock.calls.at(-1)
  if (llamada === undefined) throw new Error('el puerto no fue llamado')
  return llamada[0]
}

function camposOmitidos(d: ReturnType<typeof dobles>): readonly string[] {
  return d.ignoredFields.mock.calls.flatMap(([, campos]) => [...campos])
}

describe('listOrders — el cliente de cada fila (R19, R20, R21)', () => {
  it('R21: una sola llamada al catalogo de clientes por pagina, con los ids sin repetir', async () => {
    const d = dobles([fila(CLIENTE_A), fila(CLIENTE_B), fila(CLIENTE_A), fila(null), fila(CLIENTE_B), fila(CLIENTE_A)])

    await d.listOrders({ page: 1 }, ACTOR)

    expect(d.findCustomerRefs).toHaveBeenCalledTimes(1)
    const [ids, companyId] = d.findCustomerRefs.mock.calls[0] ?? []
    expect([...(ids ?? [])].sort()).toEqual([CLIENTE_A, CLIENTE_B].sort())
    expect(companyId).toBe(EMPRESA)
  })

  it('R21: una pagina sin clientes no consulta el catalogo de clientes', async () => {
    const d = dobles([fila(null), fila(null)])

    const salida = await d.listOrders({ page: 1 }, ACTOR)

    expect(d.findCustomerRefs).not.toHaveBeenCalled()
    expect(salida.items.map((item) => item.customer)).toEqual([null, null])
  })

  it('R21: una pagina vacia no consulta el catalogo de clientes', async () => {
    const d = dobles([])

    await d.listOrders({ page: 1 }, ACTOR)

    expect(d.findCustomerRefs).not.toHaveBeenCalled()
  })

  it('R19 R20: cada fila trae id, nombre y marca de baja; el dado de baja llega con isDeleted', async () => {
    const d = dobles([fila(CLIENTE_A), fila(CLIENTE_DE_BAJA), fila(null)])

    const salida = await d.listOrders({ page: 1 }, ACTOR)

    expect(salida.items.map((item) => item.customer)).toEqual([
      { id: CLIENTE_A, name: 'Ana Perez', isDeleted: false },
      { id: CLIENTE_DE_BAJA, name: 'Eva Baja', isDeleted: true },
      null,
    ])
  })

  it('R19: la salida no lleva datos personales del cliente aunque el catalogo los trajera', async () => {
    const d = dobles([fila(CLIENTE_A)])

    const salida = await d.listOrders({ page: 1 }, ACTOR)

    const cliente = salida.items[0]?.customer
    expect(Object.keys(cliente ?? {}).sort()).toEqual(['id', 'isDeleted', 'name'])
    const texto = JSON.stringify(salida)
    for (const valor of Object.values(PII)) expect(texto).not.toContain(valor)
    for (const clave of ['city', 'phone', 'email', 'address']) expect(texto).not.toContain(`"${clave}"`)
  })

  it('R19: un id que no vuelve del catalogo se pinta sin cliente y la fila sigue saliendo', async () => {
    const borrado = 'c0000000-0000-4000-8000-000000000999'
    const d = dobles([fila(borrado)])

    const salida = await d.listOrders({ page: 1 }, ACTOR)

    expect(salida.items).toHaveLength(1)
    expect(salida.items[0]?.customer).toBeNull()
  })
})

describe('listOrders — el filtro por cliente (R23, R24)', () => {
  it('R23: customerId y customerPresence llegan juntos al puerto sin tocarse', async () => {
    const d = dobles()

    await d.listOrders(
      {
        page: 1,
        filters: {
          customerId: { kind: 'select', values: [CLIENTE_A, CLIENTE_B] },
          customerPresence: { kind: 'select', values: ['none'] },
          status: { kind: 'select', values: ['PENDIENTE'] },
        },
      },
      ACTOR,
    )

    expect(consultaRecibida(d).filters).toEqual({
      customerId: { kind: 'select', values: [CLIENTE_A, CLIENTE_B] },
      customerPresence: { kind: 'select', values: ['none'] },
      status: { kind: 'select', values: ['PENDIENTE'] },
    })
    expect(camposOmitidos(d)).toEqual([])
  })

  it('R24: los valores sin forma de uuid en customerId se podan y se anota solo el nombre del campo', async () => {
    const d = dobles()

    await d.listOrders(
      { page: 1, filters: { customerId: { kind: 'select', values: ['none', CLIENTE_A, 'Ana Perez'] } } },
      ACTOR,
    )

    expect(consultaRecibida(d).filters).toEqual({ customerId: { kind: 'select', values: [CLIENTE_A] } })
    expect(camposOmitidos(d)).toEqual(['customerId'])
    const registrado = JSON.stringify(d.ignoredFields.mock.calls)
    expect(registrado).not.toContain('Ana Perez')
    expect(registrado).not.toContain('none')
  })

  it('R24: si a customerId no le queda ningun valor, el filtro desaparece', async () => {
    const d = dobles()

    await d.listOrders({ page: 1, filters: { customerId: { kind: 'select', values: ['x', 'y'] } } }, ACTOR)

    expect(consultaRecibida(d).filters).toEqual({})
    expect(camposOmitidos(d)).toEqual(['customerId'])
  })

  it('R24: valores distintos de none en customerPresence se podan; con la lista vacia el filtro desaparece', async () => {
    const parcial = dobles()
    await parcial.listOrders(
      { page: 1, filters: { customerPresence: { kind: 'select', values: ['none', 'any', 'NONE'] } } },
      ACTOR,
    )
    expect(consultaRecibida(parcial).filters).toEqual({ customerPresence: { kind: 'select', values: ['none'] } })
    expect(camposOmitidos(parcial)).toEqual(['customerPresence'])

    const vacio = dobles()
    await vacio.listOrders({ page: 1, filters: { customerPresence: { kind: 'select', values: ['some'] } } }, ACTOR)
    expect(consultaRecibida(vacio).filters).toEqual({})
    expect(camposOmitidos(vacio)).toEqual(['customerPresence'])
  })

  it('R24: un filtro de cliente con otra forma que select se omite como campo de forma equivocada', async () => {
    const d = dobles()

    await d.listOrders({ page: 1, filters: { customerId: { kind: 'text', value: CLIENTE_A } } }, ACTOR)

    expect(consultaRecibida(d).filters).toEqual({})
    expect(camposOmitidos(d)).toEqual(['customerId'])
  })
})

describe('listOrders — busqueda y orden (R25, R26)', () => {
  it('R25: la busqueda va solo al catalogo de recetas; el de clientes no recibe el termino', async () => {
    const d = dobles([], [])

    await d.listOrders({ page: 1, search: 'Ana Perez' }, ACTOR)

    expect(d.findIdsMatchingName).toHaveBeenCalledWith('Ana Perez', EMPRESA)
    expect(d.findCustomerRefs).not.toHaveBeenCalled()
    expect(d.listAlive.mock.calls[0]?.[1]).toEqual([])
    expect(consultaRecibida(d).filters).toEqual({})
  })

  it('R26: el cliente no es ordenable; pedir orden por customerId se omite y se anota', async () => {
    expect(ORDER_QUERYABLE.sortable.filter((campo) => /customer/i.test(campo))).toEqual([])

    const d = dobles()
    await d.listOrders({ page: 1, sort: { columnId: 'customerId', direction: 'asc' } }, ACTOR)

    expect(consultaRecibida(d).sort).toBeNull()
    expect(camposOmitidos(d)).toEqual(['customerId'])
  })
})
