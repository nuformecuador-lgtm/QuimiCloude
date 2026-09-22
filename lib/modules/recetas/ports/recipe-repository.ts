import type { ListQuery } from '../domain/list-query';
import type { RecipeScope } from '../domain/recipe-scope';
import type { RecipeStepView } from '../domain/recipe-view';

/**
 * Puerto de persistencia de receta (`design.md > 7.3`). El sufijo `Alive` en el nombre de
 * metodo NO es adorno: el filtro `deleted_at IS NULL` es responsabilidad de ESTE
 * puerto/su adaptador, no del dominio (R36). No hay ninguna operacion de restaurar ni de
 * listar borradas (R36).
 *
 * Resultados discriminados, nunca excepciones de Prisma: el adaptador traduce
 * `23505` -> `'duplicate'` y `23514` -> un error de validacion antes de que el dominio lo
 * vea (`design.md > 7.3`). **La unicidad de R10 la garantiza unicamente el indice unico
 * parcial**: no hay comprobacion previa por `nameNormalized`, que seria una carrera.
 *
 * Los cinco metodos exigen `scope: RecipeScope` al FINAL de la firma. Ponerlo en la firma
 * -y no como un filtro que el adaptador decida aplicar o no- es lo que hace que una
 * LLAMADA que lo olvide no compile: quien escriba un sexto llamante dentro de un año no
 * puede enterarse en produccion de que le faltaba la empresa. Una implementacion que lo
 * omita si compila (TypeScript acepta asignar una funcion de menor aridad donde se espera
 * una de mayor), asi que esa mitad la vigila una guardia, no el compilador.
 *
 * «De otra empresa» sale por el mismo camino que «no existe» -`null` o `'not_found'`-:
 * distinguirlos le daria a quien pregunta un oraculo sobre lo que otra empresa tiene.
 */

/** Linea de producto, tal como el dominio la entrega al puerto o la recibe de vuelta. */
export type RecipeLineData = {
  readonly productId: string;
  /** Cadena con 2 decimales, "97.50": el dominio no puede importar `@prisma/client`
   *  (`design.md > 2`). Sin unidad (R1). */
  readonly percentage: string;
};

/** Linea de producto tal como sale de una lectura, con su propio identificador. */
export type RecipeLineRow = RecipeLineData & {
  readonly id: string;
};

/**
 * Datos de negocio de una receta, ya validados por `recipe-input.ts`, listos para
 * `create`/`replaceAlive` (`design.md > 7.1`, `> 8`). `imagePath` es la ruta FINAL que el
 * caso de uso decidio -conservar, nueva o `null`-: el puerto no decide nada sobre la
 * imagen, solo persiste lo que se le entrega (D16: reemplazo completo).
 */
export type NewRecipe = {
  readonly name: string;
  readonly description: string | null;
  readonly steps: readonly RecipeStepView[];
  readonly lines: readonly RecipeLineData[];
  readonly imagePath: string | null;
};

/**
 * Salida de una lectura de receta (`design.md > 2`, `> 7.2`). `nameNormalized` no se
 * expone: es un detalle de persistencia que el dominio no necesita para responder. Las
 * `lines` siempre vienen pobladas; es el caso de uso de LISTAR el que las descarta al
 * construir `RecipeSummary` (D14, R33) -`RecipeSummary` no tiene campo `lines`-.
 */
export type RecipeRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly steps: readonly RecipeStepView[];
  readonly imagePath: string | null;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly RecipeLineRow[];
};

export interface RecipeRepository {
  create(
    data: NewRecipe,
    actorId: string,
    now: Date,
    scope: RecipeScope,
  ): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string, scope: RecipeScope): Promise<RecipeRow | null>;
  /**
   * QC-57 (R13, R14): ademas de la ventana, recibe el CONTRATO GENERICO ya saneado por el caso
   * de uso -orden, filtros y busqueda-. `offset`/`limit` siguen llegando calculados desde el
   * dominio (la aritmetica de paginacion se le inyecta, R40 de QC-26), y traducir `columnId`,
   * filtros y busqueda a SQL es del adaptador. `total` describe el conjunto YA FILTRADO.
   */
  listAlive(
    offset: number,
    limit: number,
    query: ListQuery,
    scope: RecipeScope,
  ): Promise<{ rows: readonly RecipeRow[]; total: number }>;
  replaceAlive(
    id: string,
    data: NewRecipe,
    actorId: string,
    now: Date,
    scope: RecipeScope,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(
    id: string,
    actorId: string,
    now: Date,
    scope: RecipeScope,
  ): Promise<'ok' | 'not_found'>;
}
