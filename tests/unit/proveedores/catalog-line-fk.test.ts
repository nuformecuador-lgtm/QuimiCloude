// T13 (QC-52) — Traduccion de las violaciones de restriccion de la linea del catalogo.
//
// Cubre R10, R15 y R32. Son las dos funciones PURAS del adaptador driven: la que reconoce
// el duplicado del indice unico parcial y la que clasifica una violacion de clave foranea.
// Se prueban aqui, sin base, porque son puras y porque asi se pueden probar los nombres de
// restriccion que el conector NO entrega hoy (ver la nota de abajo).
//
// LO QUE ESTE ARCHIVO NO DEMUESTRA, Y DONDE SE DEMUESTRA. Que la BASE rechaza de verdad
// -el 23505 del indice, el 23503 de las FK, el 23514 de los tres CHECK- se prueba contra
// Postgres real en `tests/integration/proveedores/catalog-line.int.test.ts`. Un test de
// funciones puras no puede decir nada sobre eso: seguiria verde con el indice borrado.
//
// HALLAZGO EMPIRICO (2026-09-04, Prisma 6.19.3) que hay que leer antes de tocar
// `classifyForeignKeyViolation`. `design.md > 6.2` pide traducir el `P2003` de
// `presentation_id`/`unit_id` a `invalid_input` y relanzar crudo el de
// `created_by`/`updated_by`, decidiendo por `meta.field_name`. Se comprobo contra la base
// de desarrollo que HOY el conector no entrega ningun nombre: todo `P2003` llega con
// `meta = { modelName, constraint: null }`, tanto si la FK esta declarada con `@relation`
// como si es un escalar, y tanto en `supplier_catalog_lines` como en `products` -o sea que
// el precedente de `inventario` al que apunta el diseno esta en la misma situacion-.
//
// Consecuencia: en ejecucion el adaptador RELANZA CRUDO los cuatro casos, y eso es lo que
// afirma el test de integracion. La clasificacion de aqui es correcta y empezara a traducir
// sola en cuanto el conector diga el nombre; lo que NO se hace es traducir a ciegas -asumir
// que todo `P2003` de esta tabla es la presentacion-, porque le diria `invalid_input` al
// usuario cuando el fallo fuera del autor.

import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  classifyForeignKeyViolation,
  isDuplicateLineViolation,
  isSupplierForeignKeyViolation,
} from '@/lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma'

/** Error de Prisma como el conector lo construye, con el `meta` que se quiera probar. */
function prismaError(code: string, meta: Record<string, unknown>): unknown {
  return new Prisma.PrismaClientKnownRequestError('violacion de restriccion', {
    code,
    clientVersion: '6.19.3',
    meta,
  })
}

