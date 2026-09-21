import { describe, expect, it } from 'vitest';

import type { RateLimitQuota } from '@/lib/modules/rate-limit/domain/rate-limit-config';
import type { RateLimiter } from '@/lib/modules/rate-limit/ports/rate-limiter';

export interface RateLimiterContractContext {
  readonly limiter: RateLimiter;
  readonly quota: RateLimitQuota;
  advanceTime(ms: number): void | Promise<void>;
}

/**
 * Bateria de contrato para cualquier adaptador de {@link RateLimiter}: mismas reglas de
 * cuota y ventana, sin importar donde viva el contador.
 */
export function runRateLimiterContract(
  name: string,
  createContext: () => RateLimiterContractContext | Promise<RateLimiterContractContext>,
): void {
  describe(`contrato de RateLimiter: ${name}`, () => {
    it('R4 R27 permite hasta el maximo de peticiones y frena la peticion siguiente', async () => {
      const { limiter, quota } = await createContext();
      const key = 'bucket:origen-a';

      for (let i = 0; i < quota.maxRequests; i += 1) {
        const result = await limiter.consume(key, quota);
        expect(result.allowed).toBe(true);
      }

      const blocked = await limiter.consume(key, quota);
      expect(blocked.allowed).toBe(false);
    });

    it('R4 R27 cuenta cada origen por separado: uno agotado no frena al otro', async () => {
      const { limiter, quota } = await createContext();
      const keyA = 'bucket:origen-a';
      const keyB = 'bucket:origen-b';

      for (let i = 0; i < quota.maxRequests; i += 1) {
        await limiter.consume(keyA, quota);
      }

      const blockedA = await limiter.consume(keyA, quota);
      const allowedB = await limiter.consume(keyB, quota);

      expect(blockedA.allowed).toBe(false);
      expect(allowedB.allowed).toBe(true);
    });

    it('R5 R27 vuelve a dejar pasar cuando termina la ventana', async () => {
      const { limiter, quota, advanceTime } = await createContext();
      const key = 'bucket:origen-c';

      for (let i = 0; i < quota.maxRequests; i += 1) {
        await limiter.consume(key, quota);
      }
      expect((await limiter.consume(key, quota)).allowed).toBe(false);

      await advanceTime(quota.windowSeconds * 1000);

      expect((await limiter.consume(key, quota)).allowed).toBe(true);
    });
  });
}
