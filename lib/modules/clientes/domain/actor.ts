// Barrel, nunca ruta profunda (`docs/architecture.md > La regla de dependencias`).
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

/**
 * Actor de entrada de los cinco casos de uso: id, empresa y su conjunto de permisos, nada
 * mas. Sin nombre de rol: este modulo no lo lee ni lo compara, quien decide es la pertenencia
 * exacta del codigo al conjunto.
 */
export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera linea de los cinco casos de uso: antes de `zod` y antes de tocar ningun puerto.
 * Falla cerrado: actor ausente, sin conjunto de permisos, con el conjunto vacio o sin el
 * codigo exigido se rechazan igual.
 */
export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
