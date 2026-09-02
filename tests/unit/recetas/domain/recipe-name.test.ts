// T9 — `normalizeRecipeName`: la unica definicion de «mismo nombre de receta» (QC-24).
//
// La columna `recipes.name_normalized` no significa nada sin su algoritmo, y el indice unico
// parcial `recipes_name_unique` solo garantiza lo que esta funcion decida
// (`design.md` seccion 3). Por eso se importa por el CONTRATO del modulo
// (`@/lib/modules/recetas`), no por la ruta profunda: si el barrel dejara de exportarla, este
// archivo no compilaria, que es exactamente la senal que R8 pide.
//
// Es una funcion pura: no hay base que anadir informacion, asi que R8 se cierra aqui.
// El caso de la IDEMPOTENCIA es el que hace segura la columna persistida: normalizar un
// nombre ya normalizado tiene que dar lo mismo, o reprocesar la columna la cambiaria.
//
// Cubre R8.

import { describe, expect, it } from 'vitest'

import { normalizeRecipeName } from '@/lib/modules/recetas'

/** Los tres ejemplos de QC-20 D12 que cita `design.md` seccion 3: misma receta, tres formas. */
const MISMA_RECETA = ['Desengrasante 5 %', 'desengrasante-5%', 'DESENGRASANTE 5%'] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre. */
const MUESTRA = [
  'Desengrasante 5 %',
  'desengrasante-5%',
  'DESENGRASANTE 5%',
  'Bidón 20 L',
  'Ácido cítrico',
  'Limpiador  multiuso   (industrial)',
  '',
  '   ',
  '%%%',
  'ñandú',
  'Solución 1/2',
] as const

describe('normalizeRecipeName — forma canonica del nombre de una receta', () => {
  it('quita los acentos: Bidon acentuado y sin acentuar dan la misma clave', () => {
    // R8: «sin acentos». La normalizacion es NFD + descarte de diacriticos, asi que no
    // depende de una tabla de reemplazos escrita a mano.
    expect(normalizeRecipeName('Bidón')).toBe('bidon')
    expect(normalizeRecipeName('Bidón')).toBe(normalizeRecipeName('Bidon'))
    expect(normalizeRecipeName('Ácido cítrico')).toBe('acidocitrico')
    expect(normalizeRecipeName('Solución')).toBe(normalizeRecipeName('SOLUCION'))
  })

  it('no distingue mayusculas de minusculas', () => {
    // R8: «sin distinguir mayusculas de minusculas».
    expect(normalizeRecipeName('DESENGRASANTE')).toBe('desengrasante')
    expect(normalizeRecipeName('Desengrasante')).toBe(normalizeRecipeName('desengrasante'))
    expect(normalizeRecipeName('DeSeNgRaSaNtE')).toBe('desengrasante')
  })

  it('quita signos y espacios: los tres ejemplos de QC-20 D12 producen la misma clave', () => {
    // R8: «sin caracteres especiales». Es el criterio que QC-20 D12 fijo para las
    // presentaciones y que `design.md` seccion 3 hereda literalmente.
    const claves = MISMA_RECETA.map(normalizeRecipeName)
    expect(new Set(claves).size, `tres formas de la misma receta: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('desengrasante5')

    // Signos sueltos, espacios repetidos y parentesis desaparecen igual.
    expect(normalizeRecipeName('Limpiador  multiuso   (industrial)')).toBe(
      'limpiadormultiusoindustrial',
    )
    expect(normalizeRecipeName('Solución 1/2')).toBe('solucion12')
    // Solo sobreviven letras ASCII y digitos.
    for (const nombre of MUESTRA) {
      expect(normalizeRecipeName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // R8 en su borde. Se afirma en positivo porque tiene consecuencia real y anotada
    // (`design.md > 9`, pregunta 2): dos recetas «sin nombre» chocarian contra el indice
    // unico. El largo minimo es validacion de aplicacion (QC-25), no de esta funcion.
    expect(normalizeRecipeName('')).toBe('')
    expect(normalizeRecipeName('   ')).toBe('')
    expect(normalizeRecipeName('%%%')).toBe('')
    expect(normalizeRecipeName('- / .')).toBe('')
  })

  it('es idempotente: normalizar una clave ya normalizada no la cambia', () => {
    // R8. Es la propiedad que hace segura la columna persistida: si reprocesar
    // `name_normalized` diera otro valor, una migracion de datos romperia la unicidad.
    for (const nombre of MUESTRA) {
      const unaVez = normalizeRecipeName(nombre)
      expect(normalizeRecipeName(unaVez), `f(f(«${nombre}»)) != f(«${nombre}»)`).toBe(unaVez)
    }
  })

  it('nombres distintos siguen dando claves distintas', () => {
    // R8 por el otro lado: una funcion que devolviera siempre '' pasaria todos los casos de
    // arriba. Este caso impide esa degeneracion.
    const distintos = ['Desengrasante 5%', 'Desengrasante 10%', 'Bidón 20 L', 'Acido citrico']
    const claves = distintos.map(normalizeRecipeName)
    expect(new Set(claves).size).toBe(distintos.length)
    expect(claves).toEqual(['desengrasante5', 'desengrasante10', 'bidon20l', 'acidocitrico'])
  })
})
