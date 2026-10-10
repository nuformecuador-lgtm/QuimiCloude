import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  AssignedOrdersListSection,
  AssignedOrdersSkeleton,
  CompanyOrdersListSection,
  CompanyOrdersSkeleton,
  FinishedOrdersListSection,
  FinishedOrdersSkeleton,
  PackingOrdersListSection,
  PackingOrdersSkeleton,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';

import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, resolverServerComponents } from './arbol-accesible';

/**
 * Lo que `asignacion-paridad.test.tsx` (QC-231) no cubre de las cuatro listas que la tanda 4
 * parametriza (`design.md > 5`): el vacio de mis asignados, terminados y todos, y el esqueleto de
 * las cuatro. `asignacion-paridad` ya congela el error de las seis secciones, las filas de las
 * cuatro y el vacio de por empacar; no se edita (R4) y este archivo lo completa. Mocks de
 * `asignacion-paridad.test.tsx`.
 */

const {
  routerMock,
  getSessionUserMock,
  getSessionContextMock,
  listPackingOrdersMock,
  listAssignedOrdersActionMock,
  listFinishedOrdersActionMock,
  listCompanyOrdersActionMock,
} = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  listPackingOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
  listAssignedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listFinishedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listCompanyOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: {
    listPackingOrders: listPackingOrdersMock,
    listConditioningOrders: vi.fn(),
    listConditionedOrders: vi.fn(),
  },
  observabilidad: {
    readRequestIdHeader: vi.fn(async () => '7b1c9f2e-4d3a-4f5b-9c0d-1e2f3a4b5c6d'),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/asignacion',
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  listAssignedOrdersAction: listAssignedOrdersActionMock,
  listFinishedOrdersAction: listFinishedOrdersActionMock,
  listCompanyOrdersAction: listCompanyOrdersActionMock,
}));

const PARAMS: DataTableParams = { page: 1, pageSize: 10, sort: null, filters: {}, search: '' };

function pagina(items: readonly unknown[], page = 1) {
  return { items, total: items.length, page, pageSize: 10, totalPages: 1 };
}

function vacia(page = 1) {
  return { status: 'success', data: pagina([], page) };
}

async function renderSeccion(seccion: Promise<ReactNode>) {
  return render(<>{await resolverServerComponents(await seccion)}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({
    id: 'u-1',
    username: 'admin.prueba',
    displayName: 'Admin De Prueba',
    roleName: 'Administrador',
    permissions: [
      'asignaciones.consultar',
      'asignaciones.ejecutar',
      'terminados.consultar',
      'empaque.modificar',
      'pedidos.consultar',
    ],
  });
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

type Lista = {
  readonly nombre: string;
  readonly vaciar: (page: number) => void;
  readonly montar: (params: DataTableParams) => Promise<ReactNode>;
};

const LISTAS: readonly Lista[] = [
  {
    nombre: 'mis asignados',
    vaciar: (page) => listAssignedOrdersActionMock.mockResolvedValue(vacia(page)),
    montar: (params) => AssignedOrdersListSection({ params, vista: 'asignados', canExecute: true }),
  },
  {
    nombre: 'terminados',
    vaciar: (page) => listFinishedOrdersActionMock.mockResolvedValue(vacia(page)),
    montar: (params) => FinishedOrdersListSection({ params }),
  },
  {
    nombre: 'todos',
    vaciar: (page) => listCompanyOrdersActionMock.mockResolvedValue(vacia(page)),
    montar: (params) => CompanyOrdersListSection({ params, statuses: [] }),
  },
  {
    nombre: 'por empacar',
    vaciar: (page) => listPackingOrdersMock.mockResolvedValue(pagina([], page)),
    montar: (params) => PackingOrdersListSection({ params }),
  },
];

describe('paridad de las listas de asignacion — vacio', () => {
  it.each(LISTAS)('R1 R27 — $nombre, vacio', async (lista) => {
    lista.vaciar(1);
    await renderSeccion(lista.montar(PARAMS));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it.each(LISTAS)('R1 R27 — $nombre, vacio en una pagina posterior', async (lista) => {
    lista.vaciar(3);
    await renderSeccion(lista.montar({ ...PARAMS, page: 3 }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it.each(LISTAS)('R1 R27 — $nombre, sin resultados con busqueda', async (lista) => {
    lista.vaciar(1);
    await renderSeccion(lista.montar({ ...PARAMS, search: 'inexistente' }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R27 — todos, vacio con el filtro de entregados', async () => {
    listCompanyOrdersActionMock.mockResolvedValue(vacia(1));
    await renderSeccion(CompanyOrdersListSection({ params: PARAMS, statuses: ['ENTREGADO'] }));
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de las listas de asignacion — esqueleto', () => {
  it.each([
    ['mis asignados, con ejecutar', () => <AssignedOrdersSkeleton rows={3} canExecute />],
    ['mis asignados, sin ejecutar', () => <AssignedOrdersSkeleton rows={3} canExecute={false} />],
    ['terminados', () => <FinishedOrdersSkeleton rows={3} />],
    ['todos', () => <CompanyOrdersSkeleton rows={3} />],
    ['todos, con la fecha de entrega', () => <CompanyOrdersSkeleton rows={3} showFinishedAt />],
    ['por empacar', () => <PackingOrdersSkeleton rows={3} />],
  ])('R1 R27 — %s', (_nombre, esqueleto) => {
    render(esqueleto());
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
