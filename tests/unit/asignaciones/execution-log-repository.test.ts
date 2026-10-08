// El registro de ejecucion: tipo de la anotacion, puertos, predicado de exito y error interno.
// Los casos negativos de tipos van con `@ts-expect-error`: si la linea pasara a compilar, la
// directiva sin usar pone rojo el typecheck.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { OrderExecutionAction } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  EXECUTION_ACTIONS,
  ExecutionAbortedError,
  isExecutionSuccess,
  type ExecutionAction,
  type ExecutionEntryRecord,
  type NewExecutionEntry,
} from '@/lib/modules/asignaciones/domain/execution-entry'
import { AsignacionesError, NotCancellableError } from '@/lib/modules/asignaciones/domain/errors'
import type { ExecutionLogRepository } from '@/lib/modules/asignaciones/ports/execution-log-repository'
import type {
  ExecutionTransaction,
  ExecutionWriters,
} from '@/lib/modules/asignaciones/ports/execution-transaction'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-06T12:00:00.000Z')

const base = { companyId: COMPANY, orderId: ORDER, userId: USER, occurredAt: NOW } as const

const PUERTOS_ABS = dirname(fileURLToPath(import.meta.url)) + '/../../../lib/modules/asignaciones/ports'
const PUERTO_REGISTRO_ABS = join(PUERTOS_ABS, 'execution-log-repository.ts')

/** Doble que implementa el puerto: si el puerto ganara un metodo, dejaria de satisfacerlo. */
class RegistroDoble implements ExecutionLogRepository {
  readonly anotadas: NewExecutionEntry[] = []

  append(entry: NewExecutionEntry): Promise<void> {
    this.anotadas.push(entry)
    return Promise.resolve()
  }

  findLastStepPosition(companyId: string, orderId: string): Promise<number | null> {
    return Promise.resolve(companyId === COMPANY && orderId === ORDER ? null : -1)
  }

  listExecutedOrderIds(): Promise<readonly string[]> {
    return Promise.resolve([])
  }

  listEntriesForOrders(): Promise<readonly ExecutionEntryRecord[]> {
    return Promise.resolve([])
  }

  listUserIdsWithEntries(): Promise<readonly string[]> {
    return Promise.resolve([])
  }
}

describe('NewExecutionEntry: el motivo solo en cancelar (R8)', () => {
  it('R8: una anotacion `cancel` sin `reason` no compila', () => {
    // @ts-expect-error `cancel` exige `reason`.
    const sinMotivo: NewExecutionEntry = { ...base, action: 'cancel', stepPosition: 2 }
    expect(sinMotivo.action).toBe('cancel')
  })

  it('R8: una anotacion `advance` con `reason` no compila', () => {
    const conMotivo: NewExecutionEntry = {
      ...base,
      action: 'advance',
      stepPosition: 3,
      // @ts-expect-error `reason` solo existe en la rama `cancel`.
      reason: 'no deberia estar',
    }
    expect(conMotivo.action).toBe('advance')
  })

  it('R8: `cancel` con `reason` y `advance` sin el compilan', () => {
    const cancelar: NewExecutionEntry = { ...base, action: 'cancel', stepPosition: 2, reason: 'sin material' }
    const avanzar: NewExecutionEntry = { ...base, action: 'advance', stepPosition: 3 }
    expect([cancelar.action, avanzar.action]).toEqual(['cancel', 'advance'])
  })
})

