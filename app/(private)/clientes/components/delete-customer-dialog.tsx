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
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';
import type { CustomerView } from '@/lib/modules/clientes';
import {
  deleteCustomerAction,
  type CustomerMutationFormState,
} from '@/lib/modules/clientes/adapters/driving/customer-actions';

/**
 * Confirmacion de la baja de un cliente, calcada de `delete-unit-dialog.tsx`.
 *
 * El dialogo NOMBRA al cliente por sus nombres y apellidos completos, nunca por el uuid: el
 * uuid viaja donde tiene que viajar, en el campo oculto que la operacion lee.
 *
 * Sin confirmar no se invoca nada: la operacion sale del `submit` de un `<form>` dentro del
 * contenido del dialogo, y ese formulario solo se envia al pulsar confirmar.
 *
 * La baja es LOGICA. Cualquier rechazo se pinta dentro de este mismo dialogo, que sigue abierto,
 * y la fila sigue en la lista: cerrarlo dejaria creer que la baja se aplico. Se distingue por el
 * `code` estable, nunca por el texto.
 *
 * Con exito: cerrar, avisar por toast sobre el `<Toaster/>` que ya monta el layout privado -no se
 * monta otro- y `router.refresh()` con la MISMA URL.
 *
 * Apertura CONTROLADA: quien dispara es la fila. Aqui no hay disparador propio.
 */

export const DELETE_CUSTOMER_DIALOG_TESTID = 'delete-customer-dialog';
export const DELETE_CUSTOMER_MESSAGE_TESTID = 'delete-customer-message';
export const DELETE_CUSTOMER_CONFIRM_TESTID = 'delete-customer-confirm';
export const DELETE_CUSTOMER_DISMISS_TESTID = 'delete-customer-dismiss';
export const DELETE_CUSTOMER_ERROR_TESTID = 'delete-customer-error';
export const DELETE_CUSTOMER_ERROR_MESSAGE_TESTID = 'delete-customer-error-message';
export const DELETE_CUSTOMER_FORM_TESTID = 'delete-customer-form';
export const DELETE_CUSTOMER_ID_TESTID = 'delete-customer-id';

/** Nombre del campo del `FormData` que lee el adaptador driving (`customer-actions.ts`). */
export const DELETE_CUSTOMER_ID_FIELD = 'id';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const TITLE = 'Eliminar el cliente';
const CONFIRM_LABEL = 'Eliminar';
const CONFIRM_PENDING_LABEL = 'Eliminando…';
const DISMISS_LABEL = 'Volver';
const DELETE_SUCCESS = 'Cliente eliminado.';

const INITIAL_STATE: CustomerMutationFormState = { status: 'idle' };

/** Nombre completo del cliente, tal como el usuario lo ve en la lista. */
function fullName(customer: CustomerView): string {
  return `${customer.firstNames} ${customer.lastNames}`;
}

export type DeleteCustomerDialogProps = {
  /** El cliente llega por props desde la fila. */
  readonly customer: CustomerView;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
};

export function DeleteCustomerDialog({ customer, open, onOpenChange }: DeleteCustomerDialogProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(deleteCustomerAction, INITIAL_STATE);

  useEffect(() => {
    if (state.status !== 'success') return;
    onOpenChange(false);
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, onOpenChange, router]);

  const error = state.status === 'error' ? state : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={DELETE_CUSTOMER_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLE}</AlertDialogTitle>
          <AlertDialogDescription data-testid={DELETE_CUSTOMER_MESSAGE_TESTID}>
            Se va a eliminar el cliente {fullName(customer)}. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error === undefined ? null : (
          <div
            role="alert"
            id={errorId}
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
            data-testid={DELETE_CUSTOMER_ERROR_TESTID}
            data-code={error.code}
          >
            {error.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={error} />
            ) : (
              <p data-testid={DELETE_CUSTOMER_ERROR_MESSAGE_TESTID}>{error.message}</p>
            )}
          </div>
        )}

        <form action={formAction} data-testid={DELETE_CUSTOMER_FORM_TESTID}>
          <input
            type="hidden"
            name={DELETE_CUSTOMER_ID_FIELD}
            defaultValue={customer.id}
            data-testid={DELETE_CUSTOMER_ID_TESTID}
          />
          <AlertDialogFooter>
            <AlertDialogCancel className={TOUCH_TARGET} data-testid={DELETE_CUSTOMER_DISMISS_TESTID}>
              {DISMISS_LABEL}
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className={TOUCH_TARGET}
              disabled={isPending}
              aria-busy={isPending}
              data-testid={DELETE_CUSTOMER_CONFIRM_TESTID}
            >
              {isPending ? CONFIRM_PENDING_LABEL : CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
