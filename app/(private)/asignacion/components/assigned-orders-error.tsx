'use client';

import { useRouter } from 'next/navigation';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { Button } from '@/components/ui/button';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';

type AssignedOrdersErrorProps = {
  /** El error de la consulta, ENTERO (QC-71 R17: no `message` y `code` sueltos). */
  readonly error: ErrorState;
};

/**
 * Estado de error de la lista de pedidos asignados (R28, `design.md > 8.1`).
 *
 * No se pinta una tabla vacia cuando la consulta falla: confundir «fallo» con «no hay nada» es
 * justo lo que R28 existe para impedir. Se pinta FUERA de `<DataTable>`, mismo patron que
 * `order-list-error.tsx`. Si la operacion responde `unauthorized` la pantalla no muestra ni un
 * dato: no decide nada por su cuenta, solo presenta el error.
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
