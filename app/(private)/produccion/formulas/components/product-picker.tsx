'use client';

import { useCallback, useId, useState } from 'react';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';
import { listProductsAction } from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { ProductType } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * Selector de ingrediente de una línea de fórmula.
 *
 * La búsqueda la resuelve el servidor: recortar items por texto en cliente solo miraría la página
 * ya cargada. Apartar los ingredientes de otras líneas no es ese recorte, porque no depende del
 * texto; aun así se escribe sin `.filter(`, que el contrato de la ruta veta en este archivo.
 *
 * Mientras no se escribe, el campo enseña lo elegido pero se busca con la cadena vacía: abrir un
 * selector ya relleno ofrece el catálogo entero.
 *
 * La página 1 llega precargada desde el formulario con `MAX_PAGE_SIZE`; con páginas más pequeñas
 * la página 2 se solaparía con ella.
 */

export type ProductPickerOption = {
  readonly id: string;
  readonly name: string;
  /**
   * Unidad guardada del producto, o `null` si todavia no tiene ninguna.
   *
   * DE DONDE SALE: de `ProductView.unitId`, la columna propia del producto -fija desde que se
   * crea, ya no derivada del lote mas reciente-. `null` significa «este producto todavia no
   * tiene unidad»: con `null`, `unitsOfGroup` devuelve el catalogo entero y la linea se puede
   * escribir igual, que es lo que permite escribir una receta antes de comprar el ingrediente.
   *
   * En fórmulas se pinta solo el nombre; la unidad se entrega intacta en `onSelect` para
   * quien la necesite (el detalle la conserva en `productUnitId`).
   */
  readonly unitId: string | null;
};

const FIELD_TEXT = 'text-base';
/** Rebote del autocompletado: agrupa las pulsaciones seguidas en una sola consulta. */
/* Subido de 250 a 400 ms el 2026-09-07: con 250 el rebote vencia ENTRE letra y letra de una
   escritura normal -entre dos teclas pasan 150-300 ms-, asi que el selector acababa consultando
   casi por pulsacion, que es justo lo que el rebote existe para evitar. */
const SEARCH_DEBOUNCE_MS = 400;
/** Alto máximo del desplegable: siempre hay scroll cuando quedan páginas por traer. */
const MAX_LIST_HEIGHT = 256;

/**
 * Etiqueta de una opción del selector: solo el nombre. La unidad se retiró en fórmulas por
 * decisión de producto («Hipoclorito · kg» pasa a «Hipoclorito»); el inventario la sigue
 * mostrando con `productDisplayName`.
 */
function optionLabel(option: ProductPickerOption): string {
  return option.name;
}

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
  /** Ingredientes ya elegidos en OTRAS líneas: se apartan de la lista. */
  readonly excludedIds?: readonly string[];
  /** Catálogo de unidades. Se conserva por firma; las opciones se pintan solo con el nombre. */
  readonly units: readonly UnitRef[];
  /**
   * Filtro de tipo aplicado en el SERVIDOR (`filters.type`, `select`): el tab de ingredientes
   * pide `PRODUCT` y el de máquinas `MACHINE`. Sin el, el selector ofrece todo el catálogo.
   */
  readonly productType?: ProductType;
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
  productType,
}: ProductPickerProps) {
  const errorId = useId();
  /** Lo que el usuario está escribiendo. `null` = no está escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);

  const pedirPagina = useCallback(
    async ({ query, page }: AsyncPageRequest) => {
      const search = query.trim();

      const filtro = {
        ...(search === '' ? {} : { search }),
        ...(productType === undefined
          ? {}
          : { filters: { type: { kind: 'select', values: [productType] } } }),
      };
      const result = await listProductsAction({ page, pageSize: MAX_PAGE_SIZE, ...filtro });

      if (result.status === 'error') {
        throw new Error(result.message);
      }

      return {
        items: result.data.items.map((item) => ({
          id: item.id,
          name: item.name,
          unitId: item.unitId,
        })),
        page: result.data.page,
        totalPages: result.data.totalPages,
      };
    },
    [productType],
  );

  function choose(option: ProductPickerOption | null) {
    if (option === null) {
      return;
    }
    onSelect(option);
    setDraft(null);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <AsyncAutocomplete<ProductPickerOption>
        layout="split"
        fetchPage={pedirPagina}
        initialPage={initialPage}
        getOptionLabel={optionLabel}
        getOptionKey={(option) => option.id}
        onSelect={choose}
        inputValue={draft ?? (value === '' ? '' : label)}
        searchQuery={draft ?? ''}
        onInputValueChange={setDraft}
        excludedKeys={excludedIds}
        keepKey={value}
        pageSize={MAX_PAGE_SIZE}
        debounceMs={SEARCH_DEBOUNCE_MS}
        maxHeight={MAX_LIST_HEIGHT}
        placeholder={label}
        emptyMessage="Ningún ingrediente disponible para esta línea."
        aria-label={ariaLabel}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        slots={{
          inputTestId: testId,
          inputClassName: `${touchTarget} ${FIELD_TEXT} w-full`,
          popupTestId: `${testId}-popup`,
          optionTestId: `${testId}-option`,
          optionClassName: `${touchTarget} ${FIELD_TEXT} items-center`,
          emptyTestId: `${testId}-empty`,
          loadErrorTestId: `${testId}-load-error`,
          loadingTestId: `${testId}-loading`,
          loadingLabel: 'Cargando ingredientes...',
          hasMore: {
            testId: `${testId}-has-more`,
            label: 'Hay más ingredientes: sigue bajando en la lista.',
          },
        }}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`${testId}-field-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
