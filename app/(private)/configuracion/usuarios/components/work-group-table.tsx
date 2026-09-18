'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import type { WorkGroupRow } from '@/lib/modules/identity';

import { DeleteWorkGroupDialog } from './delete-work-group-dialog';
import { createWorkGroupColumns } from './work-group-columns';
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
 * **`status` es SIEMPRE `'idle'`**: los tres estados de R18/R19 se pintan fuera de `<DataTable>`,
 * con copy y acciones propias, y el «cargando» lo aporta el `<Suspense>` del servidor.
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
 * esta tabla solo existe cuando hay filas y los grupos **nacen en cero** —no los siembra nadie—.
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

/**
 * Que escritura hay abierta. **Una sola por vez**, que es lo que permite montar una instancia de
 * cada pieza para toda la pagina en vez de una por fila.
 *
 * **Los dos modos actuan SOBRE una fila**, y por eso `group` no es opcional. El alta no esta aqui:
 * vive en `work-group-create-action.tsx`, fuera de la tabla, porque los grupos no los siembra nadie
 * y con cero filas esta tabla no llega a montarse.
 */
export type WorkGroupPanelMode = 'edit' | 'delete';

/** La escritura abierta y sobre quien. Siempre hay sujeto: los dos modos salen de una fila. */
export type WorkGroupPanel = {
  readonly mode: WorkGroupPanelMode;
  readonly group: WorkGroupRow;
};

export type WorkGroupTableProps = {
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
};

export function WorkGroupTable({ groups, params, totalPages, canModify }: WorkGroupTableProps) {
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

  return (
    <div className="flex flex-col gap-4" data-testid={WORK_GROUP_TABLE_TESTID}>
      <DataTable
        tableId={WORK_GROUP_TABLE_ID}
        columns={columns}
        rows={groups}
        getRowId={(group) => group.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => router.push(workGroupListHref(next))}
        status="idle"
        texts={WORK_GROUP_TABLE_TEXTS}
      />

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
