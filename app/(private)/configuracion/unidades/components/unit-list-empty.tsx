import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado vacio de la lista de unidades (R24, `design.md > 5.4`).
 *
 * **Es el vacio de «la busqueda no encontro nada», y NO ofrece «crear la primera»**, que es donde
 * esta pantalla se aparta a proposito de su hermana de presentaciones: con las unidades de sistema
 * siempre presentes en el ambito, la lista **nunca sale vacia de verdad**, asi que llegar aqui
 * significa que el termino o la pagina no encontraron nada. Ofrecer «crea la primera» seria decirle
 * al usuario algo falso sobre el estado del catalogo.
 *
 * Las dos salidas que si son utiles, y solo cuando aplican:
 *
 * - **limpiar el termino**, si lo habia;
 * - **volver a la primera pagina**, si la pedida era mayor que el total.
 *
 * **Las dos son `<Link>` reales pintados con `buttonVariants`**, no el primitivo `Button` con
 * `render`: lo que hacen es navegar. Pasar un enlace por el boton de Base UI dispara su aviso de
 * `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir sobre lo que el control
 * hace. `data-slot="button"` se conserva porque de el cuelgan los selectores de estilo. El area
 * tactil se fuerza a >= 44x44 px (R48).
 *
 * **Los dos destinos se derivan de `UNITS_ROUTE`** a traves de `unitListHref` (R8): aqui no se
 * escribe ninguna URL.
 */

export const UNIT_LIST_EMPTY_TESTID = 'unit-list-empty';
export const UNIT_LIST_EMPTY_MESSAGE_TESTID = 'unit-list-empty-message';
export const UNIT_LIST_CLEAR_SEARCH_TESTID = 'unit-list-clear-search';
export const UNIT_LIST_FIRST_PAGE_TESTID = 'unit-list-first-page';

export type UnitListEmptyProps = {
  /** Destino sin termino de busqueda, presente **solo** si lo habia (R24). */
  readonly clearSearchHref?: string;
  /** Destino a la primera pagina, presente **solo** si la pedida era mayor que el total (R24). */
  readonly firstPageHref?: string;
};

export function UnitListEmpty({ clearSearchHref, firstPageHref }: UnitListEmptyProps) {
  return (
    <div
      data-testid={UNIT_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid={UNIT_LIST_EMPTY_MESSAGE_TESTID}>
        {clearSearchHref === undefined
          ? 'No hay unidades que coincidan con lo que se está pidiendo.'
          : 'La búsqueda no encontró ninguna unidad.'}
      </p>

      {clearSearchHref === undefined ? null : (
        <Link
          href={clearSearchHref}
          data-slot="button"
          data-testid={UNIT_LIST_CLEAR_SEARCH_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Limpiar la búsqueda
        </Link>
      )}

      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid={UNIT_LIST_FIRST_PAGE_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
    </div>
  );
}
