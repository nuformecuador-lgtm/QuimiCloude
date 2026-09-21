import type { RateLimiter } from '../ports/rate-limiter';
import type { RateLimitBucket } from './rate-limit-bucket';
import type { RateLimitQuota } from './rate-limit-config';

export type RateLimitVerdict =
  | { readonly outcome: 'allow' }
  | { readonly outcome: 'block' }
  | { readonly outcome: 'degraded'; readonly reason: string };

export interface CheckRequestRateInput {
  readonly origin: string;
  readonly bucket: RateLimitBucket;
  readonly quota: RateLimitQuota;
}

export interface CheckRequestRateDeps {
  readonly limiter: RateLimiter;
  readonly timeoutMs: number;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/**
 * Decide si una peticion pasa, se frena o queda degradada (el contador tardo mas de
 * `timeoutMs` o fallo). Nunca lanza: un contador que no responde no debe tumbar la
 * peticion que lo consulta.
 */
export async function checkRequestRate(
  { origin, bucket, quota }: CheckRequestRateInput,
  { limiter, timeoutMs }: CheckRequestRateDeps,
): Promise<RateLimitVerdict> {
  const key = `${bucket}:${origin}`;

  const consumed = limiter
    .consume(key, quota)
    .then((result): RateLimitVerdict => ({ outcome: result.allowed ? 'allow' : 'block' }))
    .catch((error: unknown): RateLimitVerdict => ({
      outcome: 'degraded',
      reason: `error:${errorName(error)}`,
    }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<RateLimitVerdict>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: 'degraded', reason: 'timeout' }), timeoutMs);
  });

  try {
    return await Promise.race([consumed, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
