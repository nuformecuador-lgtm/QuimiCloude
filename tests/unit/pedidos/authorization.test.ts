// T12 (QC-34) — Autorizacion de los SEIS casos de uso (R1, R2, R3, R4).
//
// `docs/architecture.md > Acceso a datos y autorizacion` es explicito: Prisma se conecta como
// dueno de las tablas y no setea `auth.uid()`, asi que las policies de RLS que QC-33 dejo
// activadas y FORZADAS en `orders` no filtran NINGUNA consulta de esta app. La frontera real
// es el caso de uso (R7). Un permiso que solo existiera como policy no estaria implementado, y
// un `requireAdmin` que se saltara UNO de los seis seria justo el agujero que este archivo
// existe para encontrar.
//
// POR QUE LOS DOBLES EXPLOTAN. Los tres puertos -el repositorio de pedidos y los contratos
// `RecipeCatalog` y `UnitCatalog`- FALLAN SI LOS LLAMAN. No basta con que la operacion lance
// `UnauthorizedError`: tiene que lanzarlo SIN HABER TOCADO NADA (R2). Con dobles permisivos,
// un caso de uso que comprobara el rol DESPUES de leer la fila pasaria verde, y el Operador
// habria leido igual — que es exactamente lo que la decision cerrada 1 prohibe, tambien al
// consultar y al listar.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { ROLE_ADMINISTRADOR } from '@/lib/modules/identity'
import { createCancelOrder } from '@/lib/modules/pedidos/domain/cancel-order'
import { createCreateOrder } from '@/lib/modules/pedidos/domain/create-order'
import { createDeleteOrder } from '@/lib/modules/pedidos/domain/delete-order'
import { UnauthorizedError } from '@/lib/modules/pedidos/domain/errors'
import { createGetOrder } from '@/lib/modules/pedidos/domain/get-order'
import { createListOrders } from '@/lib/modules/pedidos/domain/list-orders'
import { createUpdateOrder } from '@/lib/modules/pedidos/domain/update-order'

import type { Actor } from '@/lib/modules/pedidos/domain/actor'
import type { OrderRepository } from '@/lib/modules/pedidos/ports/order-repository'
import type { RecipeCatalog } from '@/lib/modules/recetas'
import type { UnitCatalog } from '@/lib/modules/unidades'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const RECIPE_ID = '22222222-2222-4222-8222-222222222222'
const UNIT_ID = '33333333-3333-4333-8333-333333333333'

const ENTRADA_ALTA = {
  recipeId: RECIPE_ID,
  quantity: '10.0000',
  unitId: UNIT_ID,
  unitPrice: '2.5000',
}
const ENTRADA_EDICION = { ...ENTRADA_ALTA, status: 'EN_CURSO' }

