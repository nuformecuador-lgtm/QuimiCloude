'use client';

import { useActionState, useId } from 'react';

import { ErrorAlert } from '@/components/shared/error-alert';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ErrorState } from '@/lib/modules/errores';
import type { WhatsappConnectionView } from '@/lib/modules/integraciones';
import {
  createWhatsappConnectionAction,
  updateWhatsappConnectionAction,
} from '@/lib/modules/integraciones/adapters/driving/whatsapp-connection-actions';

import { useRevealWhatsappVerifyToken } from './whatsapp-webhook-panel';

export const WHATSAPP_CONNECTION_FORM_TESTID = 'whatsapp-connection-form';
export const WHATSAPP_CONNECTION_FORM_ERROR_TESTID = 'whatsapp-connection-form-error';
export const WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID = 'whatsapp-connection-form-submit';
export const WHATSAPP_CONNECTION_FORM_CANCEL_TESTID = 'whatsapp-connection-form-cancel';

export const WHATSAPP_PUBLIC_FIELDS = ['displayName', 'metaAppId', 'wabaId', 'phoneNumberId'] as const;
export const WHATSAPP_SECRET_FIELDS = ['accessToken', 'appSecret'] as const;

type PublicField = (typeof WHATSAPP_PUBLIC_FIELDS)[number];
type SecretField = (typeof WHATSAPP_SECRET_FIELDS)[number];
export type WhatsappFormField = PublicField | SecretField;

export const WHATSAPP_FIELD_LABELS: Readonly<Record<WhatsappFormField, string>> = {
  displayName: 'Nombre visible',
  metaAppId: 'App ID',
  wabaId: 'WABA ID',
  phoneNumberId: 'Phone Number ID',
  accessToken: 'Access Token',
  appSecret: 'App Secret',
};

export const WHATSAPP_FIELD_TESTIDS: Readonly<Record<WhatsappFormField, string>> = {
  displayName: 'whatsapp-field-display-name',
  metaAppId: 'whatsapp-field-meta-app-id',
  wabaId: 'whatsapp-field-waba-id',
  phoneNumberId: 'whatsapp-field-phone-number-id',
  accessToken: 'whatsapp-field-access-token',
  appSecret: 'whatsapp-field-app-secret',
};

export const WHATSAPP_FORM_TEXTS = {
  submit: 'Guardar y probar',
  submitPending: 'Guardando…',
  cancel: 'Cancelar',
  keepSecretHint: 'Déjalo vacío para conservar el actual',
  testFailedPrefix: 'Meta rechazó la prueba: ',
} as const;

/** 16 px en todos los anchos: por debajo, iOS hace zoom al enfocar el campo. */
export const WHATSAPP_FIELD_CLASS = 'min-h-11 text-base md:text-base';

type PublicValues = Partial<Record<PublicField, string>>;

type Failure = { readonly kind: 'error'; readonly error: ErrorState } | {
  readonly kind: 'test_failed';
  readonly message: string;
};

type FormState =
  | { status: 'idle' }
  | { status: 'done' }
  | { status: 'failed'; failure: Failure; values: PublicValues };

const INITIAL_STATE: FormState = { status: 'idle' };

function readPublicValues(formData: FormData): PublicValues {
  const values: PublicValues = {};
  for (const field of WHATSAPP_PUBLIC_FIELDS) {
    const value = formData.get(field);
    values[field] = typeof value === 'string' ? value : '';
  }
  return values;
}

export type WhatsappConnectionFormProps =
  | { readonly mode: 'create' }
  | {
      readonly mode: 'edit';
      readonly connection: WhatsappConnectionView;
      readonly onSaved: () => void;
      readonly onCancel: () => void;
    };

/**
 * Los secretos nunca llevan valor inicial ni vuelven tras un fallo: solo se conservan los campos
 * no secretos. React vacia un `<form action>` no controlado al terminar la accion, por eso lo
 * escrito vuelve desde el estado.
 */
