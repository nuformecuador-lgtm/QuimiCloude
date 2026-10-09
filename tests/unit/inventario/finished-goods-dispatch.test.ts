// Envases enteros de un lote de producto terminado: la parte entera de existencia / contenido,
// exacta a cuatro decimales.

import { describe, expect, it } from 'vitest'

import { wholePackagesIn } from '@/lib/modules/inventario'
import { quantityForPackages } from '@/lib/modules/inventario/domain/finished-goods-dispatch'

describe('wholePackagesIn (R20, R7)', () => {
  it.each([
    { caso: 'division exacta', stock: '20.0000', content: '5.0000', esperado: 4 },
    { caso: 'con resto, se queda con la parte entera', stock: '22.5000', content: '5.0000', esperado: 4 },
    { caso: 'contenido decimal', stock: '3.0000', content: '0.7500', esperado: 4 },
    { caso: 'contenido decimal con resto', stock: '2.9999', content: '0.7500', esperado: 3 },
    { caso: 'existencia menor que un envase', stock: '0.7499', content: '0.7500', esperado: 0 },
    { caso: 'existencia cero', stock: '0.0000', content: '1.0000', esperado: 0 },
    { caso: 'sin decimales en la entrada', stock: '10', content: '3', esperado: 3 },
    { caso: 'cifras grandes sin perder precision', stock: '9999999999.9999', content: '0.0001', esperado: 99999999999999 },
  ])('R20: $caso', ({ stock, content, esperado }) => {
    expect(wholePackagesIn(stock, content)).toBe(esperado)
  })

  it('R7: sin contenido positivo o con existencia negativa no hay envases', () => {
    expect(wholePackagesIn('10.0000', '0.0000')).toBe(0)
    expect(wholePackagesIn('-5.0000', '1.0000')).toBe(0)
  })

  it('R20: una cadena que no es decimal lanza', () => {
    expect(() => wholePackagesIn('abc', '1.0000')).toThrow(/no es un decimal valido/)
  })
})

describe('quantityForPackages (R23)', () => {
  it.each([
    { caso: 'contenido entero', packages: 4, content: '5.0000', esperado: '20.0000' },
    { caso: 'contenido decimal', packages: 3, content: '0.7500', esperado: '2.2500' },
    { caso: 'un envase de la escala minima', packages: 1, content: '0.0001', esperado: '0.0001' },
    { caso: 'sin decimales en la entrada', packages: 2, content: '3', esperado: '6.0000' },
    { caso: 'cifras grandes sin perder precision', packages: 1000, content: '9999999.9999', esperado: '9999999999.9000' },
  ])('R23: $caso', ({ packages, content, esperado }) => {
    expect(quantityForPackages(packages, content)).toBe(esperado)
  })

  it('R23: envases que no son un entero no negativo lanzan', () => {
    expect(() => quantityForPackages(1.5, '1.0000')).toThrow(/envases no validos/)
    expect(() => quantityForPackages(-1, '1.0000')).toThrow(/envases no validos/)
  })
})
