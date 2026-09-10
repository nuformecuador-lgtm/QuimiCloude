'use client';

import { Loader2Icon } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/ui/autocomplete';
import {
  useAsyncPaginatedOptions,
  type AsyncPageRequest,
} from '@/hooks/use-async-paginated-options';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Autocomplete del NOMBRE de producto en el alta (`design.md` heredado de QC-22, R18).
 *
 * **Decision humana del 2026-09-09**: el nombre deja de ser un `<input>` de texto plano y pasa a
 * ser un autocomplete que busca productos EXISTENTES en el servidor (`listProductsAction` con
 * `search`). Sigue siendo TEXTO LIBRE: si lo escrito no coincide con ningun producto, ese nombre
 * se guarda tal cual. Si se elige un producto existente, el componente avisa por `onSelect` y el
 * formulario autocompleta la alerta de cantidad.
 *
 * **Mismo motor que los otros dos selectores del ERP** (`components/ui/autocomplete.tsx` +
 * `useAsyncPaginatedOptions`): la busqueda la resuelve el SERVIDOR -nunca se recorta en memoria-,
 * el rebote es de 400 ms y las paginas siguientes se anexan al llegar al final del scroll. Ninguna
 * dependencia nueva entro en el repo.
 *
 * **El nombre viaja en un `input` espejo** (`name`), no en el combobox: el formulario usa
 * `<form action>` y el valor tiene que estar en el `FormData`. El espejo es `sr-only` -y no
 * `type="hidden"`- para conservar la validacion nativa de `required` que daba el campo anterior.
 */

/** Campo del formulario de producto que alimenta este selector, via su `input` espejo. */
export const PRODUCT_NAME_FIELD = 'name';

export type ProductNameOption = {
  readonly id: string;
  readonly name: string;
  readonly qtyAlert: number | null;
  /**
   * Presentacion del producto elegido, para que el alta la autocomplete (2026-09-10).
   *
   * **Opcionales porque hoy nunca vienen**: `listProductsAction` devuelve `ProductView`, que desde
   * el 2026-09-09 ya no lleva presentacion -se mudo al lote-. En cuanto la consulta traiga la del
   * ultimo lote, se rellenan aqui y el formulario ya sabe que hacer con ellas: no hay nada mas que
   * cambiar del lado del selector.
   */
  readonly presentationId?: string;
  readonly presentationName?: string;
};

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';
const SEARCH_DEBOUNCE_MS = 400;
const MAX_LIST_HEIGHT = 256;
const SCROLL_THRESHOLD = 48;

const LABEL = 'Nombre';
const PLACEHOLDER = 'Escribe un nombre o busca un producto existente';
const EMPTY_LABEL = 'Ningún producto coincide con la búsqueda.';
const LOADING_LABEL = 'Cargando productos...';

type ProductNamePickerProps = {
  /** Nombre ya escrito (se recupera tras un fallo). Cadena vacia en el alta. */
  readonly defaultValue?: string;
  /** Error del campo. Se pinta en linea y marca el control como invalido. */
  readonly error?: string;
  /** Avisa del producto existente elegido, para que el formulario autocomplete presentacion y alerta. */
  readonly onSelect?: (option: ProductNameOption) => void;
};

