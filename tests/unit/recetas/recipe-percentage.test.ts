// T2 — Aritmetica del porcentaje: `sumPercentages`, `consumedQuantity` y `formatPercentage`.
//
// Importado por el CONTRATO del modulo (`@/lib/modules/recetas`): si el barrel dejara de
// exportarlas, este archivo no compilaria.
//
// Cubre R3, R10, R13, R21, R25.

import { describe, expect, it } from 'vitest'

import {
  consumedQuantity,
  formatPercentage,
  percentageToHundredths,
  PERCENTAGE_PATTERN,
  RECIPE_TOTAL_PERCENTAGE,
  sumPercentages,
} from '@/lib/modules/recetas'

describe('PERCENTAGE_PATTERN y percentageToHundredths', () => {
  it('acepta hasta 3 enteros y 2 decimales', () => {
    expect(PERCENTAGE_PATTERN.test('100')).toBe(true)
    expect(PERCENTAGE_PATTERN.test('12.5')).toBe(true)
    expect(PERCENTAGE_PATTERN.test('12.50')).toBe(true)
  })

  it('rechaza mas de 2 decimales, negativos y no numericos', () => {
    expect(PERCENTAGE_PATTERN.test('12.345')).toBe(false)
    expect(PERCENTAGE_PATTERN.test('-1')).toBe(false)
    expect(PERCENTAGE_PATTERN.test('abc')).toBe(false)
  })

  it('devuelve centesimas exactas para un porcentaje valido', () => {
    expect(percentageToHundredths('97.5')).toBe(BigInt(9750))
    expect(percentageToHundredths('100')).toBe(BigInt(10000))
  })

  it('devuelve null cuando el valor no casa el patron', () => {
    expect(percentageToHundredths('12.345')).toBeNull()
    expect(percentageToHundredths('abc')).toBeNull()
  })
})

describe('consumedQuantity — R13, R21: cantidad del pedido x porcentaje / 100', () => {
  it('pedido 200 con 10 % de un insumo consume 20', () => {
    expect(consumedQuantity('200', '10')).toBe('20')
  })

  it('pedido 200 con 2 % de un insumo consume 4', () => {
    expect(consumedQuantity('200', '2')).toBe('4')
  })

  it('es exacta: 0,0001 x 0,01 % no pierde ninguna cifra', () => {
    expect(consumedQuantity('0.0001', '0.01')).toBe('0.00000001')
  })

  it('R21: los mismos porcentajes dan cantidades en proporcion 2:3 para pedidos de 200 y 300', () => {
    const doscientos = consumedQuantity('200', '10')
    const trescientos = consumedQuantity('300', '10')
    expect(doscientos).toBe('20')
    expect(trescientos).toBe('30')
  })

  it('acepta cantidades de pedido con hasta 4 decimales', () => {
    expect(consumedQuantity('123.4567', '100')).toBe('123.4567')
  })
})

describe('sumPercentages — R3, R10', () => {
  it('90 + 7,5 da total 97,50, diferencia 2,50, incompleta', () => {
    const resultado = sumPercentages(['90', '7.5'])
    expect(resultado.total).toBe('97.50')
    expect(resultado.difference).toBe('2.50')
    expect(resultado.isComplete).toBe(false)
  })

  it('92,5 + 7,5 esta completa', () => {
    const resultado = sumPercentages(['92.5', '7.5'])
    expect(resultado.total).toBe(RECIPE_TOTAL_PERCENTAGE)
    expect(resultado.difference).toBe('0.00')
    expect(resultado.isComplete).toBe(true)
  })

  it('60 + 41 sobra: diferencia -1,00', () => {
    const resultado = sumPercentages(['60', '41'])
    expect(resultado.total).toBe('101.00')
    expect(resultado.difference).toBe('-1.00')
    expect(resultado.isComplete).toBe(false)
  })

  it('R3: la lista vacia da total 0,00 e incompleta', () => {
    const resultado = sumPercentages([])
    expect(resultado.total).toBe('0.00')
    expect(resultado.difference).toBe('100.00')
    expect(resultado.isComplete).toBe(false)
  })

  it('un valor que no casa el patron no suma', () => {
    const resultado = sumPercentages(['97.5', 'abc'])
    expect(resultado.total).toBe('97.50')
  })
})

describe('formatPercentage — R25', () => {
  it('«12.5» da «12,50»', () => {
    expect(formatPercentage('12.5')).toBe('12,50')
  })

  it('«10.00» da «10,00»', () => {
    expect(formatPercentage('10.00')).toBe('10,00')
  })

  it('«100» da «100,00»', () => {
    expect(formatPercentage('100')).toBe('100,00')
  })

  it('«-1.00» da «-1,00»: acepta valores negativos de diferencia', () => {
    expect(formatPercentage('-1.00')).toBe('-1,00')
  })
})
