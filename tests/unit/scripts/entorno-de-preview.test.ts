// Comprobacion previa del scope Preview (`scripts/entorno-de-preview.mjs`): logica pura sobre un
// entorno inventado. Los identificadores de proyecto y los secretos son de mentira; el repo es
// publico.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  VARIABLE_REF_DE_PREVIEW,
  apuntanAPreview,
  comprobarEntornoDePreview,
} from '@/scripts/entorno-de-preview.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const LECTOR_DE_DOBLES = 'lib/modules/documentos/adapters/driven/config/e2e-doubles-env.ts'

/** El literal de la variable de dobles tal como lo lee la app: se saca del fuente, no se copia. */
function variableDeDobles(): string {
  const fuente = readFileSync(join(RAIZ, LECTOR_DE_DOBLES), 'utf8')
  const encontrada = /E2E_DOUBLES_ENV_VAR_NAME\s*=\s*'([A-Z0-9_]+)'/.exec(fuente)
  if (encontrada === null) throw new Error(`no se encontro el nombre de la variable en ${LECTOR_DE_DOBLES}`)
  return encontrada[1]
}

const DOBLES = variableDeDobles()

const REF = 'refinventadopreviewx'
const OTRO_REF = 'refinventadoprodxxxx'
const URLS = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_STORAGE_URL'] as const
const CREDENCIALES = ['RESEND_API_KEY', 'SMTP_PASS', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'QSTASH_TOKEN'] as const

/** Valores que nunca pueden aparecer en un mensaje. */
const SECRETO = 'secreto-inventado-no-debe-salir'

function urlsDe(ref: string): Record<(typeof URLS)[number], string> {
  return {
    DATABASE_URL: `postgresql://postgres.${ref}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres`,
    DIRECT_URL: `postgresql://postgres:clave-inventada@db.${ref}.supabase.co:5432/postgres`,
    SUPABASE_STORAGE_URL: `https://${ref}.supabase.co`,
  }
}

/** Un scope Preview que cumple todo. */
function previewCorrecta(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    [VARIABLE_REF_DE_PREVIEW]: REF,
    ...urlsDe(REF),
    MAIL_TRANSPORT: 'desactivado',
  }
  env[DOBLES] = 'si'
  return env
}

function problemasDe(env: Record<string, string | undefined>): string[] {
  const r = comprobarEntornoDePreview(env)
  return r.ok ? [] : r.problemas
}

describe('VARIABLE_REF_DE_PREVIEW', () => {
  it('se llama PREVIEW_SUPABASE_REF (R9)', () => {
    expect(VARIABLE_REF_DE_PREVIEW).toBe('PREVIEW_SUPABASE_REF')
  })
})

describe('apuntanAPreview', () => {
  it('las tres URL con el ref de preview cumplen (R9)', () => {
    expect(apuntanAPreview({ ...urlsDe(REF), [VARIABLE_REF_DE_PREVIEW]: REF }, [...URLS])).toEqual({ ok: true })
  })

  it('sin ref, o con ref vacio o de solo espacios, no cumple y nombra la variable del ref (R9)', () => {
    for (const ref of [undefined, '', '   ']) {
      expect(apuntanAPreview({ ...urlsDe(REF), [VARIABLE_REF_DE_PREVIEW]: ref }, [...URLS])).toEqual({
        ok: false,
        variables: [VARIABLE_REF_DE_PREVIEW],
      })
    }
  })

  it('cada URL de otro proyecto o ausente se nombra por separado (R9)', () => {
    for (const url of URLS) {
      const deOtro = { ...urlsDe(REF), [url]: urlsDe(OTRO_REF)[url], [VARIABLE_REF_DE_PREVIEW]: REF }
      expect(apuntanAPreview(deOtro, [...URLS])).toEqual({ ok: false, variables: [url] })

      const ausente: Record<string, string | undefined> = { ...urlsDe(REF), [VARIABLE_REF_DE_PREVIEW]: REF }
      delete ausente[url]
      expect(apuntanAPreview(ausente, [...URLS])).toEqual({ ok: false, variables: [url] })
    }
  })

  it('solo mira las variables que se le piden', () => {
    const env = { ...urlsDe(REF), SUPABASE_STORAGE_URL: urlsDe(OTRO_REF).SUPABASE_STORAGE_URL, [VARIABLE_REF_DE_PREVIEW]: REF }
    expect(apuntanAPreview(env, ['DATABASE_URL', 'DIRECT_URL'])).toEqual({ ok: true })
  })
})

