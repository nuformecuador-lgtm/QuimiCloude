'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import {
  deleteOrderAction,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

/**
 * Confirmacion del borrado de un pedido (R38, R35, `design.md > 8`).
 *
 * **El dialogo nombra el pedido por su CORRELATIVO** -`formatOrderNumber(order.number)`, la
 * funcion del contrato, nunca el uuid y nunca `${year}-${sequence}` a mano (R10, R38)-. Un
 * identificador tecnico en una confirmacion irreversible no dice al usuario cual de sus pedidos
 * esta a punto de desaparecer.
 *
 * **Se presenta como irreversible porque para quien lo usa lo es.** En base es borrado LOGICO
 * (`deletedAt`), pero el backend **no expone ninguna forma de restaurar**: prometer una vuelta
 * atras que no existe es peor que no ofrecerla. Mismo criterio que `delete-supplier-dialog.tsx`.
 *
 * **Sin confirmar no se invoca NADA** (R38): la operacion sale del `submit` del formulario que
 * vive DENTRO del contenido del dialogo, y ese formulario solo se envia al pulsar el boton de
 * confirmar. El `id` viaja en un `input` oculto, que es la forma que `deleteOrderAction` espera
 * -lo dice su propia cabecera-, asi que no hace falta `bind`.
 *
 * **`not_deletable` se pinta AQUI** (`design.md > 8`), en la region de error de este dialogo, y
 * se decide por el `code` estable, nunca por el texto (R34). Con error el dialogo **sigue
 * abierto**: cerrarlo dejaria al usuario creyendo que el pedido se borro.
 *
 * **Con exito se aplica R35**: cerrar, avisar por toast sobre el `<Toaster />` que el layout
 * privado ya monta -**no se monta otro** (R36)- y `router.refresh()` con la MISMA URL, que
 * conserva pagina, orden y filtros.
 *
 * **Apertura CONTROLADA**: quien dispara es `OrderRowActions`, en la fila. Aqui no hay
 * disparador propio, igual que en el dialogo de cancelacion.
 */

export const DELETE_ORDER_DIALOG_TESTID = 'delete-order-dialog';
export const DELETE_ORDER_MESSAGE_TESTID = 'delete-order-message';
export const DELETE_ORDER_CONFIRM_TESTID = 'delete-order-confirm';
export const DELETE_ORDER_DISMISS_TESTID = 'delete-order-dismiss';
export const DELETE_ORDER_ERROR_TESTID = 'delete-order-error';
export const DELETE_ORDER_ID_TESTID = 'delete-order-id';

/** Nombre del campo del `FormData` que lee el adaptador driving (`design.md > 4`). */
export const DELETE_ORDER_ID_FIELD = 'id';

const TITLE = 'Eliminar el pedido';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Pedido eliminado.';

const INITIAL_STATE: OrderMutationFormState = { status: 'idle' };

export type DeleteOrderDialogProps = {
  /** El pedido llega por props desde la fila (R43). */
  readonly order: OrderSummary;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeleteOrderDialog({ order, open, onOpenChange }: DeleteOrderDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteOrderAction, INITIAL_STATE);

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
        description: (
          <>
            Se va a eliminar el pedido {formatOrderNumber(order.number)}. Esta acción no se puede
            deshacer.
          </>
        ),
        dismiss: DISMISS_LABEL,
      }}
      testIds={{
        dialog: DELETE_ORDER_DIALOG_TESTID,
        message: DELETE_ORDER_MESSAGE_TESTID,
        dismiss: DELETE_ORDER_DISMISS_TESTID,
        confirm: DELETE_ORDER_CONFIRM_TESTID,
        form: 'delete-order-form',
        error: DELETE_ORDER_ERROR_TESTID,
        errorMessage: 'delete-order-error-message',
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: DELETE_ORDER_ID_FIELD, value: order.id, testId: DELETE_ORDER_ID_TESTID }],
      }}
      isPending={isPending}
      error={error}
      errorId={errorId}
    />
  );
}
