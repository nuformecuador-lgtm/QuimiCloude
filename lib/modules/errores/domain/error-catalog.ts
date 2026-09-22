import type { ErrorCode } from './error-codes';

/**
 * El codigo apunta a una clave estable y la clave a su texto, para poder traducir sin tocar los
 * codigos. Con `satisfies`, un codigo sin clave o una clave sin codigo rompe el typecheck.
 */
export const ERROR_MESSAGE_KEY = {
  unauthorized: 'errors.unauthorized',
  invalid_input: 'errors.invalid_input',
  unexpected: 'errors.unexpected',
  product_not_found: 'errors.product_not_found',
  presentation_not_found: 'errors.presentation_not_found',
  presentation_duplicate_name: 'errors.presentation_duplicate_name',
  presentation_in_use: 'errors.presentation_in_use',
  order_not_found: 'errors.order_not_found',
  recipe_not_found: 'errors.recipe_not_found',
  invalid_transition: 'errors.invalid_transition',
  not_cancellable: 'errors.not_cancellable',
  not_deletable: 'errors.not_deletable',
  duplicate_number: 'errors.duplicate_number',
  supplier_not_found: 'errors.supplier_not_found',
  catalog_line_not_found: 'errors.catalog_line_not_found',
  supplier_duplicate_name: 'errors.supplier_duplicate_name',
  duplicate_catalog_line: 'errors.duplicate_catalog_line',
  recipe_duplicate_name: 'errors.recipe_duplicate_name',
  unit_not_found: 'errors.unit_not_found',
  unit_duplicate_name: 'errors.unit_duplicate_name',
  duplicate_symbol: 'errors.duplicate_symbol',
  system_unit: 'errors.system_unit',
  invalid_derivation: 'errors.invalid_derivation',
  unit_in_use: 'errors.unit_in_use',
  incompatible_units: 'errors.incompatible_units',
  user_not_found: 'errors.user_not_found',
  duplicate_email: 'errors.duplicate_email',
  duplicate_username: 'errors.duplicate_username',
  duplicate_document: 'errors.duplicate_document',
  role_not_found: 'errors.role_not_found',
  self_operation: 'errors.self_operation',
  last_administrator: 'errors.last_administrator',
  credential_link_invalid: 'errors.credential_link_invalid',
  user_not_pending: 'errors.user_not_pending',
  work_group_not_found: 'errors.work_group_not_found',
  work_group_duplicate_name: 'errors.work_group_duplicate_name',
  work_group_member_exists: 'errors.work_group_member_exists',
  work_group_member_exists_pending: 'errors.work_group_member_exists_pending',
  work_group_member_exists_inactive: 'errors.work_group_member_exists_inactive',
  work_group_member_exists_blocked: 'errors.work_group_member_exists_blocked',
  work_group_member_not_found: 'errors.work_group_member_not_found',
  order_delivered_frozen: 'errors.order_delivered_frozen',
  order_cancelled_not_assignable: 'errors.order_cancelled_not_assignable',
  order_assignment_not_found: 'errors.order_assignment_not_found',
  user_not_assignable: 'errors.user_not_assignable',
  batch_duplicate_lot: 'errors.batch_duplicate_lot',
  batch_not_found: 'errors.batch_not_found',
  batch_stock_negative: 'errors.batch_stock_negative',
  ai_unavailable: 'errors.ai_unavailable',
  presentation_unit_locked: 'errors.presentation_unit_locked',
} as const satisfies Record<ErrorCode, string>;

export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEY)[ErrorCode];

/**
 * Dos claves no pueden compartir texto: si necesitan la misma frase, son el mismo codigo. Lo
 * vigilan los tests, porque el sistema de tipos no puede expresarlo.
 *
 * Los textos de las comprobaciones propias de un formulario no entran: este catalogo es el de los
 * errores que emite el back.
 */
