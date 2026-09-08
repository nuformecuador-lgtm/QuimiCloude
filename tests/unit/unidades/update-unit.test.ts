// T7 — Caso de uso `updateUnit` (QC-38, `design.md > 6.2`).
//
// Cubre R15 (las tres formas de derivacion invalida: base que a su vez deriva,
// auto-referencia, «ya soy base de alguien»), R16 (base de otra empresa y base inexistente
// rechazan; base propia y de sistema aceptan), R17 (edicion sin simbolo lo borra; sin base ni
// factor deja la unidad base), R18 (la tabla de R8-R16 se ejecuta tambien contra `updateUnit`),
// R21 (unidad de sistema -> SystemUnitError, `update` no se llama), R22, R36.

import { describe, expect, it, vi } from 'vitest'

import { createUpdateUnit } from '@/lib/modules/unidades/domain/update-unit'
import {
  DuplicateNameError,
  DuplicateSymbolError,
  InvalidDerivationError,
  NotFoundError,
  SystemUnitError,
  ValidationError,
} from '@/lib/modules/unidades/domain/errors'
import type { Actor } from '@/lib/modules/unidades/domain/actor'
import type {
  UnitOwnership,
  UnitWriteRepository,
  WriteOutcome,
} from '@/lib/modules/unidades/ports/unit-write-repository'

const EMPRESA = 'company-1'
const ACTOR: Actor = { id: 'user-1', companyId: EMPRESA, permissions: ['unidades.modificar'] }

// UNIT_ID tiene forma de UUID a proposito: el test de auto-referencia (R15) lo usa tambien
// como `baseUnitId`, y ese campo lo valida `unitInputSchema` con `z.string().uuid()` -un id
// que no lo fuera nunca llegaria a la comprobacion de auto-referencia, se quedaria en
// ValidationError antes.
const UNIT_ID = '22222222-2222-4222-8222-222222222222'
const BASE_ID = '11111111-1111-4111-8111-111111111111'

/** Doble del puerto que REGISTRA cada llamada. `ownerships` responde `findOwnership` por id;
 *  un id ausente del mapa devuelve `null`. `hasDerived` fija la respuesta de
 *  `hasDerivedUnits` para CUALQUIER id (basta para estos tests, que solo consultan uno).
 *  `outcome` es lo que devuelve `update`. */
function repository(options?: {
  readonly ownerships?: Record<string, UnitOwnership | null>
  readonly hasDerived?: boolean
  readonly outcome?: WriteOutcome
}): UnitWriteRepository {
  const ownerships = options?.ownerships ?? {}
  const hasDerived = options?.hasDerived ?? false
  const outcome = options?.outcome ?? 'ok'
  return {
    findOwnership: vi.fn(async (id: string) => ownerships[id] ?? null),
    hasDerivedUnits: vi.fn(async () => hasDerived),
    create: vi.fn(async () => {
      throw new Error('create no debia invocarse desde updateUnit')
    }),
    update: vi.fn(async () => outcome),
    deleteById: vi.fn(async () => {
      throw new Error('deleteById no debia invocarse desde updateUnit')
    }),
  }
}

const UNIDAD_PROPIA: UnitOwnership = { id: UNIT_ID, companyId: EMPRESA, baseUnitId: null }

describe('updateUnit — pertenencia (R21, R22)', () => {
  it('R21: unidad de sistema -> SystemUnitError, y update NO se llama', async () => {
    const units = repository({
      ownerships: { [UNIT_ID]: { id: UNIT_ID, companyId: null, baseUnitId: null } },
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)).rejects.toBeInstanceOf(
      SystemUnitError,
    )
    expect(units.update).not.toHaveBeenCalled()
  })

  it('R22: unidad inexistente -> NotFoundError', async () => {
    const units = repository({ ownerships: {} })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(units.update).not.toHaveBeenCalled()
  })

  it('R22: unidad de otra empresa -> NotFoundError', async () => {
    const units = repository({
      ownerships: { [UNIT_ID]: { id: UNIT_ID, companyId: 'otra-empresa', baseUnitId: null } },
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    expect(units.update).not.toHaveBeenCalled()
  })
})

describe('updateUnit — reemplazo completo (R17)', () => {
  it('sin simbolo BORRA el simbolo (null)', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)

    expect(units.update).toHaveBeenCalledWith(UNIT_ID, expect.objectContaining({ symbol: null }))
  })

  it('sin base ni factor deja la unidad BASE', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)

    expect(units.update).toHaveBeenCalledWith(
      UNIT_ID,
      expect.objectContaining({ baseUnitId: null, factor: null }),
    )
  })
})

