/**
 * Errores del dominio `pedidos` (`design.md > 7.5`). Las ocho derivan de `PedidosError`
 * con un `code` ESTABLE que el adaptador driving traduce a
 * `{ status: 'error', code, message }` (R56). El adaptador decide por el `code`, NUNCA por
 * el texto: el mensaje puede cambiar de idioma sin romper a QC-35.
 *
 * QC-70 (R7, R8): el `code` es un `ErrorCode` del catalogo cerrado —uno mal escrito no
 * compila— y el MENSAJE SALE DEL CATALOGO, no del sitio que lanza. Por eso ninguna clase
 * admite ya un `message` por parametro: si se pudiera pasar, la frase volveria a vivir en
 * cinco sitios, que es justo lo que esta ficha quita. Lo vigila la guardia del catalogo.
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
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class PedidosError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): el dato variable que ayuda a DIAGNOSTICAR el fallo —los dos estados de
   * una transicion, un identificador—. Va al registro del servidor y NUNCA al navegador: no
   * esta en `ErrorState` y el traductor unico lo construye campo a campo.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    // R7: el mensaje se resuelve aqui, desde el catalogo. No entra por parametro.
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** QC-74 (R14, R15): actor ausente, sin conjunto de permisos, o sin el permiso exigido en el. */
export class UnauthorizedError extends PedidosError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/**
 * R33: el pedido no existe o ya esta borrado. Para el dominio son el mismo caso.
 *
 * QC-70 (R17): antes se llamaba `NotFoundError` y su codigo era `not_found`, que significaba
 * cinco cosas distintas segun quien lo lanzara. Ahora el caso es suyo: `order_not_found`.
 */
export class OrderNotFoundError extends PedidosError {
  readonly code = 'order_not_found';

  constructor(diagnostic?: string) {
    super('order_not_found', diagnostic);
  }
}

/**
 * R15: la receta esta ausente, no existe o esta dada de baja. Los tres casos comparten
 * `code` porque los tres significan lo mismo para quien pide el alta: esa receta no se
 * puede pedir. La distincion entre «no existe» y «esta de baja» si la conoce el caso de
 * uso, porque `RecipeRef` trae `isDeleted` (`design.md > 6.2`), y la necesita para R25.
 *
 * QC-70: `recipe_not_found` es UNA entrada del catalogo COMPARTIDA con el modulo `recetas`
 * (`design.md > 3`). Los dos casos le dicen lo mismo a quien mira la pantalla, y R4 manda:
 * misma frase, mismo codigo.
 */
export class RecipeNotFoundError extends PedidosError {
  readonly code = 'recipe_not_found';

  constructor(diagnostic?: string) {
    super('recipe_not_found', diagnostic);
  }
}

/*
 * QC-35bis (2026-09-07): `UnitNotFoundError` (code `unit_not_found`) DESAPARECIO junto con la
 * unidad del pedido. No queda ningun caso de uso que pueda emitirlo, asi que dejar la clase
 * publicada seria ofrecer un codigo de error que nada produce -y que el traductor de la pantalla
 * tendria que seguir mapeando por si acaso-.
 */

/** R21, R22: la transicion de estado pedida no esta permitida, o se intenta editar un
 *  pedido final (`ENTREGADO` o `CANCELADO`), que no admite ninguna edicion.
 *
 *  QC-70 (R28): los dos estados concretos ya no se incrustan en el mensaje; viajan como
 *  DIAGNOSTICO hasta el log. Ver `order-transitions.ts`. */
export class InvalidTransitionError extends PedidosError {
  readonly code = 'invalid_transition';

  constructor(diagnostic?: string) {
    super('invalid_transition', diagnostic);
  }
}

/** R28: se intenta cancelar un pedido `ENTREGADO` o uno ya cancelado. */
export class NotCancellableError extends PedidosError {
  readonly code = 'not_cancellable';

  constructor(diagnostic?: string) {
    super('not_cancellable', diagnostic);
  }
}

/** R32: se intenta borrar un pedido `ENTREGADO` o `CANCELADO`. La base lo impide ademas
 *  con `orders_delivered_not_deleted`; esta clase es la mitad de aplicacion. */
export class NotDeletableError extends PedidosError {
  readonly code = 'not_deletable';

  constructor(diagnostic?: string) {
    super('not_deletable', diagnostic);
  }
}

/**
 * El `23505` del indice unico del correlativo, traducido (`design.md > 4.2`). En operacion
 * normal no ocurre —la secuencia por ano entrega posiciones distintas—; existe para que un
 * duplicado insertado por otra via no llegue como excepcion de Prisma sin traducir.
 */
export class DuplicateOrderNumberError extends PedidosError {
  readonly code = 'duplicate_number';

  constructor(diagnostic?: string) {
    super('duplicate_number', diagnostic);
  }
}

/** R17, R18, R19, R24, R27, R36: la entrada no pasa el esquema `zod` del borde. */
export class ValidationError extends PedidosError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
