import { describe, expect, it } from 'vitest'

import {
  SecretUnreadableError,
  ValidationError,
  WhatsappConnectionNotFoundError,
} from '@/lib/modules/integraciones/domain/errors'
import { HIDDEN_SECRET_MARK } from '@/lib/modules/integraciones/domain/graph-failure'
import { createUpdateWhatsappConnection } from '@/lib/modules/integraciones/domain/update-whatsapp-connection'
import type { WhatsappConnectionRecord } from '@/lib/modules/integraciones/domain/whatsapp-connection'
import type { GraphProbeResult } from '@/lib/modules/integraciones/ports/whatsapp-graph-client'

import {
  ACCESS_TOKEN,
  COMPANY_ID,
  CONNECTION_ID,
  GOOD_PROBE,
  NOW,
  OTHER_COMPANY_ID,
  admin,
  makeCipher,
  makeGraph,
  makeRepository,
  storedConnection,
  validCreateInput,
} from './whatsapp-doubles'

const NEW_TOKEN = 'EAAG-token-nuevo'
const NEW_SECRET = 'app-secret-nuevo'

function setup(
  options: {
    probe?: GraphProbeResult
    record?: Partial<WhatsappConnectionRecord>
    extra?: (WhatsappConnectionRecord & { deleted?: boolean })[]
    deleted?: boolean
  } = {},
) {
  const cipher = makeCipher()
  const stored = { ...storedConnection(cipher.seed, options.record), deleted: options.deleted }
  const repo = makeRepository([stored, ...(options.extra ?? [])])
  const graph = makeGraph(options.probe ?? GOOD_PROBE)
  const update = createUpdateWhatsappConnection({
    connections: repo.connections,
    graph: graph.graph,
    cipher: cipher.cipher,
    now: () => NOW,
  })
  return { cipher, stored, repo, graph, update }
}

/** Edicion sin secretos y con los mismos IDs que la conexion guardada. */
function editInput(overrides: Record<string, unknown> = {}) {
  return validCreateInput({ accessToken: '', appSecret: '', ...overrides })
}

