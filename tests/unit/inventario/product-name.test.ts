// T5 — `normalizeProductName`: la unica definicion de «mismo nombre de producto» (QC-57).
//
// La columna `products.name_normalized` no significa nada sin su algoritmo, y la busqueda del
// listado de productos (R18, R19) solo encuentra lo que esta funcion decida. Se importa por el
// CONTRATO del modulo (`@/lib/modules/inventario`) y no por la ruta profunda: si el barrel
// dejara de exportarla, este archivo no compilaria, que es la senal que R19 pide.
//
// Misma bateria que `tests/unit/unidades/domain/unit-name.test.ts`, del que esta funcion es
// gemela literal, con dos diferencias de SIGNIFICADO que se prueban aqui y no alli:
//   1. esta columna NO respalda ninguna unicidad —el nombre de un producto NO es unico
//      (decision cerrada 6 de QC-14) y `products.name_normalized` no tiene indice unico—, asi
//      que dos productos homonimos dan la MISMA clave y eso es correcto, no un choque;
//   2. lo que si tiene que garantizar es que buscar y comparar no discrepen (decision cerrada
//      9 de QC-57): «solucion» encuentra «Solución Buffer pH 7».
//
// Cubre R18, R19.

import { describe, expect, it } from 'vitest'

import { normalizeProductName } from '@/lib/modules/inventario'

/** El mismo producto escrito de tres formas. */
const MISMO_PRODUCTO = ['Sosa caustica', 'sosa caustica', 'SOSA-CAUSTICA'] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre. */
const MUESTRA = [
  'Sosa caustica',
  'sosa caustica',
  'SOSA-CAUSTICA',
  'Solución Buffer pH 7',
  'Hipoclorito de sodio 5%',
  'Acido citrico monohidratado',
  'Ácido cítrico monohidratado',
  'ÁÉÍÓÚ',
  'ñandú',
  '  Cloro  ',
  'tensioactivo   anionico',
  'Peroxido (35%)',
  'NaOH',
  '1/2 tambor',
  '',
  '   ',
  '%%%',
] as const

