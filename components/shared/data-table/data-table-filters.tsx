'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import { DataTableFilterDate } from './data-table-filter-date';
import { SEARCH_DEBOUNCE_MS, withFilter, withSearch } from './data-table-params';
import type {
  DataTableColumn,
  DataTableFilterValue,
  DataTableParams,
  DataTableTexts,
} from './data-table-types';

/**
 * Barra de filtros y busqueda global (`design.md`, T8, R15, R16, R17, R27).
 *
 * **Solo emite.** Nada se filtra en el cliente (R13, R17): cada control llama a
 * `onParamsChange` con el `DataTableParams` completo y la pantalla/consumidor decide que hacer.
 * Solo aparecen las columnas que declaran `filter` (R15); limpiar un filtro SACA su clave del
 * objeto en vez de emitirla vacia (R16, via `withFilter`).
 */

const FIELD_TEXT = 'text-base';

export type DataTableFiltersProps<TRow> = {
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly params: DataTableParams;
  readonly texts: DataTableTexts;
  readonly onParamsChange: (next: DataTableParams) => void;
  /** Acciones de la barra, p. ej. "Nuevo producto" (R30: decididas por la pantalla). */
  readonly toolbarActions?: ReactNode;
  /**
   * Si se monta el campo de busqueda global. **Ausente = `true`**: el comportamiento de siempre
   * (R17). Con `false` el campo NO se monta -no se pinta deshabilitado ni oculto: no existe en
   * el DOM- para una lista que no admite busqueda (QC-35 `design.md > 6.2`).
   */
  readonly searchable?: boolean;
};

/** Campo de busqueda global, con rebote (R17, `design.md > 6`). Emite en `search`, no en `filters`. */
function DataTableSearchField({
  params,
  texts,
  onParamsChange,
}: Pick<DataTableFiltersProps<unknown>, 'params' | 'texts' | 'onParamsChange'>) {
  const [draft, setDraft] = useState(params.search);
  const paramsRef = useRef(params);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Mantiene la ultima version de `params` accesible desde el temporizador del rebote sin
    reprogramarlo en cada tecla: mutar un ref en un efecto no es `setState`, asi que no dispara
    el render en cascada que `react-hooks/set-state-in-effect` prohibe (visto en
    `delete-product-dialog.tsx`).
  */
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (next: string) => {
    setDraft(next);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onParamsChange(withSearch(paramsRef.current, next));
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <Input
      type="search"
      value={draft}
      aria-label={texts.search}
      placeholder={texts.search}
      data-testid="data-table-search"
      className={cn(touchTarget, FIELD_TEXT)}
      onChange={(event) => handleChange(event.target.value)}
    />
  );
}

/** Boton de limpiar un filtro (R16): saca la clave del objeto, nunca la emite vacia. */
function DataTableFilterClearButton({
  columnId,
  texts,
  onClear,
}: {
  readonly columnId: string;
  readonly texts: DataTableTexts;
  readonly onClear: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      touch
      aria-label={texts.clearFilter}
      data-testid={`data-table-filter-clear-${columnId}`}
      onClick={onClear}
    >
      <XIcon />
    </Button>
  );
}

