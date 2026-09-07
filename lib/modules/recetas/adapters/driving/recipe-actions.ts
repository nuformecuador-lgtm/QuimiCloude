'use server';

import { identity, recetas } from '@/lib/composition';
import {
  createRecipeSchema,
  updateRecipeSchema,
  RecetasError,
  type Actor,
  type Page,
  type RecipeDetail,
  type RecipeSummary,
} from '@/lib/modules/recetas';

/**
 * Server Actions del CRUD de recetas (T13, R38, R39, `design.md > 5`). Es el ADAPTADOR
 * DRIVING que consumira QC-26 -este archivo no pinta nada, no importa React ni JSX-.
 *
 * EL ACTOR sale de `identity.getSessionUser()` via `@/lib/composition` (`design.md > 5`,
 * D17): ningun caso de uso lee sesion, cookie ni cabecera por su cuenta. Mismo criterio
 * EXACTO que `product-actions.ts` de `inventario` (T12 de QC-20).
 *
 * VALIDACION EN EL BORDE (R38): create/update validan con el esquema del CONTRATO PUBLICO
 * -`createRecipeSchema`/`updateRecipeSchema`, los mismos que usa el caso de uso por
 * dentro- ANTES de invocar `recetas.createRecipe`/`recetas.updateRecipe`. Una entrada
 * invalida NUNCA llega al caso de uso: es lo que demuestra el test con un doble del caso
 * de uso que falla si se le llama.
 *
 * FORMA DE ENTRADA: `unknown` tipado (no `FormData`). A diferencia de `inventario`, una
 * receta trae listas anidadas -pasos, lineas de producto- que no tienen una
 * representacion natural en campos planos de formulario; como sera el formulario de
 * QC-26 es una decision de esa ficha, no de esta. Quien llama (QC-26) construye el
 * objeto tipado -o lo parsea de un `FormData` con sus propios campos- y esta action solo
 * valida y traduce.
 *
 * ERRORES: las clases de `RecetasError` se traducen a `{ status: 'error', code, message }`
 * con el `code` ESTABLE de la clase, nunca el texto. Cualquier error que NO sea de
 * dominio se relanza (`docs/conventions.md > Manejo de errores`).
 *
 * ADVERTENCIAS DE ALMACENAMIENTO (R49): `recetas.updateRecipe` puede devolver
 * `warnings` -un borrado de imagen que fallo, con su contexto (`design.md > 9.3`)-. Esta
 * action las REGISTRA (nunca las descarta en silencio) y de todos modos responde
 * `status: 'success'`: una advertencia de borrado NO convierte la edicion en un error
 * para quien invoca la Server Action.
 */

export type CreateRecipeFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | { status: 'error'; code: string; message: string };

export type UpdateRecipeFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type DeleteRecipeFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: string; message: string };

export type RecipeQueryResult =
  | { status: 'success'; data: RecipeDetail }
  | { status: 'error'; code: string; message: string };

export type RecipeListResult =
  | { status: 'success'; data: Page<RecipeSummary> }
  | { status: 'error'; code: string; message: string };

const INVALID_INPUT_MESSAGE = 'La entrada recibida no es valida.';

/** Traduce un error de dominio a estado serializable; relanza cualquier otro (`docs/conventions.md`). */
function toErrorState(error: unknown): { status: 'error'; code: string; message: string } {
  if (error instanceof RecetasError) {
    return { status: 'error', code: error.code, message: error.message };
  }
  throw error;
}

/** El actor que exige R1/D17: se resuelve UNA vez por invocacion, nunca dentro del dominio. */
async function currentActor(): Promise<Actor | null> {
  const sessionUser = await identity.getSessionUser();
  if (sessionUser === null) return null;
  return { id: sessionUser.id, permissions: sessionUser.permissions };
}

/**
 * Registra una advertencia de borrado de almacenamiento con su contexto (R49): NUNCA se
 * descarta en un `catch` vacio (`docs/conventions.md > Manejo de errores`). `console.error`
 * es el mecanismo de logging que usa el resto del repo para esto (no hay un servicio de
 * logging estructurado en este arbol todavia).
 */
function logStorageWarning(warning: { operation: string; path: string; message: string }): void {
  console.error(
    `[recetas] fallo al ${warning.operation} el archivo de almacenamiento en la ruta '${warning.path}': ${warning.message}`,
  );
}

/** Alta de receta (R5-R10, R38). Rechaza la entrada invalida SIN llamar a `recetas.createRecipe`. */
export async function createRecipeAction(input: unknown): Promise<CreateRecipeFormState> {
  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: 'invalid_input', message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const { id } = await recetas.createRecipe(parsed.data, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de receta: reemplazo completo (D16, R11, R38, R47-R49). */
export async function updateRecipeAction(id: string, input: unknown): Promise<UpdateRecipeFormState> {
  const parsed = updateRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: 'invalid_input', message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const { warnings } = await recetas.updateRecipe(id, parsed.data, actor);
    // R49: una advertencia de borrado NUNCA convierte la edicion en error para el
    // llamante -la receta ya quedo persistida y correcta-, pero tampoco se descarta.
    for (const warning of warnings) logStorageWarning(warning);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Borrado logico de receta (R6, R27, R35-R37). Sin imagen que tocar. */
export async function deleteRecipeAction(id: string): Promise<DeleteRecipeFormState> {
  const actor = await currentActor();

  try {
    await recetas.deleteRecipe(id, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Detalle de una receta (R18, R24, R33, R34, R37). Consulta: argumento tipado. */
export async function getRecipeAction(id: string): Promise<RecipeQueryResult> {
  const actor = await currentActor();

  try {
    const data = await recetas.getRecipe(id, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}

/**
 * Lista paginada de recetas (R29-R34, R36). Consulta: argumento tipado, y la cadena entera
 * vive DENTRO del caso de uso (QC-57 R30): `createListQuerySchema()` valida la forma,
 * `sanitizeListQuery` poda contra `RECIPE_QUERYABLE`, el caso de uso registra lo omitido
 * por el puerto `ListQueryLog` y el repositorio recibe la consulta ya saneada. Esta action
 * no repite ninguno de esos pasos.
 */
export async function listRecipesAction(query: unknown): Promise<RecipeListResult> {
  const actor = await currentActor();

  try {
    const data = await recetas.listRecipes(query, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
