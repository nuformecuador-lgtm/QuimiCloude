// T12 (QC-34) + T13 (QC-57) — Listado de pedidos con el CONTRATO GENERICO de consulta.
//
// QC-34: R34, R36, R37, R38, R39, R40, R43, R44, R45, R46, R29.
// QC-57: R5, R6, R11, R13, R17, R25, R30, R33, R34 — con el repositorio, los dos catalogos y
// el log MOCKEADOS. Lo que NO se prueba aqui es como se traduce la consulta a SQL: eso es de
// `tests/integration/pedidos/list-query-orders.int.test.ts` -un doble del puerto no puede
// demostrar que la base filtro y ordeno ANTES de paginar-.
//
// EL TEST QUE NO PUEDE FALTAR (`design.md > 12`): pedir orden por `deletedAt` y comprobar LAS
// TRES COSAS A LA VEZ -que la consulta no falla, que el orden aplicado es el de por defecto y
// que el log recibio el campo-. Comprobar solo la primera pasa en verde con un `catch` vacio.
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

import { ValidationError, type PedidosError } from '@/lib/modules/pedidos/domain/errors'
import { UnauthorizedError } from '@/lib/modules/pedidos/domain/errors'
import { type GetOrderDeps } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders, type ListOrdersDeps } from '@/lib/modules/pedidos/domain/list-orders'
import { ORDER_QUERYABLE } from '@/lib/modules/pedidos/domain/order-queryable'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { ListQuery } from '@/lib/modules/pedidos/domain/list-query'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { Page } from '@/lib/modules/pedidos/domain/page'
import type { ListQueryLog } from '@/lib/modules/pedidos/ports/list-query-log'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog, PresentationRef } from '@/lib/modules/inventario'
import type { RecipeCatalog, RecipeRef } from '@/lib/modules/recetas'
import type { UnitCatalog, UnitRef } from '@/lib/modules/unidades'

// QC-74: el actor lleva PERMISOS, no el nombre del rol (R18). Los dos codigos de `pedidos`,
// porque este archivo ejercita lecturas y escrituras con el mismo fixture.
// QC-60 (R16): el `Actor` de `pedidos` lleva la EMPRESA desde esta ficha.
const ADMIN: Actor = {
  id: 'admin-1',
  companyId: '33333333-3333-4333-8333-333333333333',
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}
// QC-74: los permisos con los que nace el Operador en el seed (R9). Ninguno es de `pedidos`.
const OPERADOR: Actor = {
  id: 'operador-1',
  companyId: '33333333-3333-4333-8333-333333333333',
  permissions: ['inventario.consultar'],
}

const RECETA_A = '22222222-2222-4222-8222-222222222222'
const RECETA_B = '44444444-4444-4444-8444-444444444444'

const REFS_RECETA: readonly RecipeRef[] = [
  { id: RECETA_A, name: 'Acido citrico 50%', isDeleted: false },
  // R44: dada de baja y CON nombre. Un pedido conserva su receta aunque la retiren, y la fila
  // tiene que seguir diciendo que se pidio.
  { id: RECETA_B, name: 'Formula retirada', isDeleted: true },
]
function fila(overrides: Partial<OrderRow> & { readonly id: string }): OrderRow {
  return {
    number: { year: 2026, sequence: 1 },
    recipeId: RECETA_A,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    createdBy: 'admin-0',
    updatedBy: 'admin-0',
    presentationId: null,
    presentationContent: null,
    unitId: null,
    ...overrides,
  }
}

function pagina(items: readonly OrderRow[], resto: Partial<Page<OrderRow>> = {}): Page<OrderRow> {
  return { items, total: items.length, page: 1, pageSize: 10, totalPages: 1, ...resto }
}

