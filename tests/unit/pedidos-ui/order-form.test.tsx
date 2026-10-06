// El formulario de alta y edicion de pedido.
//
// **El formulario se monta dentro de un `<Sheet>` abierto**, que es su unico entorno real: desde
// que el panel entero es un `<form>` (`SheetContent isForm`), sacarlo del panel no probaria el
// formulario que existe.
//
// **Lo que se afirma del envio es el `FormData`**, no el estado de React: el formulario es no
// controlado y lo unico que importa es que cada campo llegue a la operacion con el nombre y el
// valor que el adaptador driving lee. Al soltar el foco la cantidad se coloca a DOS decimales, y
// es ESE valor el que llega en el `FormData`; nada de aritmetica de coma flotante en el camino.
//
// **Los tests en negativo son el nucleo de esta ficha**: que el alta no ofrezca estado, que la
// edicion no ofrezca `CANCELADO` y que no haya campo de fecha de solicitud es justo lo que una
// feature posterior puede reintroducir sin que ningun assert positivo se ponga rojo.
//
// **Ningun assert sobre copy**: controles y regiones por `data-testid` o por rol ARIA.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import {
  REFERENCIA_DEL_CASO,
  errorInesperado,
  esperarSinIdentificador,
} from '../../helpers/identificador-de-request';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLOCKED_ORDER_CONFIRM_TESTID,
  BLOCKED_ORDER_DIALOG_TESTID,
  BLOCKED_ORDER_DISMISS_TESTID,
  BLOCKED_ORDER_MESSAGE_TESTID,
  ORDER_BUSINESS_FIELDS,
  ORDER_DISTRIBUTION_ADD_TESTID,
  ORDER_DISTRIBUTION_AVAILABLE_TESTID,
  ORDER_DISTRIBUTION_ERROR_TESTID,
  ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID,
  ORDER_DISTRIBUTION_LINE_TESTID,
  ORDER_DISTRIBUTION_PACKAGES_FIELD,
  ORDER_DISTRIBUTION_PACKAGING_FIELD,
  ORDER_DISTRIBUTION_PRESENTATION_FIELD,
  PACKAGING_OPTION_TESTID,
  PACKAGING_SELECT_TESTID,
  ORDER_DISTRIBUTION_TESTID,
  ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID,
  ORDER_CONFIRM_BLOCKED_FIELD,
  ORDER_FORM_ERROR_TESTID,
  ORDER_FORM_TITLE_TESTID,
  ORDER_INGREDIENTS_EMPTY_TESTID,
  ORDER_INGREDIENTS_ERROR_TESTID,
  ORDER_INGREDIENTS_TABLE_TESTID,
  ORDER_INGREDIENTS_TESTID,
  ORDER_RECIPE_IMAGE_TESTID,
  ORDER_FORM_SUBMIT_TESTID,
  ORDER_FORM_TESTID,
  ORDER_PRIORITY_OPTION_TESTID,
  ORDER_PRIORITY_SELECT_TESTID,
  ORDER_STATUS_FIELD,
  ORDER_STATUS_SELECT_TESTID,
  OrderForm,
  ORIGINAL_VERSION_VALUE,
  RECIPE_FIELD,
  RECIPE_PICKER_TESTID,
  RECIPE_VERSION_FIELD,
  RECIPE_VERSION_SELECT_TESTID,
  type RecipePickerPage,
} from '@/app/(private)/pedidos/components';
import { MISSING_IMAGE_SRC } from '@/components/shared/entity-image';
import {
  UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
  UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID,
} from '@/components/shared/unexpected-error-notice';
import { Sheet } from '@/components/ui/sheet';
import {
  DEFAULT_ORDER_PRIORITY,
  ORDER_PRIORITY_VALUES,
  formatOrderNumber,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import type {
  CreateOrderFormState,
  OrderMutationFormState,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';
import type {
  RecipeListResult,
  RecipeQueryResult,
  RecipeVersionListResult,
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeDetail, RecipeVersionSummary } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';
import { formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

const {
  createOrderActionMock,
  updateOrderActionMock,
  prohibida,
  listRecipesActionMock,
  getRecipeActionMock,
  listRecipeVersionsActionMock,
  listPresentationsActionMock,
  listProductsActionMock,
  quoteAvailabilityMock,
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
    prohibida: noDebeInvocarse,
    listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
    getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
    listRecipeVersionsActionMock: vi.fn<(id: string) => Promise<RecipeVersionListResult>>(),
    listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    listProductsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
    quoteAvailabilityMock: vi.fn<(input: unknown) => Promise<unknown>>(),
  };
});

// El panel monta la SECCION DE RESPONSABLES dentro de si mismo, y esa seccion es un modulo de
// cliente que usa `useRouter` y las Server Actions de `asignaciones`.
//
// **No es un cambio de guion de este archivo**: no toca ni un `it(...)`, ni un selector, ni una
// asercion. Son los dos dobles que el borde nuevo exige —el router de la App Router, que jsdom no
// monta, y las actions de `asignaciones`, que este archivo no ejercita— con el mismo criterio con
// el que ya estan aislados los bordes de `pedidos` y `recetas`.
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
  // Dobles que FALLAN si se les llama: el formulario no cancela, no borra y no lista.
  cancelOrderAction: vi.fn(prohibida('cancelOrderAction')),
  deleteOrderAction: vi.fn(prohibida('deleteOrderAction')),
  listOrdersAction: vi.fn(prohibida('listOrdersAction')),
  getOrderAction: vi.fn(prohibida('getOrderAction')),
  quoteOrderCostAction: vi.fn(() =>
    Promise.resolve({ status: 'success', data: { ingredientsCost: null } }),
  ),
  quoteOrderPresentationAvailabilityAction: quoteAvailabilityMock,
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipeVersionsAction: listRecipeVersionsActionMock,
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(prohibida('createPresentationAction')),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/product-actions', () => ({
  listProductsAction: listProductsActionMock,
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
/** Segunda receta, esta CON imagen: es la que prueba que el marcador se sustituye (2026-09-08). */
const RECETA_CON_IMAGEN = {
  id: crypto.randomUUID(),
  name: 'Barniz mate',
  imageUrl: 'https://ejemplo.test/barniz.png',
};
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

/** Catalogo de unidades: resuelve la unidad de los ingredientes y es el de la unidad del pedido. */
const UNIDAD = {
  id: crypto.randomUUID(),
  name: 'Litro',
  symbol: 'L',
  baseUnitId: null,
  factor: null,
  isSystem: true,
};

/** Presentacion del catalogo, ofrecida por `listPresentationsAction` en el selector del reparto. */
const PRESENTACION = {
  id: crypto.randomUUID(),
  name: 'Bidón 20L',
  unitId: UNIDAD.id,
  content: '20.0000',
};

/** Envase del catalogo, ofrecido por `listProductsAction` en el selector del reparto. */
const ENVASE = {
  id: crypto.randomUUID(),
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

/** Linea de reparto con envase, como la devuelve el pedido guardado. */
const LINEA_ENVASE = {
  presentationId: PRESENTACION.id,
  presentationName: PRESENTACION.name,
  packages: 1,
  packagingProductId: ENVASE.id,
  packagingName: ENVASE.name,
};

/** Cuatro decimales a proposito: es una cadena que ninguna coma flotante devuelve intacta. */
const CANTIDAD = '0.1005';

const UNIDADES: readonly UnitView[] = [UNIDAD];

/** Linea del detalle de la receta elegida, con los datos del producto ya unidos. */
const LINEA_INGREDIENTE = {
  id: 'linea-1',
  productId: crypto.randomUUID(),
  productName: 'Sosa cáustica',
  percentage: '10.00',
  productUnitId: UNIDAD.id,
  productStock: '40.0000',
};

/** Detalle de la receta que devuelve `getRecipeAction` (el JOIN con `products` lo hace `recetas`). */
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
    quantity: CANTIDAD,
    priority: 'ALTA',
    status: 'EN_CURSO',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationLines: [LINEA_ENVASE],
    unitId: UNIDAD.id,
    unitLabel: UNIDAD.symbol,
    ...overrides,
  };
}

