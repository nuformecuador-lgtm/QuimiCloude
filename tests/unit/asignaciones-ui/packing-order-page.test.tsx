import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupUser } from '../../helpers/user-event';

import PackingOrderPage from '@/app/(private)/asignacion/empaque/[id]/page';
import {
  PACKING_ORDER_BACK_LINK_TESTID,
  PACKING_ORDER_FINISH_BUTTON_TESTID,
  PACKING_ORDER_FINISH_ERROR_TESTID,
  PACKING_ORDER_PACKER_TESTID,
  PACKING_ORDER_START_BUTTON_TESTID,
  PACKING_ORDER_START_ERROR_TESTID,
} from '@/app/(private)/asignacion/empaque/[id]/components';
import { OrderNotFoundError } from '@/lib/modules/asignaciones';

/**
 * La pantalla de un pedido de empaque: el corte por permiso (R40), «no encontrado» (`design.md >
 * 3`), los tres desenlaces de R17 y los errores visibles de Comenzar/Terminar.
 */

const {
  getSessionUserMock,
  getSessionContextMock,
  getPackingOrderMock,
  notFoundMock,
  redirectMock,
  startPackingActionMock,
  finishPackingActionMock,
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn<() => Promise<unknown>>(),
  getSessionContextMock: vi.fn<() => Promise<unknown>>(),
  getPackingOrderMock: vi.fn<(actor: unknown, input: unknown) => Promise<unknown>>(),
  // `notFound()` y `redirect()` estan tipadas `(): never` y LANZAN. El doble hace lo mismo: si no
  // lanzara, el corte seguiria ejecutandose y el test mediria otra cosa.
  notFoundMock: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirectMock: vi.fn<(ruta: string) => never>(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  startPackingActionMock: vi.fn(),
  finishPackingActionMock: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('@/lib/composition', () => ({
  identity: { getSessionUser: getSessionUserMock, getSessionContext: getSessionContextMock },
  asignaciones: { getPackingOrder: getPackingOrderMock },
}));

vi.mock('@/lib/modules/asignaciones/adapters/driving/order-packing-actions', () => ({
  startPackingAction: startPackingActionMock,
  finishPackingAction: finishPackingActionMock,
}));

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PACKER_ID = '22222222-2222-4222-8222-222222222222';

function sesionCon(permissions: readonly string[]) {
  return {
    id: ACTOR_ID,
    username: 'empacador.prueba',
    displayName: 'Empacador de Prueba',
    roleName: 'Empacador',
    permissions,
  };
}

function filaCon(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1',
    numberText: '2026-0000030',
    recipeName: 'Jarabe simple',
    presentationName: 'Caja x 12',
    packages: '4',
    status: 'POR_EMPACAR',
    packedByName: null,
    packedById: null,
    ...overrides,
  };
}

function arbolDeLaPagina(id = 'order-1') {
  return PackingOrderPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getSessionUserMock.mockResolvedValue(sesionCon(['empaque.modificar']));
  getSessionContextMock.mockResolvedValue({ companyId: 'company-1' });
  getPackingOrderMock.mockResolvedValue(filaCon());
  startPackingActionMock.mockResolvedValue({ status: 'success' });
  finishPackingActionMock.mockResolvedValue({ status: 'success' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('pagina del pedido de empaque — el corte por permiso ocurre ANTES de leer nada (R40)', () => {
  it('sin `empaque.modificar` responde 404 sin llamar a la fachada', async () => {
    getSessionUserMock.mockResolvedValue(sesionCon(['asignaciones.consultar']));

    await expect(arbolDeLaPagina()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
    expect(getPackingOrderMock).not.toHaveBeenCalled();
  });

  it('sin sesion redirige al login y no llama a la fachada', async () => {
    getSessionUserMock.mockResolvedValue(null);

    await expect(arbolDeLaPagina()).rejects.toThrow();

    expect(redirectMock).toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getPackingOrderMock).not.toHaveBeenCalled();
  });
});

describe('pagina del pedido de empaque — «no existe» responde 404 (`design.md > 3`)', () => {
  it('con `OrderNotFoundError` responde 404', async () => {
    getPackingOrderMock.mockRejectedValue(new OrderNotFoundError());

    await expect(arbolDeLaPagina()).rejects.toThrow();

    expect(notFoundMock).toHaveBeenCalled();
  });
});

describe('pagina del pedido de empaque — los tres desenlaces de R17', () => {
  it('`POR_EMPACAR` ofrece Comenzar y ningun Terminar', async () => {
    getPackingOrderMock.mockResolvedValue(filaCon({ status: 'POR_EMPACAR' }));

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.getByTestId(PACKING_ORDER_START_BUTTON_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID)).toBeNull();
    expect(screen.queryByTestId(PACKING_ORDER_PACKER_TESTID)).toBeNull();
  });

  it('`EN_EMPAQUE` a nombre del propio actor ofrece Terminar y ningun Comenzar', async () => {
    getPackingOrderMock.mockResolvedValue(
      filaCon({ status: 'EN_EMPAQUE', packedById: ACTOR_ID, packedByName: 'Empacador de Prueba' }),
    );

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID)).toBeInTheDocument();
    expect(screen.queryByTestId(PACKING_ORDER_START_BUTTON_TESTID)).toBeNull();
    expect(screen.queryByTestId(PACKING_ORDER_PACKER_TESTID)).toBeNull();
  });

  it('`EN_EMPAQUE` a nombre de otro no ofrece ningun boton y muestra quien empaca', async () => {
    getPackingOrderMock.mockResolvedValue(
      filaCon({ status: 'EN_EMPAQUE', packedById: OTHER_PACKER_ID, packedByName: 'Otro Empacador' }),
    );

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.queryByTestId(PACKING_ORDER_START_BUTTON_TESTID)).toBeNull();
    expect(screen.queryByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID)).toBeNull();
    expect(screen.getByTestId(PACKING_ORDER_PACKER_TESTID)).toHaveTextContent('Otro Empacador');
  });
});

