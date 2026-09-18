'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

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
import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { useRateLimitedActionState } from '@/hooks/use-rate-limited-action-state';
import { Textarea } from '@/components/ui/textarea';
import { UNEXPECTED_ERROR_CODE, type ErrorCode } from '@/lib/modules/errores';
import { cancelOrderSchema, formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import {
  cancelOrderAction,
  type OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

/**
 * Dialogo de cancelacion de un pedido, con su MOTIVO (R37, R35, R34, `design.md > 8`).
 *
 * **Es un dialogo PROPIO**, distinto del formulario de edicion y del de borrado (R37). No es un
 * campo mas del panel lateral y no es una opcion del selector de estado: `cancelOrderAction` es
 * el UNICO camino a `CANCELADO` -`updateOrderAction` no puede ni formularlo, porque
 * `EDITABLE_STATUS_VALUES` excluye ese estado por construccion (`design.md > 0`)-, asi que la
 * cancelacion tiene su propia puerta y su propio motivo obligatorio.
 *
 * **La regla del motivo es la del contrato, no una copia**: `cancelOrderSchema` (recorte,
 * minimo 1, tope 500) se importa del **barrel** de `pedidos`, que es client-safe, y se aplica
 * ANTES de enviar. El caso de uso revalida con ese mismo esquema: el cliente nunca es la
 * frontera, solo evita un viaje que ya se sabe perdido.
 *
 * **Mientras el motivo este vacio no se invoca NADA** (R37). Dos cierres, no uno: el boton de
 * confirmar va `disabled` -el motivo se mide RECORTADO, para que una tecla de espacio no lo
 * habilite- y, si el envio llegara por cualquier otra via, la validacion previa lo rechaza sin
 * llamar a la operacion.
 *
 * **El `id` viaja en un `input` oculto** y no por `bind`: es la forma que `cancelOrderAction`
 * espera -lo dice su propia cabecera-, junto al campo `reason`.
 *
 * **`not_cancellable` se pinta AQUI** (`design.md > 8`), en la region de error de este dialogo, y
 * la decision es por el `code` estable, nunca por el texto del mensaje (R34). Con error el
 * dialogo **sigue abierto** con el motivo escrito: cerrarlo dejaria al usuario creyendo que el
 * pedido se cancelo.
 *
 * **Con exito se aplica R35**: se cierra, se avisa por toast sobre el `<Toaster />` que el layout
 * privado ya monta -**no se monta otro** (R36)- y se refresca la lista con `router.refresh()`,
 * que reejecuta el Server Component con la MISMA URL y conserva pagina, orden y filtros.
 *
 * **Apertura CONTROLADA y montaje bajo demanda.** Quien dispara es `OrderRowActions`, en la fila,
 * asi que aqui no hay disparador propio. Quien compone monta el dialogo solo mientras esta
 * abierto: asi cada apertura arranca con el estado de accion limpio y un intento anterior no deja
 * restos.
 */

export const CANCEL_ORDER_DIALOG_TESTID = 'cancel-order-dialog';
export const CANCEL_ORDER_REASON_TESTID = 'cancel-order-reason';
export const CANCEL_ORDER_CONFIRM_TESTID = 'cancel-order-confirm';
export const CANCEL_ORDER_DISMISS_TESTID = 'cancel-order-dismiss';
export const CANCEL_ORDER_ERROR_TESTID = 'cancel-order-error';
export const CANCEL_ORDER_ID_TESTID = 'cancel-order-id';

/** Nombres de campo del `FormData`, los que lee el adaptador driving (`design.md > 4`). */
export const CANCEL_ORDER_ID_FIELD = 'id';
export const CANCEL_ORDER_REASON_FIELD = 'reason';

const TOUCH_TARGET = 'min-h-11 min-w-11';
/** 16 px en TODOS los anchos: por debajo, Safari en iOS hace zoom al enfocar el campo (R45). */
const FIELD_TEXT = 'text-base md:text-base';

const TITLE = 'Cancelar el pedido';
const REASON_LABEL = 'Motivo de la cancelación';
const CONFIRM_LABEL = 'Cancelar el pedido';
const CONFIRM_PENDING_LABEL = 'Cancelando…';
const DISMISS_LABEL = 'Volver';
const CANCEL_SUCCESS = 'Pedido cancelado.';
/**
 * QC-70 (R21): el codigo que este dialogo FABRICA cuando su validacion previa rechaza el motivo
 * sale del catalogo -tipado `ErrorCode`, la union cerrada-, no de un literal escrito aqui. El
 * valor no cambia.
 *
 * Lo que NO sale del catalogo es `REASON_REQUIRED`: es el texto de una comprobacion PROPIA del
 * formulario, y esta ficha no toca la validacion del front (R31, `design.md > 6 bis`). Lo que
 * manda el catalogo es el mensaje de los errores que emite el back, y esos llegan ya resueltos
 * en `result.message`.
 */
// QC-71 (R16): `satisfies` en vez de anotacion. Con `ErrorState` ya partido en dos ramas, un
// `ErrorCode` ancho incluiria el codigo generico, que exige `reference`, y este rechazo previo no
// tiene ninguno que dar. El literal conserva su tipo y sigue obligado a estar en el catalogo.
const INVALID_INPUT_CODE = 'invalid_input' satisfies ErrorCode;
const REASON_REQUIRED = 'Escribe el motivo de la cancelación.';

const INITIAL_STATE: OrderMutationFormState = { status: 'idle' };

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export type CancelOrderDialogProps = {
  /** El pedido llega por props desde la fila (R43): aqui no se pide nada por cuenta propia. */
  readonly order: OrderSummary;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function CancelOrderDialog({ order, open, onOpenChange }: CancelOrderDialogProps) {
  const fieldId = useId();
  const reasonId = `${fieldId}-reason`;
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [reason, setReason] = useState('');

  const [state, formAction, isPending] = useRateLimitedActionState(
    async (
      _previous: OrderMutationFormState,
      formData: FormData,
    ): Promise<OrderMutationFormState> => {
      // La MISMA regla que valida el caso de uso (R33): no se reescribe el minimo ni el tope.
      const parsed = cancelOrderSchema.safeParse({
        reason: readString(formData, CANCEL_ORDER_REASON_FIELD),
      });

      if (!parsed.success) {
        // Rechazo previo: la operacion NO se invoca (R37).
        return { status: 'error', code: INVALID_INPUT_CODE, message: REASON_REQUIRED };
      }

      const result = await cancelOrderAction({ status: 'idle' }, formData);
      return result.status === 'error' ? result : { status: 'success' };
    },
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status !== 'success') return;
    // R35, en este orden: cerrar, avisar y poner la lista al dia sin recargar la pantalla.
    onOpenChange(false);
    toast.success(CANCEL_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;
  // El motivo se mide RECORTADO, igual que lo mide el esquema del contrato.
  const isEmpty = reason.trim() === '';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={CANCEL_ORDER_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription data-testid="cancel-order-message">
            {/* El pedido se nombra por su CORRELATIVO, nunca por el uuid (R10). */}
            Se va a cancelar el pedido {formatOrderNumber(order.number)}. Un pedido cancelado ya no
            se puede editar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="flex flex-col gap-3" data-testid="cancel-order-form">
          <input
            type="hidden"
            name={CANCEL_ORDER_ID_FIELD}
            defaultValue={order.id}
            data-testid={CANCEL_ORDER_ID_TESTID}
          />

          <div className="flex flex-col gap-2">
            <label htmlFor={reasonId} className="text-sm font-medium">
              {REASON_LABEL}
            </label>
            <Textarea
              id={reasonId}
              name={CANCEL_ORDER_REASON_FIELD}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={FIELD_TEXT}
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby={error === undefined ? undefined : errorId}
              data-testid={CANCEL_ORDER_REASON_TESTID}
            />
          </div>

          {/* Region de error del DIALOGO (`design.md > 8`): aqui aterriza `not_cancellable`. */}
          {error === undefined ? null : (
            <div
              role="alert"
              id={errorId}
              className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
              data-testid={CANCEL_ORDER_ERROR_TESTID}
              data-code={error.code}
            >
              {/*
                QC-71 (R17, R18): el error INESPERADO lo pinta el componente compartido, que anade
                el identificador de la peticion. El CATALOGADO -`not_cancellable` entre otros- se
                pinta como siempre y sin identificador.
              */}
              {error.code === UNEXPECTED_ERROR_CODE ? (
                <UnexpectedErrorNotice state={error} />
              ) : (
                <p data-testid="cancel-order-error-message">{error.message}</p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className={TOUCH_TARGET} data-testid={CANCEL_ORDER_DISMISS_TESTID}>
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={TOUCH_TARGET}
              disabled={isEmpty || isPending}
              aria-busy={isPending}
              data-testid={CANCEL_ORDER_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