function dobles(opciones: {
  pagina?: Page<OrderRow>
  recetas?: readonly RecipeRef[]
  // QC-68: `null` = «el termino no es una busqueda», que es el comportamiento por defecto de
  // este doble cuando el caso no necesita otra cosa.
  idsQueCasan?: readonly string[] | null
  presentaciones?: readonly PresentationRef[]
  unidades?: readonly UnitRef[]
}) {
  // Los parametros van TIPADOS -y no `vi.fn(async () => ...)`- porque lo que este archivo
  // afirma es lo que se LE PASO a cada doble: sin ellos, TypeScript infiere una tupla vacia y
  // `mock.calls[0][0]` no existe. Ademas los catalogos FILTRAN por los ids pedidos, como hacen
  // los de verdad: un id que no existe simplemente no vuelve.
  // QC-57 (R25): `listAlive` recibe la consulta ya saneada. `OrderFilters` desaparecio: el
  // estado y la prioridad son filtros `select` DENTRO de esa consulta.
  // QC-68: `listAlive` gana un segundo parametro, `recipeIds`. Este doble solo LEE el primer
  // argumento -la consulta-; el segundo se afirma desde `mock.calls`, nunca desde aqui, para no
  // cambiar su aridad de cara a quien ya lo usa.
  const listAlive = vi.fn(async (query: ListQuery) => {
    void query
    return opciones.pagina ?? pagina([])
  })
  const findRefsIncludingDeleted = vi.fn(async (ids: readonly string[]) =>
    (opciones.recetas ?? REFS_RECETA).filter((ref) => ids.includes(ref.id)),
  )
  const findIdsMatchingName = vi.fn(
    async (search: string, companyId: string): Promise<readonly string[] | null> => {
      void search
      void companyId
      return opciones.idsQueCasan ?? null
    },
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

  // R22: una sola llamada al catalogo de presentaciones por pagina, con los ids DEDUPLICADOS.
  const findRefs = vi.fn(async (ids: readonly string[]) =>
    (opciones.presentaciones ?? []).filter((ref) => ids.includes(ref.id)),
  )

  // R42: una sola llamada al catalogo de unidades por pagina, con los ids DEDUPLICADOS.
  const findUnitRefs = vi.fn(async (ids: readonly string[]) =>
    (opciones.unidades ?? []).filter((ref) => ids.includes(ref.id)),
  )

  const log: ListQueryLog = { ignoredFields: vi.fn<ListQueryLog['ignoredFields']>() }

  return {
    orders,
    recipes: { findRefsIncludingDeleted, findIdsMatchingName } as unknown as RecipeCatalog,
    presentations: { findRefs } as unknown as PresentationCatalog,
    units: { findRefs: findUnitRefs } as unknown as UnitCatalog,
    log,
    listAlive,
    findRefsIncludingDeleted,
    findIdsMatchingName,
    findRefs,
    findUnitRefs,
  }
}

/** La consulta que llego al puerto en la ultima llamada. */
function consultaRecibida(recibidas: readonly (readonly [ListQuery])[]): ListQuery {
  const ultima = recibidas.at(-1)
  if (ultima === undefined) throw new Error('el puerto no fue llamado')
  return ultima[0]
}

/**
 * El segundo argumento (`recipeIds`) recibido por `listAlive` en su ultima llamada.
 *
 * El doble de `listAlive` declara un solo parametro tipado -`query: ListQuery`- a proposito
 * (no se le cambia la aridad), pero `vi.fn` registra en `mock.calls` TODOS los argumentos con
 * los que se le llamo en tiempo de ejecucion, aunque la firma declarada no los tipe. Por eso
 * este helper recibe el array como `unknown[][]` y lee el indice 1 sin tocar el doble.
 */
function recipeIdsRecibidos(recibidas: readonly (readonly unknown[])[]): readonly string[] | null {
  const ultima = recibidas.at(-1)
  if (ultima === undefined) throw new Error('el puerto no fue llamado')
  return ultima[1] as readonly string[] | null
}

async function codigoDelFallo(operacion: () => Promise<unknown>): Promise<string> {
  const error = await operacion().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operacion tenia que fallar').not.toBeNull()
  return (error as PedidosError).code
}

// [Q4] deroga QC-35bis en la unidad: la consulta al catalogo de unidades vuelve (ver «la
// unidad del pedido» mas abajo). Lo que R45 exige sigue afirmandose igual de fuerte: el numero
// de consultas NO depende del numero de filas.
describe('listOrders — dos consultas por pagina, tenga 1 fila o 25 (R45)', () => {
  it('una sola llamada al catalogo de recetas, con los ids DEDUPLICADOS (R45)', async () => {
    // Seis pedidos y dos recetas: si el caso de uso preguntara por fila, habria seis llamadas al
    // catalogo y este test caeria.
    const filas = [
      fila({ id: 'o-1', recipeId: RECETA_A }),
      fila({ id: 'o-2', recipeId: RECETA_A }),
      fila({ id: 'o-3', recipeId: RECETA_B }),
      fila({ id: 'o-4', recipeId: RECETA_A }),
      fila({ id: 'o-5', recipeId: RECETA_B }),
      fila({ id: 'o-6', recipeId: RECETA_A }),
    ]
    const d = dobles({ pagina: pagina(filas, { total: 6 }) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items).toHaveLength(6)
    expect(d.listAlive).toHaveBeenCalledTimes(1)
    expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    // Y los ids llegan sin repetir: dos entradas, no seis.
    expect(d.findRefsIncludingDeleted.mock.calls[0]?.[0]).toEqual([RECETA_A, RECETA_B])
  })

  it('el numero de consultas NO crece con el numero de filas (R45)', async () => {
    for (const cuantas of [1, 10, 25]) {
      const filas = Array.from({ length: cuantas }, (_, i) => fila({ id: `o-${i}` }))
      const d = dobles({ pagina: pagina(filas, { total: cuantas }) })

      await createListOrders(d)({ page: 1 }, ADMIN)

      expect([
        d.listAlive.mock.calls.length,
        d.findRefsIncludingDeleted.mock.calls.length,
      ]).toEqual([1, 1])
    }
  })

  it('usa la consulta que INCLUYE las dadas de baja, no una de solo vivas (R44)', async () => {
    // Nota fechada 2026-09-18: hasta QC-68 `pedidos` solo llamaba a un metodo de `RecipeCatalog`
    // y este caso lo comprobaba mirando las claves del doble. QC-68 anade `findIdsMatchingName`
    // -que este caso no ejercita porque no hay busqueda-, asi que la comprobacion se hace sobre
    // las LLAMADAS, no sobre la forma del doble: sigue siendo `findRefsIncludingDeleted`, nunca
    // un `findRefs` de solo vivas, y `findIdsMatchingName` no se llama sin termino de busqueda.
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]) })

    await createListOrders(d)({ page: 1 }, ADMIN)

    expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    expect(d.findIdsMatchingName).not.toHaveBeenCalled()
  })
})

