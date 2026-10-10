// La guarda del build (`scripts/build.mjs`): dentro de Vercel `prisma migrate deploy` y el seed
// solo corren con `VERCEL_ENV=production` y con `VERCEL_ENV=preview` (este ademas con el seed de
// demostracion, y solo si el scope Preview pasa la comprobacion previa); sin el dato se falla hacia
// el lado seguro (no se tocan). Fuera de Vercel (local, CI) corre todo. Se prueba la logica pura;
// el bloque de entrada directa no corre al importar. `ejecutarBuild` recibe el ejecutor inyectado:
// aqui nunca se lanza prisma de verdad. Los identificadores de proyecto y secretos son inventados.

import { describe, expect, it } from 'vitest'

import { ejecutarBuild, pasosDelBuild } from '@/scripts/build.mjs'

const MIGRAR = 'prisma migrate deploy'
const GENERAR = 'prisma generate'
const SEMBRAR = 'tsx scripts/seed.ts'
const SEMBRAR_DEMO = 'tsx scripts/seed-demo.ts'
const CONSTRUIR = 'next build'

const TODO = [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR]
const TODO_Y_DEMO = [MIGRAR, GENERAR, SEMBRAR, SEMBRAR_DEMO, CONSTRUIR]
const SIN_BASE = [GENERAR, CONSTRUIR]

const MOTIVO_PREVIEW = '[build] Vercel preview -> con migrate, seed y seed de demostracion (base de preview)'
const MOTIVO_PREVIEW_INCOMPLETA = '[build] Vercel preview -> configuracion de preview incompleta'

const REF = 'refinventadopreviewx'
const OTRO_REF = 'refinventadoprodxxxx'
const SECRETO = 'secreto-inventado'

/** Un scope Preview de Vercel que pasa la comprobacion previa. */
function previewCorrecta(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    PREVIEW_SUPABASE_REF: REF,
    DATABASE_URL: `postgresql://postgres.${REF}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres`,
    DIRECT_URL: `postgresql://postgres:clave-inventada@db.${REF}.supabase.co:5432/postgres`,
    SUPABASE_STORAGE_URL: `https://${REF}.supabase.co`,
    MAIL_TRANSPORT: 'desactivado',
  }
  env['DOCUMENTS_E2E_DOUBLES'] = 'si'
  return env
}

