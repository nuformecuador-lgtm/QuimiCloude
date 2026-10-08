import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeForm } from '@/app/(private)/produccion/formulas/components';
import type { RecipeDetail, RecipeStepView } from '@/lib/modules/recetas';
import type {
  CreateRecipeFormState,
  UpdateRecipeFormState,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';

import { setupUser } from '../../helpers/user-event';

const { routerMock, createRecipeActionMock, updateRecipeActionMock } = vi.hoisted(() => ({
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
  createRecipeActionMock: vi.fn<(input: unknown) => Promise<CreateRecipeFormState>>(),
  updateRecipeActionMock: vi.fn<(id: string, input: unknown) => Promise<UpdateRecipeFormState>>(),
}));

// El barrel de formulas arrastra la subida de PDF, que carga `observabilidad`.
vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: vi.fn(), endSession: vi.fn() },
  observabilidad: { readRequestIdHeader: vi.fn(async (): Promise<string | null> => null) },
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
  listProductsAction: vi.fn(),
}));

vi.mock('@/lib/modules/unidades/adapters/driving/unit-actions', () => ({
  listUnitsAction: vi.fn(),
}));

vi.setConfig({ testTimeout: 30_000 });

const RECIPE_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const EMPTY_PAGE = { items: [], totalPages: 1 };
const ROW_HEIGHT = 60;

function paragraph(text: string): RecipeStepView {
  return { blocks: [{ kind: 'paragraph', spans: [{ text }] }] };
}

const RICH_PACKING_STEP: RecipeStepView = {
  blocks: [
    {
      kind: 'paragraph',
      spans: [{ text: 'Sellar', bold: true }, { text: ' y ' }, { text: 'rotular', italic: true }],
    },
    {
      kind: 'checklist',
      items: [{ spans: [{ text: 'Tapa firme' }] }, { spans: [{ text: 'Lote impreso', bold: true }] }],
    },
  ],
};

function recipeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECIPE_ID,
    name: 'Detergente industrial',
    description: null,
    imageUrl: null,
    stepCount: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: [paragraph('Mezclar')],
    packingSteps: [],
    lines: [
      {
        id: 'line-1',
        productId: PRODUCT_ID,
        productName: 'Ácido cítrico',
        percentage: '100.00',
        productUnitId: null,
        productStock: null,
      },
    ],
    tools: [],
    original: null,
    isUnderReview: false,
    displayName: 'Detergente industrial',
    ...overrides,
  };
}

function renderCreate() {
  return render(
    <RecipeForm mode="create" units={[]} initialProductPage={EMPTY_PAGE} initialMachinePage={EMPTY_PAGE} />,
  );
}

function renderEdit(recipe: RecipeDetail) {
  return render(
    <RecipeForm
      mode="edit"
      recipe={recipe}
      versions={[]}
      units={[]}
      initialProductPage={EMPTY_PAGE}
      initialMachinePage={EMPTY_PAGE}
    />,
  );
}

