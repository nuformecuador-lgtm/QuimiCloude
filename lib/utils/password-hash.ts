// T1 — Modulo de transformacion y verificacion de credenciales (feature 2).
//
// Helper puro: no lee base de datos, no lee `process.env`, no habla HTTP y no escribe en
// ningun canal de salida (R9, R17). Node-only: `scrypt` no existe en el runtime Edge, asi
// que nadie puede importarlo desde `middleware.ts` (R18, vigilado por
// `tests/guards/guard-password-hash-module.test.ts`).
//
// Formato del valor almacenado (design.md > 4):
//   $scrypt$n=<n>,r=<r>,p=<p>$<sal base64url>$<clave derivada base64url>
//
// Los nombres de la API los fija `guard-password-never-plaintext` de la feature 1
// (design.md > 9.1): `createPasswordHash` / `verifyPasswordHash`, parametros `plaintext` y
// `storedHash`.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/** Parametros de coste de scrypt. Viajan dentro del valor almacenado (design.md > 4). */
export type ScryptCostParams = {
  readonly n: number
  readonly r: number
  readonly p: number
}

/** Coste vigente: 128 * n * r = 64 MiB por transformacion (design.md > 3.2). */
export const DEFAULT_SCRYPT_PARAMS: ScryptCostParams = { n: 65536, r: 8, p: 2 }

/** Techo de memoria admitido al derivar; hace cumplir R11. 192 MiB. */
export const MAX_SCRYPT_MEMORY_BYTES = 192 * 1024 * 1024

const ALGORITHM_ID = 'scrypt'
const SALT_LENGTH_BYTES = 16
const KEY_LENGTH_BYTES = 32
const MIN_N = 1024 // 2^10
const MAX_N = 1048576 // 2^20
const MIN_R = 1
const MAX_R = 32
const MIN_P = 1
const MAX_P = 16
const MIN_STORED_KEY_BYTES = 16
const MAX_STORED_KEY_BYTES = 64
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const PARAMS_PATTERN = /^n=(\d{1,12}),r=(\d{1,12}),p=(\d{1,12})$/

