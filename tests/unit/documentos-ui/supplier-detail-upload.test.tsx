import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnqueueBatchResult,
  GetBatchStatusResult,
} from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';
import type { CatalogLineListResult } from '@/lib/modules/proveedores/adapters/driving/supplier-catalog-actions';
import type { SupplierQueryResult } from '@/lib/modules/proveedores/adapters/driving/supplier-actions';
import type { PresentationListResult } from '@/lib/modules/inventario/adapters/driving/presentation-actions';
import type { UnitListResult } from '@/lib/modules/unidades/adapters/driving/unit-actions';

const {
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  getSupplierActionMock,
  listCatalogLinesActionMock,
  listUnitsActionMock,
  listPresentationsActionMock,
  issueUploadLinksActionMock,
  enqueueBatchActionMock,
  getBatchStatusActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  usePathnameMock: vi.fn<() => string>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  getSupplierActionMock: vi.fn<(id: string) => Promise<SupplierQueryResult>>(),
  listCatalogLinesActionMock:
    vi.fn<(supplierId: string, query: unknown) => Promise<CatalogLineListResult>>(),
  listUnitsActionMock: vi.fn<() => Promise<UnitListResult>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<PresentationListResult>>(),
  issueUploadLinksActionMock: vi.fn<(input: unknown) => Promise<IssueUploadLinksResult>>(),
  enqueueBatchActionMock: vi.fn<(input: unknown) => Promise<EnqueueBatchResult>>(),
  getBatchStatusActionMock: vi.fn<(batchId: string) => Promise<GetBatchStatusResult>>(),
}));

// `requirePagePermission` resuelve la sesion por `@/lib/composition`; sin este doble la pantalla
// responderia 404 y este archivo no mediria nada.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/proveedores/adapters/driving/supplier-actions', () => ({
  getSupplierAction: getSupplierActionMock,
}));

// Las tres de escritura se declaran aunque este archivo no las ejercite: un doble parcial rompe
// el import de las que falten.
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
  issueUploadLinksAction: issueUploadLinksActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: enqueueBatchActionMock,
  getBatchStatusAction: getBatchStatusActionMock,
}));

import ProveedorDetallePage from '@/app/(private)/proveedores/[id]/page';
import {
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TESTID,
} from '@/components/shared/document-upload';
import { PERMISSIONS } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/shared/pagination';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { setupUser } from '../../helpers/user-event';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

const PROVEEDOR_ID = '11111111-1111-4111-8111-111111111111';
const UNIDAD = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Kilogramo',
  symbol: 'kg',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const fetchMock = vi.fn<() => Promise<Response>>();

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente:
 * `react-dom` en jsdom no sabe ejecutar un componente `async`, asi que sin esto el catalogo no
 * llegaria a pintarse. El arbol que se monta sigue siendo el que declara `page.tsx`.
 */
async function resolverServerComponents(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) {
    return Promise.all((nodo as ReactNode[]).map((hijo) => resolverServerComponents(hijo)));
  }
  if (!isValidElement(nodo)) return nodo;

  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const tipo = elemento.type;

  if (typeof tipo === 'function' && tipo.constructor.name === 'AsyncFunction') {
    const producido = await (tipo as (props: unknown) => Promise<ReactNode>)(elemento.props);
    return resolverServerComponents(producido);
  }

  const hijos = elemento.props.children;
  if (hijos === undefined) return elemento;

  const resueltos = await resolverServerComponents(hijos);

  return Array.isArray(resueltos)
    ? cloneElement(elemento, undefined, ...(resueltos as ReactNode[]))
    : cloneElement(elemento, undefined, resueltos);
}

async function renderPantalla() {
  const arbol = await ProveedorDetallePage({
    params: Promise.resolve({ id: PROVEEDOR_ID }),
    searchParams: Promise.resolve({}),
  });

  return render(await resolverServerComponents(arbol));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse());

  getSessionUserMock.mockResolvedValue({
    id: 'u-test-42',
    username: 'carla.duarte',
    displayName: 'Carla Duarte Salas',
    roleName: 'Administrador',
    permissions: PERMISSIONS.map((permiso) => permiso.code),
  });
  usePathnameMock.mockReturnValue(supplierDetailRoute(PROVEEDOR_ID));
  getSupplierActionMock.mockResolvedValue({
    status: 'success',
    data: {
      id: PROVEEDOR_ID,
      name: 'Quimicos del Norte',
      nameNormalized: 'quimicos del norte',
      phone: null,
      email: null,
      createdAt: new Date('2026-01-15T10:20:30.000Z'),
      updatedAt: new Date('2026-02-20T08:00:00.000Z'),
      createdBy: 'autor',
      updatedBy: 'editor',
    },
  });
  listCatalogLinesActionMock.mockResolvedValue({
    status: 'success',
    data: {
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          supplierId: PROVEEDOR_ID,
          name: 'Sosa caustica escamas',
          presentationId: '44444444-4444-4444-8444-444444444444',
          unitId: UNIDAD.id,
          imagePath: null,
          cost: '1234.5678',
          minPurchase: '0.1005',
          deliveryTime: 5,
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          updatedAt: new Date('2026-03-05T10:00:00.000Z'),
          createdBy: 'autor',
          updatedBy: 'editor',
        },
      ],
      total: 1,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
    },
  });
  listUnitsActionMock.mockResolvedValue({ status: 'success', data: [UNIDAD] });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: MAX_PAGE_SIZE, totalPages: 1 },
  });
  issueUploadLinksActionMock.mockResolvedValue({
    status: 'success',
    data: { uploads: signedUploads(1) },
  });
  enqueueBatchActionMock.mockResolvedValue({ status: 'success', data: { batchId: 'batch-1' } });
  getBatchStatusActionMock.mockResolvedValue({
    status: 'success',
    data: batch([entry({ path: signedUploads(1)[0]?.path, status: 'done' })]),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('el montaje en la pantalla de proveedores', () => {
  it('la pantalla de detalle de proveedor monta el componente en modo catalogo (R17)', async () => {
    await renderPantalla();

    const subida = screen.getByTestId(DOCUMENT_UPLOAD_TESTID);
    const catalogo = screen.getByTestId('catalog-list');

    // Debajo del catalogo y colgando del mismo contenedor de la pagina.
    expect(catalogo.compareDocumentPosition(subida) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(subida.parentElement?.contains(catalogo)).toBe(true);

    // La estrategia de la tanda es la de catalogo, y se ve donde importa: al encolar.
    const user = setupUser();
    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('catalogo.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    const [encolado] = enqueueBatchActionMock.mock.calls[0] ?? [];
    expect(encolado).toEqual({
      strategy: 'catalogo',
      paths: signedUploads(1).map((upload) => upload.path),
    });
  });

  it('el montaje no anade ningun corte de permiso propio a la pantalla (R14, R17)', async () => {
    await renderPantalla();

    // La pagina sigue exigiendo lo suyo y nada mas: quien decide si se puede SUBIR es el caso de
    // uso, no la pantalla, asi que el componente se monta entero.
    expect(screen.getByTestId(DOCUMENT_UPLOAD_TESTID)).toBeVisible();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID)).toBeEnabled();
    expect(issueUploadLinksActionMock).not.toHaveBeenCalled();
  });
});
