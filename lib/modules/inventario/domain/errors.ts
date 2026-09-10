import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

/**
 * Errores del dominio `inventario` (`design.md > 6.4`). Todas derivan de
 * `InventarioError` con un `code` estable que el adaptador driving traduce a un estado
 * serializable `{ status: 'error', code, message }` (mismo patron que `LoginFormState`
 * de `identity`). Nada de `catch` vacios (`docs/conventions.md`).
 *
 * QC-70 (R6, R7): la familia se conserva, pero el MENSAJE ya no vive aqui. Sale del
 * catalogo unico (`@/lib/modules/errores`) a partir del codigo, y NINGUNA clase admite un
 * mensaje por parametro: poder sobreescribirlo dejaria la frase fuera del catalogo, que es
 * justo lo que la ficha centraliza. La guardia del catalogo da rojo si vuelve a aparecer un
 * parametro `message` (R24).
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que
 * no soporta nativamente extender `Error`, rompe la cadena de prototipos y
 * `instanceof` deja de funcionar sin este ajuste -y sin `instanceof` los dos adaptadores
 * driving dejarian de reconocer sus propios errores.
 */
export abstract class InventarioError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): dato variable que ayuda a diagnosticar. Va al LOG del servidor y
   * NUNCA al navegador; el traductor unico no lo copia al estado serializado.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code)); // R7: el mensaje NO se pasa desde el sitio que lanza.
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** QC-74 (R14, R15): actor ausente, o sin el permiso exigido en su conjunto. */
export class UnauthorizedError extends InventarioError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * R14: consultar, editar o borrar un producto que no existe o ya esta borrado.
 *
 * QC-70 (R17): antes era `NotFoundError`, compartido con la presentacion. Un codigo con UN
 * mensaje no puede decir a la vez «el producto» y «la presentacion», asi que el caso de
 * «no existe» se abre por recurso concreto.
 */
export class ProductNotFoundError extends InventarioError {
  readonly code = 'product_not_found';

  constructor(diagnostic?: string) {
    super('product_not_found', diagnostic);
  }
}

/** R14: renombrar o borrar una presentacion que no existe (QC-70 R17, ver arriba). */
export class PresentationNotFoundError extends InventarioError {
  readonly code = 'presentation_not_found';

  constructor(diagnostic?: string) {
    super('presentation_not_found', diagnostic);
  }
}

/**
 * R18: nombre normalizado de presentacion ya usado por otra fila.
 *
 * QC-70 (R18): antes era `DuplicateNameError`; el «nombre repetido» tambien se abre por
 * caso concreto, porque proveedor, receta y unidad dicen frases distintas.
 */
export class PresentationDuplicateNameError extends InventarioError {
  readonly code = 'presentation_duplicate_name';

  constructor(diagnostic?: string) {
    super('presentation_duplicate_name', diagnostic);
  }
}

/** R21: borrar una presentacion que todavia tiene productos asignados. */
export class PresentationInUseError extends InventarioError {
  readonly code = 'presentation_in_use';

  constructor(diagnostic?: string) {
    super('presentation_in_use', diagnostic);
  }
}

/** R9, R10, R11, R37: entrada que no cumple el esquema de validacion. */
export class ValidationError extends InventarioError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
