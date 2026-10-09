'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  deleteProductAction,
  type ProductMutationFormState,
} from '@/lib/modules/inventario/adapters/driving/product-actions';
import type { ProductView } from '@/lib/modules/inventario';

const DELETE_SUCCESS = 'Producto borrado.';

const INITIAL_STATE: ProductMutationFormState = { status: 'idle' };

/**
 * Confirmacion de borrado de un producto. Nombra el producto y dice que no se puede deshacer: el
 * borrado es logico, pero no hay forma de restaurarlo.
 *
 * Con error el dialogo sigue abierto con el mensaje a la vista: cerrarlo haria creer que se borro.
 */
export function DeleteProductDialog({ product }: { readonly product: ProductView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteProductAction, INITIAL_STATE);

  // Derivado y no un `setState` en el efecto, que `react-hooks/set-state-in-effect` prohibe.
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
            touch
            aria-label={`Borrar ${product.name}`}
            data-testid="product-delete-open"
          />
        ),
        children: <Trash2Icon />,
      }}
      texts={{
        title: 'Borrar producto',
        description: <>Se va a borrar «{product.name}». Esta acción no se puede deshacer.</>,
        dismiss: 'Cancelar',
        confirm: 'Borrar',
      }}
      testIds={{
        dialog: 'delete-product-dialog',
        message: 'delete-product-message',
        dismiss: 'delete-product-cancel',
        confirm: 'delete-product-confirm',
        error: 'delete-product-error',
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: 'id', value: product.id, testId: 'delete-product-id' }],
      }}
      error={state.status === 'error' ? state : undefined}
      errorStyle="inline"
    />
  );
}
