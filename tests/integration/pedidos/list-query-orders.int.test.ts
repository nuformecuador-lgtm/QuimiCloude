/**
 * QC-57 T20 — El listado de PEDIDOS con el contrato generico, contra Postgres REAL.
 *
 * POR QUE ESTE ARCHIVO EXISTE Y NO BASTA UN UNITARIO: un doble del puerto puede afirmar que la
 * consulta saneada llego al repositorio, pero NO que el motor filtro y ordeno el conjunto
 * completo ANTES de paginar (R13) —la diferencia entre filtrar en la base y filtrar la pagina ya
 * traida, que es lo que QC-22 y QC-26 rechazaron por enganoso—. Y hay DOS cosas mas que solo
 * Postgres puede demostrar, y son propias de este listado:
 *
 *   - **`priority` ordena por el ORDEN DE DECLARACION DEL ENUM**, que es el de la prioridad
 *     (`BAJA < MEDIA < ALTA < CRITICA`), y **no** por el alfabetico —donde `ALTA` iria antes que
 *     `MEDIA`—. Es un enum de Postgres: quien decide ese orden es la base.
 *   - **`orderNumber` es la unica traduccion uno-a-dos del contrato**: un solo campo ordenable
 *     que el adaptador convierte en el par `(order_year, order_sequence)`. Un orden alfabetico
 *     sobre el texto compuesto no daria lo mismo.
 *
 * AISLAMIENTO: cada escenario usa su propio ANO de correlativo -como `order-repository.int` y
 * `order-sequence.int`- y sus propias secuencias se borran al final. Las consultas se acotan por
 * un filtro de fecha o por los ids sembrados; ninguna afirma nada global sobre la tabla.
 *
 * QC-68 (2026-09-17): sumo su propio bloque de casos, con sus propias recetas efimeras, que
 * ejercitan la busqueda real contra Postgres (`findRecipeIdsMatchingName` + `listAliveOrders`
 * con el tercer argumento).
 *
 * Cubre R7, R10, R11, R13, R14, R15, R17, R25 y R29.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeCompanyName } from '@/lib/modules/identity'
import { findRecipeIdsMatchingName } from '@/lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma'
import { normalizeRecipeName } from '@/lib/modules/recetas'
import {
  createOrder,
  listAliveOrders,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { prisma } from '@/lib/shared/db/prisma'
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination'

import type { ListQuery, NewOrder, OrderRow, OrderScope, Page } from '@/lib/modules/pedidos'

/** Un ano por archivo, distinto de los 288x de `order-repository.int.test.ts` y de los 287x de
 *  `order-sequence.int.test.ts`, para que ninguno pueda pisarle la secuencia a otro. */
const YEAR = 2891

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

let recipeId: string
let unitId: string
let actorId: string
let roleId: string
let documentTypeCode: string
let companyId: string

const creados: string[] = []

/** QC-60 (R18): el adaptador exige el AMBITO en la firma. Es la empresa efimera del propio
 *  fixture, asi que el archivo sigue viendo exactamente los pedidos que siembra. Se lee como
 *  funcion y no como constante porque `companyId` no existe hasta el `beforeAll`. */
function scope(): OrderScope {
  return { companyId }
}

function instantIn(day: number, ms = 0): Date {
  return new Date(Date.UTC(YEAR, 0, day, 12, 0, 0, ms))
}

function baseOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    ...overrides,
  }
}

/** Alta por el adaptador REAL. Registra el id para que el `afterAll` la borre. */
async function alta(now: Date, overrides: Partial<NewOrder> = {}): Promise<OrderRow> {
  const resultado = await createOrder(baseOrder(overrides), YEAR, actorId, now, scope())
  expect(resultado).not.toBe('duplicate_number')
  const fila = resultado as OrderRow
  creados.push(fila.id)
  return fila
}

/**
 * Acota TODA consulta de este archivo a las filas sembradas aqui: el `dateRange` sobre
 * `createdAt` es un filtro DECLARADO del contrato (`ORDER_QUERYABLE`), y todas las altas caen en
 * enero del ano de prueba. Acotar y ejercitar el contrato son lo mismo.
 */
