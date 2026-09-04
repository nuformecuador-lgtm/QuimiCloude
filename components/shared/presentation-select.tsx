'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createPresentationSchema } from '@/lib/modules/inventario';
import {
  createPresentationAction,
  listPresentationsAction,
  type PresentationListResult,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

/** Campo del formulario de producto que alimenta este selector, via el `input` oculto del primitivo. */
export const PRESENTATION_FIELD = 'presentationId';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** La lista de presentaciones siempre empieza por su primera pagina. */
const FIRST_PAGE = 1;

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md`, y R31 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

const DUPLICATE_NAME_MESSAGE = 'Ya existe una presentación con ese nombre.';
const INVALID_NAME_MESSAGE = 'Escribe un nombre de presentación válido.';

/** Solo lo que el selector necesita de una presentacion. R25: aqui no se lista, ni se edita, ni se borra. */
type PresentationOption = {
  readonly id: string;
  readonly name: string;
};

type PresentationSelectProps = {
  /** Presentacion ya asignada al producto que se edita (R19). Ausente en el alta. */
  readonly defaultValue?: string;
  /** Mensaje de error del campo, si el formulario lo tiene (R20). */
  readonly error?: string;
};

/**
 * Selector de presentacion con alta en linea (QC-22 R24 y R25; QC-44 R37, R38 y R39).
 *
 * **Vive en `components/shared/` desde QC-44**, sin cambiar ni un detalle de su API
 * (`defaultValue`, `error`, campo `presentationId`, alta en linea y «Cargar más»): dos pantallas
 * -inventario y proveedores- lo necesitan igual, que es la condicion que
 * `docs/architecture.md > Regla: sin sobre-ingenieria` pone para promover. El barrel de
 * `app/(private)/inventario/components` lo reexporta, asi que la ruta lo sigue consumiendo por su
 * barrel.
 *
 * **Por que carga por su cuenta y no por props**: el conjunto de presentaciones no depende de la
 * pagina de productos que se este viendo y cambia cuando el propio usuario crea una sin salir del
 * panel. Se pide con `listPresentationsAction`, que es una Server Action del modulo -no un
 * `fetch` a una ruta de API propia (R28)-, y el componente no importa ni la composicion ni
 * Prisma (R30).
 *
 * **Como se alcanza cualquier presentacion (R24)**: el backend no ofrece busqueda y su tope es 25
 * por pagina, asi que se carga la primera pagina con `MAX_PAGE_SIZE` **importado** y, mientras
 * queden paginas, se ofrece «Cargar más», que anexa la siguiente. Sin inventar busqueda y sin
 * tocar QC-20.
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
export function PresentationSelect({ defaultValue, error }: PresentationSelectProps) {
  const labelId = useId();
  const createFieldId = useId();
  const createErrorId = useId();
  const errorId = useId();

  const [options, setOptions] = useState<readonly PresentationOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [value, setValue] = useState<string | null>(defaultValue ?? null);

  const [creating, setCreating] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createFieldRef = useRef<HTMLInputElement>(null);

  /** Vuelca en el estado el resultado de una pagina de presentaciones. No pide nada: solo aplica. */
  const applyPage = useCallback((result: PresentationListResult, requestedPage: number) => {
    if (result.status === 'error') {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    const loaded = result.data.items.map((item) => ({ id: item.id, name: item.name }));
    // La primera pagina REEMPLAZA y las siguientes ANEXAN: asi un montaje repetido (React en
    // modo estricto monta dos veces en desarrollo) no duplica la lista.
    setOptions((previous) => (requestedPage === 1 ? loaded : [...previous, ...loaded]));
    setPage(result.data.page);
    setTotalPages(result.data.totalPages);
  }, []);

  // Carga inicial (R24). Todo el estado se toca DESPUES del `await` a proposito: `react-hooks`
  // prohibe llamar a `setState` de forma sincrona dentro de un efecto, y ademas asi un desmontaje
  // durante la peticion no intenta pintar nada.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listPresentationsAction({ page: 1, pageSize: MAX_PAGE_SIZE });
      if (cancelled) return;
      applyPage(result, FIRST_PAGE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPage]);

  /** «Cargar más»: anexa la pagina siguiente hasta alcanzar cualquier presentacion (R24). */
  async function loadMore() {
    const requestedPage = page + 1;
    setLoading(true);
    const result = await listPresentationsAction({
      page: requestedPage,
      pageSize: MAX_PAGE_SIZE,
    });
    applyPage(result, requestedPage);
    setLoading(false);
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
      // `duplicate_name` SI identifica un campo, asi que se pinta junto al nombre y no en la
      // region de error del formulario (R20).
      setCreateError(result.code === 'duplicate_name' ? DUPLICATE_NAME_MESSAGE : result.message);
      return;
    }

    if (result.status === 'idle') {
      // El tipo de estado admite `idle` porque es el inicial de un formulario, pero la action
      // nunca lo devuelve. Se estrecha aqui, sin `as`, en vez de asumirlo.
      setCreateError(INVALID_NAME_MESSAGE);
      return;
    }

    // Exito: la presentacion nueva se anexa, queda SELECCIONADA y el sub-formulario se cierra.
    // No se toca ningun otro campo del producto: lo escrito sigue donde estaba (R24).
    setOptions((previous) => [...previous, { id: result.id, name: parsed.data.name }]);
    setValue(result.id);
    setCreateError(null);
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        Presentación
      </span>
      <Select
        name={PRESENTATION_FIELD}
        required
        value={value}
        onValueChange={(next) => setValue(next)}
        items={options.map((option) => ({ label: option.name, value: option.id }))}
      >
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid="presentation-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} data-testid="presentation-option">
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid="presentation-select-error">
          {error}
        </p>
      )}

      {loadError === null ? null : (
        <p role="alert" className="text-sm text-destructive" data-testid="presentation-load-error">
          {loadError}
        </p>
      )}

      {page < totalPages ? (
        <Button
          type="button"
          variant="outline"
          className={TOUCH_TARGET}
          disabled={loading}
          data-testid="presentation-load-more"
          onClick={() => void loadMore()}
        >
          Cargar más
        </Button>
      ) : null}

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
