// QC-60 T16 — El punto unico de consulta y la forma de la salida publica (R18, R23).
//
// Dos cosas, y las dos se prueban en EJECUCION, no solo en texto:
//
//   1. R18: `orderCompanyScope` y `companyScopeColumns` son DOS envolturas de UNA definicion.
//      Existen solo para tipar -una para un `where` de Prisma, otra para lo que se escribe o se
//      parametriza en el SQL crudo del alta-, asi que para cualquier ambito tienen que devolver
//      EXACTAMENTE lo mismo. Si un dia divergieran, el listado y el alta dirian «de la empresa» de
//      dos maneras. La comprobacion por funcion de que TODA consulta pasa por ellas es de
//      `tests/guards/guard-ambito-empresa-pedidos.test.ts`; aqui se fija lo que devuelven.
//
//   2. R23: la empresa ENTRA en la consulta y NO VUELVE. Ni la vista del pedido, ni el resumen de
//      la lista, ni el alta, ni el estado de las Server Actions la llevan. Se prueba con una fila
//      que, en tiempo de ejecucion, SI trae `companyId` de mas -lo que pasaria si alguien anadiera
//      la columna al `select` del adaptador-: la salida tiene que seguir sin ella, porque los
//      mapeadores construyen campo a campo y no esparcen la fila.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import {
  companyScopeColumns,
  orderCompanyScope,
} from '@/lib/modules/pedidos/adapters/driven/persistence/company-scope'
import { toOrderRow } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'
import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { createGetOrder, toOrderView } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { fakeUnitOfWork } from '@/tests/helpers/order-unit-of-work-double'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderScope } from '@/lib/modules/pedidos/domain/order-scope'
import type { OrderRow } from '@/lib/modules/pedidos/domain/order-view'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'
import { fakePackagingCatalog } from '../../helpers/packaging-catalog-double';

const EMPRESA = '33333333-3333-4333-8333-333333333333'
const OTRA_EMPRESA = '44444444-4444-4444-8444-444444444444'
const PEDIDO = '11111111-1111-4111-8111-111111111111'
const RECETA = '22222222-2222-4222-8222-222222222222'
const PRESENTACION = '66666666-6666-4666-8666-666666666666'
/** QC-170 [Q4]: la unidad del pedido, obligatoria en el alta. */
const UNIDAD = '77777777-7777-4777-8777-777777777777'

