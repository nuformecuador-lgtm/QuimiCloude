// QC-74 T2 — `assertPermission` es la UNICA implementacion de la regla (R12, R13, R14). Este test
// prueba tres cosas por separado: que falla cerrado, que la pertenencia es EXACTA -sin prefijos y
// sin jerarquia entre modificar y consultar- y que la fabrica de error MANDA (R15).

import { describe, expect, it, vi } from 'vitest'

import { assertPermission, type PermissionBearer } from '@/lib/modules/identity'

/** Clase de error propia del test: si `assertPermission` lanzara algo generico en vez de invocar
 *  `onDenied`, esto lo detecta -no basta con `toThrow()` a secas. */
class ErrorDePrueba extends Error {}

const onDenied = () => new ErrorDePrueba('denegado')

type Actor = Parameters<typeof assertPermission>[0]

/** Actores que NO deben pasar el corte de `'inventario.consultar'`. */
const RECHAZADOS: readonly (readonly [string, Actor])[] = [
  ['sin actor (null)', null],
  ['sin actor (undefined)', undefined],
  ['sin conjunto de permisos', {} as unknown as PermissionBearer],
  ['permisos nulos', { permissions: null } as unknown as PermissionBearer],
  ['permisos que no son un array', { permissions: 'inventario.consultar' } as unknown as PermissionBearer],
  ['conjunto vacio', { permissions: [] }],
  ['otro permiso cualquiera', { permissions: ['pedidos.consultar'] }],
  ['un prefijo del codigo', { permissions: ['inventario.'] }],
  ['solo el modulo', { permissions: ['inventario'] }],
  ['el codigo con otra caja', { permissions: ['Inventario.Consultar'] }],
  ['el codigo con espacios alrededor', { permissions: [' inventario.consultar '] }],
  ['un codigo que lo CONTIENE', { permissions: ['super.inventario.consultar.todo'] }],
  ['R13: modificar NO concede consultar', { permissions: ['inventario.modificar'] }],
]

describe('QC-74 — assertPermission falla cerrado (R12, R14, R15)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: lanza EXACTAMENTE el error que devuelve onDenied`, () => {
      const esperado = new ErrorDePrueba('denegado')
      const fabrica = vi.fn(() => esperado)

      expect(() => assertPermission(actor, 'inventario.consultar', fabrica)).toThrow(esperado)
      expect(fabrica).toHaveBeenCalledTimes(1)
    })
  }

  it('R13: consultar NO concede modificar (el sentido inverso)', () => {
    const fabrica = vi.fn(onDenied)

    expect(() =>
      assertPermission({ permissions: ['inventario.consultar'] }, 'inventario.modificar', fabrica),
    ).toThrow(ErrorDePrueba)
    expect(fabrica).toHaveBeenCalledTimes(1)
  })

  it('R13: el permiso de otro modulo con la misma accion no concede', () => {
    const fabrica = vi.fn(onDenied)

    expect(() =>
      assertPermission({ permissions: ['recetas.consultar'] }, 'inventario.consultar', fabrica),
    ).toThrow(ErrorDePrueba)
    expect(fabrica).toHaveBeenCalledTimes(1)
  })
})

describe('QC-74 — assertPermission concede por pertenencia exacta (R13, R17)', () => {
  it('el codigo exacto en el conjunto no lanza, y onDenied no se invoca', () => {
    const fabrica = vi.fn(onDenied)

    expect(() =>
      assertPermission({ permissions: ['inventario.consultar'] }, 'inventario.consultar', fabrica),
    ).not.toThrow()
    expect(fabrica).not.toHaveBeenCalled()
  })

  it('concede tambien cuando el codigo viene acompañado de otros permisos', () => {
    const fabrica = vi.fn(onDenied)
    const actor = { permissions: ['pedidos.modificar', 'inventario.consultar', 'recetas.consultar'] }

    expect(() => assertPermission(actor, 'inventario.consultar', fabrica)).not.toThrow()
    expect(fabrica).not.toHaveBeenCalled()
  })
})
