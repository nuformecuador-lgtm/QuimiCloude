// El esqueleto declara tantas columnas como la tabla.
//
// `CUSTOMER_SKELETON_COLUMN_COUNT` es una constante escrita a mano a proposito —el esqueleto lo
// renderiza un Server Component y no puede importar el modulo de cliente de las columnas—, asi
// que lo unico que impide que se quede atras en silencio es que alguien cuente las dos cosas.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CUSTOMER_SKELETON_COLUMN_COUNT,
  CustomerListSkeleton,
  buildCustomerColumns,
} from '@/app/(private)/clientes/components';

const CUSTOMER_COLUMNS = buildCustomerColumns({ rowActions: () => null });

afterEach(() => {
  cleanup();
});

describe('el esqueleto y la tabla declaran el MISMO numero de columnas (R21)', () => {
  it('la constante del esqueleto coincide con cuantas columnas declara la tabla', () => {
    expect(CUSTOMER_SKELETON_COLUMN_COUNT).toBe(CUSTOMER_COLUMNS.length);
  });

  it('lo pintado coincide con lo declarado: tantas cabeceras como columnas', () => {
    render(<CustomerListSkeleton rows={3} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(CUSTOMER_SKELETON_COLUMN_COUNT);
  });

  it('y tantas celdas por fila como columnas, en TODAS las filas', () => {
    render(<CustomerListSkeleton rows={3} />);

    const filas = screen.getAllByTestId('customer-row-skeleton');
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.querySelectorAll('td')).toHaveLength(CUSTOMER_SKELETON_COLUMN_COUNT);
    }
  });

  it('se anuncia como region en carga, sin desmontar nada (R21)', () => {
    render(<CustomerListSkeleton rows={2} />);

    const region = screen.getByTestId('customer-list-skeleton');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });
});
