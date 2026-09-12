'use client';

// QC-79 T19 — Boton de envio de la pagina publica.
//
// Archivo aparte por la misma necesidad tecnica que el del login: `useFormStatus()` lee el estado
// del `<form>` ANCESTRO, asi que dentro del componente que renderiza el `<form>` devolveria
// siempre `pending: false`.
//
// `min-h-11` (44 px) y ancho completo: objetivo tactil de R25. El primitivo `Button` mide 32 px de
// alto por defecto, que en un movil es la mitad de lo que hace falta.

import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

type SubmitButtonProps = {
  readonly label: string;
  readonly pendingLabel: string;
};

export function SubmitButton({ label, pendingLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="min-h-11 w-full"
      disabled={pending}
      aria-busy={pending}
      data-testid="set-credential-submit"
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
