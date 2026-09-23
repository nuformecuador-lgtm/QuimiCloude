import type { DataTableParams } from '@/components/shared/data-table';
import { identity } from '@/lib/composition';
import { canModifyAssignments } from '@/lib/modules/asignaciones';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { listResponsiblesForOrdersAction } from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';
import { listUsersAction } from '@/lib/modules/identity/adapters/driving/user-actions';
import { listWorkGroupsAction } from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { listRecipesAction } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { listUnitsAction } from '@/lib/modules/unidades/adapters/driving/unit-actions';
import type { UnitView } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';

import { OrderListEmpty } from './order-list-empty';
import {
  EMPTY_RESPONSIBLES_CATALOG,
  type OrderResponsiblesCatalog,
} from './order-responsibles';
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
 * recetas -el selector busca las demas en el servidor (R31)- y las unidades -que resuelven la
 * unidad de los ingredientes que muestra el panel-. El componente de cliente no las pide por su
 * cuenta.
 *
 * QC-35bis (2026-09-07): eran DOS y quedaron en uno -el catalogo de unidades dejo de bajar
 * cuando la unidad salio del pedido-. El 2026-09-09 vuelven a ser DOS: el panel muestra ahora los
 * ingredientes de la receta y necesita resolver su unidad.
 *
 * Si algun catalogo falla, el panel se abre con el selector vacio -o la unidad de los
 * ingredientes sin resolver- en vez de tumbar la lista entera: la lista es lo que la pantalla
 * existe para mostrar, y el alta ya rechaza en el servidor un id que no exista
 * (`recipe_not_found`).
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

// ---------------------------------------------------------------------------------------------
// QC-102 T11 y T15 — Los responsables de la PAGINA, compuestos AQUI y no dentro de `pedidos`
// ---------------------------------------------------------------------------------------------

/**
 * `true` si la sesion trae `asignaciones.modificar` (QC-102 R28, `design.md > 3.4`).
 *
 * **No es autorizacion, es PRESENTACION**: decide que controles se EMITEN en el HTML, no que se
 * puede hacer. Quien autoriza de verdad es `requirePermission` en la primera linea de los cuatro
 * casos de uso de QC-87, que rechaza igual aunque esta pantalla se saltara —y hay test suyo que lo
 * afirma, `tests/unit/asignaciones/authorization.test.ts`—: anticipar aqui no es autorizar alli.
 *
 * **La pertenencia la resuelve `canModifyAssignments`, del propio modulo `asignaciones`, y nada
 * mas**: el predicado acepta directamente el `SessionUser` de `identity.getSessionUser()`, delega
 * en `assertPermission` por dentro y nunca lanza, asi que el literal `'asignaciones.modificar'`
 * vive dentro de `asignaciones` y no se repite aqui (R29, R50). Con la sesion caida devuelve
 * `false`, la direccion segura.
 *
 * **El componente de cliente NO lee cookies ni permisos** (R28): este booleano baja por props.
 */
async function canModifyResponsibles(): Promise<boolean> {
  return canModifyAssignments(await identity.getSessionUser());
}

/**
 * Los responsables de los pedidos de ESTA pagina, en **UNA sola** llamada (R16, decision cerrada
 * 5, `design.md > 1`).
 *
 * **Se compone aqui, en la PANTALLA, y no dentro de `listOrders`.** `asignaciones` ya depende de
 * `pedidos` —su caso de uso recibe el `OrderCatalog` del contrato publico—, asi que meter esta
 * lectura en `pedidos` cerraria el ciclo `pedidos → asignaciones → pedidos`. `app/**` si puede
 * llamar a los dos modulos, y es justo lo que esta funcion hace. Decidido en `design.md > 1` con
 * tres alternativas descartadas.
 *
 * **Ni una consulta por fila**: el argumento es el array entero de identificadores de la pagina.
 * Como `pageSize` nunca supera `MAX_PAGE_SIZE` y el tope del lote ES `MAX_PAGE_SIZE`, la pagina
 * entera cabe siempre; no se recorta nada aqui, porque recortar dejaria filas sin responsables en
 * silencio (`design.md > 0` H4).
 *
 * **Si falla, DEGRADA** (R20): devuelve el reparto vacio y la lista se sigue pintando con la
 * columna sin resolver. El estado de error de la pantalla sigue siendo el de la LISTA de pedidos
 * —el mismo criterio con el que `loadFormCatalogs` degrada los catalogos del panel—.
 */
