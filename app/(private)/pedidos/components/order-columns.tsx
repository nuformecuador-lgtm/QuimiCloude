'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';

import {
  CREATED_AT_COLUMN_ID,
  PRIORITY_COLUMN_ID,
  STATUS_COLUMN_ID,
} from './order-list-params';
import { OrderRowActions } from './order-row-actions';
import {
  ORDER_PRIORITY_FILTER_OPTIONS,
  ORDER_STATUS_FILTER_OPTIONS,
  OrderPriorityBadge,
  OrderStatusBadge,
} from './order-status-badge';

/**
 * Las DIEZ columnas de la lista de pedidos, declaradas **como datos** (R8-R12, R14, R19, R23,
 * `design.md > 7`).
 *
 * **Modulo de CLIENTE, y no por gusto** (`design.md > 6.1`): la columna de acciones devuelve
 * elementos y las demas devuelven funciones de celda, y una configuracion con funciones no cruza
 * la frontera servidor->cliente. Por eso `OrderListSection` (servidor) baja solo datos
 * serializables y es esta declaracion la que vive del lado del navegador.
 *
 * **La columna de acciones es una columna NORMAL** (`design.md > 6.1`, alternativa B descartada):
 * `DataTableColumn.cell` ya devuelve `ReactNode` y `DataTable` lo pinta directamente. No se
 * anade ninguna prop `renderRowActions` al componente compartido, que seria una segunda manera
 * de hacer lo que `cell` ya hace. Esto es lo que QC-56 adopta.
 *
 * **Solo cuatro columnas ordenan** (R12): correlativo, estado, prioridad y fecha de solicitud.
 * Son `ORDER_QUERYABLE.sortable` **menos** `quantity` y `unitPrice`, que la decision cerrada no
 * pide: declarar `sortable` en una cabecera que nadie acordo seria inventar alcance.
 *
 * **No hay columna de total ni de autoria** (R8, alternativa N descartada): el total lo calculara
 * el servidor en QC-68, y `createdBy`/`updatedBy` son identificadores, no nombres. El test de R8
 * lo comprueba recorriendo esta misma declaracion.
 *
 * **Cantidad y precio se pintan TAL CUAL llegan** (R39): son cadenas decimales del contrato. Ni
 * `Intl.NumberFormat`, ni `toFixed`, ni conversion a coma flotante, ni aritmetica —tampoco para
 * un total, que aqui no existe—.
 */

/** Id de la columna del correlativo. Se exporta porque la tabla la fija por defecto (R19). */
export const ORDER_NUMBER_COLUMN_ID = 'orderNumber';

/** Ids de las columnas que no filtran ni ordenan, pero que los tests localizan por su celda. */
export const RECIPE_NAME_COLUMN_ID = 'recipeName';
export const UNIT_NAME_COLUMN_ID = 'unitName';
export const QUANTITY_COLUMN_ID = 'quantity';
export const UNIT_PRICE_COLUMN_ID = 'unitPrice';
export const CANCELLATION_REASON_COLUMN_ID = 'cancellationReason';
export const ACTIONS_COLUMN_ID = 'actions';

/**
 * Columnas que nacen fijadas al borde izquierdo (R19, `design.md > 6.3`). Es un **defecto**: en
 * cuanto el usuario tenga preferencia guardada para este `tableId` gana la suya, incluida la de
 * no tener nada fijado.
 */
export const ORDER_DEFAULT_PINNED_COLUMNS: readonly string[] = [ORDER_NUMBER_COLUMN_ID];

/** Glifo del marcador de ausencia. Constante para que ningun test dependa del caracter. */
export const MISSING_VALUE_MARK = '—';

/**
 * Marcador identificable de «este dato no viene informado» (R9, R11).
 *
 * Se pinta con su propio `data-testid` para poder afirmar en negativo lo que de verdad importa:
 * que en esa celda **no aparece el identificador tecnico**. Un uuid en pantalla no es informacion,
 * es ruido que ademas se lee como si fuera un dato del pedido.
 */
