// El sheet de entrega con las Server Actions dobladas: lectura, avisos, envio, rechazos y borrador.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ORDER_ACTION_DELIVER_TESTID,
  ORDER_DELIVERY_BATCH_EXCEEDS_TESTID,
  ORDER_DELIVERY_BATCH_PACKAGES_TESTID,
  ORDER_DELIVERY_BATCH_TESTID,
  ORDER_DELIVERY_CANCEL_TESTID,
  ORDER_DELIVERY_CUSTOMER_ERROR_TESTID,
  ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID,
  ORDER_DELIVERY_EMPTY_ERROR_TESTID,
  ORDER_DELIVERY_ERROR_TESTID,
  ORDER_DELIVERY_LINE_COMPLETE_TESTID,
  ORDER_DELIVERY_LINE_EXCEEDS_TESTID,
  ORDER_DELIVERY_LINE_TESTID,
  ORDER_DELIVERY_REJECTED_TESTID,
  ORDER_DELIVERY_SHEET_TESTID,
  ORDER_DELIVERY_SKELETON_TESTID,
  ORDER_DELIVERY_SUBMIT_TESTID,
  ORDER_DELIVERY_WHOLE_ERROR_TESTID,
  OrderDeliverySheet,
  OrderRowSheetActions,
  orderDeliveryDraftKey,
  packagesKey,
} from '@/app/(private)/pedidos/components';
import {
  formatOrderNumber,
  type OrderDeliveryView,
  type OrderSummary,
} from '@/lib/modules/pedidos';
import type {
  DeliverOrderActionResult,
  OrderCustomerOptionsResult,
  OrderDeliveryResult,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

import {
  COMPLETE_LINE_ID,
  DELIVERY_ERROR_STATES,
  DELIVERY_KEY,
  DELIVERY_ORDER_ID,
  DELIVER_RESULTS,
  NEWER_BATCH_ID,
  OLDER_BATCH_ID,
  PENDING_LINE_ID,
  deliverInput,
  deliveryView,
} from '../../fixtures/order-delivery';
import { setupUser } from '../../helpers/user-event';

const { getDeliveryMock, deliverMock, searchCustomersMock, routerMock } = vi.hoisted(() => ({
  getDeliveryMock: vi.fn<(orderId: string) => Promise<OrderDeliveryResult>>(),
  deliverMock: vi.fn<(input: unknown) => Promise<DeliverOrderActionResult>>(),
  searchCustomersMock: vi.fn<(query: unknown, purpose: string) => Promise<OrderCustomerOptionsResult>>(),
  routerMock: {
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
    refresh: vi.fn<() => void>(),
    back: vi.fn<() => void>(),
    forward: vi.fn<() => void>(),
    prefetch: vi.fn<(href: string) => void>(),
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => routerMock,
}));

vi.mock('@/lib/modules/pedidos/adapters/driving/order-actions', () => {
  const noDebeInvocarse = (nombre: string) => () => {
    throw new Error(`${nombre} no debe invocarse desde el sheet de entrega`);
  };
  return {
    getOrderDeliveryAction: getDeliveryMock,
    deliverOrderAction: deliverMock,
    searchOrderCustomersAction: searchCustomersMock,
    setOrderCustomerAction: vi.fn(noDebeInvocarse('setOrderCustomerAction')),
    getOrderCustomerFilterOptionAction: vi.fn(noDebeInvocarse('getOrderCustomerFilterOptionAction')),
    updateOrderDistributionAction: vi.fn(noDebeInvocarse('updateOrderDistributionAction')),
    quoteOrderPresentationAvailabilityAction: vi.fn(noDebeInvocarse('quoteOrderPresentationAvailabilityAction')),
    listOrdersAction: vi.fn(noDebeInvocarse('listOrdersAction')),
    getOrderAction: vi.fn(noDebeInvocarse('getOrderAction')),
    createOrderAction: vi.fn(noDebeInvocarse('createOrderAction')),
    updateOrderAction: vi.fn(noDebeInvocarse('updateOrderAction')),
    cancelOrderAction: vi.fn(noDebeInvocarse('cancelOrderAction')),
    deleteOrderAction: vi.fn(noDebeInvocarse('deleteOrderAction')),
  };
});

vi.mock('@/lib/modules/recetas/adapters/driving/recipe-actions', () => ({
  getRecipeAction: vi.fn(async () => ({ status: 'error', code: 'recipe_not_found', message: 'sin receta' })),
  listRecipesAction: vi.fn(() => {
    throw new Error('listRecipesAction no debe invocarse desde este archivo');
  }),
}));

vi.mock('@/lib/modules/inventario/adapters/driving/presentation-actions', () => ({
  listPresentationsAction: vi.fn(() => {
    throw new Error('listPresentationsAction no debe invocarse desde este archivo');
  }),
  createPresentationAction: vi.fn(() => {
    throw new Error('createPresentationAction no debe invocarse desde este archivo');
  }),
}));

const ORDER = { id: DELIVERY_ORDER_ID, numberText: '2026-0000007' } as const;
const OTHER_CUSTOMER = { id: 'c0000000-0000-4000-8000-00000000000b', name: 'Luis Gil', isDeleted: false };
const DRAFT_KEY = orderDeliveryDraftKey(DELIVERY_ORDER_ID);

const cerrar = vi.fn<(open: boolean) => void>();

function ok(view: OrderDeliveryView = deliveryView()): OrderDeliveryResult {
  return { status: 'success', data: view };
}

/** La vista sin el lote mas nuevo: lo que el servidor devuelve si otro se lo llevo entero. */
function viewWithoutNewerBatch(): OrderDeliveryView {
  const base = deliveryView();
  return {
    ...base,
    lines: base.lines.map((line) =>
      line.presentationLineId === PENDING_LINE_ID
        ? { ...line, batches: line.batches.filter((batch) => batch.batchId !== NEWER_BATCH_ID) }
        : line,
    ),
  };
}

function montar() {
  render(<OrderDeliverySheet order={ORDER} open onOpenChange={cerrar} />);
}

/** Monta el sheet como lo monta la fila: solo mientras esta abierto, con un boton para reabrir. */
function ConReapertura() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="reabrir">
        reabrir
      </button>
      {open ? <OrderDeliverySheet order={ORDER} open onOpenChange={setOpen} /> : null}
    </>
  );
}

