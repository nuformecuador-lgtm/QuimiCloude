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

const REF = 'refinventadopreview'
const OTRO_REF = 'refinventadoproduccion'
const URLS = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_STORAGE_URL'] as const
const CREDENCIALES = ['RESEND_API_KEY', 'SMTP_PASS', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'QSTASH_TOKEN'] as const

/** Valores que nunca pueden aparecer en un mensaje. */
const SECRETO = 'secreto-inventado-no-debe-salir'

function urlsDe(ref: string): Record<(typeof URLS)[number], string> {
  return {
    DATABASE_URL: `postgresql://postgres.${ref}:clave-inventada@pooler.invalid:6543/postgres`,
    DIRECT_URL: `postgresql://postgres:clave-inventada@db.${ref}.supabase.invalid:5432/postgres`,
    SUPABASE_STORAGE_URL: `https://${ref}.supabase.invalid`,
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
      for (const valor of [REF, OTRO_REF, SECRETO, 'transporte-inventado', 'clave-inventada', 'supabase.invalid']) {
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
