import type { ErrorCode } from './error-codes';

/**
 * QC-70 (R1, R5) — la INDIRECCION que deja la aplicacion preparada para traducir sin
 * ninguna dependencia nueva: el codigo apunta a una CLAVE estable, y la clave a su texto.
 *
 * El unico idioma cargado es el espanol. Resolver las claves contra archivos de idioma —y
 * elegir la libreria— es QC-72, no esta ficha; aqui solo se deja la forma.
 *
 * `satisfies Record<ErrorCode, string>` es lo que hace que el catalogo no pueda quedar
 * incompleto: un codigo nuevo en `ERROR_CODES` sin su clave aqui rompe el typecheck, y una
 * clave para un codigo que no existe tambien.
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
  // `identity` (QC-66): la administracion de usuarios, sexta familia del catalogo.
  user_not_found: 'errors.user_not_found',
  duplicate_email: 'errors.duplicate_email',
  duplicate_username: 'errors.duplicate_username',
  duplicate_document: 'errors.duplicate_document',
  role_not_found: 'errors.role_not_found',
  self_operation: 'errors.self_operation',
  last_administrator: 'errors.last_administrator',
  // `identity` (QC-84): los grupos de trabajo, dentro de la MISMA sexta familia.
  work_group_not_found: 'errors.work_group_not_found',
  work_group_duplicate_name: 'errors.work_group_duplicate_name',
  work_group_member_exists: 'errors.work_group_member_exists',
  work_group_member_exists_pending: 'errors.work_group_member_exists_pending',
  work_group_member_exists_inactive: 'errors.work_group_member_exists_inactive',
  work_group_member_exists_blocked: 'errors.work_group_member_exists_blocked',
  work_group_member_not_found: 'errors.work_group_member_not_found',
} as const satisfies Record<ErrorCode, string>;

/** La union cerrada de las claves estables (R1, R5). */
export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEY)[ErrorCode];

/**
 * QC-70 (R1, R4) — el UNICO sitio donde vive el texto de un error de la aplicacion.
 *
 * Dos claves NO pueden compartir texto (R4): si dos casos necesitan frases distintas son
 * codigos distintos, y si necesitan la misma frase son el mismo codigo. Lo vigila
 * `tests/unit/errores/catalogo.test.ts` y la guardia del catalogo (caso 6), porque eso no lo
 * puede expresar el sistema de tipos.
 *
 * Aqui NO entran los textos que el front escribe para sus PROPIAS comprobaciones de
 * formulario —campo requerido, formato, «Revisa los campos marcados»— (R31). Este catalogo es
 * el de los errores que emite el back.
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
  'errors.work_group_not_found': 'El grupo de trabajo solicitado no existe.',
  'errors.work_group_duplicate_name':
    'Ya existe un grupo de trabajo con un nombre equivalente en la empresa.',
  // QC-84 (`design.md > 7.2`): los CUATRO textos de abajo dicen lo mismo de entrada —«ya
  // pertenece»— y se separan por el MOTIVO de que no se vea. No pueden nombrar al grupo: el
  // catalogo no interpola (R4, R7) y el dato variable de `diagnostic` no cruza al navegador
  // (R28, R29). El nombre del grupo lo pone la pantalla, que sabe cual acaba de abrir.
  'errors.work_group_member_exists': 'Esa persona ya pertenece al grupo.',
  'errors.work_group_member_exists_pending':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta pendiente de activacion.',
  'errors.work_group_member_exists_inactive':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta inactiva.',
  'errors.work_group_member_exists_blocked':
    'Esa persona ya pertenece al grupo; no aparece en la lista porque su cuenta esta bloqueada.',
  'errors.work_group_member_not_found': 'Esa persona no pertenece al grupo.',
} as const satisfies Record<ErrorMessageKey, string>;
