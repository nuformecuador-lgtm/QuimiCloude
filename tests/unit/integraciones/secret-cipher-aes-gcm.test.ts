// Cifrador AES-256-GCM de los secretos de integraciones.

import { randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { secretCipherAesGcm } from '@/lib/modules/integraciones/adapters/driven/security/secret-cipher-aes-gcm'
import {
  SecretUnreadableError,
  ValidationError,
  type SecretContext,
} from '@/lib/modules/integraciones'

const KEYS_VAR = 'INTEGRATIONS_ENCRYPTION_KEYS'
const ACTIVE_VAR = 'INTEGRATIONS_ENCRYPTION_ACTIVE'
const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'] as const
const BASE64 = '[A-Za-z0-9+/]'

const CONTEXT: SecretContext = {
  companyId: '7f9c2a1e-0b4d-4c7a-9e2f-3d5b8a6c1e40',
  recordId: 'c3a1d2e4-5f60-4718-8a9b-0c1d2e3f4a5b',
  field: 'access_token',
}
const PLAINTEXT = 'EAAGtoken-de-prueba-ñandú-1234567890'

const { encrypt, decrypt } = secretCipherAesGcm

let k1 = ''
let k2 = ''

function useKeys(keys: string | undefined, active: string | undefined): void {
  vi.stubEnv(KEYS_VAR, keys)
  vi.stubEnv(ACTIVE_VAR, active)
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  )
  if (outcome instanceof Error) return outcome
  throw new Error('se esperaba un rechazo con un Error')
}

function serializeError(error: Error): string {
  const own = Object.fromEntries(
    Object.getOwnPropertyNames(error).map((name) => [name, (error as unknown as Record<string, unknown>)[name]]),
  )
  return [error.message, error.stack ?? '', JSON.stringify(own)].join('\n')
}

/** Ni el texto en claro, ni una clave, ni el valor guardado ni sus partes cifradas. */
function expectNoLeak(error: Error, stored?: string): void {
  const serialized = serializeError(error)
  const forbidden = [PLAINTEXT, Buffer.from(PLAINTEXT, 'utf8').toString('base64'), k1, k2]
  if (stored !== undefined) forbidden.push(stored, ...stored.split(':').slice(1))
  for (const value of forbidden) expect(serialized).not.toContain(value)
}

function replaceAt(text: string, index: number): string {
  const current = text.charAt(index)
  return `${text.slice(0, index)}${current === 'A' ? 'B' : 'A'}${text.slice(index + 1)}`
}

function withPart(stored: string, index: number, value: string): string {
  const parts = stored.split(':')
  parts[index] = value
  return parts.join(':')
}

