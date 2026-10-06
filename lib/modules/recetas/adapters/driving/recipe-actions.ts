'use server';

import { identity, observabilidad, recetas } from '@/lib/composition';
import {
  createErrorStateTranslator,
  errorMessage,
  type ErrorCode,
  type ErrorState,
} from '@/lib/modules/errores';
import {
  createRecipeSchema,
  createRecipeVersionSchema,
  updateRecipeSchema,
  updateRecipeVersionSchema,
  RecetasError,
  type Actor,
  type Page,
  type RecipeDetail,
  type RecipeSummary,
  type RecipeVersionSummary,
  type UpdateRecipeResult,
} from '@/lib/modules/recetas';
import { runInRequestScope } from '@/lib/shared/request-scope';

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
 * con el `code` ESTABLE de la clase y el mensaje del CATALOGO, nunca el texto del error.
 * QC-70 (R10) sustituyo la copia local de `toErrorState` por el traductor unico, y (R12)
 * cambio el relanzado del error ajeno por el codigo generico `unexpected` con mensaje
 * neutro: el detalle real va al log del servidor y nunca al navegador (R13, R14).
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
  | ErrorState;

export type UpdateRecipeFormState =
  | { status: 'idle' }
  | { status: 'success'; propagated: UpdateRecipeResult['propagated'] }
  | ErrorState;

export type DeleteRecipeFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type RecipeQueryResult =
  | { status: 'success'; data: RecipeDetail }
  | ErrorState;

export type RecipeListResult =
  | { status: 'success'; data: Page<RecipeSummary> }
  | ErrorState;

export type CreateRecipeVersionFormState =
  | { status: 'idle' }
  | { status: 'success'; id: string }
  | ErrorState;

export type UpdateRecipeVersionFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | ErrorState;

export type RecipeVersionListResult =
  | { status: 'success'; data: readonly RecipeVersionSummary[] }
  | ErrorState;

/**
 * QC-70 (R21, R32): el codigo y el mensaje de la entrada invalida que rechaza el borde
 * salen del catalogo, no de un literal local. El texto es el mismo que ya se escribia aqui.
 */
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const INVALID_INPUT_MESSAGE = errorMessage(INVALID_INPUT_CODE);

/**
 * QC-70 (R10): el traductor UNICO, parametrizado por la clase base del modulo. Ya no hay
 * copia local: la implementacion vive en `@/lib/modules/errores` y la guardia del catalogo
 * (caso 2) da rojo si alguien vuelve a escribir la suya aqui.
 */
const toErrorState = createErrorStateTranslator(RecetasError, observabilidad.readRequestIdHeader);

/**
 * El actor que exige R1/D17: se resuelve UNA vez por invocacion, nunca dentro del dominio.
 *
 * Usuario y empresa salen de la sesion del servidor, leidos en paralelo dentro del mismo
 * ambito de peticion para que ambos vengan de la misma lectura; si falta cualquiera de los
 * dos se devuelve `null` y el caso de uso rechaza antes de tocar ningun puerto. La empresa
 * jamas sale de lo que envia quien llama a la action.
 */
async function currentActor(): Promise<Actor | null> {
  // El ambito envuelve solo este `Promise.all`: las dos caras comparten una lectura de sesion.
  const [sessionUser, sessionContext] = await runInRequestScope(() =>
    Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
  );
  if (sessionUser === null || sessionContext === null) return null;
  return {
    id: sessionUser.id,
    companyId: sessionContext.companyId,
    permissions: sessionUser.permissions,
  };
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
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
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
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const { warnings, propagated } = await recetas.updateRecipe(id, parsed.data, actor);
    // R49: una advertencia de borrado NUNCA convierte la edicion en error para el
    // llamante -la receta ya quedo persistida y correcta-, pero tampoco se descarta.
    for (const warning of warnings) logStorageWarning(warning);
    return { status: 'success', propagated };
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

/** Alta de una version de una original. Sin `lines`, nace con una copia de las de la original. */
export async function createRecipeVersionAction(
  originalId: string,
  input: unknown,
): Promise<CreateRecipeVersionFormState> {
  const parsed = createRecipeVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    const { id } = await recetas.createRecipeVersion(originalId, parsed.data, actor);
    return { status: 'success', id };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Edicion de una version: nombre y lineas; pasos, descripcion e imagen son los de su original. */
export async function updateRecipeVersionAction(
  versionId: string,
  input: unknown,
): Promise<UpdateRecipeVersionFormState> {
  const parsed = updateRecipeVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', code: INVALID_INPUT_CODE, message: INVALID_INPUT_MESSAGE };
  }

  const actor = await currentActor();

  try {
    await recetas.updateRecipeVersion(versionId, parsed.data, actor);
    return { status: 'success' };
  } catch (error) {
    return toErrorState(error);
  }
}

/** Versiones vivas de una original, incluidas las que estan por revisar. */
export async function listRecipeVersionsAction(originalId: string): Promise<RecipeVersionListResult> {
  const actor = await currentActor();

  try {
    const data = await recetas.listRecipeVersions(originalId, actor);
    return { status: 'success', data };
  } catch (error) {
    return toErrorState(error);
  }
}
