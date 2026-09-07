/**
 * Errores del dominio `pedidos` (`design.md > 7.5`). Las nueve derivan de `PedidosError`
 * con un `code` ESTABLE que el adaptador driving traduce a
 * `{ status: 'error', code, message }` (R56). El adaptador decide por el `code`, NUNCA por
 * el texto: el mensaje puede cambiar de idioma sin romper a QC-35.
 *
 * Que `not_cancellable` y `not_deletable` sean distintos de `invalid_transition` no es
 * cosmetico: QC-35 tiene que poder decir tres frases distintas sin leer el mensaje.
 *
 * Nada de `catch` vacios (`docs/conventions.md`): un error se maneja o se propaga con
 * contexto, jamas se descarta.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no
 * soporta nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja
 * de funcionar sin este ajuste. Mismo patron que `inventario`, `recetas` y `proveedores`.
 */
export abstract class PedidosError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** R2, R3: actor ausente, o con rol nulo, vacio o distinto de `ROLE_ADMINISTRADOR`. */
export class UnauthorizedError extends PedidosError {
  readonly code = 'unauthorized';

  constructor(message = 'El actor no tiene permiso para realizar esta operacion.') {
    super(message);
  }
}

/** R33: el pedido no existe o ya esta borrado. Para el dominio son el mismo caso. */
export class NotFoundError extends PedidosError {
  readonly code = 'not_found';

  constructor(message = 'El pedido solicitado no existe.') {
    super(message);
  }
}

/**
 * R15: la receta esta ausente, no existe o esta dada de baja. Los tres casos comparten
 * `code` porque los tres significan lo mismo para quien pide el alta: esa receta no se
 * puede pedir. La distincion entre «no existe» y «esta de baja» si la conoce el caso de
 * uso, porque `RecipeRef` trae `isDeleted` (`design.md > 6.2`), y la necesita para R25.
 */
export class RecipeNotFoundError extends PedidosError {
  readonly code = 'recipe_not_found';

  constructor(message = 'La receta indicada no existe o esta dada de baja.') {
    super(message);
  }
}

/*
 * QC-35bis (2026-09-07): `UnitNotFoundError` (code `unit_not_found`) DESAPARECIO junto con la
 * unidad del pedido. No queda ningun caso de uso que pueda emitirlo, asi que dejar la clase
 * publicada seria ofrecer un codigo de error que nada produce -y que el traductor de la pantalla
 * tendria que seguir mapeando por si acaso-.
 */

/** R21, R22: la transicion de estado pedida no esta permitida, o se intenta editar un
 *  pedido final (`ENTREGADO` o `CANCELADO`), que no admite ninguna edicion. */
export class InvalidTransitionError extends PedidosError {
  readonly code = 'invalid_transition';

  constructor(message = 'El pedido no admite ese cambio de estado.') {
    super(message);
  }
}

/** R28: se intenta cancelar un pedido `ENTREGADO` o uno ya cancelado. */
export class NotCancellableError extends PedidosError {
  readonly code = 'not_cancellable';

  constructor(message = 'El pedido no se puede cancelar en su estado actual.') {
    super(message);
  }
}

/** R32: se intenta borrar un pedido `ENTREGADO` o `CANCELADO`. La base lo impide ademas
 *  con `orders_delivered_not_deleted`; esta clase es la mitad de aplicacion. */
export class NotDeletableError extends PedidosError {
  readonly code = 'not_deletable';

  constructor(message = 'El pedido no se puede borrar en su estado actual.') {
    super(message);
  }
}

/**
 * El `23505` del indice unico del correlativo, traducido (`design.md > 4.2`). En operacion
 * normal no ocurre —la secuencia por ano entrega posiciones distintas—; existe para que un
 * duplicado insertado por otra via no llegue como excepcion de Prisma sin traducir.
 */
export class DuplicateOrderNumberError extends PedidosError {
  readonly code = 'duplicate_number';

  constructor(message = 'Ya existe un pedido con ese numero correlativo.') {
    super(message);
  }
}

/** R17, R18, R19, R24, R27, R36: la entrada no pasa el esquema `zod` del borde. */
export class ValidationError extends PedidosError {
  readonly code = 'invalid_input';

  constructor(message = 'La entrada recibida no es valida.') {
    super(message);
  }
}
