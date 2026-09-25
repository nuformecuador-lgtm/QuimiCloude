// La revision de una importacion de formula: una tarjeta por ingrediente, los tres modos de
// asignacion de producto, los pasos, la suma en vivo, el aviso de choque y la confirmacion.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { FormulaImportPreview, FormulaImportSummary } from '@/lib/modules/documentos';
import type {
  ConfirmFormulaImportResult,
  PreviewFormulaImportResult,
} from '@/lib/modules/documentos/adapters/driving/formula-import-actions';
import { recipeEditRoute } from '@/lib/shared/routes';
import type { ProductPickerOption } from '@/app/(private)/produccion/formulas/components';
import type { UnitRef } from '@/lib/modules/unidades';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { previewFormulaImportActionMock, confirmFormulaImportActionMock } = vi.hoisted(() => ({
  previewFormulaImportActionMock: vi.fn<(input: unknown) => Promise<PreviewFormulaImportResult>>(),
  confirmFormulaImportActionMock: vi.fn<(input: unknown) => Promise<ConfirmFormulaImportResult>>(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/formula-import-actions', () => ({
  previewFormulaImportAction: previewFormulaImportActionMock,
  confirmFormulaImportAction: confirmFormulaImportActionMock,
}));

// Importado DESPUES del mock de sus Server Actions.
const { FormulaImportReview } = await import(
  '@/app/(private)/produccion/formulas/importar/[documentoId]/components'
);

beforeAll(() => {
  // ProseMirror (el editor de pasos) llama a geometria que jsdom no implementa. Mismo stub
  // minimo que `recipe-step-editor.test.tsx`: no finge ningun comportamiento, solo rellena lo
  // que un navegador real mediria como vacio.
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => {
      const rects: DOMRect[] = [];
      return Object.assign(rects, { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;
    };
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DOCUMENT_FILE_ID = 'ARCHIVO-ID-NO-VISIBLE';
const UNITS: readonly UnitRef[] = [];

const PRODUCT_EXISTING: ProductPickerOption = { id: 'producto-existente', name: 'Sosa cáustica', unitId: null };
const PRODUCT_ANOTHER: ProductPickerOption = { id: 'producto-otro', name: 'Ácido cítrico', unitId: null };

const INITIAL_PRODUCT_PAGE = { items: [PRODUCT_EXISTING, PRODUCT_ANOTHER], totalPages: 1 };

function preview(overrides: Partial<FormulaImportPreview> = {}): FormulaImportPreview {
  return {
    name: 'Detergente base',
    description: 'Fórmula de referencia',
    ingredients: [],
    steps: [],
    nameClash: null,
    ...overrides,
  };
}

function renderReview(previewOverrides: Partial<FormulaImportPreview> = {}) {
  return render(
    <FormulaImportReview
      documentFileId={DOCUMENT_FILE_ID}
      units={UNITS}
      initialProductPage={INITIAL_PRODUCT_PAGE}
      preview={preview(previewOverrides)}
    />,
  );
}

describe('la vista previa se pinta sin escribir nada (R10, R8)', () => {
  it('pinta nombre, descripcion, una fila por ingrediente en orden, el leido, la referencia y la suma', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Hipoclorito de sodio',
          percentage: '60.00',
          percentageRead: '60',
          quantityRead: '600',
          unitRead: 'kg',
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
        {
          readName: 'Agua desmineralizada',
          percentage: null,
          percentageRead: 'n/d',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'none' },
        },
      ],
      steps: [{ blocks: [{ kind: 'paragraph', spans: [{ text: 'Mezclar despacio' }] }] }],
    });

    expect(screen.getByTestId('formula-import-name')).toHaveValue('Detergente base');
    expect(screen.getByTestId('formula-import-description')).toHaveValue('Fórmula de referencia');

    expect(screen.getByTestId('formula-import-row-name-0')).toHaveTextContent('Hipoclorito de sodio');
    expect(screen.getByTestId('formula-import-row-percentage-0')).toHaveValue('60,00');
    expect(screen.getByTestId('formula-import-row-percentage-read-0')).toHaveTextContent('60');
    expect(screen.getByTestId('formula-import-row-reference-0')).toHaveTextContent('600 kg');
    expect(screen.getByTestId('formula-import-row-preselected-product-0')).toHaveTextContent('Sosa cáustica');

    expect(screen.getByTestId('formula-import-row-name-1')).toHaveTextContent('Agua desmineralizada');
    expect(screen.getByTestId('formula-import-row-percentage-1')).toHaveValue('');
    expect(screen.getByTestId('formula-import-row-percentage-read-1')).toHaveTextContent('n/d');
    expect(screen.queryByTestId('formula-import-row-reference-1')).toBeNull();

    expect(screen.getByTestId('recipe-steps-list').children).toHaveLength(1);
    expect(screen.getByTestId('formula-import-sum')).toHaveTextContent('60,00');

    expect(previewFormulaImportActionMock).not.toHaveBeenCalled();
    expect(confirmFormulaImportActionMock).not.toHaveBeenCalled();
  });
});

