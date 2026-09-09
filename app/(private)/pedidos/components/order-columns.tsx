'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { UnitView } from '@/lib/modules/unidades';

import {
  CREATED_AT_COLUMN_ID,
  PRIORITY_COLUMN_ID,
  STATUS_COLUMN_ID,
} from './order-list-params';
import { OrderRowSheetActions } from './order-sheet';
import type { RecipePickerPage } from './recipe-picker';
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
 * **Se declaran con una FACTORIA, `buildOrderColumns`** (y no como un array del modulo): la
 * celda de acciones monta el panel de edicion y los dos dialogos, que necesitan el catalogo de
 * recetas por props (R43). Mientras fue un array estatico ese catalogo no tenia por donde llegar
 * y los tres botones de la fila no abrian nada.
 *
 * **La columna de acciones es una columna NORMAL** (`design.md > 6.1`, alternativa B descartada):
 * `DataTableColumn.cell` ya devuelve `ReactNode` y `DataTable` lo pinta directamente. No se
 * anade ninguna prop `renderRowActions` al componente compartido, que seria una segunda manera
 * de hacer lo que `cell` ya hace. Esto es lo que QC-56 adopta.
 *
 * **Solo cuatro columnas ordenan** (R12): correlativo, estado, prioridad y fecha de solicitud.
 * Son `ORDER_QUERYABLE.sortable` **menos** `quantity`, que la decision cerrada no pide: declarar
 * `sortable` en una cabecera que nadie acordo seria inventar alcance. (`unitPrice` estaba tambien
 * en esa resta hasta el 2026-09-07; hoy ya no esta ni en la lista blanca ni en la tabla.)
 *
 * **No hay columna de total ni de autoria** (R8, alternativa N descartada): el total lo calculara
 * el servidor en QC-68, y `createdBy`/`updatedBy` son identificadores, no nombres. El test de R8
 * lo comprueba recorriendo esta misma declaracion.
 *
 * **La cantidad se pinta TAL CUAL llega** (R39): es una cadena decimal del contrato. Ni
 * `Intl.NumberFormat`, ni `toFixed`, ni conversion a coma flotante, ni aritmetica —tampoco para
 * un total, que aqui no existe—.
 *
 * **QC-35bis (2026-09-07): no hay columna de unidad ni de precio unitario.** Salieron del pedido
 * entero -formulario, contrato del modulo y tabla `orders`-, asi que no queda dato que pintar.
 */

/** Id de la columna del correlativo. Se exporta porque la tabla la fija por defecto (R19). */
export const ORDER_NUMBER_COLUMN_ID = 'orderNumber';

/** Ids de las columnas que no filtran ni ordenan, pero que los tests localizan por su celda. */
export const RECIPE_NAME_COLUMN_ID = 'recipeName';
export const QUANTITY_COLUMN_ID = 'quantity';
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

/**
 * Los dos catalogos que el panel lateral de edicion necesita, bajados por props desde el Server
 * Component de la seccion (R43): la primera pagina de recetas y las unidades existentes.
 */
export type OrderColumnsDeps = {
  readonly recipes: RecipePickerPage;
  readonly units: readonly UnitView[];
};

/**
 * **Factoria, y no un array estatico**, por una razon concreta: la celda de acciones tiene que
 * montar el panel de edicion y los dos dialogos, y esos necesitan los catalogos de recetas y
 * unidades. Un array declarado en el modulo no puede recibirlos, asi que las acciones quedaban
 * sin cablear -los botones existian y no abrian nada-. Las columnas siguen siendo DATOS: lo que
 * cambia es que se construyen con sus dependencias.
 */
export function buildOrderColumns({
  recipes,
  units,
}: OrderColumnsDeps): readonly DataTableColumn<OrderSummary>[] {
  return [
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
      cell: (order) => <OrderRowSheetActions order={order} recipes={recipes} units={units} />,
    },
  ];
}
