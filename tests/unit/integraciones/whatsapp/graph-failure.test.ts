import { describe, expect, it } from 'vitest'

import {
  GRAPH_UNREACHABLE_MESSAGE,
  HIDDEN_SECRET_MARK,
  META_MESSAGE_MAX_LENGTH,
  metaMessageOf,
} from '@/lib/modules/integraciones/domain/graph-failure'

const TOKEN = 'EAAG-token-secreto'
const SECRET = 'app-secret-123'

describe('metaMessageOf', () => {
  it('R20: sin texto de Graph devuelve «No se pudo contactar con Meta.»', () => {
    expect(GRAPH_UNREACHABLE_MESSAGE).toBe('No se pudo contactar con Meta.')
    expect(metaMessageOf({ kind: 'unreachable', message: null }, [TOKEN, SECRET])).toBe(
      GRAPH_UNREACHABLE_MESSAGE,
    )
    expect(metaMessageOf({ kind: 'rejected', message: null }, [TOKEN, SECRET])).toBe(
      GRAPH_UNREACHABLE_MESSAGE,
    )
    expect(metaMessageOf({ kind: 'rejected', message: '' }, [TOKEN, SECRET])).toBe(
      GRAPH_UNREACHABLE_MESSAGE,
    )
  })

  it('R20: con texto de Graph lo devuelve tal cual si no lleva secretos', () => {
    expect(metaMessageOf({ kind: 'rejected', message: 'Invalid OAuth access token' }, [TOKEN, SECRET])).toBe(
      'Invalid OAuth access token',
    )
  })

  it('R20: sustituye cada aparicion literal del Access Token y del App Secret', () => {
    const message = `bad ${TOKEN} and ${SECRET} again ${TOKEN}`
    const saneado = metaMessageOf({ kind: 'rejected', message }, [TOKEN, SECRET])
    expect(saneado).toBe(`bad ${HIDDEN_SECRET_MARK} and ${HIDDEN_SECRET_MARK} again ${HIDDEN_SECRET_MARK}`)
    expect(HIDDEN_SECRET_MARK).toBe('[oculto]')
  })

  it('R20: un secreto vacio no se sustituye (no intercala la marca entre cada caracter)', () => {
    expect(metaMessageOf({ kind: 'rejected', message: 'abc' }, ['', SECRET])).toBe('abc')
  })

  it('R20: recorta a 500 caracteres', () => {
    expect(META_MESSAGE_MAX_LENGTH).toBe(500)
    const saneado = metaMessageOf({ kind: 'rejected', message: 'x'.repeat(800) }, [TOKEN])
    expect(saneado).toHaveLength(500)
  })

  it('R20: un secreto que cruza el corte de 500 no queda a medias en el texto', () => {
    const message = `${'x'.repeat(495)}${TOKEN}${'y'.repeat(50)}`
    const saneado = metaMessageOf({ kind: 'rejected', message }, [TOKEN])
    expect(saneado).toHaveLength(500)
    expect(saneado).not.toContain(TOKEN.slice(0, 5))
    expect(saneado.startsWith('x'.repeat(495) + HIDDEN_SECRET_MARK.slice(0, 5))).toBe(true)
  })
})
