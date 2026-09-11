// QC-71 T6 (R16) — LA MITAD EJECUTABLE DE LA PRUEBA DEL TIPO CERRADO.
//
// La otra mitad es `error-state-types.test-d.ts`, que vitest NO ejecuta (`vitest.config.mts`
// incluye `tests/**/*.test.ts`, y un `*.test-d.ts` no entra en ningun proyecto): su valor viene
// de `tsc`. Ese reparto deja un agujero, y este archivo lo tapa:
//
//   - si alguien BORRA el `.test-d.ts`, o borra dentro de el las dos construcciones prohibidas,
//     el typecheck sigue verde y nadie se entera. Aqui se afirma sobre su TEXTO que las dos
//     siguen escritas y siguen marcadas con `@ts-expect-error`;
//   - si alguien reabre el tipo en `error-state.ts` de una forma que el `.test-d.ts` no cubra
//     —volver a un objeto plano, o poner `reference?`—, aqui se afirma sobre el TEXTO de la
//     declaracion que sigue siendo una union de dos ramas, que `reference` vive SOLO en la del
//     codigo generico y que NO es opcional.
//
// Cada comprobacion trae su caso rojo sintetico (`docs/verification.md > Probar que muerde`):
// se le pasa el fuente estropeado a mano y se exige el hallazgo concreto.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const TIPO_FILE = 'lib/modules/errores/domain/error-state.ts'
const TIPOS_TEST_FILE = 'tests/unit/observabilidad/error-state-types.test-d.ts'

/** El texto de la DECLARACION de `ErrorState`, desde el `=` hasta el final de la union. */
export function declaracionDeErrorState(source: string): string | null {
  const inicio = /export type ErrorState\s*=/.exec(source)
  if (!inicio) return null
  let i = (inicio.index ?? 0) + inicio[0].length
  let profundidad = 0
  let fin = -1
  for (; i < source.length; i += 1) {
    const caracter = source[i]
    if (caracter === '{') profundidad += 1
    if (caracter === '}') {
      profundidad -= 1
      if (profundidad === 0) {
        // Fin de una rama: la union sigue solo si el proximo caracter significativo es '|'.
        const resto = source.slice(i + 1)
        if (!/^\s*\|/.test(resto)) {
          fin = i + 1
          break
        }
      }
    }
  }
  if (fin === -1) return null
  return source.slice((inicio.index ?? 0) + inicio[0].length, fin)
}

/** Las ramas `{ ... }` de la declaracion, en orden y con su cuerpo tal cual. */
export function ramasDeErrorState(source: string): readonly string[] {
  const declaracion = declaracionDeErrorState(source)
  if (declaracion === null) return []
  const ramas: string[] = []
  let profundidad = 0
  let comienzo = -1
  for (let i = 0; i < declaracion.length; i += 1) {
    if (declaracion[i] === '{') {
      if (profundidad === 0) comienzo = i + 1
      profundidad += 1
    }
    if (declaracion[i] === '}') {
      profundidad -= 1
      if (profundidad === 0 && comienzo !== -1) ramas.push(declaracion.slice(comienzo, i))
    }
  }
  return ramas
}

/**
 * Los hallazgos sobre la forma del tipo (R16). Cero hallazgos = el tipo sigue cerrado como esta
 * ficha lo dejo.
 */
export function hallazgosDelTipoCerrado(source: string): readonly string[] {
  const ramas = ramasDeErrorState(source)
  if (ramas.length === 0) return ["no se encontro la declaracion de 'export type ErrorState' (R16)"]
  const findings: string[] = []
  if (ramas.length !== 2) {
    findings.push(`ErrorState declara ${ramas.length} rama(s) y no las dos de la union (R16)`)
  }
  const conReferencia = ramas.filter((rama) => /\breference\s*\??\s*:/.test(rama))
  if (conReferencia.length !== 1) {
    findings.push(`'reference' aparece en ${conReferencia.length} rama(s), y solo puede vivir en la del codigo generico (R16)`)
  }
  for (const rama of conReferencia) {
    if (/\breference\s*\?\s*:/.test(rama)) {
      findings.push("'reference' esta declarado OPCIONAL, que es justo el fallo que QC-71 cierra (R16)")
    }
    if (!/code:\s*typeof UNEXPECTED_ERROR_CODE/.test(rama)) {
      findings.push("la rama que declara 'reference' no es la del codigo generico (R16)")
    }
  }
  return findings
}

/** El bloque `{ ... }` de la constante `nombre`, con la linea anterior incluida. */
export function bloqueDeConstante(source: string, nombre: string): string | null {
  const inicio = new RegExp(`export const ${nombre}[^=]*=\\s*\\{`).exec(source)
  if (!inicio) return null
  let profundidad = 0
  for (let i = (inicio.index ?? 0) + inicio[0].length - 1; i < source.length; i += 1) {
    if (source[i] === '{') profundidad += 1
    if (source[i] === '}') {
      profundidad -= 1
      if (profundidad === 0) return source.slice(inicio.index ?? 0, i + 1)
    }
  }
  return null
}

