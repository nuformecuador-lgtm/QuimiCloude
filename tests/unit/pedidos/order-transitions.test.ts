// T4 — La tabla de transiciones de estado del pedido (QC-34 R22, R23, R24).
//
// La restriccion vive en la APLICACION y no en la base, y QC-33 R19 lo fijo asi
// explicitamente: la base sigue aceptando cualquier estado en lugar de cualquier otro. Este
// archivo es el test que R23 exige a cambio.
//
// Se cubre la matriz COMPLETA 4x4 -los 16 pares-, no solo los permitidos: un test que solo
// afirma lo que pasa deja pasar una tabla demasiado permisiva. La matriz esperada se escribe
// aqui a mano, EN OTRO FORMATO que el de `ALLOWED` (una lista de pares, no un mapa de listas),
// para que no sea la misma estructura copiada: si alguien edita `ALLOWED`, tiene que editar
// tambien esto y darse cuenta.

import { describe, expect, it } from 'vitest'

import { ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos'
import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors'
import {
  assertTransition,
  isAllowedTransition,
} from '@/lib/modules/pedidos/domain/order-transitions'

/** Los UNICOS pares permitidos (decision cerrada 5): las tres transiciones hacia delante y el
 *  «quedarse igual» de los dos estados NO finales. Nada mas. */
const PERMITIDOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ['PENDIENTE', 'PENDIENTE'],
  ['PENDIENTE', 'EN_CURSO'],
  ['PENDIENTE', 'ENTREGADO'],
  ['EN_CURSO', 'EN_CURSO'],
  ['EN_CURSO', 'ENTREGADO'],
]

/** Los 16 pares de la matriz, en el orden de declaracion del conjunto cerrado. */
const TODOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = ORDER_STATUS_VALUES.flatMap(
  (from) => ORDER_STATUS_VALUES.map((to) => [from, to] as const),
)

function esperado(from: OrderStatus, to: OrderStatus): boolean {
  return PERMITIDOS.some(([f, t]) => f === from && t === to)
}

describe('pedidos — transiciones de estado en la edicion', () => {
  it('la matriz es de 4x4 y hay exactamente 5 pares permitidos', () => {
    // Si alguien anadiera un quinto estado sin revisar esta tabla, el 16 dejaria de cuadrar.
    expect(ORDER_STATUS_VALUES).toHaveLength(4)
    expect(TODOS).toHaveLength(16)
    expect(TODOS.filter(([from, to]) => esperado(from, to))).toHaveLength(PERMITIDOS.length)
    expect(PERMITIDOS).toHaveLength(5)
  })

  it.each(TODOS)('%s -> %s se decide como manda la decision cerrada 5', (from, to) => {
    // R22: las tres permitidas, el «quedarse igual» de los no finales, y TODO lo demas
    // rechazado -incluido cualquier retroceso-.
    expect(isAllowedTransition(from, to)).toBe(esperado(from, to))

    if (esperado(from, to)) {
      expect(() => assertTransition(from, to)).not.toThrow()
      return
    }
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError)
  })

  it('las tres transiciones hacia delante de la decision 5 estan permitidas, y ningun retroceso', () => {
    // Escrito aparte del `each` para que el mensaje diga cual falta si alguien vacia la tabla.
    expect(isAllowedTransition('PENDIENTE', 'EN_CURSO')).toBe(true)
    expect(isAllowedTransition('EN_CURSO', 'ENTREGADO')).toBe(true)
    expect(isAllowedTransition('PENDIENTE', 'ENTREGADO')).toBe(true)

    expect(isAllowedTransition('EN_CURSO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('ENTREGADO', 'EN_CURSO')).toBe(false)
    expect(isAllowedTransition('ENTREGADO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'EN_CURSO')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'ENTREGADO')).toBe(false)
  })

  it('ENTREGADO y CANCELADO son finales: no admiten ni «quedarse igual»', () => {
    // R21: un pedido final no admite NINGUNA edicion, ni siquiera la que solo cambia la
    // prioridad. Por eso su lista esta vacia y no lleva su propio estado.
    for (const final of ['ENTREGADO', 'CANCELADO'] as const) {
      for (const destino of ORDER_STATUS_VALUES) {
        expect(isAllowedTransition(final, destino), `${final} -> ${destino}`).toBe(false)
      }
      expect(() => assertTransition(final, final)).toThrow(InvalidTransitionError)
    }
  })

  it('CANCELADO no es destino de ningun par: solo lo escribe cancelOrder', () => {
    // R24 y decision cerrada 7: la edicion no puede cancelar. Aqui se afirma sobre la tabla
    // entera, no sobre un caso: ningun origen -ni siquiera CANCELADO- llega a CANCELADO.
    for (const from of ORDER_STATUS_VALUES) {
      expect(isAllowedTransition(from, 'CANCELADO'), `${from} -> CANCELADO`).toBe(false)
    }
  })

  it('el error lleva el code estable invalid_transition y nombra los dos estados', () => {
    // R56: quien traduce el error decide por el `code`, nunca por el texto. Se comprueba que
    // el `code` es el de `design.md > 7.5` y que el mensaje da contexto -no que se lea-.
    let capturado: unknown
    try {
      assertTransition('ENTREGADO', 'PENDIENTE')
    } catch (error) {
      capturado = error
    }
    expect(capturado).toBeInstanceOf(InvalidTransitionError)
    expect((capturado as InvalidTransitionError).code).toBe('invalid_transition')
    expect((capturado as InvalidTransitionError).message).toContain('ENTREGADO')
    expect((capturado as InvalidTransitionError).message).toContain('PENDIENTE')
  })
})
