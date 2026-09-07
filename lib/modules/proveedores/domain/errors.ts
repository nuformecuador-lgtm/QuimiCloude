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

/**
 * Falta de permiso (QC-74 R14, R15): actor ausente, sin conjunto de permisos, con el
 * conjunto vacio o sin el codigo que el caso de uso exige. Subclase de `ProveedoresError`
 * con el `code` estable de siempre, que es lo que hace que los adaptadores driving la
 * sigan serializando con `error instanceof ProveedoresError`.
 */
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

/**
 * R15, R24: el proveedor ya tiene una linea VIVA con ese nombre normalizado y esa
 * presentacion.
 *
 * QC-52 le cambia la DEFINICION -antes era la pareja del proveedor con el articulo del
 * inventario, ahora es `(supplier_id, name_normalized, presentation_id)`- pero NO el nombre
 * ni el `code`
 * (`design.md > 6.1`): el caso sigue existiendo, solo cambia la clave que lo dispara.
 * Renombrarlo obligaria a QC-44 a conocer dos codigos para lo mismo, que es exactamente lo
 * que R32 prohibe. Mismo criterio con el que QC-43 conservo `suppliers_contact_required` al
 * cambiarle la definicion.
 */
export class DuplicateCatalogLineError extends ProveedoresError {
  readonly code = 'duplicate_catalog_line';

  constructor(message = 'Ese proveedor ya tiene una linea con ese nombre y esa presentacion.') {
    super(message);
  }
}

// QC-52 borro la clase de error de «articulo del inventario no encontrado» y su `code`
// (R32, decision cerrada 7). NO se conserva «por compatibilidad»: la linea ya no guarda
// ninguna referencia a ese modulo, asi que el caso no puede ocurrir, y un codigo de error
// que nadie puede provocar es una rama muerta que el proximo lector cree viva. Que la
// presentacion o la unidad no existan es `ValidationError` -lo traduce el adaptador desde
// el `P2003` de la FK (`design.md > 6.2`)-, no un codigo nuevo.

/** R41: la entrada no pasa el esquema `zod` del borde. */
export class ValidationError extends ProveedoresError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}
