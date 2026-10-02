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

/** La unidad del pedido no existe en el catalogo de la empresa de quien escribe, o es de otra
 *  empresa. Reusa el codigo compartido con `unidades`. */
export class UnitNotFoundError extends PedidosError {
  readonly code = 'unit_not_found';

  constructor(diagnostic?: string) {
    super('unit_not_found', diagnostic);
  }
}

/**
 * La presentacion indicada no existe en el catalogo de la empresa de quien escribe -incluida
 * una de otra empresa-. Mismo criterio que `RecipeNotFoundError`: `presentation_not_found` es una
 * entrada COMPARTIDA del catalogo de errores, ya usada por `inventario`.
 */
export class PresentationNotFoundError extends PedidosError {
  readonly code = 'presentation_not_found';

  constructor(diagnostic?: string) {
    super('presentation_not_found', diagnostic);
  }
}

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

/** Al entregar, ni el lote apartado ni el resto de lotes con disponible alcanzan la cantidad
 *  que hace falta. La transaccion se deshace entera. */
export class InsufficientMaterialError extends PedidosError {
  readonly code = 'insufficient_material';

  constructor(diagnostic?: string) {
    super('insufficient_material', diagnostic);
  }
}

/** Se entrega un pedido sin material apartado cuya receta actual no tiene ninguna linea. */
export class RecipeWithoutLinesError extends PedidosError {
  readonly code = 'recipe_without_lines';

  constructor(diagnostic?: string) {
    super('recipe_without_lines', diagnostic);
  }
}

/** Al Finalizar, ni el pedido ni su presentacion tienen un contenido con el que calcular los
 *  envases del lote de producto terminado. */
export class PresentationWithoutContentError extends PedidosError {
  readonly code = 'presentation_without_content';

  constructor(diagnostic?: string) {
    super('presentation_without_content', diagnostic);
  }
}

/** Al Finalizar, la cantidad del pedido no llena ni un envase de su presentacion. */
export class NoWholePackageError extends PedidosError {
  readonly code = 'no_whole_package';

  constructor(diagnostic?: string) {
    super('no_whole_package', diagnostic);
  }
}

/** Al crear o editar, el material disponible no cubre el pedido y no llego la confirmacion de
 *  guardarlo bloqueado. Se lanza dentro de la transaccion para que no quede nada escrito. */
export class OrderWouldBlockError extends PedidosError {
  readonly code = 'order_would_block';

  constructor(diagnostic?: string) {
    super('order_would_block', diagnostic);
  }
}

/** El pedido no tiene ninguna linea de reparto: no se puede empezar el empaque sin saber en que
 *  presentaciones se entrega. */
export class OrderWithoutDistributionError extends PedidosError {
  readonly code = 'order_without_distribution';

  constructor(diagnostic?: string) {
    super('order_without_distribution', diagnostic);
  }
}

/** El reparto de un pedido intenta cambiarse cuando el empaque ya comenzo o el pedido esta
 *  cerrado. */
export class OrderPresentationLineNotEditableError extends PedidosError {
  readonly code = 'order_presentation_line_not_editable';

  constructor(diagnostic?: string) {
    super('order_presentation_line_not_editable', diagnostic);
  }
}

/** La suma de envases (en la unidad del pedido) del reparto pasa de la cantidad del pedido. */
export class OrderDistributionExceedsQuantityError extends PedidosError {
  readonly code = 'order_distribution_exceeds_quantity';

  constructor(diagnostic?: string) {
    super('order_distribution_exceeds_quantity', diagnostic);
  }
}

/** El pedido no tiene unidad asignada: no se puede repartir en presentaciones sin ella. */
export class OrderWithoutUnitError extends PedidosError {
  readonly code = 'order_without_unit';

  constructor(diagnostic?: string) {
    super('order_without_unit', diagnostic);
  }
}

/** Una linea del reparto pide convertir su presentacion a la unidad del pedido y las dos
 *  unidades no comparten unidad base. Reusa el codigo compartido con `unidades`. */
export class IncompatibleUnitsError extends PedidosError {
  readonly code = 'incompatible_units';

  constructor(diagnostic?: string) {
    super('incompatible_units', diagnostic);
  }
}

/** La version elegida para el pedido existe y esta viva, pero sus lineas no suman 100 %. */
export class RecipeVersionUnderReviewError extends PedidosError {
  readonly code = 'recipe_version_under_review';

  constructor(diagnostic?: string) {
    super('recipe_version_under_review', diagnostic);
  }
}
