'use client';

import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from 'react';

import { Spinner } from '@/components/shared/spinner';
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
  type AsyncPageRequest,
  type FetchOptionsPage,
} from '@/hooks/use-async-paginated-options';

/** Alto maximo del desplegable en px. Con 10 por pagina se ve media pagina y se sabe que hay mas. */
const DEFAULT_MAX_HEIGHT = 288;

/** Cuantos px antes del final del scroll se pide la pagina siguiente. */
const DEFAULT_SCROLL_THRESHOLD = 48;

const FIRST_PAGE = 1;
const DEFAULT_LOADING_LABEL = 'Cargando...';
const DEFAULT_LOAD_ERROR = 'No se pudo cargar. Sigue escribiendo para reintentar.';
const SPLIT_CONTENT_CLASS = 'min-w-56';

export type AsyncAutocompleteLayout = 'combined' | 'split';

export type AsyncAutocompleteClear = {
  readonly label?: string;
  readonly testId?: string;
  readonly className?: string;
};

export type AsyncAutocompleteSlots<T> = {
  readonly inputTestId?: string;
  /** Sustituye la clase por defecto del input de la presentacion elegida. */
  readonly inputClassName?: string;
  /** `false` quita el boton de borrar; sin valor, el defecto de la presentacion. */
  readonly clear?: false | AsyncAutocompleteClear;
  /** Sustituye la clase por defecto del desplegable. */
  readonly contentClassName?: string;
  readonly popupTestId?: string;
  readonly optionTestId?: string;
  readonly optionClassName?: string;
  readonly optionDataAttributes?: (option: T) => Readonly<Partial<Record<`data-${string}`, string>>>;
  readonly emptyTestId?: string;
  readonly loadErrorTestId?: string;
  readonly loadingTestId?: string;
  readonly loadingLabel?: string;
  /** Aviso solo para lectores de pantalla mientras quedan paginas por traer. */
  readonly hasMore?: { readonly label: string; readonly testId?: string };
};

export type AsyncAutocompletePage<T> = {
  readonly items: readonly T[];
  readonly totalPages: number;
};

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
  /** Texto con el que arranca el campo, para precargar una opcion ya elegida. */
  readonly defaultInputValue?: string;
  readonly className?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;

  /** `split`: sin icono, borrar opcional, y vacio y error como parrafos fuera de la region de estado. */
  readonly layout?: AsyncAutocompleteLayout;
  /** Con `inputValue` el texto del campo lo lleva el consumidor y el componente no lo toca. */
  readonly inputValue?: string;
  /** Termino que se busca cuando no coincide con lo que se ve, como al mostrar lo ya elegido. */
  readonly searchQuery?: string;
  readonly onInputValueChange?: (next: string) => void;
  /** La pagina 1 sin busqueda ya la trajo el servidor: se devuelve sin llamar a `fetchPage`. */
  readonly initialPage?: AsyncAutocompletePage<T>;
  /** Claves que no se ofrecen. `keepKey`, la eleccion vigente, nunca se aparta. */
  readonly excludedKeys?: readonly string[];
  readonly keepKey?: string;
  /** Van delante de lo que trae la consulta, sin repetir lo que ya trae. */
  readonly leadingOptions?: readonly T[];
  /** Al cambiar, se descarta lo acumulado y se vuelve a pedir la pagina 1. */
  readonly resetKey?: string;
  /** `false` no consulta aunque el desplegable este abierto. */
  readonly queryEnabled?: boolean;
  readonly isOptionDisabled?: (option: T) => boolean;
  /** Sustituye el aviso de error de carga entero. */
  readonly renderLoadError?: (error: Error) => ReactNode;
  readonly showEmpty?: boolean;
  readonly slots?: AsyncAutocompleteSlots<T>;
};

/**
 * El mensaje del servidor: el hook envuelve el rechazo de `fetchPage` y lo deja como `cause`.
 */
export function loadErrorMessage(error: Error): string {
  return error.cause instanceof Error ? error.cause.message : error.message;
}

