'use client';

import type * as React from 'react';
import { useFormStatus } from 'react-dom';

import { cn } from '@/lib/utils';

/** Texto del control de cierre de sesion. Constante, no literal suelto en el JSX. */
export const LOGOUT_LABEL = 'Cerrar sesión';

/**
 * Control de cierre de sesion del menu de usuario (`design.md > 5.4`, R21).
 *
 * Vive en un archivo aparte por **necesidad tecnica**, no por gusto: `useFormStatus()` solo
 * lee el estado del `<form>` ANCESTRO, asi que si el hook viviera en `nav-user.tsx` —el
 * componente que renderiza el `<form>`— devolveria siempre `pending: false`. Es la misma
 * leccion que dejo escrita `specs/7-pantalla-de-login/design.md > 5.2`.
 *
 * El hook es la unica fuente del pending: sin `useState` y sin props de estado. Cuando la
 * Server Action termina, React vuelve a poner `pending` en `false` por su cuenta.
 *
 * Acepta y reenvia props de `<button>` porque `nav-user.tsx` lo compone como elemento
 * `render` de `DropdownMenuItem` (Base UI): el item necesita poner sus propios atributos
 * (`role`, manejadores de teclado, `ref`) sobre este mismo boton.
 */
export function LogoutMenuItem({ className, ...props }: React.ComponentProps<'button'>) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="private-logout"
      className={cn('w-full cursor-default text-left', className)}
    >
      {LOGOUT_LABEL}
    </button>
  );
}
