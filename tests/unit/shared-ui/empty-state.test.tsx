import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/shared/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('R13: pinta el mensaje con su testid y el contenedor con las clases por defecto', () => {
    render(<EmptyState testId="x-empty" messageTestId="x-empty-message" message="No hay nada." />);

    const contenedor = screen.getByTestId('x-empty');
    expect(contenedor.className).toBe(
      'flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center',
    );
    const mensaje = screen.getByTestId('x-empty-message');
    expect(mensaje.tagName).toBe('P');
    expect(mensaje).toHaveTextContent('No hay nada.');
    expect(mensaje.className).toBe('text-sm text-muted-foreground');
    expect(within(contenedor).queryByRole('link')).toBeNull();
  });

  it('R13: sin messageTestId el mensaje no lleva data-testid', () => {
    render(<EmptyState testId="x-empty" message="No hay nada." />);

    expect(screen.getByText('No hay nada.').hasAttribute('data-testid')).toBe(false);
  });

  it('R13: la vuelta a la primera pagina es un enlace con aspecto de boton y talla tactil', () => {
    render(
      <EmptyState
        testId="x-empty"
        message="Esta página ya no tiene nada."
        firstPage={{ href: '/x?page=1', label: 'Volver a la primera página', testId: 'x-first' }}
      />,
    );

    const enlace = screen.getByRole('link', { name: 'Volver a la primera página' });
    expect(enlace).toHaveAttribute('href', '/x?page=1');
    expect(enlace).toHaveAttribute('data-slot', 'button');
    expect(enlace).toHaveAttribute('data-testid', 'x-first');
    expect(enlace.className.split(' ')).toEqual(expect.arrayContaining(['min-h-11', 'min-w-11']));
  });

  it('R13: el orden es mensaje, limpiar busqueda, primera pagina y acciones', () => {
    render(
      <EmptyState
        testId="x-empty"
        message="Sin datos."
        clearSearch={{ href: '/x', label: 'Limpiar la búsqueda', testId: 'x-clear' }}
        firstPage={{ href: '/x?page=1', label: 'Volver a la primera página', testId: 'x-first' }}
      >
        <button type="button" data-testid="x-create">
          Crear
        </button>
      </EmptyState>,
    );

    const hijos = Array.from(screen.getByTestId('x-empty').children);
    expect(hijos.map((hijo) => hijo.getAttribute('data-testid') ?? hijo.tagName)).toEqual([
      'P',
      'x-clear',
      'x-first',
      'x-create',
    ]);
  });

  it('R13: respeta la clase del contenedor que se le pase', () => {
    render(<EmptyState testId="x-empty" message="Sin datos." className="p-2" />);

    expect(screen.getByTestId('x-empty').className).toBe('p-2');
  });
});
