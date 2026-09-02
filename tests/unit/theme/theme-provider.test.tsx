// T7 — Tests del cableado del tema (R7, R10, R12, R17, R26; `design.md > 8`).
//
// Dos formas de mirar el mismo cableado, siguiendo `design.md > 8`:
//
// - Nivel 1 (contrato de fuente): lee `app/layout.tsx` como texto y afirma que
//   `suppressHydrationWarning` está puesto y que el `<script>` del tema es el primer hijo de
//   `<body>`, sin `async` ni `defer`. Barato, pero solo prueba que el cableado está puesto —
//   por eso conviven con el nivel 3.
// - Nivel 3 (render en servidor): llama a `RootLayout` directamente (es una función async, no
//   hace falta un framework de rutas) y serializa el resultado con `renderToStaticMarkup`. Se
//   eligió serializar en vez de `render()` de RTL porque `<html>`/`<body>` como raíz de árbol
//   no es un caso que RTL monte de forma limpia en jsdom, y lo único que hace falta aquí es el
//   HTML final, no interacción — la interacción (R17) se prueba aparte, montando
//   `<ThemeProvider>` solo con `render()`, que es donde sí hay DOM real y efectos.
//
// R7 y R17 no dependen del root layout en sí: se prueban montando `<ThemeProvider>` a secas,
// con un consumidor de `useTheme()`, que es la superficie mínima que ejercita esos requisitos.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThemeProvider, useTheme } from '@/components/shared/theme-provider';
import type { ThemePreference } from '@/lib/shared/ui/theme-state';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type CookieStoreStub = { get: (name: string) => { name: string; value: string } | undefined };

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn<() => Promise<CookieStoreStub>>(),
}));

vi.mock('next/headers', () => ({ cookies: cookiesMock }));

// `next/font/google` necesita el compilador de Next.js para resolver los archivos de fuente;
// fuera de `next build`/`next dev` (aquí, bajo Vitest) no hay nada que resolver, así que se
// sustituye por un doble que devuelve la misma forma (`{ variable }`) que consume el layout.
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

const RAIZ = join(__dirname, '..', '..', '..');

/** Fuente sin lineas de comentario: las guardias de texto miran codigo, no prosa que hable
 *  de `<body>` o de `<html>` (mismo patron que `tests/unit/private-layout.test.tsx`). */
function fuenteLayout(): string {
  return readFileSync(join(RAIZ, 'app', 'layout.tsx'), 'utf8')
    .split('\n')
    .filter((linea) => {
      const limpia = linea.trim();
      return !(limpia.startsWith('//') || limpia.startsWith('*') || limpia.startsWith('/*'));
    })
    .join('\n');
}

function stubCookie(preference: ThemePreference | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (preference !== undefined ? { name, value: preference } : undefined),
  });
}

async function renderRootLayoutHtml(childTestId: string): Promise<string> {
  const RootLayout = (await import('@/app/layout')).default;
  const jsx = await RootLayout({
    children: <div data-testid={childTestId} />,
    params: Promise.resolve({}),
  });
  return renderToStaticMarkup(jsx);
}

/** Consumidor de prueba: expone `preference`/`resolved` en el DOM y un boton por opcion. */
function ThemeConsumer() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setPreference('light')}>claro</button>
      <button onClick={() => setPreference('dark')}>oscuro</button>
      <button onClick={() => setPreference('system')}>sistema</button>
    </div>
  );
}

type MediaListener = (event: { matches: boolean }) => void;

/** Doble de `MediaQueryList` con `addEventListener`/`removeEventListener` de verdad simulados. */
function stubSystemDark(initialMatches: boolean) {
  const listeners = new Set<MediaListener>();
  const media = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_event: string, listener: MediaListener) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: MediaListener) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  window.matchMedia = vi.fn(() => media) as unknown as typeof window.matchMedia;

  return {
    setSystemDark(matches: boolean) {
      media.matches = matches;
      act(() => {
        for (const listener of listeners) listener({ matches });
      });
    },
    media,
  };
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  vi.clearAllMocks();
});