async function lote(batchId: string): Promise<HTMLElement> {
  const filas = await screen.findAllByTestId(ORDER_DELIVERY_BATCH_TESTID);
  const fila = filas.find((row) => row.getAttribute('data-batch-id') === batchId);
  if (fila === undefined) throw new Error(`no hay fila para el lote ${batchId}`);
  return fila;
}

async function campo(batchId: string): Promise<HTMLInputElement> {
  return within(await lote(batchId)).getByTestId(ORDER_DELIVERY_BATCH_PACKAGES_TESTID) as HTMLInputElement;
}

async function linea(lineId: string): Promise<HTMLElement> {
  const lineas = await screen.findAllByTestId(ORDER_DELIVERY_LINE_TESTID);
  const encontrada = lineas.find((row) => row.getAttribute('data-presentation-line-id') === lineId);
  if (encontrada === undefined) throw new Error(`no hay linea ${lineId}`);
  return encontrada;
}

function borradorGuardado(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(DELIVERY_KEY);
  getDeliveryMock.mockResolvedValue(ok());
  deliverMock.mockResolvedValue({ status: 'success', data: DELIVER_RESULTS.partial });
  searchCustomersMock.mockResolvedValue({
    status: 'success',
    data: { items: [OTHER_CUSTOMER], total: 1, page: 1, pageSize: 10, totalPages: 1 },
  });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
});

