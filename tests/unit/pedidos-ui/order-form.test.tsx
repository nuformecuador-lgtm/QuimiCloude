// QC-35 T10 — El formulario de alta y edicion de pedido: R26, R27, R28, R29, R30, R33, R34 y R39.
//
// **El formulario se monta dentro de un `<Sheet>` abierto**, que es su unico entorno real: desde
// que el panel entero es un `<form>` (`SheetContent isForm`), sacarlo del panel no probaria el
// formulario que existe.
//
// **Lo que se afirma del envio es el `FormData`**, no el estado de React: el formulario es no
// controlado (R33) y lo unico que importa es que cada campo llegue a la operacion con el nombre y
// el valor que el adaptador driving lee. R39 se comprueba exactamente asi, con la enmienda del
// 2026-09-09: al soltar el foco la cantidad se coloca a DOS decimales, y es ESE valor el que
// llega en el `FormData`; nada de aritmetica de coma flotante en el camino.
//
// **Los tests en negativo (R26, R29, R30) son el nucleo de esta ficha**: que el alta no ofrezca
// estado, que la edicion no ofrezca `CANCELADO` y que no haya campo de fecha de solicitud es justo
// lo que una feature posterior puede reintroducir sin que ningun assert positivo se ponga rojo.
//
// **Ningun assert sobre copy** (R44): controles y regiones por `data-testid` o por rol ARIA.

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
  ORDER_BUSINESS_FIELDS,
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
  ORDER_STATUS_LABELS,
  ORDER_STATUS_OPTION_TESTID,
  ORDER_STATUS_SELECT_TESTID,
  OrderForm,
  RECIPE_FIELD,
  RECIPE_PICKER_TESTID,
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
  EDITABLE_STATUS_VALUES,
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
} from '@/lib/modules/recetas/adapters/driving/recipe-actions';
import type { RecipeDetail } from '@/lib/modules/recetas';
import type { UnitView } from '@/lib/modules/unidades';

const {
  createOrderActionMock,
  updateOrderActionMock,
  prohibida,
  listRecipesActionMock,
  getRecipeActionMock,
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
    prohibida: noDebeInvocarse,
    listRecipesActionMock: vi.fn<(query: unknown) => Promise<RecipeListResult>>(),
    getRecipeActionMock: vi.fn<(id: string) => Promise<RecipeQueryResult>>(),
    listPresentationsActionMock: vi.fn<(query: unknown) => Promise<unknown>>(),
  };
});

// QC-102 T14 — El panel monta ahora la SECCION DE RESPONSABLES dentro de si mismo (R23), y esa
// seccion es un modulo de cliente que usa `useRouter` y las Server Actions de QC-87.
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
}));

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  listRecipesAction: listRecipesActionMock,
  getRecipeAction: getRecipeActionMock,
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: listPresentationsActionMock,
  createPresentationAction: vi.fn(prohibida('createPresentationAction')),
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
/** Segunda receta, esta CON imagen: es la que prueba que el marcador se sustituye (2026-09-08). */
const RECETA_CON_IMAGEN = {
  id: crypto.randomUUID(),
  name: 'Barniz mate',
  imageUrl: 'https://ejemplo.test/barniz.png',
};
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

/** Presentacion del catalogo, ofrecida por `listPresentationsAction` en el selector del panel. */
const PRESENTACION = { id: crypto.randomUUID(), name: 'Bidón 20L' };

/** Cuatro decimales a proposito: es una cadena que ninguna coma flotante devuelve intacta (R39).
 *  Desde el 2026-09-07 la cantidad es el UNICO decimal del pedido, asi que es ella la que lleva
 *  el valor dificil. */
const CANTIDAD = '0.1005';

/** Catalogo de unidades que resuelve la unidad de los ingredientes (R43). */
const UNIDADES: readonly UnitView[] = [
  { id: 'u-litro', name: 'Litro', symbol: 'L', baseUnitId: null, factor: null, isSystem: true },
];