describe('root layout — contrato de fuente (nivel 1)', () => {
  it('marca el html con suppressHydrationWarning', () => {
    // R12
    expect(fuenteLayout()).toContain('suppressHydrationWarning');
  });

  it('emite el script de tema antes del marcado de la aplicacion y sin defer', () => {
    // R10 — nivel 1 de `design.md > 8`
    const fuente = fuenteLayout();
    const cuerpo = fuente.match(/<body[^>]*>([\s\S]*)<\/body>/);
    expect(cuerpo, 'no se encontro <body> en app/layout.tsx').not.toBeNull();

    const contenidoCuerpo = (cuerpo as RegExpMatchArray)[1].trim();
    expect(contenidoCuerpo.startsWith('<script')).toBe(true);

    const finScript = contenidoCuerpo.indexOf('/>') + 2;
    const etiquetaScript = contenidoCuerpo.slice(0, finScript);
    expect(etiquetaScript).not.toContain('async');
    expect(etiquetaScript).not.toContain('defer');

    // El proveedor —y con el, {children}— va DESPUES del script en el marcado fuente.
    const posicionScript = fuente.indexOf('<script');
    const posicionProvider = fuente.indexOf('<ThemeProvider');
    expect(posicionScript).toBeGreaterThan(-1);
    expect(posicionProvider).toBeGreaterThan(posicionScript);
  });
});

describe('root layout — render en servidor (nivel 3)', () => {
  it('sirve la clase oscura ya en el HTML cuando la cookie dice dark', async () => {
    // R10 (nivel 3)
    stubCookie('dark');
    const htmlOscuro = await renderRootLayoutHtml('contenido-oscuro');
    const etiquetaHtmlOscuro = htmlOscuro.match(/<html[^>]*>/)?.[0] ?? '';
    expect(etiquetaHtmlOscuro).toMatch(/class="[^"]*\bdark\b[^"]*"/);

    stubCookie('light');
    const htmlClaro = await renderRootLayoutHtml('contenido-claro');
    const etiquetaHtmlClaro = htmlClaro.match(/<html[^>]*>/)?.[0] ?? '';
    expect(etiquetaHtmlClaro).not.toMatch(/class="[^"]*\bdark\b[^"]*"/);
  });

  it('aplica el tema tambien a las rutas publicas', async () => {
    // R26 — el root layout no distingue publico/privado: envuelve cualquier {children} por
    // igual, y la clase de modo sale aplicada sin importar que hijo se le pase.
    stubCookie('dark');
    const html = await renderRootLayoutHtml('pantalla-publica-de-login');

    expect(html).toContain('pantalla-publica-de-login');
    const etiquetaHtml = html.match(/<html[^>]*>/)?.[0] ?? '';
    expect(etiquetaHtml).toMatch(/class="[^"]*\bdark\b[^"]*"/);

    // Guardia de codigo: nada en el layout ramifica por ruta o por `(private)`.
    const fuente = fuenteLayout();
    expect(fuente).not.toContain('usePathname');
    expect(fuente).not.toContain('(private)');
  });
});

describe('ThemeProvider — resolucion por sistema operativo (R7)', () => {
  it('resuelve el modo por prefers-color-scheme cuando no hay preferencia guardada', () => {
    stubSystemDark(true);

    render(
      <ThemeProvider initialPreference="system">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
  });
});

describe('ThemeProvider — sincronizacion con el sistema mientras la tab esta abierta (R17)', () => {
  it('refleja un cambio del sistema operativo mientras la preferencia es sistema', () => {
    const sistema = stubSystemDark(false);

    render(
      <ThemeProvider initialPreference="system">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(sistema.media.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    sistema.setSystemDark(true);

    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('deja de seguir al sistema operativo cuando la preferencia es explicita', () => {
    const sistema = stubSystemDark(false);

    render(
      <ThemeProvider initialPreference="system">
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'claro' }));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(sistema.media.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    // El sistema pasa a oscuro mientras la preferencia sigue siendo explicita: no debe arrastrar.
    sistema.setSystemDark(true);

    expect(screen.getByTestId('resolved')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
