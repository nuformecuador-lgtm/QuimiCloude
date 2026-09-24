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
import type { ProductType } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Selector de ingrediente con autocompletado y paginación (T14, R28; `design.md > 6`).
 *
 * **QC-26 R28 cambió de mecanismo (decisión humana del 2026-09-07)**: la paginación DENTRO del
 * desplegable ya no son los botones «Anterior»/«Siguiente» con su indicador, sino la carga por
 * scroll: al llegar al final de la lista se anexa la página siguiente. Lo que R28 exige de fondo
 * -que se pueda alcanzar CUALQUIER producto del catálogo sin filtrar en cliente- se cumple igual,
 * y con un gesto menos por página. Los `data-testid` `-prev`, `-next` y `-page-indicator` han
 * DESAPARECIDO; el test de R28 y los dos helpers de E2E se reescribieron con el gesto nuevo.
 *
 * **No es una primitiva reinventada, y ahora tampoco es un desplegable a mano**: se compone con
 * `components/ui/autocomplete.tsx` -primitivos de `@base-ui/react`, la misma librería de la que
 * salen `Input`, `Select` y `Popover` de este repo- y con el hook genérico
 * `useAsyncPaginatedOptions`, que es quien acumula páginas, sabe si quedan más y descarta lo
 * obsoleto. Este archivo ya no gestiona a mano ni el rebote, ni el cierre al pulsar fuera, ni la
 * navegación por teclado: eso lo pone el primitivo. Ninguna dependencia nueva entró en el repo.
 *
 * **La búsqueda va al SERVIDOR, nunca al array ya descargado** (R28): escribir dispara
 * `listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE, search })` a través de `pedirPagina`.
 * En este archivo no hay ni un `.filter(` por texto sobre los items: filtrar en cliente solo
 * miraría la página cargada y mentiría sobre el catálogo, que es exactamente lo que R28 prohíbe.
 * El rebote de las pulsaciones lo aplica el hook (400 ms), y solo a la primera página: la
 * siguiente la pide un gesto deliberado -llegar al final del scroll-, no una tecla.
 *
 * **Quién valida ese `search`, desde QC-57**: `productQuerySchema` -la búsqueda propia de
 * productos- YA NO EXISTE (QC-57 R24). `search` es ahora una clave del CONTRATO GENÉRICO de
 * consulta de lista, el mismo de los siete listados del ERP: lo valida `createListQuerySchema()`
 * -que le da `''` por defecto y le recorta el sobrante- y lo poda `sanitizeListQuery` contra la
 * lista blanca `PRODUCT_QUERYABLE`, ambos dentro del caso de uso `listProducts`. La llamada de
 * este selector no cambia de forma: `search` sigue siendo una propiedad `string`.
 *
 * **Y ha cambiado CÓMO se resuelve, para mejor**: ya no es un `contains` insensible a mayúsculas
 * sobre `products.name`, sino un `contains` sobre la columna normalizada
 * `products.name_normalized` -servida por el índice GIN de trigramas
 * `products_name_normalized_trgm_idx`-, con el término pasado por la MISMA `normalizeProductName`
 * que escribió esa columna (QC-57 R16, R18, R19). Como esa forma canónica quita los acentos, la
 * búsqueda IGNORA los acentos: escribir «solucion» encuentra «Solución Buffer pH 7».
 *
 * **El texto que se busca NO es el que se muestra**: mientras el usuario no escribe, el campo
 * enseña el ingrediente ya elegido (`label`) pero el término de búsqueda es la cadena vacía, así
 * que abrir un selector ya relleno ofrece el catálogo entero y no solo el producto que ya tiene.
 * Es la misma distinción `draft`/`label` de antes de QC-26bis, ahora con el primitivo controlado.
 *
 * **Los ingredientes ya usados en otras líneas NO se ofrecen** (`excludedIds`): se apartan de la
 * lista, así que no hay forma de elegir dos veces el mismo. El propio ingrediente de ESTA línea
 * nunca se aparta a sí mismo.
 *
 * Apartarlos NO es el filtrado en cliente que R28 prohíbe: ahí lo vetado es recortar los items
 * por TEXTO. Aquí se quita lo que ya está en la receta, que es información del formulario y no
 * del catálogo, y ninguna búsqueda depende de ello. Se escribe con `flatMap` y no con `.filter(`
 * porque el contrato de la ruta veta ese literal en este archivo justamente para que nadie cuele
 * un filtrado por texto (`recipe-route-contract.test.ts`).
 *
 * El precio, asumido: una página del desplegable puede mostrar menos opciones de las que trajo,
 * y quien busque un ingrediente que ya usó no lo verá.
 *
 * **La primera página puede llegar precargada** (`initialPage`, `design.md > 5`): la página del
 * formulario ya pidió `listProductsAction({ page: 1, pageSize: MAX_PAGE_SIZE })` una sola vez y
 * se la pasa a `RecipeForm` por props (R49); cada instancia de este selector -una por línea de
 * receta- devuelve esos datos como página 1 SIN BUSCAR, en vez de disparar su propia petición al
 * abrirse. Por eso el tamaño de página sigue siendo `MAX_PAGE_SIZE` y no el defecto de 10 del
 * hook: una página de 10 dejaría inservible una semilla de 25 -la página 2 solaparía con ella-.
 * Buscar o pedir la página siguiente SÍ dispara una petición propia con `listProductsAction`,
 * que es la Server Action del módulo, nunca un `fetch` a una ruta API propia (R47).
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

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base';
const FIRST_PAGE = 1;
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
  const [open, setOpen] = useState(false);
  /** Lo que el usuario está escribiendo. `null` = no está escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Pide una página del catálogo, con el término vigente si lo hay (R28). La página 1 SIN
   * búsqueda no viaja al backend: ya la trae `initialPage` por props (R49). Con búsqueda no hay
   * atajo posible: esa página la tiene el backend, no las props.
   */
  const pedirPagina = useCallback(
    async ({ query, page }: AsyncPageRequest) => {
      const search = query.trim();

      // La página 1 sin búsqueda la trae `initialPage` por props (R49): cada tab recibe la suya
      // ya filtrada por tipo desde la página del formulario, así que aquí no se filtra nada.
      if (page === FIRST_PAGE && search === '') {
        return { items: initialPage.items, page, totalPages: initialPage.totalPages };
      }

      // Sin término, la consulta es EXACTAMENTE la de siempre, más el filtro de tipo si el tab
      // lo declaró. La clave `search` se omite por claridad del sitio de llamada, NO porque el
      // esquema fuera a rechazarla: con el contrato de QC-57 una búsqueda vacía es AUSENCIA de
      // búsqueda (R20). El filtro viaja al SERVIDOR (`PRODUCT_QUERYABLE` lo declara `select`);
      // en cliente no se recorta nada (R28).
      const filtro = {
        ...(search === '' ? {} : { search }),
        ...(productType === undefined
          ? {}
          : { filters: { type: { kind: 'select', values: [productType] } } }),
      };
      const result = await listProductsAction({ page, pageSize: MAX_PAGE_SIZE, ...filtro });

      if (result.status === 'error') {
        // El mensaje del servidor viaja como `cause` del error que envuelve el hook, y es el que
        // se presenta abajo: el usuario lee lo que falló, no una frase genérica.
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
    [initialPage, productType],
  );

  const { items, isLoading, isLoadingMore, error: loadError, hasMore, loadMore } =
    useAsyncPaginatedOptions<ProductPickerOption>({
      fetchPage: pedirPagina,
      query: draft ?? '',
      pageSize: MAX_PAGE_SIZE,
      debounceMs: SEARCH_DEBOUNCE_MS,
      enabled: open,
    });

  /** Llegar al final de la lista pide la página siguiente; el hook ignora lo que sobra. */
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const lista = event.currentTarget;
      if (lista.scrollHeight - lista.scrollTop - lista.clientHeight <= 48) {
        loadMore();
      }
    },
    [loadMore],
  );

  function handleValueChange(next: string) {
    setDraft(next);
  }

  function choose(option: ProductPickerOption) {
    onSelect(option);
    setDraft(null);
    setOpen(false);
  }

  // Fuera lo que ya está en otras líneas. `flatMap` en vez de `.filter(` a propósito: ver la
  // cabecera de este archivo.
  const selectable = items.flatMap((item) =>
    item.id !== value && excludedIds.includes(item.id) ? [] : [item],
  );

  // Con el desplegable cerrado o sin escribir, el campo muestra lo YA elegido; `label` solo es
  // marcador cuando no hay nada elegido.
  const displayValue = draft ?? (value === '' ? '' : label);
  const cargando = isLoading || isLoadingMore;
  const mensajeDeFallo =
    loadError === undefined
      ? null
      : loadError.cause instanceof Error
        ? loadError.cause.message
        : loadError.message;

  return (
    <div className="relative flex flex-col gap-1">
      <Autocomplete
        items={selectable}
        mode="none"
        itemToStringValue={(option: ProductPickerOption) => optionLabel(option)}
        value={displayValue}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={setOpen}
        openOnInputClick
      >
        <AutocompleteInputGroup>
          <AutocompleteInput
            aria-label={ariaLabel}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : errorId}
            className={`${TOUCH_TARGET} ${FIELD_TEXT} w-full`}
            placeholder={label}
            data-testid={testId}
          />
        </AutocompleteInputGroup>

        <AutocompleteContent className="min-w-56">
          <div
            data-testid={`${testId}-popup`}
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            onScroll={handleScroll}
          >
            {mensajeDeFallo === null ? (
              <>
                <AutocompleteList>
                  {(option: ProductPickerOption, index: number) => (
                    <AutocompleteItem
                      key={option.id}
                      index={index}
                      value={option}
                      className={`${TOUCH_TARGET} ${FIELD_TEXT} items-center`}
                      data-testid={`${testId}-option`}
                      onClick={() => choose(option)}
                    >
                      <span className="truncate">{optionLabel(option)}</span>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>

                {selectable.length === 0 && !cargando ? (
                  <p
                    className="px-2 py-3 text-sm text-muted-foreground"
                    data-testid={`${testId}-empty`}
                  >
                    Ningún ingrediente disponible para esta línea.
                  </p>
                ) : null}
              </>
            ) : (
              <p role="alert" className="p-2 text-sm text-destructive" data-testid={`${testId}-load-error`}>
                {mensajeDeFallo}
              </p>
            )}

            {/* El anuncio de carga es también el fondo del scroll: mientras se ve, queda página. */}
            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-1.5 px-2 text-sm text-muted-foreground empty:hidden"
              data-testid={`${testId}-loading`}
            >
              {cargando ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  <span className="py-2">Cargando ingredientes...</span>
                </>
              ) : null}
            </p>

            {hasMore && !cargando ? (
              <span className="sr-only" data-testid={`${testId}-has-more`}>
                Hay más ingredientes: sigue bajando en la lista.
              </span>
            ) : null}
          </div>
        </AutocompleteContent>
      </Autocomplete>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`${testId}-field-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