const ACTOR: Actor = {
  id: 'u-1',
  companyId: EMPRESA,
  permissions: ['pedidos.consultar', 'pedidos.modificar'],
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Fuente SIN comentarios: se vigila el CODIGO, no la prosa que explica la regla. */
function codigoDe(...ruta: readonly string[]): string {
  return readFileSync(join(repoRoot, ...ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** Una fila del puerto que, en EJECUCION, trae `companyId` de contrabando. */
function filaConEmpresa(): OrderRow {
  const row = {
    id: PEDIDO,
    number: { year: 2026, sequence: 78 },
    recipeId: RECETA,
    quantity: '10.0000',
    priority: 'BAJA',
    status: 'PENDIENTE',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    updatedAt: new Date('2026-09-15T10:00:00.000Z'),
    createdBy: 'u-1',
    updatedBy: 'u-1',
    companyId: EMPRESA,
    presentationLines: [],
    unitId: null,
    customerId: null,
  }
  return row as OrderRow
}

/** Busca `companyId`/`company_id` en CUALQUIER nivel de un valor, y el uuid de la empresa como
 *  valor suelto: una salida que lo llevara con otro nombre tambien lo estaria exponiendo. */
function exponeEmpresa(valor: unknown): boolean {
  const texto = JSON.stringify(valor)
  return /companyId|company_id/i.test(texto) || texto.includes(EMPRESA)
}

describe('QC-60 R18 — las dos envolturas son UNA definicion', () => {
  const AMBITOS: readonly OrderScope[] = [
    { companyId: EMPRESA },
    { companyId: OTRA_EMPRESA },
    // Un valor raro tambien: la definicion no valida ni transforma, filtra. Si una envoltura
    // empezara a normalizar y la otra no, divergirian justo aqui.
    { companyId: '  ' },
  ]

  for (const scope of AMBITOS) {
    it(`para ${JSON.stringify(scope)} las dos devuelven exactamente el mismo objeto`, () => {
      const where = orderCompanyScope(scope)
      const columnas = companyScopeColumns(scope)

      expect(where).toStrictEqual(columnas)
      // Y es la condicion de verdad: solo la empresa, ni una clave mas, con el valor tal cual.
      expect(where).toStrictEqual({ companyId: scope.companyId })
      expect(Object.keys(columnas)).toEqual(['companyId'])
    })
  }

  it('las envolturas no devuelven el propio `scope` (no se puede mutar el ambito del caso de uso a traves de ellas)', () => {
    const scope: OrderScope = { companyId: EMPRESA }
    expect(orderCompanyScope(scope)).not.toBe(scope)
    expect(companyScopeColumns(scope)).not.toBe(scope)
  })

  it('en el codigo, las dos envolturas delegan en la MISMA funcion privada', () => {
    const codigo = codigoDe(
      'lib',
      'modules',
      'pedidos',
      'adapters',
      'driven',
      'persistence',
      'company-scope.ts',
    )
    expect(codigo.match(/return companyScope\(scope\);/g)).toHaveLength(2)
    expect(codigo.match(/\bscope\.companyId\b/g)).toHaveLength(1)
    expect(codigo).not.toMatch(/export\s+function\s+companyScope\b/)
  })
})

describe('QC-60 R23 — ninguna salida publica lleva la empresa', () => {
  it('el adaptador: `toOrderRow` no copia `companyId` aunque la fila de Prisma lo traiga', () => {
    const prismaRow = {
      id: PEDIDO,
      orderYear: 2026,
      orderSequence: 78,
      recipeId: RECETA,
      quantity: new Prisma.Decimal('10'),
      priority: 'BAJA',
      status: 'PENDIENTE',
      cancellationReason: null,
      ingredientsCost: null,
      createdAt: new Date('2026-09-15T10:00:00.000Z'),
      updatedAt: new Date('2026-09-15T10:00:00.000Z'),
      createdBy: 'u-1',
      updatedBy: 'u-1',
      companyId: EMPRESA,
      presentationLines: [],
    }
    const row = toOrderRow(prismaRow as unknown as Parameters<typeof toOrderRow>[0])
    expect(row).not.toHaveProperty('companyId')
    // Control: `createdBy` es 'u-1', no el uuid; si el mapeo fuera un spread, `exponeEmpresa`
    // lo veria por la clave.
    expect(exponeEmpresa(row)).toBe(false)
  })

  it('la vista del pedido (`toOrderView`) no la lleva', () => {
    const vista = toOrderView(
      filaConEmpresa(),
      new Map([
        [
          RECETA,
          { id: RECETA, name: 'Acido citrico 50%', ownName: 'Acido citrico 50%', isUnderReview: false, original: null, isDeleted: false },
        ],
      ]),
    )
    expect(vista).not.toHaveProperty('companyId')
    expect(exponeEmpresa(vista)).toBe(false)
  })

  it('la ficha, el resumen de la lista y el alta no la llevan, aunque el puerto la devolviera', async () => {
    const orders = {
      findAliveById: vi.fn(async () => filaConEmpresa()),
      listAlive: vi.fn(async () => ({
        items: [filaConEmpresa()],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      })),
    } as unknown as OrderRepository
    const { unitOfWork } = fakeUnitOfWork({
      orders: { create: vi.fn(async () => filaConEmpresa()), setReservedAt: vi.fn(async () => undefined) },
    })
    const recipes = {
      findRefsIncludingDeleted: vi.fn(async () => [
        { id: RECETA, name: 'Acido citrico 50%', ownName: 'Acido citrico 50%', isUnderReview: false, original: null, isDeleted: false },
      ]),
      findExecutionContentById: vi.fn(async () => ({
        id: RECETA,
        name: 'Acido citrico 50%',
        isDeleted: false,
        steps: [],
        lines: [],
      })),
    } as unknown as RecipeCatalog
    const products = {
      findRefs: vi.fn(async () => []),
      findCostingBatches: vi.fn(async () => []),
    } as unknown as ProductCatalog
    const units = {
      findRefs: vi.fn(async (ids: readonly string[]) =>
        ids.includes(UNIDAD) ? [{ id: UNIDAD, name: 'Unidad', symbol: null, baseUnitId: null, factor: null }] : [],
      ),
      findRefsSharingBaseInCompany: vi.fn(async () => []),
      findMassVolumeBridge: vi.fn(async () => null),
    } as unknown as UnitCatalog
    const presentations = {
      findRefs: vi.fn(async () => [{ id: PRESENTACION, name: 'Bidon 20L' }]),
    } as unknown as PresentationCatalog

    const ficha = await createGetOrder({ orders, recipes, presentations, packaging: fakePackagingCatalog(), units })(PEDIDO, ACTOR)
    const lista = await createListOrders({
      orders,
      recipes,
      presentations, packaging: fakePackagingCatalog(),
      units,
      log: { ignoredFields: vi.fn() },
    })({ page: 1 }, ACTOR)
    const alta = await createCreateOrder({ recipes, products, units, presentations, packaging: fakePackagingCatalog(), unitOfWork })(
      { recipeId: RECETA, quantity: '10.0000', unitId: UNIDAD },
      ACTOR,
    )

    // Controles: las salidas SON las de la fila (si fueran vacias, «no expone» seria vacuo).
    expect(ficha.id).toBe(PEDIDO)
    expect(lista.items.map((item) => item.id)).toEqual([PEDIDO])
    expect(alta.id).toBe(PEDIDO)

    for (const [nombre, salida] of [
      ['ficha', ficha],
      ['resumen de la lista', lista],
      ['alta', alta],
    ] as const) {
      expect(exponeEmpresa(salida), `${nombre} expone la empresa`).toBe(false)
    }
  })

  it('los TIPOS de salida no la declaran: OrderRow, OrderView/OrderSummary, CreatedOrder y los estados de las Server Actions', () => {
    // La mitad estatica: lo que no esta en el tipo no se puede devolver por accidente con un
    // literal nuevo, y un campo nuevo en el tipo aparece aqui antes que en el navegador.
    const vista = codigoDe('lib', 'modules', 'pedidos', 'domain', 'order-view.ts')
    expect(vista).not.toMatch(/companyId|company_id/)

    const alta = codigoDe('lib', 'modules', 'pedidos', 'domain', 'create-order.ts')
    const createdOrder = alta.slice(alta.indexOf('export type CreatedOrder'))
    expect(createdOrder.slice(0, createdOrder.indexOf('};'))).not.toMatch(/companyId/)

    const actions = codigoDe('lib', 'modules', 'pedidos', 'adapters', 'driving', 'order-actions.ts')
    for (const tipo of [
      'CreateOrderFormState',
      'OrderMutationFormState',
      'OrderQueryResult',
      'OrderListResult',
    ]) {
      const desde = actions.indexOf(`export type ${tipo}`)
      expect(desde, `falta el tipo ${tipo}`).toBeGreaterThan(-1)
      const declaracion = actions.slice(desde, actions.indexOf(';', desde))
      expect(declaracion, `${tipo} declara la empresa`).not.toMatch(/companyId|company_id/)
    }

    // En las actions, la empresa aparece SOLO donde se construye el actor. Ningun `return` de una
    // action la menciona.
    const inicioActor = actions.indexOf('async function currentActor(')
    const finActor = actions.indexOf('\n}', inicioActor)
    const fuera = actions.slice(0, inicioActor) + actions.slice(finActor)
    expect(fuera, 'la empresa aparece fuera de currentActor').not.toMatch(/companyId/)
  })
})
