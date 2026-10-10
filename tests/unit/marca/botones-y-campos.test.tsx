import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Autocomplete,
  AutocompleteClear,
  AutocompleteInput,
} from '@/components/ui/autocomplete';
import { Button, buttonVariants } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

/** Contorno opaco de 2 px separado 2 px del control. */
const CONTORNO = [
  'focus-visible:outline-2',
  'focus-visible:outline-offset-2',
  'focus-visible:outline-solid',
  'focus-visible:outline-ring',
];

/** Borde de --ring más un anillo opaco de 1 px pegado al borde. */
const FOCO_CAMPO = ['focus-visible:border-ring', 'focus-visible:ring-1', 'focus-visible:ring-ring'];

const INVALIDO = ['aria-invalid:border-destructive'];

const PRIMITIVOS = [
  'button',
  'input',
  'textarea',
  'select',
  'autocomplete',
  'checkbox',
  'tabs',
  'calendar',
] as const;

function clases(element: Element | null): Set<string> {
  return new Set((element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
}

function clasesDe(variante: string): Set<string> {
  return new Set(variante.split(/\s+/).filter(Boolean));
}

function esperarTodas(conjunto: Set<string>, esperadas: readonly string[]) {
  for (const clase of esperadas) {
    expect(conjunto, clase).toContain(clase);
  }
}

function esperarNinguna(conjunto: Set<string>, prohibida: RegExp) {
  expect([...conjunto].filter((clase) => prohibida.test(clase))).toEqual([]);
}

afterEach(cleanup);

describe('botones con la marca', () => {
  it('R18 — el primario pinta --primary-foreground sobre --primary y conserva el brillo', () => {
    const c = clasesDe(buttonVariants({ variant: 'default' }));

    esperarTodas(c, ['bg-primary', 'text-primary-foreground', 'btn-shine']);
  });

  it('R19 — el secundario (outline) conserva texto, borde y fondo, con --input en oscuro', () => {
    const c = clasesDe(buttonVariants({ variant: 'outline' }));

    esperarTodas(c, ['btn-veil', 'border-border', 'bg-background', 'dark:border-input']);
    esperarNinguna(c, /^text-(?!sm$)/);
  });

  it('R19 — la variante secondary sigue con --secondary y --secondary-foreground', () => {
    const c = clasesDe(buttonVariants({ variant: 'secondary' }));

    esperarTodas(c, ['bg-secondary', 'text-secondary-foreground']);
  });

  it('R20 — el destructivo pinta --destructive-foreground sobre --destructive opaco', () => {
    const c = clasesDe(buttonVariants({ variant: 'destructive' }));

    esperarTodas(c, ['bg-destructive', 'text-destructive-foreground']);
    esperarNinguna(c, /^(dark:)?(hover:)?bg-destructive\/\d+$/);
    expect(c.has('text-destructive')).toBe(false);
  });

  it('R20 — al pasar el puntero mezcla el fondo con un 10 % de --foreground', () => {
    const c = clasesDe(buttonVariants({ variant: 'destructive' }));

    expect(c).toContain('hover:bg-[color-mix(in_oklch,var(--destructive),var(--foreground)_10%)]');
  });

  it('R20 — el destructivo no lleva un foco propio: usa el contorno comun', () => {
    const c = clasesDe(buttonVariants({ variant: 'destructive' }));

    esperarNinguna(c, /focus-visible:.*destructive/);
    esperarTodas(clasesDe(buttonVariants({ variant: 'destructive' })), CONTORNO);
  });

  it.each(['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const)(
    'R21 — el boton %s dibuja el contorno de --ring con separacion y sin anillo translucido',
    (variant) => {
      render(
        <Button variant={variant} data-testid="boton">
          Guardar
        </Button>,
      );
      const c = clases(screen.getByTestId('boton'));

      esperarTodas(c, CONTORNO);
      esperarNinguna(c, /ring-ring\//);
    },
  );

  it('R25 — un boton aria-invalid sigue con el borde en --destructive', () => {
    render(
      <Button aria-invalid data-testid="boton">
        Guardar
      </Button>,
    );

    esperarTodas(clases(screen.getByTestId('boton')), INVALIDO);
  });
});

describe('campos con la marca', () => {
  function campos() {
    render(
      <>
        <Input aria-label="nombre" aria-invalid />
        <Textarea aria-label="notas" aria-invalid />
        <Select defaultValue="a">
          <SelectTrigger aria-label="estado" aria-invalid data-testid="selector">
            <SelectValue />
          </SelectTrigger>
        </Select>
        <Autocomplete items={['uno']}>
          <AutocompleteInput aria-label="buscar" aria-invalid />
        </Autocomplete>
      </>,
    );
    return {
      input: screen.getByRole('textbox', { name: 'nombre' }),
      textarea: screen.getByRole('textbox', { name: 'notas' }),
      select: screen.getByTestId('selector'),
      autocomplete: screen.getByRole('combobox', { name: 'buscar' }),
    };
  }

  it.each(['input', 'textarea', 'select', 'autocomplete'] as const)(
    'R24 — el campo %s pinta el borde de --input y al enfocarse borde y anillo de 1 px de --ring',
    (nombre) => {
      const c = clases(campos()[nombre]);

      esperarTodas(c, ['border', 'border-input', ...FOCO_CAMPO]);
      esperarNinguna(c, /^focus-visible:ring-(3|\[3px\])$|ring-ring\//);
    },
  );

  it.each(['input', 'textarea', 'select', 'autocomplete'] as const)(
    'R25 — el campo %s marcado aria-invalid sigue con el borde en --destructive',
    (nombre) => {
      esperarTodas(clases(campos()[nombre]), INVALIDO);
    },
  );
});

describe('controles con el contorno de foco', () => {
  it('R21 — la casilla dibuja el contorno de --ring y conserva el borde invalido', () => {
    render(<Checkbox aria-label="activo" />);
    const c = clases(screen.getByRole('checkbox', { name: 'activo' }));

    esperarTodas(c, [...CONTORNO, ...INVALIDO]);
    esperarNinguna(c, /ring-ring\//);
  });

  it('R21 — la pestana dibuja el contorno de --ring de 2 px separado', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const c = clases(screen.getByRole('tab', { name: 'A' }));

    esperarTodas(c, CONTORNO);
    esperarNinguna(c, /ring-ring\/|^focus-visible:outline-1$/);
  });

  it('R21 — el dia enfocado del calendario dibuja el contorno de --ring', () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 9, 1)} />);
    const dia = document.querySelector('button[data-day]');
    const c = clases(dia);

    esperarTodas(c, [
      ...CONTORNO,
      'group-data-[focused=true]/day:outline-2',
      'group-data-[focused=true]/day:outline-offset-2',
      'group-data-[focused=true]/day:outline-solid',
      'group-data-[focused=true]/day:outline-ring',
    ]);
    esperarNinguna(c, /ring-ring\//);
  });

  it('R21 — el boton de limpiar del autocompletar dibuja el contorno de --ring', () => {
    render(
      <Autocomplete items={['uno']} defaultValue="uno">
        <AutocompleteInput aria-label="buscar" />
        <AutocompleteClear />
      </Autocomplete>,
    );
    const c = clases(document.querySelector('[data-slot="autocomplete-clear"]'));

    esperarTodas(c, CONTORNO);
    esperarNinguna(c, /ring-ring\//);
  });

  it.each(PRIMITIVOS)(
    'R24 — el primitivo %s no deja ningun anillo translucido de --ring en su codigo',
    (archivo) => {
      const fuente = readFileSync(join(process.cwd(), 'components', 'ui', `${archivo}.tsx`), 'utf8');

      expect(fuente).not.toMatch(/ring-ring\//);
    },
  );
});
