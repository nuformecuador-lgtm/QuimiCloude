// Las Server Actions del cliente del pedido, y el campo `customerId` del alta y la edicion.
// Mockea `@/lib/composition` igual que `order-actions.test.ts`: la action se prueba contra
// dobles, nunca contra el dominio real ni contra la sesion real.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorMessage, UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores'
import {
  CustomerNotFoundError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/pedidos'
import {
  createOrderAction,
  getOrderCustomerFilterOptionAction,
  searchOrderCustomersAction,
  setOrderCustomerAction,
  updateOrderAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'

const {
  createOrderMock,
  updateOrderMock,
  setOrderCustomerMock,
  searchOrderCustomersMock,
  getOrderCustomerFilterOptionMock,
  getSessionUserMock,
  getSessionContextMock,
  REQUEST_ID,
} = vi.hoisted(() => ({
  createOrderMock: vi.fn(),
  updateOrderMock: vi.fn(),
  setOrderCustomerMock: vi.fn(),
  searchOrderCustomersMock: vi.fn(),
  getOrderCustomerFilterOptionMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  REQUEST_ID: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
}))

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => REQUEST_ID) },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  pedidos: {
    createOrder: createOrderMock,
    updateOrder: updateOrderMock,
    setOrderCustomer: setOrderCustomerMock,
    searchOrderCustomers: searchOrderCustomersMock,
    getOrderCustomerFilterOption: getOrderCustomerFilterOptionMock,
  },
}))

const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}

const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'
const SESSION_CONTEXT = { companyId: COMPANY_ID }

const EXPECTED_ACTOR = {
  id: SESSION_USER.id,
  companyId: COMPANY_ID,
  permissions: SESSION_USER.permissions,
}

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOMER_ID = '55555555-5555-4555-8555-555555555555'

const CUSTOMER = { id: CUSTOMER_ID, name: 'Ana Garcia', isDeleted: false }
const PAGE = { items: [CUSTOMER], total: 1, page: 1, pageSize: 10, totalPages: 1 }

/** Las tres actions nuevas, cada una con una invocacion valida y el doble que llama. */
const CUSTOMER_ACTIONS = [
  {
    nombre: 'setOrderCustomerAction',
    useCase: setOrderCustomerMock,
    invocar: () => setOrderCustomerAction(ORDER_ID, { customerId: CUSTOMER_ID }),
  },
  {
    nombre: 'searchOrderCustomersAction',
    useCase: searchOrderCustomersMock,
    invocar: () => searchOrderCustomersAction({ search: 'ana', page: 1 }, 'assign'),
  },
  {
    nombre: 'getOrderCustomerFilterOptionAction',
    useCase: getOrderCustomerFilterOptionMock,
    invocar: () => getOrderCustomerFilterOptionAction(CUSTOMER_ID),
  },
] as const

function errorState(code: Parameters<typeof errorMessage>[0]) {
  return { status: 'error', code, message: errorMessage(code) }
}

function minimalOrderForm(extra: Record<string, string> = {}): FormData {
  const formData = new FormData()
  formData.set('recipeId', '22222222-2222-4222-8222-222222222222')
  formData.set('quantity', '10')
  formData.set('unitId', '77777777-7777-4777-8777-777777777777')
  for (const [name, value] of Object.entries(extra)) formData.set(name, value)
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(SESSION_USER)
  getSessionContextMock.mockResolvedValue(SESSION_CONTEXT)
  setOrderCustomerMock.mockResolvedValue(undefined)
  searchOrderCustomersMock.mockResolvedValue(PAGE)
  getOrderCustomerFilterOptionMock.mockResolvedValue(CUSTOMER)
  createOrderMock.mockResolvedValue({ id: ORDER_ID, numberText: 'PED-0001' })
  updateOrderMock.mockResolvedValue(undefined)
})

