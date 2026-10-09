// `orderNumberContains`: el filtro por parte del numero se decide sobre el numero tal como se ve
// (`formatOrderNumber`), sin normalizar nada mas que los espacios de los extremos.

import { describe, expect, it } from 'vitest'

import { formatOrderNumber, orderNumberContains, type OrderNumber } from '@/lib/modules/pedidos'

const n = (year: number, sequence: number): OrderNumber => ({ year, sequence })

describe('orderNumberContains', () => {
  it('R6: `42` casa con 2026-0000042, 2026-0000142 y 2026-0004200, y no con 2026-0000043', () => {
    expect(orderNumberContains(n(2026, 42), '42')).toBe(true)
    expect(orderNumberContains(n(2026, 142), '42')).toBe(true)
    expect(orderNumberContains(n(2026, 4200), '42')).toBe(true)
    expect(orderNumberContains(n(2026, 43), '42')).toBe(false)
  })

  it('R6: `0000042` casa con 2026-0000042 y 2025-0000042, y no con 2026-0000142', () => {
    expect(orderNumberContains(n(2026, 42), '0000042')).toBe(true)
    expect(orderNumberContains(n(2025, 42), '0000042')).toBe(true)
    expect(orderNumberContains(n(2026, 142), '0000042')).toBe(false)
  })

  it('R6: `2026-0000042` casa solo con ese pedido', () => {
    expect(orderNumberContains(n(2026, 42), '2026-0000042')).toBe(true)
    expect(orderNumberContains(n(2025, 42), '2026-0000042')).toBe(false)
    expect(orderNumberContains(n(2026, 142), '2026-0000042')).toBe(false)
    expect(orderNumberContains(n(2026, 43), '2026-0000042')).toBe(false)
  })

  it('R6: `2026-` casa con cualquier secuencia de 2026 y no con 2025', () => {
    expect(orderNumberContains(n(2026, 1), '2026-')).toBe(true)
    expect(orderNumberContains(n(2026, 9_999_999), '2026-')).toBe(true)
    expect(orderNumberContains(n(2025, 1), '2026-')).toBe(false)
  })

  it('R6: `2026-42` NO casa con 2026-0000042 (no es subcadena) y si con 2026-4200000', () => {
    expect(orderNumberContains(n(2026, 42), '2026-42')).toBe(false)
    expect(orderNumberContains(n(2026, 4_200_000), '2026-42')).toBe(true)
  })

  it('R6: `2026` casa con los de 2026 y con una secuencia de otro año que contiene 2026', () => {
    expect(orderNumberContains(n(2026, 1), '2026')).toBe(true)
    expect(orderNumberContains(n(2025, 2026), '2026')).toBe(true)
    expect(orderNumberContains(n(2025, 1), '2026')).toBe(false)
  })

  it('R6: los espacios de los extremos se ignoran', () => {
    expect(orderNumberContains(n(2026, 42), '  42  ')).toBe(true)
    expect(orderNumberContains(n(2026, 42), '\t2026-0000042 ')).toBe(true)
  })

  it('R6: `abc`, `42a` y `2026 42` no casan con nada', () => {
    const numeros = [n(2026, 42), n(2026, 4200), n(2025, 42), n(2026, 2042)]
    for (const texto of ['abc', '42a', '2026 42']) {
      for (const numero of numeros) {
        expect(orderNumberContains(numero, texto), `${texto} sobre ${formatOrderNumber(numero)}`).toBe(false)
      }
    }
  })

  it('R6: `-` y `--` no casan con nada aunque `-` sea subcadena de todos los numeros', () => {
    const numeros = [n(2026, 42), n(2025, 1), n(2026, 9_999_999)]
    for (const numero of numeros) {
      expect(formatOrderNumber(numero).includes('-')).toBe(true)
      expect(orderNumberContains(numero, '-')).toBe(false)
      expect(orderNumberContains(numero, '--')).toBe(false)
      expect(orderNumberContains(numero, ' - ')).toBe(false)
    }
  })

  it('R6: una secuencia de ocho digitos se compara contra su forma sin truncar', () => {
    const grande = n(2026, 12_345_678)
    expect(formatOrderNumber(grande)).toBe('2026-12345678')
    expect(orderNumberContains(grande, '2026-12345678')).toBe(true)
    expect(orderNumberContains(grande, '45678')).toBe(true)
    expect(orderNumberContains(grande, '2026-1234567 8')).toBe(false)
    expect(orderNumberContains(n(2026, 1_234_567), '2026-12345678')).toBe(false)
  })
})
