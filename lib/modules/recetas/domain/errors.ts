import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

/**
 * Errores del dominio `recetas` (`design.md > 3`). Todas derivan de `RecetasError` con un
 * `code` estable que el adaptador driving traduce a un estado serializable
 * `{ status: 'error', code, message }` (mismo patron que `LoginFormState` de `identity` y
 * que `InventarioError` de `inventario`). Nada de `catch` vacios
 * (`docs/conventions.md > Manejo de errores`).
 *
 * QC-70 (R6, R7): la familia se conserva, pero el mensaje YA NO se pasa desde el sitio que
 * lanza: sale del catalogo unico a partir del codigo. Por eso el constructor recibe el
 * `code` -y opcionalmente un diagnostico- y nunca un `message`; la guardia del catalogo
 * (caso 3) da rojo si alguien vuelve a admitirlo.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja
 * de funcionar sin este ajuste.
 */
export abstract class RecetasError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): dato variable que ayuda a diagnosticar el error. Va al LOG del
   * servidor y NUNCA al navegador: el traductor unico no lo serializa.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** QC-74 (R14, R15): actor ausente, o sin el permiso exigido en su conjunto. */
export class UnauthorizedError extends RecetasError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * R37: consultar, editar o borrar una receta que no existe o que ya esta borrada.
 *
 * QC-70: antes `NotFoundError`. Su codigo `recipe_not_found` y su texto son los MISMOS que
 * emite `pedidos` al referenciar una receta que no se puede usar (`design.md > 3`, nota de
 * la entrada 9): los dos casos dicen lo mismo al usuario, asi que son una sola entrada.
 */
export class RecipeNotFoundError extends RecetasError {
  readonly code = 'recipe_not_found';

  constructor(diagnostic?: string) {
    super('recipe_not_found', diagnostic);
  }
}

/** R8, R10: nombre normalizado ya usado por otra receta viva. QC-70: antes `DuplicateNameError`. */
export class RecipeDuplicateNameError extends RecetasError {
  readonly code = 'recipe_duplicate_name';

  constructor(diagnostic?: string) {
    super('recipe_duplicate_name', diagnostic);
  }
}

/** QC-150 (R29): una linea de la receta senala un producto terminado, que no puede ser
 *  ingrediente. Entrada con forma valida; lo que se rechaza es la accion. */
export class ActionNotAllowedError extends RecetasError {
  readonly code = 'action_not_allowed';

  constructor(diagnostic?: string) {
    super('action_not_allowed', diagnostic);
  }
}

/**
 * Entrada que no cumple el esquema de validacion o una regla de negocio previa al
 * repositorio (R7, R9, R14, R16, R17, R19, R20, R23, R30, R46).
 */
export class ValidationError extends RecetasError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
