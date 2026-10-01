import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COMPANY_ORDER_DATE_COLUMN_ID,
  COMPANY_ORDER_NUMBER_COLUMN_ID,
  COMPANY_ORDER_PRESENTATION_COLUMN_ID,
  COMPANY_ORDER_PRIORITY_COLUMN_ID,
  COMPANY_ORDER_QUANTITY_COLUMN_ID,
  COMPANY_ORDER_RECIPE_NAME_COLUMN_ID,
  COMPANY_ORDER_RESPONSIBLES_COLUMN_ID,
  COMPANY_ORDER_STATUS_COLUMN_ID,
  COMPANY_ORDER_STATUS_FILTER_OPTIONS,
  COMPANY_ORDER_STATUS_LABELS,
  buildCompanyOrdersColumns,
} from '@/app/(private)/asignacion/components';
import type { CompanyOrderView } from '@/lib/modules/asignaciones';

afterEach(() => {
  cleanup();
});

const BASE_ORDER: CompanyOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packages: 5 }],
  unitId: null,
  unitLabel: null,
  priority: 'ALTA',
  status: 'ENTREGADO',
  responsibles: [
    { userId: 'user-1', displayName: 'Ana López García', origin: { kind: 'direct' } },
  ],
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
};

function renderCell(
  columnId: string,
  order: CompanyOrderView,
  deps: { readonly showFinishedAt: boolean } = { showFinishedAt: false },
) {
  const columns = buildCompanyOrdersColumns(deps);
  const column = columns.find((entry) => entry.id === columnId);
  if (column === undefined) throw new Error(`no existe la columna ${columnId}`);
  return render(<>{column.cell(order)}</>);
}

describe('R25 - las columnas base de «Todos», sin el filtro exacto de Entregado', () => {
  it('declara Numero, Receta, Cantidad, Presentacion, Prioridad, Estado y Responsables', () => {
    const columns = buildCompanyOrdersColumns({ showFinishedAt: false });

    expect(columns.map((column) => column.id)).toEqual([
      COMPANY_ORDER_NUMBER_COLUMN_ID,
      COMPANY_ORDER_RECIPE_NAME_COLUMN_ID,
      COMPANY_ORDER_QUANTITY_COLUMN_ID,
      COMPANY_ORDER_PRESENTATION_COLUMN_ID,
      COMPANY_ORDER_PRIORITY_COLUMN_ID,
      COMPANY_ORDER_STATUS_COLUMN_ID,
      COMPANY_ORDER_RESPONSIBLES_COLUMN_ID,
    ]);
  });

  it('R26 - ninguna columna es «Entrar» ni una accion, y ninguna celda es un enlace', () => {
    for (const column of buildCompanyOrdersColumns({ showFinishedAt: false })) {
      expect(column.label.toLowerCase()).not.toContain('entrar');
      expect(column.label.toLowerCase()).not.toContain('accion');
      const { container } = render(<>{column.cell(BASE_ORDER)}</>);
      expect(container.querySelector('a')).toBeNull();
      cleanup();
    }
  });
});

describe('R31 - la columna de fecha de terminado solo con el filtro exactamente ENTREGADO', () => {
  // isExactlyDelivered vive en assignment-view-params.test.ts: page.tsx (Server Component) la
  // invoca directamente y no puede depender de un modulo `'use client'`.
  it('showFinishedAt=false no añade la columna', () => {
    const columns = buildCompanyOrdersColumns({ showFinishedAt: false });
    expect(columns.some((column) => column.id === COMPANY_ORDER_DATE_COLUMN_ID)).toBe(false);
  });

  it('showFinishedAt=true añade la columna, con la fecha o «Sin fecha»', () => {
    const columns = buildCompanyOrdersColumns({ showFinishedAt: true });
    expect(columns.some((column) => column.id === COMPANY_ORDER_DATE_COLUMN_ID)).toBe(true);

    renderCell(COMPANY_ORDER_DATE_COLUMN_ID, BASE_ORDER, { showFinishedAt: true });
    const cell = screen.getByTestId('company-order-date');
    expect(cell).toHaveTextContent('2026-09-20');
    expect(cell).not.toHaveAttribute('data-missing');
  });

  it('showFinishedAt=true, sin finishedAt pinta «Sin fecha» marcada', () => {
    renderCell(
      COMPANY_ORDER_DATE_COLUMN_ID,
      { ...BASE_ORDER, finishedAt: null },
      { showFinishedAt: true },
    );

    const cell = screen.getByTestId('company-order-date');
    expect(cell).toHaveTextContent('Sin fecha');
    expect(cell).toHaveAttribute('data-missing', 'true');
  });
});

