// El bloque de coste dentro del formulario de pedido.
// La recotizacion en si ya la cubre `order-cost-quote.test.tsx`; aqui solo se comprueba el
// CABLEADO con el formulario real.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { setupUser, esperarInteractiva } from '../../helpers/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MISSING_VALUE_MARK,
  ORDER_BUSINESS_FIELDS,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PACKAGING_FIELD,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
  ORDER_DISTRIBUTION_ADD_TESTID,
  PACKAGING_OPTION_TESTID,
  PACKAGING_SELECT_TESTID,
  ORDER_COST_QUOTE_ERROR_TESTID,
  ORDER_COST_QUOTE_TESTID,
  ORDER_COST_QUOTE_VALUE_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  OrderForm,
  ORIGINAL_VERSION_VALUE,
  RECIPE_PICKER_TESTID,
  RECIPE_VERSION_SELECT_TESTID,
  type RecipePickerOption,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { Sheet } from '@/components/ui/sheet';
import { formatOrderNumber, type OrderSummary } from '@/lib/modules/pedidos';
import type {
  CreateOrderFormState,
  OrderCostQuoteResult,
  OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type {
  RecipeListResult,
  RecipeQueryResult,
  RecipeVersionListResult,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeDetail, RecipeSummary, RecipeVersionSummary } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';

const {
  createOrderActionMock,
  updateOrderActionMock,
  quoteOrderCostActionMock,
  listRecipesActionMock,
  getRecipeActionMock,
  listRecipeVersionsActionMock,
  listPresentationsActionMock,
} = vi.hoisted(() => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario`);
  };
  return {
    createOrderActionMock:
      vi.fn<(prev: CreateOrderFormState, data: FormData) => Promise<CreateOrderFormState>>(),
    updateOrderActionMock:
      vi.fn<
        (
          id: string,
          prev: OrderMutationFormState,
          data: FormData,
        ) => Promise<OrderMutationFormState>
      >(),
    quoteOrderCostActionMock: vi.fn<(input: unknown) => Promise<OrderCostQuoteResult>>(),
    prohibida: noDebeInvocarse,
    listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
    getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
    listRecipeVersionsActionMock: vi.fn<(id: string) => Promise<RecipeVersionListResult>>(),
    listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  };
});

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

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-assignment-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el formulario de pedido`);
  };
  return {
    assignResponsiblesAction: vi.fn(noDebeInvocarse('assignResponsiblesAction')),
    unassignResponsibleAction: vi.fn(noDebeInvocarse('unassignResponsibleAction')),
    removeWorkGroupFromOrderAction: vi.fn(noDebeInvocarse('removeWorkGroupFromOrderAction')),
    listOrderResponsiblesAction: vi.fn(noDebeInvocarse('listOrderResponsiblesAction')),
    listResponsiblesForOrdersAction: vi.fn(noDebeInvocarse('listResponsiblesForOrdersAction')),
  };
});

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => ({
  createOrderAction: createOrderActionMock,
  updateOrderAction: updateOrderActionMock,
  quoteOrderCostAction: quoteOrderCostActionMock,
  quoteOrderPresentationAvailabilityAction: vi.fn(() =>
    Promise.resolve({ status: 'success', data: { kind: 'ok', available: '0' } }),
  ),
  cancelOrderAction: vi.fn(() => {
    throw new Error('cancelOrderAction no debe invocarse desde el formulario');
  }),
  deleteOrderAction: vi.fn(() => {
    throw new Error('deleteOrderAction no debe invocarse desde el formulario');
  }),
  listOrdersAction: vi.fn(() => {
    throw new Error('listOrdersAction no debe invocarse desde el formulario');
  }),
  getOrderAction: vi.fn(() => {
    throw new Error('getOrderAction no debe invocarse desde el formulario');
  }),
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: listRecipeVersionsActionMock,
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: vi.fn(async () => ({
    status: 'success' as const,
    data: { items: [ENVASE_DEL_CATALOGO], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  })),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde el formulario');
  }),
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
const RECETA2 = { id: crypto.randomUUID(), name: 'Barniz mate', imageUrl: null };
const RECETAS: RecipePickerPage = { items: [RECETA, RECETA2], totalPages: 1 };

const UNIDAD = {
  id: crypto.randomUUID(),
  name: 'Litro',
  symbol: 'L',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

const PRESENTACION = {
  id: crypto.randomUUID(),
  name: 'Bidón 20L',
  unitId: UNIDAD.id,
  content: '20.0000',
};

const ENVASE_ID = crypto.randomUUID();

/** Envase del catalogo, ofrecido por `listProductsAction` en el selector del reparto. */
const ENVASE_DEL_CATALOGO = {
  id: ENVASE_ID,
  name: 'Bidón PET 20 L',
  imagePath: null,
  stock: '10.0000',
  unitId: crypto.randomUUID(),
  qtyAlert: null,
  type: 'PACKAGING',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  available: '10.0000',
  presentationId: PRESENTACION.id,
  presentationName: PRESENTACION.name,
  presentationContent: PRESENTACION.content,
  presentationUnitId: PRESENTACION.unitId,
};

const LINEA_INGREDIENTE = {
  id: 'linea-1',
  productId: crypto.randomUUID(),
  productName: 'Sosa cáustica',
  percentage: '10.00',
  productUnitId: UNIDAD.id,
  productStock: '40.0000',
};

const UNIDADES: readonly UnitView[] = [UNIDAD];

function recetaResumen(option: RecipePickerOption): RecipeSummary {
  return {
    id: option.id,
    name: option.name,
    description: null,
    imageUrl: option.imageUrl,
    stepCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
  };
}

function recetaDetalle(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: RECETA.id,
    name: RECETA.name,
    description: null,
    imageUrl: null,
    stepCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    steps: [],
    lines: [LINEA_INGREDIENTE],
    tools: [],
    original: null,
    isUnderReview: false,
    displayName: RECETA.name,
    ...overrides,
  };
}

function pedido(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: crypto.randomUUID(),
    number: { year: 2026, sequence: 42 },
    numberText: formatOrderNumber({ year: 2026, sequence: 42 }),
    recipeId: RECETA.id,
    recipeName: RECETA.name,
    recipeVersion: null,
    quantity: '5',
    priority: 'ALTA',
    status: 'EN_CURSO',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [
      { presentationId: PRESENTACION.id, presentationName: PRESENTACION.name, packages: 1, packagingProductId: null, packagingName: null },
    ],
    unitId: UNIDAD.id,
    unitLabel: UNIDAD.symbol,
    ...overrides,
  };
}

