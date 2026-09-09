// T1 — `normalizeWorkGroupName`: la unica definicion de «mismo nombre de grupo» (QC-83).
//
// La columna `work_groups.name_normalized` no significa nada sin su algoritmo, y el indice unico
// compuesto, funcional y parcial `work_groups_name_unique` solo garantiza lo que esta funcion
// decida (`design.md > 1.1`, `> 4`). Por eso se importa por el CONTRATO del modulo
// (`@/lib/modules/identity`) y no por la ruta profunda: si el barrel dejara de exportarla, este
// archivo no compilaria, que es exactamente la senal que R3 pide («publicada por el contrato
// publico del modulo `identity`»).
//
// Es una funcion pura: la parte de R3 que habla de la normalizacion se cierra aqui. Que la
// COLUMNA y el indice usen esta misma definicion es cosa de QC-84, que es quien escribe; esta
// ficha solo publica la definicion (R27).
//
// Cubre R3.

import { describe, expect, it } from 'vitest'

import * as identity from '@/lib/modules/identity'
import { normalizeWorkGroupName } from '@/lib/modules/identity'

/** El mismo grupo escrito de tres formas: es lo que el indice unico tiene que fundir dentro de
 *  una empresa. */
const MISMO_GRUPO = ['Turno Noche', 'turno noche', 'TURNO-NOCHE'] as const

/** Muestra variada para las propiedades que valen para CUALQUIER nombre de grupo. */
const MUESTRA = [
  'Turno Noche',
  'turno noche',
  'TURNO-NOCHE',
  'Planta 2',
  'Producción',
  'ÁÉÍÓÚ',
  'ñandú',
  '  Turno noche  ',
  'Turno   noche',
  'Turno, noche.',
  'Mezclas & Envasado',
  'Planta 2',
  '',
  '   ',
  '%%%',
] as const

