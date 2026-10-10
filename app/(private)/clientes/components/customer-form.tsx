'use client';

import { useActionState, useEffect, useId } from 'react';

import { ErrorAlert } from '@/components/shared/error-alert';
import { FormSheet } from '@/components/shared/form-sheet';
import { TextField } from '@/components/shared/text-field';
import type { ErrorCode, ErrorState } from '@/lib/modules/errores';
import {
  createCustomerSchema,
  CUSTOMER_FIRST_NAMES_MAX_LENGTH,
  CUSTOMER_LAST_NAMES_MAX_LENGTH,
  CUSTOMER_CITY_MAX_LENGTH,
  CUSTOMER_PHONE_MAX_LENGTH,
  CUSTOMER_EMAIL_MAX_LENGTH,
  CUSTOMER_ADDRESS_MAX_LENGTH,
  type CustomerView,
} from '@/lib/modules/clientes';
import {
  createCustomerAction,
  updateCustomerAction,
} from '@/lib/modules/clientes/adapters/driving/customer-actions';

/**
 * Formulario de alta y edicion de cliente.
 *
 * `<form action>` no controlado + `useActionState`, con `{ status: 'idle' }` construido aqui
 * porque un archivo `'use server'` solo puede exportar funciones async.
 *
 * La validacion previa usa el MISMO esquema que valida el servidor (`createCustomerSchema`, del
 * barrel publico de `clientes`), asi que los largos y la obligatoriedad no se reescriben aqui.
 * El servidor revalida igual: el cliente nunca es la frontera.
 *
 * El modulo no tiene ningun codigo de rechazo que identifique un campo (ni duplicado, ni
 * bloqueo): todo lo que devuelve la operacion va a la region general del formulario, y solo la
 * validacion previa pinta errores junto a un campo.
 *
 * `bind` y no un argumento de mas: `updateCustomerAction` tiene la firma
 * `(id, prevState, formData)`, que no es la que `useActionState` espera.
 */

export const CUSTOMER_FIRST_NAMES_FIELD = 'firstNames';
export const CUSTOMER_LAST_NAMES_FIELD = 'lastNames';
export const CUSTOMER_CITY_FIELD = 'city';
export const CUSTOMER_PHONE_FIELD = 'phone';
export const CUSTOMER_EMAIL_FIELD = 'email';
export const CUSTOMER_ADDRESS_FIELD = 'address';

/** Fuente unica de los seis campos de negocio. */
export const CUSTOMER_BUSINESS_FIELDS = [
  CUSTOMER_FIRST_NAMES_FIELD,
  CUSTOMER_LAST_NAMES_FIELD,
  CUSTOMER_CITY_FIELD,
  CUSTOMER_PHONE_FIELD,
  CUSTOMER_EMAIL_FIELD,
  CUSTOMER_ADDRESS_FIELD,
] as const;

/** Los tres obligatorios: nombres, apellidos y ciudad. Telefono, correo y direccion no lo son. */
export const CUSTOMER_REQUIRED_FIELDS = [
  CUSTOMER_FIRST_NAMES_FIELD,
  CUSTOMER_LAST_NAMES_FIELD,
  CUSTOMER_CITY_FIELD,
] as const;

export type CustomerFieldName = (typeof CUSTOMER_BUSINESS_FIELDS)[number];

/** `data-testid` del panel, que lo pinta este archivo, no `customer-sheet.tsx`. */
export const CUSTOMER_SHEET_TESTID = 'customer-sheet';

export const CUSTOMER_FORM_TESTID = 'customer-form';
export const CUSTOMER_FORM_ERROR_TESTID = 'customer-form-error';
export const CUSTOMER_FORM_ERROR_CODE_TESTID = 'customer-form-error-code';
export const CUSTOMER_FORM_SUBMIT_TESTID = 'customer-form-submit';
export const CUSTOMER_FORM_CANCEL_TESTID = 'customer-form-cancel';

