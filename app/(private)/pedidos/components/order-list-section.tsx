import type { DataTableParams } from '@/components/shared/data-table';
import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import { OrderListEmpty } from './order-list-empty';
import { OrderListError } from './order-list-error';
import { FIRST_PAGE, orderListHref } from './order-list-params';
import { OrderSheet } from './order-sheet';
import { OrderTable } from './order-table';
import type { RecipePickerPage } from './recipe-picker';

type OrderListSectionProps = {
  /**
   * Los parametros ya acotados por `parseOrderListParams`. Se reciben **enteros** y se pasan
   * **enteros y sin traducir** a la operacion de listado: `DataTableParams` es campo a campo la
   * misma forma que `ListQuery` (`design.md > 0` y `> 5`), y `createListQuerySchema()` es un
   * `z.strictObject`, asi que traducir aqui solo podria introducir una clave de mas.
   */
  readonly params: DataTableParams;
};

/**
 * Seccion de lista: pide los datos y despacha a uno de los tres estados (R7, R21, R6,
 * `design.md > 5`).
 *
 * **Server Component `async`**: los datos se piden en el servidor y bajan al cliente ya
 * renderizados. Es la parte que la pagina envuelve en `<Suspense>`, de modo que el esqueleto de
 * R21 aparece solo mientras esta consulta esta en vuelo —sin un estado de carga escrito a mano y
 * sin carreras entre peticiones—.
 *
 * **Una sola llamada a `listOrdersAction`** (`design.md > 5`): nunca `getOrderAction` por fila. La
 * vista ya trae `recipeName` y `unitName` resueltos (alternativa M, descartada), asi que no hay
 * nada que volver a pedir. Toda lectura pasa por la Server Action del modulo, importada **por su
 * ruta exacta y nunca por el barrel**; ningun `fetch` a rutas propias (R41).
 *
 * **R6**: aqui no se decide nada sobre permisos. No se lee la sesion, no se repite `requireAdmin`
 * y no se ocultan columnas por rol: la autorizacion la aportan los seis casos de uso de
 * `pedidos`, y si la operacion responde `unauthorized` se pinta el estado de error **sin un solo
 * dato**.
 *
 * **Una lista vacia NO se pinta como tabla sin filas** (R21): son tres situaciones distintas
 * —fallo, lista realmente vacia y pagina que se quedo atras tras una baja o un filtro— y cada una
 * dice lo suyo. El destino de «volver a la primera» se deriva de `ORDERS_ROUTE` a traves de
 * `orderListHref`, nunca de un literal (R2).
 */
/**
 * El catalogo que alimenta el panel lateral de alta y edicion, pedido **una sola vez** por render
 * de la seccion y bajado al cliente **por props** (R43, `design.md > 9`): la primera pagina de
 * recetas -el selector busca las demas en el servidor (R31)-. El componente de cliente no la pide
 * por su cuenta.
 *
 * QC-35bis (2026-09-07): eran DOS. El catalogo entero de unidades bajaba tambien, para el
 * selector de unidad del formulario; al salir la unidad del pedido, esa consulta -y con ella
 * `listUnitsAction` en esta pantalla- desaparecio.
 *
 * Si el catalogo falla, el panel se abre con el selector vacio en vez de tumbar la lista entera:
 * la lista es lo que la pantalla existe para mostrar, y el alta ya rechaza en el servidor un id
 * que no exista (`recipe_not_found`).
 */
async function loadFormCatalogs(): Promise<{ readonly recipes: RecipePickerPage }> {
  const recipes = await listRecipesAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE });

  return {
    recipes:
      recipes.status === 'success'
        ? {
            items: recipes.data.items.map((recipe) => ({ id: recipe.id, name: recipe.name })),
            totalPages: recipes.data.totalPages,
          }
        : { items: [], totalPages: FIRST_PAGE },
  };
}

export async function OrderListSection({ params }: OrderListSectionProps) {
  const result = await listOrdersAction(params);

  if (result.status === 'error') {
    return <OrderListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;
  const { recipes } = await loadFormCatalogs();

  if (items.length === 0) {
    // El slot de «crear el primer pedido» (R21) lo llena `<OrderSheet />` (T10) como `children`:
    // es la unica accion util cuando no hay ni un pedido, y bajando el disparador desde aqui el
    // estado vacio no tiene que conocer el panel lateral ni convertirse en modulo de cliente.
    return (
      <OrderListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? orderListHref({ ...params, page: FIRST_PAGE })
            : undefined
        }
      >
        <OrderSheet recipes={recipes} />
      </OrderListEmpty>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="order-list">
      {/*
        El disparador del alta (R25). Vive junto a la lista y no en `page.tsx` porque los dos
        catalogos que el panel necesita se piden aqui, donde ya se pide la lista.
      */}
      <div className="flex justify-end">
        <OrderSheet recipes={recipes} />
      </div>
      {/*
        `order-table.tsx` es un modulo de CLIENTE —la columna de acciones declara celdas con
        elementos y funciones, que no cruzan la frontera servidor->cliente (`design.md > 6.1`)—,
        asi que desde aqui solo bajan datos serializables: las filas, los parametros vigentes y el
        total de paginas. La tabla recibe `status: 'idle'` siempre: los tres estados se pintan
        FUERA de `<DataTable>` (alternativa Q, descartada).
      */}
      <OrderTable
        orders={items}
        params={params}
        totalPages={totalPages}
        recipes={recipes}
      />
    </div>
  );
}
