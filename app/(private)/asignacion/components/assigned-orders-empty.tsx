import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AssignedOrdersEmptyProps = {
  /** Presente solo si la pagina pedida se paso del total; ausente si no hay ningun pedido. */
  readonly firstPageHref?: string;
};

export function AssignedOrdersEmpty({ firstPageHref }: AssignedOrdersEmptyProps) {
  return (
    <div
      data-testid="assigned-orders-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid="assigned-orders-empty-message">
        {firstPageHref === undefined
          ? 'No tienes pedidos asignados en curso o pendientes.'
          : 'Esta página ya no tiene pedidos.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="assigned-orders-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
    </div>
  );
}
