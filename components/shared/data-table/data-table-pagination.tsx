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
 *
 * **Fija al fondo de la ventana** (2026-09-07, decision humana): con una pagina de 25 filas hay
 * que recorrer la lista entera para volver a paginar, y en el movil eso es todo el gesto de una
 * mano. `sticky bottom-0` la mantiene a la vista mientras la lista se desplaza y la devuelve a su
 * sitio al llegar al final; NO es `fixed`, asi que sigue ocupando su hueco en el flujo y no tapa
 * la ultima fila.
 *
 * Dos condiciones para que eso funcione, y las dos se cumplen aqui: el fondo es OPACO
 * (`bg-background`) porque las filas pasan por debajo, y su `z-20` esta por encima del
 * `z-index: 1` de las columnas fijadas (`data-table.tsx`), que si no la atravesarian. Es `z-20` y
 * no la escala inmediatamente inferior porque una guardia del directorio
 * (`data-table-params.test.ts`) prohibe ese literal en estas fuentes, no por jerarquia.
 *
 * `sticky` depende ademas de que ningun ancestro recorte con `overflow`: por eso la barra vive
 * FUERA del `div[data-slot=table-container]`, que es el que si desplaza en horizontal.
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
    <div
      className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3"
      data-testid="data-table-pagination"
    >
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