function MissingValue({ field }: { readonly field: string }) {
  return (
    <span aria-label="Sin dato" data-testid={`order-missing-${field}`}>
      {MISSING_VALUE_MARK}
    </span>
  );
}

/**
 * Fecha en `YYYY-MM-DD` y en UTC, **no con `toLocaleDateString`**: el Server Component y el
 * navegador tienen husos y locales distintos, y una fecha formateada con el local del entorno
 * produce una discrepancia de hidratacion que nadie relaciona con la tabla. Mismo criterio que
 * `supplier-columns.ts` y `recipe-columns.ts`.
 */
function formatRequestDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const ORDER_COLUMNS: readonly DataTableColumn<OrderSummary>[] = [
  {
    id: ORDER_NUMBER_COLUMN_ID,
    label: 'Nº de pedido',
    align: 'start',
    sortable: true,
    // R10: el correlativo SIEMPRE sale de la funcion de formato del contrato. Ni aqui ni en
    // ningun otro archivo se compone `${year}-${sequence}` a mano.
    cell: (order) => formatOrderNumber(order.number),
  },
  {
    id: STATUS_COLUMN_ID,
    label: 'Estado',
    align: 'start',
    sortable: true,
    filter: { kind: 'select', options: ORDER_STATUS_FILTER_OPTIONS },
    cell: (order) => <OrderStatusBadge status={order.status} />,
  },
  {
    id: PRIORITY_COLUMN_ID,
    label: 'Prioridad',
    align: 'start',
    sortable: true,
    filter: { kind: 'select', options: ORDER_PRIORITY_FILTER_OPTIONS },
    cell: (order) => <OrderPriorityBadge priority={order.priority} />,
  },
  {
    id: RECIPE_NAME_COLUMN_ID,
    label: 'Receta',
    align: 'start',
    // R9: el nombre viene RESUELTO en la propia fila (alternativa M, descartada). Si no viene,
    // marcador — nunca `order.recipeId`.
    cell: (order) =>
      order.recipeName ?? <MissingValue field={RECIPE_NAME_COLUMN_ID} />,
  },
  {
    id: QUANTITY_COLUMN_ID,
    label: 'Cantidad',
    align: 'end',
    // R39: la cadena decimal, tal cual la entrega la consulta.
    cell: (order) => order.quantity,
  },
  {
    id: UNIT_NAME_COLUMN_ID,
    label: 'Unidad',
    align: 'start',
    cell: (order) => order.unitName ?? <MissingValue field={UNIT_NAME_COLUMN_ID} />,
  },
  {
    id: UNIT_PRICE_COLUMN_ID,
    label: 'Precio unitario',
    align: 'end',
    // R39: idem. Sin `Intl.NumberFormat`, sin `toFixed`, sin aritmetica.
    cell: (order) => order.unitPrice,
  },
  {
    id: CREATED_AT_COLUMN_ID,
    label: 'Fecha de solicitud',
    align: 'start',
    sortable: true,
    filter: { kind: 'dateRange' },
    cell: (order) => formatRequestDate(order.createdAt),
  },
  {
    id: CANCELLATION_REASON_COLUMN_ID,
    label: 'Motivo de cancelación',
    align: 'start',
    // R11: con motivo, el motivo; sin el, marcador de ausencia. Nunca una celda vacia que
    // parezca un fallo de carga.
    cell: (order) =>
      order.cancellationReason ?? <MissingValue field={CANCELLATION_REASON_COLUMN_ID} />,
  },
  {
    id: ACTIONS_COLUMN_ID,
    label: 'Acciones',
    align: 'end',
    // Sin `sortable` (no ordena) y sin `filter` (no aparece en la barra de filtros).
    // `pinnable: false` para que el usuario no pueda fijarla y tapar la del correlativo.
    pinnable: false,
    cell: (order) => <OrderRowActions order={order} />,
  },
];
