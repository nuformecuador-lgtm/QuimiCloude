/**
 * QC-34 — el ADAPTADOR DRIVEN de pedidos
 * (`lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`) ejecutado DE VERDAD
 * contra una base Postgres REAL con la migracion `20260904135210_order_cancellation` aplicada.
 *
 * Requisitos cubiertos: R8, R13 (la mitad que la base demuestra), R34, R35, R38, R40, R41.
 *
 * POR QUE EXISTE ESTE ARCHIVO, SEPARADO DE `order-crud.int.test.ts`. Aquel comprueba lo que
 * solo Postgres puede demostrar —los CHECK, las FK, el indice unico— y para aislarse envuelve
 * cada caso en una transaccion que termina en `ROLLBACK`, ejecutando SU PROPIA copia de las
 * sentencias. Eso deja al adaptador sin ejecutar: una copia no vigila a su original, y cambiar
 * el `ORDER BY` o el `take` del adaptador no pondria nada rojo. Este archivo llama a las
 * funciones REALES —`createOrder`, `findAliveOrderById`, `listAliveOrders`, `updateAliveOrder`,
 * `cancelAliveOrder`, `softDeleteAliveOrder`—, que son exactamente las que `lib/composition`
 * ata al puerto.
 *
 * POR ESO NO HAY TRANSACCION REVERTIDA AQUI, y no es una preferencia de estilo: esas funciones
 * hablan con el cliente Prisma GLOBAL (`@/lib/shared/db/prisma`), no con un `tx` inyectado, asi
 * que una llamada hecha «dentro» del callback de `prisma.$transaction(...)` correria en OTRA
 * conexion del pool y haria COMMIT de inmediato — el rollback no se llevaria sus filas. La
 * salida es la que ya usan `tests/integration/recetas/recipe-crud.int.test.ts` y
 * `tests/integration/proveedores/supplier-crud.int.test.ts`: cada caso crea sus datos y LOS
 * BORRA EL MISMO, por su `id` exacto, en un bloque `finally`.
 *
 * `createOrder` -que llevaba su propio bucle de reintento sobre el cliente global- se retiro; el
 * alta de siembra de este archivo pasa por
 * `withOrderTransaction` + `createOrderWriteRepository`, el mismo par que ata `OrderUnitOfWork`
 * en `lib/composition`. Las funciones REALES que este archivo ejercita son ahora esas dos, mas
 * `findAliveOrderById`, `listAliveOrders`, `updateAliveOrder`, `cancelAliveOrder` y
 * `softDeleteAliveOrder`.
 *
 * HIGIENE, y es critica: los tests de `tests/integration/` corren EN SERIE contra UNA base
 * compartida (`vitest.config.mts`, `fileParallelism: false`) y algun archivo afirma sobre el
 * estado global de una tabla. Una fila —o una secuencia— olvidada aqui pone rojo un test ajeno
 * manana. De ahi las tres reglas de este archivo:
 *   1. Cada caso borra sus pedidos por `id` en `finally`, pase lo que pase.
 *   2. `afterAll` borra las secuencias `orders_sequence_<ano>` de los anos de prueba, y
 *      `beforeAll` tambien: una corrida anterior interrumpida no puede decidir esta.
 *   3. NINGUNA AFIRMACION GLOBAL sobre cuantos pedidos hay. Donde el `total` del listado es el
 *      punto del test, el numero esperado se PREGUNTA a la base con el mismo `where`, nunca se
 *      escribe a mano: asi el caso vale con la tabla vacia y con la tabla llena.
 *
 * ANOS DE PRUEBA MUY LEJANOS (28xx), uno por escenario, mismo criterio que
 * `order-sequence.int.test.ts`. El CHECK `orders_order_year_matches_created_at` (QC-33 R41) ata
 * `order_year` al ano UTC de `created_at`, y el adaptador escribe los dos desde el MISMO `now`,
 * asi que basta con darle un `now` del ano de prueba. Ventaja doble: el correlativo sale de
 * `orders_sequence_28xx`, que este archivo crea y borra, y no toca la secuencia del ano real de
 * la aplicacion; y un ano por escenario hace que ningun caso herede la secuencia de otro.
 *
 * LOS TOPES DE PAGINACION NO SE ESCRIBEN A MANO: `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` y
 * `toOffsetLimit` se importan de `@/lib/shared/pagination`, que es de donde el adaptador los
 * saca (mismo criterio que `recipe-crud.int.test.ts`). Un `10` o un `25` literales aqui
 * dejarian el test verde justo el dia en que el tope cambiara en un solo sitio.
 */
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cancelAliveOrder,
  createOrderWriteRepository,
  findAliveOrderById,
  listAliveOrders,
  softDeleteAliveOrder,
  updateAliveOrder,
} from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { withOrderTransaction } from '@/lib/modules/pedidos/adapters/driven/persistence/order-unit-of-work-prisma'
import { listAliveOrderSummariesByIds } from '@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma'
import { normalizeCompanyName } from '@/lib/modules/identity'
import { normalizePresentationName } from '@/lib/modules/inventario'
import { prisma } from '@/lib/shared/db/prisma'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, toOffsetLimit } from '@/lib/shared/pagination'