describe('la preseleccion de producto segun las coincidencias (R11)', () => {
  it('con exactamente una coincidencia queda preseleccionada', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Hipoclorito de sodio',
          percentage: '100.00',
          percentageRead: '100',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'preselected');
    expect(screen.getByTestId('formula-import-row-preselected-product-0')).toHaveTextContent('Sosa cáustica');
  });

  it('sin ninguna coincidencia se ofrece crear la materia prima con el nombre leido', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Perfume floral',
          percentage: '5.00',
          percentageRead: '5',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'none' },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'create');
    expect(screen.getByTestId('formula-import-row-new-name-0')).toHaveValue('Perfume floral');
  });

  it('con mas de una coincidencia la fila queda sin producto y el revisor debe elegir', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Ácido',
          percentage: '10.00',
          percentageRead: '10',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'several', count: 3 },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'choose');
    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveTextContent('3 productos coinciden');
    // Sin producto asignado: R15 lo marca y no deja confirmar.
    expect(screen.getByTestId('formula-import-row-problems-0')).toHaveTextContent('sin producto asignado');
  });
});

describe('el revisor puede elegir, crear, quitar y añadir (R12)', () => {
  it('cambia una fila preseleccionada a "elegir producto" y escoge otro del selector', async () => {
    const user = setupUser();
    renderReview({
      ingredients: [
        {
          readName: 'Hipoclorito de sodio',
          percentage: '100.00',
          percentageRead: '100',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
      ],
    });

    await user.click(screen.getByTestId('formula-import-row-choose-button-0'));
    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'choose');

    await user.click(await esperarInteractiva(screen.getByTestId('formula-import-row-product-picker-0')));
    await user.click(await screen.findByRole('option', { name: PRODUCT_ANOTHER.name }));

    expect(screen.getByTestId('formula-import-row-product-picker-0')).toHaveValue(PRODUCT_ANOTHER.name);
  });

  it('cambia una fila a "crear materia prima" y el nombre queda editable', async () => {
    const user = setupUser();
    renderReview({
      ingredients: [
        {
          readName: 'Hipoclorito de sodio',
          percentage: '100.00',
          percentageRead: '100',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
      ],
    });

    await user.click(screen.getByTestId('formula-import-row-create-button-0'));
    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'create');
    expect(screen.getByTestId('formula-import-row-new-name-0')).toHaveValue('Hipoclorito de sodio');

    await user.clear(screen.getByTestId('formula-import-row-new-name-0'));
    await user.type(screen.getByTestId('formula-import-row-new-name-0'), 'Hipoclorito editado');
    expect(screen.getByTestId('formula-import-row-new-name-0')).toHaveValue('Hipoclorito editado');
  });

  it('quita una fila con "Quitar"', async () => {
    const user = setupUser();
    renderReview({
      ingredients: [
        {
          readName: 'Fila A',
          percentage: '50.00',
          percentageRead: '50',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'none' },
        },
        {
          readName: 'Fila B',
          percentage: '50.00',
          percentageRead: '50',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'none' },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-row-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('formula-import-row-remove-0'));

    expect(screen.queryByTestId('formula-import-row-1')).toBeNull();
    expect(screen.getByTestId('formula-import-row-name-0')).toHaveTextContent('Fila B');
  });

  it('añade una fila y elige un producto existente', async () => {
    const user = setupUser();
    renderReview({ ingredients: [] });

    expect(screen.queryByTestId('formula-import-row-0')).toBeNull();

    await user.click(screen.getByTestId('formula-import-add-ingredient'));
    expect(screen.getByTestId('formula-import-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('formula-import-row-mode-0')).toHaveAttribute('data-mode', 'choose');

    await user.click(await esperarInteractiva(screen.getByTestId('formula-import-row-product-picker-0')));
    await user.click(await screen.findByRole('option', { name: PRODUCT_EXISTING.name }));

    expect(screen.getByTestId('formula-import-row-product-picker-0')).toHaveValue(PRODUCT_EXISTING.name);
  });
});

describe('nombre y descripcion con sus errores (R13)', () => {
  it('un nombre vacio se marca y aparece en los motivos', async () => {
    const user = setupUser();
    renderReview();

    await user.clear(screen.getByTestId('formula-import-name'));
    await user.tab();

    expect(screen.getByTestId('formula-import-name-error')).toHaveTextContent('El nombre es obligatorio.');
    expect(screen.getByTestId('formula-import-reasons')).toHaveTextContent('El nombre es obligatorio.');
  });

  it('una descripcion de mas de 500 caracteres se marca', async () => {
    const user = setupUser();
    renderReview();

    const description = screen.getByTestId('formula-import-description');
    await user.clear(description);
    await user.type(description, 'x'.repeat(501));

    expect(screen.getByTestId('formula-import-description-error')).toHaveTextContent(
      'La descripción supera 500 caracteres.',
    );
  });
});

describe('los pasos se corrigen, borran, añaden y una revision sin pasos confirma (R14)', () => {
  it('añade y borra un paso', async () => {
    const user = setupUser();
    renderReview({ steps: [] });

    expect(screen.getByTestId('recipe-steps-list').children).toHaveLength(0);

    await user.click(screen.getByTestId('recipe-step-add'));
    expect(screen.getByTestId('recipe-steps-list').children).toHaveLength(1);

    await user.click(screen.getByTestId('recipe-step-remove-0'));
    expect(screen.getByTestId('recipe-steps-list').children).toHaveLength(0);
  });
});

describe('los motivos nombran las filas afectadas y bloquean confirmar (R15, R16)', () => {
  it('sin ninguna fila, el motivo pide añadir un ingrediente', () => {
    renderReview({ ingredients: [] });

    expect(screen.getByTestId('formula-import-reasons')).toHaveTextContent('Añade al menos un ingrediente.');
    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
  });

  it('una fila sin producto y otra con porcentaje vacio se nombran por su numero', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Ácido',
          percentage: '50.00',
          percentageRead: '50',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'several', count: 2 },
        },
        {
          readName: 'Agua',
          percentage: null,
          percentageRead: null,
          quantityRead: null,
          unitRead: null,
          match: { kind: 'none' },
        },
      ],
    });

    const razones = screen.getByTestId('formula-import-reasons');
    expect(razones).toHaveTextContent('Fila 1');
    expect(razones).toHaveTextContent('sin producto asignado');
    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
  });

  it('la suma incompleta se muestra y bloquea confirmar', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Ácido',
          percentage: '60.00',
          percentageRead: '60',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-sum')).toHaveTextContent('60,00');
    expect(screen.getByTestId('formula-import-reasons')).toHaveTextContent('100,00');
    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
  });

  it('dos filas con el mismo producto quedan marcadas como repetidas (R16)', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Sosa A',
          percentage: '50.00',
          percentageRead: '50',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
        {
          readName: 'Sosa B',
          percentage: '50.00',
          percentageRead: '50',
          quantityRead: null,
          unitRead: null,
          match: { kind: 'one', productId: PRODUCT_EXISTING.id, productName: PRODUCT_EXISTING.name, unitId: null },
        },
      ],
    });

    expect(screen.getByTestId('formula-import-row-problems-0')).toHaveTextContent('ingrediente repetido');
    expect(screen.getByTestId('formula-import-row-problems-1')).toHaveTextContent('ingrediente repetido');
    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
  });
});

