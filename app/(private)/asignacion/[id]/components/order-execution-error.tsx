import Link from 'next/link';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { ASSIGNED_ORDERS_ROUTE } from '@/lib/shared/routes';

/**
 * Los estados de error de la pantalla de ejecucion. El texto sale SIEMPRE del catalogo de
 * `lib/modules/errores`: «no existe» y «no es tuyo» comparten el mismo `code`
 * (`order_not_found`), asi que aqui pintan exactamente lo mismo.
 */

export const ORDER_EXECUTION_ERROR_TESTID = 'order-execution-error';
export const ORDER_EXECUTION_ERROR_MESSAGE_TESTID = 'order-execution-error-message';
export const ORDER_EXECUTION_ERROR_BACK_LINK_TESTID = 'order-execution-error-back-link';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const TITLE = 'No se pudo abrir el pedido.';
const BACK_LABEL = 'Volver a mis pedidos asignados';

type OrderExecutionErrorProps = {
  readonly error: ErrorState;
};

export function OrderExecutionError({ error }: OrderExecutionErrorProps) {
  return (
    <div className="flex min-h-dvh flex-col gap-4 p-4 md:p-6">
      <div
        role="alert"
        data-testid={ORDER_EXECUTION_ERROR_TESTID}
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4"
      >
        <p className="text-sm font-medium">{TITLE}</p>
        {error.code === UNEXPECTED_ERROR_CODE ? (
          <UnexpectedErrorNotice state={error} />
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid={ORDER_EXECUTION_ERROR_MESSAGE_TESTID}
          >
            {error.message}
          </p>
        )}
      </div>
      <Link
        href={ASSIGNED_ORDERS_ROUTE}
        className={`inline-flex w-fit items-center ${TOUCH_TARGET} text-sm font-medium underline`}
        data-testid={ORDER_EXECUTION_ERROR_BACK_LINK_TESTID}
      >
        {BACK_LABEL}
      </Link>
    </div>
  );
}
