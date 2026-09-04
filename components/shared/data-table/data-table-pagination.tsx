'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { PAGE_SIZE_OPTIONS, withPage, withPageSize } from './data-table-params';
import type { DataTableParams, DataTableTexts } from './data-table-types';

/**
 * Barra de paginacion (`design.md`, T6): anterior/siguiente, indicador de pagina y selector de
 * tamano. Solo emite `onParamsChange` con el `DataTableParams` completo (R6, R7); no consulta
 * nada ni navega (R2, R30).
 */

const TOUCH_TARGET = 'min-h-11 min-w-11';

const FIRST_PAGE = 1;

type DataTablePaginationProps = {
  readonly params: DataTableParams;
  readonly totalPages: number;
  readonly texts: DataTableTexts;
  readonly onParamsChange: (next: DataTableParams) => void;
};

export function DataTablePagination({
  params,
  totalPages,
  texts,
  onParamsChange,
}: DataTablePaginationProps) {
  const isFirstPage = params.page <= FIRST_PAGE;
  const isLastPage = params.page >= totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="data-table-pagination">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          aria-label={texts.previousPage}
          disabled={isFirstPage}
          data-testid="data-table-previous"
          onClick={() => onParamsChange(withPage(params, params.page - 1))}
        >
          <ChevronLeftIcon />
        </Button>

        <span role="status" data-testid="data-table-page-indicator">
          {texts.pageIndicator(params.page, totalPages)}
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          aria-label={texts.nextPage}
          disabled={isLastPage}
          data-testid="data-table-next"
          onClick={() => onParamsChange(withPage(params, params.page + 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <Select
        value={String(params.pageSize)}
        onValueChange={(next) => {
          if (next === null) return;
          onParamsChange(withPageSize(params, Number(next)));
        }}
        items={PAGE_SIZE_OPTIONS.map((option) => ({ label: String(option), value: String(option) }))}
      >
        <SelectTrigger
          aria-label={texts.pageSize}
          className={TOUCH_TARGET}
          data-testid="data-table-page-size"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <SelectItem
              key={option}
              value={String(option)}
              data-testid={`data-table-page-size-${option}`}
            >
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
