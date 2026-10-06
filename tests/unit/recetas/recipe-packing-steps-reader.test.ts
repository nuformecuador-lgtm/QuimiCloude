// Lector de pasos de envasado del empaque, sin base: la funcion pura, la consulta que arma y que
// la lectura de ejecucion del operador no puede llevar pasos de envasado.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.fn()

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { recipe: { findFirst } } }))

const {
  findRecipeExecutionContentById,
  findRecipePackingStepsById,
  toRecipeExecutionContent,
  toRecipePackingSteps,
} = await import('@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma')

const EMPRESA = '00000000-0000-4000-8000-0000000000aa'

function paso(text: string) {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] }
}

const ENVASAR = paso('Envasar en garrafas de 5 L')
const ETIQUETAR = paso('Etiquetar con el lote')
const MEZCLAR = paso('Mezclar en frio')

beforeEach(() => {
  findFirst.mockReset()
})

describe('toRecipePackingSteps', () => {
  it('R11: una original devuelve sus propios pasos de envasado, en orden', () => {
    expect(toRecipePackingSteps({ packingSteps: [ENVASAR, ETIQUETAR], parent: null })).toEqual([ENVASAR, ETIQUETAR])
  })

  it('R11: una version devuelve los de su original aunque la fila traiga propios', () => {
    expect(
      toRecipePackingSteps({ packingSteps: [MEZCLAR], parent: { packingSteps: [ETIQUETAR, ENVASAR] } }),
    ).toEqual([ETIQUETAR, ENVASAR])
  })

  it('R11: descarta el elemento invalido conservando el orden de los demas', () => {
    expect(
      toRecipePackingSteps({ packingSteps: [ENVASAR, { id: 'invalido' }, 'Sellar', ETIQUETAR], parent: null }),
    ).toEqual([ENVASAR, ETIQUETAR])
    expect(toRecipePackingSteps({ packingSteps: { no: 'es lista' }, parent: null })).toEqual([])
  })
})

describe('findRecipePackingStepsById', () => {
  it('R11, R29, R30: filtra por empresa e id, sin deletedAt, y pide solo packingSteps propios y de la original', async () => {
    findFirst.mockResolvedValue({ packingSteps: [ENVASAR], parent: null })

    await expect(findRecipePackingStepsById('r-1', EMPRESA)).resolves.toEqual([ENVASAR])

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.where).toEqual({ AND: [{ companyId: EMPRESA }, { id: 'r-1' }] })
    expect(JSON.stringify(args.where)).not.toContain('deletedAt')
    expect(args.select).toEqual({ packingSteps: true, parent: { select: { packingSteps: true } } })
  })

  it('R29: devuelve null cuando la receta no existe o es de otra empresa', async () => {
    findFirst.mockResolvedValue(null)

    await expect(findRecipePackingStepsById('r-de-otra-empresa', EMPRESA)).resolves.toBeNull()
  })
})

describe('la ejecucion del operador no lleva pasos de envasado', () => {
  it('R26: el select de findExecutionContentById no pide packingSteps, ni propios ni de la original', async () => {
    findFirst.mockResolvedValue({ id: 'r-1', name: 'X', deletedAt: null, steps: [], parent: null, lines: [], tools: [] })

    await findRecipeExecutionContentById('r-1', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(JSON.stringify(args.select)).not.toContain('packingSteps')
    expect(JSON.stringify(args.select)).not.toContain('packing_steps')
  })

  it('R26: toRecipeExecutionContent no devuelve la clave packingSteps aunque la fila la traiga', () => {
    const fila = {
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: null,
      steps: [],
      packingSteps: [ENVASAR],
      parent: { name: 'Crema base', steps: [MEZCLAR], packingSteps: [ETIQUETAR] },
      lines: [],
      tools: [],
    }

    const contenido = toRecipeExecutionContent(fila)

    expect(Object.keys(contenido).sort()).toEqual(['id', 'isDeleted', 'lines', 'name', 'steps', 'tools'])
    expect(contenido.steps).toEqual([MEZCLAR])
    expect(JSON.stringify(contenido)).not.toContain('Envasar')
    expect(JSON.stringify(contenido)).not.toContain('Etiquetar')
  })
})
