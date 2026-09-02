// T4 — Test que EJECUTA el script anti-parpadeo (R7, R10, `design.md > 8` nivel 2).
//
// Extension `.tsx` a proposito (no `.ts`): el proyecto `node` de `vitest.config.mts` no monta
// `document`/`window`, asi que este archivo tiene que caer en el proyecto `ui` (jsdom). Ese
// proyecto incluye `tests/**/*.test.tsx` y tambien `tests/ui/**/*.test.ts`; se eligio colocarlo
// junto al resto de `tests/unit/theme/**` en vez de moverlo a `tests/ui/` para que quede al lado
// de `theme-provider.test.tsx` (T7), que afirma sobre el mismo script desde el layout.
//
// El test no importa nada de React: evalua `THEME_INIT_SCRIPT` como texto contra el `document`
// y el `window.matchMedia` que jsdom expone en este entorno, exactamente como lo haria el
// navegador real al parsear el `<script>` inline.

import { THEME_INIT_SCRIPT } from '@/lib/shared/ui/theme-init-script';
import { THEME_COOKIE, THEME_DARK_CLASS } from '@/lib/shared/ui/theme-state';

/** Sustituye `window.matchMedia` por un doble que responde `matches` de forma fija. */
function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Borra la cookie de tema y, si se da un valor, la vuelve a sembrar. */
function setThemeCookie(value: string | undefined): void {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
  if (value !== undefined) {
    document.cookie = `${THEME_COOKIE}=${value}; path=/`;
  }
}

/** Ejecuta el script tal cual lo emitiria el `<script>` inline del root layout. */
function runInitScript(): void {
  // Es exactamente lo que hace el navegador con un <script> inline: evaluar texto en el scope
  // global.
  new Function(THEME_INIT_SCRIPT)();
}

describe('theme-init-script', () => {
  beforeEach(() => {
    setThemeCookie(undefined);
    document.documentElement.classList.remove(THEME_DARK_CLASS);
    document.documentElement.style.colorScheme = '';
    stubMatchMedia(false);
  });

  afterEach(() => {
    delete (document as unknown as { cookie?: string }).cookie;
    setThemeCookie(undefined);
    document.documentElement.classList.remove(THEME_DARK_CLASS);
    document.documentElement.style.colorScheme = '';
  });

  it('aplica el modo oscuro cuando la cookie dice dark', () => {
    setThemeCookie('dark');
    stubMatchMedia(false);

    runInitScript();

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(true);
  });

  it('aplica el modo claro cuando la cookie dice light', () => {
    setThemeCookie('light');
    stubMatchMedia(true);

    runInitScript();

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(false);
  });

  it('sigue al sistema operativo cuando no hay cookie', () => {
    setThemeCookie(undefined);
    stubMatchMedia(true);

    runInitScript();

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(true);

    document.documentElement.classList.remove(THEME_DARK_CLASS);
    stubMatchMedia(false);

    runInitScript();

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(false);
  });

  it('fija color-scheme en el elemento raiz', () => {
    setThemeCookie('dark');
    stubMatchMedia(false);
    runInitScript();
    expect(document.documentElement.style.colorScheme).toBe('dark');

    setThemeCookie('light');
    runInitScript();
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('no propaga el error si las cookies estan bloqueadas', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        throw new Error('cookies bloqueadas');
      },
      set() {
        throw new Error('cookies bloqueadas');
      },
    });

    expect(() => runInitScript()).not.toThrow();
  });
});
