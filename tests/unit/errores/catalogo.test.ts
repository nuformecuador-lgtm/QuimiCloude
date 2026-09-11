// QC-70 T1 — el catalogo unico de errores (R1-R5, R16-R19, R25).
//
// Lo que aqui se prueba NO es comportamiento de una funcion: es la FORMA del catalogo. El
// sistema de tipos ya impide que falte una clave o un texto (`satisfies` en `error-catalog.ts`)
// y que un codigo inventado compile (R2, con su caso de `@ts-expect-error` mas abajo); lo que
// el compilador NO puede decir es que dos codigos no compartan frase (R4), que ninguno se
// llame `not_found` (R16) o que ninguno venga de la AUTENTICACION (R25, enmendado el 2026-09-10:
// la administracion de usuarios de QC-66 SI entra al catalogo; el login de QC-7 no). Eso se
// comprueba aqui.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  ERROR_MESSAGE_KEY,
  ERROR_MESSAGES_ES,
  errorMessage,
  UNEXPECTED_ERROR_CODE,
  type ErrorCode,
} from '@/lib/modules/errores'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const moduleFiles = [
  'lib/modules/errores/index.ts',
  'lib/modules/errores/domain/error-codes.ts',
  'lib/modules/errores/domain/error-catalog.ts',
  'lib/modules/errores/domain/error-message.ts',
]

/**
 * QC-79: los codigos que hablan del enlace de ACTIVACION de una cuenta. Rozan el vocabulario de la
 * autenticacion sin serlo, y por eso se declaran aqui uno a uno en vez de relajar el filtro.
 */
const CODIGOS_DE_ACTIVACION: readonly ErrorCode[] = ['credential_link_invalid']

function readModuleFile(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8')
}

