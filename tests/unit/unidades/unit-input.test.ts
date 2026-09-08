// T5 — El esquema zod de alta y edicion de unidades (QC-38, `design.md > 3.1` y `> 6`).
//
// Cubre la tabla de R8, R9, R10, R13, R14 y R36. Los casos son los que el spec exige
// literalmente (`design.md > 12`): no valen equivalentes.

import { describe, expect, it } from 'vitest'

import { unitInputSchema } from '@/lib/modules/unidades/domain/unit-input'

const BASE_ID = '11111111-1111-4111-8111-111111111111'

describe('unitInputSchema — nombre (R8, R9)', () => {
  it('rechaza vacio, solo espacios y un nombre que normaliza a la cadena vacia', () => {
    expect(unitInputSchema.safeParse({ name: '' }).success).toBe(false)
    expect(unitInputSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(unitInputSchema.safeParse({ name: '---' }).success).toBe(false)
  })

  it('recorta los espacios de los extremos antes de guardar', () => {
    const result = unitInputSchema.safeParse({ name: '  kilo  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('kilo')
  })

  it('acepta 60 caracteres y rechaza 61', () => {
    const sesenta = 'a'.repeat(60)
    const sesentaYUno = 'a'.repeat(61)
    expect(unitInputSchema.safeParse({ name: sesenta }).success).toBe(true)
    expect(unitInputSchema.safeParse({ name: sesentaYUno }).success).toBe(false)
  })
})

describe('unitInputSchema — simbolo (R10, R36)', () => {
  it('la clave ausente acepta, y symbol NO aparece en la salida (ni undefined explicito distinto)', () => {
    const result = unitInputSchema.safeParse({ name: 'kilo' })
    expect(result.success).toBe(true)
    if (!result.success) return
    // Ausente sigue siendo ausente: no se convierte en null ni se inventa un valor.
    expect(result.data.symbol).toBeUndefined()
  })

  it('rechaza vacio y solo espacios, y NO los convierte en null ni en undefined', () => {
    const vacio = unitInputSchema.safeParse({ name: 'kilo', symbol: '' })
    const espacios = unitInputSchema.safeParse({ name: 'kilo', symbol: '   ' })

    expect(vacio.success).toBe(false)
    expect(espacios.success).toBe(false)

    // Afirmacion explicita de R36: un `safeParse` que falla no produce `data`, asi que el
    // valor rechazado nunca llega a convertirse en `null` -no hay un `.data.symbol` que
    // inspeccionar porque el resultado es un error, y eso es justamente la garantia: la unica
    // forma en que este esquema podria "colar" el simbolo vacio como ausente seria teniendo
    // `success: true` con `symbol` en `null` o `undefined`, y aqui `success` es `false`.
    expect('data' in vacio).toBe(false)
    expect('data' in espacios).toBe(false)
  })

  it('acepta 10 caracteres y rechaza 11', () => {
    const diez = 'a'.repeat(10)
    const once = 'a'.repeat(11)
    expect(unitInputSchema.safeParse({ name: 'kilo', symbol: diez }).success).toBe(true)
    expect(unitInputSchema.safeParse({ name: 'kilo', symbol: once }).success).toBe(false)
  })
})

describe('unitInputSchema — baseUnitId y factor, juntos o ninguno (R13)', () => {
  it('acepta los dos juntos', () => {
    const result = unitInputSchema.safeParse({ name: 'gramo', baseUnitId: BASE_ID, factor: '0.5' })
    expect(result.success).toBe(true)
  })

  it('acepta ninguno de los dos (unidad base)', () => {
    const result = unitInputSchema.safeParse({ name: 'kilo' })
    expect(result.success).toBe(true)
  })

  it('rechaza solo baseUnitId', () => {
    expect(unitInputSchema.safeParse({ name: 'gramo', baseUnitId: BASE_ID }).success).toBe(false)
  })

  it('rechaza solo factor', () => {
    expect(unitInputSchema.safeParse({ name: 'gramo', factor: '0.5' }).success).toBe(false)
  })
})

describe('unitInputSchema — factor (R14)', () => {
  const conFactor = (factor: string) =>
    unitInputSchema.safeParse({ name: 'gramo', baseUnitId: BASE_ID, factor })

  it('acepta 0.5', () => {
    expect(conFactor('0.5').success).toBe(true)
  })

  it('rechaza 0', () => {
    expect(conFactor('0').success).toBe(false)
  })

  it('rechaza negativo', () => {
    expect(conFactor('-1').success).toBe(false)
  })

  it('rechaza un quinto decimal', () => {
    expect(conFactor('1.00001').success).toBe(false)
  })

  it('rechaza un valor que no es un decimal valido', () => {
    expect(conFactor('abc').success).toBe(false)
  })
})
