import { cleanup, render, screen } from '@testing-library/react';

import {
  WORK_GROUP_FORM_ERROR_TESTID,
  WORK_GROUP_FORM_SUBMIT_TESTID,
  WORK_GROUP_NAME_FIELD_TESTID,
  WorkGroupForm,
} from '@/app/(private)/configuracion/usuarios/components';
import { ProductForm } from '@/app/(private)/inventario/components';
import { OrderCostQuote } from '@/app/(private)/pedidos/components';
import { Sheet } from '@/components/ui/sheet';
import { errorMessage, type ErrorState } from '@/lib/modules/errores';
import { PRODUCT_TYPES, type ProductView } from '@/lib/modules/inventario';

import { errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';
import { arbolAccesibleDe } from './arbol-accesible';

/**
 * Paridad de la alerta de error, una muestra por cada forma que `ErrorAlert` tiene que
 * reproducir, con el error de catalogo y con el inesperado:
 * - la region de error de un formulario, con el mensaje y el codigo con sus `data-testid`
 *   (`product-form`);
 * - la misma region con `data-code` en el contenedor (`work-group-form`);
 * - el bloque sin rol, con el mensaje en un `span` con prefijo (`order-cost-quote`).
 * Mocks de `product-form-tipo-autocomplete`, `work-group-form` y `order-cost-quote`.
 */

const {
  updateProductActionMock,
  listProductsActionMock,
  listPresentationsActionMock,
  createWorkGroupActionMock,
  listWorkGroupCandidatesActionMock,
} = vi.hoisted(() => ({
  updateProductActionMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  createWorkGroupActionMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  listWorkGroupCandidatesActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
}));

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  createProductAction: vi.fn(),
  updateProductAction: updateProductActionMock,
  listProductsAction: listProductsActionMock,
  deleteProductAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/work-group-actions', () => ({
  createWorkGroupAction: createWorkGroupActionMock,
  renameWorkGroupAction: vi.fn(),
  deleteWorkGroupAction: vi.fn(),
  addWorkGroupMemberAction: vi.fn(),
  removeWorkGroupMemberAction: vi.fn(),
  listWorkGroupsAction: vi.fn(),
  listWorkGroupMembersAction: vi.fn(),
  listWorkGroupCandidatesAction: listWorkGroupCandidatesActionMock,
}));

vi.mock('@/lib/modules/identity/adapters/driving/user-actions', () => ({
  listUsersAction: vi.fn(),
  getUserAction: vi.fn(),
  createUserAction: vi.fn(),
  updateUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
  setUserAccountStatusAction: vi.fn(),
}));

const PRODUCTO: ProductView = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Hidróxido de sodio',
  imagePath: null,
  stock: '12',
  unitId: null,
  qtyAlert: '5',
  type: PRODUCT_TYPES.PRODUCT,
  createdAt: new Date('2026-01-15T10:20:30.000Z'),
  updatedAt: new Date('2026-02-20T08:00:00.000Z'),
};

const ERROR_DE_CATALOGO: ErrorState = {
  status: 'error',
  code: 'invalid_input',
  message: errorMessage('invalid_input'),
};

const ERRORES: readonly (readonly [string, () => ErrorState])[] = [
  ['error de catalogo', () => ERROR_DE_CATALOGO],
  ['error inesperado', errorInesperado],
];

beforeEach(() => {
  vi.clearAllMocks();
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 },
  });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  listWorkGroupCandidatesActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('paridad de la alerta de error', () => {
  it.each(ERRORES)('R1 — region de error con mensaje y codigo (product-form), %s', async (_n, error) => {
    updateProductActionMock.mockResolvedValue(error());
    const user = setupUser();
    render(
      <Sheet open>
        <ProductForm product={PRODUCTO} onSaved={vi.fn()} />
      </Sheet>,
    );

    await user.click(screen.getByTestId('product-form-submit'));

    expect(arbolAccesibleDe(await screen.findByTestId('product-form-error'))).toMatchSnapshot();
  });

  it.each(ERRORES)('R1 — region de error con data-code (work-group-form), %s', async (_n, error) => {
    createWorkGroupActionMock.mockResolvedValue(error());
    const user = setupUser();
    render(
      <Sheet open onOpenChange={() => {}}>
        <WorkGroupForm group={null} onSaved={vi.fn()} />
      </Sheet>,
    );

    await user.type(screen.getByTestId(WORK_GROUP_NAME_FIELD_TESTID), 'Turno Noche');
    await user.click(screen.getByTestId(WORK_GROUP_FORM_SUBMIT_TESTID));

    expect(arbolAccesibleDe(await screen.findByTestId(WORK_GROUP_FORM_ERROR_TESTID))).toMatchSnapshot();
  });

  it.each(ERRORES)('R1 — bloque sin rol con prefijo (order-cost-quote), %s', (_n, error) => {
    render(<OrderCostQuote amount={null} quoting={false} error={error()} approximate={false} />);

    expect(arbolAccesibleDe(screen.getByTestId('order-cost-quote'))).toMatchSnapshot();
  });
});