function consulta(partial: Partial<ListQuery> = {}): ListQuery {
  return {
    page: 1,
    sort: null,
    filters: {
      createdAt: {
        kind: 'dateRange',
        from: `${String(YEAR)}-01-01`,
        to: `${String(YEAR)}-01-31`,
      },
    },
    search: '',
    ...partial,
  }
}

/** Los mismos filtros de acotado, mas los que pida el caso (R15: todos a la vez). */
function conFiltros(extra: ListQuery['filters']): ListQuery['filters'] {
  return { ...consulta().filters, ...extra }
}

beforeAll(async () => {
  const marca = token()
  unitId = (
    await prisma.unit.create({
      // ACTUALIZADO EL 2026-09-08 POR QC-76 (R15, decision cerrada 28): el simbolo pasa a ser
      // UNICO dentro del ambito cuando existe. Esta unidad se siembra SIN empresa —o sea DE
      // SISTEMA—, asi que un `'kg'` fijo choca con `23505` contra el `kilogramo` del catalogo
      // arrancador y contra el de cualquier otro fixture. Se deriva del marcador irrepetible,
      // que es lo que este archivo ya hacia con el nombre. Ningun aserto lee su valor.
      data: { name: `Unidad ${marca}`, nameNormalized: `unidad${marca}`, symbol: `kg${marca}` },
      select: { id: true },
    })
  ).id
  documentTypeCode = (
    await prisma.documentType.create({
      data: { code: `DOC${marca.slice(0, 8)}`, name: 'Tipo de documento de prueba' },
      select: { code: true },
    })
  ).code
  roleId = (
    await prisma.role.create({
      data: { name: `rol-${marca}`, description: 'Rol de prueba' },
      select: { id: true },
    })
  ).id
  // Empresa efimera propia de este fixture: QC-47 R9 hizo `users.company_id` obligatoria, asi
  // que ningun usuario se puede crear ya sin una. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName` -la UNICA definicion de «mismo
  // nombre de empresa» (R3), importada del contrato publico de `identity`-.
  companyId = (
    await prisma.company.create({
      data: {
        name: `Empresa ${marca}`,
        nameNormalized: normalizeCompanyName(`Empresa ${marca}`),
      },
      select: { id: true },
    })
  ).id
  // La receta es de la MISMA empresa que el resto del andamiaje de este archivo: QC-50 hizo
  // `recipes.company_id` obligatoria.
  recipeId = (
    await prisma.recipe.create({
      data: { name: `Receta ${marca}`, nameNormalized: `receta${marca}`, companyId },
      select: { id: true },
    })
  ).id
  actorId = (
    await prisma.user.create({
      data: {
        firstNames: 'Ana Maria',
        lastNames: 'Perez Gomez',
        birthDate: new Date('1990-05-17T00:00:00.000Z'),
        email: `ana.${marca}@quimicloude.test`,
        phone: '+57 300 111 2233',
        documentTypeCode,
        documentNumber: marca.slice(0, 12),
        username: `ana.${marca}`,
        passwordHash: 'hash-de-prueba-no-es-un-algoritmo-real',
        roleId,
        companyId,
      },
      select: { id: true },
    })
  ).id
})

