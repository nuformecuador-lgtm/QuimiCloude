// `isDuplicateOrderNumber`, el UNICO `23505` que el adaptador driven de pedidos sabe traducir.
//
// Los errores se fabrican con la FORMA REAL MEDIDA contra Postgres 16 con `lc_messages` en
// espanol: el `INSERT` crudo de `createOrder` devuelve `PrismaClientKnownRequestError` con
// `code: 'P2010'` y `meta = { code: '23505', message: 'Ya existe la llave (...)=(...)' }`, SIN
// nombre de indice. El choque se reconoce por el SQLSTATE estructurado y nunca por el texto.
//
// El choque autentico contra la base lo cubre
// `tests/integration/pedidos/order-duplicate-number.int.test.ts`.

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { isDuplicateOrderNumber } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'

/** Error de `$queryRaw` con la forma que entrega el conector: `P2010` y el SQLSTATE en `meta.code`. */
function errorDeConsultaCruda(sqlState: string, metaMessage: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.$queryRaw()\` invocation:\n\nRaw query failed. Code: \`${sqlState}\`. Message: \`${metaMessage}\``,
    {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: sqlState, message: metaMessage },
    },
  )
}

const DETALLE_REAL =
  'Ya existe la llave (company_id, order_year, order_sequence)=(01df7e4a-69ca-402c-8033-2ea252daed3a, 2026, 37).'

describe('isDuplicateOrderNumber reconoce el duplicado por el SQLSTATE, no por el texto', () => {
  it('el 23505 con la forma real medida (P2010, sin nombre de indice) SI es el duplicado', () => {
    expect(isDuplicateOrderNumber(errorDeConsultaCruda('23505', DETALLE_REAL))).toBe(true)
  })

  it('el 23505 se reconoce aunque el texto no diga nada reconocible', () => {
    expect(isDuplicateOrderNumber(errorDeConsultaCruda('23505', ''))).toBe(true)
  })

  it('una violacion de FK (23503) no es el duplicado', () => {
    expect(isDuplicateOrderNumber(errorDeConsultaCruda('23503', DETALLE_REAL))).toBe(false)
  })

  it('una violacion de CHECK (23514) no es el duplicado', () => {
    expect(isDuplicateOrderNumber(errorDeConsultaCruda('23514', 'orders_company_year_sequence_key'))).toBe(false)
  })

  it('un error de Prisma sin `meta.code` no es el duplicado, aunque su texto hable de unicidad', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (orders_company_year_sequence_key) 23505',
      { code: 'P2002', clientVersion: 'test' },
    )

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('un error desconocido del conector con 23505 solo en el texto no es el duplicado', () => {
    const error = new Prisma.PrismaClientUnknownRequestError('code: "23505" Ya existe la llave', {
      clientVersion: 'test',
    })

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('lo que no es un error de Prisma nunca es el duplicado', () => {
    expect(isDuplicateOrderNumber(new Error('23505 orders_company_year_sequence_key'))).toBe(false)
    expect(isDuplicateOrderNumber(null)).toBe(false)
    expect(isDuplicateOrderNumber(undefined)).toBe(false)
    expect(isDuplicateOrderNumber('23505')).toBe(false)
  })
})
