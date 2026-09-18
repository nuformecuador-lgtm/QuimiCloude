/**
 * Errores del dominio `documentos`.
 *
 * Todas derivan de `DocumentosError` con un `code` ESTABLE del catalogo cerrado de
 * `@/lib/modules/errores`, para que un adaptador driving las traduzca con UN SOLO
 * `instanceof DocumentosError` y decida por el `code` y NUNCA por el texto: el mensaje puede
 * cambiar de idioma sin romper a quien lo muestra.
 *
 * `unauthorized` e `invalid_input` ya existen y significan aqui exactamente lo mismo que donde ya
 * viven: mismo caso, mismo codigo, misma frase. `ai_unavailable` es el unico codigo que este
 * modulo aporta al catalogo.
 *
 * El `code` es un `ErrorCode` —uno mal escrito no compila— y el MENSAJE SALE DEL CATALOGO, no del
 * sitio que lanza. Por eso ninguna clase admite un `message` por parametro.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no soporta
 * nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja de funcionar sin
 * este ajuste. Mismo patron que el resto de los modulos.
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class DocumentosError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * El dato variable que ayuda a DIAGNOSTICAR el fallo —una operacion, una ruta—. Va al registro
   * del servidor y NUNCA al navegador: no esta en `ErrorState`.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Actor ausente, sin conjunto de permisos, con el conjunto vacio, con un valor que no es una lista
 * o sin el codigo exigido. Los cinco casos dan ESTE error, sin revelar si el archivo pedido existe.
 */
export class UnauthorizedError extends DocumentosError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * La entrada no pasa el esquema del borde —tanda vacia, tanda por encima del tope, nombre en
 * blanco— o el contenido no es el que dice ser. Se lanza SIN tocar ningun puerto.
 */
export class ValidationError extends DocumentosError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}

/**
 * La entrada era correcta y no hay bug en este modulo: lo que fallo es que el proveedor de IA no
 * respondio, no estaba disponible o agoto el plazo. Con `unexpected` la pantalla invitaria a
 * reportar un bug, y el registro no podria distinguir un corte del proveedor de un fallo propio.
 */
export class AiUnavailableError extends DocumentosError {
  readonly code = 'ai_unavailable';

  constructor(diagnostic?: string) {
    super('ai_unavailable', diagnostic);
  }
}

/**
 * No es una entrada invalida ni un corte del proveedor: algo propio de este modulo reviento antes
 * de llegar a hablar con la IA —el convertidor de PDF, por ejemplo—. Deliberadamente sin publicar
 * por el barril: nada fuera de este modulo lo distingue por su clase, solo por el `code`.
 */
export class UnexpectedError extends DocumentosError {
  readonly code = 'unexpected';

  constructor(diagnostic?: string) {
    super('unexpected', diagnostic);
  }
}
