// QC-102 T10 — El esqueleto declara tantas columnas como la tabla: R22.
//
// **Por que existe este archivo y no basta con la linea que ya vive en `order-columns.test.tsx`**:
// aquella afirma el numero desde la declaracion de COLUMNAS; esta lo afirma desde el ESQUELETO y,
// ademas, sobre el DOM que de verdad se pinta. `ORDER_SKELETON_COLUMN_COUNT` es una constante
// escrita a mano a proposito —el esqueleto lo renderiza un Server Component y no puede importar un
// modulo de cliente—, asi que lo unico que impide que se quede atras en silencio es que alguien
// cuente las dos cosas. R22 es exactamente eso: que resolverse la carga **no cambie el numero de
// columnas** y la pantalla no de un salto.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ORDER_SKELETON_COLUMN_COUNT,
  OrderListSkeleton,
  buildOrderColumns,
} from '@/app/(private)/pedidos/components';

/** Los catalogos del panel no importan aqui: se pasan vacios porque la FACTORIA los exige. */
const ORDER_COLUMNS = buildOrderColumns({ recipes: { items: [], totalPages: 1 }, units: [] });

afterEach(() => {
  cleanup();
});

describe('el esqueleto y la tabla declaran el MISMO numero de columnas (R22)', () => {
  it('la constante del esqueleto coincide con cuantas columnas declara la tabla', () => {
    expect(ORDER_SKELETON_COLUMN_COUNT).toBe(ORDER_COLUMNS.length);
  });

  it('la columna de responsables esta contada: el esqueleto no se quedo en las ocho de QC-35', () => {
    // En negativo y con el numero anterior escrito: si alguien retirase la columna nueva sin
    // bajar la constante, o al reves, este caso lo dice con nombre propio.
    expect(ORDER_SKELETON_COLUMN_COUNT).toBeGreaterThan(8);
  });

  it('lo pintado coincide con lo declarado: tantas cabeceras como columnas', () => {
    render(<OrderListSkeleton rows={3} />);

    expect(screen.getAllByRole('columnheader')).toHaveLength(ORDER_SKELETON_COLUMN_COUNT);
  });

  it('y tantas celdas por fila como columnas, en TODAS las filas', () => {
    render(<OrderListSkeleton rows={3} />);

    const filas = screen.getAllByTestId('order-row-skeleton');
    expect(filas).toHaveLength(3);
    for (const fila of filas) {
      expect(fila.querySelectorAll('td')).toHaveLength(ORDER_SKELETON_COLUMN_COUNT);
    }
  });
});
