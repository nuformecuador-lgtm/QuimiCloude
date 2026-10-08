// El adaptador del servicio de lectura `CustomerCatalog`, contra un doble del cliente Prisma.
//
// Lo que solo un unitario puede afirmar sin base: que el `select` es el minimo (ningun dato
// personal de mas sale de `clientes`), que una lista de ids vacia -o sin ningun uuid- devuelve
// `[]` sin consultar, que el ambito de empresa entra en cada `where`, y que la busqueda pasa por
// la MISMA `searchCondition` que el listado de clientes. Lo que depende del motor (acentos,
// orden real, paginas) vive en `tests/integration/clientes/customer-catalog.int.test.ts`.

import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

const prismaDouble = vi.hoisted(() => ({
  customer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
}))

vi.mock('@/lib/shared/db/prisma', () => ({ prisma: prismaDouble }))

import {
  findAliveCustomerRefById,
  findCustomerRefsIncludingDeleted,
  searchCustomerRefs,
} from '@/lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma'
import { searchCondition } from '@/lib/modules/clientes/adapters/driven/persistence/customer-prisma'

import type { CustomerRef } from '@/lib/modules/clientes'

const SCOPE = { companyId: '11111111-1111-4111-8111-111111111111' } as const
const ID_A = '22222222-2222-4222-8222-222222222222'
const ID_B = '33333333-3333-4333-8333-333333333333'

const SELECT_MINIMO = { id: true, firstNames: true, lastNames: true, deletedAt: true }

type Llamada = { where: Record<string, unknown>; select?: unknown; orderBy?: unknown; skip?: number; take?: number }

function primeraLlamada(fn: ReturnType<typeof vi.fn>): Llamada {
  const args = fn.mock.calls[0] as [Llamada] | undefined
  if (args === undefined) throw new Error('no hubo llamada')
  return args[0]
}

beforeEach(() => {
  prismaDouble.customer.findMany.mockReset().mockResolvedValue([])
  prismaDouble.customer.findFirst.mockReset().mockResolvedValue(null)
  prismaDouble.customer.count.mockReset().mockResolvedValue(0)
})

describe('CustomerRef: la forma publicada', () => {
  it('R37: solo id, nombres, apellidos y marca de baja; sin ciudad, telefono, correo ni direccion', () => {
    expectTypeOf<CustomerRef>().toEqualTypeOf<{
      readonly id: string
      readonly firstNames: string
      readonly lastNames: string
      readonly isDeleted: boolean
    }>()
  })
})