describe('normalizeProductName — forma canonica del nombre de un producto', () => {
  it('quita los acentos: la misma palabra acentuada y sin acentuar da la misma clave', () => {
    // R18: la busqueda ignora acentos. Es NFD + descarte de diacriticos, no una tabla de
    // reemplazos. El ejemplo literal de la decision cerrada 9 esta en el ultimo caso.
    expect(normalizeProductName('Ácido cítrico')).toBe('acidocitrico')
    expect(normalizeProductName('cítrico')).toBe(normalizeProductName('citrico'))
    expect(normalizeProductName('ÁÉÍÓÚ')).toBe('aeiou')
    expect(normalizeProductName('ñandú')).toBe('nandu')
    expect(normalizeProductName('Solución Buffer pH 7')).toBe('solucionbufferph7')
  })

  it('no distingue mayusculas de minusculas', () => {
    expect(normalizeProductName('HIPOCLORITO')).toBe('hipoclorito')
    expect(normalizeProductName('Hipoclorito')).toBe(normalizeProductName('hipoclorito'))
    expect(normalizeProductName('HiPoClOrItO')).toBe('hipoclorito')
  })

  it('quita signos y espacios: tres formas del mismo producto producen la misma clave', () => {
    const claves = MISMO_PRODUCTO.map(normalizeProductName)
    expect(new Set(claves).size, `tres formas del mismo nombre: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('sosacaustica')

    expect(normalizeProductName('tensioactivo   anionico')).toBe('tensioactivoanionico')
    expect(normalizeProductName('Peroxido (35%)')).toBe('peroxido35')
    expect(normalizeProductName('1/2 tambor')).toBe('12tambor')

    // Solo sobreviven letras ASCII y digitos, para cualquier entrada de la muestra.
    for (const nombre of MUESTRA) {
      expect(normalizeProductName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('recorta los espacios de los extremos antes de comparar', () => {
    expect(normalizeProductName('  Cloro  ')).toBe('cloro')
    expect(normalizeProductName('\tSoda\n')).toBe('soda')
    expect(normalizeProductName(' Hipoclorito ')).toBe(normalizeProductName('hipoclorito'))
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // Se fija el comportamiento TAL COMO ES, no se juzga: los bordes de longitud minima del
    // nombre viven en `product-input.ts` (zod), no aqui.
    expect(normalizeProductName('')).toBe('')
    expect(normalizeProductName('   ')).toBe('')
    expect(normalizeProductName('%%%')).toBe('')
    expect(normalizeProductName('- / .')).toBe('')
  })

  it('productos distintos siguen siendo claves distintas', () => {
    expect(normalizeProductName('Hipoclorito de sodio 5%')).toBe('hipocloritodesodio5')
    expect(normalizeProductName('Hipoclorito de sodio 10%')).toBe('hipocloritodesodio10')
    expect(normalizeProductName('Hipoclorito de sodio 5%')).not.toBe(
      normalizeProductName('Hipoclorito de sodio 10%'),
    )
  })

  it('dos productos homonimos dan la MISMA clave, y eso no es un choque', () => {
    // La diferencia de significado con las otras cuatro `normalize*Name`: aqui la clave NO
    // identifica. `products.name_normalized` no tiene indice unico (decision cerrada 6 de
    // QC-14), asi que dos productos que se llaman igual conviven con la misma clave. Si
    // alguien anadiera ese indice unico, este caso se pondria rojo en la base, que es
    // exactamente la alarma que se quiere.
    expect(normalizeProductName('Sosa caustica')).toBe(normalizeProductName('SOSA CAUSTICA'))
  })

  it('encuentra por SUBCADENA: la clave de la busqueda esta contenida en la del nombre', () => {
    // R18 y la decision cerrada de `pg_trgm` (via A): buscar «solucion» tiene que encontrar
    // «Solución Buffer pH 7», y buscar «buffer» —una palabra del MEDIO— tambien. Es la
    // propiedad que la via B (prefijo) habria roto en silencio, y por eso se afirma aqui y no
    // solo en el adaptador.
    const clave = normalizeProductName('Solución Buffer pH 7')
    expect(clave.includes(normalizeProductName('solucion'))).toBe(true)
    expect(clave.includes(normalizeProductName('Buffer'))).toBe(true)
    expect(clave.includes(normalizeProductName('BUFFER PH'))).toBe(true)
    expect(clave.includes(normalizeProductName('cloro'))).toBe(false)
  })

  it('es idempotente: normalizar una clave ya normalizada devuelve la misma clave', () => {
    // La propiedad que hace SEGURA la columna persistida: reprocesarla —al resembrar, al
    // migrar, al hacer el backfill de la migracion— no puede cambiar su valor.
    for (const nombre of MUESTRA) {
      const una = normalizeProductName(nombre)
      expect(normalizeProductName(una), `f(f(«${nombre}»)) deberia ser «${una}»`).toBe(una)
      expect(normalizeProductName(normalizeProductName(una))).toBe(una)
    }
  })

  it('es la gemela literal de las otras cuatro: mismo cuerpo, mismo resultado', () => {
    // R19 en su lectura fuerte: «NO DEBE existir una segunda definicion de mismo nombre».
    // Dentro de `inventario` la comprobacion posible es contra `normalizePresentationName`,
    // que es del mismo modulo: si alguna de las dos se tocara sin la otra, esto se pone rojo.
    // Entre modulos la equivalencia no se afirma aqui (cada modulo tiene la suya, por la
    // regla de dependencias), pero el algoritmo es el mismo por decision explicita.
    for (const nombre of MUESTRA) {
      expect(normalizeProductName(nombre)).toBe(
        nombre
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/[^a-z0-9]/gu, ''),
      )
    }
  })
})
