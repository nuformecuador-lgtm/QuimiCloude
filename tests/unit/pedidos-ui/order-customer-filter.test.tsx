// El filtro «Cliente» de la barra: que direccion produce al elegir, cambiar o limpiar, y con que
// valor arranca. El router y la action de opciones son dobles.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CREATED_AT_COLUMN_ID,
  CUSTOMER_PARAM,
  ORDER_CUSTOMER_NONE_LABEL,
  ORDER_CUSTOMER_PICKER_TOUCH_CLASSES,
  OrderCustomerFilter,
  PRIORITY_COLUMN_ID,
  STATUS_COLUMN_ID,
  parseOrderListParams,
  type OrderCustomerChoice,
} from '@/app/(private)/pedidos/components';
import type { DataTableParams } from '@/components/shared/data-table';
import type { OrderCustomer } from '@/lib/modules/pedidos';
import type { OrderCustomerOptionsResult } from '@/lib/modules/pedidos/adapters/driving/order-actions';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { ORDERS_ROUTE } from '@/lib/shared/routes';
import { setupUser } from '../../helpers/user-event';

const { routerMock, searchMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  searchMock: vi.fn<(query: unknown, purpose: string) => Promise<OrderCustomerOptionsResult>>(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  searchOrderCustomersAction: searchMock,
}));

const ANA: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601', name: 'Ana Garcia', isDeleted: false };
const BRUNO: OrderCustomer = { id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f602', name: 'Bruno Lopez', isDeleted: true };

/** Parametros vigentes con todo lo que el filtro debe conservar. */
function vigentes(filters: DataTableParams['filters'] = {}): DataTableParams {
  return {
    page: 3,
    pageSize: DEFAULT_PAGE_SIZE,
    sort: { columnId: 'createdAt', direction: 'desc' },
    filters: {
      [STATUS_COLUMN_ID]: { kind: 'select', values: ['PENDIENTE'] },
      [PRIORITY_COLUMN_ID]: { kind: 'select', values: ['ALTA'] },
      [CREATED_AT_COLUMN_ID]: { kind: 'dateRange', from: '2026-01-01', to: null },
      ...filters,
    },
    search: 'sosa',
  };
}

function montar(params: DataTableParams, value: OrderCustomerChoice | null = null) {
  render(<OrderCustomerFilter params={params} value={value} />);
}

/** Lo que la pantalla leera de la direccion a la que se navego. */
function destino(): DataTableParams {
  const href = routerMock.push.mock.calls.at(-1)?.[0];
  if (href === undefined) throw new Error('El filtro no navego');
  expect(href.startsWith(`${ORDERS_ROUTE}?`)).toBe(true);
  const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  return parseOrderListParams(Object.fromEntries(query));
}

function parametroCliente(): string | null {
  const href = routerMock.push.mock.calls.at(-1)?.[0] ?? '';
  return new URLSearchParams(href.slice(href.indexOf('?') + 1)).get(CUSTOMER_PARAM);
}

async function elegir(user: ReturnType<typeof setupUser>, texto: string) {
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByText(texto));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockResolvedValue({
    status: 'success',
    data: { items: [ANA, BRUNO], total: 2, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('elegir en el filtro', () => {
  it('R34: elegir un cliente navega a la primera pagina y conserva estado, prioridad, fecha, orden y q', async () => {
    const user = setupUser();
    const params = vigentes();
    montar(params);

    await elegir(user, 'Ana Garcia');

    expect(routerMock.push).toHaveBeenCalledTimes(1);
    expect(destino()).toEqual({
      ...params,
      page: 1,
      filters: { ...params.filters, customerId: { kind: 'select', values: [ANA.id] } },
    });
    expect(searchMock).toHaveBeenCalledWith(expect.anything(), 'filter');
  });

  it('R27: ofrece los clientes dados de baja con su sufijo', async () => {
    const user = setupUser();
    montar(vigentes());

    await elegir(user, 'Bruno Lopez (eliminado)');

    expect(parametroCliente()).toBe(BRUNO.id);
  });

  it('R34: elegir «Sin cliente» navega a customer=none', async () => {
    const user = setupUser();
    const params = vigentes();
    montar(params);

    await elegir(user, ORDER_CUSTOMER_NONE_LABEL);

    expect(parametroCliente()).toBe('none');
    expect(destino()).toEqual({
      ...params,
      page: 1,
      filters: { ...params.filters, customerPresence: { kind: 'select', values: ['none'] } },
    });
  });

  it('R34: con «Sin cliente» vigente, elegir un cliente lo sustituye', async () => {
    const user = setupUser();
    montar(vigentes({ customerPresence: { kind: 'select', values: ['none'] } }), { kind: 'none' });

    await user.clear(screen.getByRole('combobox'));
    routerMock.push.mockClear();
    await elegir(user, 'Ana Garcia');

    expect(parametroCliente()).toBe(ANA.id);
    expect(destino().filters).not.toHaveProperty('customerPresence');
  });

  it('R34: con un cliente vigente, elegir «Sin cliente» lo sustituye', async () => {
    const user = setupUser();
    montar(vigentes({ customerId: { kind: 'select', values: [ANA.id] } }), { kind: 'customer', customer: ANA });

    await user.clear(screen.getByRole('combobox'));
    routerMock.push.mockClear();
    await elegir(user, ORDER_CUSTOMER_NONE_LABEL);

    expect(parametroCliente()).toBe('none');
    expect(destino().filters).not.toHaveProperty('customerId');
  });
});

describe('limpiar el filtro', () => {
  it('R34: quita solo customer, vuelve a la primera pagina y conserva lo demas', async () => {
    const user = setupUser();
    const sinFiltro = vigentes();
    montar(vigentes({ customerId: { kind: 'select', values: [ANA.id] } }), { kind: 'customer', customer: ANA });

    await user.clear(screen.getByRole('combobox'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
    expect(parametroCliente()).toBeNull();
    expect(destino()).toEqual({ ...sinFiltro, page: 1 });
  });

  it('con un cliente vigente, editar el texto no navega', async () => {
    const user = setupUser();
    montar(vigentes({ customerId: { kind: 'select', values: [ANA.id] } }), { kind: 'customer', customer: ANA });

    await user.type(screen.getByRole('combobox'), 'x');

    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('vaciar un filtro que ya estaba vacio no navega', async () => {
    const user = setupUser();
    montar(vigentes());

    await user.type(screen.getByRole('combobox'), 'a');
    await user.clear(screen.getByRole('combobox'));

    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('valor inicial', () => {
  it('R29: viene precargado con la opcion que resolvio el servidor, sin consultar', () => {
    montar(vigentes(), { kind: 'customer', customer: BRUNO });

    expect(screen.getByRole('combobox')).toHaveValue('Bruno Lopez (eliminado)');
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('R29: viene precargado con «Sin cliente»', () => {
    montar(vigentes(), { kind: 'none' });

    expect(screen.getByRole('combobox')).toHaveValue(ORDER_CUSTOMER_NONE_LABEL);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('sin filtro arranca vacio', () => {
    montar(vigentes());

    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});

describe('objetivo tactil', () => {
  it('R35: el campo del filtro lleva las clases de 44 px y 16 px', () => {
    montar(vigentes());

    const grupo = document.querySelector<HTMLElement>('[data-slot="autocomplete-input-group"]');
    for (const clase of ORDER_CUSTOMER_PICKER_TOUCH_CLASSES.split(' ')) {
      expect(grupo?.className).toContain(clase);
    }
    expect(ORDER_CUSTOMER_PICKER_TOUCH_CLASSES).toContain('min-h-11');
  });
});
