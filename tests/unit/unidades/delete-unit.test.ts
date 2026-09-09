// T7 — Caso de uso `deleteUnit` (QC-38, `design.md > 6.3`).
//
// Cubre R24 ('in_use' -> UnitInUseError, y NINGUNA consulta de uso previa: se afirma que
// `hasDerivedUnits` no se llamo), R25 (unidad de sistema -> SystemUnitError sin llamar a
// `deleteById`), R26 (unidad inexistente o de otra empresa -> UnitNotFoundError).

import { describe, expect, it, vi } from 'vitest'

import { createDeleteUnit } from '@/lib/modules/unidades/domain/delete-unit'
import { SystemUnitError, UnitInUseError, UnitNotFoundError } from '@/lib/modules/unidades/domain/errors'
import type { Actor } from '@/lib/modules/unidades/domain/actor'
import type {
  UnitOwnership,
  UnitWriteRepository,
} from '@/lib/modules/unidades/ports/unit-write-repository'

const EMPRESA = 'company-1'
const ACTOR: Actor = { id: 'user-1', companyId: EMPRESA, permissions: ['unidades.modificar'] }
const UNIT_ID = 'unit-1'

function repository(options?: {
  readonly ownership?: UnitOwnership | null
  readonly deleteOutcome?: 'deleted' | 'not_found' | 'in_use'
}): UnitWriteRepository {
  const ownership = options?.ownership ?? null
  const deleteOutcome = options?.deleteOutcome ?? 'deleted'
  return {
    findOwnership: vi.fn(async () => ownership),
    // R24: ninguna consulta de uso previa. Si el caso de uso llegara a llamarla, el test que
    // afirma "no se llamo" lo detecta; este `vi.fn` no necesita explotar porque la asercion
    // sobre el propio mock ya prueba la ausencia de la llamada.
    hasDerivedUnits: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('create no debia invocarse desde deleteUnit')
    }),
    update: vi.fn(async () => {
      throw new Error('update no debia invocarse desde deleteUnit')
    }),
    deleteById: vi.fn(async () => deleteOutcome),
  }
}

describe('deleteUnit — pertenencia (R25, R26)', () => {
  it('R25: unidad de sistema -> SystemUnitError, sin llamar a deleteById', async () => {
    const units = repository({ ownership: { id: UNIT_ID, companyId: null, baseUnitId: null } })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).rejects.toBeInstanceOf(SystemUnitError)
    expect(units.deleteById).not.toHaveBeenCalled()
  })

  it('R26: unidad inexistente -> UnitNotFoundError', async () => {
    const units = repository({ ownership: null })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).rejects.toBeInstanceOf(UnitNotFoundError)
    expect(units.deleteById).not.toHaveBeenCalled()
  })

  it('R26: unidad de otra empresa -> UnitNotFoundError', async () => {
    const units = repository({
      ownership: { id: UNIT_ID, companyId: 'otra-empresa', baseUnitId: null },
    })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).rejects.toBeInstanceOf(UnitNotFoundError)
    expect(units.deleteById).not.toHaveBeenCalled()
  })
})

describe('deleteUnit — borrado (R24)', () => {
  const UNIDAD_PROPIA: UnitOwnership = { id: UNIT_ID, companyId: EMPRESA, baseUnitId: null }

  it("'in_use' -> UnitInUseError, y el caso de uso NO hizo ninguna consulta de uso previa", async () => {
    const units = repository({ ownership: UNIDAD_PROPIA, deleteOutcome: 'in_use' })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).rejects.toBeInstanceOf(UnitInUseError)
    expect(units.deleteById).toHaveBeenCalledTimes(1)
    // La garantia es la FK ON DELETE RESTRICT, no una comprobacion al vuelo: el caso de uso
    // nunca llama a hasDerivedUnits ni a ningun otro conteo de uso.
    expect(units.hasDerivedUnits).not.toHaveBeenCalled()
  })

  it("'not_found' -> UnitNotFoundError", async () => {
    const units = repository({ ownership: UNIDAD_PROPIA, deleteOutcome: 'not_found' })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).rejects.toBeInstanceOf(UnitNotFoundError)
  })

  it('borrado exitoso no lanza y llama a deleteById una vez', async () => {
    const units = repository({ ownership: UNIDAD_PROPIA, deleteOutcome: 'deleted' })
    const deleteUnit = createDeleteUnit({ units })

    await expect(deleteUnit(UNIT_ID, ACTOR)).resolves.toBeUndefined()
    expect(units.deleteById).toHaveBeenCalledWith(UNIT_ID)
    expect(units.hasDerivedUnits).not.toHaveBeenCalled()
  })
})
