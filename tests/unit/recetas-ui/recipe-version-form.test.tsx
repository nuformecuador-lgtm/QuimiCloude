import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
  UNEXPECTED_ERROR_NOTICE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { REFERENCIA_DEL_CASO, errorInesperado } from '../../helpers/identificador-de-request';
import { setupUser } from '../../helpers/user-event';

import {
  RecipeVersionForm,
  type RecipeVersionFormProps,
} from '@/app/(private)/produccion/formulas/components';
import type { RecipeDetail, RecipeLineView, RecipeStepView } from '@/lib/modules/recetas';
import type {
  CreateRecipeVersionFormState,
  UpdateRecipeVersionFormState,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import { recipeEditRoute } from '@/lib/shared/routes';

const { routerMock, createVersionMock, updateVersionMock, listProductsActionMock } = vi.hoisted(
  () => ({
    routerMock: {
      push: vi.fn<(href: string) => void>(),
      replace: vi.fn<(href: string) => void>(),
      refresh: vi.fn<() => void>(),
      back: vi.fn<() => void>(),
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<(href: string) => void>(),
    },
    createVersionMock:
      vi.fn<(originalId: string, input: unknown) => Promise<CreateRecipeVersionFormState>>(),
    updateVersionMock:
      vi.fn<(versionId: string, input: unknown) => Promise<UpdateRecipeVersionFormState>>(),
    listProductsActionMock: vi.fn(),
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  createRecipeVersionAction: createVersionMock,
  updateRecipeVersionAction: updateVersionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

vi.setConfig({ testTimeout: 30_000 });

const ORIGINAL_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const EMPTY_PAGE = { items: [], totalPages: 1 };

function lineView(id: string, productId: string, productName: string | null, percentage: string): RecipeLineView {
  return { id, productId, productName, percentage, productUnitId: null, productStock: null };
}

const ORIGINAL_LINES: readonly RecipeLineView[] = [
  lineView('l-a', PRODUCT_A, 'Agua', '60.00'),
  lineView('l-b', PRODUCT_B, 'Sal', '40.00'),
];

const VERSION_LINES: readonly RecipeLineView[] = [
  lineView('v-a', PRODUCT_A, 'Agua', '70.00'),
  lineView('v-c', PRODUCT_C, null, '30.00'),
];

const ORIGINAL = { id: ORIGINAL_ID, name: 'Jabón', lines: ORIGINAL_LINES, tools: [] };

const CHECKLIST_STEP: RecipeStepView = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: 'Mezclar en frío' }] },
    { kind: 'checklist', items: [{ spans: [{ text: 'Guantes puestos' }] }] },
  ],
};

const PACKING_STEP: RecipeStepView = {
  blocks: [
    { kind: 'paragraph', spans: [{ text: 'Etiquetar el envase', bold: true }] },
    { kind: 'checklist', items: [{ spans: [{ text: 'Lote impreso' }] }] },
  ],
};

const PACKING_PLAIN_STEP: RecipeStepView = {
  blocks: [{ kind: 'paragraph', spans: [{ text: 'Sellar la tapa' }] }],
};

function versionDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: VERSION_ID,
    name: 'Sin sal',
    description: 'Jabón base de la casa',
    imageUrl: 'https://cdn.example.test/jabon.png',
    stepCount: 1,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    steps: [CHECKLIST_STEP],
    packingSteps: [],
    lines: VERSION_LINES,
    tools: [],
    original: { id: ORIGINAL_ID, name: 'Jabón' },
    isUnderReview: false,
    displayName: 'Jabón · Sin sal',
    ...overrides,
  };
}

function renderCreate() {
  const props: RecipeVersionFormProps = {
    mode: 'create',
    original: ORIGINAL,
    units: [],
    initialProductPage: EMPTY_PAGE,
    initialMachinePage: EMPTY_PAGE,
  };
  return render(<RecipeVersionForm {...props} />);
}

function renderEdit(version: RecipeDetail = versionDetail()) {
  const props: RecipeVersionFormProps = {
    mode: 'edit',
    original: ORIGINAL,
    version,
    units: [],
    initialProductPage: EMPTY_PAGE,
    initialMachinePage: EMPTY_PAGE,
  };
  return render(<RecipeVersionForm {...props} />);
}

function percentageValues(): string[] {
  return screen
    .getAllByTestId(/^recipe-line-percentage-\d+$/)
    .map((input) => (input as HTMLInputElement).value);
}

let toastSuccessSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  createVersionMock.mockResolvedValue({ status: 'success', id: VERSION_ID });
  updateVersionMock.mockResolvedValue({ status: 'success' });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
  });
  toastSuccessSpy = vi.spyOn(toast, 'success');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RecipeVersionForm — precarga', () => {
  it('R8 — el alta abre con el nombre vacío y las líneas de la original', () => {
    renderCreate();

    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('');
    expect(percentageValues()).toEqual(['60,00', '40,00']);
    expect(screen.getByTestId('recipe-line-product-0')).toHaveValue('Agua');
    expect(screen.getByTestId('recipe-line-product-1')).toHaveValue('Sal');
    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'same');
    expect(screen.getByTestId('recipe-line-mark-1')).toHaveAttribute('data-mark', 'same');
  });

  it('R9 — la edición abre con el nombre propio y las líneas de la versión, incluida la de un producto dado de baja', () => {
    renderEdit();

    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('Sin sal');
    expect(percentageValues()).toEqual(['70,00', '30,00']);
    expect(screen.getByTestId('recipe-line-unavailable-1')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-line-mark-0')).toHaveAttribute('data-mark', 'changed');
    expect(screen.getByTestId('recipe-line-mark-1')).toHaveAttribute('data-mark', 'added');
    expect(within(screen.getByTestId('recipe-lines-removed')).getByTestId('recipe-line-removed-0'))
      .toHaveTextContent('Sal');
  });
});

describe('RecipeVersionForm — guardar habilitado solo con 100,00 % y todo con producto', () => {
  it('R11 — fuera de 100,00 % el botón se deshabilita y Enter tampoco envía', async () => {
    const user = setupUser();
    renderCreate();
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Nueva');
    expect(screen.getByTestId('recipe-version-form-submit')).toBeEnabled();

    await user.clear(screen.getByTestId('recipe-line-percentage-1'));

    expect(screen.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'false');
    expect(screen.getByTestId('recipe-version-form-submit')).toBeDisabled();
    screen.getByTestId('recipe-version-field-name').focus();
    await user.keyboard('{Enter}');
    expect(createVersionMock).not.toHaveBeenCalled();
  });

  it('R11 — una línea sin producto deshabilita aunque la suma sea 100,00 %, y Enter tampoco envía', async () => {
    const user = setupUser();
    renderCreate();
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Nueva');

    await user.click(screen.getByTestId('recipe-line-add-1'));

    expect(screen.getAllByTestId('recipe-line-row')).toHaveLength(3);
    expect(screen.getByTestId('recipe-lines-sum')).toHaveAttribute('data-complete', 'true');
    expect(screen.getByTestId('recipe-version-form-submit')).toBeDisabled();
    screen.getByTestId('recipe-version-field-name').focus();
    await user.keyboard('{Enter}');
    expect(createVersionMock).not.toHaveBeenCalled();
  });
});

describe('RecipeVersionForm — guardado con éxito', () => {
  it('R12, R22 — el alta envía exactamente { name, lines, tools } a la original, avisa y lleva a su ficha', async () => {
    const user = setupUser();
    renderCreate();
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Sin sal');

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    await waitFor(() => expect(createVersionMock).toHaveBeenCalledTimes(1));
    const [originalId, payload] = createVersionMock.mock.calls[0]!;
    expect(originalId).toBe(ORIGINAL_ID);
    expect(payload).toStrictEqual({
      name: 'Sin sal',
      lines: [
        { productId: PRODUCT_A, percentage: '60.00' },
        { productId: PRODUCT_B, percentage: '40.00' },
      ],
      tools: [],
    });
    expect(Object.keys(payload as object).sort()).toEqual(['lines', 'name', 'tools']);
    expect(updateVersionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(recipeEditRoute(ORIGINAL_ID)));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
  });

  it('R13, R22 — la edición envía exactamente { name, lines, tools } a la versión, sin pasos, descripción ni imagen', async () => {
    const user = setupUser();
    renderEdit();
    await user.clear(screen.getByTestId('recipe-version-field-name'));
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Con menos sal');

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    await waitFor(() => expect(updateVersionMock).toHaveBeenCalledTimes(1));
    const [versionId, payload] = updateVersionMock.mock.calls[0]!;
    expect(versionId).toBe(VERSION_ID);
    expect(payload).toStrictEqual({
      name: 'Con menos sal',
      lines: [
        { productId: PRODUCT_A, percentage: '70.00' },
        { productId: PRODUCT_C, percentage: '30.00' },
      ],
      tools: [],
    });
    expect(payload).not.toHaveProperty('steps');
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('image');
    expect(createVersionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(recipeEditRoute(ORIGINAL_ID)));
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
  });
});

