import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AssignedOrdersEmptyProps = {
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin elementos
   * por ser mayor que el total (caso «la pagina se quedo atras»). Ausente cuando la persona no
   * tiene ningun pedido asignado en absoluto.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio de la lista de pedidos asignados (R29, `design.md > 8.1`).
 *
 * Distinguible de un fallo de carga: una tabla con cero filas no comunica nada, y esta pantalla
 * es la lista de trabajo del Operador, sin accion de alta (asignar es QC-87, fuera de alcance).
 *
 * **Se pinta FUERA de `<DataTable>`**, mismo patron que `order-list-empty.tsx`.
 */
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
