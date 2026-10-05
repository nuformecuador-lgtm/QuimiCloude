// Guardia: el frontmatter de `.claude/agents/*.md` declara el modelo que manda `AGENTS.md > Modelos`.
//
// Recorre ARCHIVOS y no el grafo de imports: el frontmatter de un subagente no lo importa nadie, no
// compila y ningun test lo tocaria nunca. Por eso vive en `tests/guards/`.
//
// Tres reglas, y la tercera es la que duele:
//
// 1. Los tres agentes que ESCRIBEN CODIGO —`frontend_dev`, `backend_dev`, `extractor`— declaran
//    `model: qwen2.5-coder:3b`, un modelo local de Ollama.
// 2. Los otros cuatro —`spec_author`, `reviewer`, `implementer`, `leader`— HEREDAN el modelo de la
//    sesion y no declaran ninguno: escriben el spec, lo juzgan y coordinan, y ahi un error cuesta
//    mas de lo que ahorra bajar de modelo. Un override puntual se pasa en la llamada y se justifica
//    en `progress/current.md`; NO se arregla editando el frontmatter.
// 3. Solo el alias pelado (`sonnet`, `opus`, `haiku`) o un tag de Ollama listado a proposito en
//    `TAGS_OLLAMA_VALIDOS`, nunca un id con fecha o version. Un id
//    escrito a mano envejece en silencio: el 2026-07-31 uno dejo de existir y mato a un
//    `backend_dev` al arrancar, sin una linea escrita. Los agentes que no fijaban modelo siguieron
//    funcionando.
//
// La lista de los siete y su grupo va EXPLICITA aqui abajo, no derivada de leer el directorio: un
// octavo agente que nadie clasifique tiene que ponerla roja, no colarse por omision.

import { readFileSync, readdirSync } from 'node:fs'
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

const DIR_AGENTES = '.claude/agents'
const REGLA = 'AGENTS.md > Modelos'

/** Los unicos valores admisibles: alias pelados, sin fecha ni version. */
const ALIAS_VALIDOS = ['sonnet', 'opus', 'haiku'] as const

/** Tags de Ollama admitidos. Un tag nuevo entra aqui a proposito, no por omision. */
const TAGS_OLLAMA_VALIDOS = ['qwen2.5-coder:3b'] as const

/**
 * 2026-09-28, orden humana: Ollama y OpenRouter RETIRADOS del arnes. Los siete agentes van al
 * modelo de la sesion (NVIDIA, `nvidia/z-ai/glm-5.3`), cableado en `opencode.json` y emitido
 * por `scripts/gen-opencode.mjs`. Aqui ya no queda nada que declarar: el frontmatter de
 * `.claude/agents` lo lee Claude Code y un id de otro proveedor lo mata al arrancar con 404 -
 * el incidente del 2026-07-31 con `opus-4.8`, repetido el 2026-09-27 con `qwen2.5-coder:*`.
 * Todos heredan.
 */
const MODELO_EJECUTORES = null

/**
 * El censo. `modelo: '<tag>'` = lo declara; `modelo: null` = lo hereda de la sesion y no declara
 * nada. Escrito a mano a proposito: si nace un agente nuevo, alguien decide aqui de que lado cae.
 */
export const AGENTES_ESPERADOS = [
  { nombre: 'frontend_dev', modelo: MODELO_EJECUTORES },
  { nombre: 'backend_dev', modelo: MODELO_EJECUTORES },
  { nombre: 'extractor', modelo: MODELO_EJECUTORES },
  { nombre: 'spec_author', modelo: null },
  { nombre: 'reviewer', modelo: null },
  { nombre: 'implementer', modelo: null },
  { nombre: 'leader', modelo: null },
] as const satisfies readonly { nombre: string; modelo: string | null }[]

/**
 * Valor de `model:` en el frontmatter, o `null` si no lo declara. Solo mira el bloque entre los dos
 * `---` del principio: un `model:` citado mas abajo en la prosa del prompt no es una declaracion.
 */
