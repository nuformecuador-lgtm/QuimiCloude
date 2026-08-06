// T4 — `verifyPasswordHash` falla CERRADO (R10, R11).
//
// PRESUPUESTO: ninguna transformacion con `DEFAULT_SCRYPT_PARAMS`. Los dos unicos casos que
// derivan de verdad usan `TEST_SCRYPT_PARAMS` (1 MiB); el resto ni siquiera llega a scrypt,
// que es justamente lo que se esta comprobando.

import { describe, expect, it, vi } from 'vitest'

import { TEST_SCRYPT_PARAMS } from '@/tests/support/password-test-params'
import { createPasswordHash, verifyPasswordHash } from '@/lib/utils/password-hash'

/**
 * Contador de llamadas reales a `crypto.scrypt`. R11 pide rechazar **sin llegar a reservar la
 * memoria**: la cota de 100 ms sola no lo demuestra, porque un `maxmem` excedido tambien falla
 * rapido (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`). Observar que la derivacion NO se invoca es lo
 * unico que distingue "rechazado en el parseo" de "rechazado por el propio scrypt".
 * Comprobado con la mutacion M5 de tasks.md: sin este contador, quitar el techo de memoria
 * dejaba el archivo en verde.
 */
const scryptSpy = vi.hoisted(() => ({ calls: 0 }))

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    scrypt: (...args: Parameters<typeof actual.scrypt>) => {
      scryptSpy.calls += 1
      return actual.scrypt(...args)
    },
  }
})

const SECRET = 'la-frase-secreta-de-ana'

/** Compone un valor almacenado pieza a pieza para poder corromper una sola de ellas. */
function compose(algorithm: string, cost: string, salt: string, key: string): string {
  return `$${algorithm}$${cost}$${salt}$${key}`
}

const VALID_COST = `n=${TEST_SCRYPT_PARAMS.n},r=${TEST_SCRYPT_PARAMS.r},p=${TEST_SCRYPT_PARAMS.p}`
const VALID_SALT = Buffer.alloc(16, 0x2a).toString('base64url')
const VALID_KEY = Buffer.alloc(32, 0x5b).toString('base64url')

/** Devuelve el resultado y si la llamada lanzo: las dos cosas que exige R10. */
async function verifySafely(
  storedHash: string,
): Promise<{ readonly result: unknown; readonly threw: unknown }> {
  try {
    return { result: await verifyPasswordHash(SECRET, storedHash), threw: null }
  } catch (error) {
    return { result: 'la llamada lanzo', threw: error }
  }
}

const INVALID_STORED_HASHES: ReadonlyArray<readonly [string, string]> = [
  ['cadena vacia', ''],
  ['solo espacios', '   '],
  ['solo el prefijo del algoritmo', '$scrypt$'],
  ['menos de 5 segmentos', `$scrypt$${VALID_COST}$${VALID_SALT}`],
  ['mas de 5 segmentos', `${compose('scrypt', VALID_COST, VALID_SALT, VALID_KEY)}$sobra`],
  ['algoritmo bcrypt', compose('bcrypt', VALID_COST, VALID_SALT, VALID_KEY)],
  ['algoritmo vacio', compose('', VALID_COST, VALID_SALT, VALID_KEY)],
  ['parametros sin n', compose('scrypt', 'r=8,p=1', VALID_SALT, VALID_KEY)],
  ['n no numerico', compose('scrypt', 'n=abc,r=8,p=1', VALID_SALT, VALID_KEY)],
  ['n que no es potencia de dos (65535)', compose('scrypt', 'n=65535,r=8,p=1', VALID_SALT, VALID_KEY)],
  ['n bajo el minimo (512)', compose('scrypt', 'n=512,r=8,p=1', VALID_SALT, VALID_KEY)],
  ['r = 0', compose('scrypt', 'n=1024,r=0,p=1', VALID_SALT, VALID_KEY)],
  ['r fuera del maximo (33)', compose('scrypt', 'n=1024,r=33,p=1', VALID_SALT, VALID_KEY)],
  ['p = 0', compose('scrypt', 'n=1024,r=8,p=0', VALID_SALT, VALID_KEY)],
  ['p = 99', compose('scrypt', 'n=1024,r=8,p=99', VALID_SALT, VALID_KEY)],
  ['sal que no decodifica en base64url', compose('scrypt', VALID_COST, 'no+es/base64url==', VALID_KEY)],
  ['sal de 8 bytes', compose('scrypt', VALID_COST, Buffer.alloc(8, 0x11).toString('base64url'), VALID_KEY)],
  ['clave de 4 bytes', compose('scrypt', VALID_COST, VALID_SALT, Buffer.alloc(4, 0x11).toString('base64url'))],
  ['clave de 128 bytes', compose('scrypt', VALID_COST, VALID_SALT, Buffer.alloc(128, 0x11).toString('base64url'))],
  ['null forzado desde JavaScript sin tipos', null as unknown as string],
  ['undefined forzado desde JavaScript sin tipos', undefined as unknown as string],
  ['un numero forzado desde JavaScript sin tipos', 12345 as unknown as string],
]