export function DataTableFilters<TRow>({
  columns,
  params,
  texts,
  onParamsChange,
  toolbarActions,
  searchable = true,
}: DataTableFiltersProps<TRow>) {
  const filterableColumns = columns.filter((column) => column.filter !== undefined);

  return (
    <div className="flex flex-col gap-3" data-testid="data-table-filters">
      <div className="flex flex-wrap items-center gap-3">
        {searchable ? (
          <DataTableSearchField params={params} texts={texts} onParamsChange={onParamsChange} />
        ) : null}

        {toolbarActions === undefined ? null : (
          <div className="flex items-center gap-2" data-testid="data-table-toolbar-actions">
            {toolbarActions}
          </div>
        )}
      </div>

      {filterableColumns.length === 0 ? null : (
        <div className="flex flex-wrap items-end gap-3">
          {filterableColumns.map((column) => {
            const { filter } = column;
            if (filter === undefined) return null;

            const activeValue = params.filters[column.id];
            const clear = () => onParamsChange(withFilter(params, column.id, null));

            if (filter.kind === 'dateRange') {
              const dateValue = activeValue?.kind === 'dateRange' ? activeValue : undefined;
              return (
                <div key={column.id} className="flex items-end gap-1">
                  <DataTableFilterDate
                    columnId={column.id}
                    label={column.label}
                    value={dateValue}
                    texts={texts}
                    onChange={(next) => onParamsChange(withFilter(params, column.id, next))}
                  />
                  <DataTableFilterClearButton columnId={column.id} texts={texts} onClear={clear} />
                </div>
              );
            }

            if (filter.kind === 'numberRange') {
              const min = activeValue?.kind === 'numberRange' ? activeValue.min : null;
              const max = activeValue?.kind === 'numberRange' ? activeValue.max : null;

              const emitRange = (nextMin: number | null, nextMax: number | null) => {
                const next: DataTableFilterValue = { kind: 'numberRange', min: nextMin, max: nextMax };
                onParamsChange(withFilter(params, column.id, next));
              };

              return (
                <div key={column.id} className="flex items-end gap-1">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{column.label}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        aria-label={column.label}
                        value={min === null ? '' : min}
                        data-testid={`data-table-filter-min-${column.id}`}
                        className={cn(touchTarget, FIELD_TEXT, 'w-24')}
                        onChange={(event) =>
                          emitRange(event.target.value === '' ? null : Number(event.target.value), max)
                        }
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        aria-label={column.label}
                        value={max === null ? '' : max}
                        data-testid={`data-table-filter-max-${column.id}`}
                        className={cn(touchTarget, FIELD_TEXT, 'w-24')}
                        onChange={(event) =>
                          emitRange(min, event.target.value === '' ? null : Number(event.target.value))
                        }
                      />
                    </div>
                  </div>
                  <DataTableFilterClearButton columnId={column.id} texts={texts} onClear={clear} />
                </div>
              );
            }

            if (filter.kind === 'select') {
              const values = activeValue?.kind === 'select' ? activeValue.values : [];

              const toggle = (optionValue: string) => {
                const next = values.includes(optionValue)
                  ? values.filter((value) => value !== optionValue)
                  : [...values, optionValue];
                onParamsChange(
                  withFilter(params, column.id, next.length === 0 ? null : { kind: 'select', values: next }),
                );
              };

              return (
                <div key={column.id} className="flex items-end gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted',
                        touchTarget,
                      )}
                      data-testid={`data-table-filter-${column.id}`}
                    >
                      {column.label}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {filter.options.map((option) => (
                        <DropdownMenuCheckboxItem
                          key={option.value}
                          checked={values.includes(option.value)}
                          onCheckedChange={() => toggle(option.value)}
                          data-testid={`data-table-filter-option-${column.id}-${option.value}`}
                        >
                          {option.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DataTableFilterClearButton columnId={column.id} texts={texts} onClear={clear} />
                </div>
              );
            }

            // filter.kind === 'text'
            const textValue = activeValue?.kind === 'text' ? activeValue.value : '';

            return (
              <div key={column.id} className="flex items-end gap-1">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{column.label}</span>
                  <Input
                    type="text"
                    aria-label={column.label}
                    value={textValue}
                    data-testid={`data-table-filter-${column.id}`}
                    className={cn(touchTarget, FIELD_TEXT)}
                    onChange={(event) => {
                      const next = event.target.value;
                      onParamsChange(
                        withFilter(params, column.id, next === '' ? null : { kind: 'text', value: next }),
                      );
                    }}
                  />
                </div>
                <DataTableFilterClearButton columnId={column.id} texts={texts} onClear={clear} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
