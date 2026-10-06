import { errorMessage, type ErrorCode } from '@/lib/modules/errores';

/**
 * El mensaje sale del catalogo a partir del codigo y ninguna clase lo admite por parametro: poder
 * sobreescribirlo dejaria la frase fuera del catalogo.
 */
export abstract class InventarioError extends Error {
  abstract readonly code: ErrorCode;

  /** Va al log del servidor y nunca al navegador. */
  readonly diagnostic?: string;

  constructor(code: ErrorCode, diagnostic?: string) {
    super(errorMessage(code));
    this.diagnostic = diagnostic;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends InventarioError {
  readonly code = 'unauthorized';

  constructor(diagnostic?: string) {
    super('unauthorized', diagnostic);
  }
}

export class ProductNotFoundError extends InventarioError {
  readonly code = 'product_not_found';

  constructor(diagnostic?: string) {
    super('product_not_found', diagnostic);
  }
}

export class PresentationNotFoundError extends InventarioError {
  readonly code = 'presentation_not_found';

  constructor(diagnostic?: string) {
    super('presentation_not_found', diagnostic);
  }
}

export class PresentationDuplicateNameError extends InventarioError {
  readonly code = 'presentation_duplicate_name';

  constructor(diagnostic?: string) {
    super('presentation_duplicate_name', diagnostic);
  }
}

export class PresentationInUseError extends InventarioError {
  readonly code = 'presentation_in_use';

  constructor(diagnostic?: string) {
    super('presentation_in_use', diagnostic);
  }
}

export class PresentationUnitLockedError extends InventarioError {
  readonly code = 'presentation_unit_locked';

  constructor(diagnostic?: string) {
    super('presentation_unit_locked', diagnostic);
  }
}

/**
 * Solo para el lote escrito a mano: si choca uno generado, se reintenta. Es un codigo propio y no
 * `ValidationError` porque la entrada tiene forma valida; lo que choca es su valor contra la base.
 */
export class BatchDuplicateLotError extends InventarioError {
  readonly code = 'batch_duplicate_lot';

  constructor(diagnostic?: string) {
    super('batch_duplicate_lot', diagnostic);
  }
}

/** El lote no existe o es de otra empresa: las dos se responden igual. */
export class BatchNotFoundError extends InventarioError {
  readonly code = 'batch_not_found';

  constructor(diagnostic?: string) {
    super('batch_not_found', diagnostic);
  }
}

/** El ajuste dejaria la existencia del lote por debajo de cero. */
export class BatchStockNegativeError extends InventarioError {
  readonly code = 'batch_stock_negative';

  constructor(diagnostic?: string) {
    super('batch_stock_negative', diagnostic);
  }
}

/** La entrada es valida y el actor tiene permiso: lo que la regla de negocio rechaza es la
 *  ACCION pedida (cambiar el tipo de o hacia un producto terminado, un homonimo terminado). */
export class ActionNotAllowedError extends InventarioError {
  readonly code = 'action_not_allowed';

  constructor(diagnostic?: string) {
    super('action_not_allowed', diagnostic);
  }
}

/** Lleva la existencia real del lote para que la pantalla recalcule la diferencia sin recargar. */
export class BatchStockChangedError extends InventarioError {
  readonly code = 'batch_stock_changed';
  readonly currentStock: string;

  constructor(currentStock: string, diagnostic?: string) {
    super('batch_stock_changed', diagnostic);
    this.currentStock = currentStock;
  }
}

export class AdjustmentReasonNotAllowedError extends InventarioError {
  readonly code = 'adjustment_reason_not_allowed';

  constructor(diagnostic?: string) {
    super('adjustment_reason_not_allowed', diagnostic);
  }
}

export class ValidationError extends InventarioError {
  readonly code = 'invalid_input';

  constructor(diagnostic?: string) {
    super('invalid_input', diagnostic);
  }
}
