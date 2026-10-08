// Barrel de los componentes de la ruta del dashboard. No declara frontera cliente/servidor: eso
// se declara en cada archivo de componente, nunca aqui.
export { DashboardContent } from './dashboard-content';
export {
  EXECUTION_TRACE_SECTION_TESTID,
  EXECUTION_TRACE_SECTION_TITLE,
  ExecutionTraceListSection,
} from './execution-trace-list-section';
export {
  CANCELLED_ONLY_LABEL,
  EXECUTION_TRACE_TABLE_ID,
  EXECUTION_TRACE_TABLE_TEXTS,
  ExecutionTraceTable,
  type ExecutionTraceTableProps,
} from './execution-trace-table';
export {
  ActiveOrderMark,
  DeletedOrderMark,
  TRACE_LINK_TEXT,
  buildExecutionTraceColumns,
  type ExecutionTraceColumnsDeps,
} from './execution-trace-columns';
export {
  ACTIVE_ORDER_MARK,
  DELETED_ORDER_MARK,
  EXECUTION_ACTION_LABELS,
  GO_BACK_MARK,
  TRACE_DURATION_SUFFIXES,
  TRACE_ORDER_STATUS_LABELS,
  formatElapsed,
  formatTraceDuration,
  formatTraceInstant,
} from './execution-trace-format';
export {
  CANCELLED_ON_VALUE,
  CANCELLED_PARAM,
  FIRST_PAGE,
  FROM_PARAM,
  LAST_AT_COLUMN_ID,
  ORDER_NUMBER_MAX_LENGTH,
  ORDER_NUMBER_PARAM,
  PAGE_PARAM,
  PAGE_SIZE_PARAM,
  PERSON_COLUMN_ID,
  PERSON_PARAM,
  TO_PARAM,
  buildExecutionTraceListQuery,
  createDefaultExecutionTraceListParams,
  executionTraceDetailHref,
  executionTraceListHref,
  fromDataTableParams,
  parseExecutionTraceListParams,
  toDataTableParams,
  toExecutionTraceListInput,
  withFiltersResetPage,
  type ExecutionTraceListParams,
  type ExecutionTraceListSearchParams,
} from './execution-trace-list-params';