afterAll(async () => {
  if (creados.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: creados } } })
  }
  await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "orders_sequence_${String(YEAR)}"`)
  await prisma.user.delete({ where: { id: actorId } })
  await prisma.role.delete({ where: { id: roleId } })
  await prisma.documentType.delete({ where: { code: documentTypeCode } })
  // La receta ANTES que la empresa: QC-50 hizo `recipes.company_id` una FK RESTRICT.
  await prisma.recipe.delete({ where: { id: recipeId } })
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.unit.delete({ where: { id: unitId } })
  await prisma.$disconnect()
})

describe('el orden y el filtro se aplican sobre el CONJUNTO COMPLETO y antes de paginar (R13, R14)', () => {
  /** Doce pedidos, todos de la MISMA prioridad para que el orden por defecto los ordene por
   *  `created_at` y el correlativo: mas filas que una pagina de cinco. */
  let sembrados: readonly OrderRow[] = []

  beforeAll(async () => {
    const filas: OrderRow[] = []
    for (let i = 0; i < 12; i += 1) {
      filas.push(await alta(instantIn(1, i), { quantity: `${String(i + 1)}.0000` }))
    }
    sembrados = filas
  })

  it('la fila que en el orden de hoy esta en la pagina 3 aparece en la 1 al ordenar al reves', async () => {
    // R13 — el aserto que distingue filtrar en la BASE de filtrar la pagina ya traida.
    const ultimo = sembrados[sembrados.length - 1]?.id

    // Orden de HOY: `priority DESC, created_at ASC, ...`. Todas comparten prioridad, asi que el
    // ultimo sembrado -el `created_at` mas alto- cae en la pagina 3 con paginas de cinco.
    const pagina3 = await listAliveOrders(consulta({ page: 3, pageSize: 5 }), scope())
    expect(pagina3.items.map((o) => o.id)).toContain(ultimo)
    const pagina1 = await listAliveOrders(consulta({ page: 1, pageSize: 5 }), scope())
    expect(pagina1.items.map((o) => o.id)).not.toContain(ultimo)

    // Pidiendo el orden inverso por el correlativo, la MISMA fila sale en la pagina 1.
    const desc = await listAliveOrders(
      consulta({ page: 1, pageSize: 5, sort: { columnId: 'orderNumber', direction: 'desc' } }),
      scope(),
    )
    expect(desc.items[0]?.id).toBe(ultimo)
  })

  it('un filtro que deja fuera casi todo trae la fila en la pagina 1 y el total describe lo filtrado (R14)', async () => {
    // R13 + R14 — `total` y `totalPages` describen el conjunto YA FILTRADO, no la tabla entera.
    const pagina = await listAliveOrders(
      consulta({
        page: 1,
        pageSize: 5,
        filters: conFiltros({ quantity: { kind: 'numberRange', min: 12, max: 12 } }),
      }),
      scope(),
    )

    expect(pagina.items.map((o) => o.id)).toEqual([sembrados[sembrados.length - 1]?.id])
    expect(pagina.total).toBe(1)
    expect(pagina.totalPages).toBe(1)
  })

  it('pedir 100 por pagina se ACOTA a 25, no se rechaza (R29)', async () => {
    // R29 — acotar, no rechazar. El `pageSize` que sale es el efectivo, nunca el pedido.
    const pagina = await listAliveOrders(consulta({ page: 1, pageSize: 100 }), scope())

    expect(pagina.pageSize).toBe(MAX_PAGE_SIZE)
    expect(pagina.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE)
  })
})

/**
 * QC-68 (2026-09-17): este caso decia «la busqueda NO recorta nada: `orders` no busca», porque
 * `orders` no tenia columna de nombre y el adaptador no tenia capa de busqueda. Esa afirmacion
 * deja de ser cierta: `list-orders.ts` ahora resuelve los ids de receta que casan con el termino
 * por `findRecipeIdsMatchingName` (contrato de `recetas`) y se los pasa a `listAliveOrders` como
 * tercer argumento, que los acota con `recipeId: { in: [...] }`. El caso se tensa para demostrar
 * la busqueda real contra Postgres, con sus propias recetas efimeras -tres nombres distintos, una
 * dada de baja- para no interferir con el resto del archivo.
 */
describe('la busqueda por nombre de receta (R1, R2, R3, R4, R5, R10, R15)', () => {
  const DIA = 21

  let recipeAlfaId: string
  let recipeBetaId: string
  let recipeBajaId: string
  let ordenAlfa: OrderRow
  let ordenBeta: OrderRow
  let ordenBaja: OrderRow
  const recetasComunes: string[] = []
  const ordenesComunes: OrderRow[] = []

  const soloElDia21: ListQuery['filters'] = {
    createdAt: {
      kind: 'dateRange',
      from: `${String(YEAR)}-01-${String(DIA)}`,
      to: `${String(YEAR)}-01-${String(DIA)}`,
    },
  }

  async function buscar(search: string, pageSize = 25): Promise<Page<OrderRow>> {
    const recipeIds = await findRecipeIdsMatchingName(search, companyId)
    return listAliveOrders(
      consulta({ pageSize, search, filters: soloElDia21 }),
      scope(),
      recipeIds,
    )
  }

  beforeAll(async () => {
    const marca = token()

    async function recetaEfimera(nombre: string, overrides: { deletedAt?: Date } = {}) {
      return (
        await prisma.recipe.create({
          data: {
            name: nombre,
            nameNormalized: normalizeRecipeName(nombre),
            companyId,
            ...overrides,
          },
          select: { id: true },
        })
      ).id
    }

    recipeAlfaId = await recetaEfimera(`Acido Citrico ${marca}`)
    recipeBetaId = await recetaEfimera(`Bicarbonato ${marca}`)
    recipeBajaId = await recetaEfimera(`Cloro de baja ${marca}`, { deletedAt: instantIn(DIA) })

    ordenAlfa = await alta(instantIn(DIA, 1), { recipeId: recipeAlfaId })
    ordenBeta = await alta(instantIn(DIA, 2), { recipeId: recipeBetaId })
    ordenBaja = await alta(instantIn(DIA, 3), { recipeId: recipeBajaId })

    // R5 — un termino que casa con MAS recetas que `pageSize`, para distinguir el total del
    // conjunto buscado del tamano de la pagina.
    for (let i = 0; i < 3; i += 1) {
      const id = await recetaEfimera(`Comun Compartido ${i} ${marca}`)
      recetasComunes.push(id)
      ordenesComunes.push(await alta(instantIn(DIA, 10 + i), { recipeId: id }))
    }
  })

  afterAll(async () => {
    const recetas = [recipeAlfaId, recipeBetaId, recipeBajaId, ...recetasComunes]
    // Los pedidos de estas recetas ANTES que las recetas: `recipes.company_id`/`orders.recipe_id`
    // son FK RESTRICT y el `afterAll` del archivo, que borra `creados`, corre DESPUES de este.
    await prisma.order.deleteMany({ where: { recipeId: { in: recetas } } })
    for (const id of recetas) {
      await prisma.recipe.delete({ where: { id } })
    }
  })

  it('R1: el termino devuelve solo los pedidos de la receta que casa, y ninguno mas', async () => {
    const pagina = await buscar('Bicarbonato')

    expect(pagina.items.map((o) => o.id)).toEqual([ordenBeta.id])
  })

  it('R4: el pedido cuya receta esta de baja SI aparece al buscar su nombre', async () => {
    const pagina = await buscar('Cloro de baja')

    expect(pagina.items.map((o) => o.id)).toEqual([ordenBaja.id])
  })

  it('R2: ignora acentos y mayusculas', async () => {
    const pagina = await buscar('ACIDO citrico')

    expect(pagina.items.map((o) => o.id)).toEqual([ordenAlfa.id])
  })

  it('R5: el total describe el conjunto buscado y no la pagina', async () => {
    const pagina = await buscar('Comun Compartido', 2)

    expect(pagina.items).toHaveLength(2)
    expect(pagina.total).toBe(3)
    expect(pagina.totalPages).toBe(2)
    expect(ordenesComunes).toHaveLength(3)
  })

  it('R10: un termino que no casa con ninguna receta devuelve pagina vacia, total 0 y sin error', async () => {
    const pagina = await buscar('xilofono-que-no-existe')

    expect(pagina.items).toEqual([])
    expect(pagina.total).toBe(0)
    // `buildPage` fija `totalPages` en 1 cuando `total` es 0 -nunca 0 paginas-, mismo criterio
    // que el resto de listados del contrato generico.
    expect(pagina.totalPages).toBe(1)
  })

  it('R3: buscar el numero de pedido no encuentra nada', async () => {
    const pagina = await buscar(String(ordenAlfa.number.sequence))

    expect(pagina.items).toEqual([])
  })

  it('R15: sin termino de busqueda, la lista vuelve exactamente igual que antes de esta feature', async () => {
    const recipeIds = await findRecipeIdsMatchingName('', companyId)
    expect(recipeIds).toBeNull()

    const conRecipeIdsNull = await listAliveOrders(
      consulta({ pageSize: 25, filters: soloElDia21 }),
      scope(),
      recipeIds,
    )
    const sinTercerArgumento = await listAliveOrders(
      consulta({ pageSize: 25, filters: soloElDia21 }),
      scope(),
    )

    expect(conRecipeIdsNull.total).toBe(sinTercerArgumento.total)
    expect(conRecipeIdsNull.items.map((o) => o.id)).toEqual(
      sinTercerArgumento.items.map((o) => o.id),
    )
  })
})

describe('`priority` ordena por el ORDEN DEL ENUM, no por el alfabetico', () => {
  beforeAll(async () => {
    await alta(instantIn(5, 1), { priority: 'BAJA' })
    await alta(instantIn(5, 2), { priority: 'MEDIA' })
    await alta(instantIn(5, 3), { priority: 'ALTA' })
    await alta(instantIn(5, 4), { priority: 'CRITICA' })
  })

  it('de mayor a menor da CRITICA, ALTA, MEDIA, BAJA — y no el orden alfabetico', async () => {
    // Postgres ordena un enum por su ORDEN DE DECLARACION, que QC-33 R16 fijo de menor a mayor.
    // Alfabeticamente el descendente empezaria por `MEDIA` y `ALTA` iria despues de `CRITICA`
    // por otro motivo: este aserto cae si alguien reordena el enum en `db/schema.prisma`.
    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        sort: { columnId: 'priority', direction: 'desc' },
        filters: conFiltros({
          createdAt: {
            kind: 'dateRange',
            from: `${String(YEAR)}-01-05`,
            to: `${String(YEAR)}-01-05`,
          },
        }),
      }),
      scope(),
    )

    expect(pagina.items.map((o) => o.priority)).toEqual(['CRITICA', 'ALTA', 'MEDIA', 'BAJA'])
    // Y el alfabetico descendente seria otro: si coincidieran, el caso no probaria nada.
    const alfabeticoDesc = ['MEDIA', 'CRITICA', 'BAJA', 'ALTA']
    expect(pagina.items.map((o) => o.priority)).not.toEqual(alfabeticoDesc)
  })

  it('sin orden explicito, el orden es el de HOY: priority DESC primero (R11)', async () => {
    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: conFiltros({
          createdAt: {
            kind: 'dateRange',
            from: `${String(YEAR)}-01-05`,
            to: `${String(YEAR)}-01-05`,
          },
        }),
      }),
      scope(),
    )

    expect(pagina.items.map((o) => o.priority)).toEqual(['CRITICA', 'ALTA', 'MEDIA', 'BAJA'])
  })
})

describe('`orderNumber` ordena por el par (ano, correlativo) y no alfabeticamente (R10)', () => {
  it('el correlativo 10 va DESPUES del 9, que es donde el texto compuesto mentiria', async () => {
    // El numero visible no esta guardado: lo compone `formatOrderNumber`. Ordenar por el texto
    // daria `...0010` antes que `...009` en cuanto los correlativos cambien de longitud; el par
    // de enteros no tiene ese problema. Se comprueba sobre las filas ya sembradas, cuyos
    // correlativos van del 1 en adelante y cruzan el 9 -> 10.
    const pagina = await listAliveOrders(
      consulta({ pageSize: 25, sort: { columnId: 'orderNumber', direction: 'asc' } }),
      scope(),
    )

    const secuencias = pagina.items.map((o) => o.number.sequence)
    expect(secuencias.length).toBeGreaterThan(10)
    expect([...secuencias].sort((a, b) => a - b)).toEqual(secuencias)
    // El texto compuesto mentiria: comprobado explicitamente para que el caso no sea vacuo.
    const comoTexto = secuencias.map((s) => String(s).padStart(3, '0'))
    expect([...comoTexto].sort()).not.toEqual(secuencias.map(String))
  })
})

describe('estado y prioridad son filtros `select` del contrato (R25, R15)', () => {
  beforeAll(async () => {
    await alta(instantIn(9, 1), { priority: 'ALTA', status: 'EN_CURSO' })
    await alta(instantIn(9, 2), { priority: 'BAJA', status: 'EN_CURSO' })
    await alta(instantIn(9, 3), { priority: 'ALTA', status: 'PENDIENTE' })
  })

  const soloElDia9 = (extra: ListQuery['filters'] = {}): ListQuery['filters'] => ({
    createdAt: {
      kind: 'dateRange',
      from: `${String(YEAR)}-01-09`,
      to: `${String(YEAR)}-01-09`,
    },
    ...extra,
  })

  it('filtra por estado, por prioridad y por los dos a la vez (R15, R25)', async () => {
    const porEstado = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: soloElDia9({ status: { kind: 'select', values: ['EN_CURSO'] } }),
      }),
      scope(),
    )
    expect(porEstado.total).toBe(2)
    expect(porEstado.items.every((o) => o.status === 'EN_CURSO')).toBe(true)

    const porPrioridad = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: soloElDia9({ priority: { kind: 'select', values: ['ALTA'] } }),
      }),
      scope(),
    )
    expect(porPrioridad.total).toBe(2)

    // Los DOS a la vez: `AND`, no `OR` (R15).
    const ambos = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: soloElDia9({
          status: { kind: 'select', values: ['EN_CURSO'] },
          priority: { kind: 'select', values: ['ALTA'] },
        }),
      }),
      scope(),
    )
    expect(ambos.total).toBe(1)
    expect(ambos.items[0]?.status).toBe('EN_CURSO')
    expect(ambos.items[0]?.priority).toBe('ALTA')
  })

  it('un `select` con VARIOS valores es un `IN`, no una igualdad', async () => {
    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: soloElDia9({
          status: { kind: 'select', values: ['EN_CURSO', 'PENDIENTE'] },
        }),
      }),
      scope(),
    )

    expect(pagina.total).toBe(3)
  })

  it('un pedido CANCELADO SI se consulta; uno BORRADO no sale nunca (R25, R7)', async () => {
    // R25 conserva lo que QC-34 R40 fijo: el cancelado tiene estado propio en vez de
    // desaparecer. El borrado logico, en cambio, no sale filtre lo que filtre: `deleted_at IS
    // NULL` va SIEMPRE en el `where` y `deletedAt` no es consultable (R7).
    const cancelado = await alta(instantIn(14, 1))
    await prisma.order.update({
      where: { id: cancelado.id },
      data: { status: 'CANCELADO', cancellationReason: 'el cliente anulo el pedido' },
    })
    // El borrado se queda `PENDIENTE`: el `CHECK orders_delivered_not_deleted` impide borrar
    // uno cancelado o entregado, asi que la fila que demuestra R7 tiene que ser otra.
    const borrado = await alta(instantIn(14, 2))
    await prisma.order.update({
      where: { id: borrado.id },
      data: { deletedAt: new Date() },
    })

    const soloElDia14 = (extra: ListQuery['filters'] = {}): ListQuery['filters'] => ({
      createdAt: {
        kind: 'dateRange',
        from: `${String(YEAR)}-01-14`,
        to: `${String(YEAR)}-01-14`,
      },
      ...extra,
    })

    // Sin filtro de estado: el cancelado SALE y el borrado NO, aunque los dos son del dia 14.
    const todos = await listAliveOrders(consulta({ pageSize: 25, filters: soloElDia14() }), scope())
    expect(todos.items.map((o) => o.id)).toEqual([cancelado.id])
    expect(todos.total).toBe(1)

    // Y filtrando explicitamente por CANCELADO tambien sale: es un estado consultable (R25).
    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: soloElDia14({ status: { kind: 'select', values: ['CANCELADO'] } }),
      }),
      scope(),
    )
    expect(pagina.items.map((o) => o.id)).toEqual([cancelado.id])
    expect(pagina.items[0]?.cancellationReason).toBe('el cliente anulo el pedido')
    expect(pagina.total).toBe(1)
  })
})

