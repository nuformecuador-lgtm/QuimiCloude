import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { pageQuerySchema, type Page } from './page';
import type { PresentationView } from './presentation-view';

import type { PresentationRepository } from '../ports/presentation-repository';

export type ListPresentationsDeps = {
  readonly presentations: PresentationRepository;
};

/**
 * Lista paginada de presentaciones (R23, R24, R25, R26, R35, R36). El caso de uso solo
 * valida el minimo y la integridad con `pageQuerySchema` y DELEGA: el defecto de 10, el
 * tope de 25 y el orden `name ASC, id ASC` los aplica el adaptador driven con
 * `lib/shared/pagination` (R27) -este archivo no puede importar `lib/shared/**`
 * (`docs/architecture.md > La regla de dependencias`)-. D2: consultar tambien exige
 * `requireAdmin`.
 */
export function createListPresentations(
  deps: ListPresentationsDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<PresentationView>> {
  return async function listPresentations(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<PresentationView>> {
    requireAdmin(actor);

    const parsed = pageQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    return deps.presentations.list(parsed.data);
  };
}
