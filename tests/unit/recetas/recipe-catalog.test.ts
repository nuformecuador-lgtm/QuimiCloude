// QC-34 T10 (R43, R44, R53) — `RecipeCatalog`: la consulta por ids que `recetas` publica
// para que `pedidos` sepa el NOMBRE de la receta de un pedido sin tocar `prisma.recipe`.
//
// HONESTIDAD: este archivo NO toca Postgres. El cliente Prisma esta sustituido por un
// DOBLE que cuenta invocaciones y devuelve filas fijas; lo que se prueba es el CONTRATO
// (que exista `findRefsIncludingDeleted`, que `RecipeRef` lleve `isDeleted`), el MAPEO
// (`deletedAt !== null` -> `isDeleted`) y la FORMA de la consulta (una sola llamada para N
// ids, `where` sin filtro de `deletedAt`). Que esa consulta devuelva de verdad la receta
// dada de baja contra Postgres es de los tests de integracion de `pedidos`.
//
// Es un cambio ADITIVO en un modulo ajeno (`recetas`, QC-25, ya `done`): el ultimo caso
// afirma que ninguna firma anterior cambio.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Doble del cliente Prisma. Cuenta invocaciones: es lo unico que hace testeable «una sola
 *  consulta para N ids» —comprobar solo el resultado pasaria verde con un bucle de N—. */
const findMany = vi.fn()
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { recipe: { findMany } } }))

const {
  findRecipeRefsIncludingDeleted,
  toRecipeRef,
} = await import('@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma')

/** Sube desde este archivo hasta la raiz del repo (la carpeta con `package.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    } catch {
      const parent = dirname(dir)
      if (parent === dir) throw new Error(`no se encontro package.json subiendo desde ${startDir}`)
      dir = parent
    }
  }
}

/**
 * Fuente SIN comentarios: lo que se vigila es el codigo, no la prosa (mismo helper y misma
 * razon que `tests/unit/recetas/module-contract.test.ts`). El propio contrato explica en su
 * comentario que `ProductCatalog.findRefs` devuelve solo lo vivo y que Prisma va en el
 * adaptador; un barrido sobre el texto crudo leeria la advertencia como la infraccion.
 */
function read(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const recetasDir = join(repoRoot, 'lib', 'modules', 'recetas')
const contratoFuente = read(join(recetasDir, 'index.ts'))
const catalogoFuente = read(join(recetasDir, 'domain', 'recipe-catalog.ts'))
const adaptadorFuente = read(
  join(recetasDir, 'adapters', 'driven', 'persistence', 'recipe-catalog-prisma.ts'),
)

beforeEach(() => {
  findMany.mockReset()
})

describe('contrato RecipeCatalog', () => {
  it('el dominio declara findRefsIncludingDeleted y un RecipeRef con isDeleted', () => {
    // (a) Se afirma sobre el TEXTO y no en ejecucion a proposito: `RecipeCatalog` y
    // `RecipeRef` son SOLO TIPOS y desaparecen al compilar, asi que en tiempo de ejecucion
    // no hay nada que mirar (mismo criterio que `module-contract.test.ts` con
    // `ProductCatalog`).
    expect(catalogoFuente).toMatch(/export interface RecipeCatalog \{/)
    expect(catalogoFuente).toMatch(
      /findRefsIncludingDeleted\(ids: readonly RecipeId\[\]\): Promise<readonly RecipeRef\[\]>/,
    )
    expect(catalogoFuente).toMatch(/export type RecipeRef = \{/)
    expect(catalogoFuente).toMatch(/readonly isDeleted: boolean/)
    // El nombre largo es deliberado (`design.md > 11.3`): `recetas` NO publica un `findRefs`
    // a secas que se pudiera confundir con los de `inventario`/`unidades`, que devuelven
    // solo lo vivo.
    expect(catalogoFuente).not.toMatch(/\bfindRefs\(/)
    // Contrato puro: ni Prisma ni implementacion en el dominio.
    expect(catalogoFuente).not.toMatch(/@prisma\/client|prisma\./)
  })

  it('el barrel de recetas reexporta RecipeCatalog y RecipeRef, solo desde su dominio', () => {
    expect(contratoFuente).toMatch(/export type \{[^}]*\bRecipeCatalog\b[^}]*\} from '\.\/domain\/recipe-catalog'/)
    expect(contratoFuente).toMatch(/export type \{[^}]*\bRecipeRef\b[^}]*\}/)
    // Son tipos: `export type`, nunca un `export {` de valor que arrastrara codigo.
    expect(contratoFuente).not.toMatch(/export \{[^}]*\bRecipeCatalog\b/)
  })

  it('la consulta a prisma.recipe vive SOLO en el adaptador driven de recetas (R53)', () => {
    // `recetas` es el unico modulo autorizado a consultar `prisma.recipe`; dentro de
    // `recetas`, este es el unico adaptador que lo hace ademas del repositorio.
    expect(adaptadorFuente).toMatch(/prisma\.recipe\.findMany/)
    expect(catalogoFuente).not.toMatch(/prisma/)
  })
})

