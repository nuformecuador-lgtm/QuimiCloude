/**
 * Errores del dominio `unidades` (`design.md > 9`). Todas derivan de `UnidadesError` con
 * un `code` estable que el adaptador driving traduce a un estado serializable
 * `{ status: 'error', code, message }` (mismo patron que `RecetasError` de `recetas` y
 * `InventarioError` de `inventario`). Nada de `catch` vacios
 * (`docs/conventions.md > Manejo de errores`).
 *
 * QC-70 (R6, R7, R8): el `code` ya NO es un `string` cualquiera sino un `ErrorCode` del
 * catalogo unico (`@/lib/modules/errores`), y el MENSAJE sale de ese catalogo a partir del
 * codigo. Ningun sitio que lanza puede pasar un texto: si pudiera, la frase volveria a vivir
 * en cinco archivos, que es justo lo que la ficha quita. El catalogo se importa por el BARREL
 * de otro modulo, que es lo unico que `domain/**` puede importar de fuera
 * (`docs/architecture.md > La regla de dependencias`).
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja
 * de funcionar sin este ajuste.
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class UnidadesError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): el dato variable que ayuda a diagnosticar —ids de unidad, el factor—.
   * Va al REGISTRO DEL SERVIDOR y solo ahi: no es el mensaje, no se muestra y el traductor
   * unico no lo copia al estado que cruza al navegador.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code)); // R7: el mensaje NO se pasa desde fuera.
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** QC-74 (R14, R15): actor sin el permiso exigido, sin conjunto de permisos, o sin actor. */
export class UnauthorizedError extends UnidadesError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
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

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
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

  constructor(diagnostic?: string) {
    super('incompatible_units', diagnostic);
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
 *
 * QC-70 (R17): se llamaba `NotFoundError` con el codigo generico `not_found`, que significaba
 * cinco cosas distintas segun quien lo lanzara. Ahora es `unit_not_found`, un codigo con UN
 * mensaje.
 */
export class UnitNotFoundError extends UnidadesError {
  readonly code = 'unit_not_found';

  constructor(diagnostic?: string) {
    super('unit_not_found', diagnostic);
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

  constructor(diagnostic?: string) {
    super('system_unit', diagnostic);
  }
}

/**
 * QC-38 (R11): el alta o la edicion chocan contra `units_company_name_unique` (o su
 * equivalente de sistema) por `name_normalized`. Se lanza al traducir el `'duplicate_name'`
 * que devuelve `UnitWriteRepository`, nunca desde un `SELECT` previo -entre un `SELECT` y un
 * `INSERT` cabe otra transaccion, asi que la garantia real es el indice unico.
 *
 * QC-70 (R18): se llamaba `DuplicateNameError` con el codigo generico `duplicate_name`, que
 * compartian cuatro modulos con mensajes distintos. Ahora es `unit_duplicate_name`. Ojo: el
 * `'duplicate_name'` que sigue apareciendo en `create-unit.ts` y `update-unit.ts` es el
 * RESULTADO DISCRIMINADO del puerto, no un codigo de error, y no se toca.
 */
export class UnitDuplicateNameError extends UnidadesError {
  readonly code = 'unit_duplicate_name';

  constructor(diagnostic?: string) {
    super('unit_duplicate_name', diagnostic);
  }
}

/**
 * QC-38 (R12): igual que `UnitDuplicateNameError` pero para `units_company_symbol_unique` (o su
 * equivalente de sistema), que es un indice **parcial** sobre `symbol IS NOT NULL` -por eso el
 * simbolo ausente nunca choca, y el vacio se rechaza antes en zod (R36).
 */
export class DuplicateSymbolError extends UnidadesError {
  readonly code = 'duplicate_symbol';

  constructor(diagnostic?: string) {
    super('duplicate_symbol', diagnostic);
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

  constructor(diagnostic?: string) {
    super('invalid_derivation', diagnostic);
  }
}

/**
 * QC-38 (R24): el borrado choca contra `ON DELETE RESTRICT` -de `products`, `recipe_lines` o de
 * otra `units` que deriva de esta-. No hay ningun conteo de uso previo en el caso de uso: la FK
 * es la garantia real y el adaptador traduce su violacion (`P2003`) a este error.
 */
export class UnitInUseError extends UnidadesError {
  readonly code = 'unit_in_use';

  constructor(diagnostic?: string) {
    super('unit_in_use', diagnostic);
  }
}
