'use client';

import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { SubmitButton } from '@/components/shared/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RETURN_PARAM } from '@/lib/modules/identity';
import { loginAction } from '@/lib/modules/identity/adapters/driving/login-action';
import { LOGIN_INITIAL_STATE } from '@/lib/modules/identity/adapters/driving/login-form-state';

const USERNAME_ERROR_ID = 'username-error';
const PASSWORD_ERROR_ID = 'password-error';

type LoginFormProps = {
  /**
   * Destino de vuelta ya validado por la pagina (R7, R8). Opcional, y **por defecto cadena
   * vacia** (QC-75 R11): el formulario no fabrica un destino que el usuario no pidio. Vacio es
   * seguro porque `loginAction` revalida el campo con `resolveReturnPath`, e
   * `isInternalPath('')` es `false` —la cadena vacia no tiene forma de ruta interna—, asi que
   * cae al `fallback` que la action calcula: el primer enlace del menu filtrado por permisos
   * (R11, R12). QC-9 R8/R9 no se debilita: un `?next=` interno sigue mandando y uno externo se
   * sigue descartando; lo unico que cambia es el respaldo cuando no hay destino de vuelta.
   */
  readonly next?: string;
};

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
 *
 * QC-9 (`design.md > 8`, paso 3): el destino de vuelta viaja en un campo OCULTO hasta la Server
 * Action. Es lo unico que esta feature anade al formulario: sin cambio visual, sin estado nuevo y
 * sin tocar los campos no controlados, las claves de montaje, los toasts ni `SubmitButton`.
 */
export function LoginForm({ next = '' }: LoginFormProps) {
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
      {/*
        Campo oculto: transporta el destino de vuelta del servidor al servidor. `defaultValue`
        y no `value`, como el resto de campos del formulario, que son NO controlados. Que sea
        oculto no lo hace de fiar: `loginAction` lo revalida con `resolveReturnPath`, porque un
        POST fabricado puede traer cualquier cosa. Sin `?next=` viaja VACIO a proposito
        (QC-75 R11): un valor fabricado aqui ganaria siempre y dejaria muerto el respaldo por
        permisos que calcula la action.
      */}
      <input
        type="hidden"
        name={RETURN_PARAM}
        defaultValue={next}
        data-testid="login-next"
      />

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

      <SubmitButton label="Entrar" pendingLabel="Entrando…" testId="login-submit" className="w-full" />
    </form>
  );
}
