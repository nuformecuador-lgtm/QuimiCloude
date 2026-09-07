// T1 — `normalizeCompanyName`: la unica definicion de «mismo nombre de empresa» (QC-47).
//
// La columna `companies.name_normalized` no significa nada sin su algoritmo, y el indice unico
// parcial `companies_name_unique` solo garantiza lo que esta funcion decida (`design.md > 3`,
// `> 4.1`). Por eso se importa por el CONTRATO del modulo (`@/lib/modules/identity`) y no por la
// ruta profunda: si el barrel dejara de exportarla, este archivo no compilaria, que es
// exactamente la senal que R3 pide («publicada por el contrato publico del modulo propietario»).
//
// Es una funcion pura: no hay base que anadir informacion, asi que la parte de R3 que habla de
// la normalizacion se cierra aqui. Que la COLUMNA use esta misma definicion lo vigila
// `schema/companies-migration.test.ts` (R20).
//
// Cubre R3.

import { describe, expect, it } from 'vitest'

import { INITIAL_COMPANY_NAME, normalizeCompanyName } from '@/lib/modules/identity'

/** La misma empresa escrita de tres formas: es lo que el indice unico tiene que fundir. El
 *  nombre sale de la constante, no de una copia del literal: `domain/companies.ts` es el unico
 *  .ts del repo que lo escribe (T2, R20). */
const MISMA_EMPRESA = [INITIAL_COMPANY_NAME, 'quimicloud', 'QUIMI-CLOUD'] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre. */
const MUESTRA = [
  INITIAL_COMPANY_NAME,
  'quimicloud',
  'QUIMI-CLOUD',
  'Quimicos del Norte',
  'Químicos del Norte',
  'ÁÉÍÓÚ',
  'ñandú',
  '  Acme  ',
  'Acme   S.A.',
  'Acme, S.A.S.',
  'Insumos & Cia.',
  '3M',
  '',
  '   ',
  '%%%',
] as const

describe('normalizeCompanyName — forma canonica del nombre de una empresa', () => {
  it('quita los acentos: la misma palabra acentuada y sin acentuar da la misma clave', () => {
    // R3: «sin acentos». Es NFD + descarte de diacriticos, no una tabla de reemplazos.
    expect(normalizeCompanyName('Químicos')).toBe('quimicos')
    expect(normalizeCompanyName('Químicos')).toBe(normalizeCompanyName('Quimicos'))
    expect(normalizeCompanyName('ÁÉÍÓÚ')).toBe('aeiou')
    expect(normalizeCompanyName('ñandú')).toBe('nandu')
  })

  it('no distingue mayusculas de minusculas', () => {
    // R3: «sin distinguir mayusculas de minusculas». Es lo que hace que «QuimiCloud» y
    // «quimicloud» sean la MISMA empresa para el indice unico parcial (R4).
    expect(normalizeCompanyName('QUIMICLOUD')).toBe('quimicloud')
    expect(normalizeCompanyName(INITIAL_COMPANY_NAME)).toBe(normalizeCompanyName('quimicloud'))
    expect(normalizeCompanyName('QuImIcLoUd')).toBe('quimicloud')
  })

  it('quita signos y espacios: QuimiCloud, quimicloud y QUIMI-CLOUD producen la misma clave', () => {
    // R3: «sin caracteres especiales».
    const claves = MISMA_EMPRESA.map(normalizeCompanyName)
    expect(new Set(claves).size, `tres formas de la misma empresa: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('quimicloud')

    // Espacios interiores repetidos, puntos, comas y ampersands desaparecen igual: las formas
    // societarias escritas de dos maneras no pueden crear dos empresas distintas.
    expect(normalizeCompanyName('Acme   S.A.')).toBe('acmesa')
    expect(normalizeCompanyName('Acme, S.A.S.')).toBe('acmesas')
    expect(normalizeCompanyName('Insumos & Cia.')).toBe('insumoscia')

    // Solo sobreviven letras ASCII y digitos, para cualquier entrada de la muestra.
    for (const nombre of MUESTRA) {
      expect(normalizeCompanyName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('recorta los espacios de los extremos antes de comparar', () => {
    // R3: el `trim()` va primero. Sin el, «Acme» escrito con un espacio de mas seria otra
    // empresa y el indice admitiria dos Acme.
    expect(normalizeCompanyName('  Acme  ')).toBe('acme')
    expect(normalizeCompanyName('\tAcme\n')).toBe('acme')
    expect(normalizeCompanyName(' QuimiCloud ')).toBe(normalizeCompanyName('quimicloud'))
  })

  it('conserva los digitos: dos empresas que solo se diferencian en un numero no se funden', () => {
    expect(normalizeCompanyName('3M')).toBe('3m')
    expect(normalizeCompanyName('Planta 1')).not.toBe(normalizeCompanyName('Planta 2'))
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // R3 en su borde, y es el comportamiento TAL COMO ES. Esta ficha no construye ningun alta
    // de empresa (R5, R28), asi que no hay borde de aplicacion donde poner una longitud minima:
    // este test fija el comportamiento actual para que un cambio no pase inadvertido, no lo
    // juzga.
    expect(normalizeCompanyName('')).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
    expect(normalizeCompanyName('%%%')).toBe('')
    expect(normalizeCompanyName('- / .')).toBe('')
  })

  it('es idempotente: normalizar una clave ya normalizada devuelve la misma clave', () => {
    // La propiedad que hace SEGURA la columna persistida `name_normalized`: reprocesarla
    // —al resembrar, al migrar, al comparar— no puede cambiar su valor. Si f(f(x)) no fuera
    // f(x), el indice unico compararia claves de generaciones distintas.
    for (const nombre of MUESTRA) {
      const una = normalizeCompanyName(nombre)
      expect(
        normalizeCompanyName(una),
        `f(f(«${nombre}»)) deberia ser f(«${nombre}») = «${una}»`,
      ).toBe(una)
      expect(normalizeCompanyName(normalizeCompanyName(una))).toBe(una)
    }
  })

  it('la empresa inicial normaliza a `quimicloud`, que es lo que persistira el backfill', () => {
    // `design.md > 6.1`: literal `QuimiCloud`, normalizado esperado `quimicloud`. Que el SQL de
    // la migracion escriba ESE valor lo comprueba `schema/companies-migration.test.ts` (R20);
    // aqui se fija el lado del dominio, que es de donde sale la verdad. El literal NO se
    // repite aqui: `domain/companies.ts` es el unico .ts del repo que lo escribe (T2).
    expect(normalizeCompanyName(INITIAL_COMPANY_NAME)).toBe('quimicloud')
  })
})
