// QC-156 B5 — El cliente NO sale de `pedidos` hacia Asignacion, Empaque ni Terminados (R22).
//
// Estatico: lo que `pedidos` publica a otros modulos es `OrderCatalog` y su adaptador. Ninguno de
// los dos puede nombrar el cliente, ni en sus tipos ni en el `select`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type {
  AssignedOrderPresentationLine,
  AssignedOrderSummary,
  FinishedGoodsReceipt,
  OrderAssignmentTarget,
} from '@/lib/modules/pedidos/domain/order-catalog'

const RAIZ = process.cwd()
const CATALOGO = join(RAIZ, 'lib/modules/pedidos/domain/order-catalog.ts')
const ADAPTADOR = join(RAIZ, 'lib/modules/pedidos/adapters/driven/persistence/order-catalog-prisma.ts')

/** Quita comentarios de bloque y de linea: un comentario que explique por que no esta el cliente
 *  no es publicarlo. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type SinCliente<T> = Extract<keyof T, `customer${string}` | `client${string}`> extends never ? true : false

describe('R22 — el catalogo de pedidos no publica el cliente', () => {
  it('R22: los tipos publicos de OrderCatalog no tienen ninguna clave customer* ni client*', () => {
    const resumen: SinCliente<AssignedOrderSummary> = true
    const linea: SinCliente<AssignedOrderPresentationLine> = true
    const objetivo: SinCliente<OrderAssignmentTarget> = true
    const recepcion: SinCliente<FinishedGoodsReceipt> = true
    expect([resumen, linea, objetivo, recepcion]).toEqual([true, true, true, true])
  })

  it('R22: ni order-catalog.ts ni order-catalog-prisma.ts nombran el cliente en su codigo', () => {
    for (const ruta of [CATALOGO, ADAPTADOR]) {
      const codigo = sinComentarios(readFileSync(ruta, 'utf8'))
      expect(codigo, ruta).not.toMatch(/customer/i)
      expect(codigo, ruta).not.toMatch(/cliente/i)
    }
  })

  it('R22: la sensibilidad del barrido: un select con customerId si se detecta', () => {
    const conCliente = 'const SUMMARY_SELECT = { id: true, customerId: true } // sin cliente'
    expect(sinComentarios(conCliente)).toMatch(/customer/i)
    expect(sinComentarios('// customerId fuera\nconst x = 1')).not.toMatch(/customer/i)
  })
})
