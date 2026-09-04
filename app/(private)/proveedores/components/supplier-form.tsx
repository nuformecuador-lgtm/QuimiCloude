'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  createSupplierSchema,
  updateSupplierSchema,
  type SupplierView,
} from '@/lib/modules/proveedores';
import {
  createSupplierAction,
  updateSupplierAction,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';

import { SupplierField } from './supplier-field';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Los tres campos del proveedor, en el orden en que los nombra R27 y con el MISMO nombre que el
 * adaptador driving lee del `FormData` (`supplier-actions.ts > buildSupplierCandidate`).
 */
const SUPPLIER_FIELDS = ['name', 'phone', 'email'] as const;

type SupplierFieldName = (typeof SUPPLIER_FIELDS)[number];

/**
 * Copy de los errores por campo. Se escribe aqui y no se toma de zod: los mensajes de zod estan
 * en ingles y describen el esquema, no lo que el usuario tiene que hacer. **La REGLA sigue
 * siendo la del esquema** —largos maximos incluidos—; aqui solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Record<SupplierFieldName, string> = {
  name: 'Escribe un nombre de 1 a 120 caracteres.',
  phone: 'El teléfono es demasiado largo.',
  email: 'El correo electrónico es demasiado largo.',
};

const FIELD_LABELS: Record<SupplierFieldName, string> = {
  name: 'Nombre',
  phone: 'Teléfono',
  email: 'Correo electrónico',
};

type FieldErrors = Partial<Record<SupplierFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo: R32 prohibe perderlo. */
type FieldValues = Record<SupplierFieldName, string>;

/**
 * Estado del formulario. **No es el estado que devuelve la action**: anade los errores por campo
 * de la validacion previa y los valores escritos. A la action se le pasa siempre el literal
 * `{ status: 'idle' }` —un archivo `'use server'` no puede exportar constantes, y las actions de
 * `proveedores` lo dejaron escrito— y su `code` y `message` se recogen tal cual.
 */
type SupplierFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** Codigo ESTABLE de la operacion, o `invalid_input` si el rechazo es de la validacion previa. */
      code: string;
      /** Mensaje para la region de error del formulario. Sin uso si todos los errores son de campo. */
      message: string;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: SupplierFormState = { status: 'idle' };

/** Codigos estables de `proveedores/domain/errors.ts` que este formulario distingue. */
const DUPLICATE_NAME_CODE = 'duplicate_name';
const INVALID_INPUT_CODE = 'invalid_input';
const NOT_FOUND_CODE = 'not_found';

const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';
const CONTACT_REQUIRED_MESSAGE = 'Indica al menos un teléfono o un correo electrónico.';
const DUPLICATE_NAME_MESSAGE = 'Ya existe un proveedor con ese nombre.';
const BACK_TO_LIST_LABEL = 'Volver a la lista de proveedores';

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values = {} as FieldValues;
  for (const field of SUPPLIER_FIELDS) {
    values[field] = readString(formData, field);
  }
  return values;
}

/**
 * Invoca la operacion que toca y normaliza su resultado. **El alta y la edicion devuelven tipos
 * distintos** —el alta trae ademas el id creado— y aqui no hace falta ninguno de los dos: lo
 * unico que el formulario necesita saber es si fallo y con que codigo.
 *
 * **`bind` y no un argumento de mas**: `updateSupplierAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera. Aplicarle parcialmente
 * el `id` es el patron estandar de React para eso, y evita tocar el adaptador driving de QC-43,
 * que R49 prohibe abrir.
 */