import type {
  ListQuery,
  NewOrder,
  OrderPriority,
  OrderRow,
  OrderScope,
  OrderStatus,
} from '@/lib/modules/pedidos'

// ---------------------------------------------------------------------------
// Anos de prueba y limpieza de secuencias
// ---------------------------------------------------------------------------

/** Un ano por escenario. Distintos de los 287x de `order-sequence.int.test.ts` para que los dos
 *  archivos no puedan pisarse la secuencia aunque cambie el orden en que corren. */
const YEAR_ALTA = 2881
const YEAR_PAGINACION = 2882
const YEAR_ORDEN = 2883
const YEAR_BORRADO = 2884
const YEAR_FILTROS = 2885
const YEAR_DISCRIMINANTES = 2886
const YEAR_CATALOGO = 2887

const TEST_YEARS = [
  YEAR_ALTA,
  YEAR_PAGINACION,
  YEAR_ORDEN,
  YEAR_BORRADO,
  YEAR_FILTROS,
  YEAR_DISCRIMINANTES,
  YEAR_CATALOGO,
] as const

async function dropTestSequences(): Promise<void> {
  for (const year of TEST_YEARS) {
    await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "orders_sequence_${String(year)}"`)
  }
}

// ---------------------------------------------------------------------------
// Datos de apoyo — las cuatro FK del pedido son REALES aunque Prisma las declare como
// escalares sin `@relation`, asi que hay que sembrarlas. Se siembran UNA vez para todo el
// archivo: son de solo lectura para estos casos y `afterAll` las retira.
// ---------------------------------------------------------------------------

function token(): string {
  return randomUUID().replace(/-/gu, '')
}

let recipeId: string
let unitId: string
let actorId: string
let roleId: string
let documentTypeCode: string
/** Empresa efimera del fixture. QC-47 R9 hizo `users.company_id` obligatoria. */
let companyId: string
/** QC-146: presentacion de la MISMA empresa, para que `NewOrder.presentationId` (obligatorio)
 *  tenga una referencia valida en toda alta y edicion de este archivo. */
let presentationId: string

async function seedFixtures(): Promise<void> {
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
  // Empresa efimera propia de este fixture. NUNCA la empresa de instalacion: el indice
  // `companies_name_unique` es GLOBAL y el nombre chocaria con el de la empresa que siembra
  // `db:seed`. `name_normalized` sale de `normalizeCompanyName`, la UNICA definicion de «mismo
  // nombre de empresa» (QC-47 R3), importada del contrato publico de `identity`.
  companyId = (
    await prisma.company.create({
      data: {
        name: `Empresa ${marca}`,
        nameNormalized: normalizeCompanyName(`Empresa ${marca}`),
      },
      select: { id: true },
    })
  ).id
  // QC-146: presentacion de la MISMA empresa, obligatoria en toda alta y edicion (`NewOrder`).
  presentationId = (
    await prisma.presentation.create({
      data: {
        name: `Bidon ${marca}`,
        nameNormalized: normalizePresentationName(`Bidon ${marca}`),
        unitId,
        companyId,
      },
      select: { id: true },
    })
  ).id
  // La receta es de la MISMA empresa que el resto del fixture: QC-50 hizo `recipes.company_id`
  // obligatoria.
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
}

/** Retira las cinco FK sembradas, en el orden que las FK permiten. */
async function dropFixtures(): Promise<void> {
  await prisma.user.delete({ where: { id: actorId } })
  // La receta TAMBIEN antes que la empresa: QC-50 hizo `recipes.company_id` una FK RESTRICT.
  await prisma.recipe.delete({ where: { id: recipeId } })
  // La presentacion TAMBIEN antes que la empresa, y despues de todo pedido que la use -cada
  // caso ya borro los suyos en su `finally` (`limpiar`)-: `orders_company_id_presentation_id_fkey`
  // es `ON DELETE RESTRICT` (QC-146).
  await prisma.presentation.delete({ where: { id: presentationId } })
  // La empresa DESPUES del usuario y de la receta: `users_company_id_fkey` y
  // `recipes_company_id_fkey` son `ON DELETE RESTRICT` (QC-47 R11, QC-50).
  await prisma.company.delete({ where: { id: companyId } })
  await prisma.role.delete({ where: { id: roleId } })
  await prisma.documentType.delete({ where: { code: documentTypeCode } })
  await prisma.unit.delete({ where: { id: unitId } })
}

// ---------------------------------------------------------------------------
// Ayudantes de siembra — TODOS pasan por el adaptador real
// ---------------------------------------------------------------------------

/** Instante dentro del ano indicado. El adaptador escribe `created_at` y `order_year` desde el
 *  MISMO `now`, asi que el CHECK del ano nunca puede rechazar estas altas. */
/** QC-60 (R18): el adaptador exige el AMBITO en la firma. Es la empresa efimera del propio
 *  fixture, asi que el archivo sigue viendo exactamente los pedidos que siembra. Se lee como
 *  funcion y no como constante porque `companyId` no existe hasta el `beforeAll`. */
function scope(): OrderScope {
  return { companyId }
}

function instantIn(year: number, month: number, day: number, ms = 0): Date {
  return new Date(Date.UTC(year, month, day, 12, 0, 0, ms))
}

function baseOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    recipeId,
    quantity: '10.0000',
    priority: 'MEDIA',
    status: 'PENDIENTE',
    unitId,
    presentationLines: [],
    ...overrides,
  }
}

/**
 * Alta por el adaptador REAL, con el `now` del ano de prueba. Registra el id en `creados` para
 * que el `finally` del caso lo borre aunque una asercion posterior falle.
 */
async function altaReal(
  creados: string[],
  year: number,
  now: Date,
  overrides: Partial<NewOrder> = {},
): Promise<OrderRow> {
  const fila = await withOrderTransaction((tx) =>
    createOrderWriteRepository(tx).create(baseOrder(overrides), year, actorId, now, null, scope()),
  )
  creados.push(fila.id)
  return fila
}

/** Borra por `id` EXACTO los pedidos que sembro un caso. Nunca un `deleteMany` con filtro
 *  amplio: este archivo no puede llevarse por delante una fila que no creo el.
 *
 * `order_presentation_lines` va PRIMERO: su FK hacia `orders` es `ON DELETE RESTRICT`
 * (`design.md > 2.1`), asi que un pedido con reparto no se borra hasta vaciarlo. */
async function limpiar(creados: readonly string[]): Promise<void> {
  if (creados.length === 0) return
  await prisma.orderPresentationLine.deleteMany({ where: { orderId: { in: [...creados] } } })
  await prisma.order.deleteMany({ where: { id: { in: [...creados] } } })
}

/**
 * QC-57 (R25): el estado y la prioridad dejaron de ser parametros propios del listado y son
 * filtros `select` DENTRO del contrato generico. Este alias conserva la forma comoda con la
 * que los casos de este archivo los escribian, y `consulta` los traduce al contrato: los
 * asertos siguen diciendo lo mismo y ninguno se relaja.
 */
type FiltrosDePrueba = { readonly status?: OrderStatus; readonly priority?: OrderPriority }

/** Los filtros de prueba + la pagina -> el CONTRATO GENERICO que el adaptador espera. Estas
 *  llamadas no piden orden ni busqueda: es exactamente la lista de siempre (R11). */
function consulta(
  filtros: FiltrosDePrueba = {},
  pagina: { readonly page?: number; readonly pageSize?: number } = {},
): ListQuery {
  return {
    page: pagina.page ?? 1,
    ...(pagina.pageSize === undefined ? {} : { pageSize: pagina.pageSize }),
    sort: null,
    filters: {
      ...(filtros.status === undefined
        ? {}
        : { status: { kind: 'select' as const, values: [filtros.status] } }),
      ...(filtros.priority === undefined
        ? {}
        : { priority: { kind: 'select' as const, values: [filtros.priority] } }),
    },
    search: '',
  }
}

/**
 * Recorre TODAS las paginas de `listAliveOrders` con el maximo permitido, avanzando hasta
 * cubrir el `totalPages` que devuelve la propia primera llamada. No asume nada de antemano
 * sobre cuantos pedidos vivos hay: los ajenos participan del recorrido igual que los sembrados
 * por este archivo, y cada caso filtra despues por SUS ids.
 */
async function recorrerTodo(filtros: FiltrosDePrueba = {}): Promise<readonly OrderRow[]> {
  const primera = await listAliveOrders(consulta(filtros, { pageSize: MAX_PAGE_SIZE }), null, scope())
  const items = [...primera.items]
  for (let page = 2; page <= primera.totalPages; page += 1) {
    const siguiente = await listAliveOrders(consulta(filtros, { page, pageSize: MAX_PAGE_SIZE }), null, scope())
    items.push(...siguiente.items)
  }
  return items
}

/** Los pedidos vivos que cumplen el filtro, contados por la base con el MISMO `where` del
 *  adaptador. Es el numero esperado del `total`, y se pregunta en vez de escribirse. */
function contarVivos(filters: FiltrosDePrueba = {}): Promise<number> {
  return prisma.order.count({
    where: {
      companyId,
      deletedAt: null,
      ...(filters.status === undefined ? {} : { status: filters.status }),
      ...(filters.priority === undefined ? {} : { priority: filters.priority }),
    },
  })
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders'`
  if (tablas.length !== 1) {
    throw new Error(
      'la base de pruebas no tiene la tabla `orders` (QC-33 + QC-34). ' +
        'Corre `pnpm run db:migrate` antes de estos tests.',
    )
  }

  await dropTestSequences()
  await seedFixtures()
})