export const CUSTOMER_FIELD_TESTIDS: Readonly<Record<CustomerFieldName, string>> = {
  firstNames: 'customer-field-first-names',
  lastNames: 'customer-field-last-names',
  city: 'customer-field-city',
  phone: 'customer-field-phone',
  email: 'customer-field-email',
  address: 'customer-field-address',
};

export const CUSTOMER_ERROR_TESTIDS: Readonly<Record<CustomerFieldName, string>> = {
  firstNames: 'customer-error-first-names',
  lastNames: 'customer-error-last-names',
  city: 'customer-error-city',
  phone: 'customer-error-phone',
  email: 'customer-error-email',
  address: 'customer-error-address',
};

const FIELD_LABELS: Readonly<Record<CustomerFieldName, string>> = {
  firstNames: 'Nombres',
  lastNames: 'Apellidos',
  city: 'Ciudad',
  phone: 'Teléfono',
  email: 'Correo',
  address: 'Dirección',
};

/**
 * Solo `email` y `phone` llevan un `inputMode` especifico: ninguno usa `type="email"` ni
 * `pattern`, porque el navegador bloquearia un envio que el servidor aceptaria.
 */
const FIELD_INPUT_MODE: Readonly<Partial<Record<CustomerFieldName, 'email' | 'tel'>>> = {
  email: 'email',
  phone: 'tel',
};

/** El `maxLength` de cada campo sale del esquema publicado, nunca de un numero suelto. */
const FIELD_MAX_LENGTH: Readonly<Record<CustomerFieldName, number>> = {
  firstNames: CUSTOMER_FIRST_NAMES_MAX_LENGTH,
  lastNames: CUSTOMER_LAST_NAMES_MAX_LENGTH,
  city: CUSTOMER_CITY_MAX_LENGTH,
  phone: CUSTOMER_PHONE_MAX_LENGTH,
  email: CUSTOMER_EMAIL_MAX_LENGTH,
  address: CUSTOMER_ADDRESS_MAX_LENGTH,
};

/**
 * Copy del error de campo de la validacion previa. La regla que describe sigue siendo la del
 * esquema; aqui solo se traduce su incumplimiento.
 */
const FIELD_MESSAGES: Readonly<Record<CustomerFieldName, string>> = {
  firstNames: `Escribe los nombres (máximo ${CUSTOMER_FIRST_NAMES_MAX_LENGTH} caracteres).`,
  lastNames: `Escribe los apellidos (máximo ${CUSTOMER_LAST_NAMES_MAX_LENGTH} caracteres).`,
  city: `Escribe la ciudad (máximo ${CUSTOMER_CITY_MAX_LENGTH} caracteres).`,
  phone: `El teléfono es demasiado largo (máximo ${CUSTOMER_PHONE_MAX_LENGTH} caracteres).`,
  email: `El correo es demasiado largo (máximo ${CUSTOMER_EMAIL_MAX_LENGTH} caracteres).`,
  address: `La dirección es demasiado larga (máximo ${CUSTOMER_ADDRESS_MAX_LENGTH} caracteres).`,
};

const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const FORM_ERROR_MESSAGE = 'Revisa los campos marcados.';

type FieldErrors = Partial<Record<CustomerFieldName, string>>;

/** Lo escrito en el formulario, para devolverlo tras un fallo. */
type FieldValues = Partial<Record<CustomerFieldName, string>>;

type CustomerFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      /** El error TAL CUAL, para que el render estreche por `code` sin perder el `reference`. */
      serverError: ErrorState;
      fieldErrors: FieldErrors;
      values: FieldValues;
    };

const INITIAL_STATE: CustomerFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function readValues(formData: FormData): FieldValues {
  const values: FieldValues = {};
  for (const field of CUSTOMER_BUSINESS_FIELDS) values[field] = readString(formData, field);
  return values;
}

/**
 * Invoca la operacion que toca y normaliza su resultado: si fallo, el `ErrorState`; si no,
 * exito. El alta devuelve tambien el id creado, que aqui no hace falta.
 */
