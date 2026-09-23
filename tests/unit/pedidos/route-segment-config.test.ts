/**
 * Guardia: la configuracion de segmento del cron de caducidad de pedidos tiene que seguir
 * siendo algo que Next sepa leer. Mismo caso que `tests/unit/documentos/route-segment-config.test.ts`
 * -que nacio de un fallo real de build (QC-111)-, aplicado a la ruta nueva de esta ficha.
 *
 * Se lee el archivo con `fs` en vez de importarlo A PROPOSITO: lo que hay que comprobar es la
 * FORMA DEL CODIGO -que el valor sea un literal-, y un import solo devolveria el valor ya
 * evaluado, que es exactamente lo que no distingue un literal de una expresion.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const RUTA = join(process.cwd(), 'app', 'api', 'cron', 'caducar-pedidos', 'route.ts')

/** CRLF normalizado antes de nada, mismo criterio que la guardia de `documentos`. */
function fuente(): string {
  return readFileSync(RUTA, 'utf8').replace(/\r\n/g, '\n')
}

function codigoSinComentarios(): string {
  return fuente()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const CAMPOS_DE_CONFIGURACION = [
  'runtime',
  'maxDuration',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'preferredRegion',
] as const

function reexportaConfig(codigo: string): readonly string[] {
  const culpables: string[] = []
  for (const bloque of codigo.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    const nombres = (bloque[1] ?? '')
      .split(',')
      .map((parte) => parte.trim().split(/\s+as\s+/)[0]?.trim() ?? '')
      .filter((nombre) => nombre.length > 0)

    for (const campo of CAMPOS_DE_CONFIGURACION) {
      if (nombres.includes(campo)) culpables.push(campo)
    }
  }
  return culpables
}

function maxDurationLiteral(codigo: string): number | null {
  const encontrado = /^export const maxDuration = (\d+);$/m.exec(codigo)
  return encontrado ? Number(encontrado[1]) : null
}

const MAX_DURATION_HOBBY_SECONDS = 300

describe('pedidos — la configuracion de segmento del cron de caducidad', () => {
  it('NO reexporta ningun campo de configuracion: Next no lo reconoce y el build falla', () => {
    const culpables = reexportaConfig(codigoSinComentarios())
    expect(culpables, `reexportados: ${culpables.join(', ')}`).toEqual([])
  })

  it('declara `runtime` como literal en el propio archivo de ruta', () => {
    expect(codigoSinComentarios()).toMatch(/^export const runtime = 'nodejs';$/m)
  })

  it('declara `maxDuration` como LITERAL, nunca como expresion ni desde process.env', () => {
    expect(codigoSinComentarios()).not.toMatch(/export const maxDuration =.*process\.env/)
    expect(maxDurationLiteral(codigoSinComentarios()), 'maxDuration no es un literal numerico').not.toBeNull()
  })

  it('y ese literal no pasa del techo de Vercel Hobby, que es donde este cron corre a diario', () => {
    const valor = maxDurationLiteral(codigoSinComentarios())
    expect(valor).not.toBeNull()
    expect(valor as number).toBeLessThanOrEqual(MAX_DURATION_HOBBY_SECONDS)
    expect(valor as number).toBeGreaterThan(0)
  })
})