describe('toRecipeRef', () => {
  it('marca isDeleted true cuando deletedAt trae fecha, y conserva el nombre (R44)', () => {
    const ref = toRecipeRef({ id: 'r-1', name: 'Detergente', deletedAt: new Date('2026-01-01') })
    expect(ref).toEqual({ id: 'r-1', name: 'Detergente', isDeleted: true })
  })

  it('marca isDeleted false cuando deletedAt es null', () => {
    expect(toRecipeRef({ id: 'r-2', name: 'Cloro', deletedAt: null })).toEqual({
      id: 'r-2',
      name: 'Cloro',
      isDeleted: false,
    })
  })

  // Mutacion: si el mapeo hiciera `Boolean(deletedAt)` mal o invirtiera el sentido, cae.
  it('no confunde viva con dada de baja', () => {
    expect(toRecipeRef({ id: 'r-3', name: 'X', deletedAt: null }).isDeleted).not.toBe(true)
    expect(toRecipeRef({ id: 'r-3', name: 'X', deletedAt: new Date() }).isDeleted).not.toBe(false)
  })
})

describe('findRecipeRefsIncludingDeleted', () => {
  it('devuelve la receta dada de baja con su nombre e isDeleted true, y la viva con false (R44)', async () => {
    findMany.mockResolvedValue([
      { id: 'r-viva', name: 'Cloro 5%', deletedAt: null },
      { id: 'r-baja', name: 'Detergente viejo', deletedAt: new Date('2026-02-02') },
    ])

    const refs = await findRecipeRefsIncludingDeleted(['r-viva', 'r-baja'])

    expect(refs).toEqual([
      { id: 'r-viva', name: 'Cloro 5%', isDeleted: false },
      { id: 'r-baja', name: 'Detergente viejo', isDeleted: true },
    ])
  })

  it('no filtra por deletedAt en el where: pide los ids y nada mas', async () => {
    findMany.mockResolvedValue([])

    await findRecipeRefsIncludingDeleted(['r-1', 'r-2'])

    const args = findMany.mock.calls[0]?.[0]
    expect(args.where).toEqual({ id: { in: ['r-1', 'r-2'] } })
    expect(args.where).not.toHaveProperty('deletedAt')
    // Y `deletedAt` se PIDE en el select: es de donde sale `isDeleted`.
    expect(args.select).toEqual({ id: true, name: true, deletedAt: true })
  })

  it('un id que no existe simplemente no vuelve: no se inventa una fila', async () => {
    findMany.mockResolvedValue([{ id: 'r-1', name: 'Cloro', deletedAt: null }])

    const refs = await findRecipeRefsIncludingDeleted(['r-1', 'r-fantasma'])

    expect(refs).toHaveLength(1)
    expect(refs.map((ref) => ref.id)).toEqual(['r-1'])
  })

  it('hace UNA sola consulta para N ids (R45)', async () => {
    findMany.mockResolvedValue([])

    await findRecipeRefsIncludingDeleted(['r-1', 'r-2', 'r-3', 'r-4', 'r-5'])

    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findRecipeRefsIncludingDeleted([])

    expect(refs).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe('el cambio es ADITIVO: ninguna firma anterior de recetas cambio', () => {
  it('RecipeId sigue siendo el alias de QC-33 y el barrel conserva todo lo que ya exportaba', () => {
    expect(catalogoFuente).toMatch(/export type RecipeId = string;/)

    // Los simbolos que el contrato publicaba ANTES de esta task (QC-25 + QC-33). Si alguno
    // desapareciera, un consumidor ajeno se romperia sin que nada mas lo dijera.
    const anteriores = [
      // QC-54 retiro el rol a `identity`; QC-74 renombro el envoltorio a `requirePermission`.
      'requirePermission',
      'Actor',
      'RecetasError',
      'UnauthorizedError',
      'NotFoundError',
      'DuplicateNameError',
      'ValidationError',
      'Page',
      'PageQuery',
      'pageQuerySchema',
      'RecipeId',
      'normalizeRecipeName',
      'MAX_IMAGE_BYTES',
      'validateRecipeImage',
      'RecipeImageFormat',
      'RecipeImageValidation',
      'recipeLineSchema',
      'createRecipeSchema',
      'updateRecipeSchema',
      'RecipeLineInput',
      'CreateRecipeInput',
      'UpdateRecipeInput',
      'RecipeSummary',
      'RecipeLineView',
      'RecipeDetail',
      'createCreateRecipe',
      'CreateRecipeDeps',
      'createGetRecipe',
      'GetRecipeDeps',
      'createListRecipes',
      'ListRecipesDeps',
      'createUpdateRecipe',
      'UpdateRecipeDeps',
      'UpdateRecipeResult',
      'StorageWarning',
      'createDeleteRecipe',
      'DeleteRecipeDeps',
    ]
    for (const simbolo of anteriores) {
      expect(contratoFuente, `el barrel dejo de exportar ${simbolo}`).toMatch(
        new RegExp(`\\b${simbolo}\\b`),
      )
    }
  })

  it('el adaptador nuevo no toca el repositorio de receta ni su adaptador', () => {
    // Vive JUNTO a `recipe-prisma.ts`, no dentro: `RecipeCatalog` es un contrato hacia
    // fuera, no una ampliacion de `RecipeRepository` (que es interno de `recetas`).
    expect(adaptadorFuente).not.toMatch(/recipe-prisma|recipe-repository/)
    expect(adaptadorFuente).not.toMatch(/@prisma\/client/)
  })
})
