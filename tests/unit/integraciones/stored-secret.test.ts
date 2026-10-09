// Forma del valor guardado y codificación del contexto, sin criptografía: funciones puras del dominio.

import { describe, expect, it } from 'vitest'

import {
  IntegracionesError,
  SecretUnreadableError,
  ValidationError,
  type SecretContext,
} from '@/lib/modules/integraciones'
import { errorMessage } from '@/lib/modules/errores'
import {
  encodeSecretContext,
  isCompleteSecretContext,
} from '@/lib/modules/integraciones/domain/secret-context'
import {
  isKeyVersion,
  joinStoredSecret,
  splitStoredSecret,
  type StoredSecretParts,
} from '@/lib/modules/integraciones/domain/stored-secret'

const IV = 'AAECAwQFBgcICQoL' // 12 bytes
const TAG = 'AAECAwQFBgcICQoLDA0ODw==' // 16 bytes
const CIPHERTEXT = 'aG9sYQ=='

const PARTS: StoredSecretParts = { version: 'v1', iv: IV, tag: TAG, ciphertext: CIPHERTEXT }

describe('R3 — forma v<n>:<iv>:<tag>:<ciphertext>', () => {
  it('R3: unir da las cuatro partes separadas por dos puntos, en orden', () => {
    expect(joinStoredSecret(PARTS)).toBe(`v1:${IV}:${TAG}:${CIPHERTEXT}`)
  })

  it('R3: partir lo que se unió devuelve las mismas partes', () => {
    expect(splitStoredSecret(joinStoredSecret(PARTS))).toEqual(PARTS)
  })

  it('R3: acepta versiones de varias cifras y base64 sin relleno o con uno o dos signos', () => {
    for (const ciphertext of ['aG9s', 'aG9sYQ==', 'aG9sYS4=']) {
      const parts = { ...PARTS, version: 'v12', ciphertext }
      expect(splitStoredSecret(joinStoredSecret(parts))).toEqual(parts)
    }
  })
})

describe('R7 — cada forma inválida da null', () => {
  const invalidos: ReadonlyArray<readonly [string, string]> = [
    ['cadena vacía', ''],
    ['tres partes', `v1:${IV}:${TAG}`],
    ['cinco partes', `v1:${IV}:${TAG}:${CIPHERTEXT}:${CIPHERTEXT}`],
    ['versión sin v', `1:${IV}:${TAG}:${CIPHERTEXT}`],
    ['versión v0', `v0:${IV}:${TAG}:${CIPHERTEXT}`],
    ['versión con cero a la izquierda', `v01:${IV}:${TAG}:${CIPHERTEXT}`],
    ['versión negativa', `v-1:${IV}:${TAG}:${CIPHERTEXT}`],
    ['versión en mayúscula', `V1:${IV}:${TAG}:${CIPHERTEXT}`],
    ['versión con letras', `vx:${IV}:${TAG}:${CIPHERTEXT}`],
    ['iv vacío', `v1::${TAG}:${CIPHERTEXT}`],
    ['tag vacío', `v1:${IV}::${CIPHERTEXT}`],
    ['ciphertext vacío', `v1:${IV}:${TAG}:`],
    ['base64url en el iv', `v1:AAECAwQFBgcICQo-:${TAG}:${CIPHERTEXT}`],
    ['base64url en el tag', `v1:${IV}:AAECAwQFBgcICQoLDA0O_w==:${CIPHERTEXT}`],
    ['espacio en el ciphertext', `v1:${IV}:${TAG}:aG9s YQ==`],
    ['salto de línea en el ciphertext', `v1:${IV}:${TAG}:aG9s\nYQ==`],
  ]

  it.each(invalidos)('R7: %s da null', (_caso, stored) => {
    expect(splitStoredSecret(stored)).toBeNull()
  })

  it('R7: base64 permisivo rechazado, aunque Node lo decodificaría sin avisar', () => {
    const permisivos = ['aG9sYQ', 'aG9sYQ=', 'aG9sYQ===', 'aG9sYQ==!', '!aG9sYQ==', 'aG9s=YQ==']
    for (const ciphertext of permisivos) {
      expect(Buffer.from(ciphertext, 'base64').length).toBeGreaterThan(0)
      expect(splitStoredSecret(`v1:${IV}:${TAG}:${ciphertext}`), ciphertext).toBeNull()
    }
  })

  it('R7: isKeyVersion solo acepta v seguida de un entero positivo sin ceros a la izquierda', () => {
    expect(['v1', 'v2', 'v10', 'v999'].every(isKeyVersion)).toBe(true)
    expect(['', 'v', 'v0', 'v01', '1', 'V1', 'v1 ', ' v1', 'v1.0', 'v-1'].some(isKeyVersion)).toBe(false)
  })
})

describe('R6 — codificación del contexto sin ambigüedad', () => {
  const primero: SecretContext = { companyId: 'a:b', recordId: 'c', field: 'd' }
  const segundo: SecretContext = { companyId: 'a', recordId: 'b:c', field: 'd' }

  it('R6: los dos contextos del ejemplo dan cadenas distintas', () => {
    expect(encodeSecretContext('v1', primero)).not.toBe(encodeSecretContext('v1', segundo))
  })

  it('R6: la versión forma parte de la cadena', () => {
    expect(encodeSecretContext('v1', primero)).not.toBe(encodeSecretContext('v2', primero))
  })

  it('R6: comillas y barras en un componente no se confunden con el separador', () => {
    const conComillas: SecretContext = { companyId: 'a","b', recordId: 'c', field: 'd' }
    const partido: SecretContext = { companyId: 'a', recordId: 'b', field: 'c' }
    expect(encodeSecretContext('v1', conComillas)).not.toBe(encodeSecretContext('v1', partido))
  })

  it('R6: la misma entrada da siempre la misma cadena', () => {
    expect(encodeSecretContext('v1', { ...primero })).toBe(encodeSecretContext('v1', primero))
  })
})

describe('R13 — contexto completo', () => {
  it('R13: un contexto con empresa, registro y campo está completo', () => {
    expect(isCompleteSecretContext({ companyId: 'e', recordId: 'r', field: 'f' })).toBe(true)
  })

  it.each([
    ['empresa', { companyId: '', recordId: 'r', field: 'f' }],
    ['registro', { companyId: 'e', recordId: '', field: 'f' }],
    ['campo', { companyId: 'e', recordId: 'r', field: '' }],
  ] as const)('R13: con %s vacío no está completo', (_hueco, context) => {
    expect(isCompleteSecretContext(context)).toBe(false)
  })
})

describe('R20 — errores del contrato', () => {
  it('R20: SecretUnreadableError lleva el código y el texto del catálogo, y deriva de la base', () => {
    const error = new SecretUnreadableError('forma inválida')
    expect(error).toBeInstanceOf(IntegracionesError)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('integration_secret_unreadable')
    expect(error.message).toBe(errorMessage('integration_secret_unreadable'))
    expect(error.diagnostic).toBe('forma inválida')
    expect(error.name).toBe('SecretUnreadableError')
  })

  it('R20: ValidationError usa invalid_input y deriva de la base', () => {
    const error = new ValidationError()
    expect(error).toBeInstanceOf(IntegracionesError)
    expect(error.code).toBe('invalid_input')
    expect(error.message).toBe(errorMessage('invalid_input'))
  })
})