describe('lectura', () => {
  it('mientras lee muestra el esqueleto y pide la entrega del pedido', async () => {
    let resolver: (value: OrderDeliveryResult) => void = () => undefined;
    getDeliveryMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)));
    montar();

    expect(screen.getByTestId(ORDER_DELIVERY_SKELETON_TESTID)).toBeInTheDocument();
    expect(getDeliveryMock).toHaveBeenCalledWith(DELIVERY_ORDER_ID);
    resolver(ok());
    expect(await screen.findAllByTestId(ORDER_DELIVERY_LINE_TESTID)).toHaveLength(2);
    expect(screen.queryByTestId(ORDER_DELIVERY_SKELETON_TESTID)).toBeNull();
  });

  it('si la lectura falla muestra el mensaje del catalogo y ningun campo', async () => {
    getDeliveryMock.mockResolvedValue(DELIVERY_ERROR_STATES.actionNotAllowed);
    montar();

    const error = await screen.findByTestId(ORDER_DELIVERY_ERROR_TESTID);
    expect(error).toHaveAttribute('data-code', 'action_not_allowed');
    expect(error).toHaveTextContent(DELIVERY_ERROR_STATES.actionNotAllowed.message);
    expect(screen.queryByTestId(ORDER_DELIVERY_SUBMIT_TESTID)).toBeNull();
  });

  it('R6: cada presentacion muestra su nombre, pedidos, entregados y faltan, sin listado de entregas', async () => {
    montar();

    const pendiente = await linea(PENDING_LINE_ID);
    expect(pendiente).toHaveTextContent('Botella 1 L');
    expect(pendiente).toHaveTextContent('Pedidos 10 · Entregados 3 · Faltan 7');
    const completa = await linea(COMPLETE_LINE_ID);
    expect(completa).toHaveTextContent('Galon 4 L');
    expect(completa).toHaveTextContent('Pedidos 4 · Entregados 4 · Faltan 0');
    expect(screen.getByTestId(ORDER_DELIVERY_SHEET_TESTID).querySelectorAll('[data-delivery-id]')).toHaveLength(0);
  });

  it('R8: la presentacion completa sale como «Completa» y sin ningun campo de envases', async () => {
    montar();

    const completa = await linea(COMPLETE_LINE_ID);
    expect(within(completa).getByTestId(ORDER_DELIVERY_LINE_COMPLETE_TESTID)).toBeInTheDocument();
    expect(within(completa).queryAllByTestId(ORDER_DELIVERY_BATCH_PACKAGES_TESTID)).toHaveLength(0);
    expect(within(completa).queryAllByRole('textbox')).toHaveLength(0);
    const pendiente = await linea(PENDING_LINE_ID);
    expect(within(pendiente).queryByTestId(ORDER_DELIVERY_LINE_COMPLETE_TESTID)).toBeNull();
  });

  it('R7: lista los lotes de la fixture con codigo, envases disponibles, entrada y vencimiento si existe', async () => {
    montar();

    const filas = await screen.findAllByTestId(ORDER_DELIVERY_BATCH_TESTID);
    expect(filas.map((row) => row.getAttribute('data-batch-id'))).toEqual([OLDER_BATCH_ID, NEWER_BATCH_ID]);
    const viejo = await lote(OLDER_BATCH_ID);
    expect(viejo).toHaveTextContent('L-2026-0001');
    expect(viejo).toHaveTextContent('4');
    expect(viejo).toHaveTextContent('2026-09-30');
    expect(viejo).toHaveTextContent('2027-09-30');
    const nuevo = await lote(NEWER_BATCH_ID);
    expect(nuevo).toHaveTextContent('L-2026-0002');
    expect(nuevo).toHaveTextContent('6');
    expect(nuevo).toHaveTextContent('2026-10-05');
    expect(within(nuevo).queryByText('Vence')).toBeNull();
    expect(await campo(OLDER_BATCH_ID)).toHaveAttribute('inputmode', 'numeric');
  });

  it('R9: sin borrador, el cliente viene precargado con el del pedido', async () => {
    montar();
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveValue('Ana Perez');
  });

  it('R9: sin cliente en el pedido, el campo queda vacio', async () => {
    getDeliveryMock.mockResolvedValue(ok(deliveryView({ customer: null })));
    montar();
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveValue('');
  });

  it('R9: con el cliente del pedido dado de baja, el campo queda vacio', async () => {
    getDeliveryMock.mockResolvedValue(
      ok(deliveryView({ customer: { id: OTHER_CUSTOMER.id, name: 'Luis Gil', isDeleted: true } })),
    );
    montar();
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveValue('');
  });

  it('el selector de cliente se monta con purpose="deliver"', async () => {
    const user = setupUser();
    getDeliveryMock.mockResolvedValue(ok(deliveryView({ customer: null })));
    montar();

    const combo = await screen.findByRole('combobox', { name: 'Cliente' });
    await user.click(combo);
    await user.type(combo, 'Lu');

    await waitFor(() => expect(searchCustomersMock).toHaveBeenCalled());
    for (const call of searchCustomersMock.mock.calls) {
      expect(call[1]).toBe('deliver');
    }
  });
});

