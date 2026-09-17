// lib/modules/recetas/domain/recipe-scope.ts
/**
 * La empresa en cuyo nombre se consulta o se escribe en `recetas`. La construye el caso de
 * uso a partir de `actor.companyId`, siempre despues de `requirePermission`: este tipo
 * FILTRA que fila es visible o modificable, pero no decide si el actor puede llegar a
 * pedirlo -eso ya lo resolvio el permiso, antes-.
 *
 * `companyId` no es opcional: `recipes.company_id` es NOT NULL y no existe ninguna
 * operacion de este modulo que tenga sentido sin saber de que empresa habla.
 */
export type RecipeScope = { readonly companyId: string };
