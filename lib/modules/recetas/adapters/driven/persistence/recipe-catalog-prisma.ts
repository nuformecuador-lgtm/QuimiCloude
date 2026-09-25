import { prisma } from '@/lib/shared/db/prisma';

import { recipeStepSchema } from '../../../domain/recipe-input';
import { normalizeRecipeName } from '../../../domain/recipe-name';

import type { RecipeCatalog, RecipeExecutionContent, RecipeId, RecipeRef } from '../../../domain/recipe-catalog';
import type { RecipeScope } from '../../../domain/recipe-scope';
import type { RecipeStepView } from '../../../domain/recipe-view';

import { recipeCompanyScope, type PrismaLike } from './company-scope';
import { normalizedSearchCondition } from './list-query-sql';

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
 * Ids de recetas de esa empresa cuyo nombre casa con `search`, INCLUIDAS LAS DADAS DE BAJA:
 * un pedido conserva su receta aunque la den de baja, y buscar ese nombre tiene que seguir
 * encontrandolo. `null` cuando el termino no normaliza a nada -no es una busqueda, no hay
 * nada que filtrar-, distinto de `[]` -ninguna receta casa-.
 */
export async function findRecipeIdsMatchingName(
  search: string,
  companyId: string,
): Promise<readonly RecipeId[] | null> {
  const condition = normalizedSearchCondition(search, normalizeRecipeName);
  if (condition === null) return null;

  const scope: RecipeScope = { companyId };
  const rows = await prisma.recipe.findMany({
    where: { AND: [recipeCompanyScope(scope), { nameNormalized: condition }] },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

/**
 * Implementa `RecipeCatalog['findAliveByNormalizedName']`: la receta VIVA de esa empresa cuyo
 * `name_normalized` es el de `name`, o `null`. CON `deleted_at IS NULL` en el `where` -a
 * diferencia de `findRecipeRefsIncludingDeleted`-: esta busqueda es para el choque de nombre de
 * QC-159, que solo le importa lo que hoy ocupa ese nombre.
 */
export async function findAliveRecipeByNormalizedName(
  name: string,
  companyId: string,
): Promise<{ id: RecipeId; name: string } | null> {
  const normalized = normalizeRecipeName(name);
  if (normalized === '') return null;

  const scope: RecipeScope = { companyId };
  const row = await prisma.recipe.findFirst({
    where: { AND: [recipeCompanyScope(scope), { nameNormalized: normalized, deletedAt: null }] },
    select: { id: true, name: true },
  });

  return row === null ? null : { id: row.id, name: row.name };
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
    readonly percentage: { toFixed(digits: number): string };
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
      percentage: line.percentage.toFixed(2),
    })),
  };
}

/**
 * Implementa `RecipeCatalog['findExecutionContentById']`, sobre el cliente que se le da. SIN
 * `deleted_at IS NULL` en el `where`, a proposito: una receta dada de baja tiene que poder
 * seguir ejecutandose, y la baja viaja en `isDeleted` -no se deduce por ausencia, como en
 * `findRecipeRefsIncludingDeleted`-.
 */
async function findExecutionContentByIdOn(
  tx: PrismaLike,
  id: RecipeId,
  companyId: string,
): Promise<RecipeExecutionContent | null> {
  const scope: RecipeScope = { companyId };
  const row = await tx.recipe.findFirst({
    where: { AND: [recipeCompanyScope(scope), { id }] },
    select: {
      id: true,
      name: true,
      deletedAt: true,
      steps: true,
      lines: { select: { productId: true, percentage: true } },
    },
  });

  return row === null ? null : toRecipeExecutionContent(row);
}

export async function findRecipeExecutionContentById(
  id: RecipeId,
  companyId: string,
): Promise<RecipeExecutionContent | null> {
  return findExecutionContentByIdOn(prisma, id, companyId);
}

/**
 * Fabrica sobre cliente: construye el lector de contenido de receta sobre el cliente que se le
 * pase -el `tx` de una transaccion compartida con otro modulo, por ejemplo-, mismo patron que
 * `createOrderWriteRepository` y `createMaterialReservations`.
 */
export function createRecipeExecutionReader(tx: PrismaLike = prisma): Pick<RecipeCatalog, 'findExecutionContentById'> {
  return {
    findExecutionContentById: (id, companyId) => findExecutionContentByIdOn(tx, id, companyId),
  };
}
