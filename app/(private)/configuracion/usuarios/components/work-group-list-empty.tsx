import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado vacio de la lista de grupos (R18; `design.md > 4.3`).
 *
 * **NO ofrece «crea el primero»**, mismo criterio que el vacio de personas (QC-67 R18): el
 * disparador del alta ya esta arriba, visible, cuando la sesion trae `usuarios.modificar`. Un
 * segundo camino al alta dentro del vacio duplicaria el disparador y encima aparecceria —o no—
 * segun el estado de la lista, que es la peor forma de ofrecer una accion.
 *
 * Las dos salidas que si son utiles, y **solo cuando aplican**:
 *
 * - **limpiar** el termino de busqueda, si lo habia;
 * - **volver a la primera pagina**, si la pedida era mayor que el total.
 *
 * Aqui no hay «limpiar filtros» y no es un olvido: la lista blanca de grupos no declara ninguno
 * (R16), asi que no hay nada que limpiar.
 *
 * **Las dos son `<Link>` reales pintados con `buttonVariants`**, no el primitivo `Button` con
 * `render`: lo que hacen es navegar. Pasar un enlace por el boton de Base UI dispara su aviso de
 * `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir sobre lo que el control
 * hace. `data-slot="button"` se conserva porque de el cuelgan los selectores de estilo. El area
 * tactil se fuerza a >= 44x44 px (R40).
 *
 * **Los dos destinos los calcula la seccion con `workGroupListHref`** (R3): aqui no se escribe
 * ninguna URL y no se compone ninguna cadena de consulta.
 */

export const WORK_GROUP_LIST_EMPTY_TESTID = 'work-group-list-empty';
export const WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID = 'work-group-list-empty-message';
export const WORK_GROUP_LIST_CLEAR_SEARCH_TESTID = 'work-group-list-clear-search';
export const WORK_GROUP_LIST_FIRST_PAGE_TESTID = 'work-group-list-first-page';

export type WorkGroupListEmptyProps = {
  /** Destino sin termino de busqueda, presente **solo** si lo habia (R18). */
  readonly clearSearchHref?: string;
  /** Destino a la primera pagina, presente **solo** si la pedida era mayor que el total (R18). */
  readonly firstPageHref?: string;
};

export function WorkGroupListEmpty({ clearSearchHref, firstPageHref }: WorkGroupListEmptyProps) {
  return (
    <div
      data-testid={WORK_GROUP_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p
        className="text-sm text-muted-foreground"
        data-testid={WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID}
      >
        {clearSearchHref === undefined
          ? 'No hay grupos de trabajo que mostrar.'
          : 'La búsqueda no encontró ningún grupo de trabajo.'}
      </p>

      {clearSearchHref === undefined ? null : (
        <Link
          href={clearSearchHref}
          data-slot="button"
          data-testid={WORK_GROUP_LIST_CLEAR_SEARCH_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Limpiar la búsqueda
        </Link>
      )}

      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid={WORK_GROUP_LIST_FIRST_PAGE_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
    </div>
  );
}
