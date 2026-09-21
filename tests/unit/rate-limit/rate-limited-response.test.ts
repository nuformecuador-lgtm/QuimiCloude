import { describe, expect, it } from 'vitest';

import {
  RATE_LIMITED_MESSAGE,
  isRateLimitedError,
  renderRateLimitedPage,
} from '@/lib/modules/rate-limit/domain/rate-limited-response';

describe('RATE_LIMITED_MESSAGE', () => {
  it('R13 R14 es el texto neutro exacto, sin cifras de tiempo', () => {
    expect(RATE_LIMITED_MESSAGE).toBe('Demasiados intentos. Prueba de nuevo más tarde');
    expect(RATE_LIMITED_MESSAGE).not.toMatch(/\d/);
  });
});

describe('renderRateLimitedPage', () => {
  const page = renderRateLimitedPage();

  it('R10 muestra el texto neutro exacto', () => {
    expect(page).toContain(RATE_LIMITED_MESSAGE);
  });

  it('R15 declara el viewport de ancho de dispositivo y un tamano de letra de al menos 16px', () => {
    expect(page).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(page).toContain('font-size: 16px');
  });

  it('R15 usa min-height en dvh y nunca 100vh', () => {
    expect(page).toContain('100dvh');
    expect(page).not.toContain('100vh');
  });

  it('R13 no revela cuanto falta ni cuanto queda', () => {
    expect(page).not.toMatch(/\d+\s*(segundo|minuto|seg|min)s?\b/i);
    expect(page.toLowerCase()).not.toContain('retry-after');
  });

  it('R10 no trae JavaScript ni recursos externos', () => {
    expect(page).not.toContain('<script');
    expect(page).not.toMatch(/src=["']https?:/i);
    expect(page).not.toMatch(/href=["']https?:/i);
  });
});

describe('isRateLimitedError', () => {
  it('R11 R12 es cierto para un Error con el mensaje exacto', () => {
    expect(isRateLimitedError(new Error(RATE_LIMITED_MESSAGE))).toBe(true);
  });

  it('R12 es falso para otro Error', () => {
    expect(isRateLimitedError(new Error('otro fallo'))).toBe(false);
  });

  it('R12 es falso para un mensaje parecido pero distinto', () => {
    expect(isRateLimitedError(new Error(`${RATE_LIMITED_MESSAGE}!`))).toBe(false);
  });

  it('R12 es falso para algo que no es un Error', () => {
    expect(isRateLimitedError(RATE_LIMITED_MESSAGE)).toBe(false);
    expect(isRateLimitedError(undefined)).toBe(false);
  });
});