describe('listOrders — lo que devuelve cada fila (R43, R44, R46, R29)', () => {
  it('resuelve el nombre de la receta por el contrato publico (R43)', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1', recipeId: RECETA_A })]) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.recipeName).toBe('Acido citrico 50%')
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
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]), recetas: [] })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items).toHaveLength(1)
    expect(salida.items[0]?.recipeName).toBeNull()
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

  it('entrega la consulta ya saneada al puerto, sin calcular ningun offset (R37, R13)', async () => {
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)({ page: 2, pageSize: 25 }, ADMIN)

    // QC-57: UN solo argumento, y es el contrato ya saneado. Sin orden, sin filtros y sin
    // busqueda -que es exactamente la lista de siempre (R11)-.
    const query = consultaRecibida(d.listAlive.mock.calls)
    expect(query).toEqual({ page: 2, pageSize: 25, sort: null, filters: {}, search: '' })
    expect(Object.keys(query)).not.toContain('offset')
    expect(Object.keys(query)).not.toContain('limit')
  })

  it('estado y prioridad son filtros `select`, opcionales y COMBINABLES (R38, QC-57 R25)', async () => {
    // QC-57 R25: dejan de ser parametros propios y entran como filtros del contrato. Siguen
    // siendo opcionales y combinables, que es lo que QC-34 R38 exigia.
    const soloEstado = dobles({ pagina: pagina([]) })
    await createListOrders(soloEstado)(
      { page: 1, filters: { status: { kind: 'select', values: ['EN_CURSO'] } } },
      ADMIN,
    )
    expect(consultaRecibida(soloEstado.listAlive.mock.calls).filters).toEqual({
      status: { kind: 'select', values: ['EN_CURSO'] },
    })

    const soloPrioridad = dobles({ pagina: pagina([]) })
    await createListOrders(soloPrioridad)(
      { page: 1, filters: { priority: { kind: 'select', values: ['CRITICA'] } } },
      ADMIN,
    )
    expect(consultaRecibida(soloPrioridad.listAlive.mock.calls).filters).toEqual({
      priority: { kind: 'select', values: ['CRITICA'] },
    })

    // Y los DOS a la vez, con `CANCELADO`: un pedido cancelado SI se consulta (R25, R40).
    const ambos = dobles({ pagina: pagina([]) })
    await createListOrders(ambos)(
      {
        page: 1,
        filters: {
          status: { kind: 'select', values: ['CANCELADO'] },
          priority: { kind: 'select', values: ['ALTA'] },
        },
      },
      ADMIN,
    )
    expect(consultaRecibida(ambos.listAlive.mock.calls).filters).toEqual({
      status: { kind: 'select', values: ['CANCELADO'] },
      priority: { kind: 'select', values: ['ALTA'] },
    })
  })

  // Nota fechada 2026-09-18: hasta QC-68 este caso afirmaba que la busqueda se OMITIA y se
  // anotaba (R17, R39): `orders` no tenia columna `name` y `searchable` era `false`. Desde
  // QC-68 `orders` SI busca -no por su propia columna, que sigue sin existir, sino resolviendo
  // el termino a ids de receta con el catalogo de `recetas` antes de llamar al repositorio-, asi
  // que la afirmacion cambia: el termino LLEGA al catalogo y los ids que este devuelve LLEGAN al
  // repositorio, y el log DEJA de anotar `search`.
  it('el termino de busqueda llega al catalogo de recetas y sus ids llegan al repositorio (R1, R7)', async () => {
    const idsQueCasan = [RECETA_A]
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]), idsQueCasan })

    const salida = await createListOrders(d)({ page: 1, search: 'acido citrico' }, ADMIN)

    expect(d.findIdsMatchingName).toHaveBeenCalledWith('acido citrico', ADMIN.companyId)
    expect(recipeIdsRecibidos(d.listAlive.mock.calls)).toEqual(idsQueCasan)
    expect(salida.items).toHaveLength(1)
    // El log ya NO anota `search`: sobrevive a la poda, no se omite.
    expect(d.log.ignoredFields).toHaveBeenCalledWith('orders', [])
  })

  it('con `null` del catalogo (el termino no es una busqueda) la lista vuelve entera y `listAlive` recibe `null` (R9)', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]), idsQueCasan: null })

    const salida = await createListOrders(d)({ page: 1, search: '???' }, ADMIN)

    expect(recipeIdsRecibidos(d.listAlive.mock.calls)).toBeNull()
    expect(salida.items).toHaveLength(1)
  })

  it('con `[]` del catalogo (ninguna receta casa) el repositorio se llama igual y devuelve pagina vacia (R10)', async () => {
    const d = dobles({ pagina: pagina([]), idsQueCasan: [] })

    const salida = await createListOrders(d)({ page: 1, search: 'no existe ninguna' }, ADMIN)

    expect(d.listAlive).toHaveBeenCalledTimes(1)
    expect(recipeIdsRecibidos(d.listAlive.mock.calls)).toEqual([])
    expect(salida.items).toEqual([])
  })

  it('no hay filtro por el numero correlativo: se OMITE y se anota (R39)', async () => {
    // Caso hermano conservado: sin el, esta mitad del contrato generico dejaria de estar
    // probada en pedidos. `orderNumber` no esta declarado filtrable y sigue omitiendose.
    const porNumero = dobles({ pagina: pagina([]) })
    await createListOrders(porNumero)(
      { page: 1, filters: { orderNumber: { kind: 'text', value: '2026-0000001' } } },
      ADMIN,
    )
    expect(consultaRecibida(porNumero.listAlive.mock.calls).filters).toEqual({})
    expect(porNumero.log.ignoredFields).toHaveBeenCalledWith('orders', ['orderNumber'])
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

  it('un estado o una prioridad fuera del conjunto cerrado se OMITEN y se anotan (R19, R25, R5)', async () => {
    // CAMBIO DELIBERADO DE CONTRATO (QC-57 R25, anotado en `progress/impl_QC-57-*.md`): hasta
    // QC-34 un valor de fuera hacia FALLAR la consulta con `invalid_input`, porque
    // `listOrdersSchema` lo declaraba con `z.enum`. Con el contrato generico, un valor que no
    // existe se trata como un campo no declarado: **se omite, se anota y la consulta NO falla**
    // (R5). El conjunto sigue siendo CERRADO -lo poda `list-orders.ts` contra
    // `ORDER_STATUS_VALUES`/`ORDER_PRIORITY_VALUES`-, y ningun valor inventado llega a la base.
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)(
      { page: 1, filters: { status: { kind: 'select', values: ['ARCHIVADO'] } } },
      ADMIN,
    )
    expect(consultaRecibida(d.listAlive.mock.calls).filters).toEqual({})
    expect(d.log.ignoredFields).toHaveBeenCalledWith('orders', ['status'])

    const otro = dobles({ pagina: pagina([]) })
    await createListOrders(otro)(
      { page: 1, filters: { priority: { kind: 'select', values: ['URGENTISIMA'] } } },
      ADMIN,
    )
    expect(consultaRecibida(otro.listAlive.mock.calls).filters).toEqual({})
    expect(otro.log.ignoredFields).toHaveBeenCalledWith('orders', ['priority'])

    // Lo VALIDO de una lista mixta se conserva: se poda el valor, no la consulta entera.
    const mixto = dobles({ pagina: pagina([]) })
    await createListOrders(mixto)(
      { page: 1, filters: { status: { kind: 'select', values: ['EN_CURSO', 'ARCHIVADO'] } } },
      ADMIN,
    )
    expect(consultaRecibida(mixto.listAlive.mock.calls).filters).toEqual({
      status: { kind: 'select', values: ['EN_CURSO'] },
    })
    expect(mixto.log.ignoredFields).toHaveBeenCalledWith('orders', ['status'])
  })
})

