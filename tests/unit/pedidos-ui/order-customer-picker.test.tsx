// Selector de cliente del pedido sobre `AsyncAutocomplete`: a quien pregunta, que envia y cuando
// ofrece «Sin cliente». La action de opciones es un doble con paginas fijas.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_CUSTOMER_NONE_LABEL,
  ORDER_CUSTOMER_PICKER_TESTID,
  OrderCustomerPicker,
  type OrderCustomerChoice,
} from '@/app/(private)/pedidos/components';
import type { OrderCustomer, OrderCustomerSearchPurpose } from '@/lib/modules/pedidos';
import type { OrderCustomerOptionsResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { setupUser } from '../../helpers/user-event';

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn<(query: unknown, purpose: OrderCustomerSearchPurpose) => Promise<OrderCustomerOptionsResult>>(),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  searchOrderCustomersAction: searchMock,
}));

const VIVO: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601', name: 'Ana Garcia', isDeleted: false };
const BAJA: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f602', name: 'Bruno Lopez', isDeleted: true };

function pagina(items: readonly OrderCustomer[], page = 1, totalPages = 1): OrderCustomerOptionsResult {
  return { status: 'success', data: { items: [...items], total: items.length, page, pageSize: 10, totalPages } };
}

function Controlado({
  purpose,
  inicial = null,
  onChange,
}: {
  readonly purpose: OrderCustomerSearchPurpose;
  readonly inicial?: OrderCustomerChoice | null;
  readonly onChange?: (choice: OrderCustomerChoice | null) => void;
}) {
  const [value, setValue] = useState<OrderCustomerChoice | null>(inicial);
  return (
    <OrderCustomerPicker
      purpose={purpose}
      value={value}
      name="customerId"
      aria-label="Cliente"
      onChange={(choice) => {
        setValue(choice);
        onChange?.(choice);
      }}
    />
  );
}

function opciones(): string[] {
  return screen.queryAllByTestId(`${ORDER_CUSTOMER_PICKER_TESTID}-option`).map((option) => option.textContent ?? '');
}

function oculto(): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>(`${ORDER_CUSTOMER_PICKER_TESTID}-value`);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockResolvedValue(pagina([VIVO, BAJA]));
});

afterEach(() => {
  cleanup();
});

describe('OrderCustomerPicker — consulta', () => {
  it.each(['assign', 'filter'] as const)('R27/R28: con purpose=%s llama a la action con ese purpose', async (purpose) => {
    const user = setupUser();
    render(<Controlado purpose={purpose} />);

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(searchMock).toHaveBeenCalled());
    expect(searchMock).toHaveBeenCalledWith({ search: '', page: 1, pageSize: 10 }, purpose);
  });

  it('un error de la action se muestra en el desplegable', async () => {
    const user = setupUser();
    searchMock.mockResolvedValue({ status: 'error', code: 'unauthorized', message: 'No autorizado.' });
    render(<Controlado purpose="assign" />);

    await user.click(screen.getByRole('combobox'));

    expect(await screen.findByText(/No se pudo cargar/)).toBeInTheDocument();
  });
});