const onSaved = vi.fn();

/** Linea de reparto con envase, como la devuelve el pedido guardado. */
function lineaConEnvase(packages: number) {
  return {
    presentationId: PRESENTACION.id,
    presentationName: PRESENTACION.name,
    packages,
    packagingProductId: ENVASE_ID,
    packagingName: 'Bidón PET 20 L',
  };
}

function renderFormulario(order?: OrderSummary) {
  return render(
    <Sheet open>
      <OrderForm order={order} recipes={RECETAS} units={UNIDADES} onSaved={onSaved} />
    </Sheet>,
  );
}

function cantidad(): HTMLInputElement {
  return screen.getByTestId('order-field-quantity') as HTMLInputElement;
}

/** Elige la receta indicada de la lista (por defecto la primera). */
async function elegirReceta(
  user: ReturnType<typeof setupUser>,
  receta: { readonly id: string } = RECETA,
) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  const opciones = await screen.findAllByTestId(`${RECIPE_PICKER_TESTID}-option`);
  const opcion = opciones.find((el) => el.getAttribute('data-recipe-id') === receta.id);
  if (opcion === undefined) throw new Error(`no se encontro la opcion de «${receta.id}»`);
  await user.click(await esperarInteractiva(opcion));
}

async function elegirUnidad(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-unit-select'));
  await user.click(await esperarInteractiva(await screen.findByTestId('presentation-unit-option')));
}

async function rellenarAlta(user: ReturnType<typeof setupUser>, cantidadEscrita = '5') {
  await elegirReceta(user);
  await elegirUnidad(user);
  await user.type(cantidad(), cantidadEscrita);
}

beforeEach(() => {
  vi.clearAllMocks();
  createOrderActionMock.mockResolvedValue({
    status: 'success',
    id: crypto.randomUUID(),
    numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  });
  updateOrderActionMock.mockResolvedValue({ status: 'success' });
  quoteOrderCostActionMock.mockResolvedValue({
    status: 'success',
    data: { ingredientsCost: null },
  });
  getRecipeActionMock.mockResolvedValue({ status: 'success', data: recetaDetalle() });
  listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [] });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('R8 — el bloque de coste esta en el alta y en la edicion', () => {
  it('se monta en los dos modos del formulario', () => {
    renderFormulario();
    expect(screen.getByTestId(ORDER_COST_QUOTE_TESTID)).toBeInTheDocument();

    cleanup();
    renderFormulario(pedido());
    expect(screen.getByTestId(ORDER_COST_QUOTE_TESTID)).toBeInTheDocument();
  });
});