describe('clasificacion de las violaciones de restriccion de la linea (QC-52 T13)', () => {
  it('reconoce el duplicado del indice unico parcial por sus columnas y por su nombre', () => {
    // R15. El indice `supplier_catalog_lines_name_presentation_unique` es PARCIAL y esta
    // escrito a mano en la migracion, asi que Prisma no lo conoce. Se aceptan las dos formas
    // en las que el conector puede reportar el objetivo de un 23505 -la lista de columnas y
    // el nombre del indice- porque cual de las dos manda depende de si el indice esta o no
    // en el esquema, y este no lo esta.
    for (const target of [
      ['supplier_id', 'name_normalized', 'presentation_id'],
      'supplier_catalog_lines_name_presentation_unique',
      ['name_normalized'],
    ]) {
      expect(
        isDuplicateLineViolation(prismaError('P2002', { target })),
        `deberia reconocer el duplicado con target ${JSON.stringify(target)}`,
      ).toBe(true)
    }

    // Y NO se traduce lo que no es un duplicado de esta tabla: sin `target`, con otro codigo
    // o con un error que no es de Prisma, se devuelve `false` y quien llama relanza crudo.
    // Es el mismo criterio conservador de `supplier-prisma.ts`: mejor un error crudo que uno
    // traducido mal.
    expect(isDuplicateLineViolation(prismaError('P2002', {}))).toBe(false)
    expect(isDuplicateLineViolation(prismaError('P2003', { constraint: null }))).toBe(false)
    expect(isDuplicateLineViolation(new Error('cualquier otra cosa'))).toBe(false)
    expect(isDuplicateLineViolation(null)).toBe(false)
  })

  it('clasifica cada clave foranea de la linea por su nombre de restriccion, no por el mensaje', () => {
    // R32, `design.md > 6.2`. Los nombres son los REALES de la migracion: si alguien los
    // renombra sin tocar esta funcion, el caso cae.
    expect(classifyForeignKeyViolation('supplier_catalog_lines_supplier_id_fkey')).toBe('supplier')
    expect(classifyForeignKeyViolation('supplier_catalog_lines_presentation_id_fkey')).toBe(
      'catalog_reference',
    )
    expect(classifyForeignKeyViolation('supplier_catalog_lines_unit_id_fkey')).toBe(
      'catalog_reference',
    )
    // El autor NO se traduce: sale como `'unknown'` y quien llama relanza crudo. El actor
    // viene de una sesion real, asi que un autor inexistente es un fallo del sistema, no un
    // caso de negocio, y traducirlo le diria al usuario una mentira.
    expect(classifyForeignKeyViolation('supplier_catalog_lines_created_by_fkey')).toBe('unknown')
    expect(classifyForeignKeyViolation('supplier_catalog_lines_updated_by_fkey')).toBe('unknown')

    // Tambien clasifica bien si lo que llega es la COLUMNA suelta, que es lo que entregaban
    // las versiones del conector para las que se escribio el precedente de `inventario`.
    expect(classifyForeignKeyViolation('supplier_id')).toBe('supplier')
    expect(classifyForeignKeyViolation('presentation_id')).toBe('catalog_reference')
    expect(classifyForeignKeyViolation('unit_id')).toBe('catalog_reference')
    expect(classifyForeignKeyViolation('created_by')).toBe('unknown')

    // Y el orden de las comprobaciones no es indiferente: el nombre de las restricciones de
    // la presentacion y de la unidad empieza por `supplier_catalog_lines_`, asi que una
    // comparacion por inclusion hecha al reves las clasificaria como el proveedor. Estos dos
    // asserts son los que caen si alguien reordena los `if`.
    expect(classifyForeignKeyViolation('supplier_catalog_lines_presentation_id_fkey')).not.toBe(
      'supplier',
    )
    expect(classifyForeignKeyViolation('supplier_catalog_lines_unit_id_fkey')).not.toBe('supplier')

    // Sin nombre -que es lo que el conector entrega HOY, ver la cabecera- no se asume nada.
    expect(classifyForeignKeyViolation('')).toBe('unknown')
  })

  it('el reconocedor del proveedor solo dispara con un P2003 que nombre su columna', () => {
    // R23. Que hoy el conector no entregue el nombre significa que esta funcion devuelve
    // `false` en ejecucion; el camino de negocio no depende de ella, porque `create`
    // comprueba ANTES que el proveedor este vivo con un `SELECT` -que es una comprobacion
    // distinta y por otro motivo: la FK no sabe nada de la baja logica-.
    expect(
      isSupplierForeignKeyViolation(
        prismaError('P2003', { constraint: 'supplier_catalog_lines_supplier_id_fkey' }),
      ),
    ).toBe(true)
    expect(
      isSupplierForeignKeyViolation(
        prismaError('P2003', { field_name: 'supplier_catalog_lines_supplier_id_fkey' }),
      ),
    ).toBe(true)
    expect(
      isSupplierForeignKeyViolation(
        prismaError('P2003', { constraint: 'supplier_catalog_lines_presentation_id_fkey' }),
      ),
    ).toBe(false)
    // Lo que el conector entrega hoy: nada.
    expect(isSupplierForeignKeyViolation(prismaError('P2003', { constraint: null }))).toBe(false)
    expect(isSupplierForeignKeyViolation(prismaError('P2002', { target: ['supplier_id'] }))).toBe(
      false,
    )
    expect(isSupplierForeignKeyViolation(new Error('cualquier otra cosa'))).toBe(false)
  })
})