/** Los hallazgos sobre el fichero de tipos: las dos construcciones prohibidas siguen escritas. */
export function hallazgosDelFicheroDeTipos(source: string): readonly string[] {
  const findings: string[] = []

  const sinReferencia = bloqueDeConstante(source, 'inesperadoSinReferencia')
  if (sinReferencia === null) {
    findings.push("falta la construccion prohibida 'inesperadoSinReferencia' (R16)")
  } else {
    if (/\breference\s*:/.test(sinReferencia)) {
      findings.push("'inesperadoSinReferencia' ya no es un inesperado SIN referencia (R16)")
    }
    if (!/@ts-expect-error/.test(source.slice(0, source.indexOf(sinReferencia)).split('\n').slice(-3).join('\n'))) {
      findings.push("'inesperadoSinReferencia' perdio su '@ts-expect-error' (R16)")
    }
  }

  const conReferencia = bloqueDeConstante(source, 'catalogadoConReferencia')
  if (conReferencia === null) {
    findings.push("falta la construccion prohibida 'catalogadoConReferencia' (R16)")
  } else {
    if (!/@ts-expect-error[\s\S]*?\n\s*reference\s*:/.test(conReferencia)) {
      findings.push("'catalogadoConReferencia' ya no lleva 'reference' marcado con '@ts-expect-error' (R16)")
    }
  }

  return findings
}

describe('QC-71 R16 — el tipo del estado de error es cerrado, y sigue siendolo', () => {
  const fuenteDelTipo = readFileSync(join(repoRoot, TIPO_FILE), 'utf8')
  const fuenteDeLosTipos = readFileSync(join(repoRoot, TIPOS_TEST_FILE), 'utf8')

  describe('la declaracion: union de dos ramas, con `reference` solo en la del generico', () => {
    it('el repositorio real no da ningun hallazgo', () => {
      expect(ramasDeErrorState(fuenteDelTipo)).toHaveLength(2)
      expect(hallazgosDelTipoCerrado(fuenteDelTipo)).toEqual([])
    })

    it('muerde: el tipo vuelve a ser un objeto plano con `reference` opcional', () => {
      const regresion = [
        'export type ErrorState = {',
        "  status: 'error'",
        '  code: ErrorCode',
        '  message: string',
        '  reference?: string',
        '}',
      ].join('\n')
      expect(hallazgosDelTipoCerrado(regresion)).toEqual([
        'ErrorState declara 1 rama(s) y no las dos de la union (R16)',
        "'reference' esta declarado OPCIONAL, que es justo el fallo que QC-71 cierra (R16)",
        "la rama que declara 'reference' no es la del codigo generico (R16)",
      ])
    })

    it('muerde: `reference` sigue en la union pero se vuelve opcional', () => {
      const opcional = fuenteDelTipo.replace('message: string; reference: string }', 'message: string; reference?: string }')
      expect(hallazgosDelTipoCerrado(opcional)).toEqual([
        "'reference' esta declarado OPCIONAL, que es justo el fallo que QC-71 cierra (R16)",
      ])
    })

    it('muerde: `reference` se cuela tambien en la rama catalogada', () => {
      const enLasDos = fuenteDelTipo.replace(
        "code: Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>; message: string }",
        "code: Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>; message: string; reference: string }",
      )
      expect(hallazgosDelTipoCerrado(enLasDos)).toContain(
        "'reference' aparece en 2 rama(s), y solo puede vivir en la del codigo generico (R16)",
      )
    })

    it('muerde: la declaracion desaparece', () => {
      expect(hallazgosDelTipoCerrado('export type Otro = { a: string }')).toEqual([
        "no se encontro la declaracion de 'export type ErrorState' (R16)",
      ])
    })
  })

  describe('el fichero de tipos: las dos construcciones prohibidas siguen ahi y marcadas', () => {
    it('el repositorio real no da ningun hallazgo', () => {
      expect(hallazgosDelFicheroDeTipos(fuenteDeLosTipos)).toEqual([])
    })

    it('muerde: alguien borra el fichero de tipos entero', () => {
      expect(hallazgosDelFicheroDeTipos('')).toEqual([
        "falta la construccion prohibida 'inesperadoSinReferencia' (R16)",
        "falta la construccion prohibida 'catalogadoConReferencia' (R16)",
      ])
    })

    it('muerde: al inesperado prohibido le anaden la referencia para "arreglarlo"', () => {
      const arreglado = fuenteDeLosTipos.replace(
        "  message: 'Ocurrio un error inesperado. Intentalo de nuevo.',\n}",
        "  message: 'Ocurrio un error inesperado. Intentalo de nuevo.',\n  reference: 'x',\n}",
      )
      expect(hallazgosDelFicheroDeTipos(arreglado)).toContain(
        "'inesperadoSinReferencia' ya no es un inesperado SIN referencia (R16)",
      )
    })

    it('muerde: al catalogado prohibido le quitan el `@ts-expect-error`', () => {
      const sinDirectiva = fuenteDeLosTipos.replace(
        /\n\s*\/\/ @ts-expect-error un codigo del catalogo[^\n]*\n/,
        '\n',
      )
      expect(hallazgosDelFicheroDeTipos(sinDirectiva)).toContain(
        "'catalogadoConReferencia' ya no lleva 'reference' marcado con '@ts-expect-error' (R16)",
      )
    })
  })
})
