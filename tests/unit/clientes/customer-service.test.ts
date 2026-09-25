// Los cuatro casos de uso de escritura y ficha de `clientes`, con DOBLES del puerto
// (`design.md > 5`). Cubre R9, R13, R18, R19-R25 y R42. Lo que solo Postgres puede demostrar
// -que el ambito filtra de verdad- es la integracion.

import { describe, expect, it, vi } from 'vitest'

import { createCreateCustomer } from '@/lib/modules/clientes/domain/create-customer'
import { createDeleteCustomer } from '@/lib/modules/clientes/domain/delete-customer'
import { CustomerNotFoundError } from '@/lib/modules/clientes/domain/errors'
import { createGetCustomer } from '@/lib/modules/clientes/domain/get-customer'
import { createUpdateCustomer } from '@/lib/modules/clientes/domain/update-customer'

import type { Actor } from '@/lib/modules/clientes/domain/actor'
import type { CustomerView } from '@/lib/modules/clientes/domain/customer-view'
import type { CustomerRepository } from '@/lib/modules/clientes/ports/customer-repository'

const ADMIN: Actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: '99999999-9999-4999-8999-999999999999',
  permissions: ['clientes.consultar', 'clientes.modificar'],
}
const AHORA = new Date('2026-09-24T12:00:00.000Z')
const now = () => AHORA
const CUSTOMER_ID = '22222222-2222-4222-8222-222222222222'
const ID_SIN_FORMA = 'no-es-un-uuid'

const ENTRADA_VALIDA = {
  firstNames: 'Maria',
  lastNames: 'Perez',
  city: 'Bogota',
  phone: '3001112233',
  email: null,
  address: null,
}

const VISTA: CustomerView = {
  id: CUSTOMER_ID,
  firstNames: 'Maria',
  lastNames: 'Perez',
  city: 'Bogota',
  phone: '3001112233',
  email: null,
  address: null,
  createdBy: ADMIN.id,
  updatedBy: ADMIN.id,
  createdAt: AHORA,
  updatedAt: AHORA,
}

function makeCustomers(overrides: Partial<CustomerRepository> = {}): {
  readonly repo: CustomerRepository
  readonly spies: Record<keyof CustomerRepository, ReturnType<typeof vi.fn>>
} {
  const spies = {
    create: vi.fn(async () => ({ id: 'nuevo-id' })),
    findAliveById: vi.fn(async () => null),
    updateAlive: vi.fn(async () => 'ok'),
    softDeleteAlive: vi.fn(async () => true),
    listAlive: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 })),
  }
  const repo = { ...spies, ...overrides }
  return {
    repo: repo as unknown as CustomerRepository,
    spies: repo as unknown as Record<keyof CustomerRepository, ReturnType<typeof vi.fn>>,
  }
}

