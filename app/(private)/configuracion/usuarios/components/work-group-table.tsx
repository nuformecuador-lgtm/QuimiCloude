'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableStates,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { ErrorState } from '@/lib/modules/errores';
import type { WorkGroupRow } from '@/lib/modules/identity';

import { DeleteWorkGroupDialog } from './delete-work-group-dialog';
import { WORK_GROUP_COLUMN_COUNT, createWorkGroupColumns } from './work-group-columns';
import { workGroupListHref } from './work-group-list-params';
import { WorkGroupSheet } from './work-group-sheet';

/**
 * La tabla de la lista de grupos de trabajo (R9, R10, R12, R13, R14, R15, R40;
 * `design.md > 4`).
 *
 * **Usa la tabla de datos compartida de QC-55, importada por su barrel publico**: no se declara una
 * tabla propia, ni una barra de paginacion propia, ni se copia el esqueleto de ninguna otra
 * pantalla, y **no se abre un solo archivo** de `components/shared/data-table/` (R12).
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica —que
 * **conserva `tab=grupos`** (R3, R7)—. El Server Component de la seccion vuelve a pedir la lista
 * **sobre el conjunto entero**. Esta pantalla **no busca, no ordena y no recorta nada en el
 * cliente** (R14, R15): la tabla pinta las filas tal cual llegan, y cambiar termino, orden, tamano
 * o pagina **navega**.
 *
 * **El destino sale de `workGroupListHref`** (R3): ningun archivo de la ruta escribe la URL como
 * literal.
 *
 * **`searchable` AUSENTE (= `true`)**, porque `WORK_GROUP_QUERYABLE.searchable` es `true`. Que
 * columna toca la busqueda —el nombre— lo decide el adaptador driven, el unico que conoce la base;
 * esta pantalla no lo reproduce.
 *
 * **El selector de tamano y la paginacion son los del componente compartido** (R13): 10 y 25 salen
 * de `PAGE_SIZE_OPTIONS`, el defecto es 10, y la pagina actual y el total los pinta su indicador.
 *
 * **Cargando, error y vacio los pinta `<DataTable>` en lugar de toda la tabla**, y en esos
 * estados no se pinta el envoltorio de aqui. El vacio sustituye a la tabla tambien con busqueda:
 * es el propio de la pantalla, con su «Limpiar la búsqueda».
 *
 * **El desbordamiento lo absorbe el primitivo** (R40): `components/ui/table.tsx` ya envuelve la
 * tabla en un contenedor con `overflow-x-auto`, asi que el documento no se desplaza en horizontal y
 * las acciones de fila siguen alcanzables con el scroll de la propia tabla. Ninguna excepcion de
 * escritorio.
 *
 * **Es la DUENA DEL ESTADO de las escrituras** (`design.md > 5` y `> 6`): monta **una** instancia
 * del panel lateral y **una** del dialogo de borrado para toda la pagina —no una por fila— y
 * reparte los dos disparadores a `createWorkGroupColumns`. Cada uno se monta **solo mientras esta
 * abierto**, asi que cada apertura arranca limpia y un rechazo anterior no reaparece.
 *
 * **El ALTA no esta aqui**: la monta `work-group-create-action.tsx`, hermana de esta tabla, porque
 * con cero filas esta tabla solo pinta el vacio y los grupos **nacen en cero**: no los siembra
 * nadie.
 *
 * **R9, mitad cliente**: sin `usuarios.modificar` no se emite NINGUNA escritura —ni las acciones de
 * fila, ni el panel, ni el dialogo—. Ocultarlas es comodidad de la
 * interfaz y **no es el control**: quien autoriza es el caso de uso del modulo.
 *
 * **Todo llega por props** (R10): las filas, los parametros y la decision de R9. Aqui no se importa
 * `lib/composition`, ni el cliente de base de datos, ni se lee la sesion, y no se llama a ninguna
 * Server Action: la lista la pidio el servidor.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla de grupos, un solo id. */
