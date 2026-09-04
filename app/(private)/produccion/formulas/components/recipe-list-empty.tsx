import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { NEW_RECIPE_ROUTE } from '@/lib/shared/routes';

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
        <Button
          variant="outline"
          className={TOUCH_TARGET}
          data-testid="recipe-list-first-page"
          render={<Link href={firstPageHref} />}
        >
          Volver a la primera página
        </Button>
      )}
      <Button
        variant="default"
        className={TOUCH_TARGET}
        data-testid="recipe-create-open"
        render={<Link href={NEW_RECIPE_ROUTE} />}
      >
        Nueva receta
      </Button>
    </div>
  );
}
