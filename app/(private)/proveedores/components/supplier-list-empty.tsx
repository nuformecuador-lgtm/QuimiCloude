import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SupplierListEmptyProps = {
  /**
   * Accion de crear el primer proveedor (R16). Llega como slot desde `SupplierListSection` —un
   * Server Component— en vez de importarse aqui: asi el estado vacio no conoce el panel lateral
   * y sigue sin frontera de cliente. **El panel lo monta T8**; hasta entonces el slot llega
   * vacio y este componente no inventa un boton que no lleve a ninguna parte.
   */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin
   * elementos por ser mayor que el total (caso "la pagina se quedo atras tras una baja").
   * Ausente cuando la lista de proveedores esta realmente vacia.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio de la lista de proveedores (R16, `design.md > 5.2`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso
 * el vacio es un estado propio, identificable **y propio de esta lista** —su `data-testid` no es
 * el del catalogo de un proveedor (R23), que declara T12—, con la accion de crear a mano, que es
 * lo unico util que se puede hacer sin ningun proveedor.
 *
 * **La vuelta a la primera pagina es un `<Link>` real pintado con `buttonVariants`**, no el
 * primitivo `Button` con `render`: lo que hace es navegar. Pasar un enlace por el boton de Base UI
 * dispara su aviso de `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir
 * sobre lo que el control hace. `data-slot="button"` se conserva porque de el cuelgan los
 * selectores de estilo.
 */
export function SupplierListEmpty({ children, firstPageHref }: SupplierListEmptyProps) {
  return (
    <div
      data-testid="supplier-list-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">
        {firstPageHref === undefined
          ? 'Todavía no hay proveedores dados de alta.'
          : 'Esta página ya no tiene proveedores.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="supplier-list-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
      {children}
    </div>
  );
}