describe('listOrders — autorizacion antes que todo (QC-57 R33, R34)', () => {
  // R34 exige probarlo DOS veces: con una consulta valida y con una que traiga campos no
  // declarados. Si el permiso se comprobara despues de sanear, el segundo caso fallaria por
  // otro motivo y nadie lo notaria.
  const CONSULTAS: ReadonlyArray<{ readonly nombre: string; readonly entrada: unknown }> = [
    { nombre: 'consulta valida', entrada: { page: 1, pageSize: 10 } },
    {
      nombre: 'consulta con campos no declarados',
      entrada: {
        sort: { columnId: 'deletedAt', direction: 'asc' },
        filters: { inventado: { kind: 'text', value: 'x' } },
      },
    },
  ]

  for (const caso of CONSULTAS) {
    for (const [etiqueta, actor] of [
      ['al Operador', OPERADOR],
      ['al actor ausente', null],
    ] as const) {
      it(`rechaza ${etiqueta} con ${caso.nombre} sin tocar el repositorio`, async () => {
        // R34 — se afirma CONTANDO invocaciones de los dobles, no solo mirando que lanza.
        const d = dobles({ pagina: pagina([]) })

        await expect(createListOrders(d)(caso.entrada, actor)).rejects.toBeInstanceOf(
          UnauthorizedError,
        )
        expect(d.listAlive).toHaveBeenCalledTimes(0)
        expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(0)
        expect(d.log.ignoredFields).toHaveBeenCalledTimes(0)
      })
    }
  }
})