afterAll(async () => {
  await dropFixtures()
  await dropTestSequences()
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------

describe('R8 — alta por el adaptador y relectura sin perdida', () => {
  it('devuelve el id y el correlativo, y `findAliveOrderById` relee lo mismo', async () => {
    const creados: string[] = []
    try {
      const now = instantIn(YEAR_ALTA, 4, 20)
      const alta = await altaReal(creados, YEAR_ALTA, now, {
        // Decimales que NO son los de la escala de la columna: la vuelta tiene que traerlos
        // con CUATRO decimales exactos (`Decimal(14, 4)`), ni tres ni seis.
        quantity: '10.5',
        priority: 'ALTA',
      })

      expect(alta.id).toMatch(/^[0-9a-f-]{36}$/u)
      expect(alta.number.year).toBe(YEAR_ALTA)
      // La posicion la entrega la secuencia del ano, que este archivo estrena: es la primera.
      expect(alta.number.sequence).toBe(1)

      const ficha = await findAliveOrderById(alta.id, scope())
      expect(ficha).not.toBeNull()
      expect(ficha?.id).toBe(alta.id)
      expect(ficha?.number).toEqual({ year: YEAR_ALTA, sequence: 1 })
      expect(ficha?.recipeId).toBe(recipeId)
      // `.toFixed(4)`: la escala de la columna, en la ida y en la vuelta.
      expect(ficha?.quantity).toBe('10.5000')
      expect(ficha?.priority).toBe('ALTA')
      expect(ficha?.status).toBe('PENDIENTE')
      expect(ficha?.cancellationReason).toBeNull()
      // R6: los dos autores son el actor, y el reloj es el `now` inyectado, no el de la base.
      expect(ficha?.createdBy).toBe(actorId)
      expect(ficha?.updatedBy).toBe(actorId)
      expect(ficha?.createdAt.toISOString()).toBe(now.toISOString())
      expect(ficha?.updatedAt.toISOString()).toBe(now.toISOString())

      // Lo que devuelve el alta y lo que devuelve la relectura son EL MISMO pedido, campo a
      // campo: si el `RETURNING` y el `select` divergieran, el alta mentiria.
      expect(ficha).toEqual(alta)

      // La segunda alta del mismo ano se lleva la posicion siguiente (R11).
      const segunda = await altaReal(creados, YEAR_ALTA, instantIn(YEAR_ALTA, 4, 21))
      expect(segunda.number).toEqual({ year: YEAR_ALTA, sequence: 2 })
    } finally {
      await limpiar(creados)
    }
  })
})

describe('R35 — el tamano de pagina: defecto de 10 y tope de 25', () => {
  it('sin `pageSize` devuelve el defecto, y con 100 devuelve el tope — tambien en la `Page`', async () => {
    const creados: string[] = []
    try {
      // Mas de 25 pedidos vivos: es la unica forma de distinguir «devuelve el tope» de
      // «devuelve todo lo que hay».
      const cuantos = MAX_PAGE_SIZE + 1
      for (let i = 0; i < cuantos; i += 1) {
        await altaReal(creados, YEAR_PAGINACION, instantIn(YEAR_PAGINACION, 0, 10, i))
      }
      expect(creados).toHaveLength(cuantos)

      // (a) `pageSize` OMITIDO -> el defecto, en los elementos Y en la pagina.
      const porDefecto = await listAliveOrders(consulta(), null, scope())
      const totalVivos = await contarVivos()
      expect(porDefecto.items).toHaveLength(DEFAULT_PAGE_SIZE)
      expect(porDefecto.pageSize).toBe(DEFAULT_PAGE_SIZE)
      expect(porDefecto.page).toBe(1)
      expect(porDefecto.total).toBe(totalVivos)
      expect(porDefecto.total).toBeGreaterThanOrEqual(cuantos)
      expect(porDefecto.totalPages).toBe(Math.ceil(totalVivos / DEFAULT_PAGE_SIZE))

      // (b) `pageSize` 100 -> el TOPE. Y el `pageSize` de la `Page` es el ACOTADO, no el
      // pedido: es lo que demuestra que `buildPage` recibe el `limit` de `toOffsetLimit` y no
      // el `query.pageSize`, que es el error contra el que avisa el propio adaptador —con el
      // pedido, `totalPages` mentiria aunque el `LIMIT` de SQL fuera correcto—.
      const pedida = 100
      const acotada = await listAliveOrders(consulta({}, { pageSize: pedida }), null, scope())
      expect(acotada.items).toHaveLength(MAX_PAGE_SIZE)
      expect(acotada.pageSize).toBe(MAX_PAGE_SIZE)
      expect(acotada.pageSize).not.toBe(pedida)
      expect(acotada.total).toBe(totalVivos)
      expect(acotada.totalPages).toBe(Math.ceil(totalVivos / MAX_PAGE_SIZE))
      expect(acotada.totalPages).not.toBe(Math.ceil(totalVivos / pedida))

      // Y es el MISMO acotado que calcula `lib/shared/pagination`, no un 25 escrito aparte.
      expect(acotada.pageSize).toBe(toOffsetLimit(1, pedida).limit)
      expect(toOffsetLimit(1, undefined).limit).toBe(DEFAULT_PAGE_SIZE)

      // La consulta NUNCA sale sin limite superior: ni pidiendo un tamano absurdo.
      const absurda = await listAliveOrders(consulta({}, { pageSize: 999_999 }), null, scope())
      expect(absurda.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE)
      expect(absurda.pageSize).toBe(MAX_PAGE_SIZE)
    } finally {
      await limpiar(creados)
    }
  })
})

describe('R41 — el orden del listado, con las filas sembradas EN DESORDEN', () => {
  it('prioridad DESC, antiguedad ASC dentro de cada prioridad, y el correlativo desempata', async () => {
    const creados: string[] = []
    try {
      // Tres instantes del ano de prueba. `t1 < t2 < t3`, y `t1` se repite AL MILISEGUNDO en
      // dos altas para forzar el desempate por `(order_year, order_sequence)`.
      const t1 = instantIn(YEAR_ORDEN, 0, 5)
      const t2 = instantIn(YEAR_ORDEN, 5, 5)
      const t3 = instantIn(YEAR_ORDEN, 10, 5)

      // El orden de siembra NO es el esperado: si el adaptador ordenara por insercion —o si se
      // le cayera el `ORDER BY`— el resultado saldria distinto.
      const mediaT2 = await altaReal(creados, YEAR_ORDEN, t2, { priority: 'MEDIA' })
      const criticaT3 = await altaReal(creados, YEAR_ORDEN, t3, { priority: 'CRITICA' })
      const bajaT1 = await altaReal(creados, YEAR_ORDEN, t1, { priority: 'BAJA' })
      const altaT2 = await altaReal(creados, YEAR_ORDEN, t2, { priority: 'ALTA' })
      const criticaT1a = await altaReal(creados, YEAR_ORDEN, t1, { priority: 'CRITICA' })
      const criticaT1b = await altaReal(creados, YEAR_ORDEN, t1, { priority: 'CRITICA' })
      const mediaT1 = await altaReal(creados, YEAR_ORDEN, t1, { priority: 'MEDIA' })
      const altaT1 = await altaReal(creados, YEAR_ORDEN, t1, { priority: 'ALTA' })

      // Los dos CRITICA de `t1` comparten instante al milisegundo: lo unico que los separa es
      // el correlativo, y el que lo tiene menor va primero.
      expect(criticaT1a.createdAt.getTime()).toBe(criticaT1b.createdAt.getTime())
      expect(criticaT1a.number.sequence).toBeLessThan(criticaT1b.number.sequence)

      const mios = (await recorrerTodo()).filter((row) => creados.includes(row.id))

      expect(mios.map((row) => row.id)).toEqual([
        criticaT1a.id,
        criticaT1b.id,
        criticaT3.id,
        altaT1.id,
        altaT2.id,
        mediaT1.id,
        mediaT2.id,
        bajaT1.id,
      ])
      // Y la prioridad baja de mayor a menor: `priority DESC` sobre el enum da el orden de
      // negocio porque QC-33 R16 declaro los valores de menor a mayor.
      expect(mios.map((row) => row.priority)).toEqual([
        'CRITICA',
        'CRITICA',
        'CRITICA',
        'ALTA',
        'ALTA',
        'MEDIA',
        'MEDIA',
        'BAJA',
      ])
    } finally {
      await limpiar(creados)
    }
  })
})

describe('R40 — el borrado desaparece de la ficha y del listado; el cancelado vuelve', () => {
  it('el borrado logico sale de las dos consultas y la fila sigue existiendo', async () => {
    const creados: string[] = []
    try {
      const now = instantIn(YEAR_BORRADO, 2, 3)
      const pedido = await altaReal(creados, YEAR_BORRADO, now)

      expect(await findAliveOrderById(pedido.id, scope())).not.toBeNull()
      expect((await recorrerTodo()).some((row) => row.id === pedido.id)).toBe(true)

      const despues = instantIn(YEAR_BORRADO, 2, 4)
      expect(await softDeleteAliveOrder(pedido.id, actorId, despues, scope())).toBe('ok')

      // Desaparece de la ficha Y del listado, las dos por el `where` del puerto.
      expect(await findAliveOrderById(pedido.id, scope())).toBeNull()
      expect((await recorrerTodo()).some((row) => row.id === pedido.id)).toBe(false)

      // Pero la fila SIGUE ahi: es borrado logico, no fisico. Se relee con Prisma directo,
      // sin el filtro de «vivo», que es la unica forma de ver un borrado.
      const cruda = await prisma.order.findUnique({ where: { id: pedido.id } })
      expect(cruda).not.toBeNull()
      expect(cruda?.deletedAt).toBeInstanceOf(Date)
      expect(cruda?.updatedBy).toBe(actorId)
      expect(cruda?.orderSequence).toBe(pedido.number.sequence)
    } finally {
      await limpiar(creados)
    }
  })

  it('el cancelado SI vuelve, con su motivo, en la ficha y en el listado', async () => {
    const creados: string[] = []
    try {
      const now = instantIn(YEAR_BORRADO, 6, 3)
      const pedido = await altaReal(creados, YEAR_BORRADO, now)

      const motivo = 'El cliente retiro la orden'
      expect(await cancelAliveOrder(pedido.id, motivo, actorId, instantIn(YEAR_BORRADO, 6, 4), scope())).toBe(
        'ok',
      )

      const ficha = await findAliveOrderById(pedido.id, scope())
      expect(ficha?.status).toBe('CANCELADO')
      expect(ficha?.cancellationReason).toBe(motivo)

      const enLista = (await recorrerTodo()).find((row) => row.id === pedido.id)
      expect(enLista?.status).toBe('CANCELADO')
      expect(enLista?.cancellationReason).toBe(motivo)
    } finally {
      await limpiar(creados)
    }
  })
})

describe('R34/R38 — el `total` es el de los filtros, no el de la pagina', () => {
  it('cuenta todos los pedidos que cumplen el filtro, y los filtros se combinan', async () => {
    const creados: string[] = []
    try {
      const dia = 8
      const alta = { priority: 'ALTA' } as const
      const baja = { priority: 'BAJA' } as const
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 1), {
        ...alta,
        status: 'PENDIENTE',
      })
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 2), {
        ...alta,
        status: 'PENDIENTE',
      })
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 3), {
        ...baja,
        status: 'PENDIENTE',
      })
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 4), {
        ...alta,
        status: 'EN_CURSO',
      })
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 5), {
        ...alta,
        status: 'EN_CURSO',
      })
      await altaReal(creados, YEAR_FILTROS, instantIn(YEAR_FILTROS, 1, dia, 6), {
        ...baja,
        status: 'EN_CURSO',
      })

      // R34: pagina de DOS sobre seis pedidos propios. El `total` no es 2.
      const pagina = await listAliveOrders(consulta({}, { pageSize: 2 }), null, scope())
      expect(pagina.items).toHaveLength(2)
      expect(pagina.total).toBe(await contarVivos())
      expect(pagina.total).toBeGreaterThanOrEqual(creados.length)
      expect(pagina.total).toBeGreaterThan(pagina.items.length)

      // R38, filtro suelto por estado.
      const porEstado = await listAliveOrders(consulta({ status: 'EN_CURSO' }), null, scope())
      expect(porEstado.total).toBe(await contarVivos({ status: 'EN_CURSO' }))
      expect(porEstado.items.every((row) => row.status === 'EN_CURSO')).toBe(true)
      const mismosEstado = (await recorrerTodo({ status: 'EN_CURSO' })).filter((row) =>
        creados.includes(row.id),
      )
      expect(mismosEstado).toHaveLength(3)

      // R38, filtro suelto por prioridad.
      const porPrioridad = await listAliveOrders(consulta({ priority: 'ALTA' }), null, scope())
      expect(porPrioridad.total).toBe(await contarVivos({ priority: 'ALTA' }))
      expect(porPrioridad.items.every((row) => row.priority === 'ALTA')).toBe(true)
      const mismosPrioridad = (await recorrerTodo({ priority: 'ALTA' })).filter((row) =>
        creados.includes(row.id),
      )
      expect(mismosPrioridad).toHaveLength(4)

      // R38, los dos COMBINADOS: el `and`, no el `or`.
      const combinado = { status: 'EN_CURSO', priority: 'ALTA' } as const
      const ambos = await listAliveOrders(consulta(combinado), null, scope())
      expect(ambos.total).toBe(await contarVivos(combinado))
      const mismosAmbos = (await recorrerTodo(combinado)).filter((row) => creados.includes(row.id))
      expect(mismosAmbos).toHaveLength(2)
      expect(
        mismosAmbos.every((row) => row.status === 'EN_CURSO' && row.priority === 'ALTA'),
      ).toBe(true)
    } finally {
      await limpiar(creados)
    }
  })
})