export function WhatsappConnectionForm(props: WhatsappConnectionFormProps) {
  const fieldId = useId();
  const reveal = useRevealWhatsappVerifyToken();
  const isEdit = props.mode === 'edit';
  const connection = isEdit ? props.connection : undefined;
  const onSaved = isEdit ? props.onSaved : undefined;

  async function save(_previous: FormState, formData: FormData): Promise<FormState> {
    const values = readPublicValues(formData);

    if (connection === undefined) {
      const result = await createWhatsappConnectionAction({ status: 'idle' }, formData);
      if (result.status === 'created') {
        // Se revela dentro de la accion: al crear, el refresco del servidor desmonta este
        // formulario en el mismo paso y un efecto ya no llegaria a correr.
        reveal({ verifyToken: result.verifyToken, webhook: result.webhook });
        return { status: 'done' };
      }
      if (result.status === 'test_failed') {
        return { status: 'failed', failure: { kind: 'test_failed', message: result.message }, values };
      }
      if (result.status === 'error') {
        return { status: 'failed', failure: { kind: 'error', error: result }, values };
      }
      return { status: 'idle' };
    }

    const update = updateWhatsappConnectionAction.bind(null, connection.id);
    const result = await update({ status: 'idle' }, formData);
    if (result.status === 'saved') {
      onSaved?.();
      return { status: 'done' };
    }
    if (result.status === 'test_failed') {
      return { status: 'failed', failure: { kind: 'test_failed', message: result.message }, values };
    }
    if (result.status === 'error') {
      return { status: 'failed', failure: { kind: 'error', error: result }, values };
    }
    return { status: 'idle' };
  }

  const [state, formAction] = useActionState(save, INITIAL_STATE);

  const failure = state.status === 'failed' ? state.failure : undefined;
  const values = state.status === 'failed' ? state.values : undefined;
  const valueOf = (field: PublicField): string => values?.[field] ?? connection?.[field] ?? '';

  return (
    <form
      action={formAction}
      data-testid={WHATSAPP_CONNECTION_FORM_TESTID}
      data-mode={props.mode}
      className="flex flex-col gap-4 rounded-lg border p-4"
    >
      {failure === undefined ? null : <FormFailure failure={failure} />}

      {WHATSAPP_PUBLIC_FIELDS.map((field) => {
        const id = `${fieldId}-${field}`;
        const value = valueOf(field);
        return (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={id}>{WHATSAPP_FIELD_LABELS[field]}</Label>
            {/* La clave remonta el campo cuando vuelve lo escrito tras un fallo. */}
            <Input
              key={value}
              id={id}
              name={field}
              type="text"
              autoComplete="off"
              required
              aria-required
              defaultValue={value}
              className={WHATSAPP_FIELD_CLASS}
              data-testid={WHATSAPP_FIELD_TESTIDS[field]}
            />
          </div>
        );
      })}

      {WHATSAPP_SECRET_FIELDS.map((field) => {
        const id = `${fieldId}-${field}`;
        const hintId = `${id}-hint`;
        return (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={id}>{WHATSAPP_FIELD_LABELS[field]}</Label>
            <Input
              id={id}
              name={field}
              type="password"
              autoComplete="off"
              required={!isEdit}
              aria-required={!isEdit}
              aria-describedby={isEdit ? hintId : undefined}
              className={WHATSAPP_FIELD_CLASS}
              data-testid={WHATSAPP_FIELD_TESTIDS[field]}
            />
            {isEdit ? (
              <p id={hintId} className="text-sm text-muted-foreground">
                {WHATSAPP_FORM_TEXTS.keepSecretHint}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {isEdit ? (
          <Button
            type="button"
            variant="outline"
            touch
            onClick={props.onCancel}
            data-testid={WHATSAPP_CONNECTION_FORM_CANCEL_TESTID}
          >
            {WHATSAPP_FORM_TEXTS.cancel}
          </Button>
        ) : null}
        <SubmitButton
          label={WHATSAPP_FORM_TEXTS.submit}
          pendingLabel={WHATSAPP_FORM_TEXTS.submitPending}
          testId={WHATSAPP_CONNECTION_FORM_SUBMIT_TESTID}
        />
      </div>
    </form>
  );
}

const FAILURE_CLASS = 'flex flex-col gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive';

function FormFailure({ failure }: { readonly failure: Failure }) {
  if (failure.kind === 'test_failed') {
    return (
      <div role="alert" className={FAILURE_CLASS} data-testid={WHATSAPP_CONNECTION_FORM_ERROR_TESTID}>
        <p className="break-words">
          {WHATSAPP_FORM_TEXTS.testFailedPrefix}
          {failure.message}
        </p>
      </div>
    );
  }

  return (
    <ErrorAlert
      error={failure.error}
      className={FAILURE_CLASS}
      testId={WHATSAPP_CONNECTION_FORM_ERROR_TESTID}
      withDataCode
    />
  );
}
