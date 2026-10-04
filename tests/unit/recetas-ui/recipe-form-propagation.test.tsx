import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import { RecipeForm } from '@/app/(private)/produccion/formulas/components';
import type {
  RecipeDetail,
  RecipeLineView,
  RecipeVersionSummary,
} from '@/lib/modules/recetas';
import type { UpdateRecipeFormState } from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { FORMULAS_ROUTE, recipeVersionRoute } from '@/lib/shared/routes';

/**
 * Guardar la ficha de una original con versiones vivas pasa por el aviso de propagación.
 * `updateRecipeAction` es un doble: aquí se mide qué recibe y qué hace la pantalla con su respuesta.
 */

const { routerMock, updateRecipeActionMock, createRecipeActionMock, listProductsActionMock } =
  vi.hoisted(() => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    updateRecipeActionMock: vi.fn<(id: string, input: unknown) => Promise<UpdateRecipeFormState>>(),
    createRecipeActionMock: vi.fn(),
    listProductsActionMock: vi.fn(),
  }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  createRecipeAction: createRecipeActionMock,
  updateRecipeAction: updateRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.setConfig({ testTimeout: 30_000 });

const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const EMPTY_PAGE = { items: [], totalPages: 1 };
const TOUCH_TARGET_CLASSES = ['min-h-11', 'min-w-11'];

function lineView(): RecipeLineView {
  return {
    id: 'line-1',
    productId: PRODUCT_ID,
    productName: 'Agua',
    percentage: '100.00',
    productUnitId: null,
    productStock: null,
  };
}

function recipeDetail(): RecipeDetail {
  return {
    id: RECIPE_ID,
    name: 'Jabón',
    description: null,
    imageUrl: null,
    stepCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: [],
    lines: [lineView()],
    tools: [],
    original: null,
    isUnderReview: false,
    displayName: 'Jabón',
  };
}

function version(id: string, name: string): RecipeVersionSummary {
  return {
    id,
    name,
    displayName: `Jabón · ${name}`,
    isUnderReview: false,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
  };
}

const ONE_VERSION = [version(V1, 'Copia')];
const THREE_VERSIONS = [version(V1, 'Copia'), version(V2, 'Cambiada 2'), version(V3, 'Ligera')];

function renderEditForm(versions: readonly RecipeVersionSummary[]) {
  return render(
    <RecipeForm
      mode="edit"
      recipe={recipeDetail()}
      versions={versions}
      units={[]}
      initialProductPage={EMPTY_PAGE}
      initialMachinePage={EMPTY_PAGE}
    />,
  );
}

function sentInput(): Record<string, unknown> {
  const call = updateRecipeActionMock.mock.calls[0];
  if (call === undefined) throw new Error('updateRecipeAction no se llamó');
  return call[1] as Record<string, unknown>;
}

function checkboxes(): HTMLElement[] {
  return within(screen.getByTestId('propagate-versions-dialog')).getAllByRole('checkbox');
}

function expectTouchTarget(element: HTMLElement) {
  for (const cls of TOUCH_TARGET_CLASSES) expect(element).toHaveClass(cls);
}

let toastSuccessSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  updateRecipeActionMock.mockResolvedValue({ status: 'success', propagated: [] });
  toastSuccessSpy = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('R28 — sin versiones vivas se guarda como hoy', () => {
  it('R28: guarda sin abrir el aviso y vuelve a la lista', async () => {
    const user = setupUser();
    renderEditForm([]);

    await user.click(screen.getByTestId('recipe-form-submit'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
    expect(screen.queryByTestId('propagate-versions-dialog')).toBeNull();
    expect(updateRecipeActionMock).toHaveBeenCalledTimes(1);
    expect(sentInput().propagateToVersionIds).toEqual([]);
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
  });
});

describe('R24 — con versiones vivas se avisa antes de guardar', () => {
  it('R24: con 1 versión el título va en singular, la casilla marcada y la acción sin llamar', async () => {
    const user = setupUser();
    renderEditForm(ONE_VERSION);

    await user.click(screen.getByTestId('recipe-form-submit'));

    const dialog = await screen.findByTestId('propagate-versions-dialog');
    expect(within(dialog).getByTestId('propagate-versions-title')).toHaveTextContent(
      '1 versión parte de esta receta',
    );
    const boxes = checkboxes();
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName('Copia');
    expect(boxes[0]).toBeChecked();
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
  });

  it('R24: con 3 versiones el título va en plural, una casilla por versión y todas marcadas', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));

    const dialog = await screen.findByTestId('propagate-versions-dialog');
    expect(within(dialog).getByTestId('propagate-versions-title')).toHaveTextContent(
      '3 versiones parten de esta receta',
    );
    const boxes = checkboxes();
    expect(boxes.map((box) => box.getAttribute('data-version-id'))).toEqual([V1, V2, V3]);
    for (const [index, box] of boxes.entries()) {
      expect(box).toHaveAccessibleName(THREE_VERSIONS[index]!.name);
      expect(box).toBeChecked();
    }
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
  });

  it('R24: si la validación previa falla no se abre el aviso ni se llama a la acción', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.clear(screen.getByTestId('recipe-field-name'));
    await user.click(screen.getByTestId('recipe-form-submit'));

    expect(await screen.findByTestId('recipe-form-error')).toBeInTheDocument();
    expect(screen.queryByTestId('propagate-versions-dialog')).toBeNull();
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
  });
});

describe('R25 — guardar y propagar envía exactamente las marcadas', () => {
  it('R25: desmarcar una y propagar envía solo las otras dos', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(checkboxes()[1]!);
    expect(checkboxes()[1]).not.toBeChecked();

    await user.click(screen.getByTestId('propagate-versions-confirm'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    expect(updateRecipeActionMock.mock.calls[0]![0]).toBe(RECIPE_ID);
    expect(sentInput().propagateToVersionIds).toEqual([V1, V3]);
    expect(sentInput().name).toBe('Jabón');
  });

  it('R25: pulsar el nombre de la fila también desmarca la casilla', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    const dialog = await screen.findByTestId('propagate-versions-dialog');
    await user.click(within(dialog).getByText('Cambiada 2'));

    expect(checkboxes()[1]).not.toBeChecked();
    expect(checkboxes()[0]).toBeChecked();
  });

  it('R25: con cero marcadas «Guardar y propagar» queda deshabilitado', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    expect(screen.getByTestId('propagate-versions-confirm')).toBeEnabled();
    for (const box of checkboxes()) await user.click(box);

    expect(screen.getByTestId('propagate-versions-confirm')).toBeDisabled();
    await user.click(screen.getByTestId('propagate-versions-confirm'));
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
  });
});

describe('R26 — guardar sin propagar', () => {
  it('R26: «Guardar sin propagar» guarda con la lista de versiones vacía', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-skip'));

    await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
    expect(sentInput().propagateToVersionIds).toEqual([]);
  });
});

describe('R27 — cerrar el aviso no guarda nada', () => {
  it('R27: «Cancelar» cierra sin llamar a la acción y conserva lo escrito', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.clear(screen.getByTestId('recipe-field-name'));
    await user.type(screen.getByTestId('recipe-field-name'), 'Jabón nuevo');
    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-cancel'));

    await waitFor(() => expect(screen.queryByTestId('propagate-versions-dialog')).toBeNull());
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Jabón nuevo');
    expect(screen.getByTestId('recipe-line-percentage-0')).toHaveValue('100,00');
  });

  it('R27: Escape también cierra sin llamar a la acción', async () => {
    const user = setupUser();
    renderEditForm(ONE_VERSION);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByTestId('propagate-versions-dialog')).toBeNull());
    expect(updateRecipeActionMock).not.toHaveBeenCalled();
  });

  it('R27: al reabrir tras desmarcar, vuelven a estar todas marcadas', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(checkboxes()[0]!);
    await user.click(screen.getByTestId('propagate-versions-cancel'));
    await waitFor(() => expect(screen.queryByTestId('propagate-versions-dialog')).toBeNull());

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    for (const box of checkboxes()) expect(box).toBeChecked();
  });
});

