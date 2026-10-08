// Las dos Server Actions de la entrega de producto terminado. Mockea `@/lib/composition` igual que
// `order-actions-customer.test.ts`: la action se prueba contra dobles, nunca contra el dominio real
// ni contra la sesion real.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorMessage, UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores'
import {
  CustomerNotFoundError,
  DeliveryBatchInsufficientError,
  DeliveryBatchNotFoundError,
  DeliveryExceedsRemainingError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/pedidos'
import {
  deliverOrderAction,
  getOrderDeliveryAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'
import { ActionNotAllowedError } from '@/lib/modules/pedidos/domain/errors'

import {
  DELIVER_RESULTS,
  DELIVERY_ERROR_STATES,
  DELIVERY_ORDER_ID,
  deliverInput,
  deliveryView,
} from '../../fixtures/order-delivery'

const {
  getOrderDeliveryMock,
  deliverOrderMock,
  getSessionUserMock,
  getSessionContextMock,
  REQUEST_ID,
} = vi.hoisted(() => ({
  getOrderDeliveryMock: vi.fn(),
  deliverOrderMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  REQUEST_ID: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
}))

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => REQUEST_ID) },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  pedidos: {
    getOrderDelivery: getOrderDeliveryMock,
    deliverOrder: deliverOrderMock,
  },
}))

const SESSION_USER = {
  id: 'user-almacen-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Almacen',
  permissions: ['entregas.modificar'],
}

const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'

const EXPECTED_ACTOR = {
  id: SESSION_USER.id,
  companyId: COMPANY_ID,
  permissions: SESSION_USER.permissions,
}

const DELIVERY_ACTIONS = [
  {
    nombre: 'getOrderDeliveryAction',
    useCase: getOrderDeliveryMock,
    invocar: () => getOrderDeliveryAction(DELIVERY_ORDER_ID),
  },
  {
    nombre: 'deliverOrderAction',
    useCase: deliverOrderMock,
    invocar: () => deliverOrderAction(deliverInput()),
  },
] as const

/** Cada error de dominio de la entrega y el `ErrorState` que tiene que llegar a la pantalla. */
const TRADUCCIONES = [
  { error: () => new DeliveryExceedsRemainingError('diagnostico'), state: DELIVERY_ERROR_STATES.exceedsRemaining },
  { error: () => new DeliveryBatchInsufficientError('diagnostico'), state: DELIVERY_ERROR_STATES.batchInsufficient },
  { error: () => new DeliveryBatchNotFoundError('diagnostico'), state: DELIVERY_ERROR_STATES.batchNotFound },
  { error: () => new ActionNotAllowedError(), state: DELIVERY_ERROR_STATES.actionNotAllowed },
  { error: () => new OrderNotFoundError(), state: DELIVERY_ERROR_STATES.orderNotFound },
  { error: () => new CustomerNotFoundError(), state: DELIVERY_ERROR_STATES.customerNotFound },
  { error: () => new ValidationError(), state: DELIVERY_ERROR_STATES.invalidInput },
  { error: () => new UnauthorizedError(), state: DELIVERY_ERROR_STATES.unauthorized },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(SESSION_USER)
  getSessionContextMock.mockResolvedValue({ companyId: COMPANY_ID })
  getOrderDeliveryMock.mockResolvedValue(deliveryView())
  deliverOrderMock.mockResolvedValue(DELIVER_RESULTS.partial)
})

describe('Server Actions de la entrega: entrada, actor y resultado', () => {
  it('R2, R5: getOrderDeliveryAction entrega el id y el actor de la sesion, y devuelve la vista tal cual', async () => {
    const view = deliveryView()
    getOrderDeliveryMock.mockResolvedValue(view)

    const result = await getOrderDeliveryAction(DELIVERY_ORDER_ID)

    expect(result).toEqual({ status: 'success', data: view })
    expect(getOrderDeliveryMock).toHaveBeenCalledTimes(1)
    expect(getOrderDeliveryMock).toHaveBeenCalledWith(DELIVERY_ORDER_ID, EXPECTED_ACTOR)
  })

  it('R22: deliverOrderAction pasa la entrada tal cual al caso de uso, sin quitar ni anadir campos', async () => {
    const input = { ...deliverInput(), companyId: OTRA_EMPRESA, extra: 'campo no acordado' }

    await deliverOrderAction(input)

    expect(deliverOrderMock).toHaveBeenCalledTimes(1)
    expect(deliverOrderMock.mock.calls[0]?.[0]).toBe(input)
    expect(deliverOrderMock).toHaveBeenCalledWith(input, EXPECTED_ACTOR)
  })

  for (const [nombre, resultado] of Object.entries(DELIVER_RESULTS)) {
    it(`R26, R27, R29: success lleva el DeliverOrderResult del caso de uso (${nombre})`, async () => {
      deliverOrderMock.mockResolvedValue(resultado)

      expect(await deliverOrderAction(deliverInput())).toEqual({ status: 'success', data: resultado })
    })
  }

  for (const action of DELIVERY_ACTIONS) {
    it(`R2: ${action.nombre} lee cada cara de la sesion una sola vez por invocacion`, async () => {
      await action.invocar()

      expect(getSessionUserMock).toHaveBeenCalledTimes(1)
      expect(getSessionContextMock).toHaveBeenCalledTimes(1)
      expect(action.useCase).toHaveBeenCalledTimes(1)
    })

    it(`R2: ${action.nombre} sin sesion entrega actor null y el rechazo vuelve como unauthorized`, async () => {
      getSessionUserMock.mockResolvedValue(null)
      action.useCase.mockRejectedValueOnce(new UnauthorizedError())

      const result = await action.invocar()

      expect(result).toEqual(DELIVERY_ERROR_STATES.unauthorized)
      expect(action.useCase.mock.calls[0]?.at(-1)).toBeNull()
    })
  }

  it('R2: ninguna de las dos actions repite la comprobacion de permiso', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(
      join(here, '..', '..', '..', 'lib', 'modules', 'pedidos', 'adapters', 'driving', 'order-actions.ts'),
      'utf8',
    )
    const desde = source.indexOf('export async function getOrderDeliveryAction(')
    expect(desde).toBeGreaterThan(-1)
    expect(source.slice(desde)).not.toMatch(/requirePermission|entregas\.modificar/)
  })
})

describe('Server Actions de la entrega: traduccion de errores', () => {
  for (const action of DELIVERY_ACTIONS) {
    for (const { error, state } of TRADUCCIONES) {
      it(`R18, R19, R20: ${action.nombre} traduce ${state.code} al ErrorState del catalogo`, async () => {
        action.useCase.mockRejectedValueOnce(error())

        const result = await action.invocar()

        expect(result).toEqual(state)
        expect(result).toEqual({ status: 'error', code: state.code, message: errorMessage(state.code) })
      })
    }

    it(`R30: ${action.nombre} devuelve un error ajeno como unexpected, sin su detalle`, async () => {
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
