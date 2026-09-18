import { describe, expect, it } from 'vitest';

import { createInMemoryRateLimiter } from '@/lib/modules/rate-limit/adapters/driven/in-memory-rate-limiter';

import { runRateLimiterContract } from './rate-limiter-contract';

runRateLimiterContract('adaptador en memoria', () => {
  let now = 0;
  const limiter = createInMemoryRateLimiter(() => now);

  return {
    limiter,
    quota: { maxRequests: 3, windowSeconds: 10 },
    advanceTime: (ms: number) => {
      now += ms;
    },
  };
});

describe('createInMemoryRateLimiter', () => {
  it('sin reloj inyectado usa Date.now por defecto', async () => {
    const limiter = createInMemoryRateLimiter();

    const result = await limiter.consume('bucket:origen', { maxRequests: 1, windowSeconds: 60 });

    expect(result.allowed).toBe(true);
  });
});
