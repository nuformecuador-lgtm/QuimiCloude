'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';

export const ASSIGNED_ORDER_START_DIALOG_TESTID = 'assigned-order-start-dialog';
export const ASSIGNED_ORDER_START_CONFIRM_TESTID = 'assigned-order-start-confirm';

export function assignedOrderStartConfirmTexts() {
  return {
    title: '¿Comenzar el pedido?',
    description:
      'Una vez comenzado, el pedido no se puede devolver: tendrás que continuarlo hasta terminarlo.',
    cancel: 'Cancelar',
    confirm: 'Comenzar',
  } as const;
}

/**
 * «Entrar» de un pedido aun no comenzado. Abrir la ruta de ejecucion ya lo pasa a `EN_CURSO`,
 * asi que se pide confirmacion antes de navegar.
 */
export function AssignedOrderStartTrigger({
  href,
  testId,
  children,
}: {
  readonly href: string;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const texts = assignedOrderStartConfirmTexts();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        touch
        disabled={isPending}
        aria-busy={isPending}
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => startTransition(() => router.push(href))}
        texts={{
          title: texts.title,
          description: texts.description,
          dismiss: texts.cancel,
          confirm: texts.confirm,
        }}
        testIds={{
          dialog: ASSIGNED_ORDER_START_DIALOG_TESTID,
          dismiss: `${ASSIGNED_ORDER_START_DIALOG_TESTID}-cancel`,
          confirm: ASSIGNED_ORDER_START_CONFIRM_TESTID,
        }}
      />
    </>
  );
}
