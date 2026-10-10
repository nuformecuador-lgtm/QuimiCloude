'use client';

import type { ReactNode } from 'react';

import {
  ConfirmDialog,
  ConfirmDialogBody,
  type ConfirmDialogBodyProps,
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
 * Los textos por defecto van en pareja: quien cambia el de confirmar decide también el de
 * pendiente, para no mezclar «Borrar» con «Eliminando…».
 */
function withDeleteDefaults(texts: DeleteConfirmDialogTexts): ConfirmDialogTexts {
  const confirm = texts.confirm ?? DELETE_CONFIRM_LABEL;
  const pending =
    texts.pending ?? (texts.confirm === undefined ? DELETE_CONFIRM_PENDING_LABEL : undefined);
  return { ...texts, confirm, pending };
}

/** Variante destructiva de `ConfirmDialog`. */
export function DeleteConfirmDialog({ texts, ...props }: DeleteConfirmDialogProps) {
  return <ConfirmDialog {...props} variant="destructive" texts={withDeleteDefaults(texts)} />;
}

export type DeleteConfirmDialogBodyProps = Omit<ConfirmDialogBodyProps, 'variant' | 'texts'> & {
  readonly texts: DeleteConfirmDialogTexts;
};

/** Variante destructiva de `ConfirmDialogBody`, para usarla dentro de `ConfirmDialogFrame`. */
export function DeleteConfirmDialogBody({ texts, ...props }: DeleteConfirmDialogBodyProps) {
  return <ConfirmDialogBody {...props} variant="destructive" texts={withDeleteDefaults(texts)} />;
}
