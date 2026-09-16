// QC-87 T4 — El puerto `OrderAssignmentRepository` (`design.md > 3`).
//
// Un puerto no tiene comportamiento que ejercitar: es una INTERFAZ. Lo que se puede demostrar de
// el son propiedades de COMPILACION y de FORMA, y son exactamente las que la ficha promete:
//
//   1. `companyId` es el PRIMER parametro de los tres metodos que lo llevan, de modo que una
//      llamada que lo olvide **no compila** (R7). Va con `@ts-expect-error`, el patron del repo
//      para los casos negativos de tipos (`tests/unit/errores/catalogo.test.ts`,
//      `tests/unit/identity/require-any-permission.test.ts`): se pone rojo tanto si la llamada
//      pasara a compilar -«Unused '@ts-expect-error' directive»- como si el metodo desapareciera.
//   2. El puerto tiene CUATRO metodos y ni uno mas; en particular **ninguno de `update`** (QC-86
//      R8, R9) y **ningun borrado masivo por pedido**, que habilitaria el «borrar y reinsertar»
//      que `design.md > 10` marca como riesgo n.o 1.
//   3. El puerto es dominio PURO: su fuente no importa `@prisma/client` ni `next/*`.
//
// Las dos ultimas se comprueban sobre un doble que implementa la interfaz (si el puerto creciera
// un metodo, el doble deja de satisfacerlo y el typecheck cae) y sobre el TEXTO del fuente.
//
// Cubre R7, R15, R16, R22, R27, R29, R30, R32, R34 en su parte de CONTRATO; el comportamiento es
// de T5 (adaptador) y de T7-T9 (casos de uso).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaClient } from '@prisma/client'

import type {
  AssignmentRow,
  NewAssignment,
  OrderAssignmentRepository,
  OrderAssignmentRowWithOrder,
} from '@/lib/modules/asignaciones/ports/order-assignment-repository'

// QC-88 T2 — el cliente global se sustituye para que importar el adaptador NO instancie un
// `PrismaClient` de verdad. El adaptador es una FABRICA y recibe el cliente por argumento, asi que
// lo que se ejercita abajo es el doble que se le pasa, no este.
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: {} }))

import { createOrderAssignmentRepository } from '@/lib/modules/asignaciones/adapters/driven/persistence/order-assignment-prisma'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const GROUP = '44444444-4444-4444-8444-444444444444'

/** Doble en memoria. Su valor NO es simular la base -eso es T5- sino que el TIPO obligue: si el
 *  puerto ganara un quinto metodo, esta clase dejaria de satisfacer la interfaz y el typecheck
 *  caeria; si perdiera uno, los usos de abajo no compilarian. */
class RepositorioDoble implements OrderAssignmentRepository {
  readonly llamadas: string[] = []
  readonly filas: AssignmentRow[] = []
  readonly enLote: OrderAssignmentRowWithOrder[] = []
  readonly idsDePedido: string[] = []

  insertMissing(rows: readonly NewAssignment[], now: Date): Promise<number> {
    this.llamadas.push(`insertMissing:${rows.length}:${now.toISOString()}`)
    return Promise.resolve(rows.length)
  }

  listByOrderInCompany(companyId: string, orderId: string): Promise<readonly AssignmentRow[]> {
    this.llamadas.push(`listByOrderInCompany:${companyId}:${orderId}`)
    return Promise.resolve(this.filas)
  }

  // QC-102 T1 - la consulta EN LOTE, con `companyId` tambien PRIMERO (R3).
  listByOrdersInCompany(
    companyId: string,
    orderIds: readonly string[],
  ): Promise<readonly OrderAssignmentRowWithOrder[]> {
    // `String(...)` y no `.join(...)`: el caso NEGATIVO de tipos de abajo invoca este metodo con
    // la forma EQUIVOCADA a proposito, y el doble no debe reventar antes de que el test afirme.
    this.llamadas.push(`listByOrdersInCompany:${companyId}:${String(orderIds)}`)
    return Promise.resolve(this.enLote)
  }

  deleteOne(companyId: string, orderId: string, userId: string): Promise<'ok' | 'not_found'> {
    this.llamadas.push(`deleteOne:${companyId}:${orderId}:${userId}`)
    return Promise.resolve('ok')
  }

  deleteByWorkGroup(companyId: string, orderId: string, workGroupId: string): Promise<number> {
    this.llamadas.push(`deleteByWorkGroup:${companyId}:${orderId}:${workGroupId}`)
    return Promise.resolve(0)
  }

