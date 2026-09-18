'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId } from 'react';
import { toast } from 'sonner';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { useRateLimitedActionState } from '@/hooks/use-rate-limited-action-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
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
 * propia ficha) y `last_administrator` (dejaria a la empresa sin administrador). El dialogo se
 * monta solo mientras esta abierto, asi que un rechazo anterior no reaparece.
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

const TOUCH_TARGET = 'min-h-11 min-w-11';

const TITLE = 'Eliminar al usuario';
const CONFIRM_LABEL = 'Eliminar';
const CONFIRM_PENDING_LABEL = 'Eliminando…';
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
  const router = useRouter();
  const [state, formAction, isPending] = useRateLimitedActionState(deleteUserAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R29, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={DELETE_USER_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription data-testid={DELETE_USER_MESSAGE_TESTID}>
            Se va a eliminar a {user.displayName}. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === undefined ? null : (
          <div
            role="alert"
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={DELETE_USER_ERROR_TESTID}
            data-code={error.code}
          >
            {error.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={error} />
            ) : (
              <p data-testid={DELETE_USER_ERROR_MESSAGE_TESTID}>{error.message}</p>
            )}
          </div>
        )}

        <form action={formAction} data-testid={DELETE_USER_FORM_TESTID}>
          <input
            type="hidden"
            name={DELETE_USER_ID_FIELD}
            defaultValue={user.id}
            data-testid={DELETE_USER_ID_TESTID}
          />
          <AlertDialogFooter>
            <AlertDialogCancel className={TOUCH_TARGET} data-testid={DELETE_USER_DISMISS_TESTID}>
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={TOUCH_TARGET}
              disabled={isPending}
              aria-busy={isPending}
              data-testid={DELETE_USER_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
