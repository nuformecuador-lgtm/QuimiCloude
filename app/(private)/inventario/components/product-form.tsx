'use client';

import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { createProductSchema, type ProductView } from '@/lib/modules/inventario';
import {
  createProductAction,
  updateProductAction,
} from '@/lib/modules/inventario/adapters/driving/product-actions';

import { PRESENTATION_FIELD, PresentationSelect } from './presentation-select';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R31 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/**
 * Campos de texto del producto. `presentationId` no esta aqui: lo aporta su propio selector (T8).
 *
 * **La unidad tampoco esta**, y no por descuido: ver el comentario del formulario mas abajo.
 */
const TEXT_FIELDS = ['name', 'cost'] as const;

/** Campos enteros. `FormData` solo entrega cadenas, asi que se convierten antes de validar. */
const INT_FIELDS = ['stock', 'minPurchase', 'deliveryTime', 'qtyAlert'] as const;

type ProductFieldName =
  | (typeof TEXT_FIELDS)[number]
  | (typeof INT_FIELDS)[number]
  | typeof PRESENTATION_FIELD;

const ALL_FIELDS: readonly ProductFieldName[] = [
  ...TEXT_FIELDS,
  ...INT_FIELDS,
  PRESENTATION_FIELD,
];

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: los mensajes de zod estan
 * en ingles y describen el esquema, no lo que el usuario tiene que hacer.
 */
const FIELD_MESSAGES: Record<ProductFieldName, string> = {
  name: 'Escribe un nombre de 1 a 120 caracteres.',
  presentationId: 'Elige una presentación.',
  stock: 'Debe ser un número entero de 0 o más.',
  cost: 'Usa hasta 10 enteros y 4 decimales, con punto (por ejemplo 12.5000).',
  minPurchase: 'Debe ser un número entero de 0 o más.',
  deliveryTime: 'Debe ser un número entero de 0 o más.',
  qtyAlert: 'Debe ser un número entero de 0 o más.',
};

const FIELD_LABELS: Record<ProductFieldName, string> = {
  name: 'Nombre',
  presentationId: 'Presentación',
  stock: 'Existencia',
  cost: 'Costo',
  minPurchase: 'Compra mínima',
  deliveryTime: 'Tiempo de entrega',
  qtyAlert: 'Alerta de cantidad',
};

