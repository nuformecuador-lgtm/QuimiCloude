'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Selector de producto paginado (T14, R28; `design.md > 6`).
 *
 * **No es una primitiva de shadcn/ui reinventada**: se compone con `Button`, que ya es del CLI,
 * y no importa ninguna librería nueva. Se construye a mano -y no con `components/ui/select.tsx`-
 * porque la navegación de página vive DENTRO del propio desplegable (R28) y el elemento
 * seleccionado casi nunca está en la página que el desplegable tiene cargada: un `<select>`
 * nativo o el primitivo de `Select` esperan que el valor elegido figure entre sus `items`.
 *
 * **Nunca filtra en cliente** (R28): no hay ni un `.filter(` por texto sobre `items`. Cada cambio
 * de página pide una página nueva a `listProductsAction({ page, pageSize: MAX_PAGE_SIZE })`, con
 * `MAX_PAGE_SIZE` **importado** de `lib/shared/pagination`, nunca escrito a mano.
 *
 * **La primera página puede llegar precargada** (`initialPage`, `design.md > 5`): la página del
 * formulario ya pidió `listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE })` una sola vez y
 * se la pasa a `RecipeForm` por props (R49); cada instancia de este selector -una por línea de
 * receta- reutiliza esos datos en vez de disparar su propia petición al abrirse por primera vez.
 * Cambiar de página SÍ dispara una petición propia con `listProductsAction`, que es la Server
 * Action del módulo, nunca un `fetch` a una ruta API propia (R47).
 */

export type ProductPickerOption = {
  readonly id: string;
  readonly name: string;
};

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';
const FIRST_PAGE = 1;

export type ProductPickerProps = {
  /** Producto ya elegido, o cadena vacía si ninguno. */
  readonly value: string;
  /** Texto a mostrar en el disparador: el nombre elegido, un marcador o un texto de "sin elegir". */
  readonly label: string;
  /** Nombre accesible del control (incluye a qué línea pertenece). */
  readonly ariaLabel: string;
  readonly onSelect: (option: ProductPickerOption) => void;
  readonly error?: string;
  /** Prefijo de `data-testid` de este selector -distinto por línea-. */
  readonly testId: string;
  /** Primera página ya cargada por la página del formulario (R49). */
  readonly initialPage: { readonly items: readonly ProductPickerOption[]; readonly totalPages: number };
};

export function ProductPicker({
  value,
  label,
  ariaLabel,
  onSelect,
  error,
  testId,
  initialPage,
}: ProductPickerProps) {
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(FIRST_PAGE);
  const [totalPages, setTotalPages] = useState(initialPage.totalPages);
  const [items, setItems] = useState<readonly ProductPickerOption[]>(initialPage.items);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  /**
   * Pide una página del catálogo de productos (R28). Es un manejador de EVENTO, no un efecto -mismo
   * criterio que `loadMore` de `presentation-select.tsx`-, así que `setLoading(true)` corre
   * síncronamente sin que ningún linter de efectos tenga nada que decir al respecto.
   *
   * La primera página **no vuelve a pedirse**: `initialPage` ya la trae por props (R49), y volver
   * a ella la reutiliza tal cual.
   */
  async function goToPage(requested: number) {
    const next = Math.min(Math.max(requested, FIRST_PAGE), totalPages);
    setPage(next);

    if (next === FIRST_PAGE) {
      setItems(initialPage.items);
      setTotalPages(initialPage.totalPages);
      setLoadError(null);
      return;
    }

    setLoading(true);
    const result = await listProductsAction({ page: next, pageSize: MAX_PAGE_SIZE });
    setLoading(false);

    if (result.status === 'error') {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setItems(result.data.items.map((item) => ({ id: item.id, name: item.name })));
    setTotalPages(result.data.totalPages);
  }

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        className={`${TOUCH_TARGET} ${FIELD_TEXT} w-full justify-between`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={testId}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="truncate">{label}</span>
      </Button>

      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute top-full z-50 mt-1 w-full min-w-56 rounded-lg border bg-popover p-1 shadow-md"
          data-testid={`${testId}-popup`}
        >
          {loadError !== null ? (
            <p role="alert" className="p-2 text-sm text-destructive" data-testid={`${testId}-load-error`}>
              {loadError}
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === value}
                    className={`${TOUCH_TARGET} w-full rounded-md px-2 text-left ${FIELD_TEXT} hover:bg-muted`}
                    data-testid={`${testId}-option`}
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Navegacion de pagina DENTRO del propio desplegable (R28), con la pagina actual y el total. */}
          <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1">
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_TARGET}
              disabled={loading || page <= FIRST_PAGE}
              data-testid={`${testId}-prev`}
              onClick={() => void goToPage(page - 1)}
            >
              Anterior
            </Button>
            <span
              className="text-xs text-muted-foreground"
              data-testid={`${testId}-page-indicator`}
            >
              Página {page} de {totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_TARGET}
              disabled={loading || page >= totalPages}
              data-testid={`${testId}-next`}
              onClick={() => void goToPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`${testId}-field-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
