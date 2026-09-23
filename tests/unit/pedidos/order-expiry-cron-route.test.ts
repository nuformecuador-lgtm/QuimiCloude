// El Route Handler del proceso diario, invocado DIRECTO con un `Request` normal, sin levantar
// Next: R24, R26. `verifyCronSecret` y `expireStaleOrders` se doblan en `@/lib/composition`
// -mismo patron que `tests/unit/documentos/document-job-route.test.ts`-: el handler NO puede
// tocar ni el secreto ni el repositorio por su cuenta, asi que los dobles LANZAN si algo los
// llama fuera de lo esperado.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { GET } from '@/lib/modules/pedidos/adapters/driving/order-expiry-cron-route'

const { verifyCronSecretMock, expireStaleOrdersMock } = vi.hoisted(() => ({
  verifyCronSecretMock: vi.fn(),
  expireStaleOrdersMock: vi.fn(),
}))

vi.mock('@/lib/composition', () => ({
  pedidos: {
    verifyCronSecret: verifyCronSecretMock,
    expireStaleOrders: expireStaleOrdersMock,
  },
}))

function requestCon(headers: Record<string, string> = {}): Request {
  return new Request('https://app.invalida/api/cron/caducar-pedidos', { headers })
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('pedidos — el Route Handler del proceso diario', () => {
  it('R24 — secreto incorrecto: 401 y NO llama a expireStaleOrders', async () => {
    verifyCronSecretMock.mockReturnValue('unauthorized')

    const respuesta = await GET(requestCon({ authorization: 'Bearer mal' }))

    expect(respuesta.status).toBe(401)
    expect(expireStaleOrdersMock).not.toHaveBeenCalled()
  })

  it('R24 — sin cabecera: 401 y cero efectos', async () => {
    verifyCronSecretMock.mockReturnValue('unauthorized')

    const respuesta = await GET(requestCon())

    expect(respuesta.status).toBe(401)
    expect(verifyCronSecretMock).toHaveBeenCalledWith(null)
    expect(expireStaleOrdersMock).not.toHaveBeenCalled()
  })

  it('R24 — CRON_SECRET sin configurar: 500 y NO llama a expireStaleOrders', async () => {
    verifyCronSecretMock.mockReturnValue('misconfigured')

    const respuesta = await GET(requestCon({ authorization: 'Bearer cualquiera' }))

    expect(respuesta.status).toBe(500)
    expect(expireStaleOrdersMock).not.toHaveBeenCalled()
  })

  it('R24 — misconfigured registra el evento sin nombrar el secreto', async () => {
    verifyCronSecretMock.mockReturnValue('misconfigured')

    await GET(requestCon())

    expect(consoleError).toHaveBeenCalledWith('order_expiry_misconfigured')
  })

  it('secreto correcto y sin fallos: 200 con el numero de caducados', async () => {
    verifyCronSecretMock.mockReturnValue('ok')
    expireStaleOrdersMock.mockResolvedValue({ expired: 3, failed: [] })

    const respuesta = await GET(requestCon({ authorization: 'Bearer bueno' }))

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ expired: 3 })
  })

  it('R26 — con fallos: 500 y el evento estructurado, sin PII', async () => {
    verifyCronSecretMock.mockReturnValue('ok')
    const fallo = {
      stage: 'order' as const,
      id: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      code: 'unexpected',
    }
    expireStaleOrdersMock.mockResolvedValue({ expired: 1, failed: [fallo] })

    const respuesta = await GET(requestCon({ authorization: 'Bearer bueno' }))

    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ expired: 1 })
    expect(consoleError).toHaveBeenCalledWith('order_expiry_failed', { failedCount: 1, failed: [fallo] })
  })

  it('R54 — un fallo al listar empresas tambien responde 500 con el evento, aunque no haya candidato ni pedido', async () => {
    verifyCronSecretMock.mockReturnValue('ok')
    const fallo = { stage: 'companies' as const, code: 'unexpected' }
    expireStaleOrdersMock.mockResolvedValue({ expired: 0, failed: [fallo] })

    const respuesta = await GET(requestCon({ authorization: 'Bearer bueno' }))

    expect(respuesta.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith('order_expiry_failed', { failedCount: 1, failed: [fallo] })
  })
})