describe('pasosDelBuild', () => {
  it('Vercel con VERCEL_ENV=production corre los cuatro pasos, migrate y seed incluidos, sin seed de demo (R8)', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'production' })
    expect(r.pasos).toEqual(TODO)
    expect(r.pasos).not.toContain(SEMBRAR_DEMO)
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBe('[build] Vercel production -> con migrate y seed')
  })

  it('Vercel con VERCEL_ENV=preview y configuracion correcta corre migrate, generate, seed, seed de demo y next build (R7)', () => {
    const r = pasosDelBuild(previewCorrecta())
    expect(r.pasos).toEqual(TODO_Y_DEMO)
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBe(MOTIVO_PREVIEW)
    expect(r.problemas).toBeUndefined()
  })

  it('Vercel con VERCEL_ENV=preview sin la configuracion de preview no programa ningun paso (R9, R10)', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'preview' })
    expect(r.pasos).toEqual([])
    expect(r.saltados).toEqual(TODO_Y_DEMO)
    expect(r.motivo).toBe(MOTIVO_PREVIEW_INCOMPLETA)
    expect(r.problemas?.length).toBeGreaterThan(0)
  })

  it('Vercel con VERCEL_ENV=development se salta migrate y seed (R8)', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'development' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe(
      '[build] Vercel development -> sin migrate ni seed (solo production y preview tocan la base)',
    )
  })

  it('Vercel con otro VERCEL_ENV cualquiera tampoco toca la base (R8)', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'staging' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
  })

  it('Vercel con VERCEL_ENV vacio falla hacia el lado seguro: sin migrate ni seed (R8)', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: '' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe('[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)')
  })

  it('Vercel sin VERCEL_ENV falla hacia el lado seguro: sin migrate ni seed (R8)', () => {
    const r = pasosDelBuild({ VERCEL: '1' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe('[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)')
  })

  it('fuera de Vercel (local, CI) sin VERCEL_ENV el build es el de siempre: los cuatro pasos (R8)', () => {
    const r = pasosDelBuild({})
    expect(r.pasos).toEqual(TODO)
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBe('[build] fuera de Vercel -> con migrate y seed')
  })

  it('fuera de Vercel corre los cuatro pasos, sin seed de demo, aunque VERCEL_ENV diga preview (R8)', () => {
    const r = pasosDelBuild({ VERCEL_ENV: 'preview' })
    expect(r.pasos).toEqual(TODO)
    expect(r.pasos).not.toContain(SEMBRAR_DEMO)
    expect(r.motivo).toBe('[build] fuera de Vercel -> con migrate y seed')
  })

  it('m1: PREVIEW_SUPABASE_REF "supabase", "postgres" o truncado con las URL de produccion no programa ningun paso (R9)', () => {
    const deProduccion = {
      DATABASE_URL: `postgresql://postgres.${OTRO_REF}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres`,
      DIRECT_URL: `postgresql://postgres:clave-inventada@db.${OTRO_REF}.supabase.co:5432/postgres`,
      SUPABASE_STORAGE_URL: `https://${OTRO_REF}.supabase.co`,
    }
    for (const ref of ['supabase', 'postgres', OTRO_REF.slice(0, 19)]) {
      const r = pasosDelBuild({ ...previewCorrecta(), ...deProduccion, PREVIEW_SUPABASE_REF: ref })
      expect(r.pasos, `ref=${ref}`).toEqual([])
      expect(r.motivo).toBe(MOTIVO_PREVIEW_INCOMPLETA)
      expect(r.problemas).toHaveLength(1)
      expect(r.problemas?.[0]).toContain('PREVIEW_SUPABASE_REF')
    }
  })

  it('m5: VERCEL_ENV se compara recortado, como en la guarda del seed de demostracion (R7, R8)', () => {
    expect(pasosDelBuild({ ...previewCorrecta(), VERCEL_ENV: ' preview ' }).pasos).toEqual(TODO_Y_DEMO)
    expect(pasosDelBuild({ ...previewCorrecta(), VERCEL_ENV: '\tpreview', PREVIEW_SUPABASE_REF: undefined }).pasos).toEqual([])
    expect(pasosDelBuild({ VERCEL: '1', VERCEL_ENV: ' production ' }).pasos).toEqual(TODO)
    const blanco = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: '   ' })
    expect(blanco.pasos).toEqual(SIN_BASE)
    expect(blanco.motivo).toBe('[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)')
    expect(pasosDelBuild({ VERCEL: '1', VERCEL_ENV: ' development ' }).motivo).toBe(
      '[build] Vercel development -> sin migrate ni seed (solo production y preview tocan la base)',
    )
  })

  it('migrate va antes que generate, el seed despues de generate, la demo despues del seed y next build al final (R7)', () => {
    const { pasos } = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'production' })
    expect(pasos.indexOf(MIGRAR)).toBeLessThan(pasos.indexOf(GENERAR))
    expect(pasos.indexOf(GENERAR)).toBeLessThan(pasos.indexOf(SEMBRAR))
    expect(pasos.at(-1)).toBe(CONSTRUIR)

    const preview = pasosDelBuild(previewCorrecta()).pasos
    expect(preview.indexOf(SEMBRAR)).toBeLessThan(preview.indexOf(SEMBRAR_DEMO))
    expect(preview.indexOf(SEMBRAR_DEMO)).toBeLessThan(preview.indexOf(CONSTRUIR))
    expect(preview.at(-1)).toBe(CONSTRUIR)
  })
})

type Resultado = { status: number | null; error?: Error }

/** Ejecutor falso: devuelve el resultado fijado para un comando (0 por defecto) y anota las llamadas. */
function ejecutorFalso(resultados: Record<string, Resultado> = {}) {
  const llamados: string[] = []
  const ejecutar = (comando: string): Resultado => {
    llamados.push(comando)
    return resultados[comando] ?? { status: 0 }
  }
  return { ejecutar, llamados }
}

function salidaFalsa() {
  const log: string[] = []
  const error: string[] = []
  return { salida: { log: (l: string) => log.push(l), error: (l: string) => error.push(l) }, log, error }
}

const PRODUCCION = { VERCEL: '1', VERCEL_ENV: 'production' }

describe('ejecutarBuild: corre los pasos en orden y para en el primero que falla', () => {
  it('todos ok: devuelve 0 y llama a los cuatro pasos en orden', () => {
    const { ejecutar, llamados } = ejecutorFalso()
    const { salida } = salidaFalsa()
    expect(ejecutarBuild(PRODUCCION, ejecutar, salida)).toBe(0)
    expect(llamados).toEqual(TODO)
  })

  it('falla el seed: devuelve el codigo del paso y `next build` no se llama', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [SEMBRAR]: { status: 3 } })
    const { salida } = salidaFalsa()
    expect(ejecutarBuild(PRODUCCION, ejecutar, salida)).toBe(3)
    expect(llamados).toEqual([MIGRAR, GENERAR, SEMBRAR])
    expect(llamados).not.toContain(CONSTRUIR)
  })

  it('falla el primer paso: no se llama a ninguno mas', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [MIGRAR]: { status: 1 } })
    const { salida } = salidaFalsa()
    expect(ejecutarBuild({}, ejecutar, salida)).toBe(1)
    expect(llamados).toEqual([MIGRAR])
  })

  it('un paso que sale sin codigo (status null, p. ej. por senal) cuenta como fallo: 1', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [GENERAR]: { status: null } })
    const { salida } = salidaFalsa()
    expect(ejecutarBuild(PRODUCCION, ejecutar, salida)).toBe(1)
    expect(llamados).toEqual([MIGRAR, GENERAR])
  })

  it('error de lanzamiento: devuelve 1, lo dice por stderr y no sigue', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [MIGRAR]: { status: null, error: new Error('ENOENT') } })
    const { salida, error } = salidaFalsa()
    expect(ejecutarBuild(PRODUCCION, ejecutar, salida)).toBe(1)
    expect(llamados).toEqual([MIGRAR])
    expect(error).toEqual([`[build] no se pudo lanzar \`${MIGRAR}\`: ENOENT`])
  })

  it('loguea primero la linea de decision y luego cada paso', () => {
    const { ejecutar } = ejecutorFalso()
    const { salida, log } = salidaFalsa()
    ejecutarBuild({ VERCEL: '1', VERCEL_ENV: 'development' }, ejecutar, salida)
    expect(log).toEqual([
      '[build] Vercel development -> sin migrate ni seed (solo production y preview tocan la base)',
      `[build] ${GENERAR}`,
      `[build] ${CONSTRUIR}`,
    ])
  })
})

