/**
 * Errores del dominio `clientes`. Todas derivan de `ClientesError` con un `code` estable que
 * el adaptador driving traduce a `{ status: 'error', code, message }`. El adaptador decide por
 * el `code`, nunca por el texto.
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class ClientesError extends Error {
  abstract readonly code: ErrorCode;

  /** Dato variable para el log. Nunca se muestra y nunca se serializa. */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends ClientesError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/** El cliente no existe, ya esta dado de baja, o es de otra empresa. */
export class CustomerNotFoundError extends ClientesError {
  readonly code = 'customer_not_found';

  constructor(diagnostic?: string) {
    super('customer_not_found', diagnostic);
  }
}

/** La entrada no pasa el esquema `zod` del borde. */
export class ValidationError extends ClientesError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
