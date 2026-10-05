// Se prueba la FORMA del catalogo. El compilador ya impide que falte una clave o un texto y que
// compile un codigo inventado (los `@ts-expect-error` de mas abajo); lo que no puede decir es que
// dos codigos no compartan frase, que ninguno se llame `not_found` o que ninguno venga de la
// autenticacion.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  createErrorStateTranslator,
  ERROR_CODES,
  ERROR_MESSAGE_KEY,
  ERROR_MESSAGES_ES,
  errorMessage,
  UNEXPECTED_ERROR_CODE,
  type ErrorCode,
} from '@/lib/modules/errores'
import {
  PedidosError,
  RecipeNotFoundError,
  RecipeVersionUnderReviewError,
} from '@/lib/modules/pedidos/domain/errors'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const moduleFiles = [
  'lib/modules/errores/index.ts',
  'lib/modules/errores/domain/error-codes.ts',
  'lib/modules/errores/domain/error-catalog.ts',
  'lib/modules/errores/domain/error-message.ts',
]

/**
 * Codigos del enlace de ACTIVACION de una cuenta. Rozan el vocabulario de la autenticacion sin
 * serlo, y por eso se declaran uno a uno en vez de relajar el filtro.
 */
const CODIGOS_DE_ACTIVACION: readonly ErrorCode[] = ['credential_link_invalid']

function readModuleFile(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8')
}

describe('catalogo de errores — forma y cierre (QC-70 T1)', () => {
  describe('R1 — un codigo, una clave, un texto', () => {
    it('las 68 entradas estan, y cada codigo tiene exactamente una clave', () => {
      // Conteo LITERAL a proposito: un codigo nuevo que nadie anote aqui pone esta linea en rojo.
      // 65 y no 60: entran `order_without_distribution`, `order_presentation_line_not_editable`,
      // `order_distribution_exceeds_quantity` y `order_without_unit` (QC-170) y
      // `recipe_version_under_review` (QC-172). 67 y no 65: entran `order_would_block` y
      // `order_blocked` (QC-138). 68 y no 67: entra `order_unit_not_convertible` (QC-204).
      expect(ERROR_CODES).toHaveLength(68)
      expect(Object.keys(ERROR_MESSAGE_KEY).sort()).toEqual([...ERROR_CODES].sort())
    })

    it('cada clave tiene exactamente un texto y ninguna clave sobra ni falta', () => {
      const claves = ERROR_CODES.map((code) => ERROR_MESSAGE_KEY[code])
      expect(new Set(claves).size).toBe(claves.length)
      expect(Object.keys(ERROR_MESSAGES_ES).sort()).toEqual([...claves].sort())
    })

    it('errorMessage devuelve el texto del catalogo para los 50 codigos', () => {
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
      // @ts-expect-error un codigo que no esta en ERROR_CODES no es un ErrorCode.
      const inventado: ErrorCode = 'codigo_que_no_existe'
      // @ts-expect-error `not_found` ya no esta en el catalogo.
      const generico: ErrorCode = 'not_found'
      // @ts-expect-error errorMessage tampoco acepta un codigo de fuera de la lista.
      const mensaje: string = errorMessage('duplicate_name')

      // Lo que se prueba son las TRES directivas de arriba: si el tipo dejara de ser cerrado,
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

  describe('QC-81 R13 — el lote duplicado en la empresa tiene codigo y texto propios', () => {
    it('batch_duplicate_lot esta en el catalogo con su clave y su texto exacto', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('batch_duplicate_lot')
      expect(ERROR_MESSAGE_KEY.batch_duplicate_lot).toBe('errors.batch_duplicate_lot')
      expect(errorMessage('batch_duplicate_lot')).toBe(
        'Ya existe un lote con ese valor en esta empresa.',
      )
    })

    it('se distingue de invalid_input y de duplicate_number', () => {
      const texto = errorMessage('batch_duplicate_lot')
      expect(texto).not.toBe(errorMessage('invalid_input'))
      expect(texto).not.toBe(errorMessage('duplicate_number'))
    })

    it('la cabecera de error-codes.ts redacta la sexta enmienda con su fecha y su aprobacion', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Sexta enmienda, el 2026-09-15 (QC-81)**')
      expect(source).toContain('Aprobada por el humano el 2026-09-15 en la puerta F1.4 de QC-81')
    })
  })

  describe('QC-92 R32 — los dos codigos del lote de ajuste tienen codigo y texto propios', () => {
    it('batch_not_found y batch_stock_negative estan en el catalogo con su clave y su texto exacto', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('batch_not_found')
      expect(codigos).toContain('batch_stock_negative')
      expect(ERROR_MESSAGE_KEY.batch_not_found).toBe('errors.batch_not_found')
      expect(ERROR_MESSAGE_KEY.batch_stock_negative).toBe('errors.batch_stock_negative')
      expect(errorMessage('batch_not_found')).toBe('El lote solicitado no existe.')
      expect(errorMessage('batch_stock_negative')).toBe(
        'El ajuste dejaria la existencia del lote por debajo de cero.',
      )
    })

    it('se distinguen entre si y de product_not_found e invalid_input', () => {
      expect(errorMessage('batch_not_found')).not.toBe(errorMessage('product_not_found'))
      expect(errorMessage('batch_stock_negative')).not.toBe(errorMessage('invalid_input'))
      expect(errorMessage('batch_not_found')).not.toBe(errorMessage('batch_stock_negative'))
    })

    it('la cabecera de error-codes.ts redacta la septima enmienda con su fecha y su aprobacion', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Septima enmienda, el 2026-09-17 (QC-92)**')
      expect(source).toContain('Aprobada por el humano el 2026-09-17 en la puerta F1.4 de QC-92')
    })
  })

  describe('QC-108 R10, R11 — ai_unavailable es la octava enmienda al catalogo cerrado', () => {
    it('ai_unavailable esta en el catalogo con su clave y su texto propio', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('ai_unavailable')
      expect(ERROR_MESSAGE_KEY.ai_unavailable).toBe('errors.ai_unavailable')
      expect(errorMessage('ai_unavailable')).toBe(
        'La lectura automatica no esta disponible en este momento. Intentalo mas tarde.',
      )
    })

    it('R12 — el codigo emitido para el corte del proveedor esta en el catalogo cerrado', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('ai_unavailable')
      const texto = errorMessage('ai_unavailable')
      expect(texto).not.toBe(errorMessage('invalid_input'))
      expect(texto).not.toBe(errorMessage('unexpected'))
    })

    it('la cabecera de error-codes.ts redacta la octava enmienda con su fecha y su aprobacion', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Octava enmienda, el 2026-09-18**')
      expect(source).toContain('Aprobada por el humano el 2026-09-18')
    })
  })

