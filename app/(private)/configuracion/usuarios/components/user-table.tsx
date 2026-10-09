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
import type { RoleOption, UserRow } from '@/lib/modules/identity';

import { DeleteUserDialog } from './delete-user-dialog';
import { USER_COLUMN_COUNT, createUserColumns } from './user-columns';
import { userListHref } from './user-list-params';
import { UserSheet } from './user-sheet';
import { UserStatusDialog } from './user-status-dialog';

/**
 * La tabla de la lista de usuarios (R9, R12, R13, R14, R16, R21; `design.md > 6` y `> 7`).
 *
 * **Usa la tabla de datos compartida de QC-55**, importada por su barrel publico: no se declara
 * una tabla propia, ni una barra de paginacion propia, ni se copia el esqueleto de ninguna otra
 * pantalla, y **no se abre un solo archivo** de `components/shared/data-table/` (R9).
 *
 * **Solo emite; el servidor recalcula.** `onParamsChange` entrega el `DataTableParams` completo y
 * aqui se traduce a una navegacion (`router.push`) con la cadena de consulta canonica. El Server
 * Component de la seccion vuelve a pedir la lista **sobre el conjunto entero**. Esta pantalla **no
 * busca, no filtra, no ordena y no recorta nada en el cliente** (R12, R13, R14): la tabla pinta
 * las filas tal cual llegan, y cambiar termino, filtro, orden, tamano o pagina **navega**.
 *
 * **El destino sale de `userListHref`** (R1): ningun archivo de la ruta escribe la URL como
 * literal.
 *
 * **`searchable` AUSENTE (= `true`)**, porque `USER_QUERYABLE.searchable` es `true`. Que columnas
 * toca la busqueda —nombres, apellidos, correo y nombre de usuario— lo decide el adaptador driven,
 * el unico que conoce la base; esta pantalla no lo reproduce.
 *
 * **El selector de tamano y la paginacion son los del componente compartido** (R16): 10 y 25 salen
 * de `PAGE_SIZE_OPTIONS`, y la pagina actual y el total los pinta su indicador.
 *
 * **Cargando, error y vacio los pinta `<DataTable>` en lugar de toda la tabla**, y en esos
 * estados no se pinta el envoltorio de aqui. El vacio sustituye a la tabla tambien con busqueda:
 * es el propio de la pantalla, con su «Limpiar la búsqueda».
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R21): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que con seis columnas el documento
 * no se desplaza y las acciones de fila siguen alcanzables con el scroll de la propia tabla.
 *
 * **Es la DUENA DEL ESTADO de las escrituras DE FILA** (`design.md > 8` y `> 9`): monta **una**
 * instancia del panel de edicion y de cada dialogo para toda la pagina —no una por fila— y reparte
 * los tres disparadores a `createUserColumns`. Cada uno se monta **solo mientras esta abierto**,
 * asi que cada apertura arranca limpia y un rechazo anterior no reaparece.
 *
 * **El ALTA no esta aqui, y es deliberado.** La monta `user-create-action.tsx`, hermana de esta
 * tabla y no hija suya, porque con la lista vacia esta tabla solo pinta el vacio, y con ella se
 * iba el unico camino para crear a nadie. Como el listado excluye al actor, eso dejaba sin salida
 * justo el caso de la instalacion: un solo usuario sembrado, que es quien mira la pantalla.
 *
 * **R6, mitad cliente**: sin `usuarios.modificar` no se emite NINGUNA escritura —ni las acciones de
 * fila, ni el panel, ni los dialogos—. Ocultarlas es comodidad de la interfaz y **no es el
 * control**: quien autoriza es el caso de uso del modulo.
 *
 * **Todo llega por props** (R8): las filas, los parametros, el catalogo de roles y la decision de
 * R6. Aqui no se importa `lib/composition`, ni el cliente de base de datos, ni se lee la sesion, y
 * no se llama a ninguna Server Action: la lista la pidio el servidor.
 */

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const USER_TABLE_ID = 'usuarios';

/** `data-testid` del envoltorio de la tabla, para que ningun test dependa del copy (R41). */
export const USER_TABLE_TESTID = 'user-table';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R41): los
 * controles se localizan por rol o por `data-testid`.
 */
