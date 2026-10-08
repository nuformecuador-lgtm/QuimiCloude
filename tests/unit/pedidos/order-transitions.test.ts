// T4 — La tabla de transiciones de estado del pedido (QC-34 R22, R23, R24).
//
// La restriccion vive en la APLICACION y no en la base, y QC-33 R19 lo fijo asi
// explicitamente: la base sigue aceptando cualquier estado en lugar de cualquier otro. Este
// archivo es el test que R23 exige a cambio.
//
// Se cubre la matriz COMPLETA 10x10 -los 100 pares-, no solo los permitidos: un test que solo
// afirma lo que pasa deja pasar una tabla demasiado permisiva. La matriz esperada se escribe
// aqui a mano, EN OTRO FORMATO que el de `ALLOWED` (una lista de pares, no un mapa de listas),
// para que no sea la misma estructura copiada: si alguien edita `ALLOWED`, tiene que editar
// tambien esto y darse cuenta.

import { describe, expect, it } from 'vitest'

import { errorMessage } from '@/lib/modules/errores'
import { ORDER_STATUS_FLOW, ORDER_STATUS_VALUES, type OrderStatus } from '@/lib/modules/pedidos'
import { InvalidTransitionError } from '@/lib/modules/pedidos/domain/errors'
import {
  assertTransition,
  isAllowedTransition,
} from '@/lib/modules/pedidos/domain/order-transitions'

/** Los UNICOS pares permitidos: las transiciones hacia delante del flujo, el «quedarse igual» de
 *  los tres estados editables desde Pedidos y el vaiven `PENDIENTE <-> BLOQUEADO`. Nada mas.
 *
 *  `EN_EMPAQUE -> ENTREGADO` sigue en la tabla mientras Terminar el empaque escriba ENTREGADO;
 *  sale de aqui en el mismo cambio que mueve ese destino a POR_ACONDICIONAR. */
const PERMITIDOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ['PENDIENTE', 'PENDIENTE'],
  ['PENDIENTE', 'EN_CURSO'],
  ['PENDIENTE', 'BLOQUEADO'],
  ['EN_CURSO', 'EN_CURSO'],
  ['EN_CURSO', 'POR_EMPACAR'],
  ['POR_EMPACAR', 'EN_EMPAQUE'],
  ['EN_EMPAQUE', 'POR_ACONDICIONAR'],
  ['EN_EMPAQUE', 'ENTREGADO'],
  ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO'],
  ['EN_ACONDICIONAMIENTO', 'TERMINADO'],
  ['TERMINADO', 'ENTREGADO'],
  ['BLOQUEADO', 'BLOQUEADO'],
  ['BLOQUEADO', 'PENDIENTE'],
]

/** Los 100 pares de la matriz, en el orden de declaracion del conjunto cerrado. */
const TODOS: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = ORDER_STATUS_VALUES.flatMap(
  (from) => ORDER_STATUS_VALUES.map((to) => [from, to] as const),
)

function esperado(from: OrderStatus, to: OrderStatus): boolean {
  return PERMITIDOS.some(([f, t]) => f === from && t === to)
}

