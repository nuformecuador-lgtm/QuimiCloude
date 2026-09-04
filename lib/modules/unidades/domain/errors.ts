/**
 * Errores del dominio `unidades` (`design.md > 9`). Todas derivan de `UnidadesError` con
 * un `code` estable que el adaptador driving traduce a un estado serializable
 * `{ status: 'error', code, message }` (mismo patron que `RecetasError` de `recetas` y
 * `InventarioError` de `inventario`). Nada de `catch` vacios
 * (`docs/conventions.md > Manejo de errores`).
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja
 * de funcionar sin este ajuste.
 */
export abstract class UnidadesError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** R41: actor sin rol Administrador, o sin actor. */
export class UnauthorizedError extends UnidadesError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}
