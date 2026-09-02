// T1b — Tests del modulo puro de estado del tema (R7, R9, R29).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  THEME_COOKIE,
  buildThemeCookie,
  readThemePreference,
} from '@/lib/shared/ui/theme-state';

describe('theme-state', () => {
  it('devuelve sistema cuando no hay cookie', () => {
    expect(readThemePreference(undefined)).toBe('system');
  });

  it('devuelve sistema ante un valor no reconocido y no lanza', () => {
    expect(() => readThemePreference('')).not.toThrow();
    expect(readThemePreference('')).toBe('system');

    expect(() => readThemePreference('sepia')).not.toThrow();
    expect(readThemePreference('sepia')).toBe('system');
  });

  it('devuelve la preferencia guardada cuando la cookie es valida', () => {
    expect(readThemePreference('light')).toBe('light');
    expect(readThemePreference('dark')).toBe('dark');
    expect(readThemePreference('system')).toBe('system');
  });

  it('construye la cookie con path, max-age y samesite y sin httponly', () => {
    const cookie = buildThemeCookie('dark');

    expect(cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(cookie).toContain('path=/');
    expect(cookie).toMatch(/max-age=\d+/);
    expect(cookie).toContain('samesite=lax');
    expect(cookie.toLowerCase()).not.toContain('httponly');
  });

  it('no reutiliza el nombre de la cookie de sesion', () => {
    // Se lee `session-token.ts` como texto en vez de importarlo: ese modulo es un adaptador
    // driven de `identity` (el codec del valor de la cookie, dueño de `SESSION_COOKIE_NAME`
    // desde QC-9 T4), y arrastrarlo a un test de un modulo puro seria acoplar
    // `lib/shared/**` a `lib/modules/identity/` solo para leer una constante — justo lo que
    // la regla de dependencias de `docs/architecture.md` prohibe para `lib/shared/**`. Leer
    // el archivo como texto evita ese acoplamiento y sigue comparando contra el valor real,
    // no contra una copia.
    const sessionCookiePath = fileURLToPath(
      new URL(
        '../../../lib/modules/identity/adapters/driven/session/session-token.ts',
        import.meta.url,
      ),
    );
    const sessionCookieSource = readFileSync(sessionCookiePath, 'utf8');
    const match = sessionCookieSource.match(/SESSION_COOKIE_NAME\s*=\s*'([^']+)'/);

    expect(match).not.toBeNull();
    const sessionCookieName = match?.[1];

    expect(sessionCookieName).toBeTruthy();
    expect(THEME_COOKIE).not.toBe(sessionCookieName);
  });
});
