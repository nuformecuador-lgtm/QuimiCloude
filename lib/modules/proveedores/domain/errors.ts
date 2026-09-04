/**
 * Errores del dominio `proveedores` (`design.md > 6.4`). Todas derivan de
 * `ProveedoresError` con un `code` ESTABLE que el adaptador driving traduce a
 * `{ status: 'error', code, message }` (R43). El adaptador decide por el `code`, NUNCA
 * por el texto: el mensaje puede cambiar de idioma sin romper a QC-44.
 *
 * Nada de `catch` vacios (`docs/conventions.md`): un error se maneja o se propaga con
 * contexto, jamas se descarta.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof`
 * deja de funcionar sin este ajuste. Mismo patron que `inventario` y `recetas`.
 */
export abstract class ProveedoresError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** R2, R3: actor ausente, o con rol nulo, vacio o distinto de `ROLE_ADMINISTRADOR`. */
export class UnauthorizedError extends ProveedoresError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}

/** R24: proveedor o linea inexistente, o proveedor ya dado de baja. */
export class NotFoundError extends ProveedoresError {
  readonly code = 'not_found';

  constructor(message = 'El recurso solicitado no existe.') {
    super(message);
  }
}

/** R15: el nombre normalizado ya lo usa otro proveedor VIVO. */
export class DuplicateNameError extends ProveedoresError {
  readonly code = 'duplicate_name';

  constructor(message = 'Ya existe un proveedor con un nombre equivalente.') {
    super(message);
  }
}

/** R27: la pareja proveedor-producto ya tiene linea en el catalogo. */
export class DuplicateCatalogLineError extends ProveedoresError {
  readonly code = 'duplicate_catalog_line';

  constructor(message = 'Ese producto ya esta en el catalogo de este proveedor.') {
    super(message);
  }
}

/**
 * R26: el producto no existe o esta dado de baja. Para este modulo son EL MISMO CASO:
 * `ProductCatalog.findRefs` solo devuelve productos vivos (`design.md > 5.3`).
 */
export class ProductNotFoundError extends ProveedoresError {
  readonly code = 'product_not_found';

  constructor(message = 'El producto indicado no existe o esta dado de baja.') {
    super(message);
  }
}

/** R41: la entrada no pasa el esquema `zod` del borde. */
export class ValidationError extends ProveedoresError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}
