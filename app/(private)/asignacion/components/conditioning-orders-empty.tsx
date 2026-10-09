import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** El estado vacío de las dos listas del acondicionador, calcado de `FinishedOrdersEmpty`. */

export const CONDITIONING_ORDERS_EMPTY_TEXTS = {
  por_acondicionar: 'No hay pedidos por acondicionar en tu empresa.',
  acondicionados: 'Todavía no has terminado ningún acondicionamiento.',
} as const;

export const CONDITIONING_ORDERS_PAGE_PAST_END_TEXT = 'Esta página ya no tiene pedidos.';
export const CONDITIONING_ORDERS_FIRST_PAGE_TEXT = 'Volver a la primera página';

export type ConditioningOrdersEmptyProps = {
  /** Qué lista está vacía: decide el texto cuando no hay ningún pedido. */
  readonly list: keyof typeof CONDITIONING_ORDERS_EMPTY_TEXTS;
  /** Presente solo si la pagina pedida se paso del total; ausente si no hay ningun pedido. */
  readonly firstPageHref?: string;
};

export function ConditioningOrdersEmpty({ list, firstPageHref }: ConditioningOrdersEmptyProps) {
  return (
    <div
      data-testid="conditioning-orders-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid="conditioning-orders-empty-message">
        {firstPageHref === undefined
          ? CONDITIONING_ORDERS_EMPTY_TEXTS[list]
          : CONDITIONING_ORDERS_PAGE_PAST_END_TEXT}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="conditioning-orders-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          {CONDITIONING_ORDERS_FIRST_PAGE_TEXT}
        </Link>
      )}
    </div>
  );
}
