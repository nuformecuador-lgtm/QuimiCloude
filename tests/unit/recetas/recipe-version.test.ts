// Reglas puras de version: nombre mostrado, «por revisar» y propagacion de lineas.
// Importa del contrato del modulo: si el barrel dejara de exportarlas, no compilaria.

import { describe, expect, it } from 'vitest'

import {
  VERSION_NAME_SEPARATOR,
  isVersionUnderReview,
  propagateLines,
  recipeDisplayName,
} from '@/lib/modules/recetas'

type Line = { readonly productId: string; readonly percentage: string }

const line = (productId: string, percentage: string): Line => ({ productId, percentage })

describe('recipeDisplayName', () => {
  it('R11: una version se muestra como «original · version»', () => {
    expect(recipeDisplayName('Sin perfume', 'Crema base')).toBe('Crema base · Sin perfume')
    expect(VERSION_NAME_SEPARATOR).toBe(' · ')
  })

  it('R11: una original (sin original) se muestra con su nombre tal cual', () => {
    expect(recipeDisplayName('Crema base', null)).toBe('Crema base')
  })
})

describe('isVersionUnderReview', () => {
  it('R21: una original sin lineas NO esta por revisar', () => {
    expect(isVersionUnderReview(false, [])).toBe(false)
  })

  it('R21: una original que no suma 100 tampoco: la regla es solo de versiones', () => {
    expect(isVersionUnderReview(false, ['50.00'])).toBe(false)
  })

  it('R21: una version sin lineas esta por revisar', () => {
    expect(isVersionUnderReview(true, [])).toBe(true)
  })

  it('R21: una version que suma 99,99 esta por revisar', () => {
    expect(isVersionUnderReview(true, ['50.00', '49.99'])).toBe(true)
  })

  it('R21: una version que suma 100,01 esta por revisar', () => {
    expect(isVersionUnderReview(true, ['50.00', '50.01'])).toBe(true)
  })

  it('R21: una version que suma exactamente 100,00 no esta por revisar', () => {
    expect(isVersionUnderReview(true, ['50.00', '49.99', '0.01'])).toBe(false)
    expect(isVersionUnderReview(true, ['100'])).toBe(false)
  })
})

