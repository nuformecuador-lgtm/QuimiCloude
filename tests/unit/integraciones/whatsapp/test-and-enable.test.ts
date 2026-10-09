import { describe, expect, it } from 'vitest'

import { UNREADABLE_SECRET_MESSAGE } from '@/lib/modules/integraciones/domain/connection-secrets'
import {
  ActionNotAllowedError,
  SecretUnreadableError,
  WhatsappConnectionNotFoundError,
} from '@/lib/modules/integraciones/domain/errors'
import { GRAPH_UNREACHABLE_MESSAGE, HIDDEN_SECRET_MARK } from '@/lib/modules/integraciones/domain/graph-failure'
import { createSetWhatsappConnectionEnabled } from '@/lib/modules/integraciones/domain/set-whatsapp-connection-enabled'
import { createTestWhatsappConnection } from '@/lib/modules/integraciones/domain/test-whatsapp-connection'
import type { WhatsappConnectionRecord } from '@/lib/modules/integraciones/domain/whatsapp-connection'
import type { GraphProbeResult } from '@/lib/modules/integraciones/ports/whatsapp-graph-client'

import {
  ACCESS_TOKEN,
  APP_SECRET,
  CONNECTION_ID,
  GOOD_PROBE,
  NOW,
  OTHER_COMPANY_ID,
  admin,
  makeCipher,
  makeGraph,
  makeRepository,
  storedConnection,
} from './whatsapp-doubles'

const WEBHOOK_AT = new Date('2026-10-05T00:00:00.000Z')

function setup(options: { probe?: GraphProbeResult; record?: Partial<WhatsappConnectionRecord> } = {}) {
  const cipher = makeCipher()
  const repo = makeRepository([storedConnection(cipher.seed, options.record)])
  const graph = makeGraph(options.probe ?? GOOD_PROBE)
  const deps = { connections: repo.connections, graph: graph.graph, cipher: cipher.cipher, now: () => NOW }
  return {
    cipher,
    repo,
    graph,
    test: createTestWhatsappConnection(deps),
    setEnabled: createSetWhatsappConnectionEnabled(deps),
  }
}

describe('probar la conexion', () => {
  it('R28, R19: prueba buena llama a Graph con el token guardado y guarda numero, nombre, lastCheckedAt y vacia lastError', async () => {
    const { repo, graph, test } = setup({ record: { status: 'ERROR', lastError: 'antes' } })
    const result = await test(CONNECTION_ID, admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: '3456789012', accessToken: ACCESS_TOKEN })
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      displayPhoneNumber: '+57 300 1234567',
      verifiedName: 'Empresa Verificada',
      lastCheckedAt: NOW,
      lastError: null,
    })
    expect(result).toMatchObject({ status: 'tested', ok: true, connection: { lastError: null } })
  })

  it('R31: tras probar bien queda PENDING sin webhooks recibidos', async () => {
    const { repo, test } = setup({ record: { status: 'ERROR', lastWebhookAt: null } })
    await test(CONNECTION_ID, admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('PENDING')
  })

  it('R31: tras probar bien queda ACTIVE si ya recibio algun webhook', async () => {
    const { repo, test } = setup({ record: { status: 'ERROR', lastWebhookAt: WEBHOOK_AT } })
    await test(CONNECTION_ID, admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('ACTIVE')
  })

  it('R28: prueba fallida deja ERROR, lastError con el mensaje de Meta saneado y lastCheckedAt, sin tocar el numero', async () => {
    const { repo, test } = setup({
      record: { status: 'ACTIVE', lastWebhookAt: WEBHOOK_AT },
      probe: { ok: false, kind: 'rejected', message: `Error con ${ACCESS_TOKEN} y ${APP_SECRET}` },
    })
    const result = await test(CONNECTION_ID, admin())

    const esperado = `Error con ${HIDDEN_SECRET_MARK} y ${HIDDEN_SECRET_MARK}`
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      status: 'ERROR',
      lastError: esperado,
      lastCheckedAt: NOW,
      displayPhoneNumber: '+57 300 0000000',
      verifiedName: 'Nombre Anterior',
    })
    expect(result).toMatchObject({ status: 'tested', ok: false, message: esperado })
  })

  it('R28: Meta inalcanzable guarda el texto fijo como ultimo error', async () => {
    const { repo, test } = setup({ probe: { ok: false, kind: 'unreachable', message: null } })
    await test(CONNECTION_ID, admin())
    expect(repo.row(CONNECTION_ID)?.lastError).toBe(GRAPH_UNREACHABLE_MESSAGE)
  })

  it('R32: probar una conexion DISABLED rechaza con action_not_allowed sin llamar a Graph ni escribir', async () => {
    const { repo, graph, cipher, test } = setup({ record: { status: 'DISABLED' } })
    const promesa = test(CONNECTION_ID, admin())
    await expect(promesa).rejects.toBeInstanceOf(ActionNotAllowedError)
    await expect(promesa).rejects.toMatchObject({ code: 'action_not_allowed' })
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(cipher.decrypt).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('R13: un secreto ilegible al probar responde integration_secret_unreadable, deja ERROR con el aviso y no llama a Graph', async () => {
    const { repo, graph, test } = setup({ record: { status: 'ACTIVE', appSecretEnc: 'v1:ilegible' } })
    const promesa = test(CONNECTION_ID, admin())
    await expect(promesa).rejects.toBeInstanceOf(SecretUnreadableError)
    await expect(promesa).rejects.toMatchObject({ code: 'integration_secret_unreadable' })
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)).toMatchObject({ status: 'ERROR', lastError: UNREADABLE_SECRET_MESSAGE })
  })

  it('R13: un valor cifrado en el contexto de otra conexion no se descifra', async () => {
    const cipher = makeCipher()
    const ajeno = cipher.seed(ACCESS_TOKEN, { companyId: OTHER_COMPANY_ID, recordId: CONNECTION_ID, field: 'access_token' })
    const repo = makeRepository([storedConnection(cipher.seed, { accessTokenEnc: ajeno })])
    const graph = makeGraph()
    const test = createTestWhatsappConnection({ connections: repo.connections, graph: graph.graph, cipher: cipher.cipher })
    await expect(test(CONNECTION_ID, admin())).rejects.toBeInstanceOf(SecretUnreadableError)
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
  })

  it('R3: probar una conexion de otra empresa responde not_found', async () => {
    const { graph, test } = setup({ record: { companyId: OTHER_COMPANY_ID } })
    await expect(test(CONNECTION_ID, admin())).rejects.toBeInstanceOf(WhatsappConnectionNotFoundError)
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
  })
})

