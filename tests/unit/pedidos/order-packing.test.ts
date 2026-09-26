// `createStartPacking`/`createFinishPacking`: implementan `OrderCatalog['startPackingAliveById']`
// y `['finishPackingAliveById']` sobre `OrderPackingRepository`. Doble del puerto, sin base de
// datos: lo que se prueba es que cada uno llama a `assertTransition` con la transicion fija que
// alcanza, delega en el metodo del puerto que le toca -pasando el `companyId` como `OrderScope`-
// y devuelve el resultado tal cual, sin tocar el otro metodo del puerto.

import { describe, expect, it, vi } from 'vitest';

import { createFinishPacking, createStartPacking } from '@/lib/modules/pedidos/domain/order-packing';

import type { OrderPackingRepository } from '@/lib/modules/pedidos/ports/order-packing-repository';

const EMPRESA = 'c-1';
const PEDIDO = 'o-1';
const EMPACADOR = 'u-1';
const AHORA = new Date('2026-09-25T12:00:00Z');

function packingDoble(overrides: Partial<OrderPackingRepository> = {}): OrderPackingRepository {
  return {
    startPackingAlive: vi.fn(async () => {
      throw new Error('startPackingAlive no configurado en este test');
    }),
    finishPackingAlive: vi.fn(async () => {
      throw new Error('finishPackingAlive no configurado en este test');
    }),
    ...overrides,
  };
}

describe('createStartPacking (R18-R20, R23, R24)', () => {
  it('R18: ok delega en startPackingAlive con el companyId como scope, y devuelve ok', async () => {
    const startPackingAlive = vi.fn(async () => 'ok' as const);
    const packing = packingDoble({ startPackingAlive });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('ok');

    expect(startPackingAlive).toHaveBeenCalledWith(PEDIDO, EMPACADOR, AHORA, { companyId: EMPRESA });
    expect(startPackingAlive).toHaveBeenCalledTimes(1);
  });

  it('R20: already_mine (el mismo empacador repite Comenzar) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'already_mine' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('already_mine');
  });

  it('R19, R20: taken (EN_EMPAQUE a nombre de otro, o la carrera del segundo Comenzar) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'taken' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('taken');
  });

  it('R23: not_packable (el pedido no esta POR_EMPACAR) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'not_packable' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_packable');
  });

  it('R24: not_found (no existe, esta de baja o es de otra empresa) se devuelve tal cual', async () => {
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'not_found' as const) });
    const startPackingAliveById = createStartPacking({ packing });

    await expect(startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_found');
  });

  it('nunca llama a finishPackingAlive', async () => {
    const finishPackingAlive = vi.fn();
    const packing = packingDoble({ startPackingAlive: vi.fn(async () => 'ok' as const), finishPackingAlive });
    const startPackingAliveById = createStartPacking({ packing });

    await startPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA);

    expect(finishPackingAlive).not.toHaveBeenCalled();
  });
});

describe('createFinishPacking (R21-R24)', () => {
  it('R21: ok delega en finishPackingAlive con el companyId como scope, y devuelve ok', async () => {
    const finishPackingAlive = vi.fn(async () => 'ok' as const);
    const packing = packingDoble({ finishPackingAlive });
    const finishPackingAliveById = createFinishPacking({ packing });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('ok');

    expect(finishPackingAlive).toHaveBeenCalledWith(PEDIDO, EMPACADOR, AHORA, { companyId: EMPRESA });
    expect(finishPackingAlive).toHaveBeenCalledTimes(1);
  });

  it('R22: not_packer (quien activa Terminar no es quien empaca) se devuelve tal cual', async () => {
    const packing = packingDoble({ finishPackingAlive: vi.fn(async () => 'not_packer' as const) });
    const finishPackingAliveById = createFinishPacking({ packing });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_packer');
  });

  it('R23: not_packable (el pedido no esta EN_EMPAQUE) se devuelve tal cual', async () => {
    const packing = packingDoble({ finishPackingAlive: vi.fn(async () => 'not_packable' as const) });
    const finishPackingAliveById = createFinishPacking({ packing });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_packable');
  });

  it('R24: not_found (no existe, esta de baja o es de otra empresa) se devuelve tal cual', async () => {
    const packing = packingDoble({ finishPackingAlive: vi.fn(async () => 'not_found' as const) });
    const finishPackingAliveById = createFinishPacking({ packing });

    await expect(finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA)).resolves.toBe('not_found');
  });

  it('nunca llama a startPackingAlive', async () => {
    const startPackingAlive = vi.fn();
    const packing = packingDoble({ finishPackingAlive: vi.fn(async () => 'ok' as const), startPackingAlive });
    const finishPackingAliveById = createFinishPacking({ packing });

    await finishPackingAliveById(PEDIDO, EMPRESA, EMPACADOR, AHORA);

    expect(startPackingAlive).not.toHaveBeenCalled();
  });
});
