'use client';

import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';

type SubmitButtonProps = {
  readonly label: string;
  readonly pendingLabel: string;
  readonly testId: string;
  readonly className?: string;
};

// `useFormStatus()` solo ve el `<form>` ancestro: dentro del componente que pinta el `<form>`
// devolvería siempre `pending: false`, por eso el botón vive aparte.
export function SubmitButton({ label, pendingLabel, testId, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      touch
      className={className}
      disabled={pending}
      aria-busy={pending}
      data-testid={testId}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
