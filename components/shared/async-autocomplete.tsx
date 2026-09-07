'use client';

import { Loader2Icon } from 'lucide-react';
import { useCallback, useId, useRef, useState, type CSSProperties } from 'react';

import {
  Autocomplete,
  AutocompleteClear,
  AutocompleteContent,
  AutocompleteIcon,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/ui/autocomplete';
import {
  DEFAULT_OPTIONS_PAGE_SIZE,
  useAsyncPaginatedOptions,
  type FetchOptionsPage,
} from '@/hooks/use-async-paginated-options';

/** Alto maximo del desplegable en px. Con 10 por pagina se ve media pagina y se sabe que hay mas. */
const DEFAULT_MAX_HEIGHT = 288;

/** Cuantos px antes del final del scroll se pide la pagina siguiente. */
const DEFAULT_SCROLL_THRESHOLD = 48;

type AsyncAutocompleteProps<T> = {
  /** Pide una pagina al servidor. Recibe `query`, `page`, `pageSize` y un `signal`. */
  readonly fetchPage: FetchOptionsPage<T>;
  /** Etiqueta visible de una opcion; tambien es lo que queda en el campo al elegirla. */
  readonly getOptionLabel: (option: T) => string;
  /** Clave estable de una opcion. Por defecto, su etiqueta. */
  readonly getOptionKey?: (option: T) => string;
  /** Se llama con la opcion elegida, o con `null` al limpiar el campo. */
  readonly onSelect?: (option: T | null) => void;
  /** Renderizado propio de la fila. Por defecto, la etiqueta. */
  readonly renderOption?: (option: T) => React.ReactNode;
  /** Elementos por pagina (10 por defecto). Viaja tal cual a `fetchPage`. */
  readonly pageSize?: number;
  /** Espera tras la ultima tecla antes de consultar, en ms. */
  readonly debounceMs?: number;
  /** Alto maximo del desplegable, en px. */
  readonly maxHeight?: number;
  /** Margen para disparar la carga antes de tocar el final, en px. */
  readonly scrollThreshold?: number;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  /** Nombre del campo oculto que viaja en el formulario con la etiqueta elegida. */
  readonly name?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
};

/**
 * Autocomplete con consulta asincrona paginada y carga por scroll (`components/ui/autocomplete`
 * son los primitivos; aqui esta la composicion con estado).
 *
 * **Por que `mode="none"`**: quien filtra es el servidor, que ademas solo tiene en memoria las
 * paginas ya traidas. Dejar el filtro del primitivo activo esconderia opciones que el backend
 * SI devolvio -filtrar dos veces el mismo texto, la segunda contra un subconjunto- y romperia
 * el paginado: la pagina siguiente llegaria y se veria vacia.
 *
 * **Por que la carga por scroll y no un boton**: el contrato es "de 10 en 10 con alto maximo".
 * El desplegable tiene tope de alto, asi que siempre hay scroll cuando quedan paginas, y llegar
 * al final es el gesto natural para pedir mas. `hasMore` lo dice el servidor, no se adivina por
 * el tamano de la ultima pagina.
 *
 * **Por que no consulta con el popup cerrado**: `enabled` sigue a `open`. Un autocomplete cerrado
 * no muestra nada, y pedir paginas que nadie ve gasta base de datos por costumbre.
 */
export function AsyncAutocomplete<T>({
  fetchPage,
  getOptionLabel,
  getOptionKey,
  onSelect,
  renderOption,
  pageSize = DEFAULT_OPTIONS_PAGE_SIZE,
  debounceMs,
  maxHeight = DEFAULT_MAX_HEIGHT,
  scrollThreshold = DEFAULT_SCROLL_THRESHOLD,
  placeholder = 'Buscar...',
  emptyMessage = 'Sin resultados.',
  disabled = false,
  id,
  name,
  className,
  ...aria
}: AsyncAutocompleteProps<T>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { items, isLoading, isLoadingMore, error, hasMore, loadMore } =
    useAsyncPaginatedOptions<T>({
      fetchPage,
      query,
      pageSize,
      debounceMs,
      enabled: open && !disabled,
    });

  const handleScroll = useCallback(() => {
    const container = listRef.current;
    if (!container || !hasMore) {
      return;
    }
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (remaining <= scrollThreshold) {
      loadMore();
    }
  }, [hasMore, loadMore, scrollThreshold]);

  const handleValueChange = useCallback(
    (value: string) => {
      setQuery(value);
      // Vaciar el campo deselecciona: el formulario no puede quedar con una opcion que
      // ya no se lee en pantalla.
      if (value === '') {
        onSelect?.(null);
      }
    },
    [onSelect],
  );

  const handleSelect = useCallback(
    (option: T) => {
      setQuery(getOptionLabel(option));
      onSelect?.(option);
      setOpen(false);
    },
    [getOptionLabel, onSelect],
  );

  const scrollStyle: CSSProperties = { maxHeight };
  const statusId = `${inputId}-status`;
  const showEmpty = !isLoading && !error && items.length === 0;

  return (
    <Autocomplete
      items={items as T[]}
      mode="none"
      // Los valores de item son objetos: sin esto, el primitivo escribiria el objeto
      // serializado en el campo al elegir.
      itemToStringValue={getOptionLabel}
      value={query}
      onValueChange={handleValueChange}
      open={open}
      onOpenChange={setOpen}
      openOnInputClick
      disabled={disabled}
    >
      <AutocompleteInputGroup className={className}>
        <AutocompleteIcon />
        <AutocompleteInput
          id={inputId}
          placeholder={placeholder}
          className="px-8"
          aria-describedby={aria['aria-describedby'] ?? statusId}
          aria-label={aria['aria-label']}
          aria-invalid={aria['aria-invalid']}
        />
        <AutocompleteClear />
      </AutocompleteInputGroup>

      {name ? <input type="hidden" name={name} value={query} /> : null}

      <AutocompleteContent>
        <div
          ref={listRef}
          data-slot="autocomplete-scroll"
          className="overflow-y-auto overscroll-contain"
          style={scrollStyle}
          onScroll={handleScroll}
        >
          <AutocompleteList>
            {(option: T, index: number) => (
              <AutocompleteItem
                key={getOptionKey ? getOptionKey(option) : getOptionLabel(option)}
                index={index}
                value={option}
                onClick={() => handleSelect(option)}
              >
                {renderOption ? renderOption(option) : getOptionLabel(option)}
              </AutocompleteItem>
            )}
          </AutocompleteList>

          <div
            id={statusId}
            role="status"
            aria-live="polite"
            className="px-1.5 text-sm text-muted-foreground empty:hidden"
          >
            {isLoading || isLoadingMore ? (
              <span className="flex items-center justify-center gap-1.5 py-2">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                Cargando...
              </span>
            ) : null}
            {error ? (
              <span className="block py-2 text-center text-destructive">
                No se pudo cargar. Sigue escribiendo para reintentar.
              </span>
            ) : null}
            {showEmpty ? <span className="block py-2 text-center">{emptyMessage}</span> : null}
          </div>
        </div>
      </AutocompleteContent>
    </Autocomplete>
  );
}
