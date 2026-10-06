'use client';

import { PencilIcon, TrashIcon, UserCogIcon } from 'lucide-react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { UserRow } from '@/lib/modules/identity';

import {
  CHANGE_USER_STATUS_ACTION_LABEL,
  DELETE_USER_ACTION_LABEL,
  EDIT_USER_ACTION_LABEL,
} from './user-labels';

/**
 * Las TRES acciones de fila de un usuario: editar, borrar y cambiar el estado de cuenta (R6
 * —mitad cliente—, R32, R40; `design.md > 9`).
 *
 * **Con `canModify === false` devuelve `null`, o sea la celda queda VACIA** (R6): sin disparador,
 * sin nada deshabilitado, sin explicacion y sin nada en el DOM. Un control deshabilitado anuncia
 * una capacidad que la sesion no tiene y solo sirve para que alguien intente averiguar por que; la
 * ausencia de acciones es la unica senal.
 *
 * **Ocultarlas es comodidad de la interfaz, NO el control** (R6). Quien autoriza es el caso de uso
 * del modulo, cuya primera linea es `requirePermission` en las seis operaciones. Esta pantalla no
 * repite ni sustituye esa comprobacion: `canModify` decide **que se emite en el HTML**, no que se
 * puede hacer. Ademas los permisos de la sesion son una foto del login y envejecen hasta 8 h
 * (`docs/architecture.md > Permisos`), asi que una pantalla puede ofrecer un boton que el service
 * ya deniega; ese rechazo se pinta como cualquier otro error, por su `code` (R7).
 *
 * **Decision humana puntual sobre R40 (pedida por chat, solo para esta pantalla):** las tres
 * acciones ya NO son tres botones en linea, sino items de un menu "de los 3 puntos"
 * (`RowActionsMenu`, `components/shared/row-actions-menu.tsx`). R40 sigue exigiendo que nada se
 * descubra con `:hover` y que cada control mida 44x44 px, y eso se sigue cumpliendo: el
 * DISPARADOR del menu esta siempre visible y siempre en el DOM, con su propio objetivo tactil. Lo
 * que cambia es que las tres acciones individuales viven dentro del menu que ese disparador abre
 * con un clic, no como tres controles sueltos. No es una derogacion general de R40 para el resto
 * del repo: las demas pantallas con botones en linea siguen con ellos.
 *
 * **Decision humana puntual (2026-10-04):** los items del menu dicen solo el verbo, sin el nombre
 * del usuario. El contexto de la fila lo conserva el nombre accesible del disparador.
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

/** Nombre accesible del disparador: nombra al usuario para que el menu tenga el contexto de la fila. */
function userRowActionsTriggerLabel(displayName: string): string {
  return `Acciones de ${displayName}`;
}

export function UserRowActions({
  user,
  canModify,
  onEdit,
  onDelete,
  onStatusChange,
}: UserRowActionsProps) {
  // R6: sin `usuarios.modificar` la celda no emite NADA. Ni un disparador vacio, que ya seria una
  // pista de que ahi hay acciones para otros.
  if (!canModify) return null;

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: EDIT_USER_ACTION_LABEL,
      icon: PencilIcon,
      onSelect: () => onEdit?.(user),
      testId: USER_ACTION_EDIT_TESTID,
    },
    {
      key: 'status',
      label: CHANGE_USER_STATUS_ACTION_LABEL,
      icon: UserCogIcon,
      onSelect: () => onStatusChange?.(user),
      testId: USER_ACTION_STATUS_TESTID,
    },
    {
      key: 'delete',
      label: DELETE_USER_ACTION_LABEL,
      icon: TrashIcon,
      onSelect: () => onDelete?.(user),
      destructive: true,
      testId: USER_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <RowActionsMenu
      items={items}
      triggerLabel={userRowActionsTriggerLabel(user.displayName)}
      triggerTestId={USER_ROW_ACTIONS_TESTID}
      triggerDataAttributes={{ 'data-user-id': user.id }}
    />
  );
}
