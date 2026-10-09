'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { ErrorStateProps } from '@/components/shared/error-state';
import type { ErrorState } from '@/lib/modules/errores';
import type { PresentationView } from '@/lib/modules/inventario';
import type { UnitRef } from '@/lib/modules/unidades';

import { buildPresentationColumns } from './presentation-columns';
import { presentationListHref } from './presentation-list-params';
import { PresentationSheet } from './presentation-sheet';

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
 * **Cargando, error y vacio los pinta `<DataTable>` en lugar de toda la tabla.**
 *
 * **QC-80 (R16): `units` solo ATRAVIESA la tabla.** No se pinta ninguna columna de unidad
 * (`design.md > 5`); el catalogo baja hasta la celda de acciones, que es quien monta el panel de
 * edicion. Las columnas se memoizan por `units` -mismo mecanismo que `OrderTable` de QC-35- para
 * no reconstruir la declaracion en cada render y perder el estado interno de `<DataTable>`.
 *
  * **Sin `defaultPinned` en ninguna columna**: con dos columnas no hay nada que fijar por
  * defecto. La de acciones ademas declara `pinnable: false` y no puede tapar a la del nombre.
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

export const PRESENTATION_LIST_EMPTY_TESTID = 'presentation-list-empty';
export const PRESENTATION_LIST_EMPTY_MESSAGE_TESTID = 'presentation-list-empty-message';
export const PRESENTATION_LIST_FIRST_PAGE_TESTID = 'presentation-list-first-page';
export const PRESENTATION_LIST_ERROR_TESTID = 'presentation-list-error';
export const PRESENTATION_LIST_ERROR_MESSAGE_TESTID = 'presentation-list-error-message';
export const PRESENTATION_LIST_ERROR_CODE_TESTID = 'presentation-list-error-code';
export const PRESENTATION_LIST_RETRY_TESTID = 'presentation-list-retry';
export const PRESENTATION_LIST_SKELETON_TESTID = 'presentation-list-skeleton';
export const PRESENTATION_ROW_SKELETON_TESTID = 'presentation-row-skeleton';

/** Un test ata esta cuenta al largo de las columnas de la lista. */
export const PRESENTATION_SKELETON_COLUMN_COUNT = 3;

function buildErrorState(error: ErrorState): ErrorStateProps {
  return {
    error,
    title: PRESENTATION_TABLE_TEXTS.error,
    testId: PRESENTATION_LIST_ERROR_TESTID,
    messageTestId: PRESENTATION_LIST_ERROR_MESSAGE_TESTID,
    codeTestId: PRESENTATION_LIST_ERROR_CODE_TESTID,
    retry: { kind: 'refresh' },
    retryTestId: PRESENTATION_LIST_RETRY_TESTID,
  };
}

type PresentationTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

export type PresentationTableEmpty = {
  /** Solo cuando la pagina pedida se quedo sin elementos por ser mayor que el total. */
  readonly firstPageHref?: string;
};

export type PresentationTableProps = PresentationTableStatusProps & {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R10, R11). */
  readonly presentations: readonly PresentationView[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /** Catalogo entero de unidades (QC-80 R16). Solo lo consume el panel de edicion de la fila. */
  readonly units: readonly UnitRef[];
  /** Presente solo con cero filas: el vacio sustituye a toda la tabla. */
  readonly empty?: PresentationTableEmpty;
};

function buildStates(
  params: DataTableParams,
  units: readonly UnitRef[],
  error: ErrorState | undefined,
  empty: PresentationTableEmpty | undefined,
): DataTableStates {
  return {
    loading: {
      columns: PRESENTATION_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: PRESENTATION_TABLE_TEXTS.loading,
      testId: PRESENTATION_LIST_SKELETON_TESTID,
      rowTestId: PRESENTATION_ROW_SKELETON_TESTID,
      headCellClassName: 'h-4 w-full',
    },
    ...(error === undefined ? {} : { error: buildErrorState(error) }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: PRESENTATION_LIST_EMPTY_TESTID,
            messageTestId: PRESENTATION_LIST_EMPTY_MESSAGE_TESTID,
            message:
              empty.firstPageHref === undefined
                ? 'Todavía no hay presentaciones registradas.'
                : 'Esta página ya no tiene presentaciones.',
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: PRESENTATION_LIST_FIRST_PAGE_TESTID,
                  },
                }),
            children: <PresentationSheet units={units} />,
          },
        }),
  };
}

export function PresentationTable({
  presentations,
  params,
  totalPages,
  units,
  status = 'idle',
  error,
  empty,
}: PresentationTableProps) {
  const router = useRouter();
  const columns = useMemo(() => buildPresentationColumns(units), [units]);

  return (
    <DataTable
      tableId={PRESENTATION_TABLE_ID}
      columns={columns}
      rows={presentations}
      getRowId={(presentation) => presentation.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(presentationListHref(next))}
      status={status}
      states={buildStates(params, units, error, empty)}
      texts={PRESENTATION_TABLE_TEXTS}
    />
  );
}
