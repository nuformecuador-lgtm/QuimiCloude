import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { ThemeToggle } from '@/app/(private)/components/theme-toggle';
import { ThemeProvider } from '@/components/shared/theme-provider';

/**
 * Cruce de sol y luna en el control de tema.
 *
 * El icono visible lo decide solo la clase `dark` del documento, asi que basta con afirmar las
 * clases: el giro medido y el movimiento reducido los comprueba el E2E en un navegador real.
 */

const TRANSICION = [
  'transition-[rotate,scale,opacity]',
  'duration-(--dur-base)',
  'ease-(--ease-standard)',
];

function iconos(): { sol: SVGElement; luna: SVGElement } {
  const trigger = screen.getByTestId('theme-toggle-trigger');
  const svgs = trigger.querySelectorAll('svg');
  expect(svgs).toHaveLength(2);
  return { sol: svgs[0]!, luna: svgs[1]! };
}

function clasesDe(icono: SVGElement): string[] {
  return (icono.getAttribute('class') ?? '').split(/\s+/);
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

describe('sol y luna del control de tema', () => {
  it('R17: el sol se ve en claro y en oscuro gira 90°, se reduce a escala 0 y se funde', () => {
    render(<ThemeToggle />);
    const { sol } = iconos();
    const clases = clasesDe(sol);

    expect(clases).toEqual(
      expect.arrayContaining([
        'rotate-0',
        'scale-100',
        'opacity-100',
        'dark:rotate-90',
        'dark:scale-0',
        'dark:opacity-0',
      ]),
    );
  });

  it('R17: la luna entra en oscuro desde −90° y escala 0 hasta 0° y escala 1 con fundido', () => {
    render(<ThemeToggle />);
    const { luna } = iconos();
    const clases = clasesDe(luna);

    expect(clases).toEqual(
      expect.arrayContaining([
        'absolute',
        '-rotate-90',
        'scale-0',
        'opacity-0',
        'dark:rotate-0',
        'dark:scale-100',
        'dark:opacity-100',
      ]),
    );
  });

  it('R17: los dos iconos animan giro, escala y opacidad con --dur-base y --ease-standard', () => {
    render(<ThemeToggle />);
    const { sol, luna } = iconos();

    for (const icono of [sol, luna]) {
      const clases = clasesDe(icono);
      expect(clases).toEqual(expect.arrayContaining(TRANSICION));
      expect(clases).not.toContain('transition-none');
    }
  });

  it('R18: el HTML del control es el mismo con preferencia clara y con oscura', () => {
    const claro = renderToString(
      <ThemeProvider initialPreference="light">
        <ThemeToggle />
      </ThemeProvider>,
    );
    const oscuro = renderToString(
      <ThemeProvider initialPreference="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(claro).toBe(oscuro);
    expect(claro).toContain('theme-toggle-trigger');
  });
});
