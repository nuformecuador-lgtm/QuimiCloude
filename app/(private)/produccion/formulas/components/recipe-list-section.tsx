import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

import { buildRecipeListQuery, type RecipePageSize } from './recipe-list-params';
import { RecipeListEmpty } from './recipe-list-empty';
import { RecipeListError } from './recipe-list-error';
import { RecipeListToolbar } from './recipe-list-toolbar';
import { RecipeTable } from './recipe-table';

/** La primera pagina, a la que vuelve el estado vacio cuando la pedida se quedo atras. */
const FIRST_PAGE = 1;

type RecipeListSectionProps = {
  readonly page: number;
  readonly pageSize: RecipePageSize;
};

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R15, R16, R17,
 * `design.md > 4.3`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R16 aparece solo mientras esta consulta esta en vuelo.
 *
 * **Pintar una pagina cuesta UNA SOLA invocacion de `listRecipesAction`** (R10): esta funcion
 * nunca llama a `getRecipeAction` y no hay bucle que consulte el detalle por fila.
 *
 * **R7**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite
 * `requireAdmin` y no se ocultan columnas por rol: la autorizacion la aporta el caso de uso, y
 * si responde `unauthorized` se pinta el estado de error **sin un solo dato del catalogo**.
 */
export async function RecipeListSection({ page, pageSize }: RecipeListSectionProps) {
  const result = await listRecipesAction({ page, pageSize });

  if (result.status === 'error') {
    return <RecipeListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    return (
      <RecipeListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? `${FORMULAS_ROUTE}?${buildRecipeListQuery({ page: FIRST_PAGE, pageSize })}`
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="recipe-list">
      <RecipeTable recipes={items} />
      <RecipeListToolbar page={currentPage} pageSize={pageSize} totalPages={totalPages} />
    </div>
  );
}
