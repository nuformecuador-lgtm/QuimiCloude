// Variables de entorno del cifrado de credenciales de integraciones.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const ENCRYPTION_VARS = ['INTEGRATIONS_ENCRYPTION_KEYS', 'INTEGRATIONS_ENCRYPTION_ACTIVE'] as const

describe('.env.example declara las variables del cifrado', () => {
  const source = readFileSync(join(repoRoot, '.env.example'), 'utf8')

  it.each(ENCRYPTION_VARS)('R22: %s está declarada una sola vez, vacía y con su comentario', (name) => {
    const declaraciones = source.split(/\r?\n/).filter((line) => line.startsWith(`${name}=`))
    expect(declaraciones).toEqual([`${name}=`])

    const lineas = source.split(/\r?\n/)
    const anterior = lineas[lineas.indexOf(`${name}=`) - 1] ?? ''
    expect(anterior, `${name} debe llevar un comentario justo encima`).toMatch(/^#\s*\S/)
  })
})