export const USER_TABLE_TEXTS: DataTableTexts = {
  empty: 'No hay usuarios que mostrar.',
  loading: 'Cargando usuarios…',
  error: 'No se pudo cargar la lista de usuarios.',
  search: 'Buscar usuarios por nombre, correo o nombre de usuario',
  filters: 'Filtros',
  columnMenu: 'opciones de la columna',
  previousPage: 'Página anterior',
  nextPage: 'Página siguiente',
  pageIndicator: (page, totalPages) => `Página ${page} de ${totalPages}`,
  pageSize: 'Usuarios por página',
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

export const USER_LIST_SKELETON_TESTID = 'user-list-skeleton';
export const USER_ROW_SKELETON_TESTID = 'user-row-skeleton';
/** Una celda por columna: un test lo ata al largo de `createUserColumns(...)`. */
export const USER_SKELETON_COLUMN_COUNT = USER_COLUMN_COUNT;

export const USER_LIST_EMPTY_TESTID = 'user-list-empty';
export const USER_LIST_EMPTY_MESSAGE_TESTID = 'user-list-empty-message';
export const USER_LIST_CLEAR_SEARCH_TESTID = 'user-list-clear-search';
export const USER_LIST_FIRST_PAGE_TESTID = 'user-list-first-page';

export const USER_LIST_ERROR_TESTID = 'user-list-error';
export const USER_LIST_ERROR_MESSAGE_TESTID = 'user-list-error-message';
export const USER_LIST_ERROR_CODE_TESTID = 'user-list-error-code';
export const USER_LIST_RETRY_TESTID = 'user-list-retry';

/**
 * Que escritura hay abierta. **Una sola por vez**, que es lo que permite montar una instancia de
 * cada panel para toda la pagina en vez de una por fila.
 *
 * **Los tres modos actuan SOBRE una fila**, y por eso `user` no es opcional. El alta no esta aqui:
 * vive en `user-create-action.tsx`, fuera de la tabla, para poder ofrecerse tambien cuando la
 * consulta no devuelve ninguna fila.
 */
export type UserPanelMode = 'edit' | 'delete' | 'status';

/** La escritura abierta y sobre quien. Siempre hay sujeto: los tres modos salen de una fila. */
export type UserPanel = {
  readonly mode: UserPanelMode;
  readonly user: UserRow;
};

type UserTableStatusProps =
  | { readonly status?: 'idle' | 'loading'; readonly error?: undefined }
  | { readonly status: 'error'; readonly error: ErrorState };

/**
 * El vacio de usuarios no ofrece «crear el primero»: el alta vive arriba, fuera de los estados de
 * la lista.
 */
export type UserTableEmpty = {
  /** Solo si habia termino de busqueda o filtro activos. */
  readonly clearSearchHref?: string;
  /** Solo si la pagina pedida era mayor que el total. */
  readonly firstPageHref?: string;
};

export type UserTableProps = UserTableStatusProps & {
  /** Las filas **ya resueltas** por la consulta, en el orden en que las entrega (R12, R14). */
  readonly users: readonly UserRow[];
  /** Los parametros vigentes, los mismos con los que se pidio la lista. */
  readonly params: DataTableParams;
  readonly totalPages: number;
  /**
   * Si la sesion trae `usuarios.modificar` (R6). **Decision de PRESENTACION**, resuelta en el
   * servidor con `assertPermission` y bajada por props (R8). No es autorizacion.
   */
  readonly canModify: boolean;
  /**
   * El identificador del actor de la sesion, o `null` (QC-101 R12, R16). Resuelto por la pagina en
   * el servidor y bajado por props: la tabla solo lo entrega al panel de detalle.
   */
  readonly currentUserId: string | null;
  /**
   * El catalogo de roles del selector del panel (R24), tal cual lo trajo `listRolesAction`. Vacio
   * si esa consulta fallo: entonces `rolesError` lo dice y el panel **no inventa opciones**.
   *
   * Viaja hasta aqui porque el panel lo monta esta tabla, que es la duena del estado. **Lo
   * consume T9**; hoy solo lo transporta, y por eso no se desestructura.
   */
  readonly roles: readonly RoleOption[];
  /** El error de la consulta de roles, o `null`. Degradado declarado de `design.md > 6` (R24). */
  readonly rolesError: ErrorState | null;
  /** Presente solo con cero filas: el vacio sustituye a toda la tabla. */
  readonly empty?: UserTableEmpty;
};

function buildStates(
  params: DataTableParams,
  error: ErrorState | undefined,
  empty: UserTableEmpty | undefined,
): DataTableStates {
  return {
    loading: {
      columns: USER_SKELETON_COLUMN_COUNT,
      rows: params.pageSize,
      label: USER_TABLE_TEXTS.loading,
      testId: USER_LIST_SKELETON_TESTID,
      rowTestId: USER_ROW_SKELETON_TESTID,
      headCellClassName: 'h-4 w-full',
    },
    ...(error === undefined
      ? {}
      : {
          error: {
            error,
            title: USER_TABLE_TEXTS.error,
            testId: USER_LIST_ERROR_TESTID,
            messageTestId: USER_LIST_ERROR_MESSAGE_TESTID,
            codeTestId: USER_LIST_ERROR_CODE_TESTID,
            retry: { kind: 'refresh' },
            retryTestId: USER_LIST_RETRY_TESTID,
          },
        }),
    ...(empty === undefined
      ? {}
      : {
          empty: {
            testId: USER_LIST_EMPTY_TESTID,
            messageTestId: USER_LIST_EMPTY_MESSAGE_TESTID,
            message:
              empty.clearSearchHref === undefined
                ? 'No hay usuarios que coincidan con lo que se está pidiendo.'
                : 'La búsqueda no encontró ningún usuario.',
            ...(empty.clearSearchHref === undefined
              ? {}
              : {
                  clearSearch: {
                    href: empty.clearSearchHref,
                    label: 'Limpiar la búsqueda',
                    testId: USER_LIST_CLEAR_SEARCH_TESTID,
                  },
                }),
            ...(empty.firstPageHref === undefined
              ? {}
              : {
                  firstPage: {
                    href: empty.firstPageHref,
                    label: 'Volver a la primera página',
                    testId: USER_LIST_FIRST_PAGE_TESTID,
                  },
                }),
          },
        }),
  };
}

export function UserTable({
  users,
  params,
  totalPages,
  canModify,
  currentUserId,
  roles,
  rolesError,
  status = 'idle',
  error,
  empty,
}: UserTableProps) {
  const router = useRouter();

  /**
   * El estado de las escrituras, que **vive aqui y en ningun otro sitio**: una instancia de cada
   * panel para toda la pagina. T9, T10 y T11 leen `panel` para decidir cual esta abierto y sobre
   * quien, y llaman a `setPanel(null)` al cerrar.
   */
  const [panel, setPanel] = useState<UserPanel | null>(null);

  /** Cerrar es siempre lo mismo: soltar el estado. Estable, para no rearmar los dialogos. */
  const closePanel = useCallback((next: boolean) => {
    if (!next) setPanel(null);
  }, []);

  // Las columnas se rearman solo cuando cambia la decision de R6: los tres disparadores son
  // estables porque `setPanel` lo es.
  const columns = useMemo(
    () =>
      createUserColumns({
        canModify,
        onEdit: (user) => setPanel({ mode: 'edit', user }),
        onDelete: (user) => setPanel({ mode: 'delete', user }),
        onStatusChange: (user) => setPanel({ mode: 'status', user }),
      }),
    [canModify],
  );

  // Se estrecha AQUI, no en el JSX: asi el compilador sabe que `panel` no es nulo al usarlo.
  const editUser = panel !== null && panel.mode === 'edit' ? panel.user : null;
  const deleteUser = panel !== null && panel.mode === 'delete' ? panel.user : null;
  const statusUser = panel !== null && panel.mode === 'status' ? panel.user : null;

  const table = (
    <DataTable
      tableId={USER_TABLE_ID}
      columns={columns}
      rows={users}
      getRowId={(user) => user.id}
      params={params}
      totalPages={totalPages}
      onParamsChange={(next) => router.push(userListHref(next))}
      status={status}
      states={buildStates(params, error, empty)}
      texts={USER_TABLE_TEXTS}
    />
  );

  if (status !== 'idle' || (users.length === 0 && empty !== undefined)) return table;

  return (
    <div className="flex flex-col gap-4" data-testid={USER_TABLE_TESTID}>
      {table}

      {/*
        UNA instancia del panel de EDICION para toda la pagina, y solo mientras esta abierto: asi
        vuelve a pedir la ficha en cada apertura (R26). El alta tiene el suyo, fuera de la tabla.
      */}
      {editUser === null ? null : (
        <UserSheet
          key={editUser.id}
          user={editUser}
          currentUserId={currentUserId}
          roles={roles}
          rolesError={rolesError}
          open
          onOpenChange={closePanel}
        />
      )}

      {deleteUser === null ? null : (
        <DeleteUserDialog user={deleteUser} open onOpenChange={closePanel} />
      )}

      {statusUser === null ? null : (
        <UserStatusDialog user={statusUser} open onOpenChange={closePanel} />
      )}
    </div>
  );
}
