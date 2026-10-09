// Cliente real de Graph con `fetch` simulado: nunca sale a la red.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { whatsappGraphClientFetch } from '@/lib/modules/integraciones/adapters/driven/graph/whatsapp-graph-client-fetch'

const TOKEN = 'EAAG-token-secreto-123'
const PHONE_ID = '3456789012'

const savedVersion = process.env.WHATSAPP_GRAPH_API_VERSION
let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  process.env.WHATSAPP_GRAPH_API_VERSION = 'v21.0'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (savedVersion === undefined) delete process.env.WHATSAPP_GRAPH_API_VERSION
  else process.env.WHATSAPP_GRAPH_API_VERSION = savedVersion
})

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined
  if (call === undefined) throw new Error('fetch no se llamó')
  return { url: call[0], init: call[1] }
}

describe('la llamada a Graph', () => {
  it('R17: GET a la URL exacta con la version, el Phone Number ID y los dos campos', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { display_phone_number: '+57 1', verified_name: 'X' }))
    await whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN })

    const { url, init } = lastCall()
    expect(url).toBe(
      'https://graph.facebook.com/v21.0/3456789012?fields=display_phone_number,verified_name',
    )
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('R17: el token va en `Authorization: Bearer` y nunca en la URL; hay tiempo maximo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { display_phone_number: '+57 1', verified_name: 'X' }))
    await whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN })

    const { url, init } = lastCall()
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(url).not.toContain(TOKEN)
    expect(url).not.toContain('access_token')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['a/b', 'a%2Fb'],
    ['1?x=2', '1%3Fx%3D2'],
    ['1#frag', '1%23frag'],
  ])('R17: un Phone Number ID con simbolos (%s) queda codificado dentro de su segmento', async (id, encoded) => {
    fetchMock.mockResolvedValue(jsonResponse(200, { display_phone_number: '+57 1', verified_name: 'X' }))
    await whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: id, accessToken: TOKEN })

    const parsed = new URL(lastCall().url)
    expect(parsed.pathname).toBe(`/v21.0/${encoded}`)
    expect(parsed.search).toBe('?fields=display_phone_number,verified_name')
    expect(parsed.hash).toBe('')
  })

  it('R18: sin WHATSAPP_GRAPH_API_VERSION lanza nombrando la variable y no llama a fetch', async () => {
    delete process.env.WHATSAPP_GRAPH_API_VERSION
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).rejects.toThrow('WHATSAPP_GRAPH_API_VERSION')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('R18: con una version mal formada tampoco llama a fetch', async () => {
    process.env.WHATSAPP_GRAPH_API_VERSION = 'latest'
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).rejects.toThrow('WHATSAPP_GRAPH_API_VERSION')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('las respuestas de Graph', () => {
  it('R17: 2xx con los dos campos da prueba buena con el numero y el nombre', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { display_phone_number: '+57 300 1234567', verified_name: 'Empresa', id: PHONE_ID }),
    )
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: true, phone: { displayPhoneNumber: '+57 300 1234567', verifiedName: 'Empresa' } })
  })

  it.each([
    ['sin verified_name', JSON.stringify({ display_phone_number: '+57 1' })],
    ['con un tipo que no casa', JSON.stringify({ display_phone_number: 1, verified_name: 'X' })],
    ['que no es JSON', '<html>ok</html>'],
  ])('R17: 2xx %s es una prueba rechazada sin mensaje', async (_caso, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: false, kind: 'rejected', message: null })
  })

  it('R17: 400 con `error.message` es una prueba rechazada con ese mensaje', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 } }),
    )
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: false, kind: 'rejected', message: 'Invalid OAuth access token.' })
  })

  it('R17: un no-2xx que no se entiende es una prueba rechazada sin mensaje', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }))
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: false, kind: 'rejected', message: null })
  })

  it('R17: un fallo de red es `unreachable` sin mensaje', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: false, kind: 'unreachable', message: null })
  })

  it('R17: el tiempo maximo agotado es `unreachable` sin mensaje', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    await expect(
      whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN }),
    ).resolves.toEqual({ ok: false, kind: 'unreachable', message: null })
  })

  it('R17: no escribe nada en la consola, ni la URL ni el token', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    )
    try {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'))
      await whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN })
      fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: 'x' } }))
      await whatsappGraphClientFetch.fetchPhoneNumber({ phoneNumberId: PHONE_ID, accessToken: TOKEN })
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})
