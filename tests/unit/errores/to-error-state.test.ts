// QC-70 T2 — el traductor unico de error de dominio a estado serializable (R11-R15, R28, R29).
//
// La familia de un modulo se representa aqui con una base SINTETICA (`ModuloDePruebaError`),
// no con una de las cinco reales: lo que se prueba es el traductor, y atarlo a `PedidosError`
// lo haria fallar por motivos que no son suyos. Que los siete adaptadores lo usen de verdad
// (R10) lo fija la guardia del catalogo, no este archivo.
//
// QC-71 (T7) adapta este archivo, sin relajar nada:
//   - la fabrica es ASINCRONA (lee la cabecera de la peticion en curso), asi que cada
//     `toErrorState(...)` pasa a `await toErrorState(...)`;
//   - la fabrica recibe la LECTURA de la cabecera como segundo parametro; aqui se le da un
//     doble que no trae ninguna (`sinCabecera`), que es el caso de respaldo de R8;
//   - CAMBIA de sentido un unico describe, el de «R15 — QC-70 no la rellena»: desde esta ficha
//     el camino INESPERADO si trae `reference` (QC-71 R13) y el CATALOGADO sigue sin ella
//     (QC-71 R15), que ahora ademas es inexpresable en el tipo (R16);
//   - y con el, la asercion del espia de log del camino inesperado: la entrada arrastra el
//     identificador y su origen, porque son justo lo que la linea de R10 tiene que decir. Lo
//     que NO cambia: que el error original llega entero al registro y a ningun campo del estado.
// El comportamiento del error CATALOGADO con diagnostico (R28, R29) se conserva intacto: esa
// linea es de QC-70, no gana identificador y no la toca esta ficha.

import { describe, expect, it, vi } from 'vitest'

import {
  createErrorStateTranslator,
  errorMessage,
  type ErrorCode,
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

/** La peticion no trae cabecera: el traductor usa el respaldo de QC-71 R8. */
const sinCabecera: RequestIdHeaderReader = async () => null

describe('createErrorStateTranslator (QC-70 T2)', () => {
  describe('R11 — error de la familia: codigo de la clase, mensaje del catalogo', () => {
    it('devuelve el estado con el codigo de la clase y el texto del catalogo', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())

      expect(await toErrorState(new SinPermisoError())).toEqual({
        status: 'error',
        code: 'unauthorized',
        message: 'El actor no tiene permiso para realizar esta operacion.',
      })
    })

    it('no decide por el texto del error: un mensaje manipulado no cambia el estado', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())
      const error = new SinPermisoError()
      error.message = 'texto manipulado que no debe salir'

      const state = await toErrorState(error)

      expect(state.message).toBe(errorMessage('unauthorized'))
      expect(JSON.stringify(state)).not.toContain('manipulado')
    })
  })

  describe('R12, R13 — error ajeno: codigo generico y mensaje neutro', () => {
    it('devuelve unexpected con su mensaje del catalogo para cualquier error de fuera', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())

      expect(await toErrorState(new Error('lo que sea'))).toEqual({
        status: 'error',
        code: 'unexpected',
        message: 'Ocurrio un error inesperado. Intentalo de nuevo.',
        // QC-71 R13: el identificador es parte del estado inesperado, y su ausencia ya no
        // compila. Aqui es el de respaldo, porque el doble no entrega cabecera.
        reference: expect.any(String) as unknown as string,
      })
      expect((await toErrorState('un string suelto')).code).toBe('unexpected')
      expect((await toErrorState(undefined)).code).toBe('unexpected')
    })

    it('ningun campo del estado filtra la traza, la tabla ni el SQL del error original', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())
      const ajeno = new Error('relation "orders" does not exist at line 42')

      const state = await toErrorState(ajeno)
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
    it('el espia de log recibe el error ajeno exactamente una vez', async () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, log)
      const ajeno = new Error('relation "orders" does not exist at line 42')

      const state = await toErrorState(ajeno)

      expect(log).toHaveBeenCalledTimes(1)
      // QC-71 (R10, R13): la entrada arrastra ademas el identificador —el MISMO que devuelve el
      // estado— y su origen, que es lo que la linea del registro tiene que decir. `cause` sigue
      // siendo el error original entero, que es lo que este caso fijaba y no se relaja.
      expect(log).toHaveBeenCalledWith({
        code: 'unexpected',
        cause: ajeno,
        requestId: state.code === 'unexpected' ? state.reference : '',
        origin: 'respaldo',
      })
    })

    it('un error de la familia sin diagnostico no escribe nada en el registro', async () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, log)

      await toErrorState(new SinPermisoError())

      expect(log).not.toHaveBeenCalled()
    })
  })

  describe('QC-71 R13, R15 — la referencia: obligatoria en el inesperado, ausente del catalogado', () => {
    // Este describe se llamaba «R15 — la referencia esta declarada, opcional, y QC-70 no la
    // rellena». QC-71 rellena el hueco: lo que cambia es que el camino INESPERADO ahora si trae
    // el identificador (R13). Lo que NO cambia, y es la mitad que este caso siempre protegio: el
    // camino CATALOGADO sigue sin ninguna referencia (R15), y desde esta ficha ni siquiera puede
    // tenerla, porque el tipo cerrado no la admite en esa rama (R16).
    it('el catalogado no la trae ni al serializar; el inesperado la trae y es su uuid', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())

      const deDominio = await toErrorState(new SinPermisoError())
      const ajeno = await toErrorState(new Error('cualquier cosa'))

      expect(Object.keys(deDominio)).not.toContain('reference')
      expect(JSON.stringify(deDominio)).not.toContain('reference')
      expect(ajeno.code).toBe('unexpected')
      expect(ajeno.code === 'unexpected' && ajeno.reference).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    })
  })

  describe('R28, R29 — el diagnostico va al log y NUNCA al estado', () => {
    it('el espia recibe el diagnostico y el estado serializado no lo contiene', async () => {
      const log = vi.fn()
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, log)

      const state = await toErrorState(new TransicionInvalidaError('de PENDIENTE a ENTREGADO'))

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith({
        code: 'invalid_transition',
        diagnostic: 'de PENDIENTE a ENTREGADO',
      })
      expect(JSON.stringify(state)).not.toContain('de PENDIENTE a ENTREGADO')
      expect(state.message).toBe(errorMessage('invalid_transition'))
    })

    it('las claves del estado estan contenidas en los cuatro campos declarados', async () => {
      const toErrorState = createErrorStateTranslator(ModuloDePruebaError, sinCabecera, vi.fn())

      for (const state of [
        await toErrorState(new TransicionInvalidaError('de PENDIENTE a ENTREGADO')),
        await toErrorState(new SinPermisoError()),
        await toErrorState(new Error('ajeno')),
      ]) {
        for (const clave of Object.keys(state)) {
          expect(CAMPOS_DECLARADOS, `campo no declarado en el estado: ${clave}`).toContain(clave)
        }
        expect(Object.keys(state)).not.toContain('diagnostic')
      }
    })
  })
})
