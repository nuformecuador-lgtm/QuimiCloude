// `actionsColumn()` produce la misma definicion de columna que hoy escribe a mano cada tabla:
// id `actions`, etiqueta comun, alineada al final, sin ordenar ni filtrar y, segun la tabla, no
// fijable o fijada a la derecha por defecto.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { actionsColumn, type DataTableColumn } from '@/components/shared/data-table';

type Fila = { readonly id: string; readonly nombre: string };

const FILA: Fila = { id: 'f1', nombre: 'Ana' };

const celda = (fila: Fila) => <span data-testid="celda">{fila.nombre}</span>;

describe('actionsColumn con los valores por defecto', () => {
  it('R24: id y etiqueta son los comunes de hoy', () => {
    const col = actionsColumn<Fila>({ cell: celda });

    expect(col.id).toBe('actions');
    expect(col.label).toBe('Acciones');
  });

  it('R24: alineada al final, no fijable y sin ordenar ni filtrar', () => {
    const col = actionsColumn<Fila>({ cell: celda });

    expect(col.align).toBe('end');
    expect(col.pinnable).toBe(false);
    expect(col.defaultPinned).toBeUndefined();
    expect(col.sortable).toBeUndefined();
    expect(col.filter).toBeUndefined();
  });

  it('R24: es exactamente la columna que declaran hoy las tablas no fijables', () => {
    const col = actionsColumn<Fila>({ cell: celda });

    const deHoy: DataTableColumn<Fila> = {
      id: 'actions',
      label: 'Acciones',
      align: 'end',
      pinnable: false,
      cell: celda,
    };
    expect(col).toEqual(deHoy);
  });

  it('R24: la celda es la que recibe, sin envolver', () => {
    const col = actionsColumn<Fila>({ cell: celda });

    expect(col.cell).toBe(celda);
    render(<>{col.cell(FILA)}</>);
    expect(screen.getByTestId('celda')).toHaveTextContent('Ana');
  });
});

describe('actionsColumn con valores propios de la tabla', () => {
  it('R24: respeta el id y la etiqueta que pase la tabla', () => {
    const col = actionsColumn<Fila>({ id: 'row-actions', label: 'Opciones', cell: celda });

    expect(col.id).toBe('row-actions');
    expect(col.label).toBe('Opciones');
  });

  it('R24: con defaultPinned right nace fijada a la derecha, como productos hoy', () => {
    const col = actionsColumn<Fila>({ defaultPinned: 'right', cell: celda });

    const deHoy: DataTableColumn<Fila> = {
      id: 'actions',
      label: 'Acciones',
      align: 'end',
      defaultPinned: 'right',
      cell: celda,
    };
    expect(col).toEqual(deHoy);
    expect(col.pinnable).toBeUndefined();
  });

  it('R24: con align end explicito sigue alineada al final', () => {
    expect(actionsColumn<Fila>({ align: 'end', cell: celda }).align).toBe('end');
  });
});
