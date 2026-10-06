import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FINISHED_ORDER_DATE_COLUMN_ID,
  FINISHED_ORDER_NUMBER_COLUMN_ID,
  FINISHED_ORDER_PRESENTATION_COLUMN_ID,
  FINISHED_ORDER_QUANTITY_COLUMN_ID,
  FINISHED_ORDER_RECIPE_NAME_COLUMN_ID,
  FINISHED_ORDER_RESPONSIBLES_COLUMN_ID,
  buildFinishedOrdersColumns,
} from '@/app/(private)/asignacion/components';
import type { FinishedOrderView } from '@/lib/modules/asignaciones';

afterEach(() => {
  cleanup();
});

const BASE_ORDER: FinishedOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packagingName: null, packages: 5 }],
  unitId: null,
  unitLabel: null,
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
  responsibles: [
    { userId: 'user-1', displayName: 'Ana López García', origin: { kind: 'direct' } },
  ],
};

function renderCell(columnId: string, order: FinishedOrderView) {
  const columns = buildFinishedOrdersColumns();
  const column = columns.find((entry) => entry.id === columnId);
  if (column === undefined) throw new Error(`no existe la columna ${columnId}`);
  return render(<>{column.cell(order)}</>);
}

describe('las SEIS columnas de «Terminados», en el orden de design.md > 6.3', () => {
  it('declara Numero, Receta, Cantidad, Presentacion, Fecha de terminado y Responsables', () => {
    const columns = buildFinishedOrdersColumns();

    expect(columns.map((column) => column.id)).toEqual([
      FINISHED_ORDER_NUMBER_COLUMN_ID,
      FINISHED_ORDER_RECIPE_NAME_COLUMN_ID,
      FINISHED_ORDER_QUANTITY_COLUMN_ID,
      FINISHED_ORDER_PRESENTATION_COLUMN_ID,
      FINISHED_ORDER_DATE_COLUMN_ID,
      FINISHED_ORDER_RESPONSIBLES_COLUMN_ID,
    ]);
  });

  it('R26 - ninguna columna es «Entrar» ni una accion, y ninguna celda es un enlace', () => {
    for (const column of buildFinishedOrdersColumns()) {
      expect(column.label.toLowerCase()).not.toContain('entrar');
      expect(column.label.toLowerCase()).not.toContain('accion');
      const { container } = render(<>{column.cell(BASE_ORDER)}</>);
      expect(container.querySelector('a')).toBeNull();
      cleanup();
    }
  });
});

describe('R21 - la cantidad se pinta redondeada a dos decimales con formatDecimalDisplay', () => {
  it('recorta los ceros de relleno de la cadena decimal', () => {
    renderCell(FINISHED_ORDER_QUANTITY_COLUMN_ID, BASE_ORDER);

    expect(screen.getByText('12.5')).toBeInTheDocument();
  });
});

describe('R21 - la presentación reutiliza OrderDistributionLabel', () => {
  it('QC-170 R26: pinta la primera linea del reparto', () => {
    renderCell(FINISHED_ORDER_PRESENTATION_COLUMN_ID, BASE_ORDER);

    expect(screen.getByTestId('order-distribution').textContent).toBe('5 × Caja x 12');
  });

  it('QC-170 R27: con el reparto vacio pinta «Sin presentación»', () => {
    renderCell(FINISHED_ORDER_PRESENTATION_COLUMN_ID, { ...BASE_ORDER, presentationLines: [] });

    expect(screen.getByTestId('order-distribution')).toHaveTextContent('Sin presentación');
  });

  it('QC-170 R42: la cantidad lleva la unidad del pedido', () => {
    renderCell(FINISHED_ORDER_QUANTITY_COLUMN_ID, { ...BASE_ORDER, unitId: 'unit-l', unitLabel: 'L' });

    expect(screen.getByText('12.5 L')).toBeInTheDocument();
  });
});

describe('R21 - la fecha de terminado en YYYY-MM-DD UTC, o «Sin fecha»', () => {
  it('con finishedAt pinta la fecha en UTC, sin toLocaleDateString', () => {
    renderCell(FINISHED_ORDER_DATE_COLUMN_ID, BASE_ORDER);

    const cell = screen.getByTestId('finished-order-date');
    expect(cell).toHaveTextContent('2026-09-20');
    expect(cell).not.toHaveAttribute('data-missing');
  });

  it('con finishedAt null pinta «Sin fecha» marcada con data-missing', () => {
    renderCell(FINISHED_ORDER_DATE_COLUMN_ID, { ...BASE_ORDER, finishedAt: null });

    const cell = screen.getByTestId('finished-order-date');
    expect(cell).toHaveTextContent('Sin fecha');
    expect(cell).toHaveAttribute('data-missing', 'true');
  });
});

describe('R21 - los responsables, TODOS, incluido el propio actor si lo es', () => {
  it('pinta un avatar por cada responsable que trae la fila', () => {
    renderCell(FINISHED_ORDER_RESPONSIBLES_COLUMN_ID, BASE_ORDER);

    expect(screen.getByRole('img', { name: 'Ana López García' })).toBeInTheDocument();
  });

  it('sin responsables, la celda no da error y pinta el marcador de ausencia', () => {
    renderCell(FINISHED_ORDER_RESPONSIBLES_COLUMN_ID, { ...BASE_ORDER, responsibles: [] });

    expect(screen.getByTestId('responsible-avatars')).toBeInTheDocument();
  });
});
