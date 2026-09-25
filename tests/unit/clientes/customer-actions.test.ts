// T12 — Las cinco Server Actions de `clientes` (`design.md > 9`). Mockea `@/lib/composition`,
// igual que `tests/unit/proveedores/supplier-actions.test.ts`: la action se prueba contra
// dobles, nunca contra el dominio real ni contra la sesion real.
//
// Cubre R7, R32 y R33 con los nombres EXACTOS que exige `tasks.md > Trazabilidad`.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createCustomerAction,
  deleteCustomerAction,
  getCustomerAction,
  listCustomersAction,
  updateCustomerAction,
  type CreateCustomerFormState,
  type CustomerMutationFormState,
} from '@/lib/modules/clientes/adapters/driving/customer-actions'
import { errorMessage } from '@/lib/modules/errores'
import { CustomerNotFoundError, UnauthorizedError, ValidationError } from '@/lib/modules/clientes'

const {
  createCustomerMock,
  updateCustomerMock,
  deleteCustomerMock,
  getCustomerMock,
  listCustomersMock,
  getSessionUserMock,
  getSessionContextMock,
} = vi.hoisted(() => ({
  createCustomerMock: vi.fn(),
  updateCustomerMock: vi.fn(),
  deleteCustomerMock: vi.fn(),
  getCustomerMock: vi.fn(),
  listCustomersMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
}))

const { REQUEST_ID_DE_PRUEBA, readRequestIdHeaderMock } = vi.hoisted(() => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  return { REQUEST_ID_DE_PRUEBA: id, readRequestIdHeaderMock: vi.fn(async () => id) };
})

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  clientes: {
    createCustomer: createCustomerMock,
    updateCustomer: updateCustomerMock,
    deleteCustomer: deleteCustomerMock,
    getCustomer: getCustomerMock,
    listCustomers: listCustomersMock,
  },
}))

const ADMIN_SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['clientes.consultar', 'clientes.modificar'],
}

const ADMIN_SESSION_CONTEXT = { companyId: '22222222-2222-4222-8222-222222222222' }

const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333'

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

const CREATE_CUSTOMER_INITIAL: CreateCustomerFormState = { status: 'idle' }
const CUSTOMER_MUTATION_INITIAL: CustomerMutationFormState = { status: 'idle' }

