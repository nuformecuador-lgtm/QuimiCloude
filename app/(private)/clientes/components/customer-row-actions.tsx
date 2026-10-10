'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { RowActionsMenu, type RowActionMenuItem } from '@/components/shared/row-actions-menu';
import type { CustomerView } from '@/lib/modules/clientes';

import { DeleteCustomerDialog } from './delete-customer-dialog';
import { CustomerSheet } from './customer-sheet';

/**
 * Las dos acciones de fila de un cliente, editar y dar de baja, en el menu de tres puntos de la
 * fila.
 *
 * Con `canModify === false` la celda queda VACIA: sin disparador, sin nada en el DOM. Quien
 * autoriza de verdad es el caso de uso; `canModify` decide solo que se emite en el HTML.
 *
 * El disparador nombra al cliente en su nombre accesible; los items dicen solo el verbo.
 *
 * El dialogo de baja, una vez abierto por primera vez, queda montado y se cierra por estado: asi
 * su salida anima. Antes de la primera apertura no se monta, para no cargar cada fila.
 *
 * El cliente llega por props: este componente no importa `lib/composition`, ni el cliente de
 * base de datos, ni pide nada por su cuenta.
 */

export const CUSTOMER_ROW_ACTIONS_TESTID = 'customer-row-actions';
export const CUSTOMER_ACTION_EDIT_TESTID = 'customer-action-edit';
export const CUSTOMER_ACTION_DELETE_TESTID = 'customer-action-delete';

const EDIT_ACTION_LABEL = 'Editar';
const DELETE_ACTION_LABEL = 'Eliminar';

function fullName(customer: CustomerView): string {
  return `${customer.firstNames} ${customer.lastNames}`;
}

export function editCustomerLabel(name: string): string {
  return `Editar el cliente ${name}`;
}

export function deleteCustomerLabel(name: string): string {
  return `Eliminar el cliente ${name}`;
}

/** Nombre accesible del disparador del menu de la fila. */
export function customerRowActionsLabel(name: string): string {
  return `Acciones de ${name}`;
}

export type CustomerRowActionsProps = {
  readonly customer: CustomerView;
  /** Si la sesion trae `clientes.modificar`. Decision de presentacion, bajada por props. */
  readonly canModify: boolean;
};

export function CustomerRowActions({ customer, canModify }: CustomerRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  // `null`: el dialogo aun no se abrio nunca y no se monta.
  const [deleteOpen, setDeleteOpen] = useState<boolean | null>(null);

  if (!canModify) return null;

  const items: RowActionMenuItem[] = [
    {
      key: 'edit',
      label: EDIT_ACTION_LABEL,
      icon: PencilIcon,
      onSelect: () => setEditOpen(true),
      testId: CUSTOMER_ACTION_EDIT_TESTID,
    },
    {
      key: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: TrashIcon,
      onSelect: () => setDeleteOpen(true),
      destructive: true,
      testId: CUSTOMER_ACTION_DELETE_TESTID,
    },
  ];

  return (
    <>
      <RowActionsMenu
        items={items}
        triggerLabel={customerRowActionsLabel(fullName(customer))}
        triggerTestId={CUSTOMER_ROW_ACTIONS_TESTID}
        triggerDataAttributes={{ 'data-customer-id': customer.id }}
      />

      <CustomerSheet customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      {deleteOpen === null ? null : (
        <DeleteCustomerDialog
          customer={customer}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </>
  );
}
