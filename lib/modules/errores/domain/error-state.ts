import { errorMessage } from './error-message'
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from './error-codes'
import { newRequestId } from '@/lib/modules/observabilidad'

/**
 * QC-70 (R11, R13, R15, R29) + QC-71 (R13, R14, R15, R16) — LO UNICO que cruza al navegador.
 *
 * **Por que es una UNION y no un objeto con un campo opcional.** QC-70 dejo el hueco del
 * identificador como `reference?: string`, y la leccion que quedo escrita en
 * `progress/history.md > QC-70` es literal: **«la defensa contra un renombrado no es la
 * disciplina, es el tipo cerrado»**. Un opcional deja pasar los dos errores que importan:
 * olvidar el identificador en el error inesperado —la pantalla se queda sin nada que citar al
 * reportar el fallo— y colarlo en uno catalogado —un dato interno viajando en respuestas que no
 * lo necesitan (R15)—. Ninguno de los dos lo caza una revision; los dos los caza el compilador
 * si el campo vive en su rama y solo en ella.
 *
 * Por eso `reference` es OBLIGATORIO en la rama del codigo generico e INEXPRESABLE en las
 * catalogadas. Construir un inesperado sin `reference`, o un catalogado con el, **no compila**
 * (R16); las dos formas prohibidas estan escritas, con su `@ts-expect-error`, en
 * `tests/unit/observabilidad/error-state-types.test-d.ts`.
 *
 * La lista de campos sigue siendo CERRADA: si crece, la guardia del catalogo
 * (`guard-catalogo-de-errores.test.ts`, caso 8) se pone roja, porque crecer es exactamente el
 * fallo del que protege (R30). Esa guardia comprueba ademas que `reference` aparece SOLO en la
 * rama del generico y que NO es opcional.
 */
export type ErrorState =
  | { status: 'error'; code: Exclude<ErrorCode, typeof UNEXPECTED_ERROR_CODE>; message: string }
  | { status: 'error'; code: typeof UNEXPECTED_ERROR_CODE; message: string; reference: string }

/**
 * Lo minimo que el traductor necesita saber de un error de dominio: su codigo y, si lo tiene,
 * el dato variable que ayuda a diagnosticarlo (R28). El traductor NO mira el texto del error
 * (R11): el mensaje sale siempre del catalogo.
 */
type DomainError = { code: ErrorCode; diagnostic?: string }

/** La clase base de la familia de un modulo (`PedidosError`, `UnidadesError`...). */
type DomainErrorClass = abstract new (...args: never[]) => DomainError

/**
 * De donde salio el identificador de la peticion (QC-71 R8).
 *
 * `borde` = lo genero el middleware y viajo en la cabecera. `respaldo` = la cabecera no llego y
 * el traductor tuvo que generarlo. **La segunda es la senal de campo del diseno**
 * (`design.md > 3.3`): si el cruce borde -> accion se rompe, cada linea del log lo dice, en vez
 * de fallar en silencio.
 */
export type RequestIdOrigin = 'borde' | 'respaldo'

/**
 * Lee la cabecera `x-request-id` de la peticion en curso, o `null` si no viaja.
 *
 * **Es un parametro, no un puerto** (QC-71 R9, decision 3 de T1 en la bitacora): el dominio no
 * puede importar `next/*`, y declarar un puerto para una sola funcion de una linea es el
 * precedente que QC-57 dejo por escrito —`ListQueryLog` acabo declarado cinco veces para una
 * unica implementacion—. La implementacion vive en
 * `lib/modules/observabilidad/adapters/driven/request-id-headers.ts` y la ata
 * `lib/composition/index.ts`, que es el unico sitio del repo que puede atarla.
 */
export type RequestIdHeaderReader = () => Promise<string | null>

/**
 * Lo que se escribe en el REGISTRO DEL SERVIDOR. No es `ErrorState`, no se devuelve nunca y
 * no se serializa hacia el navegador (R14, R29).
 *
 * Son dos formas, y no una con campos opcionales, porque son dos sucesos distintos:
 * - el error CATALOGADO con diagnostico (QC-70 R28), que sigue exactamente igual;
 * - el error INESPERADO (QC-71 R10), que arrastra el identificador y su origen para que la
 *   linea pueda decir cual buscar en los registros.
 */
export type ErrorLogEntry =
  | { code: ErrorCode; diagnostic: string }
  | {
      code: typeof UNEXPECTED_ERROR_CODE
      cause: unknown
      requestId: string
      origin: RequestIdOrigin
    }

/**
 * El detalle del error que SI puede salir por el log: nombre, mensaje y traza, y nada mas
 * (QC-71 R12). Un valor lanzado que no sea `Error` no se imprime: `String(valor)` podria ser el
 * cuerpo de un formulario o una URL con el texto que alguien busco, y
 * `docs/architecture.md > Anti-patrones` prohibe registrar eso.
 */
function detalleDelError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? '' }
  }
  return { name: 'NoError', message: `se lanzo un valor de tipo ${typeof error}`, stack: '' }
}

