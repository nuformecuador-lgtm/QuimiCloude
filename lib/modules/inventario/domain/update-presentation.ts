import { requirePermission, type Actor } from './actor';
import {
  PresentationDuplicateNameError,
  PresentationNotFoundError,
  ValidationError,
} from './errors';
import { updatePresentationSchema } from './presentation-input';
import { normalizePresentationName } from './presentation-name';

import type { PresentationRepository } from '../ports/presentation-repository';

export type UpdatePresentationDeps = {
  readonly presentations: PresentationRepository;
};

/**
 * Renombrado de presentacion (R9, R11, R14, R17, R18, R20, R37). `requirePermission(actor, 'inventario.modificar')` es la
 * PRIMERA linea, antes de zod y antes de tocar el puerto (R2, R3).
 *
 * R17: igual que en el alta, el nombre y su forma normalizada se recalculan juntos con
 * `normalizePresentationName` y se pasan juntos a `rename` -no hay ningun camino de
 * renombrado que actualice `name` sin `nameNormalized`.
 *
 * R18/R20: `rename` puede devolver `'duplicate'` aunque no exista ninguna comprobacion
 * previa por `nameNormalized`; el indice unico de la base es la garantia real (design.md
 * > 7, § 11.4), y aqui se traduce SIEMPRE a `PresentationDuplicateNameError`.
 */
export function createUpdatePresentation(
  deps: UpdatePresentationDeps,
): (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void> {
  return async function updatePresentation(
    id: string,
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<void> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = updatePresentationSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const nameNormalized = normalizePresentationName(parsed.data.name);
    const result = await deps.presentations.rename(id, parsed.data.name, nameNormalized);

    if (result === 'not_found') throw new PresentationNotFoundError();
    if (result === 'duplicate') throw new PresentationDuplicateNameError();
  };
}