describe('listOrders — el campo no declarado se omite, no rompe y se anota (QC-57 R5, R6, R7, R11)', () => {
  it('ordenar por deletedAt: no falla, aplica el orden por defecto Y el log recibe el campo', async () => {
    // R5 + R7 + R11 + R6, LAS TRES COSAS A LA VEZ (`design.md > 12`). `deletedAt` no es
    // consultable en ninguna lista (R7) y `sanitizeListQuery` lo poda ademas por su cuenta.
    const d = dobles({ pagina: pagina([]) })

    const salida = await createListOrders(d)(
      { page: 1, sort: { columnId: 'deletedAt', direction: 'desc' } },
      ADMIN,
    )

    // (a) la consulta NO falla
    expect(salida.items).toEqual([])
    // (b) el orden aplicado es el de por defecto: `sort: null` -quien lo traduce a
    //     `priority DESC, created_at ASC, order_year ASC, order_sequence ASC` es el adaptador-
    expect(d.listAlive).toHaveBeenCalledTimes(1)
    expect(consultaRecibida(d.listAlive.mock.calls).sort).toBeNull()
    // (c) el log recibio el campo, con el nombre del listado
    expect(d.log.ignoredFields).toHaveBeenCalledWith('orders', ['deletedAt'])
  })

  it('un filtro con la forma equivocada se omite y se anota, sin fallar (R8)', async () => {
    // R8 — `status` es `select`; pedirlo como rango numerico no puede romper la consulta.
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)(
      { filters: { status: { kind: 'numberRange', min: 1, max: 2 } } },
      ADMIN,
    )

    expect(consultaRecibida(d.listAlive.mock.calls).filters).toEqual({})
    expect(d.log.ignoredFields).toHaveBeenCalledWith('orders', ['status'])
  })

  it('el log recibe NOMBRES de campo y nunca el valor del filtro (R6, PII)', async () => {
    // R6 + anti-patron de PII: lo que se registra no puede contener lo que la persona escribio.
    const TERMINO = 'pedido del cliente Perez'
    const VALOR_DE_FILTRO = 'cliente-secreto'
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)(
      {
        search: TERMINO,
        sort: { columnId: 'inventado', direction: 'asc' },
        filters: { tambienInventado: { kind: 'select', values: [VALOR_DE_FILTRO] } },
      },
      ADMIN,
    )

    expect(d.log.ignoredFields).toHaveBeenCalledTimes(1)
    const argumentos = JSON.stringify(vi.mocked(d.log.ignoredFields).mock.calls[0])
    expect(argumentos).toContain('inventado')
    expect(argumentos).toContain('tambienInventado')
    expect(argumentos).not.toContain(TERMINO)
    expect(argumentos).not.toContain(VALOR_DE_FILTRO)
  })

  it('un orden por un campo declarado llega intacto al puerto (R10, R30)', async () => {
    // R10 — `orderNumber` es el par ano+correlativo presentado como UN campo; quien lo traduce
    // a dos criterios es el adaptador. Aqui solo se comprueba que el dominio no lo estropea.
    const d = dobles({ pagina: pagina([]) })

    await createListOrders(d)({ sort: { columnId: 'orderNumber', direction: 'desc' } }, ADMIN)

    expect(consultaRecibida(d.listAlive.mock.calls).sort).toEqual({
      columnId: 'orderNumber',
      direction: 'desc',
    })
    expect(d.log.ignoredFields).toHaveBeenCalledWith('orders', [])
  })
})