describe('secretCipherAesGcm', () => {
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []

  beforeEach(() => {
    for (const method of CONSOLE_METHODS) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}))
    }
    k1 = randomBytes(32).toString('base64')
    k2 = randomBytes(32).toString('base64')
    useKeys(`v1:${k1}`, 'v1')
  })

  afterEach(() => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
    consoleSpies.length = 0
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe('ida y vuelta', () => {
    it.each([
      ['ASCII', 'EAAGabc123-_.~token'],
      ['no ASCII (tildes, ñ, emoji)', 'Ñandú pidió café ☕ y 🚀 ä€'],
      ['de 1 carácter', 'x'],
      ['de 4096 caracteres', 'abcd'.repeat(1024)],
    ])('R1: un texto %s vuelve exactamente igual', async (_caso, plaintext) => {
      const stored = await encrypt(plaintext, CONTEXT)

      await expect(decrypt(stored, CONTEXT)).resolves.toBe(plaintext)
    })

    it('R2: cifrar dos veces el mismo texto da valores e IV distintos, y los dos descifran', async () => {
      const first = await encrypt(PLAINTEXT, CONTEXT)
      const second = await encrypt(PLAINTEXT, CONTEXT)

      expect(first).not.toBe(second)
      expect(first.split(':')[1]).not.toBe(second.split(':')[1])
      await expect(decrypt(first, CONTEXT)).resolves.toBe(PLAINTEXT)
      await expect(decrypt(second, CONTEXT)).resolves.toBe(PLAINTEXT)
    })
  })

  describe('forma del valor guardado', () => {
    it('R3: es v<n>:<iv>:<tag>:<ciphertext> en base64 estándar, con IV de 12 bytes y tag de 16', async () => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)

      expect(stored).toMatch(new RegExp(`^v1:${BASE64}{16}:${BASE64}{22}==:${BASE64}+={0,2}$`))
      const [, iv, tag, ciphertext] = stored.split(':') as [string, string, string, string]
      expect(Buffer.from(iv, 'base64')).toHaveLength(12)
      expect(Buffer.from(tag, 'base64')).toHaveLength(16)
      expect(Buffer.from(ciphertext, 'base64')).toHaveLength(Buffer.byteLength(PLAINTEXT, 'utf8'))
    })

    it('R3: no contiene el texto en claro ni su base64', async () => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)

      expect(stored).not.toContain(PLAINTEXT)
      expect(stored).not.toContain(Buffer.from(PLAINTEXT, 'utf8').toString('base64'))
      expect(stored).not.toContain(Buffer.from(PLAINTEXT, 'utf8').toString('base64').slice(0, 12))
    })
  })

  describe('alteración', () => {
    it.each([
      ['el IV', 1],
      ['el tag', 2],
      ['el ciphertext', 3],
    ])('R4/R14: cambiar un carácter de %s falla con el error de secreto ilegible, no con el de node:crypto', async (_parte, index) => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)
      const parts = stored.split(':')
      const tampered = withPart(stored, index, replaceAt(parts[index] as string, 0))
      expect(tampered).not.toBe(stored)

      const error = await rejection(decrypt(tampered, CONTEXT))

      expect(error).toBeInstanceOf(SecretUnreadableError)
      expect(error.name).toBe('SecretUnreadableError')
      expect((error as SecretUnreadableError).code).toBe('integration_secret_unreadable')
      expect(error.cause).toBeUndefined()
      expectNoLeak(error, tampered)
    })
  })

  describe('contexto', () => {
    it.each([
      ['la empresa', { ...CONTEXT, companyId: 'otra-empresa' }],
      ['el registro', { ...CONTEXT, recordId: 'otro-registro' }],
      ['el campo', { ...CONTEXT, field: 'app_secret' }],
    ])('R5: descifrar con otro contexto en %s falla con el error de secreto ilegible', async (_caso, other) => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)

      await expect(decrypt(stored, other)).rejects.toBeInstanceOf(SecretUnreadableError)
    })

    it('R6: dos contextos que unidos con «:» darían la misma cadena no descifran el uno el valor del otro', async () => {
      const left: SecretContext = { companyId: 'a:b', recordId: 'c', field: 'd' }
      const right: SecretContext = { companyId: 'a', recordId: 'b:c', field: 'd' }

      const storedLeft = await encrypt(PLAINTEXT, left)
      const storedRight = await encrypt(PLAINTEXT, right)

      await expect(decrypt(storedLeft, left)).resolves.toBe(PLAINTEXT)
      await expect(decrypt(storedRight, right)).resolves.toBe(PLAINTEXT)
      await expect(decrypt(storedLeft, right)).rejects.toBeInstanceOf(SecretUnreadableError)
      await expect(decrypt(storedRight, left)).rejects.toBeInstanceOf(SecretUnreadableError)
    })
  })

  describe('forma inválida', () => {
    const invalidShapes: [string, (stored: string) => string][] = [
      ['tres partes', (s) => s.split(':').slice(0, 3).join(':')],
      ['cinco partes', (s) => `${s}:AAAA`],
      ['versión v0', (s) => withPart(s, 0, 'v0')],
      ['versión con cero a la izquierda', (s) => withPart(s, 0, 'v01')],
      ['versión en mayúscula', (s) => withPart(s, 0, 'V1')],
      ['IV vacío', (s) => withPart(s, 1, '')],
      ['tag vacío', (s) => withPart(s, 2, '')],
      ['ciphertext vacío', (s) => withPart(s, 3, '')],
      ['ciphertext que no es base64', (s) => withPart(s, 3, '@@@@')],
      ['base64url en vez de estándar', (s) => withPart(s, 3, '-_-_')],
      ['IV de 11 bytes', (s) => withPart(s, 1, randomBytes(11).toString('base64'))],
      ['IV de 15 bytes', (s) => withPart(s, 1, randomBytes(15).toString('base64'))],
      ['tag de 12 bytes', (s) => withPart(s, 2, randomBytes(12).toString('base64'))],
      ['texto vacío', () => ''],
    ]

    it.each(invalidShapes)('R7/R14: %s falla con el error de secreto ilegible', async (_caso, build) => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)
      const invalid = build(stored)

      const error = await rejection(decrypt(invalid, CONTEXT))

      expect(error).toBeInstanceOf(SecretUnreadableError)
      expect((error as SecretUnreadableError).diagnostic).toBe('forma inválida')
      expectNoLeak(error, stored)
    })
  })

  describe('versiones de la clave', () => {
    it('R8/R14: una versión que no está en la lista falla nombrándola en el diagnóstico, sin ninguna clave', async () => {
      useKeys(`v1:${k1},v2:${k2}`, 'v2')
      const stored = await encrypt(PLAINTEXT, CONTEXT)
      useKeys(`v1:${k1}`, 'v1')

      const error = await rejection(decrypt(stored, CONTEXT))

      expect(error).toBeInstanceOf(SecretUnreadableError)
      expect((error as SecretUnreadableError).diagnostic).toBe('versión v2 no configurada')
      expectNoLeak(error, stored)
    })

    it('R9: se cifra con la activa y se descifra con la del valor guardado; v1 sigue legible tras activar v2', async () => {
      const storedV1 = await encrypt(PLAINTEXT, CONTEXT)
      expect(storedV1.startsWith('v1:')).toBe(true)

      useKeys(`v1:${k1},v2:${k2}`, 'v2')
      const storedV2 = await encrypt(PLAINTEXT, CONTEXT)

      expect(storedV2.startsWith('v2:')).toBe(true)
      await expect(decrypt(storedV1, CONTEXT)).resolves.toBe(PLAINTEXT)
      await expect(decrypt(storedV2, CONTEXT)).resolves.toBe(PLAINTEXT)
    })

    it('R9: descifrar usa la clave de la versión del valor, no la de la activa', async () => {
      const storedV1 = await encrypt(PLAINTEXT, CONTEXT)
      useKeys(`v1:${k2},v2:${k1}`, 'v2')

      await expect(decrypt(storedV1, CONTEXT)).rejects.toBeInstanceOf(SecretUnreadableError)
    })

    it('R10: un cambio de la versión activa entre dos llamadas se refleja en la segunda', async () => {
      useKeys(`v1:${k1},v2:${k2}`, 'v1')
      const first = await encrypt(PLAINTEXT, CONTEXT)
      vi.stubEnv(ACTIVE_VAR, 'v2')
      const second = await encrypt(PLAINTEXT, CONTEXT)

      expect(first.split(':')[0]).toBe('v1')
      expect(second.split(':')[0]).toBe('v2')
    })

    it.each([
      ['ausente', undefined],
      ['mal formada', 'zqxjk'],
      ['fuera de la lista', 'v7'],
    ])('R12: descifrar funciona con la versión activa %s', async (_caso, active) => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)
      vi.stubEnv(ACTIVE_VAR, active)

      await expect(decrypt(stored, CONTEXT)).resolves.toBe(PLAINTEXT)
    })

    it('R12/R14: cifrar sin versión activa falla con un Error que nombra la variable, sin claves', async () => {
      vi.stubEnv(ACTIVE_VAR, undefined)

      const error = await rejection(encrypt(PLAINTEXT, CONTEXT))

      expect(error).not.toBeInstanceOf(SecretUnreadableError)
      expect(error.message).toContain(ACTIVE_VAR)
      expectNoLeak(error)
    })

    it.each([
      ['cifrar', () => encrypt(PLAINTEXT, CONTEXT)],
      ['descifrar', () => decrypt(`v1:${'A'.repeat(16)}:${'A'.repeat(22)}==:AAAA`, CONTEXT)],
    ])('R11/R14: %s sin lista de claves falla con un Error que nombra la variable', async (_caso, run) => {
      vi.stubEnv(KEYS_VAR, undefined)

      const error = await rejection(run())

      expect(error).not.toBeInstanceOf(SecretUnreadableError)
      expect(error.message).toContain(KEYS_VAR)
      expectNoLeak(error)
    })
  })

  describe('entradas inválidas', () => {
    it('R13: cifrar un texto vacío falla con invalid_input', async () => {
      const error = await rejection(encrypt('', CONTEXT))

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).code).toBe('invalid_input')
    })

    it.each([
      ['la empresa', { ...CONTEXT, companyId: '' }],
      ['el registro', { ...CONTEXT, recordId: '' }],
      ['el campo', { ...CONTEXT, field: '' }],
    ])('R13/R14: cifrar y descifrar con %s vacío fallan con invalid_input, sin fuga', async (_caso, incomplete) => {
      const stored = await encrypt(PLAINTEXT, CONTEXT)

      const onEncrypt = await rejection(encrypt(PLAINTEXT, incomplete))
      const onDecrypt = await rejection(decrypt(stored, incomplete))

      for (const error of [onEncrypt, onDecrypt]) {
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).code).toBe('invalid_input')
        expectNoLeak(error, stored)
      }
    })
  })
})