const onSaved = vi.fn();

function renderFormulario(order?: OrderSummary, recipes: RecipePickerPage = RECETAS) {
  return render(
    <Sheet open>
      <OrderForm order={order} recipes={recipes} units={UNIDADES} bridge={null} onSaved={onSaved} />
    </Sheet>,
  );
}

/** Elige la receta, que es el unico campo que no se escribe a mano (la unidad se fue en 2026-09-07). */
async function elegirCatalogos(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)));
}

async function elegirUnidad(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-unit-select'));
  await user.click(await esperarInteractiva(await screen.findByTestId('presentation-unit-option')));
}

/** Anade al reparto el envase del catalogo que trae `listProductsAction`. */
async function anadirLinea(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(PACKAGING_OPTION_TESTID)));
  await user.click(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID));
}

/** El control de cantidad, tipado: sus asserts miran la CADENA del DOM, no `valueAsNumber`. */
function cantidad(): HTMLInputElement {
  return screen.getByTestId('order-field-quantity') as HTMLInputElement;
}

async function rellenarAlta(user: ReturnType<typeof setupUser>) {
  await elegirCatalogos(user);
  await elegirUnidad(user);
  await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);
}

beforeEach(() => {
  vi.clearAllMocks();
  createOrderActionMock.mockResolvedValue({
    status: 'success',
    id: crypto.randomUUID(),
    numberText: formatOrderNumber({ year: 2026, sequence: 43 }),
  });
  updateOrderActionMock.mockResolvedValue({ status: 'success' });
  getRecipeActionMock.mockResolvedValue({ status: 'success', data: recetaDetalle() });
  listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [] });
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
  listProductsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [ENVASE], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
  quoteAvailabilityMock.mockResolvedValue({
    status: 'success',
    data: { kind: 'ok', available: '0.1005' },
  });
});

afterEach(() => {
  cleanup();
});

