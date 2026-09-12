'use client';

import { PencilIcon, TrashIcon, UserCogIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { UserRow } from '@/lib/modules/identity';

import { changeUserStatusLabel, deleteUserLabel, editUserLabel } from './user-labels';

/**
 * Las TRES acciones de fila de un usuario: editar, borrar y cambiar el estado de cuenta (R6
 * —mitad cliente—, R32, R40; `design.md > 9`).
 *
 * **Con `canModify === false` devuelve `null`, o sea la celda queda VACIA** (R6): sin botones,
 * sin botones deshabilitados, sin explicacion y sin nada en el DOM. Un boton deshabilitado
 * anuncia una capacidad que la sesion no tiene y solo sirve para que alguien intente averiguar
 * por que; la ausencia de acciones es la unica senal.
 *
 * **Ocultarlas es comodidad de la interfaz, NO el control** (R6). Quien autoriza es el caso de uso
 * del modulo, cuya primera linea es `requirePermission` en las seis operaciones. Esta pantalla no
 * repite ni sustituye esa comprobacion: `canModify` decide **que se emite en el HTML**, no que se
 * puede hacer. Ademas los permisos de la sesion son una foto del login y envejecen hasta 8 h
 * (`docs/architecture.md > Permisos`), asi que una pantalla puede ofrecer un boton que el service
 * ya deniega; ese rechazo se pinta como cualquier otro error, por su `code` (R7).
 *
 * **Siempre visibles y siempre en el DOM** (R40): nada se descubre con `:hover` —que en tactil no
 * existe— ni vive dentro de un desplegable que las esconda del arbol, y cada control mide al menos
 * 44x44 px.
 *
 * **UNA sola accion para el estado de cuenta** (R32), no un verbo por transicion: quien elige
 * entre los cuatro valores es el dialogo de T11, y la pantalla no decide que transiciones son
 * posibles.
 *
 * **Todo llega por props** (R8): la fila y la decision de R6 las baja el Server Component padre.
 * Aqui no se importa `lib/composition`, ni el cliente de base de datos, ni se lee la sesion, ni se
 * pide nada por cuenta propia.
 *
 * **Los tres disparadores son CALLBACKS, y eso es deliberado.** Hoy el panel lateral (T9) y los
 * dos dialogos (T10, T11) todavia no existen. Declarandolos asi, quien los construya solo tiene
 * que pasar los manejadores desde el dueno del estado —la tabla, que monta **una** instancia de
 * cada panel para toda la pagina en vez de una por fila— sin reescribir ni una linea de este
 * componente.
 */

/** Objetivo tactil minimo (44x44 px) de R40. Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

export const USER_ROW_ACTIONS_TESTID = 'user-row-actions';
export const USER_ACTION_EDIT_TESTID = 'user-action-edit';
export const USER_ACTION_DELETE_TESTID = 'user-action-delete';
export const USER_ACTION_STATUS_TESTID = 'user-action-status';

/**
 * Lo que hace un disparador de fila: avisar de sobre QUE usuario se pidio actuar. No abre nada por
 * su cuenta —abrir es del dueno del estado— y no escribe: la escritura la hacen las Server Actions
 * desde el panel o el dialogo correspondiente (R36).
 */
export type UserRowActionHandler = (user: UserRow) => void;

export type UserRowActionsProps = {
  /** La fila del listado. Seis claves y ninguna de credencial: lo impide el tipo (R10, R35). */
  readonly user: UserRow;
  /**
   * Si la sesion trae `usuarios.modificar` (R6). **Decision de PRESENTACION**, resuelta en el
   * servidor con `assertPermission` y bajada por props (R8). No es autorizacion.
   */
  readonly canModify: boolean;
  /** Abre el panel lateral de edicion sobre este usuario (T9, R22). */
  readonly onEdit?: UserRowActionHandler;
  /** Abre la confirmacion de borrado que nombra a este usuario (T10, R30). */
  readonly onDelete?: UserRowActionHandler;
  /** Abre el dialogo del cambio de estado de cuenta de este usuario (T11, R32). */
  readonly onStatusChange?: UserRowActionHandler;
};

export function UserRowActions({
  user,
  canModify,
  onEdit,
  onDelete,
  onStatusChange,
}: UserRowActionsProps) {
  // R6: sin `usuarios.modificar` la celda no emite NADA. Ni un contenedor vacio, que ya seria una
  // pista de que ahi hay acciones para otros.
  if (!canModify) return null;

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid={USER_ROW_ACTIONS_TESTID}
      data-user-id={user.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TOUCH_TARGET}
        aria-label={editUserLabel(user.displayName)}
        data-testid={USER_ACTION_EDIT_TESTID}
        onClick={() => onEdit?.(user)}
      >
        <PencilIcon aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TOUCH_TARGET}
        aria-label={changeUserStatusLabel(user.displayName)}
        data-testid={USER_ACTION_STATUS_TESTID}
        onClick={() => onStatusChange?.(user)}
      >
        <UserCogIcon aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TOUCH_TARGET}
        aria-label={deleteUserLabel(user.displayName)}
        data-testid={USER_ACTION_DELETE_TESTID}
        onClick={() => onDelete?.(user)}
      >
        <TrashIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