// T9 (QC-68) — el numero de INVOCACIONES DE PUERTO por pagina (R8, R9).
//
// Esto cuenta llamadas a los dobles, NO consultas SQL. `design.md > 3` cuenta 3 consultas SQL
// sin busqueda y 4 con ella -el `findMany` y el `count` de `listAlive` viven dentro de UNA sola
// invocacion de puerto, y un doble no puede verlos por separado-. Lo que este bloque demuestra
// es que el numero de invocaciones de puerto es 2 sin busqueda (`orders.listAlive` +
// `recipes.findRefsIncludingDeleted`) y 3 con busqueda (mas `recipes.findIdsMatchingName`), y
// que ninguno de los dos crece con el numero de filas. Nota fechada 2026-09-17 en
// `design.md > 3` y correccion fechada en `tasks.md > T9`: las dos cifras son ciertas y miden
// cosas distintas. El numero de consultas SQL no esta probado por ningun test de este repo.
describe('listOrders — invocaciones de puerto por pagina, con y sin busqueda (R8, R9)', () => {
  it('sin busqueda: DOS invocaciones de puerto, tenga la pagina 1 fila o 25 (R8)', async () => {
    for (const cuantas of [1, 25]) {
      const filas = Array.from({ length: cuantas }, (_, i) => fila({ id: `o-${i}` }))
      const d = dobles({ pagina: pagina(filas, { total: cuantas }) })

      await createListOrders(d)({ page: 1 }, ADMIN)

      expect(d.listAlive).toHaveBeenCalledTimes(1)
      expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
      expect(d.findIdsMatchingName).not.toHaveBeenCalled()
    }
  })

  it('con busqueda: TRES invocaciones de puerto, tenga la pagina 1 fila o 25 (R8)', async () => {
    for (const cuantas of [1, 25]) {
      const filas = Array.from({ length: cuantas }, (_, i) => fila({ id: `o-${i}` }))
      const d = dobles({
        pagina: pagina(filas, { total: cuantas }),
        idsQueCasan: [RECETA_A, RECETA_B],
      })

      await createListOrders(d)({ page: 1, search: 'acido' }, ADMIN)

      expect(d.findIdsMatchingName).toHaveBeenCalledTimes(1)
      expect(d.listAlive).toHaveBeenCalledTimes(1)
      expect(d.findRefsIncludingDeleted).toHaveBeenCalledTimes(1)
    }
  })

  it('con `search` vacio, el catalogo de busqueda NO se llama', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]) })

    await createListOrders(d)({ page: 1, search: '' }, ADMIN)

    expect(d.findIdsMatchingName).not.toHaveBeenCalled()
    expect(recipeIdsRecibidos(d.listAlive.mock.calls)).toBeNull()
  })

  it('con `null` del catalogo, `listAlive` recibe `null` (R9)', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' })]), idsQueCasan: null })

    await createListOrders(d)({ page: 1, search: '???' }, ADMIN)

    expect(d.findIdsMatchingName).toHaveBeenCalledTimes(1)
    expect(recipeIdsRecibidos(d.listAlive.mock.calls)).toBeNull()
  })
})

