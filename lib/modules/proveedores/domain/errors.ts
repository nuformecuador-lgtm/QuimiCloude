/**
 * Errores del dominio `proveedores` (`design.md > 6.4`). Todas derivan de
 * `ProveedoresError` con un `code` ESTABLE que el adaptador driving traduce a
 * `{ status: 'error', code, message }` (R43). El adaptador decide por el `code`, NUNCA
 * por el texto: el mensaje puede cambiar de idioma sin romper a QC-44.
 *
 * QC-70 (R6, R7, R8): el `code` deja de ser `string` y pasa a ser `ErrorCode`, la union
 * cerrada del catalogo -un codigo mal escrito ya no compila-, y el MENSAJE deja de poder
 * pasarse desde el sitio que lanza: sale siempre de `errorMessage(code)`. Poder
 * sobreescribirlo dejaba la frase fuera del catalogo, que es justo lo que la ficha
 * centraliza. El dato variable que ayuda a diagnosticar va en `diagnostic`, que se escribe
 * en el registro del servidor y NUNCA se serializa hacia el navegador (R28, R29).
 *
 * Nada de `catch` vacios (`docs/conventions.md`): un error se maneja o se propaga con
 * contexto, jamas se descarta.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof`
 * deja de funcionar sin este ajuste. Mismo patron que `inventario` y `recetas`.
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class ProveedoresError extends Error {
  abstract readonly code: ErrorCode;

  /** Dato variable para el LOG. Nunca se muestra y nunca se serializa (R28, R29). */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code)); // R7: el mensaje NO se pasa desde fuera.
    this.diagnostic = diagnostic;
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

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * R24: el proveedor no existe, o ya esta dado de baja.
 *
 * QC-70 (R17) parte el antiguo `NotFoundError` -que significaba a la vez «no existe el
 * proveedor» y «no existe la linea»- en dos clases con dos codigos y dos frases. Un codigo
 * con un solo mensaje no puede decir las dos cosas, y la pantalla de detalle necesitaba
 * distinguirlas: al alta de linea el `not_found` que le llegaba era SIEMPRE el del
 * proveedor, y a la edicion, el de la linea.
 */
export class SupplierNotFoundError extends ProveedoresError {
  readonly code = 'supplier_not_found';

  constructor(diagnostic?: string) {
    super('supplier_not_found', diagnostic);
  }
}

/** R24: la linea de catalogo no existe, o ya esta dada de baja (QC-70 R17). */
export class CatalogLineNotFoundError extends ProveedoresError {
  readonly code = 'catalog_line_not_found';

  constructor(diagnostic?: string) {
    super('catalog_line_not_found', diagnostic);
  }
}

/**
 * R15: el nombre normalizado ya lo usa otro proveedor VIVO.
 *
 * QC-70 (R18) lo renombra desde `DuplicateNameError` / `duplicate_name`: ese codigo
 * significaba cuatro cosas distintas repartidas por cuatro modulos, y cada una necesitaba
 * su propia frase.
 */
export class SupplierDuplicateNameError extends ProveedoresError {
  readonly code = 'supplier_duplicate_name';

  constructor(diagnostic?: string) {
    super('supplier_duplicate_name', diagnostic);
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
 * cambiarle la definicion. QC-70 tampoco lo toca: su codigo ya es inequivoco (R19).
 */
export class DuplicateCatalogLineError extends ProveedoresError {
  readonly code = 'duplicate_catalog_line';

  constructor(diagnostic?: string) {
    super('duplicate_catalog_line', diagnostic);
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

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