describe('los decimales se comparan como Decimal, no como coma flotante', () => {
  it('un tope de 19.99 incluye el pedido que vale exactamente 19.9900 y excluye 19.9901', async () => {
    // El adaptador convierte el `number` del contrato a `Prisma.Decimal` ANTES de comparar. El
    // limite exacto es justo donde la coma flotante binaria falla.
    //
    // QC-35bis (2026-09-07): el caso se media sobre `unit_price`, que ya no existe. Se mide sobre
    // `quantity`, que es el otro `Decimal(14,4)` de la tabla y pasa por la MISMA conversion del
    // adaptador (`toDecimalRange`), asi que lo que se comprueba no ha cambiado.
    const justo = await alta(instantIn(20, 1), { quantity: '19.9900' })
    await alta(instantIn(20, 2), { quantity: '19.9901' })
    const menos = await alta(instantIn(20, 3), { quantity: '19.9899' })

    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: {
          createdAt: {
            kind: 'dateRange',
            from: `${String(YEAR)}-01-20`,
            to: `${String(YEAR)}-01-20`,
          },
          quantity: { kind: 'numberRange', min: null, max: 19.99 },
        },
      }),
      scope(),
    )

    expect(pagina.items.map((o) => o.id).sort()).toEqual([justo.id, menos.id].sort())
    expect(pagina.items.map((o) => o.quantity)).toContain('19.9900')
  })
})

