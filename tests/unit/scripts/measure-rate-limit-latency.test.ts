import { describe, expect, it } from 'vitest'

import { percentile, summarizeLatencies } from '@/scripts/measure-rate-limit-latency'

describe('percentile', () => {
  it('R34 — con un numero impar de valores, p50 es la mediana', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
  })

  it('R34 — con un numero par de valores, p50 toma el rango mas cercano por encima', () => {
    expect(percentile([4, 1, 3, 2], 50)).toBe(2)
  })

  it('R34 — con un solo valor, cualquier percentil devuelve ese valor', () => {
    expect(percentile([42], 50)).toBe(42)
    expect(percentile([42], 95)).toBe(42)
  })

  it('R34 — p95 sobre diez valores ordenados toma el mas alto', () => {
    const values = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    expect(percentile(values, 95)).toBe(10)
  })

  it('R34 — no muta el arreglo de entrada', () => {
    const values = [3, 1, 2]
    percentile(values, 50)
    expect(values).toEqual([3, 1, 2])
  })

  it('R34 — lanza si el arreglo esta vacio', () => {
    expect(() => percentile([], 50)).toThrow()
  })
})

describe('summarizeLatencies', () => {
  it('R34 — devuelve p50 y p95 calculados con percentile', () => {
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(summarizeLatencies(durations)).toEqual({ p50: 50, p95: 100 })
  })
})
