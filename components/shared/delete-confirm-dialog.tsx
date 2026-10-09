'use client';

import type { ReactNode } from 'react';

import {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmDialogTexts,
} from '@/components/shared/confirm-dialog';

export const DELETE_CONFIRM_LABEL = 'Eliminar';
export const DELETE_CONFIRM_PENDING_LABEL = 'Eliminando…';

export type DeleteConfirmDialogTexts = Omit<ConfirmDialogTexts, 'confirm' | 'pending'> & {
  readonly confirm?: ReactNode;
  readonly pending?: ReactNode;
};

export type DeleteConfirmDialogProps = Omit<ConfirmDialogProps, 'variant' | 'texts'> & {
  readonly texts: DeleteConfirmDialogTexts;
};

/**
 * Variante destructiva de `ConfirmDialog`. Los textos por defecto van en pareja: quien cambia el
 * de confirmar decide también el de pendiente, para no mezclar «Borrar» con «Eliminando…».
 */
export function DeleteConfirmDialog({ texts, ...props }: DeleteConfirmDialogProps) {
  const confirm = texts.confirm ?? DELETE_CONFIRM_LABEL;
  const pending =
    texts.pending ?? (texts.confirm === undefined ? DELETE_CONFIRM_PENDING_LABEL : undefined);
  return (
    <ConfirmDialog {...props} variant="destructive" texts={{ ...texts, confirm, pending }} />
  );
}
