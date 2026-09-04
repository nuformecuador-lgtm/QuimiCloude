// T7 — `formatOrderNumber`: la UNICA definicion del numero visible del pedido (QC-33).
//
// El correlativo vive en la base como DOS enteros (`order_year`, `order_sequence`) y el texto
// `2026-0000001` NO se persiste (`design.md > 5.4`, R24): es una funcion pura de esos dos
// enteros. Por eso este archivo no necesita base y por eso R24 se cierra aqui.
//
// Se importa por el CONTRATO del modulo (`@/lib/modules/pedidos`), no por la ruta profunda: si
// el barrel dejara de exportarla, este archivo no compilaria, que es exactamente la senal que
// pide R24 —«publicada por el contrato del modulo»—.
//
// SIETE digitos, no cuatro (decision cerrada 29 del 2026-09-03): el techo es 9.999.999 pedidos
// al ano. El caso que muerde es el ultimo: pasado ese techo el numero CRECE en vez de
// truncarse, porque `padStart` solo rellena, nunca recorta. Sin ese caso, un `slice(-7)` mal
// puesto pasaria este test y perderia un digito el dia que mas dana.
//
// Cubre R24.

import { describe, expect, it } from 'vitest'

import { formatOrderNumber } from '@/lib/modules/pedidos'

describe('formatOrderNumber — el numero visible del pedido (R24)', () => {
  it('formatOrderNumber compone 2026-0000001 con siete digitos y crece en vez de truncar', () => {
    // Los cuatro casos de `design.md > 9`, fila «Unitario», tal cual.
    expect(formatOrderNumber({ year: 2026, sequence: 1 })).toBe('2026-0000001')
    expect(formatOrderNumber({ year: 2026, sequence: 42 })).toBe('2026-0000042')

    // El ultimo numero que cabe en el ancho fijado.
    expect(formatOrderNumber({ year: 2026, sequence: 9999999 })).toBe('2026-9999999')

    // Y el primero que NO cabe: crece a ocho digitos, no se trunca a los siete de la derecha
    // (que darian '2026-0000000') ni a los de la izquierda ('2026-1000000'). Es la propiedad
    // que la decision cerrada 29 asume a conciencia.
    const desbordado = formatOrderNumber({ year: 2026, sequence: 10000000 })
    expect(desbordado).toBe('2026-10000000')
    expect(desbordado.split('-')[1]).toHaveLength(8)
  })

  it('rellena a siete digitos en todo el rango, y solo rellena: nunca recorta', () => {
    // La propiedad completa, escrita como propiedad y no como tres ejemplos: para cualquier
    // posicion, la parte derecha es la posicion en decimal, rellenada a la IZQUIERDA con ceros
    // hasta siete caracteres. `toString()` de un entero es la referencia, asi que este caso no
    // reimplementa `padStart`: lo compara contra el numero sin adornar.
    const posiciones = [1, 9, 10, 99, 100, 999, 1000, 42, 123456, 999999, 1000000, 9999999, 10000000]
    for (const sequence of posiciones) {
      const texto = formatOrderNumber({ year: 2026, sequence })
      const derecha = texto.slice('2026-'.length)
      expect(derecha.length, `posicion ${sequence}`).toBeGreaterThanOrEqual(7)
      expect(Number(derecha), `posicion ${sequence}`).toBe(sequence)
      expect(derecha.replace(/^0+/, ''), `posicion ${sequence}`).toBe(String(sequence))
    }
  })

  it('el ano va tal cual, con un solo guion de separacion y sin relleno', () => {
    // El ano NO se rellena ni se abrevia: es el valor de `orders.order_year`, un entero. Y el
    // separador es un unico guion, que es lo que hace descomponible el numero el dia que QC-34
    // busque por el (`design.md > 8.2`).
    expect(formatOrderNumber({ year: 2027, sequence: 1 })).toBe('2027-0000001')
    expect(formatOrderNumber({ year: 999, sequence: 1 })).toBe('999-0000001')
    for (const year of [2026, 2027, 999, 10000]) {
      const texto = formatOrderNumber({ year, sequence: 7 })
      expect(texto.split('-')).toHaveLength(2)
      expect(texto.split('-')[0]).toBe(String(year))
    }
  })

  it('es una funcion pura: mismo par, mismo texto, y no toca lo que recibe', () => {
    // R24 pide UNA definicion del formato para que cualquier consumidor lo componga igual. Que
    // sea pura es lo que hace segura esa promesa: no depende del reloj, ni de la zona horaria,
    // ni del orden de las llamadas.
    const numero = { year: 2026, sequence: 42 }
    const antes = JSON.stringify(numero)
    expect(formatOrderNumber(numero)).toBe(formatOrderNumber(numero))
    expect(formatOrderNumber(numero)).toBe('2026-0000042')
    expect(JSON.stringify(numero)).toBe(antes)
  })
})
