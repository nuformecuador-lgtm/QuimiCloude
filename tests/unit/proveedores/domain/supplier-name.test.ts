// T8 — `normalizeSupplierName`: la unica definicion de «mismo nombre de proveedor» (QC-42).
//
// La columna `suppliers.name_normalized` no significa nada sin su algoritmo, y el indice unico
// parcial `suppliers_name_unique` solo garantiza lo que esta funcion decida
// (`design.md > 3`). Por eso se importa por el CONTRATO del modulo
// (`@/lib/modules/proveedores`), no por la ruta profunda: si el barrel dejara de exportarla,
// este archivo no compilaria, que es exactamente la senal que R8 pide.
//
// Es una funcion pura: no hay base que anada informacion, asi que R8 se cierra aqui.
// El caso de la IDEMPOTENCIA es el que hace segura la columna persistida: normalizar un
// nombre ya normalizado tiene que dar lo mismo, o reprocesar la columna la cambiaria.
//
// Cubre R8.

import { describe, expect, it } from 'vitest'

import { normalizeSupplierName } from '@/lib/modules/proveedores'

/** Las tres formas que cita el docstring de `design.md > 3`: mismo proveedor, tres escrituras.
 *  OJO: son ENTRADAS, no la salida. La clave que producen las tres es
 *  `quimicosdelpacificosa`, porque el ultimo paso descarta todo lo que no sea [a-z0-9]. */
const MISMO_PROVEEDOR = [
  'Quimicos del Pacifico S.A.',
  'quimicos-del-pacifico sa',
  'QUIMICOS DEL PACIFICO S A',
] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre. */
const MUESTRA = [
  'Quimicos del Pacifico S.A.',
  'quimicos-del-pacifico sa',
  'QUIMICOS DEL PACIFICO S A',
  'Químicos',
  'Distribuidora Andina & Cía.',
  'Insumos  Industriales   (Quito)',
  '',
  '   ',
  '%%%',
  'ñandú',
  'Proveedor 1/2',
] as const

describe('normalizeSupplierName — forma canonica del nombre de un proveedor', () => {
  it('quita los acentos: Quimicos acentuado y sin acentuar dan la misma clave', () => {
    // R8: «sin acentos». La normalizacion es NFD + descarte de diacriticos, asi que no
    // depende de una tabla de reemplazos escrita a mano.
    expect(normalizeSupplierName('Químicos')).toBe('quimicos')
    expect(normalizeSupplierName('Químicos')).toBe(normalizeSupplierName('Quimicos'))
    expect(normalizeSupplierName('Distribuidora Andina & Cía.')).toBe('distribuidoraandinacia')
    expect(normalizeSupplierName('Solución')).toBe(normalizeSupplierName('SOLUCION'))
  })

  it('no distingue mayusculas de minusculas', () => {
    // R8: «sin distinguir mayusculas de minusculas».
    expect(normalizeSupplierName('QUIMICOS')).toBe('quimicos')
    expect(normalizeSupplierName('Quimicos')).toBe(normalizeSupplierName('quimicos'))
    expect(normalizeSupplierName('QuImIcOs')).toBe('quimicos')
  })

  it('quita signos y espacios: las tres formas de «Quimicos del Pacifico S.A.» dan una clave', () => {
    // R8: «sin caracteres especiales». Es el criterio que `design.md > 3` hereda literalmente
    // de QC-20 D12 y de QC-24.
    const claves = MISMO_PROVEEDOR.map(normalizeSupplierName)
    expect(new Set(claves).size, `tres formas del mismo proveedor: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('quimicosdelpacificosa')

    // Puntos, guiones, espacios repetidos y parentesis desaparecen igual.
    expect(normalizeSupplierName('Insumos  Industriales   (Quito)')).toBe(
      'insumosindustrialesquito',
    )
    expect(normalizeSupplierName('Proveedor 1/2')).toBe('proveedor12')
    // Solo sobreviven letras ASCII y digitos.
    for (const nombre of MUESTRA) {
      expect(normalizeSupplierName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // R8 en su borde. Se afirma en positivo porque tiene consecuencia real y anotada
    // (`design.md > 11`, pregunta 1): dos proveedores «sin nombre» chocarian contra el indice
    // unico. El largo minimo es validacion de aplicacion (QC-43), no de esta funcion.
    expect(normalizeSupplierName('')).toBe('')
    expect(normalizeSupplierName('   ')).toBe('')
    expect(normalizeSupplierName('%%%')).toBe('')
    expect(normalizeSupplierName('- / .')).toBe('')
  })

  it('es idempotente: normalizar una clave ya normalizada no la cambia', () => {
    // R8. Es la propiedad que hace segura la columna persistida: si reprocesar
    // `name_normalized` diera otro valor, una migracion de datos romperia la unicidad.
    for (const nombre of MUESTRA) {
      const unaVez = normalizeSupplierName(nombre)
      expect(normalizeSupplierName(unaVez), `f(f(«${nombre}»)) != f(«${nombre}»)`).toBe(unaVez)
    }
  })

  it('nombres distintos siguen dando claves distintas', () => {
    // R8 por el otro lado: una funcion que devolviera siempre '' pasaria todos los casos de
    // arriba. Este caso impide esa degeneracion.
    const distintos = ['Quimicos del Pacifico S.A.', 'Quimicos del Atlantico', 'Químicos', 'Andina']
    const claves = distintos.map(normalizeSupplierName)
    expect(new Set(claves).size).toBe(distintos.length)
    expect(claves).toEqual([
      'quimicosdelpacificosa',
      'quimicosdelatlantico',
      'quimicos',
      'andina',
    ])
  })
})
