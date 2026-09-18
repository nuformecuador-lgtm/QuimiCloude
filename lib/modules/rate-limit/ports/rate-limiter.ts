import type { RateLimitQuota } from '../domain/rate-limit-config';

export interface RateLimitConsumeResult {
  readonly allowed: boolean;
}

/** El contador de peticiones, sin decir si vive en memoria o en Upstash. */
export interface RateLimiter {
  consume(key: string, quota: RateLimitQuota): Promise<RateLimitConsumeResult>;
}
