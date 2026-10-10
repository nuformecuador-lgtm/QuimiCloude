// Guardia de QC-255 (R23, R24, R25): el presupuesto de tiempo del job E2E.
//
// El PR #199 no pudo pasar el E2E: el job agoto sus 60 min con chromium completo y webkit en 36
// de 171 tests. Dos cosas lo agotaban y las dos son configuracion, asi que se vigilan aqui:
//
// - Un click o un fill sin plazo sobre un selector que ya no existe esperaba hasta el timeout del
//   caso (180-300 s) en cada reintento. `actionTimeout` lo corta antes (R23).
// - Los dos navegadores en un solo job: no cabian, y un flake de WebKit tumbaba tambien Chromium.
//   Ahora es una matriz con un job por navegador, sin `fail-fast`, y un job `e2e` que los une y
//   da el veredicto (R24, R25).
//
// El workflow se lee como TEXTO, igual que `guard-despliegue-produccion`: sin parser de YAML.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import config from '@/playwright.config'

/** Raiz del repo: dos niveles por encima de `tests/guards/`. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const WORKFLOW = '.github/workflows/gate.yml'
const JOB_MATRIZ = 'e2e-navegador'
const JOB_VEREDICTO = 'e2e'

/** Tope de R23: 30 s como maximo. */
const ACTION_TIMEOUT_MAXIMO_MS = 30_000

/** Los jobs del workflow por nombre, cada uno con su bloque de texto (indentacion de 2). */
function jobs(yml: string): Map<string, string> {
  const desdeJobs = yml.slice(yml.indexOf('\njobs:\n'))
  const partes = desdeJobs.split(/^ {2}([A-Za-z0-9_-]+):\s*$/m)
  const mapa = new Map<string, string>()
  for (let i = 1; i < partes.length; i += 2) mapa.set(partes[i], partes[i + 1] ?? '')
  return mapa
}

/** Los valores de `project: [a, b]` de la matriz, o `null` si no hay. */
function proyectosDeLaMatriz(bloque: string): string[] | null {
  const coincidencia = /^\s+project:\s*\[([^\]]*)\]/m.exec(bloque)
  if (!coincidencia) return null
  return coincidencia[1]
    .split(',')
    .map((valor) => valor.trim().replace(/^['"]|['"]$/g, ''))
    .filter((valor) => valor !== '')
}

/** El bloque sin las lineas de comentario: se afirma sobre lo que GitHub ejecuta, no sobre prosa. */
function sinComentarios(bloque: string): string {
  return bloque
    .split(/\r?\n/)
    .filter((linea) => !linea.trim().startsWith('#'))
    .join('\n')
}

const yml = readFileSync(join(RAIZ, WORKFLOW), 'utf8')
const porJob = jobs(yml)
const nombresDeProyecto = (config.projects ?? []).map((proyecto) => proyecto.name)

describe('guardia de QC-255 — actionTimeout del E2E (R23)', () => {
  it('playwright.config.ts fija un actionTimeout finito de 30 s como maximo', () => {
    const actionTimeout = config.use?.actionTimeout
    expect(actionTimeout, 'falta use.actionTimeout en playwright.config.ts').toBeTypeOf('number')
    expect(actionTimeout).toBeGreaterThan(0)
    expect(actionTimeout).toBeLessThanOrEqual(ACTION_TIMEOUT_MAXIMO_MS)
  })
})

describe('guardia de QC-255 — un job E2E por navegador (R24, R25)', () => {
  it('el config declara los proyectos que la matriz tiene que cubrir', () => {
    expect(nombresDeProyecto.length).toBeGreaterThan(0)
  })

  it(`el job ${JOB_MATRIZ} es una matriz con exactamente los proyectos del config`, () => {
    const bloque = porJob.get(JOB_MATRIZ)
    expect(bloque, `${WORKFLOW} no tiene el job ${JOB_MATRIZ}`).toBeDefined()
    const codigo = sinComentarios(bloque ?? '')

    expect([...(proyectosDeLaMatriz(codigo) ?? [])].sort()).toEqual([...nombresDeProyecto].sort())
  })

  it(`el job ${JOB_MATRIZ} no corta un navegador cuando falla el otro y corre solo el suyo`, () => {
    const codigo = sinComentarios(porJob.get(JOB_MATRIZ) ?? '')

    expect(codigo).toMatch(/^\s+fail-fast:\s*false\s*$/m)
    expect(codigo).toContain('--project=${{ matrix.project }}')
  })

  it(`el job ${JOB_VEREDICTO} espera a la matriz, corre siempre y exige su exito`, () => {
    const bloque = porJob.get(JOB_VEREDICTO)
    expect(bloque, `${WORKFLOW} no tiene el job ${JOB_VEREDICTO}`).toBeDefined()
    const codigo = sinComentarios(bloque ?? '')

    expect(codigo).toMatch(new RegExp(`^\\s+needs:\\s*\\[?\\s*${JOB_MATRIZ}\\s*\\]?\\s*$`, 'm'))
    expect(codigo).toMatch(/always\(\)/)
    expect(codigo).toContain(`needs.${JOB_MATRIZ}.result`)
    expect(codigo).toMatch(/=\s*"success"/)
  })
})
