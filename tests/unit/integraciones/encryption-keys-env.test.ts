// Variables de entorno del cifrado de credenciales de integraciones.

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readActiveKeyVersion,
  readEncryptionKeyRing,
} from '@/lib/modules/integraciones/adapters/driven/config/encryption-keys-env'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

const ENCRYPTION_VARS = ['INTEGRATIONS_ENCRYPTION_KEYS', 'INTEGRATIONS_ENCRYPTION_ACTIVE'] as const
const KEYS_VAR = 'INTEGRATIONS_ENCRYPTION_KEYS'
const ACTIVE_VAR = 'INTEGRATIONS_ENCRYPTION_ACTIVE'
const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'] as const

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

function newKey(): string {
  return randomBytes(32).toString('base64')
}

function captureError(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('se lanzó algo que no es un Error')
  }
  throw new Error('se esperaba un error y no se lanzó')
}

/** Todo lo que el error podría llevar a un log: mensaje, pila y propiedades propias. */
function serializeError(error: Error): string {
  const own = Object.fromEntries(
    Object.getOwnPropertyNames(error).map((name) => [name, (error as unknown as Record<string, unknown>)[name]]),
  )
  return [error.message, error.stack ?? '', JSON.stringify(own)].join('\n')
}

/** Trozos de más de 4 caracteres del valor de la variable que aparecen en el error. */
function leakedFragments(error: Error, value: string): string[] {
  const serialized = serializeError(error)
  const leaks: string[] = []
  for (let start = 0; start + 5 <= value.length; start++) {
    const fragment = value.slice(start, start + 5)
    if (serialized.includes(fragment)) leaks.push(fragment)
  }
  return leaks
}

describe('lista de claves INTEGRATIONS_ENCRYPTION_KEYS', () => {
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []

  beforeEach(() => {
    for (const method of CONSOLE_METHODS) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}))
    }
  })

  afterEach(() => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
    consoleSpies.length = 0
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('R10/R11: una lista bien formada da cada versión con su clave de 32 bytes, recortando espacios', () => {
    const k1 = newKey()
    const k2 = newKey()
    vi.stubEnv(KEYS_VAR, ` v1:${k1} , v2:${k2} `)

    const ring = readEncryptionKeyRing()

    expect([...ring.keys()]).toEqual(['v1', 'v2'])
    expect(ring.get('v1')?.equals(Buffer.from(k1, 'base64'))).toBe(true)
    expect(ring.get('v2')?.length).toBe(32)
  })

  it.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['solo espacios', '   '],
  ])('R11: %s falla nombrando la variable', (_caso, value) => {
    vi.stubEnv(KEYS_VAR, value)

    const error = captureError(() => readEncryptionKeyRing())

    expect(error.message).toBe(`falta la variable de entorno ${KEYS_VAR}`)
  })

  it.each([
    ['una entrada sin separador', (k: string) => `v1:${k},zqxjkwvbmq`, 2],
    ['una versión con cero a la izquierda', (k: string) => `v01:${k}`, 1],
    ['una versión en mayúscula', (k: string) => `V1:${k}`, 1],
    ['una versión que no es v<n>', (k: string) => `v1:${k},qzx9:${k}`, 2],
    ['una entrada vacía', (k: string) => `v1:${k},,v2:${k}`, 2],
  ])('R11/R14: %s da la posición, no la etiqueta ni ningún trozo del valor', (_caso, build, position) => {
    const value = build(newKey())
    vi.stubEnv(KEYS_VAR, value)

    const error = captureError(() => readEncryptionKeyRing())

    expect(error.message).toBe(`${KEYS_VAR}: la entrada ${position} no tiene la forma v<n>:<base64>`)
    expect(leakedFragments(error, value)).toEqual([])
  })

  it.each([
    ['no es base64', () => 'zq@x#jk!wv$bm%q^zq&x*jk(wv)bm-q+zq=x_jkwvbmq'],
    ['es base64 con caracteres sobrantes', () => `${newKey()}!!`],
    ['no da 32 bytes', () => randomBytes(16).toString('base64')],
    ['da 33 bytes', () => randomBytes(33).toString('base64')],
  ])('R11/R14: una clave que %s nombra su versión y no filtra el valor', (_caso, badKey) => {
    const value = `v1:${newKey()},v2:${badKey()}`
    vi.stubEnv(KEYS_VAR, value)

    const error = captureError(() => readEncryptionKeyRing())

    expect(error.message).toBe(`${KEYS_VAR}: la clave v2 no son 32 bytes en base64`)
    expect(leakedFragments(error, value)).toEqual([])
  })

  it('R11/R14: una versión repetida la nombra y no filtra ninguna clave', () => {
    const value = `v1:${newKey()},v1:${newKey()}`
    vi.stubEnv(KEYS_VAR, value)

    const error = captureError(() => readEncryptionKeyRing())

    expect(error.message).toBe(`${KEYS_VAR}: la versión v1 aparece dos veces`)
    expect(leakedFragments(error, value)).toEqual([])
  })

  it('R10: se lee en cada llamada, y un cambio entre dos llamadas se refleja en la segunda', () => {
    const k1 = newKey()
    const k2 = newKey()

    vi.stubEnv(KEYS_VAR, `v1:${k1}`)
    expect([...readEncryptionKeyRing().keys()]).toEqual(['v1'])

    vi.stubEnv(KEYS_VAR, `v1:${k1},v2:${k2}`)
    expect([...readEncryptionKeyRing().keys()]).toEqual(['v1', 'v2'])

    vi.stubEnv(KEYS_VAR, undefined)
    expect(() => readEncryptionKeyRing()).toThrow(KEYS_VAR)
  })
})

