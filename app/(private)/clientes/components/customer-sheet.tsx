'use client';

import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { useEntitySheet } from '@/hooks/use-entity-sheet';
import type { CustomerView } from '@/lib/modules/clientes';

import { CustomerForm } from './customer-form';

/**
 * Panel lateral de alta y edicion de cliente.
 *
 * Abrir y cerrar no navega, asi que la lista de detras conserva pagina, tamano, orden y busqueda:
 * el estado de lista vive en la cadena de consulta, y este panel no la toca.
 *
 * Un solo panel para los dos modos. Sin `open`, trae su propio disparador y su propio estado: es
 * el alta. Con `open`/`onOpenChange` es controlado y no monta disparador: es el enganche de la
 * edicion desde la fila.
 *
 * El contenido se monta solo mientras el panel esta abierto, asi que la edicion siempre precarga
 * los valores actuales y un intento fallido anterior no deja restos.
 *
 * Con exito: cerrar, avisar por toast sobre el `<Toaster />` que ya monta el layout privado -no se
 * monta otro- y `router.refresh()`, que reejecuta el Server Component de la lista con la MISMA
 * URL. Sin `revalidatePath`: exigiria abrir el adaptador driving de `clientes`.
 */

export const CUSTOMER_CREATE_OPEN_TESTID = 'customer-create-open';

/**
 * Se reexporta desde `customer-form.tsx`, que es quien pinta el `SheetContent`: asi los
 * consumidores del panel tienen un solo sitio del que importarlo.
 */
export { CUSTOMER_SHEET_TESTID } from './customer-form';

const CREATE_LABEL = 'Nuevo cliente';
const CREATE_SUCCESS = 'Cliente creado.';
const UPDATE_SUCCESS = 'Cliente actualizado.';

export type CustomerSheetProps = {
  /** Cliente que se edita. Ausente en el alta. */
  readonly customer?: CustomerView;
  /** Apertura controlada desde fuera. Ausente = el panel trae su propio disparador de alta. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
};

export function CustomerSheet({ customer, open, onOpenChange }: CustomerSheetProps) {
  const isEdit = customer !== undefined;
  const { isOpen, isControlled, changeOpen, handleSaved } = useEntitySheet({
    open,
    onOpenChange,
    successMessage: isEdit ? UPDATE_SUCCESS : CREATE_SUCCESS,
  });

  return (
    <Sheet open={isOpen} onOpenChange={changeOpen}>
      {isControlled ? null : (
        <SheetTrigger
          render={
            <Button
              variant="default"
              touch
              data-testid={CUSTOMER_CREATE_OPEN_TESTID}
            />
          }
        >
          <PlusIcon aria-hidden="true" />
          {CREATE_LABEL}
        </SheetTrigger>
      )}
      <CustomerForm customer={customer} onSaved={handleSaved} />
    </Sheet>
  );
}
