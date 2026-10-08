import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONDITIONING_ORDER_CONDITIONER_COLUMN_ID,
  CONDITIONING_ORDER_NUMBER_COLUMN_ID,
  CONDITIONING_ORDER_PACKAGES_COLUMN_ID,
  CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID,
  CONDITIONING_ORDER_STATUS_COLUMN_ID,
  CONDITIONING_ORDERS_SKELETON_COLUMN_COUNT,
  FINISHED_ORDER_NUMBER_COLUMN_ID,
  buildConditionedOrdersColumns,
  buildConditioningOrdersColumns,
  buildFinishedOrdersColumns,
  orderDistributionFullText,
} from '@/app/(private)/asignacion/components';
import type { ConditioningOrderRow, FinishedOrderView } from '@/lib/modules/asignaciones';
import { conditioningOrderRoute } from '@/lib/shared/routes';

afterEach(() => {
  cleanup();
});

const ROW: ConditioningOrderRow = {
  id: 'order-a',
  numberText: '2026-0000040',
  recipeName: 'Jarabe simple',
  quantity: '20',
  unitId: null,
  unitLabel: null,
  presentationLines: [
    { presentationId: 'pres-1', presentationName: 'Frasco', packagingName: '500 g', packages: 12 },
    { presentationId: 'pres-2', presentationName: 'Bolsa', packagingName: '1 kg', packages: 4 },
  ],
  status: 'POR_ACONDICIONAR',
  conditionedByName: null,
  conditionedById: null,
};

const FINISHED: FinishedOrderView = {
  id: 'order-c',
  numberText: '2026-0000041',
  recipeName: 'Jarabe simple',
  quantity: '12.5000',
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packagingName: null, packages: 5 }],
  unitId: null,
  unitLabel: null,
  finishedAt: new Date('2026-09-20T15:30:00.000Z'),
  responsibles: [],
};

function renderCell(columnId: string, row: ConditioningOrderRow) {
  const column = buildConditioningOrdersColumns().find((entry) => entry.id === columnId);
  if (column === undefined) throw new Error(`no existe la columna ${columnId}`);
  return render(<>{column.cell(row)}</>);
}

describe('«Por acondicionar»: cinco columnas', () => {
  it('R8: Nº de pedido, Receta, Envases, Estado y Quién acondiciona, en ese orden', () => {
    const columns = buildConditioningOrdersColumns();

    expect(columns.map((column) => column.id)).toEqual([
      CONDITIONING_ORDER_NUMBER_COLUMN_ID,
      CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID,
      CONDITIONING_ORDER_PACKAGES_COLUMN_ID,
      CONDITIONING_ORDER_STATUS_COLUMN_ID,
      CONDITIONING_ORDER_CONDITIONER_COLUMN_ID,
    ]);
    expect(columns.map((column) => column.label)).toEqual([
      'Nº de pedido',
      'Receta',
      'Envases',
      'Estado',
      'Quién acondiciona',
    ]);
  });

  it('R8: el esqueleto pinta tantas columnas como la tabla', () => {
    expect(CONDITIONING_ORDERS_SKELETON_COLUMN_COUNT).toBe(buildConditioningOrdersColumns().length);
  });

  it('R8: «Envases» es el reparto entero en orden de alta, no un total', () => {
    renderCell(CONDITIONING_ORDER_PACKAGES_COLUMN_ID, ROW);

    expect(screen.getByTestId('order-distribution-full')).toHaveTextContent('12 × 500 g / 4 × 1 kg');
  });

  it('R8: un pedido sin reparto dice «Sin presentación»', () => {
    renderCell(CONDITIONING_ORDER_PACKAGES_COLUMN_ID, { ...ROW, presentationLines: [] });

    const cell = screen.getByTestId('order-distribution-full');
    expect(cell).toHaveTextContent('Sin presentación');
    expect(cell).toHaveAttribute('data-empty', 'true');
  });

  it('R8: una línea sin envase cae a la presentación, y sin ninguno de los dos pinta «—»', () => {
    expect(
      orderDistributionFullText([
        { presentationId: 'p1', presentationName: 'Caja x 12', packagingName: null, packages: 3 },
        { presentationId: 'p2', presentationName: null, packagingName: null, packages: 2 },
      ]),
    ).toBe('3 × Caja x 12 / 2 × —');
  });

  it('R8: el estado pinta «Por acondicionar» y «En acondicionamiento» con data-status', () => {
    renderCell(CONDITIONING_ORDER_STATUS_COLUMN_ID, ROW);
    const queued = screen.getByTestId('conditioning-order-status');
    expect(queued).toHaveTextContent('Por acondicionar');
    expect(queued).toHaveAttribute('data-status', 'POR_ACONDICIONAR');
    cleanup();

    renderCell(CONDITIONING_ORDER_STATUS_COLUMN_ID, { ...ROW, status: 'EN_ACONDICIONAMIENTO' });
    const inProgress = screen.getByTestId('conditioning-order-status');
    expect(inProgress).toHaveTextContent('En acondicionamiento');
    expect(inProgress).toHaveAttribute('data-status', 'EN_ACONDICIONAMIENTO');
  });

  it('R8: sin receta ni quien acondicione, las celdas pintan «—»', () => {
    renderCell(CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID, { ...ROW, recipeName: null });
    expect(screen.getByTestId(`conditioning-order-missing-${CONDITIONING_ORDER_RECIPE_NAME_COLUMN_ID}`)).toHaveTextContent('—');
    cleanup();

    renderCell(CONDITIONING_ORDER_CONDITIONER_COLUMN_ID, ROW);
    expect(screen.getByTestId(`conditioning-order-missing-${CONDITIONING_ORDER_CONDITIONER_COLUMN_ID}`)).toHaveTextContent('—');
  });

  it('R8: con quien acondiciona, pinta su nombre', () => {
    renderCell(CONDITIONING_ORDER_CONDITIONER_COLUMN_ID, {
      ...ROW,
      status: 'EN_ACONDICIONAMIENTO',
      conditionedByName: 'Berta Ruiz',
      conditionedById: 'user-2',
    });

    expect(screen.getByText('Berta Ruiz')).toBeInTheDocument();
  });
});

