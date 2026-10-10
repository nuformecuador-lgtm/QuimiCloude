'use client';

// Fachada local sobre el boton de envio compartido: conserva la firma y el testid que usan el
// formulario y sus tests. La talla tactil (44 px) la pone el compartido.

import { SubmitButton as SharedSubmitButton } from '@/components/shared/submit-button';

type SubmitButtonProps = {
  readonly label: string;
  readonly pendingLabel: string;
};

export function SubmitButton({ label, pendingLabel }: SubmitButtonProps) {
  return (
    <SharedSubmitButton
      label={label}
      pendingLabel={pendingLabel}
      testId="set-credential-submit"
      className="w-full"
    />
  );
}
