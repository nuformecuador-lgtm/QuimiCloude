'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { ConfirmDialogFrame } from '@/components/shared/confirm-dialog';
import { DeleteConfirmDialogBody } from '@/components/shared/delete-confirm-dialog';
import type { UserRow } from '@/lib/modules/identity';
import {
  deleteUserAction,
  type UserMutationFormState,
} from '@/lib/modules/identity/adapters/driving/user-actions';

/**
 * La confirmacion del borrado de un usuario (R30, R31; `design.md > 9`).
 *
 * **Nombra a la persona** por su `displayName` y advierte que la accion no se puede deshacer
 * (R30): con diez o veinticinco filas en pantalla, «¿seguro?» a secas no dice a quien.
 *
 * **MIENTRAS no se confirme, la operacion NO se invoca** (R30): el unico camino hasta
 * `deleteUserAction` es el envio del formulario, y ese formulario solo lo envia el boton de
 * confirmar. Abrir el dialogo no escribe nada.
 *
 * **Un rechazo se pinta DENTRO del dialogo, por su `code` y nunca por su texto** (R31), el dialogo
 * **sigue abierto** y **la fila no se retira**: aqui los casos vivos son `self_operation` (es tu
 * propia ficha) y `last_administrator` (dejaria a la empresa sin administrador). El cuerpo se
 * monta solo mientras el popup esta abierto, asi que un rechazo anterior no reaparece.
 *
 * Con exito se aplica R29: cerrar, avisar por toast —sobre el `<Toaster />` del layout privado, no
 * uno propio— y `router.refresh()`, que reejecuta la lista con la MISMA URL.
 */

export const DELETE_USER_DIALOG_TESTID = 'delete-user-dialog';
export const DELETE_USER_MESSAGE_TESTID = 'delete-user-message';
export const DELETE_USER_CONFIRM_TESTID = 'delete-user-confirm';
export const DELETE_USER_DISMISS_TESTID = 'delete-user-dismiss';
export const DELETE_USER_ERROR_TESTID = 'delete-user-error';
export const DELETE_USER_ERROR_MESSAGE_TESTID = 'delete-user-error-message';
export const DELETE_USER_FORM_TESTID = 'delete-user-form';
export const DELETE_USER_ID_TESTID = 'delete-user-id';

/** El `id` viaja como campo OCULTO, que es lo que `readTargetId` espera. */
export const DELETE_USER_ID_FIELD = 'id';

const TITLE = 'Eliminar al usuario';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Usuario eliminado.';

/** R36: el estado inicial lo construye esta pantalla, no la action. */
const INITIAL_STATE: UserMutationFormState = { status: 'idle' };

export type DeleteUserDialogProps = {
  readonly user: UserRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeleteUserDialog({ user, open, onOpenChange }: DeleteUserDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  return (
    <ConfirmDialogFrame open={open} onOpenChange={onOpenChange} testId={DELETE_USER_DIALOG_TESTID}>
      <DeleteUserDialogBody user={user} onOpenChange={onOpenChange} errorId={errorId} />
    </ConfirmDialogFrame>
  );
}

type DeleteUserDialogBodyProps = Omit<DeleteUserDialogProps, 'open'> & {
  readonly errorId: string;
};

/** Se monta con el popup: cada apertura arranca sin el rechazo de la anterior. */
function DeleteUserDialogBody({ user, onOpenChange, errorId }: DeleteUserDialogBodyProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteUserAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R29, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <DeleteConfirmDialogBody
      onOpenChange={onOpenChange}
      texts={{
        title: TITLE,
        description: (
          <>Se va a eliminar a {user.displayName}. Esta acción no se puede deshacer.</>
        ),
        dismiss: DISMISS_LABEL,
      }}
      testIds={{
        message: DELETE_USER_MESSAGE_TESTID,
        dismiss: DELETE_USER_DISMISS_TESTID,
        confirm: DELETE_USER_CONFIRM_TESTID,
        form: DELETE_USER_FORM_TESTID,
        error: DELETE_USER_ERROR_TESTID,
        errorMessage: DELETE_USER_ERROR_MESSAGE_TESTID,
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: DELETE_USER_ID_FIELD, value: user.id, testId: DELETE_USER_ID_TESTID }],
      }}
      isPending={isPending}
      error={error}
      errorId={errorId}
    />
  );
}
