import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado vacio de la lista de usuarios (R18, `design.md > 6`).
 *
 * **Es el vacio de «no hay nada que mostrar aqui»**, y no ofrece «crea el primero» porque el
 * disparador del alta ya esta **arriba, fuera de los tres estados** (`user-create-action.tsx`):
 * ofrecerlo tambien aqui seria un segundo camino a la misma accion, que ademas apareceria o no
 * segun el estado de la lista.
 *
 * **Este archivo decia antes otra cosa, y era falsa.** Argumentaba que llegar aqui solo podia
 * significar «la busqueda no encontro nada», porque «siempre existe al menos un usuario, el actor».
 * Existir existe, pero **el actor no se ve en su propio listado** (R11), asi que una instalacion
 * recien sembrada —un unico usuario, el que esta mirando— aterriza en este vacio con el catalogo
 * lleno al 100%%. Como el boton del alta vivia dentro de la tabla, y la tabla solo se monta con
 * filas, ese vacio no tenia salida: no habia forma de crear al segundo usuario. Corregido el
 * 2026-09-17 subiendo el alta fuera de los estados; el vacio no gano ninguna accion.
 *
 * **No se anuncia que falte nadie** (R11): la ausencia del actor no se compensa, ni con una fila,
 * ni con un aviso.
 *
 * Las dos salidas que si son utiles, y solo cuando aplican:
 *
 * - **limpiar** el termino de busqueda y el filtro de estado, si habia alguno activo;
 * - **volver a la primera pagina**, si la pedida era mayor que el total.
 *
 * **Las dos son `<Link>` reales pintados con `buttonVariants`**, no el primitivo `Button` con
 * `render`: lo que hacen es navegar. Pasar un enlace por el boton de Base UI dispara su aviso de
 * `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir sobre lo que el
 * control hace. `data-slot="button"` se conserva porque de el cuelgan los selectores de estilo. El
 * area tactil se fuerza a >= 44x44 px (R40).
 *
 * **Los dos destinos se derivan de `USERS_ROUTE`** a traves de `userListHref` (R1): aqui no se
 * escribe ninguna URL.
 */

export const USER_LIST_EMPTY_TESTID = 'user-list-empty';
export const USER_LIST_EMPTY_MESSAGE_TESTID = 'user-list-empty-message';
export const USER_LIST_CLEAR_SEARCH_TESTID = 'user-list-clear-search';
export const USER_LIST_FIRST_PAGE_TESTID = 'user-list-first-page';

export type UserListEmptyProps = {
  /** Destino sin termino y sin filtro, presente **solo** si habia alguno activo (R18). */
  readonly clearSearchHref?: string;
  /** Destino a la primera pagina, presente **solo** si la pedida era mayor que el total (R18). */
  readonly firstPageHref?: string;
};

export function UserListEmpty({ clearSearchHref, firstPageHref }: UserListEmptyProps) {
  return (
    <div
      data-testid={USER_LIST_EMPTY_TESTID}
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground" data-testid={USER_LIST_EMPTY_MESSAGE_TESTID}>
        {clearSearchHref === undefined
          ? 'No hay usuarios que coincidan con lo que se está pidiendo.'
          : 'La búsqueda no encontró ningún usuario.'}
      </p>

      {clearSearchHref === undefined ? null : (
        <Link
          href={clearSearchHref}
          data-slot="button"
          data-testid={USER_LIST_CLEAR_SEARCH_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Limpiar la búsqueda
        </Link>
      )}

      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid={USER_LIST_FIRST_PAGE_TESTID}
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 min-w-11')}
        >
          Volver a la primera página
        </Link>
      )}
    </div>
  );
}