async function submit(
  supplier: SupplierView | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | { status: 'error'; code: string; message: string }> {
  if (supplier === undefined) {
    const result = await createSupplierAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updateSupplierAction.bind(null, supplier.id);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

type SupplierFormProps = {
  /** Proveedor que se edita. Ausente en el alta (R27). */
  readonly supplier?: SupplierView;
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar (R33). */
  readonly onSaved: () => void;
};

/**
 * Formulario de alta y edicion de proveedor (R26-R28, R32, R45, R48, `design.md > 7`).
 *
 * **Mismo patron ya mergeado en `product-form.tsx`**: `<form action>` con campos NO controlados
 * + `useActionState`. **Sin ninguna libreria de formularios** (R45): la decision se cerro al
 * aprobar el spec de QC-22 y la tabla de esta ficha la repite; no se instalo nada, ni se corrio
 * el CLI para la primitiva de formulario. (Los nombres de los paquetes descartados no se
 * escriben aqui, para que una guardia de fuente que los busque no encuentre un falso positivo.)
 *
 * **La validacion previa usa el MISMO esquema que valida el servidor** (`createSupplierSchema` /
 * `updateSupplierSchema`, importados del contrato publico de `proveedores`, que es client-safe):
 * asi los mensajes por campo salen de la misma regla, sin reescribir ninguna. El servidor
 * revalida igual; el cliente nunca es la frontera.
 *
 * **La regla cruzada del esquema —telefono o correo, al menos uno— no senala campo**: su
 * `refine` no lleva `path`, asi que su rechazo va a la region de error del formulario, que es
 * exactamente lo que R32 pide para los errores que no identifican uno. Y se corta aqui: no se
 * llama a la operacion para que el servidor repita lo mismo.
 *
 * **R28 — la edicion es reemplazo completo**: el formulario precarga los valores actuales y
 * envia los tres campos, porque `updateSupplierSchema` **es** `createSupplierSchema`. No hay
 * envio por campos sueltos.
 *
 * **R32 — un rechazo no cierra el panel ni pierde lo escrito**: React 19 resetea los campos no
 * controlados de un `<form action>` al completarse la action, asi que el estado de fallo
 * devuelve los valores escritos y cada campo los recupera por `defaultValue`.
 *
 * **La traduccion de errores es por `code`, NUNCA por texto** (`design.md > 7`): el mensaje que
 * devuelve la operacion se pinta, pero quien decide DONDE se pinta es el codigo estable.
 */
export function SupplierForm({ supplier, onSaved }: SupplierFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;

  async function save(
    _previous: SupplierFormState,
    formData: FormData,
  ): Promise<SupplierFormState> {
    const values = readValues(formData);

    // El esquema de la edicion ES el del alta (reemplazo completo, R28). Se nombran los dos para
    // que quede escrito de donde sale cada regla y para que un futuro divorcio entre ambos se
    // note aqui en vez de en silencio.
    const schema = supplier === undefined ? createSupplierSchema : updateSupplierSchema;
    const parsed = schema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as SupplierFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }

      // Rechazo de la validacion previa: ni se llama a la operacion. El panel sigue abierto.
      return {
        status: 'error',
        code: INVALID_INPUT_CODE,
        message:
          Object.keys(fieldErrors).length > 0 ? FORM_ERROR_MESSAGE : CONTACT_REQUIRED_MESSAGE,
        fieldErrors,
        values,
      };
    }

    const result = await submit(supplier, formData);

    if (result.status === 'error') {
      return {
        status: 'error',
        code: result.code,
        message: result.message,
        // `duplicate_name` SI identifica campo -el nombre-, asi que se pinta junto a el. Los
        // demas codigos (`invalid_input`, `not_found`, `unauthorized`) no senalan ninguno y van
        // a la region de error del formulario (`design.md > 7`).
        fieldErrors: result.code === DUPLICATE_NAME_CODE ? { name: DUPLICATE_NAME_MESSAGE } : {},
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

  /** Valor inicial de un campo: lo escrito en el intento fallido; si no, el del proveedor. */
  const initialValue = (field: SupplierFieldName, fromSupplier: string): string =>
    values?.[field] ?? fromSupplier;

  const showFormError = state.status === 'error' && Object.keys(fieldErrors).length === 0;
  const isMissing = state.status === 'error' && state.code === NOT_FOUND_CODE;

  const isEdit = supplier !== undefined;

  return (
    /*
      `isForm`: el panel ENTERO es el <form>, asi que el boton de guardar vive en el pie y
      `useFormStatus()` lo sigue viendo, porque el formulario es su ancestro.

      `w-full` en angosto y `sm:max-w-md` a partir de ahi, y `pb-[env(safe-area-inset-bottom)]`
      para que el pie no quede bajo la barra de gestos de iOS (R48). El desbordamiento vertical
      lo absorbe el CUERPO, no el panel: asi la cabecera y el pie no se van con el scroll.
    */
    <SheetContent
      side="right"
      className="w-full pb-[env(safe-area-inset-bottom)] data-[side=right]:w-full sm:max-w-md"
      data-testid="supplier-sheet"
      isForm
      formProps={{ action: formAction, 'data-testid': 'supplier-form' }}
      footer={<FormActions />}
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? 'Cambia los datos del proveedor. Se guardan todos los campos.'
            : 'Completa los datos del proveedor. Hace falta al menos un teléfono o un correo.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {showFormError ? (
          // Region de error del formulario (R32): aqui van los rechazos que no senalan campo.
          <div
            role="alert"
            id={formErrorId}
            className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid="supplier-form-error"
          >
            <p data-testid="supplier-form-error-message">{state.message}</p>
            <p className="text-xs" data-testid="supplier-form-error-code">
              {state.code}
            </p>
            {isMissing ? (
              // `not_found`: el proveedor dejo de existir mientras el panel estaba abierto, asi
              // que lo unico util que queda es volver a la lista (`design.md > 7`). El destino
              // sale de la constante de ruta, nunca de un literal (R2).
              <Link
                href={SUPPLIERS_ROUTE}
                className={`${TOUCH_TARGET} inline-flex items-center underline underline-offset-4`}
                data-testid="supplier-form-back-to-list"
              >
                {BACK_TO_LIST_LABEL}
              </Link>
            ) : null}
          </div>
        ) : null}

        <SupplierField
          name="name"
          label={FIELD_LABELS.name}
          required
          autoComplete="organization"
          defaultValue={initialValue('name', supplier?.name ?? '')}
          error={fieldErrors.name}
        />

        <SupplierField
          name="phone"
          label={FIELD_LABELS.phone}
          inputMode="tel"
          autoComplete="tel"
          defaultValue={initialValue('phone', supplier?.phone ?? '')}
          error={fieldErrors.phone}
        />

        <SupplierField
          name="email"
          label={FIELD_LABELS.email}
          inputMode="email"
          autoComplete="email"
          defaultValue={initialValue('email', supplier?.email ?? '')}
          error={fieldErrors.email}
        />
      </div>
    </SheetContent>
  );
}

/**
 * Acciones del pie: cancelar y guardar. **Cancelar es `type="button"`** —y no un submit— porque
 * desde que el panel entero es un `<form>` cualquier boton sin tipo dentro de el lo enviaria.
 * Cierra por el primitivo (`SheetClose`), asi que no necesita saber nada del estado de apertura.
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
            data-testid="supplier-form-cancel"
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
      data-testid="supplier-form-submit"
    >
      {pending ? 'Guardando…' : 'Guardar'}
    </Button>
  );
}
