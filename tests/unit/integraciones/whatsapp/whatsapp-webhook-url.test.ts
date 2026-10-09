// La URL del webhook de WhatsApp: la ruta vive en un solo sitio (`lib/shared/routes.ts`) y la
// composicion le antepone `APP_BASE_URL`, leida en cada llamada. Sin ella, la ruta relativa y
// `complete: false`.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }))

import { integraciones } from '@/lib/composition'
import { WHATSAPP_WEBHOOK_ROUTE_BASE, whatsappWebhookPath } from '@/lib/shared/routes'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333'
const ROUTE_LITERAL = '/api/integraciones/whatsapp/webhook'

function listCodeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return listCodeFiles(full)
    return ['.ts', '.tsx'].includes(extname(full)) ? [full] : []
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('URL del webhook de WhatsApp', () => {
  it('R33 — la ruta es la base fija seguida del id de la conexion', () => {
    expect(WHATSAPP_WEBHOOK_ROUTE_BASE).toBe(ROUTE_LITERAL)
    expect(whatsappWebhookPath(CONNECTION_ID)).toBe(`${ROUTE_LITERAL}/${CONNECTION_ID}`)
  })

  it('R33 — la ruta esta escrita en un solo archivo de produccion, lib/shared/routes.ts', () => {
    const holders = ['app', 'lib', 'components', 'hooks']
      .flatMap((dir) => listCodeFiles(join(repoRoot, dir)))
      .filter((file) => readFileSync(file, 'utf8').includes(ROUTE_LITERAL))
      .map((file) => relative(repoRoot, file).split(sep).join('/'))
    expect(holders).toEqual(['lib/shared/routes.ts'])
  })

  it('R33 — con APP_BASE_URL la URL es absoluta y completa, sin doble barra', () => {
    vi.stubEnv('APP_BASE_URL', 'https://app.example.com/')
    expect(integraciones.whatsappWebhookUrl(CONNECTION_ID)).toEqual({
      url: `https://app.example.com${ROUTE_LITERAL}/${CONNECTION_ID}`,
      complete: true,
    })
  })

  it('R34 — sin APP_BASE_URL (ausente, vacia o en blanco) devuelve la ruta relativa y `complete: false`', () => {
    for (const value of [undefined, '', '   ']) {
      if (value === undefined) {
        vi.stubEnv('APP_BASE_URL', 'x')
        delete process.env.APP_BASE_URL
      } else {
        vi.stubEnv('APP_BASE_URL', value)
      }
      expect(integraciones.whatsappWebhookUrl(CONNECTION_ID), String(value)).toEqual({
        url: `${ROUTE_LITERAL}/${CONNECTION_ID}`,
        complete: false,
      })
    }
  })

  it('R42 — APP_BASE_URL se lee al llamar: cambiarla sin reimportar cambia la URL', () => {
    vi.stubEnv('APP_BASE_URL', 'https://uno.example.com')
    expect(integraciones.whatsappWebhookUrl(CONNECTION_ID).url).toMatch(/^https:\/\/uno\.example\.com\//)
    vi.stubEnv('APP_BASE_URL', 'https://dos.example.com')
    expect(integraciones.whatsappWebhookUrl(CONNECTION_ID).url).toMatch(/^https:\/\/dos\.example\.com\//)
  })
})
