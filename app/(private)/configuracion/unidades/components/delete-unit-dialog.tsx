'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import type { ErrorCode } from '@/lib/modules/errores';
import type { UnitView } from '@/lib/modules/unidades';
import {
  deleteUnitAction,
  type UnitMutationFormState,
} from '@/lib/modules/unidades/adapters/driving/unit-actions';

/**
 * Confirmacion del borrado de una unidad (R40, R41, R42, R38; `design.md > 8`).
 *
 * **El dialogo NOMBRA la unidad** por su `name` —lo que el usuario ve en la lista—, nunca por el
 * uuid: un identificador tecnico en una confirmacion irreversible no dice cual de las unidades
 * esta a punto de desaparecer. El uuid viaja donde tiene que viajar, en el campo oculto que la
 * operacion lee.
 *
 * **Sin confirmar no se invoca NADA** (R40): la operacion sale del `submit` de un `<form>` que
 * vive DENTRO del contenido del dialogo, y ese formulario solo se envia al pulsar confirmar. El
 * `id` va en un `input` oculto, que es la forma que `deleteUnitAction` espera, asi que no hace
 * falta `bind`.
 *
 * **Aqui el borrado es FISICO y el rechazo lo produce la FK real** (`ON DELETE RESTRICT`), no una
 * regla de estado: `unit_in_use` es el caso NORMAL, no el raro —la unidad puede usarla un
 * producto, una linea de receta **o otra unidad que derive de ella** (R41)—. Por eso el error se
 * pinta en la region de error de este mismo dialogo, que **sigue abierto** —cerrarlo dejaria al
 * usuario creyendo que se borro— y la fila sigue en la lista. Se distingue por el `code` ESTABLE,
 * jamas por el texto, y cualquier otro codigo se pinta igual (R42).
 *
 * **Con exito se aplica R38**: cerrar, avisar por toast sobre el `<Toaster />` que el layout
 * privado ya monta —**no se monta otro** (R39)— y `router.refresh()` con la MISMA URL, que
 * conserva pagina, tamano, orden y busqueda.
 *
 * **Apertura CONTROLADA**: quien dispara es la fila. Aqui no hay disparador propio.
 */

export const DELETE_UNIT_DIALOG_TESTID = 'delete-unit-dialog';
export const DELETE_UNIT_MESSAGE_TESTID = 'delete-unit-message';
export const DELETE_UNIT_CONFIRM_TESTID = 'delete-unit-confirm';
export const DELETE_UNIT_DISMISS_TESTID = 'delete-unit-dismiss';
export const DELETE_UNIT_ERROR_TESTID = 'delete-unit-error';
export const DELETE_UNIT_ERROR_MESSAGE_TESTID = 'delete-unit-error-message';
export const DELETE_UNIT_FORM_TESTID = 'delete-unit-form';
export const DELETE_UNIT_ID_TESTID = 'delete-unit-id';

/** Nombre del campo del `FormData` que lee el adaptador driving (`unit-actions.ts`). */
export const DELETE_UNIT_ID_FIELD = 'id';

/**
 * Codigo estable del rechazo por FK; por el se decide, nunca por el texto (R41, R42).
 *
 * QC-70 (R21): queda tipado con `ErrorCode`, la union cerrada del catalogo unico. Si el codigo se
 * renombra o se retira, esto rompe el typecheck en vez de dejar de coincidir en silencio y mandar
 * el mensaje a la region generica. Igual que `PRESENTATION_IN_USE_CODE`.
 */
export const UNIT_IN_USE_CODE: ErrorCode = 'unit_in_use';

const TITLE = 'Eliminar la unidad';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Unidad eliminada.';

const INITIAL_STATE: UnitMutationFormState = { status: 'idle' };

export type DeleteUnitDialogProps = {
  /** La unidad llega por props desde la fila (R46). */
  readonly unit: UnitView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeleteUnitDialog({ unit, open, onOpenChange }: DeleteUnitDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteUnitAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    // R38, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
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
        description: <>Se va a eliminar la unidad {unit.name}. Esta acción no se puede deshacer.</>,
        dismiss: DISMISS_LABEL,
      }}
      testIds={{
        dialog: DELETE_UNIT_DIALOG_TESTID,
        message: DELETE_UNIT_MESSAGE_TESTID,
        dismiss: DELETE_UNIT_DISMISS_TESTID,
        confirm: DELETE_UNIT_CONFIRM_TESTID,
        form: DELETE_UNIT_FORM_TESTID,
        error: DELETE_UNIT_ERROR_TESTID,
        errorMessage: DELETE_UNIT_ERROR_MESSAGE_TESTID,
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: DELETE_UNIT_ID_FIELD, value: unit.id, testId: DELETE_UNIT_ID_TESTID }],
      }}
      isPending={isPending}
      error={error}
      errorId={errorId}
    />
  );
}