describe('catalogo de errores — forma y cierre (QC-70 T1)', () => {
  describe('R1 — un codigo, una clave, un texto', () => {
    it('las 34 entradas estan, y cada codigo tiene exactamente una clave', () => {
      // 25 de `design.md > 3` + los SIETE de la administracion de usuarios que entraron el
      // 2026-09-10 con la enmienda a R25 (QC-66) + los DOS de QC-79 (el enlace invalido y la
      // cuenta que ya no esta pendiente), que se apoyan en esa misma enmienda y no redactan
      // ninguna nueva. Sigue siendo un conteo LITERAL a proposito: un codigo nuevo que nadie
      // anote aqui pone esta linea en rojo.
      expect(ERROR_CODES).toHaveLength(34)
      expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
      expect(Object.keys(ERROR_MESSAGE_KEY).sort()).toEqual([...ERROR_CODES].sort())
    })

    it('cada clave tiene exactamente un texto y ninguna clave sobra ni falta', () => {
      const claves = ERROR_CODES.map((code) => ERROR_MESSAGE_KEY[code])
      expect(new Set(claves).size).toBe(claves.length)
      expect(Object.keys(ERROR_MESSAGES_ES).sort()).toEqual([...claves].sort())
    })

    it('errorMessage devuelve el texto del catalogo para los 34 codigos', () => {
      for (const code of ERROR_CODES) {
        expect(errorMessage(code)).toBe(ERROR_MESSAGES_ES[ERROR_MESSAGE_KEY[code]])
        expect(errorMessage(code).trim().length).toBeGreaterThan(0)
      }
      expect(errorMessage('incompatible_units')).toBe(
        'Las dos unidades no comparten unidad base: no son convertibles.',
      )
      expect(errorMessage(UNEXPECTED_ERROR_CODE)).toBe(
        'Ocurrio un error inesperado. Intentalo de nuevo.',
      )
    })
  })

  describe('R2 — el catalogo es cerrado: un codigo de fuera NO compila', () => {
    it('un codigo inventado y uno de los genericos borrados son error de tipos', () => {
      // @ts-expect-error un codigo que no esta en ERROR_CODES no es un ErrorCode (R2).
      const inventado: ErrorCode = 'codigo_que_no_existe'
      // @ts-expect-error `not_found` se borro del catalogo al abrirlo por caso (R16).
      const generico: ErrorCode = 'not_found'
      // @ts-expect-error errorMessage tampoco acepta un codigo de fuera de la lista (R2).
      const mensaje: string = errorMessage('duplicate_name')

      // Lo que prueba R2 son las TRES directivas de arriba: si el tipo dejara de ser cerrado,
      // los `@ts-expect-error` se quedarian sin error y `pnpm run typecheck` se pondria rojo.
      expect([inventado, generico, mensaje]).toHaveLength(3)
    })

    it('ERROR_CODES es una tupla de literales, no un string[] mutable', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toMatch(/export const ERROR_CODES = \[[\s\S]*\] as const;/)
    })
  })

  describe('R3 — palabra estable, nunca un numero', () => {
    it('los 25 codigos casan la forma en minusculas con guion bajo y ninguno es numerico', () => {
      for (const code of ERROR_CODES) {
        expect(code, `codigo con forma invalida: ${code}`).toMatch(/^[a-z][a-z_]*$/)
        expect(Number.isNaN(Number(code)), `codigo numerico: ${code}`).toBe(true)
      }
    })
  })

  describe('R4 — dos codigos no pueden compartir texto', () => {
    it('no hay ningun texto repetido en el catalogo', () => {
      const textos = ERROR_CODES.map((code) => errorMessage(code))
      const repetidos = textos.filter((texto, indice) => textos.indexOf(texto) !== indice)
      expect(repetidos).toEqual([])
    })
  })

  describe('R5 — codigo -> clave -> texto, sin ninguna dependencia', () => {
    it('cada clave es estable y deriva del codigo', () => {
      for (const code of ERROR_CODES) {
        expect(ERROR_MESSAGE_KEY[code]).toBe(`errors.${code}`)
      }
    })

    it('el modulo no importa ningun paquete: solo sus propios archivos', () => {
      for (const file of moduleFiles) {
        const especificadores = [...readModuleFile(file).matchAll(/from\s+'([^']+)'/g)].map(
          (match) => match[1] as string,
        )
        for (const especificador of especificadores) {
          expect(especificador, `${file} importa el paquete ${especificador}`).toMatch(/^\.\//)
        }
      }
    })
  })

  describe('R16 — los genericos ya no existen', () => {
    it('ni not_found ni duplicate_name estan en el catalogo', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).not.toContain('not_found')
      expect(codigos).not.toContain('duplicate_name')
      const claves: readonly string[] = Object.values(ERROR_MESSAGE_KEY)
      expect(claves).not.toContain('errors.not_found')
      expect(claves).not.toContain('errors.duplicate_name')
    })
  })

  describe('R17 — cada caso de «no existe» tiene su codigo', () => {
    it('los siete codigos de no encontrado estan en el catalogo', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of [
        'product_not_found',
        'presentation_not_found',
        'order_not_found',
        'supplier_not_found',
        'catalog_line_not_found',
        'recipe_not_found',
        'unit_not_found',
      ]) {
        expect(codigos, `falta ${code}`).toContain(code)
      }
    })
  })

  describe('R18 — cada caso de «nombre repetido» tiene su codigo', () => {
    it('los cuatro codigos de nombre duplicado estan en el catalogo', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of [
        'presentation_duplicate_name',
        'supplier_duplicate_name',
        'recipe_duplicate_name',
        'unit_duplicate_name',
      ]) {
        expect(codigos, `falta ${code}`).toContain(code)
      }
    })
  })

  describe('R19 — los codigos inequivocos no se renombran', () => {
    it('los trece codigos congelados conservan su valor', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of [
        'unauthorized',
        'invalid_input',
        'presentation_in_use',
        'invalid_transition',
        'not_cancellable',
        'not_deletable',
        'duplicate_number',
        'duplicate_catalog_line',
        'duplicate_symbol',
        'system_unit',
        'invalid_derivation',
        'unit_in_use',
        'incompatible_units',
      ]) {
        expect(codigos, `falta el codigo congelado ${code}`).toContain(code)
      }
    })
  })

  // R25, ENMENDADO el 2026-09-10 (aprobado por el humano). La premisa de R25 —que `identity` solo
  // devuelve el rechazo generico del login— caduco con QC-66, que anade seis casos de uso de
  // administracion de usuarios con fallos distinguibles, asi que esos SIETE codigos entran. Lo que
  // R25 protegia de verdad sigue en pie y es lo que se comprueba aqui: la AUTENTICACION no entra,
  // el rechazo del login sigue siendo generico y el modulo `errores` no depende de nadie.
  //
  // QC-79, el 2026-09-11: el conjunto de codigos AJENOS de abajo y el resto de la comprobacion NO
  // cambian. Lo que cambia es el filtro por VOCABULARIO, que era un proxy escrito cuando ninguna
  // palabra del catalogo rozaba la de la autenticacion: `credential_link_invalid` (R22) contiene
  // `credential` y NO es autenticacion —es el enlace de ACTIVACION de una cuenta, una superficie
  // publica sin sesion que no emite ninguna ni dice nada del login—. Se declara como excepcion
  // NOMBRADA, no se borra el filtro, y el caso de mas abajo la acota a esa unica entrada.
  describe('R25 (enmendado) — la autenticacion se queda fuera, la administracion de usuarios entra', () => {
    it('ningun codigo del catalogo sale del login ni de la sesion', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const ajeno of [
        'invalid_credentials',
        'account_locked',
        'account_disabled',
        'session_expired',
        'weak_password',
      ]) {
        expect(codigos, `codigo de autenticacion en el catalogo: ${ajeno}`).not.toContain(ajeno)
      }
      for (const code of ERROR_CODES) {
        if (CODIGOS_DE_ACTIVACION.includes(code)) continue
        expect(code, `codigo con vocabulario de autenticacion: ${code}`).not.toMatch(
          /credential|password|session|login|account/,
        )
      }
    })

    // La excepcion de arriba, acotada y demostrada: es UNA sola, esta en el catalogo, y lo que la
    // justifica —que no salga del login— se comprueba, no se promete.
    it('la unica excepcion al vocabulario es el enlace de activacion de QC-79, y sigue sin ser autenticacion', () => {
      const codigos: readonly string[] = ERROR_CODES

      expect(CODIGOS_DE_ACTIVACION).toEqual(['credential_link_invalid'])
      for (const code of CODIGOS_DE_ACTIVACION) {
        expect(codigos, `la excepcion ${code} ya no esta en el catalogo`).toContain(code)
        // Habla del ENLACE, no de una credencial que alguien presenta para entrar: la palabra
        // `credential` va siempre acompanada de `link`.
        expect(code).toMatch(/^credential_link_/)
      }
    })

    it('los siete codigos de la administracion de usuarios SI estan', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of [
        'user_not_found',
        'duplicate_email',
        'duplicate_username',
        'duplicate_document',
        'role_not_found',
        'self_operation',
        'last_administrator',
      ]) {
        expect(codigos, `falta el codigo de usuarios ${code}`).toContain(code)
      }
    })

    // QC-79 (R34): las DOS entradas nuevas bajo el mismo encabezado de `identity`, sin ninguna
    // enmienda nueva al catalogo cerrado: se apoyan en la de QC-66 que ya esta arriba.
    it('los dos codigos de QC-79 estan, con su clave y su texto propios', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of ['credential_link_invalid', 'user_not_pending'] as const) {
        expect(codigos, `falta el codigo de QC-79 ${code}`).toContain(code)
        expect(ERROR_MESSAGE_KEY[code]).toBe(`errors.${code}`)
        expect(errorMessage(code).trim().length).toBeGreaterThan(0)
      }
      // R22: la respuesta del enlace invalido es UNA y no nombra ninguno de los seis casos, para
      // no convertir el enlace en un oraculo sobre si una cuenta existe o en que estado esta.
      const enlace = errorMessage('credential_link_invalid')
      for (const filtracion of ['caduc', 'expir', 'consumid', 'usado', 'sustitu', 'borrad', 'activ', 'existe']) {
        expect(enlace.toLowerCase(), `el texto del enlace invalido revela un caso: ${filtracion}`).not.toContain(
          filtracion,
        )
      }
      // Y son distinguibles entre si y de los de QC-66 (R4, ya cubierto globalmente arriba).
      expect(errorMessage('user_not_pending')).not.toBe(enlace)
      expect(errorMessage('user_not_pending')).not.toBe(errorMessage('user_not_found'))
    })

    it('el modulo errores no importa identity ni lo nombra', () => {
      for (const file of moduleFiles) {
        expect(readModuleFile(file)).not.toMatch(/lib\/modules\/identity/)
      }
    })
  })
})
