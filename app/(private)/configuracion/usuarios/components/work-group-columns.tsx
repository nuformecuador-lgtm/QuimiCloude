'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';
import { ResponsibleAvatars } from '@/components/shared/responsible-avatars';
import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import { WORK_GROUP_QUERYABLE, type WorkGroupRow } from '@/lib/modules/identity';

import {
  WORK_GROUP_ACTIONS_COLUMN_LABEL,
  WORK_GROUP_MEMBERS_COLUMN_LABEL,
  WORK_GROUP_NAME_COLUMN_LABEL,
} from './work-group-labels';

/**
 * Las columnas de la lista de grupos, declaradas **como datos** (R12, R15, R40; `design.md > 4`).
 *
 * **DOS columnas de datos —el nombre y los miembros— y una de acciones.** `WorkGroupRow` traia
 * antes exactamente `id` y `name`: ese recorte fue deliberado mientras el contrato no tenia otra
 * forma de resolver la pertenencia. El humano lo levanto hoy, por fuera del proceso SDD completo,
 * para que esta tabla muestre tambien QUE USUARIOS pertenecen a cada grupo —el mismo espiritu que
 * «Responsables» en `/asignacion`—, asi que `WorkGroupRow` ahora trae ademas `members`.
 *
 *   - **La columna de miembros pinta avatares, no un conteo.** Ningun numero al lado de la lista:
 *     el conteo («3 de 5» visibles/total) sigue siendo **QC-100**, que es un requisito DISTINTO y
 *     sigue sin estar hecho. Por decision del humano, esta columna reutiliza el MISMO componente
 *     de avatares que `/asignacion` usa para «Responsables» —`ResponsibleAvatars`, en
 *     `components/shared/responsible-avatars.tsx`—, ya generalizado para no depender del tipo
 *     `OrderResponsible` de otro modulo: ahora acepta cualquier `{ userId, displayName }`.
 *   - **Ningun identificador tecnico, ningun nombre normalizado, ninguna empresa y ninguna marca
 *     de baja**: la fila no los trae, y eso lo impide el TIPO, no una promesa.
 *
 * **Modulo de CLIENTE, y no por gusto**: la columna de acciones devuelve elementos, y una
 * configuracion con funciones de celda que devuelven elementos no cruza la frontera
 * servidor->cliente. Por eso la seccion de lista (servidor) baja solo datos serializables y es la
 * tabla quien monta `<DataTable>`.
 *
 * **Que ordena se LEE de la lista blanca, no se reescribe** (R15): `sortable` sale de
 * `WORK_GROUP_QUERYABLE.sortable.includes(...)`, asi que la cabecera nunca promete un orden que el
 * dominio descartaria en silencio. Con la lista de hoy eso deja ordenable el nombre.
 * **`createdAt` es ordenable en el contrato pero NO es una columna** (`design.md > 4.2` y `> 10.3`)
 * porque `WorkGroupRow` no la trae: no se pinta y no se ofrece ordenar por ella desde la cabecera.
 * La lista blanca dice lo que la consulta ADMITE, no lo que la tabla MUESTRA.
 *
 * **Ningun filtro** (R16): `WORK_GROUP_QUERYABLE.filterable` esta vacio, asi que ninguna columna
 * declara `filter`. Un control de filtro aqui seria un control que no hace nada.
 *
 * **La columna de acciones se declara con `actionsColumn()`**: no ordena, no filtra y no se puede
 * fijar. **No se anade ninguna prop a la tabla compartida**.
 */

/** Ids de las columnas. Constantes porque los comparten la tabla y los tests (R41). */
export const WORK_GROUP_NAME_COLUMN_ID = 'name';
export const WORK_GROUP_MEMBERS_COLUMN_ID = 'members';
export const WORK_GROUP_ACTIONS_COLUMN_ID = 'actions';

/**
 * Cuantas columnas hay: el nombre, los miembros y las acciones. Existe para que el esqueleto de
 * carga pinte tantas celdas como columnas, y para que el test lo ate a la longitud real en vez de
 * dejarlo desincronizarse en silencio.
 */
export const WORK_GROUP_COLUMN_COUNT = 3;

export const WORK_GROUP_ROW_ACTIONS_TESTID = 'work-group-row-actions';
export const WORK_GROUP_ACTION_EDIT_TESTID = 'work-group-action-edit';
export const WORK_GROUP_ACTION_DELETE_TESTID = 'work-group-action-delete';

/** Texto de cada item del menu: solo el verbo; el nombre del grupo lo lleva el disparador. */
export const WORK_GROUP_ACTION_EDIT_LABEL = 'Abrir';
export const WORK_GROUP_ACTION_DELETE_LABEL = 'Eliminar';

/** Nombre accesible del disparador del menu: nombra al grupo para dar el contexto de la fila. */
export function workGroupRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

/**
 * Lo que hace un disparador de fila: avisar de sobre QUE grupo se pidio actuar. No abre nada por su
 * cuenta —abrir es del dueno del estado, que es la tabla— y no escribe: la escritura la hacen las
 * Server Actions desde el panel o el dialogo (R36).
 */
export type WorkGroupRowActionHandler = (group: WorkGroupRow) => void;

export type WorkGroupRowActionsProps = {
  /** La fila del listado: `id`, `name` y `members`, y ninguna mas: lo impide el tipo (R12). */
  readonly group: WorkGroupRow;
  /**
   * Si la sesion trae `usuarios.modificar` (R9). **Decision de PRESENTACION**, resuelta en el
   * servidor y bajada por props (R10). No es autorizacion.
   */
  readonly canModify: boolean;
  /** Abre el panel lateral sobre este grupo: su nombre y sus miembros (T10, R20). */
  readonly onEdit?: WorkGroupRowActionHandler;
  /** Abre la confirmacion de borrado que nombra a este grupo (T11, R33). */
  readonly onDelete?: WorkGroupRowActionHandler;
};