describe('normalizeWorkGroupName — forma canonica del nombre de un grupo de trabajo', () => {
  it('quita los acentos: la misma palabra acentuada y sin acentuar da la misma clave', () => {
    // R3: «sin acentos». Es NFD + descarte de lo que no sea [a-z0-9], no una tabla de
    // reemplazos. Cae si se quita el `.normalize('NFD')`: «Producción» daria «produccin».
    expect(normalizeWorkGroupName('Producción')).toBe('produccion')
    expect(normalizeWorkGroupName('Producción')).toBe(normalizeWorkGroupName('Produccion'))
    expect(normalizeWorkGroupName('ÁÉÍÓÚ')).toBe('aeiou')
    expect(normalizeWorkGroupName('ñandú')).toBe('nandu')
  })

  it('no distingue mayusculas de minusculas', () => {
    // R3: «sin distinguir mayusculas de minusculas». Es lo que hace que «Turno Noche» y
    // «turno noche» sean el MISMO grupo para el indice unico parcial (R4). Cae si se quita el
    // `.toLowerCase()`: las mayusculas no son [a-z0-9] y desaparecerian del todo.
    expect(normalizeWorkGroupName('TURNONOCHE')).toBe('turnonoche')
    expect(normalizeWorkGroupName('TuRnO nOcHe')).toBe('turnonoche')
    expect(normalizeWorkGroupName('Planta 2')).toBe('planta2')
  })

  it('quita signos y espacios interiores: Turno Noche, turno noche y TURNO-NOCHE son el mismo grupo', () => {
    // R3: «sin signos». Cae si se quita el `.replace(/[^a-z0-9]/g, '')`.
    const claves = MISMO_GRUPO.map(normalizeWorkGroupName)
    expect(new Set(claves).size, `tres formas del mismo grupo: ${claves.join(' | ')}`).toBe(1)
    expect(claves[0]).toBe('turnonoche')

    // Espacios interiores repetidos, comas, puntos y ampersands desaparecen igual: escribir el
    // grupo con un espacio de mas no puede crear un segundo grupo en la misma empresa.
    expect(normalizeWorkGroupName('Turno   noche')).toBe('turnonoche')
    expect(normalizeWorkGroupName('Turno, noche.')).toBe('turnonoche')
    expect(normalizeWorkGroupName('Mezclas & Envasado')).toBe('mezclasenvasado')

    // Solo sobreviven letras ASCII y digitos, para cualquier entrada de la muestra.
    for (const nombre of MUESTRA) {
      expect(normalizeWorkGroupName(nombre), `clave de «${nombre}»`).toMatch(/^[a-z0-9]*$/)
    }
  })

  it('recorta los espacios de los extremos antes de comparar', () => {
    // R3: los espacios de sobra de los extremos no distinguen a dos grupos.
    expect(normalizeWorkGroupName('  Turno noche  ')).toBe('turnonoche')
    expect(normalizeWorkGroupName('\tTurno noche\n')).toBe('turnonoche')
    expect(normalizeWorkGroupName(' Turno Noche ')).toBe(normalizeWorkGroupName('turno noche'))
  })

  it('conserva los digitos: dos grupos que solo se diferencian en un numero no se funden', () => {
    // «Planta 1» y «Planta 2» son dos grupos distintos de la misma empresa, y el indice unico
    // tiene que dejar existir a los dos (R4 leido al derecho).
    expect(normalizeWorkGroupName('Planta 2')).toBe('planta2')
    expect(normalizeWorkGroupName('Planta 1')).not.toBe(normalizeWorkGroupName('Planta 2'))
  })

  it('la cadena vacia y la de solo signos producen la clave vacia', () => {
    // R3 en su borde, y es el comportamiento TAL COMO ES: `design.md > 4` lo declara conocido y
    // aceptado —un nombre de solo signos colisiona con cualquier otro igual dentro de su
    // empresa— y deja el rechazo previo al `zod` de QC-84. Este test fija el comportamiento
    // actual para que un cambio no pase inadvertido, no lo juzga.
    expect(normalizeWorkGroupName('')).toBe('')
    expect(normalizeWorkGroupName('   ')).toBe('')
    expect(normalizeWorkGroupName('%%%')).toBe('')
    expect(normalizeWorkGroupName('- / .')).toBe('')
  })

  it('es idempotente: normalizar una clave ya normalizada devuelve la misma clave', () => {
    // La propiedad que hace SEGURA la columna persistida `name_normalized`: reprocesarla
    // —al migrar, al comparar— no puede cambiar su valor. Si f(f(x)) no fuera f(x), el indice
    // unico compararia claves de generaciones distintas.
    for (const nombre of MUESTRA) {
      const una = normalizeWorkGroupName(nombre)
      expect(
        normalizeWorkGroupName(una),
        `f(f(«${nombre}»)) deberia ser f(«${nombre}») = «${una}»`,
      ).toBe(una)
      expect(normalizeWorkGroupName(normalizeWorkGroupName(una))).toBe(una)
    }
  })

  it('el contrato del modulo publica la funcion con nombre y NO el normalizador interno', () => {
    // R3 pide UNA definicion publicada por el contrato de `identity`. `normalizeKey` es el
    // cuerpo que hoy comparten empresa y grupo, y `design.md > 4` lo deja INTERNO a proposito:
    // fuera del modulo nadie normaliza «una clave», normaliza «un nombre de grupo». Si alguien
    // lo reexporta, un consumidor puede atarse a el y saltarse la funcion con nombre, que es
    // justo lo que el diseno queria evitar.
    expect(typeof identity.normalizeWorkGroupName).toBe('function')
    expect(Object.keys(identity)).not.toContain('normalizeKey')
  })

  // No hay ninguna asercion que exija `normalizeWorkGroupName(x) === normalizeCompanyName(x)`, y
  // es deliberado: hoy coinciden porque delegan en el mismo `normalizeKey`, pero `design.md > 4`
  // dice explicitamente que son DOS reglas y que una puede cambiar sin la otra. Un test que
  // congelase la igualdad convertiria esa libertad en un rojo, y volveria a atar los dos nombres
  // por la puerta de atras. Lo que si esta congelado es cada regla por separado, arriba.
})
