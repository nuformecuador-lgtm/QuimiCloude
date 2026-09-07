import { assertAdminRole } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/** Actor de entrada del caso de uso (R41): id y rol, nada mas. */
export type Actor = {
  readonly id: string;
  readonly roleName: string | null;
};

/**
 * Primera linea del caso de uso de listado (R41). Falla cerrado: actor ausente, rol nulo,
 * vacio o distinto del rol Administrador se rechazan igual, todos con el mismo error de
 * autorizacion, y ANTES de tocar el repositorio.
 *
 * La comparacion es de igualdad exacta, sin `includes` ni normalizacion: un rol llamado
 * "Administradores externos" no debe colarse. Delega en `assertAdminRole` de `identity`,
 * que es la unica implementacion de la regla.
 */
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  assertAdminRole(actor, () => new UnauthorizedError());
}
