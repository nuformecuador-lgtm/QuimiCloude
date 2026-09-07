import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type OrderListEmptyProps = {
  /**
   * Accion de crear el primer pedido (R21). Llega como slot desde `OrderListSection` —un Server
   * Component— en vez de importarse aqui: asi el estado vacio no conoce el panel lateral y sigue
   * sin frontera de cliente. **El panel lo monta `OrderSheet`** (T10), y la seccion es quien lo
   * pasa; este componente no conoce el panel ni la operacion de alta.
   */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin elementos
   * por ser mayor que el total (caso «la pagina se quedo atras» tras una baja o un filtro).
   * Ausente cuando no hay ni un pedido.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio de la lista de pedidos (R21, `design.md > 5`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso el
 * vacio es un estado propio, identificable por su `data-testid` (R44) y **propio de pedidos** —su
 * copy y su accion no son los de ninguna otra lista—, con la accion de crear a mano, que es lo
 * unico util que se puede hacer sin ningun pedido.
 *
 * **Se pinta FUERA de `<DataTable>`, no con su prop `status`** (alternativa Q, descartada): el
 * vacio de esta pantalla lleva accion propia y copy propio.
 *
 * **La vuelta a la primera pagina es un `<Link>` real pintado con `buttonVariants`**, no el
 * primitivo `Button` con `render`: lo que hace es navegar. Pasar un enlace por el boton de Base UI
 * dispara su aviso de `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir
 * sobre lo que el control hace. `data-slot="button"` se conserva porque de el cuelgan los
 * selectores de estilo. El area tactil se fuerza a >= 44x44 px (R45).
 */
export function OrderListEmpty({ children, firstPageHref }: OrderListEmptyProps) {
  return (
    <div
      data-testid="order-list-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid="order-list-empty-message">
        {firstPageHref === undefined
          ? 'Todavía no hay pedidos registrados.'
          : 'Esta página ya no tiene pedidos.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="order-list-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
      {children}
    </div>
  );
}
