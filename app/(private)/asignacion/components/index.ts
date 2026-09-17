// Barrel de los componentes de la ruta de asignacion (R33,
// `docs/architecture.md > Componentes > Regla: componentes de ruta en components/ con barrel index.ts`).
//
// Sin `'use client'`: la frontera cliente/servidor se declara en CADA archivo de componente,
// nunca aqui. Asi `page.tsx` sigue siendo Server Component aunque importe desde el barrel, y
// `assigned-orders-error.tsx` (cliente) convive con `assigned-orders-list-section.tsx`
// (servidor).
//
// La pagina y los componentes de la ruta importan SIEMPRE desde aqui, nunca por ruta profunda.
export {
  ASSIGNED_ORDER_ENTER_REASON_TESTID,
  ASSIGNED_ORDER_ENTER_TESTID,
  AssignedOrderEnterTrigger,
  assignedOrderEnterDisabledReason,
} from './assigned-order-enter-trigger';
export {
  ASSIGNED_ORDER_ENTER_COLUMN_ID,
  ASSIGNED_ORDER_NUMBER_COLUMN_ID,
  ASSIGNED_ORDER_PRIORITY_COLUMN_ID,
  ASSIGNED_ORDER_PRIORITY_LABELS,
  ASSIGNED_ORDER_QUANTITY_COLUMN_ID,
  ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID,
  ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID,
  ASSIGNED_ORDER_STATUS_COLUMN_ID,
  ASSIGNED_ORDER_STATUS_LABELS,
  ASSIGNED_ORDERS_DEFAULT_PINNED_COLUMNS,
  MISSING_VALUE_MARK,
  buildAssignedOrdersColumns,
} from './assigned-orders-columns';
export { AssignedOrdersEmpty } from './assigned-orders-empty';
export { AssignedOrdersError } from './assigned-orders-error';
export {
  FIRST_PAGE,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  assignedOrdersListHref,
  buildAssignedOrdersListQuery,
  parseAssignedOrdersListParams,
  toAssignedOrdersQuery,
  type AssignedOrdersSearchParams,
} from './assigned-orders-list-params';
export { AssignedOrdersListSection } from './assigned-orders-list-section';
export {
  ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT,
  AssignedOrdersSkeleton,
} from './assigned-orders-skeleton';
export {
  ASSIGNED_ORDERS_TABLE_ID,
  ASSIGNED_ORDERS_TABLE_TEXTS,
  AssignedOrdersTable,
  type AssignedOrdersTableProps,
} from './assigned-orders-table';