/** Los tres dobles. Cada metodo explota si alguien lo llama. */
function dobles() {
  const explota = (nombre: string) =>
    vi.fn(() => {
      throw new Error(`el puerto ${nombre} no debe llamarse sin autorizacion`)
    })

  const orders = {
    create: explota('orders.create'),
    findAliveById: explota('orders.findAliveById'),
    listAlive: explota('orders.listAlive'),
    updateAlive: explota('orders.updateAlive'),
    cancelAlive: explota('orders.cancelAlive'),
    softDeleteAlive: explota('orders.softDeleteAlive'),
  } as unknown as OrderRepository

  const recipes = {
    findRefsIncludingDeleted: explota('recipes.findRefsIncludingDeleted'),
  } as unknown as RecipeCatalog

  const units = { findRefs: explota('units.findRefs') } as unknown as UnitCatalog

  const llamadas = () =>
    [
      ...Object.values(orders as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(recipes as unknown as Record<string, ReturnType<typeof vi.fn>>),
      ...Object.values(units as unknown as Record<string, ReturnType<typeof vi.fn>>),
    ] as readonly ReturnType<typeof vi.fn>[]

  return { orders, recipes, units, llamadas }
}

/** Los seis casos de uso, cada uno invocado con el actor que se le pase. */
function operaciones(actor: Actor | null | undefined) {
  const { orders, recipes, units, llamadas } = dobles()
  const deps = { orders, recipes, units }

  return {
    llamadas,
    seis: [
      ['createOrder', () => createCreateOrder(deps)(ENTRADA_ALTA, actor)],
      ['getOrder', () => createGetOrder(deps)(ORDER_ID, actor)],
      ['listOrders', () => createListOrders(deps)({ page: 1 }, actor)],
      ['updateOrder', () => createUpdateOrder(deps)(ORDER_ID, ENTRADA_EDICION, actor)],
      ['cancelOrder', () => createCancelOrder({ orders })(ORDER_ID, { reason: 'sin stock' }, actor)],
      ['deleteOrder', () => createDeleteOrder({ orders })(ORDER_ID, actor)],
    ] as readonly (readonly [string, () => Promise<unknown>])[],
  }
}

/**
 * Los actores que NO pueden operar (R2, R3). Falla CERRADO: la ausencia de rol no es permiso,
 * y la comparacion es de igualdad exacta, asi que «Administradores externos» tampoco se cuela.
 */
const RECHAZADOS: readonly (readonly [string, Actor | null | undefined])[] = [
  ['Operador', { id: 'op-1', roleName: 'Operador' }],
  ['sin actor (null)', null],
  ['sin actor (undefined)', undefined],
  ['rol nulo', { id: 'u-1', roleName: null }],
  ['rol vacio', { id: 'u-2', roleName: '' }],
  ['rol desconocido', { id: 'u-3', roleName: 'Supervisor' }],
  ['rol que CONTIENE el nombre bueno', { id: 'u-4', roleName: 'Administradores externos' }],
]

describe('QC-34 — los seis casos de uso solo los ejecuta un Administrador (R1-R4)', () => {
  for (const [quien, actor] of RECHAZADOS) {
    it(`${quien}: los seis rechazan y NO tocan ningun puerto`, async () => {
      for (let i = 0; i < 6; i += 1) {
        // Cada caso de uso estrena sus propios dobles, para que el contador de uno no
        // arrastre el del anterior.
        const { seis, llamadas } = operaciones(actor)
        const [nombre, operacion] = seis[i] as readonly [string, () => Promise<unknown>]

        const error = await operacion().then(
          () => null,
          (e: unknown) => e,
        )

        expect(error, nombre).toBeInstanceOf(UnauthorizedError)
        // Se afirma sobre el CODE de la clase, nunca sobre el texto del mensaje (R56).
        expect((error as UnauthorizedError).code, nombre).toBe('unauthorized')

        for (const doble of llamadas()) {
          expect(doble, `${nombre}: ningun puerto se toca sin autorizacion`).not.toHaveBeenCalled()
        }
      }
    })
  }

  it('los seis nombres estan cubiertos: la lista no se queda corta por un renombrado', () => {
    // Sin esto, borrar una fila de `operaciones` dejaria el bucle verde con cinco.
    expect(operaciones(null).seis.map(([nombre]) => nombre)).toEqual([
      'createOrder',
      'getOrder',
      'listOrders',
      'updateOrder',
      'cancelOrder',
      'deleteOrder',
    ])
  })
})

// ---------------------------------------------------------------------------------------
// La comprobacion ESTRUCTURAL: `requireAdmin` es la PRIMERA linea, antes de `zod` y antes de
// tocar ningun puerto. Los dobles que explotan ya lo demuestran en ejecucion; esto lo fija
// tambien en la forma del archivo, para que un refactor que mueva la llamada tres lineas mas
// abajo se vea aqui aunque los dobles siguieran sin llamarse por casualidad.
// ---------------------------------------------------------------------------------------

const domainDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'lib',
  'modules',
  'pedidos',
  'domain',
)

const SEIS_ARCHIVOS = [
  'create-order.ts',
  'get-order.ts',
  'list-orders.ts',
  'update-order.ts',
  'cancel-order.ts',
  'delete-order.ts',
] as const

/** Fuente sin comentarios: lo que se vigila es el CODIGO, no la prosa. */
function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** El cuerpo de la funcion DEVUELTA por la factory: lo de arriba corre al cablear, no al
 *  ejecutar la operacion, y por eso no cuenta como «antes de `requireAdmin`». */
function cuerpoDelCasoDeUso(fuente: string): string {
  const inicio = soloCodigo(fuente).indexOf('return async function')
  expect(inicio).toBeGreaterThan(-1)
  return soloCodigo(fuente).slice(inicio)
}

describe('QC-34 — requireAdmin es la primera linea de los seis (R2, R3)', () => {
  for (const archivo of SEIS_ARCHIVOS) {
    it(`${archivo}: requireAdmin va antes de zod y antes de cualquier puerto`, () => {
      const cuerpo = cuerpoDelCasoDeUso(readFileSync(join(domainDir, archivo), 'utf8'))

      const autorizacion = cuerpo.indexOf('requireAdmin(actor)')
      expect(autorizacion, 'requireAdmin(actor) tiene que estar').toBeGreaterThan(-1)

      const validacion = cuerpo.indexOf('safeParse')
      if (validacion > -1) expect(autorizacion).toBeLessThan(validacion)

      const primerPuerto = cuerpo.search(/\bdeps\s*\.\s*(orders|recipes|units)\b/)
      expect(primerPuerto, 'algun puerto tiene que usarse').toBeGreaterThan(-1)
      expect(autorizacion).toBeLessThan(primerPuerto)
    })
  }

  it('el literal del rol no vive en pedidos: sale del contrato de identity (R4)', () => {
    // Hoy hay cuatro copias del literal en el repo y retirarlas es otra ficha; `pedidos` nace
    // del lado correcto sin anadir la quinta.
    for (const archivo of [...SEIS_ARCHIVOS, 'actor.ts']) {
      const codigo = soloCodigo(readFileSync(join(domainDir, archivo), 'utf8'))
      expect(codigo, archivo).not.toContain("'Administrador'")
    }
    expect(ROLE_ADMINISTRADOR).toBe('Administrador')
  })
})