export const ERROR_MESSAGES_ES = {
  'errors.unauthorized': 'El actor no tiene permiso para realizar esta operacion.',
  'errors.invalid_input': 'La entrada recibida no es valida.',
  'errors.unexpected': 'Ocurrio un error inesperado. Intentalo de nuevo.',
  'errors.product_not_found': 'El producto solicitado no existe.',
  'errors.presentation_not_found': 'La presentacion solicitada no existe.',
  'errors.presentation_duplicate_name': 'Ya existe una presentacion con un nombre equivalente.',
  'errors.presentation_in_use': 'La presentacion tiene productos asignados y no se puede borrar.',
  'errors.order_not_found': 'El pedido solicitado no existe.',
  'errors.recipe_not_found': 'La receta indicada no existe o esta dada de baja.',
  'errors.invalid_transition': 'El pedido no admite ese cambio de estado.',
  'errors.not_cancellable': 'El pedido no se puede cancelar en su estado actual.',
  'errors.not_deletable': 'El pedido no se puede borrar en su estado actual.',
  'errors.duplicate_number': 'Ya existe un pedido con ese numero correlativo.',
  'errors.supplier_not_found': 'El proveedor solicitado no existe.',
  'errors.catalog_line_not_found': 'La linea de catalogo solicitada no existe.',
  'errors.supplier_duplicate_name': 'Ya existe un proveedor con un nombre equivalente.',
  'errors.duplicate_catalog_line': 'Ese proveedor ya tiene una linea con ese nombre y esa presentacion.',
  'errors.recipe_duplicate_name': 'Ya existe una receta con un nombre equivalente.',
  'errors.unit_not_found': 'La unidad no existe.',
  'errors.unit_duplicate_name': 'Ya existe una unidad con ese nombre.',
  'errors.duplicate_symbol': 'Ya existe una unidad con ese simbolo.',
  'errors.system_unit': 'Las unidades de sistema no se pueden editar ni borrar.',
  'errors.invalid_derivation': 'La unidad base declarada no es valida.',
  'errors.unit_in_use': 'La unidad esta en uso y no se puede borrar.',
  'errors.incompatible_units': 'Las dos unidades no comparten unidad base: no son convertibles.',
  'errors.user_not_found': 'El usuario solicitado no existe.',
  'errors.duplicate_email': 'Ya existe un usuario con ese correo en la empresa.',
  'errors.duplicate_username': 'Ya existe un usuario con ese nombre de usuario en la empresa.',
  'errors.duplicate_document': 'Ya existe un usuario con ese documento en la empresa.',
  'errors.role_not_found': 'El rol indicado no existe.',
  'errors.self_operation': 'No puedes realizar esta operacion sobre tu propia cuenta.',
  'errors.last_administrator': 'La empresa quedaria sin ningun administrador activo.',
  // Una sola respuesta para todos los fallos del enlace: distinguirlos lo convertiria en un oraculo
  // sobre si una cuenta existe y en que estado esta.
  'errors.credential_link_invalid':
    'El enlace para establecer la contrasena no sirve. Pide uno nuevo al administrador.',
  // Este si se distingue: quien reenvia el enlace ya ve el estado de la cuenta en el listado.
  'errors.user_not_pending': 'La cuenta ya no esta pendiente de activacion.',
  'errors.work_group_not_found': 'El grupo de trabajo solicitado no existe.',
  'errors.work_group_duplicate_name':
    'Ya existe un grupo de trabajo con un nombre equivalente en la empresa.',
  // Se separan por el motivo de que la persona no aparezca en la lista. No nombran al grupo porque
  // el catalogo no interpola: el nombre lo pone la pantalla.
  'errors.work_group_member_exists': 'Esa persona ya pertenece al grupo.',
  'errors.work_group_member_exists_pending':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta pendiente de activacion.',
  'errors.work_group_member_exists_inactive':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta inactiva.',
  'errors.work_group_member_exists_blocked':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta bloqueada.',
  'errors.work_group_member_not_found': 'Esa persona no pertenece al grupo.',
  // No dicen «no tienes permiso» ni «no existe»: el pedido existe y hay permiso, lo que impide mover
  // responsables es su estado.
  'errors.order_delivered_frozen': 'Un pedido entregado conserva sus responsables tal como estaban.',
  'errors.order_cancelled_not_assignable': 'Un pedido cancelado no admite responsables nuevos.',
  // La persona y el pedido existen: lo que falta es la asignacion.
  'errors.order_assignment_not_found': 'Esa persona no es responsable de este pedido.',
  // No dice cual estado inactivo es: el catalogo no interpola y todos llevan a la misma accion.
  'errors.user_not_assignable': 'No se puede asignar a una persona cuya cuenta no esta activa.',
  // «En esta empresa» porque el lote es unico por empresa, no en toda la base.
  'errors.batch_duplicate_lot': 'Ya existe un lote con ese valor en esta empresa.',
  // No distingue «no existe» de «es de otra empresa»: la respuesta es la misma para las dos.
  'errors.batch_not_found': 'El lote solicitado no existe.',
  'errors.batch_stock_negative': 'El ajuste dejaria la existencia del lote por debajo de cero.',
  'errors.ai_unavailable':
    'La lectura automatica no esta disponible en este momento. Intentalo mas tarde.',
  'errors.presentation_unit_locked':
    'La presentacion ya tiene lotes y no puede cambiar de unidad.',
} as const satisfies Record<ErrorMessageKey, string>;
