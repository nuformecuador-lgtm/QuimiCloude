import { prisma } from '@/lib/shared/db/prisma';

import { recipeStepSchema } from '../../../domain/recipe-input';

import type { RecipeExecutionContent, RecipeId, RecipeRef } from '../../../domain/recipe-catalog';
import type { RecipeScope } from '../../../domain/recipe-scope';
import type { RecipeStepView } from '../../../domain/recipe-view';

import { recipeCompanyScope } from './company-scope';

/**
 * Implementa `RecipeCatalog['findRefsIncludingDeleted']` (`domain/recipe-catalog.ts`,
 * QC-34 `design.md > 6.2`): el hueco que el contrato publico de `recetas` abre para que
 * otro modulo -QC-34 `pedidos` es su primer consumidor, R43/R44- pueda saber si una
 * receta existe y como se llama, SIN tocar la tabla ni el repositorio de receta. Mismo
 * patron que `inventario/.../product-catalog-prisma.ts` y `unidades/.../unit-catalog-prisma.ts`.
 *
 * A diferencia de esos dos, aqui NO hay filtro de vida en el `where`, y es deliberado: un
 * pedido conserva su referencia aunque la receta se de de baja (QC-33 R15), asi que la fila
 * tiene que seguir diciendo que se pidio (QC-34 R44). La baja no se deduce por ausencia
 * -eso confundiria «no existe» con «esta de baja» justo donde R15 y R25 los distinguen-:
 * viaja en el propio `Ref` como `isDeleted`, calculado de `deletedAt !== null`.
 *
 * UNA sola consulta para los N ids: quien lee una pagina de pedidos pide todos sus ids de
 * receta de golpe (R45). Un id que no existe simplemente no vuelve; no se inventa una fila.
 *
 * El `companyId` que llega por la interfaz publica se envuelve en un `RecipeScope` y se
 * compone con `recipeCompanyScope` -la MISMA definicion de ambito que usa el resto del
 * modulo-, nunca escrito a mano en el `where`: una receta de otra empresa tiene que
 * desaparecer exactamente igual que un id que no existe, y esa igualdad solo la garantiza
 * pasar por el mismo camino. El ambito se compone con `AND` contra `id: { in: ids }` y no
 * gana ningun filtro de vida: `isDeleted` sigue viajando en cada `Ref`.
 */

type RecipeCatalogRow = {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: Date | null;
};

/** Fila de Prisma -> `RecipeRef` del contrato publico. Funcion pura, testeable sin base. */
export function toRecipeRef(row: RecipeCatalogRow): RecipeRef {
  return { id: row.id, name: row.name, isDeleted: row.deletedAt !== null };
}

export async function findRecipeRefsIncludingDeleted(
  ids: readonly RecipeId[],
  companyId: string,
): Promise<readonly RecipeRef[]> {
  if (ids.length === 0) return [];

  const scope: RecipeScope = { companyId };
  const rows = await prisma.recipe.findMany({
    where: { AND: [recipeCompanyScope(scope), { id: { in: [...ids] } }] },
    select: { id: true, name: true, deletedAt: true },
  });

  return rows.map(toRecipeRef);
}

/**
 * Valida cada elemento crudo del `Json` de `steps` contra el esquema del dominio y descarta el
 * que no pasa, conservando el orden -mismo criterio de tolerancia que `recipe-prisma.ts`, pero
 * repetido aqui en vez de importado: este adaptador no toca el repositorio interno de receta.
 */
function toExecutionSteps(steps: unknown): readonly RecipeStepView[] {
  if (!Array.isArray(steps)) return [];

  const parsed: RecipeStepView[] = [];
  for (const step of steps) {
    const result = recipeStepSchema.safeParse(step);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

type RecipeExecutionContentRow = {
  readonly id: string;
  readonly name: string;
  readonly deletedAt: Date | null;
  readonly steps: unknown;
  readonly lines: ReadonlyArray<{
    readonly productId: string;
    readonly quantity: { toFixed(digits: number): string };
    readonly unitId: string;
  }>;
};

/** Fila de Prisma -> `RecipeExecutionContent`. Funcion pura, testeable sin base. */
export function toRecipeExecutionContent(row: RecipeExecutionContentRow): RecipeExecutionContent {
  return {
    id: row.id,
    name: row.name,
    isDeleted: row.deletedAt !== null,
    steps: toExecutionSteps(row.steps),
    lines: row.lines.map((line) => ({
      productId: line.productId,
      productName: null,
      quantity: line.quantity.toFixed(4),
      unitId: line.unitId,
    })),
  };
}

/**
 * Implementa `RecipeCatalog['findExecutionContentById']`. SIN `deleted_at IS NULL` en el
 * `where`, a proposito: una receta dada de baja tiene que poder seguir ejecutandose, y la baja
 * viaja en `isDeleted` -no se deduce por ausencia, como en `findRecipeRefsIncludingDeleted`-.
 */
export async function findRecipeExecutionContentById(
  id: RecipeId,
  companyId: string,
): Promise<RecipeExecutionContent | null> {
  const scope: RecipeScope = { companyId };
  const row = await prisma.recipe.findFirst({
    where: { AND: [recipeCompanyScope(scope), { id }] },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      steps: true,
      lines: { select: { productId: true, quantity: true, unitId: true } },
    },
  });

  return row === null ? null : toRecipeExecutionContent(row);
}