// Enmienda de R9 (2026-10-09, m1 del review, aprobada por el humano): el ref tiene la forma de un
// Reference ID y va en una posicion reconocida de cada URL, no como subcadena suelta.
describe('apuntanAPreview: forma del ref y posicion en cada URL (enmienda R9, m1)', () => {
  const POOLER_TRANSACCION = (ref: string) => `postgresql://postgres.${ref}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres`
  const POOLER_SESION = (ref: string) => `postgresql://postgres.${ref}:clave-inventada@aws-0-xx.pooler.supabase.com:5432/postgres`
  const DIRECTA = (ref: string) => `postgresql://postgres:clave-inventada@db.${ref}.supabase.co:5432/postgres`
  const STORAGE = (ref: string) => `https://${ref}.supabase.co`

  /** Las tres URL de produccion (otro ref de 20 letras). */
  const DE_PRODUCCION = urlsDe(OTRO_REF)

  it('los refs inventados de estos tests tienen la forma de un Reference ID', () => {
    for (const ref of [REF, OTRO_REF]) expect(ref).toMatch(/^[a-z]{20}$/)
  })

  it('un ref sin la forma de Reference ID no cumple y nombra solo PREVIEW_SUPABASE_REF (R9)', () => {
    const malos = ['supabase', 'postgres', 'pooler', REF.slice(0, 19), `${REF}a`, REF.toUpperCase(), `${REF.slice(0, 19)}1`, `${REF.slice(0, 10)}-${REF.slice(10, 19)}`]
    for (const ref of malos) {
      const env = { ...urlsDe(ref), [VARIABLE_REF_DE_PREVIEW]: ref }
      expect(apuntanAPreview(env, [...URLS]), `ref=${ref}`).toEqual({ ok: false, variables: [VARIABLE_REF_DE_PREVIEW] })
    }
  })

  it('ref "supabase" o "postgres" con las URL de produccion: no pasa y el mensaje no lleva el valor (R9, m1)', () => {
    for (const ref of ['supabase', 'postgres']) {
      const problemas = problemasDe({ ...previewCorrecta(), ...DE_PRODUCCION, [VARIABLE_REF_DE_PREVIEW]: ref })
      expect(problemas, `ref=${ref}`).toEqual([
        `${VARIABLE_REF_DE_PREVIEW} debe tener el Reference ID del proyecto de Supabase de preview (20 letras minusculas)`,
      ])
    }
  })

  it('ref truncado (19 letras) del de produccion con las URL de produccion: no pasa (R9, m1)', () => {
    const truncado = OTRO_REF.slice(0, 19)
    expect(truncado).toHaveLength(19)
    expect(apuntanAPreview({ ...DE_PRODUCCION, [VARIABLE_REF_DE_PREVIEW]: truncado }, [...URLS])).toEqual({
      ok: false,
      variables: [VARIABLE_REF_DE_PREVIEW],
    })
  })

  it('URL de produccion (otro ref de 20 letras) con el ref de preview: nombra cada una, sin valores (R9, m1)', () => {
    const formatos = [POOLER_TRANSACCION, POOLER_SESION, DIRECTA]
    for (const formato of formatos) {
      const env = { ...previewCorrecta(), DATABASE_URL: formato(OTRO_REF), DIRECT_URL: formato(OTRO_REF), SUPABASE_STORAGE_URL: STORAGE(OTRO_REF) }
      const problemas = problemasDe(env)
      expect(problemas.map((p) => p.split(' ')[0])).toEqual([...URLS])
      for (const problema of problemas) {
        for (const valor of [REF, OTRO_REF, 'clave-inventada', 'supabase.co', 'supabase.com']) expect(problema).not.toContain(valor)
      }
    }
  })

  it('el ref valido solo como subcadena fuera de su posicion no cuenta (R9, m1)', () => {
    const base = DIRECTA(OTRO_REF)
    const fueraDePosicionEnBase = [
      `postgresql://postgres.${OTRO_REF}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/${REF}`,
      `postgresql://postgres.${OTRO_REF}:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres?application_name=postgres.${REF}:`,
      `${base}?options=db.${REF}.supabase.co`,
      `postgresql://postgres:postgres.${REF}@db.${OTRO_REF}.supabase.co:5432/postgres`,
      `postgresql://postgres:clave-inventada@db.${REF}.supabase.co.otro.invalid:5432/postgres`,
      `postgresql://postgres.${REF}x:clave-inventada@aws-0-xx.pooler.supabase.com:6543/postgres`,
      `postgres.${REF}:@db.${REF}.supabase.co`,
    ]
    for (const nombre of ['DATABASE_URL', 'DIRECT_URL'] as const) {
      for (const url of fueraDePosicionEnBase) {
        const env = { ...urlsDe(REF), [nombre]: url, [VARIABLE_REF_DE_PREVIEW]: REF }
        expect(apuntanAPreview(env, [...URLS]), `${nombre}=${url}`).toEqual({ ok: false, variables: [nombre] })
      }
    }
    const fueraDePosicionEnStorage = [
      `https://${OTRO_REF}.supabase.co/${REF}`,
      `https://${OTRO_REF}.supabase.co/storage/v1/s3?x=//${REF}.supabase.co`,
      `https://${REF}.supabase.co.otro.invalid`,
      `https://otro${REF}.supabase.co`,
      `https://${REF}:clave-inventada@${OTRO_REF}.supabase.co`,
    ]
    for (const url of fueraDePosicionEnStorage) {
      const env = { ...urlsDe(REF), SUPABASE_STORAGE_URL: url, [VARIABLE_REF_DE_PREVIEW]: REF }
      expect(apuntanAPreview(env, [...URLS]), url).toEqual({ ok: false, variables: ['SUPABASE_STORAGE_URL'] })
    }
  })

  it('validas: pooler transaction 6543, pooler session 5432 y conexion directa, en DATABASE_URL y DIRECT_URL (R9)', () => {
    for (const formato of [POOLER_TRANSACCION, POOLER_SESION, DIRECTA]) {
      for (const otroFormato of [POOLER_TRANSACCION, POOLER_SESION, DIRECTA]) {
        const env = { DATABASE_URL: formato(REF), DIRECT_URL: otroFormato(REF), SUPABASE_STORAGE_URL: STORAGE(REF), [VARIABLE_REF_DE_PREVIEW]: REF }
        expect(apuntanAPreview(env, [...URLS])).toEqual({ ok: true })
      }
    }
  })

  it('valida: storage con ruta y el host en mayusculas; el ref del entorno con espacios a los lados (R9)', () => {
    const env = {
      ...urlsDe(REF),
      SUPABASE_STORAGE_URL: `https://${REF.toUpperCase()}.SUPABASE.CO/storage/v1/s3`,
      [VARIABLE_REF_DE_PREVIEW]: `  ${REF} `,
    }
    expect(apuntanAPreview(env, [...URLS])).toEqual({ ok: true })
  })

  it('la posicion depende de la variable: la URL de storage no vale como base ni la de base como storage (R9)', () => {
    expect(apuntanAPreview({ ...urlsDe(REF), DATABASE_URL: STORAGE(REF), [VARIABLE_REF_DE_PREVIEW]: REF }, [...URLS])).toEqual({
      ok: false,
      variables: ['DATABASE_URL'],
    })
    expect(apuntanAPreview({ ...urlsDe(REF), SUPABASE_STORAGE_URL: DIRECTA(REF), [VARIABLE_REF_DE_PREVIEW]: REF }, [...URLS])).toEqual({
      ok: false,
      variables: ['SUPABASE_STORAGE_URL'],
    })
  })

  it('una variable sin regla de posicion no cumple nunca: lado seguro (R9)', () => {
    const env = { ...urlsDe(REF), OTRA_URL: DIRECTA(REF), toString: DIRECTA(REF), [VARIABLE_REF_DE_PREVIEW]: REF }
    expect(apuntanAPreview(env, ['OTRA_URL', 'toString'])).toEqual({ ok: false, variables: ['OTRA_URL', 'toString'] })
  })

  it('una URL ilegible no cumple (R9)', () => {
    const env = { ...urlsDe(REF), DIRECT_URL: `no es una url ${REF}`, [VARIABLE_REF_DE_PREVIEW]: REF }
    expect(apuntanAPreview(env, [...URLS])).toEqual({ ok: false, variables: ['DIRECT_URL'] })
  })
})