export const WORK_GROUP_TABLE_ID = 'grupos-de-trabajo';

/** `data-testid` del envoltorio de la tabla, para que ningun test dependa del copy (R41). */
export const WORK_GROUP_TABLE_TESTID = 'work-group-table';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R41): los controles
 * se localizan por rol o por `data-testid`.
 */
export const WORK_GROUP_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay grupos de trabajo que mostrar.',
  loading: 'Cargando grupos de trabajo…',
  error: 'No se pudo cargar la lista de grupos de trabajo.',
  search: 'Buscar grupos por nombre',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Grupos por página',
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

export const WORK_GROUP_LIST_SKELETON_TESTID = 'work-group-list-skeleton';
export const WORK_GROUP_ROW_SKELETON_TESTID = 'work-group-row-skeleton';
/** Una celda por columna: un test lo ata al largo de `createWorkGroupColumns(...)`. */
export const WORK_GROUP_SKELETON_COLUMN_COUNT = WORK_GROUP_COLUMN_COUNT;

export const WORK_GROUP_LIST_EMPTY_TESTID = 'work-group-list-empty';
export const WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID = 'work-group-list-empty-message';
export const WORK_GROUP_LIST_CLEAR_SEARCH_TESTID = 'work-group-list-clear-search';
export const WORK_GROUP_LIST_FIRST_PAGE_TESTID = 'work-group-list-first-page';

export const WORK_GROUP_LIST_ERROR_TESTID = 'work-group-list-error';
export const WORK_GROUP_LIST_ERROR_MESSAGE_TESTID = 'work-group-list-error-message';
export const WORK_GROUP_LIST_ERROR_CODE_TESTID = 'work-group-list-error-code';
export const WORK_GROUP_LIST_RETRY_TESTID = 'work-group-list-retry';

/**
 * Que escritura hay abierta. **Una sola por vez**, que es lo que permite montar una instancia de
 * cada pieza para toda la pagina en vez de una por fila.
 *
 * **Los dos modos actuan SOBRE una fila**, y por eso `group` no es opcional. El alta no esta aqui:
 * vive en `work-group-create-action.tsx`, fuera de la tabla, porque los grupos no los siembra nadie
 * y con cero filas esta tabla solo pinta el vacio.
 */
export type WorkGroupPanelMode = 'edit' | 'delete';

/** La escritura abierta y sobre quien. Siempre hay sujeto: los dos modos salen de una fila. */
export type WorkGroupPanel = {
  readonly mode: WorkGroupPanelMode;
  readonly group: WorkGroupRow;
};

type WorkGroupTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

/** El vacio de grupos no ofrece «crear el primero»: el alta vive arriba, fuera de los estados. */
export type WorkGroupTableEmpty = {
  /** Solo si habia termino de busqueda. */
  readonly clearSearchHref?: string;
  /** Solo si la pagina pedida era mayor que el total. */
  readonly firstPageHref?: string;
};

export type WorkGroupTableProps = WorkGroupTableStatusProps & {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R14, R15). */
  readonly groups: readonly WorkGroupRow[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /**
   * Si la sesion trae `usuarios.modificar` (R9). **Decision de PRESENTACION**, resuelta en el
   * servidor y bajada por props (R10). No es autorizacion.
   */
  readonly canModify: boolean;
  /** Presente solo con cero filas: el vacio sustituye a toda la tabla. */
  readonly empty?: WorkGroupTableEmpty;
};