describe('formulario de alta de pedido (R26, R27, R30, R33, R39)', () => {
  it('R41: captura los campos de negocio, unidad incluida, y los envia a la operacion de alta', async () => {
    // El `FormData` lleva exactamente los nombres que el adaptador driving lee. La lista se
    // deriva de `ORDER_BUSINESS_FIELDS`, no de literales sueltos.
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));

    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    for (const campo of ORDER_BUSINESS_FIELDS) {
      expect(enviado.get(campo), `falta el campo «${campo}»`).not.toBeNull();
    }
    expect(enviado.get(RECIPE_FIELD)).toBe(RECETA.id);
    // La unidad vuelve al pedido; el precio unitario sigue fuera.
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
    expect(enviado.get('unitPrice')).toBeNull();
    // Sin lineas el reparto viaja vacio, que es valido en el alta.
    expect(enviado.getAll(ORDER_DISTRIBUTION_PRESENTATION_FIELD)).toEqual([]);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual([]);
    expect(updateOrderActionMock).not.toHaveBeenCalled();
  });

  it('al salir del campo, la cantidad se coloca a DOS decimales y sin ceros finales', async () => {
    // Al soltar el foco el valor se coloca a dos decimales y se afeitan los ceros finales.
    // «25.00» y «25.0» se muestran como «25»; «25.3» y «25.08» conservan sus decimales. El valor
    // colocado es el que queda en el campo y el que viaja al enviar: al pinchar Guardar, el
    // campo pierde el foco ANTES del submit.
    const user = setupUser();
    renderFormulario();

    const control = cantidad();
    for (const [escrito, colocado] of [
      ['25.00', '25'],
      ['25.0', '25'],
      ['25.3', '25.3'],
      ['25.08', '25.08'],
      ['0.1005', '0.1'],
      // 2026-09-17: estos tres reventaban. El redondeo propio del campo dejaba el punto suelto
      // -«25.001» salia «25.»- y un `type="number"` sanea esa cadena a VACIA, con lo que el
      // campo se quedaba EN BLANCO al tabular y el pedido se enviaba sin cantidad.
      ['25.001', '25'],
      ['25.995', '26'],
      ['9.999', '10'],
    ] as const) {
      await user.clear(control);
      await user.type(control, escrito);
      await user.tab();

      expect(control.value, `«${escrito}» deberia quedar como «${colocado}»`).toBe(colocado);
    }
  });

  it('el enviar colocado a dos decimales: «0.1005» viaja como «0.1» en el FormData', async () => {
    // El click en Guardar hace perder el foco al campo de cantidad: el valor se coloca antes del
    // submit y es ESE el que llega a la operacion.
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));

    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('quantity')).toBe('0.1');
  });

  it('captura la cantidad con el control NUMERICO del navegador, con paso libre y sin negativos', () => {
    // El control es numerico. Que `0.1005` llegue intacta al `FormData` lo comprueba el test de
    // arriba. `step="any"` es imprescindible: con el paso entero por defecto un decimal seria
    // invalido. `min="0.01"` es la señal al navegador de que no ofrezca negativos ni cero -el
    // «mayor que cero» real lo sigue cerrando el esquema del contrato al enviar.
    renderFormulario();

    const control = screen.getByTestId('order-field-quantity');
    expect(control).toHaveAttribute('type', 'number');
    expect(control).toHaveAttribute('step', 'any');
    expect(control).toHaveAttribute('min', '0.01');
    expect(control).toHaveAttribute('inputmode', 'decimal');

    // Y el campo de precio unitario NO existe: se fue con la columna (2026-09-07).
    expect(screen.queryByTestId('order-field-unitPrice')).toBeNull();
  });

  it('presenta la prioridad por defecto del contrato PRESELECCIONADA y visible', async () => {
    // «No implicita»: el campo emite siempre un valor valido, porque para el adaptador driving
    // una prioridad VACIA es error y no ausencia.
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('priority')).toBe(DEFAULT_ORDER_PRIORITY);
  });

  it('ofrece las CUATRO prioridades que publica el contrato', async () => {
    // El conjunto se deriva de `ORDER_PRIORITY_VALUES`, no se escribe a mano.
    const user = setupUser();
    renderFormulario();

    await user.click(screen.getByTestId(ORDER_PRIORITY_SELECT_TESTID));

    const opciones = await screen.findAllByTestId(ORDER_PRIORITY_OPTION_TESTID);
    expect(opciones.map((o) => o.getAttribute('data-value'))).toEqual([...ORDER_PRIORITY_VALUES]);
  });

  it('el alta NO ofrece selector de estado', async () => {
    // El alta nace `PENDIENTE` y lo pone el caso de uso.
    const user = setupUser();
    renderFormulario();

    expect(screen.queryByTestId(ORDER_STATUS_SELECT_TESTID)).toBeNull();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(ORDER_STATUS_FIELD)).toBeNull();
  });

  it('ningun formulario ofrece campo de fecha de solicitud, ni motivo, ni correlativo, ni autoria', () => {
    // La fecha la pone el sistema y solo se muestra y ordena.
    for (const pedidoDelCaso of [undefined, pedido()]) {
      cleanup();
      renderFormulario(pedidoDelCaso);

      const formulario = screen.getByTestId(ORDER_FORM_TESTID) as HTMLFormElement;
      const nombres = [...new FormData(formulario).keys()];
      for (const prohibido of [
        'createdAt',
        'requestedAt',
        'cancellationReason',
        'reason',
        'orderNumber',
        'numberText',
        'createdBy',
        'updatedBy',
      ]) {
        expect(nombres, `«${prohibido}» no debe existir`).not.toContain(prohibido);
      }
    }
  });
});

