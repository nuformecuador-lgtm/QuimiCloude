// T7 — Autorizacion de los TRES casos de uso de escritura (QC-38 R2, R3).
//
// Las cuatro formas de actor no autorizado, para `createUnit`, `updateUnit` y `deleteUnit`:
// actor `null`/`undefined`, sin conjunto de permisos, con el conjunto VACIO, y con permisos
// que NO incluyen el codigo exacto -incluidos los dos casos que probarian una implicacion o
// una coincidencia parcial: `'unidades.'` y `'unidades.consultar'`-. Las cuatro rechazan con
// `UnauthorizedError` y CERO llamadas al puerto de escritura: los dobles REGISTRAN si fueron
// invocados, y cada caso afirma que no lo fueron.
//
// Tambien se prueba que el permiso se comprueba ANTES que zod (R3): con actor no autorizado Y
// entrada invalida, el error sigue siendo `UnauthorizedError`, nunca `ValidationError`.

import { describe, expect, it, vi } from 'vitest'

import { createCreateUnit } from '@/lib/modules/unidades/domain/create-unit'
import { createUpdateUnit } from '@/lib/modules/unidades/domain/update-unit'
import { createDeleteUnit } from '@/lib/modules/unidades/domain/delete-unit'
import { UnauthorizedError, UnidadesError } from '@/lib/modules/unidades/domain/errors'
import type { Actor } from '@/lib/modules/unidades/domain/actor'
import type { UnitWriteRepository } from '@/lib/modules/unidades/ports/unit-write-repository'

const ENTRADA_VALIDA = { name: 'Kilogramo' }
const ENTRADA_INVALIDA = { name: '' }

/** Doble del puerto de escritura cuyos cinco metodos FALLAN si se les llama -asi «no se
 *  tocó el puerto» se prueba de verdad, y no por ausencia de asercion. */
function repositoryThatMustNotBeCalled(): UnitWriteRepository {
  const explode = (metodo: string) =>
    vi.fn(async () => {
      throw new Error(`${metodo} no debia invocarse: el actor no tenia permiso`)
    })
  return {
    findOwnership: explode('findOwnership'),
    hasDerivedUnits: explode('hasDerivedUnits'),
    create: explode('create'),
    update: explode('update'),
    deleteById: explode('deleteById'),
  }
}

/** Las cuatro formas de actor NO autorizado (R3): ausente, sin conjunto, conjunto vacio, y
 *  conjunto sin el codigo exacto -con dos variantes que probarian normalizacion o
 *  implicacion entre permisos, y que por eso NO deben conceder nada-. */
const ACTORES_NO_AUTORIZADOS: ReadonlyArray<{
  readonly nombre: string
  readonly actor: Actor | null | undefined
}> = [
  { nombre: 'actor null', actor: null },
  { nombre: 'actor undefined', actor: undefined },
  {
    nombre: 'sin conjunto de permisos',
    actor: { id: 'u1', companyId: 'c1', permissions: undefined as unknown as string[] },
  },
  { nombre: 'conjunto vacio', actor: { id: 'u1', companyId: 'c1', permissions: [] } },
  {
    nombre: "conjunto con 'unidades.' -sin coincidencia parcial-",
    actor: { id: 'u1', companyId: 'c1', permissions: ['unidades.'] },
  },
  {
    nombre: "conjunto con 'unidades.consultar' -no implica 'unidades.modificar'-",
    actor: { id: 'u1', companyId: 'c1', permissions: ['unidades.consultar'] },
  },
]

describe('createUnit — autorizacion (R2, R3)', () => {
  it.each(ACTORES_NO_AUTORIZADOS)(
    'rechaza con UnauthorizedError y NO toca el puerto: $nombre',
    async ({ actor }) => {
      const units = repositoryThatMustNotBeCalled()
      const createUnit = createCreateUnit({ units })

      await expect(createUnit(ENTRADA_VALIDA, actor)).rejects.toBeInstanceOf(UnauthorizedError)
      expect(units.findOwnership).not.toHaveBeenCalled()
      expect(units.create).not.toHaveBeenCalled()
    },
  )

  it('el permiso se comprueba ANTES que zod: actor no autorizado + entrada invalida -> UnauthorizedError, no ValidationError', async () => {
    const units = repositoryThatMustNotBeCalled()
    const createUnit = createCreateUnit({ units })

    const error = await createUnit(ENTRADA_INVALIDA, null).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnauthorizedError)
    expect(error).toBeInstanceOf(UnidadesError)
    expect(units.create).not.toHaveBeenCalled()
  })
})

describe('updateUnit — autorizacion (R2, R3)', () => {
  it.each(ACTORES_NO_AUTORIZADOS)(
    'rechaza con UnauthorizedError y NO toca el puerto: $nombre',
    async ({ actor }) => {
      const units = repositoryThatMustNotBeCalled()
      const updateUnit = createUpdateUnit({ units })

      await expect(updateUnit('unit-1', ENTRADA_VALIDA, actor)).rejects.toBeInstanceOf(
        UnauthorizedError,
      )
      expect(units.findOwnership).not.toHaveBeenCalled()
      expect(units.update).not.toHaveBeenCalled()
    },
  )

  it('el permiso se comprueba ANTES que zod: actor no autorizado + entrada invalida -> UnauthorizedError, no ValidationError', async () => {
    const units = repositoryThatMustNotBeCalled()
    const updateUnit = createUpdateUnit({ units })

    const error = await updateUnit('unit-1', ENTRADA_INVALIDA, null).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnauthorizedError)
    expect(units.findOwnership).not.toHaveBeenCalled()
  })
})

describe('deleteUnit — autorizacion (R2, R3)', () => {
  it.each(ACTORES_NO_AUTORIZADOS)(
    'rechaza con UnauthorizedError y NO toca el puerto: $nombre',
    async ({ actor }) => {
      const units = repositoryThatMustNotBeCalled()
      const deleteUnit = createDeleteUnit({ units })

      await expect(deleteUnit('unit-1', actor)).rejects.toBeInstanceOf(UnauthorizedError)
      expect(units.findOwnership).not.toHaveBeenCalled()
      expect(units.deleteById).not.toHaveBeenCalled()
    },
  )
})
