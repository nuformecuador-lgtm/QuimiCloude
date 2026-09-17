'use client';

import { useRouter } from 'next/navigation';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

type AssignedOrdersErrorProps = {
  readonly error: ErrorState;
};

/**
 * Se pinta en lugar de la tabla, nunca una tabla vacia: confundir «fallo» con «no hay nada» deja
 * al Operador creyendo que no tiene trabajo.
 */
export function AssignedOrdersError({ error }: AssignedOrdersErrorProps) {
  const router = useRouter();

  return (
    <div
      role="alert"
      data-testid="assigned-orders-error"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
    >
      <p className="text-sm font-medium">No se pudo cargar la lista de pedidos asignados.</p>
      {error.code === UNEXPECTED_ERROR_CODE ? (
        <UnexpectedErrorNotice state={error} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="assigned-orders-error-message">
            {error.message}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="assigned-orders-error-code">
            {error.code}
          </p>
        </>
      )}
      <Button
        variant="outline"
        className="min-h-11 min-w-11"
        data-testid="assigned-orders-retry"
        onClick={() => router.refresh()}
      >
        Reintentar
      </Button>
    </div>
  );
}
