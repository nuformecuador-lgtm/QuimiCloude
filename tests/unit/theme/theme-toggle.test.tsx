// T10 — Tests del control de tema (R8, R9, R13, R14, R15, R16, R29; `design.md > 5`).
//
// `ThemeToggle` necesita `useTheme()`, asi que cada test lo monta dentro de un
// `<ThemeProvider>` real (no un doble): es la misma superficie minima que ya usa
// `theme-provider.test.tsx` para R7 y R17.
//
// **ENMIENDA DEL 2026-09-07 (decision humana).** El control dejo de ser un menu de tres opciones
// y es un INTERRUPTOR de dos estados: un clic alterna claro <-> oscuro. «Sistema» ya no se
// elige; es el punto de partida mientras nadie haya tocado el control. Los casos que abrian el
// menu y leian `menuitemradio` se reescribieron sobre el gesto nuevo, y ninguno se relajo: lo
// que antes se afirmaba sobre la opcion marcada se afirma ahora sobre el modo aplicado al DOM y
// sobre la cookie, que es lo que de verdad decide lo que el usuario ve.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ThemeProvider } from '@/components/shared/theme-provider';
import { THEME_COOKIE } from '@/lib/shared/ui/theme-state';
import type { ThemePreference } from '@/lib/shared/ui/theme-state';

import { THEME_TOGGLE_LABEL, ThemeToggle } from '@/app/(private)/components/theme-toggle';

function renderToggle(initialPreference: ThemePreference = 'system') {
  return render(
    <ThemeProvider initialPreference={initialPreference}>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

/** El unico gesto del control: un clic sobre el interruptor. */
function pulsarInterruptor() {
  fireEvent.click(screen.getByRole('button', { name: THEME_TOGGLE_LABEL }));
}

/** `true` si el documento esta en modo oscuro, que es lo que el usuario ve de verdad. */
function estaEnOscuro(): boolean {
  return document.documentElement.classList.contains('dark');
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
  it('alterna claro -> oscuro y oscuro -> claro con un solo gesto', () => {
    // R8, R15 — el control tiene DOS estados y un gesto. Se afirma sobre el DOM, no sobre
    // ningun estado interno: es lo que el usuario ve.
    renderToggle('light');
    expect(estaEnOscuro()).toBe(false);

    pulsarInterruptor();
    expect(estaEnOscuro()).toBe(true);

    pulsarInterruptor();
    expect(estaEnOscuro()).toBe(false);
  });

  it('partiendo de «sistema» el primer gesto fija el CONTRARIO de lo que se esta viendo', () => {
    // R8, R9 — «sistema» es el punto de partida, no una opcion elegible. En jsdom `matchMedia`
    // no declara modo oscuro, asi que lo que se ve arrancando en `system` es el claro; el primer
    // clic tiene que dejar el oscuro fijado, no volver a `system`.
    renderToggle('system');
    expect(estaEnOscuro()).toBe(false);

    pulsarInterruptor();

    expect(estaEnOscuro()).toBe(true);
    expect(leerCookieDeTema()).toBe('dark');
  });

  it('escribe en la cookie de UI el modo que queda fijado', () => {
    // R8, R29 — la persistencia entre recargas depende de esta cookie, no del estado de React.
    renderToggle('dark');

    pulsarInterruptor();

    expect(leerCookieDeTema()).toBe('light');
  });

  it('aplica el modo sin recargar la pagina', () => {
    // R15 — el mismo documento cambia de modo y el control sigue montado.
    renderToggle('light');

    pulsarInterruptor();

    expect(estaEnOscuro()).toBe(true);
    expect(screen.getByRole('button', { name: THEME_TOGGLE_LABEL })).toBeInTheDocument();
  });

  it('arranca con la preferencia que le pasa el servidor', () => {
    // R9 — sembrado en `dark`, el PRIMER gesto tiene que llevar a claro. Es la unica forma
    // honesta de afirmarlo aqui: quien pinta la marca en el elemento raiz antes de hidratar es
    // el script anti-parpadeo de `app/layout.tsx` (R12), que en un test de componente aislado no
    // corre; `ThemeProvider` a proposito NO toca el DOM al montar, para no reintroducir el
    // parpadeo por la puerta de atras. Si el control ignorara la preferencia del servidor y
    // asumiera «claro», este gesto habria dejado el oscuro.
    renderToggle('dark');

    pulsarInterruptor();

    expect(estaEnOscuro()).toBe(false);
    expect(leerCookieDeTema()).toBe('light');
  });

  it('no pinta ningun menu: el control es un solo boton', () => {
    // La enmienda del 2026-09-07, en negativo. Si alguien devuelve el menu de tres opciones sin
    // decidirlo de nuevo, este caso lo dice.
    renderToggle();

    pulsarInterruptor();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('expone un area accionable de al menos 44x44 px y no depende de hover', () => {
    // R16
    renderToggle();

    const interruptor = screen.getByRole('button', { name: THEME_TOGGLE_LABEL });

    // `size-11` = 2.75rem = 44px con la raiz por defecto de 16px: contrato de clases, no
    // medida de layout (jsdom no calcula tamanos reales).
    expect(interruptor.className).toMatch(/\bsize-11\b/);
    expect(interruptor.className).not.toMatch(/\bh-8\b/);

    // Accionable sin hover: responde a clic/toque directo, sin ningun manejador de
    // `mouseenter`/`mouseover` de por medio.
    fireEvent.click(interruptor);
    expect(estaEnOscuro()).toBe(true);
  });

  it('toma su nombre accesible de la constante exportada', () => {
    // R13
    renderToggle();

    expect(THEME_TOGGLE_LABEL.length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: THEME_TOGGLE_LABEL })).toBeInTheDocument();
  });
});
