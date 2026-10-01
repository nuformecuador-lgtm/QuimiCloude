import Link from 'next/link';

import { Button, buttonVariants } from '@/components/ui/button';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import { assignedOrderRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

export const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
export const ASSIGNED_ORDER_ENTER_REASON_TESTID = 'assigned-order-enter-reason';

/** Funcion y no literal, para que un test no pueda comparar contra una copia del texto. */
export function assignedOrderEnterNoticeText(): string {
  return 'Este pedido ya está en curso.';
}

export function assignedOrderBlockedNoticeText(): string {
  return 'Falta material: no se puede iniciar';
}

const TOUCH_TARGET = 'min-h-11 min-w-11';

export function AssignedOrderEnterTrigger({
  order,
}: {
  readonly order: Pick<AssignedOrderView, 'id' | 'status'>;
}) {
  // El aviso va visible y no en `title`: un tooltip por `:hover` no llega en tactil.
  if (order.status === 'BLOQUEADO') {
    const noticeId = `${ASSIGNED_ORDER_ENTER_REASON_TESTID}-${order.id}`;

    // Sin enlace: la ruta de ejecucion rechaza un bloqueado, no tiene sentido ofrecerla.
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby={noticeId}
          data-testid={ASSIGNED_ORDER_ENTER_TESTID}
          className={TOUCH_TARGET}
        >
          Entrar
        </Button>
        <p
          id={noticeId}
          className="text-xs text-muted-foreground"
          data-testid={ASSIGNED_ORDER_ENTER_REASON_TESTID}
        >
          {assignedOrderBlockedNoticeText()}
        </p>
      </div>
    );
  }

  if (order.status === 'EN_CURSO') {
    const noticeId = `${ASSIGNED_ORDER_ENTER_REASON_TESTID}-${order.id}`;

    return (
      <div className="flex flex-col items-start gap-1">
        <Link
          href={assignedOrderRoute(order.id)}
          data-slot="button"
          aria-describedby={noticeId}
          data-testid={ASSIGNED_ORDER_ENTER_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Entrar
        </Link>
        <p
          id={noticeId}
          className="text-xs text-muted-foreground"
          data-testid={ASSIGNED_ORDER_ENTER_REASON_TESTID}
        >
          {assignedOrderEnterNoticeText()}
        </p>
      </div>
    );
  }

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
