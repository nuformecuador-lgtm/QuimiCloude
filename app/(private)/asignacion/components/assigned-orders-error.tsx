'use client';

import { ErrorState } from '@/components/shared/error-state';
import type { ErrorState as OperationError } from '@/lib/modules/errores';

type AssignedOrdersErrorProps = {
  readonly error: OperationError;
};

/**
 * Se pinta en lugar de la tabla, nunca una tabla vacia: confundir «fallo» con «no hay nada» deja
 * al Operador creyendo que no tiene trabajo.
 */
export function AssignedOrdersError({ error }: AssignedOrdersErrorProps) {
  return (
    <ErrorState
      error={error}
      title="No se pudo cargar la lista de pedidos asignados."
      testId="assigned-orders-error"
      messageTestId="assigned-orders-error-message"
      codeTestId="assigned-orders-error-code"
      retry={{ kind: 'refresh' }}
      retryTestId="assigned-orders-retry"
    />
  );
}
