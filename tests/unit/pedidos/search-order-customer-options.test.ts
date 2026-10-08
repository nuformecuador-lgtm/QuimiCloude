// QC-156 B4 — Opciones del autocompletado de cliente y opcion del filtro (R27, R28, R29).
//
// El catalogo de clientes es un doble: lo que se prueba aqui es lo que decide el caso de uso
// (permiso, `includeDeleted`, mapeo a `OrderCustomer`). La paginacion, el orden y la busqueda sin
// acentos son del adaptador de `clientes` y tienen su test de integracion.

import { describe, expect, it, vi } from 'vitest'

import { createGetOrderCustomerFilterOption } from '@/lib/modules/pedidos/domain/get-order-customer-filter-option'
import { createSearchOrderCustomers } from '@/lib/modules/pedidos/domain/search-order-customer-options'

import type { CustomerRef, CustomerRefSearch } from '@/lib/modules/clientes'
import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { PedidosError } from '@/lib/modules/pedidos/domain/errors'
import type { OrderCustomerSearchPurpose } from '@/lib/modules/pedidos/domain/order-customer'
import type { Page } from '@/lib/modules/pedidos/domain/page'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const AMBOS: Actor = { id: 'u-1', companyId: EMPRESA, permissions: ['pedidos.consultar', 'pedidos.modificar'] }

const VIVO: CustomerRef = { id: 'c0000000-0000-4000-8000-00000000000a', firstNames: 'Ana', lastNames: 'Perez', isDeleted: false }
const DE_BAJA: CustomerRef = { id: 'c0000000-0000-4000-8000-0000000000dd', firstNames: 'Eva', lastNames: 'Baja', isDeleted: true }

