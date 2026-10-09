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
  work_group_member_not_active: 'errors.work_group_member_not_active',
  work_group_member_self: 'errors.work_group_member_self',
  order_delivered_frozen: 'errors.order_delivered_frozen',
  order_cancelled_not_assignable: 'errors.order_cancelled_not_assignable',
  order_assignment_not_found: 'errors.order_assignment_not_found',
  user_not_assignable: 'errors.user_not_assignable',
  batch_duplicate_lot: 'errors.batch_duplicate_lot',
  batch_not_found: 'errors.batch_not_found',
  batch_stock_negative: 'errors.batch_stock_negative',
  ai_unavailable: 'errors.ai_unavailable',
  presentation_unit_locked: 'errors.presentation_unit_locked',
  action_not_allowed: 'errors.action_not_allowed',
  insufficient_material: 'errors.insufficient_material',
  recipe_without_lines: 'errors.recipe_without_lines',
  user_cannot_be_responsible: 'errors.user_cannot_be_responsible',
  customer_not_found: 'errors.customer_not_found',
  presentation_without_content: 'errors.presentation_without_content',
  no_whole_package: 'errors.no_whole_package',
  order_packing_taken: 'errors.order_packing_taken',
  order_not_packable: 'errors.order_not_packable',
  order_produced_frozen: 'errors.order_produced_frozen',
  order_conditioning_taken: 'errors.order_conditioning_taken',
  order_not_conditionable: 'errors.order_not_conditionable',
  order_would_block: 'errors.order_would_block',
  order_blocked: 'errors.order_blocked',
  order_without_distribution: 'errors.order_without_distribution',
  order_presentation_line_not_editable: 'errors.order_presentation_line_not_editable',
  order_distribution_exceeds_quantity: 'errors.order_distribution_exceeds_quantity',
  order_without_unit: 'errors.order_without_unit',
  recipe_version_under_review: 'errors.recipe_version_under_review',
  order_unit_not_convertible: 'errors.order_unit_not_convertible',
  batch_stock_changed: 'errors.batch_stock_changed',
  adjustment_reason_not_allowed: 'errors.adjustment_reason_not_allowed',
  conditioning_team_member_not_allowed: 'errors.conditioning_team_member_not_allowed',
  conditioning_team_empty: 'errors.conditioning_team_empty',
  delivery_exceeds_remaining: 'errors.delivery_exceeds_remaining',
  delivery_batch_insufficient: 'errors.delivery_batch_insufficient',
  delivery_not_found: 'errors.delivery_not_found',
  delivery_already_voided: 'errors.delivery_already_voided',
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
  'errors.duplicate_username': 'Ya existe un usuario con ese nombre de usuario.',
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
  // Uno solo para pendiente, inactiva y bloqueada: el catalogo no interpola y la accion es la misma.
  'errors.work_group_member_not_active':
    'Solo se puede meter en un grupo a una persona con la cuenta activa.',
  'errors.work_group_member_self': 'No puedes meterte a ti mismo en un grupo de trabajo.',
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
  // No es «no tienes permiso»: la operacion esta autorizada, lo que se rechaza es la accion.
  'errors.action_not_allowed': 'La accion no esta permitida.',
  'errors.insufficient_material':
    'No hay material suficiente en inventario para entregar el pedido.',
  'errors.recipe_without_lines':
    'La receta del pedido no tiene ingredientes: completala antes de entregarlo.',
  'errors.user_cannot_be_responsible': 'Esta persona no puede ser responsable de un pedido.',
  'errors.customer_not_found': 'El cliente solicitado no existe.',
  'errors.presentation_without_content':
    'La presentacion del pedido no indica su contenido: completala en Presentaciones antes de finalizar.',
  'errors.no_whole_package':
    'La cantidad del pedido no llena ni un envase de su presentacion.',
  'errors.order_packing_taken': 'Otro empacador esta empacando este pedido.',
  'errors.order_not_packable': 'El pedido no esta en un estado que admita esa accion de empaque.',
  'errors.order_produced_frozen':
    'Un pedido ya producido conserva sus responsables tal como estaban.',
  'errors.order_conditioning_taken': 'Otra persona esta acondicionando este pedido.',
  'errors.order_not_conditionable':
    'El pedido no esta en un estado que admita esa accion de acondicionamiento.',
  'errors.order_would_block':
    'No hay material suficiente para este pedido: si lo guardas, quedara bloqueado hasta que entre inventario.',
  'errors.order_blocked': 'Falta material: el pedido esta bloqueado y no se puede iniciar.',
  'errors.order_without_distribution':
    'El pedido no tiene ningun reparto: anade al menos una presentacion antes de comenzar el empaque.',
  'errors.order_presentation_line_not_editable':
    'El reparto de este pedido ya no se puede cambiar: el empaque ya comenzo o el pedido esta cerrado.',
  'errors.order_distribution_exceeds_quantity':
    'El reparto pasa de la cantidad del pedido: quita envases o elige presentaciones mas pequenas.',
  'errors.order_without_unit':
    'El pedido no tiene unidad: asignale una desde la edicion del pedido antes de repartirlo.',
  'errors.recipe_version_under_review':
    'La versión elegida está por revisar: ajústala antes de usarla en un pedido.',
  'errors.order_unit_not_convertible':
    'La unidad del pedido no se puede convertir a la de algún insumo de la receta: revisa los insumos marcados en la tabla o elige otra unidad.',
  'errors.batch_stock_changed':
    'La existencia del lote cambio mientras ajustabas: revisa la diferencia y confirma de nuevo.',
  'errors.adjustment_reason_not_allowed':
    'Un aumento de existencia solo admite los motivos conteo fisico o error de carga.',
  'errors.conditioning_team_member_not_allowed':
    'Esta persona no puede formar parte del equipo de acondicionamiento.',
  'errors.conditioning_team_empty': 'El equipo de acondicionamiento necesita al menos una persona.',
  'errors.delivery_exceeds_remaining':
    'La entrega supera los envases que faltan por entregar en alguna presentacion.',
  'errors.delivery_batch_insufficient':
    'Algun lote ya no tiene los envases elegidos: revisa los lotes y confirma de nuevo.',
  'errors.delivery_not_found': 'La entrega no existe.',
  'errors.delivery_already_voided':
    'Alguna presentacion elegida ya estaba anulada: revisa la lista y vuelve a intentarlo.',
} as const satisfies Record<ErrorMessageKey, string>;
