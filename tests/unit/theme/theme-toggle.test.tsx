// T10 — Tests del control de tema (R8, R9, R13, R14, R15, R16, R29; `design.md > 5`).
//
// `ThemeToggle` necesita `useTheme()`, asi que cada test lo monta dentro de un
// `<ThemeProvider>` real (no un doble): es la misma superficie minima que ya usa
// `theme-provider.test.tsx` para R7 y R17. Las opciones del menu solo existen en el DOM
// mientras el menu esta abierto, asi que cada test que las necesita abre el disparador antes
// de consultarlas.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ThemeProvider } from '@/components/shared/theme-provider';
import { THEME_COOKIE } from '@/lib/shared/ui/theme-state';
import type { ThemePreference } from '@/lib/shared/ui/theme-state';

import {
  THEME_OPTION_DARK_LABEL,
  THEME_OPTION_LIGHT_LABEL,
  THEME_OPTION_SYSTEM_LABEL,
  THEME_TOGGLE_LABEL,
  ThemeToggle,
} from '@/app/(private)/components/theme-toggle';

function renderToggle(initialPreference: ThemePreference = 'system') {
  return render(
    <ThemeProvider initialPreference={initialPreference}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

function abrirMenu() {
  fireEvent.click(screen.getByRole('button', { name: THEME_TOGGLE_LABEL }));
}

/** Lee el valor crudo de la cookie de tema, o `undefined` si no esta presente. */
function leerCookieDeTema(): string | undefined {
  const match = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${THEME_COOKIE}=`));

  return match?.slice(THEME_COOKIE.length + 1);
}

function borrarCookieDeTema(): void {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  borrarCookieDeTema();
});

describe('control de tema', () => {
  it('ofrece las tres opciones de modo con nombre accesible', () => {
    // R8, R14
    renderToggle();
    abrirMenu();

    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_LIGHT_LABEL }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_DARK_LABEL }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_SYSTEM_LABEL }),
    ).toBeInTheDocument();
  });

  it('marca programaticamente la opcion seleccionada', () => {
    // R14
    renderToggle('dark');
    abrirMenu();

    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_DARK_LABEL, checked: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_LIGHT_LABEL, checked: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_SYSTEM_LABEL, checked: false }),
    ).toBeInTheDocument();
  });

  it('escribe la preferencia elegida en la cookie de UI', () => {
    // R8, R29
    renderToggle('system');
    abrirMenu();

    fireEvent.click(screen.getByRole('menuitemradio', { name: THEME_OPTION_DARK_LABEL }));

    expect(leerCookieDeTema()).toBe('dark');
  });

  it('aplica el modo elegido sin recargar la pagina', () => {
    // R15
    renderToggle('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: THEME_OPTION_DARK_LABEL }));

    // Sin recarga: el mismo documento ya trae la clase oscura y el control sigue montado.
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: THEME_TOGGLE_LABEL })).toBeInTheDocument();
  });

  it('arranca con la preferencia que le pasa el servidor', () => {
    // R9
    renderToggle('dark');
    abrirMenu();

    expect(
      screen.getByRole('menuitemradio', { name: THEME_OPTION_DARK_LABEL, checked: true }),
    ).toBeInTheDocument();
  });

  it('expone un area accionable de al menos 44x44 px y no depende de hover', () => {
    // R16
    renderToggle();

    const disparador = screen.getByRole('button', { name: THEME_TOGGLE_LABEL });

    // `size-11` = 2.75rem = 44px con la raiz por defecto de 16px: contrato de clases, no
    // medida de layout (jsdom no calcula tamanos reales).
    expect(disparador.className).toMatch(/\bsize-11\b/);
    expect(disparador.className).not.toMatch(/\bh-8\b/);

    // Accionable sin hover: el disparador responde a clic/toque directo, sin ningun manejador
    // de `mouseenter`/`mouseover` de por medio.
    fireEvent.click(disparador);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('toma su nombre accesible de la constante exportada', () => {
    // R13
    renderToggle();

    expect(THEME_TOGGLE_LABEL.length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: THEME_TOGGLE_LABEL }),
    ).toBeInTheDocument();
  });
});
