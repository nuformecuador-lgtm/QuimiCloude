// Guardia: el despliegue a produccion (`.github/workflows/desplegar.yml`) solo dispara en push a
// `prod` y a mano, despliega con `--prod`, con una CLI de Vercel de version fija, con los tres
// secrets y permisos minimos; y el build de package.json pasa por la guarda `scripts/build.mjs`.
//
// Existe porque un descuido aqui no lo ve ningun otro test: un `pull_request` en el `on:`
// desplegaria a produccion codigo sin revisar, un `vercel@latest` cambiaria el despliegue el dia
// que salga una CLI nueva, y un build que vuelva a ser la cadena de `&&` dejaria que una preview
// (que comparte base con produccion) migrara y sembrara esa base.
//
// Vive en `tests/guards/` porque nadie importa un `.yml` ni `package.json`: ningun grafo de
// imports la seleccionaria en modo rapido.
//
// Sin parser de YAML: no hay ninguno aprobado en `docs/dependencias.md`, y lo que se afirma es
// poco y de forma fija. Se lee el texto con regex acotadas a un bloque (el `on:` se aisla hasta la
// siguiente clave de primer nivel) y sin comentarios, para que el texto de un comentario no cuente.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = '.github/workflows/desplegar.yml'

/** El YAML sin lineas de comentario ni comentarios de fin de linea (` # ...`). */
function sinComentarios(yaml: string): string {
  return yaml
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#.*$/, ''))
    .join('\n')
}

/** Las lineas no vacias del bloque de una clave de primer nivel, hasta la siguiente. */
function bloque(yaml: string, clave: string): string[] {
  const lineas = yaml.split('\n')
  const inicio = lineas.findIndex((l) => l === `${clave}:`)
  if (inicio === -1) return []
  const fuera = lineas.slice(inicio + 1).findIndex((l) => /^\S/.test(l))
  const fin = fuera === -1 ? lineas.length : inicio + 1 + fuera
  return lineas.slice(inicio + 1, fin).filter((l) => l.trim() !== '').map((l) => l.trim())
}

const yaml = sinComentarios(readFileSync(join(RAIZ, WORKFLOW), 'utf8'))

describe(WORKFLOW, () => {
  it('dispara solo en push a `prod` y en workflow_dispatch: un PR u otra rama no despliegan a produccion', () => {
    expect(bloque(yaml, 'on'), 'el `on:` debe ser exactamente push a [prod] + workflow_dispatch').toEqual([
      'push:',
      'branches: [prod]',
      'workflow_dispatch:',
    ])
    expect(yaml, 'ningun pull_request: desplegaria a produccion codigo sin mergear').not.toMatch(/pull_request/)
  })

  it('despliega con `vercel deploy --prod`: sin `--prod` saldria una preview, no produccion', () => {
    expect(yaml).toMatch(/\bvercel@\S+\s+deploy\s+--prod\b/)
  })

  it('la CLI de Vercel va con version semver exacta: ni `latest` ni sin version', () => {
    const usos = yaml.match(/\bvercel@\S*/g) ?? []
    expect(usos.length, 'el workflow debe invocar la CLI como `vercel@<version>`').toBeGreaterThan(0)
    for (const uso of usos) {
      expect(uso, 'una CLI nueva no debe cambiar el despliegue sin un PR que la suba').toMatch(/^vercel@\d+\.\d+\.\d+$/)
    }
    expect(yaml, 'tampoco `npx vercel` a secas, que toma la ultima').not.toMatch(/\bnpx\s+(--yes\s+)?vercel(\s|$)/)
  })

  it('lee los tres secrets de Vercel: sin uno, la CLI no sabe a que cuenta ni a que proyecto subir', () => {
    for (const s of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
      expect(yaml, `falta secrets.${s}`).toMatch(new RegExp(`\\$\\{\\{\\s*secrets\\.${s}\\s*\\}\\}`))
    }
  })

  it('permissions es solo `contents: read`: el despliegue no necesita escribir en el repo', () => {
    expect(bloque(yaml, 'permissions')).toEqual(['contents: read'])
    expect(yaml, 'ningun job amplia los permisos').not.toMatch(/^[ \t]+permissions:/m)
  })

  it('no hay `vercel build` en el runner: el build es remoto, para no gastar minutos del plan', () => {
    expect(yaml).not.toMatch(/\bvercel(@\S+)?\s+build\b/)
  })
})

describe('package.json > scripts.build', () => {
  it('apunta a `scripts/build.mjs`: es la guarda que impide migrar y sembrar desde una preview', () => {
    const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.build).toBe('node scripts/build.mjs')
  })
})
