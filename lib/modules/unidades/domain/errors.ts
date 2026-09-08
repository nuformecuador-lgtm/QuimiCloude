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

/**
 * QC-38 (R22, R26): la unidad no existe, o existe pero es de **otra empresa**.
 *
 * «De otra empresa» se responde con este error y NO con `UnauthorizedError`
 * (`design.md > 4`): distinguir «no existe» de «existe pero no es tuya» le daria a un
 * actor de la empresa A un oraculo de existencia sobre datos de la empresa B. `unauthorized`
 * queda SOLO para cuando falta el permiso `unidades.modificar` (R3), nunca para el ambito de
 * los datos.
 */
export class NotFoundError extends UnidadesError {
  readonly code = 'not_found';

  constructor(message = 'La unidad no existe.') {
    super(message);
  }
}

/**
 * QC-38 (R21, R25): se intenta editar o borrar una unidad **de sistema**
 * (`company_id IS NULL`). Se lanza en el service, tras `findOwnership`: ninguna
 * restriccion de la base ni ninguna policy de RLS lo impide
 * (`docs/architecture.md > Acceso a datos y autorizacion`), asi que la frontera real es esta
 * comprobacion, no la tabla.
 */
export class SystemUnitError extends UnidadesError {
  readonly code = 'system_unit';

  constructor(message = 'Las unidades de sistema no se pueden editar ni borrar.') {
    super(message);
  }
}

/**
 * QC-38 (R11): el alta o la edicion chocan contra `units_company_name_unique` (o su
 * equivalente de sistema) por `name_normalized`. Se lanza al traducir el `'duplicate_name'`
 * que devuelve `UnitWriteRepository`, nunca desde un `SELECT` previo -entre un `SELECT` y un
 * `INSERT` cabe otra transaccion, asi que la garantia real es el indice unico.
 */
export class DuplicateNameError extends UnidadesError {
  readonly code = 'duplicate_name';

  constructor(message = 'Ya existe una unidad con ese nombre.') {
    super(message);
  }
}

/**
 * QC-38 (R12): igual que `DuplicateNameError` pero para `units_company_symbol_unique` (o su
 * equivalente de sistema), que es un indice **parcial** sobre `symbol IS NOT NULL` -por eso el
 * simbolo ausente nunca choca, y el vacio se rechaza antes en zod (R36).
 */
export class DuplicateSymbolError extends UnidadesError {
  readonly code = 'duplicate_symbol';

  constructor(message = 'Ya existe una unidad con ese simbolo.') {
    super(message);
  }
}

/**
 * QC-38 (R15, R16): la unidad base declarada no existe, deriva a su vez (mas de un nivel),
 * es la propia unidad que se esta editando, o es de otra empresa. Las cuatro condiciones se
 * validan en el service con dos lecturas de `findOwnership`, no en el disparador de la base
 * (`units_check_derivation` queda como defensa en profundidad: un `RAISE EXCEPTION` de plpgsql
 * solo es discriminable por texto, y `docs/conventions.md > Manejo de errores` lo prohibe).
 */
export class InvalidDerivationError extends UnidadesError {
  readonly code = 'invalid_derivation';

  constructor(message = 'La unidad base declarada no es valida.') {
    super(message);
  }
}

/**
 * QC-38 (R24): el borrado choca contra `ON DELETE RESTRICT` -de `products`, `recipe_lines` o de
 * otra `units` que deriva de esta-. No hay ningun conteo de uso previo en el caso de uso: la FK
 * es la garantia real y el adaptador traduce su violacion (`P2003`) a este error.
 */
export class UnitInUseError extends UnidadesError {
  readonly code = 'unit_in_use';

  constructor(message = 'La unidad esta en uso y no se puede borrar.') {
    super(message);
  }
}