type FieldErrors = Partial<Record<ProductFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R20 prohibe perderlo. */
type FieldValues = Record<ProductFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` -QC-20 explica por que no exporta ninguna constante inicial- y su `code`
 * y `message` se recogen tal cual.
 */
type ProductFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** Codigo estable de la operacion, o `invalid_input` cuando el rechazo es de la validacion previa. */
      code: string;
      /** Mensaje para la region de error del formulario. Vacio si todos los errores son de campo. */
      message: string;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: ProductFormState = { status: 'idle' };

const INVALID_INPUT_CODE = 'invalid_input';
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values = {} as Record<ProductFieldName, string>;
  for (const field of ALL_FIELDS) {
    values[field] = readString(formData, field);
  }
  return values;
}

/**
 * Traduce una cadena de `FormData` al numero que espera el esquema. Una cadena vacia es "campo
 * omitido" (es lo que el esquema admite como `nullish`); una cadena presente que no es un entero
 * es un error de ESE campo, y se dice ahi -en vez de dejar que la action devuelva un unico
 * mensaje generico para los cuatro campos numericos-.
 */
function parseInteger(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'invalid';
  return Number(trimmed);
}

function optionalText(raw: string): string | undefined {
  return raw.trim() === '' ? undefined : raw;
}

type ProductFormProps = {
  /** Producto que se edita. Ausente en el alta (R19). */
  readonly product?: ProductView;
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R21). */
  readonly onSaved: () => void;
};

/**
 * Formulario de alta y edicion de producto (R18-R21, R23, `design.md > 5`).
 *
 * **Mismo patron que el login ya mergeado**: `<form action>` con campos NO controlados +
 * `useActionState`. **Sin ninguna libreria de formularios**: P2 quedo resuelta el 2026-09-03 en
 * que no entra ninguna dependencia nueva, asi que no se instalo la primitiva `form` de shadcn/ui
 * ni lo que arrastra. Tampoco hay peticiones a rutas de API propias ni estado local por campo.
 * (Los nombres de los dos paquetes descartados no se escriben aqui, para que una guardia de
 * fuente que los busque no encuentre un falso positivo.)
 *
 * **La validacion previa usa el MISMO esquema que valida el servidor** (`createProductSchema`,
 * importado del contrato publico de `inventario`, que es client-safe): asi los mensajes por campo
 * salen de la misma regla, sin reescribir ninguna. El servidor revalida igual; el cliente nunca
 * es la frontera.
 *
 * **R19 — la edicion es reemplazo completo**: el formulario precarga todos los valores actuales y
 * envia todos los campos, porque `updateProductSchema` es el mismo esquema del alta. No hay envio
 * por campos sueltos.
 *
 * **R20 — un rechazo no cierra el panel ni pierde lo escrito**: React 19 resetea los campos no
 * controlados de un `<form action>` al completarse la action, asi que el estado de fallo devuelve
 * los valores escritos y cada campo los recupera por `defaultValue` (mismo mecanismo que
 * `login-form.tsx`, incluida la `key` de montaje que evita el aviso de Base UI cuando el
 * `defaultValue` de un campo no controlado cambia despues de montarse).
 */
export function ProductForm({ product, onSaved }: ProductFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;

  async function save(_previous: ProductFormState, formData: FormData): Promise<ProductFormState> {
    const values = readValues(formData);
    const fieldErrors: FieldErrors = {};

    const numbers: Partial<Record<(typeof INT_FIELDS)[number], number>> = {};
    for (const field of INT_FIELDS) {
      const parsed = parseInteger(values[field]);
      if (parsed === 'invalid') {
        fieldErrors[field] = FIELD_MESSAGES[field];
        continue;
      }
      if (parsed !== undefined) numbers[field] = parsed;
    }

    const candidate = {
      name: values.name,
      presentationId: values.presentationId,
      cost: optionalText(values.cost),
      ...numbers,
    };

    const parsed = createProductSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as ProductFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        code: INVALID_INPUT_CODE,
        message: FORM_ERROR_MESSAGE,
        fieldErrors,
        values,
      };
    }

    const result =
      product === undefined
        ? await createProductAction({ status: 'idle' }, formData)
        : await updateProductAction(product.id, { status: 'idle' }, formData);

    if (result.status === 'error') {
      // `invalid_input`, `not_found` y `unauthorized` NO identifican campo: van a la region de
      // error del formulario, que es lo que R20 pide para ese caso.
      return {
        status: 'error',
        code: result.code,
        message: result.message,
        fieldErrors: {},
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

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del producto que se edita. */
  const initialValue = (field: ProductFieldName, fromProduct: string): string =>
    values?.[field] ?? fromProduct;

  const showFormError = state.status === 'error' && Object.keys(state.fieldErrors).length === 0;

  const isEdit = product !== undefined;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar puede vivir en el pie
      -donde R31 lo quiere, sin estirarse al ancho- y `useFormStatus()` lo sigue viendo, porque
      el formulario es su ancestro. Por eso este componente monta el panel y no solo los campos.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi: el primitivo trae `w-3/4`, que en un
      telefono deja el formulario en una columna incomoda. `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS. El desbordamiento vertical lo
      absorbe el CUERPO, no el panel: asi la cabecera y el pie no se van con el scroll.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="product-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': 'product-form' }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar producto' : 'Nuevo producto'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos del producto. Se guardan todos los campos.'
            : 'Completa los datos del producto.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {showFormError ? (
        // Region de error del formulario (R20): aqui van los rechazos que no senalan un campo.
        <div
          role="alert"
          id={formErrorId}
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          data-testid="product-form-error"
        >
          <p data-testid="product-form-error-message">{state.message}</p>
          <p className="text-xs" data-testid="product-form-error-code">
            {state.code}
          </p>
        </div>
      ) : null}

      <TextField
        field="name"
        idPrefix={fieldId}
        defaultValue={initialValue('name', product?.name ?? '')}
        error={fieldErrors.name}
        required
      />

      <PresentationSelect
        defaultValue={initialValue(PRESENTATION_FIELD, product?.presentationId ?? '') || undefined}
        error={fieldErrors.presentationId}
      />

      <IntegerField
        field="stock"
        idPrefix={fieldId}
        defaultValue={initialValue('stock', product?.stock?.toString() ?? '')}
        error={fieldErrors.stock}
      />

      {/*
        AQUI IBA LA UNIDAD, y su ausencia es deliberada (decision humana del 2026-09-03).

        R23 la pedia como TEXTO LIBRE porque eso era lo que la columna guardaba. El merge de QC-32
        (`modelo-unidades`) tumbo esa premisa mientras esta feature seguia en vuelo: `ProductView`
        ya no trae `unit: string | null` sino `unitId: UnitId | null`, una clave foranea al
        catalogo. Un campo de texto ya no vale, y un selector **no se puede construir hoy**: el
        contrato publico de `lib/modules/unidades` solo publica `normalizeUnitName` y los tipos,
        sin ninguna operacion para listar el catalogo.

        Asi que el producto se da de alta SIN unidad -`unitId` es nulable en el esquema, la base
        lo admite- y el selector lo montara la ficha que corresponda cuando QC-38
        (`crud-de-unidades`) exponga como listar unidades. Poner aqui un campo que escriba un UUID
        a mano seria peor que no tener campo.
      */}

      {/*
        `cost` es `type="text"` y NUNCA `type="number"`: un `number` de HTML pasa por el binario de
        coma flotante, y el importe viaja como cadena decimal a proposito desde el dominio.
      */}
      <TextField
        field="cost"
        idPrefix={fieldId}
        defaultValue={initialValue('cost', product?.cost ?? '')}
        error={fieldErrors.cost}
        inputMode="decimal"
      />

      <IntegerField
        field="minPurchase"
        idPrefix={fieldId}
        defaultValue={initialValue('minPurchase', product?.minPurchase.toString() ?? '')}
        error={fieldErrors.minPurchase}
      />

      <IntegerField
        field="deliveryTime"
        idPrefix={fieldId}
        defaultValue={initialValue('deliveryTime', product?.deliveryTime?.toString() ?? '')}
        error={fieldErrors.deliveryTime}
      />

      <IntegerField
        field="qtyAlert"
        idPrefix={fieldId}
        defaultValue={initialValue('qtyAlert', product?.qtyAlert?.toString() ?? '')}
        error={fieldErrors.qtyAlert}
      />

      </div>
    </SheetContent>
  );
}