describe('ejecutarBuild en una preview de Vercel', () => {
  it('configuracion correcta: corre los cinco pasos en orden, la demo sin --forzar, y devuelve 0 (R7)', () => {
    const { ejecutar, llamados } = ejecutorFalso()
    const { salida, log, error } = salidaFalsa()
    expect(ejecutarBuild(previewCorrecta(), ejecutar, salida)).toBe(0)
    expect(llamados).toEqual(TODO_Y_DEMO)
    expect(llamados.join(' ')).not.toContain('--forzar')
    expect(log).toEqual([MOTIVO_PREVIEW, ...TODO_Y_DEMO.map((paso) => `[build] ${paso}`)])
    expect(error).toEqual([])
  })

  it('falla el seed de demo: devuelve su codigo y `next build` no se llama (R7)', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [SEMBRAR_DEMO]: { status: 4 } })
    const { salida } = salidaFalsa()
    expect(ejecutarBuild(previewCorrecta(), ejecutar, salida)).toBe(4)
    expect(llamados).toEqual([MIGRAR, GENERAR, SEMBRAR, SEMBRAR_DEMO])
  })

  it('falla migrate: para ahi con su codigo (R7)', () => {
    const { ejecutar, llamados } = ejecutorFalso({ [MIGRAR]: { status: 2 } })
    const { salida } = salidaFalsa()
    expect(ejecutarBuild(previewCorrecta(), ejecutar, salida)).toBe(2)
    expect(llamados).toEqual([MIGRAR])
  })

  it('una URL de otro proyecto: devuelve 1, no ejecuta ningun paso y nombra la variable (R9)', () => {
    for (const nombre of ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_STORAGE_URL']) {
      const env = { ...previewCorrecta(), [nombre]: `https://${OTRO_REF}.supabase.co` }
      const { ejecutar, llamados } = ejecutorFalso()
      const { salida, log, error } = salidaFalsa()
      expect(ejecutarBuild(env, ejecutar, salida)).toBe(1)
      expect(llamados).toEqual([])
      expect(log).toEqual([MOTIVO_PREVIEW_INCOMPLETA])
      expect(error).toHaveLength(1)
      expect(error[0]).toContain(nombre)
      expect(error[0]).not.toContain(OTRO_REF)
    }
  })

  it('sin PREVIEW_SUPABASE_REF: devuelve 1 sin ejecutar ningun paso y la nombra (R9)', () => {
    const { ejecutar, llamados } = ejecutorFalso()
    const { salida, error } = salidaFalsa()
    expect(ejecutarBuild({ ...previewCorrecta(), PREVIEW_SUPABASE_REF: undefined }, ejecutar, salida)).toBe(1)
    expect(llamados).toEqual([])
    expect(error).toHaveLength(1)
    expect(error[0]).toContain('PREVIEW_SUPABASE_REF')
  })

  it('efectos fuera de la app: escribe un problema por variable, devuelve 1 y no ejecuta nada (R10)', () => {
    const env: Record<string, string | undefined> = {
      ...previewCorrecta(),
      MAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: SECRETO,
      SMTP_PASS: SECRETO,
      ANTHROPIC_API_KEY: SECRETO,
      GEMINI_API_KEY: SECRETO,
      QSTASH_TOKEN: SECRETO,
    }
    env['DOCUMENTS_E2E_DOUBLES'] = ''
    const { ejecutar, llamados } = ejecutorFalso()
    const { salida, log, error } = salidaFalsa()
    expect(ejecutarBuild(env, ejecutar, salida)).toBe(1)
    expect(llamados).toEqual([])
    const nombrados = [
      'MAIL_TRANSPORT',
      'DOCUMENTS_E2E_DOUBLES',
      'RESEND_API_KEY',
      'SMTP_PASS',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'QSTASH_TOKEN',
    ]
    expect(error).toHaveLength(nombrados.length)
    nombrados.forEach((nombre, i) => expect(error[i]).toContain(nombre))
    for (const linea of [...log, ...error]) {
      expect(linea).not.toContain(SECRETO)
      expect(linea).not.toContain(REF)
    }
  })
})
