// Las Server Actions de la conexion de WhatsApp contra dobles de `@/lib/composition`: se prueba el
// borde (actor, FormData, estados de salida, traduccion de errores y revalidacion), nunca el
// dominio ni la sesion reales.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createWhatsappConnectionAction,
  disableWhatsappConnectionAction,
  enableWhatsappConnectionAction,
  getWhatsappConnectionAction,
  regenerateWhatsappVerifyTokenAction,
  testWhatsappConnectionAction,
  updateWhatsappConnectionAction,
} from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions'
import { errorMessage } from '@/lib/modules/errores'
import {
  ActionNotAllowedError,
  SecretUnreadableError,
  UnauthorizedError,
  ValidationError,
  WhatsappConnectionExistsError,
  WhatsappConnectionNotFoundError,
  WhatsappPhoneNumberTakenError,
  type WhatsappConnectionView,
} from '@/lib/modules/integraciones'

const {
  getMock,
  createMock,
  updateMock,
  testMock,
  setEnabledMock,
  regenerateMock,
  webhookUrlMock,
  getSessionUserMock,
  getSessionContextMock,
  revalidatePathMock,
  readRequestIdHeaderMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  testMock: vi.fn(),
  setEnabledMock: vi.fn(),
  regenerateMock: vi.fn(),
  webhookUrlMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  readRequestIdHeaderMock: vi.fn(async () => '7c9e6679-7425-40de-944b-e07fc1f90ae7'),
}))

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

vi.mock('@/lib/composition', () => ({
  observabilidad: { readRequestIdHeader: readRequestIdHeaderMock },
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  integraciones: {
    getWhatsappConnection: getMock,
    createWhatsappConnection: createMock,
    updateWhatsappConnection: updateMock,
    testWhatsappConnection: testMock,
    setWhatsappConnectionEnabled: setEnabledMock,
    regenerateWhatsappVerifyToken: regenerateMock,
    whatsappWebhookUrl: webhookUrlMock,
  },
}))

const REQUEST_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333'
const COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const WHATSAPP_ROUTE = '/integraciones/whatsapp'

const ACCESS_TOKEN = 'EAAG-token-de-prueba-que-no-debe-salir'
const APP_SECRET = 'app-secret-de-prueba-que-no-debe-salir'
const VERIFY_TOKEN = 'verify-token-en-claro-de-prueba-43-caracteres'
const VERIFY_TOKEN_HASH = 'a'.repeat(64)
const WEBHOOK = {
  url: `https://app.example.com/api/integraciones/whatsapp/webhook/${CONNECTION_ID}`,
  complete: true,
}

const SESSION_USER = {
  id: 'user-admin-1',
  username: 'ana.perez',
  displayName: 'Ana Perez',
  roleName: 'Administrador',
  permissions: ['integraciones.modificar'],
}

const ACTOR = { id: SESSION_USER.id, companyId: COMPANY_ID, permissions: SESSION_USER.permissions }

const VIEW: WhatsappConnectionView = {
  id: CONNECTION_ID,
  displayName: 'Ventas',
  metaAppId: '111',
  wabaId: '222',
  phoneNumberId: '333',
  displayPhoneNumber: '+57 300 0000000',
  verifiedName: 'Empresa',
  status: 'PENDING',
  lastError: null,
  lastCheckedAt: '2026-10-09T12:00:00.000Z',
  lastWebhookAt: null,
}

const FIELDS = {
  displayName: 'Ventas',
  metaAppId: '111',
  wabaId: '222',
  phoneNumberId: '333',
  accessToken: ACCESS_TOKEN,
  appSecret: APP_SECRET,
}

