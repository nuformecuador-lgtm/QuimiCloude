// QC-71 T2 — el identificador de peticion (R1, R2).
//
// Dos propiedades, y la segunda es la que de verdad importa: que el archivo no declare NINGUN
// `import`. `newRequestId()` corre en el runtime del borde, donde `node:crypto` no existe, y el
// unico modo de que eso siga siendo cierto es que no haya nada que importar. El comportamiento
// se prueba ejecutando la funcion; la restriccion se prueba sobre el TEXTO del fuente, porque es
// una propiedad del codigo fuente y no del valor devuelto.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { REQUEST_ID_HEADER, newRequestId } from '@/lib/modules/observabilidad'

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
const FUENTE = 'lib/modules/observabilidad/domain/request-id.ts'

/** UUID canonico de 36 caracteres, version 4 y variante RFC 4122. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * Quita comentarios antes de buscar imports: la cabecera del fuente HABLA de imports —dice por
 * que no los hay— y una busqueda ingenua sobre el texto crudo se la tragaria como si fuera
 * codigo. Los de linea primero, igual que en `guard-middleware-edge`.
 */
function sinComentarios(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

describe('newRequestId (R1, R2)', () => {
  it('dos llamadas seguidas devuelven valores distintos (R1)', () => {
    const primero = newRequestId()
    const segundo = newRequestId()

    expect(primero).not.toBe(segundo)
  })

  it('cien llamadas seguidas no repiten ninguno (R1)', () => {
    // Un solo par distinto lo cumpliria un contador; lo que hace util al identificador es que no
    // colisione, y eso se ve en volumen.
    const ids = Array.from({ length: 100 }, () => newRequestId())

    expect(new Set(ids).size).toBe(100)
  })

  it('devuelve un UUID canonico de 36 caracteres (R2)', () => {
    const id = newRequestId()

    expect(id).toHaveLength(36)
    expect(id).toMatch(UUID_V4)
  })

  it('publica el nombre de la cabecera de peticion (R4)', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id')
  })
})

describe('el fuente del identificador no declara ningun import (R2, R3)', () => {
  const codigo = sinComentarios(readFileSync(join(repoRoot, FUENTE), 'utf8'))

  it('no hay ninguna declaracion `import`, `require(` ni `from "..."`', () => {
    expect(codigo).not.toMatch(/\bimport\b/)
    expect(codigo).not.toMatch(/\brequire\s*\(/)
    expect(codigo).not.toMatch(/\bfrom\s*['"]/)
  })

  it('usa el global crypto.randomUUID y no ningun modulo de criptografia', () => {
    expect(codigo).toContain('crypto.randomUUID()')
    expect(codigo).not.toContain('node:crypto')
  })

  it('el detector de imports no es un colador: sobre un fuente con import, dispara', () => {
    // El caso rojo del par. Sin esto, las dos aserciones de arriba pasarian igual si
    // `sinComentarios` devolviera cadena vacia por un error de regex.
    const conImport = sinComentarios("// no importo nada, lo juro\nimport { randomUUID } from 'node:crypto'\n")

    expect(conImport).toMatch(/\bimport\b/)
    expect(conImport).toMatch(/\bfrom\s*['"]/)
  })
})
