'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import {
  DataTable,
  type DataTableParams,
  type DataTableTexts,
} from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import type { ErrorState } from '@/lib/modules/errores';
import type { RoleOption, UserRow } from '@/lib/modules/identity';

import { DeleteUserDialog } from './delete-user-dialog';
import { createUserColumns } from './user-columns';
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
 * **`status` es SIEMPRE `'idle'`**: los tres estados de R18/R19 se pintan fuera de `<DataTable>`,
 * con copy y acciones propias, y el «cargando» lo aporta el `<Suspense>` del servidor. Aqui solo
 * llegan filas ya resueltas.
 *
 * **El desbordamiento horizontal lo absorbe el primitivo** (R21): `components/ui/table.tsx` ya
 * envuelve la tabla en un contenedor con `overflow-x-auto`, asi que con seis columnas el documento
 * no se desplaza y las acciones de fila siguen alcanzables con el scroll de la propia tabla.
 *
 * **Es la DUENA DEL ESTADO de las escrituras** (`design.md > 8` y `> 9`): monta **una** instancia
 * del panel y de cada dialogo para toda la pagina —no una por fila— y reparte los tres
 * disparadores a `createUserColumns`. Cada uno se monta **solo mientras esta abierto**, asi que
 * cada apertura arranca limpia y un rechazo anterior no reaparece.
 *
 * **R6, mitad cliente**: sin `usuarios.modificar` no se emite NINGUNA escritura —ni el disparador
 * del alta, ni las acciones de fila, ni el panel, ni los dialogos—. Ocultarlas es comodidad de la
 * interfaz y **no es el control**: quien autoriza es el caso de uso del modulo.
 *
 * **Todo llega por props** (R8): las filas, los parametros, el catalogo de roles y la decision de
 * R6. Aqui no se importa `lib/composition`, ni el cliente de base de datos, ni se lee la sesion, y
 * no se llama a ninguna Server Action: la lista la pidio el servidor.
 */

/** `data-testid` del disparador del alta. Constante para que ningun test dependa del copy (R41). */
export const USER_CREATE_OPEN_TESTID = 'user-create-open';

/** Clave de persistencia del fijado de columnas. Una sola tabla en la pantalla, un solo id. */
export const USER_TABLE_ID = 'usuarios';

/** `data-testid` del envoltorio de la tabla, para que ningun test dependa del copy (R41). */
export const USER_TABLE_TESTID = 'user-table';

/**
 * Textos del componente compartido. Viven aqui —y no en el componente— porque la tabla compartida
 * no incrusta copy de ningun dominio. Ningun test afirma sobre estos literales (R41): los
 * controles se localizan por rol o por `data-testid`.
 */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** El copy del disparador del alta. Ningun test afirma sobre el (R41). */
const CREATE_LABEL = 'Nuevo usuario';

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

/**
 * Que escritura hay abierta. **Una sola por vez**, que es lo que permite montar una instancia de
 * cada panel para toda la pagina en vez de una por fila.
 *
 * `'create'` es el alta, y es el unico modo sin usuario seleccionado; los otros tres actuan
 * **sobre** la fila que dispara la accion.
 */
export type UserPanelMode = 'create' | 'edit' | 'delete' | 'status';

/** La escritura abierta y sobre quien. `null` en `user` es el alta, que no tiene sujeto. */
export type UserPanel = {
  readonly mode: UserPanelMode;
  readonly user: UserRow | null;
};

export type UserTableProps = {
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
   * El catalogo de roles del selector del panel (R24), tal cual lo trajo `listRolesAction`. Vacio
   * si esa consulta fallo: entonces `rolesError` lo dice y el panel **no inventa opciones**.
   *
   * Viaja hasta aqui porque el panel lo monta esta tabla, que es la duena del estado. **Lo
   * consume T9**; hoy solo lo transporta, y por eso no se desestructura.
   */
  readonly roles: readonly RoleOption[];
  /** El error de la consulta de roles, o `null`. Degradado declarado de `design.md > 6` (R24). */
  readonly rolesError: ErrorState | null;
};

export function UserTable({
  users,
  params,
  totalPages,
  canModify,
  roles,
  rolesError,
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
  const sheetPanel =
    panel !== null && (panel.mode === 'create' || panel.mode === 'edit') ? panel : null;
  const deleteUser = panel !== null && panel.mode === 'delete' ? panel.user : null;
  const statusUser = panel !== null && panel.mode === 'status' ? panel.user : null;

  return (
    <div className="flex flex-col gap-4" data-testid={USER_TABLE_TESTID}>
      {/* El alta (R6): sin `usuarios.modificar` este disparador no existe en el arbol servido. */}
      {canModify ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="default"
            className={TOUCH_TARGET}
            data-testid={USER_CREATE_OPEN_TESTID}
            onClick={() => setPanel({ mode: 'create', user: null })}
          >
            <PlusIcon aria-hidden="true" />
            {CREATE_LABEL}
          </Button>
        </div>
      ) : null}

      <DataTable
        tableId={USER_TABLE_ID}
        columns={columns}
        rows={users}
        getRowId={(user) => user.id}
        params={params}
        totalPages={totalPages}
        onParamsChange={(next) => router.push(userListHref(next))}
        status="idle"
        texts={USER_TABLE_TEXTS}
      />

      {/*
        UNA instancia del panel para toda la pagina, y solo mientras esta abierto: asi el alta
        arranca en blanco y la edicion vuelve a pedir la ficha en cada apertura (R22, R26).
      */}
      {sheetPanel === null ? null : (
        <UserSheet
          key={`${sheetPanel.mode}:${sheetPanel.user?.id ?? ''}`}
          user={sheetPanel.user}
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