function buildStates(
  params: DataTableParams,
  error: ErrorState | undefined,
  empty: WorkGroupTableEmpty | undefined,
): DataTableStates {
  return {
    loading: {
      columns: WORK_GROUP_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: WORK_GROUP_TABLE_TEXTS.loading,
      testId: WORK_GROUP_LIST_SKELETON_TESTID,
      rowTestId: WORK_GROUP_ROW_SKELETON_TESTID,
      headCellClassName: 'h-4 w-full',
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            error,
            title: WORK_GROUP_TABLE_TEXTS.error,
            testId: WORK_GROUP_LIST_ERROR_TESTID,
            messageTestId: WORK_GROUP_LIST_ERROR_MESSAGE_TESTID,
            codeTestId: WORK_GROUP_LIST_ERROR_CODE_TESTID,
            retry: { kind: 'refresh' },
            retryTestId: WORK_GROUP_LIST_RETRY_TESTID,
          },
        }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: WORK_GROUP_LIST_EMPTY_TESTID,
            messageTestId: WORK_GROUP_LIST_EMPTY_MESSAGE_TESTID,
            message:
              empty.clearSearchHref === undefined
                ? 'No hay grupos de trabajo que mostrar.'
                : 'La búsqueda no encontró ningún grupo de trabajo.',
            ...(empty.clearSearchHref === undefined
              ? {}
              : {
                  clearSearch: {
                    href: empty.clearSearchHref,
                    label: 'Limpiar la búsqueda',
                    testId: WORK_GROUP_LIST_CLEAR_SEARCH_TESTID,
                  },
                }),
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: WORK_GROUP_LIST_FIRST_PAGE_TESTID,
                  },
                }),
          },
        }),
  };
}

export function WorkGroupTable({
  groups,
  params,
  totalPages,
  canModify,
  status = 'idle',
  error,
  empty,
}: WorkGroupTableProps) {
  const router = useRouter();

  /**
   * El estado de las escrituras, que **vive aqui y en ningun otro sitio**: una instancia de cada
   * pieza para toda la pagina. La tanda 2 lee `panel` para decidir cual esta abierta y sobre quien,
   * y llama a `closePanel(false)` al cerrar.
   */
  const [panel, setPanel] = useState<WorkGroupPanel | null>(null);

  /** Cerrar es siempre lo mismo: soltar el estado. Estable, para no rearmar las piezas. */
  const closePanel = useCallback((next: boolean) => {
    if (!next) setPanel(null);
  }, []);

  // Las columnas se rearman solo cuando cambia la decision de R9: los dos disparadores son
  // estables porque `setPanel` lo es.
  const columns = useMemo(
    () =>
      createWorkGroupColumns({
        canModify,
        onEdit: (group) => setPanel({ mode: 'edit', group }),
        onDelete: (group) => setPanel({ mode: 'delete', group }),
      }),
    [canModify],
  );

  // Se estrecha AQUI, no en el JSX: asi el compilador sabe que `panel` no es nulo al usarlo.
  const editGroup = panel !== null && panel.mode === 'edit' ? panel.group : null;
  const deleteGroup = panel !== null && panel.mode === 'delete' ? panel.group : null;

  const table = (
    <DataTable
      tableId={WORK_GROUP_TABLE_ID}
      columns={columns}
      rows={groups}
      getRowId={(group) => group.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(workGroupListHref(next))}
      status={status}
      states={buildStates(params, error, empty)}
      texts={WORK_GROUP_TABLE_TEXTS}
    />
  );

  if (status !== 'idle' || (groups.length === 0 && empty !== undefined)) return table;

  return (
    <div className="flex flex-col gap-4" data-testid={WORK_GROUP_TABLE_TESTID}>
      {table}

      {/*
        UNA instancia del panel lateral de EDICION para toda la pagina, y solo mientras esta
        abierto: asi llega precargada con el nombre de la fila en cada apertura (R20). El
        contenido —el formulario del nombre y la lista de miembros— lo pone `work-group-sheet.tsx`;
        aqui solo se decide sobre quien. El alta tiene el suyo, fuera de la tabla.
      */}
      {editGroup === null ? null : (
        <WorkGroupSheet group={editGroup} open onOpenChange={closePanel} />
      )}

      {/* Y UNA del dialogo de borrado, tambien solo mientras esta abierto: un rechazo anterior no
          reaparece porque la pieza se desmonta al cerrarse (R34). */}
      {deleteGroup === null ? null : (
        <DeleteWorkGroupDialog group={deleteGroup} open onOpenChange={closePanel} />
      )}
    </div>
  );
}
