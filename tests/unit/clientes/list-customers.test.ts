// El caso de uso de listado de `clientes` con el CONTRATO GENERICO de consulta, con el
// repositorio y el log mockeados (`design.md > 5.4`). Cubre R26, R27, R28.

import { describe, expect, it, vi } from 'vitest'

import { createListCustomers } from '@/lib/modules/clientes/domain/list-customers'
import { ValidationError } from '@/lib/modules/clientes/domain/errors'
import { CUSTOMER_QUERYABLE } from '@/lib/modules/clientes/domain/customer-queryable'

import type { Actor } from '@/lib/modules/clientes/domain/actor'
import type { CustomerView } from '@/lib/modules/clientes/domain/customer-view'
import type { ListQuery } from '@/lib/modules/clientes/domain/list-query'
import type { Page } from '@/lib/modules/clientes/domain/page'
import type { CustomerRepository } from '@/lib/modules/clientes/ports/customer-repository'
import type { ListQueryLog } from '@/lib/modules/clientes/ports/list-query-log'

const ADMIN: Actor = {
  id: 'admin-1',
  companyId: '99999999-9999-4999-8999-999999999999',
  permissions: ['clientes.consultar', 'clientes.modificar'],
}

function paginaVacia(): Page<CustomerView> {
  return { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 }
}

function montar() {
  const listAlive = vi.fn<CustomerRepository['listAlive']>(async () => paginaVacia())
  const customers = {
    create: vi.fn<CustomerRepository['create']>(),
    findAliveById: vi.fn<CustomerRepository['findAliveById']>(),
    updateAlive: vi.fn<CustomerRepository['updateAlive']>(),
    softDeleteAlive: vi.fn<CustomerRepository['softDeleteAlive']>(),
    listAlive,
  } satisfies CustomerRepository
  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() }
  return { customers, listAlive, log, listCustomers: createListCustomers({ customers, log }) }
}

function consultaRecibida(recibidas: readonly (readonly [ListQuery, ...unknown[]])[]): ListQuery {
  const ultima = recibidas.at(-1)
  if (ultima === undefined) throw new Error('el puerto no fue llamado')
  return ultima[0]
}

describe('listCustomers', () => {
  it('R26 — rechaza pagina o tamano no enteros o menores que 1 sin leer del repositorio', async () => {
    const { listAlive, log, listCustomers } = montar()

    for (const entrada of [
      { page: 0 },
      { page: -1 },
      { page: 1.5 },
      { page: 1, pageSize: 0 },
      { page: 1, pageSize: -5 },
      { page: 1, pageSize: 2.5 },
    ]) {
      await expect(listCustomers(entrada, ADMIN)).rejects.toBeInstanceOf(ValidationError)
    }
    expect(listAlive).not.toHaveBeenCalled()
    expect(log.ignoredFields).not.toHaveBeenCalled()

    await listCustomers({}, ADMIN)
    expect(listAlive).toHaveBeenCalledTimes(1)
  })

  it('R27 — omite el campo no declarado sin fallar y registra solo su nombre', async () => {
    const { listAlive, log, listCustomers } = montar()

    const pagina = await listCustomers(
      { page: 1, sort: { columnId: 'deletedAt', direction: 'desc' } },
      ADMIN,
    )

    expect(pagina.items).toEqual([])
    expect(consultaRecibida(listAlive.mock.calls).sort).toBeNull()
    expect(log.ignoredFields).toHaveBeenCalledWith('customers', ['deletedAt'])

    // Nunca el valor buscado ni el del filtro, solo nombres.
    const TERMINO = 'maria del secreto'
    await listCustomers(
      { search: TERMINO, filters: { inventado: { kind: 'text', value: 'x' } } },
      ADMIN,
    )
    const ultimaLlamada = JSON.stringify(vi.mocked(log.ignoredFields).mock.calls.at(-1))
    expect(ultimaLlamada).toContain('inventado')
    expect(ultimaLlamada).not.toContain(TERMINO)
  })

  it('R28 — solo son ordenables y filtrables los campos declarados, nunca deletedAt ni companyId', async () => {
    expect(CUSTOMER_QUERYABLE.sortable).toEqual([
      'firstNames',
      'lastNames',
      'city',
      'createdAt',
      'updatedAt',
    ])
    expect(CUSTOMER_QUERYABLE.filterable).toEqual({ city: 'text', createdAt: 'dateRange' })
    expect(CUSTOMER_QUERYABLE.sortable).not.toContain('deletedAt')
    expect(CUSTOMER_QUERYABLE.sortable).not.toContain('companyId')
    expect(Object.keys(CUSTOMER_QUERYABLE.filterable)).not.toContain('deletedAt')
    expect(Object.keys(CUSTOMER_QUERYABLE.filterable)).not.toContain('companyId')

    const { listAlive, listCustomers } = montar()
    await listCustomers(
      {
        sort: { columnId: 'companyId', direction: 'asc' },
        filters: { deletedAt: { kind: 'dateRange', from: null, to: null } },
      },
      ADMIN,
    )
    const query = consultaRecibida(listAlive.mock.calls)
    expect(query.sort).toBeNull()
    expect(query.filters).toEqual({})
  })
})
