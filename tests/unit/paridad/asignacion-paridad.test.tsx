import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import {
  AssignedOrdersListSection,
  CompanyOrdersListSection,
  ConditionedOrdersListSection,
  ConditioningOrdersListSection,
  FinishedOrdersListSection,
  PackingOrdersListSection,
} from '@/app/(private)/asignacion/components';
import type { DataTableParams } from '@/components/shared/data-table';
import {
  UnauthorizedError,
  type AssignedOrderView,
  type CompanyOrderView,
  type FinishedOrderView,
} from '@/lib/modules/asignaciones';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';

import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad de asignacion. `AssignedOrdersError` se conserva y pasa a delegar en la pieza
 * compartida: el error de las seis secciones tiene que seguir dando este arbol, y las secciones
 * no se tocan, asi que se renderizan directas. Las filas y el vacio de las cuatro listas cuyas
 * columnas o seccion se tocan quedan tambien congelados. Mocks de los
 * `tests/unit/asignaciones-ui/*-list-section.test.tsx`.
 */

const {
  routerMock,
  getSessionUserMock,
  getSessionContextMock,
  listPackingOrdersMock,
  listConditioningOrdersMock,
  listConditionedOrdersMock,
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
  listConditioningOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
  listConditionedOrdersMock: vi.fn<(actor: unknown, query: unknown) => Promise<unknown>>(),
  listAssignedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listFinishedOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listCompanyOrdersActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: {
    listPackingOrders: listPackingOrdersMock,
    listConditioningOrders: listConditioningOrdersMock,
    listConditionedOrders: listConditionedOrdersMock,
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

const ASIGNADO: AssignedOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.500',
  priority: 'ALTA',
  status: 'PENDIENTE',
  otherResponsibles: [{ userId: 'user-2', displayName: 'Ana López García', origin: { kind: 'direct' } }],
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Caja x 12', packagingName: null, packages: 5 },
  ],
  unitId: null,
  unitLabel: null,
};

const TERMINADO: FinishedOrderView = {
  id: 'order-2',
  numberText: '2026-000124',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Caja x 12', packagingName: null, packages: 5 },
  ],
  unitId: null,
  unitLabel: null,
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
  responsibles: [],
};

const DE_LA_EMPRESA: CompanyOrderView = {
  id: 'order-3',
  numberText: '2026-000125',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Caja x 12', packagingName: null, packages: 5 },
  ],
  unitId: null,
  unitLabel: null,
  priority: 'ALTA',
  status: 'ENTREGADO',
  responsibles: [],
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
};

const POR_EMPACAR = {
  id: 'order-4',
  numberText: '2026-0000030',
  recipeName: 'Jarabe simple',
  quantity: '20',
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packages: 4 }],
  unitId: null,
  unitLabel: null,
  packages: '4',
  status: 'POR_EMPACAR',
  packedByName: null,
};

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

async function renderSeccion(seccion: Promise<ReactNode>) {
  return render(<>{await resolverServerComponents(await seccion)}</>);
}

type Seccion = {
  readonly nombre: string;
  readonly montar: () => Promise<ReactNode>;
  readonly fallarConCatalogo: () => void;
  readonly fallarConInesperado: () => void;
};

/** Las secciones que leen por Server Action reciben el `ErrorState`; las que leen por composicion, la excepcion. */
const SECCIONES: readonly Seccion[] = [
  {
    nombre: 'mis asignados',
    montar: () => AssignedOrdersListSection({ params: PARAMS, vista: 'asignados', canExecute: true }),
    fallarConCatalogo: () => listAssignedOrdersActionMock.mockResolvedValue(ERROR_DE_CATALOGO),
    fallarConInesperado: () => listAssignedOrdersActionMock.mockResolvedValue(errorInesperado()),
  },
  {
    nombre: 'terminados',
    montar: () => FinishedOrdersListSection({ params: PARAMS }),
    fallarConCatalogo: () => listFinishedOrdersActionMock.mockResolvedValue(ERROR_DE_CATALOGO),
    fallarConInesperado: () => listFinishedOrdersActionMock.mockResolvedValue(errorInesperado()),
  },
  {
    nombre: 'todos',
    montar: () => CompanyOrdersListSection({ params: PARAMS, statuses: [] }),
    fallarConCatalogo: () => listCompanyOrdersActionMock.mockResolvedValue(ERROR_DE_CATALOGO),
    fallarConInesperado: () => listCompanyOrdersActionMock.mockResolvedValue(errorInesperado()),
  },
  {
    nombre: 'por empacar',
    montar: () => PackingOrdersListSection({ params: PARAMS }),
    fallarConCatalogo: () => listPackingOrdersMock.mockRejectedValue(new UnauthorizedError()),
    fallarConInesperado: () => listPackingOrdersMock.mockRejectedValue(new Error('fallo de prueba')),
  },
  {
    nombre: 'por acondicionar',
    montar: () => ConditioningOrdersListSection({ params: PARAMS }),
    fallarConCatalogo: () => listConditioningOrdersMock.mockRejectedValue(new UnauthorizedError()),
    fallarConInesperado: () =>
      listConditioningOrdersMock.mockRejectedValue(new Error('fallo de prueba')),
  },
  {
    nombre: 'acondicionados',
    montar: () => ConditionedOrdersListSection({ params: PARAMS }),
    fallarConCatalogo: () => listConditionedOrdersMock.mockRejectedValue(new UnauthorizedError()),
    fallarConInesperado: () =>
      listConditionedOrdersMock.mockRejectedValue(new Error('fallo de prueba')),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
  vi.restoreAllMocks();
  resetViewport();
});

describe('paridad de asignacion — el error de las seis secciones (R20)', () => {
  it.each(SECCIONES)('R1 R2 R20 — $nombre, error de catalogo', async (seccion) => {
    seccion.fallarConCatalogo();
    await renderSeccion(seccion.montar());
    expect(screen.getByTestId('assigned-orders-error')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByTestId('assigned-orders-retry'));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(SECCIONES)('R1 R20 — $nombre, error inesperado', async (seccion) => {
    seccion.fallarConInesperado();
    await renderSeccion(seccion.montar());
    expect(screen.getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad de asignacion — filas y vacio de las listas que se tocan', () => {
  it('R1 — mis asignados, con filas', async () => {
    listAssignedOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([ASIGNADO]) });
    await renderSeccion(
      AssignedOrdersListSection({ params: PARAMS, vista: 'asignados', canExecute: true }),
    );
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — terminados, con filas', async () => {
    listFinishedOrdersActionMock.mockResolvedValue({ status: 'success', data: pagina([TERMINADO]) });
    await renderSeccion(FinishedOrdersListSection({ params: PARAMS }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — todos, con filas', async () => {
    listCompanyOrdersActionMock.mockResolvedValue({
      status: 'success',
      data: pagina([DE_LA_EMPRESA]),
    });
    await renderSeccion(CompanyOrdersListSection({ params: PARAMS, statuses: [] }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — por empacar, con filas', async () => {
    listPackingOrdersMock.mockResolvedValue(pagina([POR_EMPACAR]));
    await renderSeccion(PackingOrdersListSection({ params: PARAMS }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — por empacar, vacio', async () => {
    listPackingOrdersMock.mockResolvedValue(pagina([]));
    await renderSeccion(PackingOrdersListSection({ params: PARAMS }));
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 — por empacar, vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listPackingOrdersMock.mockResolvedValue(pagina([], 3));
    await renderSeccion(PackingOrdersListSection({ params: { ...PARAMS, page: 3 } }));
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
