import { requirePermission, type Actor } from './actor';
import { PresentationInUseError, PresentationNotFoundError } from './errors';

import type { PresentationRepository } from '../ports/presentation-repository';

export type DeletePresentationDeps = {
  readonly presentations: PresentationRepository;
};

/**
 * Borrado de presentacion (R14, R21, R22). `requirePermission(actor, 'inventario.modificar')` es la PRIMERA linea, antes de
 * tocar el puerto (R2, R3). No hay zod aqui: el borrado no recibe mas entrada que el
 * identificador.
 *
 * FISICO, no logico (D6): `presentations` no lleva `deleted_at` a proposito -por eso el
 * `RESTRICT` de la FK puede bloquear el borrado (§ 11.5)-. Este caso de uso no anade
 * ningun campo de borrado logico ni ninguna sustituto.
 *
 * `'in_use'` -> `PresentationInUseError` (R21): lo detecta el `RESTRICT` de la FK,
 * traducido por el adaptador. Este archivo solo traduce el resultado discriminado del
 * puerto, nunca ve un SQLSTATE.
 */
export function createDeletePresentation(
  deps: DeletePresentationDeps,
): (id: string, actor: Actor | null | undefined) => Promise<void> {
  return async function deletePresentation(
    id: string,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'inventario.modificar');

    const result = await deps.presentations.deleteById(id);

    if (result === 'not_found') throw new PresentationNotFoundError();
    if (result === 'in_use') throw new PresentationInUseError();
  };
}
