import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PACKING_ORDER_NUMBER_COLUMN_ID,
  PACKING_ORDER_PACKAGES_COLUMN_ID,
  PACKING_ORDER_PACKER_COLUMN_ID,
  PACKING_ORDER_PRESENTATION_COLUMN_ID,
  PACKING_ORDER_RECIPE_NAME_COLUMN_ID,
  PACKING_ORDER_STATUS_COLUMN_ID,
  PACKING_ORDERS_COLUMN_COUNT,
  buildPackingOrdersColumns,
} from '@/app/(private)/asignacion/components';
import type { PackingOrderRow } from '@/lib/modules/asignaciones';

afterEach(() => {
  cleanup();
});

const POR_EMPACAR_ORDER: PackingOrderRow = {
  id: 'order-1',
  numberText: '2026-0000021',
  recipeName: 'Jarabe simple',
  quantity: '40',
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packages: 5 }],
  unitId: null,
  unitLabel: null,
  packages: '8',
  status: 'POR_EMPACAR',
  packedByName: null,
  packedById: null,
};

const EN_EMPAQUE_ORDER: PackingOrderRow = {
  ...POR_EMPACAR_ORDER,
  id: 'order-2',
  status: 'EN_EMPAQUE',
  packedByName: 'Ana López García',
  packedById: 'user-2',
};

function renderCell(columnId: string, order: PackingOrderRow) {
  const columns = buildPackingOrdersColumns();
  const column = columns.find((entry) => entry.id === columnId);
  if (column === undefined) throw new Error(`no existe la columna ${columnId}`);
  return render(<>{column.cell(order)}</>);
}

describe('R14 - las seis columnas de «Por empacar»', () => {
  it('declara numero, receta, presentacion, envases, estado y quien empaca, en ese orden', () => {
    const columns = buildPackingOrdersColumns();

    expect(columns.map((column) => column.id)).toEqual([
      PACKING_ORDER_NUMBER_COLUMN_ID,
      PACKING_ORDER_RECIPE_NAME_COLUMN_ID,
      PACKING_ORDER_PRESENTATION_COLUMN_ID,
      PACKING_ORDER_PACKAGES_COLUMN_ID,
      PACKING_ORDER_STATUS_COLUMN_ID,
      PACKING_ORDER_PACKER_COLUMN_ID,
    ]);
    expect(columns).toHaveLength(PACKING_ORDERS_COLUMN_COUNT);
  });
});

describe('R17 - la columna del numero abre la pantalla de empaque del pedido', () => {
  it('el numero es un enlace a `/asignacion/empaque/<id>`', () => {
    renderCell(PACKING_ORDER_NUMBER_COLUMN_ID, POR_EMPACAR_ORDER);

    const enlace = screen.getByTestId('packing-order-link');
    expect(enlace.tagName).toBe('A');
    expect(enlace).toHaveAttribute('href', '/asignacion/empaque/order-1');
    expect(enlace).toHaveTextContent('2026-0000021');
  });

  it('R43 - el objetivo tactil mide al menos 44x44 y no depende de hover', () => {
    renderCell(PACKING_ORDER_NUMBER_COLUMN_ID, POR_EMPACAR_ORDER);

    const enlace = screen.getByTestId('packing-order-link');
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
  });
});

describe('R14 - estado y quien empaca', () => {
  it('POR_EMPACAR: la etiqueta es «Por empacar» y quien empaca queda vacio', () => {
    renderCell(PACKING_ORDER_STATUS_COLUMN_ID, POR_EMPACAR_ORDER);
    expect(screen.getByTestId('packing-order-status')).toHaveTextContent('Por empacar');
    cleanup();

    renderCell(PACKING_ORDER_PACKER_COLUMN_ID, POR_EMPACAR_ORDER);
    expect(screen.getByTestId('packing-order-missing-packedByName')).toBeInTheDocument();
  });

  it('EN_EMPAQUE: la etiqueta es «En empaque» y trae el nombre de quien empaca', () => {
    renderCell(PACKING_ORDER_STATUS_COLUMN_ID, EN_EMPAQUE_ORDER);
    expect(screen.getByTestId('packing-order-status')).toHaveTextContent('En empaque');
    cleanup();

    renderCell(PACKING_ORDER_PACKER_COLUMN_ID, EN_EMPAQUE_ORDER);
    expect(screen.getByText('Ana López García')).toBeInTheDocument();
  });
});

describe('R14 - receta, presentacion y envases', () => {
  it('con datos, los pinta; sin ellos, el marcador de ausencia', () => {
    renderCell(PACKING_ORDER_RECIPE_NAME_COLUMN_ID, POR_EMPACAR_ORDER);
    expect(screen.getByText('Jarabe simple')).toBeInTheDocument();
    cleanup();

    renderCell(PACKING_ORDER_RECIPE_NAME_COLUMN_ID, { ...POR_EMPACAR_ORDER, recipeName: null });
    expect(screen.getByTestId('packing-order-missing-recipeName')).toBeInTheDocument();
    cleanup();

    renderCell(PACKING_ORDER_PACKAGES_COLUMN_ID, POR_EMPACAR_ORDER);
    expect(screen.getByText('8')).toBeInTheDocument();
    cleanup();

    renderCell(PACKING_ORDER_PACKAGES_COLUMN_ID, { ...POR_EMPACAR_ORDER, packages: null });
    expect(screen.getByTestId('packing-order-missing-packages')).toBeInTheDocument();
    cleanup();

    renderCell(PACKING_ORDER_PRESENTATION_COLUMN_ID, POR_EMPACAR_ORDER);
    expect(screen.getByTestId('order-distribution')).toHaveTextContent('5 × Caja x 12');
  });
});