describe('Server Actions del cliente del pedido: actor y sesion', () => {
  it('R9: setOrderCustomerAction entrega id, entrada tal cual y el actor de la sesion; la empresa de la entrada no cuenta', async () => {
    const input = { customerId: CUSTOMER_ID, companyId: OTRA_EMPRESA }

    const result = await setOrderCustomerAction(ORDER_ID, input)

    expect(result).toEqual({ status: 'success' })
    expect(setOrderCustomerMock).toHaveBeenCalledTimes(1)
    expect(setOrderCustomerMock).toHaveBeenCalledWith(ORDER_ID, input, EXPECTED_ACTOR)
  })

  it('R9: searchOrderCustomersAction entrega consulta, proposito y actor, y devuelve la pagina tal cual', async () => {
    const query = { search: 'ana', page: 2, pageSize: 25 }

    const result = await searchOrderCustomersAction(query, 'filter')

    expect(result).toEqual({ status: 'success', data: PAGE })
    expect(searchOrderCustomersMock).toHaveBeenCalledWith(query, 'filter', EXPECTED_ACTOR)
  })

  it('R9: getOrderCustomerFilterOptionAction entrega el id y el actor, y devuelve el cliente', async () => {
    const result = await getOrderCustomerFilterOptionAction(CUSTOMER_ID)

    expect(result).toEqual({ status: 'success', data: CUSTOMER })
    expect(getOrderCustomerFilterOptionMock).toHaveBeenCalledWith(CUSTOMER_ID, EXPECTED_ACTOR)
  })

  it('R29: un id que no resuelve vuelve como success con data null, para descartar el filtro', async () => {
    getOrderCustomerFilterOptionMock.mockResolvedValue(null)

    expect(await getOrderCustomerFilterOptionAction('no-es-uuid')).toEqual({ status: 'success', data: null })
  })

  for (const action of CUSTOMER_ACTIONS) {
    it(`R9: ${action.nombre} lee cada cara de la sesion una sola vez por invocacion`, async () => {
      await action.invocar()

      expect(getSessionUserMock).toHaveBeenCalledTimes(1)
      expect(getSessionContextMock).toHaveBeenCalledTimes(1)
      expect(action.useCase).toHaveBeenCalledTimes(1)
    })

    it(`R9: ${action.nombre} sin sesion entrega actor null y el rechazo vuelve como unauthorized`, async () => {
      getSessionUserMock.mockResolvedValue(null)
      action.useCase.mockRejectedValueOnce(new UnauthorizedError())

      const result = await action.invocar()

      expect(result).toEqual(errorState('unauthorized'))
      expect(action.useCase.mock.calls[0]?.at(-1)).toBeNull()
    })

    it(`R9: ${action.nombre} sin contexto de empresa tambien entrega actor null`, async () => {
      getSessionContextMock.mockResolvedValue(null)
      action.useCase.mockRejectedValueOnce(new UnauthorizedError())

      await action.invocar()

      expect(action.useCase.mock.calls[0]?.at(-1)).toBeNull()
    })
  }

  it('R9: ninguna de las tres actions repite la comprobacion de permiso', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(
      join(here, '..', '..', '..', 'lib', 'modules', 'pedidos', 'adapters', 'driving', 'order-actions.ts'),
      'utf8',
    )
    const desde = source.indexOf('export async function setOrderCustomerAction(')
    expect(desde).toBeGreaterThan(-1)
    expect(source.slice(desde)).not.toMatch(/requirePermission/)
  })
})

