// T7 — Guardia: propiedades ESTATICAS del modulo de contrasenas (R8).
//
// Mira TEXTO, no comportamiento: "no escribe en ningun canal de salida" y "no usa la API
// sincrona" son propiedades del fuente que ningun test de comportamiento observa. Por eso
// vive en `tests/guards/` y la selecciona `pnpm run test:guardias`.
//
// Cada regla se autocomprueba sobre un fuente SINTETICO que la viola (mismo patron que las
// guardias de la feature 1): un `expect(...).toEqual([])` sobre un archivo que ya cumple no
// demuestra que la guardia funcione.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const moduleSource = readFileSync(join(repoRoot, 'lib', 'utils', 'password-hash.ts'), 'utf8')

/** Los comentarios explican; no ejecutan. Se quitan antes de juzgar el codigo. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Canales por los que el modulo podria filtrar la contrasena o el valor guardado (R8). */
export function findOutputChannels(source: string): readonly string[] {
  return [
    ...stripComments(source).matchAll(/\b(console\s*\.\s*\w+|process\s*\.\s*std(?:out|err))\b/g),
  ].map((match) => (match[1] as string).replace(/\s+/g, ''))
}

/** API sincrona de bcryptjs: bloquearia el event loop de la funcion serverless entera. */
export function findBlockingCalls(source: string): readonly string[] {
  return [...stripComments(source).matchAll(/\b(hashSync|compareSync|genSaltSync)\b/g)].map(
    (match) => match[1] as string,
  )
}

describe('guardia — modulo de contrasenas', () => {
  it('el modulo no escribe en ningun canal de salida', () => {
    expect(moduleSource.length, 'el modulo no se pudo leer').toBeGreaterThan(0)
    expect(findOutputChannels(moduleSource)).toEqual([])
  })

  it('la regla de canales de salida detecta un console y una escritura directa a stdout', () => {
    expect(findOutputChannels('console.log(plaintext)')).toEqual(['console.log'])
    expect(findOutputChannels('console . error(storedHash)')).toEqual(['console.error'])
    expect(findOutputChannels('process.stdout.write(storedHash)')).toEqual(['process.stdout'])
    expect(findOutputChannels('process.stderr.write(storedHash)')).toEqual(['process.stderr'])
    // Un comentario que mencione console no es una escritura.
    expect(findOutputChannels('// console.log(plaintext)')).toEqual([])
  })

  it('el modulo usa la API asincrona de bcryptjs: nada de hashSync ni compareSync', () => {
    expect(findBlockingCalls(moduleSource)).toEqual([])
  })

  it('la regla de API sincrona detecta cada forma bloqueante', () => {
    expect(findBlockingCalls('const stored = hashSync(plaintext, 10)')).toEqual(['hashSync'])
    expect(findBlockingCalls('return compareSync(plaintext, storedHash)')).toEqual(['compareSync'])
    expect(findBlockingCalls('const salt = genSaltSync(10)')).toEqual(['genSaltSync'])
    // Y no marca la API asincrona, que es justo la que se exige.
    expect(findBlockingCalls('return hash(plaintext, BCRYPT_ROUNDS)')).toEqual([])
    expect(findBlockingCalls('return await compare(plaintext, storedHash)')).toEqual([])
    expect(findBlockingCalls('// antes esto era hashSync(plaintext, 10)')).toEqual([])
  })
})
