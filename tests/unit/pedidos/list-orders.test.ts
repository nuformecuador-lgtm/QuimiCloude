// T12 (QC-34) — Listado (R34, R36, R37, R38, R39, R40, R43, R44, R45, R46, R29).
//
// LO QUE HACE ESTE ARCHIVO Y LO QUE NO. El defecto de 10, el tope de 25 y el orden por
// prioridad los aplica el ADAPTADOR driven con `lib/shared/pagination` (`design.md > 10`,
// R35, R41), no el caso de uso: probarlos desde aqui seria probar la libreria, que ya tiene
// su test en `tests/unit/pagination.test.ts`, y los tiene el test de integracion contra la
// base. Aqui se prueba lo que SI decide el caso de uso: el orden de los pasos de
// `design.md > 6.4`, la deduplicacion de ids y el NUMERO de consultas.
//
// POR QUE SE CUENTAN LAS INVOCACIONES. «No hay N+1» solo es testeable contando llamadas: un
// bucle de diez consultas devolveria exactamente el mismo resultado y pasaria verde. Por eso
// los dobles de los dos catalogos son contadores, y se afirma `toHaveBeenCalledTimes(1)` con
// los ids ya DEDUPLICADOS (R45).

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
import { ValidationError, type PedidosError } from '@/lib/modules/pedidos/domain/errors'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderFilters, OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { Page, PageQuery } from '@/lib/modules/pedidos/domain/page'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades'

const ADMIN: Actor = { id: 'admin-1', roleName: ROLE_ADMINISTRADOR }

const RECETA_A = '22222222-2222-4222-8222-222222222222'
const RECETA_B = '44444444-4444-4444-8444-444444444444'
const UNIDAD_A = '33333333-3333-4333-8333-333333333333'
const UNIDAD_B = '55555555-5555-4555-8555-555555555555'

const REFS_RECETA: readonly RecipeRef[] = [
  { id: RECETA_A, name: 'Acido citrico 50%', isDeleted: false },
  // R44: dada de baja y CON nombre. Un pedido conserva su receta aunque la retiren, y la fila
  // tiene que seguir diciendo que se pidio.
  { id: RECETA_B, name: 'Formula retirada', isDeleted: true },
]
const REFS_UNIDAD: readonly UnitRef[] = [
  { id: UNIDAD_A, name: 'Kilogramo', symbol: 'kg' },
  { id: UNIDAD_B, name: 'Litro', symbol: 'L' },
]

function fila(overrides: Partial<OrderRow> & { readonly id: string }): OrderRow {
  return {
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA_A,
    quantity: '10.0000',
    unitId: UNIDAD_A,
    unitPrice: '2.5000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    ...overrides,
  }
}

function pagina(items: readonly OrderRow[], resto: Partial<Page<OrderRow>> = {}): Page<OrderRow> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1, ...resto }
}

function dobles(opciones: {
  pagina?: Page<OrderRow>
  recetas?: readonly RecipeRef[]
  unidades?: readonly UnitRef[]
}) {
  // Los parametros van TIPADOS -y no `vi.fn(async () => ...)`- porque lo que este archivo
  // afirma es lo que se LE PASO a cada doble: sin ellos, TypeScript infiere una tupla vacia y
  // `mock.calls[0][0]` no existe. Ademas los dos catalogos FILTRAN por los ids pedidos, como
  // hacen los de verdad: un id que no existe simplemente no vuelve.
  const listAlive = vi.fn(async (filtros: OrderFilters, query: PageQuery) => {
    // El doble no usa los argumentos; los DECLARA para que `mock.calls` tenga tipo, y lo que
    // se le paso se afirma desde el propio caso de test.
    void [filtros, query]
    return opciones.pagina ?? pagina([])
  })
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[]) =>
    (opciones.recetas ?? REFS_RECETA).filter((ref) => ids.includes(ref.id)),
  )
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    (opciones.unidades ?? REFS_UNIDAD).filter((ref) => ids.includes(ref.id)),
  )

  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`${nombre} no deberia llamarse al listar`)
    })

  const orders = {
    create: explota('orders.create'),
    findAliveById: explota('orders.findAliveById'),
    listAlive,
    updateAlive: explota('orders.updateAlive'),
    cancelAlive: explota('orders.cancelAlive'),
    softDeleteAlive: explota('orders.softDeleteAlive'),
  } as unknown as OrderRepository

  return {
    orders,
    recipes: { findRefsIncludingDeleted } as unknown as RecipeCatalog,
    units: { findRefs } as unknown as UnitCatalog,
    listAlive,
    findRefsIncludingDeleted,
    findRefs,
  }
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

