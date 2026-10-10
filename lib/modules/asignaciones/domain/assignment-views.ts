// lib/modules/asignaciones/domain/assignment-views.ts
/**
 * Que vistas de `/asignacion` puede ver un usuario, decidido solo por sus permisos: nunca por el
 * nombre de su rol. Quien tiene `pedidos.consultar` ve unicamente «Todos», aunque tenga tambien el
 * permiso de terminados o pedidos asignados a el. Quien no lo tiene ve «Mis asignados» si puede
 * ejecutar pedidos asignados y «Terminados» si tiene ese permiso.
 *
 * La pertenencia se resuelve con `assertPermission` capturado en `try/catch`, el mismo patron que
 * `canModifyAssignments` de `actor.ts`: es la unica implementacion de la regla y no se reimplementa
 * con un `includes` propio, que podria divergir el dia que la regla cambie.
 */
import { canExecuteAssignedOrders } from './actor';

import { assertPermission, type PermissionBearer, type PermissionCode } from '@/lib/modules/identity';

export type AssignmentViewKind =
  | 'asignados'
  | 'terminados'
  | 'todos'
  | 'por_empacar'
  | 'por_acondicionar'
  | 'acondicionados'
  | 'acondicionados_entregados';

const PEDIDOS_CONSULTAR: PermissionCode = 'pedidos.consultar';
const TERMINADOS_CONSULTAR: PermissionCode = 'terminados.consultar';
const EMPAQUE_MODIFICAR: PermissionCode = 'empaque.modificar';
const ACONDICIONAMIENTO_MODIFICAR: PermissionCode = 'acondicionamiento.modificar';

/**
 * Centinela privado y reutilizado: `assertPermission` exige una fabrica de error porque su
 * contrato es lanzar. La excepcion nunca sale de este archivo; solo sirve para leer el veredicto.
 */
const DENEGADO = new Error('asignaciones: permiso ausente al resolver vistas');

function hasPermission(
  bearer: PermissionBearer | null | undefined,
  permission: PermissionCode,
): boolean {
  try {
    assertPermission(bearer, permission, () => DENEGADO);
    return true;
  } catch {
    return false;
  }
}

/**
 * Las vistas que este usuario puede ver, en el orden en que se ofrecen. Nunca vacio: quien no
 * tiene ninguno de los permisos igual recibe `['asignados']`, porque esta funcion no decide
 * si el usuario puede entrar a `/asignacion` en absoluto, solo que vistas le tocan si entra.
 *
 * `por_empacar` se anade SIEMPRE AL FINAL, sea cual sea la vista por defecto que ya se calculo:
 * no cambia el aterrizaje de nadie, solo ofrece la pestana a quien tiene `empaque.modificar`.
 * Detras van `por_acondicionar`, `acondicionados` y `acondicionados_entregados`, con
 * `acondicionamiento.modificar`; a quien solo tiene esas no se le anade la reserva, y aterriza en
 * `por_acondicionar`.
 */
export function resolveAssignmentViews(
  bearer: PermissionBearer | null | undefined,
): readonly AssignmentViewKind[] {
  const views: AssignmentViewKind[] = [];
  if (hasPermission(bearer, PEDIDOS_CONSULTAR)) views.push('todos');
  else {
    if (canExecuteAssignedOrders(bearer)) views.push('asignados');
    if (hasPermission(bearer, TERMINADOS_CONSULTAR)) views.push('terminados');
  }
  if (hasPermission(bearer, EMPAQUE_MODIFICAR)) views.push('por_empacar');
  if (hasPermission(bearer, ACONDICIONAMIENTO_MODIFICAR)) {
    views.push('por_acondicionar', 'acondicionados', 'acondicionados_entregados');
  }
  // La vista vacia de «Mis asignados» es el aterrizaje de quien no tiene ninguna otra.
  return views.length > 0 ? views : ['asignados'];
}

/**
 * La vista pedida por la direccion si esta permitida; si no, la primera de las permitidas, sin
 * error y sin revelar que otra vista existe.
 */
export function resolveAssignmentView(
  requested: string | undefined,
  allowed: readonly AssignmentViewKind[],
): AssignmentViewKind {
  if (requested !== undefined && (allowed as readonly string[]).includes(requested)) {
    return requested as AssignmentViewKind;
  }
  return allowed[0];
}
