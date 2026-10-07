// Datos fijos de las acciones del cliente del pedido mientras los casos de uso no estan
// cableados: dan a la pantalla respuestas con la forma real. Se borra al integrar.
import type { OrderCustomer, OrderCustomerSearchPurpose, Page } from '@/lib/modules/pedidos';
import { buildPage, toOffsetLimit } from '@/lib/shared/pagination';

const FIXTURE_PAGE_SIZE = 2;

export const ORDER_CUSTOMER_FIXTURE_ALIVE: OrderCustomer = {
  id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f601',
  name: 'Ana Garcia',
  isDeleted: false,
};

export const ORDER_CUSTOMER_FIXTURE_DELETED: OrderCustomer = {
  id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f602',
  name: 'Bruno Lopez',
  isDeleted: true,
};

const ORDER_CUSTOMER_FIXTURE_SECOND: OrderCustomer = {
  id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f603',
  name: 'Carla Martinez',
  isDeleted: false,
};

const ORDER_CUSTOMER_FIXTURE_THIRD: OrderCustomer = {
  id: '6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f604',
  name: 'Diego Ruiz',
  isDeleted: false,
};

const ORDER_CUSTOMER_FIXTURES: readonly OrderCustomer[] = [
  ORDER_CUSTOMER_FIXTURE_ALIVE,
  ORDER_CUSTOMER_FIXTURE_DELETED,
  ORDER_CUSTOMER_FIXTURE_SECOND,
  ORDER_CUSTOMER_FIXTURE_THIRD,
];

/** Con `'assign'` no entran los dados de baja; las dos listas tienen segunda pagina. */
export function orderCustomerFixturePage(
  search: string,
  page: number,
  purpose: OrderCustomerSearchPurpose,
): Page<OrderCustomer> {
  const term = search.trim().toLowerCase();
  const matching = ORDER_CUSTOMER_FIXTURES.filter(
    (customer) => (purpose === 'filter' || !customer.isDeleted) && customer.name.toLowerCase().includes(term),
  );
  const { offset, limit } = toOffsetLimit(page, FIXTURE_PAGE_SIZE);
  return buildPage(matching.slice(offset, offset + limit), matching.length, page, limit);
}

export function orderCustomerFixtureById(id: string): OrderCustomer | null {
  return ORDER_CUSTOMER_FIXTURES.find((customer) => customer.id === id) ?? null;
}
