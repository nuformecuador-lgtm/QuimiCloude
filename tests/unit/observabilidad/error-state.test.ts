// QC-71 T7 — EL TRADUCTOR RESUELVE EL IDENTIFICADOR, ESCRIBE LA LINEA Y LA DEVUELVE.
// Cubre R7, R8, R10, R11, R12, R13, R14 y R15.
//
// Se ejercita el traductor REAL con su `log` POR DEFECTO y se espia `console` de verdad: lo que
// R10 y R11 exigen no es que un doble reciba una llamada, es que se escriba **una** linea en el
// registro cuando falla algo inesperado y **ninguna** en cualquier otro caso. Con un espia
// inyectado eso no se prueba —el sumidero por defecto podria escribir dos veces, o ninguna, y el
// test seguiria verde—.
//
// La familia del modulo se representa con una base SINTETICA, mismo criterio que
// `tests/unit/errores/to-error-state.test.ts`: lo que se prueba es el traductor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createErrorStateTranslator,
  errorMessage,
  UNEXPECTED_ERROR_CODE,
  type ErrorCode,
  type ErrorState,
  type RequestIdHeaderReader,
} from '@/lib/modules/errores'

abstract class ModuloDePruebaError extends Error {
  abstract readonly code: ErrorCode

  readonly diagnostic?: string

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code))
    this.diagnostic = diagnostic
    this.name = new.target.name
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class SinPermisoError extends ModuloDePruebaError {
  readonly code = 'unauthorized'

  constructor() {
    super('unauthorized')
  }
}

/** El identificador que el middleware habria puesto en la cabecera (R4). */
const ID_DEL_BORDE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** La cabecera llega (camino normal, R7). */
const conCabecera: RequestIdHeaderReader = async () => ID_DEL_BORDE
/** La cabecera no llega: el cruce borde -> accion se rompio, o la ruta no pasa por el `matcher`. */
const sinCabecera: RequestIdHeaderReader = async () => null
/** La cabecera llega VACIA, que a efectos de identificar una peticion es no llegar (R8). */
const cabeceraVacia: RequestIdHeaderReader = async () => ''

/**
 * La forma EXACTA de la primera linea, de `design.md > 5`. Se afirma contra el formato completo
 * y no contra fragmentos sueltos: asi, cualquier campo que alguien anada manana —una URL, un
 * `formData`— rompe la comparacion en vez de colarse (R12).
 */
const LINEA = /^\[error\] requestId=([0-9a-f-]{36}) origen=(borde|respaldo) code=(\w+) error=([^:]+): (.*)$/

type Espia = ReturnType<typeof vi.spyOn>

let consolaError: Espia
let otrasSalidas: Record<'log' | 'warn' | 'info' | 'debug', Espia>

