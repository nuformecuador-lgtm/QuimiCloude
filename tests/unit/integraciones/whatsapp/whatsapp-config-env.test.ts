// Lectores de configuracion de la conexion de WhatsApp: version de Graph, URL publica y dobles E2E.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VARS = ['WHATSAPP_GRAPH_API_VERSION', 'APP_BASE_URL', 'INTEGRATIONS_E2E_DOUBLES'] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  vi.resetModules()
})

async function loadReaders() {
  const config = await import('@/lib/modules/integraciones/adapters/driven/config/whatsapp-config-env')
  const baseUrl = await import('@/lib/modules/integraciones/adapters/driven/config/public-base-url-env')
  const doubles = await import('@/lib/modules/integraciones/adapters/driven/config/e2e-doubles-env')
  return { ...config, ...baseUrl, ...doubles }
}

function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  }
  throw new Error('se esperaba un error y no se lanzó')
}

describe('readGraphApiVersion', () => {
  it('R18: devuelve la version cuando tiene la forma v<mayor>.<menor>, recortando espacios', async () => {
    const { readGraphApiVersion } = await loadReaders()
    process.env.WHATSAPP_GRAPH_API_VERSION = ' v21.0 '
    expect(readGraphApiVersion()).toBe('v21.0')
  })

  it.each([undefined, '', '   '])('R18: ausente o vacia (%j) lanza nombrando la variable', async (value) => {
    const { readGraphApiVersion } = await loadReaders()
    if (value !== undefined) process.env.WHATSAPP_GRAPH_API_VERSION = value
    expect(messageOf(() => readGraphApiVersion())).toContain('WHATSAPP_GRAPH_API_VERSION')
  })

  it.each(['21.0', 'v21', 'v21.0.1', 'V21.0', 'vXX.secreto-raro', 'v21.0/x'])(
    'R18: con forma invalida (%s) lanza nombrando la variable y sin el valor',
    async (value) => {
      const { readGraphApiVersion } = await loadReaders()
      process.env.WHATSAPP_GRAPH_API_VERSION = value
      const message = messageOf(() => readGraphApiVersion())
      expect(message).toContain('WHATSAPP_GRAPH_API_VERSION')
      expect(message).not.toContain(value)
    },
  )

  it('R42: se lee en cada llamada; un cambio entre dos llamadas se refleja en la segunda', async () => {
    const { readGraphApiVersion } = await loadReaders()
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v20.0'
    expect(readGraphApiVersion()).toBe('v20.0')
    process.env.WHATSAPP_GRAPH_API_VERSION = 'v21.0'
    expect(readGraphApiVersion()).toBe('v21.0')
  })
})

describe('readPublicBaseUrl', () => {
  it.each([undefined, '', '  '])('R42: ausente o vacia (%j) devuelve null', async (value) => {
    const { readPublicBaseUrl } = await loadReaders()
    if (value !== undefined) process.env.APP_BASE_URL = value
    expect(readPublicBaseUrl()).toBeNull()
  })

  it('R42: quita la barra final y los espacios', async () => {
    const { readPublicBaseUrl } = await loadReaders()
    process.env.APP_BASE_URL = ' https://app.ejemplo.com/ '
    expect(readPublicBaseUrl()).toBe('https://app.ejemplo.com')
    process.env.APP_BASE_URL = 'https://app.ejemplo.com'
    expect(readPublicBaseUrl()).toBe('https://app.ejemplo.com')
  })
})

describe('integrationsE2EDoublesEnabled', () => {
  it('R41: solo con algo dentro elige los dobles; ausente, vacia o en blanco, no', async () => {
    const { integrationsE2EDoublesEnabled } = await loadReaders()
    expect(integrationsE2EDoublesEnabled()).toBe(false)
    process.env.INTEGRATIONS_E2E_DOUBLES = ''
    expect(integrationsE2EDoublesEnabled()).toBe(false)
    process.env.INTEGRATIONS_E2E_DOUBLES = '  '
    expect(integrationsE2EDoublesEnabled()).toBe(false)
    process.env.INTEGRATIONS_E2E_DOUBLES = '1'
    expect(integrationsE2EDoublesEnabled()).toBe(true)
  })
})

describe('ninguna variable se lee al importar', () => {
  it('R42: importar los tres lectores sin variables no lanza ni lee el entorno', async () => {
    vi.resetModules()
    const reads: string[] = []
    const original = process.env
    process.env = new Proxy(original, {
      get(target, key, receiver) {
        if (typeof key === 'string' && (VARS as readonly string[]).includes(key)) reads.push(key)
        return Reflect.get(target, key, receiver) as unknown
      },
    })
    try {
      await expect(loadReaders()).resolves.toBeDefined()
      expect(reads).toEqual([])
    } finally {
      process.env = original
    }
  })
})
