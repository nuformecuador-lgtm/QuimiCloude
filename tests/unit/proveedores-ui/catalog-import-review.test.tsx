// La revision de una importacion de catalogo: una tarjeta por linea, su
// reclasificacion, su prevalidacion en cliente y su resumen.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import type {
  CatalogImportPreview,
  CatalogImportPreviewCrop,
  CatalogImportPreviewRow,
} from '@/lib/modules/documentos';
import type {
  ConfirmCatalogImportResult,
  PreviewCatalogImportResult,
} from '@/lib/modules/documentos/adapters/driving/catalog-import-actions';
import type { UnitRef } from '@/lib/modules/unidades';
import { supplierDetailRoute } from '@/lib/shared/routes';

import { esperarInteractiva, setupUser } from '../../helpers/user-event';

const { previewCatalogImportActionMock, confirmCatalogImportActionMock } = vi.hoisted(() => ({
  previewCatalogImportActionMock: vi.fn<(input: unknown) => Promise<PreviewCatalogImportResult>>(),
  confirmCatalogImportActionMock: vi.fn<(input: unknown) => Promise<ConfirmCatalogImportResult>>(),
}));

vi.mock('@/lib/modules/documentos/adapters/driving/catalog-import-actions', () => ({
  previewCatalogImportAction: previewCatalogImportActionMock,
  confirmCatalogImportAction: confirmCatalogImportActionMock,
}));

// Importado DESPUES del mock de sus Server Actions.
const { CatalogImportReview } = await import(
  '@/app/(private)/proveedores/[id]/importar/[documentoId]/components'
);

const SUPPLIER_ID = 'PROVEEDOR-ID-NO-VISIBLE';
const DOCUMENT_FILE_ID = 'ARCHIVO-ID-NO-VISIBLE';

const UNIDAD_KG: UnitRef = { id: 'unidad-kg', name: 'Kilogramo', symbol: 'kg', baseUnitId: null, factor: null };
const UNIDAD_L: UnitRef = { id: 'unidad-l', name: 'Litro', symbol: 'l', baseUnitId: null, factor: null };

function fila(overrides: Partial<CatalogImportPreviewRow> = {}): CatalogImportPreviewRow {
  return {
    kind: 'nueva',
    invalidFields: [],
    name: 'Ácido cítrico',
    presentation: 'Bulto 25 kg',
    presentationId: null,
    readUnit: null,
    cost: '100.0000',
    currentCost: null,
    newCost: null,
    minPurchase: null,
    deliveryTime: 5,
    material: 'Sólido',
    measurements: null,
    imagePath: null,
    imageUrl: null,
    ...overrides,
  };
}

const CROP_1: CatalogImportPreviewCrop = { path: 'empresa/archivo/1-1.png', url: 'https://signed.example/1-1.png' };
const CROP_2: CatalogImportPreviewCrop = { path: 'empresa/archivo/1-2.png', url: 'https://signed.example/1-2.png' };

function preview(
  rows: readonly CatalogImportPreviewRow[],
  crops: readonly CatalogImportPreviewCrop[] = [],
): CatalogImportPreview {
  return { rows, crops, newPresentations: [] };
}