  // QC-88 T1 - los pedidos de UNA persona, con `companyId` tambien PRIMERO (R9).
  listOrderIdsByUserInCompany(companyId: string, userId: string): Promise<readonly string[]> {
    this.llamadas.push(`listOrderIdsByUserInCompany:${companyId}:${userId}`)
    return Promise.resolve(this.idsDePedido)
  }
}

const PUERTO_ABS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../lib/modules/asignaciones/ports/order-assignment-repository.ts',
)

describe('QC-87 T4 — `companyId` primero: el caso NEGATIVO de tipos (R7)', () => {
  it('`deleteOne` SIN `companyId` no compila', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `deleteOne` (R7): omitirlo y pasar
    // solo `(orderId, userId)` es un error de TIPOS, no un fallo en tiempo de ejecucion. Si algun
    // dia esta llamada compilara -porque alguien quitara `companyId` de la firma o lo hiciera
    // opcional-, `tsc` se pondria rojo por la directiva sin usar. Es la unica forma de demostrar
    // que el borrado no puede caer sobre la empresa equivocada.
    await repo.deleteOne(ORDER, USER)

    // Y la llamada CORRECTA, sin `@ts-expect-error`: si dejara de compilar, el puerto cambio.
    await expect(repo.deleteOne(COMPANY, ORDER, USER)).resolves.toBe('ok')
  })

  it('`listByOrderInCompany` y `deleteByWorkGroup` tampoco aceptan la forma sin empresa', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `listByOrderInCompany` (R7, R38).
    await repo.listByOrderInCompany(ORDER)

    // @ts-expect-error `companyId` es el PRIMER parametro de `deleteByWorkGroup` (R7, R32).
    await repo.deleteByWorkGroup(ORDER, GROUP)

    await expect(repo.listByOrderInCompany(COMPANY, ORDER)).resolves.toEqual([])
    await expect(repo.deleteByWorkGroup(COMPANY, ORDER, GROUP)).resolves.toBe(0)
  })

  it('QC-102 R3: `listByOrdersInCompany` SIN `companyId` tampoco compila', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `listByOrdersInCompany` (QC-102 R3):
    // pasar solo la lista de pedidos es un error de TIPOS. La consulta EN LOTE resuelve una pagina
    // entera de una vez, asi que olvidar la empresa aqui seria el fallo mas caro de los cinco
    // metodos: devolveria las asignaciones de TODAS las empresas para esos identificadores.
    await repo.listByOrdersInCompany([ORDER])

    // Y la llamada CORRECTA, sin `@ts-expect-error`.
    await expect(repo.listByOrdersInCompany(COMPANY, [ORDER])).resolves.toEqual([])
  })

  it('QC-88 R9: `listOrderIdsByUserInCompany` SIN `companyId` tampoco compila', async () => {
    const repo: OrderAssignmentRepository = new RepositorioDoble()

    // @ts-expect-error `companyId` es el PRIMER parametro de `listOrderIdsByUserInCompany` (QC-88
    // R9): pasar solo la persona es un error de TIPOS. Olvidar la empresa aqui devolveria los
    // pedidos que esa persona tiene asignados en TODAS las empresas, y esta lectura es justo la
    // que acota la pantalla de «mis pedidos»: la empresa entra por la asignacion, no por el pedido.
    await repo.listOrderIdsByUserInCompany(USER)

    // Y la llamada CORRECTA, sin `@ts-expect-error`.
    await expect(repo.listOrderIdsByUserInCompany(COMPANY, USER)).resolves.toEqual([])
  })

  it('la empresa llega al repositorio en la primera posicion, no se pierde por el camino', async () => {
    const repo = new RepositorioDoble()

    await repo.listByOrderInCompany(COMPANY, ORDER)
    await repo.listByOrdersInCompany(COMPANY, [ORDER])
    await repo.deleteOne(COMPANY, ORDER, USER)
    await repo.deleteByWorkGroup(COMPANY, ORDER, GROUP)
    await repo.listOrderIdsByUserInCompany(COMPANY, USER)

    expect(repo.llamadas).toEqual([
      `listByOrderInCompany:${COMPANY}:${ORDER}`,
      `listByOrdersInCompany:${COMPANY}:${ORDER}`,
      `deleteOne:${COMPANY}:${ORDER}:${USER}`,
      `deleteByWorkGroup:${COMPANY}:${ORDER}:${GROUP}`,
      `listOrderIdsByUserInCompany:${COMPANY}:${USER}`,
    ])
  })
})