/** Linea del detalle de la receta elegida, con los datos del producto ya unidos. */
const LINEA_INGREDIENTE = {
  id: 'linea-1',
  productId: crypto.randomUUID(),
  productName: 'Sosa cáustica',
  percentage: '10.00',
  productUnitId: 'u-litro',
  productStock: 40,
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
    quantity: CANTIDAD,
    priority: 'ALTA',
    status: 'EN_CURSO',
    cancellationReason: null,
    ingredientsCost: null,
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    presentationId: PRESENTACION.id,
    presentationName: PRESENTACION.name,
    ...overrides,
  };
}

const onSaved = vi.fn();

function renderFormulario(order?: OrderSummary, recipes: RecipePickerPage = RECETAS) {
  return render(
    <Sheet open>
      <OrderForm order={order} recipes={recipes} units={UNIDADES} onSaved={onSaved} />
    </Sheet>,
  );
}

/** Elige la receta, que es el unico campo que no se escribe a mano (la unidad se fue en 2026-09-07). */
async function elegirCatalogos(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)));
}

/** Elige la presentacion del catalogo que trae `listPresentationsAction`. */
async function elegirPresentacion(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId('presentation-select'));
  await user.click(await esperarInteractiva(await screen.findByTestId('presentation-option')));
}

/** El control de cantidad, tipado: sus asserts miran la CADENA del DOM, no `valueAsNumber`. */
function cantidad(): HTMLInputElement {
  return screen.getByTestId('order-field-quantity') as HTMLInputElement;
}

