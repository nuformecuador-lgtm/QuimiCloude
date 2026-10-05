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

const TOUCH_TARGET = 'min-h-11 min-w-11';

export type ConfirmActionDialogTexts = {
  readonly title: string;
  readonly description: string;
  readonly cancel: string;
  readonly confirm: string;
};

export type ConfirmActionDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly texts: ConfirmActionDialogTexts;
  /** El del dialogo; el de su boton de confirmar es `confirmTestId`. */
  readonly testId: string;
  readonly confirmTestId: string;
};

/**
 * Confirmacion controlada y sin disparador propio: quien la usa decide cuando abrirla. Al
 * confirmar se cierra antes de llamar a `onConfirm`, para que la accion no corra con el dialogo
 * aun encima.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  onConfirm,
  texts,
  testId,
  confirmTestId,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>{texts.title}</AlertDialogTitle>
          <AlertDialogDescription>{texts.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={TOUCH_TARGET} data-testid={`${testId}-cancel`}>
            {texts.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className={TOUCH_TARGET}
            data-testid={confirmTestId}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {texts.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
