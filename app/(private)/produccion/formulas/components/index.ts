// Sin `'use client'`: la frontera la declara cada componente, y así `page.tsx` sigue siendo de
// servidor aunque importe de aquí.
export { DeleteRecipeDialog } from './delete-recipe-dialog';
export { FormulaPdfUpload } from './formula-pdf-upload';
export {
  ACTIONS_COLUMN_ID,
  IMAGE_COLUMN_ID,
  buildRecipeColumns,
  type RecipeColumn,
  type RecipeColumnId,
} from './recipe-columns';
export { RECIPE_SKELETON_COLUMN_COUNT } from './recipe-columns-skeleton';
export { RecipeListEmpty } from './recipe-list-empty';
export { RecipeListError } from './recipe-list-error';
export {
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SHARED_PAGE_SIZES,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildRecipeListQuery,
  clearSearchAndFilters,
  hasActiveSearchOrFilter,
  parseRecipeListParams,
  recipeListHref,
} from './recipe-list-params';
export { RecipeListSection } from './recipe-list-section';
export {
  RECIPE_NO_RESULTS_TEXT,
  RECIPE_TABLE_ID,
  RECIPE_TABLE_TEXTS,
  RecipeTable,
  type RecipeTableProps,
} from './recipe-table';
export { RecipeTableSkeleton } from './recipe-table-skeleton';

export {
  buildRecipePayload,
  buildRecipeVersionPayload,
  createLocalKey,
  extractFieldError,
  extractGeneralLinesError,
  extractGeneralToolsError,
  extractLineErrors,
  extractStepErrors,
  extractToolErrors,
  toLineFormValues,
  toToolFormValues,
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
  type RecipeToolErrorMessages,
  type RecipeToolErrors,
  type RecipeToolFieldName,
  type RecipeToolFormValue,
  type RecipeToolPayload,
  type RecipeVersionFormState,
  type RecipeVersionPayload,
} from './recipe-form-state';
export { ProductPicker, type ProductPickerOption, type ProductPickerProps } from './product-picker';
export {
  RECIPE_TOOL_ERROR_MESSAGES,
  RecipeLinesField,
  clampPercentageToRemaining,
  referenceAmountForPercentage,
  sanitizePercentageInput,
  sanitizeToolQuantityInput,
  type RecipeLinesFieldProps,
} from './recipe-lines-field';
export { RecipeStepsField, type RecipeStepsFieldProps } from './recipe-steps-field';
export { RecipeImageField, type RecipeImageFieldProps } from './recipe-image-field';
export { RecipeForm, type RecipeFormProps } from './recipe-form';
export {
  PropagateVersionsDialog,
  type PropagateVersionsDialogProps,
} from './propagate-versions-dialog';
export {
  RecipeVersionForm,
  type RecipeVersionFormOriginal,
  type RecipeVersionFormProps,
} from './recipe-version-form';
export { RecipeVersionList, type RecipeVersionListProps } from './recipe-version-list';
export {
  compareWithOriginal,
  type RemovedLine,
  type VersionLineMark,
} from './recipe-version-diff';

// `recipe-step-schema.ts` no sale por aquí: su export tiene un tipo de la librería del editor, y el
// barrel dejaría usarlo desde cualquier archivo sin importar la librería, que debe quedar aislada.
export { editorJsonToStepDocument, stepDocumentToEditorJson } from './recipe-step-document';
export { RecipeStepEditor, type RecipeStepEditorProps } from './recipe-step-editor';
