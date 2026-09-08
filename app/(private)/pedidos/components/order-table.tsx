'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { DataTable, type DataTableParams, type DataTableTexts } from '@/components/shared/data-table';
import type { OrderSummary } from '@/lib/modules/pedidos';

import { ORDER_DEFAULT_PINNED_COLUMNS, buildOrderColumns } from './order-columns';
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
 * **`searchable={false}`** (R20, `design.md > 6.2`): la caja de busqueda **no se monta** —no se
 * pinta inerte ni deshabilitada: no existe en el DOM—. `ORDER_QUERYABLE.searchable` es `false`,
 * asi que una caja aqui mentiria: el termino se omitiria en silencio y la lista devolveria todo
 * como si no se hubiera buscado. `texts.search` se entrega igual porque el contrato de textos lo
 * exige obligatorio y esta ficha no lo toca.
 *
 * **`status` es SIEMPRE `'idle'`** (alternativa Q, descartada): los tres estados de R21 se pintan
 * fuera de `<DataTable>`, con copy y acciones propias, y el «cargando» lo aporta el `<Suspense>`
 * del servidor. Aqui solo llegan filas ya resueltas.
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
  // Obligatorio en el contrato de textos; con `searchable={false}` no se pinta en ningun sitio.
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
};

export function OrderTable({ orders, params, totalPages, recipes }: OrderTableProps) {
  const router = useRouter();
  // Las columnas se construyen con sus dependencias (`buildOrderColumns`). `useMemo` para que la
  // identidad del array no cambie en cada render y la tabla compartida no se reconstruya entera.
  const columns = useMemo(() => buildOrderColumns({ recipes }), [recipes]);

  return (
    <DataTable
      tableId={ORDER_TABLE_ID}
      columns={columns}
      rows={orders}
      getRowId={(order) => order.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(orderListHref(next))}
      status="idle"
      texts={ORDER_TABLE_TEXTS}
      searchable={false}
      defaultPinnedColumns={ORDER_DEFAULT_PINNED_COLUMNS}
    />
  );
}