async function loadResponsibles(
  orderIds: readonly string[],
): Promise<Readonly<Record<string, readonly OrderResponsible[]>>> {
  const result = await listResponsiblesForOrdersAction(orderIds);

  if (result.status === 'error') return {};

  // El reparto por fila se hace EN EL SERVIDOR: a la tabla baja un `Record` plano y serializable,
  // nunca un `Map` ni una funcion.
  const byOrder: Record<string, readonly OrderResponsible[]> = {};
  for (const entry of result.data) {
    byOrder[entry.orderId] = entry.responsibles;
  }
  return byOrder;
}

/**
 * Los dos catalogos que el panel ofrece para asignar, **por props** (R27) y **solo si el actor
 * puede escribir**: sin `asignaciones.modificar` no se monta ningun control de escritura, asi que
 * pedirlos seria trabajo tirado.
 *
 * **Degrada como `loadFormCatalogs`** (`design.md > 0` H1): `listUsersAction` y
 * `listWorkGroupsAction` exigen `usuarios.consultar`, que la decision cerrada 2 no nombra. Quien
 * tenga `asignaciones.modificar` sin ese permiso ve el panel con los catalogos **vacios** y su
 * texto de lista vacia; no se inventa ningun permiso nuevo (R15) y no se tumba la lista.
 *
 * El tamano es `MAX_PAGE_SIZE`, el tope que los propios casos de uso imponen: el buscador filtra
 * sobre lo que ya llego (R27).
 */
async function loadResponsiblesCatalog(): Promise<OrderResponsiblesCatalog> {
  const canWrite = await canModifyResponsibles();

  if (!canWrite) return EMPTY_RESPONSIBLES_CATALOG;

  const [users, groups] = await Promise.all([
    listUsersAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
    listWorkGroupsAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
  ]);

  return {
    canWrite,
    people:
      users.status === 'success'
        ? users.data.items.map((user) => ({ id: user.id, displayName: user.displayName }))
        : [],
    workGroups:
      groups.status === 'success'
        ? groups.data.items.map((group) => ({ id: group.id, name: group.name }))
        : [],
  };
}

export async function OrderListSection({ params }: OrderListSectionProps) {
  const result = await listOrdersAction(params);

  if (result.status === 'error') {
    return <OrderListError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;
  const { recipes, units } = await loadFormCatalogs();

  if (items.length === 0 && params.search === '') {
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
        <OrderSheet recipes={recipes} units={units} />
      </OrderListEmpty>
    );
  }

  if (items.length === 0) {
    // Con termino vigente y cero filas el vacio es «sin coincidencias», no «no hay pedidos»: se
    // pinta DENTRO de la tabla, con la caja montada, y sin pedir responsables (no hay filas a las
    // que repartirlos).
    return (
      <div className="flex flex-col gap-4" data-testid="order-list">
        <div className="flex justify-end">
          <OrderSheet recipes={recipes} units={units} />
        </div>
        <OrderTable
          orders={items}
          params={params}
          totalPages={totalPages}
          recipes={recipes}
          units={units}
          noMatches={{ clearHref: orderListHref({ ...params, search: '', page: FIRST_PAGE }) }}
        />
      </div>
    );
  }

  /*
    QC-102 R16 — La SEGUNDA llamada, seguida y con los ids de ESTA pagina. Va DESPUES de
    `listOrdersAction` porque los identificadores salen de su resultado: es una dependencia real,
    no una secuencia por descuido. Y va despues del estado VACIO porque con cero pedidos no hay
    nada que preguntar. Se emite **UNA vez por render**, nunca una por fila.

    Las dos lecturas de aqui si van en paralelo entre si: el catalogo del panel no depende del
    lote, y esperarlas en fila solo sumaria latencia.
  */
  const [responsiblesByOrder, responsiblesCatalog] = await Promise.all([
    loadResponsibles(items.map((order) => order.id)),
    loadResponsiblesCatalog(),
  ]);

  return (
    <div className="flex flex-col gap-4" data-testid="order-list">
      {/*
        El disparador del alta (R25). Vive junto a la lista y no en `page.tsx` porque los dos
        catalogos que el panel necesita se piden aqui, donde ya se pide la lista.
      */}
      <div className="flex justify-end">
        <OrderSheet recipes={recipes} units={units} />
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
        units={units}
        responsiblesByOrder={responsiblesByOrder}
        responsiblesCatalog={responsiblesCatalog}
      />
    </div>
  );
}