function formDataOf(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

const idForm = (): FormData => formDataOf({ id: CONNECTION_ID })

/** Lo que nunca puede viajar en un estado: secretos en claro, sus valores cifrados ni el resumen. */
function expectNoSecrets(state: unknown): void {
  const serialized = JSON.stringify(state)
  for (const forbidden of [ACCESS_TOKEN, APP_SECRET, VERIFY_TOKEN_HASH, 'Enc', 'verifyTokenHash', 'accessToken', 'appSecret']) {
    expect(serialized, `el estado lleva ${forbidden}`).not.toContain(forbidden)
  }
}

function happyPath(): void {
  getMock.mockResolvedValue(VIEW)
  createMock.mockResolvedValue({ status: 'created', connection: VIEW, verifyToken: VERIFY_TOKEN })
  updateMock.mockResolvedValue({ status: 'saved', connection: VIEW })
  testMock.mockResolvedValue({ status: 'tested', ok: true, connection: VIEW })
  setEnabledMock.mockResolvedValue({ status: 'saved', connection: VIEW })
  regenerateMock.mockResolvedValue({ status: 'regenerated', connection: VIEW, verifyToken: VERIFY_TOKEN })
}

/** Cada accion con la entrada minima que la lleva hasta su caso de uso. */
const ACTIONS = {
  get: () => getWhatsappConnectionAction(),
  create: () => createWhatsappConnectionAction({ status: 'idle' }, formDataOf(FIELDS)),
  update: () => updateWhatsappConnectionAction(CONNECTION_ID, { status: 'idle' }, formDataOf(FIELDS)),
  test: () => testWhatsappConnectionAction({ status: 'idle' }, idForm()),
  disable: () => disableWhatsappConnectionAction({ status: 'idle' }, idForm()),
  enable: () => enableWhatsappConnectionAction({ status: 'idle' }, idForm()),
  regenerate: () => regenerateWhatsappVerifyTokenAction({ status: 'idle' }, idForm()),
} as const

const USE_CASE_OF = {
  get: getMock,
  create: createMock,
  update: updateMock,
  test: testMock,
  disable: setEnabledMock,
  enable: setEnabledMock,
  regenerate: regenerateMock,
} as const

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUserMock.mockResolvedValue(SESSION_USER)
  getSessionContextMock.mockResolvedValue({ companyId: COMPANY_ID })
  webhookUrlMock.mockImplementation(() => WEBHOOK)
  happyPath()
})

