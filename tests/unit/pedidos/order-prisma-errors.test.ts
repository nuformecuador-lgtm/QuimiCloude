// QC-34 R13 — `isDuplicateOrderNumber`, el UNICO `23505` que el adaptador driven sabe traducir.
//
// POR QUE ES UNITARIO Y NO DE INTEGRACION. Lo que se prueba aqui es el CRITERIO con el que
// `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` decide, y ese criterio
// tiene una mitad que la base casi nunca produce: un `23505` que NO es el del correlativo.
// Provocarlo contra Postgres exigiria un segundo indice unico en `orders`, que no existe. Con
// el error construido a mano se ejercitan las DOS ramas, y la que importa es la negativa: si
// el adaptador tradujera cualquier `23505` a `'duplicate_number'`, un duplicado de otra
// restriccion futura llegaria al usuario como «ese numero de pedido ya existe», que es mentira.
// Lo que no se sabe traducir se RELANZA (`design.md > 7.5`, R56).
//
// El camino feliz —que un alta con el correlativo ya ocupado devuelve `'duplicate_number'` en
// vez de lanzar— es de la base y lo cubren los tests de `tests/integration/pedidos/`.
//
// NUNCA SE AFIRMA SOBRE EL TEXTO HUMANO del mensaje: en esta maquina Postgres responde en
// espanol. El SQLSTATE se lee del campo ESTRUCTURADO (`meta.code`) y el NOMBRE DEL INDICE es un
// identificador de la base, que Postgres no traduce nunca.

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { isDuplicateOrderNumber } from '@/lib/modules/pedidos/adapters/driven/persistence/order-prisma'

/** El nombre REAL del indice unico del correlativo (QC-33 R21, `db/schema.prisma`). Se escribe
 *  aqui a mano a proposito: si alguien lo renombra en el esquema sin tocar el adaptador, este
 *  archivo sigue verde y el que se pone rojo es `schema/pedidos-migration.test.ts`, que es quien
 *  vigila el nombre. Aqui lo que se vigila es la DECISION, no el nombre. */
// QC-60 (R11): la unicidad pasa a medirse DENTRO de la empresa y el indice cambio de nombre.
const INDICE_DEL_CORRELATIVO = 'orders_company_year_sequence_key'

/**
 * Un error de un `$queryRaw` que viola una restriccion, tal como lo entrega el conector: llega
 * como `PrismaClientKnownRequestError` con `code: 'P2010'` y el SQLSTATE de Postgres en
 * `meta.code`. El detalle de la restriccion viaja en `meta.message` y/o en el mensaje crudo,
 * segun la ruta del conector, asi que los dos sitios son configurables.
 */
function errorDeConsultaCruda(options: {
  readonly sqlState: string
  readonly enMetaMessage?: string
  readonly enMensajeCrudo?: string
}): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    options.enMensajeCrudo ?? 'Se ha producido un error al ejecutar la consulta sin procesar',
    {
      code: 'P2010',
      clientVersion: 'test',
      meta: {
        code: options.sqlState,
        message: options.enMetaMessage ?? 'llave duplicada viola restriccion de unicidad',
      },
    },
  )
}

describe('QC-34 R13 — isDuplicateOrderNumber solo traduce el 23505 del correlativo', () => {
  it('un 23505 que nombra el indice del correlativo en `meta.message` SI es el duplicado', () => {
    const error = errorDeConsultaCruda({
      sqlState: '23505',
      enMetaMessage: `llave duplicada viola restriccion de unicidad «${INDICE_DEL_CORRELATIVO}»`,
    })

    expect(isDuplicateOrderNumber(error)).toBe(true)
  })

  it('un 23505 que nombra el indice solo en el mensaje crudo tambien SI es el duplicado', () => {
    // Misma condicion, otra ruta del conector: el nombre puede venir en el mensaje del error y
    // no en `meta.message`. Reconocer una sola de las dos dejaria altas legitimas explotando.
    const error = errorDeConsultaCruda({
      sqlState: '23505',
      enMetaMessage: 'llave duplicada viola restriccion de unicidad',
      enMensajeCrudo: `ERROR: duplicate key value violates unique constraint "${INDICE_DEL_CORRELATIVO}"`,
    })

    expect(isDuplicateOrderNumber(error)).toBe(true)
  })

  it('un 23505 SIN el nombre del indice NO se traduce: se relanza crudo', () => {
    // Es la mitad que importa. Sin ella, `isDuplicateOrderNumber` podria ser
    // `sqlStateOf(error) === '23505'` y este archivo seguiria verde.
    const error = errorDeConsultaCruda({ sqlState: '23505' })

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('un 23505 de OTRO indice de `orders` tampoco se traduce', () => {
    const error = errorDeConsultaCruda({
      sqlState: '23505',
      enMetaMessage: 'llave duplicada viola restriccion de unicidad «orders_pkey»',
    })

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('otro SQLSTATE no es el duplicado aunque nombre el indice del correlativo', () => {
    // Se decide por el SQLSTATE Y por el nombre: hacen falta los dos. Un `23503` (FK) que
    // mencionara el indice no puede colarse como duplicado del correlativo.
    const error = errorDeConsultaCruda({
      sqlState: '23503',
      enMetaMessage: `algo sobre «${INDICE_DEL_CORRELATIVO}»`,
    })

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('un error de Prisma SIN `meta.code` cae a su propio codigo, que no es un SQLSTATE', () => {
    // La API tipada traduce el SQLSTATE a `P2002` y lo pierde. Ese error NO se traduce aqui: el
    // alta de pedidos va por `$queryRaw` justamente para conservar el SQLSTATE.
    const error = new Prisma.PrismaClientKnownRequestError(
      `Unique constraint failed on the fields: (${INDICE_DEL_CORRELATIVO})`,
      { code: 'P2002', clientVersion: 'test' },
    )

    expect(isDuplicateOrderNumber(error)).toBe(false)
  })

  it('lo que no es un error de Prisma nunca es el duplicado', () => {
    expect(isDuplicateOrderNumber(new Error(`23505 ${INDICE_DEL_CORRELATIVO}`))).toBe(false)
    expect(isDuplicateOrderNumber(null)).toBe(false)
    expect(isDuplicateOrderNumber(undefined)).toBe(false)
    expect(isDuplicateOrderNumber('23505')).toBe(false)
  })
})
