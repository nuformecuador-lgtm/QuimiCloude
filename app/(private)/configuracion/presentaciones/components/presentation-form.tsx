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
import type { ErrorCode } from '@/lib/modules/errores';
import {
  createPresentationSchema,
  updatePresentationSchema,
  type PresentationView,
} from '@/lib/modules/inventario';
import {
  createPresentationAction,
  updatePresentationAction,
} from '@/lib/modules/inventario/adapters/driving/presentation-actions';

/**
 * Formulario de alta y edicion de presentacion (R22, R23, R24, R31, R34, `design.md > 7`).
 *
 * **Mismo patron no controlado ya mergeado en `order-form.tsx`, `product-form.tsx` y
 * `supplier-form.tsx`**: `<form action>` + `useActionState`, con el literal `{ status: 'idle' }`
 * **construido aqui** -un archivo `'use server'` solo puede exportar funciones async, asi que
 * `presentation-actions.ts` no puede publicar un `INITIAL_STATE` (`design.md > 5.1`)-. **Ninguna
 * libreria de formularios** (R31): no se instala nada y no se corre ningun CLI.
 *
 * **La validacion previa usa LOS MISMOS esquemas que valida el servidor**
 * (`createPresentationSchema` / `updatePresentationSchema`, del **barrel publico** de
 * `inventario`, que es client-safe). De ahi salen el recorte, el minimo, el maximo y el `refine`
 * que rechaza un nombre que normaliza a vacio -«---»-: aqui no se reescribe ninguna de esas
 * reglas. El servidor revalida igual: el cliente nunca es la frontera.
 *
 * **`bind` y no un argumento de mas**: `updatePresentationAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera. Aplicarle parcialmente
 * el `id` es el patron estandar de React y evita abrir el adaptador driving de QC-20, que R30
 * prohibe tocar.
 *
 * **R22 — un solo campo de negocio y nada mas.** `PresentationView` tiene exactamente uno:
 * `name`. Ni `id` visible, ni `nameNormalized` -lo deriva el dominio-, ni marcas de tiempo, ni
 * autoria. `PRESENTATION_BUSINESS_FIELDS` es la unica fuente de esa lista y se recorre para leer
 * lo escrito, de modo que anadir un campo al formulario sin anadirlo aqui -o al reves- se nota.
 *
 * **R23 — la edicion precarga y es REEMPLAZO COMPLETO**: el unico campo se envia entero, y el
 * caso de uso de QC-20 sustituye el nombre.
 *
 * **R24 — la traduccion de errores es por `code` estable, NUNCA por texto**: el mensaje que
 * devuelve la operacion se pinta, pero quien decide DONDE se pinta es el codigo.
 * `presentation_duplicate_name` va junto al campo; `invalid_input`, `presentation_not_found` y
 * `unauthorized` van a la region `role="alert"`
 * del formulario. Un rechazo no cierra el panel ni pierde lo escrito: React 19 resetea los campos
 * no controlados de un `<form action>` al completarse la action, asi que el estado de fallo
 * devuelve los valores escritos y el campo los recupera por `defaultValue`.
 */

/** El UNICO campo de negocio, con el mismo nombre que el adaptador driving lee del `FormData`. */
export const PRESENTATION_NAME_FIELD = 'name';

/** Fuente unica de los campos que este formulario captura (R22). */
export const PRESENTATION_BUSINESS_FIELDS = [PRESENTATION_NAME_FIELD] as const;

/**
 * `data-testid` del `SheetContent`, que lo pinta ESTE archivo -no `presentation-sheet.tsx`-.
 * El panel lo reexporta para que sus consumidores tengan un solo sitio al que mirar.
 */
export const PRESENTATION_SHEET_TESTID = 'presentation-sheet';

export const PRESENTATION_FORM_TESTID = 'presentation-form';
export const PRESENTATION_FORM_ERROR_TESTID = 'presentation-form-error';
export const PRESENTATION_FORM_ERROR_CODE_TESTID = 'presentation-form-error-code';
export const PRESENTATION_FORM_SUBMIT_TESTID = 'presentation-form-submit';
export const PRESENTATION_FORM_CANCEL_TESTID = 'presentation-form-cancel';
export const PRESENTATION_FIELD_NAME_TESTID = 'presentation-field-name';
export const PRESENTATION_ERROR_NAME_TESTID = 'presentation-error-name';

type PresentationFieldName = (typeof PRESENTATION_BUSINESS_FIELDS)[number];

/** Objetivo tactil minimo (44x44 px) de R34. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R34 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

/**
 * Copy del error de campo de la validacion previa. Se escribe aqui y no se toma de zod: sus
 * mensajes describen el esquema, no lo que el usuario tiene que hacer. **La REGLA sigue siendo la
 * del esquema**; aqui solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Readonly<Record<PresentationFieldName, string>> = {
  name: 'Escribe un nombre con al menos una letra o número.',
};

const FIELD_LABELS: Readonly<Record<PresentationFieldName, string>> = {
  name: 'Nombre',
};

/**
 * Donde se pinta cada `code` estable de `inventario/domain/errors.ts` (`design.md > 7`). Los
 * codigos que NO estan aqui -`invalid_input`, `presentation_not_found`, `unauthorized`- van a la
 * region `role="alert"` del formulario. `presentation_in_use` no puede llegar hasta aqui: solo lo
 * emite el borrado, que vive en su propio dialogo.
 *
 * QC-70 (R20): la clave es `presentation_duplicate_name`, el codigo abierto por caso concreto, y
 * el tipo es `ErrorCode`, asi que un codigo mal escrito -o retirado del catalogo- rompe el
 * typecheck aqui mismo en vez de caer callado al mensaje por defecto.
 */
