'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Selector de ingrediente con autocompletado y paginación (T14, R28; `design.md > 6`).
 *
 * **No es una primitiva de shadcn/ui reinventada**: se compone con `Button` e `Input`, que ya son
 * del CLI, y no importa ninguna librería nueva. Se construye a mano -y no con
 * `components/ui/select.tsx`- porque la navegación de página vive DENTRO del propio desplegable
 * (R28) y el elemento seleccionado casi nunca está en la página que el desplegable tiene cargada:
 * un `<select>` nativo o el primitivo de `Select` esperan que el valor elegido figure entre sus
 * `items`.
 *
 * **La búsqueda va al SERVIDOR, nunca al array ya descargado** (R28): escribir dispara
 * `listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE, search })` -con `search` validado por
 * `productQuerySchema` en el dominio y resuelto con un `contains` insensible a mayúsculas en el
 * adaptador-. En este archivo no hay ni un `.filter(` por texto sobre `items`: filtrar en cliente
 * solo miraría la página cargada y mentiría sobre el catálogo, que es exactamente lo que R28
 * prohíbe. El teclear se agrupa con un rebote de 250 ms para no pedir una consulta por pulsación.
 *
 * **Sin texto escrito, el desplegable sigue siendo el de siempre**: la primera página precargada y
 * sus controles de página. Con texto, la paginación se aplica al resultado de la búsqueda, y el
 * `total` que devuelve el backend ya describe ese resultado -mismo `where` en el `findMany` y en
 * el `count`-.
 *
 * **Los ingredientes ya usados en otras líneas se ofrecen DESHABILITADOS, no ocultos**
 * (`excludedIds`): esconderlos haría pensar que el producto no existe en el catálogo. Esto no es
 * el filtrado en cliente que R28 prohíbe -no se busca por texto, se marca lo que ya está en la
 * receta-, y el propio ingrediente de ESTA línea nunca se deshabilita a sí mismo.
 *
 * **La primera página puede llegar precargada** (`initialPage`, `design.md > 5`): la página del
 * formulario ya pidió `listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE })` una sola vez y
 * se la pasa a `RecipeForm` por props (R49); cada instancia de este selector -una por línea de
 * receta- reutiliza esos datos en vez de disparar su propia petición al abrirse por primera vez.
 * Cambiar de página o buscar SÍ dispara una petición propia con `listProductsAction`, que es la
 * Server Action del módulo, nunca un `fetch` a una ruta API propia (R47).
 */

export type ProductPickerOption = {
  readonly id: string;
  readonly name: string;
};

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';
const FIRST_PAGE = 1;
/** Rebote del autocompletado: agrupa las pulsaciones seguidas en una sola consulta. */
const SEARCH_DEBOUNCE_MS = 250;

export type ProductPickerProps = {
  /** Ingrediente ya elegido, o cadena vacía si ninguno. */
  readonly value: string;
  /** Texto del elegido, un marcador o el texto de "sin elegir". */
  readonly label: string;
  /** Nombre accesible del control (incluye a qué línea pertenece). */
  readonly ariaLabel: string;
  readonly onSelect: (option: ProductPickerOption) => void;
  readonly error?: string;
  /** Prefijo de `data-testid` de este selector -distinto por línea-. */
  readonly testId: string;
  /** Primera página ya cargada por la página del formulario (R49). */
  readonly initialPage: { readonly items: readonly ProductPickerOption[]; readonly totalPages: number };
  /** Ingredientes ya elegidos en OTRAS líneas: se ofrecen deshabilitados. */
  readonly excludedIds?: readonly string[];
};