function montar(datos: CatalogImportPreview, units: readonly UnitRef[] = []) {
  return render(
    <CatalogImportReview
      supplierId={SUPPLIER_ID}
      documentFileId={DOCUMENT_FILE_ID}
      units={units}
      preview={datos}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('una fila por linea interpretada, en el orden del documento (R8)', () => {
  it('pinta tantas tarjetas como filas, en orden, con todos sus campos', () => {
    const filaNueva = fila({
      name: 'Ácido cítrico',
      presentation: 'Bulto 25 kg',
      cost: '100.0000',
      minPurchase: '5.0000',
      deliveryTime: 7,
      material: 'Sólido',
      measurements: {
        diameter: { value: '30.0000', unit: 'cm' },
        height: { value: '40.0000', unit: 'cm' },
        mouth: '28/410',
      },
    });
    const filaCambia = fila({
      kind: 'cambia',
      name: 'Sosa cáustica',
      presentation: 'Tambor 200 L',
      presentationId: 'presentacion-tambor',
      cost: '150.0000',
      currentCost: '120.0000',
      newCost: '150.0000',
    });

    montar(preview([filaNueva, filaCambia]));

    const tarjetas = screen.getAllByTestId(/^catalog-import-row-\d+$/);
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toHaveAttribute('data-testid', 'catalog-import-row-0');
    expect(tarjetas[1]).toHaveAttribute('data-testid', 'catalog-import-row-1');

    expect(screen.getByTestId('catalog-import-row-name-0')).toHaveValue('Ácido cítrico');
    expect(screen.getByTestId('catalog-import-row-presentation-0')).toHaveValue('Bulto 25 kg');
    expect(screen.getByTestId('catalog-import-row-cost-0')).toHaveValue('100.0000');
    expect(screen.getByTestId('catalog-import-row-min-purchase-0')).toHaveValue('5.0000');
    expect(screen.getByTestId('catalog-import-row-delivery-time-0')).toHaveValue(7);
    expect(screen.getByTestId('catalog-import-row-material-0')).toHaveValue('Sólido');
    expect(screen.getByTestId('catalog-import-row-diameter-value-0')).toHaveValue('30.0000');
    expect(screen.getByTestId('catalog-import-row-height-value-0')).toHaveValue('40.0000');
    expect(screen.getByTestId('catalog-import-row-mouth-0')).toHaveValue('28/410');
  });
});

describe('la clase de cada fila y el costo actual/nuevo de «cambia» (R9)', () => {
  it('etiqueta cada clase, y solo «cambia» muestra el costo actual y el nuevo', () => {
    const filas = [
      fila({ kind: 'nueva' }),
      fila({
        kind: 'cambia',
        presentationId: 'presentacion-1',
        currentCost: '120.0000',
        newCost: '150.0000',
        cost: '150.0000',
      }),
      fila({ kind: 'sin cambios', presentationId: 'presentacion-1', currentCost: '80.0000', cost: '80.0000' }),
    ];

    montar(preview(filas));

    expect(screen.getByTestId('catalog-import-row-kind-0')).toHaveTextContent('Nueva');
    expect(screen.getByTestId('catalog-import-row-kind-1')).toHaveTextContent('Cambia de costo');
    expect(screen.getByTestId('catalog-import-row-kind-2')).toHaveTextContent('Sin cambios');

    expect(screen.getByTestId('catalog-import-row-current-cost-1')).toHaveTextContent('120.0000');
    expect(screen.getByTestId('catalog-import-row-new-cost-1')).toHaveTextContent('150.0000');

    expect(screen.queryByTestId('catalog-import-row-current-cost-0')).toBeNull();
    expect(screen.queryByTestId('catalog-import-row-current-cost-2')).toBeNull();
  });
});

describe('reclasificar al perder el foco bloquea Confirmar mientras esta en vuelo (R10)', () => {
  it('deshabilita Confirmar durante la reclasificacion y lo vuelve a habilitar al terminar', async () => {
    const user = setupUser();
    // «nueva»: es la unica clase con el nombre editable, asi que es la unica que puede disparar
    // la reclasificacion al perder el foco (el nombre queda de solo lectura en las demas).
    // `presentationId` resuelto: sin presentacion nueva de por medio, lo unico que bloquea
    // Confirmar durante el intervalo es la reclasificacion en vuelo, que es lo que mide este caso.
    montar(preview([fila({ kind: 'nueva', presentationId: 'presentacion-1' })]));

    let resolver: (value: PreviewCatalogImportResult) => void = () => {};
    previewCatalogImportActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );

    const nombre = screen.getByTestId('catalog-import-row-name-0');
    await user.click(nombre);
    await user.tab();

    await waitFor(() => expect(screen.getByTestId('catalog-import-confirm')).toBeDisabled());

    resolver({ status: 'success', data: preview([fila({ kind: 'nueva', presentationId: 'presentacion-1' })]) });

    await waitFor(() => expect(screen.getByTestId('catalog-import-confirm')).toBeEnabled());
  });
});

describe('reclasificaciones sucesivas no se pisan entre si (R10)', () => {
  it('una respuesta vieja que resuelve DESPUES de una mas nueva no la sobrescribe', async () => {
    const user = setupUser();
    montar(preview([fila({ kind: 'nueva', presentationId: 'presentacion-1' })]));

    let resolverPrimera: (value: PreviewCatalogImportResult) => void = () => {};
    let resolverSegunda: (value: PreviewCatalogImportResult) => void = () => {};
    previewCatalogImportActionMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverPrimera = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverSegunda = resolve;
          }),
      );

    const nombre = screen.getByTestId('catalog-import-row-name-0');
    await user.click(nombre);
    await user.tab(); // pierde el foco del nombre: dispara la primera reclasificacion
    await user.tab(); // pierde el foco de la presentacion: dispara la segunda, antes de que resuelva la primera

    // La reclasificacion MAS NUEVA resuelve primero, y trae la fila sin problemas.
    resolverSegunda({
      status: 'success',
      data: preview([fila({ kind: 'nueva', presentationId: 'presentacion-1', invalidFields: [] })]),
    });
    await waitFor(() =>
      expect(screen.getByTestId('catalog-import-row-kind-0')).toHaveTextContent('Nueva'),
    );
    expect(screen.queryByTestId('catalog-import-row-invalid-fields-0')).toBeNull();

    // La respuesta VIEJA llega tarde y traia otra clasificacion: no puede pisar lo que ya
    // trajo la mas nueva.
    resolverPrimera({
      status: 'success',
      data: preview([fila({ kind: 'incompleta', invalidFields: ['cost'] })]),
    });
    // Deja que la microtarea de la resolucion vieja termine de correr.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId('catalog-import-row-kind-0')).toHaveTextContent('Nueva');
    expect(screen.queryByTestId('catalog-import-row-invalid-fields-0')).toBeNull();
  });
});

