/**
 * QC-87 T6 — Errores del dominio `asignaciones` (`design.md > 1`, `> 6`).
 *
 * Todas derivan de `AsignacionesError` con un `code` ESTABLE del catalogo cerrado de
 * `@/lib/modules/errores`, para que el adaptador driving las traduzca con UN SOLO
 * `instanceof AsignacionesError` y decida por el `code` y NUNCA por el texto (R43): el mensaje
 * puede cambiar de idioma sin romper a QC-102.
 *
 * QC-70 (R7, R8): el `code` es un `ErrorCode` —uno mal escrito no compila— y el MENSAJE SALE DEL
 * CATALOGO, no del sitio que lanza. Por eso ninguna clase admite un `message` por parametro; lo
 * vigila `tests/guards/guard-catalogo-de-errores.test.ts`.
 *
 * CUATRO de estos codigos los abrio T1 como la SEPTIMA familia del catalogo
 * (`order_delivered_frozen`, `order_cancelled_not_assignable`, `order_assignment_not_found`,
 * `user_not_assignable`). Este archivo es el que los saca de «entrada huerfana» (R9 de QC-70): un
 * codigo en el catalogo que ninguna clase declara pone la guardia roja, y con razon —seria una
 * frase que nada puede producir—.
 *
 * Los otros cinco codigos se REUTILIZAN tal cual y no se redefinen (quinta enmienda del catalogo):
 * `unauthorized`, `invalid_input`, `order_not_found`, `user_not_found` y `work_group_not_found`
 * significan aqui exactamente lo mismo que donde ya viven, y R4 manda: mismo caso, mismo codigo,
 * misma frase.
 *
 * `Object.setPrototypeOf` es necesario porque TypeScript, al compilar a un target que no soporta
 * nativamente extender `Error`, rompe la cadena de prototipos y `instanceof` deja de funcionar sin
 * este ajuste. Mismo patron que `pedidos`, `identity`, `inventario`, `recetas` y `proveedores`.
 */
import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

export abstract class AsignacionesError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * QC-70 (R28, R29): el dato variable que ayuda a DIAGNOSTICAR el fallo —un identificador, un
   * estado—. Va al registro del servidor y NUNCA al navegador: no esta en `ErrorState`.
   */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * R1, R2: actor ausente, sin conjunto de permisos, con el conjunto vacio o sin el codigo exigido.
 * Los cuatro casos dan ESTE error, sin revelar si el pedido, la persona o el grupo existen.
 */
export class UnauthorizedError extends AsignacionesError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

/** R42: la entrada no pasa el esquema `zod` del borde —uuid mal formado, listas ausentes,
 *  operacion sin ninguna persona ni ningun grupo—. Se lanza SIN tocar ningun puerto. */
export class ValidationError extends AsignacionesError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}

/**
 * R8: el pedido no existe o esta dado de baja. Para el dominio son el mismo caso, y es el mismo
 * `order_not_found` que ya usa `pedidos`: quien lee la pantalla necesita la misma frase.
 *
 * R12: se decide sobre la LECTURA del pedido hecha dentro de la operacion, no como condicion del
 * `WHERE` de la escritura, para que «no existe» y «no admite la operacion» sean errores DISTINTOS.
 */
export class OrderNotFoundError extends AsignacionesError {
  readonly code = 'order_not_found';

  constructor(diagnostic?: string) {
    super('order_not_found', diagnostic);
  }
}

/**
 * R10: el pedido esta `ENTREGADO`. Las TRES escrituras se rechazan; la consulta NO (R13).
 * Codigo propio y distinto del de `CANCELADO` (R11) porque son dos frases distintas para quien
 * las lee: un pedido entregado conserva sus responsables tal como estaban.
 */
export class OrderDeliveredFrozenError extends AsignacionesError {
  readonly code = 'order_delivered_frozen';

  constructor(diagnostic?: string) {
    super('order_delivered_frozen', diagnostic);
  }
}

/** R11: el pedido esta `CANCELADO`. Las TRES escrituras se rechazan, con un codigo ESTABLE y
 *  DISTINTO del de R10 —esa distincion es el requisito, no un detalle de redaccion—. */
export class OrderCancelledNotAssignableError extends AsignacionesError {
  readonly code = 'order_cancelled_not_assignable';

  constructor(diagnostic?: string) {
    super('order_cancelled_not_assignable', diagnostic);
  }
}

/**
 * R30: se intenta desasignar a una persona que NO esta asignada a ese pedido. No es
 * `user_not_found` —la persona existe— ni `work_group_member_not_found` —eso habla de un grupo—:
 * es «esa persona no es responsable de ESTE pedido», y por eso tiene codigo propio.
 */
export class OrderAssignmentNotFoundError extends AsignacionesError {
  readonly code = 'order_assignment_not_found';

  constructor(diagnostic?: string) {
    super('order_assignment_not_found', diagnostic);
  }
}

/**
 * R17, R6: alguna de las personas indicadas no existe, esta dada de baja o es de otra empresa. Los
 * tres casos comparten `code` con `identity` a proposito: para quien pide la asignacion significan
 * lo mismo, y decir cual de los tres es seria revelar la existencia de una persona de otra empresa.
 */
export class UserNotFoundError extends AsignacionesError {
  readonly code = 'user_not_found';

  constructor(diagnostic?: string) {
    super('user_not_found', diagnostic);
  }
}

/**
 * R18: la persona EXISTE y es de la empresa, pero su estado efectivo no es `active` —pendiente,
 * inactiva o bloqueada con plazo vigente—. Se distingue de `user_not_found` a proposito: lo que no
 * admite es que se le asigne trabajo HOY, y manana puede dejar de ser cierto sin que nadie borre
 * nada. El texto no dice cual de los tres estados es, porque el catalogo no interpola (R4, R7).
 */
export class UserNotAssignableError extends AsignacionesError {
  readonly code = 'user_not_assignable';

  constructor(diagnostic?: string) {
    super('user_not_assignable', diagnostic);
  }
}

/** R25, R6: alguno de los grupos indicados no existe, esta dado de baja o es de otra empresa.
 *  Mismo `code` que en `identity` por el mismo motivo que `user_not_found`. */
export class WorkGroupNotFoundError extends AsignacionesError {
  readonly code = 'work_group_not_found';

  constructor(diagnostic?: string) {
    super('work_group_not_found', diagnostic);
  }
}

/** QC-141 (R27, R30, R31): el Finalizar de la planta intento entregar y `pedidos` respondio
 *  `'insufficient_material'` -ni el lote apartado ni el resto de lotes con disponible
 *  alcanzan-. Mismo `code` que `InsufficientMaterialError` de `pedidos`: es la misma frase para
 *  quien la lee, la entregue desde la edicion o desde la planta. */
export class MaterialShortageError extends AsignacionesError {
  readonly code = 'insufficient_material';

  constructor(diagnostic?: string) {
    super('insufficient_material', diagnostic);
  }
}

/** QC-141 (R50): el Finalizar de la planta intento entregar un pedido sin material apartado
 *  cuya receta actual no tiene ninguna linea. Mismo `code` que `RecipeWithoutLinesError` de
 *  `pedidos`. */
export class RecipeWithoutLinesError extends AsignacionesError {
  readonly code = 'recipe_without_lines';

  constructor(diagnostic?: string) {
    super('recipe_without_lines', diagnostic);
  }
}