export function ProductPicker({
  value,
  label,
  ariaLabel,
  onSelect,
  error,
  testId,
  initialPage,
  excludedIds = [],
}: ProductPickerProps) {
  const errorId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(FIRST_PAGE);
  const [totalPages, setTotalPages] = useState(initialPage.totalPages);
  const [items, setItems] = useState<readonly ProductPickerOption[]>(initialPage.items);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Lo que el usuario está escribiendo. `null` = no está escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);
  /** El término YA aplicado a una consulta; es el que acompaña a los cambios de página. */
  const [appliedSearch, setAppliedSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setDraft(null);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  // Un rebote pendiente al desmontar la línea -quitarla mientras se escribe- no debe disparar
  // una consulta contra un componente que ya no existe.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  /**
   * Pide una página del catálogo, con el término de búsqueda vigente si lo hay (R28). Es un
   * manejador de EVENTO, no un efecto -mismo criterio que `loadMore` de `presentation-select.tsx`-,
   * así que `setLoading(true)` corre síncronamente sin que ningún linter de efectos tenga nada
   * que decir al respecto.
   *
   * La primera página **sin búsqueda** no vuelve a pedirse: `initialPage` ya la trae por props
   * (R49). Con búsqueda no hay atajo posible: esa página la tiene el backend, no las props.
   */
  async function loadPage(requested: number, search: string) {
    const next = Math.max(requested, FIRST_PAGE);
    setPage(next);

    if (next === FIRST_PAGE && search === '') {
      setItems(initialPage.items);
      setTotalPages(initialPage.totalPages);
      setLoadError(null);
      return;
    }

    setLoading(true);
    // Sin término, la consulta es EXACTAMENTE la de siempre -sin una clave `search` vacía que
    // el esquema tendría que rechazar-; con término, viaja junto a la página.
    const filtro = search === '' ? {} : { search };
    const result = await listProductsAction({ page: next, pageSize: MAX_PAGE_SIZE, ...filtro });
    setLoading(false);

    if (result.status === 'error') {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setItems(result.data.items.map((item) => ({ id: item.id, name: item.name })));
    setTotalPages(result.data.totalPages);
  }

  function goToPage(requested: number) {
    void loadPage(Math.min(requested, totalPages), appliedSearch);
  }

  /** Cada pulsación reinicia el rebote; solo la última dispara la consulta. */
  function handleDraftChange(next: string) {
    setDraft(next);
    setOpen(true);
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const search = next.trim();
      setAppliedSearch(search);
      void loadPage(FIRST_PAGE, search);
    }, SEARCH_DEBOUNCE_MS);
  }

  function choose(option: ProductPickerOption) {
    onSelect(option);
    setOpen(false);
    setDraft(null);
  }

  // Con el desplegable cerrado o sin escribir, el campo muestra lo YA elegido; `label` solo es
  // marcador cuando no hay nada elegido.
  const displayValue = draft ?? (value === '' ? '' : label);

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      <Input
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`${TOUCH_TARGET} ${FIELD_TEXT} w-full`}
        placeholder={label}
        value={displayValue}
        data-testid={testId}
        onChange={(event) => handleDraftChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setDraft(null);
          }
        }}
      />

      {open ? (
        <div
          className="absolute top-full z-50 mt-1 w-full min-w-56 rounded-lg border bg-popover p-1 shadow-md"
          data-testid={`${testId}-popup`}
        >
          {loadError !== null ? (
            <p role="alert" className="p-2 text-sm text-destructive" data-testid={`${testId}-load-error`}>
              {loadError}
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="flex max-h-64 flex-col gap-0.5 overflow-y-auto"
            >
              {items.length === 0 ? (
                <li
                  className="px-2 py-3 text-sm text-muted-foreground"
                  data-testid={`${testId}-empty`}
                >
                  Ningún ingrediente coincide con la búsqueda.
                </li>
              ) : (
                items.map((item) => {
                  // El ingrediente de ESTA línea nunca se deshabilita a sí mismo.
                  const alreadyUsed = item.id !== value && excludedIds.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.id === value}
                        aria-disabled={alreadyUsed ? true : undefined}
                        disabled={alreadyUsed}
                        className={`${TOUCH_TARGET} flex w-full items-center justify-between gap-2 rounded-md px-2 text-left ${FIELD_TEXT} hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
                        data-testid={`${testId}-option`}
                        onClick={() => choose(item)}
                      >
                        <span className="truncate">{item.name}</span>
                        {alreadyUsed ? (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ya está en la receta
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
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
              onClick={() => goToPage(page - 1)}
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
              onClick={() => goToPage(page + 1)}
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
