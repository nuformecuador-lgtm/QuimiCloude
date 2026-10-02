import type { Metadata } from 'next';
import { Suspense } from 'react';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { BRAND_LABEL, ORDERS_LABEL } from '@/lib/shared/navigation/private-nav';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import {
  FIRST_PAGE,
  OrderListSection,
  OrderListSkeleton,
  OrderSheet,
  parseOrderListParams,
  type OrderListSearchParams,
  type RecipePickerPage,
} from './components';

export const metadata: Metadata = {
  title: `${ORDERS_LABEL} · ${BRAND_LABEL}`,
};

/**
 * Pantalla de la lista de pedidos (R1, R21, `design.md > 5`).
 *
 * **La ubicacion sale de `ORDERS_ROUTE`** (`lib/shared/routes.ts`): el nombre de la carpeta es
 * solo la forma en que el App Router materializa esa constante, y el test de contrato deriva de
 * ella la ruta esperada en vez de incrustar el literal (R2). Por eso la marca del titulo y la
 * etiqueta tambien llegan importadas (`BRAND_LABEL`, `ORDERS_LABEL`), nunca escritas a mano.
 *
 * **El contenedor exterior es un `div` y NO declara el landmark principal** (R1, R47):
 * `SidebarInset` del layout privado ya lo es, y QC-11 exige que sea unico. (Escrito sin el signo
 * de menor que a proposito: una guardia de fuente que busque la etiqueta no debe encontrarla ni
 * aqui.)
 *
 * **Los componentes se importan SOLO desde `./components`** (R40), nunca por ruta profunda. El
 * barrel no declara `'use client'`: la frontera la declara cada componente, asi que esta pagina
 * sigue siendo un Server Component aunque importe de el.
 *
 * **El estado de lista vive en la cadena de consulta, no en React** (`design.md > 5`; alternativa
 * H, descartada): asi recargar, compartir el enlace o volver con «atras» conserva pagina, orden y
 * filtros, que es lo que R25 exige al cerrar el panel lateral. `searchParams` es una `Promise`,
 * como pide el App Router.
 *
 * **El `<Suspense>` YA NO lleva `key`** (2026-09-07): la llevaba para que el esqueleto de R21
 * reapareciera en cada cambio de pagina, orden, filtro o tamano, pero remontar el limite borraba
 * la barra de filtros -y el foco del campo que se estaba escribiendo-. Esa senal la da ahora
 * `OrderTable` mientras la navegacion esta en vuelo, sin desmontar nada.
 *
 * **El corte por permiso vive AQUI** (QC-75 R6, R7): la primera linea exige `pedidos.consultar`
 * con `requirePagePermission` -antes de resolver `searchParams` y antes de pintar nada-, que
 * redirige al login sin sesion y responde 404 sin nombrar el modulo ni mencionar permisos. El
 * middleware ya NO corta por rol (QC-75 R16): en el borde solo quedan firma, caducidad y empresa.
 * La autorizacion sobre los DATOS la siguen aportando los casos de uso de `pedidos`.
 *
 * **El disparador del alta (`<OrderSheet />`) vive AQUI, junto al titulo**, igual que en
 * inventario y proveedores: es un componente de cliente con su propio estado de apertura, asi que
 * esta pagina sigue siendo un Server Component aunque lo monte. Los DOS catalogos que su panel
 * necesita -la primera pagina de recetas y las unidades- se piden tambien AQUI, UNA SOLA VEZ
 * (`loadFormCatalogs`), y bajan por props tanto al disparador de la cabecera como a
 * `OrderListSection`, que ya no los pide por su cuenta. El resto de lecturas de la seccion
 * -cobertura, responsables, grupos de trabajo- sigue siendo enteramente suya: el disparador de la
 * cabecera no las necesita.
 */

/**
 * El catalogo que alimenta el panel lateral de alta (`design.md > 9`): la primera pagina de
 * recetas -el selector busca las demas en el servidor (R31)- y las unidades -que resuelven la
 * unidad de los ingredientes que muestra el panel-. **Mismos argumentos** con los que
 * `OrderListSection` pedia estos dos catalogos antes de subir el disparador a la cabecera: la
 * primera pagina de recetas con `MAX_PAGE_SIZE` y el catalogo entero de unidades.
 *
 * Si algun catalogo falla, el panel se abre con el selector vacio -o la unidad de los ingredientes
 * sin resolver- en vez de tumbar la pantalla: la lista es lo que la pantalla existe para mostrar,
 * y el alta ya rechaza en el servidor un id que no exista (`recipe_not_found`). Mismo degradado
 * que el resto de lecturas de esta pantalla.
 */
async function loadFormCatalogs(): Promise<{
  readonly recipes: RecipePickerPage;
  readonly units: readonly UnitView[];
}> {
  const [recipes, units] = await Promise.all([
    listRecipesAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
    listUnitsAction(),
  ]);

  return {
    recipes:
      recipes.status === 'success'
        ? {
            items: recipes.data.items.map((recipe) => ({
              id: recipe.id,
              name: recipe.name,
              // `imageUrl` ya viene compuesta por `recetas`; aqui no se inventa ninguna URL.
              imageUrl: recipe.imageUrl,
            })),
            totalPages: recipes.data.totalPages,
          }
        : { items: [], totalPages: FIRST_PAGE },
    units: units.status === 'success' ? units.data : [],
  };
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<OrderListSearchParams>;
}) {
  await requirePagePermission('pedidos.consultar');

  const [params, { recipes, units }] = await Promise.all([
    searchParams.then(parseOrderListParams),
    loadFormCatalogs(),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 data-testid="pedidos-title" className="text-2xl font-semibold">
          {ORDERS_LABEL}
        </h1>
        <OrderSheet recipes={recipes} units={units} />
      </div>
      {/*
        SIN `key`: remontar este limite en cada cambio de consulta destruia la barra de filtros y
        con ella el foco del campo en el que se estaba escribiendo. La senal de R21 la da ahora
        `OrderTable` mientras la navegacion esta en vuelo, sin desmontar la barra; el `fallback` de
        aqui cubre la primera carga.
      */}
      <Suspense fallback={<OrderListSkeleton rows={params.pageSize} />}>
        <OrderListSection params={params} recipes={recipes} units={units} />
      </Suspense>
    </div>
  );
}