describe('el rango de fechas se compara en UTC, con los dos extremos inclusivos', () => {
  it('incluye el primer y el ultimo instante del dia en UTC, y excluye el dia siguiente', async () => {
    // Decision cerrada del 2026-09-04 (manda sobre `design.md > 3.3`): `from` es 00:00:00.000Z
    // del dia y `to` es el FINAL del dia, implementado como `< 00:00:00Z del dia siguiente`
    // para no perder las marcas con microsegundos por encima del ultimo milisegundo.
    const DIA = 25
    const inicial = await alta(new Date(Date.UTC(YEAR, 0, DIA, 0, 0, 0, 0)))
    const final = await alta(new Date(Date.UTC(YEAR, 0, DIA, 23, 59, 59, 999)))
    await alta(new Date(Date.UTC(YEAR, 0, DIA + 1, 0, 0, 0, 0)))
    await alta(new Date(Date.UTC(YEAR, 0, DIA - 1, 23, 59, 59, 999)))

    const pagina = await listAliveOrders(
      consulta({
        pageSize: 25,
        filters: {
          createdAt: {
            kind: 'dateRange',
            from: `${String(YEAR)}-01-${String(DIA)}`,
            to: `${String(YEAR)}-01-${String(DIA)}`,
          },
        },
      }),
      scope(),
    )

    expect(pagina.items.map((o) => o.id).sort()).toEqual([inicial.id, final.id].sort())
    expect(pagina.total).toBe(2)
  })
})