async function submit(
  customerId: string | undefined,
  formData: FormData,
): Promise<{ status: 'success' } | ErrorState> {
  if (customerId === undefined) {
    const result = await createCustomerAction({ status: 'idle' }, formData);
    return result.status === 'error' ? result : { status: 'success' };
  }

  const update = updateCustomerAction.bind(null, customerId);
  const result = await update({ status: 'idle' }, formData);
  return result.status === 'error' ? result : { status: 'success' };
}

export type CustomerFormProps = {
  /** Cliente que se edita. Ausente en el alta. */
  readonly customer?: CustomerView;
  /** Lo llama el panel cuando la operacion termina bien: cerrar, avisar y refrescar. */
  readonly onSaved: () => void;
};

export function CustomerForm({ customer, onSaved }: CustomerFormProps) {
  const fieldId = useId();
  const formErrorId = `${fieldId}-form-error`;
  const isEdit = customer !== undefined;

  async function save(
    _previous: CustomerFormState,
    formData: FormData,
  ): Promise<CustomerFormState> {
    const values = readValues(formData);

    const candidate = {
      firstNames: values.firstNames ?? '',
      lastNames: values.lastNames ?? '',
      city: values.city ?? '',
      phone: values.phone,
      email: values.email,
      address: values.address,
    };
    const parsed = createCustomerSchema.safeParse(candidate);

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '') as CustomerFieldName;
        if (field in FIELD_MESSAGES && fieldErrors[field] === undefined) {
          fieldErrors[field] = FIELD_MESSAGES[field];
        }
      }

      // Rechazo de la validacion previa: ni se llama a la operacion.
      return {
        status: 'error',
        serverError: { status: 'error', code: INVALID_INPUT_CODE, message: FORM_ERROR_MESSAGE },
        fieldErrors,
        values,
      };
    }

    const result = await submit(customer?.id, formData);

    if (result.status === 'error') {
      // Ningun codigo de este modulo identifica un campo: todo va a la region general.
      return { status: 'error', serverError: result, fieldErrors: {}, values };
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
  const formError =
    state.status === 'error' && Object.keys(fieldErrors).length === 0
      ? state.serverError
      : undefined;

  const valueOf = (field: CustomerFieldName): string =>
    values?.[field] ?? (customer?.[field] ?? '');

  return (
    <FormSheet
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      description={isEdit ? 'Cambia los datos del cliente.' : 'Describe el nuevo cliente.'}
      formAction={formAction}
      cancelTouch="prop"
      testIds={{
        sheet: CUSTOMER_SHEET_TESTID,
        form: CUSTOMER_FORM_TESTID,
        cancel: CUSTOMER_FORM_CANCEL_TESTID,
        submit: CUSTOMER_FORM_SUBMIT_TESTID,
      }}
    >
      {formError === undefined ? null : (
        <ErrorAlert
          error={formError}
          id={formErrorId}
          className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          testId={CUSTOMER_FORM_ERROR_TESTID}
          withDataCode
          renderCatalogued={(catalogued) => (
            <>
              <p>{catalogued.message}</p>
              <p className="text-xs" data-testid={CUSTOMER_FORM_ERROR_CODE_TESTID}>
                {catalogued.code}
              </p>
            </>
          )}
        />
      )}

      {CUSTOMER_BUSINESS_FIELDS.map((field) => {
        const required = (CUSTOMER_REQUIRED_FIELDS as readonly string[]).includes(field);
        return (
          <TextField
            key={field}
            id={`${fieldId}-${field}`}
            name={field}
            label={FIELD_LABELS[field]}
            inputMode={FIELD_INPUT_MODE[field]}
            autoComplete="off"
            required={required}
            ariaRequired={required}
            maxLength={FIELD_MAX_LENGTH[field]}
            defaultValue={valueOf(field)}
            remountOnDefault
            error={fieldErrors[field]}
            testId={CUSTOMER_FIELD_TESTIDS[field]}
            errorTestId={CUSTOMER_ERROR_TESTIDS[field]}
          />
        );
      })}
    </FormSheet>
  );
}
