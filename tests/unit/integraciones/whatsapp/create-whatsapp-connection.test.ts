import { describe, expect, it } from 'vitest'

import { createCreateWhatsappConnection } from '@/lib/modules/integraciones/domain/create-whatsapp-connection'
import { ValidationError, WhatsappConnectionExistsError } from '@/lib/modules/integraciones/domain/errors'
import { GRAPH_UNREACHABLE_MESSAGE, HIDDEN_SECRET_MARK } from '@/lib/modules/integraciones/domain/graph-failure'
import {
  WHATSAPP_DISPLAY_NAME_MAX_LENGTH,
  WHATSAPP_SECRET_MAX_LENGTH,
} from '@/lib/modules/integraciones/domain/whatsapp-connection-input'
import type { GraphProbeResult } from '@/lib/modules/integraciones/ports/whatsapp-graph-client'

import {
  ACCESS_TOKEN,
  ACTOR_ID,
  APP_SECRET,
  COMPANY_ID,
  GOOD_PROBE,
  NEW_CONNECTION_ID,
  NOW,
  admin,
  makeCipher,
  makeDigest,
  makeGraph,
  makeRandom,
  makeRepository,
  storedConnection,
  validCreateInput,
} from './whatsapp-doubles'

function setup(probe: GraphProbeResult = GOOD_PROBE, initial: Parameters<typeof makeRepository>[0] = []) {
  const repo = makeRepository(initial)
  const cipher = makeCipher()
  const graph = makeGraph(probe)
  const digest = makeDigest()
  const random = makeRandom(['verify-token-nuevo'])
  const create = createCreateWhatsappConnection({
    connections: repo.connections,
    graph: graph.graph,
    cipher: cipher.cipher,
    digest,
    random,
    now: () => NOW,
  })
  return { repo, cipher, graph, digest, random, create }
}