describe('listOrders — tres consultas por pagina, tenga 1 fila o 25 (R45)', () => {
  it('una sola llamada a cada catalogo, con los ids DEDUPLICADOS (R45)', async () => {
    // Seis pedidos, dos recetas y dos unidades: si el caso de uso preguntara por fila,
    // habria seis llamadas a cada catalogo y este test caeria.
    const filas = [
      fila({ id: 'o-1', recipeId: RECETA_A, unitId: UNIDAD_A }),
      fila({ id: 'o-2', recipeId: RECETA_A, unitId: UNIDAD_A }),
      fila({ id: 'o-3', recipeId: RECETA_B, unitId: UNIDAD_B }),
      fila({ id: 'o-4', recipeId: RECETA_A, unitId: UNIDAD_B }),
      fila({ id: 'o-5', recipeId: RECETA_B, unitId: UNIDAD_A }),
      fila({ id: 'o-6', recipeId: RECETA_A, unitId: UNIDAD_A }),
    ]
    const d = dobles({ pagina: pagina(filas, { total: 6 }) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items).toHaveLength(6)
    expect(d.listAlive).toHaveBeenCalledTimes(1)
    expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    expect(d.findRefs).toHaveBeenCalledTimes(1)
    // Y los ids llegan sin repetir: dos entradas, no seis.
    expect(d.findRefsIncludingDeleted.mock.calls[0]?.[0]).toEqual([RECETA_A, RECETA_B])
    expect(d.findRefs.mock.calls[0]?.[0]).toEqual([UNIDAD_A, UNIDAD_B])
  })

  it('el numero de consultas NO crece con el numero de filas (R45)', async () => {
    for (const cuantas of [1, 10, 25]) {
      const filas = Array.from({ length: cuantas }, (_, i) => fila({ id: `o-${i}` }))
      const d = dobles({ pagina: pagina(filas, { total: cuantas }) })

      await createListOrders(d)({ page: 1 }, ADMIN)

      expect([
        d.listAlive.mock.calls.length,
        d.findRefsIncludingDeleted.mock.calls.length,
        d.findRefs.mock.calls.length,
      ]).toEqual([1, 1, 1])
    }
  })

  it('usa la consulta que INCLUYE las dadas de baja, no una de solo vivas (R44)', async () => {
    // `RecipeCatalog` publica exactamente un metodo, y su nombre es explicito precisamente
    // para que nadie lo confunda con los `findRefs` de producto y unidad, que solo devuelven
    // lo vivo.
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]) })

    await createListOrders(d)({ page: 1 }, ADMIN)

    expect(Object.keys(d.recipes)).toEqual(['findRefsIncludingDeleted'])
  })
})

describe('listOrders — lo que devuelve cada fila (R43, R44, R46, R29)', () => {
  it('resuelve los nombres de receta y unidad por los contratos publicos (R43)', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1', recipeId: RECETA_A, unitId: UNIDAD_A })]) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.recipeName).toBe('Acido citrico 50%')
    expect(salida.items[0]?.unitName).toBe('Kilogramo')
    expect(salida.items[0]?.numberText).toBe('2026-0000001')
  })

  it('una receta DADA DE BAJA trae igualmente su nombre (R44)', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1', recipeId: RECETA_B })]) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.recipeId).toBe(RECETA_B)
    expect(salida.items[0]?.recipeName).toBe('Formula retirada')
  })

  it('si el id no vuelve del catalogo, el nombre es null y la fila SIGUE apareciendo', async () => {
    // Una receta borrada FISICAMENTE por consola. Las FK RESTRICT de QC-33 lo hacen casi
    // imposible, pero la fila no puede desaparecer del listado por eso.
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]), recetas: [], unidades: [] })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items).toHaveLength(1)
    expect(salida.items[0]?.recipeName).toBeNull()
    expect(salida.items[0]?.unitName).toBeNull()
  })

  it('los autores salen como IDENTIFICADORES y el cancelado trae su motivo (R46, R29, R40)', async () => {
    const d = dobles({
      pagina: pagina([
        fila({ id: 'o-1', status: 'CANCELADO', cancellationReason: 'El cliente anulo el pedido' }),
      ]),
    })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.createdBy).toBe('admin-0')
    expect(salida.items[0]?.updatedBy).toBe('admin-0')
    // R40: los cancelados SI salen en el listado -para eso tienen estado propio en vez de
    // desaparecer-; los borrados no salen nunca, y ese filtro es del puerto.
    expect(salida.items[0]?.status).toBe('CANCELADO')
    expect(salida.items[0]?.cancellationReason).toBe('El cliente anulo el pedido')
  })
})