describe('OrderCustomerPicker — valor', () => {
  it('R31: el campo oculto lleva el id elegido y no la etiqueta', async () => {
    const user = setupUser();
    render(<Controlado purpose="assign" />);
    expect(oculto()).toHaveValue('');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Ana Garcia'));

    expect(oculto()).toHaveValue(VIVO.id);
    expect(screen.getByRole('combobox')).toHaveValue('Ana Garcia');
  });

  it('R34: con «Sin cliente» el campo oculto queda vacio', async () => {
    const user = setupUser();
    render(<Controlado purpose="filter" />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText(ORDER_CUSTOMER_NONE_LABEL));

    expect(oculto()).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue(ORDER_CUSTOMER_NONE_LABEL);
  });

  it('R20: un cliente dado de baja se muestra con el sufijo «(eliminado)»', async () => {
    const user = setupUser();
    render(<Controlado purpose="filter" />);

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(opciones()).toContain('Bruno Lopez (eliminado)'));
    expect(opciones()).toContain('Ana Garcia');
  });

  it('R31: editar el texto tras elegir retira el id oculto hasta volver a elegir', async () => {
    const user = setupUser();
    const onChange = vi.fn<(choice: OrderCustomerChoice | null) => void>();
    render(<Controlado purpose="assign" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Ana Garcia'));
    expect(oculto()).toHaveValue(VIVO.id);

    await user.type(screen.getByRole('combobox'), 'x');

    expect(screen.getByRole('combobox')).toHaveValue('Ana Garciax');
    expect(oculto()).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith(null);

    searchMock.mockResolvedValue(pagina([VIVO]));
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'ana');
    await user.click(await screen.findByText('Ana Garcia'));

    expect(oculto()).toHaveValue(VIVO.id);
  });

  it('R31: precargado, editar el texto tambien retira el id oculto', async () => {
    const user = setupUser();
    render(<Controlado purpose="assign" inicial={{ kind: 'customer', customer: VIVO }} />);

    await user.type(screen.getByRole('combobox'), '{Backspace}');

    expect(screen.getByRole('combobox')).toHaveValue('Ana Garci');
    expect(oculto()).toHaveValue('');
  });

  it('con keepChoiceWhileTyping, escribir no retira la eleccion', async () => {
    const user = setupUser();
    const onChange = vi.fn<(choice: OrderCustomerChoice | null) => void>();
    render(
      <OrderCustomerPicker
        purpose="filter"
        keepChoiceWhileTyping
        value={{ kind: 'customer', customer: VIVO }}
        onChange={onChange}
        aria-label="Cliente"
      />,
    );

    await user.type(screen.getByRole('combobox'), 'x');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('R31: precargado, el campo arranca con el nombre y el oculto con el id', () => {
    render(<Controlado purpose="assign" inicial={{ kind: 'customer', customer: VIVO }} />);

    expect(screen.getByRole('combobox')).toHaveValue('Ana Garcia');
    expect(oculto()).toHaveValue(VIVO.id);
    expect(searchMock).not.toHaveBeenCalled();
  });
});

describe('OrderCustomerPicker — «Sin cliente»', () => {
  it('R34: con purpose=filter va primero en la pagina 1 sin termino', async () => {
    const user = setupUser();
    render(<Controlado purpose="filter" />);

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(opciones()).toEqual([ORDER_CUSTOMER_NONE_LABEL, 'Ana Garcia', 'Bruno Lopez (eliminado)']));
  });

  it.each(['sin', 'CLIENTE', 'sín', 'sin cli'])(
    'R34: con purpose=filter va primero con el termino «%s», que casa',
    async (termino) => {
      const user = setupUser();
      searchMock.mockResolvedValue(pagina([]));
      render(<Controlado purpose="filter" />);

      await user.type(screen.getByRole('combobox'), termino);

      await waitFor(() => expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ search: termino }), 'filter'));
      await waitFor(() => expect(opciones()).toEqual([ORDER_CUSTOMER_NONE_LABEL]));
    },
  );

  it('R34: con un termino que no casa no aparece', async () => {
    const user = setupUser();
    searchMock.mockResolvedValue(pagina([VIVO]));
    render(<Controlado purpose="filter" />);

    await user.type(screen.getByRole('combobox'), 'ana');

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'ana' }), 'filter'));
    await waitFor(() => expect(opciones()).toEqual(['Ana Garcia']));
  });

  it('R34: en la pagina 2 no aparece', async () => {
    const user = setupUser();
    searchMock.mockImplementation(async (query) => {
      const { page } = query as { page: number };
      return page === 1 ? pagina([VIVO], 1, 2) : pagina([BAJA], 2, 2);
    });
    render(<Controlado purpose="filter" />);

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(opciones()).toEqual([ORDER_CUSTOMER_NONE_LABEL, 'Ana Garcia']));

    const scroll = document.querySelector<HTMLElement>('[data-slot="autocomplete-scroll"]');
    if (!scroll) throw new Error('El desplegable no esta montado.');
    Object.defineProperty(scroll, 'clientHeight', { value: 288, configurable: true });
    Object.defineProperty(scroll, 'scrollHeight', { value: 288, configurable: true });
    Object.defineProperty(scroll, 'scrollTop', { value: 0, configurable: true });
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() =>
      expect(opciones()).toEqual([ORDER_CUSTOMER_NONE_LABEL, 'Ana Garcia', 'Bruno Lopez (eliminado)']),
    );
    expect(opciones().filter((option) => option === ORDER_CUSTOMER_NONE_LABEL)).toHaveLength(1);
  });

  it('R34: con purpose=assign no aparece nunca, ni sin termino ni con uno que casa', async () => {
    const user = setupUser();
    render(<Controlado purpose="assign" />);

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(opciones()).toEqual(['Ana Garcia', 'Bruno Lopez (eliminado)']));

    searchMock.mockResolvedValue(pagina([]));
    await user.type(screen.getByRole('combobox'), 'sin');
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'sin' }), 'assign'));
    expect(opciones()).not.toContain(ORDER_CUSTOMER_NONE_LABEL);
  });
});

describe('OrderCustomerPicker — objetivo tactil', () => {
  it('R35: el campo, el boton de limpiar y las opciones miden al menos 44 px', async () => {
    const user = setupUser();
    render(<Controlado purpose="filter" />);

    const grupo = document.querySelector<HTMLElement>('[data-slot="autocomplete-input-group"]');
    expect(grupo?.className).toContain('[&_[data-slot=autocomplete-input]]:min-h-11');
    expect(grupo?.className).toContain('[&_[data-slot=autocomplete-input]]:text-base');
    expect(grupo?.className).toContain('[&_[data-slot=autocomplete-clear]]:size-11');

    await user.click(screen.getByRole('combobox'));
    await waitFor(() => expect(opciones().length).toBeGreaterThan(0));
    for (const option of screen.getAllByTestId(`${ORDER_CUSTOMER_PICKER_TESTID}-option`)) {
      expect(option.className).toContain('min-h-11');
    }
  });
});
