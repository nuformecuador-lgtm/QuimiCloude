'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { OrderResponsible } from '@/lib/modules/asignaciones';
import type { OrderSummary } from '@/lib/modules/pedidos';
import type { UnitView } from '@/lib/modules/unidades';
// Solo el TIPO, del contrato publico de `inventario`: la arista `pedidos -> inventario` ya
// existe (`design.md > 5.1`).
import type { OrderCoverage } from '@/lib/modules/inventario';

import { ORDER_DEFAULT_PINNED_COLUMNS, buildOrderColumns } from './order-columns';
import type { OrderResponsiblesCatalog } from './order-responsibles';
import { orderListHref } from './order-list-params';
import type { RecipePickerPage } from './recipe-picker';

/**
 * La tabla de la lista de pedidos (R7, R13, R14, R15, R17, R19, R20, R22, `design.md > 5, 7`).
 *
 * **Estrena la tabla de datos compartida de QC-55**, importada por su barrel publico
 * (alternativa A, descartada): no se declara una tabla propia ni se copia el esqueleto de
 * ninguna otra pantalla.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo
 * y aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica. El
 * Server Component de la seccion vuelve a pedir la lista **sobre el conjunto entero** (R15). Esta
 * pantalla **no ordena, no filtra y no recorta nada en el cliente** (R13, alternativas D y G,
 * descartadas): la tabla compartida ni siquiera registra esas capacidades de la libreria, asi que
 * pinta las filas tal cual llegan.
 *
 * **El destino sale de `orderListHref`** (R2): ningun archivo de la ruta escribe la URL como
 * literal.
 *
 * **`searchable={false}`**: la caja de busqueda **no se monta** —no se pinta inerte ni
 * deshabilitada: no existe en el DOM—. Esta pantalla todavia no tiene caja de busqueda propia.
 * `texts.search` se entrega igual porque el contrato de textos lo exige obligatorio.
 *
 * **`status` es SIEMPRE `'idle'`** (alternativa Q, descartada): el error y la lista vacia se
 * pintan fuera de `<DataTable>`, con copy y acciones propias. El «cargando» de R21 ya no viene de
 * remontar la pantalla -la `key` del `<Suspense>` desaparecio el 2026-09-07 porque borraba el
 * foco del campo que se estaba escribiendo-: la navegacion va en una transicion y, mientras esta
 * en vuelo, esta pantalla lo anuncia y atenua la tabla sin desmontarla. El `fallback` del
 * `<Suspense>` sigue cubriendo la primera carga.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R22): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que el documento no se desplaza y
 * las acciones de fila siguen alcanzables con el scroll de la propia tabla.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const ORDER_TABLE_ID = 'pedidos';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R44): los
 * controles se localizan por rol o por `data-testid`.
 */
export const ORDER_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay pedidos que mostrar.',
  loading: 'Cargando pedidos…',
  error: 'No se pudo cargar la lista de pedidos.',
  // Obligatorio en el contrato de textos; sin caja de busqueda montada no se pinta en ningun sitio.
  search: 'Buscar',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Pedidos por página',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  pinColumn: 'Fijar columna',
  unpinColumn: 'Soltar columna',
  filterColumn: 'Filtrar columna',
  clearFilter: 'Limpiar filtro',
  lastWeek: 'Última semana',
  lastMonth: 'Último mes',
  lastYear: 'Último año',
};

export type OrderTableProps = {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R13). */
  readonly orders: readonly OrderSummary[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /**
   * Primera pagina del catalogo de recetas y unidades existentes. **Atraviesan la tabla** hasta
   * la celda de acciones, que es donde se monta el panel de edicion (R25) y donde se necesitan.
   * Los pide una sola vez el Server Component de la seccion y bajan por props (R43).
   */
  readonly recipes: RecipePickerPage;
  readonly units: readonly UnitView[];
  /**
   * QC-102 R16 — los responsables de la pagina, **ya repartidos por fila en el SERVIDOR**: un
   * `Record` plano y serializable. La tabla solo lo atraviesa hasta la celda; aqui no se agrupa,
   * no se ordena y no se pide nada.
   */
  readonly responsiblesByOrder?: Readonly<Record<string, readonly OrderResponsible[]>>;
  /** QC-102 R27, R28 — catalogos y `canWrite` del panel, tambien de paso. */
  readonly responsiblesCatalog?: OrderResponsiblesCatalog;
  /**
   * QC-141 T14, R35 — la cobertura de la pagina, **ya repartida por fila en el SERVIDOR**: mismo
   * patron que `responsiblesByOrder`. La tabla solo lo atraviesa hasta la celda.
   */
  readonly coverageByOrder?: Readonly<Record<string, OrderCoverage>>;
};

export function OrderTable({
  orders,
  params,
  totalPages,
  recipes,
  units,
  responsiblesByOrder,
  responsiblesCatalog,
  coverageByOrder,
}: OrderTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Las columnas se construyen con sus dependencias (`buildOrderColumns`). `useMemo` para que la
  // identidad del array no cambie en cada render y la tabla compartida no se reconstruya entera.
  const columns = useMemo(
    () =>
      buildOrderColumns({ recipes, units, responsiblesByOrder, responsiblesCatalog, coverageByOrder }),
    [recipes, units, responsiblesByOrder, responsiblesCatalog, coverageByOrder],
  );

  /*
    La navegacion va DENTRO de una transicion (`startTransition`), y su `isPending` es la senal de
    «algo esta en vuelo» mientras el servidor recalcula la lista (2026-09-07).

    Esa senal NO desmonta nada: antes la daba la `key` del `<Suspense>` de la pagina, que
    remontaba el subarbol entero en cada cambio de consulta y con el borraba el foco del campo que
    se estaba escribiendo -escribir en la busqueda o en un filtro de texto perdia el cursor en
    cuanto salia la peticion-. Tampoco se pasa `status="loading"` a la tabla compartida por lo
    mismo: ese estado sustituye cabecera y filas por el esqueleto, y el foco se iria igual. Se
    anuncia con `aria-busy` y un rotulo visible, atenuando la tabla, que sigue montada y sigue
    aceptando teclas.
  */
  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div
      data-testid="order-table"
      aria-busy={isPending}
      className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}
    >
      {/*
        La senal de «en vuelo»: un rotulo visible con el texto de `ORDER_TABLE_TEXTS.loading` y la
        tabla atenuada. Para la tecnologia de asistencia la lleva `aria-busy` en el
        contenedor -no una segunda region viva: la zona privada tiene EXACTAMENTE una, la de
        avisos que monta el layout privado, y varios tests lo afirman-. La tabla NO se desmonta ni
        se bloquea: se puede seguir escribiendo en la barra de filtros mientras se recalcula.
      */}
      {isPending ? (
        <p className="text-xs text-muted-foreground">{ORDER_TABLE_TEXTS.loading}</p>
      ) : null}
      <DataTable
        tableId={ORDER_TABLE_ID}
        columns={columns}
        rows={orders}
        getRowId={(order) => order.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => navigate(orderListHref(next))}
        status="idle"
        texts={ORDER_TABLE_TEXTS}
        searchable={false}
        defaultPinnedColumns={ORDER_DEFAULT_PINNED_COLUMNS}
      />
    </div>
  );
}