const VALID_CUSTOMER_FIELDS = {
  firstNames: 'Maria Jose',
  lastNames: 'Perez Munoz',
  city: 'Bogota',
  phone: '+57 1 234 5678',
  email: 'maria@example.com',
  address: 'Calle 1 # 2-3',
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const drivingDir = join(repoRoot, 'lib', 'modules', 'clientes', 'adapters', 'driving')

/** Fuente SIN comentarios: se vigila el codigo, no la prosa que lo explica. */
function readSource(file: string): string {
  return readFileSync(join(drivingDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const ACTION_FILES = ['customer-actions.ts'] as const

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(ADMIN_SESSION_USER)
  getSessionContextMock.mockResolvedValue(ADMIN_SESSION_CONTEXT)
})

describe('Server Actions de clientes — actor, forma de entrada y errores', () => {
  it('R7 — la accion toma usuario y empresa de la sesion y no vuelve a comprobar el permiso', async () => {
    createCustomerMock.mockResolvedValue({ id: 'customer-1' })
    updateCustomerMock.mockResolvedValue(undefined)
    deleteCustomerMock.mockResolvedValue(undefined)
    getCustomerMock.mockResolvedValue({ id: CUSTOMER_ID })
    listCustomersMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 })

    const ESPERADO = {
      id: 'user-admin-1',
      companyId: ADMIN_SESSION_CONTEXT.companyId,
      permissions: ['clientes.consultar', 'clientes.modificar'],
    }

    await createCustomerAction(CREATE_CUSTOMER_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
    expect(createCustomerMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await updateCustomerAction(CUSTOMER_ID, CUSTOMER_MUTATION_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
    expect(updateCustomerMock.mock.calls[0]?.[2]).toEqual(ESPERADO)

    await deleteCustomerAction(CUSTOMER_MUTATION_INITIAL, formDataOf({ id: CUSTOMER_ID }))
    expect(deleteCustomerMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await getCustomerAction(CUSTOMER_ID)
    expect(getCustomerMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    await listCustomersAction({ page: 1 })
    expect(listCustomersMock.mock.calls[0]?.[1]).toEqual(ESPERADO)

    expect(getSessionUserMock).toHaveBeenCalledTimes(5)

    // Sin sesion, el actor que baja es `null`: quien rechaza es el caso de uso.
    vi.clearAllMocks()
    getSessionUserMock.mockResolvedValue(null)
    createCustomerMock.mockRejectedValue(new UnauthorizedError())
    const sinSesion = await createCustomerAction(
      CREATE_CUSTOMER_INITIAL,
      formDataOf(VALID_CUSTOMER_FIELDS),
    )
    expect(createCustomerMock.mock.calls[0]?.[1]).toBeNull()
    expect(sinSesion).toEqual({ status: 'error', code: 'unauthorized', message: expect.any(String) })

    // La accion NO decide: ningun archivo de `adapters/driving/` nombra la comprobacion de
    // permiso, el rol, ni ninguna regla de negocio del dominio.
    for (const file of ACTION_FILES) {
      const source = readSource(file)
      expect(source, `${file} repite la comprobacion de permiso`).not.toMatch(
        /require(Admin|Permission)/,
      )
      expect(source, `${file} incrusta el nombre del rol`).not.toMatch(/Administrador/)
      expect(source, `${file} valida con el esquema del dominio`).not.toMatch(/Schema\b/)
      expect(source, `${file} normaliza el texto`).not.toMatch(/normalizeCustomerText/)
      expect(source, `${file} reimplementa la paginacion`).not.toMatch(
        /DEFAULT_PAGE_SIZE|MAX_PAGE_SIZE|pageSize\s*[-*]|Math\.(ceil|min)/,
      )
      expect(source, `${file} habla con el ORM`).not.toMatch(/@prisma\/client|prisma\./)
    }
  })

  it('R32 — las mutaciones reciben FormData y las consultas argumentos tipados', async () => {
    createCustomerMock.mockResolvedValue({ id: 'customer-1' })
    updateCustomerMock.mockResolvedValue(undefined)
    deleteCustomerMock.mockResolvedValue(undefined)

    // 1. COMPORTAMIENTO: las mutaciones leen de verdad los campos del FormData. `phone` viaja
    //    presente-pero-en-blanco (la conversion a ausencia es del esquema, no del borde);
    //    `address` esta ausente del formulario y llega como `undefined`, no `''`.
    await createCustomerAction(
      CREATE_CUSTOMER_INITIAL,
      formDataOf({ firstNames: '  Ana  ', lastNames: 'Diaz', city: 'Cali', phone: '  ', email: 'a@a.com' }),
    )
    expect(createCustomerMock.mock.calls[0]?.[0]).toEqual({
      firstNames: '  Ana  ',
      lastNames: 'Diaz',
      city: 'Cali',
      phone: '  ',
      email: 'a@a.com',
      address: undefined,
    })

    // El id de la edicion NO viaja en el FormData: es argumento.
    await updateCustomerAction(CUSTOMER_ID, CUSTOMER_MUTATION_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
    expect(updateCustomerMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID)
    expect(updateCustomerMock.mock.calls[0]?.[1]).not.toHaveProperty('id')

    // La baja si lleva el id en el formulario, y sin el no llama al caso de uso.
    await deleteCustomerAction(CUSTOMER_MUTATION_INITIAL, formDataOf({ id: CUSTOMER_ID }))
    expect(deleteCustomerMock.mock.calls[0]?.[0]).toBe(CUSTOMER_ID)
    const sinId = await deleteCustomerAction(CUSTOMER_MUTATION_INITIAL, formDataOf({}))
    expect(sinId).toEqual({ status: 'error', code: 'invalid_input', message: expect.any(String) })
    expect(deleteCustomerMock).toHaveBeenCalledTimes(1)

    // 2. FIRMA: las tres mutaciones terminan en FormData; las dos consultas no lo mencionan.
    const MUTACIONES = [createCustomerAction, updateCustomerAction, deleteCustomerAction]
    for (const action of MUTACIONES) {
      expect(action.length, `${action.name} deberia recibir prevState y FormData`).toBeGreaterThanOrEqual(2)
    }

    const fuentes = ACTION_FILES.map((file) => readSource(file)).join('\n')
    for (const consulta of ['getCustomerAction(id: string)', 'listCustomersAction(query: unknown)']) {
      expect(fuentes, `${consulta} deberia recibir argumentos tipados`).toContain(consulta)
    }
    for (const consulta of ['getCustomerAction', 'listCustomersAction']) {
      const firma = fuentes.slice(fuentes.indexOf(`export async function ${consulta}(`))
      expect(firma.slice(0, firma.indexOf('{')), `${consulta} no puede recibir FormData`).not.toMatch(
        /FormData/,
      )
    }

    // 3. Ningun route handler propio, y ningun `fetch` a una ruta interna.
    for (const ruta of ['clientes', 'customers']) {
      expect(existsSync(join(repoRoot, 'app', 'api', ruta)), `app/api/${ruta}`).toBe(false)
    }
    expect(fuentes, 'una action llama por fetch a una ruta propia').not.toMatch(/fetch\(/)
  })

  it('R33 — traduce cada error de dominio por su code estable, nunca por el texto', async () => {
    const CASOS = [
      { error: new UnauthorizedError(), code: 'unauthorized' },
      { error: new CustomerNotFoundError(), code: 'customer_not_found' },
      { error: new ValidationError(), code: 'invalid_input' },
    ] as const

    for (const caso of CASOS) {
      createCustomerMock.mockRejectedValueOnce(caso.error)
      const result = await createCustomerAction(CREATE_CUSTOMER_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
      expect(result).toEqual({ status: 'error', code: caso.code, message: caso.error.message })
    }

    // El diagnostico va SOLO al registro del servidor, nunca al navegador.
    createCustomerMock.mockRejectedValueOnce(new CustomerNotFoundError('id ajeno a la empresa'))
    const traducido = await createCustomerAction(CREATE_CUSTOMER_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
    expect(traducido).toEqual({
      status: 'error',
      code: 'customer_not_found',
      message: errorMessage('customer_not_found'),
    })
    expect(JSON.stringify(traducido)).not.toContain('id ajeno a la empresa')

    // Lo que NO es error de dominio se traduce a `unexpected`, sin filtrar el detalle interno.
    const ajeno = new Error('connection terminated unexpectedly')
    createCustomerMock.mockRejectedValueOnce(ajeno)
    const altaConAjeno = await createCustomerAction(CREATE_CUSTOMER_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS))
    expect(altaConAjeno).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    })
    expect(JSON.stringify(altaConAjeno).toLowerCase()).not.toContain('connection terminated unexpectedly')

    listCustomersMock.mockRejectedValueOnce(ajeno)
    const listaConAjeno = await listCustomersAction({ page: 1 })
    expect(listaConAjeno).toEqual({
      status: 'error',
      code: 'unexpected',
      message: errorMessage('unexpected'),
      reference: REQUEST_ID_DE_PRUEBA,
    })

    // Ningun `catch` descarta el error sin traducirlo ni propagarlo.
    for (const file of ACTION_FILES) {
      const source = readSource(file)
      const catches = [...source.matchAll(/catch\s*\(([^)]*)\)\s*\{([^}]*)\}/g)]
      expect(catches.length, `${file} deberia tener un catch por operacion`).toBeGreaterThan(0)
      for (const bloque of catches) {
        expect(bloque[2], `${file}: catch que no traduce ni propaga`).toMatch(/toErrorState/)
      }
    }
  })

  it('R22 (QC-59) — si falta CUALQUIERA de las dos caras de la sesion, el actor que baja es `null` y no se escribe nada', async () => {
    const SIN_SESION = [
      { etiqueta: 'sin usuario de sesion', user: null, context: ADMIN_SESSION_CONTEXT },
      { etiqueta: 'sin contexto de sesion', user: ADMIN_SESSION_USER, context: null },
      { etiqueta: 'sin ninguna de las dos', user: null, context: null },
    ] as const

    const INVOCACIONES = [
      ['createCustomer', createCustomerMock, () => createCustomerAction(CREATE_CUSTOMER_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS)), 1],
      ['updateCustomer', updateCustomerMock, () => updateCustomerAction(CUSTOMER_ID, CUSTOMER_MUTATION_INITIAL, formDataOf(VALID_CUSTOMER_FIELDS)), 2],
      ['deleteCustomer', deleteCustomerMock, () => deleteCustomerAction(CUSTOMER_MUTATION_INITIAL, formDataOf({ id: CUSTOMER_ID })), 1],
      ['getCustomer', getCustomerMock, () => getCustomerAction(CUSTOMER_ID), 1],
      ['listCustomers', listCustomersMock, () => listCustomersAction({ page: 1 }), 1],
    ] as const

    for (const { etiqueta, user, context } of SIN_SESION) {
      for (const [nombre, mock, invocar, posicionDelActor] of INVOCACIONES) {
        vi.clearAllMocks()
        getSessionUserMock.mockResolvedValue(user)
        getSessionContextMock.mockResolvedValue(context)
        mock.mockRejectedValue(new UnauthorizedError())

        const estado = await invocar()

        expect(mock.mock.calls[0]?.[posicionDelActor], `${nombre} ${etiqueta}`).toBeNull()
        expect(JSON.stringify(mock.mock.calls[0]), `${nombre} ${etiqueta}: viajo una empresa`).not.toContain(
          ADMIN_SESSION_CONTEXT.companyId,
        )
        expect(estado, `${nombre} ${etiqueta}`).toEqual({
          status: 'error',
          code: 'unauthorized',
          message: expect.any(String),
        })
      }
    }
  })
})
