/**
 * Errores del dominio `recetas` (`design.md > 3`). Todas derivan de `RecetasError` con un
 * `code` estable que el adaptador driving traduce a un estado serializable
 * `{ status: 'error', code, message }` (mismo patron que `LoginFormState` de `identity` y
 * que `InventarioError` de `inventario`). Nada de `catch` vacios
 * (`docs/conventions.md > Manejo de errores`).
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja
 * de funcionar sin este ajuste.
 */
export abstract class RecetasError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** R2, R3: actor sin rol Administrador, o sin actor. */
export class UnauthorizedError extends RecetasError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}

/** R37: consultar, editar o borrar una receta que no existe o que ya esta borrada. */
export class NotFoundError extends RecetasError {
  readonly code = 'not_found';

  constructor(message = 'La receta solicitada no existe.') {
    super(message);
  }
}

/** R8, R10: nombre normalizado ya usado por otra receta viva. */
export class DuplicateNameError extends RecetasError {
  readonly code = 'duplicate_name';

  constructor(message = 'Ya existe una receta con un nombre equivalente.') {
    super(message);
  }
}

/**
 * Entrada que no cumple el esquema de validacion o una regla de negocio previa al
 * repositorio (R7, R9, R14, R16, R17, R19, R20, R23, R30, R46).
 */
export class ValidationError extends RecetasError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}
