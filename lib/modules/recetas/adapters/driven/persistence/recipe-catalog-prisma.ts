import { prisma } from '@/lib/shared/db/prisma';

import type { RecipeId, RecipeRef } from '../../../domain/recipe-catalog';

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
): Promise<readonly RecipeRef[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.recipe.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, deletedAt: true },
  });

  return rows.map(toRecipeRef);
}
