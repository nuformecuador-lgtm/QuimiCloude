'use client';

import { CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  PRESENTATION_UNIT_FIELD,
  PresentationUnitSelect,
} from '@/components/shared/presentation-unit-select';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useAsyncPaginatedOptions,
  type AsyncPageRequest,
} from '@/hooks/use-async-paginated-options';
import { createPresentationSchema } from '@/lib/modules/inventario';
import {
  createPresentationAction,
  listPresentationsAction,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitRef } from '@/lib/modules/unidades';
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
/** R10 y R17: la unidad es obligatoria, y sin ella la validacion previa no deja pasar el alta. */
const MISSING_UNIT_MESSAGE = 'Elige la unidad de la presentación.';
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
  /**
   * Ayuda del campo. Si viene, la etiqueta gana un icono de admiracion y lo que se pase aqui
   * es lo que sale en el tooltip al pasar por encima o al enfocarlo con el teclado. Si no
   * viene, no se pinta ningun icono: es el mismo trato que da `ProductField`, y la prop es
   * ADITIVA -ninguno de los dos consumidores de hoy tiene que cambiar-.
   */
  readonly helper?: ReactNode;
  /**
   * Catalogo ENTERO de unidades, para el alta rapida (R10, R11): una presentacion no se puede
   * crear sin unidad, asi que este formulario embebido tiene que pedirla.
   *
   * **Bajan por props y este componente NO las consulta** (QC-44 R46): las pide **una sola vez
   * por pantalla** el Server Component que la monta -la pagina de detalle de proveedor ya lo
   * hacia para su propio selector de unidad, y la de inventario pasa a hacerlo igual- y las hace
   * llegar hasta aqui. Pedirlas por su cuenta significaria una consulta por cada selector
   * montado y un catalogo distinto en cada uno.
   *
   * **Ausente o vacio = no se ofrece el alta rapida** (mismo criterio que R19 en la pantalla de
   * presentaciones): un formulario con un campo obligatorio imposible de rellenar es peor que no
   * ofrecerlo. Elegir una presentacion YA EXISTENTE sigue funcionando igual.
   */
  readonly units?: readonly UnitRef[];
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
 * **La ayuda de la etiqueta es opcional** (`helper`, QC-90): quien use el selector puede explicar
 * que es una presentacion sin que el componente decida el copy. Sin `helper` no se pinta nada
 * nuevo, asi que la prop no obliga a mover ninguno de los dos consumidores.
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
 * **El alta en linea PIDE LA UNIDAD** (QC-80 R10, R11): `presentations.unit_id` es `NOT NULL` y
 * el esquema del contrato publico la exige, asi que este camino -que crea presentaciones- tampoco
 * puede saltarsela. Las unidades **llegan por props** (`units`), pedidas una sola vez por la
 * pantalla que monta el selector (QC-44 R46); el componente no consulta el catalogo de unidades.
 * Sin ese catalogo el alta rapida **no se ofrece**, igual que R19 resolvio en la pantalla de
 * presentaciones; elegir una presentacion ya existente no se ve afectado.
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
  helper,
  units,
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
  /**
   * Unidad del alta rapida. **Aqui SI es estado de React**, al reves que en el panel de
   * presentaciones: este bloque no es un `form` -anidarlo dentro del formulario anfitrion seria
   * HTML invalido-, asi que el valor no puede viajar en ningun `FormData` propio y el manejador
   * lo lee de aqui. Cadena vacia = nada elegido, que es lo que el esquema rechaza.
   */
  const [createUnitId, setCreateUnitId] = useState('');
  const [createUnitError, setCreateUnitError] = useState<string | undefined>(undefined);
  const createFieldRef = useRef<HTMLInputElement>(null);

  /**
   * El alta rapida solo se ofrece con catalogo de unidades a mano. Sin el, el formulario pediria
   * una unidad que no se puede elegir y el envio moriria siempre en la validacion previa.
   */
  const puedeCrear = units !== undefined && units.length > 0;

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
    // QC-80 (R10): el esquema exige TAMBIEN la unidad, asi que mandar solo el nombre dejaria el
    // alta muerta en esta misma linea, sin llegar nunca a la Server Action.
    const parsed = createPresentationSchema.safeParse({ name, unitId: createUnitId });
    if (!parsed.success) {
      // Cada rechazo se pinta JUNTO a su campo (R17): el esquema dice cual es por `path[0]`, que
      // es el mismo mapeo que hace el panel de presentaciones. Sin unidad elegida, `unitId` es la
      // cadena vacia y este camino es el que impide el envio.
      const campos = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setCreateError(campos.has('name') ? INVALID_NAME_MESSAGE : null);
      setCreateUnitError(campos.has('unitId') ? MISSING_UNIT_MESSAGE : undefined);
      return;
    }

    const formData = new FormData();
    formData.set('name', name);
    // La unidad viaja con el MISMO nombre de campo que el panel de presentaciones, importado de
    // su selector: la Server Action es la misma y no se reescribe aqui el literal.
    formData.set(PRESENTATION_UNIT_FIELD, parsed.data.unitId);

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
    setCreateUnitError(undefined);
    setCreateUnitId('');
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
      <div className="flex items-center gap-1.5">
        <span id={labelId} className="text-sm font-medium">
          Presentación
        </span>
        {helper === undefined ? null : (
          // El disparador es un boton de verdad -alcanzable con el teclado-, y su `type="button"`
          // NO es un detalle: este selector vive dentro del formulario de producto, y un boton sin
          // tipo dentro de un `<form>` lo ENVIA -pedir ayuda guardaria el producto-.
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Qué es Presentación"
                  // 44x44 DE VERDAD, no `size-6`: `docs/architecture.md > Componentes > Regla:
                  // multiplataforma` exige ese objetivo tactil minimo y el `design.md` de QC-90
                  // no declara excepcion. Se usa la constante que este mismo archivo ya define
                  // arriba, en vez de reescribir las clases. Crece el BLANCO DE TOQUE del boton
                  // -que es lo que busca el dedo-; el icono dibujado sigue en `size-4`, y
                  // `items-center justify-center` lo mantiene pegado a la etiqueta dentro del
                  // `flex items-center gap-1.5` del padre. `shrink-0` impide que el flex le
                  // recorte los 44 px de ancho en pantallas estrechas.
                  className={`flex ${TOUCH_TARGET} shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                  data-testid="presentation-helper"
                />
              }
            >
              <CircleAlertIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent data-testid="presentation-helper-text">{helper}</TooltipContent>
          </Tooltip>
        )}
      </div>

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

      {!puedeCrear ? null : creating ? (
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

          {/*
            Unidad de la presentacion nueva (R10, R11). Es el MISMO selector que usa el panel de
            presentaciones -importado, no duplicado-, con dos diferencias que su API ya contempla:

            - `name={null}`: aqui NO puede aportar ningun campo al formulario anfitrion. El de la
              linea de catalogo ya tiene su propio `unitId` -el de la linea-, y un segundo input
              con ese nombre mandaria la unidad de la PRESENTACION en el envio de la linea.
            - controlado: sin `form` propio no hay `FormData` del que leer, asi que el valor vive
              en estado y lo lee el manejador del alta.
          */}
          <PresentationUnitSelect
            units={units}
            name={null}
            value={createUnitId}
            error={createUnitError}
            onValueChange={(unitId) => {
              setCreateUnitId(unitId);
              setCreateUnitError(undefined);
            }}
          />

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
                setCreateUnitError(undefined);
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