describe('QC-87 T4 (+ QC-102 T1, QC-88 T1) — seis metodos y ni uno mas', () => {
  it('el doble que satisface la interfaz expone exactamente esos seis nombres', () => {
    const nombres = Object.getOwnPropertyNames(RepositorioDoble.prototype)
      .filter((n) => n !== 'constructor')
      .sort()

    expect(nombres).toEqual([
      'deleteByWorkGroup',
      'deleteOne',
      'insertMissing',
      'listByOrderInCompany',
      'listByOrdersInCompany',
      // QC-88 T1: la lectura de «los pedidos de esta persona» (R9).
      'listOrderIdsByUserInCompany',
    ])
  })

  it('el fuente no declara ningun `update*` ni ningun borrado masivo por pedido', () => {
    const fuente = readFileSync(PUERTO_ABS, 'utf8')
    const cuerpo = fuente.slice(fuente.indexOf('export interface OrderAssignmentRepository'))
    const metodos = [...cuerpo.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*)\(/gm)].map((m) => m[1])

    expect(metodos).toEqual([
      'insertMissing',
      'listByOrderInCompany',
      // QC-102 T1: el quinto, en el orden en que lo declara el puerto.
      'listByOrdersInCompany',
      'deleteOne',
      'deleteByWorkGroup',
      // QC-88 T1: el sexto, AL FINAL de la interfaz; los cinco anteriores no se reordenan.
      'listOrderIdsByUserInCompany',
    ])
    // QC-86 R8/R9: la asignacion se crea o se borra, NUNCA se edita.
    expect(metodos.filter((m) => m.startsWith('update'))).toEqual([])
    // `design.md > 10`, riesgo n.o 1: sin borrado masivo por pedido, «borrar y reinsertar» no es
    // expresable a traves de este puerto.
    expect(metodos).not.toContain('deleteByOrder')
    expect(metodos.filter((m) => m.startsWith('delete') && !/WorkGroup$|One$/.test(m))).toEqual([])
  })
})

