// Barrel de los componentes de la ruta de unidades (R43,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente, nunca
// aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel, y
// `unit-list-error.tsx` (cliente) convive con `unit-list-section.tsx` (servidor).
//
// La pagina y todo consumidor de fuera de la carpeta importan SIEMPRE desde aqui, nunca por ruta
// profunda. Entre hermanos de la propia carpeta los importes siguen siendo RELATIVOS: entrar por el
// barrel de la propia carpeta crearia un ciclo.
//
// **Cada nombre sale de UN solo archivo.** `UNIT_SHEET_TESTID` se reexporta entre hermanos por
// comodidad de sus consumidores directos —de `unit-form.tsx` a `unit-sheet.tsx`—; aqui se publica
// solo desde el archivo que lo DECLARA, para que el barrel no ofrezca dos puertas al mismo valor.
export {
  DELETE_UNIT_CONFIRM_TESTID,
  DELETE_UNIT_DIALOG_TESTID,
  DELETE_UNIT_DISMISS_TESTID,
  DELETE_UNIT_ERROR_MESSAGE_TESTID,
  DELETE_UNIT_ERROR_TESTID,
  DELETE_UNIT_FORM_TESTID,
  DELETE_UNIT_ID_FIELD,
  DELETE_UNIT_ID_TESTID,
  DELETE_UNIT_MESSAGE_TESTID,
  DeleteUnitDialog,
  UNIT_IN_USE_CODE,
  type DeleteUnitDialogProps,
} from './delete-unit-dialog';
export {
  ACTIONS_COLUMN_ID,
  EQUIVALENCE_COLUMN_ID,
  NAME_COLUMN_ID,
  SYMBOL_COLUMN_ID,
  UNIT_COLUMNS,
  UNIT_COLUMN_COUNT,
  createUnitColumns,
  type UnitBaseIndex,
} from './unit-columns';
export {
  NO_EQUIVALENCE_LABEL,
  formatFactor,
  formatUnitEquivalence,
  unitLabel,
} from './unit-equivalence';
export {
  NO_BASE_UNIT_LABEL,
  NO_BASE_UNIT_VALUE,
  UNIT_BASE_FIELD,
  UNIT_BUSINESS_FIELDS,
  UNIT_ERROR_BASE_TESTID,
  UNIT_ERROR_NAME_TESTID,
  UNIT_ERROR_SYMBOL_TESTID,
  UNIT_FACTOR_FIELD,
  UNIT_FIELD_BASE_TESTID,
  UNIT_FIELD_FACTOR_TESTID,
  UNIT_FIELD_NAME_TESTID,
  UNIT_FIELD_SYMBOL_TESTID,
  UNIT_FORM_CANCEL_TESTID,
  UNIT_FORM_ERROR_CODE_TESTID,
  UNIT_FORM_ERROR_TESTID,
  UNIT_FORM_SUBMIT_TESTID,
  UNIT_FORM_TESTID,
  UNIT_NAME_FIELD,
  UNIT_OPTION_BASE_TESTID,
  UNIT_OPTION_NO_BASE_TESTID,
  UNIT_SHEET_TESTID,
  UNIT_SYMBOL_FIELD,
  UnitForm,
  buildUnitFormData,
  type UnitFormProps,
} from './unit-form';
export { UNITS_LABEL } from './unit-labels';
export {
  UNIT_LIST_CLEAR_SEARCH_TESTID,
  UNIT_LIST_EMPTY_MESSAGE_TESTID,
  UNIT_LIST_EMPTY_TESTID,
  UNIT_LIST_FIRST_PAGE_TESTID,
  UnitListEmpty,
  type UnitListEmptyProps,
} from './unit-list-empty';
export {
  UNIT_LIST_ERROR_CODE_TESTID,
  UNIT_LIST_ERROR_MESSAGE_TESTID,
  UNIT_LIST_ERROR_TESTID,
  UNIT_LIST_RETRY_TESTID,
  UnitListError,
  type UnitListErrorProps,
} from './unit-list-error';
export {
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildUnitListQuery,
  parseUnitListParams,
  unitListHref,
  type UnitListSearchParams,
} from './unit-list-params';
export { UNIT_LIST_TESTID, UnitListSection, type UnitListSectionProps } from './unit-list-section';
export {
  UNIT_LIST_SKELETON_TESTID,
  UNIT_ROW_SKELETON_TESTID,
  UNIT_SKELETON_COLUMN_COUNT,
  UnitListSkeleton,
} from './unit-list-skeleton';
export {
  UNIT_ACTION_DELETE_TESTID,
  UNIT_ACTION_EDIT_TESTID,
  UNIT_ROW_ACTIONS_TESTID,
  UnitRowActions,
  deleteUnitLabel,
  editUnitLabel,
  type UnitRowActionsProps,
} from './unit-row-actions';
export { UNIT_CREATE_OPEN_TESTID, UnitSheet, type UnitSheetProps } from './unit-sheet';
export { UNIT_TABLE_ID, UNIT_TABLE_TEXTS, UnitTable, type UnitTableProps } from './unit-table';
