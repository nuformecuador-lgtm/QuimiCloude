// Esquemas de entrada del cliente (`design.md > 6.3`). Cubre R14-R18: nada sin validar cruza
// hacia el dominio, y el blanco se convierte en ausencia antes de llegar al puerto.

import { describe, expect, it, vi } from 'vitest'

import {
  CUSTOMER_ADDRESS_MAX_LENGTH,
  CUSTOMER_CITY_MAX_LENGTH,
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_FIRST_NAMES_MAX_LENGTH,
  CUSTOMER_LAST_NAMES_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  createCustomerSchema,
  updateCustomerSchema,
} from '@/lib/modules/clientes/domain/customer-input'

const VALIDO = {
  firstNames: 'Maria',
  lastNames: 'Perez',
  city: 'Bogota',
  phone: '3001112233',
  email: 'maria@example.com',
  address: 'Calle 1 # 2-3',
}

const ESQUEMAS = [
  ['createCustomerSchema', createCustomerSchema],
  ['updateCustomerSchema', updateCustomerSchema],
] as const

describe('esquemas de entrada del cliente', () => {
  it('R14 — rechaza nombres, apellidos o ciudad ausentes, vacios o en blanco, y recorta los validos', () => {
    for (const [nombre, schema] of ESQUEMAS) {
      for (const campo of ['firstNames', 'lastNames', 'city'] as const) {
        for (const valor of [undefined, null, '', '   ', '\t\n']) {
          expect(
            schema.safeParse({ ...VALIDO, [campo]: valor }).success,
            `${nombre}: ${campo}=${JSON.stringify(valor)} debe rechazarse`,
          ).toBe(false)
        }
      }

      const parsed = schema.parse({
        ...VALIDO,
        firstNames: '  Maria  ',
        lastNames: '  Perez  ',
        city: '  Bogota  ',
      })
      expect(parsed.firstNames).toBe('Maria')
      expect(parsed.lastNames).toBe('Perez')
      expect(parsed.city).toBe('Bogota')
    }
  })

  it('R15 — acepta cualquier combinacion de opcionales ausentes y convierte el blanco en ausencia', () => {
    const AUSENCIAS = [undefined, null, '', '   ', '\t']
    for (const [nombre, schema] of ESQUEMAS) {
      for (const phone of AUSENCIAS) {
        for (const email of AUSENCIAS) {
          for (const address of AUSENCIAS) {
            const parsed = schema.safeParse({ ...VALIDO, phone, email, address })
            expect(parsed.success, `${nombre} debe aceptar los tres opcionales ausentes`).toBe(true)
            if (parsed.success) {
              expect(parsed.data.phone).toBeNull()
              expect(parsed.data.email).toBeNull()
              expect(parsed.data.address).toBeNull()
            }
          }
        }
      }

      // Con contenido, se recorta.
      const conContenido = schema.parse({
        ...VALIDO,
        phone: '  300 111 2233  ',
        email: '  maria@example.com  ',
        address: '  Calle 1  ',
      })
      expect(conContenido.phone).toBe('300 111 2233')
      expect(conContenido.email).toBe('maria@example.com')
      expect(conContenido.address).toBe('Calle 1')
    }
  })

  it('R16 — acepta cada dato en su largo maximo y rechaza uno mas', () => {
    expect(CUSTOMER_FIRST_NAMES_MAX_LENGTH).toBe(80)
    expect(CUSTOMER_LAST_NAMES_MAX_LENGTH).toBe(80)
    expect(CUSTOMER_CITY_MAX_LENGTH).toBe(80)
    expect(CUSTOMER_PHONE_MAX_LENGTH).toBe(40)
    expect(CUSTOMER_EMAIL_MAX_LENGTH).toBe(160)
    expect(CUSTOMER_ADDRESS_MAX_LENGTH).toBe(200)

    const casos = [
      ['firstNames', CUSTOMER_FIRST_NAMES_MAX_LENGTH],
      ['lastNames', CUSTOMER_LAST_NAMES_MAX_LENGTH],
      ['city', CUSTOMER_CITY_MAX_LENGTH],
      ['phone', CUSTOMER_PHONE_MAX_LENGTH],
      ['email', CUSTOMER_EMAIL_MAX_LENGTH],
      ['address', CUSTOMER_ADDRESS_MAX_LENGTH],
    ] as const

    for (const [nombre, schema] of ESQUEMAS) {
      for (const [campo, maximo] of casos) {
        expect(
          schema.safeParse({ ...VALIDO, [campo]: 'a'.repeat(maximo) }).success,
          `${nombre}: ${campo} de largo ${maximo} debe aceptarse`,
        ).toBe(true)
        expect(
          schema.safeParse({ ...VALIDO, [campo]: 'a'.repeat(maximo + 1) }).success,
          `${nombre}: ${campo} de largo ${maximo + 1} debe rechazarse`,
        ).toBe(false)
      }
    }
  })

  it('R17 — acepta como correo y telefono cualquier texto dentro del largo', () => {
    for (const [nombre, schema] of ESQUEMAS) {
      expect(
        schema.safeParse({ ...VALIDO, phone: 'ext. 402 (oficina)', email: 'no-es-un-correo' }).success,
        `${nombre} no debe imponer formato`,
      ).toBe(true)
    }
  })

  it('R18 — las claves ajenas a los seis datos no salen del esquema', () => {
    const repositorio = vi.fn()

    function crear(input: unknown): boolean {
      const parsed = createCustomerSchema.safeParse(input)
      if (!parsed.success) return false
      repositorio(parsed.data)
      return true
    }

    expect(
      crear({
        ...VALIDO,
        companyId: 'ajena',
        createdBy: 'alguien',
        deletedAt: new Date().toISOString(),
        nit: '900123456-7',
      }),
    ).toBe(true)
    expect(Object.keys(repositorio.mock.calls[0]?.[0] as object).sort()).toEqual([
      'address',
      'city',
      'email',
      'firstNames',
      'lastNames',
      'phone',
    ])

    for (const input of [{}, null, 'Maria Perez', { firstNames: 'Maria' }]) {
      expect(crear(input), `debe rechazar ${JSON.stringify(input)}`).toBe(false)
    }
  })
})
