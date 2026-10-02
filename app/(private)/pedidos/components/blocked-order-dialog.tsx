'use client';

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

export const BLOCKED_ORDER_DIALOG_TESTID = 'blocked-order-dialog';
export const BLOCKED_ORDER_MESSAGE_TESTID = 'blocked-order-message';
export const BLOCKED_ORDER_CONFIRM_TESTID = 'blocked-order-confirm';
export const BLOCKED_ORDER_DISMISS_TESTID = 'blocked-order-dismiss';

const TOUCH_TARGET = 'min-h-11 min-w-11';

const DEFAULT_TITLE = 'Material insuficiente';
const DEFAULT_CONFIRM_LABEL = 'Guardar bloqueado';
const DEFAULT_DISMISS_LABEL = 'Volver';

export type BlockedOrderDialogProps = {
  readonly open: boolean;
  /** El mensaje que devuelve la operacion junto al codigo. */
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly dismissLabel?: string;
};

export function BlockedOrderDialog({
  open,
  message,
  onConfirm,
  onDismiss,
  title = DEFAULT_TITLE,
  confirmLabel = DEFAULT_CONFIRM_LABEL,
  dismissLabel = DEFAULT_DISMISS_LABEL,
}: BlockedOrderDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <AlertDialogContent data-testid={BLOCKED_ORDER_DIALOG_TESTID}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription data-testid={BLOCKED_ORDER_MESSAGE_TESTID}>
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            type="button"
            className={TOUCH_TARGET}
            data-testid={BLOCKED_ORDER_DISMISS_TESTID}
          >
            {dismissLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className={TOUCH_TARGET}
            onClick={onConfirm}
            data-testid={BLOCKED_ORDER_CONFIRM_TESTID}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
