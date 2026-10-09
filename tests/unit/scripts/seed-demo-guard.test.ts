import { describe, expect, it } from 'vitest'

import {
  DEMO_CREDENTIAL_ENV,
  DEMO_SEED_FORCE_FLAG,
  databaseHost,
  evaluateDemoSeedGuard,
  readDemoCredentials,
} from '../../../scripts/seed-demo/guard'

const LOCAL_URL = 'postgresql://postgres:x@localhost:5433/QuimiCloude?schema=public'
const REMOTE_URL = 'postgresql://postgres:x@db.abcdefgh.supabase.co:6543/postgres'

const PREVIEW_REF = 'refinventadopreview'
const OTHER_REF = 'refinventadoproduccion'
const OTHER_PROJECT_URL = `postgresql://postgres.${OTHER_REF}:x@pooler.invalid:6543/postgres`

/** Un build de preview de Vercel contra la base de preview (identificador inventado). */
const PREVIEW_ENV: Record<string, string | undefined> = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  PREVIEW_SUPABASE_REF: PREVIEW_REF,
  DATABASE_URL: `postgresql://postgres.${PREVIEW_REF}:x@pooler.invalid:6543/postgres`,
  DIRECT_URL: `postgresql://postgres:x@db.${PREVIEW_REF}.supabase.invalid:5432/postgres`,
}

