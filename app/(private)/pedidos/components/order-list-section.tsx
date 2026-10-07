import type { DataTableParams } from '@/components/shared/data-table';
import { identity } from '@/lib/composition';
import { canModifyAssignments } from '@/lib/modules/asignaciones';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import {
  listResponsibleCandidatesAction,
  listResponsiblesForOrdersAction,
} from '@/lib/modules/asignaciones/adapters/driving/order-assignment-actions';
import { assertPermission } from '@/lib/modules/identity';
import { listWorkGroupsAction } from '@/lib/modules/identity/adapters/driving/work-group-actions';
import { withFilter } from '@/components/shared/data-table';
import {
  getOrderCustomerFilterOptionAction,
  listOrderCoverageAction,
  listOrdersAction,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type { MassVolumeBridge, UnitView } from '@/lib/modules/unidades';
import { MAX_PAGE_SIZE } from '@/lib/shared/pagination';
// Solo el tipo: la arista pedidos -> inventario ya existe en el contrato del modulo.
import type { OrderCoverage } from '@/lib/modules/inventario';

import type { OrderCustomerChoice } from './order-customer-label';
import { OrderListEmpty } from './order-list-empty';
import {
  EMPTY_RESPONSIBLES_CATALOG,
  type OrderResponsiblesCatalog,
} from './order-responsibles';
import { OrderListError } from './order-list-error';
import {
  CUSTOMER_COLUMN_ID,
  CUSTOMER_PRESENCE_COLUMN_ID,
  FIRST_PAGE,
  orderListHref,
} from './order-list-params';
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
  /**
   * La primera pagina del catalogo de recetas para el panel de cada fila (R43), resuelta UNA VEZ
   * en `page.tsx` -que tambien la usa para el disparador de la cabecera- y bajada por props: esta
   * seccion ya no llama a `listRecipesAction` por su cuenta.
   */
  readonly recipes: RecipePickerPage;
  /** El catalogo de unidades del panel de cada fila (R43), mismo origen que `recipes`. */
  readonly units: readonly UnitView[];
  readonly bridge: MassVolumeBridge | null;
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
 *
 * **`recipes` y `units` YA NO se piden aqui.** Los trae `page.tsx` una sola vez (R43) porque
 * tambien los necesita el disparador del alta de la cabecera, y bajan por props hasta el panel de
 * cada fila: el componente de cliente sigue sin pedirlos por su cuenta.
 */

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

const PERMISSION_DENIED = new Error('permiso denegado');

/**
 * Presentacion, no autorizacion: decide si se pinta la edicion acotada de reparto y unidad. La
 * Server Action vuelve a exigir el permiso.
 */
async function canEditOrderDistribution(): Promise<boolean> {
  const user = await identity.getSessionUser();
  try {
    assertPermission(user, 'pedidos.modificar', () => PERMISSION_DENIED);
    return true;
  } catch (error) {
    if (error !== PERMISSION_DENIED) throw error;
    return false;
  }
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
 * —el mismo criterio con el que `page.tsx` degrada los catalogos del panel (`loadFormCatalogs`)—.
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

// ---------------------------------------------------------------------------------------------
// La cobertura de la PAGINA, compuesta AQUI, mismo patron que los responsables.
// ---------------------------------------------------------------------------------------------

/**
 * La cobertura de los pedidos de ESTA pagina, en **UNA sola** llamada.
 *
 * **Ni una consulta por fila**: el argumento es el array entero de identificadores de la pagina,
 * mismo criterio que `loadResponsibles`.
 *
 * **Si falla, DEGRADA** (mismo criterio que `loadResponsibles`): devuelve el reparto vacio y la
 * columna se pinta sin resolver -marcador de ausencia-, sin tumbar la lista.
 */
async function loadCoverage(
  orderIds: readonly string[],
): Promise<Readonly<Record<string, OrderCoverage>>> {
  const result = await listOrderCoverageAction(orderIds);

  if (result.status === 'error') return {};

  const byOrder: Record<string, OrderCoverage> = {};
  for (const entry of result.data) {
    byOrder[entry.orderId] = entry.coverage;
  }
  return byOrder;
}

/**
 * Los dos catalogos que el panel ofrece para asignar, **por props** (R27) y **solo si el actor
 * puede escribir**: sin `asignaciones.modificar` no se monta ningun control de escritura, asi que
 * pedirlos seria trabajo tirado.
 *
 * **Personas**: `listResponsibleCandidatesAction` ya exige `asignaciones.modificar` -la misma
 * condicion con la que este panel se monta- y devuelve solo a quien puede ser responsable, asi
 * que aqui no hace falta pedir nada por `usuarios.consultar` ni filtrar nada mas. Si falla,
 * degrada a lista vacia igual que los grupos.
 *
 * **Grupos**: siguen saliendo de `listWorkGroupsAction`, que exige `usuarios.consultar`; sin ese
 * permiso el panel ofrece personas pero ningun grupo, en vez de tumbar la lista.
 *
 * El tamano de grupos es `MAX_PAGE_SIZE`, el tope que el propio caso de uso impone: el buscador
 * filtra sobre lo que ya llego.
 */
async function loadResponsiblesCatalog(): Promise<OrderResponsiblesCatalog> {
  const canWrite = await canModifyResponsibles();

  if (!canWrite) return EMPTY_RESPONSIBLES_CATALOG;

  const [candidates, groups] = await Promise.all([
    listResponsibleCandidatesAction(),
    listWorkGroupsAction({ page: FIRST_PAGE, pageSize: MAX_PAGE_SIZE }),
  ]);

  return {
    canWrite,
    people: candidates.status === 'success' ? candidates.data : [],
    workGroups:
      groups.status === 'success'
        ? groups.data.items.map((group) => ({ id: group.id, name: group.name }))
        : [],
  };
}

/** El cliente que trae la direccion, o `null` si no es de la empresa o no se pudo resolver. */
async function loadCustomerFilterOption(params: DataTableParams) {
  const filter = params.filters[CUSTOMER_COLUMN_ID];
  const id = filter?.kind === 'select' ? filter.values[0] : undefined;
  if (id === undefined) return undefined;

  const result = await getOrderCustomerFilterOptionAction(id);
  return result.status === 'success' ? result.data : null;
}

/**
 * Lista y resuelve el filtro de cliente a la vez. Si el cliente de la direccion no se resuelve, el
 * filtro se descarta y se lista otra vez sin el: la pantalla no puede filtrar por algo que no
 * sabe nombrar.
 */
async function listWithCustomerFilter(params: DataTableParams) {
  const [listed, option] = await Promise.all([
    listOrdersAction(params),
    loadCustomerFilterOption(params),
  ]);

  if (option === null) {
    const withoutFilter = withFilter(params, CUSTOMER_COLUMN_ID, null);
    return { params: withoutFilter, result: await listOrdersAction(withoutFilter), customerFilter: null };
  }

  const customerFilter: OrderCustomerChoice | null =
    option !== undefined
      ? { kind: 'customer', customer: option }
      : params.filters[CUSTOMER_PRESENCE_COLUMN_ID] !== undefined
        ? { kind: 'none' }
        : null;
  return { params, result: listed, customerFilter };
}

export async function OrderListSection({
  params: requestedParams,
  recipes,
  units,
  bridge,
}: OrderListSectionProps) {
  const { params, result, customerFilter } = await listWithCustomerFilter(requestedParams);

  if (result.status === 'error') {
    return <OrderListError error={result} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0 && params.search === '') {
    // El disparador del alta ya esta en la cabecera (R21, `page.tsx`): este vacio no monta ningun
    // panel propio, solo el mensaje y, si aplica, la vuelta a la primera pagina.
    return (
      <OrderListEmpty
        firstPageHref={
          currentPage > FIRST_PAGE
            ? orderListHref({ ...params, page: FIRST_PAGE })
            : undefined
        }
      />
    );
  }

  if (items.length === 0) {
    // Con termino vigente y cero filas el vacio es «sin coincidencias», no «no hay pedidos»: se
    // pinta DENTRO de la tabla, con la caja montada, y sin pedir responsables (no hay filas a las
    // que repartirlos).
    return (
      <div className="flex flex-col gap-4" data-testid="order-list">
        <OrderTable
          orders={items}
          params={params}
          totalPages={totalPages}
          recipes={recipes}
          units={units}
          bridge={bridge}
          customerFilter={customerFilter}
          noMatches={{ clearHref: orderListHref({ ...params, search: '', page: FIRST_PAGE }) }}
        />
      </div>
    );
  }

  /*
    Los TRES lotes de la pagina, seguidos y con los ids de ESTA pagina. Van DESPUES de
    `listOrdersAction` porque los identificadores salen de su resultado: es una dependencia real,
    no una secuencia por descuido. Y van despues del estado VACIO porque con cero pedidos no hay
    nada que preguntar. Cada uno se emite **UNA vez por render**, nunca una por fila.

    Las tres lecturas de aqui si van en paralelo entre si: ninguna depende de otra, y esperarlas
    en fila solo sumaria latencia.
  */
  const [responsiblesByOrder, responsiblesCatalog, coverageByOrder, canEditDistribution] =
    await Promise.all([
      loadResponsibles(items.map((order) => order.id)),
      loadResponsiblesCatalog(),
      loadCoverage(items.map((order) => order.id)),
      canEditOrderDistribution(),
    ]);

  return (
    <div className="flex flex-col gap-4" data-testid="order-list">
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
        bridge={bridge}
        responsiblesByOrder={responsiblesByOrder}
        responsiblesCatalog={responsiblesCatalog}
        coverageByOrder={coverageByOrder}
        canEditDistribution={canEditDistribution}
        canEditCustomer={canEditDistribution}
        customerFilter={customerFilter}
      />
    </div>
  );
}