describe('incluir/excluir y exclusion por defecto (R11)', () => {
  it('«incompleta» y «duplicada» arrancan excluidas; el resto, incluidas', () => {
    montar(
      preview([
        fila({ kind: 'nueva' }),
        fila({ kind: 'incompleta', invalidFields: ['cost'] }),
        fila({ kind: 'duplicada' }),
      ]),
    );

    expect(screen.getByTestId('catalog-import-row-included-0')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('catalog-import-row-included-1')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('catalog-import-row-included-2')).toHaveAttribute('aria-checked', 'false');
  });

  it('el revisor puede incluir o excluir cualquier fila', async () => {
    const user = setupUser();
    montar(preview([fila({ kind: 'incompleta', invalidFields: ['cost'] })]));

    const casilla = screen.getByTestId('catalog-import-row-included-0');
    expect(casilla).toHaveAttribute('aria-checked', 'false');

    await user.click(casilla);
    expect(casilla).toHaveAttribute('aria-checked', 'true');
  });

  it('una fila «incompleta» senala el campo invalido', () => {
    montar(preview([fila({ kind: 'incompleta', invalidFields: ['cost', 'material'] })]));

    expect(screen.getByTestId('catalog-import-row-invalid-fields-0')).toHaveTextContent('costo');
    expect(screen.getByTestId('catalog-import-row-invalid-fields-0')).toHaveTextContent('material');
  });
});

describe('«cambia» y «sin cambios» solo dejan editar el costo (R12)', () => {
  it('el resto de los campos se pintan de solo lectura', () => {
    montar(
      preview([
        fila({ kind: 'cambia', presentationId: 'presentacion-1', currentCost: '120.0000', newCost: '150.0000', cost: '150.0000' }),
      ]),
    );

    expect(screen.getByTestId('catalog-import-row-cost-0').tagName).toBe('INPUT');
    for (const testId of [
      'catalog-import-row-name-0',
      'catalog-import-row-presentation-0',
      'catalog-import-row-min-purchase-0',
      'catalog-import-row-delivery-time-0',
      'catalog-import-row-material-0',
      'catalog-import-row-diameter-value-0',
      'catalog-import-row-height-value-0',
      'catalog-import-row-mouth-0',
    ]) {
      expect(screen.getByTestId(testId).tagName, testId).not.toBe('INPUT');
    }
  });

  it('«nueva» deja editar todos los campos, incluida la presentacion', () => {
    montar(preview([fila({ kind: 'nueva' })]));

    for (const testId of [
      'catalog-import-row-name-0',
      'catalog-import-row-presentation-0',
      'catalog-import-row-cost-0',
      'catalog-import-row-min-purchase-0',
      'catalog-import-row-delivery-time-0',
      'catalog-import-row-material-0',
      'catalog-import-row-diameter-value-0',
      'catalog-import-row-height-value-0',
      'catalog-import-row-mouth-0',
    ]) {
      expect(screen.getByTestId(testId).tagName, testId).toBe('INPUT');
    }
  });

  it('un campo de solo lectura sigue accesible por su nombre (a11y)', () => {
    montar(
      preview([
        fila({ kind: 'cambia', presentationId: 'presentacion-1', currentCost: '120.0000', newCost: '150.0000', cost: '150.0000' }),
      ]),
    );

    const campo = screen.getByTestId('catalog-import-row-material-0');
    expect(campo).toHaveAccessibleName('Material');
  });
});

