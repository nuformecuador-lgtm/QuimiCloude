'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Selector de receta con busqueda al SERVIDOR (R31, R43, `design.md > 9.1`).
 *
 * **Copia la FORMA de `product-picker.tsx`, no su contenido**: `Button` e `Input` del CLI
 * compuestos a mano, rebote de 250 ms y paginacion DENTRO del desplegable. Se construye asi -y no
 * con `components/ui/select.tsx`- porque la navegacion de pagina vive dentro del propio
 * desplegable y la receta elegida casi nunca esta en la pagina cargada: un `<select>` nativo o el
 * primitivo `Select` esperan que el valor elegido figure entre sus `items`.
 *
 * **No se promueve `ProductPicker` a `components/shared/`** (`design.md > 9.1`): consulta otro
 * catalogo y otro tipo de opcion, y `docs/architecture.md > Regla: sin sobre-ingenieria` pide
 * promover cuando dos features lo necesitan **con la misma API**, que no es el caso. Se comparte
 * el patron, no el archivo.
 *
 * **La busqueda va al SERVIDOR, nunca al array ya descargado** (R31): escribir dispara
 * `listRecipesAction({ page, pageSize, search })`. En este archivo no se recorta `items` por
 * TEXTO en ningun sitio: filtrar en cliente solo miraria la pagina cargada y mentiria sobre el
 * catalogo. (El nombre del metodo de array que haria ese recorte no se escribe ni en este
 * comentario: la guardia de fuente de esta ruta lo veta y no debe encontrar un falso positivo.)
 * Es posible porque **QC-57 le dio `search` a `recetas`**; antes del 2026-09-06 no lo era. El
 * teclear se agrupa con un rebote de 250 ms para no pedir una consulta por pulsacion.
 *
 * **Se alcanza CUALQUIER receta** (R31): con la paginacion del desplegable, aunque haya mas de
 * las que caben en una consulta y aunque no se escriba nada.
 *
 * **La primera pagina llega por PROPS** (R43): la pide una sola vez el Server Component de la
 * seccion y baja hasta aqui, igual que hace la pagina de receta con sus ingredientes. Este
 * componente no importa `lib/composition` ni el cliente de base de datos, y la unica lectura que
 * hace por su cuenta es la Server Action que R41 autoriza -nunca un `fetch` a una ruta propia-.
 *
 * **El valor viaja en un `input` OCULTO** (`recipeId`): el panel lateral usa `<form action>`, asi
 * que lo elegido tiene que estar en el `FormData`, no en estado de React. Lo que se ve es el
 * combobox de busqueda; lo que se envia es el id.
 *
 * **Ninguna operacion de ALTA de recetas se importa aqui** (R32 por analogia y decision cerrada
 * del selector de unidad): este selector solo elige entre las existentes.
 */

/** Nombre del campo del `FormData` que lee el adaptador driving de `pedidos`. */
export const RECIPE_FIELD = 'recipeId';

/** Prefijo de los `data-testid` del selector (R44). Ningun test depende del copy. */
export const RECIPE_PICKER_TESTID = 'recipe-picker';

export type RecipePickerOption = {
  readonly id: string;
  readonly name: string;
};

/** La primera pagina del catalogo, ya cargada por el servidor (R43). */
export type RecipePickerPage = {
  readonly items: readonly RecipePickerOption[];
  readonly totalPages: number;
};

/** Objetivo tactil minimo (44x44 px) de R45. Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: por debajo, Safari en iOS hace zoom al enfocar el campo (R45). */
const FIELD_TEXT = 'text-base md:text-base';

const FIRST_PAGE = 1;

/** Rebote de la busqueda: agrupa las pulsaciones seguidas en una sola consulta. */
const SEARCH_DEBOUNCE_MS = 250;

const PICKER_LABEL = 'Receta';
const PLACEHOLDER = 'Busca una receta por su nombre';
const EMPTY_LABEL = 'Ninguna receta coincide con la búsqueda.';
const PREV_LABEL = 'Anterior';
const NEXT_LABEL = 'Siguiente';

export type RecipePickerProps = {
  /** Primera pagina del catalogo, por props (R43). */
  readonly initialPage: RecipePickerPage;
  /** Receta ya elegida (edicion). Cadena vacia en el alta. */
  readonly defaultValue?: string;
  /** Nombre de la receta ya elegida, para que el campo la muestre sin volver a pedirla. */
  readonly defaultLabel?: string;
  /** Error del campo (R34). Se pinta en linea y marca el control como invalido. */
  readonly error?: string;
};

