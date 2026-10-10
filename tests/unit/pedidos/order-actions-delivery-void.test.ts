// Las dos Server Actions de la anulacion de entregas. Mockea `@/lib/composition` igual que
// `order-actions-delivery.test.ts`: la action se prueba contra dobles, nunca contra el dominio real
// ni contra la sesion real.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errorMessage, UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores'
import {
  DeliveryAlreadyVoidedError,
  DeliveryNotFoundError,
  OrderNotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/modules/pedidos'
import {
  listOrderDeliveriesAction,
  voidDeliveryAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions'
import { ActionNotAllowedError } from '@/lib/modules/pedidos/domain/errors'

import {
  deliveryHistoryView,
  VOID_ERROR_STATES,
  VOID_ORDER_ID,
  VOID_RESULTS,
  voidInput,
} from '../../fixtures/order-delivery-void'

const {
  listOrderDeliveriesMock,
  voidDeliveryMock,
  getSessionUserMock,
  getSessionContextMock,
  REQUEST_ID,
} = vi.hoisted(() => ({
  listOrderDeliveriesMock: vi.fn(),
  voidDeliveryMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  REQUEST_ID: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
}))

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: vi.fn(async () => REQUEST_ID) },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  pedidos: {
    listOrderDeliveries: listOrderDeliveriesMock,
    voidDelivery: voidDeliveryMock,
  },
}))

const SESSION_USER = {
  id: 'user-admin-1',
  username: 'laura.gomez',
  displayName: 'Laura Gomez',
  roleName: 'Administrador',
  permissions: ['pedidos.consultar', 'entregas.anular'],
}

const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'

const EXPECTED_ACTOR = {
  id: SESSION_USER.id,
  companyId: COMPANY_ID,
  permissions: SESSION_USER.permissions,
}

const VOID_ACTIONS = [
  {
    nombre: 'listOrderDeliveriesAction',
    useCase: listOrderDeliveriesMock,
    invocar: () => listOrderDeliveriesAction(VOID_ORDER_ID),
  },
  {
    nombre: 'voidDeliveryAction',
    useCase: voidDeliveryMock,
    invocar: () => voidDeliveryAction(voidInput()),
  },
] as const

/** Cada error de dominio de la anulacion y la lista, y el `ErrorState` que tiene que llegar a la pantalla. */
const TRADUCCIONES = [
  { error: () => new DeliveryNotFoundError('diagnostico'), state: VOID_ERROR_STATES.deliveryNotFound },
  { error: () => new DeliveryAlreadyVoidedError('diagnostico'), state: VOID_ERROR_STATES.alreadyVoided },
  { error: () => new ActionNotAllowedError(), state: VOID_ERROR_STATES.actionNotAllowed },
  { error: () => new OrderNotFoundError(), state: VOID_ERROR_STATES.orderNotFound },
  { error: () => new ValidationError(), state: VOID_ERROR_STATES.invalidInput },
  { error: () => new UnauthorizedError(), state: VOID_ERROR_STATES.unauthorized },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(SESSION_USER)
  getSessionContextMock.mockResolvedValue({ companyId: COMPANY_ID })
  listOrderDeliveriesMock.mockResolvedValue(deliveryHistoryView())
  voidDeliveryMock.mockResolvedValue(VOID_RESULTS.voided)
})

describe('Server Actions de la anulacion: entrada, actor y resultado', () => {
  it('R4, R7: listOrderDeliveriesAction entrega el id y el actor de la sesion, y devuelve la vista tal cual', async () => {
    const view = deliveryHistoryView()
    listOrderDeliveriesMock.mockResolvedValue(view)

    const result = await listOrderDeliveriesAction(VOID_ORDER_ID)

    expect(result).toEqual({ status: 'success', data: view })
    expect(listOrderDeliveriesMock.mock.calls[0]?.[0]).toBe(VOID_ORDER_ID)
    expect(listOrderDeliveriesMock).toHaveBeenCalledTimes(1)
    expect(listOrderDeliveriesMock).toHaveBeenCalledWith(VOID_ORDER_ID, EXPECTED_ACTOR)
  })

  it('R17: voidDeliveryAction pasa la entrada tal cual al caso de uso, sin quitar ni anadir campos', async () => {
    const input = { ...voidInput(), companyId: OTRA_EMPRESA, extra: 'campo no acordado' }

    await voidDeliveryAction(input)

    expect(voidDeliveryMock).toHaveBeenCalledTimes(1)
    expect(voidDeliveryMock.mock.calls[0]?.[0]).toBe(input)
    expect(voidDeliveryMock).toHaveBeenCalledWith(input, EXPECTED_ACTOR)
  })

  it('R17: voidDeliveryAction no recorta el motivo ni deduplica: lo valida el caso de uso', async () => {
    const input = voidInput({ reason: '   motivo con espacios   ' })

    await voidDeliveryAction(input)

    expect(voidDeliveryMock.mock.calls[0]?.[0]).toEqual(input)
  })

  for (const [nombre, resultado] of Object.entries(VOID_RESULTS)) {
    it(`R27, R28: success lleva el VoidDeliveryResult del caso de uso (${nombre})`, async () => {
      voidDeliveryMock.mockResolvedValue(resultado)

      expect(await voidDeliveryAction(voidInput())).toEqual({ status: 'success', data: resultado })
    })
  }

  it('R8: una lista sin entregas vuelve como success con la lista vacia', async () => {
    const view = deliveryHistoryView({ deliveries: [] })
    listOrderDeliveriesMock.mockResolvedValue(view)

    expect(await listOrderDeliveriesAction(VOID_ORDER_ID)).toEqual({ status: 'success', data: view })
  })

  for (const action of VOID_ACTIONS) {
    it(`R2, R4: ${action.nombre} lee cada cara de la sesion una sola vez por invocacion`, async () => {
      await action.invocar()

      expect(getSessionUserMock).toHaveBeenCalledTimes(1)
      expect(getSessionContextMock).toHaveBeenCalledTimes(1)
      expect(action.useCase).toHaveBeenCalledTimes(1)
    })

    it(`R2, R4: ${action.nombre} sin sesion entrega actor null y el rechazo vuelve como unauthorized`, async () => {
      getSessionUserMock.mockResolvedValue(null)
      action.useCase.mockRejectedValueOnce(new UnauthorizedError())

      const result = await action.invocar()

      expect(result).toEqual(VOID_ERROR_STATES.unauthorized)
      expect(action.useCase.mock.calls[0]?.at(-1)).toBeNull()
    })
  }

  it('R2, R3: ninguna de las dos actions repite la comprobacion de permiso', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(
      join(here, '..', '..', '..', 'lib', 'modules', 'pedidos', 'adapters', 'driving', 'order-actions.ts'),
      'utf8',
    )
    const desde = source.indexOf('export async function listOrderDeliveriesAction(')
    expect(desde).toBeGreaterThan(-1)
    expect(source.slice(desde)).not.toMatch(/requirePermission|entregas\.anular|pedidos\.consultar/)
  })
})

describe('Server Actions de la anulacion: traduccion de errores', () => {
  for (const action of VOID_ACTIONS) {
    for (const { error, state } of TRADUCCIONES) {
      it(`R6, R16, R18, R19, R21: ${action.nombre} traduce ${state.code} al ErrorState del catalogo`, async () => {
        action.useCase.mockRejectedValueOnce(error())

        const result = await action.invocar()

        expect(result).toEqual(state)
        expect(result).toEqual({ status: 'error', code: state.code, message: errorMessage(state.code) })
      })
    }

    it(`R29: ${action.nombre} devuelve un error ajeno como unexpected, sin su detalle`, async () => {
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
