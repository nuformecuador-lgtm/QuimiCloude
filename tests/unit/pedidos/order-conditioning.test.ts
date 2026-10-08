// `createStartConditioning` y `createFinishConditioning` sobre un `OrderConditioningRepository`
// simulado: comprueban su unica transicion, pasan la empresa como ultimo parametro y devuelven
// tal cual cada resultado del puerto. La escritura real la prueba el `.int` del adaptador.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFinishConditioning, createStartConditioning } from '@/lib/modules/pedidos/domain/order-conditioning';
import * as transitions from '@/lib/modules/pedidos/domain/order-transitions';

import type { OrderConditioningRepository } from '@/lib/modules/pedidos/ports/order-conditioning-repository';

const EMPRESA = 'c-1';
const PEDIDO = 'o-1';
const ACONDICIONADOR = 'u-1';
const AHORA = new Date('2026-10-07T12:00:00Z');

function puertoDoble(overrides: Partial<OrderConditioningRepository> = {}): OrderConditioningRepository {
  return {
    startConditioningAlive: vi.fn(async () => {
      throw new Error('startConditioningAlive no configurado en este test');
    }),
    finishConditioningAlive: vi.fn(async () => {
      throw new Error('finishConditioningAlive no configurado en este test');
    }),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createStartConditioning', () => {
  it('R8: comprueba POR_ACONDICIONAR -> EN_ACONDICIONAMIENTO y delega con la empresa como ultimo parametro', async () => {
    const assertSpy = vi.spyOn(transitions, 'assertTransition');
    const startConditioningAlive = vi.fn(async () => 'ok' as const);
    const finishConditioningAlive = vi.fn();
    const start = createStartConditioning({ conditioning: puertoDoble({ startConditioningAlive, finishConditioningAlive }) });

    await expect(start(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).resolves.toBe('ok');

    expect(assertSpy).toHaveBeenCalledWith('POR_ACONDICIONAR', 'EN_ACONDICIONAMIENTO');
    expect(startConditioningAlive).toHaveBeenCalledExactlyOnceWith(PEDIDO, ACONDICIONADOR, AHORA, { companyId: EMPRESA });
    expect(finishConditioningAlive).not.toHaveBeenCalled();
  });

  it.each(['ok', 'already_mine', 'taken', 'not_conditionable', 'not_found'] as const)(
    'R8, R9, R10: propaga tal cual el resultado %s del puerto',
    async (resultado) => {
      const start = createStartConditioning({
        conditioning: puertoDoble({ startConditioningAlive: vi.fn(async () => resultado) }),
      });

      await expect(start(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).resolves.toBe(resultado);
    },
  );

  it('R8: si la matriz dejara de admitir la transicion, falla sin tocar el puerto', async () => {
    vi.spyOn(transitions, 'assertTransition').mockImplementation(() => {
      throw new Error('transicion ilegal');
    });
    const startConditioningAlive = vi.fn(async () => 'ok' as const);
    const start = createStartConditioning({ conditioning: puertoDoble({ startConditioningAlive }) });

    await expect(start(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).rejects.toThrow('transicion ilegal');
    expect(startConditioningAlive).not.toHaveBeenCalled();
  });
});

describe('createFinishConditioning', () => {
  it('R12: comprueba EN_ACONDICIONAMIENTO -> TERMINADO y delega con la empresa como ultimo parametro', async () => {
    const assertSpy = vi.spyOn(transitions, 'assertTransition');
    const startConditioningAlive = vi.fn();
    const finishConditioningAlive = vi.fn(async () => 'ok' as const);
    const finish = createFinishConditioning({ conditioning: puertoDoble({ startConditioningAlive, finishConditioningAlive }) });

    await expect(finish(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).resolves.toBe('ok');

    expect(assertSpy).toHaveBeenCalledWith('EN_ACONDICIONAMIENTO', 'TERMINADO');
    expect(finishConditioningAlive).toHaveBeenCalledExactlyOnceWith(PEDIDO, ACONDICIONADOR, AHORA, { companyId: EMPRESA });
    expect(startConditioningAlive).not.toHaveBeenCalled();
  });

  it.each(['ok', 'not_conditioner', 'not_conditionable', 'not_found'] as const)(
    'R12, R13: propaga tal cual el resultado %s del puerto',
    async (resultado) => {
      const finish = createFinishConditioning({
        conditioning: puertoDoble({ finishConditioningAlive: vi.fn(async () => resultado) }),
      });

      await expect(finish(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).resolves.toBe(resultado);
    },
  );

  it('R12: si la matriz dejara de admitir la transicion, falla sin tocar el puerto', async () => {
    vi.spyOn(transitions, 'assertTransition').mockImplementation(() => {
      throw new Error('transicion ilegal');
    });
    const finishConditioningAlive = vi.fn(async () => 'ok' as const);
    const finish = createFinishConditioning({ conditioning: puertoDoble({ finishConditioningAlive }) });

    await expect(finish(PEDIDO, EMPRESA, ACONDICIONADOR, AHORA)).rejects.toThrow('transicion ilegal');
    expect(finishConditioningAlive).not.toHaveBeenCalled();
  });
});
