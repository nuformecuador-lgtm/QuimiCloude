'use client';

import { Loader2Icon } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';

import {
  Autocomplete,
  AutocompleteClear,
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
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/**
 * Selector de receta con busqueda al SERVIDOR (R31, R43, `design.md > 9.1`).
 *
 * **Cambio de mecanismo del 2026-09-07 (decision humana)**: la paginacion DENTRO del desplegable
 * ya no son los controles «Anterior»/«Siguiente» con su indicador, sino la CARGA POR SCROLL, que
 * anexa la pagina siguiente al llegar al final de la lista. Lo que R31 exige de fondo -alcanzar
 * cualquier receta existente sin recortar por texto en el navegador- no cambia. Los `data-testid`
 * `-prev`, `-next` y `-page-indicator` han desaparecido.
 *
 * **Ya no copia la FORMA de `product-picker.tsx`: los dos comparten AHORA el mismo motor**, que
 * es `components/ui/autocomplete.tsx` (primitivos de `@base-ui/react`, la misma libreria de la
 * que salen `Input`, `Select` y `Popover` del repo) mas el hook generico
 * `useAsyncPaginatedOptions`, que acumula paginas, aplica el rebote y descarta lo obsoleto. Este
 * archivo ya no gestiona a mano el cierre al pulsar fuera, ni el rebote, ni la navegacion por
 * teclado. Ninguna dependencia nueva entro en el repo.
 *
 * **Sigue sin promoverse un selector comun** (`design.md > 9.1`): este consulta otro catalogo y
 * otro tipo de opcion, y `docs/architecture.md > Regla: sin sobre-ingenieria` pide promover cuando
 * dos features lo necesitan **con la misma API**. Lo que se comparte es el primitivo y el hook
 * -piezas genericas, sin nada de pedidos ni de recetas dentro-, no un componente de pantalla.
 *
 * **La busqueda va al SERVIDOR, nunca al array ya descargado** (R31): escribir dispara
 * `listRecipesAction({ page, pageSize, search })`. En este archivo no se recorta `items` por
 * TEXTO en ningun sitio: filtrar en cliente solo miraria la pagina cargada y mentiria sobre el
 * catalogo. (El nombre del metodo de array que haria ese recorte no se escribe ni en este
 * comentario: la guardia de fuente de esta ruta lo veta y no debe encontrar un falso positivo.)
 * Es posible porque **QC-57 le dio `search` a `recetas`**; antes del 2026-09-06 no lo era. El
 * teclear se agrupa con un rebote de 400 ms para no pedir una consulta por pulsacion, y solo la
 * primera pagina lo espera: la siguiente la pide un gesto deliberado -llegar al final del scroll-.
 *
 * **Se alcanza CUALQUIER receta** (R31): bajando en el desplegable, aunque haya mas de las que
 * caben en una consulta y aunque no se escriba nada.
 *
 * **La primera pagina llega por PROPS** (R43): la pide una sola vez el Server Component de la
 * seccion y baja hasta aqui. Abrir el desplegable NO consulta al servidor. Por eso el tamano de
 * pagina es `MAX_PAGE_SIZE` y no el defecto de 10 del hook: una pagina de 10 dejaria inservible
 * una semilla de 25 -la pagina 2 solapariacon ella-. Este componente no importa `lib/composition`
 * ni el cliente de base de datos, y la unica lectura que hace por su cuenta es la Server Action
 * que R41 autoriza -nunca un `fetch` a una ruta propia-.
 *
 * **El valor viaja en un `input` OCULTO** (`recipeId`): el panel lateral usa `<form action>`, asi
 * que lo elegido tiene que estar en el `FormData`, no en estado de React. Lo que se ve es el
 * combobox de busqueda; lo que se envia es el id.
 *
 * **Escribir otra cosa RETIRA la eleccion** (decision humana del 2026-09-09). El campo de busqueda
 * es texto libre y un pedido solo puede referenciar recetas del catalogo (R31), asi que el id que
 * viaja tiene que ser EL QUE SE LEE en pantalla: si se eligio «crema 1» y el campo termina diciendo
 * «crema 1a», guardar enviaria un id que nadie eligio. Por eso, en cuanto lo escrito deja de
 * coincidir exactamente con el nombre elegido, el selector vacia su eleccion (el `input` oculto
 * queda sin id) y avisa para arriba con `null`: el formulario desactiva Guardar hasta que se vuelva
 * a elegir una opcion de la lista.
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
  /**
   * Imagen de la receta, YA compuesta por el contrato de `recetas` (`imageUrl`), o `null` cuando
   * la receta no tiene ninguna. Viaja con la opcion para que elegir una receta pueda ensenar su
   * imagen sin una segunda consulta; quien la pinta es el formulario, no este selector.
   */
  readonly imageUrl: string | null;
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
/* Subido de 250 a 400 ms el 2026-09-07: con 250 el rebote vencia ENTRE letra y letra de una
   escritura normal -entre dos teclas pasan 150-300 ms-, asi que el selector acababa consultando
   casi por pulsacion, que es justo lo que el rebote existe para evitar. */
const SEARCH_DEBOUNCE_MS = 400;

/** Alto maximo del desplegable: siempre hay scroll mientras queden paginas por traer. */
const MAX_LIST_HEIGHT = 256;

/** Margen para pedir la pagina siguiente antes de tocar el fondo, en px. */
const SCROLL_THRESHOLD = 48;

const PICKER_LABEL = 'Receta';
const PLACEHOLDER = 'Busca una receta por su nombre';
const EMPTY_LABEL = 'Ninguna receta coincide con la búsqueda.';
const LOADING_LABEL = 'Cargando recetas...';

export type RecipePickerProps = {
  /** Primera pagina del catalogo, por props (R43). */
  readonly initialPage: RecipePickerPage;
  /** Receta ya elegida (edicion). Cadena vacia en el alta. */
  readonly defaultValue?: string;
  /** Nombre de la receta ya elegida, para que el campo la muestre sin volver a pedirla. */
  readonly defaultLabel?: string;
  /** Error del campo (R34). Se pinta en linea y marca el control como invalido. */
  readonly error?: string;
  /**
   * Avisa al formulario del estado de la eleccion. `null` = el campo ya no guarda una receta
   * elegida: se retiro (al editar lo escrito) o nunca llego a haberla. Lo usa el panel para el
   * titulo, la imagen y para deshabilitar Guardar.
   */
  readonly onSelect?: (option: RecipePickerOption | null) => void;
};

export function RecipePicker({
  initialPage,
  defaultValue = '',
  defaultLabel = '',
  error,
  onSelect,
}: RecipePickerProps) {
  const errorId = useId();
  const [open, setOpen] = useState(false);
  /** Lo elegido: es lo que viaja en el `FormData`. */
  const [selectedId, setSelectedId] = useState(defaultValue);
  const [selectedName, setSelectedName] = useState(defaultLabel);
  /** Lo que el usuario esta escribiendo. `null` = no esta escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);
  /**
   * Espejo SINCRONO de `selectedName`, para leerlo dentro del mismo evento en que `choose` lo
   * cambia: el primitivo dispara su propio `onValueChange` con el nombre recien elegido justo
   * despues de nuestro `onClick`, y en ese instante el estado de React todavia no re-rendero, asi
   * que `selectedName` seguiria leyendo el nombre ANTERIOR y `handleValueChange` retiraria la
   * eleccion que se acaba de hacer.
   */
  const selectedNameRef = useRef(defaultLabel);

  /**
   * Pide una pagina del catalogo, con el termino vigente si lo hay (R31). La primera pagina SIN
   * busqueda no viaja al backend: ya la trae `initialPage` por props (R43). Con busqueda no hay
   * atajo: esa pagina la tiene el backend, no las props.
   */
  const pedirPagina = useCallback(
    async ({ query, page }: AsyncPageRequest) => {
      const search = query.trim();

      if (page === FIRST_PAGE && search === '') {
        return { items: initialPage.items, page, totalPages: initialPage.totalPages };
      }

      // Sin termino la clave se omite por claridad del sitio de llamada, no porque el esquema
      // fuera a rechazarla: con el contrato de QC-57 una busqueda vacia es AUSENCIA de busqueda.
      const termino = search === '' ? {} : { search };
      const result = await listRecipesAction({ page, pageSize: MAX_PAGE_SIZE, ...termino });

      if (result.status === 'error') {
        // El mensaje del servidor viaja como `cause` del error que envuelve el hook, y es el que
        // se presenta abajo: quien usa la pantalla lee lo que fallo, no una frase generica.
        throw new Error(result.message);
      }

      return {
        items: result.data.items.map((item) => ({
          id: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
        })),
        page: result.data.page,
        totalPages: result.data.totalPages,
      };
    },
    [initialPage],
  );

  const { items, isLoading, isLoadingMore, error: loadError, loadMore } =
    useAsyncPaginatedOptions<RecipePickerOption>({
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

  function choose(option: RecipePickerOption) {
    selectedNameRef.current = option.name;
    setSelectedId(option.id);
    setSelectedName(option.name);
    setDraft(null);
    setOpen(false);
    onSelect?.(option);
  }

  /**
   * Lo escrito en el campo. Es la segunda fuente del `displayValue` (ver abajo) y, si deja de
   * coincidir con el nombre elegido, RETIRA la eleccion: el `input` oculto queda sin id y se avisa
   * con `null` para que Guardar se deshabilite (decision humana del 2026-09-09). Asi el id que
   * viaja y lo que se lee en pantalla nunca pueden divergir.
   */
  function handleValueChange(next: string) {
    setDraft(next);

    if (selectedNameRef.current !== '' && next.trim() !== selectedNameRef.current) {
      selectedNameRef.current = '';
      setSelectedId('');
      setSelectedName('');
      onSelect?.(null);
    }
  }

  // Con el desplegable cerrado o sin escribir, el campo muestra lo YA elegido.
  const displayValue = draft ?? selectedName;
  const cargando = isLoading || isLoadingMore;
  const mensajeDeFallo =
    loadError === undefined
      ? null
      : loadError.cause instanceof Error
        ? loadError.cause.message
        : loadError.message;

  return (
    <div className="relative flex flex-col gap-2">
      <span className="text-sm font-medium">{PICKER_LABEL}</span>

      {/* Lo que se ENVIA. El combobox de arriba solo busca; el id elegido viaja aqui. */}
      <input
        type="hidden"
        name={RECIPE_FIELD}
        value={selectedId}
        data-testid={`${RECIPE_PICKER_TESTID}-value`}
      />

      <Autocomplete
        items={items}
        mode="none"
        itemToStringValue={(option: RecipePickerOption) => option.name}
        value={displayValue}
        onValueChange={handleValueChange}
        open={open}
        onOpenChange={setOpen}
        openOnInputClick
      >
        <AutocompleteInputGroup>
          <AutocompleteInput
            aria-label={PICKER_LABEL}
            aria-invalid={error === undefined ? undefined : true}
            aria-describedby={error === undefined ? undefined : errorId}
            className={`${TOUCH_TARGET} ${FIELD_TEXT} w-full pr-8`}
            placeholder={PLACEHOLDER}
            data-testid={RECIPE_PICKER_TESTID}
          />
          {/* Su click dispara `onValueChange('')`, que ya es el camino que retira la eleccion. */}
          <AutocompleteClear
            aria-label="Borrar receta"
            data-testid={`${RECIPE_PICKER_TESTID}-clear`}
          />
        </AutocompleteInputGroup>

        <AutocompleteContent className="min-w-56">
          <div
            data-testid={`${RECIPE_PICKER_TESTID}-popup`}
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            onScroll={handleScroll}
          >
            {mensajeDeFallo === null ? (
              <>
                <AutocompleteList>
                  {(option: RecipePickerOption, index: number) => (
                    <AutocompleteItem
                      key={option.id}
                      index={index}
                      value={option}
                      className={`${TOUCH_TARGET} ${FIELD_TEXT} items-center`}
                      data-testid={`${RECIPE_PICKER_TESTID}-option`}
                      data-recipe-id={option.id}
                      onClick={() => choose(option)}
                    >
                      <span className="truncate">{option.name}</span>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>

                {items.length === 0 && !cargando ? (
                  <p
                    className="px-2 py-3 text-sm text-muted-foreground"
                    data-testid={`${RECIPE_PICKER_TESTID}-empty`}
                  >
                    {EMPTY_LABEL}
                  </p>
                ) : null}
              </>
            ) : (
              <p
                role="alert"
                className="p-2 text-sm text-destructive"
                data-testid={`${RECIPE_PICKER_TESTID}-load-error`}
              >
                {mensajeDeFallo}
              </p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-1.5 px-2 text-sm text-muted-foreground empty:hidden"
              data-testid={`${RECIPE_PICKER_TESTID}-loading`}
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