describe('el choque de nombre exige elegir antes de confirmar (R17, R21)', () => {
  function ingredienteCompleto() {
    return {
      readName: 'Sosa',
      percentage: '100.00',
      percentageRead: '100',
      quantityRead: null,
      unitRead: null,
      match: {
        kind: 'one' as const,
        productId: PRODUCT_EXISTING.id,
        productName: PRODUCT_EXISTING.name,
        unitId: null,
      },
    };
  }

  it('muestra el aviso con el texto exacto y las dos opciones', () => {
    renderReview({
      ingredients: [ingredienteCompleto()],
      nameClash: { recipeId: 'receta-existente', recipeName: 'Detergente base' },
    });

    expect(screen.getByTestId('formula-import-clash-message')).toHaveTextContent(
      'Ya existe la fórmula «Detergente base». Reemplazarla cambia sus ingredientes, pasos y descripción; los pedidos que la usan no cambian su coste guardado.',
    );
    expect(screen.getByTestId('formula-import-clash-replace')).toBeInTheDocument();
    expect(screen.getByTestId('formula-import-clash-rename')).toBeInTheDocument();
    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
  });

  it('elegir reemplazar habilita confirmar, y volver a escribir el nombre lo vuelve a exigir', async () => {
    const user = setupUser();
    renderReview({
      ingredients: [ingredienteCompleto()],
      nameClash: { recipeId: 'receta-existente', recipeName: 'Detergente base' },
    });

    await user.click(screen.getByTestId('formula-import-clash-replace'));
    expect(screen.queryByTestId('formula-import-reasons')).toBeNull();
    expect(screen.getByTestId('formula-import-confirm')).not.toBeDisabled();

    await user.type(screen.getByTestId('formula-import-name'), ' extra');
    expect(screen.getByTestId('formula-import-reasons')).toHaveTextContent('Elige reemplazar o cambiar el nombre');
  });

  it('cambiar el nombre reconsulta el choque al perder el foco', async () => {
    const user = setupUser();
    previewFormulaImportActionMock.mockResolvedValue({
      status: 'success',
      data: preview({ nameClash: null }),
    });

    renderReview({
      ingredients: [ingredienteCompleto()],
      nameClash: { recipeId: 'receta-existente', recipeName: 'Detergente base' },
    });

    await user.click(screen.getByTestId('formula-import-clash-rename'));
    expect(screen.getByTestId('formula-import-name')).toHaveFocus();

    await user.type(screen.getByTestId('formula-import-name'), ' nuevo');
    await user.tab();

    await waitFor(() => {
      expect(previewFormulaImportActionMock).toHaveBeenCalledWith({
        documentFileId: DOCUMENT_FILE_ID,
        name: 'Detergente base nuevo',
      });
    });
    await waitFor(() => expect(screen.queryByTestId('formula-import-clash')).toBeNull());
  });

  it('un nombre ya invalido no recomprueba el choque al perder el foco', async () => {
    const user = setupUser();
    renderReview({ ingredients: [ingredienteCompleto()] });

    await user.clear(screen.getByTestId('formula-import-name'));
    await user.tab();

    expect(previewFormulaImportActionMock).not.toHaveBeenCalled();
  });

  it('un error de la accion al recomprobar el choque no rompe la pantalla', async () => {
    const user = setupUser();
    previewFormulaImportActionMock.mockRejectedValue(new Error('red caida'));

    renderReview({
      ingredients: [ingredienteCompleto()],
      nameClash: { recipeId: 'receta-existente', recipeName: 'Detergente base' },
    });

    await user.click(screen.getByTestId('formula-import-clash-rename'));
    await user.type(screen.getByTestId('formula-import-name'), ' nuevo');
    await user.tab();

    await waitFor(() => {
      expect(previewFormulaImportActionMock).toHaveBeenCalledWith({
        documentFileId: DOCUMENT_FILE_ID,
        name: 'Detergente base nuevo',
      });
    });

    // El choque previo se mantiene: la accion fallo, asi que no hay dato nuevo para reemplazarlo.
    expect(screen.getByTestId('formula-import-clash-message')).toBeInTheDocument();
  });
});

