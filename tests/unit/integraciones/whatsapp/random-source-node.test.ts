// Fuente de aleatoriedad real: ids de conexion y verify tokens.

import { describe, expect, it } from 'vitest'

import { randomSourceNode } from '@/lib/modules/integraciones/adapters/driven/security/random-source-node'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomSourceNode', () => {
  it('R14: newId da un UUID v4, distinto en cada llamada', () => {
    const a = randomSourceNode.newId()
    const b = randomSourceNode.newId()
    expect(a).toMatch(UUID_V4)
    expect(b).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })

  it('R14: newVerifyToken da 43 caracteres base64url (256 bits), sin `+`, `/` ni `=`', () => {
    const token = randomSourceNode.newVerifyToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('R14: dos verify tokens seguidos son distintos', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomSourceNode.newVerifyToken()))
    expect(tokens.size).toBe(50)
  })
})
