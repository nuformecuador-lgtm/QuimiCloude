import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EnqueueBatchResult,
  GetBatchStatusResult,
} from '@/lib/modules/documentos/adapters/driving/document-batch-actions';
import type { IssueUploadLinksResult } from '@/lib/modules/documentos/adapters/driving/document-upload-actions';
import type { DeleteRecipeFormState, RecipeListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';

const {
  getSessionUserMock,
  usePathnameMock,
  routerMock,
  listRecipesActionMock,
  getRecipeActionMock,
  deleteRecipeActionMock,
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
  listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
  getRecipeActionMock: vi.fn(),
  deleteRecipeActionMock: vi.fn<(id: string) => Promise<DeleteRecipeFormState>>(),
  issueUploadLinksActionMock: vi.fn<(input: unknown) => Promise<IssueUploadLinksResult>>(),
  enqueueBatchActionMock: vi.fn<(input: unknown) => Promise<EnqueueBatchResult>>(),
  getBatchStatusActionMock: vi.fn<(batchId: string) => Promise<GetBatchStatusResult>>(),
}));

// `requirePagePermission` resuelve la sesion por `@/lib/composition`; sin este doble la pantalla
// responderia 404 y este archivo no mediria nada.
// El arbol de la pagina arrastra `product-picker`, que pide a la composicion el traductor de
// errores; sin `observabilidad` en el doble el import de esa rama no carga.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, endSession: vi.fn<() => Promise<void>>() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: usePathnameMock,
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
  deleteRecipeAction: deleteRecipeActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-upload-actions', () => ({
  issueUploadLinksAction: issueUploadLinksActionMock,
}));

vi.mock('@/lib/modules/documentos/adapters/driving/document-batch-actions', () => ({
  enqueueBatchAction: enqueueBatchActionMock,
  getBatchStatusAction: getBatchStatusActionMock,
}));

import FormulasPage from '@/app/(private)/produccion/formulas/page';
import {
  DOCUMENT_UPLOAD_DIALOG_TESTID,
  DOCUMENT_UPLOAD_INPUT_TESTID,
  DOCUMENT_UPLOAD_OPEN_TESTID,
  DOCUMENT_UPLOAD_SUBMIT_TESTID,
  DOCUMENT_UPLOAD_TESTID,
} from '@/components/shared/document-upload';
import { PERMISSIONS } from '@/lib/modules/identity';
import { DEFAULT_PAGE_SIZE } from '@/lib/shared/pagination';
import { FORMULAS_ROUTE } from '@/lib/shared/routes';

import { setupUser } from '../../helpers/user-event';
import { WIDE_VIEWPORT, clearSidebarStateCookie, resetViewport, setViewportWidth } from '../../helpers/viewport';
import { batch, entry, okResponse, pdf, signedUploads } from './helpers';

/**
 * Resuelve los Server Components `async` del arbol antes de entregarselo al renderer de cliente:
 * `react-dom` en jsdom no sabe ejecutar un componente `async`, asi que sin esto la lista no
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
  const arbol = await FormulasPage({ searchParams: Promise.resolve({}) });
  return render(await resolverServerComponents(arbol));
}

const fetchMock = vi.fn<() => Promise<Response>>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(okResponse());

  setViewportWidth(WIDE_VIEWPORT);
  usePathnameMock.mockReturnValue(FORMULAS_ROUTE);
  listRecipesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  });
  deleteRecipeActionMock.mockResolvedValue({ status: 'success' });

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
  resetViewport();
  clearSidebarStateCookie();
});

describe('el boton de subida en el listado de formulas', () => {
  it('con documentos.modificar pinta el boton, la subida esta oculta hasta pulsarlo y encola la estrategia formula (R6, R10)', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'u-test-42',
      username: 'carla.duarte',
      displayName: 'Carla Duarte Salas',
      roleName: 'Administrador',
      permissions: PERMISSIONS.map((permiso) => permiso.code),
    });

    await renderPantalla();

    const abrir = screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID);
    expect(abrir).toBeVisible();
    expect(screen.getByTestId(DOCUMENT_UPLOAD_TESTID)).not.toBeVisible();

    const user = setupUser();
    await user.click(abrir);
    await screen.findByTestId(DOCUMENT_UPLOAD_DIALOG_TESTID);

    await user.upload(screen.getByTestId(DOCUMENT_UPLOAD_INPUT_TESTID), [pdf('formula.pdf')]);
    await user.click(screen.getByTestId(DOCUMENT_UPLOAD_SUBMIT_TESTID));

    await waitFor(() => expect(enqueueBatchActionMock).toHaveBeenCalledTimes(1));
    const [encolado] = enqueueBatchActionMock.mock.calls[0] ?? [];
    expect(encolado).toEqual({
      strategy: 'formula',
      paths: signedUploads(1).map((upload) => upload.path),
    });
  });

  it('sin documentos.modificar no hay boton ni subida en el DOM (R11)', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'u-test-43',
      username: 'nora.paz',
      displayName: 'Nora Paz',
      roleName: 'Operador',
      permissions: ['recetas.consultar', 'recetas.modificar', 'documentos.consultar'],
    });

    await renderPantalla();

    expect(screen.queryByTestId(DOCUMENT_UPLOAD_OPEN_TESTID)).toBeNull();
    expect(screen.queryByTestId(DOCUMENT_UPLOAD_TESTID)).toBeNull();
  });

  it('el boton comparte contenedor padre con «Nueva formula» (R22)', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'u-test-42',
      username: 'carla.duarte',
      displayName: 'Carla Duarte Salas',
      roleName: 'Administrador',
      permissions: PERMISSIONS.map((permiso) => permiso.code),
    });
    // La lista vacia repite «Nueva formula» en su propio aviso: con una fila solo queda el de la
    // cabecera, que es el que comparte fila con el boton de subida.
    listRecipesActionMock.mockResolvedValue({
      status: 'success',
      data: {
        items: [
          {
            id: 'receta-1',
            name: 'Detergente industrial',
            description: null,
            imageUrl: null,
            stepCount: 1,
            createdAt: new Date('2026-01-15T10:20:30.000Z'),
            updatedAt: new Date('2026-02-20T08:00:00.000Z'),
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

    await renderPantalla();

    const crear = screen.getByTestId('recipe-create-open');
    const abrir = screen.getByTestId(DOCUMENT_UPLOAD_OPEN_TESTID);

    expect(abrir.parentElement).toBe(crear.parentElement);
  });
});
