// QC-54 T1 — `assertAdminRole` es la UNICA implementacion de la regla (R6, R7). Este archivo
// prueba dos cosas por separado: que la fabrica de error MANDA (R7) y que la comparacion falla
// cerrado con igualdad EXACTA (R8, R9).

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR, assertAdminRole } from '@/lib/modules/identity'

/** Clase de error propia del test: si `assertAdminRole` lanzara algo generico en vez de invocar
 *  `onDenied`, esto lo detecta -no basta con `toThrow()` a secas. */
class ErrorDePrueba extends Error {}

const onDenied = () => new ErrorDePrueba('denegado')

const RECHAZADOS: readonly (readonly [string, Parameters<typeof assertAdminRole>[0]])[] = [
  ['sin actor (null)', null],
  ['sin actor (undefined)', undefined],
  ['rol nulo', { roleName: null }],
  ['rol vacio', { roleName: '' }],
  ['rol Operador', { roleName: 'Operador' }],
  ['rol que CONTIENE el nombre bueno', { roleName: 'Administradores externos' }],
  ['rol en minuscula', { roleName: 'administrador' }],
]

describe('QC-54 — assertAdminRole (R6, R7, R8, R9)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: lanza EXACTAMENTE el error que devuelve onDenied`, () => {
      const fabrica = vi.fn(onDenied)

      expect(() => assertAdminRole(actor, fabrica)).toThrow(ErrorDePrueba)
      expect(fabrica).toHaveBeenCalledTimes(1)
    })
  }

  it('el rol Administrador exacto no lanza, y onDenied no se invoca', () => {
    const fabrica = vi.fn(onDenied)

    expect(() => assertAdminRole({ roleName: ROLE_ADMINISTRADOR }, fabrica)).not.toThrow()
    expect(fabrica).not.toHaveBeenCalled()
  })
})