describe('el número abre el detalle', () => {
  it('R14: en «Por acondicionar» el número es un enlace al detalle con objetivo de 44 px', () => {
    renderCell(CONDITIONING_ORDER_NUMBER_COLUMN_ID, ROW);

    const link = screen.getByRole('link', { name: '2026-0000040' });
    expect(link).toHaveAttribute('href', conditioningOrderRoute('order-a'));
    expect(link).toHaveAttribute('href', '/asignacion/acondicionamiento/order-a');
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('min-w-11');
  });

  it('R14: en «Terminados» del acondicionador el número es el mismo enlace, con 44 px', () => {
    const column = buildConditionedOrdersColumns().find((entry) => entry.id === FINISHED_ORDER_NUMBER_COLUMN_ID);
    if (column === undefined) throw new Error('falta la columna del número');
    render(<>{column.cell(FINISHED)}</>);

    const link = screen.getByRole('link', { name: '2026-0000041' });
    expect(link).toHaveAttribute('href', '/asignacion/acondicionamiento/order-c');
    expect(link.className).toContain('min-h-11');
    expect(link.className).toContain('min-w-11');
  });
});

describe('«Terminados» del acondicionador: las columnas del Empacador', () => {
  it('R12: mismos ids, rótulos, alineación, fijado y orden que buildFinishedOrdersColumns()', () => {
    const own = buildConditionedOrdersColumns();
    const packer = buildFinishedOrdersColumns();

    expect(own.map(({ id, label, align, defaultPinned }) => ({ id, label, align, defaultPinned }))).toEqual(
      packer.map(({ id, label, align, defaultPinned }) => ({ id, label, align, defaultPinned })),
    );
    expect(own.map((column) => column.label)).toEqual([
      'Nº de pedido',
      'Receta',
      'Cantidad',
      'Presentación',
      'Fecha de terminado',
      'Responsables',
    ]);
  });

  it('R12: solo la celda del número cambia; las demás pintan lo mismo que las del Empacador', () => {
    const own = buildConditionedOrdersColumns();
    const packer = buildFinishedOrdersColumns();

    own.forEach((column, index) => {
      const packerColumn = packer[index];
      if (packerColumn === undefined) throw new Error('faltan columnas');
      const ownHtml = render(<>{column.cell(FINISHED)}</>).container.innerHTML;
      cleanup();
      const packerHtml = render(<>{packerColumn.cell(FINISHED)}</>).container.innerHTML;
      cleanup();

      if (column.id === FINISHED_ORDER_NUMBER_COLUMN_ID) {
        expect(ownHtml).not.toBe(packerHtml);
        expect(ownHtml).toContain('<a');
      } else {
        expect(ownHtml, column.id).toBe(packerHtml);
      }
    });
  });

  it('R13: las columnas del Empacador siguen sin ningún enlace', () => {
    for (const column of buildFinishedOrdersColumns()) {
      const { container } = render(<>{column.cell(FINISHED)}</>);
      expect(container.querySelector('a'), column.id).toBeNull();
      cleanup();
    }
  });
});
