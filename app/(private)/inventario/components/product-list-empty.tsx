import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ProductListEmptyProps = {
  /**
   * Accion de crear el primer producto (R14). Llega como slot desde `ProductListSection` -un
   * Server Component- en vez de importarse aqui: asi el estado vacio no conoce el panel lateral
   * y sigue sin frontera de cliente.
   */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin
   * elementos por ser mayor que el total (caso "la pagina se quedo atras tras un borrado").
   * Ausente cuando el catalogo esta realmente vacio.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio de la lista (R14, `design.md > 4.3`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso
 * el vacio es un estado propio, identificable, y **con la accion de crear a mano**, que es lo
 * unico util que se puede hacer en un catalogo vacio.
 *
 * **La vuelta a la primera pagina es un `<Link>` real pintado con `buttonVariants`**, no el
 * primitivo `Button` con `render`: lo que hace es navegar. Pasar un enlace por el boton de Base UI
 * dispara su aviso de `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir
 * sobre lo que el control hace. `data-slot="button"` se conserva porque de el cuelgan los
 * selectores de estilo.
 */
export function ProductListEmpty({ children, firstPageHref }: ProductListEmptyProps) {
  return (
    <div
      data-testid="product-list-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">
        {firstPageHref === undefined
          ? 'Todavía no hay productos en el catálogo.'
          : 'Esta página ya no tiene productos.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="product-list-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
      {children}
    </div>
  );
}
