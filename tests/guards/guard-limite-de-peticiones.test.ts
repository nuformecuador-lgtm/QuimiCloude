// Guardia del limite de peticiones por origen.
//
// Tres reglas independientes, cada una con su caso SINTETICO que la pone roja y su simetrico:
// (1) @upstash/* solo se importa desde el adaptador de Upstash (R31); (2) `useActionState` de
// `react` solo se importa desde el envoltorio del hook (R11); (3) centinela de la version de
// `next` contra la que se leyo a mano el reductor de Server Actions.
//
// Mismo patron que las guardias que ya existen: funciones puras exportadas, un lector de arbol
// inyectable para los casos sinteticos, y la regla real ejecutada sobre el repo por separado.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
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

/** Separadores POSIX para que las rutas comparen igual en Windows. */
function toPosix(file: string): string {
  return file.split(sep).join('/').split('\\').join('/')
}

/**
 * Quita comentarios antes de buscar imports. Los de linea PRIMERO: si se quitan antes los
 * bloques, un comentario de linea que mencione una ruta con comodin abre un bloque falso que se
 * cierra en el siguiente JSDoc y se traga imports reales (regresion vista en
 * `guard-middleware-edge.test.ts`).
 */
function stripComments(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
}

export type ArchivoLeido = { readonly relPath: string; readonly source: string }

function listarDirectorio(absPath: string): readonly string[] {
  try {
    return readdirSync(absPath)
  } catch {
    return []
  }
}

function listarArchivosFuente(absDir: string, relDir: string): readonly ArchivoLeido[] {
  const archivos: ArchivoLeido[] = []
  for (const nombre of listarDirectorio(absDir)) {
    const abs = join(absDir, nombre)
    const rel = `${relDir}/${nombre}`
    if (statSync(abs).isDirectory()) {
      archivos.push(...listarArchivosFuente(abs, rel))
    } else if (/\.tsx?$/.test(nombre)) {
      archivos.push({ relPath: toPosix(rel), source: readFileSync(abs, 'utf8') })
    }
  }
  return archivos
}

/** Las cuatro carpetas de codigo fuente que este archivo recorre para las reglas (1) y (2). */
const DIRECTORIOS_FUENTE = ['lib', 'app', 'components', 'hooks'] as const

function listarTodoElCodigoFuente(): readonly ArchivoLeido[] {
  const archivos: ArchivoLeido[] = []
  for (const dir of DIRECTORIOS_FUENTE) {
    archivos.push(...listarArchivosFuente(join(repoRoot, dir), dir))
  }
  return archivos
}

// ---------------------------------------------------------------------------------------------
// Regla 1 (R31): @upstash/* solo se importa desde el adaptador de Upstash.
// ---------------------------------------------------------------------------------------------

export const ADAPTADOR_DE_UPSTASH = 'lib/modules/rate-limit/adapters/driven/upstash-rate-limiter.ts'

