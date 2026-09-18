/**
 * El codigo es una palabra estable, nunca un numero: las pantallas deciden por el y en un log se
 * lee tal cual. Anadir uno es anadir una linea aqui, su clave y su texto en `error-catalog.ts`;
 * olvidar cualquiera de las dos rompe el typecheck por los `satisfies` de ese archivo.
 *
 * **Sexta enmienda, el 2026-09-15 (QC-81)**: `batch_duplicate_lot`.
 * Aprobada por el humano el 2026-09-15 en la puerta F1.4 de QC-81.
 *
 * **Septima enmienda, el 2026-09-17 (QC-92)**: `batch_not_found`, `batch_stock_negative`.
 * Aprobada por el humano el 2026-09-17 en la puerta F1.4 de QC-92.
 * **Octava enmienda, el 2026-09-18**: `ai_unavailable`.
 * Aprobada por el humano el 2026-09-18.
 */
export const ERROR_CODES = [
  'unauthorized',
  'invalid_input',
  'unexpected',
  'product_not_found',
  'presentation_not_found',
  'presentation_duplicate_name',
  'presentation_in_use',
  'order_not_found',
  'recipe_not_found',
  'invalid_transition',
  'not_cancellable',
  'not_deletable',
  'duplicate_number',
  'supplier_not_found',
  'catalog_line_not_found',
  'supplier_duplicate_name',
  'duplicate_catalog_line',
  'recipe_duplicate_name',
  'unit_not_found',
  'unit_duplicate_name',
  'duplicate_symbol',
  'system_unit',
  'invalid_derivation',
  'unit_in_use',
  'incompatible_units',
  'user_not_found',
  'duplicate_email',
  'duplicate_username',
  'duplicate_document',
  'role_not_found',
  'self_operation',
  'last_administrator',
  'credential_link_invalid',
  'user_not_pending',
  'work_group_not_found',
  'work_group_duplicate_name',
  'work_group_member_exists',
  'work_group_member_exists_pending',
  'work_group_member_exists_inactive',
  'work_group_member_exists_blocked',
  'work_group_member_not_found',
  'order_delivered_frozen',
  'order_cancelled_not_assignable',
  'order_assignment_not_found',
  // Distinto de `user_not_found`: la persona existe, pero su cuenta no esta activa.
  'user_not_assignable',
  // Distinto de `invalid_input`: la entrada tiene la forma correcta y choca con la unicidad
  // `(empresa, lote)` de la base.
  'batch_duplicate_lot',
  // Distinto de `product_not_found`: el lote no existe o es de otra empresa, no el producto.
  'batch_not_found',
  // Distinto de `invalid_input`: la entrada tiene forma valida y lo que falla es el estado del
  // lote tras aplicar el ajuste.
  'batch_stock_negative',
  // Distinto de `unexpected`: la entrada era correcta, lo que fallo es que el proveedor de IA no
  // respondio o agoto el plazo.
  'ai_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Lo que no es de dominio: fallo de base, bug. Su mensaje es neutro y la causa real va al log.
 *
 * `satisfies` en vez de anotacion: conserva el tipo literal `'unexpected'` y a la vez obliga a
 * que siga estando en `ERROR_CODES`.
 */
export const UNEXPECTED_ERROR_CODE = 'unexpected' satisfies ErrorCode;
