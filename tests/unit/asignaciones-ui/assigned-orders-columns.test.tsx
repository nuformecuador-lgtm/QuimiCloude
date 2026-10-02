import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ASSIGNED_ORDER_ENTER_COLUMN_ID,
  ASSIGNED_ORDER_NUMBER_COLUMN_ID,
  ASSIGNED_ORDER_PRESENTATION_COLUMN_ID,
  ASSIGNED_ORDER_PRIORITY_COLUMN_ID,
  ASSIGNED_ORDER_QUANTITY_COLUMN_ID,
  ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID,
  ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID,
  ASSIGNED_ORDER_STATUS_COLUMN_ID,
  ASSIGNED_ORDER_STATUS_LABELS,
  MISSING_VALUE_MARK,
  buildAssignedOrdersColumns,
} from '@/app/(private)/asignacion/components';
import { MISSING_VALUE_MARK as ORDER_MISSING_VALUE_MARK } from '@/app/(private)/pedidos/components';
import type { AssignedOrderView } from '@/lib/modules/asignaciones';

afterEach(() => {
  cleanup();
});

const BASE_ORDER: AssignedOrderView = {
  id: 'order-1',
  numberText: '2026-000123',
  recipeName: 'Jarabe simple',
  quantity: '12.500',
  priority: 'ALTA',
  status: 'PENDIENTE',
  otherResponsibles: [
    { userId: 'user-2', displayName: 'Ana López García', origin: { kind: 'direct' } },
  ],
  presentationLines: [{ presentationId: 'pres-1', presentationName: 'Caja x 12', packages: 5 }],
  unitId: null,
  unitLabel: null,
};

function renderCell(columnId: string, order: AssignedOrderView) {
  const columns = buildAssignedOrdersColumns();
  const column = columns.find((entry) => entry.id === columnId);
  if (column === undefined) throw new Error(`no existe la columna ${columnId}`);
  return render(<>{column.cell(order)}</>);
}

describe('las OCHO columnas, en el orden de design.md > 6.4', () => {
  it('declara exactamente Numero, Receta, Cantidad, Presentacion, Prioridad, Estado, Responsables y Entrar', () => {
    const columns = buildAssignedOrdersColumns();

    expect(columns.map((column) => column.id)).toEqual([
      ASSIGNED_ORDER_NUMBER_COLUMN_ID,
      ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID,
      ASSIGNED_ORDER_QUANTITY_COLUMN_ID,
      ASSIGNED_ORDER_PRESENTATION_COLUMN_ID,
      ASSIGNED_ORDER_PRIORITY_COLUMN_ID,
      ASSIGNED_ORDER_STATUS_COLUMN_ID,
      ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID,
      ASSIGNED_ORDER_ENTER_COLUMN_ID,
    ]);
  });

  it('ninguna columna es sortable ni declara filter (esta lista no ordena ni filtra)', () => {
    for (const column of buildAssignedOrdersColumns()) {
      expect(column.sortable).toBeFalsy();
      expect(column.filter).toBeUndefined();
    }
  });
});

describe('R16 - el numero se pinta TAL CUAL con numberText', () => {
  it('pinta el texto que ya trae la fila, sin recomponerlo', () => {
    renderCell(ASSIGNED_ORDER_NUMBER_COLUMN_ID, BASE_ORDER);

    expect(screen.getByText(BASE_ORDER.numberText)).toBeInTheDocument();
  });
});

describe('R17 - la receta sin resolver pinta el marcador, NUNCA el uuid', () => {
  it('con recipeName pinta el nombre', () => {
    renderCell(ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID, BASE_ORDER);

    expect(screen.getByText('Jarabe simple')).toBeInTheDocument();
  });

  it('con recipeName null pinta el marcador de ausencia y no un identificador', () => {
    renderCell(ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID, { ...BASE_ORDER, recipeName: null });

    const marker = screen.getByTestId(`assigned-order-missing-${ASSIGNED_ORDER_RECIPE_NAME_COLUMN_ID}`);
    expect(marker).toHaveTextContent(MISSING_VALUE_MARK);
  });

  it('el marcador de esta pantalla es el MISMO glifo que el de /pedidos (un test lo ata)', () => {
    expect(MISSING_VALUE_MARK).toBe(ORDER_MISSING_VALUE_MARK);
  });
});

