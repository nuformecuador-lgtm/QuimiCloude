import { describe, expect, it } from 'vitest'

import {
  DEMO_CREDENTIAL_ENV,
  DEMO_SEED_FORCE_ENV,
  DEMO_SEED_FORCE_FLAG,
  databaseHost,
  evaluateDemoSeedGuard,
  readDemoCredentials,
} from '../../../scripts/seed-demo/guard'

const LOCAL_URL = 'postgresql://postgres:x@localhost:5433/QuimiCloude?schema=public'
const REMOTE_URL = 'postgresql://postgres:x@db.abcdefgh.supabase.co:6543/postgres'

describe('seed de demo — guardas de entorno', () => {
  it('permite una base en localhost', () => {
    expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL } })).toEqual({ allowed: true, forced: false })
  })

  it('permite una base en 127.0.0.1', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' }
    expect(evaluateDemoSeedGuard({ argv: [], env })).toEqual({ allowed: true, forced: false })
  })

  it('rechaza VERCEL_ENV=production aunque la base sea local', () => {
    const verdict = evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL, VERCEL_ENV: 'production' } })
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) {
      expect(verdict.reason).toContain('VERCEL_ENV=production')
      expect(verdict.reason).toContain(DEMO_SEED_FORCE_FLAG)
    }
  })

  it('rechaza una DATABASE_URL que no apunta a una base local y nombra el host', () => {
    const verdict = evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: REMOTE_URL } })
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('db.abcdefgh.supabase.co')
  })

  it('no confunde un host que solo empieza por localhost con localhost', () => {
    const verdict = evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: 'postgresql://u:p@localhost.evil.test:5432/db' } })
    expect(verdict.allowed).toBe(false)
  })

  it('rechaza cuando falta DATABASE_URL o no es una url', () => {
    expect(evaluateDemoSeedGuard({ argv: [], env: {} }).allowed).toBe(false)
    expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: 'no es una url' } }).allowed).toBe(false)
  })

  it('la bandera --forzar permite una base remota y lo marca como forzado', () => {
    expect(evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env: { DATABASE_URL: REMOTE_URL } })).toEqual({
      allowed: true,
      forced: true,
    })
  })

  it('la variable SEED_DEMO_FORZAR=1 permite produccion y lo marca como forzado', () => {
    const env = { DATABASE_URL: LOCAL_URL, VERCEL_ENV: 'production', [DEMO_SEED_FORCE_ENV]: '1' }
    expect(evaluateDemoSeedGuard({ argv: [], env })).toEqual({ allowed: true, forced: true })
  })

  it('cualquier otro valor de SEED_DEMO_FORZAR no fuerza nada', () => {
    const env = { DATABASE_URL: REMOTE_URL, [DEMO_SEED_FORCE_ENV]: 'true' }
    expect(evaluateDemoSeedGuard({ argv: [], env }).allowed).toBe(false)
  })

  it('databaseHost devuelve el host en minusculas o null', () => {
    expect(databaseHost('postgresql://u:p@LocalHost:5432/db')).toBe('localhost')
    expect(databaseHost('::')).toBeNull()
  })
})

describe('seed de demo — contrasenas desde el entorno', () => {
  const completo = Object.fromEntries(Object.values(DEMO_CREDENTIAL_ENV).map((name) => [name, `valor-de-${name}`]))

  it('lee una contrasena por rol de demo', () => {
    const leidas = readDemoCredentials(completo)
    expect(leidas.operador).toBe(`valor-de-${DEMO_CREDENTIAL_ENV.operador}`)
    expect(leidas.empacador).toBe(`valor-de-${DEMO_CREDENTIAL_ENV.empacador}`)
    expect(leidas.acondicionamiento).toBe(`valor-de-${DEMO_CREDENTIAL_ENV.acondicionamiento}`)
  })

  it('sin alguna variable falla nombrandolas todas y sin valor por defecto', () => {
    const incompleto = { ...completo, [DEMO_CREDENTIAL_ENV.operador]: undefined, [DEMO_CREDENTIAL_ENV.empacador]: '   ' }
    expect(() => readDemoCredentials(incompleto)).toThrow(DEMO_CREDENTIAL_ENV.operador)
    expect(() => readDemoCredentials(incompleto)).toThrow(DEMO_CREDENTIAL_ENV.empacador)
  })

  it('el mensaje de error no incluye ningun valor de contrasena', () => {
    const incompleto = { ...completo, [DEMO_CREDENTIAL_ENV.acondicionamiento]: undefined }
    let message = ''
    try {
      readDemoCredentials(incompleto)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(DEMO_CREDENTIAL_ENV.acondicionamiento)
    expect(message).not.toContain('valor-de-')
  })
})
