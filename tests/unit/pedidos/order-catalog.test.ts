// QC-87 T2 (R45, R46) — `OrderCatalog`: la consulta por id que `pedidos` publica para que
// `asignaciones` sepa el ESTADO de un pedido sin tocar `prisma.order`.
//
// HONESTIDAD: este archivo NO toca Postgres. El cliente Prisma esta sustituido por un DOBLE
// que se comporta como la base —aplica el `where` que le llega— y guarda los argumentos; lo
// que se prueba es el CONTRATO (que exista `findAliveById`, que `OrderAssignmentTarget` lleve
// solo `id` y `status`), el MAPEO y la FORMA de la consulta —en particular el
// `deleted_at IS NULL` en el `where`, que es lo que hace que «dado de baja» y «no existe»
// sean el mismo `null` (QC-34 R33)—. Que la base respete ese filtro lo cubren los tests de
// integracion de `pedidos`.
//
// MUTACION COMPROBADA (2026-09-13): quitando `deletedAt: null` del `where` del adaptador, el
// caso «pedido dado de baja -> null» se pone ROJO, porque el doble deja de recibir el filtro y
// devuelve entonces la fila del pedido de baja. Salida anotada en la bitacora.
//
// Es un cambio ADITIVO en `pedidos`: el ultimo bloque afirma que los seis casos de uso de
// QC-34 y su tabla de transiciones siguen ahi y que el barrel no perdio nada.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InvalidTransitionError } from '@/lib/modules/pedidos'
import type { OrderAssignmentTarget } from '@/lib/modules/pedidos'

/** Doble del cliente Prisma. */
const findFirst = vi.fn()
const updateMany = vi.fn()
vi.mock('@/lib/shared/db/prisma', () => ({ prisma: { order: { findFirst, updateMany } } }))

const {
  findAliveOrderTargetById,
  toAssignedOrderSummary,
  toOrderAssignmentTarget,
  transitionAliveOrder,
} = await import('@/lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma')

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

/** Fuente SIN comentarios: lo que se vigila es el codigo, no la prosa (mismo helper y misma
 *  razon que `tests/unit/recetas/recipe-catalog.test.ts`). */
function read(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
const pedidosDir = join(repoRoot, 'lib', 'modules', 'pedidos')
const contratoFuente = read(join(pedidosDir, 'index.ts'))
const catalogoFuente = read(join(pedidosDir, 'domain', 'order-catalog.ts'))
const adaptadorFuente = read(
  join(pedidosDir, 'adapters', 'driven', 'persistence', 'order-catalog-prisma.ts'),
)

// Los dos dobles van TIPADOS a `OrderAssignmentTarget`: su `status` es el `OrderStatus` del
// dominio, no un `string`. Antes eran objetos literales sin tipo y por eso el estado
// inventado `'EN_PROCESO'` -que NO esta en `ORDER_STATUS_VALUES`- compilaba sin queja. Atado
// asi, un estado que no exista en el enum pone el typecheck en rojo.
/** QC-60: el catalogo se acota por empresa, asi que el doble recibe una y el `where` la lleva. */
const EMPRESA = 'c-1'

const PEDIDO_VIVO: OrderAssignmentTarget = { id: 'o-viva', status: 'PENDIENTE' }
const PEDIDO_DE_BAJA: OrderAssignmentTarget = { id: 'o-baja', status: 'EN_CURSO' }

/**
 * Doble que se comporta como la base: aplica el `where` que le llega. Si el adaptador pide
 * `deletedAt: null`, el pedido de baja no aparece; si dejara de pedirlo, aparece —y ahi es
 * donde el test cae al mutar—.
 */
function baseConUnPedidoVivoYUnoDeBaja(): void {
  findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    const filas = [
      { fila: PEDIDO_VIVO, borrado: null as Date | null },
      { fila: PEDIDO_DE_BAJA, borrado: new Date('2026-03-03') },
    ]
    // QC-60: el ambito entra como termino propio de un `AND`, nunca fundido con lo demas, asi
    // que el doble aplana los terminos antes de decidir -igual que hace Postgres-.
    const terminos = Array.isArray(args.where.AND)
      ? (args.where.AND as readonly Record<string, unknown>[])
      : [args.where]
    const where: Record<string, unknown> = Object.assign({}, ...terminos)
    const encontrada = filas.find((candidata) => candidata.fila.id === where.id)
    if (encontrada === undefined) return null
    const filtraBorrados = 'deletedAt' in where && where.deletedAt === null
    if (filtraBorrados && encontrada.borrado !== null) return null
    return encontrada.fila
  })
}

beforeEach(() => {
  findFirst.mockReset()
  updateMany.mockReset()
})