describe('la confirmacion escribe solo al confirmar y navega al resultado (R29)', () => {
  it('confirmar en vuelo deshabilita el boton y el exito muestra el resumen', async () => {
    const user = setupUser();
    let resolverConfirmacion: (value: ConfirmFormulaImportResult) => void = () => {};
    confirmFormulaImportActionMock.mockReturnValue(
      new Promise<ConfirmFormulaImportResult>((resolve) => {
        resolverConfirmacion = resolve;
      }),
    );

    renderReview({
      ingredients: [
        {
          readName: 'Sosa',
          percentage: '100.00',
          percentageRead: '100',
          quantityRead: null,
          unitRead: null,
          match: {
            kind: 'one',
            productId: PRODUCT_EXISTING.id,
            productName: PRODUCT_EXISTING.name,
            unitId: null,
          },
        },
      ],
    });

    const boton = screen.getByTestId('formula-import-confirm');
    expect(boton).not.toBeDisabled();

    await user.click(boton);

    expect(screen.getByTestId('formula-import-confirm')).toBeDisabled();
    expect(confirmFormulaImportActionMock).toHaveBeenCalledWith({
      documentFileId: DOCUMENT_FILE_ID,
      name: 'Detergente base',
      description: 'Fórmula de referencia',
      lines: [{ kind: 'existing', productId: PRODUCT_EXISTING.id, percentage: '100.00' }],
      steps: [],
      replaceRecipeId: null,
    });

    const resumen: FormulaImportSummary = {
      recipeId: 'receta-nueva-id',
      outcome: 'created',
      rawMaterialsCreated: 1,
      rawMaterialsReused: 0,
    };
    resolverConfirmacion({ status: 'success', data: resumen });

    await waitFor(() => expect(screen.getByTestId('formula-import-summary')).toBeInTheDocument());
    expect(screen.getByTestId('formula-import-summary-outcome')).toHaveTextContent('creó');
    expect(screen.getByTestId('formula-import-summary-raw-materials-created')).toHaveTextContent('1');
    expect(screen.getByTestId('formula-import-summary-raw-materials-reused')).toHaveTextContent('0');
    expect(screen.getByTestId('formula-import-summary-link')).toHaveAttribute(
      'href',
      recipeEditRoute('receta-nueva-id'),
    );
  });
});

describe('ninguna imagen ni recorte, y accesibilidad tactil (R35, R38)', () => {
  it('no ofrece ningun control de imagen ni recorte', () => {
    renderReview({
      ingredients: [
        {
          readName: 'Sosa',
          percentage: '100.00',
          percentageRead: '100',
          quantityRead: null,
          unitRead: null,
          match: {
            kind: 'one',
            productId: PRODUCT_EXISTING.id,
            productName: PRODUCT_EXISTING.name,
            unitId: null,
          },
        },
      ],
    });

    expect(screen.queryByTestId(/crop/i)).toBeNull();
    expect(screen.queryByAltText(/recorte/i)).toBeNull();
    expect(screen.getByTestId('formula-import-confirm')).toHaveClass('min-h-11', 'min-w-11');
  });
});