async function rellenarAlta(user: ReturnType<typeof setupUser>) {
  await elegirCatalogos(user);
  await elegirPresentacion(user);
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
  listPresentationsActionMock.mockResolvedValue({
    status: 'success',
    data: { items: [PRESENTACION], page: 1, pageSize: 25, total: 1, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
});

describe('formulario de alta de pedido (R26, R27, R30, R33, R39)', () => {
  it('captura los TRES campos de negocio y los envia a la operacion de alta', async () => {
    // R26, R33 — el `FormData` lleva exactamente los nombres que el adaptador driving lee. Eran
    // cinco hasta el 2026-09-07, cuando la unidad y el precio unitario salieron del pedido; la
    // lista sigue derivandose de `ORDER_BUSINESS_FIELDS`, no de literales sueltos.
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
    // Y lo que ya no existe NO viaja: ni unidad ni precio, aunque el backend los ignorase.
    expect(enviado.get('unitId')).toBeNull();
    expect(enviado.get('unitPrice')).toBeNull();
    expect(updateOrderActionMock).not.toHaveBeenCalled();
  });

  it('al salir del campo, la cantidad se coloca a DOS decimales y sin ceros finales', async () => {
    // Decision humana del 2026-09-09 (enmienda a R39): al soltar el foco el valor se coloca a dos
    // decimales y se afeitan los ceros finales. «25.00» y «25.0» se muestran como «25»; «25.3» y
    // «25.08» conservan sus decimales. El valor colocado es el que queda en el campo y el que
    // viaja al enviar: al pinchar Guardar, el campo pierde el foco ANTES del submit.
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

  it('captura la cantidad con el control NUMERICO del navegador, con paso libre', () => {
    // Enmienda humana del 2026-09-08 a R39: el control es numerico. Lo que R39 protege sigue
    // comprobado por el test de arriba, que afirma que `0.1005` llega intacta al `FormData`.
    // `step="any"` es imprescindible: con el paso entero por defecto un decimal seria invalido.
    renderFormulario();

    const control = screen.getByTestId('order-field-quantity');
    expect(control).toHaveAttribute('type', 'number');
    expect(control).toHaveAttribute('step', 'any');
    expect(control).toHaveAttribute('inputmode', 'decimal');

    // Y el campo de precio unitario NO existe: se fue con la columna (2026-09-07).
    expect(screen.queryByTestId('order-field-unitPrice')).toBeNull();
  });

  it('presenta la prioridad por defecto del contrato PRESELECCIONADA y visible', async () => {
    // R27 — «no implicita»: el campo emite siempre un valor valido, porque para el adaptador
    // driving una prioridad VACIA es error y no ausencia.
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('priority')).toBe(DEFAULT_ORDER_PRIORITY);
  });

  it('ofrece las CUATRO prioridades que publica el contrato', async () => {
    // R27 — el conjunto se deriva de `ORDER_PRIORITY_VALUES`, no se escribe a mano.
    const user = setupUser();
    renderFormulario();

    await user.click(screen.getByTestId(ORDER_PRIORITY_SELECT_TESTID));

    const opciones = await screen.findAllByTestId(ORDER_PRIORITY_OPTION_TESTID);
    expect(opciones.map((o) => o.getAttribute('data-value'))).toEqual([...ORDER_PRIORITY_VALUES]);
  });

  it('el alta NO ofrece selector de estado', async () => {
    // R26, R29 en negativo — el alta nace `PENDIENTE` y lo pone el caso de uso.
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
    // R26, R30 en negativo — la fecha la pone el sistema y solo se muestra y ordena.
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

describe('la presentación del pedido (R16, R17, R18, R19)', () => {
  it('R16: el alta ofrece el campo Presentación obligatorio', () => {
    renderFormulario();

    const campo = screen.getByTestId('presentation-select');
    expect(campo).toBeInTheDocument();
    expect(screen.getByTestId('presentation-value')).toBeRequired();
  });

  it('R17: el selector de presentación no ofrece crear', () => {
    renderFormulario();

    expect(screen.queryByTestId('presentation-create-open')).toBeNull();
  });

  it('R18: la edición precarga la presentación; sin presentación el campo arranca vacío y no guarda', async () => {
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    expect(screen.getByTestId('presentation-value')).toHaveValue(elPedido.presentationId);

    cleanup();
    const sinPresentacion = pedido({ presentationId: null, presentationName: null });
    renderFormulario(sinPresentacion);

    const campo = screen.getByTestId('presentation-value') as HTMLInputElement;
    expect(campo).toHaveValue('');
    // El campo espejo conserva la validacion nativa de `required` (mismo primitivo que el
    // selector de producto): el navegador bloquea el envio antes de que la action se invoque.
    expect(campo.validity.valid).toBe(false);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    expect(updateOrderActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('R19: presentation_not_found se pinta junto al campo y conserva lo escrito', async () => {
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'presentation_not_found',
      message: 'La presentación no existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => {
      expect(screen.getByTestId('presentation-select-error')).toBeInTheDocument();
      expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
    });
    expect(cantidad().value).toBe(CANTIDAD);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('formulario de edicion de pedido (R28, R29, R34)', () => {
  it('precarga los valores actuales y envia el REEMPLAZO COMPLETO mas el estado', async () => {
    // R28 — no hay envio por campos sueltos: se manda todo el conjunto de negocio y el estado.
    const user = setupUser();
    const elPedido = pedido();
    renderFormulario(elPedido);

    expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-value`)).toHaveValue(elPedido.recipeId);
    // El valor del control se lee como CADENA a proposito: `toHaveValue` sobre un control
    // numerico devuelve `valueAsNumber`, que es justo la conversion que R39 no admite como
    // prueba. Lo que importa es que el DOM siga guardando la cadena tal cual.
    expect(cantidad().value).toBe(elPedido.quantity);

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(updateOrderActionMock).toHaveBeenCalledTimes(1));

    // `bind(null, id)`: el id es el PRIMER argumento de la action, no un campo del formulario.
    expect(updateOrderActionMock.mock.calls[0]?.[0]).toBe(elPedido.id);
    const enviado = updateOrderActionMock.mock.calls[0]?.[2] as FormData;
    for (const campo of [...ORDER_BUSINESS_FIELDS, ORDER_STATUS_FIELD]) {
      expect(enviado.get(campo), `falta el campo «${campo}»`).not.toBeNull();
    }
    expect(enviado.get(RECIPE_FIELD)).toBe(elPedido.recipeId);
    expect(enviado.get('priority')).toBe(elPedido.priority);
    expect(enviado.get(ORDER_STATUS_FIELD)).toBe(elPedido.status);
    expect(createOrderActionMock).not.toHaveBeenCalled();
  });

  it('el selector de estado ofrece los editables del contrato y NUNCA «CANCELADO»', async () => {
    // R29 — `EDITABLE_STATUS_VALUES` excluye `CANCELADO` por construccion. El unico camino a
    // cancelado es `cancelOrderAction`, y el doble de esa action falla si se le llama.
    const user = setupUser();
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_STATUS_SELECT_TESTID));

    const opciones = await screen.findAllByTestId(ORDER_STATUS_OPTION_TESTID);
    const valores = opciones.map((o) => o.getAttribute('data-value'));
    expect(valores).toEqual([...EDITABLE_STATUS_VALUES]);
    expect(valores).not.toContain('CANCELADO');
    expect(opciones.map((o) => o.textContent)).not.toContain(ORDER_STATUS_LABELS.CANCELADO);
  });

  it('«recipe_not_found» se pinta junto al SELECTOR DE RECETA, no en la region del formulario', async () => {
    // R34 — se decide por el `code` estable, nunca por el texto del mensaje.
    const user = setupUser();
    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'recipe_not_found',
      message: 'La receta no existe.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    // Las tres condiciones del DOM, en la misma espera (QC-58, T11): el mensaje, la ausencia de
    // aviso de formulario y el `aria-invalid` cambian en la misma interaccion pero no tienen por
    // que caer en el mismo commit.
    await waitFor(() => {
      expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-error`)).toBeInTheDocument();
      expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
      expect(screen.getByTestId(RECIPE_PICKER_TESTID)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('«invalid_transition» va al selector de estado', async () => {
    // R34 — el resto de la tabla de `design.md > 8`, tambien por codigo.
    //
    // QC-35bis (2026-09-07): este caso comprobaba TAMBIEN que «unit_not_found» iba al selector de
    // unidad. Ese codigo ya no lo emite nadie -la unidad salio del pedido, y con ella
    // `UnitNotFoundError`-, asi que la mitad que sobrevive es la de la transicion.
    const user = setupUser();

    updateOrderActionMock.mockResolvedValue({
      status: 'error',
      code: 'invalid_transition',
      message: 'Transición no permitida.',
    });
    renderFormulario(pedido());

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() =>
      expect(screen.getByTestId(`order-error-${ORDER_STATUS_FIELD}`)).toBeInTheDocument(),
    );
    // El aviso va al CAMPO, no a la region general del formulario.
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('un codigo que no senala campo va a la region de aviso del formulario y no pierde lo escrito', async () => {
    // R34 — `duplicate_number`, `not_found` y `unauthorized` no identifican campo. Y un rechazo
    // NO cierra el panel ni vacia el formulario.
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
    // Lo escrito sigue ahi (R34): React 19 resetea los campos no controlados al completarse la
    // action, asi que el estado de fallo los devuelve por `defaultValue`. Al pinchar Guardar el
    // campo perdió el foco antes del submit, asi que el valor devuelto es el COLOCADO a dos
    // decimales (enmienda del 2026-09-09 a R39).
    expect(cantidad().value).toBe('7.78');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('una cantidad que el ESQUEMA del contrato rechaza no llega a la operacion', async () => {
    // R33 — la validacion previa usa el mismo esquema que valida el servidor: no hay segunda copia
    // de la regla «la cantidad es mayor que cero».
    const user = setupUser();
    renderFormulario(pedido({ quantity: '0' }));

    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(screen.getByTestId('order-error-quantity')).toBeInTheDocument());
    expect(updateOrderActionMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('valida con los esquemas del contrato y sin ninguna libreria de formularios', () => {
    // R33 — guardia de FUENTE: los esquemas salen del barrel de `pedidos` (client-safe) y las
    // actions, de su ruta exacta. (Los paquetes descartados no se nombran aqui a proposito.)
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
  // Decision humana, sin requisito EARS detras: el titulo pasa a ser `<receta> × <cantidad>` y el
  // panel reserva un hueco para la imagen de la receta. Se afirma sobre DATOS -el nombre de la
  // receta y la cantidad tecleada-, no sobre copy (R44).

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
  // Decision humana: «crema 1» no puede guardarse con el campo diciendo «crema 1a». Guardar solo
  // se habilita con una receta ELEGIDA de la lista; editar el campo retira la eleccion, deja el id
  // oculto vacio y vuelve a deshabilitar Guardar. Se afirma sobre el atributo del boton y sobre el
  // `input` oculto del selector (R44; sin asserts de copy).

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
    // La unidad es la del PRODUCTO (`productUnitId`) y se resuelve con el catalogo bajado por
    // props.
    expect(within(tabla).getByTestId('order-ingredient-unit')).toHaveTextContent('L');
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent(
      String(LINEA_INGREDIENTE.productStock),
    );
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

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const requerida = within(tabla).getByTestId('order-ingredient-required');
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    expect(requerida).toHaveTextContent('0');
    expect(restante).toHaveTextContent('40');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    // 0.1005 × 10,00 % = 0.01005 y 40 − 0.01005 = 39.98995. Se CALCULAN exactos y se PINTAN a dos
    // decimales: «0.01» y «39.99». El valor exacto no se pierde, viaja en el `title`.
    await waitFor(() => expect(requerida.textContent).toBe('0.01'));
    expect(requerida).toHaveAttribute('title', '0.01005');
    expect(restante.textContent).toBe('39.99');
    expect(restante).toHaveAttribute('title', '39.98995');
    expect(restante.firstChild).not.toHaveClass('text-destructive');
  });

  it('un restante negativo se resalta en rojo', async () => {
    // El pedido pide mas de lo que hay, el restante baja de cero y la celda se pinta con
    // `text-destructive` sobre fondo suave.
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: 0.005 }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    // Sin cantidad escrita, el restante coincide con el stock, redondeado a dos decimales.
    expect(restante).toHaveTextContent('0.01');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    // 0.005 − 0.01005 = −0.00505, resaltado. A dos decimales eso se pinta «-0.01», y el `title`
    // lleva la cifra exacta. El resalte (`isShort`) mira el exacto, no el pintado.
    await waitFor(() => expect(restante.textContent).toBe('-0.01'));
    expect(restante).toHaveAttribute('title', '-0.00505');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('R12 — con existencia en la unidad de la linea, el restante resta normal', async () => {
    const user = setupUser();
    getRecipeActionMock.mockResolvedValue({
      status: 'success',
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: 40 }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);

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
      data: recetaDetalle({ lines: [{ ...LINEA_INGREDIENTE, productStock: 0 }] }),
    });
    renderFormulario();

    await elegirCatalogos(user);

    const tabla = await screen.findByTestId(ORDER_INGREDIENTS_TABLE_TESTID);
    expect(within(tabla).getByTestId('order-ingredient-stock')).toHaveTextContent('0');

    await user.type(screen.getByTestId('order-field-quantity'), CANTIDAD);

    const restante = within(tabla).getByTestId('order-ingredient-remaining');
    // 0 − 0.01005 = −0.01005: sin ningun lote el pedido siempre pide mas de lo que hay. Se
    // CALCULA exacto y se PINTA a dos decimales, «-0.01».
    // El resalte de faltante (`isShort`) se decide con el restante EXACTO, nunca con el pintado.
    // En telefono o impreso no hay `title`, y alli el color es el unico aviso; se acepta a
    // sabiendas.
    await waitFor(() => expect(restante.textContent).toBe('-0.01'));
    expect(restante).toHaveAttribute('title', '-0.01005');
    expect(restante.firstElementChild).toHaveClass('text-destructive');
  });

  it('si el detalle falla, la tabla se sustituye por el estado de error de los ingredientes', async () => {
    const user = setupUser();
    // QC-70 R17 — el codigo es `recipe_not_found`, no el `not_found` generico que la ficha
    // retiro: `getRecipeAction` declara su `code` como `ErrorCode`, la union CERRADA del
    // catalogo, asi que el codigo viejo ni siquiera compila. Es el mismo que compara
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
 * QC-71 T9 — R17 y R18 en el formulario de pedido.
 *
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
