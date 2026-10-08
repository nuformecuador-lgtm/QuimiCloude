// La guarda del build (`scripts/build.mjs`): las previews de Vercel comparten base con
// produccion, asi que `prisma migrate deploy` y el seed solo pueden correr en produccion o fuera
// de Vercel (local, CI). Se prueba la logica pura; el main no corre al importar.

import { describe, expect, it } from 'vitest'

import { pasosDelBuild } from '@/scripts/build.mjs'

const MIGRAR = 'prisma migrate deploy'
const GENERAR = 'prisma generate'
const SEMBRAR = 'tsx scripts/seed.ts'
const CONSTRUIR = 'next build'

describe('pasosDelBuild', () => {
  it('con VERCEL_ENV=production corre los cuatro pasos, migrate y seed incluidos', () => {
    const r = pasosDelBuild({ VERCEL_ENV: 'production' })
    expect(r.pasos).toEqual([MIGRAR, GENERAR, SEMBRAR, CONSTRUIR])
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBeNull()
  })

  it('con VERCEL_ENV=preview se salta migrate y seed, y sigue con generate y next build', () => {
    const r = pasosDelBuild({ VERCEL_ENV: 'preview' })
    expect(r.pasos).toEqual([GENERAR, CONSTRUIR])
    expect(r.pasos).not.toContain(MIGRAR)
    expect(r.pasos).not.toContain(SEMBRAR)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toContain('VERCEL_ENV=preview')
  })

  it('con VERCEL_ENV=development tambien se salta migrate y seed', () => {
    const r = pasosDelBuild({ VERCEL_ENV: 'development' })
    expect(r.pasos).toEqual([GENERAR, CONSTRUIR])
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toContain('VERCEL_ENV=development')
  })

  it('sin VERCEL_ENV (local, CI) el build es el de siempre: los cuatro pasos', () => {
    const r = pasosDelBuild({})
    expect(r.pasos).toEqual([MIGRAR, GENERAR, SEMBRAR, CONSTRUIR])
    expect(r.saltados).toEqual([])
  })

  it('migrate va antes que generate, el seed despues de generate, y next build al final', () => {
    const { pasos } = pasosDelBuild({ VERCEL_ENV: 'production' })
    expect(pasos.indexOf(MIGRAR)).toBeLessThan(pasos.indexOf(GENERAR))
    expect(pasos.indexOf(GENERAR)).toBeLessThan(pasos.indexOf(SEMBRAR))
    expect(pasos.at(-1)).toBe(CONSTRUIR)

    const preview = pasosDelBuild({ VERCEL_ENV: 'preview' }).pasos
    expect(preview.at(-1)).toBe(CONSTRUIR)
  })
})