describe('pagina del pedido de empaque — errores de Comenzar y Terminar visibles', () => {
  it('un error de Comenzar se muestra con el mensaje del catalogo', async () => {
    startPackingActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_packing_taken',
      message: 'Otro empacador está empacando este pedido.',
    });
    getPackingOrderMock.mockResolvedValue(filaCon({ status: 'POR_EMPACAR' }));

    const arbol = await arbolDeLaPagina();
    const user = setupUser();
    render(arbol);

    await user.click(screen.getByTestId(PACKING_ORDER_START_BUTTON_TESTID));

    expect(await screen.findByTestId(PACKING_ORDER_START_ERROR_TESTID)).toHaveTextContent(
      'Otro empacador está empacando este pedido.',
    );
  });

  it('un error de Terminar se muestra con el mensaje del catalogo', async () => {
    finishPackingActionMock.mockResolvedValue({
      status: 'error',
      code: 'order_packing_taken',
      message: 'Otro empacador está empacando este pedido.',
    });
    getPackingOrderMock.mockResolvedValue(
      filaCon({ status: 'EN_EMPAQUE', packedById: ACTOR_ID, packedByName: 'Empacador de Prueba' }),
    );

    const arbol = await arbolDeLaPagina();
    const user = setupUser();
    render(arbol);

    await user.click(screen.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID));

    expect(await screen.findByTestId(PACKING_ORDER_FINISH_ERROR_TESTID)).toHaveTextContent(
      'Otro empacador está empacando este pedido.',
    );
  });
});

describe('pagina del pedido de empaque — objetivos tactiles de 44x44 (R43)', () => {
  it('el boton de Comenzar y el enlace de vuelta cumplen el minimo tactil', async () => {
    getPackingOrderMock.mockResolvedValue(filaCon({ status: 'POR_EMPACAR' }));

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.getByTestId(PACKING_ORDER_START_BUTTON_TESTID).className).toContain('min-h-11');
    expect(screen.getByTestId(PACKING_ORDER_START_BUTTON_TESTID).className).toContain('min-w-11');
    expect(screen.getByTestId(PACKING_ORDER_BACK_LINK_TESTID).className).toContain('min-h-11');
    expect(screen.getByTestId(PACKING_ORDER_BACK_LINK_TESTID).className).toContain('min-w-11');
  });

  it('el boton de Terminar cumple el minimo tactil', async () => {
    getPackingOrderMock.mockResolvedValue(
      filaCon({ status: 'EN_EMPAQUE', packedById: ACTOR_ID, packedByName: 'Empacador de Prueba' }),
    );

    const arbol = await arbolDeLaPagina();
    render(arbol);

    expect(screen.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID).className).toContain('min-h-11');
    expect(screen.getByTestId(PACKING_ORDER_FINISH_BUTTON_TESTID).className).toContain('min-w-11');
  });
});