describe('la unidad y el reparto del pedido (R4, R9, R41, R42)', () => {
  it('R41: el alta exige la unidad: sin ella no se llama a la operacion y el error va junto al selector', async () => {
    const user = setupUser();
    renderFormulario();

    await elegirCatalogos(user);
    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    expect(await screen.findByTestId('presentation-error-unit')).toBeInTheDocument();
    expect(createOrderActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R42: sin unidad, el control de reparto dice que falta y no ofrece anadir lineas', () => {
    renderFormulario();

    expect(screen.getByTestId(ORDER_DISTRIBUTION_TESTID)).toBeInTheDocument();
    expect(screen.getByTestId(ORDER_DISTRIBUTION_WITHOUT_UNIT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(PACKAGING_SELECT_TESTID)).toBeNull();
    expect(screen.queryByTestId(ORDER_DISTRIBUTION_ADD_TESTID)).toBeNull();
  });

  it('R36: el selector del reparto es de envases, no ofrece crear presentaciones ni manda el campo de presentacion unica', async () => {
    const user = setupUser();
    renderFormulario();

    await elegirUnidad(user);

    expect(screen.getByTestId(PACKAGING_SELECT_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId('presentation-select')).toBeNull();
    expect(screen.queryByTestId('presentation-create-open')).toBeNull();
    const formulario = screen.getByTestId(ORDER_FORM_TESTID) as HTMLFormElement;
    expect([...new FormData(formulario).keys()]).not.toContain('presentationId');
  });

  it('R36: las lineas anadidas viajan en el alta con el envase, la presentacion vacia y los envases', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await anadirLinea(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual([ENVASE.id]);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PRESENTATION_FIELD)).toEqual(['']);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGES_FIELD)).toEqual(['1']);
  });

  it('R35: una linea antigua se reenvia sin cambios por su presentacion y sin envase', async () => {
    const user = setupUser();
    renderFormulario(
      pedido({
        presentationLines: [
          { presentationId: PRESENTACION.id, presentationName: PRESENTACION.name, packages: 2, packagingProductId: null, packagingName: null },
        ],
      }),
    );

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    expect(linea).toHaveAttribute('data-legacy', 'true');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.getAll(ORDER_DISTRIBUTION_PRESENTATION_FIELD)).toEqual([PRESENTACION.id]);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual(['']);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGES_FIELD)).toEqual(['2']);
  });

  it('R17: dos envases de presentaciones distintas se guardan: la presentacion vacia del envio no los hace repetidos', async () => {
    const user = setupUser();
    const otraPresentacion = { id: crypto.randomUUID(), name: 'Bidón 5L', content: '5.0000' };
    const otroEnvase = {
      ...ENVASE,
      id: crypto.randomUUID(),
      name: 'Bidón PET 5 L',
      presentationId: otraPresentacion.id,
      presentationName: otraPresentacion.name,
      presentationContent: otraPresentacion.content,
    };
    listProductsActionMock.mockResolvedValue({
      status: 'success',
      data: { items: [ENVASE, otroEnvase], page: 1, pageSize: 25, total: 2, totalPages: 1 },
    });
    renderFormulario();

    await rellenarAlta(user);
    for (const indice of [0, 1]) {
      await user.click(screen.getByTestId(PACKAGING_SELECT_TESTID));
      const opciones = await screen.findAllByTestId(PACKAGING_OPTION_TESTID);
      await user.click(await esperarInteractiva(opciones[indice]!));
      await user.click(screen.getByTestId(ORDER_DISTRIBUTION_ADD_TESTID));
    }
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual([ENVASE.id, otroEnvase.id]);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PRESENTATION_FIELD)).toEqual(['', '']);
  });

  it('R11: el rechazo product_not_found del envase se pinta junto al reparto', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'product_not_found',
      message: 'El envase no existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() =>
      expect(screen.getByTestId(ORDER_DISTRIBUTION_ERROR_TESTID)).toHaveTextContent(
        'El envase no existe.',
      ),
    );
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
  });

  it('R36: la edicion precarga unidad y reparto en envases, y permite cambiar los envases', async () => {
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    const linea = screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID);
    expect(linea).toHaveAttribute('data-packaging-product-id', ENVASE.id);
    expect(linea).toHaveTextContent(ENVASE.name);
    const envases = within(linea).getByTestId(ORDER_DISTRIBUTION_LINE_PACKAGES_TESTID);
    expect(envases).toHaveValue(1);

    await user.clear(envases);
    await user.type(envases, '3');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual([ENVASE.id]);
    expect(enviado.getAll(ORDER_DISTRIBUTION_PACKAGES_FIELD)).toEqual(['3']);
  });

  it('R41: un pedido sin unidad exige elegirla al editar; con ella elegida se guarda', async () => {
    const user = setupUser();
    renderFormulario(pedido({ unitId: null, unitLabel: null, presentationLines: [] }));

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));
    expect(await screen.findByTestId('presentation-error-unit')).toBeInTheDocument();
    expect(updateOrderActionMock).not.toHaveBeenCalled();

    await elegirUnidad(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get('unitId')).toBe(UNIDAD.id);
  });

  it('R6: el disponible se pide con la cantidad, la unidad y el reparto vigentes', async () => {
    renderFormulario(pedido());

    await waitFor(() =>
      expect(quoteAvailabilityMock).toHaveBeenCalledWith({
        quantity: CANTIDAD,
        unitId: UNIDAD.id,
        presentationLines: [{ packagingProductId: ENVASE.id, packages: 1 }],
      }),
    );
    expect(await screen.findByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveTextContent(
      '0.1005 L',
    );
  });

  it('R39: si el reparto pasa del total, Guardar queda deshabilitado', async () => {
    quoteAvailabilityMock.mockResolvedValue({
      status: 'success',
      data: { kind: 'exceeds_quantity', available: '-19.8995' },
    });
    renderFormulario(pedido());

    await waitFor(() => expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled());
    expect(screen.getByTestId(ORDER_DISTRIBUTION_AVAILABLE_TESTID)).toHaveAttribute(
      'data-negative',
      'true',
    );
  });

  it('R36: el rechazo del servidor por el reparto se pinta junto al reparto y conserva lo escrito', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'presentation_not_found',
      message: 'La presentación no existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => {
      expect(screen.getByTestId(ORDER_DISTRIBUTION_ERROR_TESTID)).toBeInTheDocument();
      expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
    });
    expect(cantidad().value).toBe(CANTIDAD);
    expect(screen.getByTestId(ORDER_DISTRIBUTION_LINE_TESTID)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('formulario de edicion de pedido (R7, R28, R34)', () => {
  it('precarga los valores actuales y envia el REEMPLAZO COMPLETO del conjunto de negocio', async () => {
    // No hay envio por campos sueltos: se manda todo el conjunto de negocio, y nada de
    // estado.
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(elPedido.recipeId);
    // El valor del control se lee como CADENA a proposito: `toHaveValue` sobre un control
    // numerico devuelve `valueAsNumber`, y esa conversion perderia la precision decimal que aqui
    // se quiere comprobar. Lo que importa es que el DOM siga guardando la cadena tal cual.
    expect(cantidad().value).toBe(elPedido.quantity);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));

    // `bind(null, id)`: el id es el PRIMER argumento de la action, no un campo del formulario.
    expect(updateOrderActionMock.mock.calls[0]?.[0]).toBe(elPedido.id);
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    for (const campo of ORDER_BUSINESS_FIELDS) {
      expect(enviado.get(campo), `falta el campo «${campo}»`).not.toBeNull();
    }
    expect(enviado.get(RECIPE_FIELD)).toBe(elPedido.recipeId);
    expect(enviado.get('priority')).toBe(elPedido.priority);
    expect(createOrderActionMock).not.toHaveBeenCalled();
  });

  it('R7: la edicion no ofrece ningun control de estado ni lo envia', async () => {
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    expect(screen.queryByTestId(ORDER_STATUS_SELECT_TESTID)).toBeNull();

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    expect(enviado.get(ORDER_STATUS_FIELD)).toBeNull();
  });

  it('«recipe_not_found» se pinta junto al SELECTOR DE RECETA, no en la region del formulario', async () => {
    // Se decide por el `code` estable, nunca por el texto del mensaje.
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_not_found',
      message: 'La receta no existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    // Las tres condiciones del DOM en la misma espera: el mensaje, la ausencia de aviso de
    // formulario y el `aria-invalid` cambian en la misma interaccion pero no tienen por que caer
    // en el mismo commit.
    await waitFor(() => {
      expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-error`)).toBeInTheDocument();
      expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
      expect(screen.getByTestId(RECIPE_PICKER_TESTID)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R7: «invalid_transition» va a la region general del formulario, sin campo de estado que senalar', async () => {
    // Sin selector de estado, `invalid_transition` ya no puede senalar ningun campo: cae
    // en la region general, junto con `duplicate_number` y compania.
    const user = setupUser();

    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_transition',
      message: 'Transición no permitida.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('order-form-error-code')).toHaveTextContent('invalid_transition');
    expect(screen.queryByTestId(`order-error-${ORDER_STATUS_FIELD}`)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('un codigo que no senala campo va a la region de aviso del formulario y no pierde lo escrito', async () => {
    // `duplicate_number`, `not_found` y `unauthorized` no identifican campo. Y un rechazo NO
    // cierra el panel ni vacia el formulario.
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_number',
      message: 'Ese correlativo ya existe.',
    });
    const elPedido = pedido();
    renderFormulario(elPedido);

    await user.clear(screen.getByTestId('order-field-quantity'));
    await user.type(screen.getByTestId('order-field-quantity'), '7.7777');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('order-form-error-code')).toHaveTextContent('duplicate_number');
    // Lo escrito sigue ahi: React 19 resetea los campos no controlados al completarse la action,
    // asi que el estado de fallo los devuelve por `defaultValue`. Al pinchar Guardar el campo
    // perdió el foco antes del submit, asi que el valor devuelto es el COLOCADO a dos decimales.
    expect(cantidad().value).toBe('7.78');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('una cantidad que el ESQUEMA del contrato rechaza no llega a la operacion', async () => {
    // La validacion previa usa el mismo esquema que valida el servidor: no hay segunda copia de
    // la regla «la cantidad es mayor que cero».
    const user = setupUser();
    renderFormulario(pedido({ quantity: '0' }));

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(screen.getByTestId('order-error-quantity')).toBeInTheDocument());
    expect(updateOrderActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('valida con los esquemas del contrato y sin ninguna libreria de formularios', () => {
    // Guardia de FUENTE: los esquemas salen del barrel de `pedidos` (client-safe) y las actions,
    // de su ruta exacta. (Los paquetes descartados no se nombran aqui a proposito.)
    const fuente = readFileSync('app/(private)/pedidos/components/order-form.tsx', 'utf8');

    expect(fuente).toContain("createOrderSchema");
    expect(fuente).toContain("updateOrderSchema");
    expect(fuente).toContain("from '@/lib/modules/pedidos'");
    expect(fuente).toContain("@/lib/modules/pedidos/adapters/driving/order-actions");
    expect(fuente).not.toContain('parseFloat(');
    expect(fuente).not.toContain('toFixed(');
    expect(fuente).not.toContain('@/lib/composition');
  });
});

describe('la cabecera describe el pedido y el panel ensena la receta (2026-09-08)', () => {
  // Se afirma sobre DATOS -el nombre de la receta y la cantidad tecleada-, no sobre copy.

  it('el titulo pasa a nombrar la receta elegida y la cantidad tecleada', async () => {
    const user = setupUser();
    renderFormulario();

    const titulo = screen.getByTestId(ORDER_FORM_TITLE_TESTID);
    expect(titulo.textContent).not.toContain(RECETA.name);

    await rellenarAlta(user);

    expect(titulo.textContent).toContain(RECETA.name);
    expect(titulo.textContent).toContain(CANTIDAD);
  });

  it('el hueco de la imagen existe desde el principio, con el marcador comun', () => {
    renderFormulario();

    const imagen = screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID);
    expect(imagen).toHaveAttribute('data-missing', 'true');
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
  });

  it('elegir una receta con imagen sustituye el marcador por ella', async () => {
    const user = setupUser();
    renderFormulario(undefined, { items: [RECETA_CON_IMAGEN], totalPages: 1 });

    await elegirCatalogos(user);

    const imagen = screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID);
    expect(imagen).toHaveAttribute('src', RECETA_CON_IMAGEN.imageUrl);
    expect(imagen).not.toHaveAttribute('data-missing');
  });

  it('y elegir una receta SIN imagen (ruta nula) deja el marcador donde estaba', async () => {
    const user = setupUser();
    renderFormulario();

    await elegirCatalogos(user);

    const imagen = screen.getByTestId(ORDER_RECIPE_IMAGE_TESTID);
    expect(imagen).toHaveAttribute('data-missing', 'true');
    expect(imagen).toHaveAttribute('src', MISSING_IMAGE_SRC);
  });
});

describe('la eleccion de receta gobierna Guardar (2026-09-09)', () => {
  // «crema 1» no puede guardarse con el campo diciendo «crema 1a». Guardar solo se habilita con
  // una receta ELEGIDA de la lista; editar el campo retira la eleccion, deja el id oculto vacio y
  // vuelve a deshabilitar Guardar. Se afirma sobre el atributo del boton y sobre el `input`
  // oculto del selector, sin asserts de copy.

  it('en el alta, Guardar esta deshabilitado hasta elegir una receta', async () => {
    const user = setupUser();
    renderFormulario();

    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled();

    await rellenarAlta(user);

    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();
  });

  it('editar el campo tras elegir retira la receta y vuelve a bloquear Guardar', async () => {
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeEnabled();

    // Lo que el selector ya no guarda: el id viaja vacio y el titulo y el boton vuelven al inicio.
    await user.type(screen.getByTestId(RECIPE_PICKER_TESTID), 'a');

    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue('');
    expect(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID)).toBeDisabled();
    expect(screen.getByTestId(ORDER_FORM_TITLE_TESTID).textContent).not.toContain(RECETA.name);
    expect(createOrderActionMock).not.toHaveBeenCalled();
  });
});

describe('los ingredientes de la receta elegida (2026-09-09)', () => {
  // El JOIN con `products` lo hace el detalle de `recetas` (`getRecipeAction`); aqui se
  // comprueba que al elegir receta se pide y que la tabla pinta los datos del producto.

  it('sin receta elegida la tabla de ingredientes no se monta', () => {
    renderFormulario();

    expect(screen.queryByTestId(ORDER_INGREDIENTS_TESTID)).toBeNull();
    expect(getRecipeActionMock).not.toHaveBeenCalled();
  });

  it('elegir una receta pide su detalle y pinta la tabla con los datos de los productos', async () => {
    const user = setupUser();
    renderFormulario();

    await elegirCatalogos(user);

    await waitFor(() => expect(getRecipeActionMock).toHaveBeenCalledWith(RECETA.id));
    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);

    expect(within(tabla).getByTestId('order-ingredient-product')).toHaveTextContent(
      LINEA_INGREDIENTE.productName,
    );
    // La columna «porcentaje» pinta la parte del insumo con coma y dos decimales.
    expect(within(tabla).getByTestId('order-ingredient-percentage')).toHaveTextContent('10,00 %');
    // La unidad es la del PRODUCTO (`productUnitId`), se resuelve con el catalogo bajado por
    // props y va pegada a la cifra del stock.
    expect(within(tabla).getByTestId('order-ingredient-stock').textContent).toBe(
      `${formatDecimalDisplay(LINEA_INGREDIENTE.productStock ?? '')} L`,
    );
    expect(within(tabla).queryByTestId('order-ingredient-unit')).toBeNull();
  });

  it('la edicion pide el detalle de la receta YA elegida al montar el panel', async () => {
    renderFormulario(pedido());

    await waitFor(() => expect(getRecipeActionMock).toHaveBeenCalledWith(RECETA.id));
    expect(await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID)).toBeInTheDocument();
  });

  it('una receta sin ingredientes se dice, no se pinta una tabla vacia', async () => {
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [] }),
    });
    renderFormulario();

    await elegirCatalogos(user);

    expect(await screen.findByTestId(ORDER_INGREDIENTS_EMPTY_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_INGREDIENTS_TABLE_TESTID)).toBeNull();
  });

  it('la «cantidad requerida» parte de 0 y el «restante» la descuenta del stock', async () => {
    // La columna calcula `cantidad del pedido × porcentaje / 100` (`consumedQuantity`), y sin
    // cantidad escrita vale 0; el restante es `stock − requerida` (`subtractDecimal`) y sin
    // cantidad escrita coincide con el stock.
    const user = setupUser();
    renderFormulario();

    await elegirCatalogos(user);
    await elegirUnidad(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const requerida = within(tabla).getByTestId('order-ingredient-required');
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(requerida).toHaveTextContent('0');
    expect(restante).toHaveTextContent('40');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    // 0.1005 × 10,00 % = 0.01005 y 40 − 0.01005 = 39.98995. Se CALCULAN exactos y se PINTAN a dos
    // decimales: «0.01 L» y «39.99 L». El valor exacto no se pierde, viaja en el `title`.
    await waitFor(() => expect(requerida.textContent).toBe('0.01 L'));
    expect(requerida).toHaveAttribute('title', '0.01005');
    expect(requerida).toHaveAttribute('aria-label', '0.01005 L');
    expect(restante.textContent).toBe('39.99 L');
    expect(restante).toHaveAttribute('title', '39.98995');
    expect(restante).toHaveAttribute('aria-label', '39.98995 L');
    expect(restante.firstChild).not.toHaveClass('text-destructive');
  });

  it('un restante negativo se resalta en rojo', async () => {
    // El pedido pide mas de lo que hay, el restante baja de cero y la celda se pinta con
    // `text-destructive` sobre fondo suave.
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: '0.0050' }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);
    await elegirUnidad(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    // Sin cantidad escrita, el restante coincide con el stock, redondeado a dos decimales.
    expect(restante).toHaveTextContent('0.01');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    // 0.005 − 0.01005 = −0.00505, resaltado. A dos decimales eso se pinta «-0.01», y el `title`
    // lleva la cifra exacta. El resalte (`isShort`) mira el exacto, no el pintado.
    await waitFor(() => expect(restante.textContent).toBe('-0.01 L'));
    expect(restante).toHaveAttribute('title', '-0.00505');
    expect(restante).toHaveAttribute('aria-label', '-0.00505 L');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('R12 — con existencia en la unidad de la linea, el restante resta normal', async () => {
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: '40.0000' }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);
    await elegirUnidad(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent('40');
    expect(within(tabla).getByTestId('order-ingredient-remaining')).toHaveTextContent('40');
  });

  it('R13 — con lotes pero ninguno en la unidad de la linea, existencia y restante muestran el marcador', async () => {
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: null }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent('—');
    expect(within(tabla).getByTestId('order-ingredient-remaining')).toHaveTextContent('—');
  });

  it('R14 — sin ningun lote, la existencia es 0 y el restante negativo se destaca como faltante', async () => {
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: '0.0000' }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);
    await elegirUnidad(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent('0');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    // 0 − 0.01005 = −0.01005: sin ningun lote el pedido siempre pide mas de lo que hay. Se
    // CALCULA exacto y se PINTA a dos decimales, «-0.01».
    // El resalte de faltante (`isShort`) se decide con el restante EXACTO, nunca con el pintado.
    // En telefono o impreso no hay `title`, y alli el color es el unico aviso; se acepta a
    // sabiendas.
    await waitFor(() => expect(restante.textContent).toBe('-0.01 L'));
    expect(restante).toHaveAttribute('title', '-0.01005');
    expect(restante).toHaveAttribute('aria-label', '-0.01005 L');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('si el detalle falla, la tabla se sustituye por el estado de error de los ingredientes', async () => {
    const user = setupUser();
    // El codigo es `recipe_not_found`: `getRecipeAction` declara su `code` como `ErrorCode`, la
    // union CERRADA del catalogo. Es el mismo que compara
    // `app/(private)/produccion/formulas/[id]/page.tsx`.
    getRecipeActionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_not_found',
      message: 'La receta no existe.',
    });
    renderFormulario();

    await elegirCatalogos(user);

    const error = await screen.findByTestId(ORDER_INGREDIENTS_ERROR_TESTID);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('La receta no existe.');
    // El fallo del detalle no convierte el panel en un fallo del formulario.
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
  });
});

/**
 * El formulario guarda el estado de error de la operacion ENTERO (`serverError`), y esta pareja de
 * casos es la que lo demuestra: la copia campo a campo que habia antes dejaba el identificador por
 * el camino sin que ningun test se enterara.
 */
describe('formulario de pedido — el identificador del error inesperado (QC-71 R17, R18)', () => {
  it('el error inesperado ensena el identificador como texto, con su etiqueta', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue(errorInesperado());
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_FORM_ERROR_TESTID);
    expect(region).toHaveAttribute('role', 'alert');
    expect(within(region).getByText(REFERENCIA_DEL_CASO)).toBeInTheDocument();
    expect(within(region).getByTestId(UNEXPECTED_ERROR_NOTICE_REFERENCE_TESTID)).toHaveTextContent(
      UNEXPECTED_ERROR_NOTICE_REFERENCE_LABEL,
    );
  });

  it('un error del catalogo no ensena identificador ninguno', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'duplicate_number',
      message: 'Ese correlativo ya existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    const region = await screen.findByTestId(ORDER_FORM_ERROR_TESTID);
    expect(within(region).getByTestId('order-form-error-code')).toHaveTextContent(
      'duplicate_number',
    );
    esperarSinIdentificador();
  });
});

describe('pedido que no alcanza: el aviso de guardarlo bloqueado', () => {
  const MENSAJE_BLOQUEO = 'No hay material suficiente para este pedido.';
  const NO_ALCANZA = { status: 'error', code: 'order_would_block', message: MENSAJE_BLOQUEO } as const;

  /** Lo que viajo en cada envio, sin el campo de confirmacion: para comparar los demas campos. */
  function camposDeNegocio(formData: FormData): Record<string, string> {
    const campos: Record<string, string> = {};
    for (const [nombre, valor] of formData) {
      if (nombre !== ORDER_CONFIRM_BLOCKED_FIELD) campos[nombre] = String(valor);
    }
    return campos;
  }

  it('R7: en el alta, ante order_would_block aparece el aviso y no la region de error', async () => {
    const user = setupUser();
    createOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    const dialogo = await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID);
    expect(within(dialogo).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByTestId(BLOCKED_ORDER_MESSAGE_TESTID)).toHaveTextContent(MENSAJE_BLOQUEO);
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R7: en la edicion, ante order_would_block aparece el mismo aviso', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    expect(await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
  });

  it('R7, R9: las acciones del aviso tienen objetivo tactil de al menos 44x44', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));
    await screen.findByTestId(BLOCKED_ORDER_DIALOG_TESTID);

    for (const testId of [BLOCKED_ORDER_CONFIRM_TESTID, BLOCKED_ORDER_DISMISS_TESTID]) {
      const boton = screen.getByTestId(testId);
      expect(boton.className, testId).toContain('min-h-11');
      expect(boton.className, testId).toContain('min-w-11');
    }
  });

  it('R8: en el alta, «Guardar bloqueado» reenvia el mismo FormData con confirmBlocked=true', async () => {
    const user = setupUser();
    createOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));
    await user.click(await screen.findByTestId(BLOCKED_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(2));
    const primero = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    const reenvio = createOrderActionMock.mock.calls[1]?.[1] as FormData;
    expect(primero.get(ORDER_CONFIRM_BLOCKED_FIELD)).toBeNull();
    expect(reenvio.get(ORDER_CONFIRM_BLOCKED_FIELD)).toBe('true');
    expect(camposDeNegocio(reenvio)).toEqual(camposDeNegocio(primero));
    expect(updateOrderActionMock).not.toHaveBeenCalled();
  });

  it('R8: en la edicion, «Guardar bloqueado» reenvia al mismo pedido y, guardado, no vuelve a avisar', async () => {
    // El servidor decide si queda bloqueado o, si entre tanto alcanza, pendiente: el formulario
    // solo ve el exito y cierra.
    const user = setupUser();
    updateOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    const elPedido = pedido();
    renderFormulario(elPedido);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));
    await user.click(await screen.findByTestId(BLOCKED_ORDER_CONFIRM_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(2));
    expect(updateOrderActionMock.mock.calls[1]?.[0]).toBe(elPedido.id);
    const primero = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    const reenvio = updateOrderActionMock.mock.calls[1]?.[2] as FormData;
    expect(reenvio.get(ORDER_CONFIRM_BLOCKED_FIELD)).toBe('true');
    expect(camposDeNegocio(reenvio)).toEqual(camposDeNegocio(primero));
    expect(reenvio.getAll(ORDER_DISTRIBUTION_PACKAGING_FIELD)).toEqual([ENVASE.id]);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeNull();
  });

  it('R9: «Volver» cierra el aviso sin llamar a la action y los campos conservan su valor', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValueOnce(NO_ALCANZA);
    const elPedido = pedido();
    renderFormulario(elPedido);

    await user.clear(cantidad());
    await user.type(cantidad(), '7.7777');
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));
    await user.click(await screen.findByTestId(BLOCKED_ORDER_DISMISS_TESTID));

    await waitFor(() => expect(screen.queryByTestId(BLOCKED_ORDER_DIALOG_TESTID)).toBeNull());
    expect(updateOrderActionMock).toHaveBeenCalledTimes(1);
    expect(createOrderActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    // Al pinchar Guardar el campo perdio el foco antes del envio: lo que conserva es lo colocado.
    expect(cantidad().value).toBe('7.78');
    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(elPedido.recipeId);
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
  });
});

describe('el selector de version en el formulario', () => {
  function versionDeLaReceta(name: string, isUnderReview = false): RecipeVersionSummary {
    return {
      id: crypto.randomUUID(),
      name,
      displayName: `${RECETA.name} · ${name}`,
      isUnderReview,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  function selectorDeVersion(): HTMLElement {
    return screen.getByTestId(RECIPE_VERSION_SELECT_TESTID);
  }

  async function elegirVersion(user: ReturnType<typeof setupUser>, indice: number) {
    await waitFor(() => expect(selectorDeVersion()).toBeEnabled());
    await user.click(selectorDeVersion());
    const opciones = await screen.findAllByTestId(`${RECIPE_VERSION_SELECT_TESTID}-option`);
    await user.click(await esperarInteractiva(opciones[indice]!));
  }

  it('R27: en el alta sin receta el selector esta deshabilitado y su campo viaja vacio', () => {
    renderFormulario();

    expect(selectorDeVersion()).toBeDisabled();
    expect(screen.getByTestId(`${RECIPE_VERSION_SELECT_TESTID}-value`)).toHaveValue(
      ORIGINAL_VERSION_VALUE,
    );
  });

  it('R26, R27: elegir la receta pide sus versiones; sin ninguna ofrecible sigue deshabilitado', async () => {
    const user = setupUser();
    listRecipeVersionsActionMock.mockResolvedValue({
      status: 'success',
      data: [versionDeLaReceta('A medias', true)],
    });
    renderFormulario();

    await elegirCatalogos(user);

    await waitFor(() => expect(listRecipeVersionsActionMock).toHaveBeenCalledWith(RECETA.id));
    expect(selectorDeVersion()).toBeDisabled();
  });

  it('R28: elegir una version pide sus ingredientes y volver a «Original» los de la original', async () => {
    const user = setupUser();
    const viva = versionDeLaReceta('Sin colorante');
    listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [viva] });
    renderFormulario();
    await elegirCatalogos(user);
    await waitFor(() => expect(getRecipeActionMock).toHaveBeenLastCalledWith(RECETA.id));

    await elegirVersion(user, 1);
    await waitFor(() => expect(getRecipeActionMock).toHaveBeenLastCalledWith(viva.id));

    await elegirVersion(user, 0);
    await waitFor(() => expect(getRecipeActionMock).toHaveBeenLastCalledWith(RECETA.id));
  });

  it('R28: el alta con version envia la original como receta y la version en su campo', async () => {
    const user = setupUser();
    const viva = versionDeLaReceta('Sin colorante');
    listRecipeVersionsActionMock.mockResolvedValue({ status: 'success', data: [viva] });
    renderFormulario();
    await rellenarAlta(user);
    await elegirVersion(user, 1);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get(RECIPE_FIELD)).toBe(RECETA.id);
    expect(enviado.get(RECIPE_VERSION_FIELD)).toBe(viva.id);
  });

  it.each([
    ['por revisar', true],
    ['dada de baja', false],
  ] as const)(
    'R29: la edicion de un pedido con una version %s la muestra elegida y el FormData la conserva',
    async (nota, sigueListada) => {
      const user = setupUser();
      const actual = versionDeLaReceta('A medias', true);
      listRecipeVersionsActionMock.mockResolvedValue({
        status: 'success',
        data: sigueListada ? [actual] : [],
      });
      const elPedido = pedido({
        recipeId: actual.id,
        recipeName: actual.displayName,
        recipeVersion: { originalId: RECETA.id, originalName: RECETA.name, versionName: actual.name },
      });
      renderFormulario(elPedido);

      expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(RECETA.id);
      expect(screen.getByRole('combobox', { name: 'Receta' })).toHaveValue(RECETA.name);
      await waitFor(() => expect(selectorDeVersion()).toHaveTextContent(nota));
      expect(selectorDeVersion()).toHaveTextContent(actual.name);
      expect(selectorDeVersion()).toBeEnabled();
      expect(getRecipeActionMock).toHaveBeenCalledWith(actual.id);

      await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

      await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));
      const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
      expect(enviado.get(RECIPE_FIELD)).toBe(RECETA.id);
      expect(enviado.get(RECIPE_VERSION_FIELD)).toBe(actual.id);
    },
  );
});
