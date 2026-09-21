// A diferencia de `tests/unit/identity/route-guard-rate-limit.test.ts` (que sustituye
// `rateLimitEdge.check` por un espia), aqui `@/lib/composition/edge` corre TAL CUAL: lo que se
// simula es `@upstash/redis`, para reproducir que `new Redis(...)` lanza de forma sincrona con
// una URL mal formada y comprobar que el middleware, de punta a punta, no lo deja escapar.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { RedisMock } = vi.hoisted(() => ({
  RedisMock: vi.fn(function RedisStub(this: { config: unknown }, config: unknown) {
    this.config = config;
  }),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn(function RatelimitStub(this: { limit: unknown }) {
      this.limit = vi.fn().mockResolvedValue({ success: true });
    }),
    { fixedWindow: vi.fn((tokens: number, window: string) => ({ tokens, window })) },
  ),
}));
vi.mock('@upstash/redis', () => ({ Redis: RedisMock }));

const { middleware } = await import('@/lib/modules/identity/adapters/driving/route-guard-middleware');

const URL_MAL_FORMADA = 'redis://default:un-token-secreto@eu1.upstash.io:6379';
const TOKEN_SECRETO = 'un-token-secreto';

beforeEach(() => {
  vi.unstubAllEnvs();
  RedisMock.mockClear();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', URL_MAL_FORMADA);
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN_SECRETO);
  vi.stubEnv('VERCEL_ENV', 'preview');
});

describe('el middleware ante una URL de Upstash mal formada (R22 R24)', () => {
  it('R22 R24 la peticion pasa, sin excepcion, con un unico aviso sin URL ni token', async () => {
    RedisMock.mockImplementationOnce(function throwsLikeUpstash() {
      const error = new Error(
        `[Upstash Redis] The 'url' property is missing or invalid in your Redis config: ${URL_MAL_FORMADA}.`,
      );
      error.name = 'UrlError';
      throw error;
    });
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const respuesta = await middleware(
      new NextRequest(new URL('/', 'https://quimicloude.test'), {
        headers: { 'x-forwarded-for': '203.0.113.30' },
      }),
    );

    expect(respuesta.status).not.toBe(429);
    const lineasDeRateLimit = avisos.mock.calls
      .map((llamada) => String(llamada[0]))
      .filter((mensaje) => mensaje.includes('[rate-limit]'));
    expect(lineasDeRateLimit).toHaveLength(1);
    expect(lineasDeRateLimit[0]).not.toContain(URL_MAL_FORMADA);
    expect(lineasDeRateLimit[0]).not.toContain(TOKEN_SECRETO);

    avisos.mockRestore();
  });
});