type FieldProps = {
  readonly field: ProductFieldName;
  readonly idPrefix: string;
  readonly defaultValue: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly inputMode?: 'decimal';
};

/**
 * Campo de texto con su etiqueta y su error en linea. `key={defaultValue}` por la misma razon que
 * en `login-form.tsx`: Base UI avisa cuando el `defaultValue` de un campo no controlado cambia
 * despues de montarse, y la clave fuerza un remontaje justo en ese salto -el campo sigue sin
 * estar controlado-.
 */
function TextField({ field, idPrefix, defaultValue, error, required, inputMode }: FieldProps) {
  const inputId = `${idPrefix}-${field}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{FIELD_LABELS[field]}</Label>
      <Input
        key={defaultValue}
        id={inputId}
        name={field}
        type="text"
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`product-field-${field}`}
      />
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`product-error-${field}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Campo entero. `type="number"` con `inputMode` numerico: la action rechaza lo que no sea entero. */
function IntegerField({ field, idPrefix, defaultValue, error }: FieldProps) {
  const inputId = `${idPrefix}-${field}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{FIELD_LABELS[field]}</Label>
      <Input
        key={defaultValue}
        id={inputId}
        name={field}
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        defaultValue={defaultValue}
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`product-field-${field}`}
      />
      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`product-error-${field}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Acciones del pie: cancelar y guardar, en ese orden de lectura y alineadas a la derecha por el
 * pie del panel. **Cancelar es `type="button"`** -y no un submit- porque desde que el panel
 * entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria. Cierra por el
 * primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura.
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
            data-testid="product-form-cancel"
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
 * Boton de envio. Archivo aparte no, componente aparte si, y por la misma necesidad tecnica que
 * en el login: `useFormStatus()` solo lee el estado del `<form>` ANCESTRO, asi que dentro del
 * componente que renderiza el `<form>` devolveria siempre `pending: false`.
 */
function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className={TOUCH_TARGET}
      disabled={pending}
      aria-busy={pending}
      data-testid="product-form-submit"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
