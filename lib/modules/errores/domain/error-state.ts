import { errorMessage } from './error-message'
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from './error-codes'

/**
 * QC-70 (R11, R13, R15, R29) — LO UNICO que cruza al navegador.
 *
 * La lista de campos es CERRADA. Si crece, la guardia del catalogo (`design.md > 5`, caso 8)
 * se pone roja, porque crecer es exactamente el fallo del que protege (R30): el dia que
 * alguien anada `diagnostic` aqui, el dato variable —ids, estados, factores, el mensaje de
 * Prisma— empieza a viajar al cliente sin que nadie lo note.
 */
export type ErrorState = {
  status: 'error'
  code: ErrorCode
  message: string
  /** Hueco de QC-71: el identificador de peticion. QC-70 NUNCA lo rellena (R15). */
  reference?: string
}

/**
 * Lo minimo que el traductor necesita saber de un error de dominio: su codigo y, si lo tiene,
 * el dato variable que ayuda a diagnosticarlo (R28). El traductor NO mira el texto del error
 * (R11): el mensaje sale siempre del catalogo.
 */
type DomainError = { code: ErrorCode; diagnostic?: string }

/** La clase base de la familia de un modulo (`PedidosError`, `UnidadesError`...). */
type DomainErrorClass = abstract new (...args: never[]) => DomainError

/**
 * Lo que se escribe en el REGISTRO DEL SERVIDOR. No es `ErrorState`, no se devuelve nunca y
 * no se serializa hacia el navegador (R14, R29). QC-71 decidira su formato y le anadira el
 * identificador de peticion; QC-70 solo deja por donde pasa.
 */
export type ErrorLogEntry = { code: ErrorCode; diagnostic?: string; cause?: unknown }

/**
 * QC-70 (R10) — la UNICA implementacion del traductor de error de dominio a estado
 * serializable. Los siete adaptadores driving la usan y ninguno define la suya; la guardia
 * del catalogo (caso 2) da rojo si vuelve a aparecer una copia.
 *
 * Es una fabrica parametrizada por la clase base, el mismo patron con el que QC-54 parametriza
 * `requireAdmin` por el `UnauthorizedError` de cada modulo: una sola implementacion sin que el
 * codigo compartido tenga que conocer —ni poder conocer— los cinco modulos.
 *
 * `log` es un parametro con valor por defecto para que el test pueda espiarlo sin tocar
 * `console`. QC-71 lo sustituira por lo que decida esa ficha.
 */
export function createErrorStateTranslator(
  base: DomainErrorClass,
  log: (entry: ErrorLogEntry) => void = (entry) => {
    console.error(entry)
  },
): (error: unknown) => ErrorState {
  return (error: unknown): ErrorState => {
    if (error instanceof base) {
      if (error.diagnostic !== undefined) {
        // El diagnostico va al LOG y solo al log (R28, R29).
        log({ code: error.code, diagnostic: error.diagnostic })
      }
      // Construccion CAMPO A CAMPO, deliberadamente. Nada de `...error` ni `Object.assign`:
      // un spread arrastraria el diagnostico —y manana cualquier campo nuevo del error— hasta
      // el navegador sin que ningun tipo lo delatara, que es justo lo que R29 prohibe. La
      // guardia del catalogo (caso 9) da rojo si esto se "simplifica" a un spread.
      return { status: 'error', code: error.code, message: errorMessage(error.code) }
    }
    // Error ajeno a la familia: el detalle real —traza, SQL, nombres de tabla— va al registro
    // del servidor, que es el unico sitio donde aparece (R14).
    log({ code: UNEXPECTED_ERROR_CODE, cause: error })
    return {
      status: 'error',
      code: UNEXPECTED_ERROR_CODE,
      message: errorMessage(UNEXPECTED_ERROR_CODE),
    }
  }
}