// QC-123 T7 — las LECTURAS no recalculan el coste (R12): el TIPO de las dependencias no deja
// pedir `products`. [Q4] deroga esa misma nota para `units`: `ListOrdersDeps`/`GetOrderDeps`
// SI ganan `units` -no para costear, solo para la etiqueta de `unitId` (R42)-, asi que la
// afirmacion de TIPO se queda solo con `products` y la de COMPORTAMIENTO se divide en dos: el
// listado no lee `products` en ningun caso, y SI lee `units` una vez por pagina.
describe('listOrders (y getOrder) — las lecturas no recalculan el coste (R12)', () => {
  it('el listado no recibe catalogo de productos (R12)', async () => {
    const listadoSinProductos: 'products' extends keyof ListOrdersDeps ? false : true = true
    const fichaSinProductos: 'products' extends keyof GetOrderDeps ? false : true = true
    expect([listadoSinProductos, fichaSinProductos]).toEqual([true, true])

    const d = dobles({
      pagina: pagina([fila({ id: 'o-1', ingredientsCost: '150.0000' })]),
    })
    // El doble real no tiene `products`; el Proxy ademas hace explicito que LEERLO -aunque
    // alguien lo colara con un cast- tira el caso de uso abajo.
    const vigilado = new Proxy(d, {
      get(target, prop, receiver) {
        if (prop === 'products') {
          throw new Error(`listOrders no deberia leer '${String(prop)}': las lecturas no recalculan (R12)`)
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as typeof d

    const salida = await createListOrders(vigilado)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.ingredientsCost).toBe('150.0000')
  })
})

// QC-123 T9 — el importe no es ordenable ni filtrable (R17): `ORDER_QUERYABLE` no lo declara, y
// pedirlo como `sort` o como filtro se PODA y se ANOTA sin que la consulta falle -mismo
// mecanismo que `list-orders.ts:136-138` ya prueban los casos vecinos de `deletedAt` y de un
// filtro con forma equivocada, aqui aplicado a `ingredientsCost`.
describe('listOrders — el importe no es consultable (R17)', () => {
  it('el importe no esta en la lista blanca y pedirlo como orden o filtro se poda y se anota (R17)', async () => {
    expect(ORDER_QUERYABLE.sortable).not.toContain('ingredientsCost')
    expect(Object.keys(ORDER_QUERYABLE.filterable)).not.toContain('ingredientsCost')

    const porOrden = dobles({ pagina: pagina([]) })
    const salidaOrden = await createListOrders(porOrden)(
      { page: 1, sort: { columnId: 'ingredientsCost', direction: 'desc' } },
      ADMIN,
    )
    // (a) la consulta NO falla
    expect(salidaOrden.items).toEqual([])
    // (b) el orden pedido se poda: el puerto recibe `sort: null`
    expect(porOrden.listAlive).toHaveBeenCalledTimes(1)
    expect(consultaRecibida(porOrden.listAlive.mock.calls).sort).toBeNull()
    // (c) y se anota en el log de campos omitidos
    expect(porOrden.log.ignoredFields).toHaveBeenCalledWith('orders', ['ingredientsCost'])

    const porFiltro = dobles({ pagina: pagina([]) })
    await createListOrders(porFiltro)(
      { page: 1, filters: { ingredientsCost: { kind: 'numberRange', min: 100, max: 200 } } },
      ADMIN,
    )
    expect(consultaRecibida(porFiltro.listAlive.mock.calls).filters).toEqual({})
    expect(porFiltro.log.ignoredFields).toHaveBeenCalledWith('orders', ['ingredientsCost'])
  })
})

describe('listOrders — la presentacion del pedido (R21, R22)', () => {
  const PRESENTACION_A = '77777777-7777-4777-8777-777777777777'

  it('R22: una sola llamada al catalogo de presentaciones por pagina, con alguna presentacion en la pagina', async () => {
    const filas = [
      fila({ id: 'o-1', presentationId: PRESENTACION_A }),
      fila({ id: 'o-2', presentationId: PRESENTACION_A }),
      fila({ id: 'o-3', presentationId: null }),
    ]
    const d = dobles({
      pagina: pagina(filas, { total: 3 }),
      presentaciones: [{ id: PRESENTACION_A, name: 'Bidon 20L', content: null, unitId: 'unidad-1' }],
    })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(d.findRefs).toHaveBeenCalledTimes(1)
    expect(d.findRefs.mock.calls[0]?.[0]).toEqual([PRESENTACION_A])
    expect(salida.items[0]?.presentationName).toBe('Bidon 20L')
    expect(salida.items[1]?.presentationName).toBe('Bidon 20L')
    expect(salida.items[2]?.presentationName).toBeNull()
  })

  it('R22: ninguna llamada al catalogo de presentaciones si ningun pedido de la pagina tiene presentacion', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' }), fila({ id: 'o-2' })], { total: 2 }) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(d.findRefs).not.toHaveBeenCalled()
    expect(salida.items.every((item) => item.presentationName === null)).toBe(true)
  })

  it('R21: ordenar o filtrar por presentacion se OMITE y se anota, como cualquier campo no declarado', async () => {
    expect(Object.keys(ORDER_QUERYABLE.filterable)).not.toContain('presentationName')
    expect(Object.keys(ORDER_QUERYABLE.filterable)).not.toContain('presentationId')
    expect(ORDER_QUERYABLE.sortable).not.toContain('presentationName')

    const porOrden = dobles({ pagina: pagina([]) })
    await createListOrders(porOrden)(
      { page: 1, sort: { columnId: 'presentationName', direction: 'desc' } },
      ADMIN,
    )
    expect(consultaRecibida(porOrden.listAlive.mock.calls).sort).toBeNull()
    expect(porOrden.log.ignoredFields).toHaveBeenCalledWith('orders', ['presentationName'])

    const porFiltro = dobles({ pagina: pagina([]) })
    await createListOrders(porFiltro)(
      { page: 1, filters: { presentationId: { kind: 'select', values: ['x'] } } },
      ADMIN,
    )
    expect(consultaRecibida(porFiltro.listAlive.mock.calls).filters).toEqual({})
    expect(porFiltro.log.ignoredFields).toHaveBeenCalledWith('orders', ['presentationId'])
  })
})

describe("listOrders — la unidad del pedido (R42, [Q4] deroga QC-35bis)", () => {
  const UNIDAD_A = '88888888-8888-4888-8888-888888888888'

  it('R42: una sola llamada al catalogo de unidades por pagina, con los ids DEDUPLICADOS', async () => {
    const filas = [
      fila({ id: 'o-1', unitId: UNIDAD_A }),
      fila({ id: 'o-2', unitId: UNIDAD_A }),
      fila({ id: 'o-3', unitId: null }),
    ]
    const d = dobles({
      pagina: pagina(filas, { total: 3 }),
      unidades: [{ id: UNIDAD_A, name: 'Litro', symbol: 'L', baseUnitId: null, factor: null }],
    })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(d.findUnitRefs).toHaveBeenCalledTimes(1)
    expect(d.findUnitRefs.mock.calls[0]?.[0]).toEqual([UNIDAD_A])
    expect(salida.items[0]?.unitLabel).toBe('L')
    expect(salida.items[1]?.unitLabel).toBe('L')
    expect(salida.items[2]?.unitLabel).toBeNull()
  })

  it('R42: ninguna llamada al catalogo de unidades si ningun pedido de la pagina tiene unidad', async () => {
    const d = dobles({ pagina: pagina([fila({ id: 'o-1' }), fila({ id: 'o-2' })], { total: 2 }) })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(d.findUnitRefs).not.toHaveBeenCalled()
    expect(salida.items.every((item) => item.unitLabel === null)).toBe(true)
  })

  it('sin simbolo, la etiqueta cae al nombre de la unidad', async () => {
    const d = dobles({
      pagina: pagina([fila({ id: 'o-1', unitId: UNIDAD_A })], { total: 1 }),
      unidades: [{ id: UNIDAD_A, name: 'Litro', symbol: null, baseUnitId: null, factor: null }],
    })

    const salida = await createListOrders(d)({ page: 1 }, ADMIN)

    expect(salida.items[0]?.unitLabel).toBe('Litro')
  })
})
