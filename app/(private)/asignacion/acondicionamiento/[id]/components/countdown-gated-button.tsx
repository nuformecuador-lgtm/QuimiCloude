'use client';

import { useState } from 'react';

import { CountdownTimer } from '@/components/shared/countdown-timer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Botón que no se puede pulsar hasta que pasa la espera. La cuenta arranca al montar: quien lo usa
 * lo monta con una `key` nueva en cada apertura del modal para que la espera empiece de nuevo.
 * Es `submit` porque los dos modales que lo usan lo ponen dentro de su `<form>`.
 * La espera es solo de cliente; el servidor no la comprueba.
 */

export const CONDITIONING_WAIT_SECONDS = 5;

export const COUNTDOWN_GATED_BUTTON_TESTID = 'countdown-gated-button';

const TOUCH_TARGET = 'min-h-11 min-w-11';

export type CountdownGatedButtonProps = {
  readonly label: string;
  /** Deshabilita el botón por motivos ajenos a la espera (sin selección, envío en curso...). */
  readonly disabled?: boolean;
  readonly className?: string;
};

export function CountdownGatedButton({
  label,
  disabled = false,
  className,
}: CountdownGatedButtonProps) {
  const [waiting, setWaiting] = useState(true);

  return (
    <Button
      type="submit"
      disabled={waiting || disabled}
      className={cn(TOUCH_TARGET, 'gap-2', className)}
      data-testid={COUNTDOWN_GATED_BUTTON_TESTID}
    >
      {label}
      {waiting ? (
        <CountdownTimer
          seconds={CONDITIONING_WAIT_SECONDS}
          onEnd={() => setWaiting(false)}
          className="text-current"
        />
      ) : null}
    </Button>
  );
}