export function RecipePicker({
  initialPage,
  defaultValue = '',
  defaultLabel = '',
  error,
}: RecipePickerProps) {
  const errorId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(FIRST_PAGE);
  const [totalPages, setTotalPages] = useState(initialPage.totalPages);
  const [items, setItems] = useState<readonly RecipePickerOption[]>(initialPage.items);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Lo elegido: es lo que viaja en el `FormData`. */
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [selectedName, setSelectedName] = useState(defaultLabel);
  /** Lo que el usuario esta escribiendo. `null` = no esta escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);
  /** El termino YA aplicado a una consulta; acompana a los cambios de pagina. */
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

  // Un rebote pendiente al desmontar -cerrar el panel mientras se escribe- no debe disparar una
  // consulta contra un componente que ya no existe.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  /**
   * Pide una pagina del catalogo, con el termino vigente si lo hay (R31). Es un manejador de
   * EVENTO, no un efecto, asi que `setLoading(true)` corre sincronamente.
   *
   * La primera pagina SIN busqueda no vuelve a pedirse: `initialPage` ya la trae por props (R43).
   * Con busqueda no hay atajo: esa pagina la tiene el backend, no las props.
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
    // Sin termino la clave se omite por claridad del sitio de llamada, no porque el esquema fuera
    // a rechazarla: con el contrato de QC-57 una busqueda vacia es AUSENCIA de busqueda.
    const termino = search === '' ? {} : { search };
    const result = await listRecipesAction({ page: next, pageSize: MAX_PAGE_SIZE, ...termino });
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

  /** Cada pulsacion reinicia el rebote; solo la ultima dispara la consulta. */
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

  function choose(option: RecipePickerOption) {
    setSelectedId(option.id);
    setSelectedName(option.name);
    setOpen(false);
    setDraft(null);
  }

  // Con el desplegable cerrado o sin escribir, el campo muestra lo YA elegido.
  const displayValue = draft ?? selectedName;

  return (
    <div className="relative flex flex-col gap-2" ref={containerRef}>
      <span className="text-sm font-medium">{PICKER_LABEL}</span>

      {/* Lo que se ENVIA. El combobox de arriba solo busca; el id elegido viaja aqui. */}
      <input
        type="hidden"
        name={RECIPE_FIELD}
        value={selectedId}
        data-testid={`${RECIPE_PICKER_TESTID}-value`}
      />

      <Input
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-label={PICKER_LABEL}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`${TOUCH_TARGET} ${FIELD_TEXT} w-full`}
        placeholder={PLACEHOLDER}
        value={displayValue}
        data-testid={RECIPE_PICKER_TESTID}
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
          data-testid={`${RECIPE_PICKER_TESTID}-popup`}
        >
          {loadError !== null ? (
            <p
              role="alert"
              className="p-2 text-sm text-destructive"
              data-testid={`${RECIPE_PICKER_TESTID}-load-error`}
            >
              {loadError}
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label={PICKER_LABEL}
              className="flex max-h-64 flex-col gap-0.5 overflow-y-auto"
            >
              {items.length === 0 ? (
                <li
                  className="px-2 py-3 text-sm text-muted-foreground"
                  data-testid={`${RECIPE_PICKER_TESTID}-empty`}
                >
                  {EMPTY_LABEL}
                </li>
              ) : (
                items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={item.id === selectedId}
                      className={`${TOUCH_TARGET} w-full rounded-md px-2 text-left ${FIELD_TEXT} hover:bg-muted`}
                      data-testid={`${RECIPE_PICKER_TESTID}-option`}
                      data-recipe-id={item.id}
                      onClick={() => choose(item)}
                    >
                      <span className="truncate">{item.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}

          {/* Navegacion de pagina DENTRO del propio desplegable (R31), con pagina actual y total. */}
          <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1">
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_TARGET}
              disabled={loading || page <= FIRST_PAGE}
              data-testid={`${RECIPE_PICKER_TESTID}-prev`}
              onClick={() => goToPage(page - 1)}
            >
              {PREV_LABEL}
            </Button>
            <span
              className="text-xs text-muted-foreground"
              data-testid={`${RECIPE_PICKER_TESTID}-page-indicator`}
            >
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_TARGET}
              disabled={loading || page >= totalPages}
              data-testid={`${RECIPE_PICKER_TESTID}-next`}
              onClick={() => goToPage(page + 1)}
            >
              {NEXT_LABEL}
            </Button>
          </div>
        </div>
      ) : null}

      {error === undefined ? null : (
        <p
          id={errorId}
          className="text-sm text-destructive"
          data-testid={`${RECIPE_PICKER_TESTID}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