describe('motivos por fila que bloquean confirmar (R18, R20)', () => {
  it('nombra las filas incluidas «incompleta» y «duplicada», y deshabilita Confirmar', async () => {
    const user = setupUser();
    montar(
      preview([
        fila({ kind: 'incompleta', invalidFields: ['cost'] }),
        fila({ kind: 'duplicada' }),
      ]),
    );

    // Excluidas por defecto: sin incluirlas, no aportan ningun motivo y Confirmar queda
    // habilitado -confirmar sin ninguna fila incluida es una entrada valida.
    expect(screen.getByTestId('catalog-import-confirm')).toBeEnabled();
    expect(screen.queryByTestId('catalog-import-confirm-reasons')).toBeNull();

    await user.click(screen.getByTestId('catalog-import-row-included-0'));
    await user.click(screen.getByTestId('catalog-import-row-included-1'));

    const motivos = screen.getByTestId('catalog-import-confirm-reasons');
    expect(motivos).toHaveTextContent('Fila 1');
    expect(motivos).toHaveTextContent('Fila 2');
    expect(screen.getByTestId('catalog-import-confirm')).toBeDisabled();
  });

  it('dos filas incluidas con la misma identidad tras corregirlas se nombran las dos', async () => {
    const user = setupUser();
    montar(
      preview([
        fila({ kind: 'nueva', name: 'Producto A', presentation: 'Bulto 1' }),
        fila({ kind: 'nueva', name: 'Producto B', presentation: 'Bulto 2' }),
      ]),
    );

    await user.clear(screen.getByTestId('catalog-import-row-name-1'));
    await user.type(screen.getByTestId('catalog-import-row-name-1'), 'Producto A');
    await user.clear(screen.getByTestId('catalog-import-row-presentation-1'));
    await user.type(screen.getByTestId('catalog-import-row-presentation-1'), 'Bulto 1');

    const motivos = await screen.findByTestId('catalog-import-confirm-reasons');
    expect(motivos).toHaveTextContent('Filas 1 y 2');
    expect(screen.getByTestId('catalog-import-confirm')).toBeDisabled();
  });

  it('una presentacion nueva sin unidad elegida nombra las filas que la usan', () => {
    montar(preview([fila({ kind: 'nueva', presentation: 'Bulto 25 kg' })]), []);

    const motivos = screen.getByTestId('catalog-import-confirm-reasons');
    expect(motivos).toHaveTextContent('Bulto 25 kg');
    expect(motivos).toHaveTextContent('1');
    expect(screen.getByTestId('catalog-import-confirm')).toBeDisabled();
  });

  it('elegir la unidad de la presentacion nueva quita el motivo y habilita Confirmar', async () => {
    const user = setupUser();
    montar(preview([fila({ kind: 'nueva', presentation: 'Bulto 25 kg', readUnit: null })]), [UNIDAD_KG, UNIDAD_L]);

    expect(screen.getByTestId('catalog-import-confirm')).toBeDisabled();

    const selector = screen.getByTestId(/^new-presentation-unit-select-/);
    await user.click(selector);
    const opcion = screen.getByTestId(new RegExp(`^new-presentation-unit-option-.*-${UNIDAD_KG.id}$`));
    await user.click(await esperarInteractiva(opcion));

    await waitFor(() => expect(screen.getByTestId('catalog-import-confirm')).toBeEnabled());
    expect(screen.queryByTestId('catalog-import-confirm-reasons')).toBeNull();
  });
});

describe('preseleccion de la unidad de una presentacion nueva (R19)', () => {
  it('preselecciona la unica unidad cuyo nombre o simbolo normalizado coincide', () => {
    montar(preview([fila({ kind: 'nueva', presentation: 'Bulto 25 kg', readUnit: 'kg' })]), [UNIDAD_KG, UNIDAD_L]);

    const selector = screen.getByTestId(/^new-presentation-unit-select-/);
    expect(selector).toHaveTextContent(UNIDAD_KG.symbol as string);
  });

  it('sin coincidencia, o con mas de una, la deja sin elegir', () => {
    montar(preview([fila({ kind: 'nueva', presentation: 'Bulto 25 kg', readUnit: 'onza' })]), [UNIDAD_KG, UNIDAD_L]);

    const selector = screen.getByTestId(/^new-presentation-unit-select-/);
    // El PLACEHOLDER es lo unico que se ve: ninguna unidad quedo elegida.
    expect(selector).toHaveTextContent('Elige una unidad');
  });
});