describe('casos de uso del cliente', () => {
  it('R9 — el alta usa la empresa del actor aunque la entrada traiga otra', async () => {
    const AJENA = '33333333-3333-4333-8333-333333333333'
    const { repo, spies } = makeCustomers()

    await createCreateCustomer({ customers: repo, now })(
      { ...ENTRADA_VALIDA, companyId: AJENA },
      ADMIN,
    )

    const args = spies.create.mock.calls[0] as unknown as readonly unknown[]
    expect(args[args.length - 1]).toStrictEqual({ companyId: ADMIN.companyId })
    expect(JSON.stringify(args[0])).not.toContain(AJENA)
  })

  it('R13 — el alta con datos validos devuelve el identificador del puerto', async () => {
    const { repo } = makeCustomers()
    const creado = await createCreateCustomer({ customers: repo, now })(ENTRADA_VALIDA, ADMIN)
    expect(creado).toEqual({ id: 'nuevo-id' })
  })

  it('R18 — al puerto solo llegan los seis datos de negocio (mas sus tres formas normalizadas)', async () => {
    const { repo, spies } = makeCustomers()

    await createCreateCustomer({ customers: repo, now })(
      { ...ENTRADA_VALIDA, companyId: 'ajena', nit: '900123456-7' },
      ADMIN,
    )

    expect(Object.keys(spies.create.mock.calls[0]?.[0] as object).sort()).toEqual([
      'address',
      'city',
      'cityNormalized',
      'email',
      'firstNames',
      'firstNamesNormalized',
      'lastNames',
      'lastNamesNormalized',
      'phone',
    ])
  })

  it('R19 — dos clientes vivos con los mismos seis datos se crean los dos, sin error de duplicado', async () => {
    const { repo } = makeCustomers()
    const uno = await createCreateCustomer({ customers: repo, now })(ENTRADA_VALIDA, ADMIN)
    const otro = await createCreateCustomer({ customers: repo, now })(ENTRADA_VALIDA, ADMIN)
    expect(uno).toEqual({ id: 'nuevo-id' })
    expect(otro).toEqual({ id: 'nuevo-id' })
  })

  it('R20 — la edicion reemplaza los seis datos y el opcional ausente queda como ausencia', async () => {
    const { repo, spies } = makeCustomers()

    await createUpdateCustomer({ customers: repo, now })(
      CUSTOMER_ID,
      { firstNames: 'Ana', lastNames: 'Gomez', city: 'Cali', phone: '   ', email: null, address: undefined },
      ADMIN,
    )

    expect(spies.updateAlive.mock.calls[0]?.[1]).toEqual({
      firstNames: 'Ana',
      lastNames: 'Gomez',
      city: 'Cali',
      phone: null,
      email: null,
      address: null,
      firstNamesNormalized: 'ana',
      lastNamesNormalized: 'gomez',
      cityNormalized: 'cali',
    })
  })

  it('R21 — el actor queda como autor de creacion y modificacion al crear, y solo de modificacion al editar y dar de baja', async () => {
    const { repo, spies } = makeCustomers()

    await createCreateCustomer({ customers: repo, now })(ENTRADA_VALIDA, ADMIN)
    expect(spies.create).toHaveBeenCalledWith(expect.anything(), ADMIN.id, AHORA, expect.anything())

    await createUpdateCustomer({ customers: repo, now })(CUSTOMER_ID, ENTRADA_VALIDA, ADMIN)
    expect(spies.updateAlive).toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.anything(),
      ADMIN.id,
      AHORA,
      expect.anything(),
    )

    await createDeleteCustomer({ customers: repo, now })(CUSTOMER_ID, ADMIN)
    expect(spies.softDeleteAlive).toHaveBeenCalledWith(CUSTOMER_ID, ADMIN.id, AHORA, expect.anything())
  })

  it('R22 — la ficha devuelve id, seis datos, instantes y autores, sin empresa ni marca de baja', async () => {
    const { repo } = makeCustomers({ findAliveById: vi.fn(async () => VISTA) })
    const ficha = await createGetCustomer({ customers: repo })(CUSTOMER_ID, ADMIN)
    expect(Object.keys(ficha).sort()).toEqual(
      [
        'address',
        'city',
        'createdAt',
        'createdBy',
        'email',
        'firstNames',
        'id',
        'lastNames',
        'phone',
        'updatedAt',
        'updatedBy',
      ].sort(),
    )
  })

  it('R23 — inexistente, dado de baja o id sin forma responden customer_not_found; el id sin forma no llega al puerto', async () => {
    const consulta = makeCustomers({ findAliveById: vi.fn(async () => null) })
    await expect(
      createGetCustomer({ customers: consulta.repo })(CUSTOMER_ID, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)

    const edicion = makeCustomers({ updateAlive: vi.fn(async () => 'not_found' as const) })
    await expect(
      createUpdateCustomer({ customers: edicion.repo, now })(CUSTOMER_ID, ENTRADA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)

    const baja = makeCustomers({ softDeleteAlive: vi.fn(async () => false) })
    await expect(
      createDeleteCustomer({ customers: baja.repo, now })(CUSTOMER_ID, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)

    // El id sin forma no llega al puerto, en los tres casos.
    const sinForma = makeCustomers()
    await expect(
      createGetCustomer({ customers: sinForma.repo })(ID_SIN_FORMA, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
    await expect(
      createUpdateCustomer({ customers: sinForma.repo, now })(ID_SIN_FORMA, ENTRADA_VALIDA, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
    await expect(
      createDeleteCustomer({ customers: sinForma.repo, now })(ID_SIN_FORMA, ADMIN),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
    expect(sinForma.spies.findAliveById).not.toHaveBeenCalled()
    expect(sinForma.spies.updateAlive).not.toHaveBeenCalled()
    expect(sinForma.spies.softDeleteAlive).not.toHaveBeenCalled()
  })

  it('R25 — no existe ninguna operacion de restaurar ni de listar dados de baja', async () => {
    const puerto = Object.keys(makeCustomers().repo).sort()
    expect(puerto).toEqual(['create', 'findAliveById', 'listAlive', 'softDeleteAlive', 'updateAlive'])

    const { repo, spies } = makeCustomers()
    await createDeleteCustomer({ customers: repo, now })(CUSTOMER_ID, ADMIN)
    expect(spies.softDeleteAlive).toHaveBeenCalledTimes(1)
  })

  it('R42 — el alta y la edicion pasan cada forma normalizada emparejada con su dato', async () => {
    const { repo, spies } = makeCustomers()

    await createCreateCustomer({ customers: repo, now })(
      { ...ENTRADA_VALIDA, firstNames: '  María José  ', lastNames: 'Pérez Muñoz', city: 'Bogotá' },
      ADMIN,
    )
    expect(spies.create.mock.calls[0]?.[0]).toMatchObject({
      firstNames: 'María José',
      firstNamesNormalized: 'mariajose',
      lastNames: 'Pérez Muñoz',
      lastNamesNormalized: 'perezmunoz',
      city: 'Bogotá',
      cityNormalized: 'bogota',
    })

    await createUpdateCustomer({ customers: repo, now })(
      CUSTOMER_ID,
      { ...ENTRADA_VALIDA, firstNames: 'Andrés', lastNames: 'Niño Peña', city: 'Medellín' },
      ADMIN,
    )
    expect(spies.updateAlive.mock.calls[0]?.[1]).toMatchObject({
      firstNames: 'Andrés',
      firstNamesNormalized: 'andres',
      lastNames: 'Niño Peña',
      lastNamesNormalized: 'ninopena',
      city: 'Medellín',
      cityNormalized: 'medellin',
    })
  })

  it('R47 — ni la ficha ni el listado devuelven formas normalizadas', async () => {
    const { repo } = makeCustomers({
      findAliveById: vi.fn(async () => VISTA),
      listAlive: vi.fn(async () => ({ items: [VISTA], total: 1, page: 1, pageSize: 10, totalPages: 1 })),
    })

    const ficha = await createGetCustomer({ customers: repo })(CUSTOMER_ID, ADMIN)
    expect(ficha).not.toHaveProperty('firstNamesNormalized')
    expect(ficha).not.toHaveProperty('lastNamesNormalized')
    expect(ficha).not.toHaveProperty('cityNormalized')

    const listado = await repo.listAlive({ page: 1, sort: null, filters: {}, search: '' }, {
      companyId: ADMIN.companyId,
    })
    for (const item of listado.items) {
      expect(item).not.toHaveProperty('firstNamesNormalized')
      expect(item).not.toHaveProperty('lastNamesNormalized')
      expect(item).not.toHaveProperty('cityNormalized')
    }
  })
})
