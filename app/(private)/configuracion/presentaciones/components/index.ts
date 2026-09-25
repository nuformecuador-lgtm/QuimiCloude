// Barrel de los componentes de la ruta de presentaciones (R29,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel, y
// `presentation-list-error.tsx` (cliente) convive con `presentation-list-section.tsx` (servidor).
//
// La pagina y todo consumidor de fuera de la carpeta importan SIEMPRE desde aqui, nunca por ruta
// profunda. Entre hermanos de la propia carpeta los importes siguen siendo RELATIVOS: entrar por
// el barrel de la propia carpeta crearia un ciclo.
//
// **Cada nombre sale de UN solo archivo.** Dos de ellos se reexportan entre hermanos por
// comodidad de sus consumidores directos —`NAME_COLUMN_ID` desde `presentation-columns.tsx` y
// `PRESENTATION_SHEET_TESTID`/`PresentationSheetTarget` desde `presentation-sheet.tsx`—; aqui se
// publican solo desde el archivo que los DECLARA, para que el barrel no ofrezca dos puertas al
// mismo valor.
export {
  DELETE_PRESENTATION_CONFIRM_TESTID,
  DELETE_PRESENTATION_DIALOG_TESTID,
  DELETE_PRESENTATION_DISMISS_TESTID,
  DELETE_PRESENTATION_ERROR_MESSAGE_TESTID,
  DELETE_PRESENTATION_ERROR_TESTID,
  DELETE_PRESENTATION_FORM_TESTID,
  DELETE_PRESENTATION_ID_FIELD,
  DELETE_PRESENTATION_ID_TESTID,
  DELETE_PRESENTATION_MESSAGE_TESTID,
  DeletePresentationDialog,
  PRESENTATION_IN_USE_CODE,
  type DeletePresentationDialogProps,
} from './delete-presentation-dialog';
export {
  ACTIONS_COLUMN_ID,
  CONTENT_COLUMN_ID,
  NO_CONTENT_LABEL,
  PRESENTATION_COLUMN_COUNT,
  buildPresentationColumns,
} from './presentation-columns';
export {
  PRESENTATION_BUSINESS_FIELDS,
  PRESENTATION_CONTENT_FIELD,
  PRESENTATION_ERROR_CONTENT_TESTID,
  PRESENTATION_ERROR_NAME_TESTID,
  PRESENTATION_FIELD_CONTENT_TESTID,
  PRESENTATION_FIELD_NAME_TESTID,
  PRESENTATION_FORM_CANCEL_TESTID,
  PRESENTATION_FORM_ERROR_CODE_TESTID,
  PRESENTATION_FORM_ERROR_TESTID,
  PRESENTATION_FORM_SUBMIT_TESTID,
  PRESENTATION_FORM_TESTID,
  PRESENTATION_NAME_FIELD,
  PRESENTATION_SHEET_TESTID,
  PresentationForm,
  type PresentationFormProps,
  type PresentationSheetTarget,
} from './presentation-form';
export {
  PRESENTATION_LIST_EMPTY_MESSAGE_TESTID,
  PRESENTATION_LIST_EMPTY_TESTID,
  PRESENTATION_LIST_FIRST_PAGE_TESTID,
  PresentationListEmpty,
  type PresentationListEmptyProps,
} from './presentation-list-empty';
export {
  PRESENTATION_LIST_ERROR_CODE_TESTID,
  PRESENTATION_LIST_ERROR_MESSAGE_TESTID,
  PRESENTATION_LIST_ERROR_TESTID,
  PRESENTATION_LIST_RETRY_TESTID,
  PresentationListError,
  type PresentationListErrorProps,
} from './presentation-list-error';
export {
  FIRST_PAGE,
  NAME_COLUMN_ID,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  buildPresentationListQuery,
  parsePresentationListParams,
  presentationListHref,
  type PresentationListSearchParams,
} from './presentation-list-params';
export {
  PRESENTATION_LIST_TESTID,
  PresentationListSection,
  type PresentationListSectionProps,
} from './presentation-list-section';
export {
  PRESENTATION_LIST_SKELETON_TESTID,
  PRESENTATION_ROW_SKELETON_TESTID,
  PRESENTATION_SKELETON_COLUMN_COUNT,
  PresentationListSkeleton,
} from './presentation-list-skeleton';
export {
  PRESENTATION_ACTION_DELETE_TESTID,
  PRESENTATION_ACTION_EDIT_TESTID,
  PRESENTATION_ROW_ACTIONS_TESTID,
  PresentationRowActions,
  deletePresentationLabel,
  editPresentationLabel,
  type PresentationRowActionsProps,
} from './presentation-row-actions';
export {
  PRESENTATION_CREATE_OPEN_TESTID,
  PresentationSheet,
  type PresentationSheetProps,
} from './presentation-sheet';
export {
  PRESENTATION_TABLE_ID,
  PRESENTATION_TABLE_TEXTS,
  PresentationTable,
  type PresentationTableProps,
} from './presentation-table';
// `PresentationUnitSelect` ya no es propio de esta ruta: QC-80 (T10) lo promovio a
// `components/shared/` porque el alta rapida de `components/shared/presentation-select.tsx`
// tambien tiene que pedir la unidad (R11), y un componente compartido no puede importar de
// `app/` sin invertir las capas. Se reexporta aqui para que la ruta lo siga consumiendo por su
// barrel, sin cambiar ni un consumidor.
export {
  PRESENTATION_UNIT_ERROR_TESTID,
  PRESENTATION_UNIT_FIELD,
  PRESENTATION_UNIT_LABEL,
  PRESENTATION_UNIT_OPTION_TESTID,
  PRESENTATION_UNIT_PLACEHOLDER,
  PRESENTATION_UNIT_SELECT_TESTID,
  PresentationUnitSelect,
} from '@/components/shared/presentation-unit-select';