describe('verifyPasswordHash — fallo cerrado', () => {
  it('la tabla de valores invalidos cubre los 22 casos de tasks.md', () => {
    expect(INVALID_STORED_HASHES).toHaveLength(22)
    expect(new Set(INVALID_STORED_HASHES.map(([name]) => name)).size).toBe(22)
  })

  it.each(INVALID_STORED_HASHES)('devuelve false y no lanza: %s', async (_name, storedHash) => {
    const { result, threw } = await verifySafely(storedHash)
    expect(threw).toBe(null)
    expect(result).toBe(false)
  })

  it('devuelve false y no lanza ante un hash valido con un caracter alterado en la clave', async () => {
    const storedHash = await createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)
    const segments = storedHash.split('$')
    const key = segments[4] as string
    const flipped = `${key[0] === 'A' ? 'B' : 'A'}${key.slice(1)}`
    segments[4] = flipped
    const altered = segments.join('$')
    expect(altered).not.toBe(storedHash)

    const { result, threw } = await verifySafely(altered)
    expect(threw).toBe(null)
    expect(result).toBe(false)
  })

  it('el contador de derivaciones esta vivo: una verificacion legitima si llama a scrypt', async () => {
    // Sin este control, los asserts de R11 sobre `scryptSpy.calls` serian vacuos: un espia mal
    // enganchado se quedaria en 0 pase lo que pase y el techo de memoria no estaria protegido.
    const storedHash = await createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)
    const before = scryptSpy.calls
    expect(await verifyPasswordHash(SECRET, storedHash)).toBe(true)
    expect(scryptSpy.calls).toBeGreaterThan(before)
  })

  it.each([
    // 128 * 2^30 * 8 = 1 TiB. Fuera del rango de n Y por encima del techo de memoria.
    ['n = 2^30 (1 TiB)', `n=${2 ** 30},r=8,p=1`],
    // n y r estan DENTRO de sus rangos: 128 * 2^20 * 32 = 4 GiB. A este solo lo rechaza el
    // techo de memoria, asi que es el que muere si alguien lo quita (mutacion M5).
    ['n = 2^20 y r = 32 (4 GiB), ambos dentro de rango', `n=${2 ** 20},r=32,p=1`],
  ])(
    'un valor almacenado con %s devuelve false en menos de 100 ms y sin derivar nada (R11)',
    async (_name, cost) => {
      const bomb = compose('scrypt', cost, VALID_SALT, VALID_KEY)
      const callsBefore = scryptSpy.calls
      const startedAt = performance.now()
      const { result, threw } = await verifySafely(bomb)
      const elapsed = performance.now() - startedAt

      expect(threw).toBe(null)
      expect(result).toBe(false)
      expect(elapsed).toBeLessThan(100)
      // Lo que de verdad exige R11: el rechazo ocurre ANTES de reservar la memoria, o sea
      // antes de llamar a la derivacion. La cota temporal sola no lo distingue de un scrypt
      // que revienta rapido por `maxmem`.
      expect(scryptSpy.calls).toBe(callsBefore)
    },
  )

  it('CASO DE CONTROL: un valor almacenado valido con la entrada correcta devuelve true', async () => {
    // Sin este caso, una implementacion que devolviera siempre `false` pasaria el archivo.
    const storedHash = await createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)
    expect(await verifyPasswordHash(SECRET, storedHash)).toBe(true)
  })
})
