import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import { assignedOrderRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

export const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
export const ASSIGNED_ORDER_ENTER_REASON_TESTID = 'assigned-order-enter-reason';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function assignedOrderEnterDisabledReason(): string {
  return 'Este pedido ya está en curso.';
}

const TOUCH_TARGET = 'min-h-11 min-w-11';

export function AssignedOrderEnterTrigger({
  order,
}: {
  readonly order: Pick<AssignedOrderView, 'id' | 'status'>;
}) {
  // El motivo del deshabilitado va visible y no en `title`: un tooltip por `:hover` no llega en
  // tactil.
  if (order.status === 'EN_CURSO') {
    const reasonId = `${ASSIGNED_ORDER_ENTER_REASON_TESTID}-${order.id}`;

    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled
          aria-describedby={reasonId}
          data-testid={ASSIGNED_ORDER_ENTER_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Entrar
        </button>
        <p
          id={reasonId}
          className="text-xs text-muted-foreground"
          data-testid={ASSIGNED_ORDER_ENTER_REASON_TESTID}
        >
          {assignedOrderEnterDisabledReason()}
        </p>
      </div>
    );
  }

  // La pantalla de destino todavia no existe, asi que este enlace responde 404: no es un fallo de
  // esta lista.
  return (
    <Link
      href={assignedOrderRoute(order.id)}
      data-slot="button"
      data-testid={ASSIGNED_ORDER_ENTER_TESTID}
      className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
    >
      Entrar
    </Link>
  );
}