describe('customer-catalog-prisma: select minimo y ambito', () => {
  it('R37: findCustomerRefsIncludingDeleted pide solo el select minimo, sin deletedAt en el where, y deriva isDeleted', async () => {
    prismaDouble.customer.findMany.mockResolvedValue([
      { id: ID_A, firstNames: 'Ana', lastNames: 'Perez', deletedAt: null },
      { id: ID_B, firstNames: 'Luis', lastNames: 'Gomez', deletedAt: new Date('2026-01-01T00:00:00Z') },
    ])

    const refs = await findCustomerRefsIncludingDeleted([ID_A, ID_B], SCOPE)

    expect(refs).toEqual([
      { id: ID_A, firstNames: 'Ana', lastNames: 'Perez', isDeleted: false },
      { id: ID_B, firstNames: 'Luis', lastNames: 'Gomez', isDeleted: true },
    ])
    const llamada = primeraLlamada(prismaDouble.customer.findMany)
    expect(llamada.select).toEqual(SELECT_MINIMO)
    expect(llamada.where).toEqual({ id: { in: [ID_A, ID_B] }, companyId: SCOPE.companyId })
    expect(llamada.where).not.toHaveProperty('deletedAt')
  })

  it('R37: una lista vacia, o sin ningun uuid, devuelve [] sin consultar', async () => {
    expect(await findCustomerRefsIncludingDeleted([], SCOPE)).toEqual([])
    expect(await findCustomerRefsIncludingDeleted(['no-es-un-uuid', ''], SCOPE)).toEqual([])
    expect(prismaDouble.customer.findMany).not.toHaveBeenCalled()
  })

  it('R37: los ids sin forma de uuid se descartan antes de consultar', async () => {
    await findCustomerRefsIncludingDeleted(['basura', ID_A], SCOPE)
    expect(primeraLlamada(prismaDouble.customer.findMany).where).toEqual({
      id: { in: [ID_A] },
      companyId: SCOPE.companyId,
    })
  })

  it('R28: findAliveCustomerRefById exige vivo y de la empresa, con el select minimo', async () => {
    prismaDouble.customer.findFirst.mockResolvedValue({
      id: ID_A,
      firstNames: 'Ana',
      lastNames: 'Perez',
      deletedAt: null,
    })

    expect(await findAliveCustomerRefById(ID_A, SCOPE)).toEqual({
      id: ID_A,
      firstNames: 'Ana',
      lastNames: 'Perez',
      isDeleted: false,
    })
    const llamada = primeraLlamada(prismaDouble.customer.findFirst)
    expect(llamada.where).toEqual({ id: ID_A, deletedAt: null, companyId: SCOPE.companyId })
    expect(llamada.select).toEqual(SELECT_MINIMO)
  })

  it('R28: findAliveCustomerRefById con un id sin forma de uuid devuelve null sin consultar', async () => {
    expect(await findAliveCustomerRefById('no-es-un-uuid', SCOPE)).toBeNull()
    expect(prismaDouble.customer.findFirst).not.toHaveBeenCalled()
  })
})

describe('customer-catalog-prisma: searchCustomerRefs', () => {
  it('R27: con includeDeleted no filtra por deletedAt; ordena por apellidos, nombres e id; select minimo', async () => {
    await searchCustomerRefs({ search: '', includeDeleted: true, page: 1 }, SCOPE)

    const llamada = primeraLlamada(prismaDouble.customer.findMany)
    expect(llamada.where).toEqual({ companyId: SCOPE.companyId })
    expect(llamada.select).toEqual(SELECT_MINIMO)
    expect(llamada.orderBy).toEqual([{ lastNames: 'asc' }, { firstNames: 'asc' }, { id: 'asc' }])
    expect(primeraLlamada(prismaDouble.customer.count).where).toEqual(llamada.where)
  })

  it('R28: sin includeDeleted anade deletedAt: null', async () => {
    await searchCustomerRefs({ search: '', includeDeleted: false, page: 1 }, SCOPE)
    expect(primeraLlamada(prismaDouble.customer.findMany).where).toEqual({
      companyId: SCOPE.companyId,
      deletedAt: null,
    })
  })

  it('R27, R28: la busqueda es la MISMA searchCondition del listado de clientes', async () => {
    await searchCustomerRefs({ search: 'José  Bogotá', includeDeleted: false, page: 1 }, SCOPE)
    const where = primeraLlamada(prismaDouble.customer.findMany).where
    expect(where.AND).toEqual(searchCondition('José  Bogotá'))
    expect(where.AND).toHaveLength(2)
  })

  it('R27, R28: pagina 10 por defecto y acota a 25; el pageSize de salida es el acotado', async () => {
    prismaDouble.customer.count.mockResolvedValue(60)

    const porDefecto = await searchCustomerRefs({ search: '', includeDeleted: false, page: 2 }, SCOPE)
    expect(primeraLlamada(prismaDouble.customer.findMany)).toMatchObject({ skip: 10, take: 10 })
    expect(porDefecto).toMatchObject({ page: 2, pageSize: 10, total: 60, totalPages: 6 })

    prismaDouble.customer.findMany.mockClear()
    const acotada = await searchCustomerRefs(
      { search: '', includeDeleted: false, page: 1, pageSize: 100 },
      SCOPE,
    )
    expect(primeraLlamada(prismaDouble.customer.findMany)).toMatchObject({ skip: 0, take: 25 })
    expect(acotada).toMatchObject({ pageSize: 25, totalPages: 3 })
  })
})