describe('R33/R40 — los discriminantes de las tres escrituras', () => {
  it('`ok` sobre un pedido vivo; `not_found` sobre uno inexistente y sobre uno ya borrado', async () => {
    const creados: string[] = []
    const inexistente = randomUUID()
    try {
      const now = instantIn(YEAR_DISCRIMINANTES, 3, 12)
      const pedido = await altaReal(creados, YEAR_DISCRIMINANTES, now)
      const despues = instantIn(YEAR_DISCRIMINANTES, 3, 13)

      // VIVO -> 'ok', y la edicion escribe de verdad.
      //
      // ENMIENDA: `editado` sigue llevando `status` porque `baseOrder` devuelve un `NewOrder`
      // completo -el mismo helper del alta-, pero `updateAliveOrder` ya no lo lee (`OrderEdit` no
      // tiene el campo): la fila se queda en el estado con el que nacio, `PENDIENTE`, aunque
      // `editado.status` pida `EN_CURSO`.
      const editado = baseOrder({ quantity: '99.0000', priority: 'CRITICA', status: 'EN_CURSO' })
      expect(await updateAliveOrder(pedido.id, editado, actorId, despues, null, scope())).toBe('ok')
      const relectura = await findAliveOrderById(pedido.id, scope())
      expect(relectura?.quantity).toBe('99.0000')
      expect(relectura?.priority).toBe('CRITICA')
      expect(relectura?.status).toBe('PENDIENTE')
      // La edicion NO toca el autor ni el instante de la creacion.
      expect(relectura?.createdBy).toBe(actorId)
      expect(relectura?.createdAt.toISOString()).toBe(now.toISOString())
      expect(relectura?.updatedAt.toISOString()).toBe(despues.toISOString())

      // INEXISTENTE -> 'not_found' en las tres, sin lanzar.
      expect(await updateAliveOrder(inexistente, editado, actorId, despues, null, scope())).toBe('not_found')
      expect(await cancelAliveOrder(inexistente, 'da igual', actorId, despues, scope())).toBe('not_found')
      expect(await softDeleteAliveOrder(inexistente, actorId, despues, scope())).toBe('not_found')

      // YA BORRADO -> 'not_found' en las tres. El primer borrado si es 'ok'.
      expect(await softDeleteAliveOrder(pedido.id, actorId, despues, scope())).toBe('ok')
      expect(await updateAliveOrder(pedido.id, editado, actorId, despues, null, scope())).toBe('not_found')
      expect(await cancelAliveOrder(pedido.id, 'da igual', actorId, despues, scope())).toBe('not_found')
      expect(await softDeleteAliveOrder(pedido.id, actorId, despues, scope())).toBe('not_found')

      // Y ninguna de las tres llamadas rechazadas escribio nada: la fila borrada sigue con lo
      // que tenia, no con lo que pedia el `editado` de despues.
      const cruda = await prisma.order.findUnique({ where: { id: pedido.id } })
      expect(cruda?.status).toBe('PENDIENTE')
      expect(cruda?.cancellationReason).toBeNull()
    } finally {
      await limpiar(creados)
    }
  })
})