describe('versión activa INTEGRATIONS_ENCRYPTION_ACTIVE', () => {
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []
  let keysValue = ''

  beforeEach(() => {
    for (const method of CONSOLE_METHODS) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}))
    }
    keysValue = `v1:${newKey()},v2:${newKey()}`
    vi.stubEnv(KEYS_VAR, keysValue)
  })

  afterEach(() => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
    consoleSpies.length = 0
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('R12: una versión de la lista es la activa', () => {
    vi.stubEnv(ACTIVE_VAR, 'v2')

    expect(readActiveKeyVersion(readEncryptionKeyRing())).toBe('v2')
  })

  it.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['solo espacios', '  '],
  ])('R12: %s falla nombrando la variable', (_caso, value) => {
    vi.stubEnv(ACTIVE_VAR, value)

    const error = captureError(() => readActiveKeyVersion(readEncryptionKeyRing()))

    expect(error.message).toBe(`falta la variable de entorno ${ACTIVE_VAR}`)
  })

  it.each(['zqxjkwvbmq', 'v01', 'V2', 'v1,v2'])(
    'R12/R14: mal formada (%s) falla nombrando la variable, sin su valor ni la lista de claves',
    (value) => {
      vi.stubEnv(ACTIVE_VAR, value)

      const error = captureError(() => readActiveKeyVersion(readEncryptionKeyRing()))

      expect(error.message).toContain(ACTIVE_VAR)
      expect(serializeError(error)).not.toContain(value)
      expect(leakedFragments(error, keysValue)).toEqual([])
    },
  )

  it('R12/R14: una versión que no está en la lista falla nombrando las dos variables, sin sus valores', () => {
    vi.stubEnv(ACTIVE_VAR, 'v3')

    const error = captureError(() => readActiveKeyVersion(readEncryptionKeyRing()))

    expect(error.message).toContain(ACTIVE_VAR)
    expect(error.message).toContain(KEYS_VAR)
    expect(serializeError(error)).not.toContain('v3')
    expect(leakedFragments(error, keysValue)).toEqual([])
  })

  it('R10: se lee en cada llamada, y un cambio entre dos llamadas se refleja en la segunda', () => {
    const ring = readEncryptionKeyRing()

    vi.stubEnv(ACTIVE_VAR, 'v1')
    expect(readActiveKeyVersion(ring)).toBe('v1')

    vi.stubEnv(ACTIVE_VAR, 'v2')
    expect(readActiveKeyVersion(ring)).toBe('v2')
  })
})
