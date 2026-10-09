import { describe, expect, it } from 'vitest'

import { WhatsappConnectionNotFoundError } from '@/lib/modules/integraciones/domain/errors'
import { createRegenerateWhatsappVerifyToken } from '@/lib/modules/integraciones/domain/regenerate-whatsapp-verify-token'
import type { WhatsappConnectionRecord } from '@/lib/modules/integraciones/domain/whatsapp-connection'

import {
  CONNECTION_ID,
  NOW,
  OTHER_COMPANY_ID,
  admin,
  makeCipher,
  makeDigest,
  makeRandom,
  makeRepository,
  storedConnection,
} from './whatsapp-doubles'

const OLD_TOKEN = 'verify-token-viejo'

function setup(record: Partial<WhatsappConnectionRecord> = {}) {
  const digest = makeDigest()
  const cipher = makeCipher()
  const repo = makeRepository([
    storedConnection(cipher.seed, { verifyTokenHash: digest.digestOf(OLD_TOKEN), ...record }),
  ])
  const random = makeRandom(['verify-token-regenerado'])
  const regenerate = createRegenerateWhatsappVerifyToken({ connections: repo.connections, digest, random })
  return { digest, cipher, repo, random, regenerate }
}

describe('regenerar el verify token', () => {
  it('R15: reemplaza el resumen, el anterior deja de casar y el nuevo se devuelve en claro solo en la respuesta', async () => {
    const { digest, repo, regenerate } = setup()
    const result = await regenerate(CONNECTION_ID, admin())

    expect(result).toMatchObject({ status: 'regenerated', verifyToken: 'verify-token-regenerado' })
    const guardado = repo.row(CONNECTION_ID)?.verifyTokenHash ?? ''
    expect(digest.matches('verify-token-regenerado', guardado)).toBe(true)
    expect(digest.matches(OLD_TOKEN, guardado)).toBe(false)
    expect(guardado).not.toContain('verify-token-regenerado')
    expect(JSON.stringify(result.connection)).not.toContain('verify-token-regenerado')
  })

  it('R15: el estado y el resto de la conexion no cambian', async () => {
    const { repo, cipher, regenerate } = setup({ status: 'ACTIVE', lastWebhookAt: NOW, lastError: null })
    const antes = repo.row(CONNECTION_ID)
    await regenerate(CONNECTION_ID, admin())

    expect(repo.update.mock.calls[0]?.[1]).toEqual({ verifyTokenHash: expect.any(String) })
    const despues = repo.row(CONNECTION_ID)
    expect({ ...despues, verifyTokenHash: null }).toEqual({ ...antes, verifyTokenHash: null })
    expect(despues?.verifyTokenHash).not.toBe(antes?.verifyTokenHash)
    expect(despues?.status).toBe('ACTIVE')
    expect(cipher.decrypt).not.toHaveBeenCalled()
  })

  it('R15: cada regeneracion invalida la anterior', async () => {
    const digest = makeDigest()
    const cipher = makeCipher()
    const repo = makeRepository([storedConnection(cipher.seed)])
    const regenerate = createRegenerateWhatsappVerifyToken({
      connections: repo.connections,
      digest,
      random: makeRandom(['primero', 'segundo']),
    })
    await regenerate(CONNECTION_ID, admin())
    await regenerate(CONNECTION_ID, admin())

    const guardado = repo.row(CONNECTION_ID)?.verifyTokenHash ?? ''
    expect(digest.matches('segundo', guardado)).toBe(true)
    expect(digest.matches('primero', guardado)).toBe(false)
  })

  it('R3: regenerar sobre una conexion de otra empresa responde not_found sin generar ni escribir', async () => {
    const { repo, random, regenerate } = setup({ companyId: OTHER_COMPANY_ID })
    await expect(regenerate(CONNECTION_ID, admin())).rejects.toBeInstanceOf(WhatsappConnectionNotFoundError)
    expect(random.newVerifyToken).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })
})