/** Memoria de trabajo que exigen unos parametros de coste. */
function memoryBytesFor(params: ScryptCostParams): number {
  return 128 * params.n * params.r
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

/**
 * Rangos de design.md > 6, incluido el techo de memoria que cierra R11.
 * PRIVADA a proposito: no forma parte del contrato publico (design.md > 9) y nadie fuera de
 * este archivo la usa. Exportarla "por si acaso" seria API sin consumidor.
 */
function areUsableCostParams(params: ScryptCostParams): boolean {
  const { n, r, p } = params
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false
  if (n < MIN_N || n > MAX_N || !isPowerOfTwo(n)) return false
  if (r < MIN_R || r > MAX_R) return false
  if (p < MIN_P || p > MAX_P) return false
  return memoryBytesFor(params) <= MAX_SCRYPT_MEMORY_BYTES
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/**
 * Decodifica base64url de forma ESTRICTA: `Buffer.from` ignora los caracteres que no
 * pertenecen al alfabeto, asi que sin el ida y vuelta un segmento corrupto se aceptaria.
 */
function fromBase64Url(segment: string): Buffer | null {
  if (!BASE64URL_PATTERN.test(segment)) return null
  const bytes = Buffer.from(segment, 'base64url')
  if (bytes.length === 0) return null
  return toBase64Url(bytes) === segment ? bytes : null
}

/** Deriva la clave con la variante ASINCRONA de scrypt: el hilo principal queda libre (R16). */
function deriveKey(
  plaintext: string,
  salt: Buffer,
  params: ScryptCostParams,
  keyLength: number,
): Promise<Buffer> {
  const normalized = Buffer.from(plaintext.normalize('NFC'), 'utf8')
  return new Promise((resolve, reject) => {
    scrypt(
      normalized,
      salt,
      keyLength,
      { N: params.n, r: params.r, p: params.p, maxmem: MAX_SCRYPT_MEMORY_BYTES },
      (error, derivedKey) => {
        if (error !== null) reject(error)
        else resolve(derivedKey)
      },
    )
  })
}

/**
 * Transforma una credencial en su valor almacenable.
 * Sal nueva de 16 bytes en cada llamada: dos llamadas con la misma entrada devuelven
 * valores distintos (R2, R3).
 * `params` existe para abaratar los tests y para rotar el coste; en produccion se omite.
 * Lanza solo si `params` esta fuera de rango: eso es un error del programador.
 */
export async function createPasswordHash(
  plaintext: string,
  params: ScryptCostParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  if (!areUsableCostParams(params)) {
    throw new RangeError(
      `parametros de coste fuera de rango: n=${params.n}, r=${params.r}, p=${params.p}`,
    )
  }
  const salt = randomBytes(SALT_LENGTH_BYTES)
  const derivedKey = await deriveKey(plaintext, salt, params, KEY_LENGTH_BYTES)
  const cost = `n=${params.n},r=${params.r},p=${params.p}`
  return `$${ALGORITHM_ID}$${cost}$${toBase64Url(salt)}$${toBase64Url(derivedKey)}`
}

type ParsedStoredHash = {
  readonly params: ScryptCostParams
  readonly salt: Buffer
  readonly storedKey: Buffer
}

/**
 * Interpreta el valor almacenado. Devuelve `null` ante cualquier anomalia y NUNCA lanza:
 * valida el algoritmo, los cinco segmentos, los rangos y el techo de memoria ANTES de que
 * nadie pueda derivar nada (R10, R11).
 */
function parseStoredHash(storedHash: string): ParsedStoredHash | null {
  if (typeof storedHash !== 'string' || storedHash.length === 0) return null

  const segments = storedHash.split('$')
  if (segments.length !== 5) return null
  const [prefix, algorithm, cost, saltSegment, keySegment] = segments as [
    string,
    string,
    string,
    string,
    string,
  ]
  if (prefix !== '') return null
  if (algorithm !== ALGORITHM_ID) return null

  const costMatch = PARAMS_PATTERN.exec(cost)
  if (costMatch === null) return null
  const params: ScryptCostParams = {
    n: Number.parseInt(costMatch[1] as string, 10),
    r: Number.parseInt(costMatch[2] as string, 10),
    p: Number.parseInt(costMatch[3] as string, 10),
  }
  if (!areUsableCostParams(params)) return null

  const salt = fromBase64Url(saltSegment)
  if (salt === null || salt.length < SALT_LENGTH_BYTES) return null

  const storedKey = fromBase64Url(keySegment)
  if (storedKey === null) return null
  if (storedKey.length < MIN_STORED_KEY_BYTES || storedKey.length > MAX_STORED_KEY_BYTES) {
    return null
  }

  return { params, salt, storedKey }
}

/**
 * Responde si `plaintext` corresponde a `storedHash`.
 * Falla cerrado: cualquier `storedHash` vacio, mal formado o con parametros fuera de rango
 * devuelve `false` sin lanzar (R10, R11).
 * No recibe parametros de coste: los lee del propio `storedHash` (R9, R12, R13).
 */
export async function verifyPasswordHash(plaintext: string, storedHash: string): Promise<boolean> {
  if (typeof plaintext !== 'string') return false
  const parsed = parseStoredHash(storedHash)
  if (parsed === null) return false

  let derivedKey: Buffer
  try {
    derivedKey = await deriveKey(plaintext, parsed.salt, parsed.params, parsed.storedKey.length)
  } catch {
    // El error se MANEJA, no se traga: un valor almacenado que no se puede derivar es una
    // no-coincidencia. Propagarlo daria dos salidas distinguibles en el login (design.md > 6).
    return false
  }

  // Longitudes antes de comparar: `timingSafeEqual` lanza si difieren (design.md > 6).
  if (derivedKey.length !== parsed.storedKey.length) return false
  return timingSafeEqual(derivedKey, parsed.storedKey)
}