describe('deshabilitar y habilitar', () => {
  it('R29: deshabilitar deja DISABLED sin llamar a Graph ni descifrar', async () => {
    const { repo, graph, cipher, setEnabled } = setup({ record: { status: 'ACTIVE' } })
    const result = await setEnabled(CONNECTION_ID, false, admin())

    expect(repo.row(CONNECTION_ID)?.status).toBe('DISABLED')
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(cipher.decrypt).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'saved', connection: { status: 'DISABLED' } })
  })

  it('R29: deshabilitar una ya deshabilitada no cambia nada', async () => {
    const { repo, graph, setEnabled } = setup({ record: { status: 'DISABLED' } })
    const result = await setEnabled(CONNECTION_ID, false, admin())

    expect(repo.update).not.toHaveBeenCalled()
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'saved', connection: { status: 'DISABLED' } })
  })

  it('R30, R19: habilitar una DISABLED ejecuta la prueba y, buena, guarda numero, nombre y lastCheckedAt', async () => {
    const { repo, graph, setEnabled } = setup({ record: { status: 'DISABLED', lastError: 'viejo' } })
    const result = await setEnabled(CONNECTION_ID, true, admin())

    expect(graph.fetchPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: '3456789012', accessToken: ACCESS_TOKEN })
    expect(repo.row(CONNECTION_ID)).toMatchObject({
      status: 'PENDING',
      displayPhoneNumber: '+57 300 1234567',
      verifiedName: 'Empresa Verificada',
      lastCheckedAt: NOW,
      lastError: null,
    })
    expect(result).toMatchObject({ status: 'saved', connection: { status: 'PENDING' } })
  })

  it('R31: habilitar con prueba buena deja ACTIVE si ya recibio webhooks', async () => {
    const { repo, setEnabled } = setup({ record: { status: 'DISABLED', lastWebhookAt: WEBHOOK_AT } })
    await setEnabled(CONNECTION_ID, true, admin())
    expect(repo.row(CONNECTION_ID)?.status).toBe('ACTIVE')
  })

  it('R30: habilitar con prueba fallida sigue DISABLED, no escribe y devuelve el mensaje de Meta', async () => {
    const { repo, setEnabled } = setup({
      record: { status: 'DISABLED' },
      probe: { ok: false, kind: 'rejected', message: `Token ${ACCESS_TOKEN} caducado` },
    })
    const antes = repo.row(CONNECTION_ID)
    const result = await setEnabled(CONNECTION_ID, true, admin())

    expect(result).toEqual({ status: 'test_failed', message: `Token ${HIDDEN_SECRET_MARK} caducado` })
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)).toEqual(antes)
    expect(repo.row(CONNECTION_ID)?.status).toBe('DISABLED')
  })

  it('R30: habilitar una que no esta DISABLED no llama a Graph ni escribe', async () => {
    const { repo, graph, setEnabled } = setup({ record: { status: 'PENDING' } })
    const result = await setEnabled(CONNECTION_ID, true, admin())
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'saved', connection: { status: 'PENDING' } })
  })

  it('R13: habilitar con un secreto ilegible relanza integration_secret_unreadable, sigue DISABLED y no llama a Graph', async () => {
    const { repo, graph, setEnabled } = setup({ record: { status: 'DISABLED', accessTokenEnc: 'v1:ilegible' } })
    await expect(setEnabled(CONNECTION_ID, true, admin())).rejects.toBeInstanceOf(SecretUnreadableError)
    expect(graph.fetchPhoneNumber).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.row(CONNECTION_ID)?.status).toBe('DISABLED')
  })

  it('R3: deshabilitar una conexion de otra empresa responde not_found sin escribir', async () => {
    const { repo, setEnabled } = setup({ record: { companyId: OTHER_COMPANY_ID } })
    await expect(setEnabled(CONNECTION_ID, false, admin())).rejects.toBeInstanceOf(WhatsappConnectionNotFoundError)
    expect(repo.update).not.toHaveBeenCalled()
  })
})