const CODE_TO_FIELD: Readonly<Partial<Record<ErrorCode, PresentationFieldName>>> = {
  presentation_duplicate_name: PRESENTATION_NAME_FIELD,
};

/** QC-70 (R21): el codigo que fabrica la validacion previa sale del catalogo, no de un literal suelto. */
const INVALID_INPUT_CODE: ErrorCode = 'invalid_input';
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

type FieldErrors = Partial<Record<PresentationFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R24 prohibe perderlo. */
type FieldValues = Partial<Record<PresentationFieldName, string>>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade el error por campo de
 * la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }`.
 */
type PresentationFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** Codigo ESTABLE de la operacion, o `invalid_input` si el rechazo es de la validacion previa. */
      code: ErrorCode;
      message: string;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: PresentationFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values: FieldValues = {};
  for (const field of PRESENTATION_BUSINESS_FIELDS) {
    values[field] = readString(formData, field);
  }
  return values;
}

/**
 * Invoca la operacion que toca y normaliza su resultado. El alta devuelve ademas el id creado;
 * aqui no hace falta: lo unico que el formulario necesita saber es si fallo y con que codigo.
 */
async function submit(
  presentationId: string | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | { status: 'error'; code: ErrorCode; message: string }> {
  if (presentationId === undefined) {
    const result = await createPresentationAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updatePresentationAction.bind(null, presentationId);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

/**
 * Lo minimo que el panel necesita saber de la presentacion que edita, **derivado del contrato
 * publico** y no escrito a mano: asi una `PresentationView` entera encaja sin conversion, y
 * ningun campo que la pantalla no pinta (R9) se cuela hasta aqui.
 */
export type PresentationSheetTarget = Pick<PresentationView, 'id' | 'name'>;

export type PresentationFormProps = {
  /** Presentacion que se edita. Ausente en el alta (R22). */
  readonly presentation?: PresentationSheetTarget;
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R25). */
  readonly onSaved: () => void;
};

export function PresentationForm({ presentation, onSaved }: PresentationFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const inputId = `${fieldId}-${PRESENTATION_NAME_FIELD}`;
  const nameErrorId = `${inputId}-error`;
  const isEdit = presentation !== undefined;

  async function save(
    _previous: PresentationFormState,
    formData: FormData,
  ): Promise<PresentationFormState> {
    const values = readValues(formData);

    // El esquema de la edicion es el mismo que el del alta (reemplazo completo, R23). Se nombran
    // los dos para que quede escrito de donde sale cada regla.
    const parsed = isEdit
      ? updatePresentationSchema.safeParse(values)
      : createPresentationSchema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as PresentationFieldName;
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

    const result = await submit(presentation?.id, formData);

    if (result.status === 'error') {
      // R24: DONDE se pinta lo decide el `code`, nunca el texto del mensaje.
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
  const nameError = fieldErrors.name;

  /** Valor inicial del campo: lo escrito en el intento fallido; si no, el de la presentacion. */
  const initialName = values?.name ?? presentation?.name ?? '';

  const showFormError = state.status === 'error' && Object.keys(fieldErrors).length === 0;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar vive en el pie y
      `useFormStatus()` lo sigue viendo, porque el formulario es su ancestro.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi, y `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS (R34). Sin `100vh` y sin
      `position: fixed` propio: el que hay lo declara el primitivo.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid={PRESENTATION_SHEET_TESTID}
      isForm
      formProps={{ action: formAction, 'data-testid': PRESENTATION_FORM_TESTID }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar presentación' : 'Nueva presentación'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia el nombre de la presentación.'
            : 'Escribe el nombre de la nueva presentación.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {showFormError ? (
          // Region de error del formulario (R24): aqui van los rechazos que no senalan campo.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={PRESENTATION_FORM_ERROR_TESTID}
          >
            <p>{state.message}</p>
            <p className="text-xs" data-testid={PRESENTATION_FORM_ERROR_CODE_TESTID}>
              {state.code}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{FIELD_LABELS.name}</Label>
          {/*
            `key={initialName}`: Base UI avisa cuando el `defaultValue` de un campo no controlado
            cambia despues de montarse, y la clave fuerza un remontaje justo en ese salto -el que
            ocurre al volver de un intento fallido-. El campo sigue sin estar controlado.

            No se declara `maxLength` ni `pattern`: el minimo, el maximo y el `refine` que rechaza
            un nombre sin caracteres validos son del esquema del contrato publico, y escribirlos
            aqui seria una segunda copia de la regla.
          */}
          <Input
            key={initialName}
            id={inputId}
            name={PRESENTATION_NAME_FIELD}
            type="text"
            autoComplete="off"
            required
            defaultValue={initialName}
            className={`min-h-11 ${FIELD_TEXT}`}
            aria-invalid={nameError === undefined ? undefined : true}
            aria-describedby={nameError === undefined ? undefined : nameErrorId}
            data-testid={PRESENTATION_FIELD_NAME_TESTID}
          />

          {nameError === undefined ? null : (
            // R24: el error que SI senala campo se pinta junto a el, no en la region del formulario.
            <p
              id={nameErrorId}
              role="alert"
              className="text-sm text-destructive"
              data-testid={PRESENTATION_ERROR_NAME_TESTID}
            >
              {nameError}
            </p>
          )}
        </div>
      </div>
    </SheetContent>
  );
}

/**
 * Acciones del pie: cancelar y guardar. **Cancelar es `type="button"`** -y no un submit- porque
 * desde que el panel entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria.
 * Cierra por el primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura,
 * y al no navegar la URL conserva pagina, tamano, orden y busqueda (R21).
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
            data-testid={PRESENTATION_FORM_CANCEL_TESTID}
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
      data-testid={PRESENTATION_FORM_SUBMIT_TESTID}
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