describe('Server Actions del cliente del pedido: traduccion de errores', () => {
  it('R11: setOrderCustomerAction traduce CustomerNotFoundError a customer_not_found con el mensaje del catalogo', async () => {
    setOrderCustomerMock.mockRejectedValueOnce(new CustomerNotFoundError())

    expect(await setOrderCustomerAction(ORDER_ID, { customerId: CUSTOMER_ID })).toEqual(
      errorState('customer_not_found'),
    )
  })

  it('R18: setOrderCustomerAction traduce OrderNotFoundError a order_not_found', async () => {
    setOrderCustomerMock.mockRejectedValueOnce(new OrderNotFoundError())

    expect(await setOrderCustomerAction(ORDER_ID, { customerId: null })).toEqual(errorState('order_not_found'))
  })

  it('R6: setOrderCustomerAction y la busqueda para asignar traducen UnauthorizedError a unauthorized', async () => {
    setOrderCustomerMock.mockRejectedValueOnce(new UnauthorizedError())
    searchOrderCustomersMock.mockRejectedValueOnce(new UnauthorizedError())

    expect(await setOrderCustomerAction(ORDER_ID, { customerId: CUSTOMER_ID })).toEqual(errorState('unauthorized'))
    expect(await searchOrderCustomersAction({ search: '', page: 1 }, 'assign')).toEqual(errorState('unauthorized'))
  })

  it('R7: la busqueda para filtrar y la opcion de filtro traducen UnauthorizedError a unauthorized', async () => {
    searchOrderCustomersMock.mockRejectedValueOnce(new UnauthorizedError())
    getOrderCustomerFilterOptionMock.mockRejectedValueOnce(new UnauthorizedError())

    expect(await searchOrderCustomersAction({ search: '', page: 1 }, 'filter')).toEqual(errorState('unauthorized'))
    expect(await getOrderCustomerFilterOptionAction(CUSTOMER_ID)).toEqual(errorState('unauthorized'))
  })

  it('R27: searchOrderCustomersAction traduce ValidationError a invalid_input', async () => {
    searchOrderCustomersMock.mockRejectedValueOnce(new ValidationError())

    expect(await searchOrderCustomersAction({ search: 'x'.repeat(500), page: 0 }, 'assign')).toEqual(
      errorState('invalid_input'),
    )
  })

  for (const action of CUSTOMER_ACTIONS) {
    it(`R9: ${action.nombre} devuelve un error ajeno como unexpected, sin su detalle`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const DETALLE = 'la conexion con la base se cayo'
      action.useCase.mockRejectedValueOnce(new Error(DETALLE))

      const result = await action.invocar()

      expect(result).toEqual({
        status: 'error',
        code: UNEXPECTED_ERROR_CODE,
        message: errorMessage(UNEXPECTED_ERROR_CODE),
        reference: REQUEST_ID,
      })
      expect(JSON.stringify(result)).not.toContain(DETALLE)
      consoleError.mockRestore()
    })
  }
})

describe('Alta y edicion: el campo customerId del formulario', () => {
  it('R10: createOrderAction entrega el customerId del formulario en el candidato', async () => {
    await createOrderAction({ status: 'idle' }, minimalOrderForm({ customerId: CUSTOMER_ID }))

    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: CUSTOMER_ID }),
      EXPECTED_ACTOR,
    )
  })

  it('R10: sin campo customerId el candidato lo lleva ausente, y vacio se entrega tal cual al esquema', async () => {
    await createOrderAction({ status: 'idle' }, minimalOrderForm())
    await createOrderAction({ status: 'idle' }, minimalOrderForm({ customerId: '' }))

    expect(createOrderMock.mock.calls[0]?.[0]).toMatchObject({ customerId: undefined })
    expect(createOrderMock.mock.calls[1]?.[0]).toMatchObject({ customerId: '' })
  })

  it('R11: createOrderAction traduce CustomerNotFoundError a customer_not_found', async () => {
    createOrderMock.mockRejectedValueOnce(new CustomerNotFoundError())

    expect(await createOrderAction({ status: 'idle' }, minimalOrderForm({ customerId: CUSTOMER_ID }))).toEqual(
      errorState('customer_not_found'),
    )
  })

  it('R13: updateOrderAction entrega el customerId del formulario y traduce customer_not_found', async () => {
    updateOrderMock.mockRejectedValueOnce(new CustomerNotFoundError())

    const result = await updateOrderAction(ORDER_ID, { status: 'idle' }, minimalOrderForm({ customerId: CUSTOMER_ID }))

    expect(updateOrderMock).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ customerId: CUSTOMER_ID }),
      EXPECTED_ACTOR,
    )
    expect(result).toEqual(errorState('customer_not_found'))
  })
})
