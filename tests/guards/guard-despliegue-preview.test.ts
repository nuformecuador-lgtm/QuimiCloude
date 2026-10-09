// Guardia: el despliegue de preview (`.github/workflows/preview.yml`) solo dispara en PRs a `dev`
// desde ramas de este repo, despliega SIN `--prod`, con la misma CLI de version fija que
// produccion, comprueba los tres secrets antes de desplegar, deja la URL en el PR y en el resumen,
// encola sin cancelar por PR y falla si la preview responde 2xx sin credenciales.
//
// Existe porque un descuido aqui no lo ve ningun otro test: un `--prod` publicaria un PR sin
// mergear en produccion, un `pull_request_target` correria el codigo del PR con permisos de la rama
// base, y una preview publica dejaria la app abierta a cualquiera con el enlace.
//
// Misma tecnica que `guard-despliegue-produccion.test.ts`: sin parser de YAML (no hay ninguno
// aprobado), texto sin comentarios y regex acotadas a un bloque.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW = '.github/workflows/preview.yml'
const WORKFLOW_PRODUCCION = '.github/workflows/desplegar.yml'

/** El YAML sin lineas de comentario ni comentarios de fin de linea (` # ...`). */
function sinComentarios(yaml: string): string {
  return yaml
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#.*$/, ''))
    .join('\n')
}

/** Las lineas no vacias del bloque de una clave, hasta la siguiente con la misma sangria o menos. */
function bloque(yaml: string, clave: string, sangria = ''): string[] {
  const lineas = yaml.split('\n')
  const inicio = lineas.findIndex((l) => l === `${sangria}${clave}:`)
  if (inicio === -1) return []
  const fuera = lineas
    .slice(inicio + 1)
    .findIndex((l) => l.trim() !== '' && l.length - l.trimStart().length <= sangria.length)
  const fin = fuera === -1 ? lineas.length : inicio + 1 + fuera
  return lineas.slice(inicio + 1, fin).filter((l) => l.trim() !== '').map((l) => l.trim())
}

/** Los pasos del workflow, cada uno como su texto, partiendo por cada `- name:` / `- uses:`. */
function pasos(yaml: string): string[] {
  const trozos: string[] = []
  for (const linea of yaml.split('\n')) {
    if (/^\s*-\s+(name|uses):/.test(linea)) trozos.push(linea)
    else if (trozos.length > 0) trozos[trozos.length - 1] += `\n${linea}`
  }
  return trozos
}

/** Las versiones de la CLI de Vercel que aparecen en un workflow. */
function versionesDeLaCli(yaml: string): string[] {
  return [...yaml.matchAll(/\bvercel@(\S+)/g)].map((m) => m[1] ?? '')
}

const SECRETS = ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'] as const
const DESPLIEGUE = /\bvercel@\S+\s+deploy\b/

const yaml = sinComentarios(readFileSync(join(RAIZ, WORKFLOW), 'utf8'))
const yamlProduccion = sinComentarios(readFileSync(join(RAIZ, WORKFLOW_PRODUCCION), 'utf8'))

