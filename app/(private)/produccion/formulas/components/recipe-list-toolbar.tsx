'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  buildRecipeListQuery,
  PAGE_SIZE_OPTIONS,
  type RecipeListParams,
  type RecipePageSize,
} from './recipe-list-params';

const PAGE_SIZE_LABEL_ID = 'recipe-page-size-label';

/** Clase de area tactil minima de R50 (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

type RecipeListToolbarProps = {
  readonly page: number;
  readonly pageSize: RecipePageSize;
  readonly totalPages: number;
};

/**
 * Barra de herramientas de la lista: tamano de pagina y paginacion (R11, R12, R50,
 * `design.md > 4.2`).
 *
 * **Ninguno de los dos controles guarda estado local.** Cambiarlos NAVEGA: reescriben la cadena
 * de consulta y el Server Component de la lista vuelve a pedir los datos. Asi recargar,
 * compartir el enlace o volver con "atras" conserva la pagina, y el esqueleto de R16 aparece
 * solo, sin una linea de sincronizacion.
 *
 * **La URL no se escribe a mano**: el camino sale de `usePathname()` y la consulta de
 * `buildRecipeListQuery`, la misma funcion que el parser de la pagina sabe leer (R3: ningun
 * archivo de la feature incrusta el literal de la ruta).
 *
 * **Fija al fondo de la ventana** (2026-09-07, decision humana), con el mismo criterio que la
 * barra de paginacion de la tabla compartida -esta pantalla NO se ha migrado a ella (R34): solo
 * comparte la decision de producto, ni una linea de codigo-. La barra va DEBAJO de la tabla, asi
 * que sin `sticky` hay que recorrer la lista entera para volver a paginar. El fondo es opaco
 * porque las filas pasan por debajo, y `sticky` -no `fixed`- conserva su hueco en el flujo, asi
 * que no tapa la ultima fila.
 */
export function RecipeListToolbar({ page, pageSize, totalPages }: RecipeListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigate = (params: RecipeListParams) => {
    router.push(`${pathname}?${buildRecipeListQuery(params)}`);
  };

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div
      className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3"
      data-testid="recipe-list-toolbar"
    >
      <div className="flex items-center gap-2">
        <span id={PAGE_SIZE_LABEL_ID} className="text-sm text-muted-foreground">
          Recetas por página
        </span>
        <Select
          value={pageSize}
          /*
            Cambiar el tamano vuelve a la PRIMERA pagina a proposito: con 25 por pagina, la
            "pagina 7" que se estaba viendo con 10 puede no existir, y el usuario acabaria en un
            vacio que no ha provocado.
          */
          onValueChange={(value) => {
            if (value === null) return;
            navigate({ page: 1, pageSize: value });
          }}
        >
          <SelectTrigger
            aria-labelledby={PAGE_SIZE_LABEL_ID}
            className={TOUCH_TARGET}
            data-testid="recipe-page-size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} data-testid={`recipe-page-size-${option}`}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isFirstPage}
          aria-label="Página anterior"
          data-testid="recipe-page-previous"
          onClick={() => navigate({ page: page - 1, pageSize })}
        >
          <ChevronLeftIcon />
        </Button>
        <span role="status" className="text-sm" data-testid="recipe-page-status">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className={TOUCH_TARGET}
          disabled={isLastPage}
          aria-label="Página siguiente"
          data-testid="recipe-page-next"
          onClick={() => navigate({ page: page + 1, pageSize })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