export function leerModeloDeclarado(contenido: string): string | null {
  const lineas = contenido.replace(/^﻿/, '').split('\n')
  if (lineas[0]?.trim() !== '---') return null

  for (const linea of lineas.slice(1)) {
    if (linea.trim() === '---') break
    const match = /^model:\s*(.*?)\s*$/.exec(linea)
    if (match) return match[1].replace(/^['"]|['"]$/g, '')
  }
  return null
}

/** `true` si el valor es uno de los alias pelados. Cualquier fecha o version cae fuera. */
export function esAliasPelado(modelo: string): boolean {
  return (ALIAS_VALIDOS as readonly string[]).includes(modelo)
}

/** `true` si el valor es un alias pelado o un tag de Ollama aprobado. */
export function esModeloAdmitido(modelo: string): boolean {
  return esAliasPelado(modelo) || (TAGS_OLLAMA_VALIDOS as readonly string[]).includes(modelo)
}

/**
 * Hallazgos sobre el censo de agentes. Lista vacia = el frontmatter dice lo que manda la regla.
 *
 * `archivos` mapea nombre de agente (sin `.md`) a su contenido. Es puro para poder probar el rojo y
 * el verde de cada regla sin tocar el repo.
 */
export function findModelFindings(archivos: ReadonlyMap<string, string>): readonly string[] {
  const findings: string[] = []

  // Un agente sin archivo: el censo dice que existe y no esta.
  for (const { nombre } of AGENTES_ESPERADOS) {
    if (!archivos.has(nombre)) {
      findings.push(
        `${DIR_AGENTES}/${nombre}.md no existe, pero el censo de esta guardia lo lista. ` +
          'Restaura el archivo o quita su fila de AGENTES_ESPERADOS.',
      )
    }
  }

  // Un archivo sin fila: agente nuevo que nadie clasifico.
  const censados = new Set<string>(AGENTES_ESPERADOS.map((a) => a.nombre))
  for (const nombre of [...archivos.keys()].sort()) {
    if (!censados.has(nombre)) {
      findings.push(
        `${DIR_AGENTES}/${nombre}.md no esta clasificado en esta guardia. Anade su fila a ` +
          `AGENTES_ESPERADOS diciendo si declara \`model: ${MODELO_EJECUTORES}\` o hereda el de la sesion ` +
          `(${REGLA}). Un agente sin decidir no se cuela por omision.`,
      )
    }
  }

  for (const { nombre, modelo: esperado } of AGENTES_ESPERADOS) {
    const contenido = archivos.get(nombre)
    if (contenido === undefined) continue

    const declarado = leerModeloDeclarado(contenido)

    // Regla 3, la que mato a un agente al arrancar: un id con fecha o version no es un alias.
    if (declarado !== null && !esModeloAdmitido(declarado)) {
      findings.push(
        `${DIR_AGENTES}/${nombre}.md declara \`model: ${declarado}\`, que no es un alias pelado. ` +
          `Se esperaba uno de: ${[...ALIAS_VALIDOS, ...TAGS_OLLAMA_VALIDOS].join(', ')}. Un id con fecha o version envejece y ` +
          `mata al agente al arrancar en silencio; ya paso el 2026-07-31 (${REGLA}).`,
      )
    }

    if (esperado === null) {
      // Regla 2: los que piensan heredan. Un override puntual va en la llamada, no aqui.
      if (declarado !== null) {
        findings.push(
          `${DIR_AGENTES}/${nombre}.md declara \`model: ${declarado}\` y no deberia declarar ` +
            `ninguno: hereda el modelo de la sesion (${REGLA}). Si necesitas otro modelo para una ` +
            'feature concreta, pasa el override en la llamada y escribe el motivo en ' +
            'progress/current.md; no toques el frontmatter.',
        )
      }
      continue
    }

    // Regla 1: los que escriben codigo lo declaran, exactamente.
    if (declarado !== esperado) {
      findings.push(
        `${DIR_AGENTES}/${nombre}.md declara \`model: ${declarado ?? '(ninguno)'}\` y se esperaba ` +
          `exactamente \`model: ${esperado}\` en su frontmatter (${REGLA}).`,
      )
    }
  }

  return findings
}

/** Lee `.claude/agents/*.md` del repo real, indexado por nombre de archivo sin extension. */
function leerAgentesDelRepo(): Map<string, string> {
  const dir = join(repoRoot, DIR_AGENTES)
  const archivos = new Map<string, string>()
  for (const entrada of readdirSync(dir)) {
    if (!entrada.endsWith('.md')) continue
    archivos.set(entrada.slice(0, -'.md'.length), readFileSync(join(dir, entrada), 'utf8'))
  }
  return archivos
}

describe(`guardia: modelos de los subagentes (${DIR_AGENTES})`, () => {
  const agentesReales = leerAgentesDelRepo()

  it('el frontmatter de los siete agentes cumple la regla de modelos', () => {
    const findings = findModelFindings(agentesReales)

    expect(findings, findings.length === 0 ? undefined : findings.join('\n')).toEqual([])
  })

  it('el directorio contiene exactamente los siete agentes censados', () => {
    expect([...agentesReales.keys()].sort()).toEqual(AGENTES_ESPERADOS.map((a) => a.nombre).sort())
  })
})

describe('guardia: casos sinteticos -- cada comprobacion, con su rojo y su verde', () => {
  /** Censo valido de partida, sobre el que cada caso introduce un unico defecto. */
  function censoValido(): Map<string, string> {
    const archivos = new Map<string, string>()
    for (const { nombre, modelo } of AGENTES_ESPERADOS) {
      const lineas = ['---', `name: ${nombre}`, 'description: lo que hace.']
      if (modelo !== null) lineas.push(`model: ${modelo}`)
      lineas.push('tools: Read, Glob, Grep', '---', '', `Eres el ${nombre.toUpperCase()}.`, '')
      archivos.set(nombre, lineas.join('\n'))
    }
    return archivos
  }

  it('verde: el censo completo y bien declarado no genera hallazgos', () => {
    expect(findModelFindings(censoValido())).toEqual([])
  })

  it('rojo (regla 1): un agente que escribe codigo declara `model:`', () => {
    const archivos = censoValido()
    archivos.set('extractor', ['---', 'name: extractor', 'model: qwen2.5-coder:3b', 'tools: Read', '---', '', 'Eres el EXTRACTOR.'].join('\n'))

    const findings = findModelFindings(archivos)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/extractor.md')
    expect(findings[0]).toContain('model: qwen2.5-coder:3b')
    expect(findings[0]).toContain('hereda el modelo de la sesion')
  })

  it('rojo (regla 1): un agente que escribe codigo con otro alias', () => {
    const archivos = censoValido()
    archivos.set('backend_dev', archivos.get('backend_dev')!.replace('tools:', 'model: haiku\ntools:'))

    const findings = findModelFindings(archivos)

    // `haiku` es alias valido, asi que solo falla la regla de grupo, no la del formato.
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/backend_dev.md')
    expect(findings[0]).toContain('no deberia declarar')
  })

  it('rojo (regla 2): un agente que debe heredar declara modelo', () => {
    const archivos = censoValido()
    archivos.set('reviewer', archivos.get('reviewer')!.replace('tools:', 'model: opus\ntools:'))

    const findings = findModelFindings(archivos)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/reviewer.md')
    expect(findings[0]).toContain('hereda el modelo de la sesion')
  })

  it('verde (regla 2): mencionar `model:` en la prosa del prompt no cuenta como declaracion', () => {
    const archivos = censoValido()
    archivos.set('leader', `${archivos.get('leader')!}\nNunca escribas model: opus-4.8 en un frontmatter.\n`)

    expect(findModelFindings(archivos)).toEqual([])
  })

  it('rojo (regla 3): un id con fecha o version, en cualquiera de los siete', () => {
    for (const idMalo of ['opus-4.8', 'claude-sonnet-4-5-20250929', 'sonnet-4.5', 'claude-3-5-haiku-latest']) {
      const archivos = censoValido()
      archivos.set('frontend_dev', archivos.get('frontend_dev')!.replace('tools:', `model: ${idMalo}\ntools:`))

      const findings = findModelFindings(archivos)
      const texto = findings.join('\n')

      expect(texto, `no se detecto el id '${idMalo}'`).toContain('no es un alias pelado')
      expect(texto).toContain('.claude/agents/frontend_dev.md')
      expect(texto).toContain(idMalo)
    }
  })

  it('rojo (regla 3): tambien muerde en un agente que deberia heredar, y con comillas', () => {
    const archivos = censoValido()
    archivos.set('implementer', archivos.get('implementer')!.replace('tools:', 'model: "opus-4.8"\ntools:'))

    const findings = findModelFindings(archivos)

    expect(findings).toHaveLength(2)
    expect(findings.join('\n')).toContain('no es un alias pelado')
    expect(findings.join('\n')).toContain('hereda el modelo de la sesion')
  })

  it('rojo: un octavo agente sin clasificar no se cuela por omision', () => {
    const archivos = censoValido()
    archivos.set('migrador', ['---', 'name: migrador', 'model: sonnet', '---', '', 'Eres el MIGRADOR.'].join('\n'))

    const findings = findModelFindings(archivos)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/migrador.md')
    expect(findings[0]).toContain('no esta clasificado')
  })

  it('rojo: un agente censado que desaparece del directorio', () => {
    const archivos = censoValido()
    archivos.delete('spec_author')

    const findings = findModelFindings(archivos)

    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('.claude/agents/spec_author.md no existe')
  })

  it('leerModeloDeclarado: sin frontmatter no hay declaracion', () => {
    expect(leerModeloDeclarado('# Un prompt suelto\nmodel: opus\n')).toBeNull()
  })

  it('esAliasPelado: acepta los alias y rechaza fechas y versiones', () => {
    expect(ALIAS_VALIDOS.every(esAliasPelado)).toBe(true)
    expect(esAliasPelado('opus-4.8')).toBe(false)
    expect(esAliasPelado('claude-sonnet-4-5-20250929')).toBe(false)
  })

  it('esModeloAdmitido: acepta los tags de Ollama aprobados y nada mas', () => {
    expect(TAGS_OLLAMA_VALIDOS.every(esModeloAdmitido)).toBe(true)
    expect(esModeloAdmitido('sonnet')).toBe(true)
    expect(esModeloAdmitido('qwen2.5-coder:7b')).toBe(false)
    expect(esModeloAdmitido('glm-4.7:cloud')).toBe(false)
  })
})
