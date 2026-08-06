/**
 * test:rapido — el gate de tanda (`./init.sh --rapido`).
 *
 * Dos partes, y las dos son necesarias:
 *   1. `vitest related --run <archivos tocados>`: los tests que el GRAFO DE IMPORTS
 *      relaciona con lo que has cambiado.
 *   2. `vitest run guard`: TODAS las guardias, siempre. Recorren el arbol de archivos
 *      en vez de importar lo que vigilan, asi que ningun grafo de imports las
 *      selecciona y son justo las que se perderian (ver init.sh).
 *
 * Los archivos tocados salen de `origin/dev...HEAD` (lo commiteado en la rama) MAS el
 * arbol de trabajo (lo que aun no has commiteado). Sin lo segundo, cerrar una tanda
 * antes del commit no seleccionaria nada y el paso 1 seria decorativo.
 *
 * Si no hay archivos tocados, el paso 1 se omite: no es un fallo.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { runPnpmExec } from './run-pnpm'

const BASE_REF = 'origin/dev'
const TESTABLE_EXTENSIONS = ['.ts', '.tsx']

function git(args: readonly string[]): string[] {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout.split('\n').map((line) => line.trim())
}

function changedFiles(): string[] {
  const candidates = [
    ...git(['diff', '--name-only', `${BASE_REF}...HEAD`]),
    ...git(['diff', '--name-only', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard']),
  ]

  const unique = new Set(
    candidates.filter(
      (file) =>
        file !== '' &&
        TESTABLE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
        existsSync(file),
    ),
  )

  return [...unique].sort()
}

function main(): void {
  const files = changedFiles()

  if (files.length === 0) {
    console.log(`test:rapido: sin archivos .ts/.tsx tocados frente a ${BASE_REF}; solo guardias.`)
  } else {
    console.log(`test:rapido: ${files.length} archivo(s) tocado(s) -> vitest related`)
    const status = runPnpmExec(['vitest', 'related', '--run', '--passWithNoTests', ...files])
    if (status !== 0) process.exit(status)
  }

  console.log('test:rapido: guardias')
  const guardStatus = runPnpmExec(['vitest', 'run', 'guard', '--passWithNoTests'])
  if (guardStatus !== 0) process.exit(guardStatus)
}

main()
