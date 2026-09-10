// QC-70 T2 — el traductor unico de error de dominio a estado serializable (R11-R15, R28, R29).
//
// La familia de un modulo se representa aqui con una base SINTETICA (`ModuloDePruebaError`),
// no con una de las cinco reales: lo que se prueba es el traductor, y atarlo a `PedidosError`
// lo haria fallar por motivos que no son suyos. Que los siete adaptadores lo usen de verdad
// (R10) lo fija la guardia del catalogo, no este archivo.

import { describe, expect, it, vi } from 'vitest'

import { createErrorStateTranslator, errorMessage, type ErrorCode } from '@/lib/modules/errores'

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

class TransicionInvalidaError extends ModuloDePruebaError {
  readonly code = 'invalid_transition'

  constructor(diagnostic?: string) {
    super('invalid_transition', diagnostic)
  }
}

class SinPermisoError extends ModuloDePruebaError {
  readonly code = 'unauthorized'

  constructor() {
    super('unauthorized')
  }
}

const CAMPOS_DECLARADOS = ['status', 'code', 'message', 'reference']

describe('createErrorStateTranslator (QC-70 T2)', () => {
  describe('R11 — error de la familia: codigo de la clase, mensaje del catalogo', () => {
    it('devuelve el estado con el codigo de la clase y el texto del catalogo', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())

      expect(toErrorState(new SinPermisoError())).toEqual({
        status: 'error',
        code: 'unauthorized',
        message: 'El actor no tiene permiso para realizar esta operacion.',
      })
    })

    it('no decide por el texto del error: un mensaje manipulado no cambia el estado', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())
      const error = new SinPermisoError()
      error.message = 'texto manipulado que no debe salir'

      const state = toErrorState(error)

      expect(state.message).toBe(errorMessage('unauthorized'))
      expect(JSON.stringify(state)).not.toContain('manipulado')
    })
  })

  describe('R12, R13 — error ajeno: codigo generico y mensaje neutro', () => {
    it('devuelve unexpected con su mensaje del catalogo para cualquier error de fuera', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())

      expect(toErrorState(new Error('lo que sea'))).toEqual({
        status: 'error',
        code: 'unexpected',
        message: 'Ocurrio un error inesperado. Intentalo de nuevo.',
      })
      expect(toErrorState('un string suelto').code).toBe('unexpected')
      expect(toErrorState(undefined).code).toBe('unexpected')
    })

    it('ningun campo del estado filtra la traza, la tabla ni el SQL del error original', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())
      const ajeno = new Error('relation "orders" does not exist at line 42')

      const state = toErrorState(ajeno)
      const serializado = JSON.stringify(state)

      for (const filtracion of ['orders', 'relation', 'line 42']) {
        expect(serializado, `el estado filtra ${filtracion}`).not.toContain(filtracion)
      }
      for (const valor of Object.values(state)) {
        expect(String(valor)).not.toContain('orders')
      }
    })
  })

  describe('R14 — el error original va al registro del servidor, y solo ahi', () => {
    it('el espia de log recibe el error ajeno exactamente una vez', () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, log)
      const ajeno = new Error('relation "orders" does not exist at line 42')

      toErrorState(ajeno)

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith({ code: 'unexpected', cause: ajeno })
    })

    it('un error de la familia sin diagnostico no escribe nada en el registro', () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, log)

      toErrorState(new SinPermisoError())

      expect(log).not.toHaveBeenCalled()
    })
  })

  describe('R15 — la referencia esta declarada, opcional, y QC-70 no la rellena', () => {
    it('sale undefined en los dos caminos y no aparece al serializar', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())

      const deDominio = toErrorState(new SinPermisoError())
      const ajeno = toErrorState(new Error('cualquier cosa'))

      expect(deDominio.reference).toBeUndefined()
      expect(ajeno.reference).toBeUndefined()
      expect(Object.keys(deDominio)).not.toContain('reference')
      expect(JSON.stringify(ajeno)).not.toContain('reference')
    })
  })

  describe('R28, R29 — el diagnostico va al log y NUNCA al estado', () => {
    it('el espia recibe el diagnostico y el estado serializado no lo contiene', () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, log)

      const state = toErrorState(new TransicionInvalidaError('de PENDIENTE a ENTREGADO'))

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith({
        code: 'invalid_transition',
        diagnostic: 'de PENDIENTE a ENTREGADO',
      })
      expect(JSON.stringify(state)).not.toContain('de PENDIENTE a ENTREGADO')
      expect(state.message).toBe(errorMessage('invalid_transition'))
    })

    it('las claves del estado estan contenidas en los cuatro campos declarados', () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, vi.fn())

      for (const state of [
        toErrorState(new TransicionInvalidaError('de PENDIENTE a ENTREGADO')),
        toErrorState(new SinPermisoError()),
        toErrorState(new Error('ajeno')),
      ]) {
        for (const clave of Object.keys(state)) {
          expect(CAMPOS_DECLARADOS, `campo no declarado en el estado: ${clave}`).toContain(clave)
        }
        expect(Object.keys(state)).not.toContain('diagnostic')
      }
    })
  })
})
