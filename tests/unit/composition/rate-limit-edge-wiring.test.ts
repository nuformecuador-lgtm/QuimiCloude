// El adaptador de Upstash y el propio Redis se simulan: lo que se ejercita aqui es la ELECCION
// de contador segun credenciales y entorno, no el contador de Upstash en si (ese ya tiene sus
// propios tests en `tests/unit/rate-limit/upstash-rate-limiter.test.ts`).
//
// Cada caso importa `lib/composition/edge` de forma DINAMICA tras `vi.resetModules()`: la
// fachada guarda el contador en memoria y los limitadores de Upstash en variables de modulo, y
// sin reiniciar el registro un caso heredaria el estado del anterior.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { RatelimitMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const fixedWindowMock = vi.fn((tokens: number, window: string) => ({ tokens, window }));
  const RatelimitMock = vi.fn(function RatelimitStub(
    this: { config: Record<string, unknown>; limit: unknown },
    config: Record<string, unknown>,
  ) {
    this.config = config;
    this.limit = limitMock;
  });
  return { RatelimitMock: Object.assign(RatelimitMock, { fixedWindow: fixedWindowMock }), limitMock };
});

const { RedisMock } = vi.hoisted(() => ({
  RedisMock: vi.fn(function RedisStub(this: { config: unknown }, config: unknown) {
    this.config = config;
  }),
}));

vi.mock('@upstash/ratelimit', () => ({ Ratelimit: RatelimitMock }));
vi.mock('@upstash/redis', () => ({ Redis: RedisMock }));

async function importEdge() {
  return import('@/lib/composition/edge');
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  RatelimitMock.mockClear();
  RedisMock.mockClear();
  limitMock.mockReset();
});

describe('rateLimitEdge.check — eleccion de contador', () => {
  it('sin credenciales y fuera de produccion cuenta en memoria (R26)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const { rateLimitEdge } = await importEdge();

    const primera = await rateLimitEdge.check({ origin: '203.0.113.10', bucket: 'general' });
    const segunda = await rateLimitEdge.check({ origin: '203.0.113.10', bucket: 'general' });

    expect(primera).toEqual({ outcome: 'allow' });
    expect(segunda).toEqual({ outcome: 'block' });
    expect(RedisMock).not.toHaveBeenCalled();
  });

  it('con las dos credenciales cuenta en Upstash (simulado) (R25)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'un-token');
    vi.stubEnv('VERCEL_ENV', 'preview');
    limitMock.mockResolvedValue({ success: true });
    const { rateLimitEdge } = await importEdge();

    const verdicto = await rateLimitEdge.check({ origin: '203.0.113.11', bucket: 'general' });

    expect(verdicto).toEqual({ outcome: 'allow' });
    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith({ url: 'https://example.upstash.io', token: 'un-token' });
    expect(RatelimitMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['solo la URL', { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: undefined }],
    ['solo el token', { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: 'un-token' }],
  ])('con %s cuenta en memoria, no en Upstash (R26)', async (_caso, env) => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', env.UPSTASH_REDIS_REST_URL);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', env.UPSTASH_REDIS_REST_TOKEN);
    vi.stubEnv('VERCEL_ENV', 'preview');
    const { rateLimitEdge } = await importEdge();

    const verdicto = await rateLimitEdge.check({ origin: '203.0.113.12', bucket: 'general' });

    expect(verdicto).toEqual({ outcome: 'allow' });
    expect(RedisMock).not.toHaveBeenCalled();
  });

  it('en produccion sin credenciales se degrada sin usar el contador en memoria (D2, F1.4 opcion a)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '1');
    const { rateLimitEdge } = await importEdge();

    const primera = await rateLimitEdge.check({ origin: '203.0.113.13', bucket: 'general' });
    // Si cayera al contador en memoria, la segunda llamada con la misma cuota de 1 daria `block`
    // en vez de repetir `degraded`.
    const segunda = await rateLimitEdge.check({ origin: '203.0.113.13', bucket: 'general' });

    expect(primera.outcome).toBe('degraded');
    expect(segunda.outcome).toBe('degraded');
    expect(RedisMock).not.toHaveBeenCalled();
    if (primera.outcome === 'degraded') {
      expect(primera.reason).not.toContain('203.0.113.13');
    }
  });

  it('en produccion CON credenciales sigue contando en Upstash, no se degrada', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'un-token');
    vi.stubEnv('VERCEL_ENV', 'production');
    limitMock.mockResolvedValue({ success: true });
    const { rateLimitEdge } = await importEdge();

    const verdicto = await rateLimitEdge.check({ origin: '203.0.113.14', bucket: 'login' });

    expect(verdicto).toEqual({ outcome: 'allow' });
    expect(RedisMock).toHaveBeenCalledTimes(1);
  });
});

describe('rateLimitEdge.check — avisos de configuracion invalida (R19)', () => {
  it('un valor invalido avisa una sola vez en dos llamadas seguidas', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', 'no-es-un-numero');
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rateLimitEdge } = await importEdge();

    await rateLimitEdge.check({ origin: '203.0.113.15', bucket: 'general' });
    await rateLimitEdge.check({ origin: '203.0.113.16', bucket: 'general' });

    const deEstaVariable = avisos.mock.calls.filter(([mensaje]) =>
      String(mensaje).includes('RATE_LIMIT_GENERAL_MAX'),
    );
    expect(deEstaVariable).toHaveLength(1);
    expect(String(deEstaVariable[0]?.[0])).not.toContain('no-es-un-numero');

    avisos.mockRestore();
  });

  it('un segundo valor invalido DISTINTO de la misma variable vuelve a avisar', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined);
    vi.stubEnv('VERCEL_ENV', 'preview');
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rateLimitEdge } = await importEdge();

    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '-1');
    await rateLimitEdge.check({ origin: '203.0.113.17', bucket: 'general' });
    vi.stubEnv('RATE_LIMIT_GENERAL_MAX', '-2');
    await rateLimitEdge.check({ origin: '203.0.113.17', bucket: 'general' });

    const deEstaVariable = avisos.mock.calls.filter(([mensaje]) =>
      String(mensaje).includes('RATE_LIMIT_GENERAL_MAX'),
    );
    expect(deEstaVariable).toHaveLength(2);

    avisos.mockRestore();
  });
});