describe('crear la conexion de WhatsApp', () => {
  it('R21: la prueba contra Graph se ejecuta antes de persistir, con el Phone Number ID y el token escritos', async () => {
    const { repo, graph, create } = setup()
    await create(validCreateInput(), admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: '3456789012', accessToken: ACCESS_TOKEN })
    expect(graph.fetchPhoneNumber.mock.invocationCallOrder[0]).toBeLessThan(
      repo.create.mock.invocationCallOrder[0] ?? Number.NaN,
    )
  })

  it('R22, R8: prueba buena crea la conexion PENDING, MANUAL, con numero, nombre verificado, createdById y lastCheckedAt', async () => {
    const { repo, create } = setup()
    const result = await create(validCreateInput({ displayName: '  Ventas  ' }), admin())

    expect(result.status).toBe('created')
    const [row, scope] = repo.create.mock.calls[0] ?? []
    expect(scope).toEqual({ companyId: COMPANY_ID })
    expect(row).toMatchObject({
      id: NEW_CONNECTION_ID,
      origin: 'MANUAL',
      displayName: 'Ventas',
      metaAppId: '1234567890',
      wabaId: '2345678901',
      phoneNumberId: '3456789012',
      displayPhoneNumber: '+57 300 1234567',
      verifiedName: 'Empresa Verificada',
      status: 'PENDING',
      lastError: null,
      lastCheckedAt: NOW,
      createdById: ACTOR_ID,
    })
    if (result.status === 'created') {
      expect(result.connection).toMatchObject({ id: NEW_CONNECTION_ID, status: 'PENDING' })
    }
  })

  it('R9: cada secreto se cifra con {companyId, recordId = id de la conexion, field} y solo el valor cifrado llega a la base', async () => {
    const { repo, cipher, random, create } = setup()
    await create(validCreateInput(), admin())

    expect(cipher.encrypt.mock.calls).toEqual([
      [ACCESS_TOKEN, { companyId: COMPANY_ID, recordId: NEW_CONNECTION_ID, field: 'access_token' }],
      [APP_SECRET, { companyId: COMPANY_ID, recordId: NEW_CONNECTION_ID, field: 'app_secret' }],
    ])
    expect(random.newId.mock.invocationCallOrder[0]).toBeLessThan(cipher.encrypt.mock.invocationCallOrder[0] ?? Number.NaN)

    const [row] = repo.create.mock.calls[0] ?? []
    expect(row?.accessTokenEnc).toBe(await cipher.encrypt.mock.results[0]?.value)
    expect(row?.appSecretEnc).toBe(await cipher.encrypt.mock.results[1]?.value)
    const json = JSON.stringify(row)
    expect(json).not.toContain(ACCESS_TOKEN)
    expect(json).not.toContain(APP_SECRET)
  })

  it('R14: guarda solo el resumen del verify token y lo devuelve en claro en la respuesta del alta', async () => {
    const { repo, digest, create } = setup()
    const result = await create(validCreateInput(), admin())

    const [row] = repo.create.mock.calls[0] ?? []
    expect(row?.verifyTokenHash).toBe(digest.digestOf('verify-token-nuevo'))
    expect(JSON.stringify(row)).not.toContain('verify-token-nuevo')
    expect(result).toMatchObject({ status: 'created', verifyToken: 'verify-token-nuevo' })
    if (result.status === 'created') expect(JSON.stringify(result.connection)).not.toContain('verify-token-nuevo')
  })

  it('R23: prueba rechazada por Meta no crea ninguna fila y devuelve el mensaje de Meta saneado', async () => {
    const { repo, cipher, random, create } = setup({
      ok: false,
      kind: 'rejected',
      message: `Invalid OAuth access token ${ACCESS_TOKEN} for app ${APP_SECRET}`,
    })
    const result = await create(validCreateInput(), admin())

    expect(result).toEqual({
      status: 'test_failed',
      message: `Invalid OAuth access token ${HIDDEN_SECRET_MARK} for app ${HIDDEN_SECRET_MARK}`,
    })
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    expect(cipher.encrypt).not.toHaveBeenCalled()
    expect(random.newVerifyToken).not.toHaveBeenCalled()
  })

  it('R23: Meta inalcanzable devuelve el texto fijo y no crea nada', async () => {
    const { repo, create } = setup({ ok: false, kind: 'unreachable', message: null })
    expect(await create(validCreateInput(), admin())).toEqual({ status: 'test_failed', message: GRAPH_UNREACHABLE_MESSAGE })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('R6: con una conexion viva en la empresa rechaza con whatsapp_connection_exists sin llamar a Graph', async () => {
    const seedCipher = makeCipher()
    const { repo, graph, create } = setup(GOOD_PROBE, [storedConnection(seedCipher.seed)])

    await expect(create(validCreateInput(), admin())).rejects.toBeInstanceOf(WhatsappConnectionExistsError)
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  const INVALIDOS: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['displayName vacio tras recortar', { displayName: '   ' }],
    ['displayName de mas de 80 caracteres', { displayName: 'a'.repeat(WHATSAPP_DISPLAY_NAME_MAX_LENGTH + 1) }],
    ['metaAppId vacio', { metaAppId: ' ' }],
    ['wabaId vacio', { wabaId: '' }],
    ['phoneNumberId vacio', { phoneNumberId: '\t' }],
    ['accessToken vacio', { accessToken: '  ' }],
    ['appSecret vacio', { appSecret: '' }],
    ['accessToken de mas de 1024 caracteres', { accessToken: 'x'.repeat(WHATSAPP_SECRET_MAX_LENGTH + 1) }],
    ['appSecret de mas de 1024 caracteres', { appSecret: 'x'.repeat(WHATSAPP_SECRET_MAX_LENGTH + 1) }],
    ['un campo que no es texto', { wabaId: 42 }],
    ['un campo ausente', { metaAppId: undefined }],
  ]
  for (const [caso, cambio] of INVALIDOS) {
    it(`R24: ${caso} rechaza con invalid_input sin llamar a Graph ni escribir`, async () => {
      const { repo, graph, create } = setup()
      const promesa = create(validCreateInput(cambio), admin())
      await expect(promesa).rejects.toBeInstanceOf(ValidationError)
      await expect(promesa).rejects.toMatchObject({ code: 'invalid_input' })
      expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
      expect(repo.create).not.toHaveBeenCalled()
    })
  }

  it('R24: displayName de 80 caracteres y secretos de 1024 se aceptan', async () => {
    const { create } = setup()
    const result = await create(
      validCreateInput({
        displayName: 'a'.repeat(WHATSAPP_DISPLAY_NAME_MAX_LENGTH),
        accessToken: 't'.repeat(WHATSAPP_SECRET_MAX_LENGTH),
        appSecret: 's'.repeat(WHATSAPP_SECRET_MAX_LENGTH),
      }),
      admin(),
    )
    expect(result.status).toBe('created')
  })

  it('R24: IDs de Meta con letras, simbolos o muy largos se aceptan recortados y llegan a la prueba', async () => {
    const { repo, graph, create } = setup()
    const largo = '9'.repeat(300)
    await create(validCreateInput({ metaAppId: ' abc-1 ', wabaId: 'waba/2?x', phoneNumberId: ` ${largo}#x ` }), admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: `${largo}#x`, accessToken: ACCESS_TOKEN })
    expect(repo.create.mock.calls[0]?.[0]).toMatchObject({ metaAppId: 'abc-1', wabaId: 'waba/2?x', phoneNumberId: `${largo}#x` })
  })

  it('R24: un ID que Meta no reconoce termina como prueba fallida, no como invalid_input', async () => {
    const { repo, create } = setup({ ok: false, kind: 'rejected', message: 'Unsupported get request. Object with ID abc-1 does not exist' })
    const result = await create(validCreateInput({ phoneNumberId: 'abc-1' }), admin())
    expect(result).toEqual({ status: 'test_failed', message: 'Unsupported get request. Object with ID abc-1 does not exist' })
    expect(repo.create).not.toHaveBeenCalled()
  })
})