beforeEach(() => {
  consolaError = vi.spyOn(console, 'error').mockImplementation(() => {})
  otrasSalidas = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** El texto completo de la unica linea escrita, con su traza. */
function lineaEscrita(): string {
  expect(consolaError).toHaveBeenCalledTimes(1)
  const [primerArgumento] = consolaError.mock.calls[0] as [unknown]
  expect(typeof primerArgumento, 'la linea del error inesperado se escribe como TEXTO').toBe('string')
  return primerArgumento as string
}

/** El `reference` de un estado inesperado, exigiendo por el camino que sea el inesperado. */
function referenciaDe(state: ErrorState): string {
  expect(state.code).toBe(UNEXPECTED_ERROR_CODE)
  if (state.code !== UNEXPECTED_ERROR_CODE) throw new Error('no es el estado inesperado')
  return state.reference
}

describe('QC-71 T7 — el traductor y el identificador de la peticion', () => {
  describe('R7 — con cabecera: el estado y la linea llevan ESE valor', () => {
    it('el identificador que resuelve es el de la cabecera, no uno nuevo', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      const state = await toErrorState(new Error('la base no responde'))

      expect(referenciaDe(state)).toBe(ID_DEL_BORDE)
      const [, id, origen] = LINEA.exec(lineaEscrita().split('\n')[0] as string) ?? []
      expect(id).toBe(ID_DEL_BORDE)
      expect(origen).toBe('borde')
    })
  })

  describe('R8 — sin cabecera: hay identificador igual, y la linea dice que es de respaldo', () => {
    it('genera uno nuevo y lo marca como respaldo', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera)

      const state = await toErrorState(new Error('la base no responde'))

      const referencia = referenciaDe(state)
      expect(referencia).toMatch(UUID)
      expect(referencia).not.toBe(ID_DEL_BORDE)
      const [, id, origen] = LINEA.exec(lineaEscrita().split('\n')[0] as string) ?? []
      expect(id).toBe(referencia)
      // Esta es la senal de campo del diseno (`design.md > 3.3`): si el cruce borde -> accion se
      // rompe en produccion, cada linea lo dice, en vez de fallar en silencio.
      expect(origen).toBe('respaldo')
    })

    it('una cabecera VACIA cuenta como ausente, no como identificador', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, cabeceraVacia)

      const state = await toErrorState(new Error('la base no responde'))

      expect(referenciaDe(state)).toMatch(UUID)
      expect(lineaEscrita()).toContain('origen=respaldo')
    })

    it('dos invocaciones sin cabecera no comparten identificador', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera)

      const primera = referenciaDe(await toErrorState(new Error('uno')))
      const segunda = referenciaDe(await toErrorState(new Error('dos')))

      expect(primera).not.toBe(segunda)
    })
  })

  describe('R10 — exactamente UNA linea, con identificador, origen, codigo y detalle', () => {
    it('un solo console.error, con los cuatro campos y la traza del error', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)
      const ajeno = new TypeError('no se pudo abrir la conexion')

      await toErrorState(ajeno)

      const linea = lineaEscrita()
      const [cabecera, ...traza] = linea.split('\n')
      const emparejado = LINEA.exec(cabecera as string)
      expect(emparejado, `la linea no tiene el formato de design.md > 5: ${cabecera}`).not.toBeNull()
      const [, id, origen, code, nombre, mensaje] = emparejado ?? []
      expect(id).toBe(ID_DEL_BORDE)
      expect(origen).toBe('borde')
      expect(code).toBe(UNEXPECTED_ERROR_CODE)
      expect(nombre).toBe('TypeError')
      expect(mensaje).toBe('no se pudo abrir la conexion')
      // La traza es la mitad que QC-70 decidio mandar al log y no al navegador.
      expect(traza.join('\n')).toContain('error-state.test.ts')
      expect(consolaError).toHaveBeenCalledTimes(1)
    })

    it('un valor lanzado que no es Error tambien deja su linea, sin imprimir el valor', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      await toErrorState('DNI 12345678 del cliente')

      const linea = lineaEscrita()
      expect(linea).toContain('error=NoError: se lanzo un valor de tipo string')
      // Un `String(valor)` aqui seria una fuga: lo lanzado puede ser cualquier cosa (R12).
      expect(linea).not.toContain('12345678')
    })
  })

  describe('R11 — mientras no haya error inesperado, no se escribe NADA', () => {
    it('el camino feliz no escribe ninguna linea: el traductor ni se invoca', () => {
      createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      expect(consolaError).not.toHaveBeenCalled()
      for (const [nombre, espia] of Object.entries(otrasSalidas)) {
        expect(espia, `el camino feliz escribio en console.${nombre}`).not.toHaveBeenCalled()
      }
    })

    it('un error DEL CATALOGO (sin diagnostico) no escribe ninguna linea', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      const state = await toErrorState(new SinPermisoError())

      expect(state).toEqual({
        status: 'error',
        code: 'unauthorized',
        message: errorMessage('unauthorized'),
      })
      expect(consolaError).not.toHaveBeenCalled()
      for (const [nombre, espia] of Object.entries(otrasSalidas)) {
        expect(espia, `el error catalogado escribio en console.${nombre}`).not.toHaveBeenCalled()
      }
    })

    it('el error del catalogo tampoco lee la cabecera: no hay identificador que resolver', async () => {
      const lectura = vi.fn(async () => ID_DEL_BORDE)
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, lectura)

      await toErrorState(new SinPermisoError())

      expect(lectura).not.toHaveBeenCalled()
    })
  })

  describe('R12 — la linea no lleva URL, ni formulario, ni nada que haya escrito nadie', () => {
    it('del error solo salen nombre, mensaje y traza', async () => {
      // Lo que en una peticion real esta "a mano" del traductor y NO puede acabar en el log:
      // las rutas de este ERP llevan el id del pedido y hasta el texto buscado.
      const URL_CON_PARAMETROS = '/pedidos?buscar=cliente+confidencial&id=42'
      const VALOR_DE_FORMULARIO = 'Acido sulfurico 98%'
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      await toErrorState(new Error('connection refused'))

      const linea = lineaEscrita()
      expect(linea).not.toContain(URL_CON_PARAMETROS)
      expect(linea).not.toContain('buscar=')
      expect(linea).not.toContain(VALOR_DE_FORMULARIO)
      // Y la comprobacion fuerte: la primera linea encaja ENTERA con el formato de
      // `design.md > 5`, asi que no hay hueco por donde meter un campo mas sin romper esto.
      expect(linea.split('\n')[0]).toMatch(LINEA)
    })
  })

  describe('R13 — el identificador del estado y el de la linea son el mismo', () => {
    it('coinciden con cabecera y coinciden sin ella', async () => {
      for (const lectura of [conCabecera, sinCabecera]) {
        consolaError.mockClear()
        const toErrorState = createErrorStateTranslator(ModuloDePruebaError, lectura)

        const state = await toErrorState(new Error('fallo'))

        const [, idDeLaLinea] = LINEA.exec(lineaEscrita().split('\n')[0] as string) ?? []
        expect(idDeLaLinea).toBe(referenciaDe(state))
      }
    })
  })

  describe('R14 — el estado no lleva traza, ni tabla, ni SQL, ni el mensaje original', () => {
    it('el estado inesperado son cuatro campos y ninguno filtra nada', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)
      const ajeno = new Error('relation "orders" does not exist at line 42')

      const state = await toErrorState(ajeno)

      expect(state).toEqual({
        status: 'error',
        code: UNEXPECTED_ERROR_CODE,
        message: errorMessage(UNEXPECTED_ERROR_CODE),
        reference: ID_DEL_BORDE,
      })
      const serializado = JSON.stringify(state)
      for (const filtracion of ['orders', 'relation', 'line 42', 'at Object', 'stack']) {
        expect(serializado, `el estado filtra ${filtracion}`).not.toContain(filtracion)
      }
      // Y lo que si sale, sale por el log y solo por ahi.
      expect(lineaEscrita()).toContain('relation "orders" does not exist at line 42')
    })
  })

  describe('R15 — el error del catalogo vuelve SIN identificador', () => {
    it('ni como campo, ni al serializar, ni con cabecera presente', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, conCabecera)

      const state = await toErrorState(new SinPermisoError())

      expect(Object.keys(state)).toEqual(['status', 'code', 'message'])
      expect(JSON.stringify(state)).not.toContain('reference')
      expect(JSON.stringify(state)).not.toContain(ID_DEL_BORDE)
    })
  })
})