describe('NewExecutionEntry: el empaque va sin posicion (R5bis)', () => {
  it('R5bis: `pack_start` con `stepPosition` numerico no compila', () => {
    // @ts-expect-error las anotaciones de empaque solo admiten `stepPosition: null`.
    const conPosicion: NewExecutionEntry = { ...base, action: 'pack_start', stepPosition: 1 }
    expect(conPosicion.action).toBe('pack_start')
  })

  it('R5bis: `pack_finish` con `stepPosition` numerico no compila', () => {
    // @ts-expect-error las anotaciones de empaque solo admiten `stepPosition: null`.
    const conPosicion: NewExecutionEntry = { ...base, action: 'pack_finish', stepPosition: 4 }
    expect(conPosicion.action).toBe('pack_finish')
  })

  it('R5bis: `pack_start` y `pack_finish` con `stepPosition: null` compilan', () => {
    const comenzar: NewExecutionEntry = { ...base, action: 'pack_start', stepPosition: null }
    const terminar: NewExecutionEntry = { ...base, action: 'pack_finish', stepPosition: null }
    expect([comenzar.stepPosition, terminar.stepPosition]).toEqual([null, null])
  })

  it('R5bis: `pack_start` con motivo tampoco compila (R8)', () => {
    const conMotivo: NewExecutionEntry = {
      ...base,
      action: 'pack_start',
      stepPosition: null,
      // @ts-expect-error `reason` solo existe en la rama `cancel`.
      reason: 'no deberia estar',
    }
    expect(conMotivo.action).toBe('pack_start')
  })
})

describe('ExecutionAction: total sobre las ocho del enum (R1)', () => {
  it('R1: el dominio declara exactamente ocho acciones, y el enum de Prisma tambien', () => {
    expect(EXECUTION_ACTIONS).toHaveLength(8)
    expect(new Set(EXECUTION_ACTIONS).size).toBe(8)
    expect(Object.values(OrderExecutionAction)).toHaveLength(8)
  })

  it.each(EXECUTION_ACTIONS)('R1: la accion %s tiene su valor en el enum de Prisma', (action) => {
    expect(Object.values(OrderExecutionAction)).toContain(action.toUpperCase())
  })

  it('R1: todo valor del enum de Prisma tiene su accion en el dominio', () => {
    const delDominio = EXECUTION_ACTIONS.map((a) => a.toUpperCase()).sort()
    expect([...Object.values(OrderExecutionAction)].sort()).toEqual(delDominio)
  })

  it('R1: `ExecutionAction` es la union de las ocho, ni una mas', () => {
    const exhaustivo = (a: ExecutionAction): number => {
      switch (a) {
        case 'start':
        case 'resume':
        case 'advance':
        case 'go_back':
        case 'cancel':
        case 'finish':
        case 'pack_start':
        case 'pack_finish':
          return 1
        default: {
          const nunca: never = a
          return nunca
        }
      }
    }
    expect(EXECUTION_ACTIONS.map(exhaustivo)).toHaveLength(8)
  })
})

describe('ExecutionLogRepository: solo anexar (R31)', () => {
  // Enmendado el 2026-10-07: el puerto gana tres lecturas para el recorrido del dashboard; sigue sin
  // nada que modifique o borre.
  it('R31 / R22: el puerto declara `append`, `findLastStepPosition` y tres lecturas, y nada mas', () => {
    const fuente = readFileSync(PUERTO_REGISTRO_ABS, 'utf8')
    const metodos = [...fuente.matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1])
    expect(metodos).toEqual([
      'append',
      'findLastStepPosition',
      'listExecutedOrderIds',
      'listEntriesForOrders',
      'listUserIdsWithEntries',
    ])
  })

  it('R31 / R22: el puerto no declara nada que modifique ni borre una anotacion', () => {
    const fuente = readFileSync(PUERTO_REGISTRO_ABS, 'utf8')
    expect(fuente).not.toMatch(/\b(update|upsert|delete|remove|patch|replace|edit)\w*\s*\(/i)
  })

  it('R31: un doble con solo esos cinco metodos satisface el puerto', async () => {
    const registro = new RegistroDoble()
    await registro.append({ ...base, action: 'start', stepPosition: 1 })
    expect(registro.anotadas).toHaveLength(1)
    await expect(registro.findLastStepPosition(COMPANY, ORDER)).resolves.toBeNull()
  })

  it('R31: los dos puertos son dominio puro, sin Prisma ni Next', () => {
    for (const archivo of ['execution-log-repository.ts', 'execution-transaction.ts']) {
      const fuente = readFileSync(join(PUERTOS_ABS, archivo), 'utf8')
      expect(fuente).not.toMatch(/from '(@prisma\/client|next\/[^']*|@\/lib\/shared\/[^']*)'/)
    }
  })
})

