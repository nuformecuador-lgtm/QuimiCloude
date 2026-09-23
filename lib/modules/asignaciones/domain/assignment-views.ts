// lib/modules/asignaciones/domain/assignment-views.ts
/**
 * Que vistas de `/asignacion` puede ver un usuario, decidido solo por sus permisos: nunca por el
 * nombre de su rol. Quien tiene `pedidos.consultar` ve unicamente «Todos», aunque tenga tambien el
 * permiso de terminados o pedidos asignados a el. Quien no lo tiene ve «Mis asignados» y,
 * ademas, «Terminados» si tiene ese permiso.
 *
 * La pertenencia se resuelve con `assertPermission` capturado en `try/catch`, el mismo patron que
 * `canModifyAssignments` de `actor.ts`: es la unica implementacion de la regla y no se reimplementa
 * con un `includes` propio, que podria divergir el dia que la regla cambie.
 */
import { assertPermission, type PermissionBearer, type PermissionCode } from '@/lib/modules/identity';

export type AssignmentViewKind = 'asignados' | 'terminados' | 'todos';

const PEDIDOS_CONSULTAR: PermissionCode = 'pedidos.consultar';
const TERMINADOS_CONSULTAR: PermissionCode = 'terminados.consultar';

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
 * tiene ninguno de los tres permisos igual recibe `['asignados']`, porque esta funcion no decide
 * si el usuario puede entrar a `/asignacion` en absoluto, solo que vistas le tocan si entra.
 */
export function resolveAssignmentViews(
  bearer: PermissionBearer | null | undefined,
): readonly AssignmentViewKind[] {
  if (hasPermission(bearer, PEDIDOS_CONSULTAR)) return ['todos'];

  const views: AssignmentViewKind[] = ['asignados'];
  if (hasPermission(bearer, TERMINADOS_CONSULTAR)) views.push('terminados');
  return views;
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