describe('propagateLines', () => {
  describe('R15: tabla por ingrediente', () => {
    it('R15: V igual a B (no cambiado) → toma A', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '70.00'), line('b', '30.00')]
      const version = [line('a', '60.00'), line('b', '40.00')]

      expect(propagateLines(before, after, version)).toEqual(after)
    })

    it('R15: V igual a B y A ausente (no cambiado) → la linea desaparece', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '100.00')]
      const version = [line('a', '60.00'), line('b', '40.00')]

      expect(propagateLines(before, after, version)).toEqual([line('a', '100.00')])
    })

    it('R15: V y B ausentes (⊥ = ⊥, no cambiado) → toma A', () => {
      const before = [line('a', '100.00')]
      const after = [line('a', '90.00'), line('n', '10.00')]
      const version = [line('a', '100.00')]

      expect(propagateLines(before, after, version)).toEqual(after)
    })

    it('R15: V distinto de B (cambiado) → se queda V', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '70.00'), line('b', '30.00')]
      const version = [line('a', '55.00'), line('b', '40.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '55.00'),
        line('b', '30.00'),
      ])
    })

    it('R15: V ausente y B presente (cambiado: la version lo quito) → sigue ausente', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '50.00'), line('b', '50.00')]
      const version = [line('a', '100.00')]

      expect(propagateLines(before, after, version)).toEqual([line('a', '100.00')])
    })
  })

  describe('R15: casos enumerados', () => {
    it('R15: la original sube un % que la version no toco → se propaga', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '65.00'), line('b', '35.00')]
      const version = [line('a', '60.00'), line('b', '40.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '65.00'),
        line('b', '35.00'),
      ])
    })

    it('R15: la original quita un ingrediente que la version conservaba igual → se quita', () => {
      const before = [line('a', '60.00'), line('b', '30.00'), line('c', '10.00')]
      const after = [line('a', '70.00'), line('b', '30.00')]
      const version = [line('a', '60.00'), line('b', '30.00'), line('c', '10.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '70.00'),
        line('b', '30.00'),
      ])
    })

    it('R15: la original quita uno que la version ya habia quitado → sigue fuera', () => {
      const before = [line('a', '60.00'), line('b', '30.00'), line('c', '10.00')]
      const after = [line('a', '70.00'), line('b', '30.00')]
      const version = [line('a', '70.00'), line('b', '30.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '70.00'),
        line('b', '30.00'),
      ])
    })

    it('R15: la original anade un ingrediente nuevo → aparece en la version', () => {
      const before = [line('a', '100.00')]
      const after = [line('a', '95.00'), line('n', '5.00')]
      const version = [line('a', '100.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '95.00'),
        line('n', '5.00'),
      ])
    })

    it('R15: la original anade uno que la version ya habia anadido por su cuenta → gana la version', () => {
      const before = [line('a', '100.00')]
      const after = [line('a', '95.00'), line('n', '5.00')]
      const version = [line('a', '92.00'), line('n', '8.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('a', '92.00'),
        line('n', '8.00'),
      ])
    })

    it('R15: la version cambio el % → se respeta aunque la original tambien lo cambie', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '80.00'), line('b', '20.00')]
      const version = [line('a', '75.00'), line('b', '25.00')]

      expect(propagateLines(before, after, version)).toEqual(version)
    })

    it('R15: "5" y "5.00" son el mismo porcentaje (no cambiado) → se propaga', () => {
      const before = [line('a', '95.00'), line('b', '5')]
      const after = [line('a', '94.00'), line('b', '6.00')]
      const version = [line('a', '95'), line('b', '5.00')]

      expect(propagateLines(before, after, version)).toEqual(after)
    })
  })

  describe('R20: el resultado puede quedar por revisar', () => {
    it('R20: el resultado no suma 100 → por revisar', () => {
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('a', '70.00'), line('b', '30.00')]
      const version = [line('a', '60.00'), line('b', '45.00')]

      const result = propagateLines(before, after, version)

      expect(result).toEqual([line('a', '70.00'), line('b', '45.00')])
      expect(isVersionUnderReview(true, result.map((l) => l.percentage))).toBe(true)
    })

    it('R20: el resultado queda vacio → por revisar', () => {
      // La version quito `b` y conserva `a` igual; la original cambia `a` por `b`.
      const before = [line('a', '60.00'), line('b', '40.00')]
      const after = [line('b', '100.00')]
      const version = [line('a', '60.00')]

      const result = propagateLines(before, after, version)

      expect(result).toEqual([])
      expect(isVersionUnderReview(true, result.map((l) => l.percentage))).toBe(true)
    })
  })

  describe('orden de salida', () => {
    it('R15: primero el orden de A, despues las lineas propias de V en su orden', () => {
      const before = [line('a', '50.00'), line('b', '50.00')]
      const after = [line('b', '40.00'), line('c', '10.00'), line('a', '50.00')]
      const version = [line('x', '5.00'), line('a', '45.00'), line('b', '50.00'), line('y', '1.00')]

      expect(propagateLines(before, after, version)).toEqual([
        line('b', '40.00'),
        line('c', '10.00'),
        line('a', '45.00'),
        line('x', '5.00'),
        line('y', '1.00'),
      ])
    })

    it('R15: no muta las entradas', () => {
      const before = Object.freeze([line('a', '100.00')])
      const after = Object.freeze([line('a', '90.00'), line('n', '10.00')])
      const version = Object.freeze([line('a', '100.00')])

      expect(() => propagateLines(before, after, version)).not.toThrow()
      expect(after).toHaveLength(2)
      expect(version).toHaveLength(1)
    })
  })
})