describe('editar la conexion de WhatsApp', () => {
  it('R3: un id de otra empresa responde whatsapp_connection_not_found y no modifica nada', async () => {
    const { repo, graph, update } = setup({ record: { companyId: OTHER_COMPANY_ID } })
    const promesa = update(CONNECTION_ID, editInput({ displayName: 'Otro' }), admin())
    await expect(promesa).rejects.toBeInstanceOf(WhatsappConnectionNotFoundError)
    await expect(promesa).rejects.toMatchObject({ code: 'whatsapp_connection_not_found' })
    expect(repo.update).not.toHaveBeenCalled()
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
  })

  it('R3: un id inexistente o sin forma de uuid responde el mismo not_found sin escribir', async () => {
    const { repo, update } = setup()
    await expect(update('00000000-0000-4000-8000-00000000ffff', editInput(), admin())).rejects.toMatchObject({
      code: 'whatsapp_connection_not_found',
    })
    await expect(update('no-es-un-uuid', editInput(), admin())).rejects.toMatchObject({
      code: 'whatsapp_connection_not_found',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('R3: una conexion borrada responde el mismo not_found', async () => {
    const { repo, update } = setup({ deleted: true })
    await expect(update(CONNECTION_ID, editInput(), admin())).rejects.toMatchObject({
      code: 'whatsapp_connection_not_found',
    })
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('R25, R27: cambiar solo displayName, App ID y WABA ID guarda sin llamar a Graph y sin cambiar el estado', async () => {
    const { repo, graph, cipher, update } = setup({ record: { status: 'ACTIVE', lastWebhookAt: NOW } })
    const result = await update(
      CONNECTION_ID,
      editInput({ displayName: 'Soporte', metaAppId: 'app-nuevo', wabaId: 'waba-nueva' }),
      admin(),
    )

    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(cipher.decrypt).not.toHaveBeenCalled()
    expect(cipher.encrypt).not.toHaveBeenCalled()
    const [, patch] = repo.update.mock.calls[0] ?? []
    expect(patch).not.toHaveProperty('status')
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      displayName: 'Soporte',
      metaAppId: 'app-nuevo',
      wabaId: 'waba-nueva',
      status: 'ACTIVE',
    })
    expect(result).toMatchObject({ status: 'saved', connection: { displayName: 'Soporte', status: 'ACTIVE' } })
  })

  it('R11: con los dos secretos vacios conserva los valores guardados sin descifrarlos ni volver a cifrarlos', async () => {
    const { repo, cipher, stored, update } = setup()
    await update(CONNECTION_ID, editInput({ displayName: 'Otro', accessToken: '   ', appSecret: null }), admin())

    expect(cipher.decrypt).not.toHaveBeenCalled()
    expect(cipher.encrypt).not.toHaveBeenCalled()
    const [, patch] = repo.update.mock.calls[0] ?? []
    expect(patch).not.toHaveProperty('accessTokenEnc')
    expect(patch).not.toHaveProperty('appSecretEnc')
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      accessTokenEnc: stored.accessTokenEnc,
      appSecretEnc: stored.appSecretEnc,
    })
  })

  it('R11: con el App Secret vacio y el Phone Number ID cambiado, el App Secret no se descifra ni se cifra', async () => {
    const { cipher, repo, stored, update } = setup()
    await update(CONNECTION_ID, editInput({ phoneNumberId: 'telefono-nuevo' }), admin())

    expect(cipher.decrypt.mock.calls.map(([, context]) => context.field)).toEqual(['access_token'])
    expect(cipher.encrypt).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)?.appSecretEnc).toBe(stored.appSecretEnc)
  })

  it('R12, R26: un Access Token nuevo reemplaza el guardado y la prueba usa el token nuevo', async () => {
    const { repo, cipher, graph, stored, update } = setup()
    const result = await update(CONNECTION_ID, editInput({ accessToken: NEW_TOKEN }), admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: '3456789012', accessToken: NEW_TOKEN })
    expect(cipher.decrypt).not.toHaveBeenCalled()
    expect(cipher.encrypt.mock.calls).toEqual([
      [NEW_TOKEN, { companyId: COMPANY_ID, recordId: CONNECTION_ID, field: 'access_token' }],
    ])
    const row = repo.row(CONNECTION_ID)
    expect(row?.accessTokenEnc).not.toBe(stored.accessTokenEnc)
    expect(row?.accessTokenEnc).toBe(await cipher.encrypt.mock.results[0]?.value)
    expect(row?.appSecretEnc).toBe(stored.appSecretEnc)
    expect(result.status).toBe('saved')
  })

  it('R12, R26: un App Secret nuevo se cifra en su contexto y la prueba usa el token guardado descifrado', async () => {
    const { repo, cipher, graph, update } = setup()
    await update(CONNECTION_ID, editInput({ appSecret: NEW_SECRET }), admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: '3456789012', accessToken: ACCESS_TOKEN })
    expect(cipher.encrypt.mock.calls).toEqual([
      [NEW_SECRET, { companyId: COMPANY_ID, recordId: CONNECTION_ID, field: 'app_secret' }],
    ])
    expect(repo.row(CONNECTION_ID)?.appSecretEnc).toBe(await cipher.encrypt.mock.results[0]?.value)
  })

  it('R26, R19: cambiar el Phone Number ID prueba con el nuevo y guarda numero, nombre, lastCheckedAt y vacia lastError', async () => {
    const { repo, graph, update } = setup({ record: { status: 'ERROR', lastError: 'fallo anterior' } })
    await update(CONNECTION_ID, editInput({ phoneNumberId: 'telefono-nuevo' }), admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: 'telefono-nuevo', accessToken: ACCESS_TOKEN })
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      phoneNumberId: 'telefono-nuevo',
      displayPhoneNumber: '+57 300 1234567',
      verifiedName: 'Empresa Verificada',
      lastCheckedAt: NOW,
      lastError: null,
      status: 'PENDING',
    })
  })

  it('R26: con prueba fallida no se guarda ningun cambio y se devuelve el mensaje de Meta saneado', async () => {
    const { repo, cipher, stored, update } = setup({
      record: { status: 'ACTIVE', lastWebhookAt: NOW },
      probe: { ok: false, kind: 'rejected', message: `Token ${NEW_TOKEN} invalido, secret ${NEW_SECRET}` },
    })
    const antes = repo.row(CONNECTION_ID)

    const result = await update(
      CONNECTION_ID,
      editInput({ displayName: 'Cambiado', phoneNumberId: 'otro', accessToken: NEW_TOKEN, appSecret: NEW_SECRET }),
      admin(),
    )

    expect(result).toEqual({
      status: 'test_failed',
      message: `Token ${HIDDEN_SECRET_MARK} invalido, secret ${HIDDEN_SECRET_MARK}`,
    })
    expect(repo.update).not.toHaveBeenCalled()
    expect(cipher.encrypt).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)).toEqual(antes)
    expect(repo.row(CONNECTION_ID)?.accessTokenEnc).toBe(stored.accessTokenEnc)
  })

  it('R31: tras una prueba buena el estado es ACTIVE si lastWebhookAt no es nulo', async () => {
    const { repo, update } = setup({ record: { status: 'ERROR', lastWebhookAt: new Date('2026-10-05T00:00:00Z') } })
    await update(CONNECTION_ID, editInput({ accessToken: NEW_TOKEN }), admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('ACTIVE')
  })

  it('R31: tras una prueba buena el estado es PENDING si lastWebhookAt es nulo', async () => {
    const { repo, update } = setup({ record: { status: 'ACTIVE', lastWebhookAt: null } })
    await update(CONNECTION_ID, editInput({ accessToken: NEW_TOKEN }), admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('PENDING')
  })

  it('R31: una conexion deshabilitada sigue DISABLED tras editar con prueba buena', async () => {
    const { repo, update } = setup({ record: { status: 'DISABLED' } })
    await update(CONNECTION_ID, editInput({ accessToken: NEW_TOKEN }), admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('DISABLED')
  })

  it('R13, D10: si el token guardado no se descifra al editar el telefono, no llama a Graph, no guarda nada y relanza', async () => {
    const { repo, graph, update } = setup({ record: { accessTokenEnc: 'v1:ilegible' } })
    const antes = { ...repo.row(CONNECTION_ID) }
    const promesa = update(CONNECTION_ID, editInput({ phoneNumberId: 'telefono-nuevo' }), admin())

    await expect(promesa).rejects.toBeInstanceOf(SecretUnreadableError)
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)).toEqual(antes)
  })

  it('R25: las reglas de R24 aplican al editar (displayName vacio, ID vacio, secreto de mas de 1024)', async () => {
    const { repo, graph, update } = setup()
    for (const cambio of [{ displayName: ' ' }, { wabaId: '' }, { appSecret: 'x'.repeat(1025) }]) {
      await expect(update(CONNECTION_ID, editInput(cambio), admin())).rejects.toBeInstanceOf(ValidationError)
    }
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('R25: el resultado expone la vista sin secretos ni valores cifrados', async () => {
    const { stored, update } = setup()
    const result = await update(CONNECTION_ID, editInput({ accessToken: NEW_TOKEN }), admin())
    const json = JSON.stringify(result)
    for (const prohibido of [NEW_TOKEN, ACCESS_TOKEN, stored.accessTokenEnc, stored.appSecretEnc, COMPANY_ID]) {
      expect(json).not.toContain(prohibido)
    }
  })
})
