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
  COVERAGE_COLUMN_ID,
  MISSING_VALUE_MARK,
  ORDER_DEFAULT_PINNED_COLUMNS,
  ORDER_NUMBER_COLUMN_ID,
  PRESENTATION_NAME_COLUMN_ID,
  QUANTITY_COLUMN_ID,
  RECIPE_NAME_COLUMN_ID,
  RESPONSIBLES_COLUMN_ID,
  buildOrderColumns,
  type OrderColumnsDeps,
} from './order-columns';
export { OrderField, type OrderFieldProps } from './order-field';
export { multiplyDecimal, subtractDecimal } from './order-decimal';
export { ORDER_AMOUNT_SYMBOL, formatOrderAmount, orderAmountTitle } from './order-amount';
export {
  ORDER_COST_QUOTE_ERROR_TESTID,
  ORDER_COST_QUOTE_QUOTING_TESTID,
  ORDER_COST_QUOTE_TESTID,
  ORDER_COST_QUOTE_VALUE_TESTID,
  OrderCostQuote,
} from './order-cost-quote';
export {
  ORDER_COST_QUOTE_DEBOUNCE_MS,
  useOrderCostQuote,
  type OrderCostQuoteState,
} from './use-order-cost-quote';
export {
  ORDER_BUSINESS_FIELDS,
  ORDER_FORM_CANCEL_TESTID,
  ORDER_FORM_ERROR_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_FORM_TITLE_TESTID,
  ORDER_SHEET_COVERAGE_TESTID,
  ORDER_SHEET_RESPONSIBLES_TESTID,
  ORDER_PRIORITY_OPTION_TESTID,
  ORDER_PRIORITY_SELECT_TESTID,
  ORDER_STATUS_FIELD,
  ORDER_STATUS_OPTION_TESTID,
  ORDER_STATUS_SELECT_TESTID,
  OrderForm,
  type OrderFormProps,
  type OrderSheetSection,
} from './order-form';
export {
  ORDER_DISTRIBUTION_ADD_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_ADD_TESTID,
  ORDER_DISTRIBUTION_AVAILABLE_TESTID,
  ORDER_DISTRIBUTION_ERROR_TESTID,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_LINE_PROBLEM_TESTID,
  ORDER_DISTRIBUTION_LINE_REMOVE_TESTID,
  ORDER_DISTRIBUTION_LINE_TESTID,
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
  ORDER_DISTRIBUTION_TESTID,
  ORDER_DISTRIBUTION_WARNING_TESTID,
  ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID,
  OrderDistributionField,
  type OrderDistributionFieldProps,
} from './order-distribution-field';
export {
  ORDER_DISTRIBUTION_DEBOUNCE_MS,
  availabilityBlocksSave,
  fromOrderPresentationLines,
  toPresentationLinesInput,
  useOrderDistributionAvailability,
  type OrderDistributionAvailability,
  type OrderDistributionAvailabilityInput,
  type OrderDistributionLine,
} from './use-order-distribution-availability';
export { OrderListEmpty } from './order-list-empty';
export {
  ORDER_INGREDIENTS_EMPTY_TESTID,
  ORDER_INGREDIENTS_ERROR_TESTID,
  ORDER_INGREDIENTS_LOADING_TESTID,
  ORDER_INGREDIENTS_TABLE_TESTID,
  ORDER_INGREDIENTS_TESTID,
  OrderIngredientsTable,
  type OrderIngredientsTableProps,
} from './order-ingredients-table';
export {
  ORDER_RECIPE_IMAGE_TESTID,
  OrderRecipeImage,
  type OrderRecipeImageProps,
} from './order-recipe-image';
export { OrderListError } from './order-list-error';
export {
  CREATED_AT_COLUMN_ID,
  CREATED_FROM_PARAM,
  CREATED_TO_PARAM,
  FILTER_SEPARATOR,
  FIRST_PAGE,
  ORDER_SEARCH_MAX_LENGTH,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  PRIORITY_COLUMN_ID,
  PRIORITY_PARAM,
  SEARCH_PARAM,
  SORT_PARAM,
  SORT_SEPARATOR,
  STATUS_COLUMN_ID,
  STATUS_PARAM,
  buildOrderListQuery,
  orderListHref,
  parseOrderListParams,
  withSearchResetsPage,
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
  OrderRowResponsibles,
  OrderRowSheetActions,
  OrderSheet,
  type OrderRowResponsiblesProps,
  type OrderRowSheetActionsProps,
  type OrderSheetProps,
} from './order-sheet';
export {
  EMPTY_RESPONSIBLES_CATALOG,
  ORDER_RESPONSIBLES_EMPTY_TESTID,
  ORDER_RESPONSIBLES_TESTID,
  OrderResponsibles,
  RESPONSIBLE_CANDIDATES_EMPTY_TESTID,
  RESPONSIBLE_CANDIDATE_TESTID,
  RESPONSIBLE_CONFIRM_TESTID,
  RESPONSIBLE_ERROR_TESTID,
  RESPONSIBLE_GROUP_NAME_TESTID,
  RESPONSIBLE_GROUP_TESTID,
  RESPONSIBLE_ORDER_ID_FIELD,
  RESPONSIBLE_PERSON_NAME_TESTID,
  RESPONSIBLE_PERSON_TESTID,
  RESPONSIBLE_REMOVE_GROUP_TESTID,
  RESPONSIBLE_REMOVE_PERSON_TESTID,
  RESPONSIBLE_SEARCH_TESTID,
  RESPONSIBLE_USER_IDS_FIELD,
  RESPONSIBLE_USER_ID_FIELD,
  RESPONSIBLE_WORK_GROUPS_EMPTY_TESTID,
  RESPONSIBLE_WORK_GROUP_IDS_FIELD,
  RESPONSIBLE_WORK_GROUP_ID_FIELD,
  RESPONSIBLE_WORK_GROUP_TESTID,
  assignResponsiblesSuccessMessage,
  groupResponsiblesByOrigin,
  removeWorkGroupSuccessMessage,
  type OrderResponsiblesCatalog,
  type OrderResponsiblesProps,
  type ResponsibleGroup,
  type ResponsiblePersonOption,
  type ResponsibleWorkGroupOption,
} from './order-responsibles';
// `ResponsibleAvatars` vive en `components/shared/` desde que tuvo un segundo consumidor. Se
// sigue reexportando aqui para que la ruta de pedidos lo consuma por su barrel de siempre.
export {
  MISSING_RESPONSIBLES_MARK,
  RESPONSIBLE_AVATARS_LIMIT,
  RESPONSIBLE_AVATARS_TESTID,
  RESPONSIBLE_AVATAR_TESTID,
  RESPONSIBLE_MISSING_TESTID,
  RESPONSIBLE_OVERFLOW_NAMES_TESTID,
  RESPONSIBLE_OVERFLOW_TESTID,
  ResponsibleAvatars,
  responsiblesOverflowLabel,
  type ResponsibleAvatarsProps,
} from '@/components/shared/responsible-avatars';
export {
  RECIPE_FIELD,
  RECIPE_PICKER_TESTID,
  RecipePicker,
  type RecipePickerOption,
  type RecipePickerPage,
  type RecipePickerProps,
} from './recipe-picker';
export {
  ORDER_COVERAGE_LABELS,
  ORDER_PRIORITY_FILTER_OPTIONS,
  ORDER_PRIORITY_LABELS,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_STATUS_LABELS,
  OrderCoverageBadge,
  OrderPriorityBadge,
  OrderStatusBadge,
} from './order-status-badge';
export {
  ORDER_LIST_CLEAR_SEARCH_TESTID,
  ORDER_LIST_NO_MATCHES_TESTID,
  ORDER_NO_MATCHES_MESSAGE,
  ORDER_TABLE_ID,
  ORDER_TABLE_TEXTS,
  OrderTable,
  type OrderTableProps,
} from './order-table';
