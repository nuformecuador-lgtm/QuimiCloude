import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * `data-testid` del estado vacio del CATALOGO (R23).
 *
 * Se exporta como constante y **es distinto del de la lista de proveedores**: R23 lo exige
 * expresamente porque son dos vacios que significan cosas distintas -«no hay proveedores» y «este
 * proveedor no tiene lineas»- y ofrecen acciones distintas. El test afirma sobre esta constante,
 * no sobre un literal repetido.
 */
export const CATALOG_LIST_EMPTY_TESTID = 'catalog-list-empty';

type CatalogListEmptyProps = {
  /**
   * Accion de anadir la primera linea (R23). Llega como slot desde `CatalogListSection` -un
   * Server Component- en vez de importarse aqui: asi el estado vacio no conoce el panel lateral y
   * sigue sin frontera de cliente.
   */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin lineas por
   * ser mayor que el total (caso «la pagina se quedo atras tras una baja»). Ausente cuando el
   * catalogo esta realmente vacio.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio del catalogo del proveedor (R23, `design.md > 6.1`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso el
 * vacio es un estado propio, identificable, y **con la accion de anadir a mano**, que es lo unico
 * util que se puede hacer en un catalogo vacio.
 *
 * **La vuelta a la primera pagina es un `<Link>` real pintado con `buttonVariants`**, no el
 * primitivo `Button` con `render`: lo que hace es navegar, y pasar un enlace por el boton de Base
 * UI acaba poniendole `role="button"` al `<a>`, que es mentir sobre lo que el control hace.
 */
export function CatalogListEmpty({ children, firstPageHref }: CatalogListEmptyProps) {
  return (
    <div
      data-testid={CATALOG_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">
        {firstPageHref === undefined
          ? 'Este proveedor todavía no tiene líneas de catálogo.'
          : 'Esta página ya no tiene líneas de catálogo.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="catalog-list-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
      {children}
    </div>
  );
}
