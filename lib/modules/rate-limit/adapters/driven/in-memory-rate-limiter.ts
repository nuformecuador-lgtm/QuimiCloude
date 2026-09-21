import type { RateLimitQuota } from '../../domain/rate-limit-config';
import type { RateLimiter } from '../../ports/rate-limiter';

interface Window {
  count: number;
  resetAt: number;
}

/** Contador de ventana fija en un `Map` de la propia instancia. `clock` es inyectable para tests. */
export function createInMemoryRateLimiter(clock: () => number = Date.now): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    async consume(key, quota: RateLimitQuota) {
      const now = clock();
      const existing = windows.get(key);

      if (!existing || existing.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + quota.windowSeconds * 1000 });
        return { allowed: true };
      }

      if (existing.count >= quota.maxRequests) {
        return { allowed: false };
      }

      existing.count += 1;
      return { allowed: true };
    },
  };
}
