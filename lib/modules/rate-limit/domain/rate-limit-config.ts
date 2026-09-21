export interface RateLimitQuota {
  readonly maxRequests: number;
  readonly windowSeconds: number;
}

export interface RateLimitConfig {
  readonly login: RateLimitQuota;
  readonly general: RateLimitQuota;
  readonly timeoutMs: number;
}

export interface ParsedRateLimitConfig {
  readonly config: RateLimitConfig;
  readonly warnings: readonly string[];
}

const DEFAULTS = {
  RATE_LIMIT_LOGIN_MAX: 30,
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: 600,
  RATE_LIMIT_GENERAL_MAX: 600,
  RATE_LIMIT_GENERAL_WINDOW_SECONDS: 60,
  RATE_LIMIT_TIMEOUT_MS: 500,
} as const;

type RateLimitEnvVar = keyof typeof DEFAULTS;

const POSITIVE_INTEGER = /^\d+$/;

function readPositiveInteger(
  env: Partial<Record<string, string | undefined>>,
  name: RateLimitEnvVar,
  warnings: string[],
): number {
  const raw = env[name];
  if (raw === undefined) {
    return DEFAULTS[name];
  }

  if (!POSITIVE_INTEGER.test(raw) || Number(raw) === 0) {
    warnings.push(name);
    return DEFAULTS[name];
  }

  return Number(raw);
}

/** Lee las cuotas y la espera maxima de variables de entorno, con sus valores por defecto. */
export function parseRateLimitConfig(
  env: Partial<Record<string, string | undefined>>,
): ParsedRateLimitConfig {
  const warnings: string[] = [];

  const login: RateLimitQuota = {
    maxRequests: readPositiveInteger(env, 'RATE_LIMIT_LOGIN_MAX', warnings),
    windowSeconds: readPositiveInteger(env, 'RATE_LIMIT_LOGIN_WINDOW_SECONDS', warnings),
  };
  const general: RateLimitQuota = {
    maxRequests: readPositiveInteger(env, 'RATE_LIMIT_GENERAL_MAX', warnings),
    windowSeconds: readPositiveInteger(env, 'RATE_LIMIT_GENERAL_WINDOW_SECONDS', warnings),
  };
  const timeoutMs = readPositiveInteger(env, 'RATE_LIMIT_TIMEOUT_MS', warnings);

  return { config: { login, general, timeoutMs }, warnings };
}
