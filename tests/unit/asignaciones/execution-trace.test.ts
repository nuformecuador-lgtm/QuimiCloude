// El calculo puro del recorrido de un pedido: tramos, una sola duracion, vueltas atras y personas.

import { describe, expect, it } from 'vitest'

import type { ExecutionAction, ExecutionEntryRecord } from '@/lib/modules/asignaciones/domain/execution-entry'
import { FINAL_STATUSES, buildExecutionTrace } from '@/lib/modules/asignaciones/domain/execution-trace'

const ORDER = '22222222-2222-4222-8222-222222222222'
const ANA = '33333333-3333-4333-8333-333333333333'
const LUIS = '44444444-4444-4444-8444-444444444444'
const T0 = Date.parse('2026-10-01T08:00:00.000Z')
const MIN = 60_000
const HOUR = 60 * MIN

let seq = 0
function entry(action: ExecutionAction, offsetMs: number, userId = ANA): ExecutionEntryRecord {
  seq += 1
  return {
    id: `e-${String(seq).padStart(4, '0')}`,
    orderId: ORDER,
    userId,
    action,
    stepPosition: action === 'pack_start' || action === 'pack_finish' ? null : 1,
    reason: action === 'cancel' ? 'sin material' : null,
    occurredAt: new Date(T0 + offsetMs),
  }
}

const NOW = new Date(T0 + 100 * HOUR)
const vivo = (status: Parameters<typeof buildExecutionTrace>[1]['status']) => ({ status, deleted: false })

/** Ejecucion completa con una pausa larga antes de `resume` y hueco entre `finish` y `pack_start`. */
function recorridoEntregado(): ExecutionEntryRecord[] {
  return [
    entry('start', 0),
    entry('advance', 10 * MIN),
    entry('resume', 10 * MIN + 20 * HOUR), // pausa larga
    entry('go_back', 10 * MIN + 20 * HOUR + 5 * MIN, LUIS),
    entry('finish', 21 * HOUR),
    entry('pack_start', 30 * HOUR, LUIS), // hueco finish -> pack_start
    entry('pack_finish', 31 * HOUR, LUIS),
  ]
}

describe('buildExecutionTrace: tramos (R14)', () => {
  it('R14: cada anotacion salvo la ultima lleva el tramo hasta la siguiente; la ultima, null', () => {
    const trace = buildExecutionTrace(
      [entry('start', 0), entry('advance', 90_000), entry('advance', 90_000 + 30_000)],
      vivo('EN_CURSO'),
      NOW,
    )
    expect(trace.steps.map((s) => s.gapToNextMs)).toEqual([90_000, 30_000, null])
  })

  it('R14: los pasos conservan los campos de la anotacion en el mismo orden', () => {
    const entries = recorridoEntregado()
    const trace = buildExecutionTrace(entries, vivo('ENTREGADO'), NOW)
    expect(trace.steps.map((s) => s.id)).toEqual(entries.map((e) => e.id))
    expect(trace.steps[0]).toMatchObject(entries[0] ?? {})
  })

  it('R14: dos anotaciones del mismo instante dan tramo 0', () => {
    const trace = buildExecutionTrace([entry('start', 0), entry('advance', 0)], vivo('EN_CURSO'), NOW)
    expect(trace.steps[0]?.gapToNextMs).toBe(0)
  })
})

