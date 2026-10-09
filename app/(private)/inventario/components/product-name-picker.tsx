'use client';

import { useCallback, useId, useState } from 'react';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { ProductType } from '@/lib/modules/inventario';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * Autocomplete del NOMBRE de producto en el alta. Busca productos existentes en el servidor, pero
 * sigue siendo TEXTO LIBRE: si lo escrito no coincide con ninguno, ese nombre se guarda tal cual.
 * Si se elige uno existente, avisa por `onSelect` y el formulario autocompleta la alerta.
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
  readonly qtyAlert: string | null;
  /** Tipo del producto: PRODUCT, MACHINE o PACKAGING. */
  readonly type: ProductType;
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
  /** Unidad del insumo elegido: el alta la deja preseleccionada. */
  readonly unitId?: string | null;
};

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
  /** Tipo elegido en el formulario: solo se ofrecen productos de ese tipo. */
  readonly productType: ProductType;
};

export function ProductNamePicker({
  defaultValue = '',
  error,
  onSelect,
  productType,
}: ProductNamePickerProps) {
  const labelId = useId();
  const inputId = useId();
  const errorId = useId();

  /** Lo que viaja en el `FormData`: es el nombre, tanto si se escribio como si se eligio. */
  const [name, setName] = useState(defaultValue);
  /** Lo que el usuario esta escribiendo. `null` = no esta escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);

  const pedirPagina = useCallback(async ({ query, page }: AsyncPageRequest) => {
    const search = query.trim();
    const filtro = {
      ...(search === '' ? {} : { search }),
      filters: { type: { kind: 'select', values: [productType] } },
    };
    const result = await listProductsAction({ page, pageSize: MAX_PAGE_SIZE, ...filtro });

    if (result.status === 'error') {
      throw new Error(result.message);
    }

    return {
      items: result.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        qtyAlert: item.qtyAlert,
        type: item.type,
        unitId: item.unitId,
      })),
      page: result.data.page,
      totalPages: result.data.totalPages,
    };
  }, [productType]);

  function handleValueChange(next: string) {
    setDraft(next);
    setName(next);
  }

  function choose(option: ProductNameOption | null) {
    if (option === null) {
      return;
    }
    setName(option.name);
    setDraft(null);
    onSelect?.(option);
  }

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

      {/* Sin el reinicio por tipo, al reabrir tras cambiarlo se veria un instante la lista del anterior. */}
      <AsyncAutocomplete<ProductNameOption>
        layout="split"
        id={inputId}
        fetchPage={pedirPagina}
        resetKey={productType}
        getOptionLabel={(option) => option.name}
        getOptionKey={(option) => option.id}
        onSelect={choose}
        inputValue={draft ?? name}
        searchQuery={draft ?? ''}
        onInputValueChange={handleValueChange}
        pageSize={MAX_PAGE_SIZE}
        debounceMs={SEARCH_DEBOUNCE_MS}
        maxHeight={MAX_LIST_HEIGHT}
        scrollThreshold={SCROLL_THRESHOLD}
        placeholder={PLACEHOLDER}
        emptyMessage={EMPTY_LABEL}
        aria-labelledby={labelId}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        slots={{
          inputTestId: 'product-field-name',
          inputClassName: `w-full ${touchTarget} ${FIELD_TEXT}`,
          popupTestId: 'product-name-popup',
          optionTestId: 'product-name-option',
          optionClassName: `${touchTarget} ${FIELD_TEXT} items-center`,
          optionDataAttributes: (option) => ({ 'data-product-id': option.id }),
          emptyTestId: 'product-name-empty',
          loadErrorTestId: 'product-name-load-error',
          loadingTestId: 'product-name-loading',
          loadingLabel: LOADING_LABEL,
        }}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid="product-error-name">
          {error}
        </p>
      )}
    </div>
  );
}
