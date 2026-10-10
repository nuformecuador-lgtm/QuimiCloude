// QC-223 2026-10-08 (TC) — Una entrega registrada no se modifica ni se borra desde la aplicacion.
//
// Barrido de `lib/` y `app/`: ningun `update`/`delete`/`upsert` de Prisma sobre `orderDelivery`,
// `orderDeliveryLine` ni el asiento (`inventoryMovement`), ningun `UPDATE`/`DELETE` crudo sobre sus
// tablas, y ningun caso de uso ni Server Action cuyo nombre ofrezca editar, anular o borrar una
// entrega. Las migraciones (`db/`) quedan fuera: su `down.sql` borra las tablas a proposito.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..', '..', '..')
const CARPETAS = ['lib', 'app'] as const

function soloCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n')
}

function fuentes(dir: string): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
      salida.push(...fuentes(ruta))
    } else if (/\.(ts|tsx)$/.test(entrada.name)) {
      salida.push(ruta)
    }
  }
  return salida
}

const PRISMA_MUTANTE = /\b(orderDelivery|orderDeliveryLine|inventoryMovement)\s*\.\s*(update|updateMany|delete|deleteMany|upsert)\b/g
const SQL_MUTANTE = /\b(UPDATE\s+(?:ONLY\s+)?|DELETE\s+FROM\s+(?:ONLY\s+)?)(?:"?public"?\.)?"?(order_deliveries|order_delivery_lines)\b/gi
const NOMBRE_MUTANTE = /\bexport\s+(?:async\s+)?(?:function|const)\s+(\w*(?:update|edit|delete|remove|cancel|annul|void|revert|undo)\w*Deliver\w*)/gi

/** Cada infraccion como `<archivo>: <texto>`, para que el rojo diga donde mirar. */
function infracciones(nombre: string, fuente: string): string[] {
  const codigo = soloCodigo(fuente)
  const salida: string[] = []
  for (const patron of [PRISMA_MUTANTE, SQL_MUTANTE, NOMBRE_MUTANTE]) {
    for (const m of codigo.matchAll(patron)) salida.push(`${nombre}: ${m[0].trim()}`)
  }
  return salida
}

describe('la entrega es solo de insercion (R32)', () => {
  it('R32: ningun camino de lib/ ni app/ modifica o borra una entrega, una linea de entrega ni su asiento', () => {
    const archivos = CARPETAS.flatMap((carpeta) => fuentes(join(RAIZ, carpeta)))
    expect(archivos.length, 'el barrido no encontro fuentes').toBeGreaterThan(100)
    expect(
      archivos.some((a) => a.endsWith(join('pedidos', 'adapters', 'driven', 'persistence', 'order-delivery-prisma.ts'))),
      'el adaptador de la entrega tiene que estar en el barrido',
    ).toBe(true)

    const encontradas = archivos.flatMap((archivo) =>
      infracciones(relative(RAIZ, archivo).replace(/\\/g, '/'), readFileSync(archivo, 'utf8')),
    )

    expect(encontradas).toEqual([])
  })

  it('R32: el barrido da rojo con un camino que modifica o borra (caso sintetico)', () => {
    const sintetico = [
      'await tx.orderDelivery.update({ where: { id }, data: { customerId } })',
      'await tx.orderDeliveryLine.deleteMany({ where: { orderDeliveryId: id } })',
      'await prisma.orderDelivery.upsert({ where: { id }, create: {}, update: {} })',
      'await tx.inventoryMovement.delete({ where: { id } })',
      'await tx.$executeRaw`UPDATE "order_deliveries" SET "customer_id" = ${c}`',
      'await tx.$executeRaw`DELETE FROM public.order_delivery_lines WHERE id = ${id}`',
      'export async function cancelOrderDeliveryAction(id: string) {}',
      'export const deleteDelivery = async () => {}',
    ].join('\n')

    expect(infracciones('sintetico.ts', sintetico)).toHaveLength(8)
  })

  it('R32: las lecturas, los INSERT y la prosa de un comentario no dan rojo', () => {
    const legitimo = [
      '// nunca se llama a orderDelivery.update ni a UPDATE order_deliveries',
      'await tx.orderDelivery.create({ data })',
      'await tx.orderDeliveryLine.createMany({ data: lines })',
      'await tx.orderDelivery.findFirst({ where: { deliveryKey } })',
      'await tx.$executeRaw`INSERT INTO "order_deliveries" ("id") VALUES (${id})`',
      'export async function deliverOrderAction() {}',
    ].join('\n')

    expect(infracciones('legitimo.ts', legitimo)).toEqual([])
  })
})