describe('validacion en el sheet', () => {
  it('R11: si la suma de una presentacion supera lo que falta, avisa en la presentacion y no envia', async () => {
    const user = setupUser();
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '4');
    await user.type(await campo(NEWER_BATCH_ID), '4');

    const pendiente = await linea(PENDING_LINE_ID);
    expect(within(pendiente).getByTestId(ORDER_DELIVERY_LINE_EXCEEDS_TESTID)).toBeInTheDocument();
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('R12: si un lote supera sus envases disponibles, avisa en el lote y no envia', async () => {
    const user = setupUser();
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '5');

    expect(within(await lote(OLDER_BATCH_ID)).getByTestId(ORDER_DELIVERY_BATCH_EXCEEDS_TESTID)).toBeInTheDocument();
    expect(within(await lote(NEWER_BATCH_ID)).queryByTestId(ORDER_DELIVERY_BATCH_EXCEEDS_TESTID)).toBeNull();
    expect(screen.queryByTestId(ORDER_DELIVERY_LINE_EXCEEDS_TESTID)).toBeNull();
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it.each(['2.5', '-1', '2,5', 'dos'])('R13: «%s» no es un entero no negativo: avisa en el campo y no envia', async (texto) => {
    const user = setupUser();
    montar();

    const input = await campo(OLDER_BATCH_ID);
    await user.type(input, texto);

    expect(within(await lote(OLDER_BATCH_ID)).getByTestId(ORDER_DELIVERY_WHOLE_ERROR_TESTID)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('R14: confirmar sin cliente avisa de que es obligatorio y no envia', async () => {
    const user = setupUser();
    getDeliveryMock.mockResolvedValue(ok(deliveryView({ customer: null })));
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '2');
    expect(screen.queryByTestId(ORDER_DELIVERY_CUSTOMER_ERROR_TESTID)).toBeNull();
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    expect(await screen.findByTestId(ORDER_DELIVERY_CUSTOMER_ERROR_TESTID)).toBeInTheDocument();
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('R15: confirmar con todos los campos vacios avisa de que no hay nada que entregar y no envia', async () => {
    const user = setupUser();
    montar();

    await screen.findAllByTestId(ORDER_DELIVERY_BATCH_TESTID);
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    expect(await screen.findByTestId(ORDER_DELIVERY_EMPTY_ERROR_TESTID)).toBeInTheDocument();
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('R15: confirmar con todos los campos en cero tambien avisa y no envia', async () => {
    const user = setupUser();
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '0');
    await user.type(await campo(NEWER_BATCH_ID), '0');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    expect(await screen.findByTestId(ORDER_DELIVERY_EMPTY_ERROR_TESTID)).toBeInTheDocument();
    expect(deliverMock).not.toHaveBeenCalled();
  });
});

describe('despues de enviar', () => {
  it('envia la entrega con la clave del borrador, el cliente y los envases por lote', async () => {
    const user = setupUser();
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '4');
    await user.type(await campo(NEWER_BATCH_ID), '2');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    await waitFor(() => expect(deliverMock).toHaveBeenCalledTimes(1));
    expect(deliverMock).toHaveBeenCalledWith(deliverInput());
  });

  it.each([
    ['delivered con el pedido aun TERMINADO', DELIVER_RESULTS.partial, 'Entrega registrada'],
    ['delivered que deja el pedido ENTREGADO', DELIVER_RESULTS.completed, 'Pedido entregado'],
    ['already_registered', DELIVER_RESULTS.alreadyRegistered, 'Pedido entregado'],
  ] as const)('R33: tras %s borra el borrador, cierra, avisa y refresca', async (_caso, data, mensaje) => {
    const user = setupUser();
    const exito = vi.spyOn(toast, 'success');
    deliverMock.mockResolvedValue({ status: 'success', data });
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '2');
    expect(borradorGuardado()).not.toBeNull();
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(false));
    expect(borradorGuardado()).toBeNull();
    expect(exito).toHaveBeenCalledWith(mensaje);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['delivery_exceeds_remaining', DELIVERY_ERROR_STATES.exceedsRemaining],
    ['delivery_batch_insufficient', DELIVERY_ERROR_STATES.batchInsufficient],
  ] as const)('R34: tras %s sigue abierto, muestra el mensaje, relee y conserva el borrador', async (code, error) => {
    const user = setupUser();
    deliverMock.mockResolvedValue(error);
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '3');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    const aviso = await screen.findByTestId(ORDER_DELIVERY_REJECTED_TESTID);
    expect(aviso).toHaveAttribute('data-code', code);
    expect(aviso).toHaveTextContent(error.message);
    await waitFor(() => expect(getDeliveryMock).toHaveBeenCalledTimes(2));
    expect(cerrar).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(await campo(OLDER_BATCH_ID)).toHaveValue('3');
    expect(borradorGuardado()).toMatchObject({
      deliveryKey: DELIVERY_KEY,
      packages: { [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '3' },
    });
  });

  it('R34, R37: si al releer un lote ya no se ofrece, descarta sus envases, avisa y conserva el resto', async () => {
    const user = setupUser();
    deliverMock.mockResolvedValue(DELIVERY_ERROR_STATES.batchInsufficient);
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '1');
    await user.type(await campo(NEWER_BATCH_ID), '2');
    getDeliveryMock.mockResolvedValue(ok(viewWithoutNewerBatch()));
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    expect(await screen.findByTestId(ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID)).toBeInTheDocument();
    expect(screen.getAllByTestId(ORDER_DELIVERY_BATCH_TESTID)).toHaveLength(1);
    expect(await campo(OLDER_BATCH_ID)).toHaveValue('1');
    expect(borradorGuardado()).toMatchObject({
      packages: { [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '1' },
    });
  });

  it('cualquier otro error se muestra y el sheet sigue abierto con el borrador', async () => {
    const user = setupUser();
    deliverMock.mockResolvedValue(DELIVERY_ERROR_STATES.customerNotFound);
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '2');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));

    const error = await screen.findByTestId(ORDER_DELIVERY_ERROR_TESTID);
    expect(error).toHaveAttribute('data-code', 'customer_not_found');
    expect(getDeliveryMock).toHaveBeenCalledTimes(1);
    expect(cerrar).not.toHaveBeenCalled();
    expect(borradorGuardado()).not.toBeNull();
  });
});

describe('borrador', () => {
  it.each([
    ['la X', async (user: ReturnType<typeof setupUser>) => user.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', async (user: ReturnType<typeof setupUser>) => user.keyboard('{Escape}')],
  ] as const)('R35: cerrar con %s conserva el borrador y al reabrir lo restaura con su clave', async (_via, closeWith) => {
    const user = setupUser();
    render(<ConReapertura />);

    await user.type(await campo(OLDER_BATCH_ID), '4');
    await user.type(await campo(NEWER_BATCH_ID), '2');
    await closeWith(user);
    await waitFor(() => expect(screen.queryByTestId(ORDER_DELIVERY_SHEET_TESTID)).toBeNull());
    expect(borradorGuardado()).toMatchObject({ deliveryKey: DELIVERY_KEY });

    vi.mocked(crypto.randomUUID).mockReturnValue('b0000000-0000-4000-8000-0000000000ff');
    await user.click(screen.getByTestId('reabrir'));

    expect(await campo(OLDER_BATCH_ID)).toHaveValue('4');
    expect(await campo(NEWER_BATCH_ID)).toHaveValue('2');
    await user.click(screen.getByTestId(ORDER_DELIVERY_SUBMIT_TESTID));
    await waitFor(() => expect(deliverMock).toHaveBeenCalledTimes(1));
    expect(deliverMock).toHaveBeenCalledWith(deliverInput({ deliveryKey: DELIVERY_KEY }));
  });

  it('R35: restaura el cliente guardado en el borrador en vez del del pedido', async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        orderId: DELIVERY_ORDER_ID,
        deliveryKey: DELIVERY_KEY,
        customer: OTHER_CUSTOMER,
        packages: { [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '2' },
      }),
    );
    montar();

    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveValue('Luis Gil');
    expect(await campo(OLDER_BATCH_ID)).toHaveValue('2');
  });

  it('R36: «Cancelar» borra el borrador y cierra', async () => {
    const user = setupUser();
    montar();

    await user.type(await campo(OLDER_BATCH_ID), '2');
    expect(borradorGuardado()).not.toBeNull();
    await user.click(screen.getByTestId(ORDER_DELIVERY_CANCEL_TESTID));

    expect(borradorGuardado()).toBeNull();
    expect(cerrar).toHaveBeenCalledWith(false);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('R37: al restaurar descarta los lotes que ya no se ofrecen, avisa y aplica R11 y R12 a lo restaurado', async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        orderId: DELIVERY_ORDER_ID,
        deliveryKey: DELIVERY_KEY,
        customer: null,
        packages: {
          [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '5',
          [packagesKey(PENDING_LINE_ID, 'e0000000-0000-4000-8000-000000000099')]: '3',
        },
      }),
    );
    montar();

    expect(await screen.findByTestId(ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID)).toBeInTheDocument();
    expect(await campo(OLDER_BATCH_ID)).toHaveValue('5');
    expect(within(await lote(OLDER_BATCH_ID)).getByTestId(ORDER_DELIVERY_BATCH_EXCEEDS_TESTID)).toBeInTheDocument();
    expect(borradorGuardado()).toMatchObject({
      packages: { [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '5' },
    });
  });

  it('R37: un borrador restaurado que supera lo que falta muestra el aviso de la presentacion', async () => {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        v: 1,
        orderId: DELIVERY_ORDER_ID,
        deliveryKey: DELIVERY_KEY,
        customer: null,
        packages: {
          [packagesKey(PENDING_LINE_ID, OLDER_BATCH_ID)]: '4',
          [packagesKey(PENDING_LINE_ID, NEWER_BATCH_ID)]: '6',
        },
      }),
    );
    montar();

    const pendiente = await linea(PENDING_LINE_ID);
    expect(await within(pendiente).findByTestId(ORDER_DELIVERY_LINE_EXCEEDS_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(ORDER_DELIVERY_DRAFT_ADJUSTED_TESTID)).toBeNull();
  });
});

