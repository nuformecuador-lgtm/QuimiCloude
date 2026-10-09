'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { UnitView } from '@/lib/modules/unidades';

import { UNIT_COLUMN_COUNT, createUnitColumns, type UnitBaseIndex } from './unit-columns';
import { unitListHref } from './unit-list-params';

/**
 * La tabla de la lista de unidades (R15, R18, R19, R20, R21, R22, R27; `design.md > 5.3` y `> 9`).
 *
 * **Usa la tabla de datos compartida de QC-55**, importada por su barrel publico (alternativa A de
 * QC-45, descartada): no se declara una tabla propia, ni una barra de paginacion propia, ni se
 * copia el esqueleto de ninguna otra pantalla, y **no se abre un solo archivo** de
 * `components/shared/data-table/` (R31).
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica. El Server
 * Component de la seccion vuelve a pedir la lista **sobre el conjunto entero** (R18). Esta
 * pantalla **no ordena, no filtra y no recorta nada en el cliente** (R18, R19): la tabla pinta las
 * filas tal cual llegan.
 *
 * **El destino sale de `unitListHref`** (R8): ningun archivo de la ruta escribe la URL como
 * literal.
 *
 * **`searchable` AUSENTE (= `true`)**, porque `UNIT_QUERYABLE.searchable` es `true`; y el texto de
 * la caja de busqueda dice **por nombre**, porque el adaptador compara contra `nameNormalized` y
 * nada mas (R18): una caja que insinuara «nombre o simbolo» mentiria.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R27): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que con cuatro columnas —y la de
 * equivalencia, que es la que mas ancho pide— el documento no se desplaza y las acciones de fila
 * siguen alcanzables con el scroll de la propia tabla.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const UNIT_TABLE_ID = 'unidades';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R49): los
 * controles se localizan por rol o por `data-testid`.
 */
export const UNIT_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay unidades que mostrar.',
  loading: 'Cargando unidades…',
  error: 'No se pudo cargar la lista de unidades.',
  // R18: se busca SOLO por nombre, que es contra lo unico que compara el adaptador.
  search: 'Buscar unidades por nombre',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Unidades por página',
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

export const UNIT_LIST_SKELETON_TESTID = 'unit-list-skeleton';
export const UNIT_ROW_SKELETON_TESTID = 'unit-row-skeleton';
export const UNIT_SKELETON_COLUMN_COUNT = UNIT_COLUMN_COUNT;

export const UNIT_LIST_EMPTY_TESTID = 'unit-list-empty';
export const UNIT_LIST_EMPTY_MESSAGE_TESTID = 'unit-list-empty-message';
export const UNIT_LIST_CLEAR_SEARCH_TESTID = 'unit-list-clear-search';
export const UNIT_LIST_FIRST_PAGE_TESTID = 'unit-list-first-page';

export const UNIT_LIST_ERROR_TESTID = 'unit-list-error';
export const UNIT_LIST_ERROR_MESSAGE_TESTID = 'unit-list-error-message';
export const UNIT_LIST_ERROR_CODE_TESTID = 'unit-list-error-code';
export const UNIT_LIST_RETRY_TESTID = 'unit-list-retry';

type UnitTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

/**
 * El vacio de unidades no ofrece «crear la primera»: las unidades de sistema estan siempre en el
 * ambito, asi que una lista vacia solo puede venir del termino o de la pagina pedidos.
 */
export type UnitTableEmpty = {
  /** Solo si habia termino de busqueda. */
  readonly clearSearchHref?: string;
  /** Solo si la pagina pedida era mayor que el total. */
  readonly firstPageHref?: string;
};

export type UnitTableProps = UnitTableStatusProps & {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R18, R19). */
  readonly units: readonly UnitView[];
  /**
   * Indice `id -> unidad` con el que la columna de equivalencia resuelve la unidad de la que
   * deriva cada fila (R17). Vacio si la segunda lectura fallo: entonces cada equivalencia derivada
   * cae al marcador neutro y la lista se pinta igual (`design.md > 5.3`).
   */
  readonly baseIndex: UnitBaseIndex;
  /** Unidades BASE del ambito, para el selector de «deriva de» del panel de edicion (R36). */
  readonly baseUnits: readonly UnitView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Presente solo con cero filas: el vacio sustituye a toda la tabla. */
  readonly empty?: UnitTableEmpty;
};

function buildStates(
  params: DataTableParams,
  error: ErrorState | undefined,
  empty: UnitTableEmpty | undefined,
): DataTableStates {
  return {
    loading: {
      columns: UNIT_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: UNIT_TABLE_TEXTS.loading,
      testId: UNIT_LIST_SKELETON_TESTID,
      rowTestId: UNIT_ROW_SKELETON_TESTID,
      headCellClassName: 'h-4 w-full',
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            error,
            title: UNIT_TABLE_TEXTS.error,
            testId: UNIT_LIST_ERROR_TESTID,
            messageTestId: UNIT_LIST_ERROR_MESSAGE_TESTID,
            codeTestId: UNIT_LIST_ERROR_CODE_TESTID,
            retry: { kind: 'refresh' },
            retryTestId: UNIT_LIST_RETRY_TESTID,
          },
        }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: UNIT_LIST_EMPTY_TESTID,
            messageTestId: UNIT_LIST_EMPTY_MESSAGE_TESTID,
            message:
              empty.clearSearchHref === undefined
                ? 'No hay unidades que coincidan con lo que se está pidiendo.'
                : 'La búsqueda no encontró ninguna unidad.',
            ...(empty.clearSearchHref === undefined
              ? {}
              : {
                  clearSearch: {
                    href: empty.clearSearchHref,
                    label: 'Limpiar la búsqueda',
                    testId: UNIT_LIST_CLEAR_SEARCH_TESTID,
                  },
                }),
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: UNIT_LIST_FIRST_PAGE_TESTID,
                  },
                }),
          },
        }),
  };
}

export function UnitTable({
  units,
  baseIndex,
  baseUnits,
  params,
  totalPages,
  status = 'idle',
  error,
  empty,
}: UnitTableProps) {
  const router = useRouter();
  // Las columnas se rearman solo cuando cambian los datos que resuelven sus celdas.
  const columns = useMemo(() => createUnitColumns(baseIndex, baseUnits), [baseIndex, baseUnits]);

  return (
    <DataTable
      tableId={UNIT_TABLE_ID}
      columns={columns}
      rows={units}
      getRowId={(unit) => unit.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(unitListHref(next))}
      status={status}
      states={buildStates(params, error, empty)}
      texts={UNIT_TABLE_TEXTS}
    />
  );
}
