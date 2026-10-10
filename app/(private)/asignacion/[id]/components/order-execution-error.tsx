import Link from 'next/link';

import { ErrorAlert } from '@/components/shared/error-alert';
import type { ErrorState } from '@/lib/modules/errores';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * Los estados de error de la pantalla de ejecucion. El texto sale SIEMPRE del catalogo de
 * `lib/modules/errores`: «no existe» y «no es tuyo» comparten el mismo `code`
 * (`order_not_found`), asi que aqui pintan exactamente lo mismo.
 */

export const ORDER_EXECUTION_ERROR_TESTID = 'order-execution-error';
export const ORDER_EXECUTION_ERROR_MESSAGE_TESTID = 'order-execution-error-message';
export const ORDER_EXECUTION_ERROR_BACK_LINK_TESTID = 'order-execution-error-back-link';

const TITLE = 'No se pudo abrir el pedido.';
const BACK_LABEL = 'Volver a mis pedidos asignados';

type OrderExecutionErrorProps = {
  readonly error: ErrorState;
};

export function OrderExecutionError({ error }: OrderExecutionErrorProps) {
  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 md:p-6">
      <ErrorAlert
        error={error}
        testId={ORDER_EXECUTION_ERROR_TESTID}
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
        before={<p className="text-sm font-medium">{TITLE}</p>}
        renderCatalogued={(catalogued) => (
          <p
            className="text-sm text-muted-foreground"
            data-testid={ORDER_EXECUTION_ERROR_MESSAGE_TESTID}
          >
            {catalogued.message}
          </p>
        )}
      />
      <Link
        href={ASSIGNED_ORDERS_ROUTE}
        className={`inline-flex w-fit items-center ${touchTarget} text-sm font-medium underline`}
        data-testid={ORDER_EXECUTION_ERROR_BACK_LINK_TESTID}
      >
        {BACK_LABEL}
      </Link>
    </div>
  );
}