export function ProductNamePicker({
  defaultValue = '',
  error,
  onSelect,
}: ProductNamePickerProps) {
  const labelId = useId();
  const inputId = useId();
  const errorId = useId();

  const [open, setOpen] = useState(false);
  /** Lo que viaja en el `FormData`: es el nombre, tanto si se escribio como si se eligio. */
  const [name, setName] = useState(defaultValue);
  /** Lo que el usuario esta escribiendo. `null` = no esta escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Pide una pagina del catalogo, con el termino vigente si lo hay. La busqueda la resuelve el
   * servidor: con termino viaja `search`; sin el, es la pagina completa del catalogo.
   */
  const pedirPagina = useCallback(async ({ query, page }: AsyncPageRequest) => {
    const search = query.trim();
    const filtro = search === '' ? {} : { search };
    const result = await listProductsAction({ page, pageSize: MAX_PAGE_SIZE, ...filtro });

    if (result.status === 'error') {
      throw new Error(result.message);
    }

    return {
      items: result.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        qtyAlert: item.qtyAlert,
      })),
      page: result.data.page,
      totalPages: result.data.totalPages,
    };
  }, []);

  const { items, isLoading, isLoadingMore, error: loadError, loadMore } =
    useAsyncPaginatedOptions<ProductNameOption>({
      fetchPage: pedirPagina,
      query: draft ?? '',
      pageSize: MAX_PAGE_SIZE,
      debounceMs: SEARCH_DEBOUNCE_MS,
      enabled: open,
    });

  /** Llegar al final de la lista pide la pagina siguiente; el hook ignora lo que sobra. */
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const lista = event.currentTarget;
      if (lista.scrollHeight - lista.scrollTop - lista.clientHeight <= SCROLL_THRESHOLD) {
        loadMore();
      }
    },
    [loadMore],
  );

  function handleValueChange(next: string) {
    setDraft(next);
    setName(next);
  }

  function choose(option: ProductNameOption) {
    setName(option.name);
    setDraft(null);
    setOpen(false);
    onSelect?.(option);
  }

  // Con el desplegable cerrado o sin escribir, el campo muestra lo YA elegido.
  const displayValue = draft ?? name;
  const cargando = isLoading || isLoadingMore;
  const mensajeDeFallo =
    loadError === undefined
      ? null
      : loadError.cause instanceof Error
        ? loadError.cause.message
        : loadError.message;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {LABEL}
      </span>

      {/*
        Campo espejo: lo que VIAJA en el `FormData` es el nombre escrito o elegido. Es `sr-only`
        -y no `type="hidden"`- para conservar la validacion nativa de `required` del campo
        anterior: un `hidden` queda excluido de esa validacion. El nombre accesible lo lleva el
        combobox; el foco del navegador se reenvia hacia el.
      */}
      <input
        type="text"
        name={PRODUCT_NAME_FIELD}
        required
        value={name}
        onChange={() => undefined}
        onFocus={() => document.getElementById(inputId)?.focus()}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        data-testid="product-name-value"
      />

      <Autocomplete
        items={items}
        mode="none"
        itemToStringValue={(option: ProductNameOption) => option.name}
        value={displayValue}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={setOpen}
        openOnInputClick
      >
        <AutocompleteInputGroup>
          <AutocompleteInput
            id={inputId}
            aria-labelledby={labelId}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : errorId}
            className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
            placeholder={PLACEHOLDER}
            data-testid="product-field-name"
          />
        </AutocompleteInputGroup>

        <AutocompleteContent className="min-w-56">
          <div
            data-testid="product-name-popup"
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            onScroll={handleScroll}
          >
            {mensajeDeFallo === null ? (
              <>
                <AutocompleteList>
                  {(option: ProductNameOption, index: number) => (
                    <AutocompleteItem
                      key={option.id}
                      index={index}
                      value={option}
                      className={`${TOUCH_TARGET} ${FIELD_TEXT} items-center`}
                      data-testid="product-name-option"
                      data-product-id={option.id}
                      onClick={() => choose(option)}
                    >
                      <span className="truncate">{option.name}</span>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>

                {items.length === 0 && !cargando ? (
                  <p
                    className="px-2 py-3 text-sm text-muted-foreground"
                    data-testid="product-name-empty"
                  >
                    {EMPTY_LABEL}
                  </p>
                ) : null}
              </>
            ) : (
              <p
                role="alert"
                className="p-2 text-sm text-destructive"
                data-testid="product-name-load-error"
              >
                {mensajeDeFallo}
              </p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-1.5 px-2 text-sm text-muted-foreground empty:hidden"
              data-testid="product-name-loading"
            >
              {cargando ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  <span className="py-2">{LOADING_LABEL}</span>
                </>
              ) : null}
            </p>
          </div>
        </AutocompleteContent>
      </Autocomplete>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid="product-error-name">
          {error}
        </p>
      )}
    </div>
  );
}