describe('R9 — el alta recien abierta no tiene receta y no pide nada', () => {
  it('muestra el guion sin llamar a la cotizacion', () => {
    renderFormulario();

    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe(
      MISSING_VALUE_MARK,
    );
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
  });
});

describe('R11 — la edicion arranca con el importe guardado, sin pedir nada', () => {
  it('con importe guardado pinta la cifra', () => {
    renderFormulario(pedido({ ingredientsCost: '40.0000' }));

    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 40.00');
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
  });

  it('sin importe guardado pinta el guion', () => {
    renderFormulario(pedido({ ingredientsCost: null }));

    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe(
      MISSING_VALUE_MARK,
    );
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
  });
});

describe('R12 — en la edicion, cambiar receta o cantidad recotiza', () => {
  it('teclear otra cantidad pide, tras la espera, con la receta del pedido', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '20.0000' },
    });
    const elPedido = pedido({ ingredientsCost: '40.0000' });
    renderFormulario(elPedido);

    await user.clear(cantidad());
    await user.type(cantidad(), '7');

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: elPedido.recipeId,
        quantity: '7',
        orderId: elPedido.id,
        unitId: UNIDAD.id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 20.00'),
    );
  });

  it('elegir otra receta pide de inmediato, con la receta nueva', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '30.0000' },
    });
    const elPedido = pedido({ ingredientsCost: '40.0000' });
    renderFormulario(elPedido);

    await elegirReceta(user, RECETA2);

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: RECETA2.id,
        quantity: elPedido.quantity,
        orderId: elPedido.id,
        unitId: UNIDAD.id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 30.00'),
    );
  });
});

describe('R13/R14 de punta a punta — elegir receta y teclear cantidad en el alta', () => {
  it('elegir receta con cantidad ya escrita pide de inmediato; teclear despues debouncea a una llamada final', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '10.0000' },
    });
    renderFormulario();

    await elegirUnidad(user);
    await user.type(cantidad(), '5');
    await elegirReceta(user);

    await waitFor(() => expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(1));
    expect(quoteOrderCostActionMock).toHaveBeenCalledWith({ recipeId: RECETA.id, quantity: '5', unitId: UNIDAD.id });

    quoteOrderCostActionMock.mockClear();
    await user.clear(cantidad());
    await user.type(cantidad(), '1');
    await user.type(cantidad(), '2');
    await user.type(cantidad(), '5');

    await waitFor(() => expect(quoteOrderCostActionMock).toHaveBeenCalledTimes(1));
    expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
      recipeId: RECETA.id,
      quantity: '125',
      unitId: UNIDAD.id,
    });
  });
});

describe('R20 — lo que se guarda no lleva la cotizacion mostrada', () => {
  it('el FormData del alta lleva exactamente los campos de negocio', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect([...enviado.keys()].sort()).toEqual([...ORDER_BUSINESS_FIELDS].sort());
  });

  it('el FormData de la edicion lleva los mismos campos mas su reparto, sin estado ni importe', async () => {
    const user = setupUser();
    const elPedido = pedido({ ingredientsCost: '40.0000' });
    renderFormulario(elPedido);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect([...enviado.keys()].sort()).toEqual(
      [
        ...ORDER_BUSINESS_FIELDS,
        ORDER_DISTRIBUTION_PACKAGING_FIELD,
        ORDER_DISTRIBUTION_PRESENTATION_FIELD,
        ORDER_DISTRIBUTION_PACKAGES_FIELD,
      ].sort(),
    );
  });

  it('Guardar sigue habilitado con una cotizacion en vuelo y con el guion', async () => {
    const user = setupUser();
    let resolverCotizacion: ((result: OrderCostQuoteResult) => void) | undefined;
    quoteOrderCostActionMock.mockImplementation(
      () =>
        new Promise<OrderCostQuoteResult>((resolve) => {
          resolverCotizacion = resolve;
        }),
    );
    renderFormulario();

    await rellenarAlta(user);

    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();

    resolverCotizacion?.({ status: 'success', data: { ingredientsCost: null } });
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe(
        MISSING_VALUE_MARK,
      ),
    );
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();
  });
});

