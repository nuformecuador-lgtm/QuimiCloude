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

/** QC-74 (R14, R15): actor sin el permiso exigido, sin conjunto de permisos, o sin actor. */
export class UnauthorizedError extends UnidadesError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}

/**
 * QC-57 (R30): la entrada del contrato de consulta no cumple la FORMA -una pagina 0, un `kind`
 * de filtro que no es ninguno de los cuatro, una propiedad de mas-. Un campo NO DECLARADO es
 * otra cosa y NO llega aqui: se omite sin fallar y se anota en el log (R5, R6).
 *
 * Mismo `code` estable que `ValidationError` de `recetas` y de `inventario`: la traduccion a
 * `{ status: 'error', code, message }` la hace el adaptador driving, con el codigo y nunca con
 * el texto.
 */
export class ValidationError extends UnidadesError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}

/**
 * QC-76 (R24): se pide convertir una cantidad entre dos unidades que NO comparten unidad base
 * —litros a gramos—. Es un error de dominio DISTINGUIBLE del resto por su `code`, y no una
 * `ValidationError`: la entrada tiene la forma correcta y los dos factores son validos; lo que
 * no existe es la equivalencia. Quien la reciba puede decirlo con esas palabras al usuario en
 * vez de con un «entrada invalida» generico.
 */
export class IncompatibleUnitsError extends UnidadesError {
  readonly code = 'incompatible_units';

  constructor(message = 'Las dos unidades no comparten unidad base: no son convertibles.') {
    super(message);
  }
}
