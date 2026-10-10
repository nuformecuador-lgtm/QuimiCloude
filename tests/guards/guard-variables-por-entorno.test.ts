// Guardia: toda variable que declara `.env.example` (fuera del bloque de servidores MCP) esta en la
// tabla `docs/architecture.md > Previews > Variables por entorno`, que dice que lleva en Production,
// en Preview y en local.
//
// Existe porque la tabla es lo que el humano sigue para cargar el scope Preview de Vercel: una
// variable nueva que no llegue a la tabla se queda sin decidir en preview, y la preview puede
// arrancar con la credencial de produccion copiada sin que nada avise.
//
// Lee los dos archivos como texto; no hay parser de Markdown aprobado y no hace falta.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLANTILLA = '.env.example'
const DOC = 'docs/architecture.md'
const SECCION = '## Previews'
const SUBSECCION = '### Variables por entorno'

/** Las del bloque MCP: no las lee la app, las interpola `.mcp.json` del entorno del proceso. */
const VARIABLES_MCP = ['ATLASSIAN_MCP_AUTH', 'CONTEXT7_API_KEY', 'SUPABASE_PROJECT_REF']
const TITULO_BLOQUE_MCP = 'Servidores MCP'

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8')
}

const esSeparador = (linea: string) => /^#\s*-{10,}\s*$/.test(linea)

/** Variables declaradas sin comentar (`NOMBRE=`), con el bloque al que pertenecen. */
function declaraciones(plantilla: string): { nombre: string; enBloqueMcp: boolean }[] {
  const lineas = plantilla.split(/\r?\n/)
  const titulo = lineas.findIndex((l) => l.startsWith('#') && l.includes(TITULO_BLOQUE_MCP))
  // El bloque MCP va del separador que cierra su cabecera al separador que abre la siguiente.
  let inicio = -1
  let fin = lineas.length
  if (titulo !== -1) {
    inicio = lineas.findIndex((l, i) => i > titulo && esSeparador(l))
    const siguiente = lineas.findIndex((l, i) => inicio !== -1 && i > inicio && esSeparador(l))
    if (siguiente !== -1) fin = siguiente
  }

  return lineas.flatMap((linea, i) => {
    const m = /^([A-Z][A-Z0-9_]*)=/.exec(linea)
    if (m === null) return []
    return [{ nombre: m[1], enBloqueMcp: inicio !== -1 && i > inicio && i < fin }]
  })
}

/** Nombres entre comillas invertidas de la primera columna de la tabla de la subseccion. */
function primeraColumna(doc: string): string[] {
  const lineas = doc.split(/\r?\n/)
  const seccion = lineas.findIndex((l) => l.startsWith(`${SECCION} `) || l === SECCION)
  if (seccion === -1) return []
  const sub = lineas.findIndex((l, i) => i > seccion && l.trim() === SUBSECCION)
  if (sub === -1) return []
  const finRel = lineas.slice(sub + 1).findIndex((l) => /^#{1,3} /.test(l))
  const cuerpo = lineas.slice(sub + 1, finRel === -1 ? undefined : sub + 1 + finRel)

  return cuerpo
    .filter((l) => l.trimStart().startsWith('|'))
    .slice(2) // cabecera y separador
    .flatMap((fila) => {
      const celda = fila.split('|')[1] ?? ''
      return [...celda.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((m) => m[1])
    })
}

/** Lo que falta en la tabla. Puro, para poder alimentarlo a mano. */
function faltanEnLaTabla(plantilla: string, doc: string): string[] {
  const enTabla = new Set(primeraColumna(doc))
  return declaraciones(plantilla)
    .filter((d) => !d.enBloqueMcp)
    .map((d) => d.nombre)
    .filter((nombre) => !enTabla.has(nombre))
}

describe(`guardia: ${PLANTILLA} y la tabla de ${DOC} > Previews > Variables por entorno (QC-249)`, () => {
  const plantilla = leer(PLANTILLA)
  const doc = leer(DOC)

  it('R17: la tabla existe y no esta vacia (si no, la guardia pasaria en vacio)', () => {
    expect(
      primeraColumna(doc).length,
      `no se encuentra la tabla bajo ${SECCION} > ${SUBSECCION} en ${DOC}, o no tiene filas`,
    ).toBeGreaterThan(30)
  })

  it('R17: el bloque MCP de .env.example se reconoce y contiene exactamente sus tres variables', () => {
    // Si el bloque se delimitara mal, podria tragarse variables de la app y dejarlas fuera del control.
    const mcp = declaraciones(plantilla)
      .filter((d) => d.enBloqueMcp)
      .map((d) => d.nombre)
    expect(mcp.sort()).toEqual([...VARIABLES_MCP].sort())
  })

  it('R17: toda variable de .env.example fuera del bloque MCP aparece en la primera columna de la tabla', () => {
    expect(
      faltanEnLaTabla(plantilla, doc),
      `Anade cada variable a ${DOC} > Previews > Variables por entorno con lo que lleva en ` +
        'Production, Preview y local (sin valores). Si no se sabe, se pregunta: no se inventa.',
    ).toEqual([])
  })

  it('R17 SENSIBILIDAD: una variable inventada en .env.example pondria esta guardia en rojo', () => {
    const conInventada = `${plantilla}\n# inventada\nVARIABLE_INVENTADA_QC249=\n`
    expect(faltanEnLaTabla(conInventada, doc)).toEqual(['VARIABLE_INVENTADA_QC249'])
  })

  it('R17 SENSIBILIDAD: quitar una fila de la tabla pondria esta guardia en rojo', () => {
    const sinFila = doc
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('| `CRON_SECRET` |'))
      .join('\n')
    expect(faltanEnLaTabla(plantilla, sinFila)).toEqual(['CRON_SECRET'])
  })

  it('R17 SENSIBILIDAD: las variables comentadas y las del bloque MCP no se exigen', () => {
    expect(faltanEnLaTabla('# SMTP_HOST=smtp.example\n', doc)).toEqual([])
    const nombres = declaraciones(plantilla).map((d) => d.nombre)
    for (const v of VARIABLES_MCP) expect(nombres).toContain(v)
    expect(primeraColumna(doc)).not.toContain('ATLASSIAN_MCP_AUTH')
  })
})
