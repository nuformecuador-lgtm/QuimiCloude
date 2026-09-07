// Barrel de los componentes de la ruta de pedidos (R40,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel, y
// `order-list-error.tsx` (cliente) convive con `order-list-section.tsx` (servidor).
//
// La pagina y los componentes de la ruta importan SIEMPRE desde aqui, nunca por ruta profunda.
export {
  CANCEL_ORDER_CONFIRM_TESTID,
  CANCEL_ORDER_DIALOG_TESTID,
  CANCEL_ORDER_DISMISS_TESTID,
  CANCEL_ORDER_ERROR_TESTID,
  CANCEL_ORDER_ID_FIELD,
  CANCEL_ORDER_ID_TESTID,
  CANCEL_ORDER_REASON_FIELD,
  CANCEL_ORDER_REASON_TESTID,
  CancelOrderDialog,
  type CancelOrderDialogProps,
} from './cancel-order-dialog';
export {
  DELETE_ORDER_CONFIRM_TESTID,
  DELETE_ORDER_DIALOG_TESTID,
  DELETE_ORDER_DISMISS_TESTID,
  DELETE_ORDER_ERROR_TESTID,
  DELETE_ORDER_ID_FIELD,
  DELETE_ORDER_ID_TESTID,
  DELETE_ORDER_MESSAGE_TESTID,
  DeleteOrderDialog,
  type DeleteOrderDialogProps,
} from './delete-order-dialog';
export {
  ACTIONS_COLUMN_ID,
  CANCELLATION_REASON_COLUMN_ID,
  MISSING_VALUE_MARK,
  ORDER_DEFAULT_PINNED_COLUMNS,
  ORDER_NUMBER_COLUMN_ID,
  QUANTITY_COLUMN_ID,
  RECIPE_NAME_COLUMN_ID,
  buildOrderColumns,
  type OrderColumnsDeps,
} from './order-columns';
export { OrderField, type OrderFieldProps } from './order-field';
export {
  ORDER_BUSINESS_FIELDS,
  ORDER_FORM_CANCEL_TESTID,
  ORDER_FORM_ERROR_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_PRIORITY_OPTION_TESTID,
  ORDER_PRIORITY_SELECT_TESTID,
  ORDER_STATUS_FIELD,
  ORDER_STATUS_OPTION_TESTID,
  ORDER_STATUS_SELECT_TESTID,
  OrderForm,
  type OrderFormProps,
} from './order-form';
export { OrderListEmpty } from './order-list-empty';
export { OrderListError } from './order-list-error';
export {
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FILTER_SEPARATOR,
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  PRIORITY_COLUMN_ID,
  PRIORITY_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  STATUS_COLUMN_ID,
  STATUS_PARAM,
  buildOrderListQuery,
  orderListHref,
  parseOrderListParams,
  type OrderListSearchParams,
} from './order-list-params';
export { OrderListSection } from './order-list-section';
export { ORDER_SKELETON_COLUMN_COUNT, OrderListSkeleton } from './order-list-skeleton';
export {
  FINAL_ORDER_REASON,
  OrderRowActions,
  isFinalOrderStatus,
  type OrderRowActionsProps,
} from './order-row-actions';
export {
  ORDER_CREATE_OPEN_TESTID,
  ORDER_SHEET_TESTID,
  OrderRowSheetActions,
  OrderSheet,
  type OrderRowSheetActionsProps,
  type OrderSheetProps,
} from './order-sheet';
export {
  RECIPE_FIELD,
  RECIPE_PICKER_TESTID,
  RecipePicker,
  type RecipePickerOption,
  type RecipePickerPage,
  type RecipePickerProps,
} from './recipe-picker';
export {
  ORDER_PRIORITY_FILTER_OPTIONS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_LABELS,
  OrderPriorityBadge,
  OrderStatusBadge,
} from './order-status-badge';
export { ORDER_TABLE_ID, ORDER_TABLE_TEXTS, OrderTable, type OrderTableProps } from './order-table';
