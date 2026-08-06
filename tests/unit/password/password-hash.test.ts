// T3 — Comportamiento de `createPasswordHash` / `verifyPasswordHash` (R1-R7, R9, R12, R13, R15).
//
// PRESUPUESTO: este archivo NUNCA hashea con `DEFAULT_SCRYPT_PARAMS`. Todo caso usa
// `TEST_SCRYPT_PARAMS` (1 MiB). El unico archivo autorizado a pagar el coste real es
// `password-cost.test.ts` (design.md > 11, tasks.md > presupuesto).

import { beforeAll, describe, expect, it } from 'vitest'

import {
  ALTERNATE_TEST_SCRYPT_PARAMS,
  TEST_SCRYPT_PARAMS,
} from '@/tests/support/password-test-params'
import { DEFAULT_SCRYPT_PARAMS, createPasswordHash, verifyPasswordHash } from '@/lib/utils/password-hash'

const SECRET = 'la-frase-secreta-de-ana'
const BATCH_SIZE = 200

/** `$scrypt$n=..,r=..,p=..$<sal>$<clave>` -> los cinco segmentos. */
function segmentsOf(storedHash: string): readonly string[] {
  return storedHash.split('$')
}

function saltSegmentOf(storedHash: string): string {
  return segmentsOf(storedHash)[3] as string
}

function keySegmentOf(storedHash: string): string {
  const segments = segmentsOf(storedHash)
  return segments[segments.length - 1] as string
}

