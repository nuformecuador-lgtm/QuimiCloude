// La puerta del proceso diario. `verifyCronSecret` es pura sobre `process.env.CRON_SECRET` y
// la cabecera que le pasan: se restaura la variable en cada test para no ensuciar el resto de
// la suite.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { verifyCronSecret } from '@/lib/modules/pedidos/adapters/driven/config/cron-secret-env'

const SECRETO = 'un-secreto-bastante-largo-para-el-cron'

describe('verifyCronSecret', () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    delete process.env.CRON_SECRET
  })

  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('R24 — sin CRON_SECRET configurado: misconfigured, sin importar la cabecera', () => {
    expect(verifyCronSecret(`Bearer ${SECRETO}`)).toBe('misconfigured')
    expect(verifyCronSecret(null)).toBe('misconfigured')
  })

  it('R24 — CRON_SECRET vacio cuenta como no configurado: misconfigured', () => {
    process.env.CRON_SECRET = ''
    expect(verifyCronSecret(`Bearer ${SECRETO}`)).toBe('misconfigured')
  })

  it('R24 — configurado y sin cabecera: unauthorized', () => {
    process.env.CRON_SECRET = SECRETO
    expect(verifyCronSecret(null)).toBe('unauthorized')
  })

  it('R24 — configurado y cabecera sin el prefijo `Bearer `: unauthorized', () => {
    process.env.CRON_SECRET = SECRETO
    expect(verifyCronSecret(SECRETO)).toBe('unauthorized')
  })

  it('R24 — configurado y secreto incorrecto: unauthorized', () => {
    process.env.CRON_SECRET = SECRETO
    expect(verifyCronSecret('Bearer otro-secreto')).toBe('unauthorized')
  })

  it('un secreto incorrecto de OTRA longitud tambien es unauthorized, sin lanzar', () => {
    process.env.CRON_SECRET = SECRETO
    expect(verifyCronSecret('Bearer corto')).toBe('unauthorized')
  })

  it('R24 — configurado y secreto correcto: ok', () => {
    process.env.CRON_SECRET = SECRETO
    expect(verifyCronSecret(`Bearer ${SECRETO}`)).toBe('ok')
  })
})