describe('updateUnit — equivalencia, las tres formas de R15', () => {
  it('la base declarada a su vez deriva de otra (mas de un nivel) -> InvalidDerivationError', async () => {
    const units = repository({
      ownerships: {
        [UNIT_ID]: UNIDAD_PROPIA,
        [BASE_ID]: { id: BASE_ID, companyId: EMPRESA, baseUnitId: 'otra-base' },
      },
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it('auto-referencia (baseUnitId === id) -> InvalidDerivationError', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: UNIT_ID, factor: '2' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it('«ya soy base de alguien» (hasDerivedUnits) -> InvalidDerivationError, sin consultar la base declarada', async () => {
    const units = repository({
      ownerships: { [UNIT_ID]: UNIDAD_PROPIA, [BASE_ID]: { id: BASE_ID, companyId: EMPRESA, baseUnitId: null } },
      hasDerived: true,
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.update).not.toHaveBeenCalled()
    // Solo se consulto la pertenencia de la unidad que se edita: la comprobacion de «ya soy
    // base de alguien» rechaza ANTES de mirar la base declarada.
    expect(units.findOwnership).toHaveBeenCalledTimes(1)
  })
})

describe('updateUnit — equivalencia, R16', () => {
  it('la base declarada pertenece a otra empresa -> InvalidDerivationError', async () => {
    const units = repository({
      ownerships: {
        [UNIT_ID]: UNIDAD_PROPIA,
        [BASE_ID]: { id: BASE_ID, companyId: 'otra-empresa', baseUnitId: null },
      },
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it('la base declarada no existe -> InvalidDerivationError', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it('acepta una base de la PROPIA empresa', async () => {
    const units = repository({
      ownerships: {
        [UNIT_ID]: UNIDAD_PROPIA,
        [BASE_ID]: { id: BASE_ID, companyId: EMPRESA, baseUnitId: null },
      },
    })
    const updateUnit = createUpdateUnit({ units })

    await updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR)

    expect(units.update).toHaveBeenCalledWith(
      UNIT_ID,
      expect.objectContaining({ baseUnitId: BASE_ID, factor: '2' }),
    )
  })

  it('acepta una base DE SISTEMA (companyId null)', async () => {
    const units = repository({
      ownerships: {
        [UNIT_ID]: UNIDAD_PROPIA,
        [BASE_ID]: { id: BASE_ID, companyId: null, baseUnitId: null },
      },
    })
    const updateUnit = createUpdateUnit({ units })

    await updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor: '2' }, ACTOR)

    expect(units.update).toHaveBeenCalledWith(
      UNIT_ID,
      expect.objectContaining({ baseUnitId: BASE_ID }),
    )
  })
})

describe('updateUnit — la tabla de R8-R14 tambien aplica a la edicion (R18)', () => {
  it.each(['', '   ', '---'])('rechaza el nombre %j', async (name) => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it('rechaza un nombre de 61 caracteres', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'a'.repeat(61) }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(units.update).not.toHaveBeenCalled()
  })

  it('rechaza un simbolo de 11 caracteres', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', symbol: 'a'.repeat(11) }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it.each(['', '   '])('R36: rechaza el simbolo %j', async (symbol) => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo', symbol }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(units.update).not.toHaveBeenCalled()
  })

  it('base sin factor -> ValidationError', async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.update).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', 'abc', '1.00001'])('rechaza el factor %j', async (factor) => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA } })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', baseUnitId: BASE_ID, factor }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.update).not.toHaveBeenCalled()
  })
})

describe('updateUnit — traduccion de resultados del puerto', () => {
  it("'not_found' -> NotFoundError", async () => {
    const units = repository({ ownerships: { [UNIT_ID]: UNIDAD_PROPIA }, outcome: 'not_found' })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it("'duplicate_name' -> DuplicateNameError", async () => {
    const units = repository({
      ownerships: { [UNIT_ID]: UNIDAD_PROPIA },
      outcome: 'duplicate_name',
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(updateUnit(UNIT_ID, { name: 'Kilo' }, ACTOR)).rejects.toBeInstanceOf(
      DuplicateNameError,
    )
  })

  it("'duplicate_symbol' -> DuplicateSymbolError", async () => {
    const units = repository({
      ownerships: { [UNIT_ID]: UNIDAD_PROPIA },
      outcome: 'duplicate_symbol',
    })
    const updateUnit = createUpdateUnit({ units })

    await expect(
      updateUnit(UNIT_ID, { name: 'Kilo', symbol: 'kg' }, ACTOR),
    ).rejects.toBeInstanceOf(DuplicateSymbolError)
  })
})
