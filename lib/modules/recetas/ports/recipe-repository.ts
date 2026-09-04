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
 */

/** Linea de producto, tal como el dominio la entrega al puerto o la recibe de vuelta. */
export type RecipeLineData = {
  readonly productId: string;
  /** Cadena decimal(14,4): el dominio no puede importar `@prisma/client` (`design.md > 2`). */
  readonly quantity: string;
  /** Referencia al catalogo de `unidades` (R50, deroga R15): ya no es texto libre. */
  readonly unitId: string;
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
  create(data: NewRecipe, actorId: string, now: Date): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string): Promise<RecipeRow | null>;
  listAlive(offset: number, limit: number): Promise<{ rows: readonly RecipeRow[]; total: number }>;
  replaceAlive(
    id: string,
    data: NewRecipe,
    actorId: string,
    now: Date,
  ): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
}
