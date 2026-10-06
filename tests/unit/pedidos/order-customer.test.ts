// QC-156 T0 — las funciones reales del cliente del pedido: el nombre, la forma del id y la
// comprobacion de que el cliente existe y sigue vivo.

import { describe, expect, it, vi } from 'vitest'

import { CustomerNotFoundError } from '@/lib/modules/pedidos'
import {
  formatOrderCustomerName,
  isCustomerIdShape,
  requireAliveCustomer,
  toOrderCustomer,
} from '@/lib/modules/pedidos/domain/order-customer'

import type { CustomerCatalog, CustomerRef } from '@/lib/modules/clientes'

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const CLIENTE_ID = '55555555-5555-4555-8555-555555555555'

const CLIENTE: CustomerRef = {
  id: CLIENTE_ID,
  firstNames: 'Ana Maria',
  lastNames: 'Garcia Lopez',
  isDeleted: false,
}

function catalogo(ref: CustomerRef | null) {
  const findAliveRefById = vi.fn<CustomerCatalog['findAliveRefById']>(async () => ref)
  return { findAliveRefById }
}

describe('formatOrderCustomerName y toOrderCustomer', () => {
  it('R19 — el nombre es «Nombres Apellidos», sin ningun otro dato', () => {
    expect(formatOrderCustomerName(CLIENTE)).toBe('Ana Maria Garcia Lopez')
  })

  it('R20 — toOrderCustomer conserva el id y la marca de baja', () => {
    expect(toOrderCustomer({ ...CLIENTE, isDeleted: true })).toEqual({
      id: CLIENTE_ID,
      name: 'Ana Maria Garcia Lopez',
      isDeleted: true,
    })
  })
})

describe('isCustomerIdShape', () => {
  it('R11 — acepta un uuid y rechaza lo que no tiene su forma', () => {
    expect(isCustomerIdShape(CLIENTE_ID)).toBe(true)
    expect(isCustomerIdShape('')).toBe(false)
    expect(isCustomerIdShape('no-es-un-uuid')).toBe(false)
    expect(isCustomerIdShape(`${CLIENTE_ID}x`)).toBe(false)
  })
})

describe('requireAliveCustomer', () => {
  it('R11 — un id sin forma de uuid es customer_not_found sin consultar el catalogo', async () => {
    const customerCatalog = catalogo(CLIENTE)
    const promesa = requireAliveCustomer(customerCatalog, 'no-es-un-uuid', EMPRESA)
    await expect(promesa).rejects.toBeInstanceOf(CustomerNotFoundError)
    await expect(promesa).rejects.toMatchObject({ code: 'customer_not_found' })
    expect(customerCatalog.findAliveRefById).not.toHaveBeenCalled()
  })

  it('R11 — un cliente que el catalogo no devuelve (inexistente, de baja u otra empresa) es customer_not_found', async () => {
    const customerCatalog = catalogo(null)
    await expect(requireAliveCustomer(customerCatalog, CLIENTE_ID, EMPRESA)).rejects.toMatchObject({
      code: 'customer_not_found',
    })
    expect(customerCatalog.findAliveRefById).toHaveBeenCalledTimes(1)
    expect(customerCatalog.findAliveRefById).toHaveBeenCalledWith(CLIENTE_ID, EMPRESA)
  })

  it('R10 — un cliente vivo de la empresa vuelve tal cual, con una sola consulta', async () => {
    const customerCatalog = catalogo(CLIENTE)
    await expect(requireAliveCustomer(customerCatalog, CLIENTE_ID, EMPRESA)).resolves.toBe(CLIENTE)
    expect(customerCatalog.findAliveRefById).toHaveBeenCalledTimes(1)
  })
})
