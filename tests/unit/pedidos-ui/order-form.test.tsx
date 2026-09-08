// QC-35 T10 — El formulario de alta y edicion de pedido: R26, R27, R28, R29, R30, R33, R34 y R39.
//
// **El formulario se monta dentro de un `<Sheet>` abierto**, que es su unico entorno real: desde
// que el panel entero es un `<form>` (`SheetContent isForm`), sacarlo del panel no probaria el
// formulario que existe.
//
// **Lo que se afirma del envio es el `FormData`**, no el estado de React: el formulario es no
// controlado (R33) y lo unico que importa es que cada campo llegue a la operacion con el nombre y
// el valor que el adaptador driving lee. R39 se comprueba exactamente asi: `0.1005` tiene que
// llegar **como esa misma cadena**, y ninguna conversion a coma flotante la devolveria intacta.
//
// **Los tests en negativo (R26, R29, R30) son el nucleo de esta ficha**: que el alta no ofrezca
// estado, que la edicion no ofrezca `CANCELADO` y que no haya campo de fecha de solicitud es justo
// lo que una feature posterior puede reintroducir sin que ningun assert positivo se ponga rojo.
//
// **Ningun assert sobre copy** (R44): controles y regiones por `data-testid` o por rol ARIA.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_BUSINESS_FIELDS,
  ORDER_FORM_ERROR_TESTID,
  ORDER_FORM_TITLE_TESTID,
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
import type { RecipeListResult } from '@/lib/modules/recetas/adapters/driving/recipe-actions';

const { createOrderActionMock, updateOrderActionMock, prohibida, listRecipesActionMock } =
  vi.hoisted(() => {
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
}));

const RECETA = { id: crypto.randomUUID(), name: 'Esmalte azul', imageUrl: null };
/** Segunda receta, esta CON imagen: es la que prueba que el marcador se sustituye (2026-09-08). */
const RECETA_CON_IMAGEN = {
  id: crypto.randomUUID(),
  name: 'Barniz mate',
  imageUrl: 'https://ejemplo.test/barniz.png',
};
const RECETAS: RecipePickerPage = { items: [RECETA], totalPages: 1 };

/** Cuatro decimales a proposito: es una cadena que ninguna coma flotante devuelve intacta (R39).
 *  Desde el 2026-09-07 la cantidad es el UNICO decimal del pedido, asi que es ella la que lleva
 *  el valor dificil. */
const CANTIDAD = '0.1005';

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
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    updatedAt: new Date('2026-01-15T10:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

const onSaved = vi.fn();

function renderFormulario(order?: OrderSummary, recipes: RecipePickerPage = RECETAS) {
  return render(
    <Sheet open>
      <OrderForm order={order} recipes={recipes} onSaved={onSaved} />
    </Sheet>,
  );
}

/** Elige la receta, que es el unico campo que no se escribe a mano (la unidad se fue en 2026-09-07). */
async function elegirCatalogos(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByTestId(RECIPE_PICKER_TESTID));
  await user.click(await esperarInteractiva(await screen.findByTestId(`${RECIPE_PICKER_TESTID}-option`)));
}

/** El control de cantidad, tipado: sus asserts miran la CADENA del DOM, no `valueAsNumber`. */
function cantidad(): HTMLInputElement {
  return screen.getByTestId('order-field-quantity') as HTMLInputElement;
}

async function rellenarAlta(user: ReturnType<typeof setupUser>) {
  await elegirCatalogos(user);
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

  it('la cantidad escrita como «0.1005» llega a la operacion COMO ESA MISMA CADENA', async () => {
    // R39 — ni `Number`, ni `parseFloat`, ni `toFixed`, ni `type="number"`: el decimal es texto de
    // punta a punta y una conversion a coma flotante binaria no lo devolveria intacto.
    const user = setupUser();
    renderFormulario();

    await rellenarAlta(user);
    await user.click(screen.getByTestId(ORDER_FORM_SUBMIT_TESTID));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));

    const enviado = createOrderActionMock.mock.calls[0]?.[1] as FormData;
    expect(enviado.get('quantity')).toBe(CANTIDAD);
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

    await waitFor(() =>
      expect(screen.getByTestId(`${RECIPE_PICKER_TESTID}-error`)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(ORDER_FORM_ERROR_TESTID)).toBeNull();
    expect(screen.getByTestId(RECIPE_PICKER_TESTID)).toHaveAttribute('aria-invalid', 'true');
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
    // action, asi que el estado de fallo los devuelve por `defaultValue`.
    expect(cantidad().value).toBe('7.7777');
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
