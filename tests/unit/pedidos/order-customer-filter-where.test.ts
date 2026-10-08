// Traduccion de los dos filtros de cliente del listado -`customerId` y `customerPresence`- a UN
// solo termino del `where`. La prueba contra la base vive en
// `tests/integration/pedidos/order-customer.int.test.ts`.

import { describe, expect, it } from 'vitest'

import {
  buildOrderWhere,
  orderCustomerFilterWhere,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import type { ListQuery } from '@/lib/modules/pedidos/domain/list-query'

const CLIENTE_1 = '11111111-1111-4111-8111-111111111111'
const CLIENTE_2 = '22222222-2222-4222-8222-222222222222'
const EMPRESA = '33333333-3333-4333-8333-333333333333'

function consulta(filters: ListQuery['filters']): ListQuery {
  return { page: 1, pageSize: 10, sort: null, filters, search: '' }
}

describe('orderCustomerFilterWhere: la tabla de los dos campos (R23, R24)', () => {
  it('R23: solo `customerId` -> `customerId IN (...)`', () => {
    expect(
      orderCustomerFilterWhere({ kind: 'select', values: [CLIENTE_1, CLIENTE_2] }, undefined),
    ).toEqual({ customerId: { in: [CLIENTE_1, CLIENTE_2] } })
  })

  it('R24: solo `customerPresence: [none]` -> `customerId IS NULL`', () => {
    expect(orderCustomerFilterWhere(undefined, { kind: 'select', values: ['none'] })).toEqual({
      customerId: null,
    })
  })

  it('R24: los dos a la vez -> la union, en un solo `OR`', () => {
    expect(
      orderCustomerFilterWhere(
        { kind: 'select', values: [CLIENTE_1] },
        { kind: 'select', values: ['none'] },
      ),
    ).toEqual({ OR: [{ customerId: { in: [CLIENTE_1] } }, { customerId: null }] })
  })

  it('R24: sin ninguno, con listas vacias o con otra forma, no hay termino', () => {
    expect(orderCustomerFilterWhere(undefined, undefined)).toBeNull()
    expect(
      orderCustomerFilterWhere({ kind: 'select', values: [] }, { kind: 'select', values: [] }),
    ).toBeNull()
    expect(orderCustomerFilterWhere({ kind: 'text', value: CLIENTE_1 }, undefined)).toBeNull()
    expect(orderCustomerFilterWhere(undefined, { kind: 'select', values: ['otro'] })).toBeNull()
  })
})

describe('buildOrderWhere: el `OR` del cliente queda dentro de su propio termino (R24)', () => {
  const where = buildOrderWhere(
    consulta({
      customerId: { kind: 'select', values: [CLIENTE_1] },
      customerPresence: { kind: 'select', values: ['none'] },
      status: { kind: 'select', values: ['PENDIENTE'] },
    }),
    null,
    { companyId: EMPRESA },
  )

  it('R24: el nivel superior es solo un `AND`, sin `OR` al lado del ambito', () => {
    expect(Object.keys(where)).toEqual(['AND'])
    const terminos = where.AND as readonly Record<string, unknown>[]
    expect(terminos[0]).toEqual({ companyId: EMPRESA })
    expect(terminos[1]).toEqual({ deletedAt: null })
    for (const termino of terminos) {
      if ('OR' in termino) expect(Object.keys(termino)).toEqual(['OR'])
      if ('companyId' in termino) expect(termino).not.toHaveProperty('OR')
    }
  })

  it('R24: un solo termino de cliente, y los demas filtros siguen en el suyo', () => {
    const terminos = where.AND as readonly Record<string, unknown>[]
    const deCliente = terminos.filter((t) => 'OR' in t || 'customerId' in t)
    expect(deCliente).toEqual([
      { OR: [{ customerId: { in: [CLIENTE_1] } }, { customerId: null }] },
    ])
    expect(terminos).toContainEqual({ status: { in: ['PENDIENTE'] } })
  })

  it('R23: sin filtros de cliente, el `where` no lleva ningun termino de cliente', () => {
    const sinCliente = buildOrderWhere(consulta({}), null, { companyId: EMPRESA })
    expect(JSON.stringify(sinCliente)).not.toContain('customerId')
  })
})
