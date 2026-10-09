'use client';

import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { CustomerView } from '@/lib/modules/clientes';

import { DeleteCustomerDialog } from './delete-customer-dialog';
import { CustomerSheet } from './customer-sheet';

/**
 * Las dos acciones de fila de un cliente: editar y dar de baja.
 *
 * Con `canModify === false` la celda queda VACIA: sin botones, sin nada en el DOM. Quien autoriza
 * de verdad es el caso de uso; `canModify` decide solo que se emite en el HTML.
 *
 * Siempre visibles y siempre en el DOM: nada se descubre con `:hover` y cada control mide al
 * menos 44x44 px.
 *
 * Cada boton nombra al cliente sobre el que actua, en su `aria-label`.
 *
 * El cliente llega por props: este componente no importa `lib/composition`, ni el cliente de
 * base de datos, ni pide nada por su cuenta.
 */

export const CUSTOMER_ROW_ACTIONS_TESTID = 'customer-row-actions';
export const CUSTOMER_ACTION_EDIT_TESTID = 'customer-action-edit';
export const CUSTOMER_ACTION_DELETE_TESTID = 'customer-action-delete';

function fullName(customer: CustomerView): string {
  return `${customer.firstNames} ${customer.lastNames}`;
}

export function editCustomerLabel(name: string): string {
  return `Editar el cliente ${name}`;
}

export function deleteCustomerLabel(name: string): string {
  return `Eliminar el cliente ${name}`;
}

export type CustomerRowActionsProps = {
  readonly customer: CustomerView;
  /** Si la sesion trae `clientes.modificar`. Decision de presentacion, bajada por props. */
  readonly canModify: boolean;
};

export function CustomerRowActions({ customer, canModify }: CustomerRowActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!canModify) return null;

  const name = fullName(customer);

  return (
    <div
      className="flex items-center justify-end gap-1"
      data-testid={CUSTOMER_ROW_ACTIONS_TESTID}
      data-customer-id={customer.id}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        touch
        aria-label={editCustomerLabel(name)}
        data-testid={CUSTOMER_ACTION_EDIT_TESTID}
        onClick={() => setEditOpen(true)}
      >
        <PencilIcon aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        touch
        aria-label={deleteCustomerLabel(name)}
        data-testid={CUSTOMER_ACTION_DELETE_TESTID}
        onClick={() => setDeleteOpen(true)}
      >
        <TrashIcon aria-hidden="true" />
      </Button>

      <CustomerSheet customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      {deleteOpen ? (
        <DeleteCustomerDialog customer={customer} open onOpenChange={setDeleteOpen} />
      ) : null}
    </div>
  );
}