describe('T10 — listAliveOrderSummariesByIds devuelve el reparto y la unidad', () => {
  it('el resumen que pedidos publica a asignaciones lleva presentationLines y unitId, con y sin reparto', async () => {
    const creados: string[] = []
    try {
      const now = instantIn(YEAR_CATALOGO, 1, 10)
      const conReparto = await altaReal(creados, YEAR_CATALOGO, now, {
        presentationLines: [{ presentationId, packages: 3, content: null }],
      })
      // Un pedido «viejo» sin reparto ni unidad: se inserta con Prisma directo, sin pasar por
      // el adaptador -que ya los exige siempre-, para simular una fila anterior a esta ficha
      // (R2, R43).
      const filaSinReparto = await prisma.order.create({
        data: {
          companyId,
          orderYear: YEAR_CATALOGO,
          orderSequence: 999,
          recipeId,
          quantity: new Prisma.Decimal('10'),
          createdAt: instantIn(YEAR_CATALOGO, 1, 11),
        },
        select: { id: true },
      })
      creados.push(filaSinReparto.id)

      const pagina = await listAliveOrderSummariesByIds(
        companyId,
        [conReparto.id, filaSinReparto.id],
        ['PENDIENTE'],
        1,
      )

      const resumenConReparto = pagina.items.find((item) => item.id === conReparto.id)
      const resumenSinReparto = pagina.items.find((item) => item.id === filaSinReparto.id)
      expect(resumenConReparto?.presentationLines).toEqual([{ presentationId, packages: 3 }])
      expect(resumenConReparto?.unitId).toBe(unitId)
      expect(resumenSinReparto?.presentationLines).toEqual([])
      expect(resumenSinReparto?.unitId).toBeNull()
    } finally {
      await limpiar(creados)
    }
  })
})
