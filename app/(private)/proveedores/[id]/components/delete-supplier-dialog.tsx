'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteConfirmDialog } from '@/components/shared/delete-confirm-dialog';
import { Button } from '@/components/ui/button';
import type { SupplierView } from '@/lib/modules/proveedores';
import {
  deleteSupplierAction,
  type SupplierMutationFormState,
} from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import { SUPPLIERS_ROUTE } from '@/lib/shared/routes';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const DELETE_SUCCESS = 'Proveedor dado de baja.';

const INITIAL_STATE: SupplierMutationFormState = { status: 'idle' };

/**
 * Confirmacion de la baja de un proveedor, montada en la cabecera de su detalle. Avisa del
 * arrastre de su catalogo. Con exito navega a la lista en vez de refrescar este mismo detalle,
 * que mostraria «no encontrado»; con error el dialogo sigue abierto con el mensaje a la vista.
 */
export function DeleteSupplierDialog({ supplier }: { readonly supplier: SupplierView }) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useActionState(deleteSupplierAction, INITIAL_STATE);

  // El dialogo abierto se deriva del pedido del usuario y del resultado de la operacion, para no
  // cerrar con un `setState` dentro de un efecto.
  const open = requestedOpen && state.status !== 'success';

  useEffect(() => {
    if (state.status !== 'success') return;
    toast.success(DELETE_SUCCESS);
    router.replace(SUPPLIERS_ROUTE);
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
            aria-label={`Dar de baja ${supplier.name}`}
            data-testid="supplier-delete-open"
          />
        ),
        children: <Trash2Icon />,
      }}
      texts={{
        title: 'Dar de baja el proveedor',
        description: <>Se va a dar de baja «{supplier.name}». Esta acción no se puede deshacer.</>,
        dismiss: 'Cancelar',
        confirm: 'Dar de baja',
      }}
      testIds={{
        dialog: 'delete-supplier-dialog',
        message: 'delete-supplier-message',
        dismiss: 'delete-supplier-cancel',
        confirm: 'delete-supplier-confirm',
        error: 'delete-supplier-error',
      }}
      submit={{
        kind: 'action',
        action: formAction,
        hidden: [{ name: 'id', value: supplier.id, testId: 'delete-supplier-id' }],
      }}
      aside={
        <p className="text-sm text-muted-foreground" data-testid="delete-supplier-cascade">
          Sus líneas de catálogo se dan de baja con él.
        </p>
      }
      error={state.status === 'error' ? state : undefined}
      errorStyle="inline"
    />
  );
}
