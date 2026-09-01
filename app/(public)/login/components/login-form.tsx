'use client';

import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/lib/modules/identity/adapters/driving/login-action';
import { LOGIN_INITIAL_STATE } from '@/lib/modules/identity/adapters/driving/login-form-state';

import { SubmitButton } from './submit-button';

const USERNAME_ERROR_ID = 'username-error';
const PASSWORD_ERROR_ID = 'password-error';

/**
 * Formulario de login (`design.md > 5.2`).
 *
 * Formulario HTML real: `<form action={formAction}>` con campos NO controlados (R20).
 * Sin manejador de submit propio, sin peticiones manuales y sin estado local de React.
 *
 * Rehidratacion (R13, R14): React 19 resetea los campos no controlados de un `<form action>`
 * al completarse la Server Action; el `defaultValue` del campo de usuario vuelve a poner lo
 * escrito y la contrasena, sin `defaultValue`, queda vacia.
 *
 * `key={usernameFieldKey}` en el campo de usuario: su `defaultValue` pasa de `''` (idle) a lo
 * escrito (fallo), y Base UI avisa por consola cuando el `defaultValue` de un `FieldControl`
 * no controlado cambia despues de montarse. La clave fuerza un remontaje justo en ese salto,
 * asi que cada valor de `defaultValue` es el INICIAL de una instancia nueva y no una mutacion.
 * El campo sigue NO controlado (`design.md > 8.B` descarta `useState`) y R13/R14 no cambian.
 *
 * La clave es el propio `username` y no el `attemptId`: ambos arreglan el aviso, pero el
 * `attemptId` cambia en CADA intento fallido y remontaria tambien cuando el usuario reintenta
 * con el mismo nombre, que es el caso comun. Un remontaje tira el foco del input, asi que
 * conviene el minimo posible. La contrasena no lleva clave: sin `defaultValue` no dispara el
 * aviso, y remontarla robaria el foco al enviar con Enter desde ese campo.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, LOGIN_INITIAL_STATE);

  // Unico `useRef` del componente: memoriza que intento ya se notifico (R21).
  const lastToastedId = useRef<string | null>(null);

  useEffect(() => {
    if (state.status !== 'error') return;
    if (lastToastedId.current === state.attemptId) return;
    lastToastedId.current = state.attemptId;
    toast.error(state.message);
  }, [state]);

  // La union discriminada obliga a estrechar: `username`, `attemptId` y `fieldErrors` solo
  // existen en los estados de fallo.
  const username = state.status === 'idle' ? '' : state.username;
  // Clave de montaje del campo de usuario. Es el propio `username` a proposito: asi cambia
  // exactamente cuando cambia su `defaultValue` y ni una vez mas, de modo que cada instancia
  // del input ve un unico `defaultValue` durante toda su vida (ver comentario del componente).
  const usernameFieldKey = username;
  const fieldErrors = state.status === 'invalid' ? state.fieldErrors : undefined;
  const usernameError = fieldErrors?.username;
  const passwordError = fieldErrors?.password;

  return (
    <form action={formAction} className="flex flex-col gap-4" data-testid="login-form">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Usuario</Label>
        <Input
          key={usernameFieldKey}
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          defaultValue={username}
          aria-invalid={usernameError ? true : undefined}
          aria-describedby={usernameError ? USERNAME_ERROR_ID : undefined}
          data-testid="login-username"
        />
        {usernameError ? (
          <p
            id={USERNAME_ERROR_ID}
            className="text-sm text-destructive"
            data-testid="login-username-error"
          >
            {usernameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? PASSWORD_ERROR_ID : undefined}
          data-testid="login-password"
        />
        {passwordError ? (
          <p
            id={PASSWORD_ERROR_ID}
            className="text-sm text-destructive"
            data-testid="login-password-error"
          >
            {passwordError}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
