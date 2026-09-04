// T5 (QC-43) — Esquemas de entrada del proveedor (`design.md > 6.1`).
//
// Cubre R9, R10, R11, R13, R20 y R41. Lo que se vigila aqui es el BORDE: que la entrada
// invalida no llegue nunca al caso de uso, y que el blanco se convierta en ausencia ANTES
// de evaluar la regla cruzada de contacto. Si el `refine` mirara la cadena original,
// `{ phone: '   ', email: null }` cruzaria el borde y la base lo rechazaria con un 23514
// que el usuario lee como error del sistema.
//
// La defensa de la BASE para el mismo caso (R12) es otra y se prueba aparte, contra
// Postgres real, en `tests/integration/proveedores/supplier-crud.int.test.ts` (T17).

import { describe, expect, it, vi } from 'vitest'

import { pageQuerySchema } from '@/lib/modules/proveedores/domain/page'
import {
  SUPPLIER_EMAIL_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_PHONE_MAX_LENGTH,
  createSupplierSchema,
  updateSupplierSchema,
} from '@/lib/modules/proveedores/domain/supplier-input'

/** Entrada valida minima; cada caso cambia solo lo que quiere probar. */
const VALIDO = { name: 'Quimicos del Pacifico S.A.', phone: '3001112233', email: null }

/**
 * Los dos esquemas del proveedor se prueban a la vez: la edicion es REEMPLAZO COMPLETO y
 * usa el MISMO esquema que el alta (R14). Si alguien los separa y afloja uno, el bucle lo
 * dice.
 */
const ESQUEMAS = [
  ['createSupplierSchema', createSupplierSchema],
  ['updateSupplierSchema', updateSupplierSchema],
] as const