describe('RecipeVersionForm — cancelar', () => {
  it('R14 — «Cancelar» es un enlace a la ficha de la original y no invoca nada', async () => {
    const user = setupUser();
    renderEdit();
    const cancel = screen.getByTestId('recipe-version-form-cancel');

    expect(cancel.tagName).toBe('A');
    expect(cancel).toHaveAttribute('href', recipeEditRoute(ORIGINAL_ID));
    expect(cancel).toHaveTextContent('Cancelar');

    await user.click(cancel);
    expect(createVersionMock).not.toHaveBeenCalled();
    expect(updateVersionMock).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('RecipeVersionForm — errores del guardado', () => {
  it('R15 — nombre duplicado se pinta junto al nombre, sin navegar ni perder lo escrito', async () => {
    const user = setupUser();
    createVersionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_duplicate_name',
      message: 'Ya existe una versión con ese nombre.',
    });
    renderCreate();
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Repetida');

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    const error = await screen.findByTestId('recipe-version-error-name');
    expect(error).toHaveTextContent('Ya existe una versión con ese nombre.');
    expect(screen.getByTestId('recipe-version-field-name')).toHaveAttribute(
      'aria-describedby',
      'recipe-version-error-name',
    );
    expect(screen.queryByTestId('recipe-version-form-error')).toBeNull();
    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('Repetida');
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(toastSuccessSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['unauthorized', 'No tienes permiso para esta operación.'],
    ['invalid_input', 'Datos no válidos.'],
  ] as const)(
    'R15 — %s va a la región de error, sin navegar y con lo escrito intacto',
    async (code, message) => {
      const user = setupUser();
      updateVersionMock.mockResolvedValue({ status: 'error', code, message });
      renderEdit();
      await user.clear(screen.getByTestId('recipe-version-field-name'));
      await user.type(screen.getByTestId('recipe-version-field-name'), 'Escrito a mano');

      await user.click(screen.getByTestId('recipe-version-form-submit'));

      const region = await screen.findByTestId('recipe-version-form-error');
      expect(region).toHaveAttribute('role', 'alert');
      expect(within(region).getByTestId('recipe-version-form-error-message')).toHaveTextContent(message);
      expect(within(region).getByTestId('recipe-version-form-error-code')).toHaveTextContent(code);
      expect(screen.queryByTestId('recipe-version-error-name')).toBeNull();
      expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('Escrito a mano');
      expect(percentageValues()).toEqual(['70,00', '30,00']);
      expect(routerMock.push).not.toHaveBeenCalled();
      expect(toastSuccessSpy).not.toHaveBeenCalled();
    },
  );

  it('R15 — el error inesperado se pinta con su identificador', async () => {
    const user = setupUser();
    updateVersionMock.mockResolvedValue(errorInesperado());
    renderEdit();

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    const region = await screen.findByTestId('recipe-version-form-error');
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_TESTID)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toBeInTheDocument();
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe('RecipeVersionForm — guardado en curso', () => {
  it('R16 — mientras se guarda el botón está deshabilitado y dice «Guardando…»', async () => {
    const user = setupUser();
    let resolve: (value: UpdateRecipeVersionFormState) => void = () => {};
    updateVersionMock.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderEdit();
    const submit = screen.getByTestId('recipe-version-form-submit');

    await user.click(submit);

    await waitFor(() => expect(submit).toHaveTextContent('Guardando…'));
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    await user.click(submit);
    expect(updateVersionMock).toHaveBeenCalledTimes(1);

    resolve({ status: 'success' });
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
  });
});

describe('RecipeVersionForm — lo heredado de la original', () => {
  it('R20 — en edición, imagen y descripción de la original como lectura, sin campos', () => {
    renderEdit();

    const inherited = screen.getByTestId('recipe-version-inherited');
    expect(inherited).toHaveTextContent('De la receta original');
    const image = within(inherited).getByTestId('recipe-version-inherited-image');
    expect(image.tagName).toBe('IMG');
    expect(image).toHaveAttribute('src', 'https://cdn.example.test/jabon.png');
    expect(within(inherited).getByTestId('recipe-version-inherited-description')).toHaveTextContent(
      'Jabón base de la casa',
    );
    expect(within(inherited).queryByRole('textbox')).toBeNull();
    expect(inherited.querySelector('input:not([type="checkbox"]), textarea, select')).toBeNull();
    expect(screen.queryByTestId('recipe-field-description')).toBeNull();
    expect(screen.queryByTestId('recipe-image-input')).toBeNull();
  });

  it('R20 — en edición sin imagen no pinta ninguna', () => {
    renderEdit(versionDetail({ imageUrl: null }));

    expect(screen.queryByTestId('recipe-version-inherited-image')).toBeNull();
  });

  it('R20, R21 — el alta no ofrece descripción, imagen ni pasos', () => {
    renderCreate();

    expect(screen.queryByTestId('recipe-version-inherited')).toBeNull();
    expect(screen.queryByTestId('recipe-version-inherited-steps')).toBeNull();
    expect(screen.queryByTestId('recipe-field-description')).toBeNull();
    expect(screen.queryByTestId('recipe-image-input')).toBeNull();
    expect(screen.queryByTestId('step-reader-document')).toBeNull();
    expect(screen.queryByTestId('recipe-steps-field')).toBeNull();
  });

  it('R21 — los pasos de la original se leen dentro de un contenedor inert y la casilla no se marca', async () => {
    const user = setupUser();
    renderEdit();

    const steps = screen.getByTestId('recipe-version-inherited-steps');
    expect(steps).toHaveAttribute('inert');
    expect(steps).toHaveAttribute('aria-readonly', 'true');
    expect(within(steps).getByText('Mezclar en frío')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-steps-field')).toBeNull();

    const checkbox = within(steps).getByTestId('step-reader-item-1-0');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await user.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(updateVersionMock).not.toHaveBeenCalled();
  });

  it('R21 — sin pasos en la original se muestra el texto de vacío', () => {
    renderEdit(versionDetail({ steps: [], stepCount: 0 }));

    expect(screen.getByTestId('recipe-version-steps-empty')).toHaveTextContent(
      'La receta original no tiene pasos.',
    );
    expect(screen.queryByTestId('recipe-version-inherited-steps')).toBeNull();
  });

  it('R12 — los pasos de envasado heredados se leen dentro de un contenedor inert, sin editor ni marcado', async () => {
    const user = setupUser();
    renderEdit(versionDetail({ packingSteps: [PACKING_STEP, PACKING_PLAIN_STEP] }));

    const packing = screen.getByTestId('recipe-version-inherited-packing-steps');
    expect(packing).toHaveAttribute('inert');
    expect(packing).toHaveAttribute('aria-readonly', 'true');
    expect(within(packing).getByText('Etiquetar el envase')).toBeInTheDocument();
    expect(within(packing).getByText('Sellar la tapa')).toBeInTheDocument();
    expect(within(packing).getByText('Lote impreso')).toBeInTheDocument();
    // La negrilla del documento se conserva tal cual al leerla.
    expect(within(packing).getByText('Etiquetar el envase').closest('strong')).not.toBeNull();

    expect(packing.querySelector('[contenteditable], input:not([type="checkbox"]), textarea, select')).toBeNull();
    expect(within(packing).queryByRole('button')).toBeNull();
    expect(within(packing).queryByRole('toolbar')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-steps-field')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-step-add')).toBeNull();
    expect(screen.queryByTestId('recipe-version-packing-steps-empty')).toBeNull();

    const checkbox = within(packing).getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await user.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(updateVersionMock).not.toHaveBeenCalled();
  });

  it('R12 — sin pasos de envasado en la original se muestra el aviso y ningún bloque', () => {
    renderEdit(versionDetail({ packingSteps: [] }));

    expect(screen.getByTestId('recipe-version-packing-steps-empty')).toHaveTextContent(
      'La receta original no tiene pasos de envasado.',
    );
    expect(screen.queryByTestId('recipe-version-inherited-packing-steps')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-steps-field')).toBeNull();
  });

  it('R12 — el alta de versión no ofrece pasos de envasado ni para leer ni para editar', () => {
    renderCreate();

    expect(screen.queryByTestId('recipe-version-inherited-packing-steps')).toBeNull();
    expect(screen.queryByTestId('recipe-version-packing-steps-empty')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-steps-field')).toBeNull();
  });

  it('R23 — la versión por revisar lleva la marca «Por revisar»', () => {
    renderEdit(versionDetail({ isUnderReview: true }));

    expect(screen.getByTestId('recipe-version-form-under-review')).toHaveTextContent('Por revisar');
  });

  it('R23 — sin revisión pendiente, ni en edición ni en alta, no hay marca', () => {
    renderEdit();
    expect(screen.queryByTestId('recipe-version-form-under-review')).toBeNull();
    cleanup();
    renderCreate();
    expect(screen.queryByTestId('recipe-version-form-under-review')).toBeNull();
  });
});

describe('RecipeVersionForm — multiplataforma', () => {
  it('R37 — nombre con text-base y objetivos táctiles de 44 px en guardar y cancelar', () => {
    renderEdit();

    expect(screen.getByTestId('recipe-version-field-name')).toHaveClass('text-base');
    for (const testId of ['recipe-version-form-submit', 'recipe-version-form-cancel']) {
      expect(screen.getByTestId(testId)).toHaveClass('min-h-11', 'min-w-11');
    }
  });
});

describe('RecipeVersionForm — herramientas', () => {
  const TOOL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const GONE_TOOL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ORIGINAL_TOOLS = [
    { id: 'ot1', productId: TOOL_ID, productName: 'Agitador', quantity: 2 },
    { id: 'ot2', productId: GONE_TOOL_ID, productName: null, quantity: 1 },
  ];

  function renderWith(mode: { mode: 'create' } | { mode: 'edit'; version: RecipeDetail }) {
    const props: RecipeVersionFormProps = {
      original: { ...ORIGINAL, tools: ORIGINAL_TOOLS },
      units: [],
      initialProductPage: EMPTY_PAGE,
      initialMachinePage: EMPTY_PAGE,
      ...mode,
    };
    return render(<RecipeVersionForm {...props} />);
  }

  it('R23, R26 — el alta precarga las de la original y envía exactamente esas, incluida la no disponible', async () => {
    const user = setupUser();
    renderWith({ mode: 'create' });
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Sin sal');

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    await waitFor(() => expect(createVersionMock).toHaveBeenCalledTimes(1));
    const [, payload] = createVersionMock.mock.calls[0]!;
    expect((payload as { tools: unknown }).tools).toStrictEqual([
      { productId: TOOL_ID, quantity: 2 },
      { productId: GONE_TOOL_ID, quantity: 1 },
    ]);
  });

  it('R26 — la edición envía las herramientas de la versión tras quitar una en el tab', async () => {
    const user = setupUser();
    renderWith({
      mode: 'edit',
      version: versionDetail({
        tools: [
          { id: 'vt1', productId: TOOL_ID, productName: 'Agitador', quantity: 3 },
          { id: 'vt2', productId: GONE_TOOL_ID, productName: 'Balanza', quantity: 4 },
        ],
      }),
    });
    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.click(screen.getByTestId('recipe-machine-remove-0'));

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    await waitFor(() => expect(updateVersionMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateVersionMock.mock.calls[0]!;
    expect((payload as { tools: unknown }).tools).toStrictEqual([
      { productId: GONE_TOOL_ID, quantity: 4 },
    ]);
  });

  it('R25 — cantidad vacía: no invoca la acción y el error sale en su fila', async () => {
    const user = setupUser();
    renderWith({ mode: 'create' });
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Sin sal');
    await user.click(screen.getByTestId('recipe-lines-tab-machines'));
    await user.clear(screen.getByTestId('recipe-machine-quantity-0'));

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    expect(await screen.findByTestId('recipe-machine-quantity-error-0')).toBeInTheDocument();
    expect(screen.getByTestId('recipe-version-form-error')).toBeInTheDocument();
    expect(createVersionMock).not.toHaveBeenCalled();
  });

  it('R27 — un rechazo del servidor sale en la región de error sin navegar ni perder lo escrito', async () => {
    const user = setupUser();
    createVersionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_input',
      message: 'La entrada recibida no es valida.',
    });
    renderWith({ mode: 'create' });
    await user.type(screen.getByTestId('recipe-version-field-name'), 'Sin sal');

    await user.click(screen.getByTestId('recipe-version-form-submit'));

    expect(await screen.findByTestId('recipe-version-form-error-message')).toHaveTextContent(
      'La entrada recibida no es valida.',
    );
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('recipe-version-field-name')).toHaveValue('Sin sal');
  });
});
