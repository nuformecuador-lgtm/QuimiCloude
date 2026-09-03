// Barrel de los componentes de la ruta de recetas (R46,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel.
export { DeleteRecipeDialog } from './delete-recipe-dialog';
export {
  EMPTY_CELL,
  RECIPE_COLUMNS,
  type RecipeColumn,
  type RecipeColumnKey,
} from './recipe-columns';
export { RecipeListEmpty } from './recipe-list-empty';
export { RecipeListError } from './recipe-list-error';
export {
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  buildRecipeListQuery,
  parseRecipeListParams,
  type RecipeListParams,
  type RecipeListSearchParams,
  type RecipePageSize,
} from './recipe-list-params';
export { RecipeListSection } from './recipe-list-section';
export { RecipeListToolbar } from './recipe-list-toolbar';
export { ACTIONS_COLUMN_LABEL, RecipeTable } from './recipe-table';
export { RecipeTableSkeleton } from './recipe-table-skeleton';
