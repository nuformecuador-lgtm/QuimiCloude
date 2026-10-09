// Doble de Graph para el E2E: respuestas fijas y ninguna llamada de red.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CANNED_DISPLAY_PHONE_NUMBER,
  CANNED_GRAPH_ERROR_MESSAGE,
  CANNED_VERIFIED_NAME,
  whatsappGraphClientCanned,
} from '@/lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-canned'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('whatsappGraphClientCanned', () => {
  it('R41: un Access Token cualquiera da prueba buena con el numero y el nombre fijos', async () => {
    await expect(
      whatsappGraphClientCanned.fetchPhoneNumber({ phoneNumberId: 'abc-1', accessToken: 'EAAG-cualquiera' }),
    ).resolves.toEqual({
      ok: true,
      phone: { displayPhoneNumber: '+57 300 0000000', verifiedName: 'Empresa de prueba E2E' },
    })
    expect(CANNED_DISPLAY_PHONE_NUMBER).toBe('+57 300 0000000')
    expect(CANNED_VERIFIED_NAME).toBe('Empresa de prueba E2E')
  })

  it('R41: un Access Token que empieza por E2E_INVALID da prueba rechazada con el mensaje fijo', async () => {
    await expect(
      whatsappGraphClientCanned.fetchPhoneNumber({ phoneNumberId: '1', accessToken: 'E2E_INVALID_token' }),
    ).resolves.toEqual({
      ok: false,
      kind: 'rejected',
      message: 'Invalid OAuth access token - Cannot parse access token',
    })
    expect(CANNED_GRAPH_ERROR_MESSAGE).toBe('Invalid OAuth access token - Cannot parse access token')
  })

  it('R41: E2E_INVALID en medio del token no lo marca', async () => {
    const result = await whatsappGraphClientCanned.fetchPhoneNumber({
      phoneNumberId: '1',
      accessToken: 'x-E2E_INVALID',
    })
    expect(result.ok).toBe(true)
  })

  it('R41: no sale a la red ni lee WHATSAPP_GRAPH_API_VERSION', async () => {
    const saved = process.env.WHATSAPP_GRAPH_API_VERSION
    delete process.env.WHATSAPP_GRAPH_API_VERSION
    try {
      await whatsappGraphClientCanned.fetchPhoneNumber({ phoneNumberId: '1', accessToken: 'ok' })
      await whatsappGraphClientCanned.fetchPhoneNumber({ phoneNumberId: '1', accessToken: 'E2E_INVALID' })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      if (saved !== undefined) process.env.WHATSAPP_GRAPH_API_VERSION = saved
    }
  })
})