describe('acciones de la conexion de WhatsApp — estados de salida', () => {
  it('R10 — la consulta devuelve la vista y la URL del webhook, sin secretos', async () => {
    const result = await getWhatsappConnectionAction()
    expect(result).toEqual({ status: 'success', data: VIEW, webhook: WEBHOOK })
    expect(webhookUrlMock).toHaveBeenCalledWith(CONNECTION_ID)
    expectNoSecrets(result)

    getMock.mockResolvedValueOnce(null)
    expect(await getWhatsappConnectionAction()).toEqual({ status: 'success', data: null, webhook: null })
  })

  it('R10, R14 — el alta devuelve el verify token y la URL, sin el token ni el secret escritos', async () => {
    const result = await ACTIONS.create()
    expect(result).toEqual({ status: 'created', verifyToken: VERIFY_TOKEN, webhook: WEBHOOK })
    expect(createMock.mock.calls[0]?.[0]).toEqual(FIELDS)
    expectNoSecrets(result)
  })

  it('R10 — el alta con prueba fallida devuelve el mensaje de Meta y no revalida', async () => {
    createMock.mockResolvedValueOnce({ status: 'test_failed', message: 'Invalid OAuth access token' })
    const result = await ACTIONS.create()
    expect(result).toEqual({ status: 'test_failed', message: 'Invalid OAuth access token' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
    expectNoSecrets(result)
  })

  it('R10 — la edicion devuelve solo `saved`, y un secreto ausente baja como ausente', async () => {
    const result = await ACTIONS.update()
    expect(result).toEqual({ status: 'saved' })
    expect(updateMock.mock.calls[0]?.[0]).toBe(CONNECTION_ID)
    expectNoSecrets(result)

    await updateWhatsappConnectionAction(
      CONNECTION_ID,
      { status: 'idle' },
      formDataOf({ displayName: 'Ventas', metaAppId: '111', wabaId: '222', phoneNumberId: '333', accessToken: '' }),
    )
    expect(updateMock.mock.calls[1]?.[1]).toEqual({
      displayName: 'Ventas',
      metaAppId: '111',
      wabaId: '222',
      phoneNumberId: '333',
      accessToken: '',
      appSecret: undefined,
    })

    updateMock.mockResolvedValueOnce({ status: 'test_failed', message: 'Meta dijo no' })
    revalidatePathMock.mockClear()
    expect(await ACTIONS.update()).toEqual({ status: 'test_failed', message: 'Meta dijo no' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('R10 — probar devuelve `tested` con ok y, si falla, el mensaje; nunca la conexion', async () => {
    const ok = await ACTIONS.test()
    expect(ok).toEqual({ status: 'tested', ok: true })
    expect(testMock).toHaveBeenCalledWith(CONNECTION_ID, ACTOR)

    testMock.mockResolvedValueOnce({ status: 'tested', ok: false, connection: VIEW, message: 'Token caducado' })
    const failed = await ACTIONS.test()
    expect(failed).toEqual({ status: 'tested', ok: false, message: 'Token caducado' })
    expectNoSecrets(ok)
    expectNoSecrets(failed)
  })

  it('R10 — deshabilitar y habilitar devuelven `saved`; habilitar con prueba fallida, `test_failed`', async () => {
    expect(await ACTIONS.disable()).toEqual({ status: 'saved' })
    expect(setEnabledMock).toHaveBeenLastCalledWith(CONNECTION_ID, false, ACTOR)

    expect(await ACTIONS.enable()).toEqual({ status: 'saved' })
    expect(setEnabledMock).toHaveBeenLastCalledWith(CONNECTION_ID, true, ACTOR)

    setEnabledMock.mockResolvedValueOnce({ status: 'test_failed', message: 'Numero no encontrado' })
    revalidatePathMock.mockClear()
    expect(await ACTIONS.enable()).toEqual({ status: 'test_failed', message: 'Numero no encontrado' })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('R15 — regenerar devuelve el verify token nuevo y la URL', async () => {
    const result = await ACTIONS.regenerate()
    expect(result).toEqual({ status: 'regenerated', verifyToken: VERIFY_TOKEN, webhook: WEBHOOK })
    expect(regenerateMock).toHaveBeenCalledWith(CONNECTION_ID, ACTOR)
    expectNoSecrets(result)
  })

  it('R14, R15 — el verify token solo viaja en `created` y `regenerated`', async () => {
    for (const [name, action] of Object.entries(ACTIONS)) {
      const result = await action()
      const carriesToken = JSON.stringify(result).includes(VERIFY_TOKEN)
      expect(carriesToken, name).toBe(name === 'create' || name === 'regenerate')
      expectNoSecrets(result)
    }
  })

  it('R10 — un caso de uso que devolviera la fila entera no la filtra: el borde copia solo lo suyo', async () => {
    const leaky = { ...VIEW, accessTokenEnc: 'v1:enc', appSecretEnc: 'v1:enc', verifyTokenHash: VERIFY_TOKEN_HASH }
    createMock.mockResolvedValueOnce({ status: 'created', connection: leaky, verifyToken: VERIFY_TOKEN })
    updateMock.mockResolvedValueOnce({ status: 'saved', connection: leaky })
    testMock.mockResolvedValueOnce({ status: 'tested', ok: true, connection: leaky })
    setEnabledMock.mockResolvedValueOnce({ status: 'saved', connection: leaky })
    regenerateMock.mockResolvedValueOnce({ status: 'regenerated', connection: leaky, verifyToken: VERIFY_TOKEN })

    for (const name of ['create', 'update', 'test', 'disable', 'regenerate'] as const) {
      expectNoSecrets(await ACTIONS[name]())
    }
  })
})

describe('acciones de la conexion de WhatsApp — actor, revalidacion y errores', () => {
  it('cada accion construye el actor con usuario y empresa de la sesion, y sin sesion pasa `null`', async () => {
    for (const [name, action] of Object.entries(ACTIONS)) {
      await action()
      const calls = USE_CASE_OF[name as keyof typeof ACTIONS].mock.calls
      const lastCall = calls[calls.length - 1] ?? []
      expect(lastCall[lastCall.length - 1], name).toEqual(ACTOR)
    }

    getSessionContextMock.mockResolvedValue(null)
    createMock.mockRejectedValueOnce(new UnauthorizedError())
    const result = await ACTIONS.create()
    expect(createMock.mock.calls[createMock.mock.calls.length - 1]?.[1]).toBeNull()
    expect(result).toEqual({ status: 'error', code: 'unauthorized', message: errorMessage('unauthorized') })
  })

  it('cada mutacion con exito revalida la pantalla de WhatsApp; la consulta no', async () => {
    await ACTIONS.get()
    expect(revalidatePathMock).not.toHaveBeenCalled()

    for (const name of ['create', 'update', 'test', 'disable', 'enable', 'regenerate'] as const) {
      revalidatePathMock.mockClear()
      await ACTIONS[name]()
      expect(revalidatePathMock, name).toHaveBeenCalledWith(WHATSAPP_ROUTE)
    }
  })

  it('un formulario sin id llega al caso de uso como cadena vacia: el no encontrado sale del catalogo', async () => {
    testMock.mockRejectedValueOnce(new WhatsappConnectionNotFoundError())
    const result = await testWhatsappConnectionAction({ status: 'idle' }, new FormData())
    expect(testMock).toHaveBeenCalledWith('', ACTOR)
    expect(result).toEqual({
      status: 'error',
      code: 'whatsapp_connection_not_found',
      message: errorMessage('whatsapp_connection_not_found'),
    })
  })

  it('R10 — cada error de dominio se traduce por su codigo con el texto del catalogo, sin diagnostico', async () => {
    const CASES = [
      { error: new UnauthorizedError('diagnostico interno'), code: 'unauthorized' },
      { error: new ValidationError('diagnostico interno'), code: 'invalid_input' },
      { error: new WhatsappConnectionNotFoundError('diagnostico interno'), code: 'whatsapp_connection_not_found' },
      { error: new WhatsappConnectionExistsError('diagnostico interno'), code: 'whatsapp_connection_exists' },
      { error: new WhatsappPhoneNumberTakenError('diagnostico interno'), code: 'whatsapp_phone_number_taken' },
      { error: new ActionNotAllowedError('diagnostico interno'), code: 'action_not_allowed' },
      { error: new SecretUnreadableError('diagnostico interno'), code: 'integration_secret_unreadable' },
    ] as const

    for (const [name, action] of Object.entries(ACTIONS)) {
      for (const { error, code } of CASES) {
        USE_CASE_OF[name as keyof typeof ACTIONS].mockRejectedValueOnce(error)
        revalidatePathMock.mockClear()
        const result = await action()
        expect(result, `${name} / ${code}`).toEqual({ status: 'error', code, message: errorMessage(code) })
        expect(JSON.stringify(result)).not.toContain('diagnostico interno')
        expect(revalidatePathMock).not.toHaveBeenCalled()
      }
    }
  })

  it('R10 — un error ajeno al dominio sale como `unexpected` con referencia y sin su texto', async () => {
    const foreign = new Error(`fallo con ${ACCESS_TOKEN} dentro`)
    for (const [name, action] of Object.entries(ACTIONS)) {
      USE_CASE_OF[name as keyof typeof ACTIONS].mockRejectedValueOnce(foreign)
      const result = await action()
      expect(result, name).toEqual({
        status: 'error',
        code: 'unexpected',
        message: errorMessage('unexpected'),
        reference: REQUEST_ID,
      })
      expectNoSecrets(result)
    }
  })

  it('el borde no decide: ni permiso, ni esquema, ni ORM, ni adaptadores driven', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..', '..', '..', '..',
        'lib', 'modules', 'integraciones', 'adapters', 'driving', 'whatsapp-connection-actions.ts',
      ),
      'utf8',
    )
    expect(source.startsWith("'use server';")).toBe(true)
    expect(source).not.toMatch(/requirePermission|integraciones\.modificar|Administrador/)
    expect(source).not.toMatch(/Schema\b/)
    expect(source).not.toMatch(/@prisma\/client|prisma\./)
    expect(source).not.toMatch(/adapters\/driven|\.\.\/driven/)
  })
})
