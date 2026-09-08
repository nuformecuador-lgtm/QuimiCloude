// T6 — El puerto de escritura de unidades (QC-38, `design.md > 5`, R7 y R19).
//
// La invariante que importa aqui vive en la FIRMA, no en tiempo de ejecucion: `UnitWriteRow` no
// lleva `companyId`. Se demuestra en TIEMPO DE TIPOS con un `@ts-expect-error` sobre un objeto
// que lo incluya: si algun dia `companyId` entrara al tipo, el `@ts-expect-error` sobraria y
// `pnpm typecheck` se pondria rojo por una directiva sin efecto -eso es justo lo que se quiere
// que ocurra si la invariante se rompe-.

import { describe, expect, it } from 'vitest'

import type { UnitWriteRow } from '@/lib/modules/unidades/ports/unit-write-repository'

describe('UnitWriteRow — companyId no es asignable (R7, R19)', () => {
  it('un UnitWriteRow valido, sin companyId, compila', () => {
    const row: UnitWriteRow = {
      name: 'kilo',
      nameNormalized: 'kilo',
      symbol: null,
      baseUnitId: null,
      factor: null,
    }

    expect(row.name).toBe('kilo')
  })

  it('un objeto con companyId no es asignable a UnitWriteRow', () => {
    const row: UnitWriteRow = {
      name: 'kilo',
      nameNormalized: 'kilo',
      symbol: null,
      baseUnitId: null,
      factor: null,
      // @ts-expect-error UnitWriteRow no declara `companyId`: si este error dejara de
      // dispararse significaria que el tipo volvio a admitir la empresa, exactamente lo que
      // R7/R19 prohiben.
      companyId: 'empresa-1',
    }

    expect(row).toBeDefined()
  })
})
