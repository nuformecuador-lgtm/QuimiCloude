import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function classSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function classesOf(element: Element): Set<string> {
  return classSet(element.getAttribute('class') ?? '');
}

afterEach(cleanup);

describe('tallas de Button', () => {
  it('R1 — la talla default mide 36 px de alto', () => {
    const clases = classSet(buttonVariants());

    expect(clases.has('h-9')).toBe(true);
    expect(clases.has('px-3.5')).toBe(true);
    expect(clases.has('h-8')).toBe(false);
  });

  it('R1 — la talla sm mide 32 px de alto con letra de 13 px', () => {
    const clases = classSet(buttonVariants({ size: 'sm' }));

    expect(clases.has('h-8')).toBe(true);
    expect(clases.has('px-3')).toBe(true);
    expect(clases.has('text-[13px]')).toBe(true);
    expect(clases.has('h-7')).toBe(false);
  });

  it('R1 — los botones de solo icono miden 36 × 36 en icon y 32 × 32 en icon-sm', () => {
    expect(classSet(buttonVariants({ size: 'icon' })).has('size-9')).toBe(true);
    expect(classSet(buttonVariants({ size: 'icon-sm' })).has('size-8')).toBe(true);
  });

  it('R2 — la talla xl mide 52 px, letra de 16 px en peso 600 y radio de 10 px', () => {
    render(
      <Button size="xl" data-testid="xl">
        Terminar
      </Button>,
    );

    const clases = classesOf(screen.getByTestId('xl'));
    expect(clases.has('h-13')).toBe(true);
    expect(clases.has('text-base')).toBe(true);
    expect(clases.has('font-semibold')).toBe(true);
    expect(clases.has('rounded-[10px]')).toBe(true);
    // `cn` resuelve el conflicto con las clases base: no quedan la letra ni el radio de siempre.
    expect(clases.has('text-sm')).toBe(false);
    expect(clases.has('font-medium')).toBe(false);
    expect(clases.has('rounded-lg')).toBe(false);
  });

  it('R3 — touch activado da 44 × 44 px', () => {
    render(
      <Button touch data-testid="touch">
        Guardar
      </Button>,
    );

    const clases = classesOf(screen.getByTestId('touch'));
    expect(clases.has('min-h-11')).toBe(true);
    expect(clases.has('min-w-11')).toBe(true);
  });

  it('R4 — touch="mobile" da 44 px de alto solo por debajo de 768 px', () => {
    render(
      <Button touch="mobile" data-testid="mobile">
        Guardar
      </Button>,
    );

    const clases = classesOf(screen.getByTestId('mobile'));
    expect(clases.has('max-md:min-h-11')).toBe(true);
    expect(clases.has('min-h-11')).toBe(false);
    expect(clases.has('min-w-11')).toBe(false);
    expect(clases.has('h-9')).toBe(true);
  });

  it('R5 — touch booleano, variantes y buttonVariants conservan su firma', () => {
    render(
      <>
        <Button touch={false} variant="outline" size="sm" data-testid="sin-touch">
          Cancelar
        </Button>
        <Button touch={true} variant="ghost" size="icon" aria-label="Más" data-testid="con-touch" />
      </>,
    );

    expect(classesOf(screen.getByTestId('sin-touch'))).toEqual(
      classSet(cn(buttonVariants({ variant: 'outline', size: 'sm' }))),
    );
    expect(classesOf(screen.getByTestId('con-touch'))).toEqual(
      classSet(cn(buttonVariants({ variant: 'ghost', size: 'icon', touch: true }))),
    );
  });

  it('R5 — las tallas xs, lg, icon-xs e icon-lg no cambian', () => {
    expect(classSet(buttonVariants({ size: 'xs' })).has('h-6')).toBe(true);
    expect(classSet(buttonVariants({ size: 'lg' })).has('h-9')).toBe(true);
    expect(classSet(buttonVariants({ size: 'icon-xs' })).has('size-6')).toBe(true);
    expect(classSet(buttonVariants({ size: 'icon-lg' })).has('size-9')).toBe(true);
  });
});
