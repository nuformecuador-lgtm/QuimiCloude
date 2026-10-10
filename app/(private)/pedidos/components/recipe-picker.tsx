'use client';

import { useCallback, useId, useRef, useState } from 'react';

import { AsyncAutocomplete } from '@/components/shared/async-autocomplete';
import type { AsyncPageRequest } from '@/hooks/use-async-paginated-options';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * Selector de receta de un pedido. Solo elige entre las existentes: aquí no se da de alta nada.
 *
 * La búsqueda la resuelve el servidor y aquí no se recorta `items` por texto. (El nombre del
 * método de array que haría ese recorte no se escribe ni en este comentario: la guardia de fuente
 * de esta ruta lo veta y no debe encontrar un falso positivo.)
 *
 * La página 1 llega por props con `MAX_PAGE_SIZE`; con páginas más pequeñas la página 2 se
 * solaparía con ella.
 *
 * **El valor viaja en un `input` OCULTO** (`recipeId`): el panel lateral usa `<form action>`, asi
 * que lo elegido tiene que estar en el `FormData`, no en estado de React.
 *
 * **Escribir otra cosa RETIRA la eleccion**: el id que viaja tiene que ser el que se lee en
 * pantalla. En cuanto lo escrito deja de coincidir con el nombre elegido, el `input` oculto queda
 * sin id y se avisa con `null`, y el formulario desactiva Guardar.
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

/** 16 px en TODOS los anchos: por debajo, Safari en iOS hace zoom al enfocar el campo (R45). */
const FIELD_TEXT = 'text-base md:text-base';

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

  const pedirPagina = useCallback(async ({ query, page }: AsyncPageRequest) => {
    const search = query.trim();
    const termino = search === '' ? {} : { search };
    const result = await listRecipesAction({ page, pageSize: MAX_PAGE_SIZE, ...termino });

    if (result.status === 'error') {
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
  }, []);

  function choose(option: RecipePickerOption | null) {
    if (option === null) {
      return;
    }
    selectedNameRef.current = option.name;
    setSelectedId(option.id);
    setSelectedName(option.name);
    setDraft(null);
    onSelect?.(option);
  }

  function handleValueChange(next: string) {
    setDraft(next);

    if (selectedNameRef.current !== '' && next.trim() !== selectedNameRef.current) {
      selectedNameRef.current = '';
      setSelectedId('');
      setSelectedName('');
      onSelect?.(null);
    }
  }

  return (
    <div className="relative flex flex-col gap-2">
      <span className="text-sm font-medium">{PICKER_LABEL}</span>

      <input
        type="hidden"
        name={RECIPE_FIELD}
        value={selectedId}
        data-testid={`${RECIPE_PICKER_TESTID}-value`}
      />

      {/* Borrar dispara `onValueChange('')`, que ya es el camino que retira la eleccion. */}
      <AsyncAutocomplete<RecipePickerOption>
        layout="split"
        fetchPage={pedirPagina}
        initialPage={initialPage}
        getOptionLabel={(option) => option.name}
        getOptionKey={(option) => option.id}
        onSelect={choose}
        inputValue={draft ?? selectedName}
        searchQuery={draft ?? ''}
        onInputValueChange={handleValueChange}
        pageSize={MAX_PAGE_SIZE}
        debounceMs={SEARCH_DEBOUNCE_MS}
        maxHeight={MAX_LIST_HEIGHT}
        scrollThreshold={SCROLL_THRESHOLD}
        placeholder={PLACEHOLDER}
        emptyMessage={EMPTY_LABEL}
        aria-label={PICKER_LABEL}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        slots={{
          inputTestId: RECIPE_PICKER_TESTID,
          inputClassName: `${touchTarget} ${FIELD_TEXT} w-full pr-8`,
          clear: { label: 'Borrar receta', testId: `${RECIPE_PICKER_TESTID}-clear` },
          popupTestId: `${RECIPE_PICKER_TESTID}-popup`,
          optionTestId: `${RECIPE_PICKER_TESTID}-option`,
          optionClassName: `${touchTarget} ${FIELD_TEXT} items-center`,
          optionDataAttributes: (option) => ({ 'data-recipe-id': option.id }),
          emptyTestId: `${RECIPE_PICKER_TESTID}-empty`,
          loadErrorTestId: `${RECIPE_PICKER_TESTID}-load-error`,
          loadingTestId: `${RECIPE_PICKER_TESTID}-loading`,
          loadingLabel: LOADING_LABEL,
        }}
      />

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
