import type { DataTableParams } from '@/components/shared/data-table';
import { listOrdersAction } from '@/lib/modules/pedidos/adapters/driving/order-actions';

import { OrderListEmpty } from './order-list-empty';
import { OrderListError } from './order-list-error';
import { FIRST_PAGE, orderListHref } from './order-list-params';

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
export async function OrderListSection({ params }: OrderListSectionProps) {
  const result = await listOrdersAction(params);

  if (result.status === 'error') {
    return <OrderListError code={result.code} message={result.message} />;
  }

  const { items, page: currentPage, totalPages } = result.data;

  if (items.length === 0) {
    // El slot de «crear el primer pedido» (R21) lo llenara `<OrderSheet />` (T10) pasandolo como
    // `children`: es la unica accion util cuando no hay ni un pedido, y bajando desde aqui el
    // estado vacio no tiene que conocer el panel lateral.
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

  return (
    <div className="flex flex-col gap-4" data-testid="order-list">
      {/*
        PUNTO DE MONTAJE DE LA TABLA (T7). El unico cambio pendiente de esta seccion es sustituir
        este marcador por:

            <OrderTable orders={items} params={params} totalPages={totalPages} />

        `order-table.tsx` es un modulo de CLIENTE —la columna de acciones declara celdas con
        elementos y funciones, que no cruzan la frontera servidor->cliente (`design.md > 6.1`)—,
        asi que desde aqui solo bajan datos serializables: las filas, los parametros vigentes y el
        total de paginas. La tabla recibira `status: 'idle'` siempre: los tres estados se pintan
        FUERA de `<DataTable>` (alternativa Q, descartada).
      */}
      <div
        data-testid="order-table-slot"
        data-row-count={items.length}
        data-total-pages={totalPages}
      />
    </div>
  );
}