describe('buildExecutionTrace: una sola duracion de reloj (R15)', () => {
  it('R15: el resultado tiene una sola `duration` y ningun campo de ejecucion ni de empaque', () => {
    const trace = buildExecutionTrace(recorridoEntregado(), vivo('ENTREGADO'), NOW)
    expect(Object.keys(trace).sort()).toEqual(['duration', 'firstAt', 'goBackCount', 'lastAt', 'steps', 'userIds'])
    expect(Object.keys(trace.duration).sort()).toEqual(['kind', 'ms'])
  })

  it('R15: ENTREGADO con ultima pack_finish es closed, de la primera a la ultima con pausa y hueco dentro', () => {
    const trace = buildExecutionTrace(recorridoEntregado(), vivo('ENTREGADO'), NOW)
    expect(trace.duration).toEqual({ kind: 'closed', ms: 31 * HOUR })
    expect(trace.firstAt).toEqual(new Date(T0))
    expect(trace.lastAt).toEqual(new Date(T0 + 31 * HOUR))
  })

  it('R15: la duracion es de reloj: lastAt - firstAt, igual a la suma de todos los tramos con pausas incluidas', () => {
    const trace = buildExecutionTrace(recorridoEntregado(), vivo('ENTREGADO'), NOW)
    const suma = trace.steps.reduce((acc, s) => acc + (s.gapToNextMs ?? 0), 0)
    expect(trace.duration.ms).toBe(suma)
    expect(trace.duration.ms).toBe(trace.lastAt.getTime() - trace.firstAt.getTime())
  })

  it('R15: CANCELADO con ultima cancel es closed', () => {
    const trace = buildExecutionTrace([entry('start', 0), entry('cancel', 45 * MIN)], vivo('CANCELADO'), NOW)
    expect(trace.duration).toEqual({ kind: 'closed', ms: 45 * MIN })
  })

  it('R15: CANCELADO sin cancel anotado es unclosed, cerrada en la ultima anotacion', () => {
    const trace = buildExecutionTrace([entry('start', 0), entry('advance', 20 * MIN)], vivo('CANCELADO'), NOW)
    expect(trace.duration).toEqual({ kind: 'unclosed', ms: 20 * MIN })
  })

  it('R15: ENTREGADO sin pack_finish es unclosed', () => {
    const trace = buildExecutionTrace(
      [entry('start', 0), entry('finish', HOUR), entry('pack_start', 2 * HOUR)],
      vivo('ENTREGADO'),
      NOW,
    )
    expect(trace.duration).toEqual({ kind: 'unclosed', ms: 2 * HOUR })
  })

  it('R15: una sola anotacion en un pedido no activo da ms 0', () => {
    expect(buildExecutionTrace([entry('start', 0)], vivo('CANCELADO'), NOW).duration).toEqual({
      kind: 'unclosed',
      ms: 0,
    })
    expect(buildExecutionTrace([entry('cancel', 0)], vivo('CANCELADO'), NOW).duration).toEqual({
      kind: 'closed',
      ms: 0,
    })
  })

  it('R15: FINAL_STATUSES es exactamente ENTREGADO y CANCELADO', () => {
    expect([...FINAL_STATUSES]).toEqual(['ENTREGADO', 'CANCELADO'])
  })
})

describe('buildExecutionTrace: duracion abierta mientras el pedido esta activo (R3)', () => {
  it.each(['EN_CURSO', 'POR_EMPACAR', 'EN_EMPAQUE'] as const)(
    'R3: %s es open y cuenta hasta now, no hasta la ultima anotacion',
    (status) => {
      const trace = buildExecutionTrace([entry('start', 0), entry('finish', HOUR)], vivo(status), NOW)
      expect(trace.duration).toEqual({ kind: 'open', ms: 100 * HOUR })
    },
  )

  it('R3: activo aunque la ultima anotacion sea de cierre sigue open', () => {
    const trace = buildExecutionTrace([entry('start', 0), entry('pack_finish', HOUR)], vivo('EN_EMPAQUE'), NOW)
    expect(trace.duration.kind).toBe('open')
  })

  it('R3: dado de baja con estado EN_CURSO es unclosed, no open', () => {
    const trace = buildExecutionTrace(
      [entry('start', 0), entry('advance', 15 * MIN)],
      { status: 'EN_CURSO', deleted: true },
      NOW,
    )
    expect(trace.duration).toEqual({ kind: 'unclosed', ms: 15 * MIN })
  })

  it('R3: dado de baja con ultima cancel es closed', () => {
    const trace = buildExecutionTrace(
      [entry('start', 0), entry('cancel', 5 * MIN)],
      { status: 'CANCELADO', deleted: true },
      NOW,
    )
    expect(trace.duration).toEqual({ kind: 'closed', ms: 5 * MIN })
  })
})

describe('buildExecutionTrace: vueltas atras (R16)', () => {
  it('R16: cada go_back queda marcado y goBackCount los cuenta', () => {
    const trace = buildExecutionTrace(
      [entry('start', 0), entry('advance', 1), entry('go_back', 2), entry('advance', 3), entry('go_back', 4)],
      vivo('EN_CURSO'),
      NOW,
    )
    expect(trace.steps.map((s) => s.isGoBack)).toEqual([false, false, true, false, true])
    expect(trace.goBackCount).toBe(2)
  })

  it('R16: sin go_back el contador es 0', () => {
    expect(buildExecutionTrace([entry('start', 0)], vivo('EN_CURSO'), NOW).goBackCount).toBe(0)
  })
})

describe('buildExecutionTrace: personas', () => {
  it('R2: personas distintas en orden de aparicion', () => {
    const trace = buildExecutionTrace(recorridoEntregado(), vivo('ENTREGADO'), NOW)
    expect(trace.userIds).toEqual([ANA, LUIS])
  })

  it('R2: sin anotaciones lanza (el caso de uso nunca la llama asi)', () => {
    expect(() => buildExecutionTrace([], vivo('EN_CURSO'), NOW)).toThrow()
  })
})
