import { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';

import type { RateLimitQuota } from '../../domain/rate-limit-config';
import type { RateLimiter } from '../../ports/rate-limiter';

interface CachedLimiter {
  readonly quota: RateLimitQuota;
  readonly ratelimit: Ratelimit;
}

function sameQuota(a: RateLimitQuota, b: RateLimitQuota): boolean {
  return a.maxRequests === b.maxRequests && a.windowSeconds === b.windowSeconds;
}

/**
 * Un `Ratelimit` de ventana fija por `prefix`, recreado solo si cambia la cuota para
 * conservar la cache en memoria de orígenes ya bloqueados mientras dure la instancia.
 */
export function createUpstashRateLimiter(redis: Redis, prefix: string): RateLimiter {
  let cached: CachedLimiter | undefined;

  return {
    async consume(key, quota) {
      if (!cached || !sameQuota(cached.quota, quota)) {
        cached = {
          quota,
          ratelimit: new Ratelimit({
            redis,
            limiter: Ratelimit.fixedWindow(quota.maxRequests, `${quota.windowSeconds} s`),
            prefix,
            analytics: false,
            ephemeralCache: new Map(),
          }),
        };
      }

      const result = await cached.ratelimit.limit(key);
      return { allowed: result.success };
    },
  };
}