describe('esquemas de entrada del proveedor (QC-43 T5)', () => {
  it('rechaza el nombre vacio, el de solo espacios y el que queda vacio al normalizarlo, y recorta los extremos', () => {
    // R9. `min(1)` solo ve los dos primeros; el tercero -«---», «...», «###»- tiene
    // longitud pero `normalizeSupplierName` lo deja en vacio, y una fila con
    // `name_normalized = ''` chocaria contra el indice unico parcial con un mensaje
    // incomprensible. Por eso el `refine` no sobra.
    for (const [nombre, schema] of ESQUEMAS) {
      for (const name of ['', '   ', '\t\n ', '---', '...', '### ---']) {
        expect(
          schema.safeParse({ ...VALIDO, name }).success,
          `${nombre} debe rechazar el nombre ${JSON.stringify(name)}`,
        ).toBe(false)
      }

      // Y el nombre valido se guarda YA recortado (R9, segunda mitad).
      const parsed = schema.parse({ ...VALIDO, name: '  Quimicos del Pacifico  ' })
      expect(parsed.name).toBe('Quimicos del Pacifico')
    }
  })

  it('rechaza el nombre de mas de 120, el telefono de mas de 40 y el correo de mas de 160', () => {
    // R10: los largos maximos son de la validacion de APLICACION, no del tipo de la
    // columna (decision cerrada 14). El limite se prueba en su frontera exacta: el largo
    // maximo pasa y el maximo + 1 cae. Un test que solo probara «1000 caracteres» seguiria
    // verde si alguien cambiara 120 por 999.
    expect(SUPPLIER_NAME_MAX_LENGTH).toBe(120)
    expect(SUPPLIER_PHONE_MAX_LENGTH).toBe(40)
    expect(SUPPLIER_EMAIL_MAX_LENGTH).toBe(160)

    const casos = [
      ['name', SUPPLIER_NAME_MAX_LENGTH, 'a'],
      ['phone', SUPPLIER_PHONE_MAX_LENGTH, '3'],
      ['email', SUPPLIER_EMAIL_MAX_LENGTH, 'a'],
    ] as const

    for (const [nombre, schema] of ESQUEMAS) {
      for (const [campo, maximo, relleno] of casos) {
        expect(
          schema.safeParse({ ...VALIDO, [campo]: relleno.repeat(maximo) }).success,
          `${nombre}: ${campo} de largo ${maximo} debe pasar`,
        ).toBe(true)
        expect(
          schema.safeParse({ ...VALIDO, [campo]: relleno.repeat(maximo + 1) }).success,
          `${nombre}: ${campo} de largo ${maximo + 1} debe caer`,
        ).toBe(false)
      }
    }
  })

  it('rechaza el proveedor cuyo telefono y correo llegan los dos ausentes, vacios o en blanco', () => {
    // R11: la regla cruzada se corta EN EL BORDE, antes de llegar al repositorio. Las
    // combinaciones de ausencia (`undefined`, `null`, '', '   ', '\t') se rechazan igual:
    // el caso `{ phone: '   ', email: null }` es el que solo cae si `blankToNull` corre
    // ANTES del `refine`.
    const SIN_CONTACTO = [undefined, null, '', '   ', '\t']
    for (const [nombre, schema] of ESQUEMAS) {
      for (const phone of SIN_CONTACTO) {
        for (const email of SIN_CONTACTO) {
          expect(
            schema.safeParse({ name: VALIDO.name, phone, email }).success,
            `${nombre} debe rechazar phone=${JSON.stringify(phone)} email=${JSON.stringify(email)}`,
          ).toBe(false)
        }
      }

      // Con uno solo de los dos con contenido, pasa: la regla es «al menos uno».
      expect(schema.safeParse({ name: VALIDO.name, phone: '3001112233', email: null }).success).toBe(
        true,
      )
      expect(schema.safeParse({ name: VALIDO.name, phone: '   ', email: 'a@b.co' }).success).toBe(
        true,
      )
    }
  })

  it('recorta los extremos del telefono y del correo y convierte en ausencia el que llega en blanco', () => {
    // R13: lo que se persiste es el valor recortado, y lo que llega vacio o en blanco se
    // persiste como AUSENTE (`null`), nunca como cadena vacia.
    for (const [nombre, schema] of ESQUEMAS) {
      const parsed = schema.parse({ name: VALIDO.name, phone: '  300 111 2233  ', email: '   ' })
      expect(parsed.phone, `${nombre} debe recortar el telefono`).toBe('300 111 2233')
      expect(parsed.email, `${nombre} debe anular el correo en blanco`).toBeNull()

      const otro = schema.parse({ name: VALIDO.name, phone: '', email: '  ventas@quim.co  ' })
      expect(otro.phone, `${nombre} debe anular el telefono vacio`).toBeNull()
      expect(otro.email, `${nombre} debe recortar el correo`).toBe('ventas@quim.co')

      // El campo omitido tambien sale `null`, no `undefined`: lo que se escribe en la
      // columna es una ausencia explicita.
      const omitido = schema.parse({ name: VALIDO.name, phone: '3001112233' })
      expect(omitido.email, `${nombre} debe devolver null para el campo omitido`).toBeNull()
    }
  })

  it('rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1, sin leer del repositorio', () => {
    // R20. `pageQuerySchema` rechaza el minimo y la integridad; el defecto de 10 y el tope
    // de 25 los aplica `lib/shared/pagination` en el adaptador (R19), no este esquema.
    const repositorio = vi.fn()

    /** Lo que hara el caso de uso de T8: validar, y solo entonces tocar el puerto. */
    function listar(input: unknown): boolean {
      const parsed = pageQuerySchema.safeParse(input)
      if (!parsed.success) return false
      repositorio(parsed.data)
      return true
    }

    for (const input of [
      { page: 0 },
      { page: -1 },
      { page: 1.5 },
      { page: Number.NaN },
      { page: '2' },
      { page: 1, pageSize: 0 },
      { page: 1, pageSize: -5 },
      { page: 1, pageSize: 2.5 },
      { page: 1, pageSize: '10' },
    ]) {
      expect(listar(input), `debe rechazar ${JSON.stringify(input)}`).toBe(false)
    }
    expect(
      repositorio,
      'ninguna consulta invalida puede llegar al repositorio',
    ).not.toHaveBeenCalled()

    // Y la consulta valida si llega, con el defecto de pagina aplicado por el esquema.
    expect(listar({})).toBe(true)
    expect(repositorio).toHaveBeenCalledWith({ page: 1 })
  })

  it('rechaza la entrada que no cumple el esquema antes de llamar al caso de uso', () => {
    // R41: nada sin validar ni sin tipar cruza hacia el dominio. El doble del repositorio
    // solo se llama si el esquema paso: es lo que distingue «se valido antes» de «se
    // valido despues».
    const repositorio = vi.fn()

    function crear(input: unknown): boolean {
      const parsed = createSupplierSchema.safeParse(input)
      if (!parsed.success) return false
      repositorio(parsed.data)
      return true
    }

    for (const input of [
      {},
      { name: 'Sin contacto' },
      { name: 42, phone: '3001112233' },
      { name: 'Ok', phone: 3001112233 },
      { name: 'Ok', phone: '3001112233', email: 7 },
      { name: '   ', phone: '3001112233' },
      null,
      'Quimicos',
    ]) {
      expect(crear(input), `debe rechazar ${JSON.stringify(input)}`).toBe(false)
    }
    expect(
      repositorio,
      'ninguna entrada invalida puede llegar al repositorio',
    ).not.toHaveBeenCalled()

    expect(crear(VALIDO)).toBe(true)
    expect(repositorio).toHaveBeenCalledTimes(1)
  })

  it('no valida el formato del correo ni el del telefono', () => {
    // Decision 9 de QC-42, heredada entera: sin `z.string().email()`, sin patron de
    // telefono, sin unicidad. Afirmado en positivo para que nadie «mejore» el esquema
    // anadiendo un formato que ninguna decision pide.
    for (const [nombre, schema] of ESQUEMAS) {
      expect(
        schema.safeParse({ name: VALIDO.name, phone: 'ext. 402 (oficina)', email: 'no-es-correo' })
          .success,
        `${nombre} no debe imponer formato`,
      ).toBe(true)
    }
  })
})