describe('createPasswordHash / verifyPasswordHash — comportamiento', () => {
  it('el valor almacenado no contiene la entrada en ninguna codificacion reversible', async () => {
    const plaintext = 'clave-en-claro-reconocible'
    const storedHash = await createPasswordHash(plaintext, TEST_SCRYPT_PARAMS)
    const bytes = Buffer.from(plaintext, 'utf8')

    expect(storedHash).not.toContain(plaintext)
    expect(storedHash).not.toContain(bytes.toString('base64'))
    expect(storedHash).not.toContain(bytes.toString('base64').replace(/=+$/, ''))
    expect(storedHash).not.toContain(bytes.toString('base64url'))
    expect(storedHash).not.toContain(bytes.toString('hex'))
    expect(storedHash.toLowerCase()).not.toContain(plaintext.toLowerCase())
  })

  describe('una tanda de 200 transformaciones de la MISMA entrada', () => {
    let batch: readonly string[] = []

    beforeAll(async () => {
      batch = await Promise.all(
        Array.from({ length: BATCH_SIZE }, () => createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)),
      )
    })

    it('produce 200 sales distintas, de 16 bytes cada una', () => {
      expect(batch).toHaveLength(BATCH_SIZE)
      const salts = batch.map((storedHash) => saltSegmentOf(storedHash))
      expect(new Set(salts).size).toBe(BATCH_SIZE)
      for (const salt of salts) {
        expect(Buffer.from(salt, 'base64url')).toHaveLength(16)
      }
    })

    it('produce 200 claves derivadas distintas', () => {
      // Aislar el ULTIMO segmento es lo que evita la tautologia de design.md > 5:
      // comparar el valor entero pasaria aunque la sal no entrara en la derivacion.
      const keys = batch.map((storedHash) => keySegmentOf(storedHash))
      expect(new Set(keys).size).toBe(BATCH_SIZE)
      for (const key of keys) {
        expect(Buffer.from(key, 'base64url')).toHaveLength(32)
      }
    })

    it('las 200 verificaciones de la tanda devuelven true', async () => {
      const results = await Promise.all(
        batch.map((storedHash) => verifyPasswordHash(SECRET, storedHash)),
      )
      expect(results).toHaveLength(BATCH_SIZE)
      expect(results.every((result) => result === true)).toBe(true)
    })
  })

  it('verifica correctamente la entrada correcta, con espacios, emoji y acentos', async () => {
    for (const plaintext of [
      'sencilla',
      '  con espacios  al  borde ',
      'con emoji 🔐🧪 y mas',
      'acentuada: añejo camión Ñandú',
      '',
    ]) {
      const storedHash = await createPasswordHash(plaintext, TEST_SCRYPT_PARAMS)
      expect(await verifyPasswordHash(plaintext, storedHash), JSON.stringify(plaintext)).toBe(true)
    }
  })

  it('rechaza una entrada incorrecta: primer caracter, ultimo, mayusculas y longitud', async () => {
    const plaintext = 'correcta-de-verdad'
    const storedHash = await createPasswordHash(plaintext, TEST_SCRYPT_PARAMS)

    const wrong = [
      'Xorrecta-de-verdad', // difiere en el primer caracter
      'correcta-de-verdaD', // difiere en el ultimo
      'CORRECTA-DE-VERDAD', // solo mayusculas
      'correcta-de-verda', // mas corta
      'correcta-de-verdad-', // mas larga
      '', // vacia
    ]
    for (const candidate of wrong) {
      expect(await verifyPasswordHash(candidate, storedHash), JSON.stringify(candidate)).toBe(false)
    }
  })

  it('no trunca: dos entradas que comparten 72 bytes y difieren despues no verifican cruzado', async () => {
    const shared = 'a'.repeat(72)
    const first = `${shared}X`
    const second = `${shared}Y`
    expect(Buffer.byteLength(shared, 'utf8')).toBe(72)

    const firstHash = await createPasswordHash(first, TEST_SCRYPT_PARAMS)
    const secondHash = await createPasswordHash(second, TEST_SCRYPT_PARAMS)

    expect(await verifyPasswordHash(first, firstHash)).toBe(true)
    expect(await verifyPasswordHash(second, secondHash)).toBe(true)
    expect(await verifyPasswordHash(first, secondHash)).toBe(false)
    expect(await verifyPasswordHash(second, firstHash)).toBe(false)
  })

  it('una entrada en NFD verifica contra el hash de su forma NFC, y al reves', async () => {
    // El par se escribe con escapes Unicode: si alguna herramienta normalizara el archivo,
    // los caracteres literales dejarian de ser un par NFC/NFD y el test no probaria nada.
    const nfc = '\u006e\u0069\u00f1\u006f'
    const nfd = '\u006e\u0069\u006e\u0303\u006f'
    expect(nfd.length).toBe(nfc.length + 1)
    expect(nfc).not.toBe(nfd)
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC'))

    const nfcHash = await createPasswordHash(nfc, TEST_SCRYPT_PARAMS)
    const nfdHash = await createPasswordHash(nfd, TEST_SCRYPT_PARAMS)

    expect(await verifyPasswordHash(nfd, nfcHash)).toBe(true)
    expect(await verifyPasswordHash(nfc, nfdHash)).toBe(true)
  })

  it('el valor almacenado declara el algoritmo y sus parametros', async () => {
    const storedHash = await createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)
    expect(storedHash.startsWith('$scrypt$')).toBe(true)

    const segments = segmentsOf(storedHash)
    expect(segments).toHaveLength(5)
    expect(segments[0]).toBe('')
    expect(segments[1]).toBe('scrypt')
    expect(segments[2]).toBe(
      `n=${TEST_SCRYPT_PARAMS.n},r=${TEST_SCRYPT_PARAMS.r},p=${TEST_SCRYPT_PARAMS.p}`,
    )

    const otherHash = await createPasswordHash(SECRET, ALTERNATE_TEST_SCRYPT_PARAMS)
    expect(segmentsOf(otherHash)[2]).toBe(
      `n=${ALTERNATE_TEST_SCRYPT_PARAMS.n},r=${ALTERNATE_TEST_SCRYPT_PARAMS.r},p=${ALTERNATE_TEST_SCRYPT_PARAMS.p}`,
    )
  })

  it('verifica valores generados con parametros distintos, sin recibir ninguna configuracion', async () => {
    const cheap = await createPasswordHash(SECRET, TEST_SCRYPT_PARAMS)
    const other = await createPasswordHash(SECRET, ALTERNATE_TEST_SCRYPT_PARAMS)
    expect(segmentsOf(cheap)[2]).not.toBe(segmentsOf(other)[2])

    // Dos argumentos, nada mas: ni parametros, ni entorno, ni estado global (R9).
    expect(await verifyPasswordHash(SECRET, cheap)).toBe(true)
    expect(await verifyPasswordHash(SECRET, other)).toBe(true)
    expect(await verifyPasswordHash('otra-cosa', cheap)).toBe(false)
    expect(await verifyPasswordHash('otra-cosa', other)).toBe(false)
  })

  it('el valor almacenado son a lo sumo 256 caracteres ASCII imprimibles', async () => {
    const asciiPrintable = /^[\x20-\x7e]+$/

    const cheapHash = await createPasswordHash('lo-que-sea', TEST_SCRYPT_PARAMS)
    expect(cheapHash.length).toBeLessThanOrEqual(256)
    expect(cheapHash).toMatch(asciiPrintable)

    // Con los parametros de produccion se comprueba la COTA DEL FORMATO, sin hashear: el
    // unico grado de libertad es la longitud del segmento de parametros.
    const worstCase = [
      '',
      'scrypt',
      `n=${DEFAULT_SCRYPT_PARAMS.n},r=${DEFAULT_SCRYPT_PARAMS.r},p=${DEFAULT_SCRYPT_PARAMS.p}`,
      Buffer.alloc(16, 0xff).toString('base64url'),
      Buffer.alloc(32, 0xff).toString('base64url'),
    ].join('$')
    expect(worstCase.length).toBeLessThanOrEqual(256)
    expect(worstCase).toMatch(asciiPrintable)
    expect(worstCase.length).toBe(90)
  })
})
