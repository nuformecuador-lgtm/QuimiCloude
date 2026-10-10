// Resumidor de los secretos que solo se comparan.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  digestOfSecret,
  secretDigestSha256,
  secretMatchesDigest,
} from '@/lib/modules/integraciones/adapters/driven/security/secret-digest-sha256'

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
const CONSOLE_METHODS = ['log', 'warn', 'error', 'info', 'debug'] as const

describe('secretDigestSha256', () => {
  const consoleSpies: ReturnType<typeof vi.spyOn>[] = []

  beforeEach(() => {
    vi.mocked(timingSafeEqual).mockClear()
    for (const method of CONSOLE_METHODS) {
      consoleSpies.push(vi.spyOn(console, method).mockImplementation(() => {}))
    }
  })

  afterEach(() => {
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
    consoleSpies.length = 0
    vi.restoreAllMocks()
  })

  it('R15: el resumen de abc es el vector conocido de SHA-256, en hex minúscula de 64', () => {
    expect(digestOfSecret('abc')).toBe(ABC_SHA256)
    expect(secretDigestSha256.digestOf('abc')).toBe(ABC_SHA256)
  })

  it('R15: el resumen es determinista y resume el texto en UTF-8', () => {
    const secret = randomBytes(32).toString('base64url')

    expect(digestOfSecret(secret)).toBe(digestOfSecret(secret))
    expect(digestOfSecret(secret)).toMatch(/^[0-9a-f]{64}$/)
    expect(digestOfSecret('ñandú 🚀')).toBe(
      createHash('sha256').update(Buffer.from('ñandú 🚀', 'utf8')).digest('hex'),
    )
  })

  it('R14/R15: el resumen no contiene el secreto', () => {
    const secret = randomBytes(32).toString('hex')

    expect(digestOfSecret(secret)).not.toContain(secret.slice(0, 8))
  })

  it('R16: el mismo secreto casa con su resumen guardado', () => {
    const secret = randomBytes(32).toString('base64url')

    expect(secretMatchesDigest(secret, digestOfSecret(secret))).toBe(true)
    expect(secretDigestSha256.matches(secret, digestOfSecret(secret))).toBe(true)
  })

  it('R16: un secreto distinto no casa', () => {
    const stored = digestOfSecret(randomBytes(32).toString('base64url'))

    expect(secretMatchesDigest(randomBytes(32).toString('base64url'), stored)).toBe(false)
    expect(secretMatchesDigest('abc', digestOfSecret('abd'))).toBe(false)
  })

  it.each([
    ['63 caracteres', ABC_SHA256.slice(0, 63)],
    ['65 caracteres', `${ABC_SHA256}0`],
    ['vacío', ''],
    ['en mayúsculas', ABC_SHA256.toUpperCase()],
    ['con caracteres que no son hex', `${ABC_SHA256.slice(0, 62)}zg`],
    ['con espacios alrededor', ` ${ABC_SHA256} `],
  ])('R16/R17: un resumen guardado mal formado (%s) da falso sin lanzar y sin comparar', (_caso, stored) => {
    expect(() => secretMatchesDigest('abc', stored)).not.toThrow()
    expect(secretMatchesDigest('abc', stored)).toBe(false)
    expect(timingSafeEqual).not.toHaveBeenCalled()
  })

  it('R17: cada comparación con un resumen bien formado pasa una vez por timingSafeEqual con 32 contra 32 bytes', () => {
    const matching = secretMatchesDigest('abc', ABC_SHA256)
    expect(matching).toBe(true)
    expect(timingSafeEqual).toHaveBeenCalledTimes(1)

    const notMatching = secretMatchesDigest('un secreto mucho más largo que el resumen', ABC_SHA256)
    expect(notMatching).toBe(false)
    expect(timingSafeEqual).toHaveBeenCalledTimes(2)

    for (const [left, right] of vi.mocked(timingSafeEqual).mock.calls) {
      expect((left as Buffer).length).toBe(32)
      expect((right as Buffer).length).toBe(32)
    }
  })
})
