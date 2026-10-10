import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button, buttonVariants } from '@/components/ui/button';
import { touchTarget } from '@/lib/shared/ui/touch-target';

const VARIANTS = [
  'default',
  'outline',
  'outline-dashed',
  'secondary',
  'ghost',
  'destructive',
  'link',
] as const;

const SIZES = ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const;

const TOUCH_CLASSES = touchTarget.split(' ');

function classSet(value: string): Set<string> {
  return new Set(value.split(/\s+/).filter(Boolean));
}

function classesOf(element: Element): Set<string> {
  return classSet(element.getAttribute('class') ?? '');
}

afterEach(cleanup);

describe('talla tactil de Button', () => {
  it('R6 — la constante compartida es el par de 44 px', () => {
    expect(touchTarget).toBe('min-h-11 min-w-11');
  });

  // ENMIENDA QC-228: el defecto lleva el brillo y la escala al pulsar en lugar del desplazamiento y el cambio de fondo.
  // ENMIENDA QC-227: el foco pasa del anillo translucido al contorno opaco de --ring con separacion.
  it('R5 — sin touch, buttonVariants da las clases de siempre para el defecto', () => {
    expect(buttonVariants()).toBe(
      "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 btn-shine bg-primary text-primary-foreground active:not-aria-[haspopup]:scale-[0.98] h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
    );
  });

  it.each(VARIANTS.flatMap((variant) => SIZES.map((size) => [variant, size] as const)))(
    'R5 — sin touch no cambia ninguna clase (variant=%s, size=%s)',
    (variant, size) => {
      const sinTouch = buttonVariants({ variant, size });

      expect(buttonVariants({ variant, size, touch: false })).toBe(sinTouch);
      for (const clase of TOUCH_CLASSES) {
        expect(classSet(sinTouch).has(clase)).toBe(false);
      }
    },
  );

  it('R5 — Button sin touch pinta las mismas clases que buttonVariants sin touch', () => {
    render(<Button data-testid="sin-touch">Guardar</Button>);

    expect(classesOf(screen.getByTestId('sin-touch'))).toEqual(classSet(buttonVariants()));
  });

  it('R5 — con touch se anade exactamente touchTarget', () => {
    const sinTouch = classSet(buttonVariants());
    const conTouch = classSet(buttonVariants({ touch: true }));

    expect(conTouch).toEqual(new Set([...sinTouch, ...TOUCH_CLASSES]));
  });

  it('R5 — Button con touch anade exactamente touchTarget y no lo pasa al DOM como atributo', () => {
    render(
      <>
        <Button data-testid="sin-touch">Guardar</Button>
        <Button touch data-testid="con-touch">
          Guardar
        </Button>
      </>,
    );

    const conTouch = screen.getByTestId('con-touch');
    expect(classesOf(conTouch)).toEqual(
      new Set([...classesOf(screen.getByTestId('sin-touch')), ...TOUCH_CLASSES]),
    );
    expect(conTouch).not.toHaveAttribute('touch');
  });

  it('R5 — touch se combina con size="icon"', () => {
    render(
      <>
        <Button size="icon" aria-label="Cerrar" data-testid="icono" />
        <Button size="icon" touch aria-label="Cerrar" data-testid="icono-touch" />
      </>,
    );

    const conTouch = classesOf(screen.getByTestId('icono-touch'));
    expect(conTouch.has('size-8')).toBe(true);
    expect(conTouch).toEqual(
      new Set([...classesOf(screen.getByTestId('icono')), ...TOUCH_CLASSES]),
    );
  });

  it('R5 — touch se combina con variant="outline" y con className', () => {
    const base = classSet(buttonVariants({ variant: 'outline', className: 'w-full' }));
    const conTouch = classSet(
      buttonVariants({ variant: 'outline', touch: true, className: 'w-full' }),
    );

    expect(conTouch.has('border-border')).toBe(true);
    expect(conTouch.has('w-full')).toBe(true);
    expect(conTouch).toEqual(new Set([...base, ...TOUCH_CLASSES]));
  });
});
