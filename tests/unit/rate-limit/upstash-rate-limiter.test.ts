import { beforeEach, describe, expect, it, vi } from 'vitest';

const { RatelimitMock, limitMock, fixedWindowMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const fixedWindowMock = vi.fn((tokens: number, window: string) => ({ tokens, window }));
  const RatelimitMock = vi.fn(function RatelimitStub(
    this: { config: Record<string, unknown>; limit: unknown },
    config: Record<string, unknown>,
  ) {
    this.config = config;
    this.limit = limitMock;
  });
  return {
    RatelimitMock: Object.assign(RatelimitMock, { fixedWindow: fixedWindowMock }),
    limitMock,
    fixedWindowMock,
  };
});

vi.mock('@upstash/ratelimit', () => ({ Ratelimit: RatelimitMock }));

const { createUpstashRateLimiter } = await import(
  '@/lib/modules/rate-limit/adapters/driven/upstash-rate-limiter'
);

const LOGIN_QUOTA = { maxRequests: 30, windowSeconds: 600 };
const GENERAL_QUOTA = { maxRequests: 600, windowSeconds: 60 };
const fakeRedis = {} as never;

beforeEach(() => {
  RatelimitMock.mockClear();
  fixedWindowMock.mockClear();
  limitMock.mockReset();
});

describe('createUpstashRateLimiter', () => {
  it('R25 R31 configura fixedWindow con la cuota, el prefijo, analytics apagado y cache en memoria', async () => {
    limitMock.mockResolvedValue({ success: true });
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:login');

    await limiter.consume('login:203.0.113.5', LOGIN_QUOTA);

    expect(fixedWindowMock).toHaveBeenCalledWith(30, '600 s');
    expect(RatelimitMock).toHaveBeenCalledTimes(1);
    const config = RatelimitMock.mock.calls[0][0];
    expect(config.redis).toBe(fakeRedis);
    expect(config.prefix).toBe('rate-limit:login');
    expect(config.analytics).toBe(false);
    expect(config.ephemeralCache).toBeInstanceOf(Map);
  });

  it('R27 reutiliza la MISMA instancia y el MISMO Map cuando la cuota no cambia', async () => {
    limitMock.mockResolvedValue({ success: true });
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:general');

    await limiter.consume('general:a', GENERAL_QUOTA);
    await limiter.consume('general:b', GENERAL_QUOTA);

    expect(RatelimitMock).toHaveBeenCalledTimes(1);
  });

  it('R27 crea otra instancia con otro Map cuando cambia la cuota', async () => {
    limitMock.mockResolvedValue({ success: true });
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:general');

    await limiter.consume('general:a', GENERAL_QUOTA);
    await limiter.consume('general:a', LOGIN_QUOTA);

    expect(RatelimitMock).toHaveBeenCalledTimes(2);
    const firstCache = RatelimitMock.mock.calls[0][0].ephemeralCache;
    const secondCache = RatelimitMock.mock.calls[1][0].ephemeralCache;
    expect(firstCache).not.toBe(secondCache);
  });

  it('R25 traduce success:false en allowed:false', async () => {
    limitMock.mockResolvedValue({ success: false });
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:login');

    const result = await limiter.consume('login:a', LOGIN_QUOTA);

    expect(result.allowed).toBe(false);
  });

  it('R25 traduce success:true en allowed:true', async () => {
    limitMock.mockResolvedValue({ success: true });
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:login');

    const result = await limiter.consume('login:a', LOGIN_QUOTA);

    expect(result.allowed).toBe(true);
  });

  it('deja subir el error del contador sin capturarlo', async () => {
    const boom = new Error('upstash caido');
    limitMock.mockRejectedValue(boom);
    const limiter = createUpstashRateLimiter(fakeRedis, 'rate-limit:login');

    await expect(limiter.consume('login:a', LOGIN_QUOTA)).rejects.toBe(boom);
  });
});
