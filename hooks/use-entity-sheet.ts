'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

export type UseEntitySheetOptions = {
  /** Sin `open`, el panel lleva su propio estado y su propio disparador. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Aviso de éxito del modo (alta o edición). */
  readonly successMessage: string;
};

export type UseEntitySheetResult = {
  readonly isOpen: boolean;
  readonly isControlled: boolean;
  readonly changeOpen: (next: boolean) => void;
  /** Cierra, avisa y refresca, en ese orden. `message` sustituye al aviso del modo. */
  readonly handleSaved: (message?: string) => void;
};

/** Apertura y guardado de un panel de alta y edición. */
export function useEntitySheet({
  open,
  onOpenChange,
  successMessage,
}: UseEntitySheetOptions): UseEntitySheetResult {
  const [selfOpen, setSelfOpen] = useState(false);
  const router = useRouter();
  const isControlled = open !== undefined;
  const isOpen = open ?? selfOpen;

  const changeOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setSelfOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleSaved = useCallback(
    (message?: string) => {
      changeOpen(false);
      toast.success(message ?? successMessage);
      // `refresh` reejecuta el Server Component con la misma URL: la lista conserva página,
      // orden, filtros y búsqueda.
      router.refresh();
    },
    [changeOpen, successMessage, router],
  );

  return { isOpen, isControlled, changeOpen, handleSaved };
}
