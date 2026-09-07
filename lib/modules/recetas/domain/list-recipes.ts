import { requireAdmin, type Actor } from './actor';
import { ValidationError } from './errors';
import { createListQuerySchema, sanitizeListQuery } from './list-query';
import { RECIPE_QUERYABLE } from './recipe-queryable';

import type { Page } from './page';
import type { RecipeSummary } from './recipe-view';

import type { ListQueryLog } from '../ports/list-query-log';
import type { RecipeImageStorage } from '../ports/recipe-image-storage';
import type { RecipeRepository, RecipeRow } from '../ports/recipe-repository';

/** Nombre con el que este listado se identifica en el log de campos omitidos (R6). */
const LIST_NAME = 'recipes';

/** El esquema no depende del actor ni de la consulta: se construye una vez por modulo. */
const listQuerySchema = createListQuerySchema();

/**
 * Listado paginado de recetas (D12, D13, D14, R29-R34; `design.md > 11`). `domain/` NO
 * puede importar `lib/shared/**` (R40), asi que la aritmetica de paginacion -que R31
 * prohibe reimplementar aqui- llega INYECTADA desde quien cablea el modulo (el punto de
 * composicion, que si puede importar el util real de `lib/shared/pagination`). Este
 * archivo no calcula ningun `offset`, ningun `limit` ni ningun `totalPages` por su cuenta:
 * los dos unicos calculos posibles son los que hacen `toOffsetLimit`/`buildPage`
 * inyectados, y a los tests les basta pasar los mismos que usa el resto del repo.
 */
export type ListRecipesDeps = {
  readonly recipes: RecipeRepository;
  readonly images: RecipeImageStorage;
  /** QC-57 (R6): el log de los campos omitidos. Puerto, no `console.warn`: el dominio no
   *  conoce el mundo exterior y R6 solo es testeable si el test puede espiar la llamada. */
  readonly log: ListQueryLog;
  readonly toOffsetLimit: (page: number, pageSize?: number) => { offset: number; limit: number };
  readonly buildPage: <T>(
    items: readonly T[],
    total: number,
    page: number,
    pageSize: number,
  ) => Page<T>;
};

/** D14, R33: la lista NO trae lineas -`RecipeSummary` no tiene ese campo-. */
function toSummary(row: RecipeRow, images: RecipeImageStorage): RecipeSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imagePath !== null ? images.publicUrl(row.imagePath) : null,
    stepCount: row.steps.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/**
 * QC-57 (R30, R33): el listado pasa al CONTRATO GENERICO de consulta. Los cinco pasos van en
 * ESTE orden y el orden es el requisito (`design.md > 1`):
 *
 *   1. `requireAdmin` PRIMERO, siempre (R33, R34). Antes de zod y antes de tocar el puerto: si
 *      validara primero, un actor no autorizado con una consulta rota recibiria
 *      `ValidationError` y sabria algo del sistema sin tener permiso para preguntarlo.
 *   2. zod DENTRO del caso de uso (R30). Valida la FORMA; un campo no declarado no puede hacer
 *      fallar la consulta (R5), asi que de eso no se ocupa el esquema.
 *   3. `sanitizeListQuery` contra `RECIPE_QUERYABLE` (R4, R5, R7, R8): lo que no esta declarado
 *      se poda y la consulta NO falla.
 *   4. el log de lo podado (R6).
 *   5. el repositorio, con la consulta YA SANEADA (R13).
 *
 * **La inyeccion de `toOffsetLimit`/`buildPage` SE CONSERVA** (R40 de QC-26): `recetas` no puede
 * importar `lib/shared/**` desde `domain/`, asi que la aritmetica sigue llegando inyectada y
 * este archivo sigue sin calcular ningun `offset`. Por eso el puerto recibe
 * `listAlive(offset, limit, query)` -numeros YA calculados aqui, mas la consulta saneada- y no
 * la consulta sola: si el adaptador dedujera el `offset` de `query.page`, la aritmetica se
 * habria mudado a `lib/shared/pagination` por la puerta de atras y la inyeccion seria decorado.
 * Es la forma minima que anade orden, filtro y busqueda sin tocar quien hace las cuentas.
 */
export function createListRecipes(
  deps: ListRecipesDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<Page<RecipeSummary>> {
  return async function listRecipes(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<Page<RecipeSummary>> {
    requireAdmin(actor);

    const parsed = listQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const { query, ignored } = sanitizeListQuery(parsed.data, RECIPE_QUERYABLE);
    deps.log.ignoredFields(LIST_NAME, ignored);

    const { offset, limit } = deps.toOffsetLimit(query.page, query.pageSize);
    const { rows, total } = await deps.recipes.listAlive(offset, limit, query);

    return deps.buildPage(
      rows.map((row) => toSummary(row, deps.images)),
      total,
      query.page,
      limit,
    );
  };
}
