'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import { USER_ACCOUNT_STATUSES, type UserRow } from '@/lib/modules/identity';
import {
  setUserAccountStatusAction,
  type UserMutationFormState,
} from '@/lib/modules/identity/adapters/driving/user-actions';

import { USER_ACCOUNT_STATUS_LABELS } from './user-labels';

/**
 * El cambio del estado de cuenta (R32, R33, R34; `design.md > 9`).
 *
 * **UNA sola accion**, «Cambiar estado», con un selector de los **cuatro** valores del conjunto
 * cerrado del modulo y confirmacion antes de escribir (R32). La pantalla **no traduce estados a
 * verbos** («Activar», «Bloquear»…), **no decide que transiciones son posibles** y **no excluye
 * ningun valor** por el estado actual: eso seria regla de negocio escrita en la interfaz, y quien
 * la tiene escrita es `setAccountStatusSchema`.
 *
 * **Las opciones se derivan de `USER_ACCOUNT_STATUSES`**, nunca de una lista escrita a mano: dos
 * listas es como se acaba ofreciendo un estado que ya no existe.
 *
 * **`blocked` → `active` se ofrece igual que cualquier otro** (R34). Hoy **no** limpia el bloqueo
 * ni el contador de intentos fallidos —eso es QC-95, que no bloquea a esta ficha—, y esta pantalla
 * **no lo compensa y no lo promete**: el efecto de la transicion sobre el acceso lo decide el
 * modulo.
 *
 * **Un rechazo se pinta DENTRO del dialogo, por su `code`** (R33), el dialogo sigue abierto y **el
 * estado pintado en la fila no cambia**: quien repinta la fila es el servidor, y solo tras un
 * exito (R29).
 */

export const USER_STATUS_DIALOG_TESTID = 'user-status-dialog';
export const USER_STATUS_MESSAGE_TESTID = 'user-status-message';
export const USER_STATUS_SELECT_TESTID = 'user-status-select';
export const USER_STATUS_OPTION_TESTID = 'user-status-option';
export const USER_STATUS_CONFIRM_TESTID = 'user-status-confirm';
export const USER_STATUS_DISMISS_TESTID = 'user-status-dismiss';
export const USER_STATUS_ERROR_TESTID = 'user-status-error';
export const USER_STATUS_ERROR_MESSAGE_TESTID = 'user-status-error-message';
export const USER_STATUS_FORM_TESTID = 'user-status-form';
export const USER_STATUS_ID_TESTID = 'user-status-id';

/** Los dos campos del `FormData` que lee la action: el objetivo y el destino. */
export const USER_STATUS_ID_FIELD = 'id';
export const USER_STATUS_FIELD = 'accountStatus';

const TOUCH_TARGET = 'min-h-11 min-w-11';
const FIELD_TEXT = 'text-base md:text-base';

const TITLE = 'Cambiar el estado de la cuenta';
const SELECT_LABEL = 'Estado de la cuenta';
const CONFIRM_LABEL = 'Cambiar estado';
const CONFIRM_PENDING_LABEL = 'Cambiando…';
const DISMISS_LABEL = 'Volver';
const STATUS_SUCCESS = 'Estado de la cuenta actualizado.';

/** R36: el estado inicial lo construye esta pantalla, no la action. */
const INITIAL_STATE: UserMutationFormState = { status: 'idle' };

export type UserStatusDialogProps = {
  readonly user: UserRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function UserStatusDialog({ user, open, onOpenChange }: UserStatusDialogProps) {
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(setUserAccountStatusAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R29, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(STATUS_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={USER_STATUS_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription data-testid={USER_STATUS_MESSAGE_TESTID}>
            Elige el estado de la cuenta de {user.displayName}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === undefined ? null : (
          <div
            role="alert"
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={USER_STATUS_ERROR_TESTID}
            data-code={error.code}
          >
            {error.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={error} />
            ) : (
              <p data-testid={USER_STATUS_ERROR_MESSAGE_TESTID}>{error.message}</p>
            )}
          </div>
        )}

        <form
          action={formAction}
          className="flex flex-col gap-2"
          data-testid={USER_STATUS_FORM_TESTID}
        >
          <input
            type="hidden"
            name={USER_STATUS_ID_FIELD}
            defaultValue={user.id}
            data-testid={USER_STATUS_ID_TESTID}
          />
          <span id={labelId} className="text-sm font-medium">
            {SELECT_LABEL}
          </span>
          {/*
            Los CUATRO valores, derivados del conjunto cerrado del contrato. Ninguno se excluye por
            el estado actual (R32, R34): el punto de partida es solo el valor preseleccionado.
          */}
          <Select
            name={USER_STATUS_FIELD}
            defaultValue={user.accountStatus}
            items={USER_ACCOUNT_STATUSES.map((status) => ({
              label: USER_ACCOUNT_STATUS_LABELS[status],
              value: status,
            }))}
          >
            <SelectTrigger
              aria-labelledby={labelId}
              className={`w-full ${TOUCH_TARGET} ${FIELD_TEXT}`}
              data-testid={USER_STATUS_SELECT_TESTID}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_ACCOUNT_STATUSES.map((status) => (
                <SelectItem
                  key={status}
                  value={status}
                  data-testid={USER_STATUS_OPTION_TESTID}
                  data-status={status}
                >
                  {USER_ACCOUNT_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialogFooter>
            <AlertDialogCancel className={TOUCH_TARGET} data-testid={USER_STATUS_DISMISS_TESTID}>
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              className={TOUCH_TARGET}
              disabled={isPending}
              aria-busy={isPending}
              data-testid={USER_STATUS_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