describe('desempate estable por identificador (R10)', () => {
  it('cuatro pedidos empatados en el campo de orden no se repiten ni se pierden entre paginas', async () => {
    // R10 — ordenando por `status`, que empata en las cuatro, lo unico que puede ordenarlas es
    // el desempate por `id`. Sin el, dos empatadas pueden intercambiarse entre consultas y una
    // acabaria saliendo dos veces —o ninguna—.
    const ids: string[] = []
    for (let i = 0; i < 4; i += 1) {
      ids.push((await alta(instantIn(28, i), { status: 'PENDIENTE' })).id)
    }

    const soloElDia28: ListQuery['filters'] = {
      createdAt: {
        kind: 'dateRange',
        from: `${String(YEAR)}-01-28`,
        to: `${String(YEAR)}-01-28`,
      },
    }

    const vistos: string[] = []
    for (const page of [1, 2]) {
      const pagina = await listAliveOrders(
        consulta({
          page,
          pageSize: 2,
          sort: { columnId: 'status', direction: 'asc' },
          filters: soloElDia28,
        }),
        scope(),
      )
      vistos.push(...pagina.items.map((o) => o.id))
    }

    expect(vistos).toHaveLength(4)
    expect(new Set(vistos).size).toBe(4)
    expect([...vistos].sort()).toEqual(vistos)
  })
})
