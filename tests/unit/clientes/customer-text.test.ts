// T18 — `normalizeCustomerText`: la unica definicion de la forma normalizada de un cliente
// (R42). Misma forma que `normalizeSupplierName` (QC-42): se compara sobre la misma bateria
// para que las dos definiciones no diverjan en silencio (R41).
//
// Cubre R41.

import { describe, expect, it } from 'vitest'

import { normalizeCustomerText } from '@/lib/modules/clientes/domain/customer-text'
import { normalizeSupplierName } from '@/lib/modules/proveedores'

const MUESTRA = [
  'Maria Jose',
  'MARIA JOSE',
  'maria jose',
  'María',
  'Perez Gómez',
  'Ñandú',
  'Bogotá',
  'Distribuidora Andina & Cía.',
  'Insumos  Industriales   (Quito)',
  '',
  '   ',
  '%%%',
  'ñandú',
  'Cliente 1/2',
] as const

describe('normalizeCustomerText — forma canonica para buscar sin acentos', () => {
  it('quita los acentos: con tilde y sin tilde dan la misma clave', () => {
    expect(normalizeCustomerText('María')).toBe('maria')
    expect(normalizeCustomerText('María')).toBe(normalizeCustomerText('Maria'))
    expect(normalizeCustomerText('Bogotá')).toBe('bogota')
  })

  it('no distingue mayusculas de minusculas', () => {
    expect(normalizeCustomerText('MARIA')).toBe('maria')
    expect(normalizeCustomerText('Maria')).toBe(normalizeCustomerText('maria'))
    expect(normalizeCustomerText('MaRiA')).toBe('maria')
  })

  it('quita signos, espacios y la ñ se lee como parte del alfabeto normalizado', () => {
    expect(normalizeCustomerText('Insumos  Industriales   (Quito)')).toBe(
      'insumosindustrialesquito',
    )
    expect(normalizeCustomerText('Cliente 1/2')).toBe('cliente12')
    for (const valor of MUESTRA) {
      expect(normalizeCustomerText(valor), `clave de «${valor}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('la cadena vacia y la de solo signos producen la clave vacia (termino sin contenido)', () => {
    expect(normalizeCustomerText('')).toBe('')
    expect(normalizeCustomerText('   ')).toBe('')
    expect(normalizeCustomerText('%%%')).toBe('')
    expect(normalizeCustomerText('- / .')).toBe('')
  })

  it('es idempotente: normalizar una clave ya normalizada no la cambia', () => {
    for (const valor of MUESTRA) {
      const unaVez = normalizeCustomerText(valor)
      expect(normalizeCustomerText(unaVez), `f(f(«${valor}»)) != f(«${valor}»)`).toBe(unaVez)
    }
  })

  it('R41 — normaliza sin acentos, en minusculas y sin simbolos, igual que normalizeSupplierName', () => {
    // Las dos funciones tienen que dar el MISMO resultado sobre la misma bateria: si un dia
    // divergen, es una decision propia y este caso se pone rojo primero.
    for (const valor of MUESTRA) {
      expect(normalizeCustomerText(valor), `«${valor}»`).toBe(normalizeSupplierName(valor))
    }
  })
})
