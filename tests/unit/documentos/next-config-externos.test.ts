// El par nativo de rasterizado se carga en EJECUCION (un `import()` diferido dentro del
// adaptador de PDF) porque trae un binario `.node`. Si Next lo empaqueta para el servidor, el
// binario se queda fuera y la conversion a imagen cae con "Cannot find native binding".
//
// Dos decisiones de este archivo:
//
//   1. Afirma sobre la CONFIGURACION RESUELTA -importa el modulo y mira el objeto-, no sobre el
//      texto de `next.config.ts`. Mismo criterio que `tests/guards/guard-teclear-y-plazo.test.ts`:
//      un regex sobre el fuente dice verde con el valor escrito dentro de un comentario.
//   2. NO nombra el paquete. Lo DERIVA del propio adaptador, que es quien decide con que se
//      rasteriza: si manana se cambia de rasterizador, este test sigue exigiendo lo mismo -que lo
//      que el adaptador carga en ejecucion este declarado externo- sin tener que editarlo.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import configDeNext from '@/next.config'

/** Raiz del repo: tres niveles por encima de `tests/unit/documentos/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const ADAPTADOR = 'lib/modules/documentos/adapters/driven/pdf/pdf-converter-unpdf.ts'

/**
 * Los paquetes que el adaptador carga con `import()` diferido, que son exactamente los que
 * necesitan resolverse en ejecucion. Los especificadores relativos quedan fuera: son codigo del
 * propio repo y Next los empaqueta sin problema.
 */
function paresNativosDelAdaptador(): string[] {
  const fuente = readFileSync(join(RAIZ, ADAPTADOR), 'utf8')
  const especificadores = [...fuente.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    ([, especificador]) => especificador,
  )
  return especificadores.filter((especificador) => !especificador.startsWith('.'))
}

describe('next.config.ts', () => {
  it('la configuracion declara el par nativo de rasterizado como externo del servidor (R25)', () => {
    const pares = paresNativosDelAdaptador()

    // Si el adaptador deja de cargar nada en diferido, la derivacion de arriba se quedaria
    // satisfecha mirando una lista vacia y este test pasaria sin comprobar nada.
    expect(pares.length).toBeGreaterThan(0)

    const externos = (configDeNext as { serverExternalPackages?: unknown }).serverExternalPackages
    expect(Array.isArray(externos)).toBe(true)

    for (const par of pares) {
      expect(externos as string[]).toContain(par)
    }
  })
})
