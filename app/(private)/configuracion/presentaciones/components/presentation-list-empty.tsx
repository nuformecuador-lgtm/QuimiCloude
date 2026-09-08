import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado vacio de la lista de presentaciones (R15, `design.md > 5.3`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso el
 * vacio es un estado propio, identificable por su `data-testid` (R35), con la accion de **crear la
 * primera**, que es lo unico util que se puede hacer sin ninguna presentacion.
 *
 * **Se pinta FUERA de `<DataTable>`, no con su prop `emptyAction`** (`design.md > 5.3`): el vacio
 * de esta pantalla lleva copy y accion propios, igual que en pedidos.
 *
 * **La accion llega como slot (`children`)** desde `PresentationListSection` —un Server
 * Component— en vez de importarse aqui: asi el estado vacio no conoce el panel lateral ni la
 * operacion de alta, y sigue sin frontera de cliente.
 *
 * **La vuelta a la primera pagina es un `<Link>` real pintado con `buttonVariants`**, no el
 * primitivo `Button` con `render`: lo que hace es navegar. Pasar un enlace por el boton de Base UI
 * dispara su aviso de `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir
 * sobre lo que el control hace. `data-slot="button"` se conserva porque de el cuelgan los
 * selectores de estilo. El area tactil se fuerza a >= 44x44 px (R34).
 */

export const PRESENTATION_LIST_EMPTY_TESTID = 'presentation-list-empty';
export const PRESENTATION_LIST_EMPTY_MESSAGE_TESTID = 'presentation-list-empty-message';
export const PRESENTATION_LIST_FIRST_PAGE_TESTID = 'presentation-list-first-page';

export type PresentationListEmptyProps = {
  /** Disparador de «crear la primera» (R15). Lo baja la seccion; aqui no se conoce el panel. */
  readonly children?: ReactNode;
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin elementos
   * por ser mayor que el total (R15). Ausente cuando no hay ni una presentacion.
   */
  readonly firstPageHref?: string;
};

export function PresentationListEmpty({ children, firstPageHref }: PresentationListEmptyProps) {
  return (
    <div
      data-testid={PRESENTATION_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p
        className="text-sm text-muted-foreground"
        data-testid={PRESENTATION_LIST_EMPTY_MESSAGE_TESTID}
      >
        {firstPageHref === undefined
          ? 'Todavía no hay presentaciones registradas.'
          : 'Esta página ya no tiene presentaciones.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid={PRESENTATION_LIST_FIRST_PAGE_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
      {children}
    </div>
  );
}
