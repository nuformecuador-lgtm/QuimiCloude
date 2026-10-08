// La regla pura de la entrega: lo que falta por linea y el tope por linea y por lote. La misma
// funcion la llaman el sheet, con los lotes que leyo, y el servidor, con `batches: null`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DELIVERY_MAX_ALLOCATIONS,
  checkDelivery,
  remainingPackages,
  type DeliveryAllocation,
  type DeliveryBatchState,
  type DeliveryLineState,
} from '@/lib/modules/pedidos'

const L1 = 'line-1'
const L2 = 'line-2'
const B1 = 'batch-1'
const B2 = 'batch-2'
const B3 = 'batch-3'

const LINES: readonly DeliveryLineState[] = [
  { presentationLineId: L1, orderedPackages: 10, deliveredPackages: 4 },
  { presentationLineId: L2, orderedPackages: 5, deliveredPackages: 0 },
]

const BATCHES: readonly DeliveryBatchState[] = [
  { batchId: B1, presentationLineId: L1, availablePackages: 3 },
  { batchId: B2, presentationLineId: L1, availablePackages: 8 },
  { batchId: B3, presentationLineId: L2, availablePackages: 5 },
]

const alloc = (presentationLineId: string, batchId: string, packages: number): DeliveryAllocation => ({
  presentationLineId,
  batchId,
  packages,
})

describe('remainingPackages (R16)', () => {
  it('R16: lo que falta es pedidos menos entregados, nunca negativo', () => {
    expect(remainingPackages({ presentationLineId: L1, orderedPackages: 10, deliveredPackages: 4 })).toBe(6)
    expect(remainingPackages({ presentationLineId: L1, orderedPackages: 10, deliveredPackages: 10 })).toBe(0)
    expect(remainingPackages({ presentationLineId: L1, orderedPackages: 10, deliveredPackages: 12 })).toBe(0)
  })
})

describe('checkDelivery (R16, R11, R12, R15, R18, R20, R26, R27)', () => {
  it.each<{ caso: string; allocations: readonly DeliveryAllocation[]; batches: readonly DeliveryBatchState[] | null; esperado: unknown }>([
    { caso: 'R15: sin asignaciones es empty', allocations: [], batches: BATCHES, esperado: { kind: 'empty' } },
    {
      caso: 'R15: asignaciones todas en cero son empty',
      allocations: [alloc(L1, B1, 0), alloc(L2, B3, 0)],
      batches: BATCHES,
      esperado: { kind: 'empty' },
    },
    {
      caso: 'R11 R18: pasar de lo que falta en una linea es exceeds_remaining con esa linea',
      allocations: [alloc(L1, B2, 7), alloc(L2, B3, 1)],
      batches: BATCHES,
      esperado: { kind: 'exceeds_remaining', presentationLineIds: [L1] },
    },
    {
      caso: 'R12 R20: pasar de lo que tiene un lote es exceeds_batch con ese lote',
      allocations: [alloc(L1, B1, 4)],
      batches: BATCHES,
      esperado: { kind: 'exceeds_batch', batchIds: [B1] },
    },
    {
      caso: 'R16: el exceso por linea va antes que el exceso por lote',
      allocations: [alloc(L1, B1, 7)],
      batches: BATCHES,
      esperado: { kind: 'exceeds_remaining', presentationLineIds: [L1] },
    },
    {
      caso: 'R16: con batches null no se comprueba el tope por lote',
      allocations: [alloc(L1, B1, 6)],
      batches: null,
      esperado: { kind: 'ok', completesOrder: false },
    },
    {
      caso: 'R26: si a alguna linea le siguen faltando envases, completesOrder es false',
      allocations: [alloc(L1, B2, 6)],
      batches: BATCHES,
      esperado: { kind: 'ok', completesOrder: false },
    },
    {
      caso: 'R27: si no le falta nada a ninguna linea, completesOrder es true',
      allocations: [alloc(L1, B2, 6), alloc(L2, B3, 5)],
      batches: BATCHES,
      esperado: { kind: 'ok', completesOrder: true },
    },
    {
      caso: 'R16: varias asignaciones a la misma linea se suman',
      allocations: [alloc(L1, B1, 3), alloc(L1, B2, 3), alloc(L2, B3, 5)],
      batches: BATCHES,
      esperado: { kind: 'ok', completesOrder: true },
    },
    {
      caso: 'R11 R18: la suma de varias asignaciones a la misma linea tambien topa',
      allocations: [alloc(L1, B1, 3), alloc(L1, B2, 4)],
      batches: BATCHES,
      esperado: { kind: 'exceeds_remaining', presentationLineIds: [L1] },
    },
    {
      caso: 'R12: un lote que no esta entre los leidos no tiene envases disponibles',
      allocations: [alloc(L2, 'batch-x', 1)],
      batches: BATCHES,
      esperado: { kind: 'exceeds_batch', batchIds: ['batch-x'] },
    },
    {
      caso: 'R18: una linea que no es del pedido no tiene envases que faltan',
      allocations: [alloc('line-x', B1, 1)],
      batches: null,
      esperado: { kind: 'exceeds_remaining', presentationLineIds: ['line-x'] },
    },
  ])('$caso', ({ allocations, batches, esperado }) => {
    expect(checkDelivery(LINES, batches, allocations)).toEqual(esperado)
  })

  it('R27: una linea ya completa no impide completar el pedido', () => {
    const lines: readonly DeliveryLineState[] = [
      { presentationLineId: L1, orderedPackages: 4, deliveredPackages: 4 },
      { presentationLineId: L2, orderedPackages: 5, deliveredPackages: 2 },
    ]

    expect(checkDelivery(lines, BATCHES, [alloc(L2, B3, 3)])).toEqual({ kind: 'ok', completesOrder: true })
  })

  it('R11 R12: devuelve todas las lineas y todos los lotes que exceden, no solo el primero', () => {
    expect(checkDelivery(LINES, BATCHES, [alloc(L1, B2, 7), alloc(L2, B3, 6)])).toEqual({
      kind: 'exceeds_remaining',
      presentationLineIds: [L1, L2],
    })
    expect(checkDelivery(LINES, BATCHES, [alloc(L1, B1, 4), alloc(L2, B3, 5)])).toEqual({
      kind: 'exceeds_batch',
      batchIds: [B1],
    })
  })

  it('R16: el tope de asignaciones por entrega es 200', () => {
    expect(DELIVERY_MAX_ALLOCATIONS).toBe(200)
  })
})