describe('R29 — versiones por revisar tras propagar', () => {
  it('R29: no navega, refresca y nombra solo la versión por revisar con enlace a su página', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'success',
      propagated: [
        { versionId: V1, isUnderReview: false },
        { versionId: V2, isUnderReview: true },
        { versionId: V3, isUnderReview: false },
      ],
    });
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-confirm'));

    const notice = await screen.findByTestId('recipe-form-under-review');
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);

    const links = within(notice).getAllByTestId('recipe-form-under-review-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Cambiada 2');
    expect(links[0]).toHaveAttribute('href', recipeVersionRoute(RECIPE_ID, V2));
    expect(notice).not.toHaveTextContent('Copia');
    expect(notice).not.toHaveTextContent('Ligera');

    // Persistente: el formulario sigue montado y el aviso no se va solo.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('recipe-form-under-review')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-form')).toBeInTheDocument();
  });
});

describe('R30 — sin versiones por revisar se vuelve a la lista', () => {
  it('R30: propagar sin ninguna por revisar muestra el aviso de éxito y va a la lista', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'success',
      propagated: [{ versionId: V1, isUnderReview: false }],
    });
    renderEditForm(ONE_VERSION);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-confirm'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('recipe-form-under-review')).toBeNull();
  });

  it('R30: guardar sin propagar también vuelve a la lista', async () => {
    const user = setupUser();
    renderEditForm(ONE_VERSION);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-skip'));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(FORMULAS_ROUTE));
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
  });
});

describe('R31 — un guardado con propagación que falla', () => {
  it('R31: muestra el error en la región del formulario sin navegar ni perder lo escrito', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No autorizado para editar esta receta.',
    });
    renderEditForm(THREE_VERSIONS);

    await user.clear(screen.getByTestId('recipe-field-name'));
    await user.type(screen.getByTestId('recipe-field-name'), 'Jabón nuevo');
    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-confirm'));

    expect(await screen.findByTestId('recipe-form-error')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('recipe-form-error-message')).toHaveTextContent(
      'No autorizado para editar esta receta.',
    );
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastSuccessSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('recipe-field-name')).toHaveValue('Jabón nuevo');
  });
});

describe('R37 — objetivos táctiles de los controles nuevos', () => {
  it('R37: casillas, filas y botones del aviso miden al menos 44×44 px y el diálogo tiene scroll interno', async () => {
    const user = setupUser();
    renderEditForm(THREE_VERSIONS);

    await user.click(screen.getByTestId('recipe-form-submit'));
    const dialog = await screen.findByTestId('propagate-versions-dialog');

    expect(dialog).toHaveClass('max-h-[85dvh]');
    expect(within(dialog).getByTestId('propagate-versions-list')).toHaveClass('overflow-y-auto');
    for (const box of checkboxes()) expectTouchTarget(box);
    for (const row of within(dialog).getAllByTestId('propagate-version-row')) {
      expect(row).toHaveClass('min-h-11');
    }
    expectTouchTarget(screen.getByTestId('propagate-versions-confirm'));
    expectTouchTarget(screen.getByTestId('propagate-versions-skip'));
    expectTouchTarget(screen.getByTestId('propagate-versions-cancel'));
  });

  it('R37: el enlace de cada versión por revisar mide al menos 44×44 px', async () => {
    const user = setupUser();
    updateRecipeActionMock.mockResolvedValue({
      status: 'success',
      propagated: [{ versionId: V1, isUnderReview: true }],
    });
    renderEditForm(ONE_VERSION);

    await user.click(screen.getByTestId('recipe-form-submit'));
    await screen.findByTestId('propagate-versions-dialog');
    await user.click(screen.getByTestId('propagate-versions-confirm'));

    const link = await screen.findByTestId('recipe-form-under-review-link');
    expectTouchTarget(link);
  });
});
