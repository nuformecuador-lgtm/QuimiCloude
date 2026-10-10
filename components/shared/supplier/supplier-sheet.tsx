'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { SupplierView } from '@/lib/modules/proveedores';
import { touchTarget } from '@/lib/shared/ui/touch-target';

import { SupplierForm } from './supplier-form';

const CREATE_LABEL = 'Nuevo proveedor';
const CREATE_SUCCESS = 'Proveedor creado.';
const UPDATE_SUCCESS = 'Proveedor actualizado.';

/**
 * Panel lateral de alta y edicion de proveedor, con su propio disparador y su propio estado: asi la
 * tabla no tiene que coordinar que fila esta abierta y puede seguir siendo un Server Component.
 * El panel lo pinta `SupplierForm`, que es quien tiene la `action` del `<form>`.
 */
export function SupplierSheet({ supplier }: { readonly supplier?: SupplierView }) {
  const isEdit = supplier !== undefined;
  const { isOpen, changeOpen, handleSaved } = useEntitySheet({
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  return (
    <Sheet open={isOpen} onOpenChange={(next) => changeOpen(next)}>
      <SheetTrigger
        render={
          <Button
            variant={isEdit ? 'ghost' : 'default'}
            className={touchTarget}
            aria-label={isEdit ? `Editar ${supplier.name}` : undefined}
            data-testid={isEdit ? 'supplier-edit-open' : 'supplier-create-open'}
          />
        }
      >
        {isEdit ? <PencilIcon /> : <PlusIcon />}
        {isEdit ? null : CREATE_LABEL}
      </SheetTrigger>
      <SupplierForm supplier={supplier} onSaved={handleSaved} />
    </Sheet>
  );
}
