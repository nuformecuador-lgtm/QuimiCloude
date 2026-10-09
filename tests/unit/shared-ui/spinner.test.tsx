import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Spinner } from '@/components/shared/spinner';

function svgOf(container: HTMLElement): SVGElement {
  const svg = container.querySelector('svg');
  if (svg === null) throw new Error('Spinner no pinto ningun svg');
  return svg;
}

function classesOf(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

afterEach(cleanup);

describe('Spinner', () => {
  it('R22 — por defecto (sm) lleva size-4 y gira', () => {
    const { container } = render(<Spinner />);

    const clases = classesOf(svgOf(container));
    expect(clases).toContain('size-4');
    expect(clases).toContain('animate-spin');
  });

  it('R22 — size="sm" da lo mismo que el defecto', () => {
    const porDefecto = render(<Spinner />);
    const clasesPorDefecto = classesOf(svgOf(porDefecto.container));
    cleanup();

    const sm = render(<Spinner size="sm" />);
    expect(classesOf(svgOf(sm.container))).toEqual(clasesPorDefecto);
  });

  it('R22 — size="inherit" no fija tamano y deja que lo ponga el contenedor', () => {
    const { container } = render(<Spinner size="inherit" />);

    const clases = classesOf(svgOf(container));
    expect(clases).not.toContain('size-4');
    expect(clases).toContain('animate-spin');
  });

  it('R22 — es decorativo: aria-hidden y sin rol ni nombre accesible', () => {
    const { container } = render(<Spinner />);

    const svg = svgOf(container);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(svg).not.toHaveAttribute('aria-label');
  });

  it('R22 — es el icono de cargador de lucide (loader-circle)', () => {
    const { container } = render(<Spinner />);

    expect(classesOf(svgOf(container))).toContain('lucide-loader-circle');
  });

  it('R22 — anade las clases que se le pasan', () => {
    const { container } = render(<Spinner className="text-muted-foreground" />);

    expect(classesOf(svgOf(container))).toContain('text-muted-foreground');
  });
});
