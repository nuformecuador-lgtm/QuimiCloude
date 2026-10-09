'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import type { WorkGroupRow } from '@/lib/modules/identity';
import {
  deleteWorkGroupAction,
  type WorkGroupMutationFormState,
} from '@/lib/modules/identity/adapters/driving/work-group-actions';

import { WORK_GROUP_ID_FIELD } from './work-group-form';

/**
 * La confirmacion del borrado de un grupo de trabajo (R33, R34, R35; `design.md > 6`).
 *
 * **Nombra al grupo** por su `name` y advierte que la accion no se puede deshacer (R33): con diez
 * o veinticinco filas en pantalla, «¿seguro?» a secas no dice cual.
 *
 * **MIENTRAS no se confirme, la operacion NO se invoca** (R33): el unico camino hasta
 * `deleteWorkGroupAction` es el envio del formulario, y ese formulario solo lo envia el boton de
 * confirmar. **Abrir el dialogo no escribe nada.**
 *
 * **Un rechazo se pinta DENTRO del dialogo, por su `code` y nunca por su texto** (R34), el dialogo
 * **sigue abierto** y **la fila no se retira**. El dialogo se monta solo mientras esta abierto,
 * asi que un rechazo anterior no reaparece.
 *
 * Con exito se aplica R35: cerrar, avisar por toast —sobre el `<Toaster />` del layout privado, no
 * uno propio— y `router.refresh()`, que reejecuta la lista con la MISMA URL y por tanto conserva
 * pestana y parametros.
 *
 * **El identificador viaja como campo oculto con el MISMO nombre que lee la action**
 * (`WORK_GROUP_ID_FIELD`, declarado por el formulario): un solo nombre publico, un solo archivo.
 */

export const DELETE_WORK_GROUP_DIALOG_TESTID = 'delete-work-group-dialog';
export const DELETE_WORK_GROUP_MESSAGE_TESTID = 'delete-work-group-message';
export const DELETE_WORK_GROUP_CONFIRM_TESTID = 'delete-work-group-confirm';
export const DELETE_WORK_GROUP_DISMISS_TESTID = 'delete-work-group-dismiss';
export const DELETE_WORK_GROUP_ERROR_TESTID = 'delete-work-group-error';
export const DELETE_WORK_GROUP_ERROR_MESSAGE_TESTID = 'delete-work-group-error-message';
export const DELETE_WORK_GROUP_FORM_TESTID = 'delete-work-group-form';
export const DELETE_WORK_GROUP_ID_TESTID = 'delete-work-group-id';

const TITLE = 'Eliminar el grupo';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Grupo eliminado.';

/** R36: el estado inicial lo construye esta pantalla, no la action. */
const INITIAL_STATE: WorkGroupMutationFormState = { status: 'idle' };

export type DeleteWorkGroupDialogProps = {
  readonly group: WorkGroupRow;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeleteWorkGroupDialog({ group, open, onOpenChange }: DeleteWorkGroupDialogProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteWorkGroupAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R35, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      texts={{
        title: TITLE,
        description: <>Se va a eliminar el grupo {group.name}. Esta acción no se puede deshacer.</>,
        dismiss: DISMISS_LABEL,
      }}
      testIds={{
        dialog: DELETE_WORK_GROUP_DIALOG_TESTID,
        message: DELETE_WORK_GROUP_MESSAGE_TESTID,
        dismiss: DELETE_WORK_GROUP_DISMISS_TESTID,
        confirm: DELETE_WORK_GROUP_CONFIRM_TESTID,
        form: DELETE_WORK_GROUP_FORM_TESTID,
        error: DELETE_WORK_GROUP_ERROR_TESTID,
        errorMessage: DELETE_WORK_GROUP_ERROR_MESSAGE_TESTID,
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [
          { name: WORK_GROUP_ID_FIELD, value: group.id, testId: DELETE_WORK_GROUP_ID_TESTID },
        ],
      }}
      isPending={isPending}
      error={error}
    />
  );
}
