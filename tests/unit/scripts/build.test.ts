// La guarda del build (`scripts/build.mjs`): las previews de Vercel comparten base con
// produccion, asi que dentro de Vercel `prisma migrate deploy` y el seed solo corren con
// `VERCEL_ENV=production`; sin el dato se falla hacia el lado seguro (no se tocan). Fuera de
// Vercel (local, CI) corre todo. Se prueba la logica pura; el bloque de entrada directa no corre
// al importar. `ejecutarBuild` recibe el ejecutor inyectado: aqui nunca se lanza prisma de verdad.

import { describe, expect, it } from 'vitest'

import { ejecutarBuild, pasosDelBuild } from '@/scripts/build.mjs'

const MIGRAR = 'prisma migrate deploy'
const GENERAR = 'prisma generate'
const SEMBRAR = 'tsx scripts/seed.ts'
const CONSTRUIR = 'next build'

const TODO = [MIGRAR, GENERAR, SEMBRAR, CONSTRUIR]
const SIN_BASE = [GENERAR, CONSTRUIR]

describe('pasosDelBuild', () => {
  it('Vercel con VERCEL_ENV=production corre los cuatro pasos, migrate y seed incluidos', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'production' })
    expect(r.pasos).toEqual(TODO)
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBe('[build] Vercel production -> con migrate y seed')
  })

  it('Vercel con VERCEL_ENV=preview se salta migrate y seed, y sigue con generate y next build', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'preview' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.pasos).not.toContain(MIGRAR)
    expect(r.pasos).not.toContain(SEMBRAR)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe(
      '[build] Vercel preview -> sin migrate ni seed (comparte base con produccion)',
    )
  })

  it('Vercel con VERCEL_ENV=development tambien se salta migrate y seed', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'development' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe(
      '[build] Vercel development -> sin migrate ni seed (comparte base con produccion)',
    )
  })

  it('Vercel con VERCEL_ENV vacio falla hacia el lado seguro: sin migrate ni seed', () => {
    const r = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: '' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe('[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)')
  })

  it('Vercel sin VERCEL_ENV falla hacia el lado seguro: sin migrate ni seed', () => {
    const r = pasosDelBuild({ VERCEL: '1' })
    expect(r.pasos).toEqual(SIN_BASE)
    expect(r.saltados).toEqual([MIGRAR, SEMBRAR])
    expect(r.motivo).toBe('[build] Vercel sin VERCEL_ENV -> sin migrate ni seed (lado seguro)')
  })

  it('fuera de Vercel (local, CI) sin VERCEL_ENV el build es el de siempre: los cuatro pasos', () => {
    const r = pasosDelBuild({})
    expect(r.pasos).toEqual(TODO)
    expect(r.saltados).toEqual([])
    expect(r.motivo).toBe('[build] fuera de Vercel -> con migrate y seed')
  })

  it('fuera de Vercel corre todo aunque VERCEL_ENV diga preview', () => {
    const r = pasosDelBuild({ VERCEL_ENV: 'preview' })
    expect(r.pasos).toEqual(TODO)
    expect(r.motivo).toBe('[build] fuera de Vercel -> con migrate y seed')
  })

  it('migrate va antes que generate, el seed despues de generate, y next build al final', () => {
    const { pasos } = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'production' })
    expect(pasos.indexOf(MIGRAR)).toBeLessThan(pasos.indexOf(GENERAR))
    expect(pasos.indexOf(GENERAR)).toBeLessThan(pasos.indexOf(SEMBRAR))
    expect(pasos.at(-1)).toBe(CONSTRUIR)

    const preview = pasosDelBuild({ VERCEL: '1', VERCEL_ENV: 'preview' }).pasos
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
    ejecutarBuild({ VERCEL: '1', VERCEL_ENV: 'preview' }, ejecutar, salida)
    expect(log).toEqual([
      '[build] Vercel preview -> sin migrate ni seed (comparte base con produccion)',
      `[build] ${GENERAR}`,
      `[build] ${CONSTRUIR}`,
    ])
  })
})
