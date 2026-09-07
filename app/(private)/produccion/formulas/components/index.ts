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
  stepDocumentToText,
  textToStepDocument,
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
// El barrel es la unica puerta de estos tres archivos (R46). `recipe-step-schema` y
// `recipe-step-editor` son los dos unicos que importan la libreria del editor.
export { editorJsonToStepDocument, stepDocumentToEditorJson } from './recipe-step-document';
export { RECIPE_STEP_EXTENSIONS } from './recipe-step-schema';
export { RecipeStepEditor, type RecipeStepEditorProps } from './recipe-step-editor';
