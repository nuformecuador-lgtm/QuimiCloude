'use client';

import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { CatalogLineView } from '@/lib/modules/proveedores';

import { CATALOG_DEFAULT_PINNED_COLUMNS, buildCatalogColumns } from './catalog-columns';
import type { CatalogDirectories } from './catalog-directories';
import { catalogListHref } from './catalog-list-params';

/**
 * Tabla del catalogo de un proveedor (R12, R13, R21, R22, R30, R41, R48; `design.md > 6`).
 *
 * **MIGRADA A LA TABLA COMPARTIDA el 2026-09-07 (decision humana).** Antes esta ruta declaraba su
 * propia tabla con `components/ui/table.tsx` y su propia barra de paginacion
 * (`catalog-list-toolbar.tsx`, que DESAPARECE). Ahora monta `components/shared/data-table`, la
 * misma que ya usan inventario, pedidos y recetas.
 *
 * **Ahora es `'use client'`**, y antes no: la tabla compartida es interactiva -emite
 * `onParamsChange`-. El Server Component sigue siendo `CatalogListSection`, que es quien pide los
 * datos y quien construye los diccionarios UNA vez (R22, R46); aqui solo llegan filas ya
 * resueltas, los diccionarios y los parametros con los que se pidieron.
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion con la cadena de consulta canonica. Esta pantalla **no ordena,
 * no filtra y no busca en el cliente**: la lista vuelve a pedirse sobre el conjunto entero. El
 * destino sale de `catalogListHref`, que deriva de `supplierDetailRoute`: ningun archivo de la
 * ruta escribe la URL como literal.
 *
 * **`searchable` se queda en su defecto (`true`)**: `SUPPLIER_CATALOG_LINE_QUERYABLE.searchable`
 * es `true` y `listCatalogLines` resuelve la busqueda, asi que la caja no miente.
 *
 * **`status` es SIEMPRE `'idle'`**: los tres estados de R23/R24/R25 se pintan FUERA de
 * `<DataTable>` -cada uno con su copy y sus acciones- y el «cargando» lo aporta el `<Suspense>`
 * de la pagina con `CatalogTableSkeleton`.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R13): `components/ui/table.tsx`, que
 * la tabla compartida usa por dentro, envuelve la tabla en un contenedor con `overflow-x-auto`.
 * No se edita el primitivo (R44) ni se anade columna pegajosa a mano: el fijado lo ofrece la
 * tabla compartida.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const CATALOG_TABLE_ID = 'proveedor-catalogo';

/**
 * Textos del componente compartido. Viven aqui -y no en el componente- porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R47): los
 * controles se localizan por rol o por `data-testid`.
 */
export const CATALOG_TABLE_TEXTS: DataTableTexts = {
  empty: 'Este proveedor no tiene líneas de catálogo.',
  loading: 'Cargando el catálogo…',
  error: 'No se pudo cargar el catálogo del proveedor.',
  search: 'Buscar en el catálogo',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Líneas por página',
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

export type CatalogTableProps = {
  readonly lines: readonly CatalogLineView[];
  readonly directories: CatalogDirectories;
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Proveedor al que pertenece el catalogo: de el sale el destino de cada navegacion. */
  readonly supplierId: string;
  /**
   * Acciones de la fila (editar, dar de baja). Sigue siendo un **slot** (R26, R36): la tabla no
   * importa el panel lateral ni el dialogo -los enchufa `CatalogListSection`- y por eso no conoce
   * su API. Las acciones estan SIEMPRE visibles: nada detras de `:hover` (R48).
   */
  readonly rowActions: (line: CatalogLineView) => ReactNode;
};

export function CatalogTable({
  lines,
  directories,
  params,
  totalPages,
  supplierId,
  rowActions,
}: CatalogTableProps) {
  const router = useRouter();

  const columns = useMemo(
    () => buildCatalogColumns({ directories, rowActions }),
    [directories, rowActions],
  );

  return (
    <DataTable
      tableId={CATALOG_TABLE_ID}
      columns={columns}
      rows={lines}
      getRowId={(line) => line.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(catalogListHref(supplierId, next))}
      status="idle"
      texts={CATALOG_TABLE_TEXTS}
      defaultPinnedColumns={CATALOG_DEFAULT_PINNED_COLUMNS}
    />
  );
}
