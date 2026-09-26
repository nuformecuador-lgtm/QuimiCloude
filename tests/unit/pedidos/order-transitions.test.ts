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

import { errorMessage } from '@/lib/modules/errores'
import { ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos'
import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors'
import {
  assertTransition,
  isAllowedTransition,
} from '@/lib/modules/pedidos/domain/order-transitions'

/** Los UNICOS pares permitidos (`design.md > 2`): las cuatro transiciones hacia delante y el
 *  «quedarse igual» de los dos estados editables desde Pedidos. Nada mas. */
const PERMITIDOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ['PENDIENTE', 'PENDIENTE'],
  ['PENDIENTE', 'EN_CURSO'],
  ['EN_CURSO', 'EN_CURSO'],
  ['EN_CURSO', 'POR_EMPACAR'],
  ['POR_EMPACAR', 'EN_EMPAQUE'],
  ['EN_EMPAQUE', 'ENTREGADO'],
]

/** Los 36 pares de la matriz, en el orden de declaracion del conjunto cerrado. */
const TODOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = ORDER_STATUS_VALUES.flatMap(
  (from) => ORDER_STATUS_VALUES.map((to) => [from, to] as const),
)

function esperado(from: OrderStatus, to: OrderStatus): boolean {
  return PERMITIDOS.some(([f, t]) => f === from && t === to)
}

describe('pedidos — transiciones de estado', () => {
  it('la matriz es de 6x6 y hay exactamente 6 pares permitidos', () => {
    // Si alguien anadiera un septimo estado sin revisar esta tabla, el 36 dejaria de cuadrar.
    expect(ORDER_STATUS_VALUES).toHaveLength(6)
    expect(TODOS).toHaveLength(36)
    expect(TODOS.filter(([from, to]) => esperado(from, to))).toHaveLength(PERMITIDOS.length)
    expect(PERMITIDOS).toHaveLength(6)
  })

  it.each(TODOS)('%s -> %s se decide como manda la matriz de design.md > 2', (from, to) => {
    // R1, R2: las cuatro permitidas, el «quedarse igual» de PENDIENTE y EN_CURSO, y TODO lo
    // demas rechazado -incluido cualquier retroceso-.
    expect(isAllowedTransition(from, to)).toBe(esperado(from, to))

    if (esperado(from, to)) {
      expect(() => assertTransition(from, to)).not.toThrow()
      return
    }
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError)
  })

  it('las cuatro transiciones hacia delante estan permitidas, y ningun retroceso (R1, R2)', () => {
    // Escrito aparte del `each` para que el mensaje diga cual falta si alguien vacia la tabla.
    expect(isAllowedTransition('PENDIENTE', 'EN_CURSO')).toBe(true)
    expect(isAllowedTransition('EN_CURSO', 'POR_EMPACAR')).toBe(true)
    expect(isAllowedTransition('POR_EMPACAR', 'EN_EMPAQUE')).toBe(true)
    expect(isAllowedTransition('EN_EMPAQUE', 'ENTREGADO')).toBe(true)

    expect(isAllowedTransition('PENDIENTE', 'ENTREGADO')).toBe(false)
    expect(isAllowedTransition('EN_CURSO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('ENTREGADO', 'EN_CURSO')).toBe(false)
    expect(isAllowedTransition('ENTREGADO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'PENDIENTE')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'EN_CURSO')).toBe(false)
    expect(isAllowedTransition('CANCELADO', 'ENTREGADO')).toBe(false)
  })

  it('POR_EMPACAR y EN_EMPAQUE no admiten «quedarse igual»: no son editables desde Pedidos (R32)', () => {
    for (const estado of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      expect(isAllowedTransition(estado, estado), `${estado} -> ${estado}`).toBe(false)
      expect(() => assertTransition(estado, estado)).toThrow(InvalidTransitionError)
    }
  })

  it('ENTREGADO y CANCELADO son finales: no admiten ni «quedarse igual»', () => {
    // Un pedido final no admite NINGUNA edicion, ni siquiera la que solo cambia la prioridad.
    // Por eso su lista esta vacia y no lleva su propio estado.
    for (const final of ['ENTREGADO', 'CANCELADO'] as const) {
      for (const destino of ORDER_STATUS_VALUES) {
        expect(isAllowedTransition(final, destino), `${final} -> ${destino}`).toBe(false)
      }
      expect(() => assertTransition(final, final)).toThrow(InvalidTransitionError)
    }
  })

  it('CANCELADO no es destino de ningun par: solo lo escribe cancelOrder', () => {
    // La edicion no puede cancelar. Aqui se afirma sobre la tabla entera, no sobre un caso:
    // ningun origen -ni siquiera CANCELADO- llega a CANCELADO.
    for (const from of ORDER_STATUS_VALUES) {
      expect(isAllowedTransition(from, 'CANCELADO'), `${from} -> CANCELADO`).toBe(false)
    }
  })

  it('EN_EMPAQUE y ENTREGADO solo se alcanzan desde POR_EMPACAR y EN_EMPAQUE respectivamente (R1)', () => {
    // Nadie mas que POR_EMPACAR llega a EN_EMPAQUE, y nadie mas que EN_EMPAQUE llega a
    // ENTREGADO: son las dos acciones de empaque, no la edicion normal.
    for (const from of ORDER_STATUS_VALUES) {
      if (from !== 'POR_EMPACAR') {
        expect(isAllowedTransition(from, 'EN_EMPAQUE'), `${from} -> EN_EMPAQUE`).toBe(false)
      }
      if (from !== 'EN_EMPAQUE') {
        expect(isAllowedTransition(from, 'ENTREGADO'), `${from} -> ENTREGADO`).toBe(false)
      }
    }
  })

  it('el error lleva el code estable invalid_transition, el mensaje del catalogo, y los dos estados SOLO en el diagnostico', () => {
    // R56: quien traduce el error decide por el `code`, nunca por el texto.
    //
    // QC-70 (R7, R28) cambia DONDE viven los dos estados. Antes se incrustaban en el mensaje
    // -«Un pedido en estado ENTREGADO no puede pasar a PENDIENTE.»-, y eso obligaba a que la
    // frase viviera en este archivo de dominio en vez de en el catalogo. Ahora el mensaje es
    // el del catalogo, siempre el mismo, y `from`/`to` viajan en el DIAGNOSTICO, que va al
    // registro del servidor y nunca al navegador (R29). Lo que se afirma aqui es justamente
    // ese reparto: en el mensaje NO estan, en el diagnostico SI.
    let capturado: unknown
    try {
      assertTransition('ENTREGADO', 'PENDIENTE')
    } catch (error) {
      capturado = error
    }
    expect(capturado).toBeInstanceOf(InvalidTransitionError)
    const error = capturado as InvalidTransitionError

    expect(error.code).toBe('invalid_transition')
    expect(error.message).toBe(errorMessage('invalid_transition'))
    expect(error.message, 'el estado de origen se cuela en el mensaje').not.toContain('ENTREGADO')
    expect(error.message, 'el estado de destino se cuela en el mensaje').not.toContain('PENDIENTE')

    expect(error.diagnostic).toContain('ENTREGADO')
    expect(error.diagnostic).toContain('PENDIENTE')
  })
})
