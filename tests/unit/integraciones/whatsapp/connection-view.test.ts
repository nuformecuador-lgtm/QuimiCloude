import { describe, expect, it } from 'vitest'

import {
  toWhatsappConnectionView,
  type WhatsappConnectionRecord,
} from '@/lib/modules/integraciones/domain/whatsapp-connection'

const ACCESS_TOKEN_ENC = 'v1:token-cifrado'
const APP_SECRET_ENC = 'v1:secret-cifrado'
const VERIFY_TOKEN_HASH = 'a'.repeat(64)

function record(overrides: Partial<WhatsappConnectionRecord> = {}): WhatsappConnectionRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    companyId: '00000000-0000-4000-8000-0000000000aa',
    origin: 'MANUAL',
    displayName: 'Ventas',
    metaAppId: 'app-1',
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
    displayPhoneNumber: '+57 300 0000000',
    verifiedName: 'Empresa',
    accessTokenEnc: ACCESS_TOKEN_ENC,
    appSecretEnc: APP_SECRET_ENC,
    verifyTokenHash: VERIFY_TOKEN_HASH,
    status: 'PENDING',
    lastError: null,
    lastCheckedAt: new Date('2026-10-09T10:00:00.000Z'),
    lastWebhookAt: null,
    ...overrides,
  }
}

describe('toWhatsappConnectionView', () => {
  it('R10: la vista tiene exactamente los campos publicos, sin claves de secreto ni de empresa', () => {
    expect(Object.keys(toWhatsappConnectionView(record())).sort()).toEqual(
      [
        'displayName',
        'displayPhoneNumber',
        'id',
        'lastCheckedAt',
        'lastError',
        'lastWebhookAt',
        'metaAppId',
        'phoneNumberId',
        'status',
        'verifiedName',
        'wabaId',
      ].sort(),
    )
  })

  it('R10: la vista serializada no contiene los valores cifrados ni el resumen del verify token', () => {
    const json = JSON.stringify(toWhatsappConnectionView(record()))
    for (const prohibido of [ACCESS_TOKEN_ENC, APP_SECRET_ENC, VERIFY_TOKEN_HASH]) {
      expect(json).not.toContain(prohibido)
    }
    expect(json).not.toMatch(/Enc"|verifyToken|accessToken|appSecret|companyId/)
  })

  it('R10: un campo extra en la fila no aparece en la vista', () => {
    const conExtra = { ...record(), accessToken: 'en-claro', futuro: 'x' } as WhatsappConnectionRecord
    const view = toWhatsappConnectionView(conExtra)
    expect(view).not.toHaveProperty('accessToken')
    expect(view).not.toHaveProperty('futuro')
    expect(JSON.stringify(view)).not.toContain('en-claro')
  })

  it('R10: las fechas salen como ISO y los nulos se conservan', () => {
    const view = toWhatsappConnectionView(
      record({ lastWebhookAt: new Date('2026-10-09T11:00:00.000Z'), lastCheckedAt: null }),
    )
    expect(view.lastCheckedAt).toBeNull()
    expect(view.lastWebhookAt).toBe('2026-10-09T11:00:00.000Z')
    expect(view).toMatchObject({ id: record().id, status: 'PENDING', displayPhoneNumber: '+57 300 0000000' })
  })
})
