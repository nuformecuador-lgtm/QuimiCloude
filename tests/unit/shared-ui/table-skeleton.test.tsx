import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  TABLE_SKELETON_IMAGE_CLASS_NAME,
  TableSkeleton,
} from '@/components/shared/table-skeleton';

afterEach(cleanup);

const BASE = {
  label: 'Cargando cosas…',
  testId: 'x-skeleton',
  rowTestId: 'x-row-skeleton',
} as const;

function clasesDe(celda: Element): string {
  return celda.querySelector('[data-slot="skeleton"]')?.className ?? '';
}

describe('TableSkeleton', () => {
  it('R15: se anuncia como estado de carga con su etiqueta accesible', () => {
    render(<TableSkeleton {...BASE} columns={3} rows={2} />);

    const estado = screen.getByRole('status');
    expect(estado).toHaveAttribute('aria-busy', 'true');
    expect(estado).toHaveAttribute('data-testid', 'x-skeleton');
    const etiqueta = within(estado).getByText('Cargando cosas…');
    expect(etiqueta.className).toBe('sr-only');
  });

  it('R15: pinta las filas y columnas pedidas, con cabeceras de columna', () => {
    render(<TableSkeleton {...BASE} columns={4} rows={5} />);

    const filas = screen.getAllByTestId('x-row-skeleton');
    expect(filas).toHaveLength(5);
    for (const fila of filas) {
      expect(within(fila).getAllByRole('cell')).toHaveLength(4);
    }
    const cabeceras = screen.getAllByRole('columnheader');
    expect(cabeceras).toHaveLength(4);
    for (const cabecera of cabeceras) {
      expect(cabecera).toHaveAttribute('scope', 'col');
    }
  });

  it('R15: con cero filas solo queda la cabecera', () => {
    render(<TableSkeleton {...BASE} columns={2} rows={0} />);

    expect(screen.queryAllByTestId('x-row-skeleton')).toHaveLength(0);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  });

  it('R15: clases por defecto de cabecera y celda, y sustituibles por props', () => {
    const { unmount } = render(<TableSkeleton {...BASE} columns={1} rows={1} />);
    expect(clasesDe(screen.getByRole('columnheader'))).toContain('h-4 w-24');
    expect(clasesDe(screen.getByRole('cell'))).toContain('h-4 w-full');
    unmount();

    render(
      <TableSkeleton
        {...BASE}
        columns={1}
        rows={1}
        headCellClassName="h-4 w-full"
        cellClassName="h-6 w-10"
      />,
    );
    expect(clasesDe(screen.getByRole('columnheader'))).toContain('h-4 w-full');
    expect(clasesDe(screen.getByRole('cell'))).toContain('h-6 w-10');
  });

  it('R15: con withImage la primera celda de cada fila es el hueco de la imagen', () => {
    render(<TableSkeleton {...BASE} columns={3} rows={2} withImage />);

    for (const fila of screen.getAllByTestId('x-row-skeleton')) {
      const [primera, ...resto] = within(fila).getAllByRole('cell');
      expect(clasesDe(primera)).toContain(TABLE_SKELETON_IMAGE_CLASS_NAME);
      for (const celda of resto) {
        expect(clasesDe(celda)).toContain('h-4 w-full');
        expect(clasesDe(celda)).not.toContain(TABLE_SKELETON_IMAGE_CLASS_NAME);
      }
    }
  });

  it('R15: sin withImage ninguna celda lleva el hueco de la imagen', () => {
    render(<TableSkeleton {...BASE} columns={3} rows={1} />);

    for (const celda of screen.getAllByRole('cell')) {
      expect(clasesDe(celda)).not.toContain(TABLE_SKELETON_IMAGE_CLASS_NAME);
    }
  });
});
