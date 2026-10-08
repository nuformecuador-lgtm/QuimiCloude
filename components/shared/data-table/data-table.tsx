'use client';

import { useMemo, useRef, type CSSProperties } from 'react';
import {
  columnPinningFeature,
  columnSizingFeature,
  createColumnHelper,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnPinningState,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';

import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { TableSkeleton } from '@/components/shared/table-skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { DataTableColumnDivider } from './data-table-divider';
import { DataTableFilters } from './data-table-filters';
import { DataTableHeaderCell, DataTableHeaderMenu } from './data-table-header-menu';
import { DataTablePagination } from './data-table-pagination';
import { mergeCellStyle, toColumnTextClass, toWidthStyle } from './data-table-column-style';
import { withSort } from './data-table-params';
import {
  DataTableScrollNav,
  SCROLL_LEFT_FALLBACK,
  SCROLL_RIGHT_FALLBACK,
} from './data-table-scroll-nav';
import { DataTableEmpty, DataTableError, DataTableLoading, resolveDataTableState } from './data-table-states';
import type { DataTableColumn, DataTableProps, DataTableSort } from './data-table-types';
import { usePinnedColumns } from './use-pinned-columns';

/**
 * El componente compuesto (`design.md > 1, 4, 5`, T11): monta `@tanstack/react-table` 9.2.4 y
 * pinta cabecera, filas y las tres barras (filtros, tabla, paginacion).
 *
 * **Emite y no consulta** (R2, R30): no hay `fetch`, no hay Server Action, no hay
 * `lib/modules/`, `lib/composition` ni `next/navigation` en este archivo.
 */

/**
 * Las TRES capacidades que esta ficha activa de la libreria (R32): fijado de columnas
 * (R23-R26), ordenacion (R12, R14) y dimensionado de columnas (`columnSizingFeature`).
 *
 * `design.md > 4` listaba solo dos porque daba por hecho que `column.getStart()` venia incluido
 * en el fijado. Verificado en el paquete publicado
 * (`node_modules/@tanstack/table-core/dist/features/column-sizing/columnSizingFeature.utils.js`,
 * `column_getStart`/`column_getAfter`) que ese calculo lo aporta `columnSizingFeature`, no
 * `columnPinningFeature`: es el prerrequisito del fijado para poder calcular offsets, no una
 * capacidad interactiva de redimensionado (esa es `columnResizingFeature`, que seguimos sin
 * activar). Es la propia `design.md > 5` la que manda usar `getStart()` para el desplazamiento
 * sticky, asi que registrar `columnSizingFeature` es lo que cumple R24 por el mecanismo que el
 * diseno pide -no un tercer feature "de mas": es un feature necesario para lo que el diseno ya
 * exigia. R32 sigue cumpliendose: se optan solo las capacidades que la ficha usa, y siguen fuera
 * `columnResizingFeature`, `columnVisibilityFeature`, `columnOrderingFeature`,
 * `columnGroupingFeature`, `columnFacetingFeature`, `columnFilteringFeature`,
 * `globalFilteringFeature`, `rowPaginationFeature`, `rowSelectionFeature`, `rowExpandingFeature`,
 * `rowPinningFeature`, `rowAggregationFeature`, `cellSelectionFeature` y `cellSpanningFeature`.
 *
 * Lista literal, no derivada, para que el test afirme sobre algo que no puede desincronizarse de
 * lo que de verdad se registra abajo.
 */
export const DATA_TABLE_OPTED_FEATURES = [
  'columnPinningFeature',
  'columnSizingFeature',
  'rowSortingFeature',
] as const;

/**
 * Registro tipado de las implementaciones detras de `DATA_TABLE_OPTED_FEATURES`. `satisfies`
 * rechaza tanto que falte una clave como que sobre una: si alguien añade una capacidad aqui sin
 * añadirla a la lista de arriba (o viceversa), el `typecheck` lo revienta antes que el test.
 */
const OPTED_FEATURE_MODULES = {
  columnPinningFeature,
  columnSizingFeature,
  rowSortingFeature,
} satisfies Record<(typeof DATA_TABLE_OPTED_FEATURES)[number], unknown>;

/**
 * Constante exportada que se pasa a `useTable({ features: DATA_TABLE_FEATURES, ... })` (R32).
 * Nada de `stockFeatures`: ni agrupacion, ni expansion, ni seleccion de filas, ni visibilidad,
 * ni reordenacion, ni redimensionado interactivo de columnas. `tableFeatures` es la funcion
 * identidad de la libreria (verificado en
 * `node_modules/@tanstack/table-core/dist/helpers/tableFeatures.js`), asi que
 * `Object.keys(DATA_TABLE_FEATURES)` es exactamente `DATA_TABLE_OPTED_FEATURES`, sin
 * `coreFeatures` añadidas por la libreria: el core (fila sin tocar) es automatico y no es un
 * "feature" que se registre.
 */
export const DATA_TABLE_FEATURES = tableFeatures(OPTED_FEATURE_MODULES);

/** `DataTableSort | null` (R7) <-> `SortingState` de la libreria (R32). Una sola columna (`design.md > 3.1`). */
function toSortingState(sort: DataTableSort | null): SortingState {
  return sort === null ? [] : [{ id: sort.columnId, desc: sort.direction === 'desc' }];
}

function toDataTableSort(sorting: SortingState): DataTableSort | null {
  const [first] = sorting;
  return first === undefined ? null : { columnId: first.id, direction: first.desc ? 'desc' : 'asc' };
}

/** `PinnedColumnsState` (`{left, right}`, R25) <-> `ColumnPinningState` de la libreria (`{start, end}`). */
function toColumnPinningState(pinning: { readonly left: readonly string[]; readonly right: readonly string[] }): ColumnPinningState {
  return { start: [...pinning.left], end: [...pinning.right] };
}

/** Numero de filas de esqueleto que pinta `DataTableLoading` mientras `status === 'loading'`. */
export function DataTable<TRow>(props: DataTableProps<TRow>) {
  const {
    tableId,
    columns,
    rows,
    getRowId,
    params,
    totalPages,
    onParamsChange,
    status,
    errorMessage,
    texts,
    emptyAction,
    toolbarActions,
    searchable,
    states,
  } = props;

  const columnIds = useMemo(() => columns.map((column) => column.id), [columns]);
  /*
    El defecto por columna (`column.defaultPinned`, `data-table-types.ts`) en el orden en que
    las columnas se declaran. Sigue siendo un defecto, no una imposicion: el hook lo aplica
    dentro de su efecto de restauracion y SOLO si no hay nada persistido para este `tableId`
    (QC-35 `design.md > 6.3`), asi que soltar la columna sigue recordandose (R25, R26).
  */
  const defaultPinning = useMemo(
    () => ({
      left: columns.filter((column) => column.defaultPinned === 'left').map((column) => column.id),
      right: columns
        .filter((column) => column.defaultPinned === 'right')
        .map((column) => column.id),
    }),
    [columns],
  );
  const pinnedColumns = usePinnedColumns(tableId, columnIds, defaultPinning);

  const columnPinningState = useMemo(
    () => toColumnPinningState(pinnedColumns.pinning),
    [pinnedColumns.pinning],
  );
  const sortingState = useMemo(() => toSortingState(params.sort), [params.sort]);

  /**
   * `createColumnHelper`/`useTable` exigen `TData extends RowData` (`Record<string, any> |
   * Array<any>`, verificado en `type-utils.d.ts`). El contrato de esta ficha (R4,
   * `data-table-types.ts`, que esta ficha NO edita) deja `TRow` sin esa cota a proposito -"el
   * componente presenta filas de CUALQUIER tipo"-, asi que la frontera con la libreria se cierra
   * aqui con `RowData` y no con `TRow`: no se usa ningun accessor de la libreria (los "display"
   * columns no dependen del tipo de dato), y `row.original` se recupera como `TRow` al pintar la
   * celda con `column.cell(...)` (abajo), que es el unico sitio donde la forma real importa.
   */
  const columnHelper = useMemo(() => createColumnHelper<typeof DATA_TABLE_FEATURES, RowData>(), []);

  /**
   * Traduce `DataTableColumn<TRow>` (R3, R4: datos declarativos, sin tipo de dominio) a la
   * `columnDef` de la libreria. Columnas "display": el contenido de la celda lo pinta
   * `column.cell(row.original)` directamente (abajo), no `table.FlexRender`, porque `cell`
   * devuelve `ReactNode` y no necesita el contexto de celda de la libreria.
   *
   * `defaultPinned` implica fijable: una columna que nace fijada ofrece soltarla en su menu
   * aunque `pinnable` sea `false` (el defecto no es una imposicion, `data-table-types.ts`).
   */
  const tableColumns = useMemo(
    () =>
      columns.map((column) =>
        columnHelper.display({
          id: column.id,
          header: column.label,
          enableSorting: column.sortable === true,
          enablePinning: column.pinnable !== false || column.defaultPinned !== undefined,
        }),
      ),
    [columns, columnHelper],
  );

  const handleSortChange = (nextSort: DataTableSort | null) => {
    onParamsChange(withSort(params, nextSort));
  };

  /**
   * Wiring defensivo: la UI de esta ficha llama a `handleSortChange`/`pinnedColumns.togglePin`
   * directamente (arriba), no a `column.toggleSorting()`/`column.pin()`. Si algo interno de la
   * libreria llegara a invocar estos callbacks, quedan traducidos igualmente a R6/R7 y R25.
   */
  const handleTableSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = functionalUpdate(updater, sortingState);
    handleSortChange(toDataTableSort(next));
  };

  const handleTableColumnPinningChange: OnChangeFn<ColumnPinningState> = (updater) => {
    const next = functionalUpdate(updater, columnPinningState);
    pinnedColumns.setPinning({ left: [...next.start], right: [...next.end] });
  };

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    columns: tableColumns,
    // `rows` es `readonly TRow[]`; se cierra a `RowData` en la frontera con la libreria (ver nota
    // de `columnHelper` arriba). Misma referencia, sin copiar: R13 exige que ni siquiera pase por
    // un mapeo que pudiera reordenar o recortar.
    data: rows as ReadonlyArray<RowData>,
    getRowId: (row) => getRowId(row as TRow),
    manualSorting: true,
    state: { sorting: sortingState, columnPinning: columnPinningState },
    onSortingChange: handleTableSortingChange,
    onColumnPinningChange: handleTableColumnPinningChange,
  });

  /**
   * Lado fijado de una columna, traducido de `'start'|'end'` (logico, libreria) a `'left'|'right'`
   * (fisico, la convencion de `data-testid`/`data-pinned` de esta feature).
   */
  function getPinnedSide(columnId: string): 'left' | 'right' | false {
    const side = table.getColumn(columnId)?.getIsPinned();
    if (side === 'start') return 'left';
    if (side === 'end') return 'right';
    return false;
  }

  /**
   * Estilo `position: sticky` con el desplazamiento real de `column.getStart()`/`getAfter()`
   * (R24, R28), que aporta `columnSizingFeature` (ver nota junto a `DATA_TABLE_OPTED_FEATURES`).
   * `'left'` (fisico) lee `getStart('start')` (logico) y `'right'` lee `getAfter('end')`: la
   * libreria ya suma los `getSize()` de las columnas fijadas anteriores/posteriores de esa
   * region, asi que no hay indice ni ancho fijo que mantener a mano.
   */
  function getStickyStyle(columnId: string, side: 'left' | 'right'): CSSProperties {
    const column = table.getColumn(columnId);
    const offset =
      side === 'left' ? (column?.getStart('start') ?? 0) : (column?.getAfter('end') ?? 0);
    return {
      position: 'sticky',
      [side]: offset,
      zIndex: 1,
    };
  }

  /**
   * Foco en el control de filtro de la columna, mejor esfuerzo (R15, R27): la barra de filtros
   * ya esta siempre visible (no oculta tras el menu), asi que "abrir el filtro" es llevar el
   * foco a su control. Ningun filtro pierde funcionalidad si el control no existe todavia en el
   * DOM (p. ej. dentro de un `Popover` cerrado): simplemente no mueve el foco.
   */
  function focusColumnFilter(columnId: string) {
    const selector = `[data-testid="data-table-filter-${columnId}"], [data-testid="data-table-filter-date-${columnId}"], [data-testid="data-table-filter-min-${columnId}"]`;
    document.querySelector<HTMLElement>(selector)?.focus();
  }

  const rowCount = rows.length;
  const visibleState = resolveDataTableState(status, rowCount);
  const showToolbars = visibleState !== 'error';

  /**
   * Envoltorio del scroll interno (R28): el `overflow-x-auto` sigue viviendo en el
   * `div[data-slot="table-container"]` de `components/ui/table.tsx`; este `div` solo aporta
   * el `relative` donde se anclan las flechas overlay (`DataTableScrollNav`) y la ref con la
   * que las flechas localizan el contenedor con scroll sin abrir la primitiva (R33).
   */
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  // Lo que puede hacer desbordar la tabla: si cambia, las flechas re-evaluan sin esperar a
  // un `resize` (ver `contentKey` en `DataTableScrollNav`).
  const scrollContentKey = `${columns.length}:${rowCount}:${visibleState}`;

  // Despues de todos los hooks: sustituye a toda la tabla, barras y paginacion incluidas (R16-R18).
  if (visibleState === 'loading' && states?.loading !== undefined) {
    return <TableSkeleton {...states.loading} />;
  }
  if (visibleState === 'error' && states?.error !== undefined) {
    return <ErrorState {...states.error} />;
  }
  if (visibleState === 'empty' && states?.empty !== undefined) {
    return <EmptyState {...states.empty} />;
  }

  const columnAlign = (align: 'start' | 'end' | 'center') => {
    if (align === 'end') {
      return 'text-right';
    }
    if (align === 'center') {
      return 'text-center';
    }
    return '';
  };

  return (
    <div data-testid="data-table" className="flex flex-col gap-4">
      {showToolbars ? (
        <DataTableFilters
          columns={columns}
          params={params}
          texts={texts}
          onParamsChange={onParamsChange}
          toolbarActions={toolbarActions}
          searchable={searchable}
        />
      ) : null}

      {visibleState === 'error' ? (
        <DataTableError texts={texts} errorMessage={errorMessage} />
      ) : visibleState === 'loading' ? (
        <DataTableLoading texts={texts} columnCount={columns.length} />
      ) : visibleState === 'empty' ? (
        <DataTableEmpty texts={texts} emptyAction={emptyAction} />
      ) : (
        <div ref={tableWrapRef} className="relative">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column: DataTableColumn<TRow>, columnIndex: number) => {
                  const pinnedSide = getPinnedSide(column.id);
                  return (
                    <DataTableHeaderCell
                      key={column.id}
                      column={column}
                      sort={params.sort}
                      onSortChange={handleSortChange}
                      pinned={pinnedSide}
                      style={mergeCellStyle(
                        pinnedSide === false ? undefined : getStickyStyle(column.id, pinnedSide),
                        toWidthStyle(column),
                      )}
                      divider={columnIndex < columns.length - 1}
                    >
                      <DataTableHeaderMenu
                        column={column}
                        sort={params.sort}
                        isPinned={pinnedSide !== false}
                        texts={texts}
                        onSortChange={handleSortChange}
                        onTogglePin={() => pinnedColumns.togglePin(column.id)}
                        onOpenFilter={() => focusColumnFilter(column.id)}
                      />
                    </DataTableHeaderCell>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {/*
                R13: se pinta `table.getRowModel().rows` TAL CUAL llega. Ninguna capacidad de
                orden/filtro/paginacion de cliente esta registrada en `DATA_TABLE_FEATURES` (R32),
                asi que `getRowModel()` encadena hasta `getCoreRowModel()` sin transformar `data`
                (verificado en `coreRowModelsFeature.utils.js`): ni reordena, ni filtra, ni recorta,
                ni pagina, aunque `params` diga otra cosa.
              */}
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid={`data-table-row-${row.id}`}>
                  {columns.map((column: DataTableColumn<TRow>, columnIndex: number) => {
                    const pinnedSide = getPinnedSide(column.id);
                    // Divisor en todas salvo la ultima: marca donde termina cada columna.
                    const divider = columnIndex < columns.length - 1;
                    return (
                      <TableCell
                        key={column.id}
                        data-testid={`data-table-cell-${column.id}`}
                        data-pinned={pinnedSide === false ? undefined : pinnedSide}
                        style={mergeCellStyle(
                          pinnedSide === false ? undefined : getStickyStyle(column.id, pinnedSide),
                          toWidthStyle(column),
                        )}
                        className={cn(
                          columnAlign(column.align),
                          pinnedSide !== false && 'bg-background',
                          toColumnTextClass(column),
                          divider && 'relative',
                        )}
                      >
                        {column.cell(row.original as TRow)}
                        {divider ? (
                          <DataTableColumnDivider testId={`data-table-cell-divider-${column.id}`} />
                        ) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTableScrollNav
            containerRef={tableWrapRef}
            contentKey={scrollContentKey}
            scrollLeftLabel={texts.scrollLeft ?? SCROLL_LEFT_FALLBACK}
            scrollRightLabel={texts.scrollRight ?? SCROLL_RIGHT_FALLBACK}
          />
        </div>
      )}

      {showToolbars ? (
        <DataTablePagination
          params={params}
          totalPages={totalPages}
          texts={texts}
          onParamsChange={onParamsChange}
        />
      ) : null}
    </div>
  );
}
