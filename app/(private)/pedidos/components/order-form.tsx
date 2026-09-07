'use client';

import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DEFAULT_ORDER_PRIORITY,
  EDITABLE_STATUS_VALUES,
  ORDER_PRIORITY_VALUES,
  createOrderSchema,
  updateOrderSchema,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import {
  createOrderAction,
  updateOrderAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { UnitRef } from '@/lib/modules/unidades';

import { OrderField } from './order-field';
import { RECIPE_FIELD, RecipePicker, type RecipePickerPage } from './recipe-picker';
import { ORDER_PRIORITY_LABELS, ORDER_STATUS_LABELS } from './order-status-badge';
import { UNIT_FIELD, UnitSelect } from './unit-select';

/**
 * Formulario de alta y edicion de pedido (R26-R30, R33, R34, R39, R45, `design.md > 8`).
 *
 * **Mismo patron no controlado ya mergeado en `product-form.tsx` y `supplier-form.tsx`**:
 * `<form action>` + `useActionState`, con el literal `{ status: 'idle' }` **construido aqui**
 * -un archivo `'use server'` no puede exportar constantes, y las actions de `pedidos` lo dejaron
 * escrito-. **Sin ninguna libreria de formularios** (R33, R42): la tabla de decisiones de esta
 * ficha la veta expresamente remitiendo a QC-22, no se instalo nada y no se corrio el CLI para la
 * primitiva de formulario. (Los nombres de los paquetes descartados no se escriben aqui, para que
 * una guardia de fuente que los busque no encuentre un falso positivo.)
 *
 * **La validacion previa usa LOS MISMOS esquemas que valida el servidor** (`createOrderSchema` /
 * `updateOrderSchema`, del barrel de `pedidos`, que es client-safe): el patron decimal, el «mayor
 * que cero» de la cantidad, el cero admitido en el precio y los conjuntos cerrados salen de ahi y
 * no se reescriben (R33). El servidor revalida igual: el cliente nunca es la frontera.
 *
 * **`bind` y no un argumento de mas**: `updateOrderAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera. Aplicarle parcialmente el
 * `id` es el patron estandar de React y evita tocar el adaptador driving de QC-34, que R46
 * prohibe abrir.
 *
 * **R26 — el alta lleva LOS CINCO campos de negocio y nada mas**: ni estado, ni motivo, ni
 * correlativo, ni fecha de solicitud, ni autoria. El estado de alta es siempre `PENDIENTE` y lo
 * pone el caso de uso; el correlativo lo entrega la secuencia de la base; los autores salen de la
 * sesion.
 *
 * **R27 — la prioridad es OPCIONAL con su defecto VISIBLE**, no implicito: un campo ausente del
 * formulario es ausencia para `readOptionalFormString`, pero un campo VACIO es error, asi que
 * este formulario emite **siempre** un valor valido y arranca con `DEFAULT_ORDER_PRIORITY`
 * preseleccionada.
 *
 * **R28, R29 — la edicion precarga y es REEMPLAZO COMPLETO** de los cinco campos mas el estado, y
 * es el UNICO sitio donde el estado se cambia. El selector de estado ofrece
 * `EDITABLE_STATUS_VALUES`, que **excluye `CANCELADO` por construccion** -se deriva de
 * `ORDER_STATUS_VALUES` en el contrato, no se escribe a mano aqui-: el unico camino a `CANCELADO`
 * es `cancelOrderAction`.
 *
 * **R30 — no hay campo de fecha de solicitud** en ningun modo: la pone el sistema.
 *
 * **R34 — la traduccion de errores es por `code`, NUNCA por texto** (`design.md > 8`): el mensaje
 * que devuelve la operacion se pinta, pero quien decide DONDE se pinta es el codigo estable. Un
 * rechazo no cierra el panel ni pierde lo escrito: React 19 resetea los campos no controlados de
 * un `<form action>` al completarse la action, asi que el estado de fallo devuelve los valores
 * escritos y cada campo los recupera por `defaultValue`.
 */

/** Los CINCO campos de negocio, con el MISMO nombre que el adaptador driving lee del `FormData`. */
export const ORDER_BUSINESS_FIELDS = [
  RECIPE_FIELD,
  'quantity',
  UNIT_FIELD,
  'unitPrice',
  'priority',
] as const;

/** Campo que SOLO existe en la edicion (R26, R29). */
export const ORDER_STATUS_FIELD = 'status';

export const ORDER_PRIORITY_SELECT_TESTID = 'order-priority-select';
export const ORDER_PRIORITY_OPTION_TESTID = 'order-priority-option';
export const ORDER_STATUS_SELECT_TESTID = 'order-status-select';
export const ORDER_STATUS_OPTION_TESTID = 'order-status-option';
export const ORDER_FORM_TESTID = 'order-form';
export const ORDER_FORM_ERROR_TESTID = 'order-form-error';
export const ORDER_FORM_SUBMIT_TESTID = 'order-form-submit';
export const ORDER_FORM_CANCEL_TESTID = 'order-form-cancel';

type OrderFieldName =
  | (typeof ORDER_BUSINESS_FIELDS)[number]
  | typeof ORDER_STATUS_FIELD;

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: sus mensajes describen el
 * esquema, no lo que el usuario tiene que hacer. **La REGLA sigue siendo la del esquema**; aqui
 * solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Readonly<Record<OrderFieldName, string>> = {
  recipeId: 'Elige una receta de la lista.',
  quantity: 'Escribe una cantidad decimal mayor que cero.',
  unitId: 'Elige una unidad de la lista.',
  unitPrice: 'Escribe un precio unitario decimal, cero incluido.',
  priority: 'Elige una de las prioridades disponibles.',
  status: 'Elige uno de los estados disponibles.',
};

const FIELD_LABELS = {
  quantity: 'Cantidad',
  unitPrice: 'Precio unitario',
  priority: 'Prioridad',
  status: 'Estado',
} as const;

/**
 * Donde se pinta cada `code` estable de `pedidos/domain/errors.ts` (`design.md > 8`). Los codigos
 * que NO estan aqui -`not_found`, `duplicate_number`, `unauthorized`, `invalid_input` sin campo
 * senalado- van a la region `role="alert"` del formulario.
 */
const CODE_TO_FIELD: Readonly<Record<string, OrderFieldName>> = {
  recipe_not_found: RECIPE_FIELD,
  unit_not_found: UNIT_FIELD,
  invalid_transition: ORDER_STATUS_FIELD,
};

const INVALID_INPUT_CODE = 'invalid_input';
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

type FieldErrors = Partial<Record<OrderFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R34 prohibe perderlo. */
type FieldValues = Partial<Record<OrderFieldName, string>>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }`.
 */
type OrderFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** Codigo ESTABLE de la operacion, o `invalid_input` si el rechazo es de la validacion previa. */
      code: string;
      message: string;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: OrderFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData, isEdit: boolean): FieldValues {
  const values: FieldValues = {};
  for (const field of ORDER_BUSINESS_FIELDS) {
    values[field] = readString(formData, field);
  }
  if (isEdit) {
    values[ORDER_STATUS_FIELD] = readString(formData, ORDER_STATUS_FIELD);
  }
  return values;
}

/**
 * Invoca la operacion que toca y normaliza su resultado. El alta devuelve ademas el id creado y
 * su correlativo; aqui no hace falta ninguno de los dos: lo unico que el formulario necesita
 * saber es si fallo y con que codigo.
 */
async function submit(
  order: OrderSummary | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | { status: 'error'; code: string; message: string }> {
  if (order === undefined) {
    const result = await createOrderAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updateOrderAction.bind(null, order.id);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

/**
 * Estado inicial del selector de edicion. `EDITABLE_STATUS_VALUES` no incluye `CANCELADO`, y un
 * pedido cancelado no llega hasta aqui -sus acciones de fila estan deshabilitadas (R24)-, pero el
 * desplegable tiene que arrancar con un valor que EXISTA entre sus opciones.
 */
function editableStatusOf(order: OrderSummary): string {
  const match = EDITABLE_STATUS_VALUES.find((value) => value === order.status);
  return match ?? EDITABLE_STATUS_VALUES[0];
}

export type OrderFormProps = {
  /** Pedido que se edita. Ausente en el alta (R26). */
  readonly order?: OrderSummary;
  /** Primera pagina del catalogo de recetas, por props (R43). */
  readonly recipes: RecipePickerPage;
  /** Unidades existentes, por props (R43). */
  readonly units: readonly UnitRef[];
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R35). */
  readonly onSaved: () => void;
};

export function OrderForm({ order, recipes, units, onSaved }: OrderFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const isEdit = order !== undefined;

  async function save(_previous: OrderFormState, formData: FormData): Promise<OrderFormState> {
    const values = readValues(formData, isEdit);

    // El esquema de la edicion es el del alta MAS el estado (reemplazo completo, R28). Se nombran
    // los dos para que quede escrito de donde sale cada regla.
    const parsed = isEdit
      ? updateOrderSchema.safeParse(values)
      : createOrderSchema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as OrderFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }

      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        code: INVALID_INPUT_CODE,
        message: FORM_ERROR_MESSAGE,
        fieldErrors,
        values,
      };
    }

    const result = await submit(order, formData);

    if (result.status === 'error') {
      // R34: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
      const field = CODE_TO_FIELD[result.code];
      return {
        status: 'error',
        code: result.code,
        message: result.message,
        fieldErrors: field === undefined ? {} : { [field]: result.message },
        values,
      };
    }

    return { status: 'success' };
  }

  const [state, formAction] = useActionState(save, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    onSaved();
  }, [state, onSaved]);

  const fieldErrors = state.status === 'error' ? state.fieldErrors : {};
  const values = state.status === 'error' ? state.values : undefined;

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del pedido. */
  const initialValue = (field: OrderFieldName, fromOrder: string): string =>
    values?.[field] ?? fromOrder;

  const showFormError = state.status === 'error' && Object.keys(fieldErrors).length === 0;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar vive en el pie y
      `useFormStatus()` lo sigue viendo, porque el formulario es su ancestro.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi, y `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS (R45). El desbordamiento vertical lo
      absorbe el CUERPO, no el panel.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="order-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': ORDER_FORM_TESTID }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar pedido' : 'Nuevo pedido'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos del pedido. Se guardan todos los campos.'
            : 'Completa los datos del pedido. La fecha y el número los pone el sistema.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {showFormError ? (
          // Region de error del formulario (R34): aqui van los rechazos que no senalan campo.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={ORDER_FORM_ERROR_TESTID}
          >
            <p data-testid="order-form-error-message">{state.message}</p>
            <p className="text-xs" data-testid="order-form-error-code">
              {state.code}
            </p>
          </div>
        ) : null}

        <RecipePicker
          initialPage={recipes}
          defaultValue={initialValue(RECIPE_FIELD, order?.recipeId ?? '')}
          defaultLabel={order?.recipeName ?? ''}
          error={fieldErrors.recipeId}
        />

        {/* Cantidad y precio: control de TEXTO con teclado decimal, jamas el numerico de HTML (R39). */}
        <OrderField
          name="quantity"
          label={FIELD_LABELS.quantity}
          required
          inputMode="decimal"
          defaultValue={initialValue('quantity', order?.quantity ?? '')}
          error={fieldErrors.quantity}
        />

        <UnitSelect
          units={units}
          defaultValue={initialValue(UNIT_FIELD, order?.unitId ?? '')}
          error={fieldErrors.unitId}
        />

        <OrderField
          name="unitPrice"
          label={FIELD_LABELS.unitPrice}
          required
          inputMode="decimal"
          defaultValue={initialValue('unitPrice', order?.unitPrice ?? '')}
          error={fieldErrors.unitPrice}
        />

        {/* R27: prioridad opcional, con el defecto del contrato PRESELECCIONADO y VISIBLE. */}
        <SelectField
          name="priority"
          label={FIELD_LABELS.priority}
          defaultValue={initialValue('priority', order?.priority ?? DEFAULT_ORDER_PRIORITY)}
          options={ORDER_PRIORITY_VALUES.map((value) => ({
            value,
            label: ORDER_PRIORITY_LABELS[value],
          }))}
          triggerTestId={ORDER_PRIORITY_SELECT_TESTID}
          optionTestId={ORDER_PRIORITY_OPTION_TESTID}
          error={fieldErrors.priority}
        />

        {/*
          R26 y R29: el selector de estado existe SOLO en la edicion, y ofrece exactamente
          `EDITABLE_STATUS_VALUES` -sin `CANCELADO`, por construccion del contrato-.
        */}
        {isEdit ? (
          <SelectField
            name={ORDER_STATUS_FIELD}
            label={FIELD_LABELS.status}
            defaultValue={initialValue(ORDER_STATUS_FIELD, editableStatusOf(order))}
            options={EDITABLE_STATUS_VALUES.map((value) => ({
              value,
              label: ORDER_STATUS_LABELS[value],
            }))}
            triggerTestId={ORDER_STATUS_SELECT_TESTID}
            optionTestId={ORDER_STATUS_OPTION_TESTID}
            error={fieldErrors.status}
          />
        ) : null}
      </div>
    </SheetContent>
  );
}

type SelectFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly triggerTestId: string;
  readonly optionTestId: string;
  readonly error?: string;
};

/**
 * Desplegable no controlado de un conjunto CERRADO del contrato (prioridad, estado). El valor
 * viaja en el `FormData` por el `input` oculto que monta el primitivo; el conjunto de opciones
 * llega ya derivado del contrato, nunca escrito a mano aqui.
 */
function SelectField({
  name,
  label,
  defaultValue,
  options,
  triggerTestId,
  optionTestId,
  error,
}: SelectFieldProps) {
  const labelId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>
      <Select name={name} defaultValue={defaultValue} items={[...options]}>
        <SelectTrigger
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
          data-testid={triggerTestId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-testid={optionTestId}
              data-value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`order-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Acciones del pie: cancelar y guardar. **Cancelar es `type="button"`** -y no un submit- porque
 * desde que el panel entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria.
 * Cierra por el primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura,
 * y al no navegar la URL conserva pagina, tamano, orden y filtros (R25).
 */
function FormActions() {
  return (
    <>
      <SheetClose
        render={
          <Button
            type="button"
            variant="outline-dashed"
            className={TOUCH_TARGET}
            data-testid={ORDER_FORM_CANCEL_TESTID}
          />
        }
      >
        Cancelar
      </SheetClose>
      <SaveButton />
    </>
  );
}

/**
 * Boton de envio. Componente aparte por una necesidad tecnica: `useFormStatus()` solo lee el
 * estado del `<form>` ANCESTRO, asi que dentro del componente que renderiza el `<form>`
 * devolveria siempre `pending: false` y el boton no se deshabilitaria nunca.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending}
      aria-busy={pending}
      data-testid={ORDER_FORM_SUBMIT_TESTID}
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
