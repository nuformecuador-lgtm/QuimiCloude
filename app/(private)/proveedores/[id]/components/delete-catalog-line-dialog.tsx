'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import type { CatalogLineView } from '@/lib/modules/proveedores';
import {
  deleteCatalogLineAction,
  type CatalogLineMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DELETE_SUCCESS = 'Línea de catálogo dada de baja.';

const INITIAL_STATE: CatalogLineMutationFormState = { status: 'idle' };

/**
 * Confirmacion de la baja de una linea de catalogo. Dice que no se puede deshacer porque, aunque
 * en la base es un borrado logico, no hay forma de restaurarla. Con error el dialogo sigue abierto
 * con el mensaje a la vista: cerrarlo haria creer que la linea se dio de baja.
 */
export function DeleteCatalogLineDialog({ line }: { readonly line: CatalogLineView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteCatalogLineAction, INITIAL_STATE);

  // Se deriva del resultado para no cerrar con un `setState` dentro de un efecto.
  const open = requestedOpen && state.status !== 'success';

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(DELETE_SUCCESS);
    router.refresh();
  }, [state, router]);

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={(next) => setRequestedOpen(next)}
      trigger={{
        render: (
          <Button
            variant="ghost"
            className={touchTarget}
            aria-label={`Dar de baja ${line.name}`}
            data-testid="catalog-line-delete-open"
          />
        ),
        children: <Trash2Icon />,
      }}
      texts={{
        title: 'Dar de baja la línea',
        description: <>Se va a dar de baja «{line.name}». Esta acción no se puede deshacer.</>,
        dismiss: 'Cancelar',
        confirm: 'Dar de baja',
      }}
      testIds={{
        dialog: 'delete-catalog-line-dialog',
        message: 'delete-catalog-line-message',
        dismiss: 'delete-catalog-line-cancel',
        confirm: 'delete-catalog-line-confirm',
        error: 'delete-catalog-line-error',
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: 'id', value: line.id, testId: 'delete-catalog-line-id' }],
      }}
      error={state.status === 'error' ? state : undefined}
      errorStyle="inline"
    />
  );
}
