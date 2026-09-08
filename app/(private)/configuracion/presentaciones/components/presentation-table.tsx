'use client';

import { useRouter } from 'next/navigation';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { PresentationView } from '@/lib/modules/inventario';

import { PRESENTATION_COLUMNS } from './presentation-columns';
import { presentationListHref } from './presentation-list-params';

/**
 * La tabla de la lista de presentaciones (R8, R10, R11, R12, R13, R18, `design.md > 5.3` y `> 6`).
 *
 * **Usa la tabla de datos compartida de QC-55**, importada por su barrel publico (alternativa A,
 * descartada): no se declara una tabla propia, ni una barra de paginacion propia, ni se copia el
 * esqueleto de ninguna otra pantalla.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica. El Server
 * Component de la seccion vuelve a pedir la lista **sobre el conjunto entero** (R10). Esta
 * pantalla **no ordena, no filtra y no recorta nada en el cliente** (R10, R11): la tabla
 * compartida pinta las filas tal cual llegan.
 *
 * **El destino sale de `presentationListHref`** (R2): ningun archivo de la ruta escribe la URL
 * como literal.
 *
 * **`searchable` AUSENTE (= `true`)**, al reves que pedidos (`design.md > 6`): aqui la lista
 * blanca del contrato dice `PRESENTATION_QUERYABLE.searchable === true`, asi que la caja de
 * busqueda **no miente** —el termino viaja a la consulta y la lista se recalcula entera (R10)—.
 *
 * **`status` es SIEMPRE `'idle'`**: los tres estados de R15/R16/R17 se pintan fuera de
 * `<DataTable>`, con copy y acciones propias, y el «cargando» lo aporta el `<Suspense>` del
 * servidor. Aqui solo llegan filas ya resueltas.
 *
 * **Sin `defaultPinnedColumns`**: con dos columnas no hay nada que fijar por defecto. La de
 * acciones ademas declara `pinnable: false` y no puede tapar a la del nombre.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R18): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que el documento no se desplaza y
 * las acciones de fila siguen alcanzables con el scroll de la propia tabla.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const PRESENTATION_TABLE_ID = 'presentaciones';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R35): los
 * controles se localizan por rol o por `data-testid`.
 */
export const PRESENTATION_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay presentaciones que mostrar.',
  loading: 'Cargando presentaciones…',
  error: 'No se pudo cargar la lista de presentaciones.',
  search: 'Buscar presentaciones',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Presentaciones por página',
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

export type PresentationTableProps = {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R10, R11). */
  readonly presentations: readonly PresentationView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
};

export function PresentationTable({ presentations, params, totalPages }: PresentationTableProps) {
  const router = useRouter();

  return (
    <DataTable
      tableId={PRESENTATION_TABLE_ID}
      columns={PRESENTATION_COLUMNS}
      rows={presentations}
      getRowId={(presentation) => presentation.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(presentationListHref(next))}
      status="idle"
      texts={PRESENTATION_TABLE_TEXTS}
    />
  );
}
