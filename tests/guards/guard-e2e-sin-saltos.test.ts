// Guardia de QC-255 (R19): ningun E2E se salta, se marca como fallo esperado ni se aisla.
//
// La suite E2E estuvo en rojo un mes por casos escritos contra una UI que cambio a proposito. La
// salida facil a un caso rojo es `test.skip` o `test.fixme`, y un `.only` olvidado deja la suite
// corriendo un solo caso en verde. Esta guardia hace mecanico el «nunca se relaja»: un caso que ya
// no vale se adapta o se lleva a decision humana, no se apaga. Nombra archivo y linea.
//
// Vive en `tests/guards/` porque `init.sh` no corre Playwright. `forbidOnly` de
// `playwright.config.ts` solo muerde en CI y solo con `.only`; esto muerde antes y con los cuatro.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const RAIZ_E2E = 'e2e'
const SUFIJO_DE_SPEC = '.spec.ts'

/** `test.skip(`, `test.fixme(`, `test.fail(`, `test.only(`, y lo mismo colgado de `describe`. */
const SALTO = /\b(?:test|it|describe)(?:\.describe)?\.(skip|fixme|fail|only)\s*\(/

type Hallazgo = { archivo: string; linea: number; salto: string }

function sinComentarioDeLinea(linea: string): string {
  const indice = linea.indexOf('//')
  return indice === -1 ? linea : linea.slice(0, indice)
}

/** Analisis puro sobre (ruta, contenido): no lee disco. Ignora los comentarios de linea. */
function saltos(archivo: string, contenido: string): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  contenido.split(/\r?\n/).forEach((linea, indice) => {
    const coincidencia = SALTO.exec(sinComentarioDeLinea(linea))
    if (coincidencia) hallazgos.push({ archivo, linea: indice + 1, salto: coincidencia[1] })
  })
  return hallazgos
}

function specs(directorio: string): string[] {
  const absoluto = join(RAIZ, directorio)
  if (!existsSync(absoluto)) return []
  const salida: string[] = []
  for (const entrada of readdirSync(absoluto, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name)
    if (entrada.isDirectory()) salida.push(...specs(ruta))
    else if (entrada.name.endsWith(SUFIJO_DE_SPEC)) salida.push(relative(RAIZ, join(RAIZ, ruta)).replace(/\\/g, '/'))
  }
  return salida
}

describe('guardia de QC-255 — ningun E2E se salta ni se aisla', () => {
  it('muerde ante skip, fixme, fail y only, en test y en describe, con archivo y linea', () => {
    const sintetico = [
      "test.skip('a', async () => {})",
      "test.fixme('b', async () => {})",
      "test.fail('c', async () => {})",
      "test.only('d', async () => {})",
      "test.describe.only('e', () => {})",
      "test.describe.skip('f', () => {})",
      "test('normal', async () => {})",
      "// test.skip('comentado') no cuenta",
    ].join('\n')

    expect(saltos('e2e/nuevo.spec.ts', sintetico).map((h) => `${h.linea}:${h.salto}`)).toEqual([
      '1:skip',
      '2:fixme',
      '3:fail',
      '4:only',
      '5:only',
      '6:skip',
    ])
  })

  it('ningun spec de e2e/ contiene un salto', () => {
    const archivos = specs(RAIZ_E2E)
    expect(archivos.length).toBeGreaterThan(0)

    const hallazgos = archivos.flatMap((archivo) =>
      saltos(archivo, readFileSync(join(RAIZ, archivo), 'utf8')),
    )

    expect(
      hallazgos.map(
        (h) => `${h.archivo}:${h.linea} usa .${h.salto}( — adapta el caso o llevalo a decision humana`,
      ),
    ).toEqual([])
  })
})
