/**
 * Errores del dominio `inventario` (`design.md > 6.4`). Todas derivan de
 * `InventarioError` con un `code` estable que el adaptador driving traduce a un estado
 * serializable `{ status: 'error', code, message }` (mismo patron que `LoginFormState`
 * de `identity`). Nada de `catch` vacios (`docs/conventions.md`).
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que
 * no soporta nativamente extender `Error`, rompe la cadena de prototipos y
 * `instanceof` deja de funcionar sin este ajuste.
 */
export abstract class InventarioError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** QC-74 (R14, R15): actor ausente, o sin el permiso exigido en su conjunto. */
export class UnauthorizedError extends InventarioError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}

/** R14: editar o borrar algo que no existe o ya esta borrado. */
export class NotFoundError extends InventarioError {
  readonly code = 'not_found';

  constructor(message = 'El recurso solicitado no existe.') {
    super(message);
  }
}

/** R18: nombre normalizado de presentacion ya usado por otra fila. */
export class DuplicateNameError extends InventarioError {
  readonly code = 'duplicate_name';

  constructor(message = 'Ya existe una presentacion con un nombre equivalente.') {
    super(message);
  }
}

/** R21: borrar una presentacion que todavia tiene productos asignados. */
export class PresentationInUseError extends InventarioError {
  readonly code = 'presentation_in_use';

  constructor(message = 'La presentacion tiene productos asignados y no se puede borrar.') {
    super(message);
  }
}

/** R9, R10, R11, R37: entrada que no cumple el esquema de validacion. */
export class ValidationError extends InventarioError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}
