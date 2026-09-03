// T9 — `normalizeUnitName`: la unica definicion de «mismo nombre de unidad» (QC-32).
//
// La columna `units.name_normalized` no significa nada sin su algoritmo, y el indice unico
// `units_name_normalized_key` solo garantiza lo que esta funcion decida (`design.md > 3`,
// `> 2.1`). Por eso se importa por el CONTRATO del modulo (`@/lib/modules/unidades`) y no
// por la ruta profunda: si el barrel dejara de exportarla, este archivo no compilaria, que
// es exactamente la senal que R4 pide.
//
// Es una funcion pura: no hay base que anadir informacion, asi que R4 se cierra aqui
// (`design.md > 9`, fila «Unitario»). El caso de la IDEMPOTENCIA es el que hace segura la
// columna persistida: normalizar un nombre ya normalizado tiene que dar lo mismo, o
// reprocesar la columna la cambiaria y el indice unico dejaria de decir lo que dice.
//
// Cubre R4.

import { describe, expect, it } from 'vitest'

import { normalizeUnitName } from '@/lib/modules/unidades'

/** Los tres ejemplos que cita `design.md > 3`: la misma unidad escrita de tres formas. */
const MISMA_UNIDAD = ['Mililitro', 'mililitro', 'MILI-LITRO'] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre. */
const MUESTRA = [
  'Mililitro',
  'mililitro',
  'MILI-LITRO',
  'kilogramo',
  'Kilogramo',
  'litro',
  'unidad',
  'Metro cúbico',
  'ÁÉÍÓÚ',
  'ñandú',
  '  gramo  ',
  'metro   cuadrado',
  'onza (troy)',
  'L',
  'mL',
  '1/2 docena',
  '',
  '   ',
  '%%%',
] as const

describe('normalizeUnitName — forma canonica del nombre de una unidad', () => {
  it('quita los acentos: la misma palabra acentuada y sin acentuar da la misma clave', () => {
    // R4: «sin acentos». Es NFD + descarte de diacriticos, no una tabla de reemplazos.
    expect(normalizeUnitName('Metro cúbico')).toBe('metrocubico')
    expect(normalizeUnitName('cúbico')).toBe(normalizeUnitName('cubico'))
    expect(normalizeUnitName('ÁÉÍÓÚ')).toBe('aeiou')
    expect(normalizeUnitName('ñandú')).toBe('nandu')
  })

  it('no distingue mayusculas de minusculas', () => {
    // R4: «sin distinguir mayusculas de minusculas». Es lo que hace que «Kilogramo» y
    // «kilogramo» sean la MISMA unidad para el indice unico (R5).
    expect(normalizeUnitName('KILOGRAMO')).toBe('kilogramo')
    expect(normalizeUnitName('Kilogramo')).toBe(normalizeUnitName('kilogramo'))
    expect(normalizeUnitName('KiLoGrAmO')).toBe('kilogramo')
  })

  it('quita signos y espacios: Mililitro, mililitro y MILI-LITRO producen la misma clave', () => {
    // R4: «sin caracteres especiales», con los tres ejemplos literales de `design.md > 3`.
    const claves = MISMA_UNIDAD.map(normalizeUnitName)
    expect(new Set(claves).size, `tres formas de la misma unidad: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('mililitro')

    // Espacios interiores repetidos, parentesis y barras desaparecen igual.
    expect(normalizeUnitName('metro   cuadrado')).toBe('metrocuadrado')
    expect(normalizeUnitName('onza (troy)')).toBe('onzatroy')
    expect(normalizeUnitName('1/2 docena')).toBe('12docena')

    // Solo sobreviven letras ASCII y digitos, para cualquier entrada de la muestra.
    for (const nombre of MUESTRA) {
      expect(normalizeUnitName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('recorta los espacios de los extremos antes de comparar', () => {
    // R4: el `trim()` va primero. Sin el, «gramo» escrito con un espacio de mas seria otra
    // unidad y el catalogo admitiria dos gramos.
    expect(normalizeUnitName('  gramo  ')).toBe('gramo')
    expect(normalizeUnitName('\tlitro\n')).toBe('litro')
    expect(normalizeUnitName(' Kilogramo ')).toBe(normalizeUnitName('kilogramo'))
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // R4 en su borde, y es el comportamiento TAL COMO ES: `requirements.md > pregunta
    // abierta 5` lo deja anotado —dos unidades «en blanco» chocarian contra el indice unico
    // con un mensaje confuso—, pero NO se anade aqui ninguna regla de longitud minima: los
    // bordes de aplicacion son de QC-38. Este test fija el comportamiento actual para que
    // un cambio no pase inadvertido, no lo juzga.
    expect(normalizeUnitName('')).toBe('')
    expect(normalizeUnitName('   ')).toBe('')
    expect(normalizeUnitName('%%%')).toBe('')
    expect(normalizeUnitName('- / .')).toBe('')
  })

  it('unidades distintas siguen siendo claves distintas: litro no colisiona con mililitro', () => {
    // R4 no puede fundir dos unidades del conjunto arrancador (`design.md > 6.1`): si lo
    // hiciera, el seed crearia cuatro y no cinco, y R25 caeria.
    expect(normalizeUnitName('litro')).toBe('litro')
    expect(normalizeUnitName('mililitro')).toBe('mililitro')
    expect(normalizeUnitName('litro')).not.toBe(normalizeUnitName('mililitro'))

    // Y los cinco nombres arrancadores dan cinco claves distintas.
    const arrancadoras = ['kilogramo', 'gramo', 'litro', 'mililitro', 'unidad']
    expect(new Set(arrancadoras.map(normalizeUnitName)).size).toBe(5)
  })

  it('los simbolos L y mL tampoco se funden al normalizar, y no se normalizan en ninguna parte', () => {
    // `design.md > 6.1`: «la normalizacion ignora mayusculas, asi que `litro` y `mililitro`
    // son claves distintas y no chocan. Los simbolos no se normalizan ni se comparan (R7)».
    // Aqui se comprueba la mitad que es propiedad de esta funcion: aplicada a los dos
    // simbolos daria claves distintas —o sea que ni siquiera colisionarian si algun dia
    // alguien los normalizara—. Que el simbolo NO pasa por aqui al guardarse lo vigila
    // `seed-units.test.ts` (se persiste 'L' y 'mL', tal cual).
    expect(normalizeUnitName('L')).toBe('l')
    expect(normalizeUnitName('mL')).toBe('ml')
    expect(normalizeUnitName('L')).not.toBe(normalizeUnitName('mL'))
  })

  it('es idempotente: normalizar una clave ya normalizada devuelve la misma clave', () => {
    // La propiedad que hace SEGURA la columna persistida `name_normalized`: reprocesarla
    // —al resembrar, al migrar, al comparar— no puede cambiar su valor. Si f(f(x)) no fuera
    // f(x), el indice unico compararia claves de generaciones distintas.
    for (const nombre of MUESTRA) {
      const una = normalizeUnitName(nombre)
      expect(normalizeUnitName(una), `f(f(«${nombre}»)) deberia ser f(«${nombre}») = «${una}»`).toBe(
        una,
      )
      // Y una tercera pasada tampoco mueve nada.
      expect(normalizeUnitName(normalizeUnitName(una))).toBe(una)
    }
  })
})
