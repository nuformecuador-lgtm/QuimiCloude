// lib/modules/asignaciones/domain/responsible-eligibility.ts
/**
 * Quien puede ser responsable de un pedido, decidido solo por permisos: nunca por el nombre del
 * rol. Una persona que ya puede consultar sus propios pedidos no se asigna como responsable de
 * uno ajeno.
 *
 * La pertenencia se resuelve con `assertPermission` capturado en `try/catch`, el mismo patron que
 * `canModifyAssignments` de `actor.ts` y que `resolveAssignmentViews` de `assignment-views.ts`: es
 * la unica implementacion de la regla y no se reimplementa con un `includes` propio, que podria
 * divergir el dia que la regla cambie.
 */
import { assertPermission, type PermissionBearer, type PermissionCode } from '@/lib/modules/identity';

const PEDIDOS_CONSULTAR: PermissionCode = 'pedidos.consultar';

/**
 * Centinela privado y reutilizado: `assertPermission` exige una fabrica de error porque su
 * contrato es lanzar. La excepcion nunca sale de este archivo; solo sirve para leer el veredicto.
 */
const DENEGADO = new Error('asignaciones: pedidos.consultar ausente al comprobar elegibilidad');

/** Nunca lanza: es una pregunta, no una autorizacion. */
export function canBeResponsible(person: PermissionBearer): boolean {
  try {
    assertPermission(person, PEDIDOS_CONSULTAR, () => DENEGADO);
    return false;
  } catch {
    return true;
  }
}
