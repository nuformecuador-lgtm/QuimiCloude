import { cleanup, render, screen, waitFor } from '@testing-library/react';

import {
  ORDER_RECIPE_IMAGE_TESTID,
  OrderForm,
  RECIPE_PICKER_TESTID,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { Sheet } from '@/components/ui/sheet';
import type { RecipeDetail } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { arbolAccesible } from './arbol-accesible';

/**
 * Paridad del hueco de la imagen de la receta en el formulario de pedido, sin receta, con una
 * receta con imagen y con una sin ella. `OrderRecipeImage` pasa a delegar en `EntityImage`, y el
 * hueco tiene que seguir pintando lo mismo. Mocks de `tests/unit/pedidos-ui/order-form.test.tsx`.
 */

const { getRecipeActionMock } = vi.hoisted(() => ({
  getRecipeActionMock: vi.fn<(id: string) => Promise<unknown>>(),
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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => ({
  assignResponsiblesAction: vi.fn(),
  unassignResponsibleAction: vi.fn(),
  removeWorkGroupFromOrderAction: vi.fn(),
  listOrderResponsiblesAction: vi.fn(),
  listResponsiblesForOrdersAction: vi.fn(),
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  createOrderAction: vi.fn(),
  updateOrderAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  deleteOrderAction: vi.fn(),
  listOrdersAction: vi.fn(),
  getOrderAction: vi.fn(),
  quoteOrderCostAction: vi.fn(async () => ({ status: 'success', data: { ingredientsCost: null } })),
  quoteOrderPresentationAvailabilityAction: vi.fn(async () => ({
    status: 'success',
    data: { kind: 'ok', available: '0' },
  })),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: vi.fn(async () => ({ status: 'success', data: [] })),
  listRecipesAction: vi.fn(),
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(async () => ({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
  createPresentationAction: vi.fn(),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success',
    data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 },
  })),
}));

const RECETA_SIN_IMAGEN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Esmalte azul',
  imageUrl: null,
};
const RECETA_CON_IMAGEN = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Barniz mate',
  imageUrl: 'https://ejemplo.test/barniz.png',
};

const UNIDADES: readonly UnitView[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Litro',
    symbol: 'L',
    baseUnitId: null,
    factor: null,
    isSystem: true,
  },
];

function detalle(receta: { id: string; name: string; imageUrl: string | null }): RecipeDetail {
  return {
    id: receta.id,
    name: receta.name,
    description: null,
    imageUrl: receta.imageUrl,
    stepCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: [],
    packingSteps: [],
    lines: [],
    tools: [],
    original: null,
    isUnderReview: false,
    displayName: receta.name,
  };
}

function renderFormulario(recipes: RecipePickerPage) {
  return render(
    <Sheet open>
      <OrderForm recipes={recipes} units={UNIDADES} bridge={null} onSaved={vi.fn()} />
    </Sheet>,
  );
}

/** El hueco de la imagen es la columna del formulario que la contiene, que no cambia. */
function arbolDelHueco(): string {
  const imagen = screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID);
  const columna = imagen.parentElement?.parentElement;
  if (!(columna instanceof HTMLElement)) throw new Error('el hueco de la imagen no tiene columna');
  return arbolAccesible(columna);
}

async function elegirReceta(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(
    await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('paridad de la imagen del formulario de pedido', () => {
  it('R1 — sin receta elegida, con el marcador', () => {
    renderFormulario({ items: [RECETA_SIN_IMAGEN], totalPages: 1 });
    expect(arbolDelHueco()).toMatchSnapshot();
  });

  it('R1 — con una receta con imagen', async () => {
    getRecipeActionMock.mockResolvedValue({ status: 'success', data: detalle(RECETA_CON_IMAGEN) });
    const user = setupUser();
    renderFormulario({ items: [RECETA_CON_IMAGEN], totalPages: 1 });

    await elegirReceta(user);
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID)).toHaveAttribute(
        'src',
        RECETA_CON_IMAGEN.imageUrl,
      ),
    );

    expect(arbolDelHueco()).toMatchSnapshot();
  });

  it('R1 — con una receta sin imagen, el marcador se queda', async () => {
    getRecipeActionMock.mockResolvedValue({ status: 'success', data: detalle(RECETA_SIN_IMAGEN) });
    const user = setupUser();
    renderFormulario({ items: [RECETA_SIN_IMAGEN], totalPages: 1 });

    await elegirReceta(user);
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID)).toHaveAttribute(
        'alt',
        RECETA_SIN_IMAGEN.name,
      ),
    );

    expect(arbolDelHueco()).toMatchSnapshot();
  });
});