describe('la cantidad se pinta TAL CUAL (cadena, no formateada)', () => {
  it('pinta la cadena decimal exacta que entrega el contrato', () => {
    renderCell(ASSIGNED_ORDER_QUANTITY_COLUMN_ID, { ...BASE_ORDER, quantity: '12.500' });

    expect(screen.getByText('12.500')).toBeInTheDocument();
  });

  it('QC-170 R42: con unidad la pinta al lado de la cifra', () => {
    renderCell(ASSIGNED_ORDER_QUANTITY_COLUMN_ID, {
      ...BASE_ORDER,
      quantity: '12.500',
      unitId: 'unit-l',
      unitLabel: 'L',
    });

    expect(screen.getByText('12.500 L')).toBeInTheDocument();
  });
});

describe('R24: columna Presentación', () => {
  it('QC-170 R26: pinta la primera linea del reparto y «+N» con el resto', () => {
    renderCell(ASSIGNED_ORDER_PRESENTATION_COLUMN_ID, {
      ...BASE_ORDER,
      presentationLines: [
        { presentationId: 'pres-1', presentationName: 'Botella 200 ml', packages: 5 },
        { presentationId: 'pres-2', presentationName: 'Caja x 12', packages: 1 },
      ],
    });

    expect(screen.getByTestId('order-distribution').textContent).toBe('5 × Botella 200 ml +1');
  });

  it('QC-170 R27: con el reparto vacio pinta «Sin presentación»', () => {
    renderCell(ASSIGNED_ORDER_PRESENTATION_COLUMN_ID, { ...BASE_ORDER, presentationLines: [] });

    const label = screen.getByTestId('order-distribution');
    expect(label).toHaveTextContent('Sin presentación');
  });
});

describe('R18 - los responsables llegan intactos a ResponsibleAvatars', () => {
  it('pinta un avatar con el nombre accesible completo por cada otherResponsible', () => {
    renderCell(ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID, BASE_ORDER);

    expect(screen.getByRole('img', { name: 'Ana López García' })).toBeInTheDocument();
  });
});

describe('R20 - el propio actor no aparece (el dominio ya lo excluye de otherResponsibles)', () => {
  it('una fila cuyo otherResponsibles NO incluye al actor no pinta a nadie mas que a esos', () => {
    renderCell(ASSIGNED_ORDER_RESPONSIBLES_COLUMN_ID, {
      ...BASE_ORDER,
      otherResponsibles: [
        { userId: 'user-3', displayName: 'Beto Ruiz', origin: { kind: 'direct' } },
      ],
    });

    expect(screen.getByRole('img', { name: 'Beto Ruiz' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Ana López García' })).not.toBeInTheDocument();
  });
});

describe('R31, R34 - un pedido BLOQUEADO se marca en la lista del Operador', () => {
  it('la columna Estado pinta «Bloqueado» con `data-status`, no el literal del enum', () => {
    renderCell(ASSIGNED_ORDER_STATUS_COLUMN_ID, { ...BASE_ORDER, status: 'BLOQUEADO' });

    const cell = screen.getByTestId('assigned-order-status');
    expect(cell).toHaveAttribute('data-status', 'BLOQUEADO');
    expect(cell).toHaveTextContent(ASSIGNED_ORDER_STATUS_LABELS.BLOQUEADO);
    expect(cell).not.toHaveTextContent('BLOQUEADO');
  });

  it('la columna Entrar no ofrece enlace a la ejecucion', () => {
    const { container } = renderCell(ASSIGNED_ORDER_ENTER_COLUMN_ID, {
      ...BASE_ORDER,
      status: 'BLOQUEADO',
    });

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });
});