// QC-223 2026-10-08 (TC): el sheet y el servidor no calculan el tope por su cuenta.
//
// Rutas de import aceptadas (decision del humano, 2026-10-08):
// - el sheet importa del barrel `@/lib/modules/pedidos`, como cualquier consumidor de fuera del
//   modulo;
// - `deliver-order.ts` y `get-order-delivery.ts` importan de `./order-delivery`, porque el barrel de
//   `pedidos` reexporta esos mismos casos de uso e importarlo desde ellos crearia un ciclo.
describe('una sola funcion pura en el sheet y en el servidor (R16)', () => {
  const RAIZ = join(__dirname, '..', '..', '..')
  const FUENTES = [
    { ruta: 'app/(private)/pedidos/components/order-delivery-sheet.tsx', desde: '@/lib/modules/pedidos' },
    { ruta: 'lib/modules/pedidos/domain/deliver-order.ts', desde: './order-delivery' },
    { ruta: 'lib/modules/pedidos/domain/get-order-delivery.ts', desde: './order-delivery' },
  ] as const

  function soloCodigo(texto: string): string {
    return texto
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((linea) => linea.replace(/\/\/.*$/, ''))
      .join('\n')
  }

  /** Origen de cada import que trae `checkDelivery` o `remainingPackages`. */
  function origenesDeLaRegla(codigo: string): string[] {
    const origenes: string[] = []
    for (const m of codigo.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const nombres = (m[1] ?? '').split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
      if (nombres.some((n) => n === 'checkDelivery' || n === 'remainingPackages')) origenes.push(m[2] ?? '')
    }
    return origenes
  }

  /** Restas de envases pedidos menos entregados escritas a mano. */
  const ARITMETICA_PROPIA = [
    /\b\w*ordered\w*\s*-(?!-)/i,
    /-(?!-)\s*[\w.]*delivered\w*/i,
    /\.packages\s*-(?!-)/,
    /Math\.max\(\s*0\s*,/,
  ]
  const aritmeticaPropia = (codigo: string): RegExp[] => ARITMETICA_PROPIA.filter((r) => r.test(codigo))

  it.each(FUENTES)('R16: $ruta importa la regla de $desde y no resta envases por su cuenta', ({ ruta, desde }) => {
    const codigo = soloCodigo(readFileSync(join(RAIZ, ruta), 'utf8'))

    const origenes = origenesDeLaRegla(codigo)
    expect(origenes.length, `${ruta} tiene que importar checkDelivery o remainingPackages`).toBeGreaterThan(0)
    expect(new Set(origenes)).toEqual(new Set([desde]))
    expect(aritmeticaPropia(codigo), `${ruta} calcula el tope por su cuenta`).toEqual([])
  })

  it('R16: el detector caza una resta propia y un import de otra ruta (caso sintetico)', () => {
    const sintetico = soloCodigo(
      [
        "import { checkDelivery } from '@/lib/modules/pedidos/domain/order-delivery'",
        'const falta = line.orderedPackages - line.deliveredPackages',
      ].join('\n'),
    )

    expect(origenesDeLaRegla(sintetico)).toEqual(['@/lib/modules/pedidos/domain/order-delivery'])
    expect(aritmeticaPropia(sintetico).length).toBeGreaterThan(0)
    expect(aritmeticaPropia(soloCodigo('const x = Math.max(0, pedidos - hechos)')).length).toBeGreaterThan(0)
  })
})
