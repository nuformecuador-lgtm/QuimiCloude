'use client';

import { Loader2Icon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
} from '@/components/ui/autocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useAsyncPaginatedOptions,
  type AsyncPageRequest,
} from '@/hooks/use-async-paginated-options';
import { createPresentationSchema } from '@/lib/modules/inventario';
import {
  createPresentationAction,
  listPresentationsAction,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/** Campo del formulario de producto que alimenta este selector, via su `input` espejo. */
export const PRESENTATION_FIELD = 'presentationId';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** La lista de presentaciones siempre empieza por su primera pagina. */
const FIRST_PAGE = 1;

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md`, y R31 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/** Rebote de la busqueda. Mismo valor que los otros dos selectores del ERP; ver el hook. */
const SEARCH_DEBOUNCE_MS = 400;

/** Alto maximo del desplegable: siempre hay scroll mientras queden paginas por traer. */
const MAX_LIST_HEIGHT = 256;

/** Margen para pedir la pagina siguiente antes de tocar el fondo, en px. */
const SCROLL_THRESHOLD = 48;

const INVALID_NAME_MESSAGE = 'Escribe un nombre de presentación válido.';
const PLACEHOLDER = 'Busca una presentación por su nombre';
const EMPTY_LABEL = 'Ninguna presentación coincide con la búsqueda.';
const LOADING_LABEL = 'Cargando presentaciones...';

/** Solo lo que el selector necesita de una presentacion. R25: aqui no se lista, ni se edita, ni se borra. */
type PresentationOption = {
  readonly id: string;
  readonly name: string;
};

type PresentationSelectProps = {
  /** Presentacion ya asignada al producto que se edita (R19). Ausente en el alta. */
  readonly defaultValue?: string;
  /**
   * Nombre de esa presentacion, si el llamante ya lo tiene. Ahorra la consulta de resolucion
   * del montaje; sin el, el selector la hace por su cuenta (ver el docblock).
   */
  readonly defaultLabel?: string;
  /** Mensaje de error del campo, si el formulario lo tiene (R20). */
  readonly error?: string;
};

/**
 * Selector de presentacion con busqueda al servidor y alta en linea (QC-22 R24 y R25; QC-44 R37,
 * R38 y R39).
 *
 * **ENMIENDA DEL 2026-09-07 (decision humana): es un AUTOCOMPLETE, no un desplegable con «Cargar
 * más».** El control pasa a `components/ui/autocomplete.tsx` (primitivos de `@base-ui/react`, la
 * misma libreria de la que salian `Select` e `Input`) mas el hook generico
 * `useAsyncPaginatedOptions`, el mismo motor que ya mueve el selector de ingrediente de recetas y
 * el de receta de pedidos. Lo que cambia para quien lo usa:
 *
 *   - se escribe para BUSCAR, y la busqueda la resuelve el SERVIDOR (`PRESENTATION_QUERYABLE`
 *     declara `searchable: true`, asi que aqui no se recorta nada en memoria);
 *   - las paginas siguientes se anexan al llegar al final del scroll, no con un boton
 *     «Cargar más» -que desaparece, junto a su `data-testid`-;
 *   - el desplegable no consulta nada mientras esta cerrado.
 *
 * Lo que NO cambia: el campo del formulario (`presentationId`), el alta en linea con todo su
 * bloque y sus `data-testid`, el mensaje de error de campo y la API del componente, que solo
 * GANA una prop opcional (`defaultLabel`).
 *
 * **Vive en `components/shared/` desde QC-44**: dos pantallas -inventario y proveedores- lo
 * necesitan igual, que es la condicion que `docs/architecture.md > Regla: sin sobre-ingenieria`
 * pone para promover. El barrel de `app/(private)/inventario/components` lo reexporta, asi que la
 * ruta lo sigue consumiendo por su barrel. **Las dos pantallas cambian a la vez**: es el precio de
 * que sea un componente compartido, y es deliberado.
 *
 * **Por que carga por su cuenta y no por props**: el conjunto de presentaciones no depende de la
 * pagina de productos que se este viendo y cambia cuando el propio usuario crea una sin salir del
 * panel. Se pide con `listPresentationsAction`, que es una Server Action del modulo -no un
 * `fetch` a una ruta de API propia (R28)-, y el componente no importa ni la composicion ni
 * Prisma (R30).
 *
 * **Como se alcanza cualquier presentacion (R24)**: escribiendo -la busqueda va al servidor- o
 * bajando en el desplegable, que anexa la pagina siguiente. El tamano de pagina sigue siendo
 * `MAX_PAGE_SIZE` **importado**, nunca el 25 escrito a mano.
 *
 * **Como se muestra la presentacion ya elegida al editar**: si el llamante pasa `defaultLabel`
 * -el formulario de producto lo tiene en `product.presentationName`-, se pinta y no se consulta
 * nada. Si no lo pasa -la linea de catalogo de proveedores entrega el id EN CRUDO, por decision de
 * QC-52-, el selector pide UNA vez la primera pagina y busca ahi el nombre. Es exactamente lo que
 * hacia el desplegable anterior, que tambien cargaba la primera pagina al montar y dejaba el campo
 * en blanco si la elegida no estaba en ella; la diferencia es que ahora esa consulta solo ocurre
 * cuando hace falta.
 *
 * **El texto que se busca NO es el que se muestra**: mientras el usuario no escribe, el campo
 * ensena la presentacion elegida pero el termino de busqueda es la cadena vacia, asi que abrir un
 * selector ya relleno ofrece el catalogo entero y no solo lo que ya tiene.
 *
 * **El alta en linea NO es un `form`**: este componente vive DENTRO del formulario de producto y
 * anidar formularios es HTML invalido. La Server Action se invoca directamente desde el
 * manejador, que es lo mismo que hace el `action` de un formulario pero sin el elemento. Tampoco
 * es un segundo `sheet` anidado: apilar capas modales es justo lo que se rompe en iOS.
 *
 * **R25**: de las cuatro operaciones de presentacion que el modulo expone, este archivo importa
 * SOLO las dos que R24 necesita -listar para poblar el selector y crear-. Ni la de renombrar ni
 * la de borrar aparecen aqui ni en ningun otro archivo de la ruta: la unica operacion de
 * presentacion disponible en toda la pantalla es su alta, y listar y editar presentaciones sale
 * a QC-45. Los nombres de las dos prohibidas no se escriben ni en este comentario, para que una
 * guardia de fuente que las busque no encuentre un falso positivo.
 */
export function PresentationSelect({
  defaultValue,
  defaultLabel,
  error,
}: PresentationSelectProps) {
  const labelId = useId();
  const inputId = useId();
  const createFieldId = useId();
  const createErrorId = useId();
  const errorId = useId();

  const [open, setOpen] = useState(false);
  /** Lo que el usuario esta escribiendo. `null` = no esta escribiendo: se muestra lo elegido. */
  const [draft, setDraft] = useState<string | null>(null);
  /** Lo elegido: el id viaja en el formulario y el nombre es lo que se ve. */
  const [selectedId, setSelectedId] = useState(defaultValue ?? '');
  const [selectedName, setSelectedName] = useState(defaultLabel ?? '');
  /** Las creadas en linea, que aun no vuelven de ninguna consulta (R24). */
  const [created, setCreated] = useState<readonly PresentationOption[]>([]);

  const [creating, setCreating] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createFieldRef = useRef<HTMLInputElement>(null);

  /**
   * Resolucion del nombre de la presentacion ya elegida, solo cuando el llamante no lo dio.
   * Todo el estado se toca DESPUES del `await` a proposito: `react-hooks` prohibe llamar a
   * `setState` de forma sincrona dentro de un efecto, y ademas asi un desmontaje durante la
   * peticion no intenta pintar nada.
   */
  useEffect(() => {
    if (defaultValue === undefined || defaultValue === '') return;
    if (defaultLabel !== undefined && defaultLabel !== '') return;

    let cancelled = false;
    void (async () => {
      const result = await listPresentationsAction({
        page: FIRST_PAGE,
        pageSize: MAX_PAGE_SIZE,
      });
      if (cancelled || result.status === 'error') return;
      const encontrada = result.data.items.find((item) => item.id === defaultValue);
      if (encontrada !== undefined) setSelectedName(encontrada.name);
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultValue, defaultLabel]);

  /** Pide una pagina del catalogo, con el termino vigente si lo hay. */
  const pedirPagina = useCallback(async ({ query, page }: AsyncPageRequest) => {
    const search = query.trim();
    // Sin termino la clave se omite por claridad del sitio de llamada, no porque el esquema fuera
    // a rechazarla: con el contrato de QC-57 una busqueda vacia es AUSENCIA de busqueda.
    const filtro = search === '' ? {} : { search };
    const result = await listPresentationsAction({
      page,
      pageSize: MAX_PAGE_SIZE,
      ...filtro,
    });

    if (result.status === 'error') {
      // El mensaje del servidor viaja como `cause` del error que envuelve el hook, y es el que
      // se presenta abajo: quien usa la pantalla lee lo que fallo, no una frase generica.
      throw new Error(result.message);
    }

    return {
      items: result.data.items.map((item) => ({ id: item.id, name: item.name })),
      page: result.data.page,
      totalPages: result.data.totalPages,
    };
  }, []);

  const {
    items,
    isLoading,
    isLoadingMore,
    error: loadError,
    loadMore,
  } = useAsyncPaginatedOptions<PresentationOption>({
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

  function choose(option: PresentationOption) {
    setSelectedId(option.id);
    setSelectedName(option.name);
    setDraft(null);
    setOpen(false);
  }

  async function handleCreate() {
    const name = createFieldRef.current?.value ?? '';
    // Misma regla que valida el servidor, importada del contrato publico: no se reescribe aqui.
    const parsed = createPresentationSchema.safeParse({ name });
    if (!parsed.success) {
      setCreateError(INVALID_NAME_MESSAGE);
      return;
    }

    const formData = new FormData();
    formData.set('name', name);

    setCreatePending(true);
    const result = await createPresentationAction({ status: 'idle' }, formData);
    setCreatePending(false);

    if (result.status === 'error') {
      // `presentation_duplicate_name` SI identifica un campo, asi que se pinta junto al nombre y
      // no en la region de error del formulario (R20). QC-70: el codigo es el abierto por caso
      // concreto, y el texto es SIEMPRE el que devuelve el back -el del catalogo-, no una frase
      // propia para ese mismo caso (R32). Lo que sigue decidiendo el codigo es DONDE se pinta.
      setCreateError(result.message);
      return;
    }

    if (result.status === 'idle') {
      // El tipo de estado admite `idle` porque es el inicial de un formulario, pero la action
      // nunca lo devuelve. Se estrecha aqui, sin `as`, en vez de asumirlo.
      setCreateError(INVALID_NAME_MESSAGE);
      return;
    }

    // Exito: la presentacion nueva queda SELECCIONADA y el sub-formulario se cierra. No se toca
    // ningun otro campo del producto: lo escrito sigue donde estaba (R24). Se guarda ademas en
    // `created` para que siga ofreciendose aunque la consulta vigente no la traiga todavia.
    const nueva = { id: result.id, name: parsed.data.name };
    setCreated((previous) => [...previous, nueva]);
    setSelectedId(nueva.id);
    setSelectedName(nueva.name);
    setDraft(null);
    setCreateError(null);
    setCreating(false);
  }

  // Las creadas en linea van DELANTE y sin repetir lo que ya trae la consulta. Se escribe con
  // `flatMap` y no con el metodo de recorte por texto: aqui no se filtra por lo escrito, que es
  // trabajo del servidor.
  const seleccionables = [
    ...created.flatMap((nueva) => (items.some((item) => item.id === nueva.id) ? [] : [nueva])),
    ...items,
  ];

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
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        Presentación
      </span>

      {/*
        Campo espejo: lo que VIAJA en el `FormData` es el id, no el texto que se ve. Se pinta
        visualmente oculto -y no como `type="hidden"`- para conservar la validacion nativa de
        `required` que daba el primitivo `Select`: un `hidden` esta excluido de la validacion de
        restricciones del navegador, asi que degradarlo habria dejado el campo obligatorio sin
        aviso del navegador. Es el mismo patron que usa el propio primitivo de Base UI para su
        input de validacion, `aria-hidden` incluido: el nombre accesible lo lleva el combobox.
      */}
      <input
        type="text"
        name={PRESENTATION_FIELD}
        required
        value={selectedId}
        onChange={() => undefined}
        onFocus={() => document.getElementById(inputId)?.focus()}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        data-testid="presentation-value"
      />

      <Autocomplete
        items={seleccionables}
        mode="none"
        itemToStringValue={(option: PresentationOption) => option.name}
        value={displayValue}
        onValueChange={setDraft}
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
            data-testid="presentation-select"
          />
        </AutocompleteInputGroup>

        <AutocompleteContent className="min-w-56">
          <div
            data-testid="presentation-popup"
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
            onScroll={handleScroll}
          >
            {mensajeDeFallo === null ? (
              <>
                <AutocompleteList>
                  {(option: PresentationOption, index: number) => (
                    <AutocompleteItem
                      key={option.id}
                      index={index}
                      value={option}
                      className={`${TOUCH_TARGET} ${FIELD_TEXT} items-center`}
                      data-testid="presentation-option"
                      data-presentation-id={option.id}
                      onClick={() => choose(option)}
                    >
                      <span className="truncate">{option.name}</span>
                    </AutocompleteItem>
                  )}
                </AutocompleteList>

                {seleccionables.length === 0 && !cargando ? (
                  <p
                    className="px-2 py-3 text-sm text-muted-foreground"
                    data-testid="presentation-empty"
                  >
                    {EMPTY_LABEL}
                  </p>
                ) : null}
              </>
            ) : (
              <p
                role="alert"
                className="p-2 text-sm text-destructive"
                data-testid="presentation-load-error"
              >
                {mensajeDeFallo}
              </p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-1.5 px-2 text-sm text-muted-foreground empty:hidden"
              data-testid="presentation-loading"
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
        <p id={errorId} className="text-sm text-destructive" data-testid="presentation-select-error">
          {error}
        </p>
      )}

      {creating ? (
        // Sin `form`: este bloque vive dentro del formulario de producto y anidar formularios es
        // HTML invalido. El boton invoca la Server Action directamente.
        <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="presentation-create">
          <Label htmlFor={createFieldId}>Nombre de la nueva presentación</Label>
          <Input
            id={createFieldId}
            ref={createFieldRef}
            type="text"
            className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
            aria-invalid={createError === null ? undefined : true}
            aria-describedby={createError === null ? undefined : createErrorId}
            data-testid="presentation-create-name"
          />
          {createError === null ? null : (
            <p
              id={createErrorId}
              className="text-sm text-destructive"
              data-testid="presentation-create-error"
            >
              {createError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              className={TOUCH_TARGET}
              disabled={createPending}
              aria-busy={createPending}
              data-testid="presentation-create-submit"
              onClick={() => void handleCreate()}
            >
              Guardar presentación
            </Button>
            <Button
              type="button"
              variant="outline"
              className={TOUCH_TARGET}
              data-testid="presentation-create-cancel"
              onClick={() => {
                setCreating(false);
                setCreateError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          data-testid="presentation-create-open"
          onClick={() => setCreating(true)}
        >
          Crear presentación
        </Button>
      )}
    </div>
  );
}