beforeAll(() => {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => {
      const rects: DOMRect[] = [];
      return Object.assign(rects, {
        item: (index: number) => rects[index] ?? null,
      }) as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
  if (typeof document.elementFromPoint !== 'function') {
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () =>
      null;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  createRecipeActionMock.mockResolvedValue({ status: 'success', id: RECIPE_ID });
  updateRecipeActionMock.mockResolvedValue({ status: 'success', propagated: [] });
});

afterEach(() => {
  cleanup();
});

/** dnd-kit decide arriba/abajo por rectangulos y jsdom los da vacios: cada fila mide su posicion. */
function installRowRectStub(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const row = this.closest('li[data-testid$="-row"]');
    if (row !== null) {
      const rows = row.parentElement === null ? [row] : Array.from(row.parentElement.children);
      const top = Math.max(0, rows.indexOf(row)) * ROW_HEIGHT;
      const rect = { x: 0, y: top, top, left: 0, right: 320, bottom: top + ROW_HEIGHT, width: 320, height: ROW_HEIGHT };
      return { ...rect, toJSON: () => rect } as DOMRect;
    }
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/** Pegado real: el documento que sale lo decide el esquema cerrado del editor. */
function paste(target: Element, { html, text }: { html?: string; text: string }): void {
  const clipboardData = {
    types: html === undefined ? ['text/plain'] : ['text/html', 'text/plain'],
    getData: (type: string) => (type === 'text/html' ? (html ?? '') : text),
    files: [] as unknown as FileList,
  };
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  target.dispatchEvent(event);
}

async function writePackingStep(
  index: number,
  text: string,
  { html, visible = text }: { html?: string; visible?: string } = {},
): Promise<void> {
  const editable = screen.getByTestId(`recipe-packing-step-text-${index}`);
  editable.focus();
  paste(editable, { html, text });
  await waitFor(() => expect(editable).toHaveTextContent(visible));
}

function plainTexts(steps: readonly RecipeStepView[]): string[] {
  return steps.map((step) =>
    step.blocks
      .map((block) =>
        block.kind === 'paragraph'
          ? block.spans.map((span) => span.text).join('')
          : block.items.map((item) => item.spans.map((span) => span.text).join('')).join(' '),
      )
      .join('\n'),
  );
}

type SentPayload = { readonly steps: RecipeStepView[]; readonly packingSteps: RecipeStepView[] };

async function submitAndReadUpdate(user: UserEvent): Promise<SentPayload> {
  await user.click(screen.getByTestId('recipe-form-submit'));
  await waitFor(() => expect(updateRecipeActionMock).toHaveBeenCalledTimes(1));
  const [, payload] = updateRecipeActionMock.mock.calls[0] as [string, SentPayload];
  return payload;
}

function follows(earlier: Element, later: Element): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('QC-211 R7 — sección «Pasos de envasado» en el formulario de fórmula', () => {
  it('R7: el alta muestra la sección propia, separada de «Pasos», después de ella y antes de los botones', () => {
    renderCreate();

    const operator = screen.getByTestId('recipe-steps-field');
    const packing = screen.getByTestId('recipe-packing-steps-field');
    expect(within(operator).getByRole('heading', { name: 'Pasos' })).toBeInTheDocument();
    expect(within(packing).getByRole('heading', { name: 'Pasos de envasado' })).toBeInTheDocument();
    expect(within(packing).getByTestId('recipe-packing-step-add')).toHaveTextContent(
      'Añadir paso de envasado',
    );
    expect(operator.contains(packing)).toBe(false);
    expect(packing.contains(operator)).toBe(false);
    expect(follows(operator, packing)).toBe(true);
    expect(follows(packing, screen.getByTestId('recipe-form-submit'))).toBe(true);
    expect(within(packing).queryAllByTestId('recipe-packing-step-row')).toHaveLength(0);
  });

  it('R7: la edición también la muestra, con el editor completo en cada paso de envasado', () => {
    renderEdit(recipeDetail({ packingSteps: [paragraph('Etiquetar')] }));

    const packing = screen.getByTestId('recipe-packing-steps-field');
    expect(within(packing).getAllByTestId('recipe-packing-step-row')).toHaveLength(1);
    const toolbar = within(packing).getByRole('toolbar');
    expect(within(toolbar).getByRole('button', { name: 'Negrilla' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Cursiva' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: /Lista de verificaci/ })).toBeInTheDocument();
    expect(within(packing).getByTestId('recipe-packing-step-handle-0')).toBeInTheDocument();
    expect(within(packing).getByTestId('recipe-packing-step-remove-0')).toBeInTheDocument();
  });

  it('R7, R8: añadir, escribir con negrilla, cursiva y lista, y quitar llegan al payload en orden y sin tocar los pasos del operador', async () => {
    const user = setupUser();
    renderEdit(recipeDetail());

    await user.click(screen.getByTestId('recipe-packing-step-add'));
    await writePackingStep(0, 'Descartar');
    await user.click(screen.getByTestId('recipe-packing-step-add'));
    await writePackingStep(
      1,
      'Sellar y rotular Tapa firme',
      {
        html: '<p><strong>Sellar</strong> y <em>rotular</em></p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Tapa firme</p></li></ul>',
        visible: 'Tapa firme',
      },
    );
    await user.click(screen.getByTestId('recipe-packing-step-add'));
    await writePackingStep(2, 'Paletizar');
    await user.click(screen.getByTestId('recipe-packing-step-remove-0'));

    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(1);

    const payload = await submitAndReadUpdate(user);
    expect(plainTexts(payload.steps)).toEqual(['Mezclar']);
    expect(plainTexts(payload.packingSteps)).toEqual(['Sellar y rotular\nTapa firme', 'Paletizar']);

    const [rich] = payload.packingSteps;
    const first = rich?.blocks[0];
    expect(first?.kind).toBe('paragraph');
    const spans = first?.kind === 'paragraph' ? first.spans : [];
    expect(spans.find((span) => span.text === 'Sellar')?.bold).toBe(true);
    expect(spans.find((span) => span.text === 'rotular')?.italic).toBe(true);
    expect(rich?.blocks[1]?.kind).toBe('checklist');
  });

  it('R7, R8: reordenar por teclado cambia el orden enviado de los pasos de envasado y no el del operador', async () => {
    const uninstall = installRowRectStub();
    try {
      const user = setupUser();
      renderEdit(
        recipeDetail({
          steps: [paragraph('Pesar'), paragraph('Mezclar')],
          packingSteps: [paragraph('Etiquetar'), paragraph('Sellar'), paragraph('Paletizar')],
        }),
      );

      screen.getByTestId('recipe-packing-step-handle-0').focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');

      const payload = await submitAndReadUpdate(user);
      expect(plainTexts(payload.packingSteps)).toEqual(['Sellar', 'Etiquetar', 'Paletizar']);
      expect(plainTexts(payload.steps)).toEqual(['Pesar', 'Mezclar']);
    } finally {
      uninstall();
    }
  });

  it('R7, R8: reordenar por arrastre con el ratón cambia el orden enviado de los pasos de envasado', async () => {
    const uninstall = installRowRectStub();
    try {
      const user = setupUser();
      renderEdit(
        recipeDetail({
          steps: [paragraph('Pesar'), paragraph('Mezclar'), paragraph('Envasar')],
          packingSteps: [paragraph('Etiquetar'), paragraph('Sellar'), paragraph('Paletizar')],
        }),
      );

      const handle = screen.getByTestId('recipe-packing-step-handle-0');
      await user.pointer([
        { keys: '[MouseLeft>]', target: handle, coords: { clientX: 10, clientY: ROW_HEIGHT / 2 } },
        { target: handle, coords: { clientX: 10, clientY: ROW_HEIGHT + 20 } },
        { target: handle, coords: { clientX: 10, clientY: ROW_HEIGHT * 2 + ROW_HEIGHT / 2 } },
        { keys: '[/MouseLeft]' },
      ]);

      const payload = await submitAndReadUpdate(user);
      expect(plainTexts(payload.packingSteps)).toEqual(['Sellar', 'Paletizar', 'Etiquetar']);
      expect(plainTexts(payload.steps)).toEqual(['Pesar', 'Mezclar', 'Envasar']);
    } finally {
      uninstall();
    }
  });
});

/**
 * Paso vacío tal como lo deja «Añadir paso»: un párrafo sin fragmentos.
 *
 * Los dos casos de R8 lo CARGAN con la fórmula en vez de pulsar «Añadir» (2026-10-07). En CI el
 * caso de envasado falló una vez sin rastro: `findBy` agotó sus 5 s (`asyncUtilTimeout`) sin que
 * el error llegara a pintarse, con el test en 5068 ms y el resto del archivo en ~100 ms. No era
 * lentitud -la validación es síncrona y el clic va envuelto en `act`, así que el error está o no
 * está en cuanto el clic vuelve-; era que el envío no tomó el camino del error. Cargar el paso
 * vacío quita del recorrido el clic de «Añadir» y el editor que nace después del montaje, que
 * R8 no necesita (añadir lo cubre el caso de R7 de arriba). Y las comprobaciones son síncronas y
 * van en orden de diagnóstico: si vuelve a fallar, falla al instante y diciendo por dónde.
 */
const EMPTY_STEP: RecipeStepView = { blocks: [{ kind: 'paragraph', spans: [] }] };

describe('QC-211 R8 — los errores no cruzan de sección', () => {
  it('R8: un paso de envasado vacío pinta su error en ese paso de envasado y no en el paso del operador con el mismo índice', async () => {
    const user = setupUser();
    renderEdit(
      recipeDetail({
        steps: [paragraph('Pesar'), paragraph('Mezclar')],
        packingSteps: [paragraph('Etiquetar'), EMPTY_STEP],
      }),
    );
    expect(screen.getAllByTestId('recipe-packing-step-row')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-form-submit'));

    expect(updateRecipeActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('recipe-packing-step-field-error-1')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-packing-step-field-error-0')).toBeNull();
    expect(screen.queryByTestId('recipe-step-field-error-0')).toBeNull();
    expect(screen.queryByTestId('recipe-step-field-error-1')).toBeNull();
  });

  it('R8: un paso del operador vacío pinta su error en ese paso y en ningún paso de envasado', async () => {
    const user = setupUser();
    renderEdit(
      recipeDetail({
        steps: [paragraph('Mezclar'), EMPTY_STEP],
        packingSteps: [paragraph('Etiquetar'), paragraph('Sellar')],
      }),
    );
    expect(screen.getAllByTestId('recipe-step-row')).toHaveLength(2);

    await user.click(screen.getByTestId('recipe-form-submit'));

    expect(updateRecipeActionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('recipe-step-field-error-1')).toBeInTheDocument();
    expect(screen.queryByTestId('recipe-step-field-error-0')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-step-field-error-0')).toBeNull();
    expect(screen.queryByTestId('recipe-packing-step-field-error-1')).toBeNull();
  });

  it('R8: sin pasos de envasado se envía la clave propia vacía', async () => {
    const user = setupUser();
    renderEdit(recipeDetail());

    const payload = await submitAndReadUpdate(user);
    expect(payload.packingSteps).toEqual([]);
  });
});

describe('QC-211 R9 — la edición carga los pasos de envasado intactos', () => {
  it('R9: marcas y lista de verificación se precargan en orden y guardar sin tocarlos los deja idénticos', async () => {
    const user = setupUser();
    const packingSteps = [RICH_PACKING_STEP, paragraph('Paletizar')];
    renderEdit(recipeDetail({ packingSteps }));

    const first = screen.getByTestId('recipe-packing-step-text-0');
    expect(first).toHaveTextContent('Sellar y rotular');
    expect(first.querySelector('strong')).toHaveTextContent('Sellar');
    expect(first.querySelector('em')).toHaveTextContent('rotular');
    expect(first.querySelector('ul[data-type="taskList"]')).not.toBeNull();
    expect(screen.getByTestId('recipe-packing-step-text-1')).toHaveTextContent('Paletizar');

    const payload = await submitAndReadUpdate(user);
    expect(payload.packingSteps).toStrictEqual(packingSteps);
    expect(plainTexts(payload.steps)).toEqual(['Mezclar']);
  });

  it('R9: una lectura sin la clave de pasos de envasado abre la sección vacía', () => {
    const legacy = Object.fromEntries(
      Object.entries(recipeDetail()).filter(([key]) => key !== 'packingSteps'),
    ) as unknown as RecipeDetail;
    expect('packingSteps' in legacy).toBe(false);
    renderEdit(legacy);

    expect(screen.getByTestId('recipe-packing-steps-field')).toBeInTheDocument();
    expect(screen.queryAllByTestId('recipe-packing-step-row')).toHaveLength(0);
  });
});
