'use client';

import type { CSSProperties, ReactNode } from 'react';

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  FilterIcon,
  MoreVerticalIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { DataTableColumn, DataTableSort, DataTableTexts } from './data-table-types';

/**
 * Menu por columna y celda de cabecera (`design.md > 2, 5, 8`, T7). Dos piezas de un mismo
 * archivo porque comparten la misma columna y el mismo estado de orden, y porque
 * `data-table.tsx` (T11) las compone juntas dentro del mismo `<th>`.
 *
 * Ninguna de las dos consulta ni navega (R2, R30): solo emiten por callback.
 */

/** Objetivo tactil minimo (44 px), mismo criterio que `delete-product-dialog.tsx` (R27). */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Alterna el orden de una columna al activar su cabecera (no el menu, que ordena de forma
 * explicita): sin orden -> ascendente -> descendente -> ascendente. Nunca vuelve a "sin orden":
 * no es lo que pide el criterio de T7.
 */
function toggleHeaderSort<TRow>(
  column: DataTableColumn<TRow>,
  currentSort: DataTableSort | null,
): DataTableSort {
  if (currentSort === null || currentSort.columnId !== column.id) {
    return { columnId: column.id, direction: 'asc' };
  }

  return {
    columnId: column.id,
    direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
  };
}

export type DataTableHeaderMenuProps<TRow> = {
  readonly column: DataTableColumn<TRow>;
  readonly sort: DataTableSort | null;
  readonly isPinned: boolean;
  readonly texts: DataTableTexts;
  readonly onSortChange: (sort: DataTableSort | null) => void;
  readonly onTogglePin: () => void;
  readonly onOpenFilter: () => void;
};

/**
 * Menu por columna: ordenar asc/desc (solo `sortable`), fijar/soltar (solo `pinnable !== false`)
 * y abrir el filtro de la columna (solo si declara `filter`). Se abre con un boton **visible**
 * (nunca `:hover`), operable con teclado porque es el `dropdown-menu` de shadcn (Base UI, ya
 * navega con flechas y abre con Enter/Espacio sobre el disparador).
 *
 * No recibe ni emite `DataTableParams` (`design.md > 3.1`): quien compone (`data-table.tsx`)
 * traduce estos callbacks a la forma completa que exige R7.
 *
 * `aria-label` del disparador: `texts.columnMenu` (el verbo) mas `column.label` (el dato que ya
 * llega por la configuracion de columnas). Ningun texto de dominio queda incrustado (R22).
 */
export function DataTableHeaderMenu<TRow>({
  column,
  sort,
  isPinned,
  texts,
  onSortChange,
  onTogglePin,
  onOpenFilter,
}: DataTableHeaderMenuProps<TRow>) {
  const isSortable = column.sortable === true;
  const isPinnable = column.pinnable !== false;
  const isFilterable = column.filter !== undefined;

  if (!isSortable && !isPinnable && !isFilterable) {
    return null;
  }

  const activeDirection = sort !== null && sort.columnId === column.id ? sort.direction : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(TOUCH_TARGET)}
            aria-label={`${column.label} ${texts.columnMenu}`.trim()}
            data-testid={`data-table-header-menu-${column.id}`}
          />
        }
      >
        <MoreVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" data-testid={`data-table-header-menu-content-${column.id}`}>
        {isSortable ? (
          <DropdownMenuItem
            data-testid={`data-table-sort-asc-${column.id}`}
            aria-current={activeDirection === 'asc' ? 'true' : undefined}
            onClick={() => onSortChange({ columnId: column.id, direction: 'asc' })}
          >
            <ArrowUpIcon aria-hidden="true" />
            {texts.sortAscending}
          </DropdownMenuItem>
        ) : null}

        {isSortable ? (
          <DropdownMenuItem
            data-testid={`data-table-sort-desc-${column.id}`}
            aria-current={activeDirection === 'desc' ? 'true' : undefined}
            onClick={() => onSortChange({ columnId: column.id, direction: 'desc' })}
          >
            <ArrowDownIcon aria-hidden="true" />
            {texts.sortDescending}
          </DropdownMenuItem>
        ) : null}

        {isPinnable ? (
          <DropdownMenuItem
            data-testid={isPinned ? `data-table-unpin-${column.id}` : `data-table-pin-${column.id}`}
            onClick={onTogglePin}
          >
            {isPinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
            {isPinned ? texts.unpinColumn : texts.pinColumn}
          </DropdownMenuItem>
        ) : null}

        {isFilterable ? (
          <DropdownMenuItem
            data-testid={`data-table-filter-open-${column.id}`}
            onClick={onOpenFilter}
          >
            <FilterIcon aria-hidden="true" />
            {texts.filterColumn}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type DataTableHeaderCellProps<TRow> = {
  readonly column: DataTableColumn<TRow>;
  readonly sort: DataTableSort | null;
  readonly onSortChange: (sort: DataTableSort | null) => void;
  /** El menu de la columna (`DataTableHeaderMenu`), compuesto por quien llama (T11). */
  readonly children?: ReactNode;
  /**
   * Lado al que esta fijada la columna, o `false` si no lo esta (T11, R24). Marca la celda con
   * `data-pinned` para que el test la localice sin depender de estilos.
   */
  readonly pinned?: 'left' | 'right' | false;
  /** Estilo `position: sticky` con el desplazamiento calculado por quien compone (T11, R24, R28). */
  readonly style?: CSSProperties;
};

/**
 * Celda de cabecera: etiqueta, `aria-sort` (R12, R14) y un icono que refleja el orden vigente
 * -nunca solo color (R12)-. Si la columna es `sortable`, la propia etiqueta es un boton: activarla
 * por clic o por teclado alterna el orden (`toggleHeaderSort`). Si no es `sortable`, no hay
 * `aria-sort`, no hay boton y no se emite nada (R14).
 */
export function DataTableHeaderCell<TRow>({
  column,
  sort,
  onSortChange,
  children,
  pinned = false,
  style,
}: DataTableHeaderCellProps<TRow>) {
  const isSortable = column.sortable === true;
  const isActive = sort !== null && sort.columnId === column.id;
  const ariaSort = !isSortable ? undefined : isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  const SortIcon = isActive
    ? sort.direction === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <TableHead
      aria-sort={ariaSort}
      data-testid={`data-table-head-${column.id}`}
      data-pinned={pinned === false ? undefined : pinned}
      style={style}
      className={cn(column.align === 'end' && 'text-right', pinned !== false && 'bg-background')}
    >
      <div className="flex items-center gap-2">
        {isSortable ? (
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-md font-medium',
              TOUCH_TARGET,
            )}
            onClick={() => onSortChange(toggleHeaderSort(column, sort))}
          >
            <span>{column.label}</span>
            <SortIcon aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <span>{column.label}</span>
        )}
        {children}
      </div>
    </TableHead>
  );
}