describe('R41 - las etiquetas de estado cubren los seis valores del contrato', () => {
  it('«Por empacar» y «En empaque» son literales, no el nombre del enum', () => {
    expect(COMPANY_ORDER_STATUS_LABELS.POR_EMPACAR).toBe('Por empacar');
    expect(COMPANY_ORDER_STATUS_LABELS.EN_EMPAQUE).toBe('En empaque');
  });
});

describe('R24, R41 - la columna Estado declara el filtro select de los seis estados, en orden de flujo', () => {
  it('la columna Estado trae `filter: select` con las seis opciones', () => {
    const columns = buildCompanyOrdersColumns({ showFinishedAt: false });
    const status = columns.find((column) => column.id === COMPANY_ORDER_STATUS_COLUMN_ID);

    expect(status?.filter).toEqual({ kind: 'select', options: COMPANY_ORDER_STATUS_FILTER_OPTIONS });
    expect(COMPANY_ORDER_STATUS_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      'PENDIENTE',
      'EN_CURSO',
      'POR_EMPACAR',
      'EN_EMPAQUE',
      'ENTREGADO',
      'CANCELADO',
    ]);
  });

  it('ninguna otra columna declara filtro', () => {
    const columns = buildCompanyOrdersColumns({ showFinishedAt: true });
    for (const column of columns) {
      if (column.id === COMPANY_ORDER_STATUS_COLUMN_ID) continue;
      expect(column.filter).toBeUndefined();
    }
  });
});

describe('R25 - la presentación, la prioridad, el estado y los responsables', () => {
  it('presentacion: con nombre lo pinta, sin el «Sin presentación»', () => {
    renderCell(COMPANY_ORDER_PRESENTATION_COLUMN_ID, BASE_ORDER);
    expect(screen.getByTestId('order-distribution')).toHaveTextContent('5 × Caja x 12');
    cleanup();

    renderCell(COMPANY_ORDER_PRESENTATION_COLUMN_ID, { ...BASE_ORDER, presentationLines: [] });
    expect(screen.getByTestId('order-distribution')).toHaveTextContent('Sin presentación');
  });

  it('estado: pinta la etiqueta legible con `data-status`', () => {
    renderCell(COMPANY_ORDER_STATUS_COLUMN_ID, BASE_ORDER);
    const cell = screen.getByTestId('company-order-status');
    expect(cell).toHaveTextContent('Entregado');
    expect(cell).toHaveAttribute('data-status', 'ENTREGADO');
  });

  it.each(['POR_EMPACAR', 'EN_EMPAQUE'] as const)(
    'estado (R41): %s se lee con su etiqueta propia, no con el literal del enum',
    (status) => {
      renderCell(COMPANY_ORDER_STATUS_COLUMN_ID, { ...BASE_ORDER, status });
      const cell = screen.getByTestId('company-order-status');
      expect(cell).toHaveAttribute('data-status', status);
      expect(cell).toHaveTextContent(COMPANY_ORDER_STATUS_LABELS[status]);
    },
  );

  it('responsables: sin responsables, la celda no da error', () => {
    renderCell(COMPANY_ORDER_RESPONSIBLES_COLUMN_ID, { ...BASE_ORDER, responsibles: [] });
    expect(screen.getByTestId('responsible-avatars')).toBeInTheDocument();
  });
});