describe('seed de demo — guardas de entorno', () => {
  it('permite una base en localhost', () => {
    expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL } })).toEqual({ allowed: true, forced: false })
  })

  it('permite una base en 127.0.0.1', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' }
    expect(evaluateDemoSeedGuard({ argv: [], env })).toEqual({ allowed: true, forced: false })
  })

  it('rechaza VERCEL_ENV=production aunque la base sea local (R15)', () => {
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

  it('--forzar no anula VERCEL_ENV=production (R15)', () => {
    const env = { DATABASE_URL: REMOTE_URL, VERCEL_ENV: 'production' }
    const verdict = evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env })
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('VERCEL_ENV=production')
  })

  it('VERCEL_ENV=preview dentro de Vercel contra la base de preview: permitido sin --forzar, aunque la base sea remota y haya CI (R13)', () => {
    for (const CI of [undefined, 'true', '1']) {
      expect(evaluateDemoSeedGuard({ argv: [], env: { ...PREVIEW_ENV, CI } })).toEqual({ allowed: true, forced: false })
    }
    expect(evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env: PREVIEW_ENV })).toEqual({ allowed: true, forced: false })
  })

  it('VERCEL_ENV=preview sin VERCEL: negado, tambien con --forzar (R14)', () => {
    for (const VERCEL of [undefined, '', '  ']) {
      for (const argv of [[], [DEMO_SEED_FORCE_FLAG]]) {
        const verdict = evaluateDemoSeedGuard({ argv, env: { ...PREVIEW_ENV, VERCEL } })
        expect(verdict.allowed).toBe(false)
        if (!verdict.allowed) {
          expect(verdict.reason).toContain('VERCEL_ENV=preview')
          expect(verdict.reason).toContain(`${DEMO_SEED_FORCE_FLAG} no lo anula`)
        }
      }
    }
  })

  it('VERCEL_ENV=preview sin PREVIEW_SUPABASE_REF: negado nombrandola, tambien con --forzar (R14)', () => {
    for (const PREVIEW_SUPABASE_REF of [undefined, '']) {
      for (const argv of [[], [DEMO_SEED_FORCE_FLAG]]) {
        const verdict = evaluateDemoSeedGuard({ argv, env: { ...PREVIEW_ENV, PREVIEW_SUPABASE_REF } })
        expect(verdict.allowed).toBe(false)
        if (!verdict.allowed) {
          expect(verdict.reason).toContain('PREVIEW_SUPABASE_REF')
          expect(verdict.reason).toContain(`${DEMO_SEED_FORCE_FLAG} no lo anula`)
        }
      }
    }
  })

  it('VERCEL_ENV=preview con DATABASE_URL o DIRECT_URL de otro proyecto o local: negado nombrandola, tambien con --forzar (R14)', () => {
    for (const nombre of ['DATABASE_URL', 'DIRECT_URL'] as const) {
      for (const url of [OTHER_PROJECT_URL, LOCAL_URL]) {
        for (const argv of [[], [DEMO_SEED_FORCE_FLAG]]) {
          const verdict = evaluateDemoSeedGuard({ argv, env: { ...PREVIEW_ENV, [nombre]: url } })
          expect(verdict.allowed).toBe(false)
          if (!verdict.allowed) {
            expect(verdict.reason).toContain(nombre)
            expect(verdict.reason).not.toContain(OTHER_REF)
            expect(verdict.reason).not.toContain(PREVIEW_REF)
          }
        }
      }
    }
  })

  it('--forzar no anula un VERCEL_ENV arbitrario distinto de development (R15)', () => {
    const verdict = evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env: { DATABASE_URL: LOCAL_URL, VERCEL_ENV: 'staging' } })
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('VERCEL_ENV=staging')
  })

  it('VERCEL_ENV=production o arbitrario se niega aunque el entorno apunte a la base de preview, con o sin --forzar (R15)', () => {
    for (const VERCEL_ENV of ['production', 'staging']) {
      for (const argv of [[], [DEMO_SEED_FORCE_FLAG]]) {
        const verdict = evaluateDemoSeedGuard({ argv, env: { ...PREVIEW_ENV, VERCEL_ENV } })
        expect(verdict.allowed).toBe(false)
        if (!verdict.allowed) expect(verdict.reason).toContain(`VERCEL_ENV=${VERCEL_ENV}`)
      }
    }
  })

  it('VERCEL_ENV=development sigue la regla normal de base local y --forzar', () => {
    const VERCEL_ENV = 'development'
    expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL, VERCEL_ENV } })).toEqual({ allowed: true, forced: false })
    const remoto = evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: REMOTE_URL, VERCEL_ENV } })
    expect(remoto.allowed).toBe(false)
    if (!remoto.allowed) expect(remoto.reason).toContain('db.abcdefgh.supabase.co')
    expect(evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env: { DATABASE_URL: REMOTE_URL, VERCEL_ENV } })).toEqual({
      allowed: true,
      forced: true,
    })
  })

  it('VERCEL_ENV vacio cuenta como no definido', () => {
    expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL, VERCEL_ENV: '' } })).toEqual({ allowed: true, forced: false })
  })

  it('rechaza dentro de CI, con o sin --forzar y aunque la base sea local', () => {
    for (const argv of [[], [DEMO_SEED_FORCE_FLAG]]) {
      const verdict = evaluateDemoSeedGuard({ argv, env: { DATABASE_URL: LOCAL_URL, CI: 'true' } })
      expect(verdict.allowed).toBe(false)
      if (!verdict.allowed) expect(verdict.reason).toContain('CI')
    }
    expect(evaluateDemoSeedGuard({ argv: [DEMO_SEED_FORCE_FLAG], env: { DATABASE_URL: LOCAL_URL, CI: '1' } }).allowed).toBe(false)
  })

  it('CI vacia, 0 o false no cuenta como CI', () => {
    for (const CI of ['', '0', 'false']) {
      expect(evaluateDemoSeedGuard({ argv: [], env: { DATABASE_URL: LOCAL_URL, CI } }).allowed).toBe(true)
    }
  })

  it('una variable de entorno no fuerza nada: solo la bandera de linea de comandos', () => {
    const env = { DATABASE_URL: REMOTE_URL, SEED_DEMO_FORZAR: '1' }
    expect(evaluateDemoSeedGuard({ argv: [], env }).allowed).toBe(false)
  })

  it('toma como host efectivo el parametro ?host= y rechaza uno remoto', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db?host=remoto.invalid' }
    const verdict = evaluateDemoSeedGuard({ argv: [], env })
    expect(verdict.allowed).toBe(false)
    if (!verdict.allowed) expect(verdict.reason).toContain('remoto.invalid')
  })

  it('admite ?host=localhost', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db?host=localhost' }
    expect(evaluateDemoSeedGuard({ argv: [], env })).toEqual({ allowed: true, forced: false })
  })

  it('admite un socket Unix local en ?host=', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@localhost/db?host=/var/run/postgresql' }
    expect(evaluateDemoSeedGuard({ argv: [], env })).toEqual({ allowed: true, forced: false })
  })

  it('rechaza un parametro host repetido aunque uno sea local', () => {
    const env = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db?host=localhost&host=remoto.invalid' }
    expect(evaluateDemoSeedGuard({ argv: [], env }).allowed).toBe(false)
    const mixto = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db?host=localhost&HOST=remoto.invalid' }
    expect(evaluateDemoSeedGuard({ argv: [], env: mixto }).allowed).toBe(false)
  })

  it('rechaza un parametro host vacio', () => {
    for (const query of ['?host=', '?host=%20']) {
      const env = { DATABASE_URL: `postgresql://u:p@localhost:5433/db${query}` }
      expect(evaluateDemoSeedGuard({ argv: [], env }).allowed).toBe(false)
    }
  })

  it('databaseHost devuelve el host efectivo en minusculas o un error', () => {
    expect(databaseHost('postgresql://u:p@LocalHost:5432/db')).toEqual({ ok: true, host: 'localhost' })
    expect(databaseHost('postgresql://u:p@localhost:5432/db?host=Remoto.Invalid')).toEqual({ ok: true, host: 'remoto.invalid' })
    expect(databaseHost('::').ok).toBe(false)
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
