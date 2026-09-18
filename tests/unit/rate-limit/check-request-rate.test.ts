import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRequestRate } from '@/lib/modules/rate-limit/domain/check-request-rate';
import type { RateLimiter } from '@/lib/modules/rate-limit/ports/rate-limiter';

const QUOTA = { maxRequests: 30, windowSeconds: 600 };
const DEPS_INPUT = { origin: '203.0.113.5', bucket: 'login' as const, quota: QUOTA };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function neverSettles(): RateLimiter {
  return { consume: () => new Promise(() => {}) };
}

describe('checkRequestRate', () => {
  it('R8 da block cuando el contador dice que no esta permitida', async () => {
    const limiter: RateLimiter = { consume: async () => ({ allowed: false }) };

    const verdict = await checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 500 });

    expect(verdict).toEqual({ outcome: 'block' });
  });

  it('R8 da allow cuando el contador dice que esta permitida', async () => {
    const limiter: RateLimiter = { consume: async () => ({ allowed: true }) };

    const verdict = await checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 500 });

    expect(verdict).toEqual({ outcome: 'allow' });
  });

  it('R21 da degraded/timeout exactamente a los timeoutMs cuando el contador no contesta', async () => {
    const limiter = neverSettles();

    const promise = checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 500 });
    let settled: unknown;
    void promise.then((v) => {
      settled = v;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ outcome: 'degraded', reason: 'timeout' });
  });

  it('R22 da degraded/error con el nombre del error cuando el contador rechaza', async () => {
    const limiter: RateLimiter = { consume: async () => Promise.reject(new TypeError('caido')) };

    const verdict = await checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 500 });

    expect(verdict).toEqual({ outcome: 'degraded', reason: 'error:TypeError' });
  });

  it('nunca lanza: una promesa del contador que rechaza tras el timeout no sube como excepcion', async () => {
    let rejectConsume!: (error: unknown) => void;
    const limiter: RateLimiter = {
      consume: () =>
        new Promise((_resolve, reject) => {
          rejectConsume = reject;
        }),
    };

    const promise = checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toEqual({ outcome: 'degraded', reason: 'timeout' });

    rejectConsume(new Error('tarde y roto'));
    await vi.runAllTimersAsync();
  });

  it('limpia el temporizador cuando el contador contesta antes del timeout', async () => {
    const clearSpy = vi.spyOn(global, 'clearTimeout');
    const limiter: RateLimiter = { consume: async () => ({ allowed: true }) };

    await checkRequestRate(DEPS_INPUT, { limiter, timeoutMs: 500 });

    expect(clearSpy).toHaveBeenCalled();
  });
});
