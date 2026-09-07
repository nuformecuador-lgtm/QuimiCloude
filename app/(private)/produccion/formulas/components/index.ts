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

// --- Formulario (T13-T19, `design.md > 5`-`> 10`) ---
export {
  buildRecipePayload,
  createLocalKey,
  extractFieldError,
  extractGeneralLinesError,
  extractLineErrors,
  extractStepErrors,
  type ImageFieldState,
  type RecipeFormMode,
  type RecipeFormState,
  type RecipeLineErrors,
  type RecipeLineFieldName,
  type RecipeLineFormValue,
  type RecipeLinePayload,
  type RecipePayload,
  type RecipeStepErrors,
  type RecipeStepFormValue,
} from './recipe-form-state';
export { ProductPicker, type ProductPickerOption, type ProductPickerProps } from './product-picker';
export { UnitPicker, type UnitPickerProps } from './unit-picker';
export { RecipeLinesField, type RecipeLinesFieldProps } from './recipe-lines-field';
export { RecipeStepsField, type RecipeStepsFieldProps } from './recipe-steps-field';
export { RecipeImageField, type RecipeImageFieldProps } from './recipe-image-field';
export { RecipeForm, type RecipeFormProps } from './recipe-form';

// --- Pasos enriquecidos (QC-64 T3, T5, T6; `design.md > 3`, `> 4`, `> 7`) ---
// `recipe-step-schema.ts` NO se reexporta aqui, y es la unica excepcion a R46 en esta carpeta:
// su unico simbolo publico (`RECIPE_STEP_EXTENSIONS`) tiene tipo `Extensions` de `@tiptap/core`,
// asi que reexportarlo abriria una puerta —el barrel— por la que cualquier archivo del repo
// podria tocar un tipo de la libreria del editor sin escribir nunca el literal `@tiptap` que
// vigila `tests/guards/guard-editor-aislado.test.ts`. R25 y `design.md > 7` exigen que la
// libreria viva en DOS archivos; su unico consumidor es `recipe-step-editor.tsx`, que lo importa
// por ruta relativa dentro de la misma carpeta. La excepcion esta anotada en el caso del barrel
// de `tests/unit/recetas-ui/recipe-route-contract.test.ts` y hay una guardia que la sostiene.
export { editorJsonToStepDocument, stepDocumentToEditorJson } from './recipe-step-document';
export { RecipeStepEditor, type RecipeStepEditorProps } from './recipe-step-editor';
