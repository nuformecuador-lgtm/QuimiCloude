import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PERMISSIONS } from '@/lib/modules/identity';
import type { CatalogLineListItem, SupplierView } from '@/lib/modules/proveedores';
import type { CatalogLineListResult } from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { WIDE_VIEWPORT, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { arbolAccesible, nuncaResuelve, resolverServerComponents } from './arbol-accesible';

/**
 * Paridad del catalogo de un proveedor (`proveedores/[id]`): la lista con sus estados y los
 * errores previos de pagina. Mocks de `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`.
 */

const PROVEEDOR_ID = '11111111-1111-4111-8111-111111111111';

const {
  routerMock,
  getSessionUserMock,
  getSupplierActionMock,
  listCatalogLinesActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSessionUserMock: vi.fn(),
  getSupplierActionMock: vi.fn(),
  listCatalogLinesActionMock: vi.fn<(id: string, query: unknown) => Promise<CatalogLineListResult>>(),
  listUnitsActionMock: vi.fn(),
  listPresentationsActionMock: vi.fn(),
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn() },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => supplierDetailRoute('11111111-1111-4111-8111-111111111111'),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
  createSupplierAction: vi.fn(),
  updateSupplierAction: vi.fn(),
  deleteSupplierAction: vi.fn(),
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions', () => ({
  listCatalogLinesAction: listCatalogLinesActionMock,
  createCatalogLineAction: vi.fn(),
  updateCatalogLineAction: vi.fn(),
  deleteCatalogLineAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: listUnitsActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: vi.fn(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: vi.fn(),
  getBatchStatusAction: vi.fn(),
}));

const PRESENTACION = { id: '22222222-2222-4222-8222-222222222222', name: 'Tambor 200 L' };
const UNIDAD = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const PROVEEDOR: SupplierView = {
  id: PROVEEDOR_ID,
  name: 'Químicos del Norte',
  nameNormalized: 'quimicos del norte',
  phone: '+52 81 1234 5678',
  email: 'ventas@quimicosdelnorte.example',
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

const LINEA: CatalogLineListItem = {
  id: '44444444-4444-4444-8444-444444444444',
  supplierId: PROVEEDOR_ID,
  name: 'Sosa cáustica escamas',
  presentationId: PRESENTACION.id,
  unitId: UNIDAD.id,
  imagePath: 'proveedores/linea.png',
  imageUrl: 'https://cdn.example/crops/linea.png',
  cost: '1234.5678',
  minPurchase: '0.1005',
  deliveryTime: 5,
  material: null,
  measurements: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: new Date('2026-03-05T10:00:00.000Z'),
  createdBy: null,
  updatedBy: null,
};

function paginaDeLineas(items: readonly CatalogLineListItem[], page = 1): CatalogLineListResult {
  return {
    status: 'success',
    data: {
      items,
      total: items.length,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE)),
    },
  };
}

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'unauthorized',
  message: errorMessage('unauthorized'),
};

type Consulta = Record<string, string | undefined>;

function arbolDeLaPantalla(consulta: Consulta) {
  return ProveedorDetallePage({
    params: Promise.resolve({ id: PROVEEDOR_ID }),
    searchParams: Promise.resolve(consulta),
  });
}

async function renderPantalla(consulta: Consulta = {}) {
  return render(<>{await resolverServerComponents(await arbolDeLaPantalla(consulta))}</>);
}

async function renderCargando(consulta: Consulta = {}) {
  listCatalogLinesActionMock.mockReturnValue(nuncaResuelve());
  return render(<>{await arbolDeLaPantalla(consulta)}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({
    id: 'u-paridad',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
  getSupplierActionMock.mockResolvedValue({ status: 'success', data: PROVEEDOR });
  listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([LINEA]));
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: {
      items: [
        {
          ...PRESENTACION,
          nameNormalized: 'tambor 200 l',
          unitId: UNIDAD.id,
          content: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: MAX_PAGE_SIZE,
      totalPages: 1,
    },
  });
  setViewportWidth(WIDE_VIEWPORT);
});

afterEach(() => {
  cleanup();
  resetViewport();
});

describe('paridad del catalogo de proveedor — lista', () => {
  it('R1 R16-R18 — con filas', async () => {
    await renderPantalla();
    expect(screen.getByTestId('catalog-list')).toBeInTheDocument();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R16 — cargando, con tantas filas como el tamano de pagina', async () => {
    await renderCargando({ pageSize: '10' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio, sin busqueda', async () => {
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([]));
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — vacio en una pagina posterior, con la vuelta a la primera', async () => {
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([], 3));
    await renderPantalla({ page: '3' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R18 — sin resultados, con busqueda activa', async () => {
    listCatalogLinesActionMock.mockResolvedValue(paginaDeLineas([]));
    await renderPantalla({ q: 'inexistente' });
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R2 R17 — error de catalogo, y «Reintentar» hace lo de hoy', async () => {
    listCatalogLinesActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('R1 R17 — error inesperado, con su identificador', async () => {
    listCatalogLinesActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});

describe('paridad del catalogo de proveedor — errores previos de pagina (R20)', () => {
  it('R1 R20 — el proveedor falla con un error de catalogo', async () => {
    getSupplierActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — el proveedor falla con el error inesperado', async () => {
    getSupplierActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — las unidades fallan con un error de catalogo', async () => {
    listUnitsActionMock.mockResolvedValue(ERROR_DE_CATALOGO);
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });

  it('R1 R20 — las unidades fallan con el error inesperado', async () => {
    listUnitsActionMock.mockResolvedValue(errorInesperado());
    await renderPantalla();
    expect(arbolAccesible()).toMatchSnapshot();
  });
});
