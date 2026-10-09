// El cableado del cliente de Graph en `lib/composition`: el doble o el cliente real se eligen en
// cada llamada por `INTEGRATIONS_E2E_DOUBLES`, dentro del mismo proceso. Se observa a traves del
// alta, que prueba contra Graph antes de escribir nada; la persistencia se dobla y `fetch` tambien.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findLiveMock, insertMock } = vi.hoisted(() => ({
  findLiveMock: vi.fn(async () => null),
  insertMock: vi.fn(),
}))

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/modules/integraciones/adapters/driven/persistence/whatsapp-connection-prisma', () => ({
  findLiveWhatsappConnection: findLiveMock,
  findLiveWhatsappConnectionById: vi.fn(),
  insertWhatsappConnection: insertMock,
  updateLiveWhatsappConnection: vi.fn(),
}))

import { integraciones } from '@/lib/composition'
import { CANNED_GRAPH_ERROR_MESSAGE } from '@/lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned'

const ACTOR = {
  id: 'user-admin-1',
  companyId: '22222222-2222-4222-8222-222222222222',
  permissions: ['integraciones.modificar'],
}

const INPUT = {
  displayName: 'Ventas',
  metaAppId: '111',
  wabaId: '222',
  phoneNumberId: '333',
  accessToken: 'E2E_INVALID-token',
  appSecret: 'app-secret-de-prueba',
}

const REAL_GRAPH_MESSAGE = 'mensaje del Graph real'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ error: { message: REAL_GRAPH_MESSAGE } }), { status: 400 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('WHATSAPP_GRAPH_API_VERSION', 'v21.0')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('integraciones — eleccion del cliente de Graph en la composicion', () => {
  it('R41 — con la variable puesta responde el doble y no sale ninguna peticion', async () => {
    vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', '1')

    const result = await integraciones.createWhatsappConnection(INPUT, ACTOR)

    expect(result).toEqual({ status: 'test_failed', message: CANNED_GRAPH_ERROR_MESSAGE })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('R41 — sin la variable (o vacia) responde el cliente real, que llama a Graph', async () => {
    for (const value of [undefined, '', '   ']) {
      fetchMock.mockClear()
      if (value === undefined) {
        vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', 'x')
        delete process.env.INTEGRATIONS_E2E_DOUBLES
      } else {
        vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', value)
      }

      const result = await integraciones.createWhatsappConnection(INPUT, ACTOR)

      expect(result, String(value)).toEqual({ status: 'test_failed', message: REAL_GRAPH_MESSAGE })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'https://graph.facebook.com/v21.0/333?fields=display_phone_number,verified_name',
      )
    }
  })

  it('R41, R42 — la eleccion cambia dentro del mismo proceso, sin volver a importar la composicion', async () => {
    vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', '1')
    await integraciones.createWhatsappConnection(INPUT, ACTOR)
    expect(fetchMock).not.toHaveBeenCalled()

    vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', '')
    await integraciones.createWhatsappConnection(INPUT, ACTOR)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', '1')
    await integraciones.createWhatsappConnection(INPUT, ACTOR)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('R18, R42 — la version de Graph se lee al llamar: sin ella el cliente real falla en la llamada, no al importar', async () => {
    vi.stubEnv('INTEGRATIONS_E2E_DOUBLES', '')
    vi.stubEnv('WHATSAPP_GRAPH_API_VERSION', '')

    await expect(integraciones.createWhatsappConnection(INPUT, ACTOR)).rejects.toThrow(
      /WHATSAPP_GRAPH_API_VERSION/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('la fachada expone exactamente el cifrado y los casos de uso de la conexion', () => {
    expect(Object.keys(integraciones).sort()).toEqual([
      'createWhatsappConnection',
      'getWhatsappConnection',
      'regenerateWhatsappVerifyToken',
      'secretCipher',
      'secretDigest',
      'setWhatsappConnectionEnabled',
      'testWhatsappConnection',
      'updateWhatsappConnection',
      'whatsappWebhookUrl',
    ])
  })
})