describe('ExecutionTransaction: los escritores que recibe el trabajo (R24)', () => {
  it('R24: `run` entrega exactamente `orders`, `packing` y `log`, y devuelve lo que devuelve `work`', async () => {
    const writers: ExecutionWriters = {
      orders: {
        transitionAliveById: () => Promise.resolve('ok'),
        cancelAliveById: () => Promise.resolve('ok'),
      },
      packing: {
        startPackingAliveById: () => Promise.resolve('ok'),
        finishPackingAliveById: () => Promise.resolve({ kind: 'ok', finishedGoods: [] }),
      },
      log: new RegistroDoble(),
    }
    const transaccion: ExecutionTransaction = { run: (work) => work(writers) }

    const claves = await transaccion.run((w) => Promise.resolve(Object.keys(w).sort()))
    expect(claves).toEqual(['log', 'orders', 'packing'])
  })
})

describe('isExecutionSuccess: el predicado unico de exito (R24)', () => {
  it("R24: acepta el literal 'ok'", () => {
    expect(isExecutionSuccess('ok')).toBe(true)
  })

  it("R24: acepta el objeto { kind: 'ok', finishedGoods: [] } de Terminar empaque", () => {
    expect(isExecutionSuccess({ kind: 'ok', finishedGoods: [] })).toBe(true)
  })

  it("R24: rechaza 'already_mine'", () => {
    expect(isExecutionSuccess('already_mine')).toBe(false)
  })

  it("R24: rechaza 'stale'", () => {
    expect(isExecutionSuccess('stale')).toBe(false)
  })

  it.each([
    'not_found',
    'not_cancellable',
    'insufficient_material',
    'recipe_without_lines',
    'taken',
    'not_packer',
    'OK',
    '',
  ])("R24: rechaza cualquier otro literal: '%s'", (literal) => {
    expect(isExecutionSuccess(literal)).toBe(false)
  })

  it("R24: rechaza un objeto cuyo `kind` no es 'ok'", () => {
    expect(isExecutionSuccess({ kind: 'not_found' })).toBe(false)
  })

  it('R24: estrecha el tipo y conserva `finishedGoods`', () => {
    const outcome = { kind: 'ok', finishedGoods: [] } as
      | { readonly kind: 'ok'; readonly finishedGoods: readonly string[] }
      | 'not_packer'
    if (isExecutionSuccess(outcome)) {
      expect(outcome.finishedGoods).toEqual([])
    } else {
      throw new Error('deberia ser exito')
    }
  })
})

describe('ExecutionAbortedError y NotCancellableError', () => {
  it('R24: ExecutionAbortedError es interna: extiende Error y no la familia del modulo', () => {
    const error = new ExecutionAbortedError('stale')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ExecutionAbortedError)
    expect(error).not.toBeInstanceOf(AsignacionesError)
    expect(error.outcome).toBe('stale')
    expect(error.name).toBe('ExecutionAbortedError')
  })

  it('R24: ExecutionAbortedError lleva el desenlace tal cual, tambien si es un objeto', () => {
    const outcome = { kind: 'not_found' }
    expect(new ExecutionAbortedError(outcome).outcome).toBe(outcome)
  })

  it("R24: NotCancellableError es de la familia del modulo con code 'not_cancellable'", () => {
    const error = new NotCancellableError()
    expect(error).toBeInstanceOf(AsignacionesError)
    expect(error.code).toBe('not_cancellable')
  })
})