describe('R23 — en la edicion, elegir otra receta deja la eleccion nueva, sin retirarla', () => {
  it('la cotizacion se pide con la receta nueva y, al guardar, viaja su id', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '30.0000' },
    });
    const elPedido = pedido({ ingredientsCost: '40.0000' });
    renderFormulario(elPedido);

    await elegirReceta(user, RECETA2);

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: RECETA2.id,
        quantity: elPedido.quantity,
        orderId: elPedido.id,
        unitId: UNIDAD.id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 30.00'),
    );
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).not.toBe(
      MISSING_VALUE_MARK,
    );

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get('recipeId')).toBe(RECETA2.id);
  });

  it('en el alta, elegir una receta y despues otra deja la segunda, sin retirarla', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '30.0000' },
    });
    renderFormulario();

    await elegirUnidad(user);
    await user.type(cantidad(), '5');
    await elegirReceta(user, RECETA);
    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: RECETA.id,
        quantity: '5',
        unitId: UNIDAD.id,
      }),
    );

    listRecipesActionMock.mockResolvedValue({
      status: 'success',
      data: {
        items: [recetaResumen(RECETA), recetaResumen(RECETA2)],
        page: 1,
        pageSize: 25,
        total: 2,
        totalPages: 1,
      },
    });
    await elegirReceta(user, RECETA2);

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: RECETA2.id,
        quantity: '5',
        unitId: UNIDAD.id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe('$ 30.00'),
    );
    expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).not.toBe(
      MISSING_VALUE_MARK,
    );

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('recipeId')).toBe(RECETA2.id);
  });
});

describe('R65 — la edicion cuenta lo que el propio pedido tiene apartado', () => {
  it('la edicion envia el orderId del pedido junto a receta y cantidad (R65)', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '20.0000' },
    });
    const elPedido = pedido({ ingredientsCost: '40.0000' });
    renderFormulario(elPedido);

    await user.clear(cantidad());
    await user.type(cantidad(), '7');

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: elPedido.recipeId,
        quantity: '7',
        orderId: elPedido.id,
        unitId: UNIDAD.id,
      }),
    );
  });

  it('el alta no envia orderId, solo receta, cantidad y unidad (R65)', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '10.0000' },
    });
    renderFormulario();

    await rellenarAlta(user);

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenCalledWith({
        recipeId: RECETA.id,
        quantity: '5',
        unitId: UNIDAD.id,
      }),
    );
    const enviado = quoteOrderCostActionMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(enviado, 'orderId')).toBe(false);
  });
});

describe('R21 — la cotizacion fallida no bloquea el guardado', () => {
  it('pinta el mensaje del error, sin guion, y guardar sigue invocando la operacion', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'error',
      code: 'unauthorized',
      message: 'No tienes permiso.',
    });
    renderFormulario();

    await rellenarAlta(user);

    const error = await screen.findByTestId(ORDER_COST_QUOTE_ERROR_TESTID);
    expect(error.textContent).toContain('No tienes permiso.');
    expect(screen.queryByTestId(ORDER_COST_QUOTE_VALUE_TESTID)).not.toBeInTheDocument();
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
  });
});

