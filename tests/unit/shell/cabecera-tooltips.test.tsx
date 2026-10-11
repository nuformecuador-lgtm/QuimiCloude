import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import { LOGOUT_LABEL, LogoutButton } from '@/app/(private)/components/logout-button';
import { THEME_TOGGLE_LABEL, ThemeToggle } from '@/app/(private)/components/theme-toggle';
import { ThemeProvider } from '@/components/shared/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { THEME_COOKIE } from '@/lib/shared/ui/theme-state';

import { setupUser } from '../../helpers/user-event';

/**
 * Tooltips de «Cambiar tema» y «Cerrar sesion» en la cabecera privada.
 *
 * Se monta el grupo de la derecha como lo monta el layout: dentro de `TooltipProvider`. La
 * posicion real dentro de la ventana la mide el E2E; aqui van puntero, teclado y que el contrato
 * de los botones no cambia.
 */

const { logoutActionMock } = vi.hoisted(() => ({
  logoutActionMock: vi.fn<() => Promise<void>>(),
}));

vi.mock('@/lib/modules/identity/adapters/driving/logout-action', () => ({
  logoutAction: logoutActionMock,
}));

function renderCabecera() {
  return render(
    <ThemeProvider initialPreference="light">
      <TooltipProvider>
        <div>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </TooltipProvider>
    </ThemeProvider>,
  );
}

function tooltipsAbiertos(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="tooltip-content"]'));
}

async function esperarTooltip(texto: string): Promise<HTMLElement> {
  let encontrado: HTMLElement | undefined;
  await waitFor(() => {
    encontrado = tooltipsAbiertos().find((popup) => popup.textContent === texto);
    expect(encontrado).toBeDefined();
  });
  return encontrado!;
}

async function esperarSinTooltips(): Promise<void> {
  await waitFor(() => expect(tooltipsAbiertos()).toHaveLength(0), { timeout: 3_000 });
}

/** El tooltip cuelga de su posicionador, que es quien lleva el lado elegido. */
function ladoDe(popup: HTMLElement): string | null {
  return popup.closest('[data-side]')?.getAttribute('data-side') ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  logoutActionMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
});

describe('tooltips de la cabecera privada', () => {
  it('R10: con el puntero sobre «Cambiar tema» aparece debajo su tooltip con la misma etiqueta', async () => {
    const user = setupUser();
    renderCabecera();

    expect(tooltipsAbiertos()).toHaveLength(0);

    await user.hover(screen.getByTestId('theme-toggle-trigger'));

    const popup = await esperarTooltip(THEME_TOGGLE_LABEL);
    expect(ladoDe(popup)).toBe('bottom');
  });

  it('R11: con el puntero sobre «Cerrar sesión» aparece debajo su tooltip con la misma etiqueta', async () => {
    const user = setupUser();
    renderCabecera();

    await user.hover(screen.getByTestId('private-logout'));

    const popup = await esperarTooltip(LOGOUT_LABEL);
    expect(ladoDe(popup)).toBe('bottom');
  });

  it('R12: al sacar el puntero del boton su tooltip se oculta', async () => {
    const user = setupUser();
    renderCabecera();

    const tema = screen.getByTestId('theme-toggle-trigger');
    await user.hover(tema);
    await esperarTooltip(THEME_TOGGLE_LABEL);
    await user.unhover(tema);
    await esperarSinTooltips();

    const salir = screen.getByTestId('private-logout');
    await user.hover(salir);
    await esperarTooltip(LOGOUT_LABEL);
    await user.unhover(salir);
    await esperarSinTooltips();
  });

  it('R10, R11 y R12: con el teclado cada tooltip sale al llegar el foco y se va al salir', async () => {
    const user = setupUser();
    renderCabecera();

    await user.tab();
    expect(screen.getByTestId('theme-toggle-trigger')).toHaveFocus();
    await esperarTooltip(THEME_TOGGLE_LABEL);

    await user.tab();
    expect(screen.getByTestId('private-logout')).toHaveFocus();
    await esperarTooltip(LOGOUT_LABEL);
    await waitFor(() =>
      expect(tooltipsAbiertos().map((popup) => popup.textContent)).toEqual([LOGOUT_LABEL]),
    );

    await user.tab();
    await esperarSinTooltips();
  });

  it('R13: los dos botones conservan su nombre accesible', () => {
    renderCabecera();

    expect(screen.getByTestId('theme-toggle-trigger')).toHaveAccessibleName(THEME_TOGGLE_LABEL);
    expect(screen.getByTestId('private-logout')).toHaveAccessibleName(LOGOUT_LABEL);
  });

  it('R13: un clic en «Cambiar tema» sigue alternando el tema', async () => {
    const user = setupUser();
    renderCabecera();

    await user.click(screen.getByTestId('theme-toggle-trigger'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await user.click(screen.getByTestId('theme-toggle-trigger'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('R13: un clic en «Cerrar sesión» sigue enviando su form y deja el boton deshabilitado mientras envia', async () => {
    let resolver!: () => void;
    logoutActionMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolver = () => resolve();
        }),
    );
    const user = setupUser();
    renderCabecera();

    const control = screen.getByTestId('private-logout');
    expect(control).toHaveAttribute('type', 'submit');
    expect(screen.getByTestId('private-logout-form')).toContainElement(control);

    await user.click(control);

    await waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('private-logout')).toBeDisabled());

    await act(async () => {
      resolver();
    });

    await waitFor(() => expect(screen.getByTestId('private-logout')).toBeEnabled());
  });
});
