'use client';

// QC-79 T19 — El formulario de la pagina publica (`design.md > 5.1`, R17, R23, R24, R25).
//
// Formulario HTML real: `<form action={formAction}>` con `useActionState` sobre
// `setCredentialWithLinkAction`, campos NO controlados y sin ninguna peticion a mano. Mismo patron
// que `app/(public)/login/components/login-form.tsx`.
//
// **La action se importa por su RUTA EXACTA y no por el barrel del modulo**: el contrato
// `lib/modules/identity/index.ts` no reexporta adaptadores driving (R32) y un `'use server'` en su
// cierre transitivo romperia a cualquier componente de cliente que lo importe.
//
// Tres cosas que este componente NO hace, y las tres son requisitos:
//   - **No muestra ningun dato de la persona** (R24): no los pide por props, no los recibe de la
//     action —`SetCredentialFormState` no tiene ningun campo que los transporte— y no los pinta
//     ni antes, ni durante, ni despues. No hay hueco por el que puedan llegar.
//   - **No valida el enlace al montarse** (`design.md > 11.4`): el secreto viaja en un campo
//     oculto y solo se comprueba donde se escribe, dentro del `UPDATE` condicional del adaptador.
//     Comprobarlo aqui seria un oraculo de lectura y un segundo camino que puede divergir del real.
//   - **No inicia sesion al terminar** (`design.md > 11.5`): pinta el exito y un ENLACE al login.
//
// El texto de cada regla incumplida lo compone la UI con `CREDENTIAL_RULE_LABELS` a partir del
// codigo que devuelve el dominio (`design.md > 5.3`, QC-19 R23): los codigos son estables e
// independientes del idioma, y esto es exactamente para lo que se disenaron. El estado
// `invalid_credential` NO es un `ErrorState` justamente por esto (`design.md > 11.3`).

import Link from 'next/link';
import { useActionState } from 'react';

import { CREDENTIAL_RULE_LABELS } from '@/components/shared/credential-rule-labels';
import { Button } from '@/components/ui/button';
import {
  setCredentialWithLinkAction,
  type SetCredentialFormState,
} from '@/lib/modules/identity/adapters/driving/credential-setup-actions';
import { LOGIN_ROUTE } from '@/lib/shared/routes';

import { CredentialInput } from './credential-input';
import { SET_CREDENTIAL_LABELS, type SetCredentialLabels } from './set-credential-labels';
import { SubmitButton } from './submit-button';

/**
 * El estado inicial se construye aqui: `credential-setup-actions.ts` lleva `'use server'` y un
 * archivo asi solo puede exportar funciones async, asi que no puede publicar la constante.
 */
const INITIAL_STATE: SetCredentialFormState = { status: 'idle' };

const CREDENTIAL_ID = 'credential';
const CONFIRMATION_ID = 'credential-confirmation';
const FEEDBACK_ID = 'set-credential-feedback';

type SetCredentialFormProps = {
  /** El secreto del enlace, tal y como llego en el segmento de la URL. */
  readonly secret: string;
  /** Sustituye entero o en parte el copy por defecto. Preparado para QC-72. */
  readonly labels?: Partial<SetCredentialLabels>;
};

export function SetCredentialForm({ secret, labels }: SetCredentialFormProps) {
  const [state, formAction] = useActionState(setCredentialWithLinkAction, INITIAL_STATE);
  const texto: SetCredentialLabels = { ...SET_CREDENTIAL_LABELS, ...labels };

  if (state.status === 'success') {
    return (
      <div className="flex flex-col gap-4" data-testid="set-credential-success">
        <p className="font-medium">{texto.successTitle}</p>
        <p className="text-sm text-muted-foreground">{texto.successBody}</p>
        {/*
          El enlace al login, y NO una sesion abierta sola (`design.md > 11.5`): fabricar una
          sesion desde una superficie publica, a partir de un secreto que pudo llegar por un
          correo reenviado, no lo pide ningun requisito. `render` para que el objetivo tactil de
          44 px del boton lo lleve el propio `<a>`, que es lo que se toca.
        */}
        <Button className="min-h-11 w-full" render={<Link href={LOGIN_ROUTE} data-testid="set-credential-login-link" />}>
          {texto.goToLogin}
        </Button>
      </div>
    );
  }

  const conFallo = state.status === 'invalid_credential' || state.status === 'mismatch';

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="set-credential-form">
      {/*
        El secreto viaja OCULTO en el `FormData` y no reescribiendo la URL (`design.md > 4.4`).
        Que sea oculto no lo hace de fiar: quien lo juzga es el `UPDATE` condicional del
        adaptador, que es el unico sitio donde un enlace se comprueba.
      */}
      <input type="hidden" name="secret" defaultValue={secret} data-testid="set-credential-secret" />

      <CredentialInput
        name="credential"
        id={CREDENTIAL_ID}
        label={texto.credentialLabel}
        showLabel={texto.showCredential}
        hideLabel={texto.hideCredential}
        describedBy={conFallo ? FEEDBACK_ID : undefined}
        testId="set-credential-credential"
      />

      <CredentialInput
        name="credentialConfirmation"
        id={CONFIRMATION_ID}
        label={texto.confirmationLabel}
        showLabel={texto.showCredential}
        hideLabel={texto.hideCredential}
        describedBy={state.status === 'mismatch' ? FEEDBACK_ID : undefined}
        testId="set-credential-confirmation"
      />

      {state.status === 'invalid_credential' ? (
        <div id={FEEDBACK_ID} role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          <p>{texto.unmetIntro}</p>
          <ul className="flex flex-col gap-1" data-testid="set-credential-unmet">
            {state.unmet.map((rule) => (
              <li key={rule} data-rule={rule}>
                {CREDENTIAL_RULE_LABELS[rule]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.status === 'mismatch' ? (
        <p
          id={FEEDBACK_ID}
          role="alert"
          className="text-sm text-destructive"
          data-testid="set-credential-mismatch"
        >
          {texto.mismatch}
        </p>
      ) : null}

      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          <p data-testid="set-credential-error">{state.message}</p>
          {/*
            El identificador de QC-71 solo existe en la rama del error inesperado —el tipo lo hace
            inexpresable en las demas—, y se pinta para que la persona pueda citarlo al reportar.
          */}
          {'reference' in state ? (
            <p className="text-muted-foreground" data-testid="set-credential-error-reference">
              {`${texto.errorReference} ${state.reference}`}
            </p>
          ) : null}
        </div>
      ) : null}

      <SubmitButton label={texto.submit} pendingLabel={texto.submitPending} />
    </form>
  );
}