describe('listOrders — pagina, filtros y validacion (R34, R36, R37, R38, R39)', () => {
  it('conserva total, page, pageSize y totalPages tal como los da el puerto (R34, R37)', async () => {
    // El caso de uso NO recalcula nada: la aritmetica es del adaptador con
    // `lib/shared/pagination`, y reimplementarla aqui es lo que R37 prohibe.
    const d = dobles({
      pagina: pagina([fila({ id: 'o-1' })], { total: 43, page: 3, pageSize: 25, totalPages: 2 }),
    })

    const salida = await createListOrders(d)({ page: 3, pageSize: 25 }, ADMIN)

    expect({
      total: salida.total,
      page: salida.page,
      pageSize: salida.pageSize,
      totalPages: salida.totalPages,
    }).toEqual({ total: 43, page: 3, pageSize: 25, totalPages: 2 })
  })

  it('entrega la consulta ya validada al puerto, sin calcular ningun offset (R37)', async () => {
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)({ page: 2, pageSize: 25 }, ADMIN)

    const [filtros, query] = d.listAlive.mock.calls[0] as unknown as [
      OrderFilters,
      Record<string, unknown>,
    ]
    expect(filtros).toEqual({})
    expect(query).toEqual({ page: 2, pageSize: 25 })
    expect(Object.keys(query)).not.toContain('offset')
    expect(Object.keys(query)).not.toContain('limit')
  })

  it('los dos filtros son opcionales y COMBINABLES (R38)', async () => {
    const soloEstado = dobles({ pagina: pagina([]) })
    await createListOrders(soloEstado)({ page: 1, status: 'EN_CURSO' }, ADMIN)
    expect(soloEstado.listAlive.mock.calls[0]?.[0]).toEqual({ status: 'EN_CURSO' })

    const soloPrioridad = dobles({ pagina: pagina([]) })
    await createListOrders(soloPrioridad)({ page: 1, priority: 'CRITICA' }, ADMIN)
    expect(soloPrioridad.listAlive.mock.calls[0]?.[0]).toEqual({ priority: 'CRITICA' })

    const ambos = dobles({ pagina: pagina([]) })
    await createListOrders(ambos)({ page: 1, status: 'CANCELADO', priority: 'ALTA' }, ADMIN)
    expect(ambos.listAlive.mock.calls[0]?.[0]).toEqual({ status: 'CANCELADO', priority: 'ALTA' })
  })

  it('no hay busqueda por texto ni filtro por numero correlativo (R39)', async () => {
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)({ page: 1, q: 'acido', orderNumber: '2026-0000001' }, ADMIN)

    // Lo que el esquema no declara se descarta y NO llega al puerto.
    expect(d.listAlive.mock.calls[0]?.[0]).toEqual({})
    expect(Object.keys(d.listAlive.mock.calls[0]?.[1] as unknown as object)).toEqual(['page'])
  })

  it('rechaza una pagina que no es un entero mayor o igual a 1, sin leer del repositorio (R36)', async () => {
    for (const entrada of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: 1, pageSize: 0 }]) {
      const d = dobles({ pagina: pagina([]) })

      expect(await codigoDelFallo(() => createListOrders(d)(entrada, ADMIN))).toBe('invalid_input')
      expect(d.listAlive).not.toHaveBeenCalled()
    }

    const d = dobles({ pagina: pagina([]) })
    await expect(createListOrders(d)({ page: 0 }, ADMIN)).rejects.toBeInstanceOf(ValidationError)
  })

  it('rechaza un estado o una prioridad fuera de su conjunto cerrado (R19, R38)', async () => {
    const d = dobles({ pagina: pagina([]) })

    expect(
      await codigoDelFallo(() => createListOrders(d)({ page: 1, status: 'ARCHIVADO' }, ADMIN)),
    ).toBe('invalid_input')
    expect(
      await codigoDelFallo(() => createListOrders(d)({ page: 1, priority: 'URGENTISIMA' }, ADMIN)),
    ).toBe('invalid_input')
    expect(d.listAlive).not.toHaveBeenCalled()
  })
})