describe('resumen tras confirmar y vuelta al detalle del proveedor (R23)', () => {
  it('muestra creadas, actualizadas, sin cambios y presentaciones creadas, con el enlace de vuelta', async () => {
    const user = setupUser();
    confirmCatalogImportActionMock.mockResolvedValue({
      status: 'success',
      data: { created: 2, updated: 1, unchanged: 3, presentationsCreated: 1 },
    });

    montar(
      preview([
        fila({ kind: 'sin cambios', presentationId: 'presentacion-1', currentCost: '80.0000', cost: '80.0000' }),
      ]),
    );

    await user.click(screen.getByTestId('catalog-import-confirm'));

    const resumen = await screen.findByTestId('catalog-import-summary');
    expect(within(resumen).getByTestId('catalog-import-summary-created')).toHaveTextContent('2');
    expect(within(resumen).getByTestId('catalog-import-summary-updated')).toHaveTextContent('1');
    expect(within(resumen).getByTestId('catalog-import-summary-unchanged')).toHaveTextContent('3');
    expect(within(resumen).getByTestId('catalog-import-summary-presentations-created')).toHaveTextContent('1');

    const enlace = within(resumen).getByTestId('catalog-import-summary-back-link');
    expect(enlace).toHaveAttribute('href', supplierDetailRoute(SUPPLIER_ID));

    expect(screen.queryByTestId('catalog-import-review')).toBeNull();
  });
});

describe('quitar y cambiar el recorte asignado (R24)', () => {
  it('«Quitar» deja la fila sin imagen', async () => {
    const user = setupUser();
    montar(
      preview(
        [fila({ imagePath: CROP_1.path, imageUrl: CROP_1.url })],
        [CROP_1, CROP_2],
      ),
    );

    const miniatura = screen.getByTestId('catalog-import-row-image-0');
    expect(miniatura).toHaveAttribute('src', CROP_1.url);

    await user.click(screen.getByTestId('catalog-import-row-remove-image-0'));

    expect(miniatura).toHaveAttribute('src', MISSING_IMAGE_SRC);
    expect(screen.getByTestId('catalog-import-row-remove-image-0')).toBeDisabled();
  });

  it('«Cambiar» abre el selector con TODOS los recortes del archivo y asigna el elegido', async () => {
    const user = setupUser();
    montar(
      preview(
        [fila({ imagePath: CROP_1.path, imageUrl: CROP_1.url })],
        [CROP_1, CROP_2],
      ),
    );

    await user.click(screen.getByTestId('catalog-import-row-change-image-0'));

    const dialogo = await screen.findByTestId('crop-picker-dialog');
    expect(within(dialogo).getAllByTestId(/^crop-picker-option-/)).toHaveLength(2);

    await user.click(await esperarInteractiva(within(dialogo).getByTestId(`crop-picker-option-${CROP_2.path}`)));

    await waitFor(() =>
      expect(screen.getByTestId('catalog-import-row-image-0')).toHaveAttribute('src', CROP_2.url),
    );
  });
});

describe('multiplataforma: objetivos de 44 px, letra de 16 px y nada solo con hover (R37)', () => {
  it('los controles clave llevan las clases de objetivo tactil y de letra', () => {
    montar(preview([fila({ kind: 'nueva' })]));

    expect(screen.getByTestId('catalog-import-confirm').className).toContain('min-h-11');
    expect(screen.getByTestId('catalog-import-confirm').className).toContain('min-w-11');
    expect(screen.getByTestId('catalog-import-row-included-0').className).toContain('min-h-11');

    const nombre = screen.getByTestId('catalog-import-row-name-0');
    expect(nombre.className).toContain('min-h-11');
    expect(nombre.className).toContain('text-base');
  });

  it('ningun componente de la pantalla depende de una clase que solo exista en `:hover`', () => {
    const raiz = dirname(fileURLToPath(import.meta.url));
    const carpetaComponentes = join(
      raiz,
      '..',
      '..',
      '..',
      'app',
      '(private)',
      'proveedores',
      '[id]',
      'importar',
      '[documentoId]',
      'components',
    );

    for (const archivo of [
      'catalog-import-review.tsx',
      'catalog-import-row.tsx',
      'crop-picker.tsx',
      'new-presentation-units.tsx',
      'catalog-import-summary.tsx',
    ]) {
      const fuente = readFileSync(join(carpetaComponentes, archivo), 'utf8');
      expect(fuente, `${archivo} no debe depender de :hover`).not.toContain('hover:');
    }
  });
});
