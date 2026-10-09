'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { USER_ACCOUNT_STATUSES, type UserRow } from '@/lib/modules/identity';
import {
  setUserAccountStatusAction,
  type UserMutationFormState,
} from '@/lib/modules/identity/adapters/driving/user-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      texts={{
        title: TITLE,
        description: <>Elige el estado de la cuenta de {user.displayName}.</>,
        dismiss: DISMISS_LABEL,
        confirm: CONFIRM_LABEL,
        pending: CONFIRM_PENDING_LABEL,
      }}
      testIds={{
        dialog: USER_STATUS_DIALOG_TESTID,
        message: USER_STATUS_MESSAGE_TESTID,
        dismiss: USER_STATUS_DISMISS_TESTID,
        confirm: USER_STATUS_CONFIRM_TESTID,
        form: USER_STATUS_FORM_TESTID,
        error: USER_STATUS_ERROR_TESTID,
        errorMessage: USER_STATUS_ERROR_MESSAGE_TESTID,
      }}
      submit={{
        kind: 'action',
        action: formAction,
        formClassName: 'flex flex-col gap-2',
        hidden: [{ name: USER_STATUS_ID_FIELD, value: user.id, testId: USER_STATUS_ID_TESTID }],
      }}
      isPending={isPending}
      error={error}
      errorId={errorId}
    >
      <span id={labelId} className="text-sm font-medium">
        {SELECT_LABEL}
      </span>
      {/* Ningún valor se excluye por el estado actual: el de partida solo va preseleccionado. */}
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
          className={`w-full ${touchTarget} ${FIELD_TEXT}`}
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
    </ConfirmDialog>
  );
}
