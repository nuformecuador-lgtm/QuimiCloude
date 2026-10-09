'use client';

import { ErrorState } from '@/components/shared/error-state';
import type { ErrorState as OperationError } from '@/lib/modules/errores';

type OrderListErrorProps = {
  /**
   * El error de la consulta, ENTERO: la pareja `message`/`code` suelta no puede llevar el
   * `reference` del error inesperado.
   */
  readonly error: OperationError;
};

export function OrderListError({ error }: OrderListErrorProps) {
  return (
    <ErrorState
      error={error}
      title="No se pudo cargar la lista de pedidos."
      testId="order-list-error"
      messageTestId="order-list-error-message"
      codeTestId="order-list-error-code"
      retry={{ kind: 'refresh' }}
      retryTestId="order-list-retry"
    />
  );
}
