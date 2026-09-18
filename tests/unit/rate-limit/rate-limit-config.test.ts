import { describe, expect, it } from 'vitest';

import { parseRateLimitConfig } from '@/lib/modules/rate-limit/domain/rate-limit-config';

describe('parseRateLimitConfig', () => {
  it('R18 usa los cinco valores por defecto cuando el entorno no define nada', () => {
    const { config, warnings } = parseRateLimitConfig({});

    expect(config).toEqual({
      login: { maxRequests: 30, windowSeconds: 600 },
      general: { maxRequests: 600, windowSeconds: 60 },
      timeoutMs: 500,
    });
    expect(warnings).toEqual([]);
  });

  it('R17 usa el valor valido de la variable de entorno en vez del por defecto', () => {
    const { config, warnings } = parseRateLimitConfig({
      RATE_LIMIT_LOGIN_MAX: '10',
      RATE_LIMIT_LOGIN_WINDOW_SECONDS: '120',
      RATE_LIMIT_GENERAL_MAX: '900',
      RATE_LIMIT_GENERAL_WINDOW_SECONDS: '30',
      RATE_LIMIT_TIMEOUT_MS: '250',
    });

    expect(config).toEqual({
      login: { maxRequests: 10, windowSeconds: 120 },
      general: { maxRequests: 900, windowSeconds: 30 },
      timeoutMs: 250,
    });
    expect(warnings).toEqual([]);
  });

  it.each([['0'], ['-5'], ['1.5'], ['treinta']])(
    'R19 usa el por defecto y avisa nombrando la variable cuando vale %s',
    (value) => {
      const { config, warnings } = parseRateLimitConfig({ RATE_LIMIT_LOGIN_MAX: value });

      expect(config.login.maxRequests).toBe(30);
      expect(warnings).toEqual(['RATE_LIMIT_LOGIN_MAX']);
    },
  );

  it('R19 el aviso no incluye el valor invalido, solo el nombre de la variable', () => {
    const { warnings } = parseRateLimitConfig({ RATE_LIMIT_LOGIN_MAX: 'basura-secreta' });

    expect(warnings).toEqual(['RATE_LIMIT_LOGIN_MAX']);
    expect(warnings.join(' ')).not.toContain('basura-secreta');
  });

  it('R20 con los valores por defecto el login admite menos peticiones por segundo que el general', () => {
    const { config } = parseRateLimitConfig({});

    const loginRate = config.login.maxRequests / config.login.windowSeconds;
    const generalRate = config.general.maxRequests / config.general.windowSeconds;

    expect(loginRate).toBeLessThan(generalRate);
  });
});