/** Todo especificador de `@upstash/*` que un archivo importa, exporta o requiere. */
export function especificadoresDeUpstash(source: string): readonly string[] {
  const stripped = stripComments(source)
  const patterns = [
    /import\s+(?:[^'";]*?from\s+)?['"](@upstash\/[^'"]+)['"]/g,
    /export\s+(?:[^'";]*?from\s+)?['"](@upstash\/[^'"]+)['"]/g,
    /require\(\s*['"](@upstash\/[^'"]+)['"]\s*\)/g,
    /import\(\s*['"](@upstash\/[^'"]+)['"]\s*\)/g,
  ]
  const encontrados: string[] = []
  for (const pattern of patterns) {
    for (const match of stripped.matchAll(pattern)) encontrados.push(match[1] as string)
  }
  return encontrados
}

export function hallazgosDeImportsUpstash(
  archivos: readonly ArchivoLeido[],
  archivoPermitido: string,
): readonly string[] {
  const findings: string[] = []
  for (const { relPath, source } of archivos) {
    if (relPath === archivoPermitido) continue
    for (const paquete of especificadoresDeUpstash(source)) {
      findings.push(
        `${relPath} importa '${paquete}': @upstash/* solo puede importarse desde ` +
          `${archivoPermitido} (R31).`,
      )
    }
  }
  return findings
}

// ---------------------------------------------------------------------------------------------
// Regla 2 (R11): `useActionState` de 'react' solo se importa desde el envoltorio del hook.
// ---------------------------------------------------------------------------------------------

export const ENVOLTORIO_USE_ACTION_STATE = 'hooks/use-rate-limited-action-state.ts'

/** Cierto si el archivo trae `useActionState` en la clausula de un import de 'react'. */
export function importaUseActionStateDeReact(source: string): boolean {
  const stripped = stripComments(source)
  const pattern = /import\s+([^'"]*?)from\s+['"]react['"]/g
  for (const match of stripped.matchAll(pattern)) {
    if (/\buseActionState\b/.test(match[1] as string)) return true
  }
  return false
}

export function hallazgosDeUseActionState(
  archivos: readonly ArchivoLeido[],
  archivoPermitido: string,
): readonly string[] {
  return archivos
    .filter(({ relPath }) => relPath !== archivoPermitido)
    .filter(({ source }) => importaUseActionStateDeReact(source))
    .map(
      ({ relPath }) =>
        `${relPath} importa 'useActionState' de 'react': el unico envoltorio autorizado es ` +
        `${archivoPermitido} (R11). El censo de T14 pasa cada formulario por ` +
        'useRateLimitedActionState o withRateLimitNotice.',
    )
}

// ---------------------------------------------------------------------------------------------
// Regla 3: centinela de la version de next contra la que se leyo a mano el reductor de Server Actions.
// ---------------------------------------------------------------------------------------------

export const VERSION_DE_NEXT_VERIFICADA_N6 = '16.3.0'
const RUTA_DEL_REDUCTOR =
  'node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js'

export function hallazgosDeVersionDeNextN6(versionDeclarada: string): readonly string[] {
  if (versionDeclarada === VERSION_DE_NEXT_VERIFICADA_N6) return []
  return [
    `next paso de ${VERSION_DE_NEXT_VERIFICADA_N6} a ${versionDeclarada}. El canal por el que ` +
      'el freno de una Server Action llega al formulario (N6, design.md > 1) es codigo interno ' +
      `del cliente de Next, no una API publicada: RELEE ${RUTA_DEL_REDUCTOR} y confirma que la ` +
      "condicion sigue siendo 'status >= 400 && content-type === \"text/plain\"' antes de subir " +
      'VERSION_DE_NEXT_VERIFICADA_N6.',
  ]
}

// ---------------------------------------------------------------------------------------------
// La regla real, sobre el repositorio.
// ---------------------------------------------------------------------------------------------

function packageJson(): { dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
}

describe('guardia: el limite de peticiones, sobre el repositorio real', () => {
  it('ningun archivo fuera del adaptador de Upstash importa @upstash/* (R31)', () => {
    const archivos = listarTodoElCodigoFuente()

    // Si esto quedara vacio, el `toEqual([])` de abajo seria un falso verde.
    expect(archivos.length).toBeGreaterThan(100)
    expect(hallazgosDeImportsUpstash(archivos, ADAPTADOR_DE_UPSTASH)).toEqual([])
  })

  it('ningun archivo de app/, components/ o hooks/ salvo el envoltorio importa useActionState de react (R11)', () => {
    const archivos = [
      ...listarArchivosFuente(join(repoRoot, 'app'), 'app'),
      ...listarArchivosFuente(join(repoRoot, 'components'), 'components'),
      ...listarArchivosFuente(join(repoRoot, 'hooks'), 'hooks'),
    ]

    expect(archivos.length).toBeGreaterThan(50)
    expect(hallazgosDeUseActionState(archivos, ENVOLTORIO_USE_ACTION_STATE)).toEqual([])
  })

  it('R11 centinela: la version de next es la 16.3.0 contra la que se leyo el reducer de Server Actions', () => {
    const pkg = packageJson()
    const versionDeclarada = pkg.dependencies?.next ?? '(ausente)'

    expect(hallazgosDeVersionDeNextN6(versionDeclarada)).toEqual([])
  })
})

describe('guardia: casos sinteticos -- cada regla, con su rojo y su verde', () => {
  it('R31: un archivo ajeno que importa @upstash/ratelimit se caza; el adaptador no', () => {
    const archivos: ArchivoLeido[] = [
      {
        relPath: 'lib/composition/edge.ts',
        source: "import { Ratelimit } from '@upstash/ratelimit'\nexport const x = 1",
      },
      {
        relPath: ADAPTADOR_DE_UPSTASH,
        source: "import { Ratelimit } from '@upstash/ratelimit'\nexport const x = 1",
      },
    ]

    const rojo = hallazgosDeImportsUpstash(archivos, ADAPTADOR_DE_UPSTASH)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('lib/composition/edge.ts')
    expect(rojo[0]).toContain("'@upstash/ratelimit'")
  })

  it('R31: un import de tipo (`import type`) y un require() de @upstash/redis se cazan igual', () => {
    const archivos: ArchivoLeido[] = [
      { relPath: 'lib/composition/edge.ts', source: "import type { Redis } from '@upstash/redis'" },
      { relPath: 'a.ts', source: "const { Redis } = require('@upstash/redis')" },
    ]

    const rojo = hallazgosDeImportsUpstash(archivos, ADAPTADOR_DE_UPSTASH)

    expect(rojo).toHaveLength(2)
    expect(rojo[0]).toContain('@upstash/redis')
    expect(rojo[1]).toContain('@upstash/redis')
  })

  it('R31: el caso simetrico -- ningun archivo fuera del adaptador importa @upstash/* -- no produce hallazgos', () => {
    const archivos: ArchivoLeido[] = [
      { relPath: 'lib/composition/edge.ts', source: "import { z } from 'zod'\nexport const x = 1" },
      {
        relPath: ADAPTADOR_DE_UPSTASH,
        source: "import { Ratelimit } from '@upstash/ratelimit'\nimport type { Redis } from '@upstash/redis'",
      },
    ]

    expect(hallazgosDeImportsUpstash(archivos, ADAPTADOR_DE_UPSTASH)).toEqual([])
  })

  it('R11: un formulario que importa useActionState de react se caza; el envoltorio no', () => {
    const archivos: ArchivoLeido[] = [
      {
        relPath: 'app/(public)/login/components/login-form.tsx',
        source: "import { useActionState } from 'react'\nexport const x = 1",
      },
      {
        relPath: ENVOLTORIO_USE_ACTION_STATE,
        source: "import { useActionState, useCallback } from 'react'\nexport const x = 1",
      },
    ]

    const rojo = hallazgosDeUseActionState(archivos, ENVOLTORIO_USE_ACTION_STATE)

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('app/(public)/login/components/login-form.tsx')
    expect(rojo[0]).toContain("'useActionState'")
  })

  it('R11: importar solo `useCallback` de react, o `useActionState` de otro sitio, no dispara la regla', () => {
    const archivos: ArchivoLeido[] = [
      { relPath: 'components/shared/x.tsx', source: "import { useCallback } from 'react'" },
      {
        relPath: 'components/shared/y.tsx',
        source: "import { useActionState } from '@/hooks/use-rate-limited-action-state'",
      },
    ]

    expect(hallazgosDeUseActionState(archivos, ENVOLTORIO_USE_ACTION_STATE)).toEqual([])
  })

  it('R11: un comentario de linea con CRLF que menciona useActionState no esconde ni inventa un import', () => {
    const conCrlf = [
      '// no uses useActionState de react aqui (R11)',
      "import { useCallback } from 'react'",
      '/** JSDoc posterior que cerraria un bloque falso. */',
      'export const x = 1',
    ].join('\r\n')

    expect(importaUseActionStateDeReact(conCrlf)).toBe(false)
  })

  it('el centinela de N6 dispara cuando next cambia de version, y calla cuando no', () => {
    const rojo = hallazgosDeVersionDeNextN6('16.4.0')

    expect(rojo).toHaveLength(1)
    expect(rojo[0]).toContain('RELEE')
    expect(rojo[0]).toContain('server-action-reducer.js')
    expect(hallazgosDeVersionDeNextN6('16.3.0')).toEqual([])
  })
})