describe('contrato OrderCatalog', () => {
  it('el dominio declara findAliveById y un OrderAssignmentTarget con SOLO id y status', () => {
    // Se afirma sobre el TEXTO y no en ejecucion a proposito: `OrderCatalog` y
    // `OrderAssignmentTarget` son SOLO TIPOS y desaparecen al compilar.
    expect(catalogoFuente).toMatch(/export interface OrderCatalog \{/)
    expect(catalogoFuente).toMatch(
      /findAliveById\(id: string, companyId: string\): Promise<OrderAssignmentTarget \| null>/,
    )
    expect(catalogoFuente).toMatch(/export type OrderAssignmentTarget = \{/)
    // El estado es el enum de QC-34 IMPORTADO, no una segunda lista copiada. La asercion tolera
    // cualquier orden de nombres dentro del mismo `import type { ... } from`.
    expect(catalogoFuente).toMatch(
      /import type \{ [^}]*\bOrderStatus\b[^}]* \} from '\.\/order-classification'/,
    )
    // Ni el numero, ni la receta, ni las cantidades: lo que no esta en el tipo no se filtra.
    // Acotado al bloque de `OrderAssignmentTarget`: `AssignedOrderSummary`, mas abajo en el MISMO
    // archivo, SI lleva `recipeId`/`quantity`/`priority` a proposito, asi que buscar en el archivo
    // entero daria un falso rojo.
    const bloqueOrderAssignmentTarget = catalogoFuente.slice(
      catalogoFuente.indexOf('export type OrderAssignmentTarget'),
      catalogoFuente.indexOf('export interface OrderCatalog'),
    )
    for (const campo of ['orderYear', 'orderSequence', 'recipeId', 'quantity', 'priority']) {
      expect(bloqueOrderAssignmentTarget, `OrderAssignmentTarget expone ${campo}`).not.toMatch(
        new RegExp(`\\b${campo}\\b`),
      )
    }
    // Contrato puro: ni Prisma ni implementacion en el dominio.
    expect(catalogoFuente).not.toMatch(/@prisma\/client|prisma\./)
  })

  it('el barrel de pedidos reexporta los dos simbolos como TIPO y no el adaptador (R46)', () => {
    expect(contratoFuente).toMatch(
      /export type \{[^}]*\bOrderCatalog\b[^}]*\} from '\.\/domain\/order-catalog'/,
    )
    expect(contratoFuente).toMatch(/export type \{[^}]*\bOrderAssignmentTarget\b[^}]*\}/)
    // Son tipos: `export type`, nunca un `export {` de valor que arrastrara codigo.
    expect(contratoFuente).not.toMatch(/export \{[^}]*\bOrderCatalog\b/)
    // Y el adaptador NO se nombra en el barrel: arrastraria `@prisma/client` a su cierre.
    expect(contratoFuente).not.toMatch(/order-catalog-prisma/)
    expect(contratoFuente).not.toMatch(/@prisma\/client/)
  })

  it('NO se reutiliza OrderRepository: el catalogo es un contrato hacia fuera', () => {
    expect(catalogoFuente).not.toMatch(/order-repository|OrderRepository/)
    expect(adaptadorFuente).not.toMatch(/order-repository|OrderRepository/)
  })
})

describe('toOrderAssignmentTarget', () => {
  it('devuelve el id y el estado, y nada mas', () => {
    expect(toOrderAssignmentTarget({ id: 'o-1', status: 'ENTREGADO' })).toEqual({
      id: 'o-1',
      status: 'ENTREGADO',
    })
    expect(Object.keys(toOrderAssignmentTarget({ id: 'o-1', status: 'ENTREGADO' }))).toEqual([
      'id',
      'status',
    ])
  })
})

describe('toAssignedOrderSummary — el resumen publicado lleva la presentacion', () => {
  it('R27: copia presentationId tal cual, con y sin presentacion', () => {
    const conPresentacion = toAssignedOrderSummary({
      id: 'o-1',
      orderYear: 2026,
      orderSequence: 7,
      recipeId: 'r-1',
      quantity: { toFixed: () => '10.0000' },
      priority: 'MEDIA',
      status: 'PENDIENTE',
      presentationId: 'p-1',
    })
    expect(conPresentacion.presentationId).toBe('p-1')

    const sinPresentacion = toAssignedOrderSummary({
      id: 'o-2',
      orderYear: 2026,
      orderSequence: 8,
      recipeId: 'r-1',
      quantity: { toFixed: () => '10.0000' },
      priority: 'MEDIA',
      status: 'PENDIENTE',
      presentationId: null,
    })
    expect(sinPresentacion.presentationId).toBeNull()
  })
})