describe('QC-87 T4 — el puerto es dominio puro', () => {
  it('no importa `@prisma/client` ni `next/*`: su cierre de imports esta VACIO', () => {
    const fuente = readFileSync(PUERTO_ABS, 'utf8')
    // Se mira el CODIGO, no los comentarios: la cabecera de este puerto nombra `@prisma/client`
    // justo para decir que no entra, y esa mencion no es una dependencia.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const imports = [...codigo.matchAll(/^\s*import\s[\s\S]*?from\s+'([^']+)'/gm)].map((m) => m[1])

    expect(imports).toEqual([])
    expect(codigo).not.toMatch(/@prisma\/client/)
    expect(codigo).not.toMatch(/'next\//)
    // Ni siquiera un `import type` suelto ni un `require`: el puerto no alcanza nada.
    expect(codigo).not.toMatch(/\bimport\b/)
    expect(codigo).not.toMatch(/\brequire\(/)
  })

  it('`NewAssignment` admite las DOS formas legales del CHECK de QC-86 (R7): juntos o ninguno', () => {
    const suelto: NewAssignment = {
      orderId: ORDER,
      userId: USER,
      companyId: COMPANY,
      workGroupId: null,
      workGroupName: null,
    }
    const deGrupo: NewAssignment = {
      orderId: ORDER,
      userId: USER,
      companyId: COMPANY,
      workGroupId: GROUP,
      workGroupName: 'Laboratorio',
    }

    expect(suelto.workGroupName).toBeNull()
    expect(deGrupo.workGroupName).toBe('Laboratorio')
  })
})

// ---------------------------------------------------------------------------
// QC-88 T2 — el ADAPTADOR de la lectura nueva (`design.md > 4`)
// ---------------------------------------------------------------------------
//
// HONESTIDAD: este bloque NO toca Postgres. El cliente Prisma esta sustituido por un doble que
// CAPTURA el argumento -mismo patron que `tests/unit/unidades/unit-prisma-where.test.ts`-, asi que
// lo que se prueba aqui es la FORMA de la consulta que sale del adaptador, no lo que la base
// devuelve. Que una asignacion de OTRA empresa no vuelva -y no se distinga de una inexistente- es
// de `tests/integration/asignaciones/assigned-orders.int.test.ts` (T3), contra base real.

const findMany = vi.fn(async () => [] as { orderId: string }[])

/** Cliente de mentira. El adaptador es una FABRICA justo para esto: recibe por argumento el cliente
 *  con el que hablar -el global o el transaccional- y no distingue cual le dan. */
const dbDoble = { orderAssignment: { findMany } } as unknown as PrismaClient

/** El unico argumento de la ultima consulta. */
function ultimaConsulta(): {
  where?: Record<string, unknown>
  select?: Record<string, unknown>
  orderBy?: unknown
  include?: unknown
} {
  const ultima = findMany.mock.calls.at(-1)
  if (ultima === undefined) throw new Error('el doble de Prisma no fue invocado')
  return (ultima as unknown as [Record<string, never>])[0]
}

describe('QC-88 T2 — `listOrderIdsByUserInCompany` en Prisma (R9, R10, R37)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('es UNA sola consulta, y lleva la persona Y la empresa en el `where`', async () => {
    const repo = createOrderAssignmentRepository(dbDoble)

    await repo.listOrderIdsByUserInCompany(COMPANY, USER)

    // Una, no dos: ni un `count` previo ni una segunda lectura para resolver nada.
    expect(findMany).toHaveBeenCalledTimes(1)
    // Igualdad ESTRICTA: si alguien anadiera aqui un filtro de estado o de vida del pedido, este
    // aserto cae. El estado lo filtra `pedidos` al leer los pedidos por estos identificadores
    // (`design.md > 5.3`); `order_assignments` no sabe en que estado esta un pedido.
    expect(ultimaConsulta().where).toEqual({ userId: USER, companyId: COMPANY })
  })

  it('el `select` trae SOLO `orderId`, y no hay ningun `include` (R37)', async () => {
    const repo = createOrderAssignmentRepository(dbDoble)

    await repo.listOrderIdsByUserInCompany(COMPANY, USER)
    const consulta = ultimaConsulta()

    expect(consulta.select).toEqual({ orderId: true })
    // R37 — el modulo compone en memoria. Un `include` aqui seria navegar una relacion que no
    // existe entre `orders` y `order_assignments`, y `tests/guards/guard-lote-sin-join.test.ts` da
    // hallazgo ante cualquier `include:` del modulo. Este aserto lo dice ademas en el sitio.
    expect(consulta.include).toBeUndefined()
    expect(JSON.stringify(consulta)).not.toContain('include')
  })

  it('el `orderBy` es `orderId` ascendente: determinismo ANTES de paginar, no el orden de la lista', async () => {
    const repo = createOrderAssignmentRepository(dbDoble)

    await repo.listOrderIdsByUserInCompany(COMPANY, USER)

    // Que este orden NO es el que ve quien mira: ordenar la pantalla por un uuid no le dice nada a
    // nadie. El orden de la lista lo pone `pedidos` (`design.md > 4`, `> 5.3`); esto solo garantiza
    // que dos lecturas iguales devuelvan la misma secuencia antes de cortar la pagina.
    expect(ultimaConsulta().orderBy).toEqual({ orderId: 'asc' })
  })

  it('devuelve los identificadores DESNUDOS, no las filas que leyo (R9)', async () => {
    const OTRO_PEDIDO = '55555555-5555-4555-8555-555555555555'
    findMany.mockResolvedValueOnce([{ orderId: ORDER }, { orderId: OTRO_PEDIDO }])
    const repo = createOrderAssignmentRepository(dbDoble)

    const ids = await repo.listOrderIdsByUserInCompany(COMPANY, USER)

    // Cadenas, no objetos: quien pregunta no puede leer de aqui el grupo ni el nombre congelado y
    // componer los responsables «de paso» -eso es `listByOrdersInCompany` y tiene su propio orden-.
    expect(ids).toEqual([ORDER, OTRO_PEDIDO])
    expect(ids.every((id) => typeof id === 'string')).toBe(true)
  })

  it('sin asignaciones devuelve la lista vacia, que no es un error', async () => {
    const repo = createOrderAssignmentRepository(dbDoble)

    // R8 en su parte de adaptador: «esta persona no tiene nada asignado» y «esa asignacion es de
    // otra empresa» se ven IGUAL desde aqui -una lista vacia-, y ninguna de las dos lanza.
    await expect(repo.listOrderIdsByUserInCompany(COMPANY, USER)).resolves.toEqual([])
  })
})
