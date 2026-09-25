// El panel lateral de alta y edicion de cliente.
//
// Las Server Actions estan mockeadas: son el borde del modulo `clientes`, que esta ficha no
// abre, y sustituirlas es lo unico que permite ejercitar el panel sin base de datos. La
// validacion previa del cliente NO se mockea: corre con el esquema real del contrato publico.
//
// Ningun assert sobre literales de copy: todo va por rol ARIA, `data-testid` exportado como
// constante, o codigos de error de las clases del dominio.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CUSTOMER_CREATE_OPEN_TESTID,
  CUSTOMER_FIELD_TESTIDS,
  CUSTOMER_FORM_CANCEL_TESTID,
  CUSTOMER_FORM_SUBMIT_TESTID,
  CUSTOMER_FORM_TESTID,
  CUSTOMER_SHEET_TESTID,
  CustomerSheet,
} from '@/app/(private)/clientes/components';
import type { CustomerView } from '@/lib/modules/clientes';
import type {
  CreateCustomerFormState,
  CustomerMutationFormState,
} from '@/lib/modules/clientes/adapters/driving/customer-actions';
import { setupUser } from '../../helpers/user-event';

const { routerMock, createCustomerActionMock, updateCustomerActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createCustomerActionMock:
    vi.fn<
      (prev: CreateCustomerFormState, data: FormData) => Promise<CreateCustomerFormState>
    >(),
  updateCustomerActionMock:
    vi.fn<
      (
        id: string,
        prev: CustomerMutationFormState,
        data: FormData,
      ) => Promise<CustomerMutationFormState>
    >(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/clientes/adapters/driving/customer-actions', () => ({
  createCustomerAction: createCustomerActionMock,
  updateCustomerAction: updateCustomerActionMock,
  deleteCustomerAction: vi.fn(() => {
    throw new Error('deleteCustomerAction no debe invocarse desde el panel lateral');
  }),
  getCustomerAction: vi.fn(() => {
    throw new Error('getCustomerAction no debe invocarse desde el panel lateral');
  }),
  listCustomersAction: vi.fn(() => {
    throw new Error('listCustomersAction no debe invocarse desde el panel lateral');
  }),
}));

const CLIENTE: CustomerView = {
  id: crypto.randomUUID(),
  firstNames: 'Ana María',
  lastNames: 'Pérez Gómez',
  city: 'Bogotá',
  phone: '3001234567',
  email: 'ana@example.com',
  address: 'Calle 1 # 2-3',
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

/** Disparador de fila simulado: la columna de acciones (T6a) hara exactamente esto. */
const ROW_EDIT_TESTID = 'fila-editar';

function FilaConPanel({ customer }: { readonly customer: CustomerView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid={ROW_EDIT_TESTID} onClick={() => setOpen(true)}>
        {customer.lastNames}
      </button>
      <CustomerSheet customer={customer} open={open} onOpenChange={setOpen} />
    </>
  );
}

let toastExito: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createCustomerActionMock.mockResolvedValue({ status: 'success', id: crypto.randomUUID() });
  updateCustomerActionMock.mockResolvedValue({ status: 'success' });
  toastExito = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

/** Abre el alta y espera al formulario. */
async function abrirAlta(user: ReturnType<typeof setupUser>) {
  render(<CustomerSheet />);
  await user.click(screen.getByTestId(CUSTOMER_CREATE_OPEN_TESTID));
  return screen.findByTestId(CUSTOMER_FORM_TESTID);
}

/** Rellena los tres campos obligatorios con datos minimos validos. */
async function rellenarObligatorios(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames), 'Luis');
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames), 'Rodríguez');
  await user.type(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.city), 'Cali');
}

describe('panel lateral de clientes (R24)', () => {
  it('el alta se abre en un panel lateral, sin navegar y sin dialogo modal centrado', async () => {
    const user = setupUser();
    await abrirAlta(user);

    const panel = screen.getByTestId(CUSTOMER_SHEET_TESTID);
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('cerrar el panel no navega: los parametros de lista de la URL siguen intactos', async () => {
    const user = setupUser();
    await abrirAlta(user);

    await user.click(screen.getByTestId(CUSTOMER_FORM_CANCEL_TESTID));

    await waitFor(() => expect(screen.queryByTestId(CUSTOMER_FORM_TESTID)).toBeNull());
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(createCustomerActionMock).not.toHaveBeenCalled();
  });

  it('la edicion abre el MISMO panel lateral, precargado con los datos del cliente', async () => {
    const user = setupUser();
    render(<FilaConPanel customer={CLIENTE} />);

    expect(screen.queryByTestId(CUSTOMER_FORM_TESTID)).toBeNull();

    await user.click(screen.getByTestId(ROW_EDIT_TESTID));

    await screen.findByTestId(CUSTOMER_FORM_TESTID);
    const panel = screen.getByTestId(CUSTOMER_SHEET_TESTID);
    expect(panel).toHaveAttribute('data-slot', 'sheet-content');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.firstNames)).toHaveValue(CLIENTE.firstNames);
    expect(screen.getByTestId(CUSTOMER_FIELD_TESTIDS.lastNames)).toHaveValue(CLIENTE.lastNames);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});

describe('exito: cerrar, avisar y refrescar (R30)', () => {
  it('un alta con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    const user = setupUser();
    await abrirAlta(user);
    await rellenarObligatorios(user);
    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createCustomerActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(CUSTOMER_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('una edicion con exito cierra el panel, avisa por toast y refresca la lista', async () => {
    const user = setupUser();
    render(<FilaConPanel customer={CLIENTE} />);
    await user.click(screen.getByTestId(ROW_EDIT_TESTID));
    await screen.findByTestId(CUSTOMER_FORM_TESTID);

    await user.click(screen.getByTestId(CUSTOMER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateCustomerActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(CUSTOMER_FORM_TESTID)).toBeNull());
    expect(toastExito).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('el panel no monta ninguna region de avisos propia: el layout privado ya monta la unica', async () => {
    const user = setupUser();
    await abrirAlta(user);

    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