describe('findAliveOrderTargetById', () => {
  it('un pedido vivo vuelve como {id, status}', async () => {
    baseConUnPedidoVivoYUnoDeBaja()

    await expect(findAliveOrderTargetById('o-viva', EMPRESA)).resolves.toEqual({
      id: 'o-viva',
      status: 'PENDIENTE',
    })
  })

  it('un pedido dado de baja vuelve como null, igual que uno que no existe (QC-34 R33)', async () => {
    baseConUnPedidoVivoYUnoDeBaja()

    // MUTACION: si el adaptador quitara `deletedAt: null` del `where`, el doble devolveria la
    // fila de baja y esta asercion se pondria roja.
    await expect(findAliveOrderTargetById('o-baja', EMPRESA)).resolves.toBeNull()
    await expect(findAliveOrderTargetById('o-fantasma', EMPRESA)).resolves.toBeNull()
  })

  it('el filtro de vida va en el WHERE, no en un if posterior (R40)', async () => {
    baseConUnPedidoVivoYUnoDeBaja()

    await findAliveOrderTargetById('o-viva', EMPRESA)

    const args = findFirst.mock.calls[0]?.[0]
    expect(args.where).toEqual({
      AND: [{ companyId: EMPRESA }, { id: 'o-viva', deletedAt: null }],
    })
    // Y el `select` pide DOS columnas: el tipo publico no lleva ninguna mas.
    expect(args.select).toEqual({ id: true, status: true })
  })

  it('hace UNA sola consulta', async () => {
    baseConUnPedidoVivoYUnoDeBaja()

    await findAliveOrderTargetById('o-viva', EMPRESA)

    expect(findFirst).toHaveBeenCalledTimes(1)
  })
})

describe('el cambio es ADITIVO: pedidos no gano ningun caso de uso ni perdio nada', () => {
  it('las SEIS factories de QC-34 y la tabla de transiciones siguen publicadas', () => {
    const anteriores = [
      'createCreateOrder',
      'createGetOrder',
      'createListOrders',
      'createUpdateOrder',
      'createCancelOrder',
      'createDeleteOrder',
      'assertTransition',
      'isAllowedTransition',
      'requirePermission',
      'ORDER_STATUS_VALUES',
    ]
    for (const simbolo of anteriores) {
      expect(contratoFuente, `el barrel dejo de exportar ${simbolo}`).toMatch(
        new RegExp(`\\b${simbolo}\\b`),
      )
    }
  })

  it('el catalogo no anade ninguna factory: es un tipo y una interfaz', () => {
    expect(catalogoFuente).not.toMatch(/export (async )?function|export const create/)
  })
})

describe('transitionAliveOrder', () => {
  const AHORA = new Date('2026-09-17T12:00:00Z')

  it('T1(a) - mueve PENDIENTE->EN_CURSO y EN_CURSO->ENTREGADO', async () => {
    updateMany.mockResolvedValue({ count: 1 })

    await expect(
      transitionAliveOrder('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('ok')
    await expect(
      transitionAliveOrder('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA),
    ).resolves.toBe('ok')

    expect(updateMany).toHaveBeenCalledTimes(2)
    const primeraLlamada = updateMany.mock.calls[0]?.[0]
    expect(primeraLlamada.where).toEqual({
      AND: [{ companyId: EMPRESA }, { id: 'o-1', deletedAt: null, status: 'PENDIENTE' }],
    })
    expect(primeraLlamada.data).toEqual({
      status: 'EN_CURSO',
      updatedAt: AHORA,
      updatedBy: 'actor-1',
    })
  })

  it('R3 - a ENTREGADO lleva finishedAt en el mismo data; a EN_CURSO no', async () => {
    updateMany.mockResolvedValue({ count: 1 })

    await transitionAliveOrder('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA)
    await transitionAliveOrder('o-1', EMPRESA, 'EN_CURSO', 'ENTREGADO', 'actor-1', AHORA)

    const [aEnCurso, aEntregado] = updateMany.mock.calls
    expect(aEnCurso?.[0]?.data).not.toHaveProperty('finishedAt')
    expect(aEntregado?.[0]?.data).toEqual({
      status: 'ENTREGADO',
      updatedAt: AHORA,
      updatedBy: 'actor-1',
      finishedAt: AHORA,
    })
  })

  it('T1(b) - ENTREGADO->EN_CURSO lanza InvalidTransitionError SIN escribir', async () => {
    await expect(
      transitionAliveOrder('o-1', EMPRESA, 'ENTREGADO', 'EN_CURSO', 'actor-1', AHORA),
    ).rejects.toBeInstanceOf(InvalidTransitionError)

    expect(updateMany).not.toHaveBeenCalled()
  })

  it('T1(c) - devuelve not_found cuando el pedido es de otra empresa', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findFirst.mockResolvedValue(null)

    await expect(
      transitionAliveOrder('o-ajeno', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('not_found')
  })

  it('T1(d) - devuelve stale si el from ya no coincide con el estado actual', async () => {
    updateMany.mockResolvedValue({ count: 0 })
    findFirst.mockResolvedValue({ id: 'o-1', status: 'EN_CURSO' })

    await expect(
      transitionAliveOrder('o-1', EMPRESA, 'PENDIENTE', 'EN_CURSO', 'actor-1', AHORA),
    ).resolves.toBe('stale')
  })
})