describe('montaje desde la fila', () => {
  function pedidoTerminado(): OrderSummary {
    return {
      id: DELIVERY_ORDER_ID,
      number: { year: 2026, sequence: 7 },
      numberText: formatOrderNumber({ year: 2026, sequence: 7 }),
      recipeId: '22222222-2222-4222-8222-222222222222',
      recipeName: 'Esmalte azul',
      recipeVersion: null,
      quantity: '100.0000',
      priority: 'MEDIA',
      status: 'TERMINADO',
      cancellationReason: null,
      ingredientsCost: null,
      createdAt: new Date('2026-01-15T10:00:00.000Z'),
      updatedAt: new Date('2026-01-15T10:00:00.000Z'),
      createdBy: null,
      updatedBy: null,
      presentationLines: [],
      unitId: null,
      unitLabel: null,
      customer: null,
    };
  }

  it('R4: solo se monta al pulsar «Entregar» en la fila y pide la entrega de ese pedido', async () => {
    const user = setupUser();
    render(
      <OrderRowSheetActions
        order={pedidoTerminado()}
        recipes={{ items: [], totalPages: 1 }}
        units={[]}
        bridge={null}
        canDeliver
      />,
    );

    expect(screen.queryByTestId(ORDER_DELIVERY_SHEET_TESTID)).toBeNull();
    expect(getDeliveryMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('order-row-actions'));
    await user.click(await screen.findByTestId(ORDER_ACTION_DELIVER_TESTID));

    expect(await screen.findByTestId(ORDER_DELIVERY_SHEET_TESTID)).toBeInTheDocument();
    expect(getDeliveryMock).toHaveBeenCalledWith(DELIVERY_ORDER_ID);
  });
});
