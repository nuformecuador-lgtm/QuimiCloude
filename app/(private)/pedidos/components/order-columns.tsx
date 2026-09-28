'use client';

import type { DataTableColumn } from '@/components/shared/data-table';
import { OrderPresentationLabel } from '@/components/shared/order-presentation-label';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type { UnitView } from '@/lib/modules/unidades';
import { exactDecimalTitle, formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

import {
  CREATED_AT_COLUMN_ID,
  PRIORITY_COLUMN_ID,
  STATUS_COLUMN_ID,
} from './order-list-params';
import {
  EMPTY_RESPONSIBLES_CATALOG,
  type OrderResponsiblesCatalog,
} from './order-responsibles';
import { OrderRowResponsibles, OrderRowSheetActions } from './order-sheet';
import type { RecipePickerPage } from './recipe-picker';
import {
  ORDER_PRIORITY_FILTER_OPTIONS,
  ORDER_STATUS_FILTER_OPTIONS,
  OrderCoverageBadge,
  OrderPriorityBadge,
  OrderStatusBadge,
} from './order-status-badge';
// Solo el tipo: la arista pedidos -> inventario ya existe en el contrato del modulo.
import type { OrderCoverage } from '@/lib/modules/inventario';

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
 * **La cantidad se pinta REDONDEADA A DOS DECIMALES** (enmienda del 2026-09-17 a R39,
 * decision humana). Es una cadena decimal del contrato y llega con la escala de la columna
 * -«12.5000»-, pero cuatro decimales de relleno no informan de nada y compiten por la atencion
 * con los que si: la celda la pasa por `formatDecimalDisplay` y muestra «12.5».
 *
 * Lo que R39 protege de fondo sigue vigilado y sin una sola excepcion: NI `Intl.NumberFormat`,
 * NI `toFixed`, NI coma flotante, NI aritmetica de `number` —tampoco para un total, que aqui no
 * existe—. `formatDecimalDisplay` redondea con enteros `BigInt` sobre el texto, que es exacto.
 * Y es PRESENTACION: esta celda no alimenta ningun envio, el pedido guardado conserva sus
 * cuatro decimales y reabrirlo para editar no los pierde (el formulario precarga con
 * `trimDecimal`, que no redondea).
 *
 * **QC-35bis (2026-09-07): no hay columna de unidad ni de precio unitario.** Salieron del pedido
 * entero -formulario, contrato del modulo y tabla `orders`-, asi que no queda dato que pintar.
 *
 * **QC-102 (2026-09-13): NUEVE columnas.** Se anade la de RESPONSABLES (R16), entre el motivo de
 * cancelacion y las acciones. Los responsables NO viajan en `OrderSummary` -`pedidos` no conoce
 * `asignaciones` (R14)-: los trae un lote aparte que el Server Component de la seccion pide UNA
 * vez por pagina y reparte por fila (`design.md > 1`). La columna **no ordena y no filtra**, y el
 * esqueleto sube a nueve con ella (R22).
 */

/** Id de la columna del correlativo. Se exporta porque la tabla la fija por defecto (R19). */
export const ORDER_NUMBER_COLUMN_ID = 'orderNumber';

/** Ids de las columnas que no filtran ni ordenan, pero que los tests localizan por su celda. */
export const RECIPE_NAME_COLUMN_ID = 'recipeName';
export const QUANTITY_COLUMN_ID = 'quantity';
export const PRESENTATION_NAME_COLUMN_ID = 'presentationName';
export const CANCELLATION_REASON_COLUMN_ID = 'cancellationReason';
export const COVERAGE_COLUMN_ID = 'coverage';
/** QC-102 R16 — la columna propia de responsables. */
export const RESPONSIBLES_COLUMN_ID = 'responsibles';
export const ACTIONS_COLUMN_ID = 'actions';

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
  /**
   * QC-102 R16, R26 — los responsables **ya repartidos por fila** por el Server Component de la
   * seccion: un `Record` plano y serializable, `orderId` → responsables de ese pedido. Aqui no se
   * consulta nada y no se consulta por fila; el lote se pidio UNA vez por pagina
   * (`design.md > 1`).
   *
   * Opcional y con `{}` por defecto **a proposito**: si el lote fallo, la columna se pinta **sin
   * resolver** —marcador de ausencia— y la lista se sigue viendo entera (R20).
   */
  readonly responsiblesByOrder?: Readonly<Record<string, readonly OrderResponsible[]>>;
  /** QC-102 R27, R28 — catalogos y `canWrite` del panel, compuestos una vez en el servidor. */
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /**
   * La cobertura **ya repartida por fila**, mismo patron que `responsiblesByOrder`: un `Record`
   * plano, `orderId` → `OrderCoverage`, pedido UNA vez por pagina (`listOrderCoverageAction`).
   *
   * Opcional y con `{}` por defecto: si el lote falla, la columna se pinta **sin resolver**
   * —marcador de ausencia, igual que responsables— y la lista se sigue viendo entera.
   */
  readonly coverageByOrder?: Readonly<Record<string, OrderCoverage>>;
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
  responsiblesByOrder = {},
  responsiblesCatalog = EMPTY_RESPONSIBLES_CATALOG,
  coverageByOrder = {},
}: OrderColumnsDeps): readonly DataTableColumn<OrderSummary>[] {
  return [
    {
      id: ORDER_NUMBER_COLUMN_ID,
      label: 'Nº de pedido',
      align: 'start',
      sortable: true,
      // Nace fijada al borde izquierdo (R19): es un defecto, con preferencia guardada gana
      // la del usuario.
      defaultPinned: 'left',
      // R10: el correlativo SIEMPRE sale de la funcion de formato del contrato. Ni aqui ni en
      // ningun otro archivo se compone `${year}-${sequence}` a mano.
      cell: (order) => formatOrderNumber(order.number),
    },
    {
      id: STATUS_COLUMN_ID,
      label: 'Estado',
      align: 'center',
      sortable: true,
      filter: { kind: 'select', options: ORDER_STATUS_FILTER_OPTIONS },
      cell: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      id: PRIORITY_COLUMN_ID,
      label: 'Prioridad',
      align: 'center',
      sortable: true,
      filter: { kind: 'select', options: ORDER_PRIORITY_FILTER_OPTIONS },
      cell: (order) => <OrderPriorityBadge priority={order.priority} />,
    },
    {
      id: RECIPE_NAME_COLUMN_ID,
      label: 'Receta',
      align: 'start',
      width: 500,
      hideText: false,
      cell: (order) =>
        order.recipeName ?? <MissingValue field={RECIPE_NAME_COLUMN_ID} />,
    },
    {
      id: QUANTITY_COLUMN_ID,
      label: 'Cantidad',
      align: 'center',
      // Se pinta redondeada a dos decimales y el `title` lleva el valor exacto, para el caso
      // en que el redondeo esconda una diferencia real.
      cell: (order) => (
        <span title={exactDecimalTitle(order.quantity)}>
          {formatDecimalDisplay(order.quantity)}
        </span>
      ),
    },
    {
      id: PRESENTATION_NAME_COLUMN_ID,
      label: 'Presentación',
      align: 'center',
      // Solo informa, como el importe: sin `sortable` y sin `filter`.
      cell: (order) => <OrderPresentationLabel name={order.presentationName} />,
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
      id: COVERAGE_COLUMN_ID,
      label: 'Cobertura',
      align: 'start',
      // Sin `sortable`: el orden de la lista lo manda `pedidos` y la cobertura es un dato de
      // `inventario` que ni siquiera viaja en la fila. Sin `filter`, por el mismo motivo.
      cell: (order) => {
        const coverage = coverageByOrder[order.id];
        // Si el lote fallo, esta clave no existe y la celda pinta el marcador de ausencia,
        // igual que responsables.
        return coverage === undefined ? (
          <MissingValue field={COVERAGE_COLUMN_ID} />
        ) : (
          <OrderCoverageBadge coverage={coverage} />
        );
      },
    },
    {
      id: RESPONSIBLES_COLUMN_ID,
      label: 'Responsables',
      align: 'start',
      // QC-102 R16: columna PROPIA. **Sin `sortable`**: el orden de la lista lo manda `pedidos`
      // (QC-57) y responsables es un dato de otro modulo que ni siquiera viaja en la fila, asi
      // que una cabecera que ordenara aqui mentiria. **Sin `filter`**: no aparece en la barra de
      // filtros por el mismo motivo. `pinnable` por defecto, como las demas columnas de datos.
      cell: (order) => (
        <OrderRowResponsibles
          order={order}
          recipes={recipes}
          units={units}
          // R20: si el lote fallo, esta clave no existe y la celda pinta el marcador de ausencia.
          responsibles={responsiblesByOrder[order.id] ?? []}
          responsiblesCatalog={responsiblesCatalog}
          // El panel es el mismo, se abra por donde se abra.
          coverage={coverageByOrder[order.id]}
        />
      ),
    },
    {
      id: ACTIONS_COLUMN_ID,
      label: 'Acciones',
      align: 'end',
      // Sin `sortable` (no ordena) y sin `filter` (no aparece en la barra de filtros).
      // `pinnable: false` para que el usuario no pueda fijarla y tapar la del correlativo.
      pinnable: false,
      cell: (order) => (
        <OrderRowSheetActions
          order={order}
          recipes={recipes}
          units={units}
          // QC-102 R24, R26: la entrada «Responsables» abre el panel con lo que el lote YA trajo
          // para esta fila. Sin esto, el panel abriria vacio y tendria que consultar.
          responsibles={responsiblesByOrder[order.id] ?? []}
          responsiblesCatalog={responsiblesCatalog}
          // La hoja pinta la cobertura de ESTA fila, ya traida por el lote.
          coverage={coverageByOrder[order.id]}
        />
      ),
    },
  ];
}
