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
const findFirst = vi.fn()
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { recipe: { findMany, findFirst } } }))

const {
  findAliveRecipeByNormalizedName,
  findRecipeExecutionContentById,
  findRecipeIdsMatchingName,
  findRecipeRefsIncludingDeleted,
  toRecipeExecutionContent,
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
  findFirst.mockReset()
})

describe('contrato RecipeCatalog', () => {
  it('el dominio declara findRefsIncludingDeleted y un RecipeRef con isDeleted', () => {
    // (a) Se afirma sobre el TEXTO y no en ejecucion a proposito: `RecipeCatalog` y
    // `RecipeRef` son SOLO TIPOS y desaparecen al compilar, asi que en tiempo de ejecucion
    // no hay nada que mirar (mismo criterio que `module-contract.test.ts` con
    // `ProductCatalog`).
    expect(catalogoFuente).toMatch(/export interface RecipeCatalog \{/)
    // QC-50: gano un segundo parametro, `companyId: string` -sin el, `findRefsIncludingDeleted`
    // no podria negarle a otro modulo el nombre de una receta de otra empresa.
    expect(catalogoFuente).toMatch(
      /findRefsIncludingDeleted\(\s*ids: readonly RecipeId\[\],\s*companyId: string,\s*\): Promise<readonly RecipeRef\[\]>/,
    )
    expect(catalogoFuente).toMatch(/export type RecipeRef = \{/)
    expect(catalogoFuente).toMatch(/readonly isDeleted: boolean/)
    // El nombre largo es deliberado (`design.md > 11.3`): `recetas` NO publica un `findRefs`
    // a secas que se pudiera confundir con los de `inventario`/`unidades`, que devuelven
    // solo lo vivo.
    expect(catalogoFuente).not.toMatch(/\bfindRefs\(/)
    // QC-159 T1: el choque de nombre de la revision de formula.
    expect(catalogoFuente).toMatch(
      /findAliveByNormalizedName\(\s*name: string,\s*companyId: string,\s*\): Promise<\{ id: RecipeId; name: string \} \| null>/,
    )
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

/** Campos de fila de una original: sin `parent`; las lineas no cuentan para la revision. */
const ORIGINAL = { parent: null, lines: [] } as const
const REF_ORIGINAL = (name: string) => ({ ownName: name, isUnderReview: false, original: null })
const pct = (value: string) => ({ toFixed: () => value })

describe('toRecipeRef', () => {
  it('marca isDeleted true cuando deletedAt trae fecha, y conserva el nombre (R44)', () => {
    const ref = toRecipeRef({ id: 'r-1', name: 'Detergente', deletedAt: new Date('2026-01-01'), ...ORIGINAL })
    expect(ref).toEqual({ id: 'r-1', name: 'Detergente', ...REF_ORIGINAL('Detergente'), isDeleted: true })
  })

  it('marca isDeleted false cuando deletedAt es null', () => {
    expect(toRecipeRef({ id: 'r-2', name: 'Cloro', deletedAt: null, ...ORIGINAL })).toEqual({
      id: 'r-2',
      name: 'Cloro',
      ...REF_ORIGINAL('Cloro'),
      isDeleted: false,
    })
  })

  // Mutacion: si el mapeo hiciera `Boolean(deletedAt)` mal o invirtiera el sentido, cae.
  it('no confunde viva con dada de baja', () => {
    expect(toRecipeRef({ id: 'r-3', name: 'X', deletedAt: null, ...ORIGINAL }).isDeleted).not.toBe(true)
    expect(toRecipeRef({ id: 'r-3', name: 'X', deletedAt: new Date(), ...ORIGINAL }).isDeleted).not.toBe(false)
  })
})

describe('toRecipeRef de una version', () => {
  const PADRE = { id: 'r-original', name: 'Crema base' }

  it('R11: el nombre mostrado es «Original · Version», con el propio y la original aparte', () => {
    const ref = toRecipeRef({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: null,
      parent: PADRE,
      lines: [{ percentage: pct('60.00') }, { percentage: pct('40.00') }],
    })

    expect(ref).toEqual({
      id: 'r-version',
      name: 'Crema base · Sin perfume',
      ownName: 'Sin perfume',
      isDeleted: false,
      isUnderReview: false,
      original: { id: 'r-original', name: 'Crema base' },
    })
  })

  it('R21: una version cuyas lineas no suman 100 esta por revisar', () => {
    const ref = toRecipeRef({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: null,
      parent: PADRE,
      lines: [{ percentage: pct('60.00') }, { percentage: pct('39.99') }],
    })

    expect(ref.isUnderReview).toBe(true)
  })

  it('R21: una version sin lineas esta por revisar', () => {
    const ref = toRecipeRef({ id: 'r-version', name: 'Vacia', deletedAt: null, parent: PADRE, lines: [] })

    expect(ref.isUnderReview).toBe(true)
  })

  it('R21: una original sin lineas NO esta por revisar, ni una que no suma 100', () => {
    expect(toRecipeRef({ id: 'r-1', name: 'Vieja', deletedAt: null, parent: null, lines: [] }).isUnderReview).toBe(
      false,
    )
    expect(
      toRecipeRef({ id: 'r-1', name: 'Vieja', deletedAt: null, parent: null, lines: [{ percentage: pct('50.00') }] })
        .isUnderReview,
    ).toBe(false)
  })

  it('R11: una version dada de baja conserva su nombre compuesto', () => {
    const ref = toRecipeRef({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: new Date('2026-03-03'),
      parent: PADRE,
      lines: [{ percentage: pct('100.00') }],
    })

    expect(ref.name).toBe('Crema base · Sin perfume')
    expect(ref.isDeleted).toBe(true)
  })
})

const EMPRESA = 'empresa-1'

describe('findRecipeRefsIncludingDeleted', () => {
  it('devuelve la receta dada de baja con su nombre e isDeleted true, y la viva con false (R44)', async () => {
    findMany.mockResolvedValue([
      { id: 'r-viva', name: 'Cloro 5%', deletedAt: null, ...ORIGINAL },
      { id: 'r-baja', name: 'Detergente viejo', deletedAt: new Date('2026-02-02'), ...ORIGINAL },
    ])

    const refs = await findRecipeRefsIncludingDeleted(['r-viva', 'r-baja'], EMPRESA)

    expect(refs).toEqual([
      { id: 'r-viva', name: 'Cloro 5%', ...REF_ORIGINAL('Cloro 5%'), isDeleted: false },
      { id: 'r-baja', name: 'Detergente viejo', ...REF_ORIGINAL('Detergente viejo'), isDeleted: true },
    ])
  })

  it('no filtra por deletedAt en el where: pide los ids y el ambito de empresa, nada mas', async () => {
    findMany.mockResolvedValue([])

    await findRecipeRefsIncludingDeleted(['r-1', 'r-2'], EMPRESA)

    const args = findMany.mock.calls[0]?.[0]
    // QC-50: la empresa se compone con AND, junto al filtro de ids -nunca fundida con
    // ellos ni como un `OR` que ampliara lo visible.
    expect(args.where).toEqual({
      AND: [{ companyId: EMPRESA }, { id: { in: ['r-1', 'r-2'] } }],
    })
    expect(JSON.stringify(args.where)).not.toContain('deletedAt')
    // `deletedAt` da `isDeleted`; `parent` y los porcentajes, el nombre mostrado y la revision.
    expect(args.select).toEqual({
      id: true,
      name: true,
      deletedAt: true,
      parent: { select: { id: true, name: true } },
      lines: { select: { percentage: true } },
    })
  })

  it('un id que no existe simplemente no vuelve: no se inventa una fila', async () => {
    findMany.mockResolvedValue([{ id: 'r-1', name: 'Cloro', deletedAt: null, ...ORIGINAL }])

    const refs = await findRecipeRefsIncludingDeleted(['r-1', 'r-fantasma'], EMPRESA)

    expect(refs).toHaveLength(1)
    expect(refs.map((ref) => ref.id)).toEqual(['r-1'])
  })

  it('hace UNA sola consulta para N ids (R45)', async () => {
    findMany.mockResolvedValue([])

    await findRecipeRefsIncludingDeleted(['r-1', 'r-2', 'r-3', 'r-4', 'r-5'], EMPRESA)

    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('con una lista vacia de ids no consulta la base y devuelve una lista vacia', async () => {
    const refs = await findRecipeRefsIncludingDeleted([], EMPRESA)

    expect(refs).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

const LINEA_CLORO = { productId: 'p-cloro', percentage: { toFixed: () => '10.00' } }
const PASO_VALIDO = { blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar' }] }] }

describe('findRecipeExecutionContentById', () => {
  it('T2(a) - receta viva: devuelve pasos y lineas, con isDeleted false', async () => {
    findFirst.mockResolvedValue({
      id: 'r-viva',
      name: 'Cloro 5%',
      deletedAt: null,
      steps: [PASO_VALIDO],
      parent: null,
      lines: [LINEA_CLORO],
      tools: [],
    })

    const receta = await findRecipeExecutionContentById('r-viva', EMPRESA)

    expect(receta).toEqual({
      id: 'r-viva',
      name: 'Cloro 5%',
      isDeleted: false,
      steps: [PASO_VALIDO],
      lines: [{ productId: 'p-cloro', productName: null, percentage: '10.00' }],
      tools: [],
    })
  })

  it('T2(b) - receta de baja: vuelve igual, con isDeleted true', async () => {
    findFirst.mockResolvedValue({
      id: 'r-baja',
      name: 'Detergente viejo',
      deletedAt: new Date('2026-02-02'),
      steps: [],
      parent: null,
      lines: [],
      tools: [],
    })

    const receta = await findRecipeExecutionContentById('r-baja', EMPRESA)

    expect(receta?.isDeleted).toBe(true)
    expect(receta?.name).toBe('Detergente viejo')
  })

  it('T2(c) - un id inexistente devuelve null', async () => {
    findFirst.mockResolvedValue(null)

    await expect(findRecipeExecutionContentById('r-fantasma', EMPRESA)).resolves.toBeNull()
  })

  it('no filtra por deletedAt: una receta de baja sigue pudiendo ejecutarse', async () => {
    findFirst.mockResolvedValue({ id: 'r-1', name: 'X', deletedAt: null, steps: [], parent: null, lines: [], tools: [] })

    await findRecipeExecutionContentById('r-1', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.where).toEqual({ AND: [{ companyId: EMPRESA }, { id: 'r-1' }] })
    expect(JSON.stringify(args.where)).not.toContain('deletedAt')
  })

  it('QC-50 R14 - una receta de otra empresa devuelve null, igual que un id inexistente', async () => {
    findFirst.mockResolvedValue(null)

    const receta = await findRecipeExecutionContentById('r-de-otra-empresa', EMPRESA)

    expect(receta).toBeNull()
    const args = findFirst.mock.calls[0]?.[0]
    expect(args.where).toEqual({ AND: [{ companyId: EMPRESA }, { id: 'r-de-otra-empresa' }] })
  })
})

describe('findRecipeIdsMatchingName', () => {
  it('casa por subcadena contra el nombre normalizado', async () => {
    findMany.mockResolvedValue([{ id: 'r-1' }])

    const ids = await findRecipeIdsMatchingName('cloro', EMPRESA)

    expect(ids).toEqual(['r-1'])
    const args = findMany.mock.calls[0]?.[0]
    expect(args.where.AND[1]).toEqual({
      OR: [{ nameNormalized: { contains: 'cloro' } }, { parent: { nameNormalized: { contains: 'cloro' } } }],
    })
  })

  it('ignora acentos y mayusculas al normalizar el termino (R2)', async () => {
    findMany.mockResolvedValue([])

    await findRecipeIdsMatchingName('CLÓRO', EMPRESA)

    const args = findMany.mock.calls[0]?.[0]
    expect(args.where.AND[1]).toEqual({
      OR: [{ nameNormalized: { contains: 'cloro' } }, { parent: { nameNormalized: { contains: 'cloro' } } }],
    })
  })

  it('una receta dada de baja SI vuelve (R4)', async () => {
    findMany.mockResolvedValue([{ id: 'r-baja' }])

    const ids = await findRecipeIdsMatchingName('detergente', EMPRESA)

    expect(ids).toEqual(['r-baja'])
  })

  it('una receta de otra empresa NO vuelve (R6)', async () => {
    findMany.mockResolvedValue([])

    const ids = await findRecipeIdsMatchingName('cloro', EMPRESA)

    expect(ids).toEqual([])
    const args = findMany.mock.calls[0]?.[0]
    expect(args.where.AND[0]).toEqual({ companyId: EMPRESA })
  })

  it('un termino que normaliza a vacio devuelve null, no [] (R9)', async () => {
    const ids = await findRecipeIdsMatchingName('%%%', EMPRESA)

    expect(ids).toBeNull()
    expect(findMany).not.toHaveBeenCalled()
  })

  it('ningun nombre casa: devuelve [] (R10)', async () => {
    findMany.mockResolvedValue([])

    const ids = await findRecipeIdsMatchingName('inexistente', EMPRESA)

    expect(ids).toEqual([])
  })

  it('hace UNA sola consulta y deletedAt no aparece en el where', async () => {
    findMany.mockResolvedValue([])

    await findRecipeIdsMatchingName('cloro', EMPRESA)

    expect(findMany).toHaveBeenCalledTimes(1)
    const args = findMany.mock.calls[0]?.[0]
    expect(JSON.stringify(args.where)).not.toContain('deletedAt')
    expect(args.select).toEqual({ id: true })
  })
})

describe('findAliveRecipeByNormalizedName (QC-159 T1, R17, R20)', () => {
  it('un nombre que normaliza a vacio devuelve null sin consultar la base', async () => {
    const receta = await findAliveRecipeByNormalizedName('   %%%   ', EMPRESA)

    expect(receta).toBeNull()
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('filtra por nombre normalizado, empresa y solo lo vivo', async () => {
    findFirst.mockResolvedValue(null)

    await findAliveRecipeByNormalizedName('Desengrasante 5%', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.where).toEqual({
      AND: [{ companyId: EMPRESA }, { nameNormalized: 'desengrasante5', deletedAt: null, parentRecipeId: null }],
    })
    expect(args.select).toEqual({ id: true, name: true })
  })

  it('devuelve id y nombre cuando hay receta viva con ese nombre', async () => {
    findFirst.mockResolvedValue({ id: 'r-1', name: 'Desengrasante 5%' })

    const receta = await findAliveRecipeByNormalizedName('desengrasante-5%', EMPRESA)

    expect(receta).toEqual({ id: 'r-1', name: 'Desengrasante 5%' })
  })

  it('ninguna receta viva con ese nombre devuelve null', async () => {
    findFirst.mockResolvedValue(null)

    await expect(findAliveRecipeByNormalizedName('inexistente', EMPRESA)).resolves.toBeNull()
  })
})

describe('toRecipeExecutionContent', () => {
  it('descarta el paso invalido y conserva el orden de los validos', () => {
    const contenido = toRecipeExecutionContent({
      id: 'r-1',
      name: 'X',
      deletedAt: null,
      steps: [{ id: 'invalido' }, PASO_VALIDO],
      parent: null,
      lines: [],
      tools: [],
    })

    expect(contenido.steps).toEqual([PASO_VALIDO])
  })

  it('productName sale siempre null: recetas no conoce el nombre de un producto', () => {
    const contenido = toRecipeExecutionContent({
      id: 'r-1',
      name: 'X',
      deletedAt: null,
      steps: [],
      parent: null,
      lines: [LINEA_CLORO],
      tools: [],
    })

    expect(contenido.lines[0]?.productName).toBeNull()
  })

  it('R8, R11: una version se ejecuta con el nombre compuesto, los pasos de su original y sus propias lineas', () => {
    const contenido = toRecipeExecutionContent({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: null,
      steps: [],
      parent: { name: 'Crema base', steps: [{ id: 'invalido' }, PASO_VALIDO] },
      lines: [LINEA_CLORO],
      tools: [],
    })

    expect(contenido).toEqual({
      id: 'r-version',
      name: 'Crema base · Sin perfume',
      isDeleted: false,
      steps: [PASO_VALIDO],
      lines: [{ productId: 'p-cloro', productName: null, percentage: '10.00' }],
      tools: [],
    })
  })

  it('R8: los pasos propios de una version no se usan aunque la fila traiga alguno', () => {
    const contenido = toRecipeExecutionContent({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: null,
      steps: [PASO_VALIDO],
      parent: { name: 'Crema base', steps: [] },
      lines: [],
      tools: [],
    })

    expect(contenido.steps).toEqual([])
  })
})

describe('herramientas en el contenido de ejecucion', () => {
  it('R8: las herramientas van en `tools`, aparte, y `lines` queda identico al de una receta sin herramientas', () => {
    const base = {
      id: 'r-1',
      name: 'X',
      deletedAt: null,
      steps: [],
      parent: null,
      lines: [LINEA_CLORO],
    }
    const sin = toRecipeExecutionContent({ ...base, tools: [] })
    const con = toRecipeExecutionContent({
      ...base,
      tools: [
        { productId: 'p-batidora', quantity: 2 },
        { productId: 'p-balanza', quantity: 1 },
      ],
    })

    expect(con.lines).toEqual(sin.lines)
    expect(con.tools).toEqual([
      { productId: 'p-batidora', productName: null, quantity: 2 },
      { productId: 'p-balanza', productName: null, quantity: 1 },
    ])
  })

  it('R28: la consulta pide las herramientas en orden de alta', async () => {
    findFirst.mockResolvedValue({
      id: 'r-1',
      name: 'X',
      deletedAt: null,
      steps: [],
      parent: null,
      lines: [],
      tools: [{ productId: 'p-batidora', quantity: 3 }],
    })

    const receta = await findRecipeExecutionContentById('r-1', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.select.tools).toEqual({
      select: { productId: true, quantity: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    expect(receta?.tools).toEqual([{ productId: 'p-batidora', productName: null, quantity: 3 }])
  })
})

describe('findRecipeExecutionContentById de una version', () => {
  it('R8, R25: pide los pasos de la original sin filtro de vida en ella', async () => {
    findFirst.mockResolvedValue({
      id: 'r-version',
      name: 'Sin perfume',
      deletedAt: new Date('2026-04-04'),
      steps: [],
      parent: { name: 'Crema base', steps: [PASO_VALIDO] },
      lines: [LINEA_CLORO],
      tools: [],
    })

    const receta = await findRecipeExecutionContentById('r-version', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.select.parent).toEqual({ select: { name: true, steps: true } })
    expect(JSON.stringify(args)).not.toContain('deletedAt":null')
    expect(receta?.steps).toEqual([PASO_VALIDO])
    expect(receta?.isDeleted).toBe(true)
  })
})

describe('busquedas de nombre frente a versiones', () => {
  it('R41, R40: el OR de nombre propio / de la original va DENTRO del AND con el ambito', async () => {
    findMany.mockResolvedValue([])

    await findRecipeIdsMatchingName('crema', EMPRESA)

    const where = findMany.mock.calls[0]?.[0].where
    expect(Object.keys(where)).toEqual(['AND'])
    expect(where.AND[0]).toEqual({ companyId: EMPRESA })
    expect(where.AND[1].OR).toEqual([
      { nameNormalized: { contains: 'crema' } },
      { parent: { nameNormalized: { contains: 'crema' } } },
    ])
  })

  it('R37: findAliveRecipeByNormalizedName solo mira originales', async () => {
    findFirst.mockResolvedValue(null)

    await findAliveRecipeByNormalizedName('Sin perfume', EMPRESA)

    const where = findFirst.mock.calls[0]?.[0].where
    expect(where.AND[1]).toMatchObject({ parentRecipeId: null, deletedAt: null })
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
      'RecipeNotFoundError',
      'RecipeDuplicateNameError',
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
