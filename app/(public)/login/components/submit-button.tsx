'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

/**
 * Boton de envio del login (`design.md > 5.2`).
 *
 * Vive en un archivo aparte por necesidad tecnica, no por gusto: `useFormStatus()` solo lee
 * el estado del `<form>` ANCESTRO, asi que si el hook viviera en `login-form.tsx` -el mismo
 * componente que renderiza el `<form>`- devolveria siempre `pending: false`.
 *
 * El hook es la unica fuente del pending: sin props y sin estado local. Cuando la action
 * termina, React vuelve a poner `pending` en `false` por su cuenta, y con eso R8 sale gratis.
 */
export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="w-full"
      disabled={pending}
      aria-busy={pending}
      data-testid="login-submit"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </Button>
  );
}