describe('pedidos — transiciones de estado', () => {
  it('R3: la matriz es de 10x10 y hay exactamente 13 pares permitidos', () => {
    // Si alguien anadiera un estado sin revisar esta tabla, el 100 dejaria de cuadrar.
    expect(ORDER_STATUS_VALUES).toHaveLength(10)
    expect(TODOS).toHaveLength(100)
    expect(TODOS.filter(([from, to]) => esperado(from, to))).toHaveLength(PERMITIDOS.length)
    expect(PERMITIDOS).toHaveLength(13)
  })

  it('R1: los tres estados nuevos van detras de los siete de antes, que conservan su orden', () => {
    expect(ORDER_STATUS_VALUES).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'ENTREGADO',
      'CANCELADO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'BLOQUEADO',
      'POR_ACONDICIONAR',
      'EN_ACONDICIONAMIENTO',
      'TERMINADO',
    ])
  })

  it('R2: el orden del flujo pone el acondicionamiento y TERMINADO entre el empaque y la entrega', () => {
    expect(ORDER_STATUS_FLOW).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'POR_ACONDICIONAR',
      'EN_ACONDICIONAMIENTO',
      'TERMINADO',
      'ENTREGADO',
      'CANCELADO',
      'BLOQUEADO',
    ])
    expect([...ORDER_STATUS_FLOW].sort()).toEqual([...ORDER_STATUS_VALUES].sort())
  })

  it('R3: el acondicionamiento avanza un paso cada vez y desemboca en TERMINADO y despues en ENTREGADO', () => {
    expect(isAllowedTransition('EN_EMPAQUE', 'POR_ACONDICIONAR')).toBe(true)
    expect(isAllowedTransition('POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO')).toBe(true)
    expect(isAllowedTransition('EN_ACONDICIONAMIENTO', 'TERMINADO')).toBe(true)
    expect(isAllowedTransition('TERMINADO', 'ENTREGADO')).toBe(true)

    const prohibidos: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
      ['EN_EMPAQUE', 'TERMINADO'],
      ['EN_EMPAQUE', 'EN_ACONDICIONAMIENTO'],
      ['POR_ACONDICIONAR', 'ENTREGADO'],
      ['POR_ACONDICIONAR', 'TERMINADO'],
      ['EN_ACONDICIONAMIENTO', 'ENTREGADO'],
      ['EN_ACONDICIONAMIENTO', 'POR_ACONDICIONAR'],
      ['TERMINADO', 'EN_ACONDICIONAMIENTO'],
      ['POR_ACONDICIONAR', 'CANCELADO'],
      ['EN_ACONDICIONAMIENTO', 'CANCELADO'],
      ['TERMINADO', 'CANCELADO'],
    ]
    for (const [origen, destino] of prohibidos) {
      expect(isAllowedTransition(origen, destino), `${origen} -> ${destino}`).toBe(false)
      expect(() => assertTransition(origen, destino)).toThrow(InvalidTransitionError)
    }
  })

  it('R3, R19, R30: POR_ACONDICIONAR, EN_ACONDICIONAMIENTO y TERMINADO no admiten «quedarse igual»', () => {
    for (const estado of ['POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO', 'TERMINADO'] as const) {
      expect(isAllowedTransition(estado, estado), `${estado} -> ${estado}`).toBe(false)
      expect(() => assertTransition(estado, estado)).toThrow(InvalidTransitionError)
    }
  })

  it('R3: cada estado del acondicionamiento solo se alcanza desde el anterior', () => {
    const unicoOrigen: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
      ['POR_ACONDICIONAR', 'EN_EMPAQUE'],
      ['EN_ACONDICIONAMIENTO', 'POR_ACONDICIONAR'],
      ['TERMINADO', 'EN_ACONDICIONAMIENTO'],
    ]
    for (const [destino, origen] of unicoOrigen) {
      for (const from of ORDER_STATUS_VALUES) {
        expect(isAllowedTransition(from, destino), `${from} -> ${destino}`).toBe(from === origen)
      }
    }
  })

  it.each(TODOS)('%s -> %s se decide como manda la matriz de design.md > 4 y > 10', (from, to) => {
    // R1, R2, R28: las cuatro permitidas, el «quedarse igual» de PENDIENTE, EN_CURSO y
    // BLOQUEADO, el vaiven con BLOQUEADO, y TODO lo demas rechazado -incluido cualquier
    // retroceso y cualquier salto hacia los estados de empaque-.
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

  it('R28: BLOQUEADO no conecta con EN_CURSO, ENTREGADO ni los estados de empaque, por ninguna via', () => {
    // Un pedido sin material no se arranca ni se entrega, y un `EN_CURSO` no puede quedarse sin
    // material: arrancar implicaba que habia con que producirlo. Un bloqueado tampoco puede
    // empacar -no aparta nada- ni puede alcanzarse desde uno que ya empezo. Los pares van
    // escritos uno a uno y no como un producto cartesiano: entre `EN_CURSO`, `POR_EMPACAR` y
    // `EN_EMPAQUE` SI hay transiciones legales, y un `for` las declararia prohibidas.
    const prohibidos: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
      ['BLOQUEADO', 'EN_CURSO'],
      ['BLOQUEADO', 'ENTREGADO'],
      ['BLOQUEADO', 'POR_EMPACAR'],
      ['BLOQUEADO', 'EN_EMPAQUE'],
      ['EN_CURSO', 'BLOQUEADO'],
      ['POR_EMPACAR', 'BLOQUEADO'],
      ['EN_EMPAQUE', 'BLOQUEADO'],
    ]

    for (const [origen, destino] of prohibidos) {
      expect(esperado(origen, destino), `la tabla de arriba declara ${origen} -> ${destino}`).toBe(
        false,
      )
      expect(isAllowedTransition(origen, destino), `${origen} -> ${destino}`).toBe(false)
      expect(() => assertTransition(origen, destino)).toThrow(InvalidTransitionError)
    }
  })

  it('R28: de un pedido en empaque no se vuelve a BLOQUEADO, ni aunque baje el inventario', () => {
    for (const estado of ['POR_EMPACAR', 'EN_EMPAQUE'] as const) {
      expect(isAllowedTransition(estado, 'BLOQUEADO'), `${estado} -> BLOQUEADO`).toBe(false)
    }
    for (const final of ['ENTREGADO', 'CANCELADO'] as const) {
      expect(isAllowedTransition(final, 'BLOQUEADO'), `${final} -> BLOQUEADO`).toBe(false)
    }
  })

  it('R10: BLOQUEADO vuelve a PENDIENTE y se queda bloqueado si sigue sin alcanzar', () => {
    // El ciclo es de ida y vuelta y por eso admite «quedarse igual»: se bloquea al crearlo o al
    // editarlo, y se desbloquea al editarlo con material o al entrar lotes, sin que eso sea un
    // paso del flujo de trabajo.
    expect(isAllowedTransition('BLOQUEADO', 'PENDIENTE')).toBe(true)
    expect(isAllowedTransition('BLOQUEADO', 'BLOQUEADO')).toBe(true)
    expect(isAllowedTransition('PENDIENTE', 'BLOQUEADO')).toBe(true)
    for (const par of [
      ['BLOQUEADO', 'PENDIENTE'],
      ['BLOQUEADO', 'BLOQUEADO'],
      ['PENDIENTE', 'BLOQUEADO'],
    ] as const) {
      expect(() => assertTransition(par[0], par[1])).not.toThrow()
    }
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

  it('EN_EMPAQUE solo se alcanza desde POR_EMPACAR, y ENTREGADO solo desde EN_EMPAQUE o TERMINADO (R1, R3)', () => {
    // Son acciones propias, no la edicion normal.
    for (const from of ORDER_STATUS_VALUES) {
      if (from !== 'POR_EMPACAR') {
        expect(isAllowedTransition(from, 'EN_EMPAQUE'), `${from} -> EN_EMPAQUE`).toBe(false)
      }
      if (from !== 'EN_EMPAQUE' && from !== 'TERMINADO') {
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
