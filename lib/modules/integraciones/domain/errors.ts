import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class IntegracionesError extends Error {
  abstract readonly code: ErrorCode;

  /** Solo para el log del servidor: nunca lleva el texto en claro, una clave ni el valor guardado. */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    // Sin esto, al compilar a un target que no extiende `Error` de forma nativa, `instanceof` falla.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Un solo error para cualquier fallo al descifrar: forma, versión, tag o contexto. Para quien lo
 * recibe la acción es siempre la misma, volver a escribir el secreto.
 */
export class SecretUnreadableError extends IntegracionesError {
  readonly code = 'integration_secret_unreadable';

  constructor(diagnostic?: string) {
    super('integration_secret_unreadable', diagnostic);
  }
}

export class ValidationError extends IntegracionesError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