/**
 * Las DOS acciones de fila de un grupo, abrirlo y borrarlo, en el menu de los tres puntos de la
 * fila (`RowActionsMenu`).
 *
 * **Con `canModify === false` devuelve `null`, o sea la celda queda VACIA**: sin disparador,
 * sin items deshabilitados, sin explicacion y sin nada en el DOM. Un control deshabilitado anuncia
 * una capacidad que la sesion no tiene y solo sirve para que alguien intente averiguar por que.
 *
 * **Ocultarlas es comodidad de la interfaz, NO el control**: quien autoriza es el caso de uso del
 * modulo, cuya primera linea es `requirePermission`. Esta pantalla no repite ni sustituye esa
 * comprobacion.
 *
 * El disparador esta siempre visible y en el DOM, con su objetivo tactil de 44x44 px: nada se
 * descubre con `:hover`.
 */
export function WorkGroupRowActions({
  group,
  canModify,
  onEdit,
  onDelete,
}: WorkGroupRowActionsProps) {
  if (!canModify) return null;

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: WORK_GROUP_ACTION_EDIT_LABEL,
      icon: PencilIcon,
      onSelect: () => onEdit?.(group),
      testId: WORK_GROUP_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: WORK_GROUP_ACTION_DELETE_LABEL,
      icon: TrashIcon,
      onSelect: () => onDelete?.(group),
      destructive: true,
      testId: WORK_GROUP_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <RowActionsMenu
      items={items}
      triggerLabel={workGroupRowActionsLabel(group.name)}
      triggerTestId={WORK_GROUP_ROW_ACTIONS_TESTID}
      triggerDataAttributes={{ 'data-work-group-id': group.id }}
    />
  );
}

/**
 * Si una columna ordena, **preguntandoselo a la lista blanca del contrato** (R15). No es una copia
 * de la lista: es la lista.
 */
function isSortable(columnId: string): boolean {
  return WORK_GROUP_QUERYABLE.sortable.includes(columnId);
}

/**
 * Lo que la celda de acciones necesita y la declaracion de columnas no puede inventarse: la
 * decision de R9 y los dos disparadores. Los manejadores son **opcionales** porque el panel lateral
 * y el dialogo de borrado llegan en la tanda 2; cuando existan se enchufan aqui sin tocar una linea
 * de este archivo.
 */
export type WorkGroupColumnsDeps = {
  /** Si la sesion trae `usuarios.modificar` (R9). Decision de presentacion, no autorizacion. */
  readonly canModify: boolean;
  readonly onEdit?: WorkGroupRowActionHandler;
  readonly onDelete?: WorkGroupRowActionHandler;
};

/**
 * **Factoria, y no un array suelto**: la celda de acciones necesita `canModify` y los
 * disparadores, y un array declarado en el modulo no tendria por donde recibirlos. Las columnas
 * siguen siendo DATOS; lo que cambia es que se construyen con sus dependencias.
 */
export function createWorkGroupColumns({
  canModify,
  onEdit,
  onDelete,
}: WorkGroupColumnsDeps): readonly DataTableColumn<WorkGroupRow>[] {
  return [
    {
      id: WORK_GROUP_NAME_COLUMN_ID,
      label: WORK_GROUP_NAME_COLUMN_LABEL,
      align: 'start',
      sortable: isSortable(WORK_GROUP_NAME_COLUMN_ID),
      // Se pinta TAL CUAL llega. Ni un numero al lado, ni una insignia con un conteo: el dato no
      // existe en la fila y QC-100 es quien lo traera (R12).
      cell: (group) => group.name,
    },
    {
      id: WORK_GROUP_MEMBERS_COLUMN_ID,
      label: WORK_GROUP_MEMBERS_COLUMN_LABEL,
      align: 'start',
      // Sin `sortable` ni `filter`: la lista blanca (`WORK_GROUP_QUERYABLE`) no declara esta
      // columna como ordenable ni filtrable, y no se inventa una capacidad que el contrato no
      // soporta.
      cell: (group) => (
        <ResponsibleAvatars
          responsibles={group.members.map((member) => ({
            userId: member.id,
            displayName: member.displayName,
          }))}
          overflowLabel={(remaining) => `Ver los ${remaining} miembros restantes`}
        />
      ),
    },
    // Sin `sortable` (ordenar por unas acciones no significa nada), sin `filter` (la lista
    // blanca no declara ninguno) y sin anclar, para no tapar las columnas de datos.
    actionsColumn<WorkGroupRow>({
      id: WORK_GROUP_ACTIONS_COLUMN_ID,
      label: WORK_GROUP_ACTIONS_COLUMN_LABEL,
      cell: (group) => (
        <WorkGroupRowActions
          group={group}
          canModify={canModify}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    }),
  ];
}

/**
 * Las columnas **sin ninguna dependencia resuelta**: mismo numero, mismos ids y mismas capacidades
 * de orden que las de la fabrica. Existe para que el test de R12 pueda recorrer la DECLARACION sin
 * inventarse manejadores, y para que ese recorrido sea el mismo objeto que la pantalla monta.
 * `canModify: false` es la direccion segura por defecto.
 */
export const WORK_GROUP_COLUMNS: readonly DataTableColumn<WorkGroupRow>[] = createWorkGroupColumns({
  canModify: false,
});
