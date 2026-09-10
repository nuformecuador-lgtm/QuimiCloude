// T4 — Errores nuevos del dominio `unidades` (QC-38, `design.md > 4`, R30).
//
// Lo que se vigila: los NUEVE codigos de error del modulo -las tres que ya existian mas las
// seis que trae esta ficha- son distintos entre si, y las seis nuevas son `instanceof
// UnidadesError` (mismo patron que `RecetasError`/`InventarioError`: el adaptador driving
// traduce por `instanceof UnidadesError` y por `code`, nunca por texto).

import { describe, expect, it } from 'vitest'

import {
  DuplicateSymbolError,
  IncompatibleUnitsError,
  InvalidDerivationError,
  SystemUnitError,
  UnauthorizedError,
  UnidadesError,
  UnitDuplicateNameError,
  UnitInUseError,
  UnitNotFoundError,
  ValidationError,
} from '@/lib/modules/unidades'

describe('lib/modules/unidades — errores de dominio', () => {
  it('las seis clases nuevas son instancias de UnidadesError, con su code estable', () => {
    const nuevas: readonly [string, UnidadesError][] = [
      ['unit_not_found', new UnitNotFoundError()],
      ['system_unit', new SystemUnitError()],
      ['unit_duplicate_name', new UnitDuplicateNameError()],
      ['duplicate_symbol', new DuplicateSymbolError()],
      ['invalid_derivation', new InvalidDerivationError()],
      ['unit_in_use', new UnitInUseError()],
    ]

    for (const [code, error] of nuevas) {
      expect(error).toBeInstanceOf(UnidadesError)
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe(code)
    }
  })

  it('los nueve codigos del modulo son distintos entre si', () => {
    const codigos = [
      new UnauthorizedError().code,
      new ValidationError().code,
      // IncompatibleUnitsError ya existia antes de esta ficha; se incluye para completar los
      // nueve codigos que hoy conviven en el modulo.
      new IncompatibleUnitsError().code,
      new UnitNotFoundError().code,
      new SystemUnitError().code,
      new UnitDuplicateNameError().code,
      new DuplicateSymbolError().code,
      new InvalidDerivationError().code,
      new UnitInUseError().code,
    ]

    expect(codigos).toHaveLength(9)
    expect(new Set(codigos).size).toBe(9)
  })
})
