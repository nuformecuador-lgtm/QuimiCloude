// Guardia del anillo de foco.
//
// Un anillo o contorno de foco con `--ring` translúcido (`ring-ring/50`, `outline-ring/50`) no
// llega a 3:1 contra el fondo. Una clase es texto, así que se busca en el texto: recorre `app/`
// (`.ts`, `.tsx`, `.css`) y `components/` (`.ts`, `.tsx`). El detector se prueba primero con un
// fuente inventado que lo contiene, para que el verde del barrido real no sea un falso verde.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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

const BARRIDO = [
  { carpeta: 'app', extension: /\.(tsx?|css)$/ },
  { carpeta: 'components', extension: /\.tsx?$/ },
] as const

/** Si el barrido devolviera pocos archivos, el `toEqual([])` de abajo seria un falso verde. */
const ARCHIVOS_MINIMOS = 50

const ANILLO_TRANSLUCIDO = /(ring|outline)-ring\/\d+/g

function archivos(carpeta: string, extension: RegExp): string[] {
  return readdirSync(join(repoRoot, carpeta), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && extension.test(e.name))
    .map((e) => relative(repoRoot, join(e.parentPath, e.name)).split('\\').join('/'))
}

function hallazgos(ruta: string, fuente: string): string[] {
  return fuente
    .split(/\r?\n/)
    .flatMap((linea, i) =>
      [...linea.matchAll(ANILLO_TRANSLUCIDO)].map((m) => `${ruta}:${i + 1} ${m[0]}`),
    )
}

describe('guardia: ningun anillo ni contorno de foco con --ring translucido', () => {
  it('R22: el detector muerde un anillo y un contorno translucidos y deja pasar los opacos', () => {
    const fuente = [
      "const a = 'focus-visible:ring-3 focus-visible:ring-ring/50'",
      '* { @apply border-border outline-ring/50; }',
      "const b = 'focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-ring'",
      "const c = 'aria-invalid:ring-destructive/20'",
    ].join('\n')

    expect(hallazgos('inventado.tsx', fuente)).toEqual([
      'inventado.tsx:1 ring-ring/50',
      'inventado.tsx:2 outline-ring/50',
    ])
  })

  it('R22: app/ y components/ no tienen ring-ring/<n> ni outline-ring/<n>', () => {
    const rutas = BARRIDO.flatMap(({ carpeta, extension }) => archivos(carpeta, extension))
    expect(rutas.length).toBeGreaterThanOrEqual(ARCHIVOS_MINIMOS)
    expect(rutas).toContain('app/globals.css')

    const encontrados = rutas.flatMap((ruta) =>
      hallazgos(ruta, readFileSync(join(repoRoot, ruta), 'utf8')),
    )
    expect(encontrados).toEqual([])
  })
})