function catalogo(items: readonly CustomerRef[] = [VIVO, DE_BAJA]) {
  const searchRefs = vi.fn(
    async (query: CustomerRefSearch, companyId: string): Promise<Page<CustomerRef>> => {
      void companyId
      const visibles = query.includeDeleted ? items : items.filter((ref) => !ref.isDeleted)
      return { items: visibles, total: visibles.length, page: query.page, pageSize: query.pageSize ?? 10, totalPages: 1 }
    },
  )
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[], companyId: string) => {
    void companyId
    return items.filter((ref) => ids.includes(ref.id))
  })
  return { searchRefs, findRefsIncludingDeleted }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('searchOrderCustomers — includeDeleted segun purpose (R27, R28)', () => {
  it('R27: para el filtro incluye los dados de baja, marcados, y pasa la empresa del actor', async () => {
    const c = catalogo()

    const pagina = await createSearchOrderCustomers({ customerCatalog: c })({ search: 'ana', page: 2, pageSize: 25 }, 'filter', AMBOS)

    expect(c.searchRefs).toHaveBeenCalledTimes(1)
    expect(c.searchRefs).toHaveBeenCalledWith({ search: 'ana', includeDeleted: true, page: 2, pageSize: 25 }, EMPRESA)
    expect(pagina.items).toEqual([
      { id: VIVO.id, name: 'Ana Perez', isDeleted: false },
      { id: DE_BAJA.id, name: 'Eva Baja', isDeleted: true },
    ])
    expect(pagina).toMatchObject({ total: 2, page: 2, pageSize: 25, totalPages: 1 })
  })

  it('R28: para asignar pide solo los vivos', async () => {
    const c = catalogo()

    const pagina = await createSearchOrderCustomers({ customerCatalog: c })({ search: '', page: 1 }, 'assign', AMBOS)

    expect(c.searchRefs).toHaveBeenCalledWith({ search: '', includeDeleted: false, page: 1, pageSize: undefined }, EMPRESA)
    expect(pagina.items).toEqual([{ id: VIVO.id, name: 'Ana Perez', isDeleted: false }])
  })

  it('R27: la entrada vacia toma busqueda vacia y pagina 1', async () => {
    const c = catalogo()

    await createSearchOrderCustomers({ customerCatalog: c })({}, 'filter', AMBOS)

    expect(c.searchRefs).toHaveBeenCalledWith({ search: '', includeDeleted: true, page: 1, pageSize: undefined }, EMPRESA)
  })

  it('R27: la respuesta nunca trae una opcion «Sin cliente», ni sin termino ni con «sin cliente»', async () => {
    for (const search of ['', 'sin', 'sin cliente', 'Sín CLIENTE']) {
      for (const purpose of ['filter', 'assign'] as const) {
        const c = catalogo()
        const pagina = await createSearchOrderCustomers({ customerCatalog: c })({ search, page: 1 }, purpose, AMBOS)
        const delCatalogo = (await c.searchRefs.mock.results[0]?.value) as Page<CustomerRef>
        expect(pagina.items.map((item) => item.id)).toEqual(delCatalogo.items.map((ref) => ref.id))
        expect(pagina.items.map((item) => item.name)).not.toContain('Sin cliente')
        expect(pagina.total).toBe(delCatalogo.total)
      }
    }
  })

  it('R6: un purpose desconocido exige pedidos.modificar (falla cerrado) y luego es invalid_input', async () => {
    const c = catalogo()
    const soloConsultar: Actor = { ...AMBOS, permissions: ['pedidos.consultar'] }
    const desconocido = 'todo' as unknown as OrderCustomerSearchPurpose

    expect(await codigoDelFallo(() => createSearchOrderCustomers({ customerCatalog: c })({}, desconocido, soloConsultar))).toBe(
      'unauthorized',
    )
    expect(await codigoDelFallo(() => createSearchOrderCustomers({ customerCatalog: c })({}, desconocido, AMBOS))).toBe(
      'invalid_input',
    )
    expect(c.searchRefs).not.toHaveBeenCalled()
  })

  it('R27: una entrada con forma invalida o con claves de mas es invalid_input y no consulta', async () => {
    const c = catalogo()
    const buscar = createSearchOrderCustomers({ customerCatalog: c })

    for (const entrada of [
      { page: 0 },
      { page: 1.5 },
      { pageSize: 0 },
      { search: 'x'.repeat(121) },
      { search: 3 },
      { search: '', includeDeleted: true },
      { search: '', companyId: EMPRESA },
      null,
    ]) {
      expect(await codigoDelFallo(() => buscar(entrada, 'assign', AMBOS)), JSON.stringify(entrada)).toBe('invalid_input')
    }
    expect(c.searchRefs).not.toHaveBeenCalled()
  })
})

describe('getOrderCustomerFilterOption — el cliente que trae la direccion (R29)', () => {
  it('R29: devuelve el cliente de la empresa, tambien dado de baja, con una sola llamada', async () => {
    const c = catalogo()
    const opcion = createGetOrderCustomerFilterOption({ customerCatalog: c })

    expect(await opcion(DE_BAJA.id, AMBOS)).toEqual({ id: DE_BAJA.id, name: 'Eva Baja', isDeleted: true })
    expect(c.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    expect(c.findRefsIncludingDeleted).toHaveBeenCalledWith([DE_BAJA.id], EMPRESA)
  })

  it('R29: un id que no vuelve del catalogo (otra empresa o inexistente) devuelve null', async () => {
    const c = catalogo([])

    expect(await createGetOrderCustomerFilterOption({ customerCatalog: c })(VIVO.id, AMBOS)).toBeNull()
  })

  it('R24 R29: un id sin forma de uuid devuelve null sin consultar', async () => {
    const c = catalogo()
    const opcion = createGetOrderCustomerFilterOption({ customerCatalog: c })

    for (const id of ['none', '', 'abc', `${VIVO.id}0`]) {
      expect(await opcion(id, AMBOS)).toBeNull()
    }
    expect(c.findRefsIncludingDeleted).not.toHaveBeenCalled()
  })
})