describe('QC-121 R20 — presentation_unit_locked es la novena enmienda al catalogo cerrado', () => {
    it('presentation_unit_locked esta en el catalogo con su clave y su texto propio', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('presentation_unit_locked')
      expect(ERROR_MESSAGE_KEY.presentation_unit_locked).toBe('errors.presentation_unit_locked')
      expect(errorMessage('presentation_unit_locked')).toBe(
        'La presentacion ya tiene lotes y no puede cambiar de unidad.',
      )
    })

    it('se distingue de invalid_input y de presentation_in_use', () => {
      const texto = errorMessage('presentation_unit_locked')
      expect(texto).not.toBe(errorMessage('invalid_input'))
      expect(texto).not.toBe(errorMessage('presentation_in_use'))
    })

    it('la cabecera de error-codes.ts redacta la novena enmienda con su fecha y su aprobacion', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Novena enmienda, el 2026-09-18**')
      expect(source).toContain('Aprobada por el humano el 2026-09-18')
    })
  })

  describe('fix directo 2026-09-22 — action_not_allowed es la decima enmienda al catalogo cerrado', () => {
    it('action_not_allowed esta en el catalogo con su clave y su texto propios', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('action_not_allowed')
      expect(ERROR_MESSAGE_KEY.action_not_allowed).toBe('errors.action_not_allowed')
      expect(errorMessage('action_not_allowed')).toBe('La accion no esta permitida.')
    })

    it('se distingue de unauthorized, de invalid_input y de unexpected', () => {
      const texto = errorMessage('action_not_allowed')
      expect(texto).not.toBe(errorMessage('unauthorized'))
      expect(texto).not.toBe(errorMessage('invalid_input'))
      expect(texto).not.toBe(errorMessage('unexpected'))
    })

    it('la cabecera de error-codes.ts redacta la decima enmienda con su fecha', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Decima enmienda, el 2026-09-22 (fix directo)**')
    })
  })

  describe('R34 — customer_not_found tiene clave y texto no vacio', () => {
    it('customer_not_found esta en el catalogo con su clave y su texto exacto', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('customer_not_found')
      expect(ERROR_MESSAGE_KEY.customer_not_found).toBe('errors.customer_not_found')
      expect(errorMessage('customer_not_found')).toBe('El cliente solicitado no existe.')
      expect(errorMessage('customer_not_found').trim().length).toBeGreaterThan(0)
    })

    it('se distingue de supplier_not_found, invalid_input y unexpected', () => {
      const texto = errorMessage('customer_not_found')
      expect(texto).not.toBe(errorMessage('supplier_not_found'))
      expect(texto).not.toBe(errorMessage('invalid_input'))
      expect(texto).not.toBe(errorMessage('unexpected'))
    })

    it('la cabecera de error-codes.ts redacta la decimotercera enmienda con su fecha', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Decimotercera enmienda, 2026-09-24**')
    })
  })

  describe('QC-150 R18, R19 — presentation_without_content y no_whole_package son la duodecima enmienda', () => {
    it('los dos codigos estan en el catalogo con su clave y su texto propios', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('presentation_without_content')
      expect(codigos).toContain('no_whole_package')
      expect(ERROR_MESSAGE_KEY.presentation_without_content).toBe('errors.presentation_without_content')
      expect(ERROR_MESSAGE_KEY.no_whole_package).toBe('errors.no_whole_package')
      expect(errorMessage('presentation_without_content')).toBe(
        'La presentacion del pedido no indica su contenido: completala en Presentaciones antes de finalizar.',
      )
      expect(errorMessage('no_whole_package')).toBe(
        'La cantidad del pedido no llena ni un envase de su presentacion.',
      )
    })

    it('se distinguen entre si y de invalid_input y action_not_allowed', () => {
      const sinContenido = errorMessage('presentation_without_content')
      const sinEnvase = errorMessage('no_whole_package')
      expect(sinContenido).not.toBe(sinEnvase)
      expect(sinContenido).not.toBe(errorMessage('invalid_input'))
      expect(sinContenido).not.toBe(errorMessage('action_not_allowed'))
      expect(sinEnvase).not.toBe(errorMessage('invalid_input'))
      expect(sinEnvase).not.toBe(errorMessage('action_not_allowed'))
    })

    it('la cabecera de error-codes.ts redacta la duodecima enmienda con su fecha', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Duodecima enmienda, 2026-09-24**')
    })
  })

  describe('decimocuarta enmienda, 2026-09-25 — order_packing_taken, order_not_packable, order_produced_frozen', () => {
    it('los tres codigos estan en el catalogo con su clave y su texto exactos', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('order_packing_taken')
      expect(codigos).toContain('order_not_packable')
      expect(codigos).toContain('order_produced_frozen')
      expect(ERROR_MESSAGE_KEY.order_packing_taken).toBe('errors.order_packing_taken')
      expect(ERROR_MESSAGE_KEY.order_not_packable).toBe('errors.order_not_packable')
      expect(ERROR_MESSAGE_KEY.order_produced_frozen).toBe('errors.order_produced_frozen')
      expect(errorMessage('order_packing_taken')).toBe('Otro empacador esta empacando este pedido.')
      expect(errorMessage('order_not_packable')).toBe(
        'El pedido no esta en un estado que admita esa accion de empaque.',
      )
      expect(errorMessage('order_produced_frozen')).toBe(
        'Un pedido ya producido conserva sus responsables tal como estaban.',
      )
    })

    it('se distinguen entre si y de order_not_found, invalid_transition y order_delivered_frozen', () => {
      const tomado = errorMessage('order_packing_taken')
      const noEmpacable = errorMessage('order_not_packable')
      const congelado = errorMessage('order_produced_frozen')
      expect(tomado).not.toBe(noEmpacable)
      expect(tomado).not.toBe(congelado)
      expect(noEmpacable).not.toBe(congelado)
      expect(tomado).not.toBe(errorMessage('order_not_found'))
      expect(noEmpacable).not.toBe(errorMessage('invalid_transition'))
      expect(congelado).not.toBe(errorMessage('order_delivered_frozen'))
    })

    it('la cabecera de error-codes.ts redacta la decimocuarta enmienda con su fecha', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Decimocuarta enmienda, 2026-09-25**')
    })
  })

  describe('decimoquinta enmienda, 2026-10-01 — QC-138 R6 y R32: order_would_block, order_blocked', () => {
    it('R6, R32 — los dos codigos estan en el catalogo con su clave y su texto exactos', () => {
      const codigos: readonly string[] = ERROR_CODES
      expect(codigos).toContain('order_would_block')
      expect(codigos).toContain('order_blocked')
      expect(ERROR_MESSAGE_KEY.order_would_block).toBe('errors.order_would_block')
      expect(ERROR_MESSAGE_KEY.order_blocked).toBe('errors.order_blocked')
      expect(errorMessage('order_would_block')).toBe(
        'No hay material suficiente para este pedido: si lo guardas, quedara bloqueado hasta que entre inventario.',
      )
      expect(errorMessage('order_blocked')).toBe(
        'Falta material: el pedido esta bloqueado y no se puede iniciar.',
      )
    })

    it('R6, R32 — se distinguen entre si y de insufficient_material e invalid_transition', () => {
      const bloquearia = errorMessage('order_would_block')
      const bloqueado = errorMessage('order_blocked')
      expect(bloquearia).not.toBe(bloqueado)
      expect(bloquearia).not.toBe(errorMessage('insufficient_material'))
      expect(bloqueado).not.toBe(errorMessage('insufficient_material'))
      expect(bloqueado).not.toBe(errorMessage('invalid_transition'))
    })

    it('la cabecera de error-codes.ts redacta la decimoquinta enmienda con su fecha', () => {
      const source = readModuleFile('lib/modules/errores/domain/error-codes.ts')
      expect(source).toContain('**Decimoquinta enmienda, 2026-10-01**')
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

  // El filtro por vocabulario es un proxy: `credential_link_invalid` contiene `credential` y no es
  // autenticacion, es el enlace de activacion de una cuenta. Por eso va como excepcion nombrada y
  // el filtro se queda.
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

    // La excepcion, acotada: es UNA sola, esta en el catalogo, y lo que la justifica se comprueba.
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

    it('los ocho codigos de la administracion de usuarios SI estan', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of [
        'user_not_found',
        'duplicate_email',
        'duplicate_username',
        'duplicate_document',
        'role_not_found',
        'self_operation',
        'last_administrator',
        'action_not_allowed',
      ]) {
        expect(codigos, `falta el codigo de usuarios ${code}`).toContain(code)
      }
    })

    it('los dos codigos de QC-79 estan, con su clave y su texto propios', () => {
      const codigos: readonly string[] = ERROR_CODES
      for (const code of ['credential_link_invalid', 'user_not_pending'] as const) {
        expect(codigos, `falta el codigo de QC-79 ${code}`).toContain(code)
        expect(ERROR_MESSAGE_KEY[code]).toBe(`errors.${code}`)
        expect(errorMessage(code).trim().length).toBeGreaterThan(0)
      }
      // La respuesta del enlace invalido es UNA y no nombra ningun caso, para no convertir el
      // enlace en un oraculo sobre si una cuenta existe o en que estado esta.
      const enlace = errorMessage('credential_link_invalid')
      for (const filtracion of ['caduc', 'expir', 'consumid', 'usado', 'sustitu', 'borrad', 'activ', 'existe']) {
        expect(enlace.toLowerCase(), `el texto del enlace invalido revela un caso: ${filtracion}`).not.toContain(
          filtracion,
        )
      }
      expect(errorMessage('user_not_pending')).not.toBe(enlace)
      expect(errorMessage('user_not_pending')).not.toBe(errorMessage('user_not_found'))
    })

    it('QC-172 R33: recipe_version_under_review sale por el traductor con su texto, distinto de recipe_not_found', async () => {
      const toErrorState = createErrorStateTranslator(PedidosError, async () => null, vi.fn())

      expect(await toErrorState(new RecipeVersionUnderReviewError())).toEqual({
        status: 'error',
        code: 'recipe_version_under_review',
        message: 'La versión elegida está por revisar: ajústala antes de usarla en un pedido.',
      })
      expect(await toErrorState(new RecipeNotFoundError())).not.toMatchObject({
        code: 'recipe_version_under_review',
      })
      expect(errorMessage('recipe_version_under_review')).not.toBe(errorMessage('recipe_not_found'))
    })

    it('el modulo errores no importa identity ni lo nombra', () => {
      for (const file of moduleFiles) {
        expect(readModuleFile(file)).not.toMatch(/lib\/modules\/identity/)
      }
    })
  })
})

describe('QC-161 R41 — el nombre de usuario duplicado ya no se acota a la empresa', () => {
  it('R41 — duplicate_username dice el choque sin nombrar la empresa', () => {
    expect(errorMessage('duplicate_username')).toBe('Ya existe un usuario con ese nombre de usuario.')
    expect(errorMessage('duplicate_username').toLowerCase()).not.toContain('empresa')
  })

  it('R41 — duplicate_email y duplicate_document siguen diciendo que el choque es en la empresa', () => {
    expect(errorMessage('duplicate_email')).toBe('Ya existe un usuario con ese correo en la empresa.')
    expect(errorMessage('duplicate_document')).toBe(
      'Ya existe un usuario con ese documento en la empresa.',
    )
  })
})
