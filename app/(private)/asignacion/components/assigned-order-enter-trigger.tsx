import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';
import { assignedOrderRoute } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

/**
 * El disparador de «entrar» de una fila (R21, R22, R23, `design.md > 7.3`, `> 8.4`, H5).
 *
 * **Server Component**: un `<Link>` sin mas interactividad no exige `'use client'` en este repo
 * (mismo precedente que `order-list-empty.tsx`).
 *
 * **`PENDIENTE`**: habilitado, navega a `assignedOrderRoute(id)` -derivada de `ASSIGNED_ORDERS_ROUTE`,
 * nunca un literal (R1)-. Hoy esa ruta responde 404 porque QC-63 todavia no existe (H5); eso no es
 * un error de esta pantalla, que **no** aplica ni replica la regla de «pedido ya tomado» (R23).
 *
 * **`EN_CURSO`**: deshabilitado, con su motivo **visible** (no solo `title`) y referenciado por
 * `aria-describedby` (R21, R32, precedente H5 de QC-102: un tooltip por `:hover` no llega en
 * tactil). El mismo `data-testid` en los dos casos, para que un test localice el disparador y
 * compruebe su estado sin dos selectores distintos.
 */

export const ASSIGNED_ORDER_ENTER_TESTID = 'assigned-order-enter';
export const ASSIGNED_ORDER_ENTER_REASON_TESTID = 'assigned-order-enter-reason';

/** El motivo del deshabilitado, como funcion y no literal repetido (para que el test no compare
 *  un literal copiado). */
export function assignedOrderEnterDisabledReason(): string {
  return 'Este pedido ya está en curso.';
}

const TOUCH_TARGET = 'min-h-11 min-w-11';

export function AssignedOrderEnterTrigger({
  order,
}: {
  readonly order: Pick<AssignedOrderView, 'id' | 'status'>;
}) {
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
