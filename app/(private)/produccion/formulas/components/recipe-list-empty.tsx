import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { NEW_RECIPE_ROUTE } from '@/lib/shared/routes';
import { cn } from '@/lib/utils';

const TOUCH_TARGET = 'min-h-11 min-w-11';

type RecipeListEmptyProps = {
  /**
   * Destino a la primera pagina, presente **solo** cuando la pagina pedida se quedo sin
   * elementos por ser mayor que el total (caso "la pagina se quedo atras tras un borrado").
   * Ausente cuando el catalogo esta realmente vacio.
   */
  readonly firstPageHref?: string;
};

/**
 * Estado vacio de la lista (R15, `design.md > 4.3`).
 *
 * Una tabla con cero filas no comunica nada: dice lo mismo que una consulta que fallo. Por eso
 * el vacio es un estado propio, identificable, y **con la accion de crear a mano**, que es lo
 * unico util que se puede hacer en un catalogo vacio. La accion NAVEGA a la pagina de alta
 * propia (R20): no abre ni panel ni dialogo.
 *
 * **Las dos acciones son `<Link>` reales pintados con `buttonVariants`**, no el primitivo `Button`
 * con `render`: lo que hacen es navegar. Pasar un enlace por el boton de Base UI dispara su aviso
 * de `nativeButton` y acaba poniendole `role="button"` al `<a>`, que es mentir sobre lo que el
 * control hace. `data-slot="button"` se conserva porque de el cuelgan los selectores de estilo.
 */
export function RecipeListEmpty({ firstPageHref }: RecipeListEmptyProps) {
  return (
    <div
      data-testid="recipe-list-empty"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
    >
      <p className="text-sm text-muted-foreground">
        {firstPageHref === undefined
          ? 'Todavía no hay recetas en el catálogo.'
          : 'Esta página ya no tiene recetas.'}
      </p>
      {firstPageHref === undefined ? null : (
        <Link
          href={firstPageHref}
          data-slot="button"
          data-testid="recipe-list-first-page"
          className={cn(buttonVariants({ variant: 'outline' }), TOUCH_TARGET)}
        >
          Volver a la primera página
        </Link>
      )}
      <Link
        href={NEW_RECIPE_ROUTE}
        data-slot="button"
        data-testid="recipe-create-open"
        className={cn(buttonVariants({ variant: 'default' }), TOUCH_TARGET)}
      >
        Nueva fórmula
      </Link>
    </div>
  );
}