describe('comprobarEntornoDePreview', () => {
  it('un scope Preview que cumple todo pasa (R9, R10)', () => {
    expect(comprobarEntornoDePreview(previewCorrecta())).toEqual({ ok: true })
  })

  it('sin PREVIEW_SUPABASE_REF falla nombrandola (R9)', () => {
    for (const ref of [undefined, '']) {
      const problemas = problemasDe({ ...previewCorrecta(), [VARIABLE_REF_DE_PREVIEW]: ref })
      expect(problemas).toHaveLength(1)
      expect(problemas[0]).toContain(VARIABLE_REF_DE_PREVIEW)
    }
  })

  it('cada URL sin el ref de preview es un problema que la nombra (R9)', () => {
    for (const url of URLS) {
      const problemas = problemasDe({ ...previewCorrecta(), [url]: urlsDe(OTRO_REF)[url] })
      expect(problemas).toHaveLength(1)
      expect(problemas[0].startsWith(`${url} `)).toBe(true)
    }
  })

  it('las tres URL de otro proyecto dan tres problemas (R9)', () => {
    const problemas = problemasDe({ ...previewCorrecta(), ...urlsDe(OTRO_REF) })
    expect(problemas.map((p) => p.split(' ')[0])).toEqual([...URLS])
  })

  it('MAIL_TRANSPORT distinta de desactivado, ausente o vacia es un problema (R10)', () => {
    for (const transporte of [undefined, '', 'resend', 'smtp', 'outbox', 'Desactivado']) {
      const problemas = problemasDe({ ...previewCorrecta(), MAIL_TRANSPORT: transporte })
      expect(problemas, `MAIL_TRANSPORT=${String(transporte)}`).toEqual(['MAIL_TRANSPORT debe ser "desactivado" en preview'])
    }
  })

  it(`${DOBLES} vacia o ausente es un problema (R10)`, () => {
    for (const valor of [undefined, '', '  ']) {
      const env = previewCorrecta()
      env[DOBLES] = valor
      expect(problemasDe(env)).toEqual([`${DOBLES} debe tener valor en preview`])
    }
  })

  it('cada credencial con valor es un problema que la nombra (R10)', () => {
    for (const credencial of CREDENCIALES) {
      expect(problemasDe({ ...previewCorrecta(), [credencial]: SECRETO })).toEqual([
        `${credencial} debe estar vacia en preview`,
      ])
    }
  })

  it('una credencial vacia o de solo espacios cuenta como ausente (R10)', () => {
    const env = previewCorrecta()
    for (const credencial of CREDENCIALES) env[credencial] = ' '
    expect(comprobarEntornoDePreview(env)).toEqual({ ok: true })
  })

  it('todas las condiciones juntas dan un problema por variable (R9, R10)', () => {
    const env: Record<string, string | undefined> = {
      [VARIABLE_REF_DE_PREVIEW]: REF,
      ...urlsDe(OTRO_REF),
      MAIL_TRANSPORT: 'resend',
    }
    for (const credencial of CREDENCIALES) env[credencial] = SECRETO
    expect(problemasDe(env).map((p) => p.split(' ')[0])).toEqual([...URLS, 'MAIL_TRANSPORT', DOBLES, ...CREDENCIALES])
  })

  it('ningun mensaje contiene un valor del entorno (R9, R10)', () => {
    const env: Record<string, string | undefined> = {
      [VARIABLE_REF_DE_PREVIEW]: REF,
      ...urlsDe(OTRO_REF),
      MAIL_TRANSPORT: 'transporte-inventado',
    }
    for (const credencial of CREDENCIALES) env[credencial] = SECRETO
    const problemas = problemasDe(env)
    expect(problemas.length).toBeGreaterThan(0)
    for (const problema of problemas) {
      for (const valor of [REF, OTRO_REF, SECRETO, 'transporte-inventado', 'clave-inventada', 'supabase.co']) {
        expect(problema).not.toContain(valor)
      }
    }
  })
})

describe(`el nombre de ${DOBLES} coincide con el que lee la app`, () => {
  it(`scripts/entorno-de-preview.mjs usa el mismo literal que ${LECTOR_DE_DOBLES} (R10)`, () => {
    expect(DOBLES).toBe('DOCUMENTS_E2E_DOUBLES')
    const fuente = readFileSync(join(RAIZ, 'scripts/entorno-de-preview.mjs'), 'utf8')
    expect(fuente).toContain(`'${DOBLES}'`)
  })
})
