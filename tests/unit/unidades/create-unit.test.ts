// T7 — Caso de uso `createUnit` (QC-38, `design.md > 6.1`).
//
// Cubre R6 (alta valida -> una fila y su id), R7 (la fila creada lleva `actor.companyId`; la
// entrada no puede imponer empresa), R8 (`''`, `'   '`, `'---'` -> ValidationError; `'  kilo
// '` se guarda como `'kilo'`), R9 (60 acepta / 61 rechaza), R10 (sin simbolo acepta; 10 acepta
// / 11 rechaza), R13 (base sin factor y factor sin base -> ValidationError; ninguno de los dos
// -> acepta), R14 (`0`, `-1`, `abc`, `1.00001` rechazan; `0.5` acepta y se guarda `'0.5'`),
// R28 (entrada con forma invalida -> ValidationError y el puerto no se llama), R36 (simbolo
// vacio o en blanco -> ValidationError), y la traduccion de `'duplicate_name'` /
// `'duplicate_symbol'`.

import { describe, expect, it, vi } from 'vitest'

import { createCreateUnit } from '@/lib/modules/unidades/domain/create-unit'
import {
  DuplicateNameError,
  DuplicateSymbolError,
  InvalidDerivationError,
  ValidationError,
} from '@/lib/modules/unidades/domain/errors'
import type { Actor } from '@/lib/modules/unidades/domain/actor'
import type {
  UnitOwnership,
  UnitWriteRepository,
} from '@/lib/modules/unidades/ports/unit-write-repository'

const EMPRESA = 'company-1'
const ACTOR: Actor = { id: 'user-1', companyId: EMPRESA, permissions: ['unidades.modificar'] }

/** Doble del puerto que REGISTRA cada llamada. `create` responde `outcome` (por defecto un id
 *  nuevo); `findOwnership` responde `parent` (para las pruebas de equivalencia). Los metodos
 *  que no se usan en este archivo (`update`, `deleteById`, `hasDerivedUnits`) fallan si se
 *  llaman: nada de este caso de uso deberia tocarlos. */
function repository(options?: {
  readonly outcome?: { id: string } | 'duplicate_name' | 'duplicate_symbol'
  readonly parent?: UnitOwnership | null
}): UnitWriteRepository {
  const outcome = options?.outcome ?? { id: 'unit-nuevo' }
  const parent = options?.parent ?? null
  return {
    findOwnership: vi.fn(async () => parent),
    hasDerivedUnits: vi.fn(async () => {
      throw new Error('hasDerivedUnits no debia invocarse desde createUnit')
    }),
    create: vi.fn(async () => outcome),
    update: vi.fn(async () => {
      throw new Error('update no debia invocarse desde createUnit')
    }),
    deleteById: vi.fn(async () => {
      throw new Error('deleteById no debia invocarse desde createUnit')
    }),
  }
}

describe('createUnit — alta (R6, R7, R28)', () => {
  it('R6: entrada valida crea una fila y devuelve su id', async () => {
    const units = repository({ outcome: { id: 'unit-123' } })
    const createUnit = createCreateUnit({ units })

    const result = await createUnit({ name: 'Kilogramo' }, ACTOR)

    expect(result).toEqual({ id: 'unit-123' })
    expect(units.create).toHaveBeenCalledTimes(1)
  })

  it('R7: la fila creada lleva actor.companyId, no la empresa de la entrada', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await createUnit({ name: 'Kilogramo', companyId: 'empresa-ajena' }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(
      EMPRESA,
      expect.objectContaining({ name: 'Kilogramo' }),
    )
  })

  it('R28: entrada con forma invalida -> ValidationError, y el puerto no se llama', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name: 123 }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    expect(units.create).not.toHaveBeenCalled()
  })
})

describe('createUnit — nombre (R8, R9)', () => {
  it.each(['', '   ', '---'])('rechaza el nombre %j', async (name) => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name }, ACTOR)).rejects.toBeInstanceOf(ValidationError)
    expect(units.create).not.toHaveBeenCalled()
  })

  it("recorta los espacios de los extremos: '  kilo  ' se guarda como 'kilo'", async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await createUnit({ name: '  kilo  ' }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(EMPRESA, expect.objectContaining({ name: 'kilo' }))
  })

  it('acepta un nombre de exactamente 60 caracteres', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })
    const nombre60 = 'a'.repeat(60)

    await createUnit({ name: nombre60 }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(EMPRESA, expect.objectContaining({ name: nombre60 }))
  })

  it('rechaza un nombre de 61 caracteres', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name: 'a'.repeat(61) }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(units.create).not.toHaveBeenCalled()
  })
})