function definedProps<P extends Record<string, unknown>>(props: P): Partial<P> {
  return Object.fromEntries(
    Object.entries(props).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]])),
  ) as Partial<P>;
}

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
  defaultInputValue,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  layout = 'combined',
  inputValue,
  searchQuery,
  onInputValueChange,
  initialPage,
  excludedKeys,
  keepKey,
  leadingOptions,
  resetKey,
  queryEnabled = true,
  isOptionDisabled,
  renderLoadError,
  showEmpty = true,
  slots = {},
}: AsyncAutocompleteProps<T>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [query, setQuery] = useState(defaultInputValue ?? '');
  const [open, setOpen] = useState(false);
  const controlled = inputValue !== undefined;
  const fieldValue = controlled ? inputValue : query;

  const seededFetchPage = useCallback(
    async (request: AsyncPageRequest) => {
      if (initialPage !== undefined && request.page === FIRST_PAGE && request.query.trim() === '') {
        return { items: initialPage.items, page: request.page, totalPages: initialPage.totalPages };
      }
      return fetchPage(request);
    },
    [fetchPage, initialPage],
  );

  const { items, isLoading, isLoadingMore, error, hasMore, loadMore, reset } =
    useAsyncPaginatedOptions<T>({
      fetchPage: initialPage === undefined ? fetchPage : seededFetchPage,
      query: searchQuery ?? fieldValue,
      pageSize,
      debounceMs,
      enabled: open && !disabled && queryEnabled,
    });

  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    reset();
  }

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const container = event.currentTarget;
      const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remaining <= scrollThreshold) {
        loadMore();
      }
    },
    [loadMore, scrollThreshold],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      if (controlled) {
        onInputValueChange?.(value);
        return;
      }
      setQuery(value);
      // Vaciar el campo deselecciona: el formulario no puede quedar con una opcion que
      // ya no se lee en pantalla.
      if (value === '') {
        onSelect?.(null);
      }
    },
    [controlled, onInputValueChange, onSelect],
  );

  // El primitivo notifica el texto de la opcion justo despues de este `onClick`: el consumidor
  // tiene que conocer la eleccion antes, o la tomaria por texto escrito a mano.
  const handleSelect = useCallback(
    (option: T) => {
      if (isOptionDisabled?.(option)) {
        return;
      }
      if (!controlled) {
        setQuery(getOptionLabel(option));
      }
      onSelect?.(option);
      setOpen(false);
    },
    [controlled, getOptionLabel, isOptionDisabled, onSelect],
  );

  const keyOf = getOptionKey ?? getOptionLabel;
  const options =
    leadingOptions === undefined && excludedKeys === undefined
      ? items
      : [
          ...(leadingOptions ?? []).flatMap((leading) =>
            items.some((item) => keyOf(item) === keyOf(leading)) ? [] : [leading],
          ),
          ...items,
        ].flatMap((option) => {
          const key = keyOf(option);
          return key !== keepKey && (excludedKeys ?? []).includes(key) ? [] : [option];
        });

  const split = layout === 'split';
  const loading = isLoading || isLoadingMore;
  const loadingLabel = slots.loadingLabel ?? DEFAULT_LOADING_LABEL;
  const scrollStyle: CSSProperties = { maxHeight };
  const statusId = `${inputId}-status`;

  const clear = slots.clear ?? (split ? false : {});
  const clearButton =
    clear === false ? null : (
      <AutocompleteClear
        {...definedProps({
          'aria-label': clear.label,
          'data-testid': clear.testId,
          className: clear.className,
        })}
      />
    );

  const renderItem = (option: T, index: number) => (
    <AutocompleteItem
      key={keyOf(option)}
      index={index}
      value={option}
      disabled={isOptionDisabled?.(option)}
      className={slots.optionClassName}
      data-testid={slots.optionTestId}
      {...slots.optionDataAttributes?.(option)}
      onClick={() => handleSelect(option)}
    >
      {renderOption ? (
        renderOption(option)
      ) : split ? (
        <span className="truncate">{getOptionLabel(option)}</span>
      ) : (
        getOptionLabel(option)
      )}
    </AutocompleteItem>
  );

  const hiddenField = name ? <input type="hidden" name={name} value={fieldValue} /> : null;

  if (split) {
    return (
      <Autocomplete
        items={options as T[]}
        mode="none"
        itemToStringValue={getOptionLabel}
        value={fieldValue}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={setOpen}
        openOnInputClick
      >
        <AutocompleteInputGroup>
          <AutocompleteInput
            {...definedProps({
              id,
              'aria-label': ariaLabel,
              'aria-labelledby': ariaLabelledBy,
              'aria-invalid': ariaInvalid,
              'aria-describedby': ariaDescribedBy,
              disabled: disabled || undefined,
              className: slots.inputClassName,
              placeholder,
              'data-testid': slots.inputTestId,
            })}
          />
          {clearButton}
        </AutocompleteInputGroup>

        {hiddenField}

        <AutocompleteContent className={slots.contentClassName ?? SPLIT_CONTENT_CLASS}>
          <div
            data-testid={slots.popupTestId}
            className="overflow-y-auto overscroll-contain"
            style={scrollStyle}
            onScroll={handleScroll}
          >
            {error === undefined ? (
              <>
                <AutocompleteList>{renderItem}</AutocompleteList>

                {showEmpty && options.length === 0 && !loading ? (
                  <p
                    className="px-2 py-3 text-sm text-muted-foreground"
                    data-testid={slots.emptyTestId}
                  >
                    {emptyMessage}
                  </p>
                ) : null}
              </>
            ) : renderLoadError ? (
              renderLoadError(error)
            ) : (
              <p
                role="alert"
                className="p-2 text-sm text-destructive"
                data-testid={slots.loadErrorTestId}
              >
                {loadErrorMessage(error)}
              </p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-1.5 px-2 text-sm text-muted-foreground empty:hidden"
              data-testid={slots.loadingTestId}
            >
              {loading ? (
                <>
                  <Spinner />
                  <span className="py-2">{loadingLabel}</span>
                </>
              ) : null}
            </p>

            {slots.hasMore !== undefined && hasMore && !loading ? (
              <span className="sr-only" data-testid={slots.hasMore.testId}>
                {slots.hasMore.label}
              </span>
            ) : null}
          </div>
        </AutocompleteContent>
      </Autocomplete>
    );
  }

  const emptyVisible = showEmpty && !isLoading && !error && options.length === 0;

  return (
    <Autocomplete
      items={options as T[]}
      mode="none"
      // Los valores de item son objetos: sin esto, el primitivo escribiria el objeto
      // serializado en el campo al elegir.
      itemToStringValue={getOptionLabel}
      value={fieldValue}
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
          className={slots.inputClassName ?? 'px-8'}
          aria-describedby={ariaDescribedBy ?? statusId}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          {...definedProps({
            'aria-labelledby': ariaLabelledBy,
            'data-testid': slots.inputTestId,
          })}
        />
        {clearButton}
      </AutocompleteInputGroup>

      {hiddenField}

      <AutocompleteContent className={slots.contentClassName}>
        <div
          data-slot="autocomplete-scroll"
          data-testid={slots.popupTestId}
          className="overflow-y-auto overscroll-contain"
          style={scrollStyle}
          onScroll={handleScroll}
        >
          <AutocompleteList>{renderItem}</AutocompleteList>

          <div
            id={statusId}
            role="status"
            aria-live="polite"
            className="px-1.5 text-sm text-muted-foreground empty:hidden"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5 py-2">
                <Spinner />
                {loadingLabel}
              </span>
            ) : null}
            {error ? (
              renderLoadError ? (
                renderLoadError(error)
              ) : (
                <span className="block py-2 text-center text-destructive">{DEFAULT_LOAD_ERROR}</span>
              )
            ) : null}
            {emptyVisible ? <span className="block py-2 text-center">{emptyMessage}</span> : null}
          </div>
        </div>
      </AutocompleteContent>
    </Autocomplete>
  );
}