describe(WORKFLOW, () => {
  it('R1: dispara solo en pull_request a [dev] con opened, synchronize y reopened', () => {
    expect(bloque(yaml, 'on'), 'el `on:` debe ser exactamente pull_request a [dev] con esos tres tipos').toEqual([
      'pull_request:',
      'branches: [dev]',
      'types: [opened, synchronize, reopened]',
    ])
    expect(yaml, 'nunca pull_request_target: correria el codigo del PR con permisos de la rama base').not.toMatch(
      /pull_request_target/,
    )
    expect(yaml, 'ningun push: la preview es de PRs').not.toMatch(/^\s*push:/m)
  })

  it('R1: despliega con `vercel@x.y.z deploy` y SIN `--prod`', () => {
    const lineas = yaml.split('\n').filter((l) => DESPLIEGUE.test(l))
    expect(lineas.length, 'falta la invocacion `vercel@<version> deploy`').toBeGreaterThan(0)
    expect(yaml, 'con `--prod` una preview publicaria el PR en produccion').not.toMatch(/--prod\b/)
  })

  it('R1: la CLI va con version semver exacta y es la MISMA que la de desplegar.yml', () => {
    const versiones = versionesDeLaCli(yaml)
    const deProduccion = versionesDeLaCli(yamlProduccion)
    expect(versiones.length).toBeGreaterThan(0)
    expect(deProduccion.length).toBeGreaterThan(0)
    for (const v of versiones) {
      expect(v, 'ni `latest` ni sin version').toMatch(/^\d+\.\d+\.\d+$/)
      expect(deProduccion, 'preview y produccion deben usar la misma version de la CLI').toContain(v)
    }
    expect(yaml, 'tampoco `npx vercel` a secas, que toma la ultima').not.toMatch(/\bnpx\s+(--yes\s+)?vercel(\s|$)/)
  })

  it('R1: el runner no instala dependencias ni construye: ni `pnpm install` ni `vercel build`', () => {
    expect(yaml).not.toMatch(/\bpnpm\s+(install|i)\b/)
    expect(yaml).not.toMatch(/\bnpm\s+(install|ci|i)\b/)
    expect(yaml).not.toMatch(/\bvercel(@\S+)?\s+build\b/)
  })

  it('R2: el job solo corre si la rama del PR vive en este repo (un fork queda saltado)', () => {
    expect(yaml).toMatch(
      /^\s+if:\s*\$?\{?\{?\s*github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\s*\}?\}?\s*$/m,
    )
  })

  it('R3: el entorno `preview` toma su URL de la salida del paso de despliegue', () => {
    const entorno = bloque(yaml, 'environment', '    ')
    expect(entorno).toContain('name: preview')
    expect(entorno).toContainEqual(expect.stringMatching(/^url:\s*\$\{\{\s*steps\.desplegar\.outputs\.url\s*\}\}$/))

    const despliegue = pasos(yaml).find((p) => DESPLIEGUE.test(p))
    expect(despliegue, 'el paso de despliegue debe tener `id: desplegar`').toMatch(/^\s*id:\s*desplegar\s*$/m)
    expect(despliegue, 'el paso de despliegue debe escribir la URL en GITHUB_OUTPUT').toMatch(
      /url=\$url"?\s*>>\s*"?\$GITHUB_OUTPUT/,
    )
  })

  it('R3: la URL queda en el resumen de la ejecucion', () => {
    const resumen = pasos(yaml).find((p) => /GITHUB_STEP_SUMMARY/.test(p))
    expect(resumen, 'ningun paso escribe en GITHUB_STEP_SUMMARY').toBeDefined()
    expect(resumen).toMatch(/steps\.desplegar\.outputs\.url|\$url\b/)
  })

  it('R4: lee los tres secrets de Vercel', () => {
    for (const s of SECRETS) {
      expect(yaml, `falta secrets.${s}`).toMatch(new RegExp(`\\$\\{\\{\\s*secrets\\.${s}\\s*\\}\\}`))
    }
  })

  it('R4: antes de desplegar, un paso comprueba los tres secrets con `-n` y sale con `exit 1`', () => {
    const lista = pasos(yaml)
    const despliegue = lista.findIndex((p) => DESPLIEGUE.test(p))
    expect(despliegue, 'no se encontro el paso de `vercel deploy`').toBeGreaterThan(-1)
    const comprobacion = lista.findIndex(
      (p) =>
        !/\bvercel@/.test(p) &&
        /^\s*exit 1\s*$/m.test(p) &&
        SECRETS.every((s) => new RegExp(`-n\\s+"\\$${s}"`).test(p)),
    )
    expect(comprobacion, 'falta el paso que comprueba con `-n` los tres secrets y hace `exit 1`').toBeGreaterThan(-1)
    expect(comprobacion, 'la comprobacion de secrets debe ir antes del despliegue').toBeLessThan(despliegue)
  })

  it('R4: el token no va por `--token`', () => {
    expect(yaml).not.toMatch(/--token\b/)
  })

  it('R5: grupo de concurrencia por numero de PR y `cancel-in-progress: false` explicito', () => {
    const conc = bloque(yaml, 'concurrency')
    const grupo = conc.find((l) => l.startsWith('group:'))
    expect(grupo, 'falta `concurrency.group`').toBeDefined()
    expect(grupo, 'el grupo debe ser por PR').toMatch(
      /^group:\s*[\w.-]*\$\{\{\s*github\.event\.pull_request\.number\s*\}\}$/,
    )
    expect(conc, 'hace falta `cancel-in-progress: false` escrito').toContain('cancel-in-progress: false')
  })

  it('R6: despues del despliegue, un paso pide la URL con curl y falla ante cualquier 2xx', () => {
    const lista = pasos(yaml)
    const despliegue = lista.findIndex((p) => DESPLIEGUE.test(p))
    const proteccion = lista.findIndex((p) => /\bcurl\b/.test(p))
    expect(proteccion, 'falta el paso con `curl` que comprueba la proteccion').toBeGreaterThan(-1)
    expect(proteccion, 'la comprobacion va despues del despliegue').toBeGreaterThan(despliegue)

    const paso = lista[proteccion] ?? ''
    expect(paso, 'el curl no debe llevar credenciales').not.toMatch(/\bcurl\b[^\n]*(-u\s|--user\b|-H\s|--header\b|-b\s|--cookie\b)/)
    expect(paso, 'debe leer el codigo HTTP').toMatch(/%\{http_code\}/)
    expect(paso, 'debe tomar la URL de la salida del despliegue').toMatch(/steps\.desplegar\.outputs\.url/)
    expect(paso, 'un 2xx debe acabar en `exit 1`').toMatch(/^\s*2\?\?\)[^\n]*exit 1/m)
  })

  it('permissions es solo `contents: read` y ningun job lo amplia', () => {
    expect(bloque(yaml, 'permissions')).toEqual(['contents: read'])
    expect(yaml).not.toMatch(/^[ \t]+permissions:/m)
  })
})

describe('sensibilidad de los ayudantes de esta guardia', () => {
  it('un `--prod` y una version distinta de la de produccion se detectan', () => {
    const malo = sinComentarios('run: npx --yes vercel@1.2.3 deploy --prod --yes')
    expect(malo).toMatch(/--prod\b/)
    expect(versionesDeLaCli(malo)).toEqual(['1.2.3'])
    expect(versionesDeLaCli(yamlProduccion)).not.toContain('1.2.3')
  })

  it('un comentario no cuenta como codigo', () => {
    expect(sinComentarios('# vercel@9.9.9 deploy --prod\nfoo: bar # --token x')).toBe('foo: bar')
  })
})