describe('createUnit — simbolo (R10, R36)', () => {
  it('acepta una unidad sin simbolo', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await createUnit({ name: 'Kilogramo' }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(EMPRESA, expect.objectContaining({ symbol: null }))
  })

  it('acepta un simbolo de exactamente 10 caracteres', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })
    const simbolo10 = 'a'.repeat(10)

    await createUnit({ name: 'Kilogramo', symbol: simbolo10 }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(
      EMPRESA,
      expect.objectContaining({ symbol: simbolo10 }),
    )
  })

  it('rechaza un simbolo de 11 caracteres', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(
      createUnit({ name: 'Kilogramo', symbol: 'a'.repeat(11) }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.create).not.toHaveBeenCalled()
  })

  it.each(['', '   '])('R36: rechaza el simbolo %j, no lo guarda como ausente', async (symbol) => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name: 'Kilogramo', symbol }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(units.create).not.toHaveBeenCalled()
  })
})

describe('createUnit — equivalencia (R13, R14)', () => {
  it('R13: base declarada sin factor -> ValidationError', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(
      createUnit({ name: 'Libra', baseUnitId: '11111111-1111-4111-8111-111111111111' }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.create).not.toHaveBeenCalled()
  })

  it('R13: factor declarado sin base -> ValidationError', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name: 'Libra', factor: '0.5' }, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(units.create).not.toHaveBeenCalled()
  })

  it('R13: ni base ni factor -> acepta (unidad base)', async () => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await createUnit({ name: 'Libra' }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(
      EMPRESA,
      expect.objectContaining({ baseUnitId: null, factor: null }),
    )
  })

  it.each(['0', '0.0000', '-1', 'abc', '1.00001'])('R14: rechaza el factor %j', async (factor) => {
    const units = repository()
    const createUnit = createCreateUnit({ units })

    await expect(
      createUnit(
        { name: 'Libra', baseUnitId: '11111111-1111-4111-8111-111111111111', factor },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    expect(units.create).not.toHaveBeenCalled()
  })

  it('R14: acepta un factor menor que 1 (0.5), sin normalizarlo', async () => {
    const baseUnitId = '11111111-1111-4111-8111-111111111111'
    const units = repository({ parent: { id: baseUnitId, companyId: EMPRESA, baseUnitId: null } })
    const createUnit = createCreateUnit({ units })

    await createUnit({ name: 'Libra', baseUnitId, factor: '0.5' }, ACTOR)

    expect(units.create).toHaveBeenCalledWith(
      EMPRESA,
      expect.objectContaining({ baseUnitId, factor: '0.5' }),
    )
  })

  it('rechaza con InvalidDerivationError si la base declarada no existe', async () => {
    const baseUnitId = '11111111-1111-4111-8111-111111111111'
    const units = repository({ parent: null })
    const createUnit = createCreateUnit({ units })

    await expect(
      createUnit({ name: 'Libra', baseUnitId, factor: '0.5' }, ACTOR),
    ).rejects.toBeInstanceOf(InvalidDerivationError)
    expect(units.create).not.toHaveBeenCalled()
  })
})

describe('createUnit — traduccion de duplicados', () => {
  it("'duplicate_name' -> DuplicateNameError", async () => {
    const units = repository({ outcome: 'duplicate_name' })
    const createUnit = createCreateUnit({ units })

    await expect(createUnit({ name: 'Kilogramo' }, ACTOR)).rejects.toBeInstanceOf(
      DuplicateNameError,
    )
  })

  it("'duplicate_symbol' -> DuplicateSymbolError", async () => {
    const units = repository({ outcome: 'duplicate_symbol' })
    const createUnit = createCreateUnit({ units })

    await expect(
      createUnit({ name: 'Kilogramo', symbol: 'kg' }, ACTOR),
    ).rejects.toBeInstanceOf(DuplicateSymbolError)
  })
})
