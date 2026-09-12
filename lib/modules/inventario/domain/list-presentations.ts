import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { PRESENTATION_QUERYABLE } from './presentation-queryable';

import type { Page } from './page';
import type { PresentationView } from './presentation-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { PresentationRepository } from '../ports/presentation-repository';

export type ListPresentationsDeps = {
  readonly presentations: PresentationRepository;
  readonly log: ListQueryLog;
};

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'presentations';

const listQuerySchema = createListQuerySchema();

/**
 * Lista paginada de presentaciones con el CONTRATO GENERICO de consulta (QC-57 R30, R33).
 * Mismos cinco pasos, en el mismo orden, que `list-products.ts` -y por los mismos motivos,
 * escritos alli-: permiso, zod, poda contra `PRESENTATION_QUERYABLE`, log de lo podado y
 * repositorio con la consulta ya saneada.
 *
 * `presentations` NO tiene borrado logico (D6 de QC-20): por eso su puerto se llama `list` y no
 * `listAlive`, y por eso el adaptador no anade ninguna condicion de vida que no existe.
 *
 * QC-49 (R14): el ambito -la empresa del actor- se pasa al puerto junto con la consulta ya
 * saneada. El orden por defecto, la busqueda, los filtros, la paginacion y la forma del
 * resultado NO cambian (R31); el `total` cuenta solo lo visible para esa empresa. Componer el
 * ambito con lo demas es del adaptador: aqui no se escribe ninguna condicion.
 */
export function createListPresentations(
  deps: ListPresentationsDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<PresentationView>> {
  return async function listPresentations(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<PresentationView>> {
    requirePermission(actor, 'inventario.consultar');

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, PRESENTATION_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    return deps.presentations.list(query, { companyId: actor.companyId });
  };
}