/**
 * La UNICA linea de log de QC-71 (R10, R12), con el formato exacto de `design.md > 5`:
 *
 *     [error] requestId=<uuid> origen=borde|respaldo code=<codigo> error=<name>: <message>
 *     <stack>
 *
 * Campos `clave=valor` para poder buscar por `requestId=` en los registros de Vercel. NO lleva
 * la URL con sus parametros, ni el cuerpo del formulario, ni ningun valor introducido por quien
 * usa la aplicacion (R12): las rutas de este ERP llevan identificadores de pedido y de proveedor
 * y a veces el texto buscado.
 */
function formatearLinea(entry: {
  code: ErrorCode
  requestId: string
  origin: RequestIdOrigin
  cause: unknown
}): string {
  const detalle = detalleDelError(entry.cause)
  const cabecera = `[error] requestId=${entry.requestId} origen=${entry.origin} code=${entry.code} error=${detalle.name}: ${detalle.message}`
  return detalle.stack === '' ? cabecera : `${cabecera}\n${detalle.stack}`
}

/**
 * El sumidero por defecto del registro. **Un solo `console.error` por invocacion** (R10): el
 * error inesperado sale como la linea de `design.md > 5`, y el catalogado con diagnostico
 * conserva intacta la forma que dejo QC-70 (R28) —esa linea no es de QC-71, no gana
 * identificador y no cambia—.
 */
function escribirEnElRegistro(entry: ErrorLogEntry): void {
  console.error('requestId' in entry ? formatearLinea(entry) : entry)
}

/**
 * QC-70 (R10) + QC-71 (R7, R8, R10-R15) — la UNICA implementacion del traductor de error de
 * dominio a estado serializable. Los siete adaptadores driving la usan y ninguno define la
 * suya; la guardia del catalogo (caso 2) da rojo si vuelve a aparecer una copia.
 *
 * Es una fabrica parametrizada por la clase base, el mismo patron con el que QC-54 parametriza
 * `requireAdmin` por el `UnauthorizedError` de cada modulo: una sola implementacion sin que el
 * codigo compartido tenga que conocer —ni poder conocer— los cinco modulos.
 *
 * **Devuelve una funcion `async`** (QC-71, decision 2 de T1): leer la cabecera de la peticion en
 * curso es asincrono en Next 16, y no hay forma de evitarlo. Los `return toErrorState(error)` de
 * los siete adaptadores estan dentro de funciones `async`, asi que no cambian.
 *
 * `log` sigue siendo un parametro con valor por defecto, para que el test pueda espiarlo sin
 * tocar `console`.
 */
export function createErrorStateTranslator(
  base: DomainErrorClass,
  readRequestIdHeader: RequestIdHeaderReader,
  log: (entry: ErrorLogEntry) => void = escribirEnElRegistro,
): (error: unknown) => Promise<ErrorState> {
  return async (error: unknown): Promise<ErrorState> => {
    if (error instanceof base) {
      if (error.diagnostic !== undefined) {
        // El diagnostico va al LOG y solo al log (R28, R29). QC-71 NO toca esta linea: no
        // resuelve identificador, no lo lleva, y el camino catalogado no escribe ninguna linea
        // suya (QC-71 R11, decision 5 de T1 en la bitacora).
        log({ code: error.code, diagnostic: error.diagnostic })
      }
      // Construccion CAMPO A CAMPO, deliberadamente. Nada de `...error` ni `Object.assign`:
      // un spread arrastraria el diagnostico —y manana cualquier campo nuevo del error— hasta
      // el navegador sin que ningun tipo lo delatara, que es justo lo que R29 prohibe. La
      // guardia del catalogo (caso 9) da rojo si esto se "simplifica" a un spread.
      //
      // El estrechamiento de `code` es lo que hace cierto R15 sin depender de la disciplina:
      // si el codigo del error de dominio fuera el generico, esta rama no compilaria sin
      // `reference`, asi que ese caso cae —a proposito— al camino de abajo, que si lo tiene.
      const code = error.code
      if (code !== UNEXPECTED_ERROR_CODE) {
        return { status: 'error', code, message: errorMessage(code) }
      }
    }
    // Error ajeno a la familia: el detalle real —traza, SQL, nombres de tabla— va al registro
    // del servidor, que es el unico sitio donde aparece (R14).
    //
    // El identificador se resuelve AQUI y solo aqui (R7): el camino feliz y el catalogado no
    // leen ninguna cabecera y no escriben nada (R11). Si la cabecera no llego —o llego vacia—
    // se genera uno de respaldo y la linea lo dice (R8).
    const cabecera = await readRequestIdHeader()
    const desdeElBorde = cabecera !== null && cabecera !== ''
    const requestId = desdeElBorde ? cabecera : newRequestId()
    const origin: RequestIdOrigin = desdeElBorde ? 'borde' : 'respaldo'
    log({ code: UNEXPECTED_ERROR_CODE, cause: error, requestId, origin })
    // Campo a campo, igual que arriba. `reference` es EXACTAMENTE el mismo uuid que acaba de
    // escribirse en la linea (R13): es lo que permite que quien reporta el fallo diga cual
    // buscar. Del error, al navegador no va nada mas (R14).
    return {
      status: 'error',
      code: UNEXPECTED_ERROR_CODE,
      message: errorMessage(UNEXPECTED_ERROR_CODE),
      reference: requestId,
    }
  }
}
