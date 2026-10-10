/**
 * Barrel de `components/shared/data-table` (R1, T11). **La UNICA superficie publica.**
 *
 * Expone el componente y sus tipos, y las piezas puras que un consumidor necesita para tipar y
 * construir `DataTableParams` (`PAGE_SIZE_OPTIONS`, `SEARCH_DEBOUNCE_MS`, `createDefaultParams` y
 * las transiciones `with*`). NO reexporta piezas internas: `DataTableHeaderMenu`,
 * `DataTableFilters`, `DataTableFilterDate`, `DataTablePagination`, `usePinnedColumns` ni
 * `resolveDataTableState` / los estados sueltos. Ningun consumidor debe poder importarlas por
 * ruta profunda saltandose este barrel.
 */

export { DataTable, DATA_TABLE_FEATURES, DATA_TABLE_OPTED_FEATURES } from './data-table';

export { actionsColumn } from './actions-column';
export type { ActionsColumnOptions } from './actions-column';

export {
  createDefaultParams,
  PAGE_SIZE_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
} from './data-table-params';

export type {
  DataTableColumn,
  DataTableFilterSpec,
  DataTableFilterValue,
  DataTableParams,
  DataTableProps,
  DataTableSort,
  DataTableStates,
  DataTableTexts,
  SortDirection,
} from './data-table-types';
