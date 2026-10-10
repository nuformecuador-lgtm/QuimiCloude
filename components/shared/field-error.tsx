import type { ReactNode } from 'react';

type FieldErrorProps = {
  /** Lo referencia el `aria-describedby` del control. */
  readonly id: string;
  /** Sin mensaje no se pinta nada: el hueco no se reserva. */
  readonly message?: ReactNode;
  readonly testId?: string;
  /**
   * `role="alert"` por defecto. Algunos formularios lo pintan sin rol y quitarlo por prop evita
   * cambiarles lo que anuncia el lector de pantalla.
   */
  readonly alert?: boolean;
};

export function FieldError({ id, message, testId, alert = true }: FieldErrorProps) {
  if (message === undefined || message === null) return null;

  return (
    <p
      id={id}
      role={alert ? 'alert' : undefined}
      className="text-sm text-destructive"
      data-testid={testId}
    >
      {message}
    </p>
  );
}