describe('la cotizacion sigue a la version elegida', () => {
  const VIVA: RecipeVersionSummary = {
    id: crypto.randomUUID(),
    name: 'Sin colorante',
    displayName: `${RECETA.name} · Sin colorante`,
    isUnderReview: false,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  function selectorDeVersion(): HTMLElement {
    return screen.getByTestId(RECIPE_VERSION_SELECT_TESTID);
  }

  async function elegirVersion(user: ReturnType<typeof setupUser>, indice: number) {
    await waitFor(() => expect(selectorDeVersion()).toBeEnabled());
    await user.click(selectorDeVersion());
    const opciones = await screen.findAllByTestId(`${RECIPE_VERSION_SELECT_TESTID}-option`);
    await user.click(await esperarInteractiva(opciones[indice]!));
  }

  it('R28: elegir una version cotiza con su id, la cantidad tambien, y «Original» vuelve a la original', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockImplementation(async (id) => ({
      status: 'success',
      data: id === RECETA.id ? [VIVA] : [],
    }));
    renderFormulario();
    await elegirUnidad(user);
    await user.type(cantidad(), '5');
    await elegirReceta(user);

    await elegirVersion(user, 1);
    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({ recipeId: VIVA.id, quantity: '5', unitId: UNIDAD.id }),
    );

    await user.clear(cantidad());
    await user.type(cantidad(), '8');
    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({ recipeId: VIVA.id, quantity: '8', unitId: UNIDAD.id }),
    );

    await elegirVersion(user, 0);
    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA.id,
        quantity: '8',
        unitId: UNIDAD.id,
      }),
    );
  });

  it('R28: cambiar de receta devuelve el selector a «Original» y cotiza con la receta nueva', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockImplementation(async (id) => ({
      status: 'success',
      data: id === RECETA.id ? [VIVA] : [],
    }));
    renderFormulario();
    await elegirUnidad(user);
    await user.type(cantidad(), '5');
    await elegirReceta(user);
    await elegirVersion(user, 1);
    await waitFor(() =>
      expect(screen.getByTestId(`${RECIPE_VERSION_SELECT_TESTID}-value`)).toHaveValue(VIVA.id),
    );

    listRecipesActionMock.mockResolvedValue({
      status: 'success',
      data: {
        items: [recetaResumen(RECETA), recetaResumen(RECETA2)],
        page: 1,
        pageSize: 25,
        total: 2,
        totalPages: 1,
      },
    });
    await elegirReceta(user, RECETA2);

    expect(screen.getByTestId(`${RECIPE_VERSION_SELECT_TESTID}-value`)).toHaveValue(
      ORIGINAL_VERSION_VALUE,
    );
    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA2.id,
        quantity: '5',
        unitId: UNIDAD.id,
      }),
    );
    await waitFor(() => expect(getRecipeActionMock).toHaveBeenLastCalledWith(RECETA2.id));
    await waitFor(() => expect(selectorDeVersion()).toBeDisabled());
  });
});

describe('R29 — la cotizacion se recalcula al cambiar el reparto', () => {
  it('R29: cambiar los envases de una linea vuelve a cotizar con el reparto en envases', async () => {
    const user = setupUser();
    const elPedido = pedido({ presentationLines: [lineaConEnvase(1)] });
    renderFormulario(elPedido);

    const envases = screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    await user.clear(envases);
    await user.type(envases, '3');

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA.id,
        quantity: '5',
        orderId: elPedido.id,
        unitId: UNIDAD.id,
        presentationLines: [{ packagingProductId: ENVASE_ID, packages: 3 }],
      }),
    );
  });

  it('R29: anadir un envase en el alta vuelve a cotizar con esa linea', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user, '5');
    await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
    await user.click(await esperarInteractiva(await screen.findByTestId(PACKAGING_OPTION_TESTID)));
    await user.click(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID));

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA.id,
        quantity: '5',
        unitId: UNIDAD.id,
        presentationLines: [{ packagingProductId: ENVASE_ID, packages: 1 }],
      }),
    );
  });

  it('R29: cambiar la cantidad cotiza con el reparto vigente', async () => {
    const user = setupUser();
    const elPedido = pedido({ presentationLines: [lineaConEnvase(2)] });
    renderFormulario(elPedido);

    await user.clear(cantidad());
    await user.type(cantidad(), '8');

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA.id,
        quantity: '8',
        orderId: elPedido.id,
        unitId: UNIDAD.id,
        presentationLines: [{ packagingProductId: ENVASE_ID, packages: 2 }],
      }),
    );
  });

  it('R29: las lineas antiguas no viajan a la cotizacion porque no tienen envase', async () => {
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    await user.clear(cantidad());
    await user.type(cantidad(), '8');

    await waitFor(() =>
      expect(quoteOrderCostActionMock).toHaveBeenLastCalledWith({
        recipeId: RECETA.id,
        quantity: '8',
        orderId: elPedido.id,
        unitId: UNIDAD.id,
      }),
    );
  });

  it('R29: con envases no validos en el reparto no cotiza y muestra el guion', async () => {
    const user = setupUser();
    quoteOrderCostActionMock.mockResolvedValue({
      status: 'success',
      data: { ingredientsCost: '12.0000' },
    });
    const elPedido = pedido({ ingredientsCost: '12.0000', presentationLines: [lineaConEnvase(1)] });
    renderFormulario(elPedido);

    await user.clear(screen.getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID));

    await waitFor(() =>
      expect(screen.getByTestId(ORDER_COST_QUOTE_VALUE_TESTID).textContent).toBe(
        MISSING_VALUE_MARK,
      ),
    );
    expect(quoteOrderCostActionMock).not.toHaveBeenCalled();
  });
});
