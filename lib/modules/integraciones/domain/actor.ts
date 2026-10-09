import { assertPermission } from '@/lib/modules/identity';

import { UnauthorizedError } from './errors';

export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

/**
 * Primera línea de cada caso de uso, antes de validar la entrada y de tocar un puerto. Un actor
 * sin empresa se rechaza igual que uno sin permiso: el ámbito de toda lectura sale de ella.
 */
export function requirePermission(actor: Actor | null | undefined): asserts actor is Actor {
  assertPermission(actor, 'integraciones.modificar', () => new UnauthorizedError());
  if (typeof actor?.companyId !== 'string' || actor.companyId === '') {
    throw new UnauthorizedError();
  }
}
